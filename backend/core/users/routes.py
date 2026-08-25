"""User administration - Inspector, Reviewer, Client and Admin accounts."""
import secrets

from flask import Blueprint, request

from extensions import db
from models import Role, User
from utils import paginate, roles_required
from utils.errors import ApiError
from utils.validation import parse_enum, require_fields

bp = Blueprint("users", __name__)

USER_FIELDS = ["full_name", "email", "phone", "job_title", "is_active", "client_id"]


@bp.get("")
@roles_required(Role.ADMIN)
def list_users():
    query = User.query

    if role := parse_enum(Role, request.args.get("role"), "role"):
        query = query.filter(User.role == role)
    if client_id := request.args.get("client_id", type=int):
        query = query.filter(User.client_id == client_id)
    if request.args.get("active_only") == "true":
        query = query.filter(User.is_active.is_(True))

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(User.full_name.ilike(like), User.employee_id.ilike(like), User.email.ilike(like))
        )

    return paginate(query.order_by(User.full_name))


@bp.get("/assignable")
@roles_required(Role.ADMIN, Role.INSPECTOR, Role.REVIEWER)
def assignable_users():
    """Staff who can be picked as a team lead on a job."""
    users = (
        User.query.filter(
            User.is_active.is_(True),
            User.role.in_([Role.ADMIN, Role.INSPECTOR, Role.REVIEWER]),
        )
        .order_by(User.full_name)
        .all()
    )
    return {"users": [{"id": u.id, "full_name": u.full_name, "role": u.role.value} for u in users]}


@bp.get("/<int:user_id>")
@roles_required(Role.ADMIN)
def get_user(user_id):
    return {"user": User.query.get_or_404(user_id).to_dict()}


@bp.post("")
@roles_required(Role.ADMIN)
def create_user():
    data = request.get_json(silent=True) or {}
    require_fields(data, "employee_id", "email", "full_name", "role")

    role = parse_enum(Role, data["role"], "role")
    if role is Role.CLIENT and not data.get("client_id"):
        raise ApiError("A client user must be linked to a client.", 422, "client_required")

    employee_id = str(data["employee_id"]).strip()
    email = str(data["email"]).strip().lower()

    if User.query.filter_by(employee_id=employee_id).first():
        raise ApiError(f"Employee ID '{employee_id}' is already registered.", 409, "duplicate_employee_id")
    if User.query.filter_by(email=email).first():
        raise ApiError(f"'{email}' is already registered.", 409, "duplicate_email")

    # A generated password is returned once so the admin can pass it on.
    password = data.get("password") or secrets.token_urlsafe(9)
    user = User(employee_id=employee_id, role=role).update_from(data, USER_FIELDS)
    user.email = email
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    payload = {"user": user.to_dict()}
    if not data.get("password"):
        payload["generated_password"] = password
    return payload, 201


@bp.patch("/<int:user_id>")
@roles_required(Role.ADMIN)
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    if "email" in data:
        data["email"] = str(data["email"]).strip().lower()
        clash = User.query.filter(User.email == data["email"], User.id != user.id).first()
        if clash:
            raise ApiError(f"'{data['email']}' is already registered.", 409, "duplicate_email")

    user.update_from(data, USER_FIELDS)
    if role := parse_enum(Role, data.get("role"), "role"):
        if role is Role.CLIENT and not (data.get("client_id") or user.client_id):
            raise ApiError("A client user must be linked to a client.", 422, "client_required")
        user.role = role

    db.session.commit()
    return {"user": user.to_dict()}


@bp.post("/<int:user_id>/reset-password")
@roles_required(Role.ADMIN)
def reset_password(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    password = data.get("password") or secrets.token_urlsafe(9)
    user.set_password(password)
    db.session.commit()

    payload = {"message": f"Password reset for {user.full_name}."}
    if not data.get("password"):
        payload["generated_password"] = password
    return payload


@bp.delete("/<int:user_id>")
@roles_required(Role.ADMIN)
def deactivate_user(user_id):
    from utils.decorators import current_user

    user = User.query.get_or_404(user_id)
    if user.id == current_user().id:
        raise ApiError("You cannot deactivate your own account.", 409, "self_deactivate")

    user.is_active = False
    db.session.commit()
    return {"message": f"{user.full_name} deactivated."}


@bp.get("/roles")
@roles_required(Role.ADMIN)
def list_roles():
    return {"roles": [{"value": r.value, "label": r.label} for r in Role]}
