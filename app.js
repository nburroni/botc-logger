// ——— STATIC DATA: All BotC characters from your Almanac ———
const ALL_ROLES = [
  "Acrobat","Al-Hadikhia","Alchemist","Alsaahir","Amnesiac","Apprentice","Artist",
  "Assassin","Atheist","Balloonist","Banshee","Barber","Barista","Baron","Beggar",
  "Bishop","Boffin","Bone Collector","Boomdandy","Bounty Hunter","Bureaucrat",
  "Butcher","Butler","Cacklejack","Cannibal","Cerenovus","Chambermaid","Chef",
  "Choirboy","Clockmaker","Courtier","Cult Leader","Damsel","Deviant",
  "Devil's Advocate","Dreamer","Drunk","Empath","Engineer","Evil Twin","Exorcist",
  "Fang Gu","Farmer","Fearmonger","Fisherman","Flowergirl","Fool","Fortune Teller",
  "Gambler","Gangster","General","Gnome","Goblin","Godfather","Golem","Goon",
  "Gossip","Grandmother","Gunslinger","Harlot","Harpy","Hatter","Heretic","Hermit",
  "High Priestess","Huntsman","Imp","Innkeeper","Investigator","Judge","Juggler",
  "Kazali","King","Klutz","Knight","Legion","Leviathan","Librarian","Lil' Monsta",
  "Lleech","Lord of Typhon","Lunatic","Lycanthrope","Magician","Marionette",
  "Mastermind","Mathematician","Matron","Mayor","Mezepheles","Minstrel","Monk",
  "Moonchild","Mutant","Nightwatchman","No Dashii","Noble","Ogre","Ojo","Oracle",
  "Organ Grinder","Pacifist","Philosopher","Pit-Hag","Pixie","Plague Doctor","Po",
  "Poisoner","Politician","Poppy Grower","Preacher","Princess","Professor",
  "Psychopath","Pukka","Puzzlemaster","Ravenkeeper","Recluse","Riot","Sage",
  "Sailor","Saint","Savant","Scapegoat","Scarlet Woman","Seamstress","Shabaloth",
  "Shugenja","Slayer","Snake Charmer","Snitch","Soldier","Spy","Steward","Summoner",
  "Sweetheart","Tea Lady","Thief","Tinker","Town Crier","Undertaker","Vigormortis",
  "Village Idiot","Virgin","Vizier","Vortox","Voudon","Washerwoman","Widow","Witch",
  "Wizard","Wraith","Xaan","Yaggababble","Zealot","Zombuul"
];

const ALL_DEMONS = [
  "Al-Hadikhia","Fang Gu","Imp","Kazali","Legion","Leviathan","Lil' Monsta",
  "Lleech","Lord of Typhon","No Dashii","Ojo","Po","Pukka","Riot","Shabaloth",
  "Vigormortis","Vortox","Yaggababble","Zombuul"
];

const ALL_FABLED = [
  "Angel","Buddhist","Deus Ex Fiasco","Djinn","Doomsayer","Duchess","Ferryman",
  "Fibbin","Fiddler","Hell's Librarian","Revolutionary","Sentinel",
  "Spirit of Ivory","Toymaker"
];

const ALL_LORICS = [
  "Big Wig","Bootlegger","Gardener","God of Ug","Hindu","Knaves","Pope",
  "Storm Catcher","Tor","Ventriloquist","Zenomancer"
];

// ——— CONFIG ———
// Bump alongside CACHE_VERSION in sw.js on every release so the Diagnostics
// panel shows which build is running and the user can confirm a force-update.
const APP_VERSION = "v10 (2026-06-08)";
const STORAGE_KEY = "botc_logger_endpoint";
const AUTH_KEY = "botc_logger_auth";
const GAME_INFO_KEY = "botc_logger_game_info";
const GAME_INFO_FIELDS = ["event","location","liveOnline","script","storyteller","numPlayers"];
let ENDPOINT = "";
let AUTH_HASH = "";
// Dynamic options from sheet (merged with static on load)
let DYNAMIC = { events: [], locations: [], scripts: [], storytellers: [], roles: [], demons: [], fabled: [], lorics: [], travellers: [] };

// ——— INIT ———
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("date").valueAsDate = new Date();
  const savedEndpoint = getCookie(STORAGE_KEY);
  const savedAuth = getCookie(AUTH_KEY);
  if (savedEndpoint && savedAuth) {
    ENDPOINT = savedEndpoint;
    AUTH_HASH = savedAuth;
    document.getElementById("setupOverlay").classList.add("hidden");
    loadOptions();
  }
  refreshPrefillButton();

  // Autocomplete bindings — merge static + dynamic
  setupAutocomplete("event",        () => DYNAMIC.events);
  setupAutocomplete("location",     () => DYNAMIC.locations);
  setupAutocomplete("script",       () => DYNAMIC.scripts);
  setupAutocomplete("storyteller",  () => DYNAMIC.storytellers);
  setupAutocomplete("startingRole", () => mergeUnique(ALL_ROLES, DYNAMIC.roles));
  setupAutocomplete("midGameRole",  () => mergeUnique(ALL_ROLES, DYNAMIC.roles));
  setupAutocomplete("endingRole",   () => mergeUnique(ALL_ROLES, DYNAMIC.roles));
  setupAutocomplete("startDemon",   () => mergeUnique(ALL_DEMONS, DYNAMIC.demons));
  setupAutocomplete("endDemon",     () => mergeUnique(ALL_DEMONS, DYNAMIC.demons));
  setupAutocomplete("fabled1",      () => mergeUnique(ALL_FABLED, DYNAMIC.fabled));
  setupAutocomplete("fabled2",      () => mergeUnique(ALL_FABLED, DYNAMIC.fabled));
  setupAutocomplete("fabled3",      () => mergeUnique(ALL_FABLED, DYNAMIC.fabled));
  setupAutocomplete("loric1",       () => mergeUnique(ALL_LORICS, DYNAMIC.lorics));
  setupAutocomplete("loric2",       () => mergeUnique(ALL_LORICS, DYNAMIC.lorics));
  setupAutocomplete("traveller1",   () => mergeUnique(ALL_ROLES, DYNAMIC.travellers));
  setupAutocomplete("traveller2",   () => mergeUnique(ALL_ROLES, DYNAMIC.travellers));
  setupAutocomplete("traveller3",   () => mergeUnique(ALL_ROLES, DYNAMIC.travellers));
  setupAutocomplete("specialWinType", () => mergeUnique(ALL_ROLES, DYNAMIC.roles));

  // Live-clear validation errors as required fields are filled
  ["date", "numPlayers", "script", "startingRole", "startDemon"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => clearInvalid(id));
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-wrapper"))
      document.querySelectorAll(".autocomplete-list").forEach(l => l.classList.remove("show"));
  });

  // Fix 1: propagate Starting Role to mid/end role fields when they are empty
  // (Team propagation is handled in selectChip and selectAC via autoFillRoleFields)
  document.getElementById("startingRole").addEventListener("input", () => autoFillRoleFields());
});

function mergeUnique(staticList, dynamicList) {
  const set = new Set([...staticList, ...dynamicList]);
  return Array.from(set).sort();
}

// ——— COOKIES ———
function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}
function setCookie(name, val) {
  const exp = new Date(Date.now() + 10*365*24*60*60*1000).toUTCString();
  document.cookie = name+"="+encodeURIComponent(val)+";expires="+exp+";path=/;SameSite=Strict";
}
function deleteCookie(name) {
  document.cookie = name+"=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Strict";
}

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
const AUTO_RETRY_KEY    = "botc_logger_auto_retry"; // "false" disables automatic retries; missing = enabled
const STUCK_AFTER_ATTEMPTS = 5; // after this many network failures, show a clearer message (entry keeps retrying)
const LOG_KEY           = "botc_logger_debug_log";
const LOG_MAX           = 200;

// ——— DEBUG LOG ———
// Ring buffer of debugging events persisted to localStorage so the user can
// share recent activity when something fails. Reads/writes are best-effort.
// Game-data payloads ARE logged (see redactPayload) so we can diagnose missing
// fields, but the auth hash is always stripped first.
function dlog(event, data) {
  try {
    const log = readLog();
    log.push({ t: Date.now(), e: event, d: data == null ? null : data });
    while (log.length > LOG_MAX) log.shift();
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch (_) {}
}
// Returns a shallow copy of a submit payload with the secret `key` removed so
// the full game data can be logged/shared without exposing the auth hash.
function redactPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const { key, ...rest } = payload;
  return rest;
}
function readLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

// ——— AUTO-RETRY TOGGLE ———
// When disabled, the 30s drain interval and event-driven retries (online,
// visibilitychange, DOMContentLoaded, opportunistic post-submit) are all
// skipped. Manual retries via retryAll() / retryQueued() still work.
function isAutoRetryEnabled() {
  try {
    return localStorage.getItem(AUTO_RETRY_KEY) !== "false";
  } catch (_) {
    return true;
  }
}
function setAutoRetryEnabled(enabled) {
  try {
    localStorage.setItem(AUTO_RETRY_KEY, enabled ? "true" : "false");
  } catch (_) {}
  dlog("auto_retry:set", { enabled: !!enabled });
  // Reflect into the checkbox if the change came from elsewhere.
  const el = document.getElementById("autoRetryToggle");
  if (el && el.checked !== !!enabled) el.checked = !!enabled;
  // Recompute the interval so a disable clears it immediately.
  maybeStartInterval();
}

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
  try {
    localStorage.setItem(key, JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent("botc:queue-changed"));
  } catch (_) {}
}

