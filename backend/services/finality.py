"""When a report counts as final.

Approval alone is not the end: the back office still adds the SGS QR code to
the visit's title page. Only once that picture is in is the report the final
record - the one reviewers list and the equipment register is built from.
"""
from extensions import db
from models import InspectionSetPhoto, Report, ReportStatus
from modules import all_modules

# Statuses past approval (the same ones a client may see).
RELEASED = (ReportStatus.APPROVED, ReportStatus.CLIENT_QUERY, ReportStatus.CLIENT_APPROVED)


def back_office_slot_keys():
    """Keys of the title-page pictures only the back office adds (the QR)."""
    return sorted(
        {
            slot.key
            for spec in all_modules(include_disabled=True)
            for slot in spec.title_page_photos
            if slot.back_office
        }
    )


def has_back_office_photo(report=Report):
    """SQL condition: the report's visit carries the back office's QR code."""
    return db.exists().where(
        InspectionSetPhoto.inspection_set_id == report.inspection_set_id,
        InspectionSetPhoto.slot_key.in_(back_office_slot_keys()),
    )


def is_final(report=Report):
    """SQL condition: approved and the QR code uploaded."""
    return db.and_(report.status.in_(RELEASED), has_back_office_photo(report))


def equipment_is_final():
    """SQL condition on Equipment: it has at least one final report. Only
    such equipment is on the register, the dashboard and the expiry alerts."""
    from models import Equipment

    return db.exists().where(Report.equipment_id == Equipment.id, is_final(Report))
