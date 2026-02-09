import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { notificationsAPI } from '../utils/api';

const NotificationContext = createContext(null);

// Polling interval in milliseconds (10 seconds for real-time feel)
const POLL_INTERVAL = 10000;

export function NotificationProvider({ children }) {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const pollIntervalRef = useRef(null);

    // Fetch notifications from backend
    const fetchNotifications = useCallback(async () => {
        if (!user) return;

        try {
            const response = await notificationsAPI.getAll({ limit: 20 });
            if (response.success) {
                setNotifications(response.notifications.map(n => ({
                    id: n.id,
                    type: n.type,
                    title: n.title,
                    message: n.message,
                    read: n.isRead,
                    timestamp: n.createdAt,
                    relatedEntityType: n.relatedEntityType,
                    relatedEntityId: n.relatedEntityId
                })));
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    }, [user]);

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

    // Load notifications on mount and when user changes
    useEffect(() => {
        if (user) {
            fetchNotifications();
            fetchUnreadCount();

            // Start polling
            pollIntervalRef.current = setInterval(() => {
                fetchUnreadCount();
                fetchNotifications();
            }, POLL_INTERVAL);
        } else {
            setNotifications([]);
            setUnreadCount(0);
        }

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, [user, fetchNotifications, fetchUnreadCount]);

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
        markAsRead,
        markAllAsRead,
        dismissNotification,
        refresh
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
