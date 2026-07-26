// Bump this string whenever a change needs to force-clear what's cached on
// returning devices (the activate handler below deletes every cache that
// isn't this exact name). Static JS/CSS chunks under /_next/static/ don't
// actually need that though — Next.js content-hashes those filenames, so a
// new deploy always requests brand-new URLs; old cached chunks just become
// harmless orphans rather than ever being served as "stale code" to a
// newer page. Page navigations are network-first (see below), so an online
// user always gets the current HTML/script tags regardless of this name —
// the cached copies only ever get served as an OFFLINE fallback.
const CACHE_NAME = "jsms-pwa-v2";

self.addEventListener("install", function (event) {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache
        .addAll(["/", "/website", "/manifest.webmanifest", "/jsms-logo.png"])
        .catch(function () {
          return undefined;
        });
    })
  );
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

  if (url.origin !== self.location.origin) return;

  // Data traffic (/api/*) is never cached here — offline reads/writes for
  // those go through the app's own IndexedDB layer (lib/offline/), not
  // HTTP-level caching, since Supabase's own REST calls are cross-origin
  // and this same-origin-only handler can't intercept those anyway.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Static build assets (/_next/static/*) are content-hashed by Next.js —
  // a given URL's content never changes, so cache-first is always safe and
  // is what actually makes a previously-visited page's JS/CSS available
  // with zero network at all, instead of only its HTML shell.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;

        return fetch(request).then(function (response) {
          const responseClone = response.clone();

          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, responseClone).catch(function () {
              return undefined;
            });
          });

          return response;
        });
      })
    );

    return;
  }

  // Everything else same-origin (page navigations, other /_next/* requests,
  // static files) — network-first so an online user always gets the
  // current version, falling back to whatever was last cached (or the
  // "/website" shell as a last resort) when the network is unavailable.
  event.respondWith(
    fetch(request)
      .then(function (response) {
        const responseClone = response.clone();

        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, responseClone).catch(function () {
            return undefined;
          });
        });

        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (cached) {
          return cached || caches.match("/website");
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