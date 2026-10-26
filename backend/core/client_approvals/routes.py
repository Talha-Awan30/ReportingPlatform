"""Admin review of new-client requests.

Only open requests (status `pending` and not past `expires_at`) are listed,
counted or actionable. Approving issues a FRESH CL- code at that moment - not
one reserved at request time, which may have been taken since.
"""
import logging

from flask import Blueprint

from core.clients.routes import name_taken, next_client_code
from extensions import db
from models import Client, PendingClient, Role
from models.base import utcnow
from utils import roles_required
from utils.decorators import current_user
from utils.errors import ApiError

log = logging.getLogger(__name__)

bp = Blueprint("client_approvals", __name__)


def _open_requests():
    return PendingClient.query.filter(
        PendingClient.status == "pending", PendingClient.expires_at > utcnow()
    )


def _load_actionable(pending_id):
    pending = db.session.get(PendingClient, pending_id)
    if pending is None:
        raise ApiError("Client request not found.", 404, "not_found")
    if pending.status != "pending":
        raise ApiError(f"This request has already been {pending.status}.", 409, "already_decided")
    if not pending.is_open:
        raise ApiError("This request has expired.", 409, "expired")
    return pending


@bp.get("")
@roles_required(Role.ADMIN)
def list_requests():
    rows = _open_requests().order_by(PendingClient.created_at.desc(), PendingClient.id.desc())
    return {"pending": [p.to_dict() for p in rows]}


@bp.get("/count")
@roles_required(Role.ADMIN)
def count_requests():
    """For the navbar badge."""
    return {"count": _open_requests().count()}


@bp.post("/<int:pending_id>/approve")
@roles_required(Role.ADMIN)
def approve_request(pending_id):
    pending = _load_actionable(pending_id)
    if name_taken(pending.client_name):
        raise ApiError("A client with this name already exists.", 409, "duplicate_client")

    client = Client(
        code=next_client_code(),
        name=pending.client_name,
        sbu=pending.sbu,
        sub_sector=pending.sub_sector,
    )
    db.session.add(client)
    db.session.flush()

    pending.status = "approved"
    pending.client_id = client.id
    pending.decided_by = current_user().full_name
    pending.decided_at = utcnow()
    db.session.commit()

    log.info("client_approved: %s as %s by %s", client.name, client.code, pending.decided_by)
    return {"client": client.to_option()}


@bp.post("/<int:pending_id>/reject")
@roles_required(Role.ADMIN)
def reject_request(pending_id):
    pending = _load_actionable(pending_id)
    pending.status = "rejected"
    pending.decided_by = current_user().full_name
    pending.decided_at = utcnow()
    db.session.commit()

    log.info("client_rejected: %s by %s", pending.client_name, pending.decided_by)
    return {"message": f"{pending.client_name} rejected."}
