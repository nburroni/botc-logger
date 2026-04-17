# PWA + Offline Submit Queue Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `botc-logger` installable as a PWA that opens offline, and add an offline-tolerant submit queue so no logged game is ever lost to flaky venue wifi.

**Architecture:** A service worker at the repo root caches the app shell and classifies fetches by host. A queue module inside `app.js` owns two `localStorage` buckets (pending + failed), exposes a narrow API (`submit`, `drain`, `retry`, `delete`, getters), and publishes state changes via a `botc:queue-changed` window event. A queue-UI module renders a header badge plus a bottom-sheet list of queued games, subscribing to the same event. Neither `submitGame()` nor `clearSession()` touch `localStorage` directly — only the queue module does.

**Tech Stack:** Vanilla JS / HTML / CSS SPA, no build step, no test runner. Service Worker API, localStorage, `fetch`. Apps Script backend unchanged. Verification is manual via the `preview_start`/`preview_eval` dev-server loop plus an in-app `window.__qa` namespace of dev helpers.

**Spec:** `docs/superpowers/specs/2026-04-15-pwa-offline-queue-design.md`

**Branch:** `feat/pwa-offline-queue` (already checked out; design doc committed).

## Conventions & ground rules

- **No test harness.** Every task's "verify" step uses `preview_eval` against the running preview server (serverId obtained via `preview_list`). Treat it as the test runner.
- **Commits are per-task** unless the task explicitly says otherwise. Target: one clean commit per green task.
- **Never touch `.env`, `.clasp.json`, or the Apps Script deployment from this plan** — no backend work is required here.
- **Invariant sweeps:** before each commit, confirm `clearSession()` still ignores queue keys (visual scan is sufficient — task 11 adds the explicit check).
- **File writes are whole files (for new files) or targeted `Edit` calls (for existing).** Do not reformat existing code.

## File structure

| Path | Create/Modify | Responsibility |
|---|---|---|
| `manifest.webmanifest` | Create | PWA manifest — name, icons, theme, standalone display. |
| `sw.js` | Create | Service worker — shell precache, fetch classification by host, update control. |
| `icons/icon-192.png` | Create | 192×192 homescreen icon (from `botc_head.webp`). |
| `icons/icon-512.png` | Create | 512×512 homescreen + splash icon. |
| `index.html` | Modify | `<link rel="manifest">`, `<meta theme-color>`, SW registration, badge + bottom-sheet markup. |
| `styles.css` | Modify | Badge + bottom-sheet + row-card styles. |
| `app.js` | Modify | New `queue` module section, new `queue-ui` module section, refactor `submitGame` to delegate, wire triggers, add `window.__qa`. |
| `Code.gs` | Unchanged | No backend changes. |
| `.gitignore` | Unchanged | `icons/` is committed. |

## Chunks

- **Chunk 1 — PWA shell.** Icons, manifest, service worker, registration, update flow. Ships a page that opens offline. Submit path unchanged.
- **Chunk 2 — Queue module.** Storage, `submit`, `drain`, `retry`, `delete`, getters, `submitGame` integration, `clearSession` invariant test.
- **Chunk 3 — Queue UI, triggers, verification.** Badge, bottom-sheet, retry/delete wiring, event + interval triggers, `window.__qa`, the 10-scenario verification pass.

---

## Chunk 1: PWA shell

### Task 1.1: Generate icon PNGs from the existing logo

**Files:**
- Create: `icons/icon-192.png`
- Create: `icons/icon-512.png`

`botc_head.webp` is 414×443. We pad to square and resize on center so the Android homescreen mask doesn't clip the character.

- [ ] **Step 1: Create the icons directory and generate the two sizes.**

```bash
mkdir -p icons
magick botc_head.webp -background "#0f0f13" -gravity center -extent 443x443 -resize 512x512 icons/icon-512.png
magick botc_head.webp -background "#0f0f13" -gravity center -extent 443x443 -resize 192x192 icons/icon-192.png
```

- [ ] **Step 2: Verify dimensions.**

```bash
magick identify icons/icon-512.png icons/icon-192.png
```

Expected output contains `512x512` on the first line and `192x192` on the second, both PNG.

- [ ] **Step 3: Commit.**

```bash
git add icons/
git commit -m "Add PWA homescreen icons at 192 and 512"
```

---

### Task 1.2: Write the PWA manifest

**Files:**
- Create: `manifest.webmanifest`

- [ ] **Step 1: Write the manifest.**

```json
{
  "name": "BotC Logger",
  "short_name": "BotC",
  "description": "Blood on the Clocktower game logger",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f0f13",
  "theme_color": "#6c5ce7",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Verify JSON parses.**

```bash
python3 -c "import json; json.load(open('manifest.webmanifest'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Commit.**

```bash
git add manifest.webmanifest
git commit -m "Add PWA manifest"
```

---

### Task 1.3: Link the manifest and set theme color

**Files:**
- Modify: `index.html` (inside `<head>`)

- [ ] **Step 1: Locate the existing `<head>` block and identify where the title is.** Use `Grep` for `<title>`, then `Read` around it.

- [ ] **Step 2: Add the manifest link and theme-color meta immediately after the viewport meta.**

Insert (order matters — theme-color before manifest is fine):

```html
    <meta name="theme-color" content="#6c5ce7">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="apple-touch-icon" href="icons/icon-192.png">
```

- [ ] **Step 3: Verify in the preview.** Start the preview server if not running (`preview_start` with name `botc-logger`). Reload the page. Run:

```js
preview_eval({ expression: `(() => {
  const href = document.querySelector('link[rel="manifest"]')?.href || "";
  return {
    themeColor: document.querySelector('meta[name="theme-color"]')?.content,
    manifestOk: href.endsWith('/manifest.webmanifest'),
  };
})()` })
```

