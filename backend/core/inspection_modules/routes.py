"""The inspection module registry, exposed to the frontend.

The module picker and every inspection form are driven entirely by what this
returns, which is why a new inspection item needs no frontend change.
"""
from flask import Blueprint, request

from extensions import db
from models import Report, ReportStatus, Role
from modules import all_modules, get_module
from modules.blueprint_factory import resolve_options
from utils import roles_required
from utils.decorators import current_user
from utils.errors import ApiError

bp = Blueprint("inspection_modules", __name__)


@bp.get("")
@roles_required()
def list_modules():
    """Every registered module, with the caller's report counts against each."""
    include_disabled = request.args.get("include_disabled") == "true"
    user = current_user()

    query = db.session.query(Report.module_slug, db.func.count(Report.id))
    if user.role is Role.INSPECTOR:
        query = query.filter(Report.inspector_id == user.id)
    counts = dict(query.group_by(Report.module_slug).all())

    pending = dict(
        db.session.query(Report.module_slug, db.func.count(Report.id))
        .filter(Report.status == ReportStatus.SUBMITTED)
        .group_by(Report.module_slug)
        .all()
    )

    modules = []
    for spec in all_modules(include_disabled=include_disabled):
        entry = spec.to_dict(with_sections=False)
        entry["report_count"] = counts.get(spec.slug, 0)
        entry["pending_count"] = pending.get(spec.slug, 0)
        modules.append(entry)

    return {"modules": modules}


@bp.get("/<slug>")
@roles_required()
def get_module_detail(slug):
    spec = get_module(slug)
    if spec is None:
        raise ApiError(f"Unknown inspection module '{slug}'.", 404, "module_not_found")
    return {"module": spec.to_dict()}


@bp.get("/<slug>/form-schema")
@roles_required()
def module_form_schema(slug):
    """Manifest plus the live dropdown options behind every checkpoint.

    Mirrors the per-module blueprint endpoint so the frontend can load a form
    without knowing whether the module ships its own app.py.
    """
    from flask import current_app

    spec = get_module(slug)
    if spec is None:
        raise ApiError(f"Unknown inspection module '{slug}'.", 404, "module_not_found")
    return {
        "module": spec.to_dict(),
        "options": resolve_options(spec),
        # The form shows required markers only when the backend enforces them.
        "enforce_required": current_app.config.get("ENFORCE_REQUIRED_FIELDS", False),
    }
