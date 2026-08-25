"""Reports - creation, the approval workflow, photos and document download.

Everything here is module-agnostic: a report's checkpoint answers live in its
`data` JSON column, so the queue, the trail and the client portal work the same
way for every inspection item.
"""
import os
from datetime import timedelta

from flask import Blueprint, request, send_file

from extensions import db
from models import (
    Equipment,
    Job,
    PhotoKind,
    Report,
    ReportEventType,
    ReportPhoto,
    ReportStatus,
    Role,
)
from models.base import utcnow
from modules import get_module
from services import docx_generator
from services.numbering import next_report_number
from services.storage import delete_photo_file, photo_path, save_report_photo
from utils import paginate, roles_required
from utils.decorators import current_user
from utils.errors import ApiError
from utils.validation import parse_date, parse_enum, require_fields

bp = Blueprint("reports", __name__)

# Statuses a client is allowed to see - nothing reaches them before approval.
CLIENT_VISIBLE = (ReportStatus.APPROVED, ReportStatus.CLIENT_QUERY, ReportStatus.CLIENT_APPROVED)


# --------------------------------------------------------------------- access
def _visible_reports():
    """Scope the report table to what the caller is allowed to see."""
    user = current_user()
    query = Report.query

    if user.role is Role.CLIENT:
        return (
            query.join(Job, Report.job_id == Job.id)
            .filter(Job.client_id == user.client_id, Report.status.in_(CLIENT_VISIBLE))
        )
    if user.role is Role.INSPECTOR:
        # Inspectors see their own work plus anything already released.
        return query.filter(
            db.or_(Report.inspector_id == user.id, Report.status.in_(CLIENT_VISIBLE))
        )
    return query


def _load(report_id):
    report = _visible_reports().filter(Report.id == report_id).first()
    if report is None:
        raise ApiError("Report not found.", 404, "not_found")
    return report


def _assert_can_edit(report):
    user = current_user()
    if not report.is_editable:
        raise ApiError(
            f"This report is {report.status.label.lower()} and can no longer be edited.",
            409,
            "not_editable",
        )
    if user.role is Role.INSPECTOR and report.inspector_id != user.id:
        raise ApiError("You can only edit reports you created.", 403, "forbidden")
    if user.role is Role.CLIENT:
        raise ApiError("Clients cannot edit reports.", 403, "forbidden")


# ---------------------------------------------------------------------- lists
@bp.get("")
@roles_required()
def list_reports():
    query = _visible_reports()

    if module_slug := request.args.get("module_slug"):
        query = query.filter(Report.module_slug == module_slug)
    if status := parse_enum(ReportStatus, request.args.get("status"), "status"):
        query = query.filter(Report.status == status)
    if job_id := request.args.get("job_id", type=int):
        query = query.filter(Report.job_id == job_id)
    if equipment_id := request.args.get("equipment_id", type=int):
        query = query.filter(Report.equipment_id == equipment_id)
    if inspector_id := request.args.get("inspector_id", type=int):
        query = query.filter(Report.inspector_id == inspector_id)
    if client_id := request.args.get("client_id", type=int):
        query = query.join(Job, Report.job_id == Job.id).filter(Job.client_id == client_id)
    if date_from := parse_date(request.args.get("date_from"), "date_from"):
        query = query.filter(Report.inspection_date >= date_from)
    if date_to := parse_date(request.args.get("date_to"), "date_to"):
        query = query.filter(Report.inspection_date <= date_to)

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = (
            query.outerjoin(Equipment, Report.equipment_id == Equipment.id)
            .outerjoin(Job, Report.job_id == Job.id)
            .filter(
                db.or_(
                    Report.report_number.ilike(like),
                    Equipment.tag_number.ilike(like),
                    Job.job_number.ilike(like),
                )
            )
        )

    return paginate(query.order_by(Report.updated_at.desc()))


@bp.get("/queue")
@roles_required(Role.REVIEWER, Role.ADMIN)
def review_queue():
    """Every submitted report waiting for review, oldest first."""
    query = Report.query.filter(Report.status == ReportStatus.SUBMITTED)
    if module_slug := request.args.get("module_slug"):
        query = query.filter(Report.module_slug == module_slug)
    return paginate(query.order_by(Report.submitted_at.asc()))