Expected: `{ themeColor: "#6c5ce7", manifestOk: true }`. (We assert `endsWith` rather than the full URL because the dev-server port isn't fixed.)

- [ ] **Step 4: Commit.**

```bash
git add index.html
git commit -m "Link PWA manifest and set theme color"
```

---

### Task 1.4: Write the service worker skeleton

**Files:**
- Create: `sw.js`

Top-of-file constant controls cache versioning (per spec reviewer recommendation #4 — no build step, so a literal constant is the source of truth).

- [ ] **Step 1: Write the skeleton with install/activate lifecycle but a pass-through fetch handler.**

```js
// sw.js — BotC Logger service worker
//
// Strategy (see docs/superpowers/specs/2026-04-15-pwa-offline-queue-design.md):
// - Navigation: network-first, fall back to cached /index.html.
// - Same-origin static: stale-while-revalidate.
// - Apps Script (*.google.com hostnames): never cached.
//
// Bump CACHE_VERSION whenever the shell changes. No build step — a literal
// constant is the source of truth.

const CACHE_VERSION = "v1";
const CACHE_NAME = `botc-logger-${CACHE_VERSION}`;
const SHELL = [
  "/",
  "/index.html",
  "/app.js",
  "/styles.css",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Handlers added in the next task — for now, pass through.
});
```

> **Troubleshooting:** `cache.addAll(SHELL)` is atomic — if *any* URL in `SHELL` returns non-2xx (404, redirect, etc.), the whole install fails and the SW never activates. If you see `install` fail silently in DevTools → Application → Service Workers, open DevTools → Network and check each `SHELL` path returns 200. Common cause: the preview server not yet serving `manifest.webmanifest` or the icon files because Task 1.1/1.2 aren't committed yet. Order tasks strictly.

- [ ] **Step 2: Register the service worker from `index.html`.** Add this at the bottom of `<body>`, after the `<script src="app.js">` line:

```html
    <script>
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed:", err));
        });
      }
    </script>
```

- [ ] **Step 3: Verify registration.** Ensure the preview server is running first — run `preview_list` and start it with `preview_start` if absent. Then reload the preview page and run:

```js
preview_eval({ expression: `navigator.serviceWorker.getRegistration().then(r => r ? { scope: r.scope, active: !!r.active } : 'none')` })
```

Expected: `{ scope: "http://localhost:3000/", active: true }`.

- [ ] **Step 4: Verify the shell is in cache.**

```js
preview_eval({ expression: `caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys().then(rs => [k, rs.map(r => new URL(r.url).pathname)])))))` })
```

Expected: one entry `botc-logger-v1` with pathnames `/`, `/index.html`, `/app.js`, `/styles.css`, `/manifest.webmanifest`, `/icons/icon-192.png`, `/icons/icon-512.png`.

- [ ] **Step 5: Commit.**

```bash
git add sw.js index.html
git commit -m "Add service worker skeleton with shell precache"
```

---

### Task 1.5: Implement fetch classification

**Files:**
- Modify: `sw.js` (replace the empty `fetch` handler)

Per spec reviewer recommendation #1, classify by `url.hostname.endsWith(...)`, not substring.

- [ ] **Step 1: Replace the pass-through fetch handler with classified handling.**

```js
// ─── fetch classification ───────────────────────────────────────────────────
//
// Apps Script hostnames: script.google.com, script.googleusercontent.com.
// These end in "google.com", but so does a lot of the internet. We match by
// endsWith on the leaf hostname so a path like /foo/script.google.com/bar
// (on a hostile server) can't pivot us into never-cache mode.
const APPS_SCRIPT_HOSTS = ["script.google.com", "script.googleusercontent.com"];

function isAppsScript(url) {
  return APPS_SCRIPT_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h));
}

function networkFirstNavigation(event) {
  return fetch(event.request)
    .catch(() => caches.match("/index.html"));
}

function staleWhileRevalidate(event) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) cache.put(event.request, resp.clone());
          return resp;
        })
        .catch(() => cached); // offline → return cached (may be undefined)
      return cached || networkFetch;
    })
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes always hit network — queue handles offline.

  const url = new URL(req.url);

  // Apps Script → never cache, never serve from cache.
  if (isAppsScript(url)) return;

  // Cross-origin (non-Apps-Script) → pass through untouched. Keeps us out of
  // other people's CORS/auth business.
  if (url.origin !== self.location.origin) return;

  // Same-origin navigation (HTML) → network-first, fall back to shell.
  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  // Same-origin static → stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(event));
});
```

- [ ] **Step 2: Verify SW updates.** Because the SW code itself changed, the browser installs the new SW on next reload. `skipWaiting()` + `clients.claim()` in Task 1.4 means the new SW takes control immediately without a second reload. Reload once, then run:

```js
preview_eval({ expression: `navigator.serviceWorker.controller?.scriptURL` })
```

Expected: URL ending in `/sw.js`.

- [ ] **Step 3: Verify Apps Script requests are not cached.** After a successful "Connected to sheet" state:

```js
preview_eval({ expression: `caches.open("botc-logger-v1").then(c => c.keys()).then(rs => rs.map(r => r.url).filter(u => u.includes("script.google")))` })
```

Expected: `[]`.

- [ ] **Step 4: Commit.**

```bash
git add sw.js
git commit -m "Implement SW fetch classification (nav/static/apps-script)"
```

---

### Task 1.6: Update-available toast

**Files:**
- Modify: `index.html` (inside the SW registration script)

