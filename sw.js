// ======================================================
// SERVICE WORKER - MisGastos PWA
// ======================================================
const CACHE_NAME = 'misgastos-v3';
const OFFLINE_URL = './index.html';

// Archivos esenciales para funcionar offline
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// CDN resources que queremos cachear
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

// ======================================================
// INSTALL - Precache core assets
// ======================================================
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching core assets');
      return cache.addAll(PRECACHE_ASSETS).then(() => {
        return Promise.allSettled(
          CDN_ASSETS.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache CDN asset: ${url}`, err);
            })
          )
        );
      });
    })
  );
});

// ======================================================
// ACTIVATE - Clean old caches
// ======================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log(`[SW] Removing old cache: ${key}`);
            return caches.delete(key);
          })
      );
    }).then(() => {
      console.log('[SW] Activate complete');
      return self.clients.claim();
    })
  );
});

// ======================================================
// FETCH - Network-first for HTML, Cache-first for assets
// ======================================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Strategy: Network-first for HTML pages
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(networkResponse => {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, resClone));
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then(cachedResponse => {
            return cachedResponse || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // Strategy: Cache-first for static assets (fonts, icons, CSS, JS from CDN)
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          // Return cached version and update in background
          const fetchPromise = fetch(request).then(networkResponse => {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse);
            });
          }).catch(() => {});
          return cachedResponse;
        }
        // Not in cache, try network
        return fetch(request).then(networkResponse => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clone);
          });
          return networkResponse;
        }).catch(() => {
          // Return empty response for non-critical resources
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  // Default: Network-first for everything else
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, clone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(request).then(cachedResponse => {
          return cachedResponse || new Response('', { status: 408, statusText: 'Offline' });
        });
      })
  );
});

// ======================================================
// BACKGROUND SYNC (future enhancement)
// ======================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Cache version check
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