function queueNewEntry(payload) {
  return {
    // Reuse the payload's clientId (idempotency key) as the entry's own id so
    // the queue UI, the retry path, and the server all share the same UUID.
    // Fall back to a fresh UUID for payloads that pre-date this field.
    id: payload.clientId || crypto.randomUUID(),
    createdAt: Date.now(),
    payload,
    attempts: 0,
    lastError: null,
  };
}

function getPending() { return queueRead(QUEUE_PENDING_KEY); }
function getFailed()  { return queueRead(QUEUE_FAILED_KEY); }

// Tries one fetch against the Apps Script endpoint. Returns a normalized
// result object: { ok, authError, userError, row, err }.
//
// CORS note: Apps Script POSTs redirect to script.googleusercontent.com, which
// may not echo CORS headers. The browser then rejects fetch() with TypeError
// even though the row was already written. We use navigator.onLine to separate
// "CORS blocked but server got the request" (provisional success) from "true
// network failure" (keep in pending). See the catch block below for details.

// Raw POST of a payload to the Apps Script endpoint. Returns a result object:
//   { ok: true, row }                       // JSON success
//   { ok: true, provisional: true, row: null } // CORS-masked or non-JSON reply
//   { ok: false, authError: true, err }
//   { ok: false, userError: true, err }
//   { ok: false, networkError: true, err }  // offline / request never left
// Shared by queueAttempt (new-game queue) and the edit/update flow.
async function postPayload(payload) {
  const cid    = payload && payload.clientId;
  const script = payload && payload.script;
  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      // text/plain keeps this a CORS "simple request" — no preflight OPTIONS,
      // which Apps Script web apps do not handle. The body is still JSON;
      // Apps Script parses it via e.postData.contents regardless of Content-Type.
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
  } catch (netErr) {
    // If navigator.onLine is true, fetch() throwing is most likely a CORS
    // rejection on the Apps Script redirect response — the POST reached
    // the server even though we couldn't read the reply. Treat as
    // provisional success so the queue stops retrying and writing
    // duplicates. Callers hedge the toast ("verify in sheet") because
    // navigator.onLine is a coarse signal: it returns true on captive
    // portals and "connected, no internet" networks, where the request
    // never actually left. In those edge cases the entry is dropped and
    // the game is lost client-side.
    //
    // The col-AB clientId dedup in Code.gs prevents a duplicate row if a
    // later retry rewrites the same payload — but only once that Code.gs
    // version is deployed. Until then, false provisional successes are
    // straightforwardly lossy.
    //
    // If offline, the request never went out — keep in pending for later.
    if (navigator.onLine) {
      dlog("attempt:provisional_cors", { clientId: cid, script, err: String(netErr) });
      return { ok: true, provisional: true, row: null };
    }
    dlog("attempt:offline", { clientId: cid, script, err: String(netErr) });
    return { ok: false, networkError: true, err: String(netErr) };
  }

  try {
    const body = await resp.json();
    if (body.error === "Unauthorized") {
      dlog("attempt:auth_error", { clientId: cid, script });
      return { ok: false, authError: true, err: "Unauthorized" };
    }
    if (body.error) {
      dlog("attempt:user_error", { clientId: cid, script, err: body.error });
      return { ok: false, userError: true, err: body.error };
    }
    dlog("attempt:ok", { clientId: cid, script, row: body.row });
    return { ok: true, row: body.row };
  } catch (_parseErr) {
    // Response received but not JSON — Apps Script likely returned an HTML
    // error page. Row probably written; treat as provisional success.
    dlog("attempt:provisional_parse", { clientId: cid, script });
    return { ok: true, provisional: true, row: null };
  }
}

// After a (possibly CORS-masked) submit, confirm the row actually landed
// complete. GETs are readable even when POST responses are CORS-masked, so this
// catches silent write failures (e.g. a value rejected by a column's
// data-validation that truncated the row). Best-effort: if the check itself
// can't run, assume ok rather than double-warning.
async function verifyWrite(clientId) {
  if (!clientId) return { ok: true, unverified: true };
  try {
    const url = ENDPOINT + "?key=" + encodeURIComponent(AUTH_HASH)
              + "&action=history&limit=5&offset=0";
    const resp = await fetch(url, { redirect: "follow" });
    const data = await resp.json();
    const rows = (data && data.rows) || [];
    const mine = rows.find(r => r.clientId === clientId);
    if (!mine) return { ok: false, missing: true };
    if (!String(mine.winLoss || "").trim()) return { ok: false, truncated: true };
    return { ok: true };
  } catch (_e) {
    return { ok: true, unverified: true };
  }
}

async function queueAttempt(payload) {
  // Log the exact game data being POSTed (key redacted). This runs on direct
  // submits AND every queue retry, so the log shows precisely which fields left
  // the device.
  dlog("post:sending", redactPayload(payload));
  return postPayload(payload);
}

// Public API: try once if online; enqueue otherwise.
// Returns one of:
//   { synced: true, row, provisional }    // provisional=true when the response
//                                         // wasn't readable; verify in sheet
//   { queued: true }
//   { synced: false, authError: true, err }     // caller should clearSession
async function submitViaQueue(payload) {
  const cid = payload && payload.clientId;
  const script = payload && payload.script;
  if (!navigator.onLine) {
    // Offline games skip queueAttempt (and its post:sending log), so capture
    // the full payload here too.
    dlog("submit:queued_offline", redactPayload(payload));
    const entry = queueNewEntry(payload);
    queueWrite(QUEUE_PENDING_KEY, [...getPending(), entry]);
    maybeStartInterval();
    return { queued: true };
  }
  dlog("submit:attempt", { clientId: cid, script });
  const result = await queueAttempt(payload);
  if (result.ok) {
    // Opportunistic drain: we have a working connection. Fire-and-forget.
    drainQueue().catch(() => {});
    return { synced: true, row: result.row, provisional: !!result.provisional };
  }
  if (result.authError) {
    return { synced: false, authError: true, err: result.err };
  }
  // userError or networkError → enqueue with the error annotated.
  dlog("submit:queued_after_error", { clientId: cid, script, err: result.err });
  const entry = queueNewEntry(payload);
  entry.attempts = 1;
  entry.lastError = result.err;
  queueWrite(QUEUE_PENDING_KEY, [...getPending(), entry]);
  maybeStartInterval();
  return { queued: true };
}

let _isDraining = false;
let _pendingRerun = false;
let _pendingRerunManual = false; // sticky: any coalesced manual call promotes the rerun

