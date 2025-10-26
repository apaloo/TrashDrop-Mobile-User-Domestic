/**
 * Service Worker for TrashDrops PWA
 * Handles caching, offline functionality, and background sync
 */

const CACHE_NAME = 'trashdrop-v4';
const API_CACHE_NAME = 'trashdrop-api-v2';

// Resources to cache immediately
const STATIC_RESOURCES = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/user/stats',
  '/api/user/activity',
  '/api/pickups/active'
];

// Install event - cache static resources
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching static resources');
        return cache.addAll(STATIC_RESOURCES);
      })
      .then(() => {
        console.log('Service Worker: Skip waiting');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker: Install failed', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        const deletePromises = cacheNames
          .filter(cacheName => 
            cacheName !== CACHE_NAME && 
            cacheName !== API_CACHE_NAME
          )
          .map(cacheName => {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          });
        
        return Promise.all(deletePromises);
      })
      .then(() => {
        console.log('Service Worker: Claiming clients');
        return self.clients.claim();
      })
      .catch(error => {
        console.error('Service Worker: Activation failed', error);
      })
  );
});

// Fetch event - handle requests with caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Handle API requests
  if (url.pathname.startsWith('/api/') || url.origin.includes('supabase')) {
    event.respondWith(handleApiRequest(request));
    return;
  }
  
  // Handle static resources
  event.respondWith(handleStaticRequest(request));
});

/**
 * Handle API requests with network-first strategy
 * Falls back to cache if network fails
 */
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache for', request.url);
    
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log('Service Worker: Serving from cache', request.url);
      return cachedResponse;
    }
    
    // No cache available, return error
    return new Response(
      JSON.stringify({ 
        error: 'Network unavailable and no cached data', 
        offline: true 
      }), 
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Handle static resource requests with cache-first strategy
 * Falls back to network if not in cache
 */
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    console.log('Service Worker: Serving from cache', request.url);
    return cachedResponse;
  }
  
  try {
    // Not in cache, try network
    console.log('Service Worker: Fetching from network', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Network request failed', error);
    
    // Return offline page or fallback
    if (request.destination === 'document') {
      return caches.match('/') || new Response(
        '<html><body><h1>You are offline</h1><p>Please check your internet connection.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
    
    throw error;
  }
}

// Background sync for offline actions
self.addEventListener('sync', event => {
  console.log('Service Worker: Background sync event', event.tag);
  
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncReports());
  }
  
  if (event.tag === 'sync-user-data') {
    event.waitUntil(syncUserData());
  }
});

/**
 * Sync offline reports when connection is restored
 */
async function syncReports() {
  console.log('Service Worker: Syncing offline reports');
  
  try {
    // Get offline reports from IndexedDB
    const reports = await getOfflineReports();
    
    for (const report of reports) {
      try {
        const response = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report)
        });
        
        if (response.ok) {
          console.log('Service Worker: Report synced successfully', report.offline_id);
          await removeOfflineReport(report.offline_id);
        }
      } catch (error) {
        console.error('Service Worker: Failed to sync report', error);
      }
    }
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}

/**
 * Sync user data in the background
 */
async function syncUserData() {
  console.log('Service Worker: Syncing user data');
  
  try {
    const clients = await self.clients.matchAll();
    
    // Notify all open tabs to refresh data
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_USER_DATA',
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('Service Worker: User data sync failed', error);
  }
}

// Handle messages from the main thread
self.addEventListener('message', event => {
  console.log('Service Worker: Received message', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_USER_DATA') {
    event.waitUntil(cacheUserData(event.data.payload));
  }
});

/**
 * Cache user data for offline access
 */
async function cacheUserData(userData) {
  try {
    const cache = await caches.open(API_CACHE_NAME);
    
    // Cache user stats
    if (userData.stats) {
      const statsResponse = new Response(JSON.stringify(userData.stats), {
        headers: { 'Content-Type': 'application/json' }
      });
      await cache.put('/api/user/stats', statsResponse);
    }
    
    // Cache user activity
    if (userData.activity) {
      const activityResponse = new Response(JSON.stringify(userData.activity), {
        headers: { 'Content-Type': 'application/json' }
      });
      await cache.put('/api/user/activity', activityResponse);
    }
    
    console.log('Service Worker: User data cached successfully');
  } catch (error) {
    console.error('Service Worker: Failed to cache user data', error);
  }
}

// Placeholder functions for IndexedDB operations
// These would typically be imported from your offline storage utility
async function getOfflineReports() {
  // Implementation would interface with IndexedDB
  return [];
}

async function removeOfflineReport(offlineId) {
  // Implementation would remove from IndexedDB
  console.log('Removing offline report:', offlineId);
}
