"""Certification expiry alerts.

One row per (equipment, threshold) so a given reminder is only ever sent once,
even if the scheduler runs many times a day.
"""
from extensions import db

from .base import BaseModel


class ExpiryAlert(BaseModel):
    __tablename__ = "expiry_alerts"

    equipment_id = db.Column(
        db.Integer, db.ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True
    )
    report_id = db.Column(db.Integer, db.ForeignKey("reports.id", ondelete="SET NULL"))

    # Days before expiry this alert represents. 0 means the post-expiry escalation.
    threshold_days = db.Column(db.Integer, nullable=False)
    expiry_date = db.Column(db.Date, nullable=False)
    sent_at = db.Column(db.DateTime)
    recipients = db.Column(db.JSON, default=list)
    subject = db.Column(db.String(300))
    delivery_status = db.Column(db.String(30), default="pending")  # pending/sent/failed
    error = db.Column(db.Text)

    equipment = db.relationship("Equipment")
    report = db.relationship("Report")

    __table_args__ = (
        db.UniqueConstraint(
            "equipment_id", "threshold_days", "expiry_date", name="uq_alert_equipment_threshold"
        ),
    )

    def to_dict(self, exclude=()):
        data = super().to_dict(exclude=exclude)
        if self.equipment:
            data["equipment_tag"] = self.equipment.tag_number
            data["client_name"] = self.equipment.client.name if self.equipment.client else None
        return data
