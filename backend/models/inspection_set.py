"""Inspection sets - one visit covering several units of the same kind.

A site visit may cover three elevators. The title page, its photographs and the
client details are filled in ONCE and shared; the particulars table, the
check-list and the six photographic boxes are repeated for each elevator.

The set owns the shared half. Each unit is an ordinary `Report`, linked back by
`Report.inspection_set_id` and ordered by `Report.sequence`, so the review
queue, the approval trail and the client portal keep working unchanged.
"""
from extensions import db

from .base import BaseModel


class InspectionSet(BaseModel):
    __tablename__ = "inspection_sets"

    set_number = db.Column(db.String(60), unique=True, index=True)
    module_slug = db.Column(db.String(80), nullable=False, index=True)

    job_id = db.Column(
        db.Integer, db.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # How many units this visit covers. Reports are created to match.
    unit_count = db.Column(db.Integer, nullable=False, default=1)

    # Every shared cover-page field, keyed by the module manifest's title_page keys.
    title_page = db.Column(db.JSON, nullable=False, default=dict)

    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    # The combined document: title page followed by every unit's report.
    docx_path = db.Column(db.String(500))
    generated_at = db.Column(db.DateTime)

    job = db.relationship("Job")
    created_by = db.relationship("User")

    reports = db.relationship(
        "Report",
        back_populates="inspection_set",
        order_by="Report.sequence",
        lazy="selectin",
    )
    photos = db.relationship(
        "InspectionSetPhoto",
        back_populates="inspection_set",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="InspectionSetPhoto.sort_order",
    )

    # ---------------------------------------------------------------- helpers
    @property
    def progress(self):
        """How many of the set's units have been submitted."""
        done = sum(1 for r in self.reports if r.status.value != "draft")
        return {"completed": done, "total": len(self.reports)}

    @property
    def is_complete(self):
        return bool(self.reports) and all(r.status.value != "draft" for r in self.reports)

    def photos_of(self, slot_key):
        return [p for p in self.photos if p.slot_key == slot_key]

    def to_dict(self, exclude=(), detail=False):
        data = super().to_dict(exclude=exclude)
        data["job_number"] = self.job.job_number if self.job else None
        data["client_id"] = self.job.client_id if self.job else None
        data["client_name"] = self.job.client.name if self.job and self.job.client else None
        data["created_by_name"] = self.created_by.full_name if self.created_by else None
        data["progress"] = self.progress
        data["is_complete"] = self.is_complete
        data["report_count"] = len(self.reports)

        if detail:
            data["photos"] = [p.to_dict() for p in self.photos]
            data["reports"] = [r.to_dict() for r in self.reports]
        return data


class InspectionSetPhoto(BaseModel):
    """A shared title-page photograph, uploaded once for the whole set."""

    __tablename__ = "inspection_set_photos"

    inspection_set_id = db.Column(
        db.Integer,
        db.ForeignKey("inspection_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Matches a PhotoSlot key from the module manifest's title_page_photos.
    slot_key = db.Column(db.String(120), nullable=False, index=True)

    filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255))
    caption = db.Column(db.String(500))
    content_type = db.Column(db.String(100))
    size_bytes = db.Column(db.Integer)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    inspection_set = db.relationship("InspectionSet", back_populates="photos")

    def to_dict(self, exclude=()):
        data = super().to_dict(exclude=exclude)
        data["url"] = f"/api/inspection-sets/{self.inspection_set_id}/photos/{self.id}/file"
        return data
