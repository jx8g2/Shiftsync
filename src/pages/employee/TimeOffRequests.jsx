import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useSocketEvent } from '../../context/SocketContext';
import { TIME_OFF_TYPES, formatDate, DAYS_OF_WEEK, addDays } from '../../data/mockData';
import { requestsAPI, schedulesAPI, swapRequestsAPI, employeesAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import './TimeOffRequests.css';

const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
};

// ─── Time-off request form ─────────────────────────────────────────────────
function TimeOffForm({ user, onClose, onSubmit, publishedWeeks, existingRequests }) {
    const [form, setForm] = useState({
        requestedDate: '',
        requestScope: 'full_day',
        partialStartTime: '09:00',
        partialEndTime: '17:00',
        type: 'personal',
        reason: ''
    });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [defaultShiftNote, setDefaultShiftNote] = useState(null);
    const [isDefaultDayOff, setIsDefaultDayOff] = useState(false);

    // Watch for date changes to update default shift info
    useEffect(() => {
        if (form.requestedDate && user?.defaultShifts) {
            const d = new Date(form.requestedDate + 'T00:00:00');
            const day = d.getDay();
            const index = day === 0 ? 6 : day - 1; // 0=Sun->6, 1=Mon->0
            const dayName = DAYS_OF_WEEK[index];

            const shift = user.defaultShifts.find(s => s.dayOfWeek.toLowerCase() === dayName);

            if (shift) {
                if (shift.isOff) {
                    setIsDefaultDayOff(true);
                    setDefaultShiftNote("You have no default shift scheduled for this day (Day Off).");
                } else {
                    setIsDefaultDayOff(false);
                    setDefaultShiftNote(`Your default shift is ${formatTime(shift.startTime)} – ${formatTime(shift.endTime)}. Please select the portion you need off.`);
                    setForm(prev => ({
                        ...prev,
                        partialStartTime: shift.startTime,
                        partialEndTime: shift.endTime,
                        defaultStartTime: shift.startTime,
                        defaultEndTime: shift.endTime
                    }));
                }
            } else {
                setIsDefaultDayOff(false);
                setDefaultShiftNote(null);
                setForm(prev => ({ ...prev, defaultStartTime: null, defaultEndTime: null }));
            }
        } else {
            setIsDefaultDayOff(false);
            setDefaultShiftNote(null);
            setForm(prev => ({ ...prev, defaultStartTime: null, defaultEndTime: null }));
        }
    }, [form.requestedDate, user]);

    const isPublishedWeek = useMemo(() => {
        if (!form.requestedDate) return false;
        const d = new Date(form.requestedDate + 'T00:00:00');
        const day = d.getDay();
        const offset = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + offset);
        const weekStart = d.toISOString().split('T')[0];
        return publishedWeeks.includes(weekStart);
    }, [form.requestedDate, publishedWeeks]);

    // Generate valid time options based on the shift boundaries
    const { startOptions, endOptions } = useMemo(() => {
        if (!form.defaultStartTime || !form.defaultEndTime) return { startOptions: [], endOptions: [] };

        const startH = parseInt(form.defaultStartTime.split(':')[0]);
        const startM = parseInt(form.defaultStartTime.split(':')[1]);
        const endH = parseInt(form.defaultEndTime.split(':')[0]);
        const endM = parseInt(form.defaultEndTime.split(':')[1]);

        const startTotalMins = startH * 60 + startM;
        const endTotalMins = endH * 60 + endM;

        let options = [];
        // Generate options in 30-min increments between shift start and end
        for (let m = startTotalMins; m <= endTotalMins; m += 30) {
            const hh = String(Math.floor(m / 60)).padStart(2, '0');
            const mm = String(m % 60).padStart(2, '0');
            options.push(`${hh}:${mm}`);
        }

        // Add exact end time if not falling on a 30-min boundary
        if (!options.includes(form.defaultEndTime)) {
            options.push(form.defaultEndTime);
        }

        // Sort options
        options.sort((a, b) => a.localeCompare(b));

        // If the left boundary is NOT the default start time, the right boundary MUST be the default end time.
        // If the right boundary is NOT the default end time, the left boundary MUST be the default start time.

        let validStarts = [];
        let validEnds = [];

        // If end time is firmly at the end of the shift, start time can be anything before it.
        if (form.partialEndTime === form.defaultEndTime) {
            validStarts = options.filter(o => o < form.partialEndTime);
        } else {
            // Otherwise, start time MUST be the shift start.
            validStarts = [form.defaultStartTime];
        }

        // If start time is firmly at the start of the shift, end time can be anything after it.
        if (form.partialStartTime === form.defaultStartTime) {
            validEnds = options.filter(o => o > form.partialStartTime);
        } else {
            // Otherwise, end time MUST be the shift end.
            validEnds = [form.defaultEndTime];
        }

        return { startOptions: validStarts, endOptions: validEnds };

    }, [form.defaultStartTime, form.defaultEndTime, form.partialStartTime, form.partialEndTime]);

    // Check if a non-denied request already exists for the chosen date
    const duplicateRequest = useMemo(() => {
        if (!form.requestedDate || !existingRequests?.length) return null;
        return existingRequests.find(
            r => r.status !== 'denied' && (r.requestedDate || r.startDate) === form.requestedDate
        ) || null;
    }, [form.requestedDate, existingRequests]);

    const blocked = isPublishedWeek || !!duplicateRequest || isDefaultDayOff;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!form.requestedDate) { setError('Please select a date.'); return; }
        if (isPublishedWeek) {
            setError('That week\'s schedule is already published. Use the Shift Swap tab instead.');
            return;
        }
        if (isDefaultDayOff) {
            setError('You are already scheduled off on this day.');
            return;
        }
        if (duplicateRequest) {
            setError(`You already have a ${duplicateRequest.requestScope === 'partial' ? 'partial' : 'full-day'} request for this date.`);
            return;
        }

        if (form.requestScope === 'partial') {
            if (form.defaultStartTime && form.defaultEndTime) {
                if (form.partialStartTime !== form.defaultStartTime && form.partialEndTime !== form.defaultEndTime) {
                    setError('Partial time off must either begin exactly at the start of your shift or finish exactly at the end of your shift.');
                    return;
                }
            }
        }

        if (!form.reason.trim()) { setError('Please provide a reason.'); return; }

        setSubmitting(true);
        try {
            await onSubmit(form);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            {error && <div className="error-banner mb-md"><span>⚠️</span>{error}</div>}

            <div className="form-group">
                <label className="form-label">Date Requested *</label>
                <input
                    type="date"
                    className="form-input"
                    value={form.requestedDate}
                    onChange={e => setForm(p => ({ ...p, requestedDate: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    required
                />
                {isPublishedWeek && (
                    <p className="form-hint text-warning mt-sm">
                        ⚠️ This week's schedule is already published. You must use a Shift Cover instead.
                    </p>
                )}
                {isDefaultDayOff && (
                    <p className="form-hint text-warning mt-sm">
                        ⚠️ You are already scheduled off on this day.
                    </p>
                )}
                {duplicateRequest && (
                    <p className="form-hint text-warning mt-sm">
                        ⚠️ You already have a <strong>{duplicateRequest.requestScope === 'partial' ? 'partial' : 'full-day'}</strong> request for this date. Only one request is allowed per day.
                    </p>
                )}
            </div>

            <div className="form-group">
                <label className="form-label">Scope *</label>
                <div className="radio-group">
                    <label className="radio-label">
                        <input type="radio" name="scope" value="full_day"
                            checked={form.requestScope === 'full_day'}
                            onChange={() => setForm(p => ({ ...p, requestScope: 'full_day' }))} />
                        <span className="ml-sm">Full Day Off</span>
                    </label>
                    <label className="radio-label">
                        <input type="radio" name="scope" value="partial"
                            checked={form.requestScope === 'partial'}
                            onChange={() => setForm(p => ({ ...p, requestScope: 'partial' }))} />
                        <span className="ml-sm">Partial (specific time window)</span>
                    </label>
                </div>
            </div>

            {form.requestScope === 'partial' && (
                <div className="form-row" style={{ flexDirection: 'column' }}>
                    {defaultShiftNote && (
                        <div className={`form-hint mb-md ${defaultShiftNote.includes('Day Off') ? 'text-warning' : 'text-primary'}`} style={{ width: '100%', marginBottom: '12px' }}>
                            ℹ️ {defaultShiftNote}
                        </div>
                    )}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Start Time</label>
                            {form.defaultStartTime ? (
                                <select className="form-input"
                                    value={form.partialStartTime}
                                    onChange={e => {
                                        const newStart = e.target.value;
                                        setForm(p => {
                                            const updates = { partialStartTime: newStart };
                                            // If moving start time away from shift start, force end time to shift end
                                            if (newStart !== p.defaultStartTime) {
                                                updates.partialEndTime = p.defaultEndTime;
                                            }
                                            return { ...p, ...updates };
                                        });
                                    }}>
                                    {startOptions.map(time => (
                                        <option key={`start-${time}`} value={time}>
                                            {formatTime(time)} {time === form.defaultStartTime ? '(Shift Start)' : ''}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input type="time" className="form-input"
                                    value={form.partialStartTime}
                                    onChange={e => setForm(p => ({ ...p, partialStartTime: e.target.value }))} />
                            )}
                        </div>
                        <div className="form-group">
                            <label className="form-label">End Time</label>
                            {form.defaultEndTime ? (
                                <select className="form-input"
                                    value={form.partialEndTime}
                                    onChange={e => {
                                        const newEnd = e.target.value;
                                        setForm(p => {
                                            const updates = { partialEndTime: newEnd };
                                            // If moving end time away from shift end, force start time to shift start
                                            if (newEnd !== p.defaultEndTime) {
                                                updates.partialStartTime = p.defaultStartTime;
                                            }
                                            return { ...p, ...updates };
                                        });
                                    }}>
                                    {endOptions.map(time => (
                                        <option key={`end-${time}`} value={time}>
                                            {formatTime(time)} {time === form.defaultEndTime ? '(Shift End)' : ''}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input type="time" className="form-input"
                                    value={form.partialEndTime}
                                    onChange={e => setForm(p => ({ ...p, partialEndTime: e.target.value }))} />
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input" value={form.type}
                    onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    {TIME_OFF_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">Reason *</label>
                <textarea className="form-input" rows={3}
                    value={form.reason} required
                    placeholder="Brief description of your time off request..."
                    onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>

            <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting || blocked}>
                    {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
            </div>
        </form>
    );
}

// ─── Shift Swap form ───────────────────────────────────────────────────────
function SwapForm({ onClose, onSubmit, publishedShifts, storeEmployees, userId, userPosition }) {
    const [form, setForm] = useState({ shiftId: '', partnerId: '', reason: '' });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [eligiblePartners, setEligiblePartners] = useState([]);
    const [loadingPartners, setLoadingPartners] = useState(false);

    // Watch shift selection to fetch eligible partners from backend
    useEffect(() => {
        if (!form.shiftId) {
            setEligiblePartners([]);
            setForm(prev => ({ ...prev, partnerId: '' }));
            return;
        }

        setLoadingPartners(true);
        swapRequestsAPI.getEligiblePartnersForShift(form.shiftId)
            .then(res => {
                if (res?.success) {
                    setEligiblePartners(res.eligiblePartners || []);
                } else {
                    setEligiblePartners([]);
                }
                // Reset selected partner if they are no longer in the list
                setForm(prev => {
                    const stillEligible = (res.eligiblePartners || []).some(p => p.id === Number(prev.partnerId));
                    return { ...prev, partnerId: stillEligible ? prev.partnerId : '' };
                });
            })
            .catch(err => {
                console.error('Failed to fetch partners for shift:', err);
                setEligiblePartners([]);
            })
            .finally(() => setLoadingPartners(false));
    }, [form.shiftId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!form.shiftId) { setError('Please select a shift.'); return; }

        setSubmitting(true);
        try {
            await onSubmit(form);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            {error && <div className="error-banner mb-md"><span>⚠️</span>{error}</div>}
            <p className="text-muted mb-md" style={{ fontSize: '0.9rem' }}>
                Select a published shift you want to give away. You may suggest a cover partner — the manager makes the final decision.
            </p>

            <div className="form-group">
                <label className="form-label">Your Shift to Cover *</label>
                {publishedShifts.length > 0 ? (
                    <select className="form-input" value={form.shiftId} required
                        onChange={e => setForm(p => ({ ...p, shiftId: e.target.value }))}>
                        <option value="">Select a shift...</option>
                        {publishedShifts.map(shift => {
                            const normalizedDay = String(shift.day || '').toLowerCase();
                            const dayIndex = DAYS_OF_WEEK.indexOf(normalizedDay);
                            const dateStr = shift.shiftDate || addDays(shift.weekStart, dayIndex >= 0 ? dayIndex : 0);
                            return (
                                <option key={shift.id} value={shift.id}>
                                    {formatDate(dateStr)} ({shift.day}) · {formatTime(shift.start)}–{formatTime(shift.end)} · {shift.role}
                                </option>
                            );
                        })}
                    </select>
                ) : (
                    <div className="empty-state-small p-md border rounded text-muted">
                        You have no upcoming published shifts available to give away.
                    </div>
                )}
            </div>

            <div className="form-group">
                <label className="form-label">Suggested Cover Partner <span className="text-muted">(Optional)</span></label>
                <select className="form-input" value={form.partnerId} disabled={loadingPartners}
                    onChange={e => setForm(p => ({ ...p, partnerId: e.target.value }))}>
                    <option value="">{loadingPartners ? 'Loading partners...' : 'No preference — let manager decide'}</option>
                    {!loadingPartners && eligiblePartners.map(e => (
                        <option key={e.id} value={e.id}>{e.name} ({e.position})</option>
                    ))}
                </select>
                <p className="form-hint text-muted">Only employees of the same department are shown.</p>
            </div>

            <div className="form-group">
                <label className="form-label">Reason <span className="text-muted">(Optional)</span></label>
                <textarea className="form-input" rows={2}
                    value={form.reason}
                    placeholder="Why do you need to give up your shift?"
                    onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>

            <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting || !publishedShifts.length}>
                    {submitting ? 'Submitting...' : 'Submit Cover Request'}
                </button>
            </div>
        </form>
    );
}

// ─── Status badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const map = { pending: 'badge-warning', approved: 'badge-success', denied: 'badge-danger' };
    return <span className={`badge ${map[status] || 'badge-secondary'}`}>{status}</span>;
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function TimeOffRequests() {
    const { user } = useAuth();
    const { getTimeOffRequests, createTimeOffRequest, cancelTimeOffRequest } = useData();

    const [activeTab, setActiveTab] = useState('timeoff');
    const [showModal, setShowModal] = useState(false);

    // Time-off state
    const requests = getTimeOffRequests(user.id);
    const [publishedWeeks, setPublishedWeeks] = useState([]);

    // Swap state
    const [swapRequests, setSwapRequests] = useState([]);
    const [publishedShifts, setPublishedShifts] = useState([]);
    const [storeEmployees, setStoreEmployees] = useState([]);
    const [loadingSwaps, setLoadingSwaps] = useState(true);

    const storeId = user.storeId || user.store_id || null;

    const fetchPublishedWeeks = useCallback(() => {
        if (!storeId) {
            setPublishedWeeks([]);
            return;
        }
        schedulesAPI.getPublishedWeeks(storeId).then(r => {
            if (r?.success) setPublishedWeeks(r.weekStarts || []);
        }).catch(() => { });
    }, [storeId]);

    const fetchSwapData = useCallback(() => {
        if (activeTab !== 'swap') return;
        setLoadingSwaps(true);
        Promise.all([
            swapRequestsAPI.getAll({ employeeId: user.id }),
            schedulesAPI.getEmployeePublishedShifts(storeId, user.id),
            employeesAPI.getAll(storeId)
        ]).then(([swapsRes, shiftsRes, empsRes]) => {
            if (swapsRes?.success) setSwapRequests(swapsRes.swapRequests || []);
            if (shiftsRes?.success) {
                setPublishedShifts((shiftsRes.shifts || []).sort((a, b) => {
                    const aDay = String(a.day || '').toLowerCase();
                    const bDay = String(b.day || '').toLowerCase();
                    const aIndex = DAYS_OF_WEEK.indexOf(aDay);
                    const bIndex = DAYS_OF_WEEK.indexOf(bDay);
                    const da = a.shiftDate || addDays(a.weekStart, aIndex >= 0 ? aIndex : 0);
                    const db = b.shiftDate || addDays(b.weekStart, bIndex >= 0 ? bIndex : 0);
                    if (da !== db) return da.localeCompare(db);
                    return String(a.start || '').localeCompare(String(b.start || ''));
                }));
            }
            if (empsRes?.success) {
                setStoreEmployees((empsRes.employees || []).map(e => ({
                    id: e.id, name: e.name, position: e.position,
                    positionCategory: e.positionCategory || 'FOH',
                    role: e.role
                })));
            }
        }).catch(console.error).finally(() => setLoadingSwaps(false));
    }, [activeTab, user.id, storeId]);

    // Load published weeks (for blocking time-off form)
    useEffect(() => {
        fetchPublishedWeeks();
    }, [fetchPublishedWeeks]);

    // Load swap-related data when on swap tab
    useEffect(() => {
        fetchSwapData();
    }, [fetchSwapData]);

    // Listen to websocket events to real-time refresh schedule statuses
    useSocketEvent('data_refresh', () => {
        fetchPublishedWeeks();
        if (activeTab === 'swap') {
            fetchSwapData();
        }
    });

    const handleTimeOffSubmit = async (form) => {
        await createTimeOffRequest({
            employeeId: user.id,
            startDate: form.requestedDate,
            endDate: form.requestedDate,
            requestedDate: form.requestedDate,
            requestScope: form.requestScope,
            partialStartTime: form.requestScope === 'partial' ? form.partialStartTime : null,
            partialEndTime: form.requestScope === 'partial' ? form.partialEndTime : null,
            type: form.type,
            reason: form.reason
        });
    };

    const handleSwapSubmit = async (form) => {
        const result = await swapRequestsAPI.create({
            requesterId: user.id,
            requesterShiftId: parseInt(form.shiftId),
            proposedPartnerId: form.partnerId ? parseInt(form.partnerId) : null,
            reason: form.reason || null
        });
        if (!result.success) throw new Error(result.error || 'Failed to submit swap');
        setSwapRequests(prev => [result.swapRequest, ...prev]);
    };

    const handleCancelSwap = async (id) => {
        if (!window.confirm('Cancel this shift cover request?')) return;
        try {
            const res = await swapRequestsAPI.delete(id);
            if (res.success) {
                setSwapRequests(prev => prev.filter(s => s.id !== id));
            }
        } catch (err) {
            alert('Failed to cancel swap request: ' + err.message);
        }
    };

    const handleSwapResponse = async (id, action) => {
        if (!window.confirm(`Are you sure you want to ${action === 'accepted' ? 'accept' : 'decline'} this shift cover?`)) return;
        try {
            const res = await swapRequestsAPI.respond(id, action);
            if (res.success) {
                fetchSwapData(); // refresh to show updated state
            }
        } catch (err) {
            alert('Failed to respond to swap request: ' + err.message);
        }
    };

    const handleCancelRequest = async (id) => {
        if (!window.confirm('Cancel this request?')) return;
        await cancelTimeOffRequest(id);
    };

    const pendingRequests = requests.filter(r => r.status === 'pending');
    const pastRequests = requests.filter(r => r.status !== 'pending');
    const pendingSwaps = swapRequests.filter(s => s.status === 'pending');
    const pastSwaps = swapRequests.filter(s => s.status !== 'pending');

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header flex justify-between items-center">
                <div>
                    <h1 className="page-title">Time Off & Swaps</h1>
                    <p className="page-subtitle">Request time off before schedule is published, or offer a shift to cover after</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    + {activeTab === 'timeoff' ? 'New Request' : 'New Cover'}
                </button>
            </div>

            {/* Tabs */}
            <div className="filter-tabs mb-lg">
                <button className={`filter-tab ${activeTab === 'timeoff' ? 'active' : ''}`}
                    onClick={() => setActiveTab('timeoff')}>
                    📝 Time-Off Requests
                    {pendingRequests.length > 0 && <span className="tab-badge">{pendingRequests.length}</span>}
                </button>
                <button className={`filter-tab ${activeTab === 'swap' ? 'active' : ''}`}
                    onClick={() => setActiveTab('swap')}>
                    🔄 Shift Covers
                    {pendingSwaps.length > 0 && <span className="tab-badge">{pendingSwaps.length}</span>}
                </button>
            </div>

            {/* ── TIME-OFF TAB ─────────────────────────────────────────── */}
            {activeTab === 'timeoff' && (
                <>
                    <div className="grid grid-cols-3 mb-lg">
                        <Card.Stat icon="⏳" iconColor="primary" value={pendingRequests.length} label="Pending" />
                        <Card.Stat icon="✅" iconColor="success" value={pastRequests.filter(r => r.status === 'approved').length} label="Approved" />
                        <Card.Stat icon="❌" iconColor="danger" value={pastRequests.filter(r => r.status === 'denied').length} label="Denied" />
                    </div>

                    <div className="info-banner mb-lg">
                        <span>ℹ️</span>
                        <span>Time-off requests can only be submitted <strong>before</strong> the schedule for that week is published. Once published, use a <strong>Shift Cover</strong> instead.</span>
                    </div>

                    <Card className="mb-lg">
                        <Card.Header><h3 className="card-title">⏳ Pending Requests</h3></Card.Header>
                        <Card.Body>
                            {pendingRequests.length === 0
                                ? <div className="empty-state-small"><p>No pending requests</p></div>
                                : <div className="request-cards">
                                    {pendingRequests.map(r => (
                                        <div key={r.id} className="request-card pending">
                                            <div className="request-card-header">
                                                <span className="request-type">
                                                    {r.requestScope === 'partial' ? '🕐 Partial' : '📅 Full Day'}
                                                </span>
                                                <StatusBadge status={r.status} />
                                            </div>
                                            <div className="request-card-dates">
                                                <span className="date-icon">📅</span>
                                                <span>
                                                    {formatDate(r.requestedDate || r.startDate)}
                                                    {r.requestScope === 'partial' && r.partialStartTime && (
                                                        <span className="text-muted ml-sm">
                                                            · {formatTime(r.partialStartTime)}–{formatTime(r.partialEndTime)}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                            <p className="request-card-reason">{r.reason}</p>
                                            <div className="request-card-footer flex justify-between items-center">
                                                <span className="request-submitted">Submitted {formatDate(r.createdAt)}</span>
                                                <button className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleCancelRequest(r.id)}>Cancel</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            }
                        </Card.Body>
                    </Card>

                    <Card>
                        <Card.Header><h3 className="card-title">📋 Request History</h3></Card.Header>
                        <Card.Body>
                            {pastRequests.length === 0
                                ? <div className="empty-state-small"><p>No past requests</p></div>
                                : <div className="request-cards">
                                    {pastRequests.map(r => (
                                        <div key={r.id} className={`request-card ${r.status}`}>
                                            <div className="request-card-header">
                                                <span className="request-type">
                                                    {r.requestScope === 'partial' ? '🕐 Partial' : '📅 Full Day'}
                                                </span>
                                                <StatusBadge status={r.status} />
                                            </div>
                                            <div className="request-card-dates">
                                                <span className="date-icon">📅</span>
                                                <span>
                                                    {formatDate(r.requestedDate || r.startDate)}
                                                    {r.requestScope === 'partial' && r.partialStartTime && (
                                                        <span className="text-muted ml-sm">
                                                            · {formatTime(r.partialStartTime)}–{formatTime(r.partialEndTime)}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                            <p className="request-card-reason">{r.reason}</p>
                                            {r.reviewNote && (
                                                <div className="request-card-note">
                                                    <span className="note-label">Manager Note:</span> {r.reviewNote}
                                                </div>
                                            )}
                                            <div className="request-card-footer">
                                                <span className="request-submitted">
                                                    {r.status === 'approved' ? 'Approved' : 'Denied'} on {formatDate(r.reviewedAt)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            }
                        </Card.Body>
                    </Card>
                </>
            )}

            {/* ── SWAP TAB ─────────────────────────────────────────────── */}
            {activeTab === 'swap' && (
                <>
                    <div className="grid grid-cols-3 mb-lg">
                        <Card.Stat icon="⏳" iconColor="primary" value={pendingSwaps.length} label="Pending" />
                        <Card.Stat icon="✅" iconColor="success" value={pastSwaps.filter(s => s.status === 'approved').length} label="Approved" />
                        <Card.Stat icon="❌" iconColor="danger" value={pastSwaps.filter(s => s.status === 'denied').length} label="Denied" />
                    </div>

                    <div className="info-banner mb-lg">
                        <span>ℹ️</span>
                        <span>After a schedule is published, request a shift cover with a same-department coworker. The manager approves the final cover.</span>
                    </div>

                    {loadingSwaps
                        ? <div className="loading-container"><div className="spinner"></div><p>Loading swaps...</p></div>
                        : <>
                            <Card className="mb-lg">
                                <Card.Header><h3 className="card-title">⏳ Pending Swaps</h3></Card.Header>
                                <Card.Body>
                                    {pendingSwaps.length === 0
                                        ? <div className="empty-state-small"><p>No pending swap requests</p></div>
                                        : <div className="request-cards">
                                            {pendingSwaps.map(s => (
                                                <div key={s.id} className="request-card pending">
                                                    <div className="request-card-header">
                                                        <span className="request-type">🔄 Shift Cover</span>
                                                        <StatusBadge status={s.status} />
                                                    </div>
                                                    <div className="request-card-dates">
                                                        <span className="date-icon">📅</span>
                                                        <span>
                                                            {s.shiftDay} · {formatTime(s.shiftStart)}–{formatTime(s.shiftEnd)} · {s.shiftRole}
                                                        </span>
                                                    </div>
                                                    <div className="request-card-initiator mb-xs">
                                                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                                            Requested by: <strong>{s.requesterId === user.id ? 'You' : s.requesterName}</strong>
                                                        </span>
                                                    </div>
                                                    {s.proposedPartnerName ? (
                                                        <p className="request-card-reason">
                                                            Suggested partner: <strong>{s.proposedPartnerName}</strong>
                                                            {s.proposedPartnerId === user.id && s.partnerStatus === 'pending' && (
                                                                <span className="badge badge-warning ml-sm">Needs your response</span>
                                                            )}
                                                            {s.partnerStatus && s.partnerStatus !== 'pending' && (
                                                                <span className="badge badge-secondary ml-sm">Partner {s.partnerStatus}</span>
                                                            )}
                                                        </p>
                                                    ) : (
                                                        <p className="request-card-reason">
                                                            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                                                Open to any eligible partner, awaiting manager.
                                                            </span>
                                                        </p>
                                                    )}
                                                    {s.reason && <p className="request-card-reason">{s.reason}</p>}
                                                    <div className="request-card-footer flex justify-between items-center">
                                                        <span className="request-submitted">Submitted {formatDate(s.createdAt)}</span>
                                                        <div className="flex gap-sm">
                                                            {s.proposedPartnerId === user.id && s.partnerStatus === 'pending' && (
                                                                <>
                                                                    <button className="btn btn-sm btn-outline-danger"
                                                                        onClick={() => handleSwapResponse(s.id, 'declined')}>Decline</button>
                                                                    <button className="btn btn-sm btn-primary"
                                                                        onClick={() => handleSwapResponse(s.id, 'accepted')}>Accept</button>
                                                                </>
                                                            )}
                                                            {s.requesterId === user.id && (
                                                                <button className="btn btn-sm btn-outline-danger"
                                                                    onClick={() => handleCancelSwap(s.id)}>Cancel</button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    }
                                </Card.Body>
                            </Card>

                            <Card>
                                <Card.Header><h3 className="card-title">📋 Swap History</h3></Card.Header>
                                <Card.Body>
                                    {pastSwaps.length === 0
                                        ? <div className="empty-state-small"><p>No past swap requests</p></div>
                                        : <div className="request-cards">
                                            {pastSwaps.map(s => (
                                                <div key={s.id} className={`request-card ${s.status}`}>
                                                    <div className="request-card-header">
                                                        <span className="request-type">🔄 Shift Cover</span>
                                                        <StatusBadge status={s.status} />
                                                    </div>
                                                    <div className="request-card-dates">
                                                        <span className="date-icon">📅</span>
                                                        <span>{s.shiftDay} · {formatTime(s.shiftStart)}–{formatTime(s.shiftEnd)} · {s.shiftRole}</span>
                                                    </div>
                                                    <div className="request-card-initiator mb-xs">
                                                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                                            Requested by: <strong>{s.requesterId === user.id ? 'You' : s.requesterName}</strong>
                                                        </span>
                                                    </div>
                                                    {s.proposedPartnerName && (
                                                        <p className="request-card-reason">
                                                            {s.status === 'approved' ? 'Covered by' : 'Proposed partner'}: <strong>{s.proposedPartnerName}</strong>
                                                        </p>
                                                    )}
                                                    {s.reviewNote && (
                                                        <div className="request-card-note">
                                                            <span className="note-label">Manager Note:</span> {s.reviewNote}
                                                        </div>
                                                    )}
                                                    <div className="request-card-footer">
                                                        <span className="request-submitted">
                                                            {s.status === 'approved' ? 'Approved' : 'Denied'} on {formatDate(s.reviewedAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    }
                                </Card.Body>
                            </Card>
                        </>
                    }
                </>
            )}

            {/* ── Modal ──────────────────────────────────────────────────── */}
            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={activeTab === 'timeoff' ? '📝 Request Time Off' : '🔄 Request Shift Swap'}
                size="medium"
            >
                {activeTab === 'timeoff'
                    ? <TimeOffForm
                        user={user}
                        onClose={() => setShowModal(false)}
                        onSubmit={handleTimeOffSubmit}
                        publishedWeeks={publishedWeeks}
                        existingRequests={requests}
                    />
                    : <SwapForm
                        onClose={() => setShowModal(false)}
                        onSubmit={handleSwapSubmit}
                        publishedShifts={publishedShifts}
                        storeEmployees={storeEmployees}
                        userId={user.id}
                        userPosition={user.positionCategory || 'FOH'}
                    />
                }
            </Modal>
        </div >
    );
}
