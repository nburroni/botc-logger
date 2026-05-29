import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, setSession } from "../tools/test-harness.mjs";

test("redactPayload strips the auth key but keeps game fields", () => {
  const app = loadApp();
  const out = app.redactPayload({ key: "SECRET_HASH", script: "TB", startDemon: "Imp" });
  assert.equal("key" in out, false);
  assert.equal(out.script, "TB");
  assert.equal(out.startDemon, "Imp");
});

test("csvEscape quotes values containing commas, quotes, or newlines", () => {
  const app = loadApp();
  assert.equal(app.csvEscape("plain"), "plain");
  assert.equal(app.csvEscape("a,b"), '"a,b"');
  assert.equal(app.csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(app.csvEscape("line1\nline2"), '"line1\nline2"');
});
