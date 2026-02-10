import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { employeesAPI } from '../../utils/api';
import { formatDate, getWeekStart } from '../../data/mockData';
import Card from '../../components/ui/Card';
import MonthlySchedule from '../../components/dashboard/MonthlySchedule';
import '../employee/Dashboard.css';

function ManagerDashboard() {
    const { user, isAdmin } = useAuth();
    const {
        getEmployees,
        getTimeOffRequestsByStore,
        getSchedules,
        getAllAvailability,
        getStore
    } = useData();

    // Admin Stats State
    const [adminStats, setAdminStats] = useState({
        managers: 0,
        totalEmployees: 0,
        activeUsers: 0
    });
    const [loadingAdminStats, setLoadingAdminStats] = useState(isAdmin);

    useEffect(() => {
        if (isAdmin) {
            fetchAdminStats();
        }
    }, [isAdmin]);

    const fetchAdminStats = async () => {
        try {
            const response = await employeesAPI.getAll();
            if (response.success) {
                const allEmployees = response.employees;
                const managers = allEmployees.filter(e => e.role === 'manager');
                const regularEmployees = allEmployees.filter(e => e.role === 'employee');
                const activeUsers = allEmployees.filter(e => e.status === 'active');

                setAdminStats({
                    managers: managers.length,
                    totalEmployees: regularEmployees.length,
                    activeUsers: activeUsers.length
                });
            }
        } catch (error) {
            console.error('Failed to fetch admin stats:', error);
        } finally {
            setLoadingAdminStats(false);
        }
    };

    const store = getStore(user.storeId);
    const employees = getEmployees(user.storeId);
    const requests = getTimeOffRequestsByStore(user.storeId);
    const weekStart = getWeekStart(new Date());
    const schedules = getSchedules(user.storeId, weekStart);
    const availability = getAllAvailability(user.storeId);

    const pendingRequests = requests.filter(r => r.status === 'pending');
    const activeEmployees = employees.filter(e => e.status === 'active' && e.role === 'employee');

    // Calculate coverage for today
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentSchedule = schedules[0];
    const todayShifts = currentSchedule?.shifts.filter(s => s.day === today) || [];

    // Calculate total staff based on role
    // For admins: managers + employees
    // For managers: only employees (crew) they manage
    const totalStaff = isAdmin
        ? (adminStats.managers + adminStats.totalEmployees)
        : activeEmployees.length;

    return (
        <div className="page-container animate-fade-in">
            <div className="dashboard-welcome">
                <h2>Welcome back, {user.name.split(' ')[0]}! {isAdmin ? '🏰' : '👔'}</h2>
                <p>
                    {isAdmin
                        ? 'System Overview'
                        : `Managing ${store?.name || 'your store'}`
                    }
                </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 mb-lg">
                <Link to="/manager/employees" className="stat-link-wrapper">
                    <Card.Stat
                        icon="👥"
                        iconColor="primary"
                        value={isAdmin && loadingAdminStats ? '...' : totalStaff}
                        label="Total Staff"
                    />
                </Link>

                <Link to="/manager/requests" className="stat-link-wrapper">
                    <Card.Stat
                        icon="📝"
                        iconColor="secondary"
                        value={pendingRequests.length}
                        label="Pending Requests"
                    />
                </Link>

                <Link to="/manager/schedule-builder" className="stat-link-wrapper">
                    <Card.Stat
                        icon="📅"
                        iconColor="primary"
                        value={todayShifts.length}
                        label="Shifts Today"
                    />
                </Link>

                <Card.Stat
                    icon="✅"
                    iconColor="success"
                    value={currentSchedule?.published ? 'Yes' : 'No'}
                    label="Schedule Published"
                />
            </div>

            <div className="dashboard-grid">
                {/* Monthly Schedule - Top & Full Width */}
                <Card className="dashboard-card span-full">
                    <Card.Body>
                        <MonthlySchedule />
                    </Card.Body>
                </Card>

                {/* Pending Approvals */}
                <Card className="dashboard-card h-100">
                    <Card.Header action={
                        <a href="/manager/requests" className="btn btn-secondary btn-sm">View All</a>
                    }>
                        <h3 className="card-title">📝 Pending Approvals</h3>
                    </Card.Header>
                    <Card.Body>
                        {pendingRequests.length === 0 ? (
                            <div className="empty-state-small">
                                <p>No pending requests</p>
                            </div>
                        ) : (
                            <div className="request-list">
                                {pendingRequests.slice(0, 4).map(request => {
                                    const employee = employees.find(e => e.id === request.employeeId);
                                    return (
                                        <div key={request.id} className="request-item">
                                            <div className="request-info">
                                                <span className="request-dates">{employee?.name}</span>
                                                <span className="request-reason">
                                                    {formatDate(request.startDate)} - {request.reason}
                                                </span>
                                            </div>
                                            <span className="badge badge-warning">Pending</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card.Body>
                </Card>

                {/* Today's Coverage */}
                <Card className="dashboard-card h-100">
                    <Card.Header>
                        <h3 className="card-title">📅 Today's Coverage</h3>
                    </Card.Header>
                    <Card.Body>
                        {todayShifts.length === 0 ? (
                            <div className="empty-state-small">
                                <p>No shifts scheduled for today</p>
                            </div>
                        ) : (
                            <div className="shift-list">
                                {todayShifts.map((shift, index) => {
                                    const employee = employees.find(e => e.id === shift.employeeId);

                                    // Helper to format time to 12h AM/PM
                                    const formatTime = (time) => {
                                        if (!time) return '';
                                        const [h, m] = time.split(':');
                                        const hour = parseInt(h);
                                        const ampm = hour >= 12 ? 'p' : 'a';
                                        const hour12 = hour % 12 || 12;
                                        return `${hour12}${m !== '00' ? ':' + m : ''}${ampm}`;
                                    };

                                    return (
                                        <div key={index} className="shift-item">
                                            <div className="avatar avatar-sm">{employee?.avatar}</div>
                                            <div className="shift-day">
                                                <span className="day-name">{employee?.name}</span>
                                            </div>
                                            <div className="shift-time">
                                                <span className="time-range">
                                                    {formatTime(shift.start)} - {formatTime(shift.end)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card.Body>
                </Card>
            </div>
        </div>
    );
}

export default ManagerDashboard;
