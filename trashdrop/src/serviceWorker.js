// TrashDrop Service Worker for offline support and background syncing
const CACHE_NAME = 'trashdrop-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/js/main.bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and browser extensions
  if (
    event.request.method !== 'GET' || 
    event.request.url.startsWith('chrome-extension') ||
    event.request.url.includes('extension') ||
    // Skip Supabase authentication requests and API calls
    event.request.url.includes('/auth/') ||
    event.request.url.includes('/rest/')
  ) {
    return;
  }
  
  // For API requests, try network first, then cache
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone the response to store in cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If network fails, try cache
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For non-API requests, try cache first, then network (cache-first strategy)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached response if found
        if (response) {
          return response;
        }
        
        // Otherwise fetch from network
        return fetch(event.request).then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response to store in cache
          const responseClone = response.clone();
          
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          
          return response;
        });
      })
      .catch(() => {
        // If both cache and network fail, serve offline fallback
        if (event.request.url.indexOf('.html') > -1) {
          return caches.match('/offline.html');
        }
      })
  );
});

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync event triggered', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Send message to client to trigger synchronization
      self.clients.matchAll().then((clients) => {
        if (clients && clients.length) {
          clients.forEach((client) => {
            client.postMessage({
              type: 'SYNC_DATA'
            });
          });
        }
      })
    );
  }
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received', event);
  
  const data = event.data.json();
  const title = data.title || 'TrashDrop';
  const options = {
    body: data.body || 'New notification from TrashDrop',
    icon: '/logo192.png',
    badge: '/favicon.ico',
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
