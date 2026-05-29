import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, setSession, read } from "../tools/app-harness.mjs";

test("verifyAuth: Unauthorized GET clears the session and returns false", async () => {
  const app = loadApp({ online: true });
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => ({ json: async () => ({ error: "Unauthorized" }) });
  const ok = await app.verifyAuth();
  assert.equal(ok, false);
  assert.equal(read(app, "ENDPOINT"), ""); // clearSession ran
});

test("verifyAuth: valid GET returns true and keeps the session", async () => {
  const app = loadApp({ online: true });
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => ({ json: async () => ({ options: {} }) });
  const ok = await app.verifyAuth();
  assert.equal(ok, true);
  assert.equal(read(app, "ENDPOINT"), "https://example.com/exec");
});

test("verifyAuth: network error does not disrupt (returns true)", async () => {
  const app = loadApp({ online: true });
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => { throw new TypeError("offline"); };
  const ok = await app.verifyAuth();
  assert.equal(ok, true);
  assert.equal(read(app, "ENDPOINT"), "https://example.com/exec");
});

const PENDING_KEY = "botc_logger_queue_pending";

test("drainQueue: aborts and preserves entries when auth is rejected", async () => {
  const app = loadApp({ online: true });
  setSession(app, "https://example.com/exec", "hash");
  // Any fetch (the verifyAuth GET) returns Unauthorized.
  app.fetch = async () => ({ json: async () => ({ error: "Unauthorized" }) });
  app.queueWrite(PENDING_KEY, [
    { id: "1", createdAt: 0, attempts: 0, lastError: null, payload: { clientId: "1", script: "TB" } },
  ]);
  await app.drainQueue({ manual: true });
  const pending = JSON.parse(app.localStorage.getItem(PENDING_KEY) || "[]");
  assert.equal(pending.length, 1);                 // entry preserved
  assert.equal(read(app, "ENDPOINT"), "");          // session cleared
});

test("drainQueue: does nothing when no endpoint is configured", async () => {
  const app = loadApp({ online: true });
  // ENDPOINT stays "" (never connected). A pending entry must not be drained.
  let fetched = false;
  app.fetch = async () => { fetched = true; throw new TypeError("x"); };
  app.queueWrite(PENDING_KEY, [
    { id: "1", createdAt: 0, attempts: 0, lastError: null, payload: { clientId: "1", script: "TB" } },
  ]);
  await app.drainQueue({ manual: true });
  assert.equal(fetched, false);
  const pending = JSON.parse(app.localStorage.getItem(PENDING_KEY) || "[]");
  assert.equal(pending.length, 1);
});

test("drainQueue: stuck entry gets a friendly message after the threshold", async () => {
  const app = loadApp({ online: false }); // offline -> networkError path
  setSession(app, "https://example.com/exec", "hash");
  app.fetch = async () => { throw new TypeError("NetworkError when attempting to fetch resource."); };
  // attempts already at 4; this drain makes it 5 (the threshold).
  app.queueWrite(PENDING_KEY, [
    { id: "1", createdAt: 0, attempts: 4, lastError: "TypeError: NetworkError", payload: { clientId: "1", script: "TB" } },
  ]);
  await app.drainQueue({ manual: true });
  const pending = JSON.parse(app.localStorage.getItem(PENDING_KEY) || "[]");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].attempts, 5);
  assert.match(pending[0].lastError, /Couldn.t sync after 5 tries/);
});
