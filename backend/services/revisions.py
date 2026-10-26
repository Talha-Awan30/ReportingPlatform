"""Revision control for submitted reports.

Every submission freezes the report into a `ReportRevision`: Rev 0 is the
first, and each resubmission after a reviewer's return adds the next. The
history endpoint lists the revisions with what changed since the previous one,
labelled the way the inspector saw the form - "1.1 Alarm operation:
Satisfactory -> Defect found" - rather than as raw keys.
"""
import copy
import os

from models import ReportRevision
from models.base import utcnow


# ------------------------------------------------------------------ snapshot
def _photo_list(report):
    photos = [
        {
            "source": "report",
            "id": p.id,
            "kind": p.kind.value if hasattr(p.kind, "value") else p.kind,
            "slot": p.checkpoint_key,
            "name": p.original_name or p.filename,
            "caption": p.caption,
        }
        for p in report.photos
    ]
    record = report.inspection_set
    if record is not None:
        photos += [
            {"source": "cover", "id": p.id, "slot": p.slot_key, "name": p.original_name or p.filename}
            for p in record.photos
        ]
    return photos


def snapshot(report, user):
    """Freeze the report as its current revision (replacing a stale row)."""
    row = next((r for r in report.revisions if r.revision == report.revision), None)
    if row is None:
        row = ReportRevision(report_id=report.id, revision=report.revision)
        report.revisions.append(row)
    record = report.inspection_set
    row.submitted_at = report.submitted_at or utcnow()
    row.submitted_by_id = user.id if user else None
    row.submitted_by_name = user.full_name if user else None
    row.data = copy.deepcopy(report.data or {})
    row.title_page = copy.deepcopy(record.title_page) if record is not None else None
    row.photos = _photo_list(report)
    row.docx_path = report.docx_path
    row.pdf_path = report.pdf_path
    row.set_docx_path = None
    row.set_pdf_path = None
    row.outcome = "pending"
    row.review_comment = None
    row.reviewed_by_name = None
    row.reviewed_at = None
    return row


def current(report):
    return next((r for r in report.revisions if r.revision == report.revision), None)


def mark_outcome(report, outcome, user, comment=None):
    """Record the reviewer's decision on the revision just reviewed."""
    row = current(report)
    if row is None:
        return
    row.outcome = outcome
    row.review_comment = comment
    row.reviewed_by_name = user.full_name if user else None
    row.reviewed_at = utcnow()
    # Approval regenerates the Word file with the reviewer's name.
    if outcome == "approved":
        row.docx_path = report.docx_path


def attach_set_documents(record):
    """Note the visit's combined documents on each unit's current revision."""
    for report in record.reports:
        row = current(report)
        if row is not None:
            row.set_docx_path = record.docx_path
            row.set_pdf_path = record.pdf_path


# ------------------------------------------------------------------- history
def _field_index(spec):
    """key -> (group, label, field) for every answer the form can hold."""
    index = {}
    if spec is None:
        return index
    for field in spec.unit_details:
        index[field.key] = ("Particulars", field.label, field)
    for number, section in enumerate(spec.sections, start=1):
        for sub, checkpoint in enumerate(section.checkpoints, start=1):
            index[checkpoint.key] = (
                f"{number}. {section.title}",
                f"{number}.{sub} {checkpoint.label}",
                checkpoint,
            )
    for field in spec.conclusion:
        index[field.key] = ("Findings & conclusion", field.label, field)
    return index


def _display(field, value, options):
    if value in (None, ""):
        return "—"
    if field is not None and field.kind == "dropdown":
        bucket = options.get(field.options_key) or {}
        option = next((o for o in bucket.get("options", []) if o["value"] == value), None)
        if option:
            return option["label"]
    if isinstance(value, bool):
        return "Yes" if value else "No"
    return str(value)


def _entry(answers, key):
    entry = (answers or {}).get(key)
    if isinstance(entry, dict):
        return entry.get("value"), (entry.get("remarks") or "").strip()
    return entry, ""


