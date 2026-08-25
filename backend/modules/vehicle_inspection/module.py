"""Vehicle Inspection inspection module.

Service category taken from the SGS Service Portfolio and Equipment list.
Covers 10 equipment type(s) - see `equipment_types` below.

Scaffolded: the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
inspection form appears in the website automatically - nothing else changes.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="vehicle_inspection",
    name="Vehicle Inspection",
    summary="Light vehicles, buses and earth-moving plant - roadworthiness and mechanical condition.",
    icon="fa-truck",
    report_prefix="VEH",
    default_validity_months=12,
    docx_template="vehicle_inspection_report_template.docx",
    equipment_types=[
        'Car',
        'Pickup',
        'Truck',
        'Bus / Van',
        'Hi Ace',
        'Dozer / Road Roller / Bull Dozer',
        'Dumper',
        'Excavator / Wheel Loader',
        'Tractor & Trolley',
        'Tipper',
    ],
    order=60,
    sections=[],  # <- add Section(...) entries here to build the form
)