@bp.get("/<int:report_id>")
@roles_required()
def get_report(report_id):
    report = _load(report_id)
    spec = get_module(report.module_slug)

    payload = report.to_dict(detail=True)
    payload["module"] = spec.to_dict() if spec else None
    return {"report": payload}


# --------------------------------------------------------------------- create
@bp.post("")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def create_report():
    data = request.get_json(silent=True) or {}
    require_fields(data, "module_slug", "job_id", "equipment_id")

    spec = get_module(data["module_slug"])
    if spec is None:
        raise ApiError(f"Unknown inspection module '{data['module_slug']}'.", 404, "module_not_found")

    job = Job.query.get_or_404(data["job_id"])
    equipment = Equipment.query.get_or_404(data["equipment_id"])
    if equipment.client_id != job.client_id:
        raise ApiError(
            "That equipment belongs to a different client than the job.", 422, "client_mismatch"
        )

    user = current_user()
    report = Report(
        module_slug=spec.slug,
        report_number=next_report_number(spec.report_prefix),
        job_id=job.id,
        equipment_id=equipment.id,
        inspector_id=user.id,
        status=ReportStatus.DRAFT,
        inspection_date=parse_date(data.get("inspection_date"), "inspection_date")
        or job.inspection_date,
        data=data.get("data") or {},
        comments=data.get("comments"),
    )
    db.session.add(report)
    db.session.flush()
    report.log_event(ReportEventType.CREATED, user, note=f"Draft created for {equipment.tag_number}")
    db.session.commit()

    return {"report": report.to_dict(detail=True)}, 201


@bp.patch("/<int:report_id>")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def update_report(report_id):
    report = _load(report_id)
    _assert_can_edit(report)

    data = request.get_json(silent=True) or {}

    if "data" in data:
        # Merge rather than replace so a partial save cannot wipe other answers.
        merged = dict(report.data or {})
        merged.update(data["data"] or {})
        report.data = merged
    report.update_from(data, ["comments", "overall_result"])
    for field in ("inspection_date", "next_inspection_date", "certificate_expiry_date"):
        if field in data:
            setattr(report, field, parse_date(data[field], field))

    db.session.commit()
    return {"report": report.to_dict(detail=True)}


@bp.delete("/<int:report_id>")
@roles_required(Role.INSPECTOR, Role.ADMIN)
def delete_report(report_id):
    report = _load(report_id)
    user = current_user()

    if report.status is not ReportStatus.DRAFT and user.role is not Role.ADMIN:
        raise ApiError("Only drafts can be deleted.", 409, "not_deletable")
    if user.role is Role.INSPECTOR and report.inspector_id != user.id:
        raise ApiError("You can only delete reports you created.", 403, "forbidden")

    for photo in list(report.photos):
        delete_photo_file(photo)

    db.session.delete(report)
    db.session.commit()
    return {"message": "Report deleted."}


# ------------------------------------------------------------------- workflow
@bp.post("/<int:report_id>/submit")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def submit_report(report_id):
    report = _load(report_id)
    _assert_can_edit(report)

    spec = get_module(report.module_slug)
    _assert_required_answered(report, spec)

    user = current_user()
    report.status = ReportStatus.SUBMITTED
    report.submitted_at = utcnow()
    report.log_event(ReportEventType.SUBMITTED, user)

    _generate(report, spec, user)
    db.session.commit()

    return {"report": report.to_dict(detail=True), "message": "Submitted for review."}


@bp.post("/<int:report_id>/return")
@roles_required(Role.REVIEWER, Role.ADMIN)
def return_report(report_id):
    report = Report.query.get_or_404(report_id)
    if report.status is not ReportStatus.SUBMITTED:
        raise ApiError("Only submitted reports can be returned.", 409, "invalid_transition")

    data = request.get_json(silent=True) or {}
    require_fields(data, "reason")

    user = current_user()
    report.status = ReportStatus.RETURNED
    report.return_reason = data["reason"]
    report.reviewer_id = user.id
    report.reviewed_at = utcnow()
    report.revision += 1  # a corrected report is a new revision
    report.log_event(ReportEventType.RETURNED, user, note=data["reason"])
    db.session.commit()

    return {"report": report.to_dict(detail=True), "message": "Returned to the inspector."}


