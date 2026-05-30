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
