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

test("queueAttempt: fetch throws while online -> provisional success", async () => {
  const app = loadApp({ online: true });
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => { throw new TypeError("NetworkError when attempting to fetch resource."); };
  const r = await app.queueAttempt({ clientId: "a", script: "TB" });
  // vm context objects have a different Object.prototype than the test realm, so
  // deepEqual fails on prototype check — use individual property assertions.
  assert.equal(r.ok, true);
  assert.equal(r.provisional, true);
  assert.equal(r.row, null);
});

test("queueAttempt: fetch throws while offline -> networkError (stays queued)", async () => {
  const app = loadApp({ online: false });
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => { throw new TypeError("offline"); };
  const r = await app.queueAttempt({ clientId: "a", script: "TB" });
  assert.equal(r.ok, false);
  assert.equal(r.networkError, true);
});

test("queueAttempt: JSON success returns the row number", async () => {
  const app = loadApp();
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => ({ json: async () => ({ success: true, row: 7 }) });
  const r = await app.queueAttempt({ clientId: "a", script: "TB" });
  // vm context objects have a different Object.prototype — use individual asserts.
  assert.equal(r.ok, true);
  assert.equal(r.row, 7);
});

test("queueAttempt: Unauthorized response surfaces as authError", async () => {
  const app = loadApp();
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => ({ json: async () => ({ error: "Unauthorized" }) });
  const r = await app.queueAttempt({ clientId: "a", script: "TB" });
  assert.equal(r.authError, true);
  assert.equal(r.ok, false);
});

test("queueAttempt: unreadable JSON -> provisional success", async () => {
  const app = loadApp();
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => ({ json: async () => { throw new SyntaxError("not json"); } });
  const r = await app.queueAttempt({ clientId: "a", script: "TB" });
  // vm context objects have a different Object.prototype — use individual asserts.
  assert.equal(r.ok, true);
  assert.equal(r.provisional, true);
  assert.equal(r.row, null);
});
