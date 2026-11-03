// Dropzyy Service Worker for Background Web Push Notifications (Screen-Off Wakeup)
const CACHE_NAME = 'dropzyy-push-v1';

self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
    let payload = {};
    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload = {
                title: '🚨 New Dropzyy Order!',
                body: event.data.text() || 'A new order has been placed. Tap to view.'
            };
        }
    }

    const title = payload.title || '🚨 NEW ORDER RECEIVED!';
    const options = {
        body: payload.body || 'Tap to open Dropzyy and accept the order immediately.',
        icon: payload.icon || '/dropzyy-logo.png',
        badge: payload.badge || '/dropzyy-logo.png',
        image: payload.image || undefined,
        tag: 'dropzyy-order-' + (payload.orderId || Date.now()),
        renotify: true,
        requireInteraction: true,
        vibrate: [700, 200, 700, 200, 1000, 200, 1200],
        data: {
            url: payload.url || '/',
            orderId: payload.orderId
        },
        actions: [
            { action: 'open_order', title: '🟢 View & Accept' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    const targetUrl = (event.notification.data && event.notification.data.url) || '/';
    const orderId = event.notification.data ? event.notification.data.orderId : null;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url && 'focus' in client) {
                    client.postMessage({
                        type: 'DROPZYY_PUSH_OPEN_ORDER',
                        orderId: orderId
                    });
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