// Processes the pending bucket FIFO. Auth failures stop the drain; other
// errors move the entry to failed and continue. Network/5xx leaves the
// entry in place, increments attempts, and stops the drain so we don't
// hammer a flaky connection.
//
// Accepts an optional { manual } flag. When auto-retry is disabled, only
// manual drains run — automatic triggers (interval, online, visibility)
// short-circuit so the user can pause retries while debugging.
async function drainQueue(opts) {
  const manual = !!(opts && opts.manual === true);
  if (!ENDPOINT) return; // not connected — nothing to drain against
  if (!manual && !isAutoRetryEnabled()) {
    if (getPending().length > 0) {
      dlog("drain:skipped_auto_disabled", { pending: getPending().length });
    }
    return;
  }
  if (_isDraining) {
    _pendingRerun = true;
    if (manual) _pendingRerunManual = true; // promote the rerun so it bypasses the toggle
    return;
  }
  _isDraining = true;
  dlog("drain:start", { manual, pending: getPending().length });
  try {
    // Gate the drain on a known-good auth via the GET path. Unlike the
    // CORS-masked POST, the GET reply is readable, so this catches rejected
    // credentials before provisional-success can silently drop queued games.
    // On failure verifyAuth calls clearSession (which PRESERVES the queue), so
    // entries survive and retry after the user reconnects.
    if (navigator.onLine && getPending().length > 0) {
      const authOk = await verifyAuth();
      if (!authOk) { dlog("drain:aborted_auth", null); return; }
    }
    let confirmed = 0;
    let provisional = 0;
    while (true) {
      const pending = getPending();
      if (pending.length === 0) break;
      const entry = pending[0];
      const result = await queueAttempt(entry.payload);

      if (result.ok) {
        queueWrite(QUEUE_PENDING_KEY, pending.slice(1));
        if (result.provisional) provisional++; else confirmed++;
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
      // networkError → leave in place, annotate, stop. After enough tries,
      // swap the raw TypeError for an actionable message. The entry stays in
      // pending and keeps retrying — this only changes what the user sees.
      const nextAttempts = entry.attempts + 1;
      const lastError = nextAttempts >= STUCK_AFTER_ATTEMPTS
        ? "Couldn't sync after " + nextAttempts + " tries — you may be offline, or open Diagnostics and check your sheet for this game."
        : result.err;
      const updated = { ...entry, attempts: nextAttempts, lastError };
      queueWrite(QUEUE_PENDING_KEY, [updated, ...pending.slice(1)]);
      break;
    }
    const total = confirmed + provisional;
    dlog("drain:done", { confirmed, provisional, remaining: getPending().length });
    if (total > 0) {
      const msg = `Synced ${total} game${total === 1 ? "" : "s"}`;
      // Hedge if any entry succeeded provisionally (response wasn't readable).
      showToast(provisional > 0 ? `${msg} — please verify in sheet` : msg, "success");
    }
    maybeStartInterval();
  } finally {
    _isDraining = false;
    if (_pendingRerun) {
      _pendingRerun = false;
      const rerunManual = _pendingRerunManual;
      _pendingRerunManual = false;
      drainQueue(rerunManual ? { manual: true } : undefined);
    }
  }
}

function retryQueued(id, bucket) {
  const fromKey = bucket === "failed" ? QUEUE_FAILED_KEY : QUEUE_PENDING_KEY;
  const list = queueRead(fromKey);
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return;
  const [entry] = list.splice(idx, 1);
  queueWrite(fromKey, list);
  queueWrite(QUEUE_PENDING_KEY, [...getPending(), { ...entry, attempts: entry.attempts, lastError: null }]);
  dlog("retry:single", { id, fromBucket: bucket });
  drainQueue({ manual: true });
}

function deleteQueued(id, bucket) {
  const key = bucket === "failed" ? QUEUE_FAILED_KEY : QUEUE_PENDING_KEY;
  const list = queueRead(key);
  const next = list.filter((e) => e.id !== id);
  if (next.length !== list.length) {
    queueWrite(key, next);
    dlog("queue:deleted", { id, bucket });
  }
}

let _drainInterval = null;

function maybeStartInterval() {
  const active = getPending().length > 0 && isAutoRetryEnabled() && !!ENDPOINT;
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
window.addEventListener("online",  () => { dlog("net:online",  null); drainQueue(); });
window.addEventListener("offline", () => { dlog("net:offline", null); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") drainQueue();
});
// Kick a drain on load if anything is pending.
document.addEventListener("DOMContentLoaded", () => {
  dlog("app:load", { version: APP_VERSION, online: navigator.onLine, pending: getPending().length, failed: getFailed().length });
  // Sync the toggle UI to localStorage (default: enabled).
  const toggle = document.getElementById("autoRetryToggle");
  if (toggle) toggle.checked = isAutoRetryEnabled();
  if (getPending().length > 0) drainQueue();
  maybeStartInterval();
});

// ——— QUEUE UI ———
// Renders the header badge and the bottom-sheet list. Never writes to
// localStorage directly — goes through the queue module (submit/drain/retry/
// delete). Subscribes to "botc:queue-changed".

function refreshQueueBadge() {
  const badge = document.getElementById("queueBadge");
  const text  = document.getElementById("queueBadgeText");
  if (!badge || !text) return;
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

// Module-level set of entry IDs whose delete button is currently armed.
// Must live outside renderQueueSheet because innerHTML re-renders wipe DOM nodes.
// _armTimers stores the setTimeout handle per id so we can cancel stale timers
// when the sheet closes or when an entry is re-armed after close/reopen.
const _armedForDelete = new Set();
const _armTimers = new Map();

// Set-based counter so the body scroll-lock releases only when every sheet
// has closed. Each open/close pair calls this with a stable id.
const _openSheets = new Set();
function lockBodyScroll(id, open) {
  if (open) _openSheets.add(id); else _openSheets.delete(id);
  document.body.classList.toggle("sheet-open", _openSheets.size > 0);
}

function openQueueSheet() {
  lockBodyScroll("queue", true);
  document.getElementById("queueSheetBackdrop").classList.remove("hidden");
  document.getElementById("queueSheet").classList.remove("hidden");
  renderQueueSheet();
  // Sync toggle to localStorage in case it changed elsewhere or this is the
  // first open after a reload.
  const toggle = document.getElementById("autoRetryToggle");
  if (toggle) toggle.checked = isAutoRetryEnabled();
  // Collapse the CSV pane so it doesn't carry stale data across opens.
  document.getElementById("queueCsvSection")?.classList.add("hidden");
  document.addEventListener("keydown", queueSheetKeyHandler);
}

function closeQueueSheet() {
  lockBodyScroll("queue", false);
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
    <div class="${cls}" data-id="${safeId}" onclick="openQueueDetail('${safeId}', '${safeBucket}')">
      <div class="queue-row-summary">${escHtml(summarizeEntry(entry))}</div>
      <div class="queue-row-meta">${new Date(entry.createdAt).toLocaleString()} · attempts: ${entry.attempts}</div>
      ${err}
      <div class="queue-row-actions" onclick="event.stopPropagation()">
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

function openQueueDetail(id, bucket) {
  const list  = bucket === "failed" ? getFailed() : getPending();
  const entry = list.find(e => String(e.id).replace(/[^0-9a-f-]/gi, "") === id);
  if (!entry) return;

  const p = entry.payload || {};
  document.getElementById("gameDetailTitle").textContent = p.script || "Queued game";

  const statusRows = [
    `<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${bucket === "failed" ? "Failed" : "Pending"}</span></div>`,
    `<div class="detail-row"><span class="detail-label">Queued</span><span class="detail-value">${new Date(entry.createdAt).toLocaleString()}</span></div>`,
    `<div class="detail-row"><span class="detail-label">Attempts</span><span class="detail-value">${entry.attempts}</span></div>`,
    entry.lastError ? `<div class="detail-row"><span class="detail-label">Last error</span><span class="detail-value">${escHtml(entry.lastError)}</span></div>` : "",
  ].filter(Boolean).join("");

  const queueDetailFields = [
    ["date","Date"],["script","Script"],["event","Event"],["location","Location"],
    ["liveOnline","Format"],["storyteller","Storyteller"],["numPlayers","Players"],
    ["startingRole","Starting Role"],["startingTeam","Starting Team"],
    ["midGameRole","Mid Game Role"],["midGameTeam","Mid Game Team"],
    ["endingRole","Ending Role"],["endingTeam","Ending Team"],
    ["startDemon","Start Demon"],["endDemon","End Demon"],
    ["winningTeam","Winning Team"],["winLoss","Result"],["lastNight","Last Day"],
    ["specialWinType","Special Win Type"],["roleNotes","Role Notes"],
    ["livedDiedNotes","Lived / Died / Executed / Exiled"],
    ["fabled1","Fabled 1"],["fabled2","Fabled 2"],["fabled3","Fabled 3"],
    ["fabledNotes","Fabled Notes"],["loric1","Loric 1"],["loric2","Loric 2"],
    ["loricNotes","Loric Notes"],
    ["traveller1","Traveller 1"],["traveller1GE","Traveller 1 G/E"],
    ["traveller2","Traveller 2"],["traveller2GE","Traveller 2 G/E"],
    ["traveller3","Traveller 3"],["traveller3GE","Traveller 3 G/E"],
    ["travellerNotes","Traveller Notes"],
    ["wizardGame","Wizard Game"],["wishNotes","Wish Notes"],
    ["winLossNotes","Win/Loss Notes"],["overallGameNotes","Overall Game Notes"],
  ];
  const dataRows = queueDetailFields
    .filter(([key]) => {
      const v = p[key];
      return v !== undefined && v !== "" && v !== 0;
    })
    .map(([key, label]) =>
      `<div class="detail-row">` +
      `<span class="detail-label">${escHtml(label)}</span>` +
      `<span class="detail-value">${escHtml(String(p[key]))}</span>` +
      `</div>`
    )
    .join("");

  document.getElementById("gameDetailBody").innerHTML =
    `<div class="detail-section-title">Queue status</div>` + statusRows +
    `<div class="detail-section-title">Game data</div>` + dataRows;

  document.getElementById("gameDetailSheet").classList.remove("hidden");
  document.getElementById("gameDetailBackdrop").classList.remove("hidden");
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
  dlog("retry:all", { failedCount: failed.length, pendingCount: getPending().length });
  if (failed.length) {
    const next = failed.map((e) => ({ ...e, lastError: null }));
    // Each queueWrite dispatches "botc:queue-changed", which triggers
    // refreshQueueBadge + renderQueueSheet — no manual re-render needed here.
    queueWrite(QUEUE_PENDING_KEY, [...getPending(), ...next]);
    queueWrite(QUEUE_FAILED_KEY, []);
  }
  // Manual flag bypasses the auto-retry toggle so an explicit user retry
  // always runs even when automatic retries are paused for debugging.
  drainQueue({ manual: true });
}

// ——— QUEUE CSV EXPORT ———
// Field order matches the Google Sheet's column order so the CSV can be
// pasted directly into a spreadsheet to recover queued games manually.
const CSV_FIELDS = [
  "date", "event", "location", "liveOnline", "script", "storyteller", "numPlayers",
  "startingRole", "startingTeam", "midGameRole", "midGameTeam", "endingRole", "endingTeam",
  "roleNotes", "livedDiedNotes", "startDemon", "endDemon",
  "winningTeam", "winLoss", "lastNight",
  "fabled1", "fabled2", "fabled3", "fabledNotes",
  "loric1", "loric2", "loricNotes",
  "traveller1", "traveller1GE", "traveller2", "traveller2GE",
  "traveller3", "traveller3GE", "travellerNotes",
  "specialWinType",
  "wizardGame", "wishNotes", "winLossNotes", "overallGameNotes",
];
const CSV_META_FIELDS = ["bucket", "id", "createdAt", "attempts", "lastError"];

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvRow(bucket, entry) {
  const p = entry.payload || {};
  const meta = [
    bucket,
    entry.id || "",
    new Date(entry.createdAt || 0).toISOString(),
    entry.attempts || 0,
    entry.lastError || "",
  ];
  const data = CSV_FIELDS.map(f => p[f] != null ? p[f] : "");
  return [...meta, ...data].map(csvEscape).join(",");
}

function buildQueueCsv() {
  const pending = getPending();
  const failed = getFailed();
  if (pending.length + failed.length === 0) return "(queue is empty)";
  const header = [...CSV_META_FIELDS, ...CSV_FIELDS].map(csvEscape).join(",");
  const rows = [
    ...pending.map(e => csvRow("pending", e)),
    ...failed .map(e => csvRow("failed",  e)),
  ];
  return [header, ...rows].join("\n");
}

function toggleCsvExport() {
  const section = document.getElementById("queueCsvSection");
  if (!section) return;
  if (section.classList.contains("hidden")) {
    document.getElementById("queueCsvText").value = buildQueueCsv();
    section.classList.remove("hidden");
  } else {
    section.classList.add("hidden");
  }
}

// ——— DEBUG LOG UI ———
function formatLog() {
  const log = readLog();
  if (log.length === 0) return "(empty)";
  return log.map(entry => {
    const t = new Date(entry.t).toISOString().slice(0, 23).replace("T", " "); // date + HH:MM:SS.mmm
    const data = entry.d != null ? " " + JSON.stringify(entry.d) : "";
    return `[${t}] ${entry.e}${data}`;
  }).join("\n");
}

function refreshDiagLog() {
  const ta = document.getElementById("diagLogText");
  if (ta) ta.value = formatLog();
}

function clearDebugLog() {
  try { localStorage.removeItem(LOG_KEY); } catch (_) {}
  dlog("log:cleared", null); // dlog re-creates the buffer with one entry
  refreshDiagLog();
}

// ——— DIAGNOSTICS SHEET ———
function openDiagnostics() {
  lockBodyScroll("diagnostics", true);
  document.getElementById("diagVersion").textContent = APP_VERSION;
  document.getElementById("diagConn").textContent =
    (ENDPOINT ? "configured" : "not connected") + (navigator.onLine ? " · online" : " · offline");
  document.getElementById("diagQueued").textContent =
    `${getPending().length} pending · ${getFailed().length} failed`;
  refreshDiagLog();
  document.getElementById("diagBackdrop").classList.remove("hidden");
  document.getElementById("diagSheet").classList.remove("hidden");
}

function closeDiagnostics() {
  lockBodyScroll("diagnostics", false);
  document.getElementById("diagBackdrop").classList.add("hidden");
  document.getElementById("diagSheet").classList.add("hidden");
}

// Force the PWA onto the latest code without DevTools: tell any waiting service
// worker to activate, unregister all workers, delete every cache, then reload.
async function forceUpdate() {
  dlog("sw:force_update", { version: APP_VERSION });
  const btn = document.getElementById("diagUpdateBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
        await reg.unregister();
      }
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (err) {
    dlog("sw:force_update_error", { err: String(err) });
  } finally {
    // Cache-busting param ensures the navigation itself isn't served from any
    // lingering HTTP cache.
    location.replace(location.pathname + "?u=" + Date.now());
  }
}

// ——— CLIPBOARD HELPER ———
function copyTextareaById(id) {
  const ta = document.getElementById(id);
  if (!ta) return;
  ta.focus();
  ta.select();
  const fallback = () => showToast("Press Cmd/Ctrl+C to copy", "info");
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(
        () => showToast("Copied to clipboard", "success"),
        fallback
      );
      return;
    }
    if (document.execCommand && document.execCommand("copy")) {
      showToast("Copied to clipboard", "success");
      return;
    }
    fallback();
  } catch (_) {
    fallback();
  }
}

// ——— SESSION ———
// Clears stored credentials and returns the user to the setup screen.
// Called on auth failure AND from the manual reset button in the header.
function clearSession(toastMsg) {
  dlog("session:cleared", { reason: toastMsg || "manual" });
  // INVARIANT: do NOT touch queue buckets or game-info prefill. Queued games
  // are user data that must survive a password reset.
  const beforePending = localStorage.getItem(QUEUE_PENDING_KEY);
  const beforeFailed  = localStorage.getItem(QUEUE_FAILED_KEY);
  const beforePrefill = localStorage.getItem(GAME_INFO_KEY);

  deleteCookie(STORAGE_KEY);
  deleteCookie(AUTH_KEY);
  ENDPOINT = "";
  AUTH_HASH = "";
  _recentRows    = [];
  _recentOffset  = 0;
  _recentHasMore = false;
  _recentLoaded  = false;
  _recentLoading = false;
  DYNAMIC = { events: [], locations: [], scripts: [], storytellers: [], roles: [], demons: [], fabled: [], lorics: [], travellers: [] };
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

// ——— SHA-256 ———
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ——— SETUP ———
async function saveEndpoint() {
  let val = document.getElementById("setupUrl").value.trim();
  const password = document.getElementById("setupPassword").value;

  if (!password) {
    showToast("Please enter your password", "error");
    return;
  }

  // Accept either a full URL or just a deployment ID
  if (val.startsWith("https://script.google.com/")) {
    ENDPOINT = val;
  } else if (val.startsWith("AKfycb")) {
    ENDPOINT = "https://script.google.com/macros/s/" + val + "/exec";
  } else {
    showToast("Paste a Deployment ID (starts with AKfycb) or full URL", "error");
    return;
  }

  AUTH_HASH = await sha256(password);
  setCookie(STORAGE_KEY, ENDPOINT);
  setCookie(AUTH_KEY, AUTH_HASH);
  dlog("session:connect", { endpoint: ENDPOINT });
  document.getElementById("setupOverlay").classList.add("hidden");
  loadOptions();
}

// ——— LOAD DYNAMIC OPTIONS ———
async function loadOptions() {
  setConnected(false, "Connecting...");
  try {
    const url = ENDPOINT + "?key=" + encodeURIComponent(AUTH_HASH);
    const resp = await fetch(url, { redirect: "follow" });
    const data = await resp.json();
    if (data.error) {
      dlog("options:error", { err: data.error });
      if (data.error === "Unauthorized") {
        clearSession("Wrong password — please re-enter");
      } else {
        setConnected(false, data.error);
      }
      return;
    }
    DYNAMIC = data.options;
    dlog("options:loaded", {
      scripts: (DYNAMIC.scripts || []).length,
      roles:   (DYNAMIC.roles   || []).length,
    });
    setConnected(true, "Connected to sheet");
  } catch (err) {
    dlog("options:fetch_failed", { err: String(err), online: navigator.onLine });
    setConnected(false, "Offline — using built-in lists");
  }
}

// Auth probe over the GET path. Unlike the CORS-masked POST (whose redirect
// strips CORS headers so the browser can't read the reply), the GET response IS
// readable here — that's why connect-time loadOptions works. drainQueue uses
// this to confirm credentials are still good BEFORE trusting provisional POST
// successes, so a rejected password can't silently drop queued games.
// Returns true if auth is good OR if it can't be determined (network/CORS).
async function verifyAuth() {
  if (!ENDPOINT) return true;
  try {
    const url = ENDPOINT + "?key=" + encodeURIComponent(AUTH_HASH);
    const resp = await fetch(url, { redirect: "follow" });
    const data = await resp.json();
    if (data.error === "Unauthorized") {
      dlog("auth:verify_failed", null);
      clearSession("Session expired — please reconnect");
      return false;
    }
    return true;
  } catch (_) {
    return true; // couldn't verify — don't disrupt the user
  }
}

function setConnected(ok, msg) {
  document.getElementById("connectionDot").classList.toggle("connected", ok);
  document.getElementById("connectionStatus").textContent = msg;
}

// ——— AUTOCOMPLETE ———
function setupAutocomplete(fieldId, optionsFn) {
  const input = document.getElementById(fieldId);
  const list = document.getElementById(fieldId + "-ac");
  input.addEventListener("focus", () => showSuggestions(input, list, optionsFn));
  input.addEventListener("input", () => showSuggestions(input, list, optionsFn));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      list.classList.remove("show");
    } else if (e.key === "Escape") {
      list.classList.remove("show");
      e.preventDefault();
    } else if (e.key === "Enter" && list.classList.contains("show")) {
      list.classList.remove("show");
    }
  });
}

