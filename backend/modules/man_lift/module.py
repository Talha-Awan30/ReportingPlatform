"""Man Lift / MEWP inspection module.

Scaffolded - the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
form appears in the frontend automatically; nothing else needs to change.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="man_lift",
    name="Man Lift / MEWP",
    summary="Scissor lifts and boom lifts - platform, guardrails and emergency lowering.",
    icon="fa-elevator",
    report_prefix="MWP",
    default_validity_months=12,
    docx_template="man_lift_report_template.docx",
    equipment_types=['Scissor Lift', 'Boom Lift', 'Vertical Mast Lift'],
    order=70,
    sections=[],  # <- add Section(...) entries here to build the form
)
