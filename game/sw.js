const CACHE = "crok-game-v10";
const ASSETS = [
  ".",
  "index.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (e) => {
  // bypass the HTTP cache so a deploy's files all come from the same version
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS.map((u) => new Request(u, { cache: "no-cache" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
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
