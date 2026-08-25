# Chain Block & Hoist module

Slug: `chain_block` &nbsp;|&nbsp; Report prefix: `CHB` &nbsp;|&nbsp; Validity: 12 months

## Status
Scaffolded. `module.py` has an empty `sections` list, so the module shows in the
picker as **Not configured** and no inspection form is rendered yet.

## To build it out
1. Add `Section(...)` / `Checkpoint(...)` entries to `sections` in `module.py`.
2. Drop the approved Word template into `templates/chain_block_report_template.docx`.
3. Add any option lists this item needs under Admin -> Master Lists, scoped to
   this module slug so they override the global wording.
4. Restart the backend - the registry picks the changes up on import.

## Endpoints (provided automatically)
- `GET /api/modules/chain_block/manifest`
- `GET /api/modules/chain_block/form-schema`
- `GET /api/modules/chain_block/stats`
