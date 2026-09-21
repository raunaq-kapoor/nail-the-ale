// Shell cache so the app opens instantly and offline. API calls are never cached.
const CACHE = "nta-shell-v1";
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./card.js", "./ai.js", "./store.js", "./image.js", "./verdicts.js", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"];
const NEVER_CACHE = ["api.github.com", "generativelanguage.googleapis.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Stale-while-revalidate for the shell and fonts; straight to network for APIs.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || NEVER_CACHE.includes(url.hostname)) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(e.request);
      const fresh = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => cached);
      return cached ?? fresh;
    })
  );
});
