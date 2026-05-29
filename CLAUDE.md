# CLAUDE.md

Guidance for working in this repo. Read this before making changes.

## What this is

A **Blood on the Clocktower game logger**: a static, installable PWA that POSTs games to a Google Apps Script backend, which appends rows to a Google Sheet. **No build step, no framework, no bundler** — the files served are the files you edit.

## Architecture

| File | Responsibility |
|---|---|
| `index.html` | Markup: setup overlay, header, Log/Recent tabs, form, bottom sheets (queue, game detail, diagnostics). Inline `<script>` at the bottom registers the service worker. |
| `app.js` | All client logic: auth, autocomplete, form submit, the offline **submit queue**, Recent Games view, Diagnostics panel, debug log. Classic script (not a module): top-level `function` declarations are globals; top-level `let`/`const` are lexical. |
| `styles.css` | All styling. Note: there is **no generic `.hidden { display:none }`** — each component needs its own `.X.hidden { display:none }` rule. |
| `sw.js` | Service worker. `CACHE_VERSION` busts the cache. Navigation = network-first; same-origin static = stale-while-revalidate; Apps Script hosts = never cached. |
| `Code.gs` | Google Apps Script backend (`doGet` for options/history via JSONP+JSON, `doPost` to append a row). Deployed separately (see below). |
| `Makefile` | `clasp`-based deploy helpers + `make release`. |
| `tools/*.mjs` | Node `vm` test harnesses (`app-harness.mjs` for app.js, `gas-harness.mjs` for Code.gs). |
| `test/*.test.mjs` | `node --test` suites. |

The `COL` map in `Code.gs` is the **single source of truth** for sheet columns (currently A–AI; `clientId` lives at AB, `specialWinType` at AI).

## Critical workflows — get these wrong and prod silently breaks

### Deploying Code.gs
After the first deploy, **never create a new deployment** — that mints a new URL the app doesn't use, so your edits never reach production. Update the existing deployment **in place**:
- `make deploy` (runs `clasp push` + `clasp deploy -i <APPS_SCRIPT_DEPLOYMENT_ID>` — new version, same URL), or
- Apps Script UI: Deploy → Manage deployments → ✏️ → Version: New version → Deploy.

Any change to `Code.gs` requires a redeploy to take effect.

### Shipping frontend changes
The PWA caches the shell. **Any change to `app.js` / `index.html` / `styles.css` / `sw.js` must bump the version**, or installed PWAs keep serving stale code:
```
make release V=vN   # rewrites CACHE_VERSION (sw.js) AND APP_VERSION (app.js) together
```
`APP_VERSION` shows in the Diagnostics panel; users can confirm they're on the new build and tap **Force update** there to drop a stale service worker without DevTools.

## Networking model (important nuances)

- **POSTs are CORS-masked.** Apps Script redirects POSTs to `script.googleusercontent.com`, which doesn't echo CORS headers — so `fetch()` rejects with `TypeError` even though the row was written. The client treats "fetch threw while `navigator.onLine`" as **provisional success** to avoid endless retries + duplicate rows.
- **Idempotency:** every payload carries a `clientId` UUID; `doPost` dedups on it (column AB) so retries can't duplicate rows.
- **GETs are readable** (that's why connect/options work). `verifyAuth()` uses the GET path to catch rejected credentials that the CORS-masked POST hides.
- **Server guard:** `doPost` rejects payloads missing required fields (mirrors the client's `REQUIRED_FIELDS`) so a half-row can never land.
- **Never log the auth hash.** The debug log records full payloads via `redactPayload()` (strips `key`).

## Testing

```
npm test        # node --test, zero dependencies
```
Tests load the *real* `app.js` / `Code.gs` into a `node:vm` context with stubbed browser/Apps-Script globals (`tools/app-harness.mjs`, `tools/gas-harness.mjs`). When adding features to the queue logic or `doPost`, add tests. Note: vm objects live in a different realm, so assert property-wise rather than `deepEqual` on objects created inside the context.

## Conventions

- **Never add a `Co-Authored-By` trailer** to commits.
- Commit messages: `type: summary` (feat/fix/docs/test/chore/build/ci/release).
- `docs/superpowers/` is gitignored (local planning artifacts).
- Prefer small, focused changes; follow existing patterns in each file.
