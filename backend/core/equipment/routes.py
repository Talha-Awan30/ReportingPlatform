"""Equipment register - saved types and the items inspected against them."""
from flask import Blueprint, request

from extensions import db
from models import Equipment, EquipmentType, Role
from utils import paginate, roles_required
from utils.decorators import current_user
from utils.errors import ApiError
from utils.validation import parse_date, require_fields

bp = Blueprint("equipment", __name__)

EQUIPMENT_FIELDS = [
    "tag_number",
    "serial_number",
    "manufacturer",
    "model",
    "year_of_manufacture",
    "swl",
    "capacity",
    "location",
    "is_active",
    "notes",
    "equipment_type_id",
]
TYPE_FIELDS = ["name", "module_slug", "description", "default_validity_months", "is_active"]


def _visible_equipment():
    user = current_user()
    query = Equipment.query
    if user.role is Role.CLIENT:
        query = query.filter(Equipment.client_id == user.client_id)
    return query


# ---------------------------------------------------------------------- types
@bp.get("/types")
@roles_required()
def list_types():
    query = EquipmentType.query
    if module_slug := request.args.get("module_slug"):
        query = query.filter(EquipmentType.module_slug == module_slug)
    if request.args.get("active_only") == "true":
        query = query.filter(EquipmentType.is_active.is_(True))
    return {"types": [t.to_dict() for t in query.order_by(EquipmentType.name).all()]}


@bp.post("/types")
@roles_required(Role.ADMIN)
def create_type():
    data = request.get_json(silent=True) or {}
    require_fields(data, "name")

    if EquipmentType.query.filter_by(name=data["name"]).first():
        raise ApiError(f"Equipment type '{data['name']}' already exists.", 409, "duplicate_type")

    equipment_type = EquipmentType().update_from(data, TYPE_FIELDS)
    db.session.add(equipment_type)
    db.session.commit()
    return {"type": equipment_type.to_dict()}, 201


@bp.patch("/types/<int:type_id>")
@roles_required(Role.ADMIN)
def update_type(type_id):
    equipment_type = EquipmentType.query.get_or_404(type_id)
    equipment_type.update_from(request.get_json(silent=True) or {}, TYPE_FIELDS)
    db.session.commit()
    return {"type": equipment_type.to_dict()}


# ------------------------------------------------------------------ equipment
@bp.get("")
@roles_required()
def list_equipment():
    query = _visible_equipment()

    if client_id := request.args.get("client_id", type=int):
        query = query.filter(Equipment.client_id == client_id)
    if type_id := request.args.get("equipment_type_id", type=int):
        query = query.filter(Equipment.equipment_type_id == type_id)
    if module_slug := request.args.get("module_slug"):
        query = query.join(EquipmentType).filter(EquipmentType.module_slug == module_slug)
    if request.args.get("active_only") == "true":
        query = query.filter(Equipment.is_active.is_(True))

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                Equipment.tag_number.ilike(like),
                Equipment.serial_number.ilike(like),
                Equipment.location.ilike(like),
            )
        )

    # Certification filter drives the "due for renewal" views.
    if status := request.args.get("certification_status"):
        items = [e for e in query.all() if e.certification_status == status]
        return {
            "items": [e.to_dict() for e in items],
            "meta": {"page": 1, "per_page": len(items), "total": len(items), "pages": 1,
                     "has_next": False, "has_prev": False},
        }

    return paginate(query.order_by(Equipment.tag_number))


@bp.get("/<int:equipment_id>")
@roles_required()
def get_equipment(equipment_id):
    equipment = _visible_equipment().filter(Equipment.id == equipment_id).first()
    if equipment is None:
        raise ApiError("Equipment not found.", 404, "not_found")

    data = equipment.to_dict()
    data["reports"] = [
        r.to_dict()
        for r in equipment.reports.order_by(db.desc("inspection_date")).limit(50).all()
    ]
    return {"equipment": data}


@bp.post("")
@roles_required(Role.ADMIN, Role.INSPECTOR, Role.REVIEWER)
def create_equipment():
    data = request.get_json(silent=True) or {}
    require_fields(data, "client_id", "equipment_type_id", "tag_number")
    EquipmentType.query.get_or_404(data["equipment_type_id"])

    exists = Equipment.query.filter_by(
        client_id=data["client_id"], tag_number=data["tag_number"]
    ).first()
    if exists:
        raise ApiError(
            f"Tag '{data['tag_number']}' already exists for this client.", 409, "duplicate_tag"
        )

    equipment = Equipment(client_id=data["client_id"]).update_from(data, EQUIPMENT_FIELDS)
    equipment.last_inspection_date = parse_date(data.get("last_inspection_date"), "last_inspection_date")
    equipment.certificate_expiry_date = parse_date(
        data.get("certificate_expiry_date"), "certificate_expiry_date"
    )

    db.session.add(equipment)
    db.session.commit()
    return {"equipment": equipment.to_dict()}, 201


@bp.patch("/<int:equipment_id>")
@roles_required(Role.ADMIN, Role.INSPECTOR, Role.REVIEWER)
def update_equipment(equipment_id):
    equipment = Equipment.query.get_or_404(equipment_id)
    data = request.get_json(silent=True) or {}

    equipment.update_from(data, EQUIPMENT_FIELDS)
    for field in ("last_inspection_date", "certificate_expiry_date"):
        if field in data:
            setattr(equipment, field, parse_date(data[field], field))

    db.session.commit()
    return {"equipment": equipment.to_dict()}


@bp.delete("/<int:equipment_id>")
@roles_required(Role.ADMIN)
def deactivate_equipment(equipment_id):
    equipment = Equipment.query.get_or_404(equipment_id)
    equipment.is_active = False
    db.session.commit()
    return {"message": f"{equipment.tag_number} deactivated."}
