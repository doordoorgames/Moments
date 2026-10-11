// Network-only application worker. Never cache HTML, JS, CSS or API responses.
// Updated on every deployment via the build's generated version file.
const VERSION = "__MOMENTS_BUILD_VERSION__";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({type:"window", includeUncontrolled:true});
    clients.forEach(client => client.postMessage({type:"MOMENTS_BUILD_UPDATED", version:VERSION}));
  })());
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request, {cache:"no-store"}));
});
