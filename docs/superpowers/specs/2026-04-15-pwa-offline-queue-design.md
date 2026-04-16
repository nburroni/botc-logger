# PWA + Offline Submit Queue — Design

**Status:** Approved (awaiting implementation plan)
**Date:** 2026-04-15
**Scope:** First of four planned features (PWA + offline, validation, recent games view, edit/undo). This spec covers only PWA + offline.

---

## 1. Problem

`botc-logger` is used in-person at venues with flaky wifi. Two failure modes today:

1. **Page won't open offline** — the app is a static SPA served from GitHub Pages, but the browser still needs network to fetch `index.html`, `app.js`, and `styles.css` unless they're already in HTTP cache.
2. **Submits silently vanish** — `submitGame()` posts to the Apps Script endpoint and, if the request fails, shows a toast. The payload is not preserved; the user has to remember and retype it. Data loss at a real table is a non-starter.

This spec makes the app installable as a PWA that opens offline, and adds an offline-tolerant submit queue that never loses a game.

## 2. Goals & Non-goals

**Goals**
- App shell loads with zero network.
- Submits always succeed from the user's perspective as soon as the form is filled — either synced immediately or queued for later.
- Queued games survive tab close, reload, and `clearSession()` (the existing "reset" button that clears auth cookies).
- The user can peek at the queue, manually retry, or delete entries.
- Non-retryable errors (e.g., auth) are surfaced distinctly so data isn't silently stranded.

**Non-goals**
- Caching dynamic autocomplete options from the sheet (existing "Offline — using built-in lists" UX is sufficient).
- Reading games back from the sheet (deferred to the Recent Games feature).
- Push notifications or background sync via `SyncManager` (not widely/reliably supported on iOS Safari — we rely on app-open triggers instead).

## 3. Design decisions (from brainstorming)

| # | Decision |
|---|---|
| Q1 | **Scope B:** service-worker-cached app shell; submits queue; autocomplete falls back to static lists when offline. |
| Q2 | **UX C:** optimistic — form resets immediately on queue, badge in header shows pending/failed counts, tap to open a queue list. |
| Q3 | **Triggers B + C:** event-driven (`online`, `visibilitychange`, post-submit) + periodic 30s while pending is non-empty + manual retry from the list view. |
| Q4 | **Failure policy A:** non-retryable responses (`Unauthorized`, other `error`) move to a separate `failed` bucket so nothing is silently lost; pending drains independently where possible. |
| Q5 | **PWA basics:** reuse existing `.webp` logo (export PNGs at 192/512), app name "BotC Logger", theme color `#6c5ce7`, background `#0f0f13`. |
| UI | **Bottom-sheet** overlay for the queue list (not a centered modal). Consultative UX vs. the auth-blocking setup overlay. |

## 4. Architecture

### 4.1 New files

| Path | Purpose |
|---|---|
| `manifest.webmanifest` | PWA manifest: name, short_name, icons, theme, display=standalone, start_url=`/`. |
| `sw.js` | Service worker at repo root (scope = `/`). Caches shell, classifies requests. |
| `icons/icon-192.png`, `icons/icon-512.png` | Homescreen icons generated from the existing `.webp`. |

### 4.2 Modified files

| Path | Change |
|---|---|
| `index.html` | Add `<link rel="manifest">`, `<meta name="theme-color">`, SW registration script, queue-badge element in header. |
| `styles.css` | Queue-badge styles, bottom-sheet overlay, queue row cards. |
| `app.js` | New queue module + queue-UI module (same file, clear section boundaries); wire into `submitGame()`. |
| `Code.gs` | **No changes.** |

### 4.3 Module boundaries inside `app.js`

Two new logical modules, each a separate section in the file so they can later be lifted into their own files without restructuring:

- **Queue module** — sole owner of both localStorage buckets.
  - `queue.submit(payload) → Promise<{synced: true, row} | {queued: true}>`
  - `queue.drain() → Promise<{synced, failed}>`
  - `queue.getPending()`, `queue.getFailed()`
  - `queue.retry(id, bucket)`, `queue.delete(id, bucket)`
  - Emits `botc:queue-changed` on the window after every mutation.

