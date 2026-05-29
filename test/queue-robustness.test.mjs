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
