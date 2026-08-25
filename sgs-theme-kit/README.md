# SGS Theme Kit — Portable UI theme + login page

This folder is a **drop-in visual theme** extracted from an existing SGS-branded
portal. Copy the whole folder into another project and follow the instructions
below to make that project look identical.

It is **framework-agnostic** — the HTML files are plain HTML with no server-side
template code (no Jinja/Flask, no CSRF tokens). Wire the login form up to
whatever backend the target project uses.

---

## What's in this folder

```
sgs-theme-kit/
  README.md              ← this file (instructions for Claude / a developer)
  login.html             ← full two-panel login page (self-contained styles)
  navbar.html            ← standalone navbar (exact styling + markup + mobile menu)
  base-layout.html       ← page shell: navbar + footer + toast system (starter)
  css/
    style.css            ← THE global theme. All brand tokens live in :root here.
  chart-colors.js        ← SGS pie/doughnut/bar/line chart color palette (+ Chart.js example)
  js/
    main.js              ← small helpers (nav active-state, submit spinner, toasts)
  img/
    login-bg.jpg               ← industrial photo behind the login left panel
    sgs-logo.png               ← primary logo (for LIGHT backgrounds / navbar)
    sgs-logo-secondary.png     ← white logo (for DARK backgrounds / login panel)
    sgs-logo-tagline.png       ← logo + "When you need to be sure" tagline (light)
    sgs-logo-tagline-secondary.png ← same, white version
    favicon.ico                ← multi-res favicon
    favicon-256.png            ← PNG favicon fallback
```

---

## The brand system (read before editing colors)

All colors are CSS variables in the `:root` block at the top of
[`css/style.css`](css/style.css). **Never hardcode hex values** in your
templates — use the variables.

| Token | Value | Meaning |
|-------|-------|---------|
| `--primary-color` | `#ff6600` | **SGS Orange** — used *sparingly*: primary CTAs, focus rings, links, active state, the login button & cycling phrase. |
| `--secondary-color` | `#3c515b` | **SGS Charcoal Blue** — headings, nav text, icon strokes, and the default color of `.btn-primary`. |
| `--success-color` | `#57c785` | green (charts / status) |
| `--warning-color` | `#faa61a` | yellow |
| `--danger-color` | `#f5262e` | red |
| `--info-color` | `#49738b` | blue |
| `--text-primary` | `#252525` | body copy |
| `--text-muted` | `#738289` | secondary text |
| `--bg-primary` | `#ffffff` | dominant surface (white) |
| `--bg-secondary` | `#f6f9fc` | card / section background |

**Cardinal brand rules:**
- **White dominates.** Orange is a *deliberate accent*, never a background wash.
- **Headings are Charcoal Blue**, not orange, not black.
- **`.btn-primary` is Charcoal Blue** site-wide (this is intentional — do not
  "fix" it back to orange). The only orange button is `.btn-cta` (one deliberate
  orange action per button group) and the login `.btn-login`.
- **No gradients** — the `--gradient-*` variables resolve to flat solid colors on
  purpose.
- **Font is Roboto** (loaded from Google Fonts in each HTML `<head>`).
- Icons are **Font Awesome 6** (loaded from CDN in each `<head>`).

---

## How to apply this to another project

### 1. Copy assets
Copy `css/`, `js/`, and `img/` into the target project's static/asset folder.
Adjust the paths below to match where that project serves static files from
(e.g. `/static/css/style.css`, `/assets/...`, a bundler import, etc.).

### 2. Link the stylesheet + fonts in the target's base layout `<head>`
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/static/css/style.css">   <!-- adjust path -->

