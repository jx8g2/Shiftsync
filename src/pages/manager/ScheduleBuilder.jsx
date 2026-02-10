import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { employeesAPI } from '../../utils/api';
import { DAYS_OF_WEEK, DAY_LABELS, ROLES, getWeekStart, addDays, formatDate } from '../../data/mockData';
import Card from '../../components/ui/Card';
import './ScheduleBuilder.css';

function ScheduleBuilder() {
    const { user } = useAuth();
    const { saveSchedule, getSchedules } = useData();

    const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
    const [shifts, setShifts] = useState([]);
    const [allEmployees, setAllEmployees] = useState([]); // Store all fetched employees
    const [isPublished, setIsPublished] = useState(false); // Track if current schedule is published
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showCalendarView, setShowCalendarView] = useState(false);
    const [editingShift, setEditingShift] = useState(null);

    // Load existing schedule when weekStart changes
    useEffect(() => {
        const loadSchedule = () => {
            const savedSchedules = getSchedules(user.storeId, weekStart);
            if (savedSchedules && savedSchedules.length > 0) {
                // Found a saved schedule for this week
                setShifts(savedSchedules[0].shifts);
                setIsPublished(savedSchedules[0].published);
            } else {
                // No saved schedule
                setShifts([]);
                setIsPublished(false);
            }
        };
        loadSchedule();
    }, [weekStart, user.storeId, getSchedules]);

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        try {
            const response = await employeesAPI.getAll();
            if (response.success) {
                // Get both employees and managers
                const employeeList = response.employees.filter(e => e.role === 'employee' || e.role === 'manager');
                setAllEmployees(employeeList);
            }
        } catch (error) {
            console.error('Failed to fetch employees:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filter employees based on publication status
    // If published: Show ALL employees (including inactive)
    // If NOT published: Show ONLY active employees
    const filteredEmployees = useMemo(() => {
        if (isPublished) {
            return allEmployees;
        }
        return allEmployees.filter(e => e.status === 'active');
    }, [allEmployees, isPublished]);


    // Auto-fill shifts logic
    useEffect(() => {
        // Only autofill if we have no shifts AND we confirm there's no saved schedule
        // Use filteredEmployees to ensure we don't autofill inactive employees for new schedules
        if (filteredEmployees.length > 0 && shifts.length === 0) {
            const savedSchedules = getSchedules(user.storeId, weekStart);
            if (!savedSchedules || savedSchedules.length === 0) {
                autoFillFromDefaults();
            }
        }
    }, [filteredEmployees, weekStart]); // Re-run when filtered list changes or week changes

    const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
    const handleNextWeek = () => setWeekStart(addDays(weekStart, 7));

    const getShift = (employeeId, day) => shifts.find(s => s.employeeId === employeeId && s.day === day);

    const addShift = (employeeId, day, start = '09:00', end = '17:00', role = '') => {
        if (getShift(employeeId, day)) return;
        const emp = allEmployees.find(e => e.id === employeeId); // Look up in all employees just in case
        const defaultRole = role || emp?.position || 'Cashier';
        setShifts(prev => [...prev, { employeeId, day, start, end, role: defaultRole }]);
    };

    const updateShift = (employeeId, day, field, value) => {
        setShifts(prev => prev.map(s =>
            s.employeeId === employeeId && s.day === day ? { ...s, [field]: value } : s
        ));
    };

    const removeShift = (employeeId, day) => {
        setShifts(prev => prev.filter(s => !(s.employeeId === employeeId && s.day === day)));
        setEditingShift(null);
    };

    const toggleShift = (employeeId, day) => {
        if (editingShift?.employeeId === employeeId && editingShift?.day === day) return;

        const existing = getShift(employeeId, day);
        if (existing) {
            removeShift(employeeId, day);
        } else {
            const emp = allEmployees.find(e => e.id === employeeId);
            const defaultShift = getDefaultShift(emp, day);
            if (defaultShift) {
                addShift(employeeId, day, defaultShift.start, defaultShift.end, defaultShift.role);
            } else {
                addShift(employeeId, day);
            }
        }
    };

    const handleDoubleClick = (employeeId, day) => {
        const shift = getShift(employeeId, day);
        if (shift) {
            setEditingShift({ employeeId, day });
        }
    };

    const autoFillFromDefaults = () => {
        const newShifts = [];

        // ONLY use filteredEmployees for autofill
        filteredEmployees.forEach(employee => {
            if (employee.defaultShifts && Array.isArray(employee.defaultShifts)) {
                employee.defaultShifts.forEach(defaultShift => {
                    const day = defaultShift.dayOfWeek || defaultShift.day;
                    const start = defaultShift.startTime || defaultShift.start;
                    const end = defaultShift.endTime || defaultShift.end;
                    const role = defaultShift.primaryRole || employee.position || 'Cashier';

                    if (!defaultShift.isOff && start && end) {
                        newShifts.push({ employeeId: employee.id, day, start, end, role });
                    }
                });
            }
        });

        if (newShifts.length > 0) {
            setShifts(newShifts);
            setMessage({ type: 'success', text: `Loaded ${newShifts.length} default shifts` });
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const clearAllShifts = () => {
        setShifts([]);
        setMessage({ type: 'info', text: 'All shifts cleared' });
        setTimeout(() => setMessage(null), 3000);
    };

    const selectAllShifts = () => {
        autoFillFromDefaults();
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const scheduleData = {
                storeId: user.storeId,
                weekStart: weekStart,
                shifts: shifts,
                published: false // Saving doesn't publish
            };
            await saveSchedule(scheduleData);
            setMessage({ type: 'success', text: 'Schedule saved!' });
            setIsPublished(false); // Update local state
        } catch (error) {
            console.error('Failed to save schedule:', error);
            setMessage({ type: 'error', text: 'Failed to save schedule' });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            const scheduleData = {
                storeId: user.storeId,
                weekStart: weekStart,
                shifts: shifts,
                published: true
            };
            await saveSchedule(scheduleData);
            setMessage({ type: 'success', text: 'Schedule published!' });
            setIsPublished(true); // Update local state
        } catch (error) {
            console.error('Failed to publish schedule:', error);
            setMessage({ type: 'error', text: 'Failed to publish schedule' });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const getEmployeeHours = (employeeId) => {
        return shifts
            .filter(s => s.employeeId === employeeId)
            .reduce((total, shift) => {
                const [startH, startM] = shift.start.split(':').map(Number);
                const [endH, endM] = shift.end.split(':').map(Number);
                return total + ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
            }, 0);
    };

    const getDefaultShift = (employee, day) => {
        if (!employee?.defaultShifts) return null;
        const ds = employee.defaultShifts.find(shift => {
            const shiftDay = shift.dayOfWeek || shift.day;
            return shiftDay === day && !shift.isOff;
        });
        if (!ds) return null;
        return {
            start: ds.startTime || ds.start,
            end: ds.endTime || ds.end,
            role: ds.primaryRole || employee.position
        };
    };

    const timeToMinutes = (time) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };

    const formatTime = (time) => {
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'p' : 'a';
        const hour12 = hour % 12 || 12;
        return `${hour12}${m !== '00' ? ':' + m : ''}${ampm}`;
    };

    // Convert 24h time to AM/PM label
    const timeToLabel = (time) => {
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${m} ${ampm}`;
    };

    const timeOptions = [];
    for (let h = 0; h < 24; h++) {
        timeOptions.push(`${h.toString().padStart(2, '0')}:00`);
        timeOptions.push(`${h.toString().padStart(2, '0')}:30`);
    }

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading schedule builder...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header flex justify-between items-center">
                <div>
                    <h1 className="page-title">Schedule Builder</h1>
                    <p className="page-subtitle">Click to toggle shifts • Double-click to edit times</p>
                </div>
                <div className="flex gap-md flex-wrap">
                    <button className="btn btn-secondary" onClick={selectAllShifts}>
                        ✅ Select All
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowCalendarView(true)}>
                        📊 Timeline
                    </button>
                    <button className="btn btn-secondary" onClick={clearAllShifts}>
                        🗑️ Clear
                    </button>
                    <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>
                        💾 Save
                    </button>
                    <button className="btn btn-primary" onClick={handlePublish} disabled={saving}>
                        📤 Publish
                    </button>
                </div>
            </div>

            {message && (
                <div className={`message message-${message.type} mb-lg`}>{message.text}</div>
            )}

            <Card>
                <div className="week-navigation">
                    <button className="btn btn-secondary btn-icon" onClick={handlePrevWeek}>←</button>
                    <div className="week-info">
                        <span className="week-label">
                            {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
                        </span>
                        {isPublished && <span className="status-badge status-active ml-md">Published</span>}
                    </div>
                    <button className="btn btn-secondary btn-icon" onClick={handleNextWeek}>→</button>
                </div>

                {filteredEmployees.length === 0 ? (
                    <div className="empty-state">
                        <p>No active employees found to schedule.</p>
                    </div>
                ) : (
                    <div className="schedule-grid">
                        <div className="schedule-header">
                            <div className="schedule-cell employee-header">Employee</div>
                            {DAYS_OF_WEEK.map((day, index) => {
                                const dateStr = addDays(weekStart, index);
                                // Parse YYYY-MM-DD manually to avoid timezone issues
                                const [y, m, d] = dateStr.split('-').map(Number);
                                const dateObj = new Date(y, m - 1, d); // Local date for formatting
                                const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });

                                return (
                                    <div key={day} className="schedule-cell day-header">
                                        <div>{DAY_LABELS[day]}</div>
                                        <div style={{ fontSize: '0.8em', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                                            {dateLabel}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="schedule-cell hours-header">Hrs</div>
                        </div>

                        {filteredEmployees.map(employee => (
                            <div key={employee.id} className="schedule-row">
                                <div className="schedule-cell employee-cell">
                                    <div className="avatar avatar-sm">{employee.avatar}</div>
                                    <div className="employee-info">
                                        <span className="employee-name">{employee.name}</span>
                                        <span className="employee-position">{employee.position}</span>
                                    </div>
                                </div>

                                {DAYS_OF_WEEK.map(day => {
                                    const shift = getShift(employee.id, day);
                                    const isEditing = editingShift?.employeeId === employee.id && editingShift?.day === day;

                                    return (
                                        <div
                                            key={day}
                                            className={`schedule-cell shift-cell ${shift ? 'has-shift' : 'no-shift'}`}
                                            onClick={() => toggleShift(employee.id, day)}
                                            onDoubleClick={() => handleDoubleClick(employee.id, day)}
                                        >
                                            {shift ? (
                                                isEditing ? (
                                                    <div className="shift-editor" onClick={e => e.stopPropagation()}>
                                                        <div className="shift-times">
                                                            <select value={shift.start} onChange={(e) => updateShift(employee.id, day, 'start', e.target.value)}>
                                                                {timeOptions.map(t => <option key={t} value={t}>{timeToLabel(t)}</option>)}
                                                            </select>
                                                            <span>-</span>
                                                            <select value={shift.end} onChange={(e) => updateShift(employee.id, day, 'end', e.target.value)}>
                                                                {timeOptions.map(t => <option key={t} value={t}>{timeToLabel(t)}</option>)}
                                                            </select>
                                                        </div>
                                                        <select
                                                            className="role-select-mini"
                                                            value={shift.role}
                                                            onChange={(e) => updateShift(employee.id, day, 'role', e.target.value)}
                                                        >
                                                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                                        </select>
                                                        <button className="btn-sm btn-success" onClick={(e) => { e.stopPropagation(); setEditingShift(null); }}>✓ Done</button>
                                                    </div>
                                                ) : (
                                                    <div className="shift-display">
                                                        <span className="shift-time-display">{formatTime(shift.start)}-{formatTime(shift.end)}</span>
                                                        <span className="shift-role-display">{shift.role}</span>
                                                    </div>
                                                )
                                            ) : (
                                                <div className="empty-cell">
                                                    <span>OFF</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                <div className="schedule-cell hours-cell">
                                    <span className={`hours-badge ${getEmployeeHours(employee.id) > (employee.maxHoursPerWeek || 40) ? 'overtime' : ''}`}>
                                        {getEmployeeHours(employee.id).toFixed(1)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="schedule-legend">
                    <div className="legend-item"><span className="legend-dot scheduled"></span> Scheduled (click to remove)</div>
                    <div className="legend-item"><span className="legend-dot off"></span> Off (click to add)</div>
                    <div className="legend-item">💡 Double-click to edit times</div>
                </div>
            </Card>

            {/* Timeline View Modal */}
            {showCalendarView && (
                <div className="modal-overlay" onClick={() => setShowCalendarView(false)}>
                    <div className="modal-content timeline-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>📊 Daily Timeline</h2>
                            <button className="modal-close" onClick={() => setShowCalendarView(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            {shifts.length === 0 ? (
                                <div className="empty-state">
                                    <p>No shifts scheduled. Add shifts first!</p>
                                </div>
                            ) : (
                                <div className="timeline-days">
                                    {DAYS_OF_WEEK.map(day => {
                                        const dayShifts = shifts.filter(s => s.day === day);
                                        if (dayShifts.length === 0) return null;

                                        const minTime = Math.min(...dayShifts.map(s => timeToMinutes(s.start)));
                                        const maxTime = Math.max(...dayShifts.map(s => timeToMinutes(s.end)));
                                        const timeRange = maxTime - minTime || 1;

                                        return (
                                            <div key={day} className="timeline-day">
                                                <div className="timeline-day-label">{DAY_LABELS[day]}</div>
                                                <div className="timeline-content">
                                                    <div className="timeline-axis">
                                                        <span>{formatTime(`${Math.floor(minTime / 60).toString().padStart(2, '0')}:00`)}</span>
                                                        <span>{formatTime(`${Math.floor(maxTime / 60).toString().padStart(2, '0')}:00`)}</span>
                                                    </div>
                                                    <div className="timeline-bars">
                                                        {dayShifts.map((shift, idx) => {
                                                            const emp = allEmployees.find(e => e.id === shift.employeeId);
                                                            const startPct = ((timeToMinutes(shift.start) - minTime) / timeRange) * 100;
                                                            const widthPct = ((timeToMinutes(shift.end) - timeToMinutes(shift.start)) / timeRange) * 100;

                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    className="timeline-bar"
                                                                    style={{ left: `${startPct}%`, width: `${Math.max(widthPct, 10)}%` }}
                                                                    title={`${emp?.name}: ${shift.start}-${shift.end}`}
                                                                >
                                                                    <span className="bar-name">{emp?.name?.split(' ')[0]}</span>
                                                                    <span className="bar-role">{shift.role}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ScheduleBuilder;
