import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, read } from "../tools/app-harness.mjs";

const NOTES_KEY = "botc_logger_notes";

// NOTE: values constructed inside the vm live in a different realm, so their
// Array.prototype is not the host's. Assert property-wise (length/fields) rather
// than deepEqual on arrays that notes.js builds.

test("notesRead: returns [] when nothing stored", () => {
  const app = loadApp();
  assert.equal(app.notesRead().length, 0);
});

test("notesRead: returns [] on corrupt JSON", () => {
  const app = loadApp();
  app.localStorage.setItem(NOTES_KEY, "{not json");
  assert.equal(app.notesRead().length, 0);
});

test("notesRead: returns [] when stored value is not an array", () => {
  const app = loadApp();
  app.localStorage.setItem(NOTES_KEY, JSON.stringify({ a: 1 }));
  assert.equal(app.notesRead().length, 0);
});

test("notesWrite then notesRead round-trips", () => {
  const app = loadApp();
  app.notesWrite([{ id: "1", title: "T", body: "B", color: "teal" }]);
  const back = app.notesRead();
  assert.equal(back.length, 1);
  assert.equal(back[0].title, "T");
  assert.equal(back[0].color, "teal");
});

test("notesMove: moves a note up and down", () => {
  const app = loadApp();
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(app.notesMove(list, "b", -1).map(n => n.id), ["b", "a", "c"]);
  assert.deepEqual(app.notesMove(list, "b", 1).map(n => n.id), ["a", "c", "b"]);
});

test("notesMove: no-ops at the ends and for unknown ids", () => {
  const app = loadApp();
  const list = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(app.notesMove(list, "a", -1).map(n => n.id), ["a", "b"]);
  assert.deepEqual(app.notesMove(list, "b", 1).map(n => n.id), ["a", "b"]);
  assert.deepEqual(app.notesMove(list, "zz", -1).map(n => n.id), ["a", "b"]);
});

test("notesMove: does not mutate the input list", () => {
  const app = loadApp();
  const list = [{ id: "a" }, { id: "b" }];
  app.notesMove(list, "a", 1);
  assert.deepEqual(list.map(n => n.id), ["a", "b"]);
});

test("notesPinTop: moves to index 0 and preserves the rest of the order", () => {
  const app = loadApp();
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(app.notesPinTop(list, "c").map(n => n.id), ["c", "a", "b"]);
  assert.deepEqual(app.notesPinTop(list, "zz").map(n => n.id), ["a", "b", "c"]);
});

test("notesSeedIfFirstRun: seeds when the key is absent", () => {
  const app = loadApp();
  const seeded = app.notesSeedIfFirstRun();
  assert.ok(seeded.length > 0);
  assert.ok(app.notesRead().length > 0);
});

test("notesSeedIfFirstRun: does NOT re-seed when the key holds an empty array", () => {
  const app = loadApp();
  app.notesWrite([]);
  assert.equal(app.notesSeedIfFirstRun().length, 0);
  assert.equal(app.notesRead().length, 0);
});

test("notesSeedIfFirstRun: seeded notes have id, title, body and a valid colour", () => {
  const app = loadApp();
  const seeded = app.notesSeedIfFirstRun();
  // NOTE_COLORS is a top-level const (lexical), so it is not a property of the
  // vm's global object — read it by evaluating inside the context.
  const keys = read(app, "NOTE_COLORS.map(c => c.key).join(',')").split(",");
  for (const n of seeded) {
    assert.ok(n.id, "note has an id");
    assert.ok(n.title, "note has a title");
    assert.ok(n.body, "note has a body");
    assert.ok(keys.includes(n.color), `colour ${n.color} is in the palette`);
  }
});

test("noteSizeClass: tiers by body length", () => {
  const app = loadApp();
  assert.equal(app.noteSizeClass("You are the Drunk."), "xl");
  assert.equal(app.noteSizeClass("x".repeat(80)), "lg");
  assert.equal(app.noteSizeClass("x".repeat(200)), "md");
});

test("noteColorBg: known key resolves, unknown falls back to slate", () => {
  const app = loadApp();
  assert.equal(app.noteColorBg("crimson"), "#7a1f2b");
  assert.equal(app.noteColorBg("nope"), app.noteColorBg("slate"));
});
