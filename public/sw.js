// PandaHub Service Worker
const CACHE_VERSION = '2026-04-03-v1';
const STATIC_CACHE = 'pandahub-static-v' + CACHE_VERSION;
const DYNAMIC_CACHE = 'pandahub-dynamic-v' + CACHE_VERSION;
const API_CACHE = 'pandahub-api-v' + CACHE_VERSION;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Install failed', err))
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('pandahub-') && k !== STATIC_CACHE && k !== DYNAMIC_CACHE && k !== API_CACHE)
          .map(k => { console.log('[SW] Delete old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Static assets (CSS/JS/fonts): Cache-first
// - HTML navigation: Network-first (freshness)
// - API calls: Network-first with stale fallback
// - Images: Cache-first
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (CDN, fonts, etc.) except our API
  if (url.origin !== self.location.origin && !url.hostname.includes('pandahub')) return;

  const isStatic = /\.(css|js|woff2?|ttf|eot|png|jpg|jpeg|gif|webp|svg|ico|json)$/.test(url.pathname);
  const isApi = url.pathname.startsWith('/api/');
  const isHtml = request.headers.get('accept')?.includes('text/html');

  if (isStatic && !isApi) {
    // Cache-first for static assets
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  } else if (isApi) {
    // Network-first for API with fallback
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && isApi) {
            const clone = response.clone();
            caches.open(API_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  } else {
    // Network-first for navigation (HTML) and dynamic content
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/')))
    );
  }
});

// Push notifications
self.addEventListener('push', event => {
  try {
    const data = event.data?.json() || {};
    const title = data.title || '🐼 熊猫社区';
    const options = {
      body: data.body || '您有新消息',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: data.tag || 'default',
      data: data.url || '/',
      vibrate: [100, 50, 100],
      actions: [
        { action: 'open', title: '查看' },
        { action: 'dismiss', title: '忽略' }
      ]
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('[SW] Push error', e);
  }
});

// Notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
