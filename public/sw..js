
/* public/sw.js */
self.addEventListener("install", (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

// Handle push notifications (for future server push support)
self.addEventListener("push", (event) => {
  console.log('Push notification received:', event);
  if (!event.data) return;
  
  let payload = {};
  try { 
    payload = event.data.json(); 
  } catch { 
    payload = { title: "New message", body: event.data.text() }; 
  }

  const title = payload.title || "Chat App";
  const options = {
    body: payload.body || "New message received",
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=",
    badge: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=",
    tag: "chat-message",
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: payload,
    actions: [
      { action: 'open', title: 'Open Chat', icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();
  
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ 
        includeUncontrolled: true, 
        type: "window" 
      });
      const url = self.location.origin + "/";
      
      // Focus existing tab or open new
      for (const client of allClients) {
        if (client.url.startsWith(url)) {
          await client.focus();
          if ('setAppBadge' in navigator) {
            navigator.setAppBadge(0); // Clear badge
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

// Handle message from main thread to show notification
self.addEventListener("message", (event) => {
  console.log('Service Worker message received:', event.data);
  
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, data } = event.data;
    
    // Enhanced notification options for background support
    const options = {
      body,
      icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=",
      badge: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=",
      tag: tag || "chat-message",
      renotify: true,
      requireInteraction: false,
      silent: false,
      data: data || {},
      actions: [
        { action: 'open', title: 'Open Chat' }
      ],
      // PWA-specific options
      showTrigger: 'automatic',
      persistent: true
    };

    // Try to set badge if supported
    if ('setAppBadge' in self.navigator) {
      self.navigator.setAppBadge(1);
    }

    self.registration.showNotification(title, options);
  }
});

// Handle notification close
self.addEventListener("notificationclose", (event) => {
  console.log('Notification closed:', event);
  // Clear badge when notification is dismissed
  if ('setAppBadge' in self.navigator) {
    self.navigator.setAppBadge(0);
  }
});

// Background sync for offline message queue (optional future enhancement)
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  // Could implement offline message queuing here
});
