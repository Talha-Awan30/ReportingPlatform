"""Reports - the record every inspection module produces.

A report is deliberately module-agnostic at this level: the checkpoint answers
live in the `data` JSON column, shaped by the owning module's manifest. That
keeps the queue, the approval workflow, the audit trail and the client portal
identical for every inspection item.
"""
import enum

from extensions import db

from .base import BaseModel, utcnow


class ReportStatus(str, enum.Enum):
    DRAFT = "draft"                      # inspector still filling it in
    SUBMITTED = "submitted"              # waiting in the reviewer queue
    RETURNED = "returned"                # sent back to the inspector for correction
    APPROVED = "approved"                # reviewer approved, released to the client
    CLIENT_QUERY = "client_query"        # client raised a query
    CLIENT_APPROVED = "client_approved"  # client signed off
    CANCELLED = "cancelled"

    @property
    def label(self):
        return {
            ReportStatus.DRAFT: "Draft",
            ReportStatus.SUBMITTED: "Pending Review",
            ReportStatus.RETURNED: "Returned for Correction",
            ReportStatus.APPROVED: "Approved",
            ReportStatus.CLIENT_QUERY: "Client Query",
            ReportStatus.CLIENT_APPROVED: "Client Approved",
            ReportStatus.CANCELLED: "Cancelled",
        }[self]

    @property
    def severity(self):
        """Badge colour used by the frontend."""
        return {
            ReportStatus.DRAFT: "neutral",
            ReportStatus.SUBMITTED: "warning",
            ReportStatus.RETURNED: "danger",
            ReportStatus.APPROVED: "info",
            ReportStatus.CLIENT_QUERY: "warning",
            ReportStatus.CLIENT_APPROVED: "success",
            ReportStatus.CANCELLED: "neutral",
        }[self]


class PhotoKind(str, enum.Enum):
    """Two upload sets, kept apart on purpose so the cover and the body of the
    report can never get mixed up."""

    FRONT_PAGE = "front_page"
    INSPECTION = "inspection"


class ReportEventType(str, enum.Enum):
    CREATED = "created"
    UPDATED = "updated"
    SUBMITTED = "submitted"
    RETURNED = "returned"
    APPROVED = "approved"
    GENERATED = "generated"
    CLIENT_QUERY = "client_query"
    CLIENT_APPROVED = "client_approved"
    CANCELLED = "cancelled"


class Report(BaseModel):
    __tablename__ = "reports"

    report_number = db.Column(db.String(60), unique=True, index=True)
    # Which inspection module owns this report (see modules/ registry).
    module_slug = db.Column(db.String(80), nullable=False, index=True)

    job_id = db.Column(
        db.Integer, db.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    equipment_id = db.Column(
        db.Integer, db.ForeignKey("equipment.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    status = db.Column(db.Enum(ReportStatus), nullable=False, default=ReportStatus.DRAFT, index=True)
    revision = db.Column(db.Integer, nullable=False, default=1)

    inspection_date = db.Column(db.Date, index=True)
    next_inspection_date = db.Column(db.Date)
    certificate_expiry_date = db.Column(db.Date, index=True)

    # Module-specific checkpoint answers, keyed by checkpoint id.
    data = db.Column(db.JSON, nullable=False, default=dict)
    # Free-text observations, defects found and recommendations.
    comments = db.Column(db.Text)
    overall_result = db.Column(db.String(40))  # pass / fail / conditional

    inspector_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    reviewer_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    client_approver_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    submitted_at = db.Column(db.DateTime)
    reviewed_at = db.Column(db.DateTime)
    client_approved_at = db.Column(db.DateTime)
    return_reason = db.Column(db.Text)
    client_query_text = db.Column(db.Text)

    # Paths of the generated documents, relative to GENERATED_FOLDER.
    docx_path = db.Column(db.String(500))
    pdf_path = db.Column(db.String(500))
    generated_at = db.Column(db.DateTime)

    job = db.relationship("Job", back_populates="reports")
    equipment = db.relationship("Equipment", back_populates="reports")
    inspector = db.relationship("User", foreign_keys=[inspector_id])
    reviewer = db.relationship("User", foreign_keys=[reviewer_id])
    client_approver = db.relationship("User", foreign_keys=[client_approver_id])

    photos = db.relationship(
        "ReportPhoto",
        back_populates="report",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ReportPhoto.sort_order",
    )
    events = db.relationship(
        "ReportEvent",
        back_populates="report",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ReportEvent.created_at.desc()",
    )

    # ---------------------------------------------------------------- helpers
    def log_event(self, event_type, user=None, note=None, meta=None):
        """Append to the approval trail. Callers still own the commit."""
        event = ReportEvent(
            report=self,
            event_type=event_type,
            user_id=user.id if user else None,
            user_name=user.full_name if user else "System",
            note=note,
            meta=meta or {},
        )
        db.session.add(event)
        return event

    @property
    def is_editable(self):
        return self.status in (ReportStatus.DRAFT, ReportStatus.RETURNED)

    def photos_of(self, kind):
        return [p for p in self.photos if p.kind == kind]

    def to_dict(self, exclude=(), detail=False):
        data = super().to_dict(exclude=exclude)
        data["status_label"] = self.status.label if self.status else None
        data["status_severity"] = self.status.severity if self.status else None
        data["is_editable"] = self.is_editable
        data["job_number"] = self.job.job_number if self.job else None
        data["client_id"] = self.job.client_id if self.job else None
        data["client_name"] = self.job.client.name if self.job and self.job.client else None
        data["equipment_tag"] = self.equipment.tag_number if self.equipment else None
        data["equipment_type"] = (
            self.equipment.equipment_type.name
            if self.equipment and self.equipment.equipment_type
            else None
        )
        data["inspector_name"] = self.inspector.full_name if self.inspector else None
        data["reviewer_name"] = self.reviewer.full_name if self.reviewer else None
        data["photo_count"] = len(self.photos)

        if detail:
            data["photos"] = [p.to_dict() for p in self.photos]
            data["events"] = [e.to_dict() for e in self.events]
            data["equipment"] = self.equipment.to_dict() if self.equipment else None
            data["job"] = self.job.to_dict() if self.job else None
        return data


class ReportPhoto(BaseModel):
    __tablename__ = "report_photos"

    report_id = db.Column(
        db.Integer, db.ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind = db.Column(db.Enum(PhotoKind), nullable=False, default=PhotoKind.INSPECTION, index=True)

    filename = db.Column(db.String(255), nullable=False)       # stored name on disk
    original_name = db.Column(db.String(255))
    caption = db.Column(db.String(500))
    # Optional link back to the checkpoint this photo evidences.
    checkpoint_key = db.Column(db.String(120))
    content_type = db.Column(db.String(100))
    size_bytes = db.Column(db.Integer)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    report = db.relationship("Report", back_populates="photos")

    def to_dict(self, exclude=()):
        data = super().to_dict(exclude=exclude)
        data["url"] = f"/api/reports/{self.report_id}/photos/{self.id}/file"
        return data


class ReportEvent(BaseModel):
    """One line of the approval trail - who did what, and when."""

    __tablename__ = "report_events"

    report_id = db.Column(
        db.Integer, db.ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type = db.Column(db.Enum(ReportEventType), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    # Denormalised so the trail survives a user being deleted.
    user_name = db.Column(db.String(150))
    note = db.Column(db.Text)
    meta = db.Column(db.JSON, default=dict)

    report = db.relationship("Report", back_populates="events")

    def to_dict(self, exclude=()):
        data = super().to_dict(exclude=exclude)
        data["event_label"] = self.event_type.value.replace("_", " ").title()
        return data
