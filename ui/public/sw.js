self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and API calls.
  if (request.method !== "GET" || url.pathname.startsWith("/api")) {
    return;
  }

  // Network-only for shell and assets to avoid stale chunk/cache mismatches.
  event.respondWith(fetch(request));
});
