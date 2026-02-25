import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { TIME_OFF_TYPES, formatDate, formatDateFull, addDays, DAYS_OF_WEEK } from '../../data/mockData';
import { schedulesAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import './TimeOffRequests.css';

function TimeOffRequests() {
    const { user } = useAuth();
    const { getTimeOffRequests, createTimeOffRequest, cancelTimeOffRequest } = useData();

    const requests = getTimeOffRequests(user.id);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        shiftId: '',
        type: 'personal',
        reason: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [publishedShifts, setPublishedShifts] = useState([]);

    useEffect(() => {
        // Load published shifts for the current logged in employee
        const loadPublishedShifts = async () => {
            try {
                // Determine user's store ID
                const storeId = user.storeId || 'store-001';
                const response = await schedulesAPI.getEmployeePublishedShifts(storeId, user.id);
                if (response.success) {
                    const sortedShifts = (response.shifts || []).sort((a, b) => {
                        const dateA = addDays(a.weekStart, DAYS_OF_WEEK.indexOf(a.day));
                        const dateB = addDays(b.weekStart, DAYS_OF_WEEK.indexOf(b.day));
                        if (dateA === dateB) {
                            return a.start.localeCompare(b.start);
                        }
                        return new Date(dateA) - new Date(dateB);
                    });
                    setPublishedShifts(sortedShifts);
                }
            } catch (error) {
                console.error('Failed to load published shifts for time off:', error);
            }
        };
        loadPublishedShifts();
    }, [user.id, user.storeId]);

    const pendingRequests = requests.filter(r => r.status === 'pending');
    const pastRequests = requests.filter(r => r.status !== 'pending');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        const selectedShift = publishedShifts.find(s => s.id === parseInt(formData.shiftId));
        if (!selectedShift) {
            alert('Please select a valid scheduled shift');
            setSubmitting(false);
            return;
        }

        const dateStr = addDays(selectedShift.weekStart, DAYS_OF_WEEK.indexOf(selectedShift.day));

        try {
            await createTimeOffRequest({
                employeeId: user.id,
                startDate: dateStr,
                endDate: dateStr,
                shiftId: selectedShift.id,
                type: formData.type,
                reason: formData.reason
            });
            setFormData({ shiftId: '', type: 'personal', reason: '' });
            setShowModal(false);
        } catch (error) {
            console.error('Failed to submit request:', error);
            alert('Failed to submit request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this request?')) return;

        try {
            await cancelTimeOffRequest(id);
        } catch (error) {
            console.error('Failed to cancel request:', error);
            alert('Failed to cancel request. Please try again.');
        }
    };

    const getStatusBadge = (status) => {
        const classes = {
            pending: 'badge-warning',
            approved: 'badge-success',
            denied: 'badge-danger'
        };
        return <span className={`badge ${classes[status]}`}>{status}</span>;
    };

    const getTypeLabel = (type) => {
        return TIME_OFF_TYPES.find(t => t.value === type)?.label || type;
    };

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header flex justify-between items-center">
                <div>
                    <h1 className="page-title">Time Off Requests</h1>
                    <p className="page-subtitle">Request and track your time off</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    + New Request
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 mb-lg">
                <Card.Stat
                    icon="⏳"
                    iconColor="primary"
                    value={pendingRequests.length}
                    label="Pending"
                />
                <Card.Stat
                    icon="✅"
                    iconColor="success"
                    value={pastRequests.filter(r => r.status === 'approved').length}
                    label="Approved"
                />
                <Card.Stat
                    icon="❌"
                    iconColor="primary"
                    value={pastRequests.filter(r => r.status === 'denied').length}
                    label="Denied"
                />
            </div>

            {/* Pending Requests */}
            <Card className="mb-lg">
                <Card.Header>
                    <h3 className="card-title">⏳ Pending Requests</h3>
                </Card.Header>
                <Card.Body>
                    {pendingRequests.length === 0 ? (
                        <div className="empty-state-small">
                            <p>No pending requests</p>
                        </div>
                    ) : (
                        <div className="request-cards">
                            {pendingRequests.map(request => (
                                <div key={request.id} className="request-card pending">
                                    <div className="request-card-header">
                                        <span className="request-type">{getTypeLabel(request.type)}</span>
                                        {getStatusBadge(request.status)}
                                    </div>
                                    <div className="request-card-dates">
                                        <span className="date-icon">📅</span>
                                        <span>
                                            {formatDate(request.startDate)}
                                            {request.startDate !== request.endDate && ` → ${formatDate(request.endDate)}`}
                                        </span>
                                    </div>
                                    <p className="request-card-reason">{request.reason}</p>
                                    <div className="request-card-footer flex justify-between items-center">
                                        <span className="request-submitted">
                                            Submitted {formatDate(request.createdAt)}
                                        </span>
                                        <button
                                            className="btn btn-sm btn-outline-danger"
                                            onClick={() => handleCancel(request.id)}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card.Body>
            </Card>

            {/* Past Requests */}
            <Card>
                <Card.Header>
                    <h3 className="card-title">📋 Request History</h3>
                </Card.Header>
                <Card.Body>
                    {pastRequests.length === 0 ? (
                        <div className="empty-state-small">
                            <p>No past requests</p>
                        </div>
                    ) : (
                        <div className="request-cards">
                            {pastRequests.map(request => (
                                <div key={request.id} className={`request-card ${request.status}`}>
                                    <div className="request-card-header">
                                        <span className="request-type">{getTypeLabel(request.type)}</span>
                                        {getStatusBadge(request.status)}
                                    </div>
                                    <div className="request-card-dates">
                                        <span className="date-icon">📅</span>
                                        <span>
                                            {formatDate(request.startDate)}
                                            {request.startDate !== request.endDate && ` → ${formatDate(request.endDate)}`}
                                        </span>
                                    </div>
                                    <p className="request-card-reason">{request.reason}</p>
                                    {request.reviewNote && (
                                        <div className="request-card-note">
                                            <span className="note-label">Manager Note:</span>
                                            <span>{request.reviewNote}</span>
                                        </div>
                                    )}
                                    {request.replacementName && (
                                        <div className="request-card-note mt-sm" style={{ borderLeftColor: 'var(--success-color)' }}>
                                            <span className="note-label">Swapped to:</span>
                                            <span className="text-success fw-bold">{request.replacementName}</span>
                                        </div>
                                    )}
                                    <div className="request-card-footer">
                                        <span className="request-submitted">
                                            {request.status === 'approved' ? 'Approved' : 'Denied'} on {formatDate(request.reviewedAt)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card.Body>
            </Card>

            {/* New Request Modal */}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Request Time Off">
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Scheduled Shift</label>
                        {publishedShifts.length > 0 ? (
                            <select
                                className="form-select"
                                value={formData.shiftId}
                                onChange={(e) => setFormData(prev => ({ ...prev, shiftId: e.target.value }))}
                                required
                            >
                                <option value="" disabled>Select a shift</option>
                                {publishedShifts.map(shift => {
                                    const dateStr = addDays(shift.weekStart, DAYS_OF_WEEK.indexOf(shift.day));
                                    const formatTime = (time) => {
                                        const [h, m] = time.split(':');
                                        const hour = parseInt(h);
                                        const ampm = hour >= 12 ? 'PM' : 'AM';
                                        const hour12 = hour % 12 || 12;
                                        return `${hour12}:${m} ${ampm}`;
                                    };
                                    return (
                                        <option key={shift.id} value={shift.id}>
                                            {formatDate(dateStr)} ({shift.day.charAt(0).toUpperCase() + shift.day.slice(1)}) : {formatTime(shift.start)} - {formatTime(shift.end)} - {shift.role}
                                        </option>
                                    );
                                })}
                            </select>
                        ) : (
                            <div className="empty-state-small p-md border rounded text-muted">
                                You have no upcoming published shifts.
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-label">Type</label>
                        <select
                            className="form-select"
                            value={formData.type}
                            onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                        >
                            {TIME_OFF_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Reason</label>
                        <textarea
                            className="form-textarea"
                            value={formData.reason}
                            onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                            placeholder="Brief description of your time off request..."
                            required
                        />
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Submitting...' : 'Submit Request'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default TimeOffRequests;
