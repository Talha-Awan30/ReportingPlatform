# Man Lift / MEWP module

Slug: `man_lift` &nbsp;|&nbsp; Report prefix: `MWP` &nbsp;|&nbsp; Validity: 12 months

## Status
Scaffolded. `module.py` has an empty `sections` list, so the module shows in the
picker as **Not configured** and no inspection form is rendered yet.

## To build it out
1. Add `Section(...)` / `Checkpoint(...)` entries to `sections` in `module.py`.
2. Drop the approved Word template into `templates/man_lift_report_template.docx`.
3. Add any option lists this item needs under Admin -> Master Lists, scoped to
   this module slug so they override the global wording.
4. Restart the backend - the registry picks the changes up on import.

## Endpoints (provided automatically)
- `GET /api/modules/man_lift/manifest`
- `GET /api/modules/man_lift/form-schema`
- `GET /api/modules/man_lift/stats`
