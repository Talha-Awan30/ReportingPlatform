"""The contract every inspection module implements.

A module describes one service category (Elevator Inspection, Lifting
Equipment, Vehicle Inspection...). It owns its own folder under `modules/`
containing:

    modules/<slug>/
        module.py     - a MODULE = ModuleSpec(...) manifest (required)
        app.py        - a Flask Blueprint named `blueprint` (optional)
        models.py     - extra tables, if the module needs any (optional)
        templates/    - the Word/HTML report templates for this category
        static/       - icons or sample files for this category

The manifest is what the frontend reads to render the inspection form, so a new
service category needs no frontend change - only a new folder here.

A module may also declare that one job covers SEVERAL units of the same kind
(three elevators on one site, say). Then the inspector is asked "how many?"
first, fills a shared title page once, and repeats the checklist per unit. See
`supports_multiple` / `title_page` / `unit_details` / `photo_slots` below.
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
    # Word output: False prints the option's short label ("Satisfactory"),
    # True prints its full approved clause. Check-point cells want the label.
    use_report_text: bool = False

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
            "use_report_text": self.use_report_text,
        }


@dataclass
class PhotoSlot:
    """A named place in the report where photographs belong.

    The Elevator report, for example, ends with a fixed six-box photographic
    presentation - Cabin, Machine Room, Pit Area, Shaft, Car top, Control Panel.
    Declaring them here means the inspector uploads into labelled slots instead
    of one undifferentiated pile, and the Word output can lay them out correctly.
    """

    key: str
    label: str
    required: bool = False
    help_text: str = ""
    # When set, the image is dropped into the title-page table row whose first
    # cell reads this text (e.g. "QR Code") instead of into a picture frame.
    cell_label: str = ""

    def to_dict(self):
        return {
            "key": self.key,
            "label": self.label,
            "required": self.required,
            "help_text": self.help_text,
            "cell_label": self.cell_label,
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
    # Separate cover-page template for a multi-unit set (optional).
    docx_title_template: str = ""
    sections: list = field(default_factory=list)
    # Equipment type names this module handles - used to seed the register.
    equipment_types: list = field(default_factory=list)
    # Set False to hide a module that is scaffolded but not yet built out.
    enabled: bool = True
    order: int = 100

    # ---------------------------------------------------------- multi-unit
    # When True the inspector is asked how many units this visit covers, fills
    # the title page once, then repeats the checklist for each unit.
    supports_multiple: bool = False
    unit_noun: str = "unit"          # singular, e.g. "elevator"
    unit_noun_plural: str = "units"  # e.g. "elevators"
    max_units: int = 20

    # Shared cover-page fields, captured once per inspection set.
    title_page: list = field(default_factory=list)
    # Shared cover-page photographs.
    title_page_photos: list = field(default_factory=list)
    # The per-unit detail table that heads each unit's report.
    unit_details: list = field(default_factory=list)
    # Named photo slots filled in for every unit.
    photo_slots: list = field(default_factory=list)
    # Findings / conclusion fields that close each unit's report.
    conclusion: list = field(default_factory=list)

    # Keys from `unit_details` that are normally identical for every unit on a
    # visit - client, site, make, model... These are carried forward so the
    # inspector types them once instead of once per unit. Anything not listed
    # here (the ID, the serial number) is always entered per unit.
    shared_unit_fields: list = field(default_factory=list)
    # Maps a title-page key onto a unit_details key, so the cover page seeds
    # each unit's particulars table.
    title_to_unit: dict = field(default_factory=dict)

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
    def all_unit_fields(self):
        """Every per-unit field: the detail table, the checklist, the conclusion."""
        return list(self.unit_details) + self.checkpoints + list(self.conclusion)

    @property
    def is_configured(self):
        """A module with no sections is a scaffold - the form is not built yet."""
        return bool(self.sections)

    @property
    def option_keys(self):
        """Every dropdown list this module's fields refer to."""
        fields = self.all_unit_fields + list(self.title_page)
        return {f.options_key for f in fields if f.kind == "dropdown" and f.options_key}

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
            "supports_multiple": self.supports_multiple,
            "unit_noun": self.unit_noun,
            "unit_noun_plural": self.unit_noun_plural,
            "max_units": self.max_units,
            "has_title_page": bool(self.title_page),
            "photo_slot_count": len(self.photo_slots),
            "shared_unit_fields": list(self.shared_unit_fields),
        }
        if with_sections:
            data["sections"] = [s.to_dict() for s in self.sections]
            data["title_page"] = [c.to_dict() for c in self.title_page]
            data["title_page_photos"] = [p.to_dict() for p in self.title_page_photos]
            data["unit_details"] = [c.to_dict() for c in self.unit_details]
            data["photo_slots"] = [p.to_dict() for p in self.photo_slots]
            data["conclusion"] = [c.to_dict() for c in self.conclusion]
        return data