- **Queue-UI module** — renders badge + bottom-sheet list.
  - Reads via queue getters. Never writes to storage directly.
  - Subscribes to `botc:queue-changed` to re-render.

The two modules never reference each other's internals. Pub/sub + getters is the contract.

## 5. Service worker strategy

### 5.1 Caching

| Request kind | Strategy | Rationale |
|---|---|---|
| Navigation (HTML) | **Network-first**, fall back to cached `index.html` on failure | Always get the latest shell when online, but open offline. |
| Same-origin static (`/app.js`, `/styles.css`, `/icons/*`, `/manifest.webmanifest`) | **Stale-while-revalidate** | Instant load; background updates for next visit. |
| `script.google.com/*`, `script.googleusercontent.com/*` (Apps Script endpoint) | **Network-only, never cached** | Caching redirect-chain auth responses is a footgun; the submit queue handles offline writes. |

### 5.2 Precache at install

- `/`
- `/index.html`
- `/app.js`
- `/styles.css`
- `/manifest.webmanifest`
- `/icons/icon-192.png`
- `/icons/icon-512.png`

### 5.3 Versioning & updates

- Cache name `botc-logger-v1`. Bump suffix with any shell change.
- `install` precaches, `activate` deletes caches that don't match the current name, then `clients.claim()`.
- `skipWaiting()` so a new SW takes control on first load after deploy (no "refresh twice" footgun).
- When a new SW installs while the app is open, the page listens for `controllerchange` and shows a non-blocking toast: **"Update available — reload to apply."** No forced reload mid-game.

## 6. Queue data model & flow

### 6.1 Storage keys

```
localStorage["botc_logger_queue_pending"] = [ ...entries ]
localStorage["botc_logger_queue_failed"]  = [ ...entries ]
```

### 6.2 Entry shape

```json
{
  "id": "<crypto.randomUUID()>",
  "createdAt": 1734567890123,
  "payload": { /* full submitGame payload, including key */ },
  "attempts": 0,
  "lastError": null
}
```

`id` is stable across reloads; safe to use as a DOM key in the list view.

### 6.3 Submit path

`submitGame()` stops doing its own `fetch` and delegates to `queue.submit(payload)`:

1. If `navigator.onLine`, try one `fetch`:
   - `2xx` + `{success:true, row}` → resolve `{synced:true, row}`.
   - `2xx` + `{error:"Unauthorized"}` → **do not enqueue**; propagate so the existing flow calls `clearSession("Wrong password — please re-enter")`.
   - Any other response or network error → enqueue to `pending`, resolve `{queued:true}`.
2. If offline, skip the attempt, enqueue directly, resolve `{queued:true}`.
3. The caller branches on the result:
   - `synced` → "Game logged! (row N)", normal reset.
   - `queued` → "Saved offline — will sync when online", same reset.

### 6.4 Drain loop

`queue.drain()` is the only thing that actually processes the queue.

```
Guard: if isDraining, set pendingRerun=true and return.
isDraining = true
let synced = 0, failed = 0
for each entry in snapshot(pending):
  result = await fetch(payload)
  if 2xx && success → remove from pending; synced++
  elif 2xx && error === "Unauthorized" → move to failed; failed++; BREAK
  elif 2xx && error → move to failed; failed++; continue
  else (network or 5xx) → entry.attempts++; save; BREAK
isDraining = false
if pendingRerun → drain() again
```

Emit `botc:queue-changed` after every mutation. After the loop, if `synced > 0`, show one toast: `"Synced N games"`.

### 6.5 Triggers

- `window.addEventListener("online", drain)`
- `document.addEventListener("visibilitychange", ...)` on becoming visible
- After any successful online submit (piggyback on the open connection)
- `setInterval(drain, 30_000)` started when pending becomes non-empty, cleared when both buckets reach zero.

## 7. UI

### 7.1 Header badge

