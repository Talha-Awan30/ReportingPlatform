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
from services import docx_generator, revisions
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
    """Reports, newest first. With ?group_visits=1 a multi-unit visit is one
    row - its first unit, carrying a `visit` summary of every unit."""
    from sqlalchemy.orm import aliased

    from models import InspectionSet

    query = _visible_reports()
    group = request.args.get("group_visits") in ("1", "true")
    unit = aliased(Report)

    if module_slug := request.args.get("module_slug"):
        query = query.filter(Report.module_slug == module_slug)
    if status := parse_enum(ReportStatus, request.args.get("status"), "status"):
        if group:
            # A visit matches when any of its units has the status.
            query = query.filter(
                db.or_(
                    db.and_(Report.inspection_set_id.is_(None), Report.status == status),
                    db.exists().where(
                        unit.inspection_set_id == Report.inspection_set_id, unit.status == status
                    ),
                )
            )
        else:
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
            .outerjoin(InspectionSet, Report.inspection_set_id == InspectionSet.id)
            .filter(
                db.or_(
                    Report.report_number.ilike(like),
                    Equipment.tag_number.ilike(like),
                    Job.job_number.ilike(like),
                    InspectionSet.set_number.ilike(like),
                )
            )
        )

    if not group:
        return paginate(query.order_by(Report.updated_at.desc()))

    # One row per visit: keep only its first unit (lowest id).
    first_unit = (
        db.select(db.func.min(unit.id)).where(unit.inspection_set_id == Report.inspection_set_id)
    ).scalar_subquery()
    query = query.filter(db.or_(Report.inspection_set_id.is_(None), Report.id == first_unit))
    return paginate(query.order_by(Report.updated_at.desc()), serializer=_with_visit_summary)


# The status a whole visit shows: the one needing attention soonest wins.
VISIT_STATUS_ORDER = [
    ReportStatus.RETURNED,
    ReportStatus.DRAFT,
    ReportStatus.SUBMITTED,
    ReportStatus.CLIENT_QUERY,
    ReportStatus.APPROVED,
    ReportStatus.CLIENT_APPROVED,
]


def _with_visit_summary(report):
    data = report.to_dict()
    record = report.inspection_set
    if record is None:
        return data
    units = sorted(record.reports, key=lambda r: r.sequence)
    leading = min(
        units,
        key=lambda r: VISIT_STATUS_ORDER.index(r.status) if r.status in VISIT_STATUS_ORDER else 99,
    )
    shown = leading.to_dict()
    spec = get_module(record.module_slug)
    data["visit"] = {
        "set_id": record.id,
        "set_number": record.set_number,
        "unit_count": len(units),
        "units": [{"id": u.id, "sequence": u.sequence} for u in units],
        "unit_noun": spec.unit_noun if spec else "unit",
        "unit_noun_plural": spec.unit_noun_plural if spec else "units",
        "tags": [u.to_dict().get("equipment_tag") or f"#{u.sequence}" for u in units],
        "revision": max(u.revision for u in units),
        "status": leading.status.value,
        "status_label": shown.get("status_label"),
        "status_severity": shown.get("status_severity"),
        "expires": min(
            (u.certificate_expiry_date for u in units if u.certificate_expiry_date), default=None
        ),
    }
    if data["visit"]["expires"]:
        data["visit"]["expires"] = data["visit"]["expires"].isoformat()
    return data


