const CACHE = "crokinole-v13";
const ASSETS = [
  ".",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "fraunces-600.woff2",
];

self.addEventListener("install", (e) => {
  // bypass the HTTP cache so every asset in a version is fetched fresh,
  // keeping html/js/css from the same deploy
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll(ASSETS.map((u) => new Request(u, { cache: "no-cache" })))
      )
  );
});

/* the page sends this when the user taps Update App */
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
    )
  );
});
