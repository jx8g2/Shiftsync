import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { formatDate, TIME_OFF_TYPES } from '../../data/mockData';
import { requestsAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import './RequestApprovals.css';

function RequestApprovals() {
    const { user } = useAuth();
    const { getTimeOffRequestsByStore, getEmployees, updateTimeOffRequest } = useData();

    const requests = getTimeOffRequestsByStore(user.storeId);
    const employees = getEmployees(user.storeId);

    const [selectedRequest, setSelectedRequest] = useState(null);
    const [filterStatus, setFilterStatus] = useState('pending');
    const [reviewNote, setReviewNote] = useState('');
    const [processing, setProcessing] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Replacement workflow state
    const [eligibleReplacements, setEligibleReplacements] = useState([]);
    const [selectedReplacement, setSelectedReplacement] = useState(null);
    const [showReplacementPanel, setShowReplacementPanel] = useState(false);
    const [notifyingReplacements, setNotifyingReplacements] = useState(false);
    const [assigningReplacement, setAssigningReplacement] = useState(false);

    const filteredRequests = filterStatus === 'all'
        ? requests
        : requests.filter(r => r.status === filterStatus);

    const getEmployee = (id) => employees.find(e => e.id === id);

    const getTypeLabel = (type) => {
        return TIME_OFF_TYPES.find(t => t.value === type)?.label || type;
    };

    // Load eligible replacements when viewing an approved request
    useEffect(() => {
        if (selectedRequest?.status === 'approved') {
            loadEligibleReplacements(selectedRequest.id);
        } else {
            setEligibleReplacements([]);
            setShowReplacementPanel(false);
        }
    }, [selectedRequest]);

    const loadEligibleReplacements = async (requestId) => {
        try {
            const response = await requestsAPI.getEligibleReplacements(requestId);
            if (response.success) {
                setEligibleReplacements(response.eligibleEmployees);
            }
        } catch (error) {
            console.error('Failed to load eligible replacements:', error);
        }
    };

    const handleNotifyReplacements = async () => {
        if (!selectedRequest) return;
        setNotifyingReplacements(true);
        try {
            const response = await requestsAPI.notifyReplacements(selectedRequest.id);
            if (response.success) {
                if (response.notifiedCount === 0) {
                    alert('No eligible employees found to notify. No other employees have the same position as the requesting employee.');
                } else {
                    alert(`Notified ${response.notifiedCount} eligible employees about the shift availability.`);
                }
            } else {
                alert(response.error || 'Failed to send notifications.');
            }
        } catch (error) {
            console.error('Failed to notify replacements:', error);
            const errorMessage = error.message || error.error || 'Failed to send notifications. Please try again.';
            alert(errorMessage);
        } finally {
            setNotifyingReplacements(false);
        }
    };

    const handleAssignReplacement = async () => {
        if (!selectedRequest || !selectedReplacement) return;
        setAssigningReplacement(true);
        try {
            const response = await requestsAPI.assignReplacement(selectedRequest.id, selectedReplacement);
            if (response.success) {
                alert(response.message);
                setShowReplacementPanel(false);
                setSelectedReplacement(null);
            }
        } catch (error) {
            console.error('Failed to assign replacement:', error);
            alert('Failed to assign replacement. Please try again.');
        } finally {
            setAssigningReplacement(false);
        }
    };

    const handleAction = async (action) => {
        setProcessing(true);

        try {
            await updateTimeOffRequest(selectedRequest.id, {
                status: action,
                reviewedBy: user.id,
                reviewNote: reviewNote || undefined,
                reviewedAt: new Date().toISOString()
            });

            setSelectedRequest(null);
            setReviewNote('');
        } catch (error) {
            console.error("Failed to update request:", error);
            alert("Failed to update status. Please try again.");
        } finally {
            setProcessing(false);
        }
    };

    const pendingCount = requests.filter(r => r.status === 'pending').length;

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Request Approvals</h1>
                    <p className="page-subtitle">Review and manage time-off requests</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 mb-lg">
                <Card.Stat
                    icon="⏳"
                    iconColor="primary"
                    value={pendingCount}
                    label="Pending"
                />
                <Card.Stat
                    icon="✅"
                    iconColor="success"
                    value={requests.filter(r => r.status === 'approved').length}
                    label="Approved"
                />
                <Card.Stat
                    icon="❌"
                    iconColor="primary"
                    value={requests.filter(r => r.status === 'denied').length}
                    label="Denied"
                />
                <Card.Stat
                    icon="📋"
                    iconColor="secondary"
                    value={requests.length}
                    label="Total Requests"
                />
            </div>

            {/* Filter Tabs */}
            <div className="filter-tabs mb-lg">
                {['pending', 'approved', 'denied', 'all'].map(status => (
                    <button
                        key={status}
                        className={`filter-tab ${filterStatus === status ? 'active' : ''}`}
                        onClick={() => setFilterStatus(status)}
                    >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                        {status === 'pending' && pendingCount > 0 && (
                            <span className="tab-badge">{pendingCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Requests List */}
            <Card>
                {filteredRequests.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📋</div>
                        <h3 className="empty-state-title">No {filterStatus} requests</h3>
                        <p>There are no time-off requests with this status.</p>
                    </div>
                ) : (
                    <div className="requests-table">
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Type</th>
                                        <th>Dates</th>
                                        <th>Reason</th>
                                        <th>Submitted</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRequests.map(request => {
                                        const employee = getEmployee(request.employeeId);
                                        return (
                                            <tr key={request.id}>
                                                <td>
                                                    <div className="employee-cell">
                                                        <div className="avatar avatar-sm">{employee?.avatar}</div>
                                                        <span>{employee?.name}</span>
                                                    </div>
                                                </td>
                                                <td data-label="Type">
                                                    <span className="badge badge-primary">{getTypeLabel(request.type)}</span>
                                                </td>
                                                <td data-label="Dates">
                                                    {formatDate(request.startDate)}
                                                    {request.startDate !== request.endDate && (
                                                        <> → {formatDate(request.endDate)}</>
                                                    )}
                                                </td>
                                                <td className="reason-cell" data-label="Reason">{request.reason}</td>
                                                <td data-label="Submitted">{formatDate(request.createdAt)}</td>
                                                <td data-label="Status">
                                                    <span className={`badge badge-${request.status === 'approved' ? 'success' :
                                                        request.status === 'denied' ? 'danger' : 'warning'
                                                        }`}>
                                                        {request.status}
                                                    </span>
                                                </td>
                                                <td data-label="Actions">
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => {
                                                            setSelectedRequest(request);
                                                            setReviewNote(request.reviewNote || '');
                                                            setIsEditing(request.status === 'pending');
                                                        }}
                                                    >
                                                        {request.status === 'pending' ? 'Review' : 'View'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Card>

            {/* Review Modal */}
            <Modal
                isOpen={!!selectedRequest}
                onClose={() => { setSelectedRequest(null); setReviewNote(''); }}
                title={selectedRequest?.status === 'pending' ? 'Review Request' : 'Request Details'}
                size="medium"
            >
                {selectedRequest && (
                    <div className="review-modal-content">
                        <div className="review-employee">
                            <div className="avatar avatar-lg">
                                {getEmployee(selectedRequest.employeeId)?.avatar}
                            </div>
                            <div className="review-employee-info">
                                <h4>{getEmployee(selectedRequest.employeeId)?.name}</h4>
                                <span>{getEmployee(selectedRequest.employeeId)?.position}</span>
                            </div>
                        </div>

                        <div className="review-details">
                            <div className="review-detail-row">
                                <span className="detail-label">Type</span>
                                <span className="badge badge-primary">{getTypeLabel(selectedRequest.type)}</span>
                            </div>
                            <div className="review-detail-row">
                                <span className="detail-label">Dates</span>
                                <span>
                                    {formatDate(selectedRequest.startDate)}
                                    {selectedRequest.startDate !== selectedRequest.endDate && (
                                        <> to {formatDate(selectedRequest.endDate)}</>
                                    )}
                                </span>
                            </div>
                            <div className="review-detail-row">
                                <span className="detail-label">Reason</span>
                                <span>{selectedRequest.reason}</span>
                            </div>
                            <div className="review-detail-row">
                                <span className="detail-label">Submitted</span>
                                <span>{formatDate(selectedRequest.createdAt)}</span>
                            </div>
                        </div>

                        {(isEditing || selectedRequest.status === 'pending') ? (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Note (Optional)</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Add a note for the employee..."
                                        value={reviewNote}
                                        onChange={(e) => setReviewNote(e.target.value)}
                                    />
                                </div>

                                <div className="modal-footer">
                                    {selectedRequest.status !== 'pending' && (
                                        <button
                                            className="btn btn-secondary mr-auto"
                                            onClick={() => setIsEditing(false)}
                                        >
                                            Cancel
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-danger"
                                        onClick={() => handleAction('denied')}
                                        disabled={processing}
                                    >
                                        {selectedRequest.status === 'denied' ? 'Keep Denied' : 'Deny'}
                                    </button>
                                    <button
                                        className="btn btn-success"
                                        onClick={() => handleAction('approved')}
                                        disabled={processing}
                                    >
                                        {selectedRequest.status === 'approved' ? 'Keep Approved' : 'Approve'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="review-result">
                                <div className="review-detail-row">
                                    <span className="detail-label">Status</span>
                                    <span className={`badge badge-${selectedRequest.status === 'approved' ? 'success' : 'danger'
                                        }`}>
                                        {selectedRequest.status}
                                    </span>
                                </div>
                                {selectedRequest.reviewNote && (
                                    <div className="review-detail-row">
                                        <span className="detail-label">Review Note</span>
                                        <span>{selectedRequest.reviewNote}</span>
                                    </div>
                                )}
                                <div className="review-detail-row">
                                    <span className="detail-label">Reviewed On</span>
                                    <span>{formatDate(selectedRequest.reviewedAt)}</span>
                                </div>

                                {/* Replacement Workflow - Only for approved requests */}
                                {selectedRequest.status === 'approved' && (
                                    <div className="replacement-section">
                                        <h4 className="replacement-header">📋 Shift Replacement</h4>

                                        {!showReplacementPanel ? (
                                            <div className="replacement-actions">
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={handleNotifyReplacements}
                                                    disabled={notifyingReplacements}
                                                >
                                                    {notifyingReplacements ? 'Notifying...' : '📢 Notify Eligible Employees'}
                                                </button>
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={() => setShowReplacementPanel(true)}
                                                >
                                                    👤 Assign Replacement
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="replacement-panel">
                                                <div className="form-group">
                                                    <label className="form-label">Select Replacement Employee</label>
                                                    <select
                                                        className="form-select"
                                                        value={selectedReplacement || ''}
                                                        onChange={(e) => setSelectedReplacement(e.target.value ? Number(e.target.value) : null)}
                                                    >
                                                        <option value="">-- Choose an employee --</option>
                                                        {eligibleReplacements.map(emp => (
                                                            <option key={emp.id} value={emp.id}>
                                                                {emp.name} ({emp.position})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {eligibleReplacements.length === 0 && (
                                                    <p className="text-muted">No eligible employees found with matching position.</p>
                                                )}
                                                <div className="replacement-actions">
                                                    <button
                                                        className="btn btn-secondary"
                                                        onClick={() => {
                                                            setShowReplacementPanel(false);
                                                            setSelectedReplacement(null);
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        className="btn btn-success"
                                                        onClick={handleAssignReplacement}
                                                        disabled={!selectedReplacement || assigningReplacement}
                                                    >
                                                        {assigningReplacement ? 'Assigning...' : 'Confirm Assignment'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="modal-footer" style={{ marginTop: 'var(--spacing-lg)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
                                    <button
                                        className="btn btn-primary w-full"
                                        onClick={() => setIsEditing(true)}
                                    >
                                        ✏️ Change Decision
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default RequestApprovals;
