"""Equipment register - saved types and the individual items inspected."""
from datetime import date

from extensions import db

from .base import BaseModel


class EquipmentType(BaseModel):
    """A category of lifting equipment, tied to the module that inspects it."""

    __tablename__ = "equipment_types"

    name = db.Column(db.String(150), unique=True, nullable=False)
    # Slug of the inspection module that handles this type (see modules/).
    module_slug = db.Column(db.String(80), index=True)
    description = db.Column(db.Text)
    # Default certification validity for this type, in months.
    default_validity_months = db.Column(db.Integer, nullable=False, default=12)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    equipment = db.relationship("Equipment", back_populates="equipment_type", lazy="dynamic")

    def to_dict(self, exclude=()):
        data = super().to_dict(exclude=exclude)
        data["equipment_count"] = self.equipment.count()
        return data


class Equipment(BaseModel):
    """One physical item on a client's site."""

    __tablename__ = "equipment"

    client_id = db.Column(
        db.Integer, db.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    equipment_type_id = db.Column(
        db.Integer, db.ForeignKey("equipment_types.id", ondelete="RESTRICT"), nullable=False
    )

    tag_number = db.Column(db.String(100), nullable=False, index=True)
    serial_number = db.Column(db.String(120))
    manufacturer = db.Column(db.String(150))
    model = db.Column(db.String(150))
    year_of_manufacture = db.Column(db.Integer)
    swl = db.Column(db.String(60))  # Safe Working Load, e.g. 5 Tonne
    capacity = db.Column(db.String(60))
    location = db.Column(db.String(200))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    notes = db.Column(db.Text)

    # Denormalised from the latest approved report so expiry can be queried cheaply.
    last_inspection_date = db.Column(db.Date)
    certificate_expiry_date = db.Column(db.Date, index=True)

    client = db.relationship("Client", back_populates="equipment")
    equipment_type = db.relationship("EquipmentType", back_populates="equipment")
    reports = db.relationship("Report", back_populates="equipment", lazy="dynamic")

    __table_args__ = (
        db.UniqueConstraint("client_id", "tag_number", name="uq_equipment_client_tag"),
    )

    @property
    def days_to_expiry(self):
        if not self.certificate_expiry_date:
            return None
        return (self.certificate_expiry_date - date.today()).days

    @property
    def certification_status(self):
        days = self.days_to_expiry
        if days is None:
            return "uncertified"
        if days < 0:
            return "expired"
        if days <= 7:
            return "critical"
        if days <= 30:
            return "due"
        if days <= 60:
            return "upcoming"
        return "valid"

    def to_dict(self, exclude=()):
        data = super().to_dict(exclude=exclude)
        data["client_name"] = self.client.name if self.client else None
        data["type_name"] = self.equipment_type.name if self.equipment_type else None
        data["module_slug"] = self.equipment_type.module_slug if self.equipment_type else None
        data["days_to_expiry"] = self.days_to_expiry
        data["certification_status"] = self.certification_status
        return data
