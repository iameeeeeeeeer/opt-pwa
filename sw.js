const CACHE_VERSION = "static-viewer-v31";
const SHELL_PATHS = [
  "./",
  "config.js",
  "manifest.json",
  "css/style.css",
  "js/app.js",
  "js/charts.js",
  "js/crypto-data.js",
  "vendor/echarts.min.js",
  "icons/icon.svg",
  "icons/apple-touch-icon-120.png",
  "icons/apple-touch-icon-152.png",
  "icons/apple-touch-icon-167.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];
const shellUrls = () => SHELL_PATHS.map(path => new URL(path, self.registration.scope).toString());

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(shellUrls()))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
