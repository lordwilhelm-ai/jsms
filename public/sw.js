// This service worker intentionally does NOT cache pages, JS/CSS, or any
// other content. Every request always goes straight to the live server —
// nothing is ever served from a local copy, so the app can never show a
// stale/broken version of itself and login/navigation always reflects
// exactly what the server says right now. The only reason this file still
// exists at all is to receive web push notifications (see the `push` and
// `notificationclick` handlers below), which requires an active service
// worker registration even with zero caching behavior.
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clean up any caches a previous version of this service worker left
      // behind, so nobody keeps getting served old cached pages/JS.
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      }),
    ])
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
