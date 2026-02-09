import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

function Sidebar({ isOpen, onClose }) {
    const { user, logout, isEmployee, isManager, isAdmin } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
        if (onClose) onClose();
    };

    const handleLinkClick = () => {
        if (window.innerWidth <= 768 && onClose) {
            onClose();
        }
    };

    const employeeLinks = [
        { to: '/employee', icon: '📊', label: 'Dashboard' },
        { to: '/employee/schedule', icon: '📅', label: 'My Schedule' },
        { to: '/employee/time-off', icon: '🏖️', label: 'Time Off' },
        { to: '/employee/chat', icon: '💬', label: 'Chat' },
    ];

    const managerLinks = [
        { to: '/manager', icon: '📊', label: 'Dashboard' },
        { to: '/manager/employees', icon: '👥', label: 'Employee Management' },
        { to: '/manager/schedule-builder', icon: '📅', label: 'Schedule Builder' },
        { to: '/manager/requests', icon: '📝', label: 'Request Approvals' },
        { to: '/manager/store-hours', icon: '🏪', label: 'Store Hours' },
        { to: '/manager/reports', icon: '📈', label: 'Reports' },
        { to: '/manager/chat', icon: '💬', label: 'Chat' },
    ];

    // Admin has all manager links PLUS manager management
    const adminLinks = [
        { to: '/manager', icon: '📊', label: 'Dashboard' },
        { to: '/manager/employees', icon: '👥', label: 'Team Management' }, // Unified view with tabs
        { to: '/manager/schedule-builder', icon: '📅', label: 'Schedule Builder' },
        { to: '/manager/requests', icon: '📝', label: 'Request Approvals' },
        { to: '/manager/store-hours', icon: '🏪', label: 'Store Hours' },
        { to: '/manager/reports', icon: '📈', label: 'Reports' },
        { to: '/manager/chat', icon: '💬', label: 'Chat' },
    ];

    // Get links based on role
    let links = employeeLinks;
    let roleLabel = 'Employee';
    let roleColor = 'primary';

    if (isAdmin) {
        links = adminLinks;
        roleLabel = 'Admin';
        roleColor = 'danger';
    } else if (isManager) {
        links = managerLinks;
        roleLabel = 'Manager';
        roleColor = 'secondary';
    }

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <span className="logo-icon">⏱️</span>
                    <span className="logo-text">ShiftSync</span>
                </div>
            </div>

            <div className="sidebar-user">
                <div className="user-avatar">{user?.avatar}</div>
                <div className="user-info">
                    <span className="user-name">{user?.name}</span>
                    <span className={`user-role badge badge-${roleColor}`}>{roleLabel}</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <ul className="nav-list">
                    {links.map((link, index) => (
                        link.type === 'divider' ? (
                            <li key={index} className="nav-divider">
                                <span className="divider-label">{link.label}</span>
                            </li>
                        ) : (
                            <li key={link.to}>
                                <NavLink
                                    to={link.to}
                                    end={link.to.split('/').length === 2}
                                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                                    onClick={handleLinkClick}
                                >
                                    <span className="nav-icon">{link.icon}</span>
                                    <span className="nav-label">{link.label}</span>
                                </NavLink>
                            </li>
                        )
                    ))}
                </ul>
            </nav>

            <div className="sidebar-footer">
                <button className="logout-btn" onClick={handleLogout}>
                    <span className="nav-icon">🚪</span>
                    <span className="nav-label">Logout</span>
                </button>
            </div>
        </aside>
    );
}

export default Sidebar;
