// Cache name is rewritten by scripts/stamp-sw.mjs on every build, so a new
// deploy always gets a fresh cache and the activate handler below purges
// the old one — nobody stays stuck on a stale cached copy of the app.
const CACHE_NAME = "jsms-pwa-dev";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE_NAME;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      }),
    ])
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only ever handle same-origin requests. Cross-origin traffic (Supabase
  // REST/auth/storage/realtime) is left completely alone — offline support
  // for that data goes through the app's own IndexedDB layer (lib/offline),
  // not the HTTP cache, so it must always hit the real network or fail
  // exactly as it would with no service worker at all.
  if (url.origin !== self.location.origin) return;

  // Same reasoning for this app's own API routes — never cached here.
  if (url.pathname.startsWith("/api/")) return;

  // Next.js build output under /_next/static/* is content-hashed: a given
  // URL's bytes never change, so cache-first (serve from cache, only ever
  // hit the network on a genuine miss) is always safe and is what actually
  // lets a previously visited page's JS/CSS load with no connection.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(request).then(function (cached) {
          if (cached) return cached;
          return fetch(request).then(function (response) {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Everything else same-origin: page navigations and the RSC payload
  // fetches Next's client-side router makes when moving between routes.
  // Network-first so a page always reflects what's live right now when
  // there's a connection, falling back to the last cached copy so a
  // previously visited page still opens with none at all. Every page in
  // this app is a Client Component with no server-rendered per-user data
  // baked into the HTML/RSC payload — actual data always comes from a
  // separate cross-origin Supabase call — so caching this shell is safe.
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return fetch(request)
        .then(function (response) {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(function () {
          return cache.match(request).then(function (cached) {
            return cached || Response.error();
          });
        });
    })
  );
});

self.addEventListener("push", function (event) {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: "JSMS Notification",
      body: event.data ? event.data.text() : "You have a new notification.",
    };
  }

  const title = data.title || "JSMS Notification";
  const options = {
    body: data.body || data.message || "You have a new notification.",
    icon: data.icon || "/jsms-logo.png",
    badge: data.badge || "/jsms-logo.png",
    data: {
      url: data.url || data.action_url || "/admission",
      ...data.data,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const url = event.notification?.data?.url || "/admission";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
