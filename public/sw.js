// PandaHub Service Worker v2 - Push Notifications + Cache Strategy
var CACHE_VERSION = 'v2'; // Bump this when assets need refresh
var STATIC_CACHE = 'pandahub-static-' + CACHE_VERSION;
var SHELL_CACHE = 'pandahub-shell-' + CACHE_VERSION;

// Assets to precache on install
var PRECACHE_ASSETS = [
  '/',
  '/favicon.ico',
  '/css/style.css?v=20260401m',
  '/js/app.js?v=20260401m',
  '/js/i18n.js',
];

// ============ Push Notifications ============
self.addEventListener('push', function(event) {
  if (!event.data) return;

  var data = {};
  try {
    data = JSON.parse(event.data.text());
  } catch (e) {
    data = { title: '🐼 熊猫社区', body: event.data.text() };
  }

  var options = {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'pandahub-notification',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: [
      { action: 'open', title: '查看' },
      { action: 'dismiss', title: '忽略' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🐼 熊猫社区', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;

  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ============ Install: Precache Shell ============
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache) {
      return cache.addAll(PRECACHE_ASSETS.map(function(url) {
        return new Request(url, { cache: 'reload' });
      })).catch(function(e) {
        console.warn('[SW] Precache failed, continuing:', e);
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ============ Activate: Clean Old Caches ============
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          // Delete all old version caches
          if (name.startsWith('pandahub-') && name !== STATIC_CACHE && name !== SHELL_CACHE) {
            return caches.delete(name);
          }
        })
      );
    }).then(function() {
      return clients.claim();
    })
  );
});

// ============ Fetch: Cache Strategies ============
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (e.g., CDN fonts)
  if (url.origin !== self.location.origin) return;

  // Skip WebSocket and API calls (except we can cache some)
  if (url.pathname.startsWith('/api/')) {
    // For API: Network-First, don't cache stale data
    event.respondWith(networkFirst(event.request));
    return;
  }

  // For navigation requests: Network-First with shell cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      networkFirst(event.request).catch(function() {
        return caches.match('/').then(function(cached) {
          return cached || fetch(event.request);
        });
      })
    );
    return;
  }

  // For static assets (JS, CSS, images, fonts): Cache-First
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Default: Network-First
  event.respondWith(networkFirst(event.request));
});

// ============ Cache Strategies ============

// Cache-First: serve from cache, update in background
function cacheFirst(request) {
  return caches.match(request).then(function(cached) {
    var fetchPromise = fetch(request).then(function(response) {
      // Don't cache bad responses
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response;
      }
      // Clone and cache the new version
      var responseClone = response.clone();
      caches.open(STATIC_CACHE).then(function(cache) {
        cache.put(request, responseClone);
      });
      return response;
    }).catch(function() {
      // Network failed, return cached (already handled above)
    });
    return cached || fetchPromise;
  });
}

// Network-First: try network, fall back to cache
function networkFirst(request) {
  return fetch(request).then(function(response) {
    // Cache successful responses for static assets
    if (response && response.status === 200 && isStaticAsset(new URL(request.url).pathname)) {
      var responseClone = response.clone();
      caches.open(STATIC_CACHE).then(function(cache) {
        cache.put(request, responseClone);
      });
    }
    return response;
  }).catch(function() {
    // Network failed, try cache
    return caches.match(request);
  });
}

// ============ Helpers ============
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)(\?|$)/.test(pathname);
}
