# SGS Lifting Equipment Reporting Platform

Inspection to client approval on one platform. Inspectors fill a digital form,
the Word report is generated from the approved template, a reviewer approves it,
the client signs it off in their own portal, and certification expiry reminders
go out automatically.

- **Backend** — Python / Flask, SQLAlchemy, JWT auth
- **Frontend** — React (Vite), styled with the SGS theme kit
- **Each inspection item is its own module** — a self-contained folder under
  `backend/modules/` with its own manifest, blueprint and report templates

---

## Quick start

Two terminals.

**Backend** (http://localhost:5000)

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # edit if you need real SMTP or Postgres
flask --app app seed              # tables, master lists, equipment types, admin account
python app.py
```

**Frontend** (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in.

### Signing in

| Username | Role | Password |
|---|---|---|
| `admin` | Administrator | `123` |

This is the only account the seeder creates. Add inspectors, reviewers and
client users from **Admin -> Users & Roles** once you are signed in.

Change the admin password before this platform is exposed to anyone.

---

## Layout

```
ReportingPlatform/
├── backend/
│   ├── app.py                  application factory + CLI commands
│   ├── config.py               all configuration, read from .env
│   ├── extensions.py           db / migrate / jwt / cors singletons
│   ├── seed.py                 master lists, equipment types, admin account
│   ├── models/                 users, clients, jobs, equipment, reports, alerts
│   ├── core/                   one blueprint per area of the platform
│   │   ├── auth/  clients/  jobs/  equipment/  reports/
│   │   ├── users/  masterlists/  alerts/  dashboard/
│   │   └── inspection_modules/ the module registry, exposed to the frontend
│   ├── modules/                ← ONE FOLDER PER INSPECTION ITEM
│   │   ├── base.py             ModuleSpec / Section / Checkpoint
│   │   ├── blueprint_factory.py the endpoints every module gets free
│   │   ├── _template/          copy this to start a new item
│   │   ├── elevator/           fully built out (85 checkpoints)
│   │   └── overhead_crane/ mobile_crane/ forklift/ chain_block/
│   │       wire_rope_sling/ man_lift/ escalator/     ← scaffolded
│   ├── services/               docx generation, storage, mail, expiry scan
│   └── utils/                  errors, auth decorators, validation, paging
│
├── frontend/
│   ├── public/img/             SGS logos, favicon, login background
│   └── src/
│       ├── api/                axios client + typed endpoint wrappers
│       ├── auth/               AuthContext + ProtectedRoute
│       ├── components/         Layout, Navbar, Toast, modal/form/table UI
│       ├── pages/              one file per screen (admin/ and portal/ nested)
│       ├── styles/             theme.css (from the kit) + app.css
│       └── utils/chartColors.js  the SGS chart palette
│
└── sgs-theme-kit/              the original theme kit, kept for reference
```

---

## Adding a new inspection item

This is the point of the module system — it is a filesystem operation, and no
other file in the codebase changes.

```bash
cd backend/modules
cp -r _template my_new_item
```

1. Edit `my_new_item/module.py`: set the `slug`, `name`, `report_prefix`, and
   fill `sections` with `Section(...)` / `Checkpoint(...)` from the approved
   check-list.
2. Drop the approved Word template into `my_new_item/templates/`.
3. Restart the backend.

The module now appears in the picker, gets its own report numbering, its own
form, and these endpoints automatically:

```
GET /api/modules/my_new_item/manifest
GET /api/modules/my_new_item/form-schema
GET /api/modules/my_new_item/stats
```

`flask --app app list-modules` shows what is registered and whether each module
is configured or still a scaffold.

### Where the dropdown wording lives

Checkpoints reference an option list by key (`inspection_result`,
`load_test_result`, …). Those lists are database rows edited under
**Admin → Master Lists**, not code. A list scoped to a module overrides the
global list with the same key, so one module can reword a checkpoint without
affecting the others. Each option carries the exact clause printed into the Word
report.

---

## The workflow

```
Inspector fills the form  →  submits (required checkpoints enforced)
                          →  Word report generated from the template
Reviewer                  →  approves & releases,  or returns for correction (revision +1)
Client                    →  approves,             or raises a query
```

Every transition writes a `ReportEvent`, so the full approval trail — who
submitted, who reviewed, who approved, with dates — is answered from the system.

Approving a report sets the certificate expiry (from the request, or from the
equipment type's validity) and copies it onto the equipment record, which is what
the expiry scan reads.

### Two photo sets, on purpose

Front-page photos and inspection photos are uploaded and stored separately, so
the cover of the report and the body of the report can never get mixed up.

---

## Certification expiry alerts

The scan runs daily at 07:00 and emails at **60, 30 and 7 days** before expiry,
then escalates once the date passes. Thresholds are configurable via
`ALERT_THRESHOLDS` in `.env`.

One `ExpiryAlert` row is written per (equipment, threshold, expiry date), so a
reminder is never sent twice — and a new inspection that moves the expiry date
raises a fresh set of reminders against the new date.

Recipients: client contacts flagged **Receives alerts**, the job's team lead, and
an office copy to every active admin.

Run it on demand:

```bash
flask --app app scan-expiry --dry-run    # show what would be sent
flask --app app scan-expiry              # send
```

Admins can also trigger it from **Expiry Alerts → Run scan now**.

With `MAIL_ENABLED=false` (the default) messages are logged instead of sent, so
the pipeline can be exercised without an SMTP server.

---

## Word report generation

`services/docx_generator.py` fills the module's template with `docxtpl`. Selected
dropdown values are replaced with their approved `report_text` clause on the way
in, and both photo sets are embedded.

If a module has not supplied a template yet, a complete fallback document is
built with `python-docx` — header block, every checkpoint section, comments,
photos and the sign-off table — so the workflow works end to end before the
approved template arrives.

Template placeholders available: `report_number`, `client_name`, `job_number`,
`equipment_tag`, `equipment_type`, `serial_number`, `manufacturer`, `model`,
`swl`, `capacity`, `location`, `inspection_date`, `certificate_expiry_date`,
`overall_result`, `comments`, `inspector_name`, `reviewer_name`, plus the
`sections` loop and the `front_page_photos` / `inspection_photos` lists.

---

## Roles

| Role | Sees |
|---|---|
| **Inspector** | Their own reports, plus anything already released. Creates and submits. |
| **Reviewer** | Everything. Owns the review queue: approve, or return for correction. |
| **Client** | Only their own organisation's records, and only reports that have been approved. |
| **Admin** | Everything, plus users, master lists and equipment types. |

Scoping is enforced in the API, not just hidden in the UI — a client's token
cannot read another client's reports.

---

## Configuration

Everything is read from `backend/.env` (see `.env.example`).

| Key | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | SQLite in `backend/instance/` | Point at Postgres for production |
| `SECRET_KEY` / `JWT_SECRET_KEY` | dev values | **Replace before deploying** |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed frontend origins |
| `MAIL_ENABLED` | `false` | `true` to actually send alert emails |
| `ALERT_THRESHOLDS` | `60,30,7` | Days before expiry to send reminders |
| `MAX_CONTENT_LENGTH_MB` | `32` | Upload size cap |

Switching to Postgres needs only `DATABASE_URL` — the models are portable and
the dashboard aggregations avoid SQLite-specific SQL.

---

## Useful commands

```bash
flask --app app seed              # master lists, equipment types, admin account
flask --app app list-modules      # what is registered, and what is still a scaffold
flask --app app scan-expiry       # run the expiry scan now
flask --app app db migrate -m ""  # generate a migration after a model change
flask --app app db upgrade        # apply migrations

npm run dev                       # frontend dev server
npm run build                     # production bundle into frontend/dist
```

---

## Phase status

Against the phase plan in `website material/`:

| Phase | Scope | Status |
|---|---|---|
| 1 | Core report form — job & client, equipment, dropdowns, comments, drafts | Built |
| 2 | Photos & Word output — both photo sets, template fill, download, numbering | Built |
| 3 | Review & approval — reviewer queue, return for correction, approval trail | Built |
| 4 | Client portal & alerts — client login, approval, record search, expiry emails | Built |

Per-item checkpoint lists are the remaining work: **Elevator** is fully built out
from the approved check-list; the other seven modules are scaffolded and waiting
for their check-lists.

Not in scope yet: management dashboard trends, mobile/offline entry, report QR
verification, bulk equipment import.
