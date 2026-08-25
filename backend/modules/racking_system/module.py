"""Racking System inspection module.

Service category taken from the SGS Service Portfolio and Equipment list.
Covers 1 equipment type(s) - see `equipment_types` below.

Scaffolded: the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
inspection form appears in the website automatically - nothing else changes.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="racking_system",
    name="Racking System",
    summary="Pallet racking and storage systems - structural condition, load notices and damage assessment.",
    icon="fa-warehouse",
    report_prefix="RCK",
    default_validity_months=12,
    docx_template="racking_system_report_template.docx",
    equipment_types=[
        'Racking System',
    ],
    order=40,
    sections=[],  # <- add Section(...) entries here to build the form
)
