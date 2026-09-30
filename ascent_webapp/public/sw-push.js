// Imported into the generated service worker: shows a notification when the server pushes one.
// Tapping it is handled by sw-notify.js, which opens data.url.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* plain text push */ }
  event.waitUntil(self.registration.showNotification(data.title || 'Ascent', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/Expenses' },
  }));
});
