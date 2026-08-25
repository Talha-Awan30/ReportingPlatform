# Lifting Accessories

Slug `lifting_accessories` | Report prefix `LAC` | Validity 6 months

## Equipment covered
- Wire Rope Sling
- Web Sling
- Shackle
- Eye Bolts
- Hook
- Plate Clamp
- Lifting Beam
- Snatch Block (Pulley Block)
- Fall Arrestor
- Safety Harness
- Lift Line

## Status
Scaffolded - shows in the picker as **Not configured** until `sections` is filled in.

## To build out the checkpoint list
1. Add `Section(...)` / `Checkpoint(...)` entries to `sections` in `module.py`.
2. Drop the approved Word template into `templates/lifting_accessories_report_template.docx`.
3. Add any option lists this category needs under Admin -> Master Lists, scoped
   to this module slug so they override the global wording.
4. Restart the backend.

## Endpoints (provided automatically)
- `GET /api/modules/lifting_accessories/manifest`
- `GET /api/modules/lifting_accessories/form-schema`
- `GET /api/modules/lifting_accessories/stats`
