import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { formatTime, formatDate, getWeekStart } from '../../data/mockData';
import Card from '../../components/ui/Card';
import MonthlySchedule from '../../components/dashboard/MonthlySchedule';
import './Dashboard.css';

function EmployeeDashboard() {
    const { user } = useAuth();
    const { getEmployeeSchedules, getTimeOffRequests, getReminders, dismissReminder } = useData();

    const schedules = getEmployeeSchedules(user.id);
    const requests = getTimeOffRequests(user.id);
    const reminders = getReminders(user.id);

    // Get upcoming shifts
    // Ensure published check handles potential string "true" or boolean true
    const currentSchedule = schedules.find(s => s.published === true || s.published === 'true');
    const upcomingShifts = currentSchedule?.shifts
        .filter(shift => shift.employeeId === user.id) || [];

    // Count pending requests
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const approvedRequests = requests.filter(r => r.status === 'approved').length;

    // Calculate weekly hours
    const weeklyHours = upcomingShifts.reduce((total, shift) => {
        const [startH, startM] = shift.start.split(':').map(Number);
        const [endH, endM] = shift.end.split(':').map(Number);
        return total + ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
    }, 0);

    const handleDismissReminder = (id) => {
        dismissReminder(id);
    };

    return (
        <div className="page-container animate-fade-in">
            <div className="dashboard-welcome">
                <h2>Welcome back, {user.name.split(' ')[0]}! 👋</h2>
                <p>Here's what's happening with your schedule</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 mb-lg">
                <Card.Stat
                    icon="📅"
                    iconColor="primary"
                    value={upcomingShifts.length}
                    label="Upcoming Shifts"
                />
                <Card.Stat
                    icon="⏰"
                    iconColor="secondary"
                    value={`${weeklyHours}h`}
                    label="Hours This Week"
                />
                <Card.Stat
                    icon="📝"
                    iconColor="primary"
                    value={pendingRequests}
                    label="Pending Requests"
                />
                <Card.Stat
                    icon="✅"
                    iconColor="success"
                    value={approvedRequests}
                    label="Approved Requests"
                />
            </div>

            <div className="dashboard-grid">
                {/* Monthly Schedule - Top & Full Width */}
                <Card className="dashboard-card span-full">
                    <Card.Body>
                        <MonthlySchedule />
                    </Card.Body>
                </Card>

                {/* Reminders Section */}
                <Card className="dashboard-card h-100">
                    <Card.Header action={<span className="badge badge-info">Active</span>}>
                        <h3 className="card-title">🔔 Reminders</h3>
                    </Card.Header>
                    <Card.Body>
                        {reminders.length === 0 ? (
                            <div className="empty-state-small">
                                <p>No active reminders</p>
                            </div>
                        ) : (
                            <div className="reminder-list">
                                {reminders.map(reminder => (
                                    <div key={reminder.id} className="reminder-item">
                                        <div className="reminder-icon">
                                            {reminder.type === 'shift' ? '📅' : '📋'}
                                        </div>
                                        <div className="reminder-content">
                                            <h4>{reminder.title}</h4>
                                            <p>{reminder.message}</p>
                                        </div>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => handleDismissReminder(reminder.id)}
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card.Body>
                </Card>

                {/* Upcoming Shifts */}
                <Card className="dashboard-card h-100">
                    <Card.Header>
                        <h3 className="card-title">📅 Upcoming Shifts</h3>
                    </Card.Header>
                    <Card.Body>
                        {upcomingShifts.length === 0 ? (
                            <div className="empty-state-small">
                                <p>No upcoming shifts scheduled</p>
                            </div>
                        ) : (
                            <div className="shift-list">
                                {upcomingShifts.map((shift, index) => (
                                    <div key={index} className="shift-item">
                                        <div className="shift-day">
                                            <span className="day-name">{shift.day.charAt(0).toUpperCase() + shift.day.slice(1)}</span>
                                        </div>
                                        <div className="shift-time">
                                            <span className="time-range">
                                                {formatTime(shift.start)} - {formatTime(shift.end)}
                                            </span>
                                            <span className="shift-duration">
                                                {((parseInt(shift.end) - parseInt(shift.start))) || 8} hours
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card.Body>
                </Card>

                {/* Recent Requests */}
                <Card className="dashboard-card h-100">
                    <Card.Header>
                        <h3 className="card-title">📝 Recent Requests</h3>
                    </Card.Header>
                    <Card.Body>
                        {requests.length === 0 ? (
                            <div className="empty-state-small">
                                <p>No time-off requests</p>
                            </div>
                        ) : (
                            <div className="request-list">
                                {requests.slice(0, 4).map(request => (
                                    <div key={request.id} className="request-item">
                                        <div className="request-info">
                                            <span className="request-dates">
                                                {formatDate(request.startDate)}
                                                {request.startDate !== request.endDate && ` - ${formatDate(request.endDate)}`}
                                            </span>
                                            <span className="request-reason">{request.reason}</span>
                                        </div>
                                        <span className={`badge badge-${request.status === 'approved' ? 'success' :
                                            request.status === 'denied' ? 'danger' : 'warning'
                                            }`}>
                                            {request.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card.Body>
                </Card>
            </div>
        </div>
    );
}


export default EmployeeDashboard;
