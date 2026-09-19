const CACHE_NAME = "moments-visual-v3";
const APP_SHELL = [
  "/manifest.json",
  "/moments-icon-192.png",
  "/moments-icon-512.png",
  "/moments-icon-maskable-192.png",
  "/moments-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && new URL(event.request.url).pathname === "/visual-test") {
            caches.open(CACHE_NAME).then((cache) => cache.put("/visual-test", response.clone()));
          }
          return response;
        })
        .catch(() => caches.match("/visual-test"))
    );
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // App assets must revalidate online. A cache-first JavaScript bundle can
  // otherwise keep an installed PWA on an obsolete build indefinitely.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