- Rendered inside the existing `.header` grid, adjacent to the reset button.
- Hidden when `pending.length === 0 && failed.length === 0`.
- Pending-only: subdued pill, `↻ 2`.
- With failures: red accent, `↻ 2 · ⚠ 1`.
- `aria-label="Sync queue: 2 pending, 1 failed"`.
- Tap opens the bottom-sheet.

### 7.2 Bottom-sheet queue list

- Slides up from the bottom on mobile; centers as a ≤500px dialog on desktop (same markup).
- Drag-handle at top; tap backdrop or Esc to dismiss; focus trap while open.
- Sections: **Pending**, **Failed**. Empty sections are not rendered.
- Each row: date · event · script · ST, plus per-row actions:
  - **Pending:** `Retry now` (single-entry drain), `Delete` (with inline confirm).
  - **Failed:** shows `lastError` text, `Retry` (moves back to pending, kicks `drain`), `Delete` (inline confirm).
- Sticky bottom button: `Retry all` when anything retryable exists.

### 7.3 Toasts

- Online success: `"Game logged! (row N)"` (unchanged).
- Queued: `"Saved offline — will sync when online"`.
- Drain summary: `"Synced N games"` (only when N ≥ 1).
- New failure: `"1 game needs attention"`, badge turns red.
- SW update: `"Update available — reload to apply"`.

## 8. Invariants

1. **`clearSession()` must not touch the queue buckets or the Game Info prefill.** Only `STORAGE_KEY` and `AUTH_KEY` cookies are cleared. The implementation will include an inline comment and a `__qa` sanity check for this.
2. **Queue writes are atomic.** Every mutation is a read → mutate → `JSON.stringify` → `localStorage.setItem` cycle in one synchronous block. No async between read and write.
3. **`isDraining` guard ensures no double-submits** when multiple triggers fire simultaneously.
4. **Auth failures halt the drain** to avoid bombarding the server with doomed requests; other errors are isolated per-entry.

## 9. Verification checklist

No unit test harness exists in this repo; verification is manual with help from dev-only seed functions.

### 9.1 `window.__qa` helpers

Exposed from `app.js`:
- `__qa.seedPending(n)` — push n fake entries into pending.
- `__qa.seedFailed(n)` — same for failed.
- `__qa.goOffline()` / `__qa.goOnline()` — monkey-patch `fetch` to reject/restore, dispatch `online`/`offline` events. (`navigator.onLine` itself is read-only; this simulates the condition.)
- `__qa.clearAll()` — wipe both buckets.

### 9.2 Scenarios (must all pass before merging)

1. Install as PWA on iOS/Android homescreen; icon and "BotC Logger" label correct.
2. Open with airplane mode on: shell loads, form usable, autocomplete is static-only.
3. Submit offline → "Saved offline" toast, form resets, badge shows `↻ 1`.
4. Turn wifi back on → auto-drain fires, "Synced 1 game" toast, row present in sheet.
5. Queue 3 games → drop wifi → come back → all three sync in FIFO order.
6. `__qa.seedFailed(1)` → badge red, bottom-sheet shows entry with retry + delete.
7. **Tap reset (`clearSession`) with queue non-empty → auth overlay shows, but both buckets are preserved.**
8. Seed pending → close tab → reopen → pending preserved.
9. Deploy a new shell → existing open page shows "Update available" toast; reload applies it.
10. Start a `drain`; while it's in flight, tap "Retry" on a pending row → no double-submit (guard holds).

Scenarios 7, 9, 10 are the highest-risk regression surfaces.

## 10. Out of scope / deferred

- Autocomplete options cached across sessions (would belong in a future "offline autocomplete" spec if ever needed).
- `SyncManager` / Background Sync API — not reliably available on iOS Safari as of 2026; app-open + `online` event coverage is sufficient for the target use case.
- Any `Code.gs` changes. The queue mirrors the existing POST contract exactly.

## 11. Follow-on work (next specs)

1. **Validation** — soft pre-submit warnings for likely-wrong rows.
2. **Recent games view** — read-back from the sheet via a new `doGet` path.
3. **Edit / undo** — `PATCH`-style path in `doPost` keyed by row number, wired into the recent-games view.

Each gets its own brainstorm → spec → plan → implementation cycle.
