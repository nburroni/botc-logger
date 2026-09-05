// ——— NOTES (device-local) ———
// Self-contained: no network, no sheet, no queue. Notes live only in this
// device's localStorage. Loaded as a second classic script alongside app.js, so
// it shares app.js's global scope (escHtml / lockBodyScroll come from there).
//
// The top level stays DOM-free — constants and function declarations only — so
// the test harness can evaluate this file in a bare vm context.

const NOTES_KEY = "botc_logger_notes";

// Palette keys are what get stored (not raw hex), so the palette can be
// restyled without migrating saved notes. Every background is dark enough that
// white body text always meets contrast — no per-colour text-colour logic.
const NOTE_COLORS = [
  { key: "slate",   label: "Slate",   bg: "#1f2430" },
  { key: "crimson", label: "Crimson", bg: "#7a1f2b" },
  { key: "teal",    label: "Teal",    bg: "#12574e" },
  { key: "indigo",  label: "Indigo",  bg: "#23386e" },
  { key: "amber",   label: "Amber",   bg: "#7a4a10" },
  { key: "violet",  label: "Violet",  bg: "#4a3a91" },
];

function noteColorBg(key) {
  const found = NOTE_COLORS.find(c => c.key === key);
  return (found || NOTE_COLORS[0]).bg;
}

// Body-length tiers drive the present-mode font size via CSS clamp(), which
// avoids a measure-and-resize loop.
function noteSizeClass(body) {
  const len = String(body || "").trim().length;
  if (len <= 40) return "xl";
  if (len <= 120) return "lg";
  return "md";
}

// Defensive read: absent, corrupt, or non-array data all yield [] rather than
// throwing (same posture as the debug log).
function notesRead() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function notesWrite(list) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(list));
  } catch (_) {}
}

// Returns a NEW list with `id` moved by `dir` (-1 up, +1 down). No-ops when the
// note is missing or already at that end.
function notesMove(list, id, dir) {
  const i = list.findIndex(n => n.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= list.length) return list.slice();
  const out = list.slice();
  const [item] = out.splice(i, 1);
  out.splice(j, 0, item);
  return out;
}

// Returns a NEW list with `id` at index 0; the other notes keep their order.
function notesPinTop(list, id) {
  const i = list.findIndex(n => n.id === id);
  if (i === -1) return list.slice();
  const out = list.slice();
  const [item] = out.splice(i, 1);
  out.unshift(item);
  return out;
}

function noteNewId() {
  try { return crypto.randomUUID(); }
  catch (_) { return "n" + Date.now() + Math.random().toString(16).slice(2); }
}

// Seeds starter notes ONLY on a genuine first run. A key holding an empty array
// means the user deleted everything — don't resurrect the samples.
function notesSeedIfFirstRun() {
  let raw = null;
  try { raw = localStorage.getItem(NOTES_KEY); } catch (_) {}
  if (raw !== null) return notesRead();
  const seed = [
    { id: noteNewId(), title: "Drunk",   color: "crimson", body: "You are the Drunk." },
    { id: noteNewId(), title: "Madness", color: "violet",  body: "You are mad that you are the Juggler. If you break madness, you may be executed." },
    { id: noteNewId(), title: "No info", color: "slate",   body: "You learn nothing tonight." },
  ];
  notesWrite(seed);
  return seed;
}
