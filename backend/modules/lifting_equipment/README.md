# Lifting Equipment

Slug `lifting_equipment` | Report prefix `LEQ` | Validity 12 months

## Equipment covered
- Mobile Crane
- Pipe Layer / Side Boom
- Tower Crane
- Jib Crane
- Fork Lift Truck
- Stacker
- Scissor lift / Snorkel / Genie / Elevated Platform
- Overhead Crane
- Hoist
- Hand Pallet Truck
- Power Pallet Truck
- Hydraulic Jack
- Dock Leveler
- Tripod

## Status
Scaffolded - shows in the picker as **Not configured** until `sections` is filled in.

## To build out the checkpoint list
1. Add `Section(...)` / `Checkpoint(...)` entries to `sections` in `module.py`.
2. Drop the approved Word template into `templates/lifting_equipment_report_template.docx`.
3. Add any option lists this category needs under Admin -> Master Lists, scoped
   to this module slug so they override the global wording.
4. Restart the backend.

## Endpoints (provided automatically)
- `GET /api/modules/lifting_equipment/manifest`
- `GET /api/modules/lifting_equipment/form-schema`
- `GET /api/modules/lifting_equipment/stats`
