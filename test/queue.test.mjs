import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, setSession } from "../tools/app-harness.mjs";

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

const PENDING_KEY = "botc_logger_queue_pending";

test("drainQueue: online provisional success clears all pending entries", async () => {
  const app = loadApp({ online: true });
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => { throw new TypeError("NetworkError"); }; // CORS-masked POST
  app.queueWrite(PENDING_KEY, [
    { id: "1", createdAt: 0, attempts: 0, lastError: null, payload: { clientId: "1", script: "TB" } },
    { id: "2", createdAt: 1, attempts: 0, lastError: null, payload: { clientId: "2", script: "TB" } },
  ]);
  await app.drainQueue({ manual: true });
  const pending = JSON.parse(app.localStorage.getItem(PENDING_KEY) || "[]");
  assert.equal(pending.length, 0);
});

test("drainQueue: offline leaves the entry pending", async () => {
  const app = loadApp({ online: false });
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => { throw new TypeError("offline"); };
  app.queueWrite(PENDING_KEY, [
    { id: "1", createdAt: 0, attempts: 0, lastError: null, payload: { clientId: "1", script: "TB" } },
  ]);
  await app.drainQueue({ manual: true });
  const pending = JSON.parse(app.localStorage.getItem(PENDING_KEY) || "[]");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].attempts, 1); // attempt counter advanced
});

test("buildQueueCsv emits headers and values for every game field", () => {
  const app = loadApp();
  app.queueWrite(PENDING_KEY, [{
    id: "id1", createdAt: 0, attempts: 0, lastError: null,
    payload: { clientId: "id1", script: "TB", startDemon: "Imp", winningTeam: "Good", winLoss: "W" },
  }]);
  const csv = app.buildQueueCsv();
  assert.match(csv, /startDemon/);   // header row contains the field
  assert.match(csv, /winningTeam/);
  assert.match(csv, /Imp/);          // data row contains the value
  assert.match(csv, /Good/);
});
