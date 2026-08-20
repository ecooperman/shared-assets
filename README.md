# shared-assets

Not an app - the shared look-and-feel host for every app under
`evancooperman.com`. Deployed like every other app in the fleet (systemd
unit + cloudflared ingress entry, see the root `DEPLOYMENT.md`), but it has
no database and does nothing but serve three static files:

| File | What it is |
|---|---|
| `static/theme.css` | Design tokens (`:root` colors/spacing) and shared component styles - accordion cards, add-toggle forms, message toasts, `.app-nav`, buttons, forms, modals. |
| `static/theme.js` | Shared DOM/fetch/date/UI helpers, exposed as `window.Global` (see table below). |
| `static/icons.js` | Shared inline-SVG icon registry (`ICONS` + `applyIcons()`) for `<span data-icon="name">` elements. |

`window.Global`'s full surface:

| Function | What it replaces |
|---|---|
| `Global.el(tag, attrs, children)` | The DOM-builder helper every app had its own copy of. |
| `Global.showMessage(text, kind, target?)` | The toast/feedback-bar helper (targets `#page-message` by default). |
| `Global.wireAccordionToggle(card, summary, details)` | The expand/collapse `toggle()` closure every card-builder had inline. |
| `Global.fetchJSON(url, options)` | The fetch-wrapper-with-error-detail every app had its own near-identical copy of. |
| `Global.domainFromUrl(url)` | Byte-identical in 3 apps before this move. |
| `Global.toISODate(isoDateTime)` / `Global.dateInputToISO(value)` / `Global.formatDateBadge(isoDateTime)` | Plain-date (no time-of-day) helpers duplicated in gifts/social-planning; trip-planning's richer time-of-day-aware helpers stayed local since nothing else needs them. |
| `Global.openModal(id)` / `Global.closeModal(id)` | Convenience wrappers around the `.hidden` class toggle; not required - the automatic Escape-key/backdrop-click dismiss wiring (below) works on any `.modal-overlay` regardless of how it was opened. |
| `Global.buildNav(items, mountId?)` | Renders `.app-nav` into `<div id="app-nav-mount">` from `[{href, icon, label, active}]` (or `{icon, label, onclick}` for an action button like Refresh) - generalized from trip-planning's `nav.js`, the only app that had this instead of hand-written nav HTML per page. |

theme.js also wires two **global, automatic** behaviors that need no per-app setup: pressing Escape or clicking a `.modal-overlay`'s backdrop closes any open modal (`theme.css`'s `.modal-overlay`/`.modal` component, promoted from time-management - the one app that had a modal pattern, extracted as reusable even though nothing else uses it yet).

**Before adding a new function here**, check for a same-named function already local to an app - a name collision with *different* behavior is a real risk, not just a rename. Confirmed one during this pass: time-management's own `toISODate(date)` takes a `Date` object and formats it to a string (calendar-grid logic) - the *opposite* direction of `Global.toISODate(isoString)` above, which slices an ISO string. Left local, not shared, specifically because of that collision.

## Run it

```bash
cd shared-assets
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

Then open http://127.0.0.1:8070 (host/port are set in `app/config.py`). No
database, no `alembic upgrade head` - this app is just three static files
behind a `no-store` cache header, see the table above.

## Why this exists

gifts, social-planning, time-management, and trip-planning independently
converged on the same visual language (collapsible accordion cards, a
"+ Add ___" toggle form, message toasts, a nav bar) by copy-pasting CSS/JS
between each other rather than sharing a source - to the point where some of
the duplicated code has comments literally saying "same as the jobs admin
page pattern." This repo is the fix: a single place to make a global
look-and-feel change, so it never means touching four (or more) separate
repos again.

## Consuming this from an app

Every consuming app's HTML pages are Jinja2 templates (in `templates/`, not
`static/` - rendered by an explicit `GET` route in `app/main.py`, not served
via `StaticFiles`), so the base URL is a template variable rather than a
hardcoded string:

```html
<link rel="stylesheet" href="{{ shared_assets_base }}/theme.css" />
...
<script src="{{ shared_assets_base }}/theme.js"></script>
<script src="{{ shared_assets_base }}/icons.js"></script>
```

`shared_assets_base` comes from `app/config.py`'s `SHARED_ASSETS_BASE`,
which is env-driven (see "Local dev" below) - so an app never needs a code
edit to switch between pointing at this repo's production deploy and a
locally-running copy of it. See the `fastapi-sqlite-scaffold` skill's
template (`app/main.py`, `app/config.py`, `templates/index.html`) for the
exact reference pattern any new HTML page should follow.

Local per-app files (`style.css`, `app.js`) should only contain what's
genuinely specific to that app - anything shared belongs here instead. If
you find yourself copy-pasting a CSS rule or a JS helper into a second app,
that's the signal to move it here instead.

## Cloudflare Access: deliberately public (Bypass)

Unlike every other hostname in the fleet, `static.evancooperman.com` is
carved out of the wildcard Access application with its own `Bypass`
policy - it loads with no login. This is intentional, not an oversight:

- It serves nothing sensitive - just CSS/JS, no user data, no API.
- Even under the wildcard Access app, Access issues a separate
  per-hostname session cookie. Nothing in normal app usage ever causes a
  browser to visit `static.evancooperman.com` directly, so gating it
  behind login meant a brand-new device/browser's first visit to *any*
  app would silently fail to load the shared theme (looked like a broken
  page, wasn't) until someone happened to visit this hostname on its own
  and log in - confirmed on 2026-08-17 (mobile Safari, private-window
  cookie isolation made it easy to reproduce).

Don't add an `Allow`/login requirement back to this hostname without
solving that cookie-dependency problem some other way first. See the
"Cloudflare Access" step in the root `DEPLOYMENT.md` for the full
reasoning and how the same pattern is used for the public
`resume.evancooperman.com` page.

## Local dev

Every consuming app's `SHARED_ASSETS_BASE` (`app/config.py`) is env-driven:

```python
ENV = os.environ.get("APP_ENV", "local")
SHARED_ASSETS_BASE = "https://static.evancooperman.com" if ENV == "production" else "http://127.0.0.1:8070"
```

`APP_ENV` defaults to `"local"` - so running any app locally with plain
`uvicorn app.main:app --reload` (no env var set) automatically points its
`theme.css`/`theme.js`/`icons.js` links at a **local** shared-assets
instance on port 8070, with no HTML/code edits and nothing to remember to
revert. To actually test against local changes here, just also run this
app locally (`uvicorn app.main:app --reload`, port 8070) alongside the app
you're testing.

On the droplet, `APP_ENV=production` is set once, system-wide, via
systemd's `DefaultEnvironment` (see `DEPLOYMENT.md`'s "One-time droplet
setup") - not per-service - so every app, including future ones, inherits
it automatically with zero deploy-config changes.

## Adding a new shared component

1. Check for a same-named function/class already local to an app first -
   see the collision note above. A shared/local name collision with
   different behavior is a real bug waiting to happen, not just a rename.
2. Add the CSS/JS/icon here first.
3. Update every consuming app to use it (rename local classes/call sites to
   match rather than inventing app-specific ones alongside the shared
   version).
4. Delete the now-redundant local copy from each app.

## Deploying a change

Same as any other app in the fleet - push to `main`, GitHub Actions
deploys it. Because 100% of this app's traffic is cacheable-by-extension
static assets, the Cloudflare Cache Rule bypass for
`static.evancooperman.com` (see `DEPLOYMENT.md`) matters more here than for
any other app - without it, a theme change can silently not show up
anywhere until a manual "Purge Everything."
