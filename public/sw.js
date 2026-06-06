const CACHE_NAME = 'chikitsa-sahayak-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './favicon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline asset shell...');
      return Promise.all(
        ASSETS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`[Service Worker] Skipping caching failed for: ${url}`, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Skip non-GET requests, dynamic API routes, or hot-reload / browser extension traffic
  if (
    req.method !== 'GET' ||
    url.pathname.includes('/api/') ||
    (url.hostname === 'localhost' && url.port !== '3000') ||
    url.hostname.includes('hot-update') ||
    req.url.startsWith('chrome-extension:')
  ) {
    return; // Pass-through directly
  }

  // 2. Document/page level navigation: use Network-First strategy
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match('./index.html') || caches.match('/');
        })
    );
    return;
  }

  // 3. For standard assets: Cache-First, fall back to Network
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(req).then((networkResponse) => {
        if (
          networkResponse.status === 200 &&
          (url.pathname.endsWith('.js') ||
           url.pathname.endsWith('.css') ||
           url.pathname.includes('/assets/') ||
           url.pathname.endsWith('.png') ||
           url.pathname.endsWith('.jpg') ||
           url.pathname.endsWith('.jpeg') ||
           url.pathname.endsWith('.svg') ||
           url.pathname.endsWith('.woff2'))
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseClone);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.log('[Service Worker] Fetch failed offline for resource:', req.url);
      });
    })
  );
});