function showSuggestions(input, list, optionsFn) {
  const val = input.value.toLowerCase().trim();
  const opts = optionsFn();
  const filtered = val
    ? opts.filter(o => o.toLowerCase().includes(val))
    : opts.slice(0, 20);
  if (filtered.length === 0) { list.classList.remove("show"); return; }
  list.innerHTML = filtered.map(o =>
    '<div class="autocomplete-item" onmousedown="selectAC(this,\'' + input.id + '\')">' + escHtml(o) + '</div>'
  ).join("");
  list.classList.add("show");
}

function selectAC(el, fieldId) {
  document.getElementById(fieldId).value = el.textContent;
  el.closest(".autocomplete-list").classList.remove("show");
  clearInvalid(fieldId);
  // Auto-set team when a role is selected
  autoSetTeamFromRole(fieldId);
  // Propagate to mid/end fields if this was the starting role
  if (fieldId === "startingRole") autoFillRoleFields();
}

function escHtml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

// ——— AUTO-SET TEAM FROM ROLE ———
// Maps role field → team field
const ROLE_TO_TEAM = { startingRole: "startingTeam", midGameRole: "midGameTeam", endingRole: "endingTeam" };
// Quick lookup: if it's a known demon/minion → Evil, else if in ALL_ROLES → Good
const EVIL_ROLES = new Set([
  ...ALL_DEMONS,
  "Assassin","Baron","Boffin","Boomdandy","Cerenovus","Devil's Advocate","Evil Twin",
  "Fearmonger","Goblin","Godfather","Harpy","Marionette","Mastermind","Mezepheles",
  "Organ Grinder","Pit-Hag","Poisoner","Psychopath","Scarlet Woman","Spy","Summoner",
  "Vizier","Widow","Witch","Wizard","Wraith","Xaan"
]);

