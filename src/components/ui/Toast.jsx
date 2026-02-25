import { useNotifications } from '../../context/NotificationContext';
import './Toast.css';

export function Toast({ notification }) {
    const { removeToast, navigateToNotification } = useNotifications();

    const getIcon = (type) => {
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

    const handleClick = () => {
        navigateToNotification(notification);
        removeToast(notification.toastId);
    };

    return (
        <div className={`toast-item ${notification.type}`} onClick={handleClick}>
            <div className="toast-icon">{getIcon(notification.type)}</div>
            <div className="toast-content">
                <div className="toast-title">{notification.title}</div>
                <div className="toast-message">{notification.message}</div>
            </div>
            <button
                className="toast-close"
                onClick={(e) => {
                    e.stopPropagation();
                    removeToast(notification.toastId);
                }}
            >
                ×
            </button>
        </div>
    );
}

export function ToastContainer() {
    const { toasts } = useNotifications();

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <Toast key={toast.toastId} notification={toast} />
            ))}
        </div>
    );
}

export default ToastContainer;
