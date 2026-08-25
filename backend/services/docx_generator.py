"""Word report generation.

Fills the module's approved .docx template with the report's data and photos
using docxtpl. If a module has not supplied a template yet, a readable fallback
document is built with python-docx so the workflow still works end to end.
"""
import logging
import os
from datetime import datetime

from flask import current_app

from models import PhotoKind
from services.storage import generated_dir, photo_path

log = logging.getLogger(__name__)


def template_path(spec):
    """Absolute path to a module's Word template, or None if it is not there."""
    if not spec or not spec.root_path:
        return None
    path = os.path.join(spec.root_path, "templates", spec.docx_template)
    return path if os.path.exists(path) else None


def build_context(report, spec, options=None):
    """The flat dictionary the Word template renders against."""
    job = report.job
    equipment = report.equipment
    client = job.client if job else None
    options = options or {}

    def label_for(checkpoint, raw_value):
        """Turn a stored option value into its approved report wording."""
        if checkpoint.kind != "dropdown" or raw_value in (None, ""):
            return raw_value
        bucket = options.get(checkpoint.options_key) or {}
        for option in bucket.get("options", []):
            if option["value"] == raw_value:
                return option.get("report_text") or option["label"]
        return raw_value

    answers = report.data or {}
    sections = []
    for section in spec.sections if spec else []:
        rows = []
        for checkpoint in section.checkpoints:
            entry = answers.get(checkpoint.key) or {}
            if not isinstance(entry, dict):
                entry = {"value": entry}
            rows.append(
                {
                    "key": checkpoint.key,
                    "label": checkpoint.label,
                    "value": entry.get("value"),
                    "result": label_for(checkpoint, entry.get("value")),
                    "remarks": entry.get("remarks", ""),
                }
            )
        sections.append({"key": section.key, "title": section.title, "rows": rows})

    return {
        "report_number": report.report_number,
        "revision": report.revision,
        "status": report.status.label,
        "module_name": spec.name if spec else report.module_slug,
        "reference_code": (answers.get("reference_code") or {}).get("value", ""),
        "inspection_date": _fmt(report.inspection_date),
        "next_inspection_date": _fmt(report.next_inspection_date),
        "certificate_expiry_date": _fmt(report.certificate_expiry_date),
        "overall_result": (report.overall_result or "").title(),
        "comments": report.comments or "",
        "job_number": job.job_number if job else "",
        "site_name": job.site_name if job else "",
        "site_address": job.site_address if job else "",
        "client_name": client.name if client else "",
        "client_address": client.address if client else "",
        "contact_name": job.contact.name if job and job.contact else "",
        "equipment_tag": equipment.tag_number if equipment else "",
        "equipment_type": equipment.equipment_type.name if equipment and equipment.equipment_type else "",
        "serial_number": equipment.serial_number if equipment else "",
        "manufacturer": equipment.manufacturer if equipment else "",
        "model": equipment.model if equipment else "",
        "capacity": equipment.capacity if equipment else "",
        "swl": equipment.swl if equipment else "",
        "location": equipment.location if equipment else "",
        "inspector_name": report.inspector.full_name if report.inspector else "",
        "reviewer_name": report.reviewer.full_name if report.reviewer else "",
        "generated_on": datetime.now().strftime("%d %B %Y"),
        "sections": sections,
        "front_page_photos": [_photo(p) for p in report.photos_of(PhotoKind.FRONT_PAGE)],
        "inspection_photos": [_photo(p) for p in report.photos_of(PhotoKind.INSPECTION)],
    }


def generate(report, spec, options=None):
    """Render the report to .docx and return its path relative to GENERATED_FOLDER."""
    context = build_context(report, spec, options)
    out_name = f"{report.report_number or f'report-{report.id}'}-rev{report.revision}.docx"
    out_path = os.path.join(generated_dir(), out_name)

    source = template_path(spec)
    if source:
        _render_template(source, out_path, context, report)
    else:
        log.info("No Word template for module '%s' - building fallback document", report.module_slug)
        _render_fallback(out_path, context)

    return out_name


