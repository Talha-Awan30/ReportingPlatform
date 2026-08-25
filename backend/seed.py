"""Seed the database with master data only.

    flask --app app seed

Master data means: the global dropdown master lists, one equipment type per
module-declared type, and the admin account. Nothing else - no sample clients,
jobs, equipment or reports.

It is idempotent: running it again tops up whatever is missing rather than
duplicating anything.
"""
import logging

from extensions import db
from models import (
    Client,
    DropdownList,
    DropdownOption,
    Equipment,
    EquipmentType,
    Job,
    Report,
    Role,
    User,
)
from modules import all_modules

log = logging.getLogger(__name__)

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "123"
ADMIN_EMAIL = "admin@sgs.com"
ADMIN_NAME = "Administrator"

# Global option lists - available to every module unless a module overrides them.
GLOBAL_LISTS = [
    {
        "key": "inspection_result",
        "name": "Inspection Result",
        "description": "The standard result behind every inspection checkpoint.",
        "options": [
            ("satisfactory", "Satisfactory", "Found satisfactory at the time of inspection.", "success", True),
            ("defect", "Defect Found", "A defect was observed and is detailed in the remarks.", "danger", False),
            ("observation", "Observation", "An observation was raised for the client's attention.", "warning", False),
            ("not_applicable", "Not Applicable", "Not applicable to this equipment.", "neutral", False),
            ("not_accessible", "Not Accessible", "Could not be accessed at the time of inspection.", "info", False),
        ],
    },
    {
        "key": "load_test_result",
        "name": "Load Test Result",
        "description": "Outcome of a load or proof test exercise.",
        "options": [
            ("pass", "Pass", "The test was completed successfully with no adverse findings.", "success", True),
            ("fail", "Fail", "The test was not passed; see the remarks.", "danger", False),
            ("not_performed", "Not Performed", "The test was not performed on this visit.", "neutral", False),
        ],
    },
    {
        "key": "overall_result",
        "name": "Overall Conclusion",
        "description": "The conclusion printed on the front of the report.",
        "options": [
            ("satisfactory", "Satisfactory",
             "On the basis of visual and operational examination and the load test exercise, the subject "
             "equipment was found satisfactory at the time of inspection and fit for intended use.",
             "success", True),
            ("unsatisfactory", "Unsatisfactory",
             "On the basis of visual and operational examination, the subject equipment was found "
             "unsatisfactory at the time of inspection and not fit for intended use.",
             "danger", False),
            ("conditional", "Conditional",
             "Fit for intended use subject to the corrective actions listed in this report.",
             "warning", False),
        ],
    },
    {
        "key": "defect_severity",
        "name": "Defect Severity",
        "description": "How urgently a finding must be actioned.",
        "options": [
            ("critical", "Critical - stop use", "Equipment must be withdrawn from service immediately.", "danger", False),
            ("major", "Major", "Rectify before the next use.", "warning", False),
            ("minor", "Minor - area of improvement", "Rectify at the next scheduled maintenance.", "info", True),
        ],
    },
]


def run_seed():
    db.create_all()

    _seed_admin()
    _seed_dropdowns()
    _seed_equipment_types()

    db.session.commit()
    _report()


def _seed_admin():
    admin = User.query.filter_by(employee_id=ADMIN_USERNAME).first()
    if admin:
        log.info("Admin account '%s' already exists", ADMIN_USERNAME)
        return admin

    admin = User(
        employee_id=ADMIN_USERNAME,
        email=ADMIN_EMAIL,
        full_name=ADMIN_NAME,
        job_title="System Administrator",
        role=Role.ADMIN,
    )
    admin.set_password(ADMIN_PASSWORD)
    db.session.add(admin)
    db.session.flush()
    log.info("Created admin account '%s'", ADMIN_USERNAME)
    return admin


def _seed_dropdowns():
    for entry in GLOBAL_LISTS:
        dropdown = DropdownList.query.filter_by(key=entry["key"], module_slug=None).first()
        if dropdown is None:
            dropdown = DropdownList(
                key=entry["key"], name=entry["name"], description=entry["description"]
            )
            db.session.add(dropdown)
            db.session.flush()

        existing = {o.value for o in dropdown.options}
        for index, (value, label, report_text, severity, is_default) in enumerate(entry["options"]):
            if value in existing:
                continue
            db.session.add(
                DropdownOption(
                    list_id=dropdown.id,
                    value=value,
                    label=label,
                    report_text=report_text,
                    severity=severity,
                    is_default=is_default,
                    sort_order=index,
                )
            )


def _seed_equipment_types():
    """One equipment type per name declared by a module manifest."""
    for spec in all_modules(include_disabled=True):
        for name in spec.equipment_types:
            if EquipmentType.query.filter_by(name=name).first():
                continue
            db.session.add(
                EquipmentType(
                    name=name,
                    module_slug=spec.slug,
                    default_validity_months=spec.default_validity_months,
                    description=f"Inspected under the {spec.name} module.",
                )
            )


def _report():
    print("\nSeed complete.")
    print(f"  Users            {User.query.count()}")
    print(f"  Clients          {Client.query.count()}")
    print(f"  Equipment types  {EquipmentType.query.count()}")
    print(f"  Equipment        {Equipment.query.count()}")
    print(f"  Jobs             {Job.query.count()}")
    print(f"  Reports          {Report.query.count()}")
    print(f"  Dropdown lists   {DropdownList.query.count()}")
    print(f"\n  Sign in as  {ADMIN_USERNAME}  /  {ADMIN_PASSWORD}\n")
