# Racking System

Slug `racking_system` | Report prefix `RCK` | Validity 12 months

## Equipment covered
- Racking System

## Status
Scaffolded - shows in the picker as **Not configured** until `sections` is filled in.

## To build out the checkpoint list
1. Add `Section(...)` / `Checkpoint(...)` entries to `sections` in `module.py`.
2. Drop the approved Word template into `templates/racking_system_report_template.docx`.
3. Add any option lists this category needs under Admin -> Master Lists, scoped
   to this module slug so they override the global wording.
4. Restart the backend.

## Endpoints (provided automatically)
- `GET /api/modules/racking_system/manifest`
- `GET /api/modules/racking_system/form-schema`
- `GET /api/modules/racking_system/stats`