@bp.get("/review-queue")
@roles_required(Role.REVIEWER, Role.ADMIN)
def review_items():
    """What is waiting for a reviewer, latest submission first.

    A multi-unit visit is reviewed as ONE item - its combined report (title
    page plus every unit) - once every unit is in. A report that is not part
    of a visit is its own item.
    """
    from models import InspectionSet
    from modules import get_module as module_of

    module_slug = request.args.get("module_slug")
    items = []

    sets = InspectionSet.query.filter(
        InspectionSet.reports.any(Report.status == ReportStatus.SUBMITTED)
    )
    if module_slug:
        sets = sets.filter(InspectionSet.module_slug == module_slug)
    for record in sets:
        if not set_ready_for_review(record):
            continue
        submitted = [r for r in record.reports if r.status is ReportStatus.SUBMITTED]
        first = record.reports[0]
        spec = module_of(record.module_slug)
        items.append({
            "kind": "set",
            "id": record.id,
            "number": record.set_number,
            "module_slug": record.module_slug,
            "module_name": spec.name if spec else record.module_slug,
            "item": first.to_dict().get("equipment_type") if first else None,
            "unit_count": len(record.reports),
            "units": [{"id": r.id, "sequence": r.sequence} for r in record.reports],
            "unit_noun": spec.unit_noun if spec else "unit",
            "unit_noun_plural": spec.unit_noun_plural if spec else "units",
            "client_name": record.job.client.name if record.job and record.job.client else None,
            "job_number": record.job.job_number if record.job else None,
            "inspector_name": first.inspector.full_name if first and first.inspector else None,
            "submitted_at": max(r.submitted_at for r in submitted).isoformat(),
            "revision": max(r.revision for r in record.reports),
            "has_pdf": bool(record.pdf_path),
        })

    singles = Report.query.filter(
        Report.status == ReportStatus.SUBMITTED, Report.inspection_set_id.is_(None)
    )
    if module_slug:
        singles = singles.filter(Report.module_slug == module_slug)
    for report in singles:
        spec = module_of(report.module_slug)
        data = report.to_dict()
        items.append({
            "kind": "report",
            "id": report.id,
            "number": report.report_number,
            "module_slug": report.module_slug,
            "module_name": spec.name if spec else report.module_slug,
            "item": data.get("equipment_type"),
            "equipment_tag": data.get("equipment_tag"),
            "unit_count": 1,
            "units": [{"id": report.id, "sequence": report.sequence}],
            "client_name": data.get("client_name"),
            "job_number": data.get("job_number"),
            "inspector_name": data.get("inspector_name"),
            "submitted_at": report.submitted_at.isoformat() if report.submitted_at else None,
            "revision": report.revision,
            "has_pdf": bool(report.pdf_path),
        })

    items.sort(key=lambda i: i["submitted_at"] or "", reverse=True)

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = max(1, min(int(request.args.get("per_page", 25)), 100))
    except ValueError:
        page, per_page = 1, 25
    total = len(items)
    pages = max(1, -(-total // per_page))
    return {
        "items": items[(page - 1) * per_page: page * per_page],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "pages": pages,
            "has_next": page < pages,
            "has_prev": page > 1,
        },
    }


@bp.get("/queue")
@roles_required(Role.REVIEWER, Role.ADMIN)
def review_queue():
    """Every submitted report waiting for review, latest submission first."""
    query = Report.query.filter(Report.status == ReportStatus.SUBMITTED)
    if module_slug := request.args.get("module_slug"):
        query = query.filter(Report.module_slug == module_slug)
    return paginate(query.order_by(Report.submitted_at.desc(), Report.id.desc()))


@bp.get("/<int:report_id>")
@roles_required()
def get_report(report_id):
    report = _load(report_id)
    spec = get_module(report.module_slug)

    from core.inspection_sets.routes import prefill_for

    payload = report.to_dict(detail=True)
    payload["module"] = spec.to_dict() if spec else None
    # Values already typed on an earlier unit of the same visit, so the
    # inspector does not enter the client, site, make and model every time.
    payload["prefill"] = prefill_for(report, spec)

    # The other units on the same visit, so the form can offer "next unit"
    # instead of sending the inspector back to a list to find it.
    record = report.inspection_set
    payload["set_units"] = (
        [
            {
                "id": r.id,
                "sequence": r.sequence,
                "report_number": r.report_number,
                "status": r.status.value,
                "is_editable": r.is_editable,
                "identification": ((r.data or {}).get("identification") or {}).get("value")
                if isinstance((r.data or {}).get("identification"), dict)
                else None,
            }
            for r in sorted(record.reports, key=lambda r: r.sequence)
        ]
        if record
        else []
    )
    return {"report": payload}


# --------------------------------------------------------------------- create
@bp.post("")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def create_report():
    data = request.get_json(silent=True) or {}
    require_fields(data, "module_slug", "job_id")

    spec = get_module(data["module_slug"])
    if spec is None:
        raise ApiError(f"Unknown inspection module '{data['module_slug']}'.", 404, "module_not_found")

    job = Job.query.get_or_404(data["job_id"])

    equipment = None
    if data.get("equipment_id"):
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
        equipment_id=equipment.id if equipment else None,
        inspector_id=user.id,
        status=ReportStatus.DRAFT,
        inspection_date=parse_date(data.get("inspection_date"), "inspection_date")
        or job.inspection_date,
        data=data.get("data") or {},
        comments=data.get("comments"),
    )
    db.session.add(report)
    db.session.flush()
    report.log_event(
        ReportEventType.CREATED,
        user,
        note=f"Draft created for {equipment.tag_number}" if equipment else "Draft created",
    )
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
    user = current_user()
    submit_unit(report, spec, user)
    message = "Submitted for review."

    # Once every unit on the visit is in, build the combined document - and its
    # PDF for the reviewer - so the whole visit goes to review as one report.
    record = report.inspection_set
    if record is not None:
        db.session.flush()
        if all(r.status not in (ReportStatus.DRAFT, ReportStatus.RETURNED) for r in record.reports):
            try:
                build_set_documents(record, spec)
                message = (
                    f"Submitted. All {len(record.reports)} {spec.unit_noun_plural} are in - "
                    "the combined report has gone to the reviewer."
                )
            except Exception:  # noqa: BLE001 - never block a submit on the document
                import logging

                logging.getLogger(__name__).exception(
                    "Could not build the combined report for set %s", record.set_number
                )

    db.session.commit()

    return {"report": report.to_dict(detail=True), "message": message}


