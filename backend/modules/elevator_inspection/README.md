# Elevator Inspection

Slug `elevator_inspection` | Report prefix `ELV` | Validity 6 months

## Equipment covered
- Passenger / Cargo Lift
- Escalator / Travellator
- Dumbwaiter

## Status
**Built out** - 11 sections, 85 checkpoints, from the SGS Elevator Inspection Check-list (ASME A17.1 / A17.2 / EN-81).

## To build out the checkpoint list
1. Add `Section(...)` / `Checkpoint(...)` entries to `sections` in `module.py`.
2. Drop the approved Word template into `templates/elevator_inspection_report_template.docx`.
3. Add any option lists this category needs under Admin -> Master Lists, scoped
   to this module slug so they override the global wording.
4. Restart the backend.

## Endpoints (provided automatically)
- `GET /api/modules/elevator_inspection/manifest`
- `GET /api/modules/elevator_inspection/form-schema`
- `GET /api/modules/elevator_inspection/stats`
