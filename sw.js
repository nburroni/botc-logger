// sw.js — BotC Logger service worker
//
// Strategy (see docs/superpowers/specs/2026-04-15-pwa-offline-queue-design.md):
// - Navigation: network-first, fall back to cached /index.html.
// - Same-origin static: stale-while-revalidate.
// - Apps Script (*.google.com hostnames): never cached.
//
// Bump CACHE_VERSION whenever the shell changes. No build step — a literal
// constant is the source of truth.

const CACHE_VERSION = "v1";
const CACHE_NAME = `botc-logger-${CACHE_VERSION}`;
const SHELL = [
  "/",
  "/index.html",
  "/app.js",
  "/styles.css",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
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

self.addEventListener("fetch", (event) => {
  // Handlers added in the next task — for now, pass through.
});
