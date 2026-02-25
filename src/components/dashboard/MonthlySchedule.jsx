import { useState, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useStoreFilter } from '../../context/StoreFilterContext';
import './MonthlySchedule.css';

const INITIAL_VISIBLE = 4;

// Period boundaries in minutes
const PERIODS = {
    morning: { start: 270, end: 660 }, // 4:30a – 11a
    afternoon: { start: 660, end: 960 }, // 11a   – 4p
    evening: { start: 960, end: 1350 }, // 4p    – 10:30p
};

function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':');
    return parseInt(h) * 60 + parseInt(m);
}

function getShiftPeriods(startTime, endTime) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    const out = [];
    if (start < PERIODS.morning.end && end > PERIODS.morning.start) out.push('morning');
    if (start < PERIODS.afternoon.end && end > PERIODS.afternoon.start) out.push('afternoon');
    if (start < PERIODS.evening.end && end > PERIODS.evening.start) out.push('evening');
    return out.length > 0 ? out : ['other'];
}

function formatTime(time) {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'p' : 'a';
    const hour12 = hour % 12 || 12;
    return `${hour12}${m !== '00' ? ':' + m : ''}${ampm}`;
}

function getWeekStartForDate(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
}

function MonthlySchedule({ storeId: propStoreId }) {
    const { user, isManager, isAdmin } = useAuth();
    const { getSchedules, data, getStore } = useData();
    const { effectiveStoreId } = useStoreFilter();
    // For the calendar: priority given to storeId prop, then effectiveStoreId, then user's storeId
    const calendarStoreId = propStoreId || effectiveStoreId || user?.storeId || null;
    const [currentDate, setCurrentDate] = useState(new Date());
    const [exporting, setExporting] = useState(false);
    // Combined filter: 'all' | 'morning' | 'afternoon' | 'evening' | 'mine'
    const [shiftFilter, setShiftFilter] = useState('all');
    // Per-day expanded set (dateKey strings)
    const [expandedDays, setExpandedDays] = useState(new Set());
    const calendarRef = useRef(null);

    const getMonthData = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        return days;
    };

    const handlePrevMonth = () =>
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

    const handleNextMonth = () =>
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    const getShiftsForDate = (date) => {
        if (!date || !calendarStoreId) return [];
        const weekStartStr = getWeekStartForDate(date);

        // Access schedules directly with loose == to handle string/number type mismatches from DB
        const allSchedules = data?.schedules || [];

        // Find all schedules that match the store requirement for that week
        const matches = allSchedules.filter(
            s => (calendarStoreId === 'all' || s.storeId == calendarStoreId) && s.weekStart === weekStartStr
        );

        if (matches.length === 0) return [];

        const daySlug = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

        let shifts = [];
        matches.forEach(match => {
            // Regular employees only see published schedules
            if (!match.published && !isManager && !isAdmin) return;
            shifts = [...shifts, ...match.shifts.filter(s => s.day === daySlug)];
        });

        return shifts;
    };


    const toggleDay = (dateKey) => {
        setExpandedDays(prev => {
            const next = new Set(prev);
            if (next.has(dateKey)) next.delete(dateKey);
            else next.add(dateKey);
            return next;
        });
    };

    const handleExportCSV = () => {
        setExporting(true);
        try {
            const rows = [['Date', 'Employee', 'Role', 'Start', 'End']];
            const allDays = getMonthData();

            allDays.forEach(date => {
                if (!date) return;
                let shifts = getShiftsForDate(date);

                // Sort by start time like we do in the UI
                shifts.sort((a, b) => a.start.localeCompare(b.start));

                // Apply current UI filter to the export too
                if (shiftFilter === 'mine') {
                    shifts = shifts.filter(s => s.employeeId == user.id);
                } else if (shiftFilter !== 'all') {
                    shifts = shifts.filter(s =>
                        getShiftPeriods(s.start, s.end).includes(shiftFilter)
                    );
                }

                const dateStr = date.toLocaleDateString();

                shifts.forEach(shift => {
                    const employee = data.employees.find(e => e.id == shift.employeeId);
                    rows.push([
                        dateStr,
                        employee?.name || 'Unknown',
                        shift.role,
                        formatTime(shift.start),
                        formatTime(shift.end)
                    ]);
                });
            });

            const csvContent = rows.map(r => r.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);

            // Format filename: [StoreName]-Schedule-[MonthName]-Exported-[CurrentDate].csv
            const store = getStore(calendarStoreId);
            const storeName = store?.name || 'Store';
            const today = new Date().toISOString().split('T')[0];
            const safeStoreName = storeName.replace(/[^a-z0-9]/gi, '-');
            const safeMonthName = monthName.replace(/[^a-z0-9]/gi, '-');
            const filename = `${safeStoreName}-Schedule-${safeMonthName}-Exported-${today}.csv`;

            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Failed to export CSV:', err);
        } finally {
            setExporting(false);
        }
    };

    const days = getMonthData();
    const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div className="monthly-schedule-container" ref={calendarRef}>
            {/* Header */}
            <div className="monthly-header">
                <h2 className="section-title">📅 Monthly Schedule</h2>
                <div className="month-nav">
                    <button className="btn btn-secondary btn-sm" onClick={handlePrevMonth}>←</button>
                    <span className="current-month">{monthName}</span>
                    <button className="btn btn-secondary btn-sm" onClick={handleNextMonth}>→</button>
                    <button
                        className="btn btn-primary btn-sm export-btn"
                        onClick={handleExportCSV}
                        disabled={exporting}
                        title="Export as CSV"
                    >
                        {exporting ? '⏳' : '📊'} Export CSV
                    </button>
                </div>
            </div>

            {/* Filter bar — dropdown */}
            <div className="schedule-filters">
                <label className="filter-label">Filter by Shift:</label>
                <select
                    className="shift-filter-select"
                    value={shiftFilter}
                    onChange={(e) => setShiftFilter(e.target.value)}
                >
                    <option value="all">All Shifts</option>
                    <option value="morning">🌅 Morning (4:30a–11a)</option>
                    <option value="afternoon">☀️ Afternoon (11a–4p)</option>
                    <option value="evening">🌙 Evening (4p–10:30p)</option>
                    <option value="mine">👤 My Shifts Only</option>
                </select>
            </div>

            {/* Calendar grid */}
            <div className="calendar-grid">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="calendar-day-header">{d}</div>
                ))}

                {days.map((date, index) => {
                    let shifts = getShiftsForDate(date);
                    shifts.sort((a, b) => a.start.localeCompare(b.start));

                    // Apply filter
                    if (shiftFilter === 'mine') {
                        // loose == handles string/number mismatch between DB and JWT token
                        shifts = shifts.filter(s => s.employeeId == user.id);
                    } else if (shiftFilter !== 'all') {
                        shifts = shifts.filter(s =>
                            getShiftPeriods(s.start, s.end).includes(shiftFilter)
                        );
                    }

                    const isToday = date && new Date().toDateString() === date.toDateString();
                    const dateKey = date ? date.toISOString().split('T')[0] : null;
                    const expanded = dateKey && expandedDays.has(dateKey);
                    const visible = expanded ? shifts : shifts.slice(0, INITIAL_VISIBLE);
                    const hidden = shifts.length - INITIAL_VISIBLE;

                    return (
                        <div
                            key={index}
                            className={`calendar-cell ${!date ? 'empty' : ''} ${isToday ? 'today' : ''}`}
                        >
                            {date && (
                                <>
                                    <div className="date-number">{date.getDate()}</div>
                                    <div className="daily-shifts">
                                        {visible.map((shift, i) => {
                                            const timeStr = `${formatTime(shift.start)}-${formatTime(shift.end)}`;
                                            const periods = getShiftPeriods(shift.start, shift.end);
                                            const periodClass = `shift-${periods.join('-')}`;
                                            // Highlight own shift with a subtle ring
                                            const isMe = shift.employeeId == user.id;

                                            return (
                                                <div
                                                    key={i}
                                                    className={`mini-shift ${periodClass}${isMe ? ' my-shift-highlight' : ''}`}
                                                    title={`${shift.role}: ${shift.start}–${shift.end}`}
                                                >
                                                    <div className="mini-shift-info">
                                                        <ShiftName employeeId={shift.employeeId} />
                                                        <span className="mini-shift-role">{shift.role}</span>
                                                    </div>
                                                    <span className="mini-shift-time">{timeStr}</span>
                                                </div>
                                            );
                                        })}

                                        {/* Load More / Collapse */}
                                        {!expanded && hidden > 0 && (
                                            <button
                                                className="more-shifts"
                                                onClick={() => toggleDay(dateKey)}
                                            >
                                                +{hidden} more
                                            </button>
                                        )}
                                        {expanded && shifts.length > INITIAL_VISIBLE && (
                                            <button
                                                className="more-shifts collapse-shifts"
                                                onClick={() => toggleDay(dateKey)}
                                            >
                                                Show less
                                            </button>
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

function ShiftName({ employeeId }) {
    const { getEmployee } = useData();
    const emp = getEmployee(employeeId);
    return <span className="mini-shift-name">{emp?.name?.split(' ')[0] || 'Unknown'}</span>;
}

export default MonthlySchedule;
