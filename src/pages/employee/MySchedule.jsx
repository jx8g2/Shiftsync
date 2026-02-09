import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { getWeekStart, addDays, formatDate, formatTime, DAYS_OF_WEEK, DAY_LABELS } from '../../utils/constants';
import Card from '../../components/ui/Card';
import './MySchedule.css';

function MySchedule() {
    const { user } = useAuth();
    const { getEmployeeSchedules, getEmployee } = useData();

    const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));

    const schedules = getEmployeeSchedules(user.id);
    // Find the schedule for the current week start that is ALSO published
    const currentSchedule = schedules.find(s => s.weekStart === weekStart && (s.published === true || s.published === 'true'));

    const myShifts = currentSchedule?.shifts.filter(s => s.employeeId === user.id) || [];

    // Calculate weekly stats
    const totalHours = myShifts.reduce((total, shift) => {
        const [startH, startM] = shift.start.split(':').map(Number);
        const [endH, endM] = shift.end.split(':').map(Number);
        return total + ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
    }, 0);

    const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
    const handleNextWeek = () => setWeekStart(addDays(weekStart, 7));

    const getShiftForDay = (day) => {
        return myShifts.find(s => s.day === day);
    };

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">My Schedule</h1>
                    <p className="page-subtitle">View your published work schedule</p>
                </div>
            </div>

            {/* Weekly Stats */}
            <div className="grid grid-cols-3 mb-lg">
                <Card.Stat
                    icon="📅"
                    iconColor="primary"
                    value={myShifts.length}
                    label="Shifts This Week"
                />
                <Card.Stat
                    icon="⏰"
                    iconColor="secondary"
                    value={`${totalHours}h`}
                    label="Total Hours"
                />
                <Card.Stat
                    icon={currentSchedule?.published ? "✅" : "⏳"}
                    iconColor="success"
                    value={currentSchedule?.published ? "Published" : "Draft"}
                    label="Schedule Status"
                />
            </div>

            <Card>
                <div className="week-navigation">
                    <button className="btn btn-secondary btn-icon" onClick={handlePrevWeek}>←</button>
                    <span className="week-label">
                        Week of {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
                    </span>
                    <button className="btn btn-secondary btn-icon" onClick={handleNextWeek}>→</button>
                </div>

                {!currentSchedule ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📅</div>
                        <h3 className="empty-state-title">No Schedule Published</h3>
                        <p>The schedule for this week hasn't been published yet. Check back later!</p>
                    </div>
                ) : (
                    <div className="schedule-week">
                        {DAYS_OF_WEEK.map((day, index) => {
                            const shift = getShiftForDay(day);
                            const date = addDays(weekStart, index);
                            const isToday = new Date().toISOString().split('T')[0] === date;

                            return (
                                <div
                                    key={day}
                                    className={`schedule-day ${shift ? 'has-shift' : 'day-off'} ${isToday ? 'today' : ''}`}
                                >
                                    <div className="schedule-day-header">
                                        <span className="day-name">{DAY_LABELS[day]}</span>
                                        <span className="day-date">{new Date(date).getDate()}</span>
                                        {isToday && <span className="today-badge">Today</span>}
                                    </div>

                                    {shift ? (
                                        <div className="shift-details">
                                            <div className="shift-time-block">
                                                <span className="shift-start">{formatTime(shift.start)}</span>
                                                <span className="shift-separator">→</span>
                                                <span className="shift-end">{formatTime(shift.end)}</span>
                                            </div>
                                            <div className="shift-hours">
                                                {(() => {
                                                    const [startH, startM] = shift.start.split(':').map(Number);
                                                    const [endH, endM] = shift.end.split(':').map(Number);
                                                    const hours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
                                                    return `${hours} hours`;
                                                })()}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="day-off-label">
                                            <span className="off-icon">🏠</span>
                                            <span>Day Off</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {/* Shift List View */}
            {myShifts.length > 0 && (
                <Card className="mt-lg">
                    <Card.Header>
                        <h3 className="card-title">📋 Shift Details</h3>
                    </Card.Header>
                    <Card.Body>
                        <div className="shift-list-detailed">
                            {myShifts.map((shift, index) => {
                                const date = addDays(weekStart, DAYS_OF_WEEK.indexOf(shift.day));
                                const [startH, startM] = shift.start.split(':').map(Number);
                                const [endH, endM] = shift.end.split(':').map(Number);
                                const hours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;

                                return (
                                    <div key={index} className="shift-list-item">
                                        <div className="shift-list-date">
                                            <span className="list-day">{shift.day.charAt(0).toUpperCase() + shift.day.slice(1)}</span>
                                            <span className="list-date-full">{formatDate(date)}</span>
                                        </div>
                                        <div className="shift-list-time">
                                            {formatTime(shift.start)} - {formatTime(shift.end)}
                                        </div>
                                        <div className="shift-list-hours">
                                            {hours} hours
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card.Body>
                </Card>
            )}
        </div>
    );
}

export default MySchedule;
