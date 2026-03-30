// push-sw.js - Web Push Service Worker
// Version: 1.0.0

const CACHE_NAME = 'pandahub-push-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: '🐼 熊猫社区', body: '您有一条新通知', url: '/' };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    // fallback to text
    data.body = event.data ? event.data.text() : data.body;
  }

  const options = {
    body: data.body || '',
    icon: '/images/logo.png',
    badge: '/images/badge.png',
    tag: data.tag || 'default',
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || '/',
    },
    actions: [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
