"""Authentication - sign in, refresh, profile, password change."""
import mimetypes
import os

from flask import Blueprint, request, send_file
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required

from extensions import db
from models import User
from utils.decorators import current_user
from utils.errors import ApiError
from utils.validation import require_fields

bp = Blueprint("auth", __name__)


def _tokens(user):
    identity = str(user.id)
    claims = {"role": user.role.value, "name": user.full_name, "client_id": user.client_id}
    return {
        "access_token": create_access_token(identity=identity, additional_claims=claims),
        "refresh_token": create_refresh_token(identity=identity),
    }


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    require_fields(data, "employee_id", "password")

    identifier = str(data["employee_id"]).strip()
    user = User.query.filter(
        db.or_(User.employee_id == identifier, User.email == identifier.lower())
    ).first()

    # Deliberately vague - never reveal whether the account exists.
    if user is None or not user.check_password(data["password"]):
        raise ApiError("Invalid Employee ID or password.", 401, "invalid_credentials")
    if not user.is_active:
        raise ApiError("This account has been disabled. Contact your administrator.", 403, "account_disabled")

    user.touch_login()
    db.session.commit()

    return {"user": user.to_dict(), **_tokens(user)}


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    user = User.query.get(int(get_jwt_identity()))
    if user is None or not user.is_active:
        raise ApiError("Account not found or disabled.", 401, "account_inactive")
    return {"access_token": _tokens(user)["access_token"]}


@bp.get("/me")
def me():
    return {"user": current_user().to_dict()}


@bp.patch("/me")
def update_me():
    user = current_user()
    data = request.get_json(silent=True) or {}
    user.update_from(data, ["full_name", "phone", "job_title"])
    db.session.commit()
    return {"user": user.to_dict()}


# ---------------------------------------------------------------- signature
@bp.get("/me/signature")
def my_signature():
    from services.storage import signature_path

    path = signature_path(current_user())
    if not path or not os.path.exists(path):
        raise ApiError("No signature on your profile yet.", 404, "not_found")
    return send_file(path, mimetype=mimetypes.guess_type(path)[0] or "image/png", max_age=0)


@bp.post("/me/signature")
def upload_my_signature():
    """Add or replace the signature (with stamp) on your own profile."""
    from services.storage import delete_signature_file, save_signature

    user = current_user()
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        raise ApiError("Choose a picture of your signature.", 422, "file_required")
    stored = save_signature(upload, user.id)
    delete_signature_file(user)
    user.signature_filename = stored["filename"]
    db.session.commit()
    return {"user": user.to_dict(), "message": "Signature saved."}


@bp.delete("/me/signature")
def delete_my_signature():
    from services.storage import delete_signature_file

    user = current_user()
    delete_signature_file(user)
    user.signature_filename = None
    db.session.commit()
    return {"user": user.to_dict(), "message": "Signature removed."}


@bp.post("/change-password")
def change_password():
    user = current_user()
    data = request.get_json(silent=True) or {}
    require_fields(data, "current_password", "new_password")

    if not user.check_password(data["current_password"]):
        raise ApiError("Your current password is incorrect.", 400, "invalid_password")
    if len(data["new_password"]) < 8:
        raise ApiError("The new password must be at least 8 characters.", 422, "weak_password")

    user.set_password(data["new_password"])
    db.session.commit()
    return {"message": "Password updated."}


@bp.post("/logout")
def logout():
    """Tokens are stateless; the client discards them. Here for symmetry."""
    return {"message": "Signed out."}