- [ ] **Step 1: Replace the inline SW registration with a version that listens for `updatefound` + `controllerchange`.** The toast copy is "Update available — tap to reload" (preferred over the spec's "reload to apply" because the toast has an `onClick` handler, so "tap" explains the affordance).

```html
    <script>
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", async () => {
          try {
            const reg = await navigator.serviceWorker.register("sw.js");
            reg.addEventListener("updatefound", () => {
              const newWorker = reg.installing;
              if (!newWorker) return;
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  // An update is available and an old SW is currently in control.
                  if (window.showToast) {
                    // sticky: true extends auto-dismiss to 10s so users have time to tap.
                    window.showToast("Update available — tap to reload", "info", { onClick: () => location.reload(), sticky: true });
                  }
                }
              });
            });
          } catch (err) {
            console.warn("SW registration failed:", err);
          }
        });
      }
    </script>
```

- [ ] **Step 2: Upgrade `showToast` to support an `info` type and an optional `opts` argument.** The new signature `showToast(msg, type, opts?)` is backward compatible with every existing 2-arg call site (`showToast("x", "success")`, `showToast("x", "error")`) — `opts` is read only if present. In `app.js`, find `showToast` and replace with:

```js
function showToast(msg, type, opts) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + type + " show";
  t.onclick = null;
  if (opts && typeof opts.onClick === "function") {
    t.style.cursor = "pointer";
    t.onclick = opts.onClick;
  } else {
    t.style.cursor = "";
  }
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove("show"), opts && opts.sticky ? 10000 : 3000);
}
```

- [ ] **Step 3: Add a `.toast.info` style and make visible toasts clickable.** In `styles.css`, next to the existing toast type selectors:

```css
.toast.info { background: var(--accent); color: white; }
.toast.show { pointer-events: auto; }
```

The base toast rule has `pointer-events: none` (so it doesn't block interaction while hidden/transitioning). The second rule re-enables pointer events when the toast is visible, which is required for the `onClick` handler wired in Step 2 to fire.

- [ ] **Step 4: Export `showToast` for the SW-registration inline script.** Add this line at module scope in `app.js`, on the line immediately after the closing brace of `showToast`:

```js
window.showToast = showToast;
```

This makes the function reachable from the inline `<script>` block in `index.html` that lives outside the `app.js` closure/IIFE (if any). Place it at top level, not inside any other function.

- [ ] **Step 5: Verify toast renders correctly.** Reload preview, then run:

```js
preview_eval({ expression: `(() => {
  showToast("Test success", "success");
  const t = document.getElementById("toast");
  const result = {
    visible: t.classList.contains("show"),
    text: t.textContent,
    type: [...t.classList].find(c => c !== "toast" && c !== "show"),
    clickable: false,
  };
  // Also verify onClick wiring
  showToast("Test info", "info", { onClick: () => {} });
  result.clickable = typeof t.onclick === "function";
  t.classList.remove("show");
  return result;
})()` })
```

Expected: `{ visible: true, text: "Test success", type: "success", clickable: true }`.

- [ ] **Step 6: Commit.** All of Steps 1–4 must be applied before this commit — the inline `<script>` in `index.html` (Step 1) calls `window.showToast` which is only exported in Step 4; committing Step 1 alone would ship a wired-but-broken toast.

```bash
git add index.html app.js styles.css
git commit -m "Show update-available toast when a new SW installs"
```

---

## Chunk 1 review gate

Run the plan-document-reviewer against this chunk before starting Chunk 2. If approved, proceed.

---

## Chunk 2: Queue module

### Task 2.1: Add storage keys and low-level read/write helpers

**Files:**
- Modify: `app.js` (add a new section after the existing "COOKIES" section, before "SESSION")

- [ ] **Step 1: Append the queue module section.** Find the `// ——— SESSION ———` comment and insert *above* it:

```js
// ——— QUEUE (OFFLINE SUBMIT) ———
// Owns the two localStorage buckets. Nothing else in app.js writes to these
// keys — the queue module is the sole writer. Reads go through getPending /
// getFailed. State changes are published via a window "botc:queue-changed"
// event so the queue-ui module can re-render without tight coupling.
//
// INVARIANT: clearSession() must NOT touch these keys — queued games survive
// auth reset. See __qa.assertInvariants() at the bottom of this file.

const QUEUE_PENDING_KEY = "botc_logger_queue_pending";
const QUEUE_FAILED_KEY  = "botc_logger_queue_failed";

function queueRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function queueWrite(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch (_) {}
  window.dispatchEvent(new CustomEvent("botc:queue-changed"));
}

function queueNewEntry(payload) {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    payload,
    attempts: 0,
    lastError: null,
  };
}

function getPending() { return queueRead(QUEUE_PENDING_KEY); }
function getFailed()  { return queueRead(QUEUE_FAILED_KEY); }
```

- [ ] **Step 2: Verify the module loads cleanly.** Reload preview, run:

```js
preview_eval({ expression: `({ pending: getPending().length, failed: getFailed().length })` })
```

Expected: `{ pending: 0, failed: 0 }`.

- [ ] **Step 3: Commit.**

```bash
git add app.js
git commit -m "Queue module: storage keys and low-level helpers"
```

---

### Task 2.2: Implement `queue.submit` and `queue.drain`

**Files:**
- Modify: `app.js` (append to the queue section)

Per spec reviewer recommendations #2 and #3: populate `lastError` on network/5xx too, and use explicit `authError` flag in the submit return shape.

- [ ] **Step 1: Append the core submit + drain functions.**

```js
// Tries one fetch against the Apps Script endpoint. Returns a normalized
// result object: { ok, authError, userError, row, err }.
async function queueAttempt(payload) {
  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const body = await resp.json();
    if (body.error === "Unauthorized") {
      return { ok: false, authError: true, err: "Unauthorized" };
    }
    if (body.error) {
      return { ok: false, userError: true, err: body.error };
    }
    return { ok: true, row: body.row };
  } catch (err) {
    return { ok: false, networkError: true, err: String(err) };
  }
}

// Public API: try once if online; enqueue otherwise.
// Returns one of:
//   { synced: true, row }
//   { queued: true }
//   { synced: false, authError: true, err }     // caller should clearSession
async function submitViaQueue(payload) {
  if (!navigator.onLine) {
    const entry = queueNewEntry(payload);
    queueWrite(QUEUE_PENDING_KEY, [...getPending(), entry]);
    maybeStartInterval();
    return { queued: true };
  }
  const result = await queueAttempt(payload);
  if (result.ok) {
    // Opportunistic drain: we have a working connection.
    drainQueue();
    return { synced: true, row: result.row };
  }
  if (result.authError) {
    return { synced: false, authError: true, err: result.err };
  }
  // userError or networkError → enqueue with the error annotated.
  const entry = queueNewEntry(payload);
  entry.attempts = 1;
  entry.lastError = result.err;
  queueWrite(QUEUE_PENDING_KEY, [...getPending(), entry]);
  maybeStartInterval();
  return { queued: true };
}

let _isDraining = false;
let _pendingRerun = false;

// Processes the pending bucket FIFO. Auth failures stop the drain; other
// errors move the entry to failed and continue. Network/5xx leaves the
// entry in place, increments attempts, and stops the drain so we don't
// hammer a flaky connection.
async function drainQueue() {
  if (_isDraining) { _pendingRerun = true; return; }
  _isDraining = true;
  try {
    let synced = 0;
    while (true) {
      const pending = getPending();
      if (pending.length === 0) break;
      const entry = pending[0];
      const result = await queueAttempt(entry.payload);

      if (result.ok) {
        queueWrite(QUEUE_PENDING_KEY, pending.slice(1));
        synced++;
        continue;
      }
      if (result.authError) {
        const updated = { ...entry, attempts: entry.attempts + 1, lastError: result.err };
        queueWrite(QUEUE_PENDING_KEY, pending.slice(1));
        queueWrite(QUEUE_FAILED_KEY, [...getFailed(), updated]);
        break; // stop draining; other entries likely fail the same way.
      }
      if (result.userError) {
        const updated = { ...entry, attempts: entry.attempts + 1, lastError: result.err };
        queueWrite(QUEUE_PENDING_KEY, pending.slice(1));
        queueWrite(QUEUE_FAILED_KEY, [...getFailed(), updated]);
        continue; // isolated data problem; keep going.
      }
      // networkError → leave in place, annotate, stop.
      const updated = { ...entry, attempts: entry.attempts + 1, lastError: result.err };
      queueWrite(QUEUE_PENDING_KEY, [updated, ...pending.slice(1)]);
      break;
    }
    if (synced > 0) showToast(`Synced ${synced} game${synced === 1 ? "" : "s"}`, "success");
    maybeStartInterval();
  } finally {
    _isDraining = false;
    if (_pendingRerun) {
      _pendingRerun = false;
      drainQueue();
    }
  }
}
```

- [ ] **Step 2: Add `retry` / `delete` / interval helpers (stubbed; interval filled in Chunk 3).**

```js
function retryQueued(id, bucket) {
  const fromKey = bucket === "failed" ? QUEUE_FAILED_KEY : QUEUE_PENDING_KEY;
  const list = queueRead(fromKey);
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return;
  const [entry] = list.splice(idx, 1);
  queueWrite(fromKey, list);
  queueWrite(QUEUE_PENDING_KEY, [...getPending(), { ...entry, attempts: entry.attempts, lastError: null }]);
  drainQueue();
}

function deleteQueued(id, bucket) {
  const key = bucket === "failed" ? QUEUE_FAILED_KEY : QUEUE_PENDING_KEY;
  const list = queueRead(key);
  const next = list.filter((e) => e.id !== id);
  if (next.length !== list.length) queueWrite(key, next);
}

// Filled in Chunk 3 (triggers). Stub for now so submitViaQueue compiles.
function maybeStartInterval() { /* see Chunk 3 */ }
```

- [ ] **Step 3: Verify submit + drain work in isolation with a fake fetch.** Reload preview. Run:

```js
preview_eval({ expression: `(async () => {
  const realFetch = window.fetch;
  let call = 0;
  window.fetch = async () => ({ json: async () => ({ success: true, row: 99 + (++call) }) });
  localStorage.setItem("botc_logger_queue_pending", JSON.stringify([
    { id: "t1", createdAt: 1, payload: { foo: "a" }, attempts: 0, lastError: null },
    { id: "t2", createdAt: 2, payload: { foo: "b" }, attempts: 0, lastError: null },
  ]));
  await drainQueue();
  const out = { pending: getPending().length, failed: getFailed().length };
  window.fetch = realFetch;
  return out;
})()` })
```

Expected: `{ pending: 0, failed: 0 }`.

- [ ] **Step 4: Verify an "Unauthorized" entry ends up in the failed bucket and drain stops.**

```js
preview_eval({ expression: `(async () => {
  const realFetch = window.fetch;
  window.fetch = async () => ({ json: async () => ({ error: "Unauthorized" }) });
  localStorage.setItem("botc_logger_queue_pending", JSON.stringify([
    { id: "t1", createdAt: 1, payload: { foo: "a" }, attempts: 0, lastError: null },
    { id: "t2", createdAt: 2, payload: { foo: "b" }, attempts: 0, lastError: null },
  ]));
  localStorage.removeItem("botc_logger_queue_failed");
  await drainQueue();
  const out = { pending: getPending().map(e => e.id), failed: getFailed().map(e => e.id) };
  window.fetch = realFetch;
  localStorage.removeItem("botc_logger_queue_pending");
  localStorage.removeItem("botc_logger_queue_failed");
  return out;
})()` })
```

Expected: `{ pending: ["t2"], failed: ["t1"] }`.

- [ ] **Step 5: Commit.**

```bash
git add app.js
git commit -m "Queue module: submit and drain with failure classification"
```

---

### Task 2.3: Wire the queue into `submitGame`

**Files:**
- Modify: `app.js` — `submitGame` function

- [ ] **Step 1: Find `submitGame` and locate the `try { const resp = await fetch(ENDPOINT, ...)` block.**

- [ ] **Step 2: Replace the network section with a call to `submitViaQueue`.** The surrounding structure (payload construction, button loading state, form reset) stays the same. Replace from `try {` to the `catch (err) { ... } finally { ... }` with:

```js
  try {
    const result = await submitViaQueue(payload);

    if (result.synced) {
      showToast("Game logged! (row " + result.row + ")", "success");
      saveGameInfo();
      resetFormForNextGame();
      refreshPrefillButton();
      loadOptions();
    } else if (result.queued) {
      showToast("Saved offline — will sync when online", "info");
      saveGameInfo();
      resetFormForNextGame();
      refreshPrefillButton();
    } else if (result.authError) {
      clearSession("Wrong password — please re-enter");
    }
  } catch (err) {
    showToast("Failed to log: " + err.message, "error");
  } finally {
    btn.classList.remove("loading"); btn.disabled = false;
  }
```

- [ ] **Step 3: Verify the online happy path still works.** Reload, confirm "Connected to sheet", submit a filler game (or inspect via `preview_eval` without actually submitting).

- [ ] **Step 4: Verify the offline-queue path.** In the preview:

```js
preview_eval({ expression: `(async () => {
  const realOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
  Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false });
  localStorage.removeItem("botc_logger_queue_pending");
  const result = await submitViaQueue({ foo: "bar" });
  const pending = getPending().length;
  Object.defineProperty(Navigator.prototype, "onLine", realOnline);
  localStorage.removeItem("botc_logger_queue_pending");
  return { result, pending };
})()` })
```