@bp.post("/<int:report_id>/return")
@roles_required(Role.REVIEWER, Role.ADMIN)
def return_report(report_id):
    report = Report.query.get_or_404(report_id)
    if report.status is not ReportStatus.SUBMITTED:
        raise ApiError("Only submitted reports can be returned.", 409, "invalid_transition")

    data = request.get_json(silent=True) or {}
    require_fields(data, "reason")

    send_back(report, current_user(), data["reason"])
    db.session.commit()

    return {"report": report.to_dict(detail=True), "message": "Returned to the inspector."}


@bp.post("/<int:report_id>/approve")
@roles_required(Role.REVIEWER, Role.ADMIN)
def approve_report(report_id):
    report = Report.query.get_or_404(report_id)
    if report.status is not ReportStatus.SUBMITTED:
        raise ApiError("Only submitted reports can be approved.", 409, "invalid_transition")

    data = request.get_json(silent=True) or {}
    approve(report, current_user(), get_module(report.module_slug), data)
    db.session.commit()

    return {"report": report.to_dict(detail=True), "message": "Approved and released to the client."}


@bp.get("/<int:report_id>/revisions")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def report_revisions(report_id):
    """Every submitted revision, newest first, with what changed in each."""
    from modules.blueprint_factory import resolve_options

    report = _load(report_id)
    spec = get_module(report.module_slug)
    options = resolve_options(spec) if spec else {}
    return {"revisions": revisions.history(report, spec, options), "current": report.revision}


@bp.get("/<int:report_id>/revisions/<int:revision>")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def report_revision(report_id, revision):
    """Everything one past revision held - for viewing it read-only."""
    report = _load(report_id)
    row = next((r for r in report.revisions if r.revision == revision), None)
    if row is None:
        raise ApiError(f"Rev {revision} not found.", 404, "not_found")
    return {
        "revision": row.revision,
        "data": row.data or {},
        "title_page": row.title_page,
        "photo_ids": [p["id"] for p in (row.photos or []) if p.get("source") == "report"],
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "submitted_by": row.submitted_by_name,
        "outcome": row.outcome,
        "review_comment": row.review_comment,
        "reviewed_by": row.reviewed_by_name,
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
    }


@bp.get("/<int:report_id>/revisions/<int:revision>/file")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def report_revision_file(report_id, revision):
    """The PDF (?format=pdf) or Word file of one past revision."""
    report = _load(report_id)
    kind = "pdf" if request.args.get("format") == "pdf" else "docx"
    path = revisions.revision_file(report, revision, kind)
    if path is None:
        raise ApiError(f"Rev {revision} has no {kind.upper()} file.", 404, "not_found")
    return send_file(
        path,
        mimetype="application/pdf" if kind == "pdf" else None,
        as_attachment=request.args.get("download") != "0",
        # Stored names already carry the number and revision, e.g. ELV-SET-...-rev1.pdf.
        download_name=os.path.basename(path),
    )


@bp.get("/<int:report_id>/pdf")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def report_pdf(report_id):
    """The report as a PDF (inline, or ?download=1)."""
    report = _load(report_id)
    return send_file(
        report_pdf_file(report),
        mimetype="application/pdf",
        as_attachment=request.args.get("download") == "1",
        download_name=f"{report.report_number}.pdf",
    )