function autoSetTeamFromRole(fieldId) {
  const teamField = ROLE_TO_TEAM[fieldId];
  if (!teamField) return;
  const role = document.getElementById(fieldId).value.trim();
  if (!role) return;
  const team = EVIL_ROLES.has(role) ? "Evil" : "Good";
  document.getElementById(teamField).value = team;
  document.querySelectorAll('[data-field="' + teamField + '"]').forEach(c => {
    c.classList.toggle("selected", c.dataset.value === team);
  });
  clearInvalid(teamField);
  autoSetWinLoss();
}

// ——— ROLE AUTOFILL ———
// When Starting Role/Team is set and mid/end fields are empty, fill them in.
// Called from the startingRole input listener and from selectAC.
function autoFillRoleFields() {
  const role = document.getElementById("startingRole").value.trim();
  const team = document.getElementById("startingTeam").value;

  const rolePairs = [
    ["midGameRole",  "midGameTeam"],
    ["endingRole",   "endingTeam"],
  ];
  for (const [roleField, teamField] of rolePairs) {
    if (role && !document.getElementById(roleField).value.trim()) {
      document.getElementById(roleField).value = role;
    }
    if (team && !document.getElementById(teamField).value) {
      document.getElementById(teamField).value = team;
      document.querySelectorAll('[data-field="' + teamField + '"]').forEach(c => {
        c.classList.toggle("selected", c.dataset.value === team);
      });
    }
  }
  autoSetWinLoss();
}

// ——— CHIPS ———
function selectChip(el) {
  const field = el.dataset.field;
  const value = el.dataset.value;
  el.parentElement.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
  const hidden = document.getElementById(field);
  if (hidden.value === value) { hidden.value = ""; }
  else { el.classList.add("selected"); hidden.value = value; }
  if (hidden.value) clearInvalid(field);
  autoSetWinLoss();
  // Propagate starting team to mid/end team when they're empty
  if (field === "startingTeam") autoFillRoleFields();
}

function autoSetWinLoss() {
  const startTeam = document.getElementById("startingTeam").value;
  const endTeam = document.getElementById("endingTeam").value;
  const winTeam = document.getElementById("winningTeam").value;
  const myTeam = endTeam || startTeam;
  if (myTeam && winTeam) {
    const result = myTeam === winTeam ? "W" : "L";
    document.getElementById("winLoss").value = result;
    document.querySelectorAll('[data-field="winLoss"]').forEach(c => {
      c.classList.toggle("selected", c.dataset.value === result);
    });
    clearInvalid("winLoss");
  }
}

// ——— VALIDATION ———
function markInvalid(id) {
  const el = document.getElementById(id);
  if (el) el.closest(".field")?.classList.add("field-invalid");
}

function clearInvalid(id) {
  const el = document.getElementById(id);
  if (el) el.closest(".field")?.classList.remove("field-invalid");
}

const REQUIRED_FIELDS = [
  { id: "date",         label: "Date" },
  { id: "numPlayers",   label: "Players" },
  { id: "script",       label: "Script" },
  { id: "startingRole", label: "Starting Role" },
  { id: "startingTeam", label: "Starting Team" },
  { id: "startDemon",   label: "Start Demon" },
  { id: "winningTeam",  label: "Winning Team" },
  { id: "winLoss",      label: "Result" },
];

// Fields whose value (when non-blank) must be a member of a known list, mapped
// to the list that defines validity. Mirrors the sheet's per-column dropdowns:
// writing a value outside the list would be rejected by the sheet, so we catch
// it here with a clear message instead of letting it corrupt the write.
// Blank is always valid (these fields are optional). Dynamic values seen in the
// sheet are merged in so legitimately new entries aren't falsely rejected.
function listFieldValidators() {
  const roles      = mergeUnique(ALL_ROLES, DYNAMIC.roles);
  const demons     = mergeUnique(ALL_DEMONS, DYNAMIC.demons);
  const fabled     = mergeUnique(ALL_FABLED, DYNAMIC.fabled);
  const lorics     = mergeUnique(ALL_LORICS, DYNAMIC.lorics);
  const travellers = mergeUnique(ALL_ROLES, DYNAMIC.travellers);
  return [
    { id: "startingRole", label: "Starting Role", list: roles },
    { id: "midGameRole",  label: "Mid Game Role", list: roles },
    { id: "endingRole",   label: "Ending Role",   list: roles },
    { id: "startDemon",   label: "Start Demon",   list: demons },
    { id: "endDemon",     label: "End Demon",     list: demons },
    { id: "fabled1",      label: "Fabled 1",      list: fabled },
    { id: "fabled2",      label: "Fabled 2",      list: fabled },
    { id: "fabled3",      label: "Fabled 3",      list: fabled },
    { id: "loric1",       label: "Loric 1",       list: lorics },
    { id: "loric2",       label: "Loric 2",       list: lorics },
    { id: "traveller1",   label: "Traveller 1",   list: travellers },
    { id: "traveller2",   label: "Traveller 2",   list: travellers },
    { id: "traveller3",   label: "Traveller 3",   list: travellers },
  ];
}

// Returns [{id,label}] for fields whose non-blank value isn't in its list.
// Takes a plain values object (keyed by field id) so it is unit-testable.
function invalidListFields(values) {
  return listFieldValidators()
    .filter(({ id, list }) => {
      const v = (values[id] != null ? String(values[id]) : "").trim();
      return v !== "" && !list.includes(v);
    })
    .map(({ id, label }) => ({ id, label }));
}

function validateForm() {
  return REQUIRED_FIELDS.filter(({ id }) => {
    const el = document.getElementById(id);
    if (!el) return false;
    if (id === "numPlayers") return !(parseInt(el.value) > 0);
    return !el.value.trim();
  });
}

// ——— COLLAPSIBLE SECTIONS ———
function toggleSection(name) {
  const content = document.getElementById(name + "Content");
  const toggle = document.getElementById(name + "Toggle");
  const show = !content.classList.contains("show");
  content.classList.toggle("show", show);
  if (name === "midGame") {
    toggle.textContent = show ? "\u2212 Hide mid-game role change" : "+ Role changed mid-game";
  } else if (name === "fabled") {
    toggle.textContent = show ? "\u2212 Hide Fabled / Loric" : "+ Add Fabled / Loric characters";
  } else if (name === "travellers") {
    toggle.textContent = show ? "\u2212 Hide travellers" : "+ Add travellers";
  }
}

// ——— EDIT MODE ———
// null = logging a new game; otherwise { rowNum } of the sheet row being edited.
let EDITING = null;

// Tracks the last set of off-list fields the user was warned about (comma-joined
// sorted ids), so a deliberate resubmit of the same unusual values isn't blocked.
// Reset to "" whenever a clean submit passes the list check.
let _listWarnAcked = "";

// Text/select inputs whose ids match history-row keys 1:1.
const EDIT_TEXT_FIELDS = [
  "date","event","location","liveOnline","script","storyteller","numPlayers",
  "startingRole","midGameRole","endingRole","roleNotes","livedDiedNotes",
  "startDemon","endDemon","lastNight","specialWinType",
  "fabled1","fabled2","fabled3","fabledNotes","loric1","loric2","loricNotes",
  "traveller1","traveller2","traveller3","travellerNotes",
  "wizardGame","wishNotes","winLossNotes","overallGameNotes",
];
// Hidden chip-backed inputs (Good/Evil + W/L). Value is set + matching chip highlighted.
const EDIT_CHIP_FIELDS = [
  "startingTeam","midGameTeam","endingTeam","winningTeam","winLoss",
  "traveller1GE","traveller2GE","traveller3GE",
];

