"""Chain Block & Hoist inspection module.

Scaffolded - the checkpoint list is not built out yet. Fill `sections` with
`Section(...)` / `Checkpoint(...)` entries from the approved check-list and the
form appears in the frontend automatically; nothing else needs to change.
"""
from modules.base import ModuleSpec  # noqa: F401  (Checkpoint/Section used once built out)

MODULE = ModuleSpec(
    slug="chain_block",
    name="Chain Block & Hoist",
    summary="Manual and powered chain blocks, lever hoists and trolleys.",
    icon="fa-link",
    report_prefix="CHB",
    default_validity_months=12,
    docx_template="chain_block_report_template.docx",
    equipment_types=['Chain Block', 'Lever Hoist', 'Electric Chain Hoist'],
    order=50,
    sections=[],  # <- add Section(...) entries here to build the form
)