# --------------------------------------------------------------------- helpers
def _render_template(source, out_path, context, report):
    from docxtpl import DocxTemplate, InlineImage
    from docx.shared import Mm

    doc = DocxTemplate(source)

    # Photos have to become InlineImage objects bound to this specific document.
    for key in ("front_page_photos", "inspection_photos"):
        for item in context[key]:
            if item["path"] and os.path.exists(item["path"]):
                item["image"] = InlineImage(doc, item["path"], width=Mm(80))

    doc.render(context)
    doc.save(out_path)


def _render_fallback(out_path, context):
    """A plain but complete document, used until the approved template arrives."""
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Mm, Pt, RGBColor

    doc = Document()
    sgs_blue = RGBColor(0x3C, 0x51, 0x5B)

    title = doc.add_heading(f"{context['module_name']} Inspection Report", level=0)
    for run in title.runs:
        run.font.color.rgb = sgs_blue

    subtitle = doc.add_paragraph(f"{context['report_number']}  |  Revision {context['revision']}")
    subtitle.alignment = WD_ALIGN_PARAGRAPH.LEFT

    # --- header block -------------------------------------------------------
    header_fields = [
        ("Client", context["client_name"]),
        ("Job Number", context["job_number"]),
        ("Site", context["site_name"]),
        ("Equipment", f"{context['equipment_type']} - {context['equipment_tag']}"),
        ("Serial Number", context["serial_number"]),
        ("Manufacturer / Model", f"{context['manufacturer']} {context['model']}".strip()),
        ("Capacity / SWL", f"{context['capacity']} {context['swl']}".strip()),
        ("Location", context["location"]),
        ("Inspection Date", context["inspection_date"]),
        ("Reference Code", context["reference_code"]),
        ("Certificate Expiry", context["certificate_expiry_date"]),
        ("Overall Result", context["overall_result"]),
    ]
    table = doc.add_table(rows=0, cols=2)
    table.style = "Light Grid Accent 1"
    for label, value in header_fields:
        row = table.add_row().cells
        row[0].text = label
        row[1].text = str(value or "-")

    # --- front page photos --------------------------------------------------
    if context["front_page_photos"]:
        doc.add_heading("Cover Photographs", level=1)
        for item in context["front_page_photos"]:
            if item["path"] and os.path.exists(item["path"]):
                doc.add_picture(item["path"], width=Mm(90))
                if item["caption"]:
                    doc.add_paragraph(item["caption"]).runs[0].font.size = Pt(9)

    # --- checkpoint sections ------------------------------------------------
    for section in context["sections"]:
        doc.add_heading(section["title"], level=1)
        section_table = doc.add_table(rows=1, cols=3)
        section_table.style = "Light Grid Accent 1"
        headers = section_table.rows[0].cells
        headers[0].text = "Check Point"
        headers[1].text = "Result"
        headers[2].text = "Remarks / Recommendations"
        for entry in section["rows"]:
            cells = section_table.add_row().cells
            cells[0].text = entry["label"]
            cells[1].text = str(entry["result"] or "-")
            cells[2].text = entry["remarks"] or ""

    # --- comments -----------------------------------------------------------
    if context["comments"]:
        doc.add_heading("Observations & Recommendations", level=1)
        doc.add_paragraph(context["comments"])

    # --- inspection photos --------------------------------------------------
    if context["inspection_photos"]:
        doc.add_heading("Photographic Presentation", level=1)
        for item in context["inspection_photos"]:
            if item["path"] and os.path.exists(item["path"]):
                doc.add_picture(item["path"], width=Mm(120))
                if item["caption"]:
                    doc.add_paragraph(item["caption"]).runs[0].font.size = Pt(9)

    # --- sign-off -----------------------------------------------------------
    doc.add_heading("Approval", level=1)
    signoff = doc.add_table(rows=0, cols=2)
    signoff.style = "Light Grid Accent 1"
    for label, value in [
        ("Inspected by", context["inspector_name"]),
        ("Reviewed by", context["reviewer_name"]),
        ("Generated on", context["generated_on"]),
    ]:
        row = signoff.add_row().cells
        row[0].text = label
        row[1].text = str(value or "-")

    doc.save(out_path)


def _photo(photo):
    return {
        "path": photo_path(photo),
        "caption": photo.caption or photo.original_name or "",
        "checkpoint_key": photo.checkpoint_key,
    }


def _fmt(value):
    return value.strftime("%d %b %Y") if value else ""