// Fills the form from a history row object.
function populateForm(row) {
  EDIT_TEXT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = row[id] != null ? row[id] : "";
  });
  EDIT_CHIP_FIELDS.forEach(id => {
    const val = row[id] != null ? String(row[id]) : "";
    const hidden = document.getElementById(id);
    if (hidden) hidden.value = val;
    document.querySelectorAll(`.chip[data-field="${id}"]`).forEach(c => {
      c.classList.toggle("selected", c.dataset.value === val && val !== "");
    });
  });
  setSectionOpen("midGame", !!(row.midGameRole || row.endingRole));
  setSectionOpen("fabled", !!(row.fabled1 || row.fabled2 || row.fabled3 ||
    row.fabledNotes || row.loric1 || row.loric2 || row.loricNotes));
  setSectionOpen("travellers", !!(row.traveller1 || row.traveller2 ||
    row.traveller3 || row.travellerNotes));
}

// Force a collapsible section open or closed (mirrors toggleSection's effect).
function setSectionOpen(name, open) {
  const content = document.getElementById(name + "Content");
  const toggle = document.getElementById(name + "Toggle");
  if (!content || !toggle) return;
  content.classList.toggle("show", open);
  if (name === "midGame") {
    toggle.textContent = open ? "− Hide mid-game role change" : "+ Role changed mid-game";
  } else if (name === "fabled") {
    toggle.textContent = open ? "− Hide Fabled / Loric" : "+ Add Fabled / Loric characters";
  } else if (name === "travellers") {
    toggle.textContent = open ? "− Hide travellers" : "+ Add travellers";
  }
}

