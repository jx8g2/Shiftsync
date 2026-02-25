import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useStoreFilter } from '../../context/StoreFilterContext';
import { formatDate, TIME_OFF_TYPES } from '../../data/mockData';
import { requestsAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import './RequestApprovals.css';

function RequestApprovals() {
    const { user } = useAuth();
    const { getTimeOffRequestsByStore, getEmployees, updateTimeOffRequest } = useData();
    const { effectiveStoreId, isAllStores } = useStoreFilter();

    const requests = getTimeOffRequestsByStore(effectiveStoreId);
    const employees = getEmployees(effectiveStoreId);

    const [selectedRequest, setSelectedRequest] = useState(null);
    const [filterStatus, setFilterStatus] = useState('pending');
    const [reviewNote, setReviewNote] = useState('');
    const [processing, setProcessing] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Replacement workflow state
    const [eligibleReplacements, setEligibleReplacements] = useState([]);
    const [selectedReplacement, setSelectedReplacement] = useState(null);
    const [approvalStep, setApprovalStep] = useState('review');
    const [approvalAction, setApprovalAction] = useState('empty');

    const filteredRequests = filterStatus === 'all'
        ? requests
        : requests.filter(r => r.status === filterStatus);

    const getEmployee = (id) => employees.find(e => e.id === id);

    const getTypeLabel = (type) => {
        return TIME_OFF_TYPES.find(t => t.value === type)?.label || type;
    };

    // Load eligible replacements when editing/pending a request
    useEffect(() => {
        if (selectedRequest && (selectedRequest.status === 'pending' || isEditing) && selectedRequest.shiftId) {
            loadEligibleReplacements(selectedRequest.id);
        } else {
            setEligibleReplacements([]);
            setApprovalStep('review');
        }
    }, [selectedRequest, isEditing]);

    const formatTime = (time) => {
        if (!time) return '';
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${m} ${ampm}`;
    };

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

    const handleAction = async (action) => {
        if (action === 'approved' && selectedRequest.shiftId && approvalStep === 'review') {
            setApprovalStep('options');
            return;
        }

        setProcessing(true);

        try {
            await updateTimeOffRequest(selectedRequest.id, {
                status: action,
                reviewedBy: user.id,
                reviewNote: reviewNote || undefined,
                reviewedAt: new Date().toISOString(),
                approvalAction: action === 'approved' ? approvalAction : undefined,
                replacementId: action === 'approved' && approvalAction === 'replace' ? selectedReplacement : undefined
            });

            setSelectedRequest(null);
            setReviewNote('');
            setApprovalStep('review');
            setApprovalAction('empty');
            setSelectedReplacement(null);
        } catch (error) {
            console.error("Failed to update request:", error);
            alert("Failed to update status. Please try again.");
        } finally {
            setProcessing(false);
        }
    };

    const pendingCount = requests.filter(r => r.status === 'pending').length;

    if (isAllStores) {
        return (
            <div className="page-container animate-fade-in">
                <div className="empty-state">
                    <div className="empty-state-icon">🏪</div>
                    <h3 className="empty-state-title">Select a Store</h3>
                    <p>Please select a specific store from the header filter to view requests.</p>
                </div>
            </div>
        );
    }

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
                                                    {request.replacementName && (
                                                        <div style={{ fontSize: '0.85em', marginTop: '4px', color: 'var(--success-color)' }}>
                                                            <span style={{ opacity: 0.7 }}>↳</span> {request.replacementName}
                                                        </div>
                                                    )}
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
                            {selectedRequest.shiftId && (
                                <div className="review-detail-row">
                                    <span className="detail-label">Shift</span>
                                    <span>
                                        {selectedRequest.shiftRole} • {formatTime(selectedRequest.shiftStart)} - {formatTime(selectedRequest.shiftEnd)}
                                    </span>
                                </div>
                            )}
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
                            approvalStep === 'options' ? (
                                <div className="approval-options-panel p-md border rounded mb-md mt-md">
                                    <h4 className="mb-sm">Approve Request</h4>
                                    <p className="text-muted mb-md">This will remove {getEmployee(selectedRequest.employeeId)?.name} from their scheduled shift.</p>

                                    <div className="form-group">
                                        <label className="radio-label block mb-sm">
                                            <input
                                                type="radio"
                                                name="approvalAction"
                                                value="empty"
                                                checked={approvalAction === 'empty'}
                                                onChange={() => setApprovalAction('empty')}
                                            />
                                            <span className="ml-sm">Keep shift empty (delete shift)</span>
                                        </label>
                                        <label className="radio-label block mb-md">
                                            <input
                                                type="radio"
                                                name="approvalAction"
                                                value="replace"
                                                checked={approvalAction === 'replace'}
                                                onChange={() => setApprovalAction('replace')}
                                            />
                                            <span className="ml-sm">Replace shift (reassign to someone else)</span>
                                        </label>
                                    </div>

                                    {approvalAction === 'replace' && (
                                        <div className="form-group mt-md">
                                            <label className="form-label">Select Replacement</label>
                                            <select
                                                className="form-select"
                                                value={selectedReplacement || ''}
                                                onChange={(e) => setSelectedReplacement(e.target.value ? Number(e.target.value) : null)}
                                            >
                                                <option value="">-- Choose an employee --</option>
                                                {eligibleReplacements.map(emp => (
                                                    <option key={emp.id} value={emp.id}>
                                                        {emp.name} ({Math.round((emp.scheduledHours || 0) * 10) / 10} hrs scheduled this week)
                                                    </option>
                                                ))}
                                            </select>
                                            {eligibleReplacements.length === 0 && (
                                                <p className="text-muted mt-sm">No eligible replacements found.</p>
                                            )}
                                        </div>
                                    )}

                                    <div className="modal-footer mt-lg">
                                        <button className="btn btn-secondary mr-auto" onClick={() => setApprovalStep('review')}>
                                            Back
                                        </button>
                                        <button
                                            className="btn btn-success"
                                            onClick={() => handleAction('approved')}
                                            disabled={processing || (approvalAction === 'replace' && !selectedReplacement)}
                                        >
                                            {processing ? 'Processing...' : 'Confirm Approval'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="form-group mt-md">
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
                            )
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
                                {selectedRequest.replacementName && (
                                    <div className="review-detail-row" style={{ borderLeft: '3px solid var(--success-color)', paddingLeft: 'var(--spacing-md)', background: 'rgba(var(--success-rgb), 0.05)', marginTop: 'var(--spacing-md)' }}>
                                        <span className="detail-label">Reassigned To</span>
                                        <span className="text-success fw-bold">{selectedRequest.replacementName}</span>
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