# ------------------------------------------------- PDF in a new browser tab
# A new tab cannot carry the app's bearer token, so the reviewer is handed a
# short-lived signed link instead. The link names the PDF, so the browser's own
# viewer shows the report number as the tab title.
VIEW_LINK_SALT = "report-pdf-view"
VIEW_LINK_SECONDS = 10 * 60


def _view_signer():
    from flask import current_app
    from itsdangerous import URLSafeTimedSerializer

    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=VIEW_LINK_SALT)


@bp.post("/view-link")
@roles_required(Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)
def create_view_link():
    """A 10-minute link that opens a report's or a visit's PDF in a new tab."""
    from core.inspection_sets.routes import _load as load_set

    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    try:
        target_id = int(data.get("id"))
    except (TypeError, ValueError):
        raise ApiError("Which report?", 422, "validation_error", {"field": "id"})

    # Loading through the normal routes applies the same visibility rules.
    if kind == "set":
        number = load_set(target_id).set_number
    elif kind == "report":
        number = _load(target_id).report_number
    elif kind == "revision":
        report = _load(target_id)
        revision = int(data.get("revision", -1))
        path = revisions.revision_file(report, revision, "pdf")
        if path is None:
            raise ApiError(f"Rev {revision} has no PDF.", 404, "not_found")
        number = os.path.splitext(os.path.basename(path))[0]
    else:
        raise ApiError("kind must be 'set', 'report' or 'revision'.", 422, "validation_error", {"field": "kind"})

    claim = {"k": kind, "i": target_id, "u": current_user().id}
    if kind == "revision":
        claim["r"] = revision
    token = _view_signer().dumps(claim)
    return {"url": f"/api/reports/view/{token}/{number}.pdf", "expires_in": VIEW_LINK_SECONDS}


@bp.get("/view/<token>/<filename>")
def view_pdf(token, filename):
    """Serve the PDF behind a signed view link - no bearer token needed."""
    from itsdangerous import BadSignature, SignatureExpired

    from core.inspection_sets.routes import set_pdf_file
    from models import InspectionSet, User

    try:
        claim = _view_signer().loads(token, max_age=VIEW_LINK_SECONDS)
    except SignatureExpired:
        raise ApiError("This link has expired. Open the report again from the review queue.", 410, "expired")
    except BadSignature:
        raise ApiError("This link is not valid.", 404, "not_found")

    user = db.session.get(User, claim.get("u"))
    if user is None or not user.is_active or user.role is Role.CLIENT:
        raise ApiError("This link is not valid.", 404, "not_found")

    if claim.get("k") == "revision":
        report = db.session.get(Report, claim.get("i"))
        path = revisions.revision_file(report, claim.get("r"), "pdf") if report else None
        if path is None:
            raise ApiError("Report not found.", 404, "not_found")
    elif claim.get("k") == "set":
        record = db.session.get(InspectionSet, claim.get("i"))
        if record is None:
            raise ApiError("Report not found.", 404, "not_found")
        path = set_pdf_file(record)
    else:
        report = db.session.get(Report, claim.get("i"))
        if report is None:
            raise ApiError("Report not found.", 404, "not_found")
        path = report_pdf_file(report)

    return send_file(path, mimetype="application/pdf", as_attachment=False, download_name=filename)


def report_pdf_file(report):
    """Absolute path of the report's PDF, building it if needed."""
    from services.storage import generated_dir

    if not report.docx_path:
        raise ApiError("No document has been generated for this report yet.", 404, "not_generated")
    if not report.pdf_path or not os.path.exists(os.path.join(generated_dir(), report.pdf_path)):
        if not _build_pdf(report):
            raise ApiError(
                "A PDF preview is not available on this server. Download the Word file instead.",
                503,
                "pdf_unavailable",
            )
        db.session.commit()

    return os.path.join(generated_dir(), report.pdf_path)


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


# ------------------------------------------------------------ review actions
def check_ready_to_submit(report, spec):
    """Raise ApiError if required answers or photos are still missing."""
    _assert_required_answered(report, spec)
    _assert_required_photos(report, spec)


