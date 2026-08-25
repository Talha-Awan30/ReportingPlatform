"""SQLAlchemy models.

Importing this package registers every model with the shared metadata, which is
what Flask-Migrate needs in order to autogenerate migrations.
"""
from .base import BaseModel, TimestampMixin  # noqa: F401
from .user import User, Role  # noqa: F401
from .client import Client, ClientContact  # noqa: F401
from .job import Job, JobStatus  # noqa: F401
from .equipment import EquipmentType, Equipment  # noqa: F401
from .masterlist import DropdownList, DropdownOption  # noqa: F401
from .report import (  # noqa: F401
    Report,
    ReportStatus,
    ReportPhoto,
    PhotoKind,
    ReportEvent,
    ReportEventType,
)
from .alert import ExpiryAlert  # noqa: F401

__all__ = [
    "BaseModel",
    "TimestampMixin",
    "User",
    "Role",
    "Client",
    "ClientContact",
    "Job",
    "JobStatus",
    "EquipmentType",
    "Equipment",
    "DropdownList",
    "DropdownOption",
    "Report",
    "ReportStatus",
    "ReportPhoto",
    "PhotoKind",
    "ReportEvent",
    "ReportEventType",
    "ExpiryAlert",
]
