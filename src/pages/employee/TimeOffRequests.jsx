import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { TIME_OFF_TYPES, formatDate, formatDateFull, addDays } from '../../data/mockData';
import { schedulesAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import './TimeOffRequests.css';

function TimeOffRequests() {
    const { user } = useAuth();
    const { getTimeOffRequests, createTimeOffRequest } = useData();

    const requests = getTimeOffRequests(user.id);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        startDate: '',
        endDate: '',
        type: 'personal',
        reason: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [publishedWeeks, setPublishedWeeks] = useState([]);
    const [dateWarning, setDateWarning] = useState('');

    useEffect(() => {
        // Load published weeks for validation
        const loadPublishedWeeks = async () => {
            try {
                const response = await schedulesAPI.getPublishedWeeks('store-001');
                if (response.success) {
                    setPublishedWeeks(response.weekStarts);
                }
            } catch (error) {
                console.error('Failed to load published weeks:', error);
            }
        };
        loadPublishedWeeks();
    }, []);

    // Validate if date falls within any published week
    const isDateInPublishedSchedule = (dateStr) => {
        if (!dateStr || publishedWeeks.length === 0) return true; // No validation if no published weeks

        return publishedWeeks.some(weekStart => {
            const start = new Date(weekStart);
            const end = new Date(addDays(weekStart, 6));
            const checkDate = new Date(dateStr);
            return checkDate >= start && checkDate <= end;
        });
    };

    // Check dates when they change
    useEffect(() => {
        if (formData.startDate && formData.endDate && publishedWeeks.length > 0) {
            const startValid = isDateInPublishedSchedule(formData.startDate);
            const endValid = isDateInPublishedSchedule(formData.endDate);

            if (!startValid || !endValid) {
                setDateWarning('⚠️ Selected dates are not within a published schedule. Your manager may not be able to see your scheduled shifts for this period.');
            } else {
                setDateWarning('');
            }
        } else {
            setDateWarning('');
        }
    }, [formData.startDate, formData.endDate, publishedWeeks]);

    const pendingRequests = requests.filter(r => r.status === 'pending');
    const pastRequests = requests.filter(r => r.status !== 'pending');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        await new Promise(resolve => setTimeout(resolve, 500));

        createTimeOffRequest({
            employeeId: user.id,
            ...formData
        });

        setFormData({ startDate: '', endDate: '', type: 'personal', reason: '' });
        setShowModal(false);
        setSubmitting(false);
        setDateWarning('');
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
                                    <div className="request-card-footer">
                                        <span className="request-submitted">
                                            Submitted {formatDate(request.createdAt)}
                                        </span>
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
                        <label className="form-label">Start Date</label>
                        <input
                            type="date"
                            className="form-input"
                            value={formData.startDate}
                            onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">End Date</label>
                        <input
                            type="date"
                            className="form-input"
                            value={formData.endDate}
                            onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                            min={formData.startDate}
                            required
                        />
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

                    {dateWarning && (
                        <div className="form-warning">
                            {dateWarning}
                        </div>
                    )}

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
