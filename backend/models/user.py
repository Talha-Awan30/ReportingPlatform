"""Users and access levels (Inspector, Reviewer, Client, Admin)."""
import enum

from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db

from .base import BaseModel, utcnow


class Role(str, enum.Enum):
    ADMIN = "admin"
    INSPECTOR = "inspector"
    REVIEWER = "reviewer"
    CLIENT = "client"

    @property
    def label(self):
        return {
            Role.ADMIN: "Administrator",
            Role.INSPECTOR: "Inspector",
            Role.REVIEWER: "Reviewer",
            Role.CLIENT: "Client",
        }[self]


class User(BaseModel):
    __tablename__ = "users"

    employee_id = db.Column(db.String(50), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(150), nullable=False)
    phone = db.Column(db.String(50))
    job_title = db.Column(db.String(120))
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum(Role), nullable=False, default=Role.INSPECTOR, index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    last_login_at = db.Column(db.DateTime)

    # Client users are scoped to a single client - they only ever see its jobs.
    client_id = db.Column(db.Integer, db.ForeignKey("clients.id", ondelete="SET NULL"))
    client = db.relationship("Client", back_populates="users")

    # ------------------------------------------------------------------ auth
    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)

    def touch_login(self):
        self.last_login_at = utcnow()

    # ------------------------------------------------------------ properties
    @property
    def initial(self):
        return (self.full_name or self.employee_id or "?")[0].upper()

    def has_role(self, *roles):
        return self.role in roles

    def to_dict(self, exclude=()):
        data = super().to_dict(exclude=set(exclude) | {"password_hash"})
        data["initial"] = self.initial
        data["role_label"] = self.role.label if self.role else None
        data["client_name"] = self.client.name if self.client else None
        return data
