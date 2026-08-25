"""Clients and the contacts who receive reports and expiry alerts."""
from extensions import db

from .base import BaseModel


class Client(BaseModel):
    __tablename__ = "clients"

    code = db.Column(db.String(30), unique=True, nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False, index=True)
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
