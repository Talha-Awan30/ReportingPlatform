"""Builds the standard blueprint every inspection module gets for free.

A module's `app.py` only needs:

    from modules.blueprint_factory import make_blueprint
    from .module import MODULE

    blueprint = make_blueprint(MODULE)

and it immediately serves its manifest, its resolved dropdown options and its
own report statistics. Anything genuinely specific to that inspection item is
added to the returned blueprint by the module itself.
"""
from flask import Blueprint

from extensions import db
from models import DropdownList, Report, ReportStatus
from utils import roles_required
from utils.decorators import current_user


def resolve_options(spec):
    """Collect the option lists every dropdown checkpoint in `spec` refers to.

    A module-scoped list wins over the global list of the same key, so a module
    can override standard wording without affecting the others.
    """
    # option_keys covers the title page, the particulars table, the check-list
    # and the conclusion - not just the check-list.
    keys = spec.option_keys
    if not keys:
        return {}

    lists = (
        DropdownList.query.filter(
            DropdownList.key.in_(keys),
            DropdownList.is_active.is_(True),
            db.or_(
                DropdownList.module_slug == spec.slug,
                DropdownList.module_slug.is_(None),
            ),
        )
        .order_by(DropdownList.module_slug.is_(None))  # module-scoped lists first
        .all()
    )

    resolved = {}
    for dropdown in lists:
        resolved.setdefault(
            dropdown.key,
            {
                "key": dropdown.key,
                "name": dropdown.name,
                "scope": dropdown.module_slug or "global",
                "options": [o.to_dict() for o in dropdown.options if o.is_active],
            },
        )
    return resolved


def make_blueprint(spec, name=None):
    """Return a Blueprint pre-wired with the endpoints shared by all modules."""
    bp = Blueprint(
        name or f"module_{spec.slug}",
        spec.package or __name__,
        template_folder="templates",
        static_folder="static",
    )

    @bp.get("/manifest")
    @roles_required()
    def manifest():
        """The form definition the frontend renders."""
        return {"module": spec.to_dict()}

    @bp.get("/form-schema")
    @roles_required()
    def form_schema():
        """Manifest plus the live dropdown options behind every checkpoint."""
        from flask import current_app

        return {
            "module": spec.to_dict(),
            "options": resolve_options(spec),
            # The form shows required markers only when the backend enforces them.
            "enforce_required": current_app.config.get("ENFORCE_REQUIRED_FIELDS", False),
        }

    @bp.get("/stats")
    @roles_required()
    def stats():
        """Report counts for this module, scoped to what the caller may see."""
        user = current_user()
        query = Report.query.filter(Report.module_slug == spec.slug)
        query = _scope_to_user(query, user)

        counts = dict(
            db.session.query(Report.status, db.func.count(Report.id))
            .filter(Report.module_slug == spec.slug)
            .group_by(Report.status)
            .all()
        )
        return {
            "module": spec.slug,
            "total": query.count(),
            "by_status": {status.value: counts.get(status, 0) for status in ReportStatus},
        }

    return bp


def _scope_to_user(query, user):
    """Narrow a report query to the rows this user is allowed to see."""
    from models import Job, Role

    if user.role is Role.CLIENT:
        return query.join(Job, Report.job_id == Job.id).filter(Job.client_id == user.client_id)
    if user.role is Role.INSPECTOR:
        return query.filter(Report.inspector_id == user.id)
    return query
