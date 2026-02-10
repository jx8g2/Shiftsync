import { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { DAYS_OF_WEEK } from '../../data/mockData';
import './MonthlySchedule.css';

function MonthlySchedule() {
    const { user } = useAuth();
    const { getSchedules } = useData();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [exporting, setExporting] = useState(false);
    const [shiftFilter, setShiftFilter] = useState('all');
    const calendarRef = useRef(null);

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month, 1).getDay();
    };

    const getMonthData = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = getDaysInMonth(currentDate);
        const firstDay = getFirstDayOfMonth(currentDate); // 0 = Sunday

        const days = [];
        // Add empty cells for days before the 1st
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }

        // Add actual days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i));
        }

        return days;
    };

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const getShiftsForDate = (date) => {
        if (!date) return [];

        // Calculate week start for this date (assuming Monday start for schedule keys, or whatever mockData uses)
        // mockData getWeekStart assumes Monday start? Let's check logic.
        // It returns formatted YYYY-MM-DD.
        // We need to match the weekStart string format used in DB/State.

        // We need to implement getWeekStart logic locally or import.
        // Importing getWeekStart from mockData.

        const weekStartStr = getWeekStartForDate(date);
        const schedules = getSchedules(user.storeId, weekStartStr);

        if (!schedules || schedules.length === 0 || !schedules[0].published) return [];

        const schedule = schedules[0];
        const daySlug = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

        return schedule.shifts.filter(s => s.day === daySlug);
    };

    // Helper to match mockData's getWeekStart
    // mockData's getWeekStart:
    // const d = new Date(date);
    // const day = d.getDay();
    // const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const getWeekStartForDate = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        return d.toISOString().split('T')[0];
    };

    const formatTime = (time) => {
        const [h, m] = time.split(':');
        let hour = parseInt(h);
        const ampm = hour >= 12 ? 'p' : 'a';
        const hour12 = hour % 12 || 12;
        // If minutes are 00, omit them for space? No, consistent width is better usually, but user wants full range.
        // Let's try compact: 9:00a -> 9a? No, 9:30p needs minutes.
        // Let's keep minutes but use small p/a.
        return `${hour12}${m !== '00' ? ':' + m : ''}${ampm}`;
    };

    // Helper to convert time string to minutes
    const timeToMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':');
        return parseInt(h) * 60 + parseInt(m);
    };

    // Period boundaries in minutes
    const PERIODS = {
        morning: { start: 270, end: 660 },    // 4:30 AM - 11:00 AM
        afternoon: { start: 660, end: 960 },  // 11:00 AM - 4:00 PM
        night: { start: 960, end: 1350 }      // 4:00 PM - 10:30 PM
    };

    // Determine all periods a shift covers based on start AND end time
    const getShiftPeriods = (startTime, endTime) => {
        const shiftStart = timeToMinutes(startTime);
        const shiftEnd = timeToMinutes(endTime);
        const periods = [];

        // Check each period for overlap
        if (shiftStart < PERIODS.morning.end && shiftEnd > PERIODS.morning.start) {
            periods.push('morning');
        }
        if (shiftStart < PERIODS.afternoon.end && shiftEnd > PERIODS.afternoon.start) {
            periods.push('afternoon');
        }
        if (shiftStart < PERIODS.night.end && shiftEnd > PERIODS.night.start) {
            periods.push('night');
        }

        return periods.length > 0 ? periods : ['other'];
    };

    // Legacy single period function (for backward compatibility)
    const getShiftPeriod = (startTime) => {
        const timeInMinutes = timeToMinutes(startTime);

        if (timeInMinutes >= 270 && timeInMinutes < 660) return 'morning';
        if (timeInMinutes >= 660 && timeInMinutes < 960) return 'afternoon';
        if (timeInMinutes >= 960 && timeInMinutes <= 1350) return 'night';
        return 'other';
    };

    const days = getMonthData();
    const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const handleExportImage = async () => {
        if (!calendarRef.current) return;

        setExporting(true);
        try {
            const canvas = await html2canvas(calendarRef.current, {
                backgroundColor: '#1a1a2e',
                scale: 2,
                useCORS: true
            });

            const link = document.createElement('a');
            link.download = `schedule-${monthName.replace(' ', '-')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (error) {
            console.error('Failed to export schedule:', error);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="monthly-schedule-container" ref={calendarRef}>
            <div className="monthly-header">
                <h2 className="section-title">📅 Monthly Schedule</h2>
                <div className="month-nav">
                    <button className="btn btn-secondary btn-sm" onClick={handlePrevMonth}>←</button>
                    <span className="current-month">{monthName}</span>
                    <button className="btn btn-secondary btn-sm" onClick={handleNextMonth}>→</button>
                    <button
                        className="btn btn-primary btn-sm export-btn"
                        onClick={handleExportImage}
                        disabled={exporting}
                        title="Export as image"
                    >
                        {exporting ? '⏳' : '📷'} Export
                    </button>
                </div>
            </div>

            <div className="schedule-filters">
                <label className="filter-label">Filter by Shift:</label>
                <select
                    className="shift-filter-select"
                    value={shiftFilter}
                    onChange={(e) => setShiftFilter(e.target.value)}
                >
                    <option value="all">All Shifts</option>
                    <option value="morning">🌅 Morning (4:30a-11a)</option>
                    <option value="afternoon">☀️ Afternoon (11a-4p)</option>
                    <option value="night">🌙 Night (4p-10:30p)</option>
                </select>
            </div>
            <div className="calendar-grid">
                <div className="calendar-day-header">Sun</div>
                <div className="calendar-day-header">Mon</div>
                <div className="calendar-day-header">Tue</div>
                <div className="calendar-day-header">Wed</div>
                <div className="calendar-day-header">Thu</div>
                <div className="calendar-day-header">Fri</div>
                <div className="calendar-day-header">Sat</div>

                {days.map((date, index) => {
                    let shifts = getShiftsForDate(date);

                    // Sort by start time
                    shifts.sort((a, b) => a.start.localeCompare(b.start));

                    // Apply shift period filter - include shifts that overlap with the selected period
                    if (shiftFilter !== 'all') {
                        shifts = shifts.filter(shift => {
                            const periods = getShiftPeriods(shift.start, shift.end);
                            return periods.includes(shiftFilter);
                        });
                    }

                    const isToday = date && new Date().toDateString() === date.toDateString();

                    return (
                        <div key={index} className={`calendar-cell ${!date ? 'empty' : ''} ${isToday ? 'today' : ''}`}>
                            {date && (
                                <>
                                    <div className="date-number">{date.getDate()}</div>
                                    <div className="daily-shifts">
                                        {shifts.slice(0, 7).map((shift, i) => {
                                            // Format time range: 9a-5p
                                            const timeStr = `${formatTime(shift.start)}-${formatTime(shift.end)}`;
                                            const periods = getShiftPeriods(shift.start, shift.end);
                                            // Join periods for class name (e.g., "shift-morning-afternoon-night")
                                            const periodClass = `shift-${periods.join('-')}`;

                                            return (
                                                <div
                                                    key={i}
                                                    className={`mini-shift ${periodClass}`}
                                                    title={`${shift.role}: ${shift.start}-${shift.end}`}
                                                >
                                                    <div className="mini-shift-info">
                                                        <ShiftName employeeId={shift.employeeId} />
                                                        <span className="mini-shift-role">{shift.role}</span>
                                                    </div>
                                                    <span className="mini-shift-time">{timeStr}</span>
                                                </div>
                                            );
                                        })}
                                        {shifts.length > 7 && (
                                            <div className="more-shifts">+{shifts.length - 7} more</div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Subcomponent to look up employee name efficiently?
// Or just look it up in the parent.
// Let's pass employees list to parent.
// Or usage of useData inside subcomponent.

function ShiftName({ employeeId }) {
    const { getEmployee } = useData();
    const emp = getEmployee(employeeId);
    return <span className="mini-shift-name">{emp?.name?.split(' ')[0] || 'Unknown'}</span>;
}

export default MonthlySchedule;
