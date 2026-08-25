"""Jobs - the commercial wrapper around a site visit."""
import enum

from extensions import db

from .base import BaseModel


class JobStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Job(BaseModel):
    __tablename__ = "jobs"

    job_number = db.Column(db.String(60), unique=True, nullable=False, index=True)
    client_id = db.Column(
        db.Integer, db.ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    contact_id = db.Column(db.Integer, db.ForeignKey("client_contacts.id", ondelete="SET NULL"))

    site_name = db.Column(db.String(200))
    site_address = db.Column(db.Text)
    purchase_order = db.Column(db.String(120))
    inspection_date = db.Column(db.Date, index=True)
    status = db.Column(db.Enum(JobStatus), nullable=False, default=JobStatus.OPEN, index=True)
    notes = db.Column(db.Text)

    # Team lead is copied on expiry alerts for equipment inspected on this job.
    team_lead_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    client = db.relationship("Client", back_populates="jobs")
    contact = db.relationship("ClientContact", foreign_keys=[contact_id])
    team_lead = db.relationship("User", foreign_keys=[team_lead_id])
    created_by = db.relationship("User", foreign_keys=[created_by_id])
    reports = db.relationship("Report", back_populates="job", lazy="dynamic")

    def to_dict(self, exclude=()):
        data = super().to_dict(exclude=exclude)
        data["client_name"] = self.client.name if self.client else None
        data["contact_name"] = self.contact.name if self.contact else None
        data["team_lead_name"] = self.team_lead.full_name if self.team_lead else None
        data["report_count"] = self.reports.count()
        return data
