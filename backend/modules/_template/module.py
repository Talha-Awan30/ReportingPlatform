"""COPY ME.

    cp -r modules/_template modules/my_new_item

Then edit the manifest below and restart the backend. The registry skips any
folder starting with an underscore, so this template is never loaded itself.
"""
from modules.base import Checkpoint, ModuleSpec, Section

RESULT = "inspection_result"  # Satisfactory / Defect / Not Applicable


MODULE = ModuleSpec(
    # URL-safe identifier. Must be unique across all modules.
    slug="my_new_item",
    name="My New Item",
    summary="One line describing what this module inspects.",
    # Any Font Awesome 6 solid icon name.
    icon="fa-clipboard-check",
    # Prefix for this module's report numbers, e.g. MNI-2026-0001.
    report_prefix="MNI",
    default_validity_months=12,
    docx_template="my_new_item_report_template.docx",
    # Seeds the equipment register with the types this module handles.
    equipment_types=["My New Item"],
    order=900,
    sections=[
        Section(
            key="general",
            title="General Condition",
            description="Shown as the section subtitle in the inspection form.",
            checkpoints=[
                Checkpoint(
                    key="overall_condition",
                    label="Overall condition of the equipment",
                    kind="dropdown",
                    options_key=RESULT,
                    allows_photos=True,
                ),
                Checkpoint(
                    key="identification_plate",
                    label="Identification plate legible and secure",
                    kind="dropdown",
                    options_key=RESULT,
                ),
                Checkpoint(
                    key="observations",
                    label="Observations",
                    kind="textarea",
                    required=False,
                ),
            ],
        ),
    ],
)
