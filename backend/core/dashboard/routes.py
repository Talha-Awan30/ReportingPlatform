"""Dashboard - the numbers each role lands on after signing in."""
from datetime import date, timedelta

from flask import Blueprint

from extensions import db
from models import Client, Equipment, Job, JobStatus, Report, ReportStatus, Role
from modules import all_modules
from utils import roles_required
from utils.decorators import current_user

bp = Blueprint("dashboard", __name__)


def _scoped_reports():
    user = current_user()
    query = Report.query
    if user.role is Role.CLIENT:
        return query.join(Job, Report.job_id == Job.id).filter(Job.client_id == user.client_id)
    if user.role is Role.INSPECTOR:
        return query.filter(Report.inspector_id == user.id)
    return query


def _scoped_equipment():
    user = current_user()
    query = Equipment.query.filter(Equipment.is_active.is_(True))
    if user.role is Role.CLIENT:
        query = query.filter(Equipment.client_id == user.client_id)
    return query


@bp.get("/summary")
@roles_required()
def summary():
    user = current_user()
    reports = _scoped_reports()

    by_status = {status.value: 0 for status in ReportStatus}
    grouped = reports.with_entities(Report.status, db.func.count(Report.id)).group_by(Report.status)
    for status, count in grouped.all():
        by_status[status.value] = count

    equipment = _scoped_equipment().all()
    certification = {"valid": 0, "upcoming": 0, "due": 0, "critical": 0, "expired": 0, "uncertified": 0}
    for item in equipment:
        certification[item.certification_status] += 1

    cards = {
        "total_reports": reports.count(),
        "pending_review": by_status[ReportStatus.SUBMITTED.value],
        "returned": by_status[ReportStatus.RETURNED.value],
        "awaiting_client": by_status[ReportStatus.APPROVED.value],
        "equipment_tracked": len(equipment),
        "expiring_soon": certification["upcoming"] + certification["due"] + certification["critical"],
        "expired": certification["expired"],
    }

    if user.role in (Role.ADMIN, Role.REVIEWER):
        cards["active_jobs"] = Job.query.filter(
            Job.status.in_([JobStatus.OPEN, JobStatus.IN_PROGRESS])
        ).count()
        cards["active_clients"] = Client.query.filter(Client.is_active.is_(True)).count()

    return {
        "role": user.role.value,
        "cards": cards,
        "by_status": by_status,
        "certification": certification,
    }


@bp.get("/activity")
@roles_required()
def activity():
    """The most recently touched reports, for the dashboard feed."""
    recent = _scoped_reports().order_by(Report.updated_at.desc()).limit(10).all()
    return {"reports": [r.to_dict() for r in recent]}


@bp.get("/expiring")
@roles_required()
def expiring():
    """Equipment whose certification lapses within the next 60 days."""
    horizon = date.today() + timedelta(days=60)
    items = (
        _scoped_equipment()
        .filter(
            Equipment.certificate_expiry_date.isnot(None),
            Equipment.certificate_expiry_date <= horizon,
        )
        .order_by(Equipment.certificate_expiry_date.asc())
        .limit(25)
        .all()
    )
    return {"equipment": [e.to_dict() for e in items]}


@bp.get("/by-module")
@roles_required()
def by_module():
    """Report counts per inspection module - drives the dashboard chart."""
    counts = dict(
        db.session.query(Report.module_slug, db.func.count(Report.id))
        .group_by(Report.module_slug)
        .all()
    )
    return {
        "modules": [
            {
                "slug": spec.slug,
                "name": spec.name,
                "icon": spec.icon,
                "count": counts.get(spec.slug, 0),
                "is_configured": spec.is_configured,
            }
            for spec in all_modules()
        ]
    }


@bp.get("/monthly")
@roles_required(Role.ADMIN, Role.REVIEWER)
def monthly():
    """Reports submitted per month over the last twelve months."""
    since = date.today().replace(day=1) - timedelta(days=365)
    rows = (
        Report.query.with_entities(Report.inspection_date)
        .filter(Report.inspection_date.isnot(None), Report.inspection_date >= since)
        .all()
    )

    # Bucketed in Python so the query stays portable across SQLite and Postgres.
    buckets = {}
    for (inspection_date,) in rows:
        buckets[inspection_date.strftime("%Y-%m")] = buckets.get(inspection_date.strftime("%Y-%m"), 0) + 1

    return {"months": [{"month": m, "count": buckets[m]} for m in sorted(buckets)]}
