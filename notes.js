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

// ——— NOTES UI ———
// Module state: the id currently open in the editor ("" = creating a new note),
// and the colour selected in the editor.
let _noteEditId = "";
let _noteEditColor = "slate";

function renderNotes() {
  const list = notesSeedIfFirstRun();
  const el = document.getElementById("notesList");
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = '<p class="no-games-msg">No notes yet. Tap "+ New note".</p>';
    return;
  }
  el.innerHTML = list.map((n, i) => {
    const preview = (n.body || "").replace(/\s+/g, " ").trim();
    return `<div class="note-card" style="background:${noteColorBg(n.color)}">` +
      noteCardInner(n, i, list.length, preview) +
      `</div>`;
  }).join("");
}

// Inner markup of one note card. Split out so renderNotes stays readable.
// escHtml comes from app.js (same global scope in the browser).
function noteCardInner(n, i, total, preview) {
  return (
    `<div class="note-card-main" onclick="openNoteEditor('${n.id}')">` +
      `<div class="note-card-title">${escHtml(n.title || "Untitled")}</div>` +
      (preview ? `<div class="note-card-preview">${escHtml(preview)}</div>` : "") +
    `</div>` +
    `<button type="button" class="note-show-btn" onclick="presentNote('${n.id}')" aria-label="Show full screen">Show</button>` +
    `<div class="note-card-move">` +
      `<button type="button" class="note-move-btn" onclick="moveNote('${n.id}',-1)" ${i === 0 ? "disabled" : ""} aria-label="Move up">&#9650;</button>` +
      `<button type="button" class="note-move-btn" onclick="moveNote('${n.id}',1)" ${i === total - 1 ? "disabled" : ""} aria-label="Move down">&#9660;</button>` +
    `</div>`
  );
}

function moveNote(id, dir) {
  notesWrite(notesMove(notesRead(), id, dir));
  renderNotes();
}

function openNoteEditor(id) {
  const list = notesRead();
  const note = id ? list.find(n => n.id === id) : null;
  _noteEditId = note ? note.id : "";
  _noteEditColor = note ? (note.color || "slate") : "slate";
  document.getElementById("noteEditTitle").textContent = note ? "Edit note" : "New note";
  document.getElementById("noteTitleInput").value = note ? (note.title || "") : "";
  document.getElementById("noteBodyInput").value = note ? (note.body || "") : "";
  // Pin/Delete only make sense for an existing note.
  document.getElementById("notePinBtn").classList.toggle("hidden", !note);
  document.getElementById("noteDeleteBtn").classList.toggle("hidden", !note);
  renderNoteSwatches();
  lockBodyScroll("noteEdit", true);
  document.getElementById("noteEditSheet").classList.remove("hidden");
  document.getElementById("noteEditBackdrop").classList.remove("hidden");
}

function renderNoteSwatches() {
  document.getElementById("noteSwatches").innerHTML = NOTE_COLORS.map(c =>
    `<div class="note-swatch${c.key === _noteEditColor ? " selected" : ""}" ` +
    `style="background:${c.bg}" title="${c.label}" onclick="pickNoteColor('${c.key}')"></div>`
  ).join("");
}

function pickNoteColor(key) {
  _noteEditColor = key;
  renderNoteSwatches();
}

function closeNoteEditor() {
  lockBodyScroll("noteEdit", false);
  document.getElementById("noteEditSheet").classList.add("hidden");
  document.getElementById("noteEditBackdrop").classList.add("hidden");
}

function saveNote() {
  const title = document.getElementById("noteTitleInput").value.trim();
  const body = document.getElementById("noteBodyInput").value.trim();
  if (!title && !body) { closeNoteEditor(); return; } // nothing to save
  const list = notesRead();
  if (_noteEditId) {
    const i = list.findIndex(n => n.id === _noteEditId);
    if (i !== -1) list[i] = { ...list[i], title, body, color: _noteEditColor };
  } else {
    list.push({ id: noteNewId(), title, body, color: _noteEditColor });
  }
  notesWrite(list);
  closeNoteEditor();
  renderNotes();
}

function deleteNoteFromEditor() {
  if (!_noteEditId) return;
  notesWrite(notesRead().filter(n => n.id !== _noteEditId));
  closeNoteEditor();
  renderNotes();
}

function pinNoteFromEditor() {
  if (!_noteEditId) return;
  notesWrite(notesPinTop(notesRead(), _noteEditId));
  closeNoteEditor();
  renderNotes();
}

// Full-screen takeover: the player sees ONLY this note's body on its colour.
function presentNote(id) {
  const note = notesRead().find(n => n.id === id);
  if (!note) return;
  const el = document.getElementById("notePresent");
  const text = document.getElementById("notePresentText");
  text.className = "note-present-text " + noteSizeClass(note.body);
  text.textContent = note.body || "";
  el.style.background = noteColorBg(note.color);
  lockBodyScroll("notePresent", true);
  el.classList.remove("hidden");
}

function closeNotePresent() {
  lockBodyScroll("notePresent", false);
  document.getElementById("notePresent").classList.add("hidden");
}
