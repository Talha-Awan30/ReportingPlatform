# Tower Inspection

Slug `tower_inspection` | Report prefix `TWR` | Validity 12 months

## Equipment covered
- Tower

## Status
Scaffolded - shows in the picker as **Not configured** until `sections` is filled in.

## To build out the checkpoint list
1. Add `Section(...)` / `Checkpoint(...)` entries to `sections` in `module.py`.
2. Drop the approved Word template into `templates/tower_inspection_report_template.docx`.
3. Add any option lists this category needs under Admin -> Master Lists, scoped
   to this module slug so they override the global wording.
4. Restart the backend.

## Endpoints (provided automatically)
- `GET /api/modules/tower_inspection/manifest`
- `GET /api/modules/tower_inspection/form-schema`
- `GET /api/modules/tower_inspection/stats`
