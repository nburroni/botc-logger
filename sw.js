// sw.js — BotC Logger service worker
//
// Strategy (see docs/superpowers/specs/2026-04-15-pwa-offline-queue-design.md):
// - Navigation: network-first, fall back to cached /index.html.
// - Same-origin static: stale-while-revalidate.
// - Apps Script (*.google.com hostnames): never cached.
//
// Bump CACHE_VERSION whenever the shell changes. No build step — a literal
// constant is the source of truth.

const CACHE_VERSION = "v2";
const CACHE_NAME = `botc-logger-${CACHE_VERSION}`;
const SHELL = [
  "/botc-logger/",
  "/botc-logger/index.html",
  "/botc-logger/app.js",
  "/botc-logger/styles.css",
  "/botc-logger/manifest.webmanifest",
  "/botc-logger/icons/icon-192.png",
  "/botc-logger/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ─── fetch classification ───────────────────────────────────────────────────
//
// Apps Script hostnames: script.google.com, script.googleusercontent.com.
// These end in "google.com", but so does a lot of the internet. We match by
// endsWith on the leaf hostname so a path like /foo/script.google.com/bar
// (on a hostile server) can't pivot us into never-cache mode.
const APPS_SCRIPT_HOSTS = ["script.google.com", "script.googleusercontent.com"];

function isAppsScript(url) {
  return APPS_SCRIPT_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h));
}

function networkFirstNavigation(event) {
  return fetch(event.request)
    .catch(() => caches.match("/botc-logger/index.html"));
}

function staleWhileRevalidate(event) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) cache.put(event.request, resp.clone());
          return resp;
        })
        .catch(() => cached); // offline → return cached (may be undefined)
      return cached || networkFetch;
    })
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes always hit network — queue handles offline.

  const url = new URL(req.url);

  // Apps Script → never cache, never serve from cache.
  if (isAppsScript(url)) return;

  // Cross-origin (non-Apps-Script) → pass through untouched. Keeps us out of
  // other people's CORS/auth business.
  if (url.origin !== self.location.origin) return;

  // Same-origin navigation (HTML) → network-first, fall back to shell.
  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  // Same-origin static → stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(event));
});