def submit_unit(report, spec, user):
    """Submit one report: validate, number the revision, build its documents."""
    check_ready_to_submit(report, spec)

    # The inspector typed the unit's ID rather than picking from the register,
    # so match or create the equipment row now - expiry tracking needs it.
    from core.inspection_sets.routes import resolve_equipment_for

    resolve_equipment_for(report, spec)

    # Rev 0 is the first submission; a corrected, resubmitted report is the next.
    if report.status is ReportStatus.RETURNED:
        report.revision += 1
    report.status = ReportStatus.SUBMITTED
    report.submitted_at = utcnow()
    report.log_event(ReportEventType.SUBMITTED, user, meta={"revision": report.revision})

    _generate(report, spec, user)
    if report.inspection_set is None:
        _build_pdf(report)
    revisions.snapshot(report, user)


def approve(report, user, spec, data):
    """Approve one submitted report and release it to the client."""
    report.status = ReportStatus.APPROVED
    report.reviewer_id = user.id
    report.reviewed_at = utcnow()
    report.return_reason = None

    _apply_validity(report, spec, data)
    _sync_equipment_certification(report)
    report.log_event(ReportEventType.APPROVED, user, note=data.get("note"))

    # Regenerate so the released document carries the reviewer's name.
    _generate(report, spec, user)
    revisions.mark_outcome(report, "approved", user, data.get("note"))


def send_back(report, user, reason):
    """Return one submitted report to its inspector with the reviewer's comments.

    The revision number moves on when the inspector resubmits the correction.
    """
    report.status = ReportStatus.RETURNED
    report.return_reason = reason
    report.reviewer_id = user.id
    report.reviewed_at = utcnow()
    report.log_event(ReportEventType.RETURNED, user, note=reason, meta={"revision": report.revision})
    revisions.mark_outcome(report, "returned", user, reason)


def set_ready_for_review(record):
    """Every unit is in, and at least one is waiting on a reviewer."""
    statuses = [r.status for r in record.reports]
    return (
        bool(statuses)
        and ReportStatus.SUBMITTED in statuses
        and all(s not in (ReportStatus.DRAFT, ReportStatus.RETURNED) for s in statuses)
    )


def build_set_documents(record, spec):
    """The visit's combined Word report, plus its PDF for the preview."""
    from services.pdf_converter import try_docx_to_pdf
    from services.storage import generated_dir

    revision = max((r.revision for r in record.reports), default=0)
    record.docx_path = docx_generator.generate_set(record, spec, revision=revision)
    record.generated_at = utcnow()
    pdf = try_docx_to_pdf(os.path.join(generated_dir(), record.docx_path))
    record.pdf_path = os.path.basename(pdf) if pdf else None
    revisions.attach_set_documents(record)
    return record.pdf_path


def _build_pdf(report):
    """A PDF of the report's current Word document. Returns its name or None."""
    from services.pdf_converter import try_docx_to_pdf
    from services.storage import generated_dir

    if not report.docx_path:
        return None
    pdf = try_docx_to_pdf(os.path.join(generated_dir(), report.docx_path))
    report.pdf_path = os.path.basename(pdf) if pdf else None
    return report.pdf_path


# -------------------------------------------------------------------- helpers
def _generate(report, spec, user):
    from modules.blueprint_factory import resolve_options

    options = resolve_options(spec) if spec else {}
    report.docx_path = docx_generator.generate(report, spec, options)
    report.generated_at = utcnow()
    report.log_event(ReportEventType.GENERATED, user, meta={"file": report.docx_path})


def _assert_required_answered(report, spec):
    """Block submission while required checkpoints are still blank.

    Skipped entirely when ENFORCE_REQUIRED_FIELDS is off, so a partially filled
    report can still be submitted and generated while the form is being tested.
    """
    from flask import current_app

    if not spec or not spec.is_configured:
        return
    if not current_app.config.get("ENFORCE_REQUIRED_FIELDS", False):
        return

    answers = report.data or {}
    missing = []
    for checkpoint in spec.all_unit_fields:
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


def _assert_required_photos(report, spec):
    """Block submission while a required photo slot is still empty."""
    if not spec or not spec.photo_slots:
        return

    filled = {p.checkpoint_key for p in report.photos if p.checkpoint_key}
    missing = [
        {"key": slot.key, "label": slot.label}
        for slot in spec.photo_slots
        if slot.required and slot.key not in filled
    ]

    if missing:
        raise ApiError(
            f"{len(missing)} required photograph(s) are missing: "
            + ", ".join(m["label"] for m in missing),
            422,
            "missing_photos",
            {"missing_photos": missing},
        )
