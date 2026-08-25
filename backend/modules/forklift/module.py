"""Forklift inspection module.

Scaffolded - the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
form appears in the frontend automatically; nothing else needs to change.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="forklift",
    name="Forklift",
    summary="Counterbalance and reach trucks - mast, forks, hydraulics and brakes.",
    icon="fa-truck-ramp-box",
    report_prefix="FKL",
    default_validity_months=12,
    docx_template="forklift_report_template.docx",
    equipment_types=['Forklift', 'Reach Truck', 'Order Picker'],
    order=40,
    sections=[],  # <- add Section(...) entries here to build the form
)