Expected: `{ result: { queued: true }, pending: 1 }`.

- [ ] **Step 5: Commit.**

```bash
git add app.js
git commit -m "submitGame delegates to the queue; offline path shows queued toast"
```

---

### Task 2.4: Protect the `clearSession` invariant

**Files:**
- Modify: `app.js` — `clearSession`

- [ ] **Step 1: Add an explicit comment + assertion inside `clearSession` above the first `deleteCookie` call.**

```js
function clearSession(toastMsg) {
  // INVARIANT: do NOT touch queue buckets or game-info prefill. Queued games
  // are user data that must survive a password reset.
  const beforePending = localStorage.getItem(QUEUE_PENDING_KEY);
  const beforeFailed  = localStorage.getItem(QUEUE_FAILED_KEY);
  const beforePrefill = localStorage.getItem(GAME_INFO_KEY);

  deleteCookie(STORAGE_KEY);
  deleteCookie(AUTH_KEY);
  ENDPOINT = "";
  AUTH_HASH = "";
  DYNAMIC = { events: [], locations: [], scripts: [], storytellers: [], roles: [], demons: [], fabled: [], lorics: [] };
  document.getElementById("setupUrl").value = "";
  document.getElementById("setupPassword").value = "";
  document.getElementById("setupOverlay").classList.remove("hidden");
  setConnected(false, "Not connected");
  if (toastMsg) showToast(toastMsg, "error");

  if (localStorage.getItem(QUEUE_PENDING_KEY) !== beforePending ||
      localStorage.getItem(QUEUE_FAILED_KEY)  !== beforeFailed  ||
      localStorage.getItem(GAME_INFO_KEY)     !== beforePrefill) {
    console.error("clearSession violated the queue/prefill invariant — please fix.");
  }
}
```

- [ ] **Step 2: Verify the invariant holds.**

