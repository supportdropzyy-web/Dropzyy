// Dropzyy Service Worker for Background Web Push Notifications (Screen-Off Wakeup)
const CACHE_NAME = 'dropzyy-push-v2';

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
                title: '🚨 New Dropzyy Alert!',
                body: event.data.text() || 'A new alert has been received. Tap to view.'
            };
        }
    }

    const title = payload.title || '🚨 NEW ORDER RECEIVED!';
    const rawUrl = payload.url || '/';
    const orderId = payload.orderId || null;

    const options = {
        body: payload.body || 'Tap to open Dropzyy and view details.',
        icon: payload.icon || '/dropzyy-logo.png',
        badge: payload.badge || '/dropzyy-logo.png',
        image: payload.image || undefined,
        tag: 'dropzyy-push-' + (orderId || Date.now()),
        renotify: true,
        requireInteraction: true,
        vibrate: [700, 200, 700, 200, 1000, 200, 1200],
        data: {
            url: rawUrl,
            orderId: orderId,
            timestamp: Date.now()
        },
        actions: [
            { action: 'open_order', title: '🟢 View in App' },
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

    const notifData = event.notification.data || {};
    let rawUrl = notifData.url || '/';
    const orderId = notifData.orderId || null;

    // Build absolute URL (clients.openWindow strictly requires absolute URL)
    let fullUrl;
    try {
        const u = new URL(rawUrl, self.location.origin);
        if (orderId && !u.searchParams.has('open_live_order')) {
            u.searchParams.set('open_live_order', String(orderId));
        }
        u.searchParams.set('notification_click', '1');
        fullUrl = u.href;
    } catch (e) {
        fullUrl = self.location.origin + '/?notification_click=1' + (orderId ? '&open_live_order=' + encodeURIComponent(orderId) : '');
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // If a Dropzyy window is already open, focus it and post message
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if ('focus' in client) {
                    client.postMessage({
                        type: 'DROPZYY_PUSH_OPEN_ORDER',
                        orderId: orderId,
                        url: fullUrl
                    });
                    // If client supports navigate, navigate to fullUrl if it has params
                    if ('navigate' in client && (orderId || (rawUrl && rawUrl !== '/'))) {
                        try {
                            client.navigate(fullUrl);
                        } catch (navErr) {
                            console.warn('[SW] Client navigate notice:', navErr);
                        }
                    }
                    return client.focus();
                }
            }
            // If no window is currently open, open a new window with fullUrl
            if (clients.openWindow) {
                return clients.openWindow(fullUrl);
            }
        })
    );
});
