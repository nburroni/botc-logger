// Loads the real app.js into a Node vm context with light browser stubs so its
// functions can be unit-tested without a build step or DOM. app.js is a classic
// script: top-level `function` declarations become properties of the context
// global (callable as app.fnName); top-level `let`/`const` are lexical bindings
// (use setSession() to reassign ENDPOINT/AUTH_HASH).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_SRC = readFileSync(join(__dirname, "..", "app.js"), "utf8");

// A fake DOM element that absorbs any UI calls app.js makes (showToast, etc.).
function fakeEl() {
  return {
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, removeAttribute() {},
    appendChild() {}, querySelectorAll() { return []; },
    focus() {}, select() {},
    value: "", textContent: "", innerHTML: "", checked: false, className: "",
  };
}

export function loadApp({ online = true } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
  };
  // Real timers, but unref'd so a scheduled drain interval can't keep the test
  // process alive.
  const timer = (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; };
  const interval = (fn, ms) => { const t = setInterval(fn, ms); if (t && t.unref) t.unref(); return t; };

  const ctx = {
    console,
    setTimeout: timer, clearTimeout,
    setInterval: interval, clearInterval,
    localStorage,
    navigator: { onLine: online },
    crypto: { randomUUID },
    location: { pathname: "/", replace() {}, reload() {} },
    fetch: async () => { throw new Error("fetch not stubbed for this test"); },
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    Event: class { constructor(type) { this.type = type; } },
    document: {
      addEventListener() {}, removeEventListener() {},
      getElementById: () => fakeEl(),
      querySelector: () => fakeEl(),
      querySelectorAll: () => [],
      cookie: "",
    },
    // TextEncoder is used by crypto.subtle.digest (in hashPassword). Node exposes
    // it as a global but vm contexts don't inherit it — stub it here.
    TextEncoder,
    // Uint8Array is used alongside crypto.subtle — it's a built-in but vm
    // contexts need it explicitly surfaced.
    Uint8Array,
    // crypto.subtle.digest is used by hashPassword. Extend the crypto stub with
    // the real Node webcrypto subtle implementation.
    // (crypto.randomUUID is already set above; we merge subtle in below.)
  };

  // Merge real subtle into the crypto stub so hashPassword works.
  ctx.crypto.subtle = globalThis.crypto.subtle;

  // app.js refers to both bare globals and window.* — make them the same object.
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.addEventListener = () => {};
  ctx.window.removeEventListener = () => {};
  ctx.window.dispatchEvent = () => {};

  vm.createContext(ctx);
  vm.runInContext(APP_SRC, ctx, { filename: "app.js" });
  return ctx;
}

// ENDPOINT / AUTH_HASH are top-level `let` bindings (not global-object
// properties), so reassign them by evaluating in the same context.
export function setSession(ctx, endpoint, auth) {
  vm.runInContext(
    `ENDPOINT = ${JSON.stringify(endpoint)}; AUTH_HASH = ${JSON.stringify(auth)};`,
    ctx,
  );
}
