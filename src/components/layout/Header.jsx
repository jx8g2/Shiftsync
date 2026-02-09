import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../context/NotificationContext';
import './Header.css';

function Header({ onMenuClick }) {
    const { user, isEmployee, isManager, isAdmin } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { notifications, unreadCount, markAsRead, markAllAsRead, dismissNotification } = useNotifications();
    const location = useLocation();

    const [showNotifications, setShowNotifications] = useState(false);
    const notificationRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getPageTitle = () => {
        const path = location.pathname;

        // Employee pages
        if (path === '/employee') return 'Dashboard';
        if (path === '/employee/schedule') return 'My Schedule';
        if (path === '/employee/availability') return 'My Availability';
        if (path === '/employee/time-off') return 'Time Off Requests';

        // Manager pages
        if (path === '/manager') return 'Manager Dashboard';
        if (path === '/manager/employees') return 'Employee Management';
        if (path.startsWith('/manager/employees/')) return 'Employee Form';
        if (path === '/manager/schedule-builder') return 'Schedule Builder';
        if (path === '/manager/requests') return 'Request Approvals';
        if (path === '/manager/availability') return 'Employee Availability';
        if (path === '/manager/store-hours') return 'Store Hours';
        if (path === '/manager/reports') return 'Labor Reports';

        // Admin pages
        if (path === '/admin') return 'Admin Dashboard';
        if (path === '/admin/managers') return 'Manager Management';
        if (path.startsWith('/admin/managers/')) return 'Manager Form';

        return 'ShiftSync';
    };

    const formatTimeAgo = (timestamp) => {
        const now = new Date();
        const date = new Date(timestamp);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'shift': return '📅';
            case 'schedule': return '📆';
            case 'request': return '📝';
            case 'reminder': return '⏰';
            case 'approval': return '✅';
            case 'message': return '💬';
            case 'replacement': return '🔄';
            default: return '🔔';
        }
    };

    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    return (
        <header className="header">
            <div className="header-left">
                <button className="menu-btn" onClick={onMenuClick}>
                    ☰
                </button>
                <div className="header-title-group">
                    <h1 className="header-title">{getPageTitle()}</h1>
                    <span className="header-date">{today}</span>
                </div>
            </div>

            <div className="header-right">
                {/* Theme Toggle */}
                <button
                    className="theme-toggle-btn"
                    onClick={toggleTheme}
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>

                {/* Notifications */}
                <div className="header-notifications" ref={notificationRef}>
                    <button
                        className="notification-btn"
                        onClick={() => setShowNotifications(!showNotifications)}
                    >
                        <span className="notification-icon">🔔</span>
                        {unreadCount > 0 && (
                            <span className="notification-badge">{unreadCount}</span>
                        )}
                    </button>

                    {showNotifications && (
                        <div className="notification-dropdown">
                            <div className="notification-header">
                                <h3>Notifications</h3>
                                {unreadCount > 0 && (
                                    <button
                                        className="mark-all-read"
                                        onClick={markAllAsRead}
                                    >
                                        Mark all read
                                    </button>
                                )}
                            </div>

                            <div className="notification-list">
                                {notifications.length === 0 ? (
                                    <div className="notification-empty">
                                        <span>🔕</span>
                                        <p>No notifications</p>
                                    </div>
                                ) : (
                                    notifications.map(notification => (
                                        <div
                                            key={notification.id}
                                            className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                                            onClick={() => markAsRead(notification.id)}
                                        >
                                            <span className="notification-type-icon">
                                                {getNotificationIcon(notification.type)}
                                            </span>
                                            <div className="notification-content">
                                                <span className="notification-title">{notification.title}</span>
                                                <span className="notification-message">{notification.message}</span>
                                                <span className="notification-time">
                                                    {formatTimeAgo(notification.timestamp)}
                                                </span>
                                            </div>
                                            <button
                                                className="notification-dismiss"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    dismissNotification(notification.id);
                                                }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="header-user">
                    <span className="header-greeting">Welcome back,</span>
                    <span className="header-user-name">{user?.name?.split(' ')[0]}</span>
                </div>
            </div>
        </header>
    );
}

export default Header;