@bp.post("/<int:report_id>/approve")
@roles_required(Role.REVIEWER, Role.ADMIN)
def approve_report(report_id):
    report = Report.query.get_or_404(report_id)
    if report.status is not ReportStatus.SUBMITTED:
        raise ApiError("Only submitted reports can be approved.", 409, "invalid_transition")

    data = request.get_json(silent=True) or {}
    user = current_user()
    spec = get_module(report.module_slug)

    report.status = ReportStatus.APPROVED
    report.reviewer_id = user.id
    report.reviewed_at = utcnow()
    report.return_reason = None

    _apply_validity(report, spec, data)
    _sync_equipment_certification(report)
    report.log_event(ReportEventType.APPROVED, user, note=data.get("note"))

    # Regenerate so the released document carries the reviewer's name.
    _generate(report, spec, user)
    db.session.commit()

    return {"report": report.to_dict(detail=True), "message": "Approved and released to the client."}


@bp.post("/<int:report_id>/client-approve")
@roles_required(Role.CLIENT, Role.ADMIN)
def client_approve(report_id):
    report = _load(report_id)
    if report.status not in (ReportStatus.APPROVED, ReportStatus.CLIENT_QUERY):
        raise ApiError("This report is not awaiting your approval.", 409, "invalid_transition")

    user = current_user()
    report.status = ReportStatus.CLIENT_APPROVED
    report.client_approver_id = user.id
    report.client_approved_at = utcnow()
    report.log_event(ReportEventType.CLIENT_APPROVED, user)
    db.session.commit()

    return {"report": report.to_dict(detail=True), "message": "Report approved."}


@bp.post("/<int:report_id>/client-query")
@roles_required(Role.CLIENT, Role.ADMIN)
def client_query(report_id):
    report = _load(report_id)
    if report.status not in (ReportStatus.APPROVED, ReportStatus.CLIENT_QUERY):
        raise ApiError("This report is not open for a query.", 409, "invalid_transition")

    data = request.get_json(silent=True) or {}
    require_fields(data, "query")

    user = current_user()
    report.status = ReportStatus.CLIENT_QUERY
    report.client_query_text = data["query"]
    report.log_event(ReportEventType.CLIENT_QUERY, user, note=data["query"])
    db.session.commit()

    return {"report": report.to_dict(detail=True), "message": "Query raised with the review team."}


# --------------------------------------------------------------------- photos
@bp.post("/<int:report_id>/photos")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def upload_photos(report_id):
    report = _load(report_id)
    _assert_can_edit(report)

    kind = parse_enum(PhotoKind, request.form.get("kind", "inspection"), "kind")
    files = request.files.getlist("files") or request.files.getlist("file")
    if not files:
        raise ApiError("No files were uploaded.", 422, "no_files")

    user = current_user()
    start = len(report.photos_of(kind))
    saved = []

    for offset, file_storage in enumerate(files):
        meta = save_report_photo(file_storage, report.id, kind.value)
        photo = ReportPhoto(
            report_id=report.id,
            kind=kind,
            filename=meta["filename"],
            original_name=meta["original_name"],
            content_type=meta["content_type"],
            size_bytes=meta["size_bytes"],
            caption=request.form.get("caption"),
            checkpoint_key=request.form.get("checkpoint_key"),
            sort_order=start + offset,
            uploaded_by_id=user.id,
        )
        db.session.add(photo)
        saved.append(photo)

    db.session.commit()
    return {"photos": [p.to_dict() for p in saved]}, 201


