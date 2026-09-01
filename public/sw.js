const CACHE_NAME = 'central-tech-platform-v5';
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/logo.png',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/favicon.ico',
  '/logo-mark.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/favicon-16x16.png'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching essential assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control immediately
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Media must never pass through here. Cloning a stream to cache it
  // pulled the whole title a second time and starved the player.
  if (event.request.url.includes('/api/')) {
    return;
  }
  // Media must never pass through here. Cloning a stream to cache it
  // pulled the whole title a second time and starved the player.
  if (event.request.url.includes('/api/')) {
    return;
  }
  // Skip API requests (supabase, etc.)
  if (event.request.url.includes('/rest/') || 
      event.request.url.includes('/auth/') ||
      event.request.url.includes('/functions/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response before caching
        const responseClone = response.clone();
        
        // Cache successful GET requests
        if (event.request.method === 'GET' && response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // If it's a navigation request, show offline page
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Web Push: show OS-level notification when a push arrives.
self.addEventListener('push', (event) => {
  let data = { title: 'Price Alert', body: '', url: '/crypto' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try { data.body = event.data ? event.data.text() : ''; } catch { /* noop */ }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Price Alert', {
      body: data.body || '',
      icon: '/app-icon-192.png',
      badge: '/app-icon-192.png',
      data: { url: data.url || '/crypto' },
      tag: data.tag || 'price-alert',
      renotify: true,
    })
  );
});

// Focus/open the Trading page when a notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/crypto';
  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsArr) {
      try {
        const u = new URL(client.url);
        if (u.pathname === targetUrl || u.pathname.startsWith(targetUrl)) {
          return client.focus();
        }
      } catch { /* noop */ }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
