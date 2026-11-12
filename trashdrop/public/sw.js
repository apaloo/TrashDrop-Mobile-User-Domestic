/**
 * Retired service worker (TD8, 2026-11-12).
 *
 * The household app's only service worker is /service-worker.js, built from
 * src/service-worker.js. This file stays at /sw.js so that any phone that
 * still has the old worker installed gets rid of it: it deletes the old
 * worker's caches, unregisters itself and reloads open pages onto the
 * current app. A phone without it never loads this file.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // The old worker's caches (trashdrop-v10, trashdrop-api-v8 and earlier);
    // the current worker keeps trashdrop-v1 and its workbox caches
    await Promise.all(names
      .filter((name) => /^trashdrop-(api-)?v\d+$/.test(name) && name !== 'trashdrop-v1')
      .map((name) => caches.delete(name)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: 'window' });
    pages.forEach((page) => page.navigate(page.url));
  })());
});
