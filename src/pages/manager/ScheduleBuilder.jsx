import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useStoreFilter } from '../../context/StoreFilterContext';
import { employeesAPI, requestsAPI } from '../../utils/api';
import { DAYS_OF_WEEK, DAY_LABELS, ROLES, POSITIONS, getWeekStart, addDays, formatDate } from '../../data/mockData';
import Card from '../../components/ui/Card';
import './ScheduleBuilder.css';

function ScheduleBuilder() {
    const { user } = useAuth();
    const { saveSchedule, getSchedules } = useData();
    const { effectiveStoreId, isAllStores } = useStoreFilter();

    const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
    const [shifts, setShifts] = useState([]);
    const [allEmployees, setAllEmployees] = useState([]); // Store all fetched employees
    const [isPublished, setIsPublished] = useState(false); // Track if current schedule is published
    const [isLocked, setIsLocked] = useState(false); // Track if schedule is locked for editing
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editingShift, setEditingShift] = useState(null);
    const [approvedTimeOffs, setApprovedTimeOffs] = useState([]); // approved pre-publish time-off for this week

    // Load existing schedule when weekStart changes
    useEffect(() => {
        const loadSchedule = () => {
            if (!effectiveStoreId) return;
            const savedSchedules = getSchedules(effectiveStoreId, weekStart);
            if (savedSchedules && savedSchedules.length > 0) {
                // Found a saved schedule for this week
                setShifts(savedSchedules[0].shifts);
                setIsPublished(savedSchedules[0].published);
                setIsLocked(savedSchedules[0].published); // Lock it by default if published
            } else {
                // No saved schedule
                setShifts([]);
                setIsPublished(false);
                setIsLocked(false);
            }
        };
        loadSchedule();
    }, [weekStart, effectiveStoreId, getSchedules]);

    useEffect(() => {
        fetchEmployees();
    }, [effectiveStoreId]);

    // Fetch approved time-off requests for the current week
    useEffect(() => {
        if (!effectiveStoreId) return;
        requestsAPI.getAll({ storeId: effectiveStoreId })
            .then(r => {
                if (r?.success) {
                    // Filter to only approved requests that fall in this week
                    const d0 = new Date(weekStart + 'T00:00:00');
                    const d6 = new Date(weekStart + 'T00:00:00');
                    d6.setDate(d6.getDate() + 6);
                    const relevant = (r.requests || []).filter(req => {
                        if (req.status !== 'approved') return false;
                        const dt = new Date((req.requestedDate || req.startDate) + 'T00:00:00');
                        return dt >= d0 && dt <= d6;
                    });
                    setApprovedTimeOffs(relevant);
                }
            })
            .catch(() => { });
    }, [weekStart, effectiveStoreId]);

    const fetchEmployees = async () => {
        if (!effectiveStoreId) return;
        try {
            const response = await employeesAPI.getAll(effectiveStoreId);
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
            const savedSchedules = getSchedules(effectiveStoreId, weekStart);
            if (!savedSchedules || savedSchedules.length === 0) {
                // If there's truly no saved schedule, fill from defaults quietly during initial load
                autoFillFromDefaults(true);
            }
        }
    }, [filteredEmployees, weekStart, shifts.length]); // Re-run when filtered list changes or week changes

    const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
    const handleNextWeek = () => setWeekStart(addDays(weekStart, 7));

    const getShift = (employeeId, day) => shifts.find(s => s.employeeId === employeeId && s.day === day);

    const addShift = (employeeId, day, start = '09:00', end = '17:00', role = '') => {
        if (isLocked) return;
        if (getShift(employeeId, day)) return;
        const emp = allEmployees.find(e => e.id === employeeId); // Look up in all employees just in case

        // Find default role, considering FOH/BOH constraints
        let defaultRole = role;
        if (!defaultRole) {
            const posObj = POSITIONS.find(p => p.value === emp?.position);
            if (posObj && posObj.category !== 'ALL') {
                const firstValidRole = ROLES.find(r => r.category === posObj.category);
                defaultRole = firstValidRole ? firstValidRole.value : '';
            } else {
                defaultRole = ROLES[0].value;
            }
        }

        setShifts(prev => [...prev, { employeeId, day, start, end, role: defaultRole }]);
    };

    const updateShift = (employeeId, day, field, value) => {
        if (isLocked) return;
        setShifts(prev => prev.map(s =>
            s.employeeId === employeeId && s.day === day ? { ...s, [field]: value } : s
        ));
    };

    const removeShift = (employeeId, day) => {
        if (isLocked) return;
        setShifts(prev => prev.filter(s => !(s.employeeId === employeeId && s.day === day)));
        setEditingShift(null);
    };

    const toggleShift = (employeeId, day) => {
        if (isLocked) return;
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
        if (isLocked) return;
        const shift = getShift(employeeId, day);
        if (shift) {
            setEditingShift({ employeeId, day });
        }
    };

    const autoFillFromDefaults = (silent = false) => {
        const newShifts = [];

        // Build a quick lookup: employeeId + dayOfWeek → approved time-off
        const timeOffByEmpDay = {};
        approvedTimeOffs.forEach(req => {
            const reqDate = new Date((req.requestedDate || req.startDate) + 'T00:00:00');
            // Find which day of week (0=Sun..6=Sat). DAYS_OF_WEEK is Mon-indexed.
            const jsDay = reqDate.getDay();
            const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][jsDay];
            const key = `${req.employeeId}_${dayName}`;
            timeOffByEmpDay[key] = req;
        });

        // ONLY use filteredEmployees for autofill
        filteredEmployees.forEach(employee => {
            if (employee.defaultShifts && Array.isArray(employee.defaultShifts)) {
                employee.defaultShifts.forEach(defaultShift => {
                    const day = defaultShift.dayOfWeek || defaultShift.day;
                    let start = defaultShift.startTime || defaultShift.start;
                    let end = defaultShift.endTime || defaultShift.end;
                    let role = defaultShift.primaryRole;
                    if (!role) {
                        const posObj = POSITIONS.find(p => p.value === employee.position);
                        if (posObj && posObj.category !== 'ALL') {
                            const firstValidRole = ROLES.find(r => r.category === posObj.category);
                            role = firstValidRole ? firstValidRole.value : '';
                        } else {
                            role = ROLES[0].value;
                        }
                    }

                    if (defaultShift.isOff || !start || !end) return;

                    // Check for approved time-off for this employee on this day
                    const key = `${employee.id}_${day}`;
                    const timeOff = timeOffByEmpDay[key];

                    if (timeOff) {
                        if (timeOff.requestScope === 'full_day') {
                            // Skip this day entirely
                            return;
                        } else if (timeOff.requestScope === 'partial' && timeOff.partialStartTime && timeOff.partialEndTime) {
                            // Trim shift to not overlap the partial off window
                            // If shift ends before partial off starts, keep it unchanged
                            // If shift starts after partial off ends, keep it unchanged
                            // Otherwise, clip: end the shift at partial off start, OR start after partial off end
                            const shiftStartM = timeToMinutes(start);
                            const shiftEndM = timeToMinutes(end);
                            const offStartM = timeToMinutes(timeOff.partialStartTime);
                            const offEndM = timeToMinutes(timeOff.partialEndTime);

                            if (shiftEndM <= offStartM || shiftStartM >= offEndM) {
                                // No overlap — include shift as is
                            } else if (shiftStartM < offStartM) {
                                // Shift starts before off period, trim end
                                end = minutesToTime(offStartM);
                                if (timeToMinutes(end) - shiftStartM < 30) return; // too short, skip
                            } else {
                                // Shift starts inside off period, push start
                                start = minutesToTime(offEndM);
                                if (timeToMinutes(end) - timeToMinutes(start) < 30) return; // too short, skip
                            }
                        }
                    }

                    newShifts.push({ employeeId: employee.id, day, start, end, role });
                });
            }
        });

        if (newShifts.length > 0) {
            setShifts(newShifts);
            if (!isLocked && !silent) {
                const skippedCount = approvedTimeOffs.length;
                const msg = skippedCount > 0
                    ? `Loaded ${newShifts.length} shifts (${skippedCount} time-off requests applied)`
                    : `Loaded ${newShifts.length} default shifts`;
                setMessage({ type: 'success', text: msg });
                setTimeout(() => setMessage(null), 4000);
            }
        }
    };

    const minutesToTime = (m) => {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };

    const clearAllShifts = () => {
        if (isLocked) return;
        setShifts([]);
        setMessage({ type: 'info', text: 'All shifts cleared' });
        setTimeout(() => setMessage(null), 3000);
    };

    const selectAllShifts = () => {
        if (isLocked) return;
        autoFillFromDefaults();
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const scheduleData = {
                storeId: effectiveStoreId,
                weekStart: weekStart,
                shifts: shifts,
                published: false // Saving doesn't publish
            };
            await saveSchedule(scheduleData);
            setMessage({ type: 'success', text: 'Schedule saved!' });
            setIsPublished(false); // Update local state
            setIsLocked(false);
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
                storeId: effectiveStoreId,
                weekStart: weekStart,
                shifts: shifts,
                published: true
            };
            await saveSchedule(scheduleData);
            setMessage({ type: 'success', text: 'Schedule published!' });
            setIsPublished(true); // Update local state
            setIsLocked(true); // Automatically lock upon publish
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

    if (isAllStores) {
        return (
            <div className="page-container animate-fade-in">
                <div className="empty-state">
                    <div className="empty-state-icon">🏪</div>
                    <h3 className="empty-state-title">Select a Store</h3>
                    <p>Please select a specific store from the header filter to build schedules.</p>
                </div>
            </div>
        );
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
                    <p className="page-subtitle">
                        {isLocked
                            ? "🔒 This schedule is locked to prevent accidental edits while tracking live time-off changes."
                            : "Click to toggle shifts • Double-click to edit times"}
                    </p>
                </div>
                <div className="flex gap-md flex-wrap">
                    {isLocked ? (
                        <button className="btn btn-warning" onClick={() => setIsLocked(false)}>
                            🔓 Unlock to Edit
                        </button>
                    ) : (
                        <>
                            <button className="btn btn-secondary" onClick={selectAllShifts}>
                                ✅ Select All
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
                        </>
                    )}
                </div>
            </div>

            {message && (
                <div className={`message message-${message.type} mb-lg`}>{message.text}</div>
            )}

            <Card>
                <div className="week-navigation">
                    <button className="btn btn-secondary btn-icon" onClick={handlePrevWeek}>←</button>
                    <div className="week-info flex items-center justify-center">
                        <span className="week-label">
                            {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
                        </span>
                        {isPublished && (
                            <span className={`status-badge ml-md ${isLocked ? 'status-danger' : 'status-active'}`}>
                                {isLocked ? '🔒 Locked (Published)' : 'Published (Unlocked)'}
                            </span>
                        )}
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
                                        <span className="employee-position">
                                            {POSITIONS.find(p => p.value === employee.position)?.label || employee.position}
                                        </span>
                                    </div>
                                </div>

                                {DAYS_OF_WEEK.map(day => {
                                    const shift = getShift(employee.id, day);
                                    const isEditing = editingShift?.employeeId === employee.id && editingShift?.day === day;

                                    return (
                                        <div
                                            key={day}
                                            className={`schedule-cell shift-cell ${shift ? 'has-shift' : 'no-shift'} ${isLocked ? 'locked-cell disabled' : ''}`}
                                            style={isLocked ? { cursor: 'not-allowed', opacity: 0.85 } : {}}
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
                                                            {ROLES.filter(r => {
                                                                const posObj = POSITIONS.find(p => p.value === employee.position);
                                                                if (!posObj || posObj.category === 'ALL') return true;
                                                                return r.category === posObj.category;
                                                            }).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
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
        </div>
    );
}

export default ScheduleBuilder;
