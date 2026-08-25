"""Lifting Accessories inspection module.

Service category taken from the SGS Service Portfolio and Equipment list.
Covers 11 equipment type(s) - see `equipment_types` below.

Scaffolded: the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
inspection form appears in the website automatically - nothing else changes.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="lifting_accessories",
    name="Lifting Accessories",
    summary="Slings, shackles, hooks, beams and fall protection - thorough examination and proof load.",
    icon="fa-link",
    report_prefix="LAC",
    default_validity_months=6,
    docx_template="lifting_accessories_report_template.docx",
    equipment_types=[
        'Wire Rope Sling',
        'Web Sling',
        'Shackle',
        'Eye Bolts',
        'Hook',
        'Plate Clamp',
        'Lifting Beam',
        'Snatch Block (Pulley Block)',
        'Fall Arrestor',
        'Safety Harness',
        'Lift Line',
    ],
    order=20,
    sections=[],  # <- add Section(...) entries here to build the form
)
