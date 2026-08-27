"""Inspection sets - one visit, a shared title page, several units.

The inspector says how many elevators the visit covers, fills the title page
once, then works through the same particulars table, check-list and photo boxes
for each unit. One `Report` is created per unit, so the review queue, the
approval trail and the client portal all keep working unchanged.
"""
import os

from flask import Blueprint, request, send_file

from extensions import db
from models import (
    Equipment,
    EquipmentType,
    InspectionSet,
    InspectionSetPhoto,
    Job,
    Report,
    ReportEventType,
    ReportStatus,
    Role,
)
from models.base import utcnow
from modules import get_module
from services import docx_generator
from services.numbering import next_report_number, next_set_number
from services.storage import (
    delete_set_photo_file,
    save_set_photo,
    set_photo_path,
)
from utils import paginate, roles_required
from utils.decorators import current_user
from utils.errors import ApiError
from utils.validation import parse_date, require_fields

bp = Blueprint("inspection_sets", __name__)

STAFF = (Role.ADMIN, Role.INSPECTOR, Role.REVIEWER)


# --------------------------------------------------------------------- access
def _visible_sets():
    user = current_user()
    query = InspectionSet.query
    if user.role is Role.CLIENT:
        return query.join(Job, InspectionSet.job_id == Job.id).filter(
            Job.client_id == user.client_id
        )
    if user.role is Role.INSPECTOR:
        return query.filter(InspectionSet.created_by_id == user.id)
    return query


def _load(set_id):
    record = _visible_sets().filter(InspectionSet.id == set_id).first()
    if record is None:
        raise ApiError("Inspection set not found.", 404, "not_found")
    return record


def _assert_editable(record):
    """The shared half stays editable while any unit is still a draft."""
    user = current_user()
    if user.role is Role.CLIENT:
        raise ApiError("Clients cannot edit inspection sets.", 403, "forbidden")
    if user.role is Role.INSPECTOR and record.created_by_id != user.id:
        raise ApiError("You can only edit sets you created.", 403, "forbidden")
    if record.reports and all(not r.is_editable for r in record.reports):
        raise ApiError(
            "Every unit in this set has been submitted, so the title page is locked.",
            409,
            "not_editable",
        )


# ---------------------------------------------------------------------- lists
@bp.get("")
@roles_required()
def list_sets():
    query = _visible_sets()
    if module_slug := request.args.get("module_slug"):
        query = query.filter(InspectionSet.module_slug == module_slug)
    if job_id := request.args.get("job_id", type=int):
        query = query.filter(InspectionSet.job_id == job_id)
    return paginate(query.order_by(InspectionSet.created_at.desc()))


@bp.get("/<int:set_id>")
@roles_required()
def get_set(set_id):
    record = _load(set_id)
    spec = get_module(record.module_slug)

    payload = record.to_dict(detail=True)
    payload["module"] = spec.to_dict() if spec else None
    return {"set": payload}


# --------------------------------------------------------------------- create
@bp.post("")
@roles_required(*STAFF)
def create_set():
    """Start a visit: how many units, and which job they belong to.

    Creates the set plus one draft report per unit in a single call, so the
    inspector goes straight from "3 elevators" to filling the title page.
    """
    data = request.get_json(silent=True) or {}
    require_fields(data, "module_slug", "job_id", "unit_count")

    spec = get_module(data["module_slug"])
    if spec is None:
        raise ApiError(f"Unknown inspection module '{data['module_slug']}'.", 404, "module_not_found")
    if not spec.supports_multiple:
        raise ApiError(
            f"The {spec.name} module does not use multi-unit inspection sets.",
            422,
            "not_multi_unit",
        )

    try:
        unit_count = int(data["unit_count"])
    except (TypeError, ValueError):
        raise ApiError("'unit_count' must be a whole number.", 422, "validation_error")
    if not 1 <= unit_count <= spec.max_units:
        raise ApiError(
            f"Choose between 1 and {spec.max_units} {spec.unit_noun_plural}.",
            422,
            "validation_error",
        )

    job = Job.query.get_or_404(data["job_id"])
    user = current_user()

    record = InspectionSet(
        set_number=next_set_number(spec.report_prefix),
        module_slug=spec.slug,
        job_id=job.id,
        unit_count=unit_count,
        title_page=data.get("title_page") or {},
        created_by_id=user.id,
    )
    db.session.add(record)
    db.session.flush()

    seeded = seed_from_title_page(spec, record.title_page)

    for index in range(1, unit_count + 1):
        report = Report(
            report_number=next_report_number(spec.report_prefix),
            module_slug=spec.slug,
            job_id=job.id,
            inspection_set_id=record.id,
            sequence=index,
            inspector_id=user.id,
            status=ReportStatus.DRAFT,
            inspection_date=job.inspection_date,
            data=dict(seeded),
        )
        db.session.add(report)
        db.session.flush()
        report.log_event(
            ReportEventType.CREATED,
            user,
            note=f"{spec.unit_noun.title()} {index} of {unit_count} in set {record.set_number}",
        )

    db.session.commit()
    return {"set": record.to_dict(detail=True)}, 201


