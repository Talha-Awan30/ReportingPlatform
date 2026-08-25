"""Dropdown master lists - the approved wording behind every checkpoint."""
from flask import Blueprint, request

from extensions import db
from models import DropdownList, DropdownOption, Role
from utils import roles_required
from utils.errors import ApiError
from utils.validation import require_fields

bp = Blueprint("masterlists", __name__)

LIST_FIELDS = ["key", "name", "description", "module_slug", "is_active"]
OPTION_FIELDS = ["value", "label", "report_text", "severity", "sort_order", "is_default", "is_active"]


@bp.get("")
@roles_required()
def list_lists():
    query = DropdownList.query

    if module_slug := request.args.get("module_slug"):
        # A module sees its own lists plus the global ones.
        query = query.filter(
            db.or_(DropdownList.module_slug == module_slug, DropdownList.module_slug.is_(None))
        )
    elif request.args.get("global_only") == "true":
        query = query.filter(DropdownList.module_slug.is_(None))

    if request.args.get("active_only") == "true":
        query = query.filter(DropdownList.is_active.is_(True))

    lists = query.order_by(DropdownList.module_slug.nullsfirst(), DropdownList.name).all()
    return {"lists": [dl.to_dict() for dl in lists]}


@bp.get("/<int:list_id>")
@roles_required()
def get_list(list_id):
    return {"list": DropdownList.query.get_or_404(list_id).to_dict()}


@bp.post("")
@roles_required(Role.ADMIN)
def create_list():
    data = request.get_json(silent=True) or {}
    require_fields(data, "key", "name")

    key = str(data["key"]).strip().lower().replace(" ", "_")
    module_slug = data.get("module_slug") or None

    if DropdownList.query.filter_by(key=key, module_slug=module_slug).first():
        scope = module_slug or "global"
        raise ApiError(f"A '{key}' list already exists in the {scope} scope.", 409, "duplicate_key")

    dropdown = DropdownList().update_from(data, LIST_FIELDS)
    dropdown.key = key
    dropdown.module_slug = module_slug
    db.session.add(dropdown)
    db.session.flush()

    for index, option in enumerate(data.get("options", [])):
        row = DropdownOption(list_id=dropdown.id, sort_order=index).update_from(option, OPTION_FIELDS)
        db.session.add(row)

    db.session.commit()
    return {"list": dropdown.to_dict()}, 201


@bp.patch("/<int:list_id>")
@roles_required(Role.ADMIN)
def update_list(list_id):
    dropdown = DropdownList.query.get_or_404(list_id)
    dropdown.update_from(request.get_json(silent=True) or {}, ["name", "description", "is_active"])
    db.session.commit()
    return {"list": dropdown.to_dict()}


@bp.delete("/<int:list_id>")
@roles_required(Role.ADMIN)
def delete_list(list_id):
    dropdown = DropdownList.query.get_or_404(list_id)
    db.session.delete(dropdown)
    db.session.commit()
    return {"message": f"'{dropdown.name}' deleted."}


# -------------------------------------------------------------------- options
@bp.post("/<int:list_id>/options")
@roles_required(Role.ADMIN)
def create_option(list_id):
    dropdown = DropdownList.query.get_or_404(list_id)
    data = request.get_json(silent=True) or {}
    require_fields(data, "value", "label")

    if any(o.value == data["value"] for o in dropdown.options):
        raise ApiError(f"'{data['value']}' is already an option in this list.", 409, "duplicate_option")

    option = DropdownOption(list_id=dropdown.id, sort_order=len(dropdown.options)).update_from(
        data, OPTION_FIELDS
    )
    db.session.add(option)
    db.session.commit()
    return {"option": option.to_dict()}, 201


@bp.patch("/<int:list_id>/options/<int:option_id>")
@roles_required(Role.ADMIN)
def update_option(list_id, option_id):
    option = DropdownOption.query.filter_by(id=option_id, list_id=list_id).first_or_404()
    option.update_from(request.get_json(silent=True) or {}, OPTION_FIELDS)
    db.session.commit()
    return {"option": option.to_dict()}


@bp.delete("/<int:list_id>/options/<int:option_id>")
@roles_required(Role.ADMIN)
def delete_option(list_id, option_id):
    option = DropdownOption.query.filter_by(id=option_id, list_id=list_id).first_or_404()
    db.session.delete(option)
    db.session.commit()
    return {"message": "Option removed."}


@bp.post("/<int:list_id>/reorder")
@roles_required(Role.ADMIN)
def reorder_options(list_id):
    """Accepts {"order": [option_id, ...]} in the new display sequence."""
    DropdownList.query.get_or_404(list_id)
    data = request.get_json(silent=True) or {}
    require_fields(data, "order")

    for position, option_id in enumerate(data["order"]):
        option = DropdownOption.query.filter_by(id=option_id, list_id=list_id).first()
        if option:
            option.sort_order = position

    db.session.commit()
    return {"message": "Order saved."}
