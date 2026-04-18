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
const STORAGE_KEY = "botc_logger_endpoint";
const AUTH_KEY = "botc_logger_auth";
const GAME_INFO_KEY = "botc_logger_game_info";
const GAME_INFO_FIELDS = ["event","location","liveOnline","script","storyteller","numPlayers"];
let ENDPOINT = "";
let AUTH_HASH = "";
// Dynamic options from sheet (merged with static on load)
let DYNAMIC = { events: [], locations: [], scripts: [], storytellers: [], roles: [], demons: [], fabled: [], lorics: [] };

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

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-wrapper"))
      document.querySelectorAll(".autocomplete-list").forEach(l => l.classList.remove("show"));
  });
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
    id: crypto.randomUUID(),
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
async function queueAttempt(payload) {
  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    // Opportunistic drain: we have a working connection. Fire-and-forget.
    drainQueue().catch(() => {});
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

// ——— SESSION ———
// Clears stored credentials and returns the user to the setup screen.
// Called on auth failure AND from the manual reset button in the header.
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
      if (data.error === "Unauthorized") {
        clearSession("Wrong password — please re-enter");
      } else {
        setConnected(false, data.error);
      }
      return;
    }
    DYNAMIC = data.options;
    setConnected(true, "Connected to sheet");
  } catch (err) {
    setConnected(false, "Offline — using built-in lists");
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
  // Auto-set team when a role is selected
  autoSetTeamFromRole(fieldId);
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
  autoSetWinLoss();
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
  }
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
  }
}

// ——— SUBMIT ———
async function submitGame(e) {
  e.preventDefault();
  const btn = document.getElementById("submitBtn");
  btn.classList.add("loading"); btn.disabled = true;

  const payload = {
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
    fabled1:        document.getElementById("fabled1").value.trim(),
    fabled2:        document.getElementById("fabled2").value.trim(),
    fabled3:        document.getElementById("fabled3").value.trim(),
    fabledNotes:    document.getElementById("fabledNotes").value.trim(),
    loric1:         document.getElementById("loric1").value.trim(),
    loric2:         document.getElementById("loric2").value.trim(),
    loricNotes:     document.getElementById("loricNotes").value.trim()
  };

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
}

function resetFormForNextGame() {
  ["startingRole","midGameRole","endingRole","roleNotes","livedDiedNotes",
   "startDemon","endDemon","lastNight","fabled1","fabled2","fabled3",
   "fabledNotes","loric1","loric2","loricNotes"].forEach(id => {
    document.getElementById(id).value = "";
  });
  ["startingTeam","midGameTeam","endingTeam","winningTeam","winLoss"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
  document.getElementById("midGameContent").classList.remove("show");
  document.getElementById("midGameToggle").textContent = "+ Role changed mid-game";
  document.getElementById("fabledContent").classList.remove("show");
  document.getElementById("fabledToggle").textContent = "+ Add Fabled / Loric characters";
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
