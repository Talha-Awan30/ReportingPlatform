"""Admin-controlled dropdown master lists.

Every inspection checkpoint in every module reads its options from here, so the
approved wording lives in one place and can be edited without a code change.
"""
from extensions import db

from .base import BaseModel


class DropdownList(BaseModel):
    """A named set of options, optionally scoped to one inspection module."""

    __tablename__ = "dropdown_lists"

    key = db.Column(db.String(80), nullable=False, index=True)
    name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    # NULL means the list is global and available to every module.
    module_slug = db.Column(db.String(80), index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    options = db.relationship(
        "DropdownOption",
        back_populates="list",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="DropdownOption.sort_order",
    )

    __table_args__ = (
        db.UniqueConstraint("key", "module_slug", name="uq_dropdown_key_module"),
    )

    def to_dict(self, exclude=(), with_options=True):
        data = super().to_dict(exclude=exclude)
        data["option_count"] = len(self.options)
        if with_options:
            data["options"] = [o.to_dict() for o in self.options if o.is_active]
        return data


class DropdownOption(BaseModel):
    __tablename__ = "dropdown_options"

    list_id = db.Column(
        db.Integer, db.ForeignKey("dropdown_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value = db.Column(db.String(80), nullable=False)
    label = db.Column(db.String(255), nullable=False)
    # Free-text clause dropped into the Word report when this option is chosen.
    report_text = db.Column(db.Text)
    # Drives badge colour in the UI: neutral / success / warning / danger / info.
    severity = db.Column(db.String(20), default="neutral")
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_default = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    list = db.relationship("DropdownList", back_populates="options")