@bp.patch("/<int:set_id>")
@roles_required(*STAFF)
def update_set(set_id):
    """Save the shared title page."""
    record = _load(set_id)
    _assert_editable(record)

    data = request.get_json(silent=True) or {}
    if "title_page" in data:
        merged = dict(record.title_page or {})
        merged.update(data["title_page"] or {})
        record.title_page = merged

    db.session.commit()
    return {"set": record.to_dict(detail=True)}


@bp.post("/<int:set_id>/units")
@roles_required(*STAFF)
def add_unit(set_id):
    """Add one more unit to a set that is already under way."""
    record = _load(set_id)
    _assert_editable(record)

    spec = get_module(record.module_slug)
    if len(record.reports) >= spec.max_units:
        raise ApiError(f"A set can hold at most {spec.max_units} units.", 422, "too_many_units")

    user = current_user()
    sequence = max((r.sequence for r in record.reports), default=0) + 1

    data = seed_from_title_page(spec, record.title_page)
    data.update(shared_values_from(record, spec, before_sequence=sequence))

    report = Report(
        report_number=next_report_number(spec.report_prefix),
        module_slug=spec.slug,
        job_id=record.job_id,
        inspection_set_id=record.id,
        sequence=sequence,
        inspector_id=user.id,
        status=ReportStatus.DRAFT,
        inspection_date=record.job.inspection_date if record.job else None,
        data=data,
    )
    db.session.add(report)
    db.session.flush()
    report.log_event(ReportEventType.CREATED, user, note=f"Added to set {record.set_number}")

    record.unit_count = len(record.reports)
    db.session.commit()
    return {"set": record.to_dict(detail=True), "report": report.to_dict()}, 201


@bp.delete("/<int:set_id>")
@roles_required(Role.ADMIN, Role.INSPECTOR)
def delete_set(set_id):
    record = _load(set_id)
    user = current_user()

    if user.role is Role.INSPECTOR and record.created_by_id != user.id:
        raise ApiError("You can only delete sets you created.", 403, "forbidden")
    if any(r.status is not ReportStatus.DRAFT for r in record.reports) and user.role is not Role.ADMIN:
        raise ApiError("A set with submitted units cannot be deleted.", 409, "not_deletable")

    from services.storage import delete_photo_file

    for report in record.reports:
        for photo in list(report.photos):
            delete_photo_file(photo)
    for photo in list(record.photos):
        delete_set_photo_file(photo)

    db.session.delete(record)
    db.session.commit()
    return {"message": "Inspection set deleted."}


# ---------------------------------------------------------- title page photos
@bp.post("/<int:set_id>/photos")
@roles_required(*STAFF)
def upload_set_photos(set_id):
    record = _load(set_id)
    _assert_editable(record)

    slot_key = request.form.get("slot_key")
    if not slot_key:
        raise ApiError("'slot_key' is required.", 422, "validation_error")

    files = request.files.getlist("files") or request.files.getlist("file")
    if not files:
        raise ApiError("No files were uploaded.", 422, "no_files")

    user = current_user()
    start = len(record.photos_of(slot_key))
    saved = []

    for offset, file_storage in enumerate(files):
        meta = save_set_photo(file_storage, record.id, slot_key)
        photo = InspectionSetPhoto(
            inspection_set_id=record.id,
            slot_key=slot_key,
            filename=meta["filename"],
            original_name=meta["original_name"],
            content_type=meta["content_type"],
            size_bytes=meta["size_bytes"],
            caption=request.form.get("caption"),
            sort_order=start + offset,
            uploaded_by_id=user.id,
        )
        db.session.add(photo)
        saved.append(photo)

    db.session.commit()
    return {"photos": [p.to_dict() for p in saved]}, 201


@bp.get("/<int:set_id>/photos/<int:photo_id>/file")
@roles_required()
def serve_set_photo(set_id, photo_id):
    _load(set_id)
    photo = InspectionSetPhoto.query.filter_by(id=photo_id, inspection_set_id=set_id).first_or_404()

    path = set_photo_path(photo)
    if not os.path.exists(path):
        raise ApiError("The image file is missing from storage.", 404, "file_missing")
    return send_file(path, mimetype=photo.content_type or "image/jpeg")


@bp.delete("/<int:set_id>/photos/<int:photo_id>")
@roles_required(*STAFF)
def delete_set_photo(set_id, photo_id):
    record = _load(set_id)
    _assert_editable(record)

    photo = InspectionSetPhoto.query.filter_by(id=photo_id, inspection_set_id=set_id).first_or_404()
    delete_set_photo_file(photo)
    db.session.delete(photo)
    db.session.commit()
    return {"message": "Photo removed."}


