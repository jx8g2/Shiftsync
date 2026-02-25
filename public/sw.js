/* eslint-disable no-restricted-globals */
// ShiftSync Service Worker for Background Notifications

self.addEventListener('push', (event) => {
    let title = 'New Notification';
    let body = 'You have a new update from ShiftSync.';
    let url = '/';

    try {
        if (event.data) {
            // web-push sends stringified JSON
            const data = event.data.json();
            title = data.title || title;
            body = data.body || data.message || body;
            url = data.url || url;
            console.log('[Service Worker] Push Received:', data);
        }
    } catch (e) {
        console.error('[Service Worker] Error parsing push data:', e);
        // Fallback: try parsing as raw text if JSON fails
        if (event.data) {
            body = event.data.text();
        }
    }

    // Ensure URL is absolute for PWA routing
    const targetUrl = new URL(url, self.registration.scope).href;

    const options = {
        body: body,
        icon: '/vite.png',
        badge: '/vite.png',
        data: { url: targetUrl },
        vibrate: [100, 50, 100],
        requireInteraction: true,
        actions: [
            { action: 'open', title: 'Open App' }
        ]
    };

    event.waitUntil(
        new Promise((resolve) => {
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
                if (windowClients.length === 0) {
                    console.log('[Service Worker] No clients open, showing push notification');
                    return self.registration.showNotification(title, options).then(resolve);
                }

                let isAppVisible = false;
                let pendingResponses = windowClients.length;

                // Timeout fallback in case clients don't respond
                const timeoutId = setTimeout(() => {
                    if (!isAppVisible) {
                        console.log('[Service Worker] Ping timeout, showing push notification');
                        self.registration.showNotification(title, options).then(resolve);
                    }
                }, 500);

                windowClients.forEach(client => {
                    const messageChannel = new MessageChannel();
                    messageChannel.port1.onmessage = (event) => {
                        if (event.data && event.data.isVisible) {
                            isAppVisible = true;
                            clearTimeout(timeoutId);
                            console.log('[Service Worker] App is visible, suppressing push notification');
                            resolve(); // Do nothing
                        }

                        pendingResponses--;
                        if (pendingResponses === 0 && !isAppVisible) {
                            clearTimeout(timeoutId);
                            console.log('[Service Worker] All clients hidden, showing push notification');
                            self.registration.showNotification(title, options).then(resolve);
                        }
                    };

                    client.postMessage({ type: 'SW_PING' }, [messageChannel.port2]);
                });
            });
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data.url;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // If a window is already open (even in the background), focus it and navigate
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }

            // If no window is open, launch a new one (using the absolute URL avoids breaking out of PWA scope)
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});
