/* sw-push.js — Web Push notification handler.
 * Imported by the Workbox-generated service worker via importScripts.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SimaStock', body: event.data.text() };
  }

  const { title, body, icon, badge, tag, data } = payload;

  const options = {
    body: body || '',
    icon: icon || '/pwa-192.png',
    badge: badge || '/pwa-192.png',
    tag: tag || 'simastok-alert',
    data: data || {},
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Voir' },
      { action: 'dismiss', title: 'Ignorer' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title || 'SimaStock', options)
  );

  // Broadcast to open tabs for in-app toast
  try {
    const bc = new BroadcastChannel('push-notifications');
    bc.postMessage({ type: 'PUSH_RECEIVED', payload });
    bc.close();
  } catch {
    // BroadcastChannel not available
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/alerts';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return clients.openWindow(url);
      })
  );
});