# ------------------------------------------------------------------ documents
@bp.post("/<int:set_id>/generate")
@roles_required(*STAFF)
def generate_set_document(set_id):
    """Build the combined document: title page once, then every unit."""
    record = _load(set_id)
    spec = get_module(record.module_slug)

    incomplete = [r.sequence for r in record.reports if r.status is ReportStatus.DRAFT]
    if incomplete and not request.args.get("force"):
        raise ApiError(
            f"{len(incomplete)} {spec.unit_noun}(s) are still drafts: "
            f"{', '.join(f'#{s}' for s in incomplete)}.",
            422,
            "incomplete_set",
            {"incomplete": incomplete},
        )

    record.docx_path = docx_generator.generate_set(record, spec)
    record.generated_at = utcnow()
    db.session.commit()

    return {"set": record.to_dict(), "message": "Combined report generated."}


@bp.get("/<int:set_id>/download")
@roles_required()
def download_set_document(set_id):
    from services.storage import generated_dir

    record = _load(set_id)
    if not record.docx_path:
        raise ApiError("The combined report has not been generated yet.", 404, "not_generated")

    path = os.path.join(generated_dir(create=False), record.docx_path)
    if not os.path.exists(path):
        raise ApiError("The generated document is missing from storage.", 404, "file_missing")

    return send_file(path, as_attachment=True, download_name=record.docx_path)


# -------------------------------------------------------------------- helpers
def resolve_equipment_for(report, spec):
    """Match or create the equipment row from the unit's Identification field.

    Called when a unit is submitted, so certification expiry tracking works even
    though the inspector typed the ID rather than picking from the register.
    """
    if report.equipment_id or not spec:
        return report.equipment

    answers = report.data or {}

    def value(key):
        entry = answers.get(key)
        return (entry or {}).get("value") if isinstance(entry, dict) else entry

    tag = (value("identification") or "").strip()
    if not tag:
        return None

    job = report.job
    if job is None:
        return None

    existing = Equipment.query.filter_by(client_id=job.client_id, tag_number=tag).first()
    if existing:
        report.equipment_id = existing.id
        return existing

    equipment_type = (
        EquipmentType.query.filter_by(module_slug=spec.slug).order_by(EquipmentType.id).first()
    )
    if equipment_type is None:
        return None

    equipment = Equipment(
        client_id=job.client_id,
        equipment_type_id=equipment_type.id,
        tag_number=tag,
        serial_number=value("manufacturer_serial_number"),
        manufacturer=value("make"),
        model=value("model"),
        capacity=value("capacity"),
        swl=value("capacity"),
        location=value("location"),
        notes="Created automatically from an inspection report.",
    )
    db.session.add(equipment)
    db.session.flush()
    report.equipment_id = equipment.id
    return equipment


def seed_from_title_page(spec, title_page):
    """Pre-fill the particulars a unit inherits from the cover page."""
    if not spec or not title_page:
        return {}

    seeded = {}
    for title_key, unit_key in (spec.title_to_unit or {}).items():
        entry = title_page.get(title_key)
        value = entry.get("value") if isinstance(entry, dict) else entry
        if value not in (None, ""):
            seeded[unit_key] = {"value": value}

    # Manifest defaults, e.g. the standard reference code.
    for field in spec.unit_details:
        if field.key not in seeded and field.default not in (None, ""):
            seeded[field.key] = {"value": field.default}

    return seeded


def shared_values_from(record, spec, before_sequence=None):
    """Values an inspector already typed on an earlier unit of this visit.

    Only the keys the manifest marks as shared - client, site, make, model and
    so on. The identification and serial number are always per unit.
    """
    if not spec or not spec.shared_unit_fields:
        return {}

    earlier = [
        r for r in sorted(record.reports, key=lambda r: r.sequence)
        if before_sequence is None or r.sequence < before_sequence
    ]

    collected = {}
    for report in earlier:
        for key in spec.shared_unit_fields:
            entry = (report.data or {}).get(key)
            value = entry.get("value") if isinstance(entry, dict) else entry
            if value not in (None, "", []):
                collected[key] = {"value": value}
    return collected


def prefill_for(report, spec):
    """Suggested values for a draft unit, taken from the units before it."""
    if report.status is not ReportStatus.DRAFT or report.inspection_set is None:
        return {}

    suggestions = shared_values_from(report.inspection_set, spec, before_sequence=report.sequence)
    answers = report.data or {}

    # Never overwrite something the inspector has already typed.
    return {
        key: value
        for key, value in suggestions.items()
        if not (answers.get(key) or {}).get("value")
    }
