"""Small input helpers - deliberately light, the API surface is internal."""
from datetime import date, datetime

from .errors import ApiError


def require_fields(data, *fields):
    """Raise a 422 listing every missing or blank field at once."""
    missing = [f for f in fields if data.get(f) in (None, "", [])]
    if missing:
        raise ApiError(
            "Missing required fields.",
            422,
            "validation_error",
            {"missing": missing},
        )
    return data


def parse_date(value, field="date"):
    """Accept an ISO date string, a full ISO datetime, or None."""
    if value in (None, ""):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        raise ApiError(
            f"'{field}' must be an ISO date (YYYY-MM-DD).", 422, "validation_error", {"field": field}
        )


def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def parse_enum(enum_cls, value, field="value"):
    if value in (None, ""):
        return None
    try:
        return enum_cls(value)
    except ValueError:
        allowed = [e.value for e in enum_cls]
        raise ApiError(
            f"'{field}' must be one of: {', '.join(allowed)}.",
            422,
            "validation_error",
            {"field": field, "allowed": allowed},
        )