```js
preview_eval({ expression: `(() => {
  localStorage.setItem("botc_logger_queue_pending", JSON.stringify([{ id: "t1" }]));
  localStorage.setItem("botc_logger_queue_failed",  JSON.stringify([{ id: "f1" }]));
  localStorage.setItem("botc_logger_game_info", JSON.stringify({ event: "X" }));
  clearSession();
  const out = {
    pending: JSON.parse(localStorage.getItem("botc_logger_queue_pending") || "[]").length,
    failed: JSON.parse(localStorage.getItem("botc_logger_queue_failed") || "[]").length,
    prefill: !!localStorage.getItem("botc_logger_game_info"),
  };
  // cleanup
  localStorage.removeItem("botc_logger_queue_pending");
  localStorage.removeItem("botc_logger_queue_failed");
  localStorage.removeItem("botc_logger_game_info");
  return out;
})()` })
```

Expected: `{ pending: 1, failed: 1, prefill: true }`.

- [ ] **Step 3: Commit.**

```bash
git add app.js
git commit -m "clearSession: assert queue + prefill invariant"
```

---

## Chunk 2 review gate

Run the plan-document-reviewer against Chunk 2. If approved, proceed to Chunk 3.

---

## Chunk 3: Queue UI, triggers, verification

### Task 3.1: Queue badge in the header

**Files:**
- Modify: `index.html` — `.header`
- Modify: `styles.css`
- Modify: `app.js` — new `queue-ui` section

- [ ] **Step 1: Add the badge element to the header.** In `index.html`, find the existing reset button inside `.header` and add the badge *before* it:

```html
        <button type="button" class="queue-badge hidden" id="queueBadge" onclick="openQueueSheet()" aria-label="Sync queue">
          <span id="queueBadgeText">↻ 0</span>
        </button>
```

- [ ] **Step 2: Style the badge and update the header grid.** Two changes needed in `styles.css`:

  **a) Update the existing `.header` rule** — replace the entire `.header { ... }` block (preserving all existing properties, changing only `grid-template-columns` and `grid-template-areas`):

  ```css
  .header {
    position: sticky; top: 0; z-index: 100;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(20px);
    display: grid;
    grid-template-columns: 1fr auto auto;
    grid-template-areas: "title badge reset" "subtitle badge reset";
    column-gap: 12px;
  }
  ```

  **b) Append the new `.queue-badge` rules** after the `.header` block:

  ```css
  .queue-badge {
    grid-area: badge;
    align-self: center;
    justify-self: end;
    margin-right: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .queue-badge:hover { border-color: var(--accent); color: var(--text); }
  .queue-badge.has-failed { border-color: var(--evil); color: var(--evil); }
  .queue-badge.hidden { display: none; }
  ```

- [ ] **Step 3: Add the queue-ui section to `app.js`.** Append after the queue module section:

```js
// ——— QUEUE UI ———
// Renders the header badge and the bottom-sheet list. Never writes to
// localStorage directly — goes through the queue module (submit/drain/retry/
// delete). Subscribes to "botc:queue-changed".

function refreshQueueBadge() {
  const badge = document.getElementById("queueBadge");
  const text  = document.getElementById("queueBadgeText");
  const p = getPending().length;
  const f = getFailed().length;
  if (p + f === 0) { badge.classList.add("hidden"); return; }
  badge.classList.remove("hidden");
  badge.classList.toggle("has-failed", f > 0);
  text.textContent = f > 0 ? `↻ ${p} · ⚠ ${f}` : `↻ ${p}`;
  badge.setAttribute("aria-label", `Sync queue: ${p} pending, ${f} failed`);
}

window.addEventListener("botc:queue-changed", () => {
  refreshQueueBadge();
  // renderQueueSheet is defined in Task 3.3. Guard against the window between
  // Task 3.1 and Task 3.3 where the listener is registered but the function
  // doesn't exist yet (would throw ReferenceError during incremental development).
  if (typeof renderQueueSheet === "function") renderQueueSheet();
});
document.addEventListener("DOMContentLoaded", refreshQueueBadge);
```

- [ ] **Step 4: Verify the badge appears when seeded.**

```js
preview_eval({ expression: `(() => {
  localStorage.setItem("botc_logger_queue_pending", JSON.stringify([{ id: "t1", createdAt: 1, payload: {}, attempts: 0, lastError: null }]));
  window.dispatchEvent(new CustomEvent("botc:queue-changed"));
  const badge = document.getElementById("queueBadge");
  const out = { hidden: badge.classList.contains("hidden"), text: document.getElementById("queueBadgeText").textContent };
  localStorage.removeItem("botc_logger_queue_pending");
  window.dispatchEvent(new CustomEvent("botc:queue-changed"));
  return out;
})()` })
```

Expected: `{ hidden: false, text: "↻ 1" }`.

- [ ] **Step 5: Commit.**

```bash
git add index.html styles.css app.js
git commit -m "Queue UI: header badge"
```

---

### Task 3.2: Bottom-sheet overlay — markup and styles

**Files:**
- Modify: `index.html` — add the overlay at the end of `<body>` (before the script tags)
- Modify: `styles.css`

- [ ] **Step 1: Add the overlay markup.** Place these two elements at the end of `<body>`, immediately before `<script src="app.js">` (not after the SW-registration `<script>` that Chunk 1 added — that inline script must stay last).

```html
    <div class="sheet-backdrop hidden" id="queueSheetBackdrop" onclick="closeQueueSheet()"></div>
    <div class="sheet hidden" id="queueSheet" role="dialog" aria-modal="true" aria-label="Sync queue">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h2>Sync queue</h2>
        <button type="button" class="sheet-close" onclick="closeQueueSheet()" aria-label="Close">&times;</button>
      </div>
      <div class="sheet-body" id="queueSheetBody"></div>
      <div class="sheet-footer">
        <button type="button" class="retry-all-btn hidden" id="retryAllBtn" onclick="retryAll()">Retry all</button>
      </div>
    </div>
```

- [ ] **Step 2: Add styles.** Append to `styles.css`:

```css
/* BOTTOM SHEET */
.sheet-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0, 0, 0, 0.55);
  transition: opacity 0.2s;
}
.sheet-backdrop.hidden { opacity: 0; pointer-events: none; }

.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 201;
  background: var(--surface);
  border-top: 1px solid var(--border);
  border-radius: 16px 16px 0 0;
  max-height: 80vh;
  display: flex; flex-direction: column;
  transition: transform 0.25s ease-out;
  padding: 8px 16px 24px;
}
.sheet.hidden { transform: translateY(100%); pointer-events: none; }
.sheet-handle {
  width: 40px; height: 4px; border-radius: 2px;
  background: var(--border);
  margin: 8px auto 12px;
}
.sheet-header {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 12px;
}
.sheet-header h2 { font-size: 16px; color: var(--text); font-weight: 600; }
.sheet-close {
  background: none; border: none; color: var(--text-muted);
  font-size: 24px; line-height: 1; cursor: pointer; padding: 4px 8px;
}
.sheet-close:hover { color: var(--text); }
.sheet-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 10px;
}
.sheet-section-title { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin: 8px 4px 0; }
.sheet-footer { padding-top: 12px; }
.retry-all-btn {
  width: 100%; padding: 12px;
  background: var(--accent); border: none; border-radius: var(--radius-sm);
  color: white; font-weight: 600; cursor: pointer;
}
.retry-all-btn.hidden { display: none; }

/* DESKTOP — cap width and center */
@media (min-width: 640px) {
  .sheet {
    left: 50%; right: auto; bottom: 20px;
    transform: translateX(-50%);
    width: 500px; max-width: 90vw;
    border-radius: 16px;
  }
  .sheet.hidden { transform: translate(-50%, 120%); }
}

/* QUEUE ROW */
.queue-row {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.queue-row.failed { border-color: var(--evil); }
.queue-row-summary { font-size: 13px; color: var(--text); }
.queue-row-meta { font-size: 11px; color: var(--text-muted); }
.queue-row-error { font-size: 11px; color: var(--evil); }
.queue-row-actions { display: flex; gap: 8px; }
.queue-row-actions button {
  flex: 1; padding: 8px; border-radius: var(--radius-sm);
  font-size: 12px; cursor: pointer; border: 1px solid var(--border);
  background: var(--surface); color: var(--text);
}
.queue-row-actions button.danger:hover { border-color: var(--evil); color: var(--evil); }
```

- [ ] **Step 3: Verify the sheet is in the DOM and hidden by default.**

```js
preview_eval({ expression: `({ exists: !!document.getElementById("queueSheet"), hidden: document.getElementById("queueSheet").classList.contains("hidden") })` })
```

Expected: `{ exists: true, hidden: true }`.

- [ ] **Step 4: Commit.**

```bash
git add index.html styles.css
git commit -m "Queue UI: bottom-sheet markup and styles"
```

---

### Task 3.3: Bottom-sheet rendering and open/close wiring

**Files:**
- Modify: `app.js` — queue-ui section

- [ ] **Step 1: Append the rendering + open/close functions.** Note: `renderQueueSheet` replaces `queueSheetBody.innerHTML` on every re-render, which destroys DOM nodes. The delete-confirmation arming state is therefore kept in a module-level `Set<id>` (not `btnEl.dataset`), so it survives re-renders.

```js
// Module-level set of entry IDs whose delete button is currently armed.
// Must live outside renderQueueSheet because innerHTML re-renders wipe DOM nodes.
// _armTimers stores the setTimeout handle per id so we can cancel stale timers
// when the sheet closes or when an entry is re-armed after close/reopen.
const _armedForDelete = new Set();
const _armTimers = new Map();

function openQueueSheet() {
  document.getElementById("queueSheetBackdrop").classList.remove("hidden");
  document.getElementById("queueSheet").classList.remove("hidden");
  renderQueueSheet();
  document.addEventListener("keydown", queueSheetKeyHandler);
}

function closeQueueSheet() {
  document.getElementById("queueSheetBackdrop").classList.add("hidden");
  document.getElementById("queueSheet").classList.add("hidden");
  document.removeEventListener("keydown", queueSheetKeyHandler);
  // Cancel all pending disarm timers before clearing state, so a re-open +
  // re-arm within 3s isn't prematurely disarmed by an old timer.
  _armTimers.forEach((t) => clearTimeout(t));
  _armTimers.clear();
  _armedForDelete.clear();
}

function queueSheetKeyHandler(e) {
  if (e.key === "Escape") closeQueueSheet();
}

function summarizeEntry(e) {
  const p = e.payload || {};
  const bits = [p.date, p.event, p.script, p.storyteller].filter(Boolean);
  return bits.length ? bits.join(" · ") : "(empty game)";
}

function renderQueueRow(entry, bucket) {
  const cls = bucket === "failed" ? "queue-row failed" : "queue-row";
  const err = entry.lastError
    ? `<div class="queue-row-error">${escHtml(entry.lastError)}</div>`
    : "";
  // Sanitize id before splicing into inline onclick strings: crypto.randomUUID()
  // always produces hex + hyphens, but a corrupted/tampered localStorage entry
  // could contain quotes or other characters that would break the attribute context.
  // IMPORTANT: use safeId for ALL _armedForDelete lookups so they stay consistent
  // with confirmDeleteQueued, which receives safeId from the rendered onclick.
  const safeId = String(entry.id).replace(/[^0-9a-f-]/gi, "");
  const safeBucket = bucket === "failed" ? "failed" : "pending"; // enum-clamp
  const deleteLabel = _armedForDelete.has(safeId) ? "Tap again to confirm" : "Delete";
  const armedAttr = _armedForDelete.has(safeId) ? ' data-armed="1"' : "";
  return `
    <div class="${cls}" data-id="${safeId}">
      <div class="queue-row-summary">${escHtml(summarizeEntry(entry))}</div>
      <div class="queue-row-meta">${new Date(entry.createdAt).toLocaleString()} · attempts: ${entry.attempts}</div>
      ${err}
      <div class="queue-row-actions">
        <button type="button" onclick="retryQueued('${safeId}', '${safeBucket}')">Retry</button>
        <button type="button" class="danger"${armedAttr} onclick="confirmDeleteQueued('${safeId}', '${safeBucket}')">${deleteLabel}</button>
      </div>
    </div>
  `;
}

function renderQueueSheet() {
  const body = document.getElementById("queueSheetBody");
  if (!body) return;
  const p = getPending();
  const f = getFailed();
  const chunks = [];
  if (p.length) {
    chunks.push(`<div class="sheet-section-title">Pending (${p.length})</div>`);
    chunks.push(...p.map((e) => renderQueueRow(e, "pending")));
  }
  if (f.length) {
    chunks.push(`<div class="sheet-section-title">Failed (${f.length})</div>`);
    chunks.push(...f.map((e) => renderQueueRow(e, "failed")));
  }
  if (chunks.length === 0) {
    chunks.push(`<div class="queue-row-meta" style="text-align:center;padding:20px;">Nothing queued.</div>`);
  }
  body.innerHTML = chunks.join("");
  // Null-guard: #retryAllBtn is added by Task 3.2. Guard defensively so any
  // botc:queue-changed event fired before a page reload picks up Task 3.2's
  // markup doesn't throw and halt the drain.
  document.getElementById("retryAllBtn")?.classList.toggle("hidden", p.length + f.length === 0);
}

// Note: btnEl param removed — arming state lives in _armedForDelete/_armTimers, not the DOM node.
function confirmDeleteQueued(id, bucket) {
  if (_armedForDelete.has(id)) {
    // Confirmed: cancel the disarm timer and delete the entry.
    clearTimeout(_armTimers.get(id));
    _armTimers.delete(id);
    _armedForDelete.delete(id);
    deleteQueued(id, bucket);
    return;
  }
  // Arm: store the handle so closeQueueSheet (or a re-arm) can cancel it.
  // Without cancellation a stale timer from a prior arm could fire after
  // close → reopen and prematurely disarm the freshly re-armed entry.
  _armedForDelete.add(id);
  renderQueueSheet(); // re-render so the button immediately shows "Tap again to confirm"
  const timer = setTimeout(() => {
    _armTimers.delete(id);
    if (_armedForDelete.delete(id)) renderQueueSheet(); // disarm if not yet confirmed
  }, 3000);
  _armTimers.set(id, timer);
}

function retryAll() {
  const failed = getFailed();
  if (failed.length) {
    const next = failed.map((e) => ({ ...e, lastError: null }));
    // Each queueWrite dispatches "botc:queue-changed", which triggers
    // refreshQueueBadge + renderQueueSheet — no manual re-render needed here.
    queueWrite(QUEUE_PENDING_KEY, [...getPending(), ...next]);
    queueWrite(QUEUE_FAILED_KEY, []);
  }
  // drainQueue calls maybeStartInterval in its finally block (see Chunk 2),
  // so the 30s interval is properly started/stopped after this drain.
  drainQueue();
}
```