@bp.get("/<int:report_id>/photos/<int:photo_id>/file")
@roles_required()
def serve_photo(report_id, photo_id):
    _load(report_id)  # access check
    photo = ReportPhoto.query.filter_by(id=photo_id, report_id=report_id).first_or_404()

    path = photo_path(photo)
    if not os.path.exists(path):
        raise ApiError("The image file is missing from storage.", 404, "file_missing")
    return send_file(path, mimetype=photo.content_type or "image/jpeg")


@bp.patch("/<int:report_id>/photos/<int:photo_id>")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def update_photo(report_id, photo_id):
    report = _load(report_id)
    _assert_can_edit(report)

    photo = ReportPhoto.query.filter_by(id=photo_id, report_id=report_id).first_or_404()
    photo.update_from(request.get_json(silent=True) or {}, ["caption", "sort_order", "checkpoint_key"])
    db.session.commit()
    return {"photo": photo.to_dict()}


@bp.delete("/<int:report_id>/photos/<int:photo_id>")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def delete_photo(report_id, photo_id):
    report = _load(report_id)
    _assert_can_edit(report)

    photo = ReportPhoto.query.filter_by(id=photo_id, report_id=report_id).first_or_404()
    delete_photo_file(photo)
    db.session.delete(photo)
    db.session.commit()
    return {"message": "Photo removed."}


# ------------------------------------------------------------------ documents
@bp.post("/<int:report_id>/generate")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def generate_document(report_id):
    report = _load(report_id)
    spec = get_module(report.module_slug)
    _generate(report, spec, current_user())
    db.session.commit()
    return {"report": report.to_dict(), "message": "Word document generated."}


@bp.get("/<int:report_id>/download")
@roles_required()
def download_document(report_id):
    from services.storage import generated_dir

    report = _load(report_id)
    if not report.docx_path:
        raise ApiError(
            "No document has been generated for this report yet.", 404, "not_generated"
        )

    path = os.path.join(generated_dir(create=False), report.docx_path)
    if not os.path.exists(path):
        raise ApiError("The generated document is missing from storage.", 404, "file_missing")

    return send_file(path, as_attachment=True, download_name=report.docx_path)


# -------------------------------------------------------------------- helpers
def _generate(report, spec, user):
    from modules.blueprint_factory import resolve_options

    options = resolve_options(spec) if spec else {}
    report.docx_path = docx_generator.generate(report, spec, options)
    report.generated_at = utcnow()
    report.log_event(ReportEventType.GENERATED, user, meta={"file": report.docx_path})


def _assert_required_answered(report, spec):
    """Block submission while required checkpoints are still blank."""
    if not spec or not spec.is_configured:
        return

    answers = report.data or {}
    missing = []
    for checkpoint in spec.checkpoints:
        if not checkpoint.required:
            continue
        entry = answers.get(checkpoint.key)
        value = entry.get("value") if isinstance(entry, dict) else entry
        if value in (None, "", []):
            missing.append({"key": checkpoint.key, "label": checkpoint.label})

    if missing:
        raise ApiError(
            f"{len(missing)} required checkpoint(s) are still blank.",
            422,
            "incomplete_report",
            {"missing": missing},
        )


def _apply_validity(report, spec, data):
    """Set the certificate expiry, from the request or the configured validity."""
    if expiry := parse_date(data.get("certificate_expiry_date"), "certificate_expiry_date"):
        report.certificate_expiry_date = expiry
        return

    if report.certificate_expiry_date:
        return

    base = report.inspection_date
    if not base:
        return

    equipment_type = report.equipment.equipment_type if report.equipment else None
    months = (
        equipment_type.default_validity_months
        if equipment_type and equipment_type.default_validity_months
        else (spec.default_validity_months if spec else 12)
    )
    # Approximate a month as 30 days - close enough for a renewal reminder.
    report.certificate_expiry_date = base + timedelta(days=months * 30)
    report.next_inspection_date = report.certificate_expiry_date


def _sync_equipment_certification(report):
    """Copy the approved dates onto the equipment so expiry can be queried."""
    equipment = report.equipment
    if equipment is None:
        return
    if report.inspection_date:
        equipment.last_inspection_date = report.inspection_date
    if report.certificate_expiry_date:
        equipment.certificate_expiry_date = report.certificate_expiry_date
