import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { notificationsAPI } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { useSocket, useSocketEvent } from './SocketContext';

const NotificationContext = createContext(null);

// Polling interval in milliseconds (10 seconds for real-time feel)
const POLL_INTERVAL = 10000;

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function NotificationProvider({ children }) {
    const { user, isManager, isAdmin } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [toasts, setToasts] = useState([]);
    const pollIntervalRef = useRef(null);
    const lastNotifiedIdRef = useRef(localStorage.getItem('last_notified_id') || null);

    // Add a toast notification
    const addToast = useCallback((notification) => {
        const id = Date.now();
        setToasts(prev => [...prev, { ...notification, toastId: id }]);

        // Auto-remove toast after 5 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.toastId !== id));
        }, 5000);
    }, []);

    const removeToast = useCallback((toastId) => {
        setToasts(prev => prev.filter(t => t.toastId !== toastId));
    }, []);

    // Get the base URL for navigation depending on role
    const getRolePath = useCallback(() => {
        if (isAdmin) return '/admin';
        if (isManager) return '/manager';
        return '/employee';
    }, [isAdmin, isManager]);

    // Handle navigation when a notification is clicked
    const navigateToNotification = useCallback(async (notification) => {
        // Mark as read first
        if (!notification.read) {
            await notificationsAPI.markAsRead(notification.id);
            setNotifications(prev =>
                prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        }

        // Determine destination
        const type = notification.type;
        const rolePath = getRolePath();
        let targetPath = rolePath;

        switch (type) {
            case 'shift':
            case 'schedule':
                targetPath = user.role === 'employee' ? '/employee/schedule' : `${rolePath}/schedule-builder`;
                break;
            case 'request':
            case 'approval':
                targetPath = user.role === 'employee' ? '/employee/time-off' : `${rolePath}/requests`;
                break;
            case 'message':
                targetPath = `${rolePath}/chat`;
                break;
            default:
                targetPath = rolePath;
        }

        navigate(targetPath);
    }, [user, navigate, getRolePath]);

    // Fetch notifications from backend
    const fetchNotifications = useCallback(async (isInitial = false) => {
        if (!user) return;

        try {
            const response = await notificationsAPI.getAll({ limit: 20 });
            if (response.success) {
                const fetchedNotifications = response.notifications.map(n => ({
                    id: n.id,
                    type: n.type,
                    title: n.title,
                    message: n.message,
                    read: n.isRead,
                    timestamp: n.createdAt,
                    relatedEntityType: n.relatedEntityType,
                    relatedEntityId: n.relatedEntityId
                }));

                // Check for new notifications to show toast
                if (!isInitial && fetchedNotifications.length > 0) {
                    const latest = fetchedNotifications[0];
                    if (!latest.read && latest.id !== lastNotifiedIdRef.current) {
                        addToast(latest);
                        lastNotifiedIdRef.current = latest.id;
                        localStorage.setItem('last_notified_id', latest.id);
                    }
                } else if (isInitial && fetchedNotifications.length > 0) {
                    lastNotifiedIdRef.current = fetchedNotifications[0].id;
                    localStorage.setItem('last_notified_id', fetchedNotifications[0].id);
                }

                setNotifications(fetchedNotifications);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    }, [user, addToast]);

    // Fetch unread count from backend
    const fetchUnreadCount = useCallback(async () => {
        if (!user) return;

        try {
            const response = await notificationsAPI.getUnreadCount();
            if (response.success) {
                setUnreadCount(response.unreadCount);
            }
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    }, [user]);

    // Register Service Worker and Subscribe to Push
    const setupPushNotifications = useCallback(async () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('❌ Push messaging is not supported in this environment (likely due to insecure origin/non-HTTPS)');

            if (isIOS && !isStandalone) {
                alert('On iOS, Push Notifications require the app to be added to the Home Screen. Please tap the Share button and select "Add to Home Screen".');
            } else if (/Mobi|Android/i.test(navigator.userAgent) && !window.isSecureContext) {
                alert('Mobile Push Notifications require a Secure Context (HTTPS). If you are testing via an IP address over HTTP, push notifications will not work.');
            }
            return;
        }

        console.log('📦 Setting up push notifications...');

        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered');

            // Get public key
            const keyResponse = await notificationsAPI.getVapidPublicKey();
            if (!keyResponse.success) return;

            const publicKey = urlBase64ToUint8Array(keyResponse.publicKey);

            // Subscribe
            let subscription;
            try {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: publicKey
                });
            } catch (subErr) {
                if (subErr.name === 'NotAllowedError') {
                    console.warn('⚠️ Push permission denied by user');
                    return;
                }
                console.warn('Subscription failed, trying to auto-heal by clearing old token:', subErr);
                const oldSubscription = await registration.pushManager.getSubscription();
                if (oldSubscription) {
                    await oldSubscription.unsubscribe();
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: publicKey
                    });
                } else {
                    throw subErr;
                }
            }

            // Send to backend
            console.log('🔗 Sending push subscription to backend...');
            const subResponse = await notificationsAPI.subscribe(subscription);
            if (subResponse.success) {
                console.log('✅ User is subscribed to push notifications');
            } else {
                console.error('❌ Backend subscription failed:', subResponse.error);
            }

            // Listen for visibility pings from the Service Worker
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'SW_PING') {
                    if (document.visibilityState === 'visible') {
                        event.ports[0].postMessage({ isVisible: true });
                    }
                }
            });

        } catch (error) {
            console.error('❌ Error during push setup:', error);
            if (error.name === 'NotAllowedError') {
                console.warn('⚠️ Push permission denied by user');
            }
        }
    }, [notificationsAPI]);

    // Listen for real-time notifications
    useSocketEvent('notification_refresh', () => {
        console.log('🔔 [Socket] Notification refresh received');
        fetchUnreadCount();
        fetchNotifications();
    });

    // Load notifications on mount - Removed Polling
    useEffect(() => {
        if (user) {
            fetchNotifications(true);
            fetchUnreadCount();
            setupPushNotifications();
        } else {
            setNotifications([]);
            setUnreadCount(0);
        }
    }, [user, fetchNotifications, fetchUnreadCount, setupPushNotifications]);

    // Mark a notification as read
    const markAsRead = useCallback(async (id) => {
        try {
            const response = await notificationsAPI.markAsRead(id);
            if (response.success) {
                setNotifications(prev =>
                    prev.map(n => n.id === id ? { ...n, read: true } : n)
                );
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    }, []);

    // Mark all notifications as read
    const markAllAsRead = useCallback(async () => {
        try {
            const response = await notificationsAPI.markAllAsRead();
            if (response.success) {
                setNotifications(prev =>
                    prev.map(n => ({ ...n, read: true }))
                );
                setUnreadCount(0);
            }
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    }, []);

    // Dismiss (delete) a notification
    const dismissNotification = useCallback(async (id) => {
        try {
            const response = await notificationsAPI.delete(id);
            if (response.success) {
                const notification = notifications.find(n => n.id === id);
                setNotifications(prev => prev.filter(n => n.id !== id));
                if (notification && !notification.read) {
                    setUnreadCount(prev => Math.max(0, prev - 1));
                }
            }
        } catch (error) {
            console.error('Failed to dismiss notification:', error);
        }
    }, [notifications]);

    // Force refresh notifications
    const refresh = useCallback(() => {
        fetchNotifications();
        fetchUnreadCount();
    }, [fetchNotifications, fetchUnreadCount]);

    const value = {
        notifications,
        unreadCount,
        loading,
        toasts,
        markAsRead,
        markAllAsRead,
        dismissNotification,
        refresh,
        navigateToNotification,
        removeToast
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}

export default NotificationContext;