- [ ] **Step 2: Verify open/close toggles the DOM classes.**

```js
preview_eval({ expression: `(() => {
  openQueueSheet();
  const openState = !document.getElementById("queueSheet").classList.contains("hidden");
  closeQueueSheet();
  const closedState = document.getElementById("queueSheet").classList.contains("hidden");
  return { openState, closedState };
})()` })
```

Expected: `{ openState: true, closedState: true }`.

- [ ] **Step 3: Verify rendering with seeded entries.**

```js
preview_eval({ expression: `(() => {
  localStorage.setItem("botc_logger_queue_pending", JSON.stringify([
    { id: "p1", createdAt: Date.now(), payload: { date: "2026-04-15", event: "Test", script: "TB", storyteller: "Nico" }, attempts: 0, lastError: null }
  ]));
  localStorage.setItem("botc_logger_queue_failed", JSON.stringify([
    { id: "f1", createdAt: Date.now(), payload: { date: "2026-04-14", event: "Bad" }, attempts: 2, lastError: "Unauthorized" }
  ]));
  window.dispatchEvent(new CustomEvent("botc:queue-changed"));
  openQueueSheet();
  const html = document.getElementById("queueSheetBody").innerHTML;
  closeQueueSheet();
  localStorage.removeItem("botc_logger_queue_pending");
  localStorage.removeItem("botc_logger_queue_failed");
  window.dispatchEvent(new CustomEvent("botc:queue-changed"));
  return { hasPending: html.includes("Pending (1)"), hasFailed: html.includes("Failed (1)"), hasError: html.includes("Unauthorized") };
})()` })
```

Expected: `{ hasPending: true, hasFailed: true, hasError: true }`.

- [ ] **Step 4: Commit.**

```bash
git add app.js
git commit -m "Queue UI: bottom-sheet rendering and open/close"
```

---

### Task 3.4: Wire the drain triggers

**Files:**
- Modify: `app.js` — queue module section (replace the `maybeStartInterval` stub)

- [ ] **Step 1: Replace the `maybeStartInterval` stub with the real implementation.** First, **remove the existing stub** `function maybeStartInterval() { /* see Chunk 3 */ }` from the queue module section entirely — do not append alongside it. Then insert the block below in its place. (Two `function maybeStartInterval` declarations in the same scope would silently shadow each other; removing the stub before inserting is required.)

```js
let _drainInterval = null;

function maybeStartInterval() {
  const active = getPending().length > 0;
  if (active && !_drainInterval) {
    _drainInterval = setInterval(drainQueue, 30_000);
  } else if (!active && _drainInterval) {
    clearInterval(_drainInterval);
    _drainInterval = null;
  }
}
// NOTE: maybeStartInterval is also called from drainQueue (Chunk 2, finally block)
// and from submitViaQueue (Chunk 2) on every enqueue — those call sites keep the
// interval properly in sync with queue state during normal operation.

// Triggers: event-driven + periodic (maybeStartInterval) + manual (retry btn).
window.addEventListener("online", drainQueue);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") drainQueue();
});
// Kick a drain on load if anything is pending.
document.addEventListener("DOMContentLoaded", () => {
  if (getPending().length > 0) drainQueue();
  maybeStartInterval();
});
```

- [ ] **Step 2: Verify the interval starts/stops with pending state.**

```js
preview_eval({ expression: `(() => {
  localStorage.setItem("botc_logger_queue_pending", JSON.stringify([{ id: "x", createdAt: 1, payload: {}, attempts: 0, lastError: null }]));
  maybeStartInterval();
  const started = _drainInterval !== null;
  localStorage.removeItem("botc_logger_queue_pending");
  maybeStartInterval();
  const stopped = _drainInterval === null;
  return { started, stopped };
})()` })
```

Expected: `{ started: true, stopped: true }`.

- [ ] **Step 3: Verify `online` event kicks a drain.** **Prerequisite:** The preview server must be running with Task 3.2's bottom-sheet markup in the page (`#retryAllBtn` must exist in the DOM). If you haven't reloaded since Task 3.2, do so now. `drainQueue` calls `queueWrite` which dispatches `botc:queue-changed`, which calls `renderQueueSheet`, which calls `document.getElementById("retryAllBtn").classList.toggle(...)` — if that element is absent the drain throws and `pending` stays at 1.

```js
preview_eval({ expression: `(async () => {
  const realFetch = window.fetch;
  let called = 0;
  window.fetch = async () => { called++; return { json: async () => ({ success: true, row: 1 }) }; };
  localStorage.setItem("botc_logger_queue_pending", JSON.stringify([{ id: "x", createdAt: 1, payload: {}, attempts: 0, lastError: null }]));
  window.dispatchEvent(new Event("online"));
  // drainQueue is async; wait a tick
  await new Promise(r => setTimeout(r, 50));
  const pending = getPending().length;
  window.fetch = realFetch;
  localStorage.removeItem("botc_logger_queue_pending");
  return { called, pending };
})()` })
```

Expected: `{ called: 1, pending: 0 }`.

- [ ] **Step 4: Commit.**

```bash
git add app.js
git commit -m "Queue triggers: online, visibility, DOMContentLoaded, 30s interval"
```

---

