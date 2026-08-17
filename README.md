# shared-assets

Not an app - the shared look-and-feel host for every app under
`evancooperman.com`. Deployed like every other app in the fleet (systemd
unit + cloudflared ingress entry, see the root `DEPLOYMENT.md`), but it has
no database and does nothing but serve three static files:

| File | What it is |
|---|---|
| `static/theme.css` | Design tokens (`:root` colors/spacing) and shared component styles - accordion cards, add-toggle forms, message toasts, `.app-nav`, buttons, form basics. |
| `static/theme.js` | Shared DOM/UI helpers (`el`, `showMessage`, `wireAccordionToggle`), exposed as `window.Theme`. |
| `static/icons.js` | Shared inline-SVG icon registry (`ICONS` + `applyIcons()`) for `<span data-icon="name">` elements. |

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

In every HTML page, before the app's own local `style.css`/`app.js`:

```html
<link rel="stylesheet" href="https://static.evancooperman.com/theme.css" />
...
<script src="https://static.evancooperman.com/theme.js"></script>
<script src="https://static.evancooperman.com/icons.js"></script>
```

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

Consuming apps point at the production hostname even when developed
locally - it's just CSS/JS/icons, no secrets, no per-environment behavior,
so there's no reason to run a local copy of this service day-to-day. To
test a theme change before deploying it, run this app locally
(`uvicorn app.main:app --reload`) and temporarily point a consuming app's
`<link>`/`<script>` tags at `http://127.0.0.1:8070/...`.

## Adding a new shared component

1. Add the CSS/JS/icon here first.
2. Update every consuming app to use it (rename local classes to match
   rather than inventing app-specific ones alongside the shared version).
3. Delete the now-redundant local copy from each app.

## Deploying a change

Same as any other app in the fleet - push to `main`, GitHub Actions
deploys it. Because 100% of this app's traffic is cacheable-by-extension
static assets, the Cloudflare Cache Rule bypass for
`static.evancooperman.com` (see `DEPLOYMENT.md`) matters more here than for
any other app - without it, a theme change can silently not show up
anywhere until a manual "Purge Everything."
