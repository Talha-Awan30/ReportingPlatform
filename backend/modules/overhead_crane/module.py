"""Overhead Crane inspection module.

Scaffolded - the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
form appears in the frontend automatically; nothing else needs to change.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="overhead_crane",
    name="Overhead Crane",
    summary="EOT and gantry cranes - structure, hoist, brakes and load test.",
    icon="fa-warehouse",
    report_prefix="OHC",
    default_validity_months=12,
    docx_template="overhead_crane_report_template.docx",
    equipment_types=['Overhead Crane (EOT)', 'Gantry Crane', 'Jib Crane'],
    order=20,
    sections=[],  # <- add Section(...) entries here to build the form
)