def _diff_answers(old, new, index, options, group_override=None):
    changes = []
    keys = list(dict.fromkeys(list((old or {}).keys()) + list((new or {}).keys())))
    for key in keys:
        group, label, field = index.get(key, (group_override or "Other", key.replace("_", " ").capitalize(), None))
        if group_override:
            group = group_override
        old_value, old_remarks = _entry(old, key)
        new_value, new_remarks = _entry(new, key)
        if (old_value or "") != (new_value or ""):
            changes.append({
                "group": group,
                "field": label,
                "old": _display(field, old_value, options),
                "new": _display(field, new_value, options),
            })
        if old_remarks != new_remarks:
            changes.append({
                "group": group,
                "field": f"{label} (remarks)",
                "old": old_remarks or "—",
                "new": new_remarks or "—",
            })
    return changes


def _diff_photos(old, new, slot_labels):
    def key(p):
        return (p.get("source"), p.get("id"))

    def describe(p):
        where = slot_labels.get(p.get("slot")) or ("Cover" if p.get("source") == "cover" else "Photo")
        return f"{where}: {p.get('name') or 'photo'}"

    old_keys = {key(p): p for p in old or []}
    new_keys = {key(p): p for p in new or []}
    changes = []
    for k, p in new_keys.items():
        if k not in old_keys:
            changes.append({"group": "Photographs", "field": "Added", "old": "—", "new": describe(p)})
    for k, p in old_keys.items():
        if k not in new_keys:
            changes.append({"group": "Photographs", "field": "Removed", "old": describe(p), "new": "—"})
    return changes


def history(report, spec, options):
    """Every revision, newest first, with its changes against the one before."""
    index = _field_index(spec)
    title_index = {f.key: ("Title page", f.label, f) for f in (spec.title_page if spec else [])}
    slot_labels = {}
    if spec is not None:
        slot_labels.update({s.key: s.label for s in spec.photo_slots})
        slot_labels.update({s.key: s.label for s in spec.title_page_photos})
        for section in spec.sections:
            slot_labels.update({c.key: c.label for c in section.checkpoints})

    from services.storage import generated_dir

    folder = generated_dir(create=False)

    def exists(name):
        return bool(name) and os.path.exists(os.path.join(folder, name))

    rows = sorted(report.revisions, key=lambda r: r.revision)
    out = []
    previous = None
    for row in rows:
        if previous is None:
            changes = None  # the first submission - nothing to compare with
        else:
            changes = _diff_answers(previous.data, row.data, index, options)
            if row.title_page is not None or previous.title_page is not None:
                changes += _diff_answers(
                    previous.title_page or {}, row.title_page or {}, title_index, options, "Title page"
                )
            changes += _diff_photos(previous.photos, row.photos, slot_labels)
        out.append({
            "revision": row.revision,
            "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
            "submitted_by": row.submitted_by_name,
            "outcome": row.outcome,
            "review_comment": row.review_comment,
            "reviewed_by": row.reviewed_by_name,
            "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
            "changes": changes,
            "has_pdf": exists(row.set_pdf_path) or exists(row.pdf_path),
            "has_docx": exists(row.set_docx_path) or exists(row.docx_path),
            "is_combined": bool(row.set_docx_path or row.set_pdf_path),
        })
        previous = row
    return list(reversed(out))


def revision_file(report, revision, kind):
    """Absolute path of a revision's PDF or Word file, or None."""
    from services.storage import generated_dir

    row = next((r for r in report.revisions if r.revision == revision), None)
    if row is None:
        return None
    names = (row.set_pdf_path, row.pdf_path) if kind == "pdf" else (row.set_docx_path, row.docx_path)
    for name in names:
        if name and os.path.exists(os.path.join(generated_dir(create=False), name)):
            return os.path.join(generated_dir(create=False), name)
    return None
