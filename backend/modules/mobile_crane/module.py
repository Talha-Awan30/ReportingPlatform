"""Mobile Crane inspection module.

Scaffolded - the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
form appears in the frontend automatically; nothing else needs to change.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="mobile_crane",
    name="Mobile Crane",
    summary="Truck, crawler and all-terrain cranes - boom, outriggers and LMI.",
    icon="fa-truck-monster",
    report_prefix="MBC",
    default_validity_months=12,
    docx_template="mobile_crane_report_template.docx",
    equipment_types=['Mobile Crane', 'Crawler Crane', 'Truck Mounted Crane'],
    order=30,
    sections=[],  # <- add Section(...) entries here to build the form
)
