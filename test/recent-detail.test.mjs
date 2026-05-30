import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "../tools/app-harness.mjs";

test("roleJourney: no change -> single", () => {
  const app = loadApp();
  const r = app.roleJourney({
    startingRole: "Empath", startingTeam: "Good",
    midGameRole: "Empath", midGameTeam: "Good",
    endingRole: "Empath", endingTeam: "Good",
  });
  assert.equal(r.kind, "single");
  assert.equal(r.startRole, "Empath");
  assert.equal(r.startTeam, "Good");
});

test("roleJourney: empty mid/end treated as no change", () => {
  const app = loadApp();
  const r = app.roleJourney({
    startingRole: "Empath", startingTeam: "Good",
    midGameRole: "", midGameTeam: "",
    endingRole: "", endingTeam: "",
  });
  assert.equal(r.kind, "single");
});

test("roleJourney: mid-only change -> timeline [Started, Became]", () => {
  const app = loadApp();
  const r = app.roleJourney({
    startingRole: "Empath", startingTeam: "Good",
    midGameRole: "Drunk", midGameTeam: "Good",
    endingRole: "Drunk", endingTeam: "Good",
  });
  assert.equal(r.kind, "timeline");
  assert.equal(r.midRole, "Drunk");
  assert.equal(r.endRole, undefined);
});

test("roleJourney: end-only change -> timeline [Started, Ended]", () => {
  const app = loadApp();
  const r = app.roleJourney({
    startingRole: "Snake Charmer", startingTeam: "Good",
    midGameRole: "", midGameTeam: "",
    endingRole: "Imp", endingTeam: "Evil",
    endDemon: "Imp",
  });
  assert.equal(r.kind, "timeline");
  assert.equal(r.midRole, undefined);
  assert.equal(r.endRole, "Imp");
  assert.equal(r.endTeam, "Evil");
  assert.equal(r.endIsDemon, true);
});

test("roleJourney: both changes -> timeline [Started, Became, Ended]", () => {
  const app = loadApp();
  const r = app.roleJourney({
    startingRole: "Snake Charmer", startingTeam: "Good",
    midGameRole: "Drunk", midGameTeam: "Good",
    endingRole: "Imp", endingTeam: "Evil",
    endDemon: "Imp",
  });
  assert.equal(r.kind, "timeline");
  assert.equal(r.midRole, "Drunk");
  assert.equal(r.endRole, "Imp");
  assert.equal(r.endIsDemon, true);
});

test("roleJourney: ended-as-demon flag is false when team is Good", () => {
  const app = loadApp();
  const r = app.roleJourney({
    startingRole: "Empath", startingTeam: "Good",
    midGameRole: "", midGameTeam: "",
    endingRole: "Drunk", endingTeam: "Good",
    endDemon: "Imp",
  });
  assert.equal(r.kind, "timeline");
  assert.equal(r.endIsDemon, false);
});

test("notesBlocks: empty -> []", () => {
  const app = loadApp();
  assert.equal(app.notesBlocks({}).length, 0);
});

test("notesBlocks: role only", () => {
  const app = loadApp();
  const out = app.notesBlocks({ roleNotes: "useful pings", livedDiedNotes: "" });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "Role");
  assert.equal(out[0].text, "useful pings");
});

test("notesBlocks: lived only", () => {
  const app = loadApp();
  const out = app.notesBlocks({ roleNotes: "", livedDiedNotes: "executed day 3" });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "Lived / died");
});

test("notesBlocks: both, role first then lived", () => {
  const app = loadApp();
  const out = app.notesBlocks({ roleNotes: "a", livedDiedNotes: "b" });
  assert.equal(out.length, 2);
  assert.equal(out[0].label, "Role");
  assert.equal(out[1].label, "Lived / died");
});

test("notesBlocks: whitespace-only treated as empty", () => {
  const app = loadApp();
  assert.equal(app.notesBlocks({ roleNotes: "   ", livedDiedNotes: "\n" }).length, 0);
});

test("fabledLoric: empty -> empty tags and notes", () => {
  const app = loadApp();
  const r = app.fabledLoric({});
  assert.equal(r.tags.length, 0);
  assert.equal(r.notes.length, 0);
});

test("fabledLoric: names only", () => {
  const app = loadApp();
  const r = app.fabledLoric({
    fabled1: "Doomsayer", fabled2: "Sentinel", fabled3: "",
    loric1: "Bootlegger", loric2: "",
  });
  assert.equal(r.tags.length, 3);
  assert.equal(r.tags[0], "Doomsayer");
  assert.equal(r.tags[1], "Sentinel");
  assert.equal(r.tags[2], "Bootlegger");
  assert.equal(r.notes.length, 0);
});

test("fabledLoric: notes only", () => {
  const app = loadApp();
  const r = app.fabledLoric({
    fabledNotes: "Sentinel chose 8", loricNotes: "Bootlegger: 'no public chat'",
  });
  assert.equal(r.tags.length, 0);
  assert.equal(r.notes.length, 2);
  assert.equal(r.notes[0].label, "Fabled notes");
  assert.equal(r.notes[0].text, "Sentinel chose 8");
  assert.equal(r.notes[1].label, "Loric notes");
  assert.equal(r.notes[1].text, "Bootlegger: 'no public chat'");
});

test("fabledLoric: mixed tags + notes", () => {
  const app = loadApp();
  const r = app.fabledLoric({
    fabled1: "Doomsayer", fabledNotes: "rule applied",
    loric1: "", loric2: "Hindu",
  });
  assert.equal(r.tags.length, 2);
  assert.equal(r.tags[0], "Doomsayer");
  assert.equal(r.tags[1], "Hindu");
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].label, "Fabled notes");
  assert.equal(r.notes[0].text, "rule applied");
});

test("fabledLoric: whitespace-only names ignored", () => {
  const app = loadApp();
  const r = app.fabledLoric({ fabled1: "   ", loric1: "" });
  assert.equal(r.tags.length, 0);
});
