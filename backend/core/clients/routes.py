"""Clients and their contacts, plus requests for clients not yet approved.

Client names come only from the approved list. A user who cannot find a client
requests it; an admin approves it (see core.client_approvals), which is when it
gets its CL- code and appears in every picker.
"""
import logging
import re

from flask import Blueprint, request
from sqlalchemy import func

from extensions import db
from models import Client, ClientContact, PendingClient, Role
from models.base import utcnow
from models.client import SBU_OPTIONS, normalise_name
from utils import paginate, roles_required
from utils.decorators import current_user
from utils.errors import ApiError
from utils.validation import require_fields

log = logging.getLogger(__name__)

bp = Blueprint("clients", __name__)

STAFF = (Role.INSPECTOR, Role.REVIEWER, Role.ADMIN)

CLIENT_FIELDS = ["industry", "address", "city", "country", "is_active", "notes"]


# ---------------------------------------------------------------- helpers
def name_taken(name, exclude_id=None):
    """True when an approved client already has this name (case/space-blind)."""
    query = Client.query.filter(func.lower(func.trim(Client.name)) == normalise_name(name).lower())
    if exclude_id is not None:
        query = query.filter(Client.id != exclude_id)
    return db.session.query(query.exists()).scalar()


def next_client_code():
    """CL-0001 style. Codes are never reused, so gaps are normal."""
    highest = 0
    for (code,) in db.session.query(Client.code).filter(Client.code.like("CL-%")):
        match = re.fullmatch(r"CL-(\d+)", code or "")
        if match:
            highest = max(highest, int(match.group(1)))
    return f"CL-{highest + 1:04d}"


def read_client_identity(data, partial=False):
    """Validate {name, sbu, sub_sector}. With `partial`, absent keys are skipped."""
    values = {}
    if not partial or "name" in data:
        name = normalise_name(data.get("name"))
        if not name:
            raise ApiError("Client name is required.", 422, "validation_error", {"field": "name"})
        values["name"] = name
    if not partial or "sbu" in data:
        sbu = (data.get("sbu") or "").strip()
        if not sbu:
            raise ApiError("SBU is required.", 422, "validation_error", {"field": "sbu"})
        if sbu not in SBU_OPTIONS:
            raise ApiError("Invalid SBU.", 422, "validation_error", {"field": "sbu"})
        values["sbu"] = sbu
    if not partial or "sub_sector" in data:
        values["sub_sector"] = (data.get("sub_sector") or "").strip() or None
    return values
CONTACT_FIELDS = ["name", "email", "phone", "position", "receives_alerts", "is_primary"]


def _visible_clients():
    """Client users only ever see their own organisation."""
    user = current_user()
    query = Client.query
    if user.role is Role.CLIENT:
        query = query.filter(Client.id == user.client_id)
    return query


@bp.get("")
@roles_required()
def list_clients():
    query = _visible_clients()

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(Client.name.ilike(like), Client.code.ilike(like), Client.sub_sector.ilike(like))
        )

    if sbu := request.args.get("sbu"):
        query = query.filter(Client.sbu == sbu)
    if sub_sector := request.args.get("sub_sector"):
        query = query.filter(Client.sub_sector == sub_sector)
    if request.args.get("active_only") == "true":
        query = query.filter(Client.is_active.is_(True))
    elif request.args.get("inactive_only") == "true":
        query = query.filter(Client.is_active.is_(False))

    return paginate(query.order_by(func.lower(Client.name)))


@bp.get("/directory")
@roles_required(*STAFF)
def client_directory():
    """Every client in one light list, for the searchable picker.

    About 2,300 rows; the picker filters them in the browser. Inactive clients
    are included (flagged) so a record that still points at one can show its
    name - the picker only offers the active ones.
    """
    clients = Client.query.order_by(func.lower(Client.name)).all()
    return {"clients": [c.to_option() for c in clients]}


@bp.get("/sbu-options")
@roles_required()
def sbu_options():
    return {"sbu_options": SBU_OPTIONS}


@bp.get("/sbu-subsector-map")
@roles_required()
def sbu_subsector_map():
    """{sbu: [sub sector, ...]} - built from the clients, not hard-coded, so a
    newly approved sub sector becomes an option automatically."""
    rows = (
        db.session.query(Client.sbu, Client.sub_sector)
        .filter(Client.sbu.isnot(None), Client.sub_sector.isnot(None), Client.sub_sector != "")
        .distinct()
        .order_by(Client.sbu, Client.sub_sector)
    )
    mapping = {sbu: [] for sbu in SBU_OPTIONS}
    for sbu, sub_sector in rows:
        mapping.setdefault(sbu, []).append(sub_sector)
    return {"map": mapping}


