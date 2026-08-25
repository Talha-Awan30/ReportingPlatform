"""Jobs - the site visit a set of reports belongs to."""
from flask import Blueprint, request

from extensions import db
from models import Client, Job, JobStatus, Role
from services.numbering import next_job_number
from utils import paginate, roles_required
from utils.decorators import current_user
from utils.errors import ApiError
from utils.validation import parse_date, parse_enum, require_fields

bp = Blueprint("jobs", __name__)

JOB_FIELDS = ["site_name", "site_address", "purchase_order", "notes", "contact_id", "team_lead_id"]


def _visible_jobs():
    user = current_user()
    query = Job.query
    if user.role is Role.CLIENT:
        query = query.filter(Job.client_id == user.client_id)
    return query


@bp.get("")
@roles_required()
def list_jobs():
    query = _visible_jobs()

    if client_id := request.args.get("client_id", type=int):
        query = query.filter(Job.client_id == client_id)
    if status := parse_enum(JobStatus, request.args.get("status"), "status"):
        query = query.filter(Job.status == status)

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.join(Client, Job.client_id == Client.id).filter(
            db.or_(Job.job_number.ilike(like), Job.site_name.ilike(like), Client.name.ilike(like))
        )

    return paginate(query.order_by(Job.inspection_date.desc().nullslast(), Job.id.desc()))


@bp.get("/<int:job_id>")
@roles_required()
def get_job(job_id):
    job = _visible_jobs().filter(Job.id == job_id).first()
    if job is None:
        raise ApiError("Job not found.", 404, "not_found")

    data = job.to_dict()
    data["reports"] = [r.to_dict() for r in job.reports.all()]
    return {"job": data}


@bp.post("")
@roles_required(Role.ADMIN, Role.INSPECTOR, Role.REVIEWER)
def create_job():
    data = request.get_json(silent=True) or {}
    require_fields(data, "client_id")
    Client.query.get_or_404(data["client_id"])

    job_number = (data.get("job_number") or "").strip() or next_job_number()
    if Job.query.filter_by(job_number=job_number).first():
        raise ApiError(f"Job number '{job_number}' already exists.", 409, "duplicate_job_number")

    job = Job(
        job_number=job_number,
        client_id=data["client_id"],
        inspection_date=parse_date(data.get("inspection_date"), "inspection_date"),
        status=parse_enum(JobStatus, data.get("status"), "status") or JobStatus.OPEN,
        created_by_id=current_user().id,
    ).update_from(data, JOB_FIELDS)

    db.session.add(job)
    db.session.commit()
    return {"job": job.to_dict()}, 201


@bp.patch("/<int:job_id>")
@roles_required(Role.ADMIN, Role.INSPECTOR, Role.REVIEWER)
def update_job(job_id):
    job = Job.query.get_or_404(job_id)
    data = request.get_json(silent=True) or {}

    job.update_from(data, JOB_FIELDS)
    if "inspection_date" in data:
        job.inspection_date = parse_date(data["inspection_date"], "inspection_date")
    if status := parse_enum(JobStatus, data.get("status"), "status"):
        job.status = status

    db.session.commit()
    return {"job": job.to_dict()}


@bp.delete("/<int:job_id>")
@roles_required(Role.ADMIN)
def cancel_job(job_id):
    job = Job.query.get_or_404(job_id)
    if job.reports.count():
        job.status = JobStatus.CANCELLED
        db.session.commit()
        return {"message": f"{job.job_number} cancelled (it has reports, so it was kept)."}

    db.session.delete(job)
    db.session.commit()
    return {"message": f"{job.job_number} deleted."}


@bp.get("/next-number")
@roles_required(Role.ADMIN, Role.INSPECTOR, Role.REVIEWER)
def peek_next_number():
    """Lets the new-job form prefill the number it is about to get."""
    return {"job_number": next_job_number()}
