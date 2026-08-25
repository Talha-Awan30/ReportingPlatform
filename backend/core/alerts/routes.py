"""Certification expiry alerts - history and a manual scan trigger."""
from flask import Blueprint, request

from models import Equipment, ExpiryAlert, Role
from services import expiry
from utils import paginate, roles_required
from utils.decorators import current_user

bp = Blueprint("alerts", __name__)


@bp.get("")
@roles_required()
def list_alerts():
    user = current_user()
    query = ExpiryAlert.query.join(Equipment, ExpiryAlert.equipment_id == Equipment.id)

    if user.role is Role.CLIENT:
        query = query.filter(Equipment.client_id == user.client_id)
    if client_id := request.args.get("client_id", type=int):
        query = query.filter(Equipment.client_id == client_id)
    if equipment_id := request.args.get("equipment_id", type=int):
        query = query.filter(ExpiryAlert.equipment_id == equipment_id)
    if status := request.args.get("delivery_status"):
        query = query.filter(ExpiryAlert.delivery_status == status)

    return paginate(query.order_by(ExpiryAlert.created_at.desc()))


@bp.get("/thresholds")
@roles_required()
def thresholds():
    from flask import current_app

    return {
        "thresholds": current_app.config["ALERT_THRESHOLDS"],
        "escalates_after_expiry": True,
    }


@bp.post("/scan")
@roles_required(Role.ADMIN)
def run_scan():
    """Run the expiry scan now instead of waiting for the nightly job.

    Pass {"dry_run": true} to see what would be raised without sending mail.
    """
    data = request.get_json(silent=True) or {}
    summary = expiry.scan_and_send(dry_run=bool(data.get("dry_run")))
    return {"summary": summary, "message": "Expiry scan complete."}
