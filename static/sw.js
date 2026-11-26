const CACHE_NAME = "ncm-pdv-v10";
const ASSETS = [
  "/",
  "/static/style.css",
  "/static/manifest.json",
  "/static/js/main.js",
  "/static/js/state.js",
  "/static/js/api.js",
  "/static/js/ui.js",
  "/static/js/profiles.js",
  "/static/js/filters.js",
  "/static/js/grid.js",
  "/static/js/knowledge.js",
  "/static/sectors.js",
  "/static/siscomex.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("/api/")) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
