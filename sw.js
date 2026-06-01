const CACHE_VERSION = "static-viewer-v41";
const SHELL_PATHS = [
  "./",
  "config.js",
  "manifest.json",
  "css/style.css",
  "js/app.js",
  "js/charts.js",
  "js/crypto-data.js",
  "js/push-registration.js",
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
const shellUrlSet = () => new Set(shellUrls());

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
  if (!shellUrlSet().has(url.toString())) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: event.data?.text() || "已更新" };
  }
  const title = payload.title || "已更新";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: payload.tag || "daily-update",
      data: { url: notificationTargetUrl(payload.url || "./") }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = notificationTargetUrl(event.notification.data?.url || "./");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

function notificationTargetUrl(value) {
  const fallback = new URL("./", self.registration.scope);
  let target;
  try {
    target = new URL(value || "./", self.registration.scope);
  } catch {
    return fallback.toString();
  }
  if (target.origin !== self.location.origin || !target.toString().startsWith(self.registration.scope)) {
    return fallback.toString();
  }
  return target.toString();
}