<link rel="icon" type="image/x-icon" href="/static/img/favicon.ico">
<link rel="icon" type="image/png" sizes="256x256" href="/static/img/favicon-256.png">
```

### 3. Use the login page
`login.html` is fully self-contained (its styles are inline in a `<style>` block,
it only depends on `css/style.css` for a couple of shared tokens plus the fonts/
icons). To adopt it:
- Point the asset `src`/`href` paths at the target project's static location.
- **Wire the `<form>`**: set `action` and `method` to the target's login route.
  If the framework needs a CSRF token, add a hidden input inside the form.
- Render server-side login errors using the `.flash-messages` / `.alert` markup
  shown in the commented block near the top of `<body>`.
- Edit the `PHRASES` array in the page's `<script>` and the `<h1>Portal</h1>` /
  feature list to match the new project's wording.
- The left panel logo uses **`sgs-logo-secondary.png`** (white) because the panel
  is dark; the navbar uses **`sgs-logo.png`** (dark) because the navbar is white.

### 4. Use the navbar (exact copy of this site's navbar)
[`navbar.html`](navbar.html) is the site's navbar pulled out on its own:
- Its `<style>` block has all the navbar CSS (logo, dropdowns, user block,
  notification badge, hamburger + mobile slide-in menu).
- The `<nav>` markup and the `toggleMobileMenu()` script are ready to paste.
- Depends on `css/style.css` (for `.navbar`, `.nav-link`, `.user-avatar`,
  `.logout-btn` and the brand variables) plus Roboto + Font Awesome.
- Fix asset paths (`img/sgs-logo.png`) and `href="#"` links, then replace the
  placeholder user name / role / avatar initial. The navbar uses the **dark**
  logo (`sgs-logo.png`) because the navbar is white.

### 5. Use the base layout (optional starter)
`base-layout.html` shows the matching navbar, footer, mobile hamburger menu, and
the site-wide toast system. Port the `<nav>`, `<footer>`, the two inline
`<script>` blocks (mobile menu + `showToast`), and the toast `<style>` into the
target project's master template, then replace the placeholder menu items with
real links.

### 6. Reusable component classes already in `style.css`
Once the stylesheet is linked, these classes work anywhere:
- **Buttons:** `.btn` + `.btn-primary` (charcoal), `.btn-cta` (orange),
  `.btn-secondary`, `.btn-outline`, `.btn-danger`, `.btn-sm` / `.btn-lg`, `.btn-block`
- **Cards / grids:** `.service-card`, `.stat-card`, `.info-card`, `.services-grid`,
  `.stats-grid`, `.actions-grid`, `.container` / `.container-full`
- **Tables:** wrap in `.table-container`, use `.admin-table`
- **Forms:** `.admin-form`, `.form-row`, `.form-group` (label + input),
  `.form-card-large`, `.form-actions`
- **Badges / alerts:** `.badge-success|warning|danger|info|primary`,
  `.alert-success|danger|warning|info`
- **Breadcrumb:** `.breadcrumb` with `.sep` and `.current`
- **Toasts:** call `window.showToast('Saved!', 'success')` (needs the toast
  container + script from `base-layout.html`)

The stylesheet includes a responsive safety-net (breakpoints at 1024 / 768 / 480px)
so pages using these conventional class names are mobile-friendly automatically.

### 7. Chart / pie-chart colors
[`chart-colors.js`](chart-colors.js) has the exact SGS chart palette used on the
portal's analytics dashboard. Include it, then use:
- `PIE_COLORS` — ordered 10-color array for pie / doughnut / multi-series charts
  (pass straight to a Chart.js dataset's `backgroundColor`).
- `SGS` — named tokens (`SGS.primary`, `SGS.info`, `SGS.success`, `SGS.warning`,
  `SGS.danger`, `SGS.plum`, greys…) for single-series or hand-picked charts.
- `STATUS_COLORS` — semantic colors for Won / Lost / Pending / Paid pies.

The file has a copy-paste Chart.js pie example in a comment. Brand rule: the
"Won" / primary slice renders in **SGS Orange**, not green.

---

## Notes
- `login-bg.jpg` is ~2.3 MB. Consider compressing it if page-load size matters.
- All animations respect `prefers-reduced-motion`.
- Nothing here depends on a specific backend — it's HTML/CSS/vanilla-JS only.
