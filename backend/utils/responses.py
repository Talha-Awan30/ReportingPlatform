"""Response shaping helpers."""
from flask import request


def paginate(query, serializer=None, default_per_page=25, max_per_page=200):
    """Return a `{items, meta}` envelope for a SQLAlchemy query."""
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        per_page = int(request.args.get("per_page", default_per_page))
    except ValueError:
        per_page = default_per_page
    per_page = max(1, min(per_page, max_per_page))

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    serializer = serializer or (lambda item: item.to_dict())

    return {
        "items": [serializer(item) for item in pagination.items],
        "meta": {
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total": pagination.total,
            "pages": pagination.pages,
            "has_next": pagination.has_next,
            "has_prev": pagination.has_prev,
        },
    }


def ok(payload=None, **extra):
    body = payload if isinstance(payload, dict) else {"data": payload}
    body.update(extra)
    return body, 200


def created(payload=None, **extra):
    body = payload if isinstance(payload, dict) else {"data": payload}
    body.update(extra)
    return body, 201


def no_content():
    return "", 204
