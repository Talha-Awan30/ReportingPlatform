"""Slings & Lifting Gear inspection module.

Scaffolded - the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
form appears in the frontend automatically; nothing else needs to change.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="wire_rope_sling",
    name="Slings & Lifting Gear",
    summary="Wire rope, chain and webbing slings, shackles and eyebolts.",
    icon="fa-grip-lines",
    report_prefix="SLG",
    default_validity_months=6,
    docx_template="wire_rope_sling_report_template.docx",
    equipment_types=['Wire Rope Sling', 'Chain Sling', 'Webbing Sling', 'Shackle', 'Eyebolt'],
    order=60,
    sections=[],  # <- add Section(...) entries here to build the form
)
