import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { DAYS_OF_WEEK, DAY_LABELS, getWeekStart, addDays, formatDate, formatTime } from '../../data/mockData';
import Card from '../../components/ui/Card';
import '../employee/Availability.css';

function EmployeeAvailability() {
    const { user } = useAuth();
    const { getEmployees, getAllAvailability } = useData();

    const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
    const [selectedDay, setSelectedDay] = useState(null);

    const employees = getEmployees(user.storeId).filter(e => e.role === 'employee');
    const availability = getAllAvailability(user.storeId);

    const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
    const handleNextWeek = () => setWeekStart(addDays(weekStart, 7));

    const getEmployeeAvailability = (employeeId) => {
        return availability.find(a => a.employeeId === employeeId && a.weekStart === weekStart);
    };

    const getAvailableCount = (day) => {
        return employees.filter(emp => {
            const avail = getEmployeeAvailability(emp.id);
            return avail?.slots[day]?.available;
        }).length;
    };

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Employee Availability</h1>
                    <p className="page-subtitle">View consolidated availability for scheduling</p>
                </div>
            </div>

            <Card>
                <div className="week-navigation">
                    <button className="btn btn-secondary btn-icon" onClick={handlePrevWeek}>←</button>
                    <span className="week-label">
                        Week of {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
                    </span>
                    <button className="btn btn-secondary btn-icon" onClick={handleNextWeek}>→</button>
                </div>

                {/* Day Summary */}
                <div className="availability-summary">
                    {DAYS_OF_WEEK.map((day, index) => {
                        const availCount = getAvailableCount(day);
                        const date = addDays(weekStart, index);

                        return (
                            <div
                                key={day}
                                className={`summary-day ${selectedDay === day ? 'selected' : ''}`}
                                onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                            >
                                <div className="summary-day-header">
                                    <span className="day-label">{DAY_LABELS[day]}</span>
                                    <span className="day-date">{new Date(date).getDate()}</span>
                                </div>
                                <div className={`summary-count ${availCount < 2 ? 'low' : availCount < 4 ? 'medium' : 'good'}`}>
                                    {availCount} / {employees.length}
                                </div>
                                <span className="summary-label">available</span>
                            </div>
                        );
                    })}
                </div>

                {/* Employee List */}
                <div className="availability-table">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    {DAYS_OF_WEEK.map(day => (
                                        <th key={day} className={selectedDay === day ? 'highlighted' : ''}>
                                            {DAY_LABELS[day]}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(employee => {
                                    const empAvail = getEmployeeAvailability(employee.id);

                                    return (
                                        <tr key={employee.id}>
                                            <td>
                                                <div className="employee-cell">
                                                    <div className="avatar avatar-sm">{employee.avatar}</div>
                                                    <span>{employee.name}</span>
                                                </div>
                                            </td>
                                            {DAYS_OF_WEEK.map(day => {
                                                const slot = empAvail?.slots[day];

                                                return (
                                                    <td
                                                        key={day}
                                                        className={`${selectedDay === day ? 'highlighted' : ''} ${slot?.available ? 'available' : 'unavailable'}`}
                                                    >
                                                        {slot?.available ? (
                                                            <div className="avail-slot">
                                                                <span className="avail-time">{formatTime(slot.start)}</span>
                                                                <span className="avail-separator">-</span>
                                                                <span className="avail-time">{formatTime(slot.end)}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="unavail-mark">—</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Card>
        </div>
    );
}

export default EmployeeAvailability;
