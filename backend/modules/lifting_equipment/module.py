"""Lifting Equipment inspection module.

Service category taken from the SGS Service Portfolio and Equipment list.
Covers 14 equipment type(s) - see `equipment_types` below.

Scaffolded: the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
inspection form appears in the website automatically - nothing else changes.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="lifting_equipment",
    name="Lifting Equipment",
    summary="Cranes, forklifts, hoists, platforms and jacks - visual examination, function and load test.",
    icon="fa-crane",
    report_prefix="LEQ",
    default_validity_months=12,
    docx_template="lifting_equipment_report_template.docx",
    equipment_types=[
        'Mobile Crane',
        'Pipe Layer / Side Boom',
        'Tower Crane',
        'Jib Crane',
        'Fork Lift Truck',
        'Stacker',
        'Scissor lift / Snorkel / Genie / Elevated Platform',
        'Overhead Crane',
        'Hoist',
        'Hand Pallet Truck',
        'Power Pallet Truck',
        'Hydraulic Jack',
        'Dock Leveler',
        'Tripod',
    ],
    order=10,
    sections=[],  # <- add Section(...) entries here to build the form
)
