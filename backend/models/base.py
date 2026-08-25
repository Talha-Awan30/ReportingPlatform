"""Shared model plumbing."""
from datetime import datetime, timezone

from extensions import db


def utcnow():
    """Timezone-aware UTC now — stored naive so SQLite and Postgres agree."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class BaseModel(db.Model, TimestampMixin):
    """Abstract base giving every table an integer PK and a dict serializer."""

    __abstract__ = True

    id = db.Column(db.Integer, primary_key=True)

    def to_dict(self, exclude=()):
        out = {}
        for column in self.__table__.columns:
            if column.name in exclude:
                continue
            value = getattr(self, column.name)
            if isinstance(value, datetime):
                value = value.isoformat()
            elif hasattr(value, "value"):  # Enum
                value = value.value
            elif hasattr(value, "isoformat"):  # date
                value = value.isoformat()
            out[column.name] = value
        return out

    def update_from(self, data, fields):
        """Apply only the whitelisted `fields` present in `data`."""
        for field in fields:
            if field in data:
                setattr(self, field, data[field])
        return self

    def __repr__(self):
        return f"<{self.__class__.__name__} id={self.id}>"
