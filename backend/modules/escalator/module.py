"""Escalator & Travelator inspection module.

Scaffolded - the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
form appears in the frontend automatically; nothing else needs to change.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="escalator",
    name="Escalator & Travelator",
    summary="Steps, handrails, combs, brakes and emergency stops.",
    icon="fa-stairs",
    report_prefix="ESC",
    default_validity_months=6,
    docx_template="escalator_report_template.docx",
    equipment_types=['Escalator', 'Moving Walkway'],
    order=80,
    sections=[],  # <- add Section(...) entries here to build the form
)
