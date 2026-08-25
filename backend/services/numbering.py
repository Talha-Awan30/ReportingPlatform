"""Automatic report numbering.

Format: <PREFIX>-<YEAR>-<SEQ4>, e.g. ELV-2026-0042. The sequence restarts each
year and is scoped per module prefix.
"""
import re
from datetime import date

from extensions import db
from models import Report

_PATTERN = re.compile(r"^(?P<prefix>[A-Z]+)-(?P<year>\d{4})-(?P<seq>\d+)$")


def next_report_number(prefix, year=None):
    """Return the next free number for `prefix` in `year`.

    Reads the highest existing sequence rather than keeping a counter table, so
    numbers stay correct even if rows are imported or deleted.
    """
    year = year or date.today().year
    stem = f"{prefix}-{year}-"

    rows = (
        db.session.query(Report.report_number)
        .filter(Report.report_number.like(f"{stem}%"))
        .all()
    )

    highest = 0
    for (number,) in rows:
        match = _PATTERN.match(number or "")
        if match and match.group("prefix") == prefix and int(match.group("year")) == year:
            highest = max(highest, int(match.group("seq")))

    return f"{stem}{highest + 1:04d}"


def next_job_number(year=None):
    """Job numbers use the same shape with a fixed JOB prefix."""
    from models import Job

    year = year or date.today().year
    stem = f"JOB-{year}-"
    rows = db.session.query(Job.job_number).filter(Job.job_number.like(f"{stem}%")).all()

    highest = 0
    for (number,) in rows:
        tail = (number or "").rsplit("-", 1)[-1]
        if tail.isdigit():
            highest = max(highest, int(tail))

    return f"{stem}{highest + 1:04d}"


def next_set_number(prefix, year=None):
    """Next inspection-set number, e.g. ELV-SET-2026-0007."""
    from models import InspectionSet

    year = year or date.today().year
    stem = f"{prefix}-SET-{year}-"
    rows = (
        db.session.query(InspectionSet.set_number)
        .filter(InspectionSet.set_number.like(f"{stem}%"))
        .all()
    )

    highest = 0
    for (number,) in rows:
        tail = (number or "").rsplit("-", 1)[-1]
        if tail.isdigit():
            highest = max(highest, int(tail))

    return f"{stem}{highest + 1:04d}"