// Enters edit mode for the recent game at `index` in _recentRows.
function editGame(index) {
  const row = _recentRows[index];
  if (!row || !row.rowNum) return;
  closeGameDetail();
  switchTab("log");
  populateForm(row);
  EDITING = { rowNum: row.rowNum };
  const banner = document.getElementById("editBanner");
  document.getElementById("editBannerText").textContent =
    "Editing game from " + (row.date || "?") + (row.script ? " · " + row.script : "");
  banner.classList.remove("hidden");
  document.querySelector("#submitBtn .btn-text").textContent = "Update game";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Leaves edit mode and restores the form to new-game logging.
function cancelEdit() {
  EDITING = null;
  document.getElementById("editBanner").classList.add("hidden");
  document.querySelector("#submitBtn .btn-text").textContent = "Log Game";
  resetFormForNextGame();
  // resetFormForNextGame intentionally keeps GAME INFO fields for back-to-back
  // logging, but an edited game's date may be old — re-default it to today so
  // the next new game doesn't silently inherit a stale date.
  document.getElementById("date").valueAsDate = new Date();
}

// ——— SUBMIT ———
async function submitGame(e) {
  e.preventDefault();

  const failures = validateForm();
  if (failures.length > 0) {
    failures.forEach(f => markInvalid(f.id));
    showToast("Required: " + failures.map(f => f.label).join(", "), "error");
    return;
  }

  // Soft-warn (don't block) on values outside the known role/demon/fabled/loric
  // lists. The backend self-heals the write now, so off-list values DO save
  // correctly — but an off-list value is usually a typo (e.g. a stray "g" in
  // Mid Game Role). So we warn once and let a second submit through. Legitimate
  // unusual entries (e.g. "No Demon (Summoner)") are never permanently blocked.
  const listVals = {
    startingRole: document.getElementById("startingRole").value.trim(),
    midGameRole:  document.getElementById("midGameRole").value.trim(),
    endingRole:   document.getElementById("endingRole").value.trim(),
    startDemon:   document.getElementById("startDemon").value.trim(),
    endDemon:     document.getElementById("endDemon").value.trim(),
    fabled1:      document.getElementById("fabled1").value.trim(),
    fabled2:      document.getElementById("fabled2").value.trim(),
    fabled3:      document.getElementById("fabled3").value.trim(),
    loric1:       document.getElementById("loric1").value.trim(),
    loric2:       document.getElementById("loric2").value.trim(),
    traveller1:   document.getElementById("traveller1").value.trim(),
    traveller2:   document.getElementById("traveller2").value.trim(),
    traveller3:   document.getElementById("traveller3").value.trim(),
  };
  const badList = invalidListFields(listVals);
  const badSig = badList.map(f => f.id).sort().join(",");
  if (badList.length > 0 && badSig !== _listWarnAcked) {
    // First time seeing this exact set of off-list fields — warn and wait for a
    // second submit to confirm. Remembered so an intentional resubmit goes through.
    badList.forEach(f => markInvalid(f.id));
    _listWarnAcked = badSig;
    showToast("Check spelling: " + badList.map(f => f.label).join(", ") + " — submit again to keep", "info");
    return;
  }
  _listWarnAcked = "";

  const btn = document.getElementById("submitBtn");
  btn.classList.add("loading"); btn.disabled = true;

  const payload = {
    clientId:       crypto.randomUUID(), // idempotency key — server deduplicates on retry
    key:            AUTH_HASH,
    date:           document.getElementById("date").value,
    event:          document.getElementById("event").value.trim(),
    location:       document.getElementById("location").value.trim(),
    liveOnline:     document.getElementById("liveOnline").value,
    script:         document.getElementById("script").value.trim(),
    storyteller:    document.getElementById("storyteller").value.trim(),
    numPlayers:     document.getElementById("numPlayers").value,
    startingRole:   document.getElementById("startingRole").value.trim(),
    startingTeam:   document.getElementById("startingTeam").value,
    midGameRole:    document.getElementById("midGameRole").value.trim(),
    midGameTeam:    document.getElementById("midGameTeam").value,
    endingRole:     document.getElementById("endingRole").value.trim(),
    endingTeam:     document.getElementById("endingTeam").value,
    roleNotes:      document.getElementById("roleNotes").value.trim(),
    livedDiedNotes: document.getElementById("livedDiedNotes").value.trim(),
    startDemon:     document.getElementById("startDemon").value.trim(),
    endDemon:       document.getElementById("endDemon").value.trim() || document.getElementById("startDemon").value.trim(),
    winningTeam:    document.getElementById("winningTeam").value,
    winLoss:        document.getElementById("winLoss").value,
    lastNight:      document.getElementById("lastNight").value,
    specialWinType: document.getElementById("specialWinType").value.trim(),
    fabled1:        document.getElementById("fabled1").value.trim(),
    fabled2:        document.getElementById("fabled2").value.trim(),
    fabled3:        document.getElementById("fabled3").value.trim(),
    fabledNotes:    document.getElementById("fabledNotes").value.trim(),
    loric1:         document.getElementById("loric1").value.trim(),
    loric2:         document.getElementById("loric2").value.trim(),
    loricNotes:     document.getElementById("loricNotes").value.trim(),
    traveller1:     document.getElementById("traveller1").value.trim(),
    traveller1GE:   document.getElementById("traveller1GE").value,
    traveller2:     document.getElementById("traveller2").value.trim(),
    traveller2GE:   document.getElementById("traveller2GE").value,
    traveller3:     document.getElementById("traveller3").value.trim(),
    traveller3GE:   document.getElementById("traveller3GE").value,
    travellerNotes: document.getElementById("travellerNotes").value.trim(),
    wizardGame:     document.getElementById("wizardGame").value,
    wishNotes:      document.getElementById("wishNotes").value.trim(),
    winLossNotes:   document.getElementById("winLossNotes").value.trim(),
    overallGameNotes: document.getElementById("overallGameNotes").value.trim()
  };

  try {
    if (EDITING) {
      // Online-only update — never queued. A stale queued edit could overwrite
      // newer data or target a shifted row.
      if (!navigator.onLine) {
        showToast("Can't edit while offline", "error");
        return;
      }
      const updatePayload = Object.assign({}, payload, {
        action: "update", rowNum: EDITING.rowNum,
      });
      dlog("edit:sending", redactPayload(updatePayload));
      const result = await postPayload(updatePayload);
      if (result.ok) {
        showToast(
          result.provisional ? "Game updated — please verify in sheet"
                             : "Game updated",
          "success"
        );
        cancelEdit();             // clears EDITING, resets form, hides banner
        // Refresh Recent so the row shows new values. loadRecentGames CONCATs
        // onto _recentRows, so reset the accumulator first or page 0 duplicates.
        _recentRows = [];
        _recentOffset = 0;
        loadRecentGames(0);
        loadOptions();
      } else if (result.authError) {
        clearSession("Wrong password — please re-enter");
      } else {
        // networkError or userError — keep edit mode active so the user retries.
        showToast("Update failed: " + (result.err || "unknown"), "error");
      }
      return;
    }

    const result = await submitViaQueue(payload);

    if (result.synced) {
      const check = await verifyWrite(payload.clientId);
      if (check.ok) {
        showToast(
          (result.provisional || check.unverified)
            ? "Game logged — please verify in sheet"
            : "Game logged! (row " + result.row + ")",
          "success"
        );
      } else {
        // Row missing or truncated — the write did not fully land.
        dlog("submit:verify_failed", { clientId: payload.clientId, check });
        showToast("Saved but may be incomplete — check sheet", "error");
      }
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
}

function resetFormForNextGame() {
  ["startingRole","midGameRole","endingRole","roleNotes","livedDiedNotes",
   "startDemon","endDemon","lastNight","specialWinType","fabled1","fabled2","fabled3",
   "fabledNotes","loric1","loric2","loricNotes",
   "traveller1","traveller2","traveller3","travellerNotes",
   "wizardGame","wishNotes","winLossNotes","overallGameNotes"].forEach(id => {
    document.getElementById(id).value = "";
  });
  ["startingTeam","midGameTeam","endingTeam","winningTeam","winLoss",
   "traveller1GE","traveller2GE","traveller3GE"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
  document.getElementById("midGameContent").classList.remove("show");
  document.getElementById("midGameToggle").textContent = "+ Role changed mid-game";
  document.getElementById("fabledContent").classList.remove("show");
  document.getElementById("fabledToggle").textContent = "+ Add Fabled / Loric characters";
  document.getElementById("travellersContent").classList.remove("show");
  document.getElementById("travellersToggle").textContent = "+ Add travellers";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ——— GAME INFO PERSISTENCE ———
// Remember event/location/format/script/storyteller/numPlayers from the last
// submitted game so the user can prefill the next one with a single tap —
// useful when playing several games back-to-back at the same venue.
const PREFILL_LABELS = {
  event: "Event", location: "Location", liveOnline: "Format",
  script: "Script", storyteller: "ST", numPlayers: "Players"
};

function saveGameInfo() {
  const data = {};
  GAME_INFO_FIELDS.forEach(id => {
    data[id] = document.getElementById(id).value;
  });
  try { localStorage.setItem(GAME_INFO_KEY, JSON.stringify(data)); } catch (_) {}
}

function readLastGameInfo() {
  let raw;
  try { raw = localStorage.getItem(GAME_INFO_KEY); } catch (_) { return null; }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// Shows the prefill button if there's saved data, with a preview of the
// values baked into the button label so the user can see what they'll get
// before tapping.
function refreshPrefillButton() {
  const btn = document.getElementById("prefillBtn");
  const preview = document.getElementById("prefillPreview");
  const data = readLastGameInfo();
  const parts = data
    ? GAME_INFO_FIELDS
        .filter(id => data[id])
        .map(id => PREFILL_LABELS[id] + ": " + data[id])
    : [];
  if (!parts.length) {
    btn.classList.add("hidden");
    preview.textContent = "";
    return;
  }
  preview.textContent = parts.join(" · ");
  btn.classList.remove("hidden");
}

function applyPrefill() {
  const data = readLastGameInfo();
  if (!data) return;
  GAME_INFO_FIELDS.forEach(id => {
    if (data[id] != null) document.getElementById(id).value = data[id];
  });
  document.getElementById("prefillBtn").classList.add("hidden");
}

let _toastTimer = null;
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
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), opts && opts.sticky ? 10000 : 3000);
}
window.showToast = showToast;

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
    // Loud warning: this stubs fetch to reject and forces navigator.onLine
    // false. A reload restores normal state, but this makes an accidental
    // lingering offline mode obvious in the console.
    console.warn("[__qa] OFFLINE MODE ON — fetch is stubbed to reject. Call __qa.goOnline() (or reload) to restore.");
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

// ——— RECENT GAMES ———

let _recentRows    = [];    // accumulated rows across all fetched pages
let _recentOffset  = 0;     // next fetch offset
let _recentHasMore = false;
let _recentLoaded  = false; // true after first successful fetch
let _recentLoading = false; // true while a fetch is in flight

function switchTab(tab) {
  if (!ENDPOINT) return; // not yet connected; setup overlay covers the tab bar
  closeGameDetail();
  document.getElementById("tabLog").classList.toggle("active",    tab === "log");
  document.getElementById("tabRecent").classList.toggle("active", tab === "recent");
  document.querySelector(".form-container").classList.toggle("hidden", tab === "recent");
  document.getElementById("recentContainer").classList.toggle("hidden", tab !== "recent");
  if (tab === "recent" && !_recentLoaded) loadRecentGames(0);
}

async function loadRecentGames(offset) {
  if (_recentLoading) return;
  _recentLoading = true;
  const btn  = document.getElementById("loadMoreBtn");
  const list = document.getElementById("recentList");
  if (offset === 0) {
    list.innerHTML = "<p class='no-games-msg'>Loading…</p>";
  } else {
    btn.textContent = "Loading…";
    btn.classList.add("loading");
  }
  try {
    const url  = ENDPOINT + "?key=" + encodeURIComponent(AUTH_HASH)
               + "&action=history&limit=10&offset=" + offset;
    const resp = await fetch(url, { redirect: "follow" });
    const data = await resp.json();
    if (data.error === "Unauthorized") {
      clearSession("Session expired — please reconnect");
      return;
    }
    if (data.error) {
      showToast(data.error, "error");
      if (offset === 0) list.innerHTML = "<p class='no-games-msg'>Could not load games.</p>";
      _restoreLoadMore();
      return;
    }
    _recentRows    = _recentRows.concat(data.rows);
    _recentOffset  = offset + data.rows.length;
    _recentHasMore = data.hasMore;
    _recentLoaded  = true;
    renderRecentGames();
  } catch (err) {
    showToast("Could not load games — check connection", "error");
    if (offset === 0) list.innerHTML = "<p class='no-games-msg'>Could not load games.</p>";
    _restoreLoadMore();
  } finally {
    _recentLoading = false;
  }
}

function _restoreLoadMore() {
  const btn = document.getElementById("loadMoreBtn");
  btn.textContent = "Load more";
  btn.classList.remove("loading");
}

function loadMoreGames() {
  loadRecentGames(_recentOffset);
}

function renderRecentGames() {
  const list = document.getElementById("recentList");
  const btn  = document.getElementById("loadMoreBtn");
  if (_recentRows.length === 0) {
    list.innerHTML = "<p class='no-games-msg'>No games logged yet.</p>";
    btn.classList.add("hidden");
    return;
  }
  list.innerHTML = _recentRows.map((row, i) => buildRecentRowHTML(row, i)).join("");
  if (_recentHasMore) {
    btn.classList.remove("hidden");
    _restoreLoadMore();
  } else {
    btn.classList.add("hidden");
  }
}

function buildRecentRowHTML(row, index) {
  const isWin      = row.winLoss === "W";
  const badgeClass = isWin ? "win" : "loss";
  const badgeText  = isWin ? "WIN" : "LOSS";
  const roleClass  = row.startingTeam === "Evil" ? "recent-role-evil" : "recent-role-good";

  // Role-change detection: only show when a role actually changed.
  // startingRole is auto-filled into mid/end on submit, so equal values mean no real change.
  const startRole  = (row.startingRole || "").trim();
  const midRole    = (row.midGameRole  || "").trim();
  const endRole    = (row.endingRole   || "").trim();
  const midChanged = midRole && midRole !== startRole;
  const prevRole   = midChanged ? midRole : startRole; // baseline for end-change comparison
  const endChanged = endRole && endRole !== prevRole;
  const hasSpecial = (row.specialWinType || "").trim();

  let line3 = "";
  if (midChanged || endChanged || hasSpecial) {
    const parts = [];
    if (midChanged || endChanged) {
      const rc = t => t === "Evil" ? "recent-role-evil" : "recent-role-good";
      let chain = `<span class="${rc(row.startingTeam)}">${escHtml(startRole)}</span>`;
      if (midChanged) chain += ` → <span class="${rc(row.midGameTeam)}">${escHtml(midRole)}</span>`;
      if (endChanged) chain += ` → <span class="${rc(row.endingTeam)}">${escHtml(endRole)}</span>`;
      parts.push(`<span class="recent-role-change">🔄 ${chain}</span>`);
    }
    if (hasSpecial) {
      parts.push(
        `<span>⭐ <span style="color:var(--accent);font-weight:500">${escHtml(hasSpecial)}</span></span>`
      );
    }
    line3 = `<div class="recent-row-line3">${parts.join('<span style="color:var(--border)"> · </span>')}</div>`;
  }

  return (
    `<div class="recent-row" onclick="openGameDetail(${index})">` +
    `<div class="recent-row-line1">` +
    `<span class="recent-row-script">${escHtml(row.script)}</span>` +
    `<span class="recent-badge ${badgeClass}">${badgeText}</span>` +
    `</div>` +
    `<div class="recent-row-line2">` +
    `<span>🎭 <span class="${roleClass}">${escHtml(row.startingRole)}</span></span>` +
    `<span>😈 ${escHtml(row.startDemon)}</span>` +
    `<span>👥 ${row.numPlayers}</span>` +
    `<span>📅 ${escHtml(row.date)}</span>` +
    `</div>` +
    line3 +
    `</div>`
  );
}


// Section-state helper: turns a row into the shape the role section needs.
// Mirrors buildRecentRowHTML's change-detection so the drawer's timeline
// appears in exactly the cases the row's role arrow appears.
function roleJourney(row) {
  const startRole = (row.startingRole || "").trim();
  const midRole   = (row.midGameRole  || "").trim();
  const endRole   = (row.endingRole   || "").trim();
  const midChanged = !!midRole && midRole !== startRole;
  const prevRole   = midChanged ? midRole : startRole;
  const endChanged = !!endRole && endRole !== prevRole;
  if (!midChanged && !endChanged) {
    return { kind: "single", startRole, startTeam: row.startingTeam || "" };
  }
  const out = {
    kind: "timeline",
    startRole, startTeam: row.startingTeam || "",
  };
  if (midChanged) { out.midRole = midRole; out.midTeam = row.midGameTeam || ""; }
  if (endChanged) {
    out.endRole = endRole;
    out.endTeam = row.endingTeam || "";
    out.endIsDemon = (out.endTeam === "Evil") && !!row.endDemon && endRole === (row.endDemon || "").trim();
  }
  return out;
}

// Section-state helper: array of {label,text} for non-empty notes. Empty
// array means "hide the Notes card".
function notesBlocks(row) {
  const out = [];
  const role  = (row.roleNotes      || "").trim();
  const lived = (row.livedDiedNotes || "").trim();
  if (role)  out.push({ label: "Role",         text: role });
  if (lived) out.push({ label: "Lived / died", text: lived });
  return out;
}

// Section-state helper: returns the names (for tag pills) and the notes
// (for small captions). Tags + notes both empty means "hide the F&L card".
function fabledLoric(row) {
  const names = ["fabled1", "fabled2", "fabled3", "loric1", "loric2"]
    .map(k => (row[k] || "").trim())
    .filter(s => s.length > 0);
  const notes = [];
  const fNotes = (row.fabledNotes || "").trim();
  const lNotes = (row.loricNotes  || "").trim();
  if (fNotes) notes.push({ label: "Fabled notes", text: fNotes });
  if (lNotes) notes.push({ label: "Loric notes",  text: lNotes });
  return { tags: names, notes };
}

// Section-state helper: four tile objects in fixed order for the Game card.
// iconKey is used by the render to look up an inline SVG from ICONS.
function gameStats(row) {
  const startD = (row.startDemon || "").trim();
  const endD   = (row.endDemon   || "").trim();
  const subDemon = (endD && endD !== startD) ? "→ " + endD : undefined;
  const tiles = [
    { iconKey: "demon",   label: "Demon",       value: startD || "—" },
    { iconKey: "players", label: "Players",     value: String(row.numPlayers || "—") },
    { iconKey: "grimoire", label: "Storyteller", value: (row.storyteller || "").trim() || "—" },
    { iconKey: "moon",    label: "Last day",    value: row.lastNight === "Y" ? "Yes" : "No" },
  ];
  if (subDemon) tiles[0].subValue = subDemon;
  return tiles;
}

// Inline monochrome SVG icons for the Game stats card. stroke=currentColor
// + fill=none gives crisp single-color rendering at any size; .detail-stat
// svg in styles.css sizes them and colors them var(--text-muted).
const ICONS = {
  demon:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4l3 5"/><path d="M19 4l-3 5"/><circle cx="12" cy="14" r="6"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M9.5 17q2.5 1.5 5 0"/></svg>',
  players: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 19c1-3.5 4-5 6-5s5 1.5 6 5"/><path d="M14.5 19c.6-2.4 2.6-3.5 4-3.5s2.5.8 2.5 2.5"/></svg>',
  grimoire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5c3-1 6 0 9 2v13c-3-2-6-3-9-2z"/><path d="M21 5c-3-1-6 0-9 2v13c3-2 6-3 9-2z"/><path d="M12 7v13"/></svg>',
  moon:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
};

function openGameDetail(index) {
  const row = _recentRows[index];
  if (!row) return;
  lockBodyScroll("gameDetail", true);

  const teamCls = t => t === "Evil" ? "evil" : "good";
  const isWin   = row.winLoss === "W";
  const special = (row.specialWinType || "").trim();

  // Subtitle parts: skip empty ones cleanly.
  const subParts = [row.event, row.location, row.date, row.liveOnline]
    .map(s => (s || "").toString().trim()).filter(Boolean)
    .map(s => `<span>${escHtml(s)}</span>`).join("");

  // Role section: single chip OR vertical timeline.
  const rj = roleJourney(row);
  let roleBlock;
  if (rj.kind === "single") {
    roleBlock = `<span class="detail-rolechip ${teamCls(rj.startTeam)}">` +
                  `<span class="r">${escHtml(rj.startRole)}</span>` +
                  `<span class="t">${escHtml(rj.startTeam || "")}</span>` +
                `</span>`;
  } else {
    const nodes = [];
    nodes.push(
      `<div class="detail-node"><span class="detail-dot ${teamCls(rj.startTeam)}"></span>` +
        `<div class="detail-when">Started as</div>` +
        `<div class="detail-what ${teamCls(rj.startTeam)}">${escHtml(rj.startRole)}</div>` +
        `<div class="detail-meta">${escHtml(rj.startTeam || "")}</div></div>`
    );
    if (rj.midRole) nodes.push(
      `<div class="detail-node"><span class="detail-dot ${teamCls(rj.midTeam)}"></span>` +
        `<div class="detail-when">Became</div>` +
        `<div class="detail-what ${teamCls(rj.midTeam)}">${escHtml(rj.midRole)}</div>` +
        `<div class="detail-meta">${escHtml(rj.midTeam || "")}</div></div>`
    );
    if (rj.endRole) nodes.push(
      `<div class="detail-node"><span class="detail-dot ${teamCls(rj.endTeam)}"></span>` +
        `<div class="detail-when">Ended as</div>` +
        `<div class="detail-what ${teamCls(rj.endTeam)}">${escHtml(rj.endRole)}</div>` +
        `<div class="detail-meta">${escHtml(rj.endTeam || "")}${rj.endIsDemon ? " · Demon" : ""}</div></div>`
    );
    roleBlock = `<div class="detail-tl">${nodes.join("")}</div>`;
  }

  // Game stats card.
  const tiles = gameStats(row).map(t =>
    `<div class="detail-stat">${ICONS[t.iconKey]}` +
      `<div><div class="lab">${escHtml(t.label)}</div>` +
      `<div class="val">${escHtml(t.value)}</div>` +
      (t.subValue ? `<div class="sub">${escHtml(t.subValue)}</div>` : "") +
      `</div></div>`
  ).join("");

  // Notes card (only if any).
  const notes = notesBlocks(row);
  const notesCard = notes.length === 0 ? "" :
    `<div class="detail-card"><div class="detail-card-h">Notes</div>` +
      notes.map(n =>
        `<div class="detail-note"><span class="lab">${escHtml(n.label)}</span>${escHtml(n.text)}</div>`
      ).join("") +
    `</div>`;

  // Fabled & Loric card (only if any).
  const fl = fabledLoric(row);
  const flCard = (fl.tags.length === 0 && fl.notes.length === 0) ? "" :
    `<div class="detail-card"><div class="detail-card-h">Fabled &amp; Loric</div>` +
      (fl.tags.length
        ? `<div class="detail-tags">${fl.tags.map(n => `<span class="detail-tag">★ ${escHtml(n)}</span>`).join("")}</div>`
        : "") +
      fl.notes.map(n =>
        `<div class="detail-note" style="margin-top:8px"><span class="lab">${escHtml(n.label)}</span>${escHtml(n.text)}</div>`
      ).join("") +
    `</div>`;

  document.getElementById("gameDetailTitle").textContent = "";
  document.getElementById("gameDetailBody").innerHTML =
    `<div class="detail-hero">` +
      `<div class="detail-hero-top">` +
        `<div class="detail-title">${escHtml(row.script || "")}</div>` +
        `<div class="detail-pill-row">` +
          (special ? `<span class="detail-special">★ ${escHtml(special)}</span>` : "") +
          `<span class="detail-result ${isWin ? "win" : "loss"}">${isWin ? "WIN" : "LOSS"}</span>` +
        `</div>` +
      `</div>` +
      (row.rowNum ? `<button type="button" class="detail-edit-btn" onclick="editGame(${index})">Edit game</button>` : "") +
      (subParts ? `<div class="detail-sub">${subParts}</div>` : "") +
    `</div>` +
    `<div class="detail-card"><div class="detail-card-h">Your role</div>${roleBlock}</div>` +
    `<div class="detail-card"><div class="detail-card-h">The game</div><div class="detail-grid">${tiles}</div></div>` +
    notesCard + flCard;

  document.getElementById("gameDetailSheet").classList.remove("hidden");
  document.getElementById("gameDetailBackdrop").classList.remove("hidden");
}

function closeGameDetail() {
  lockBodyScroll("gameDetail", false);
  document.getElementById("gameDetailSheet").classList.add("hidden");
  document.getElementById("gameDetailBackdrop").classList.add("hidden");
}
