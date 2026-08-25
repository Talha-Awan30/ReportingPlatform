# Slings & Lifting Gear module

Slug: `wire_rope_sling` &nbsp;|&nbsp; Report prefix: `SLG` &nbsp;|&nbsp; Validity: 6 months

## Status
Scaffolded. `module.py` has an empty `sections` list, so the module shows in the
picker as **Not configured** and no inspection form is rendered yet.

## To build it out
1. Add `Section(...)` / `Checkpoint(...)` entries to `sections` in `module.py`.
2. Drop the approved Word template into `templates/wire_rope_sling_report_template.docx`.
3. Add any option lists this item needs under Admin -> Master Lists, scoped to
   this module slug so they override the global wording.
4. Restart the backend - the registry picks the changes up on import.

## Endpoints (provided automatically)
- `GET /api/modules/wire_rope_sling/manifest`
- `GET /api/modules/wire_rope_sling/form-schema`
- `GET /api/modules/wire_rope_sling/stats`
