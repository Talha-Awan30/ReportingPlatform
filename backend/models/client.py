"""Clients, the contacts who receive reports, and requests for new clients."""
from datetime import timedelta

from extensions import db

from .base import BaseModel, utcnow

# Exactly these 7, alphabetical. Mirrored in the frontend's ClientSelect.
SBU_OPTIONS = [
    "Affiliate",
    "Infrastructure",
    "Manufacturing",
    "Oil & Gas",
    "Others",
    "Power & Utilities",
    "Service Provider",
]

# How long a new-client request stays open for an admin to act on.
REQUEST_LIFETIME = timedelta(days=7)


def normalise_name(name):
    """Collapse whitespace - the form names are stored and compared in."""
    return " ".join((name or "").split())


class Client(BaseModel):
    __tablename__ = "clients"

    code = db.Column(db.String(30), unique=True, nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False, index=True)
    # Strategic business unit and its sub sector, from the SGS client master.
    sbu = db.Column(db.String(60), index=True)
    sub_sector = db.Column(db.String(120))
    industry = db.Column(db.String(120))
    address = db.Column(db.Text)
    city = db.Column(db.String(120))
    country = db.Column(db.String(120))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    notes = db.Column(db.Text)

    contacts = db.relationship(
        "ClientContact", back_populates="client", cascade="all, delete-orphan", lazy="selectin"
    )
    jobs = db.relationship("Job", back_populates="client", lazy="dynamic")
    equipment = db.relationship("Equipment", back_populates="client", lazy="dynamic")
    users = db.relationship("User", back_populates="client", lazy="dynamic")

    def to_option(self):
        """The light shape the client picker needs - no per-row counts."""
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "sbu": self.sbu,
            "sub_sector": self.sub_sector,
            "is_active": self.is_active,
        }

    def to_dict(self, exclude=(), with_contacts=False):
        data = super().to_dict(exclude=exclude)
        data["job_count"] = self.jobs.count()
        data["equipment_count"] = self.equipment.count()
        if with_contacts:
            data["contacts"] = [c.to_dict() for c in self.contacts]
        return data


class ClientContact(BaseModel):
    __tablename__ = "client_contacts"

    client_id = db.Column(
        db.Integer, db.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(50))
    position = db.Column(db.String(120))
    # Contacts flagged here are copied on certification expiry alerts.
    receives_alerts = db.Column(db.Boolean, nullable=False, default=True)
    is_primary = db.Column(db.Boolean, nullable=False, default=False)

    client = db.relationship("Client", back_populates="contacts")


class PendingClient(BaseModel):
    """A request for a client that is not yet on the approved list.

    Rows are never deleted - they are the request history. Statuses are
    lowercase: pending -> approved / rejected.
    """

    __tablename__ = "pending_clients"

    client_name = db.Column(db.String(200), nullable=False)
    sbu = db.Column(db.String(60), nullable=False)
    sub_sector = db.Column(db.String(120))
    # A snapshot of the requester's name, so it survives a user rename/delete.
    requested_by = db.Column(db.String(150))
    requested_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    expires_at = db.Column(db.DateTime, nullable=False, default=lambda: utcnow() + REQUEST_LIFETIME)
    # Set on approval: the client the request became.
    client_id = db.Column(db.Integer, db.ForeignKey("clients.id", ondelete="SET NULL"))
    decided_by = db.Column(db.String(150))
    decided_at = db.Column(db.DateTime)

    @property
    def is_open(self):
        return self.status == "pending" and self.expires_at > utcnow()
