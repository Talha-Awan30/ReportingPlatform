"""Tower Inspection inspection module.

Service category taken from the SGS Service Portfolio and Equipment list.
Covers 1 equipment type(s) - see `equipment_types` below.

Scaffolded: the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
inspection form appears in the website automatically - nothing else changes.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="tower_inspection",
    name="Tower Inspection",
    summary="Communication and transmission towers - structure, fixings, access and fall protection.",
    icon="fa-tower-cell",
    report_prefix="TWR",
    default_validity_months=12,
    docx_template="tower_inspection_report_template.docx",
    equipment_types=[
        'Tower',
    ],
    order=50,
    sections=[],  # <- add Section(...) entries here to build the form
)
