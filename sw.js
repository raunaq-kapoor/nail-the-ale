// Network-first for the app's own files so an online open always gets the latest
// version; the cache is only the offline fallback. API calls are never cached.
const VERSION = "2026.09.21-3"; // stamped by dev/release.sh
const CACHE = "nta-" + VERSION;
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./card.js", "./ai.js", "./store.js", "./image.js", "./verdicts.js", "./search.js", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"];
const NEVER_CACHE = ["api.github.com", "generativelanguage.googleapis.com"];
const NETWORK_TIMEOUT_MS = 2500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || NEVER_CACHE.includes(url.hostname)) return;
  e.respondWith(url.origin === location.origin ? networkFirst(e.request) : staleWhileRevalidate(e.request));
});

// Own files: fresh when online (within the timeout), cached when not.
async function networkFirst(request) {
  const c = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok) c.put(request, res.clone());
    return res;
  } catch {
    const cached = await c.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error("offline and not cached: " + request.url);
  }
}

// Fonts: cached copy immediately, refreshed in the background.
async function staleWhileRevalidate(request) {
  const c = await caches.open(CACHE);
  const cached = await c.match(request);
  const fresh = fetch(request).then((res) => { if (res.ok) c.put(request, res.clone()); return res; }).catch(() => cached);
  return cached ?? fresh;
}
