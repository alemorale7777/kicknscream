// KickNScream service worker
// Strategy: network-first for navigation + API, cache-first for build assets.
// We deliberately keep this small — no Workbox dep, no precache bloat.

const CACHE = "kns-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Don't try to cache cross-origin or Next.js HMR / data
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // pure passthrough for actions/routes
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(req));
    return;
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response("", { status: 504 });
  }
}

async function networkFirstNavigation(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch {
    const cache = await caches.open(CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return (
      offline ??
      new Response("Offline. Reconnect and try again.", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}
