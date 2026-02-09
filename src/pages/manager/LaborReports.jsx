import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { getWeekStart, addDays, formatDate, DAYS_OF_WEEK } from '../../utils/constants';
import Card from '../../components/ui/Card';
import './LaborReports.css';

function LaborReports() {
    const { user } = useAuth();
    const { getEmployees, getSchedules, getStore } = useData();

    const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));

    const store = getStore(user.storeId);
    const employees = getEmployees(user.storeId).filter(e => e.role === 'employee');
    const schedules = getSchedules(user.storeId, weekStart);
    const currentSchedule = schedules[0];

    const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
    const handleNextWeek = () => setWeekStart(addDays(weekStart, 7));

    // Calculate labor metrics
    const calculateEmployeeHours = (employeeId) => {
        if (!currentSchedule) return 0;
        return currentSchedule.shifts
            .filter(s => s.employeeId === employeeId)
            .reduce((total, shift) => {
                const [startH, startM] = shift.start.split(':').map(Number);
                const [endH, endM] = shift.end.split(':').map(Number);
                return total + ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
            }, 0);
    };

    const employeeData = employees.map(emp => {
        const hours = calculateEmployeeHours(emp.id);
        return {
            ...emp,
            hours
        };
    });

    const totalHours = employeeData.reduce((sum, e) => sum + e.hours, 0);
    const scheduledEmployees = employeeData.filter(e => e.hours > 0).length;

    // Daily breakdown
    const dailyData = DAYS_OF_WEEK.map(day => {
        const dayShifts = currentSchedule?.shifts.filter(s => s.day === day) || [];
        const hours = dayShifts.reduce((total, shift) => {
            const [startH, startM] = shift.start.split(':').map(Number);
            const [endH, endM] = shift.end.split(':').map(Number);
            return total + ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
        }, 0);

        return {
            day,
            shifts: dayShifts.length,
            hours
        };
    });

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Reports</h1>
                    <p className="page-subtitle">View scheduled hours for {store?.name}</p>
                </div>
            </div>

            {/* Week Navigation */}
            <div className="week-nav-card mb-lg">
                <button className="btn btn-secondary btn-icon" onClick={handlePrevWeek}>←</button>
                <span className="week-label">
                    Week of {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
                </span>
                <button className="btn btn-secondary btn-icon" onClick={handleNextWeek}>→</button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 mb-lg">
                <Card.Stat
                    icon="⏰"
                    iconColor="primary"
                    value={`${totalHours}h`}
                    label="Total Hours Scheduled"
                />
                <Card.Stat
                    icon="👥"
                    iconColor="secondary"
                    value={scheduledEmployees}
                    label="Employees Scheduled"
                />
            </div>

            <div className="reports-grid">
                {/* Employee Breakdown */}
                <Card>
                    <Card.Header>
                        <h3 className="card-title">👥 Employee Hours</h3>
                    </Card.Header>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Position</th>
                                    <th>Hours</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employeeData.map(emp => (
                                    <tr key={emp.id}>
                                        <td>
                                            <div className="employee-cell">
                                                <div className="avatar avatar-sm">{emp.avatar}</div>
                                                <span>{emp.name}</span>
                                            </div>
                                        </td>
                                        <td>{emp.position || 'Cashier'}</td>
                                        <td><strong>{emp.hours}h</strong></td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td><strong>Total</strong></td>
                                    <td>-</td>
                                    <td><strong>{totalHours}h</strong></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>

                {/* Daily Breakdown */}
                <Card>
                    <Card.Header>
                        <h3 className="card-title">📅 Daily Breakdown</h3>
                    </Card.Header>
                    <div className="daily-chart">
                        {dailyData.map(day => {
                            const maxHours = Math.max(...dailyData.map(d => d.hours), 1);
                            const barHeight = (day.hours / maxHours) * 100;

                            return (
                                <div key={day.day} className="chart-bar-container">
                                    <div className="bar-value">{day.hours}h</div>
                                    <div
                                        className="chart-bar"
                                        style={{ height: `${barHeight}%` }}
                                    >
                                        <div className="bar-fill"></div>
                                    </div>
                                    <div className="bar-label">
                                        {day.day.charAt(0).toUpperCase() + day.day.slice(1, 3)}
                                    </div>
                                    <div className="bar-shifts">{day.shifts} shifts</div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>
        </div>
    );
}

export default LaborReports;
