
const CACHE_NAME = 'chat-app-v2';

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  event.waitUntil(self.clients.claim());
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, data } = event.data;
    
    // Enhanced notification options for better mobile support
    const notificationOptions = {
      body,
      icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=',
      badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=',
      tag: tag || 'chat-message',
      requireInteraction: false,
      silent: false,
      vibrate: [200, 100, 200],
      data: data,
      actions: [
        {
          action: 'open',
          title: 'Open Chat',
          icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIGZpbGw9IiMwMGE4ODQiPjxwYXRoIGQ9Im0xMiAyYzUuNTE0IDAgMTAgNC40ODYgMTAgMTBzLTQuNDg2IDEwLTEwIDEwLTEwLTQuNDg2LTEwLTEwIDQuNDg2LTEwIDEwLTEwem0wIDJjLTQuNDExIDAtOCAzLjU4OS04IDhzMy41ODkgOCA4IDggOC0zLjU4OSA4LTgtMy41ODktOC04LTh6bTAgM2MuNTUyIDAgMSAuNDQ4IDEgMXY0aDJjLjU1MiAwIDEgLjQ0OCAxIDFzLS40NDggMS0xIDFoLTNjLS41NTIgMC0xLS40NDgtMS0xdi01YzAtLjU1Mi40NDgtMSAxLTF6Ii8+PC9zdmc+',
        }
      ],
      timestamp: Date.now()
    };

    // Show notification
    self.registration.showNotification(title, notificationOptions);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    // Open the app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Handle push events (for future server-side push notifications)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      vibrate: [200, 100, 200],
      data: data.data,
      tag: data.tag || 'chat-push'
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});