### Task 3.5: Dev helpers (`window.__qa`)

**Files:**
- Modify: `app.js` — append a final section at the bottom

- [ ] **Step 1: Append the QA helpers.**

```js
// ——— QA HELPERS (dev only) ———
// Exposed on window for manual verification via preview_eval. Not gated by a
// build flag — the repo ships without a build step, and these are harmless
// to ship (they only inspect/manipulate local state).
window.__qa = {
  seedPending(n = 1) {
    const extra = Array.from({ length: n }, (_, i) => ({
      id: crypto.randomUUID(),
      createdAt: Date.now() + i,
      payload: { date: new Date().toISOString().slice(0, 10), event: "__qa seed", script: "TB", storyteller: "Tester" },
      attempts: 0,
      lastError: null,
    }));
    queueWrite(QUEUE_PENDING_KEY, [...getPending(), ...extra]);
  },
  seedFailed(n = 1) {
    const extra = Array.from({ length: n }, (_, i) => ({
      id: crypto.randomUUID(),
      createdAt: Date.now() + i,
      payload: { date: new Date().toISOString().slice(0, 10), event: "__qa fail", script: "TB", storyteller: "Tester" },
      attempts: 3,
      lastError: "Unauthorized",
    }));
    queueWrite(QUEUE_FAILED_KEY, [...getFailed(), ...extra]);
  },
  clearAll() {
    queueWrite(QUEUE_PENDING_KEY, []);
    queueWrite(QUEUE_FAILED_KEY, []);
  },
  // Monkey-patches fetch to reject and overrides navigator.onLine to false,
  // then dispatches 'offline'. Restore by calling goOnline().
  // We stash the original property descriptor so goOnline() can restore it
  // reliably — `delete Navigator.prototype.onLine` is not guaranteed to
  // reinstate the native getter on all browsers.
  goOffline() {
    if (window.__qa._realFetch) return; // already offline
    window.__qa._realFetch = window.fetch;
    window.__qa._onLineDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    window.fetch = () => Promise.reject(new TypeError("__qa offline"));
    Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false });
    window.dispatchEvent(new Event("offline"));
  },
  goOnline() {
    if (!window.__qa._realFetch) return;
    window.fetch = window.__qa._realFetch;
    window.__qa._realFetch = null;
    if (window.__qa._onLineDesc) {
      Object.defineProperty(Navigator.prototype, "onLine", window.__qa._onLineDesc);
      window.__qa._onLineDesc = null;
    }
    window.dispatchEvent(new Event("online"));
  },
};
```

- [ ] **Step 2: Verify the helpers exist and work.**

```js
preview_eval({ expression: `(() => {
  __qa.clearAll();
  __qa.seedPending(2);
  __qa.seedFailed(1);
  const out = { pending: getPending().length, failed: getFailed().length };
  __qa.clearAll();
  return out;
})()` })
```

Expected: `{ pending: 2, failed: 1 }`.

- [ ] **Step 3: Commit.**

```bash
git add app.js
git commit -m "Add window.__qa helpers for manual QA"
```

---

### Task 3.6: Full verification pass

This is a single checklist task — no code. Run each scenario against the preview server (or a real GitHub Pages build for the HTTPS/PWA-install bits). Record results. If any scenario fails, file a fix commit and re-run the relevant scenario. Do not ship until all 10 pass.

**Files:** none (manual verification).

- [ ] **Scenario 1 — PWA install.** Requires HTTPS (GitHub Pages or similar — `file://` and bare `localhost` won't trigger the install prompt on iOS; Android Chrome allows `localhost`). On a real device, open the site, tap browser's "Install" / "Add to Home Screen". Verify the icon shows the BotC head and the label reads "BotC Logger".

- [ ] **Scenario 2 — Open offline.** Enable airplane mode (or devtools Offline). Reload the installed app / page. Shell loads, form is usable, connection status reads "Offline — using built-in lists".

- [ ] **Scenario 3 — Submit offline.** With airplane mode on, fill the form and tap Log Game. Toast reads "Saved offline — will sync when online". Form resets. Badge shows `↻ 1`.

- [ ] **Scenario 4 — Auto-drain on reconnect.** Turn airplane mode off. Within ~30s the badge should go to zero, a toast "Synced 1 game" should appear, and the row should exist in the sheet.

- [ ] **Scenario 5 — FIFO order.** Queue 3 games in order A, B, C while offline. Reconnect. Verify the sheet has them in order A, B, C (check row numbers).

- [ ] **Scenario 6 — Failed bucket UI.** Run `__qa.seedFailed(1)`. Badge turns red, shows `↻ 0 · ⚠ 1`. Tap badge → sheet opens, failed entry visible with lastError text and retry/delete buttons.

- [ ] **Scenario 7 — `clearSession` invariant.** Seed pending + failed via `__qa`. Tap the header's reset button (the refresh icon). Setup overlay appears. Close setup (cancel or reload). Verify `getPending()` and `getFailed()` still return the seeded entries. **This is the critical invariant.**

- [ ] **Scenario 8 — Persistence across reload.** Seed pending, reload the page. Badge still shows, `getPending()` still returns the entries.

- [ ] **Scenario 9 — SW update flow.** With the app open, edit `sw.js` (e.g. bump `CACHE_VERSION` to `v2`). Serve the new file. Reload once. A toast should read "Update available — tap to reload". Tap it → page reloads, new SW controls.

- [ ] **Scenario 10 — Double-submit guard.** Seed 5 pending via `__qa`. Tap "Retry all" in the sheet while rapidly also tapping "Retry" on an individual row. The guard (`_isDraining`) should serialize: no duplicate rows in the sheet, and `_pendingRerun` should fire one follow-up drain if applicable.

- [ ] **When all 10 pass, commit the verification log (optional).**

```bash
# optional: a VERIFY.md file summarizing results and any fixes applied
git add docs/superpowers/plans/verify-2026-04-15.md
git commit -m "Verify PWA + offline queue — all scenarios pass"
```

---

## Chunk 3 review gate

Run the plan-document-reviewer against Chunk 3. Once approved and verification passes:

1. Push the branch: `git push -u origin feat/pwa-offline-queue`.
2. Open a PR linking the design doc and summarizing the 10 verification scenarios.
3. Merge once reviewed.

## Done criteria

- App is installable on iOS and Android homescreens with correct icon and label.
- Fresh page load with no network serves the shell from cache.
- `submitGame` always succeeds from the user's POV — either synced or queued.
- Badge appears whenever pending or failed is non-empty and disappears when both are zero.
- `clearSession` leaves queue buckets and game-info prefill untouched.
- No `parseInt`-style type regressions; the JSON shape sent to Apps Script is byte-identical to the pre-queue version.
- All 10 verification scenarios pass.
