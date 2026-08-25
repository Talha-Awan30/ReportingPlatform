"""Clients and their contacts."""
from flask import Blueprint, request

from extensions import db
from models import Client, ClientContact, Role
from utils import paginate, roles_required
from utils.decorators import current_user
from utils.errors import ApiError
from utils.validation import require_fields

bp = Blueprint("clients", __name__)

CLIENT_FIELDS = ["name", "industry", "address", "city", "country", "is_active", "notes"]
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
        query = query.filter(db.or_(Client.name.ilike(like), Client.code.ilike(like)))

    if request.args.get("active_only") == "true":
        query = query.filter(Client.is_active.is_(True))

    return paginate(query.order_by(Client.name))


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
    require_fields(data, "code", "name")

    code = str(data["code"]).strip().upper()
    if Client.query.filter_by(code=code).first():
        raise ApiError(f"Client code '{code}' is already in use.", 409, "duplicate_code")

    client = Client(code=code).update_from(data, CLIENT_FIELDS)
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
    client.update_from(request.get_json(silent=True) or {}, CLIENT_FIELDS)
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
