"""The contract every inspection module implements.

A module describes one inspection item (elevator, overhead crane, forklift...).
It owns its own folder under `modules/` containing:

    modules/<slug>/
        module.py     - a MODULE = ModuleSpec(...) manifest (required)
        app.py        - a Flask Blueprint named `blueprint` (optional)
        models.py     - extra tables, if the module needs any (optional)
        templates/    - the Word/HTML report templates for this item
        static/       - icons or sample files for this item

The manifest is what the frontend reads to render the inspection form, so a new
inspection item needs no frontend change - only a new folder here.
"""
from dataclasses import dataclass, field


@dataclass
class Checkpoint:
    """One inspection checkpoint - rendered as a single form control."""

    key: str
    label: str
    # dropdown | text | textarea | number | date | checkbox | photo
    kind: str = "dropdown"
    # For dropdowns: the DropdownList.key holding the approved options.
    options_key: str = "inspection_result"
    help_text: str = ""
    required: bool = True
    # Allow an inspector to attach photos against this specific checkpoint.
    allows_photos: bool = False
    # Reference to the standard or clause this checkpoint tests.
    reference: str = ""
    default: object = None

    def to_dict(self):
        return {
            "key": self.key,
            "label": self.label,
            "kind": self.kind,
            "options_key": self.options_key if self.kind == "dropdown" else None,
            "help_text": self.help_text,
            "required": self.required,
            "allows_photos": self.allows_photos,
            "reference": self.reference,
            "default": self.default,
        }


@dataclass
class Section:
    """A titled group of checkpoints, rendered as one card in the form."""

    key: str
    title: str
    description: str = ""
    checkpoints: list = field(default_factory=list)

    def to_dict(self):
        return {
            "key": self.key,
            "title": self.title,
            "description": self.description,
            "checkpoints": [c.to_dict() for c in self.checkpoints],
        }


@dataclass
class ModuleSpec:
    """The manifest for one inspection module."""

    slug: str
    name: str
    # Short line shown on the module picker card.
    summary: str = ""
    # Font Awesome 6 icon name, e.g. "fa-elevator".
    icon: str = "fa-clipboard-check"
    # Prefix used when numbering this module's reports, e.g. "ELV".
    report_prefix: str = "RPT"
    # Certification validity in months, unless the equipment type overrides it.
    default_validity_months: int = 12
    # Word template filename, resolved inside the module's templates/ folder.
    docx_template: str = "report_template.docx"
    sections: list = field(default_factory=list)
    # Equipment type names this module handles - used to seed the register.
    equipment_types: list = field(default_factory=list)
    # Set False to hide a module that is scaffolded but not yet built out.
    enabled: bool = True
    order: int = 100

    # Populated by the registry at import time.
    package: str = ""
    root_path: str = ""

    # ----------------------------------------------------------------- helpers
    @property
    def checkpoints(self):
        return [cp for section in self.sections for cp in section.checkpoints]

    def checkpoint(self, key):
        return next((cp for cp in self.checkpoints if cp.key == key), None)

    @property
    def is_configured(self):
        """A module with no sections is a scaffold - the form is not built yet."""
        return bool(self.sections)

    def to_dict(self, with_sections=True):
        data = {
            "slug": self.slug,
            "name": self.name,
            "summary": self.summary,
            "icon": self.icon,
            "report_prefix": self.report_prefix,
            "default_validity_months": self.default_validity_months,
            "equipment_types": list(self.equipment_types),
            "enabled": self.enabled,
            "order": self.order,
            "is_configured": self.is_configured,
            "section_count": len(self.sections),
            "checkpoint_count": len(self.checkpoints),
        }
        if with_sections:
            data["sections"] = [s.to_dict() for s in self.sections]
        return data
