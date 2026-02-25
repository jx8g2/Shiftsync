import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useStoreFilter } from '../../context/StoreFilterContext';
import { employeesAPI, storesAPI, requestsAPI, schedulesAPI } from '../../utils/api';
import { formatDate, getWeekStart } from '../../data/mockData';
import Card from '../../components/ui/Card';
import MonthlySchedule from '../../components/dashboard/MonthlySchedule';
import '../employee/Dashboard.css';

function AdminDashboard() {
    const { user } = useAuth();
    const { stores, selectedStoreId } = useStoreFilter();
    const [stats, setStats] = useState({
        totalStores: 0,
        managers: 0,
        totalEmployees: 0,
        activeUsers: 0,
        pendingRequests: 0,
        shiftsToday: 0,
        schedulePublished: false
    });
    const [pendingRequests, setPendingRequests] = useState([]);
    const [todayShifts, setTodayShifts] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, [selectedStoreId, stores]);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);

            // Fetch employees (optionally filtered by store)
            const empUrl = selectedStoreId !== 'all' ? `?storeId=${selectedStoreId}` : '';
            const empRes = await employeesAPI.getAll(selectedStoreId !== 'all' ? selectedStoreId : undefined);

            let allEmployees = [];
            if (empRes.success) {
                allEmployees = empRes.employees;
                setEmployees(allEmployees);
            }

            // Fetch requests
            let allRequests = [];
            if (selectedStoreId !== 'all') {
                const reqRes = await requestsAPI.getAll({ storeId: selectedStoreId });
                allRequests = reqRes.success ? reqRes.requests : [];
            } else {
                // For 'all', fetch without store filter
                const reqRes = await requestsAPI.getAll({});
                allRequests = reqRes.success ? reqRes.requests : [];
            }

            const pending = allRequests.filter(r => r.status === 'pending');
            setPendingRequests(pending);

            // Fetch schedules for today
            const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            const weekStart = getWeekStart(new Date());
            let shifts = [];

            if (selectedStoreId !== 'all') {
                const schedRes = await schedulesAPI.get(selectedStoreId, weekStart);
                if (schedRes.success && schedRes.schedule) {
                    shifts = schedRes.schedule.shifts?.filter(s => s.day === today) || [];
                }
            } else {
                // Fetch schedules for all stores
                for (const store of stores) {
                    try {
                        const schedRes = await schedulesAPI.get(store.id, weekStart);
                        if (schedRes.success && schedRes.schedule) {
                            const storeShifts = schedRes.schedule.shifts?.filter(s => s.day === today) || [];
                            shifts = [...shifts, ...storeShifts];
                        }
                    } catch (e) { /* skip */ }
                }
            }
            setTodayShifts(shifts);

            const managers = allEmployees.filter(e => e.role === 'manager');
            const regularEmployees = allEmployees.filter(e => e.role === 'employee');
            const activeUsers = allEmployees.filter(e => e.status === 'active');

            setStats({
                totalStores: stores.length,
                managers: managers.length,
                totalEmployees: regularEmployees.length,
                activeUsers: activeUsers.length,
                pendingRequests: pending.length,
                shiftsToday: shifts.length,
                schedulePublished: false
            });
        } catch (err) {
            console.error('Failed to fetch dashboard data:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (time) => {
        if (!time) return '';
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'p' : 'a';
        const hour12 = hour % 12 || 12;
        return `${hour12}${m !== '00' ? ':' + m : ''}${ampm}`;
    };

    return (
        <div className="page-container animate-fade-in">
            <div className="dashboard-welcome">
                <div>
                    <h2>Welcome back, {user.name.split(' ')[0]}! 🏰</h2>
                    <p>System Overview{selectedStoreId !== 'all' ? ` — ${stores.find(s => s.id === selectedStoreId)?.name || ''}` : ''}</p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 mb-lg">
                <Link to="/admin/stores" className="stat-link-wrapper">
                    <Card.Stat
                        icon="🏪"
                        iconColor="secondary"
                        value={loading ? '...' : stats.totalStores}
                        label="Total Stores"
                    />
                </Link>

                <Link to="/admin/employees" className="stat-link-wrapper">
                    <Card.Stat
                        icon="👥"
                        iconColor="primary"
                        value={loading ? '...' : (stats.managers + stats.totalEmployees)}
                        label="Total Staff"
                    />
                </Link>

                <Link to="/admin/requests" className="stat-link-wrapper">
                    <Card.Stat
                        icon="📝"
                        iconColor="secondary"
                        value={loading ? '...' : stats.pendingRequests}
                        label="Pending Requests"
                    />
                </Link>

                <Card.Stat
                    icon="📅"
                    iconColor="primary"
                    value={loading ? '...' : stats.shiftsToday}
                    label="Shifts Today"
                />
            </div>

            <div className="dashboard-grid">
                {/* Monthly Schedule */}
                <Card className="dashboard-card span-full">
                    <Card.Body>
                        <MonthlySchedule storeId={selectedStoreId} />
                    </Card.Body>
                </Card>

                {/* Pending Approvals */}
                <Card className="dashboard-card h-100">
                    <Card.Header action={
                        <Link to="/admin/requests" className="btn btn-secondary btn-sm">View All</Link>
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
                                                <span className="request-dates">{request.employeeName || employee?.name}</span>
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
                                {todayShifts.slice(0, 8).map((shift, index) => {
                                    const employee = employees.find(e => e.id === shift.employeeId);
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
        </div >
    );
}

export default AdminDashboard;