@bp.post("/request")
@roles_required(*STAFF)
def request_client():
    """Ask for a client that is not on the approved list yet."""
    values = read_client_identity(request.get_json(silent=True) or {})
    name = values["name"]

    if name_taken(name):
        raise ApiError("This client already exists in the approved list.", 409, "duplicate_client")
    open_request = PendingClient.query.filter(
        PendingClient.status == "pending",
        PendingClient.expires_at > utcnow(),
        func.lower(func.trim(PendingClient.client_name)) == name.lower(),
    ).first()
    if open_request:
        raise ApiError(
            "A request for this client is already awaiting approval.", 409, "duplicate_request"
        )

    user = current_user()
    pending = PendingClient(
        client_name=name,
        sbu=values["sbu"],
        sub_sector=values["sub_sector"],
        requested_by=user.full_name,
        requested_by_user_id=user.id,
    )
    db.session.add(pending)
    db.session.commit()
    log.info("client_requested: %s (SBU %s) by %s", name, values["sbu"], user.full_name)
    return {"request": pending.to_dict()}, 201


@bp.get("/<int:client_id>")
@roles_required()
def get_client(client_id):
    client = _visible_clients().filter(Client.id == client_id).first()
    if client is None:
        raise ApiError("Client not found.", 404, "not_found")
    return {"client": client.to_dict(with_contacts=True)}


@bp.post("")
@roles_required(Role.ADMIN)
def create_client():
    data = request.get_json(silent=True) or {}
    values = read_client_identity(data)
    if name_taken(values["name"]):
        raise ApiError("A client with this name already exists.", 409, "duplicate_client")

    # The code is assigned unless the admin gives one explicitly.
    code = str(data.get("code") or "").strip().upper() or next_client_code()
    if Client.query.filter_by(code=code).first():
        raise ApiError(f"Client code '{code}' is already in use.", 409, "duplicate_code")

    client = Client(code=code, **values).update_from(data, CLIENT_FIELDS)
    db.session.add(client)
    db.session.flush()

    for contact in data.get("contacts", []):
        db.session.add(ClientContact(client_id=client.id).update_from(contact, CONTACT_FIELDS))

    db.session.commit()
    return {"client": client.to_dict(with_contacts=True)}, 201


@bp.patch("/<int:client_id>")
@roles_required(Role.ADMIN)
def update_client(client_id):
    client = Client.query.get_or_404(client_id)
    data = request.get_json(silent=True) or {}
    values = read_client_identity(data, partial=True)
    if "name" in values and name_taken(values["name"], exclude_id=client.id):
        raise ApiError("Another client already has this name.", 409, "duplicate_client")
    for key, value in values.items():
        setattr(client, key, value)
    client.update_from(data, CLIENT_FIELDS)
    db.session.commit()
    return {"client": client.to_dict(with_contacts=True)}


@bp.delete("/<int:client_id>")
@roles_required(Role.ADMIN)
def deactivate_client(client_id):
    """Soft delete - jobs and reports must keep referring to the client."""
    client = Client.query.get_or_404(client_id)
    client.is_active = False
    db.session.commit()
    return {"message": f"{client.name} deactivated."}


# ------------------------------------------------------------------- contacts
@bp.get("/<int:client_id>/contacts")
@roles_required()
def list_contacts(client_id):
    client = _visible_clients().filter(Client.id == client_id).first()
    if client is None:
        raise ApiError("Client not found.", 404, "not_found")
    return {"contacts": [c.to_dict() for c in client.contacts]}


@bp.post("/<int:client_id>/contacts")
@roles_required(Role.ADMIN)
def create_contact(client_id):
    Client.query.get_or_404(client_id)
    data = request.get_json(silent=True) or {}
    require_fields(data, "name", "email")

    contact = ClientContact(client_id=client_id).update_from(data, CONTACT_FIELDS)
    db.session.add(contact)
    db.session.commit()
    return {"contact": contact.to_dict()}, 201


@bp.patch("/<int:client_id>/contacts/<int:contact_id>")
@roles_required(Role.ADMIN)
def update_contact(client_id, contact_id):
    contact = ClientContact.query.filter_by(id=contact_id, client_id=client_id).first_or_404()
    contact.update_from(request.get_json(silent=True) or {}, CONTACT_FIELDS)
    db.session.commit()
    return {"contact": contact.to_dict()}


@bp.delete("/<int:client_id>/contacts/<int:contact_id>")
@roles_required(Role.ADMIN)
def delete_contact(client_id, contact_id):
    contact = ClientContact.query.filter_by(id=contact_id, client_id=client_id).first_or_404()
    db.session.delete(contact)
    db.session.commit()
    return {"message": "Contact removed."}
