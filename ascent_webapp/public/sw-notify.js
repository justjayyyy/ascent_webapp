// Imported into the generated service worker: tapping a reminder opens the note.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/Notes';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) { try { await client.navigate(url); } catch (e) { /* cross-origin */ } }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
