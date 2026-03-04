import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useStoreFilter } from '../../context/StoreFilterContext';
import { useSocketEvent } from '../../context/SocketContext';
import { formatDate, TIME_OFF_TYPES } from '../../data/mockData';
import { requestsAPI, swapRequestsAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import './RequestApprovals.css';

const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
};

function StatusBadge({ status }) {
    const map = { pending: 'badge-warning', approved: 'badge-success', denied: 'badge-danger' };
    return <span className={`badge ${map[status] || 'badge-secondary'}`}>{status}</span>;
}

// ─── Swap Review Modal ─────────────────────────────────────────────────────
function SwapReviewModal({ swap, storeEmployees, onClose, onSubmit, processing }) {
    const [reviewNote, setReviewNote] = useState('');
    const [selectedPartnerId, setSelectedPartnerId] = useState(swap?.proposedPartnerId || '');
    const [eligiblePartners, setEligiblePartners] = useState([]);
    const [loadingPartners, setLoadingPartners] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        if (!swap) return;
        swapRequestsAPI.getEligiblePartners(swap.id)
            .then(r => { if (r?.success) setEligiblePartners(r.eligiblePartners || []); })
            .catch(console.error)
            .finally(() => setLoadingPartners(false));
    }, [swap?.id]);

    if (!swap) return null;

    const showForm = swap.status === 'pending' || isEditing;

    return (
        <div className="review-modal-content">
            <div className="review-employee">
                <div className="avatar avatar-lg">{swap.requesterAvatar || '👤'}</div>
                <div className="review-employee-info">
                    <h4>{swap.requesterName}</h4>
                    <span>Shift Cover Request</span>
                </div>
            </div>

            <div className="review-details">
                <div className="review-detail-row">
                    <span className="detail-label">Shift</span>
                    <span>
                        {swap.shiftDay && swap.shiftDay.charAt(0).toUpperCase() + swap.shiftDay.slice(1)}
                        {' · '}{formatTime(swap.shiftStart)}–{formatTime(swap.shiftEnd)}
                        {' · '}{swap.shiftRole}
                    </span>
                </div>
                {swap.shiftWeekStart && (
                    <div className="review-detail-row">
                        <span className="detail-label">Week of</span>
                        <span>{formatDate(swap.shiftWeekStart)}</span>
                    </div>
                )}
                {swap.reason && (
                    <div className="review-detail-row">
                        <span className="detail-label">Reason</span>
                        <span>{swap.reason}</span>
                    </div>
                )}
                <div className="review-detail-row">
                    <span className="detail-label">Submitted</span>
                    <span>{formatDate(swap.createdAt)}</span>
                </div>
                {swap.reviewerName && (
                    <div className="review-detail-row">
                        <span className="detail-label">Last Decision By</span>
                        <span>
                            <strong>{swap.reviewerRole === 'manager' ? '👔 Manager' : '⭐ Shift Lead'} {swap.reviewerName}</strong>
                            {swap.reviewedAt ? ` on ${formatDate(swap.reviewedAt)}` : ''}
                        </span>
                    </div>
                )}
            </div>

            {showForm ? (
                <>
                    <div className="form-group mt-md">
                        <label className="form-label">Cover Partner (same-department eligible employees)</label>
                        {loadingPartners
                            ? <p className="text-muted">Loading eligible partners...</p>
                            : (
                                <select className="form-select" value={selectedPartnerId || ''}
                                    onChange={e => setSelectedPartnerId(e.target.value ? Number(e.target.value) : '')}>
                                    <option value="">No partner (leave shift empty)</option>
                                    {eligiblePartners.map(p => {
                                        const currentHrs = p.current_weekly_hours || 0;
                                        // Calculate estimated added hours (assuming a typical 8hr shift for display if start/end aren't on this object anymore,
                                        // but since the endpoint doesn't return the exact shift duration easily without more joins, we just show current)
                                        return (
                                            <option key={p.id} value={p.id}>
                                                {p.name} · {p.position} (Current: {Math.round(currentHrs * 10) / 10} hrs)
                                            </option>
                                        );
                                    })}
                                </select>
                            )
                        }
                    </div>

                    <div className="form-group mt-md">
                        <label className="form-label">Review Note (Optional)</label>
                        <textarea className="form-textarea"
                            placeholder="Add a note for the employee..."
                            value={reviewNote}
                            onChange={e => setReviewNote(e.target.value)} />
                    </div>

                    {swap.proposedPartnerId && (swap.partnerStatus === 'pending' || swap.partnerStatus === 'declined') && (
                        <div className="form-group mt-md" style={{ background: '#fff3cd', padding: '10px', borderRadius: '4px', border: '1px solid #ffeeba' }}>
                            <p className="text-warning mb-sm" style={{ margin: 0, fontWeight: 'bold' }}>
                                ⚠️ Partner has {swap.partnerStatus === 'pending' ? 'not yet accepted' : 'declined'} this cover.
                            </p>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                                <input type="checkbox" onChange={(e) => {
                                    if (e.target.checked) setReviewNote(prev => (prev ? prev + ' (Manager Override)' : '(Manager Override)'));
                                }} />
                                <span style={{ fontSize: '0.9rem' }}>I understand and want to override this decision</span>
                            </label>
                        </div>
                    )}

                    <div className="modal-footer mt-md">
                        {isEditing && (
                            <button className="btn btn-secondary mr-auto" onClick={() => setIsEditing(false)}>Cancel</button>
                        )}
                        <button className="btn btn-danger" disabled={processing}
                            onClick={() => onSubmit('denied', reviewNote, null).then(() => setIsEditing(false))}>
                            {processing ? 'Processing...' : 'Deny'}
                        </button>
                        <button className="btn btn-success" disabled={processing}
                            onClick={() => onSubmit('approved', reviewNote, selectedPartnerId || null).then(() => setIsEditing(false))}>
                            {processing ? 'Processing...' : 'Approve Cover'}
                        </button>
                    </div>
                </>
            ) : (
                <div className="review-result mt-md">
                    <div className="review-detail-row">
                        <span className="detail-label">Status</span>
                        <StatusBadge status={swap.status} />
                    </div>
                    {swap.proposedPartnerName && (
                        <div className="review-detail-row" style={{ borderLeft: '3px solid var(--color-success)', paddingLeft: 'var(--spacing-md)', background: 'rgba(var(--color-success-rgb,34,197,94),0.05)', marginTop: 'var(--spacing-md)' }}>
                            <span className="detail-label">Covered By</span>
                            <span className="text-success fw-bold">{swap.proposedPartnerName}</span>
                        </div>
                    )}
                    {swap.reviewNote && (
                        <div className="review-detail-row">
                            <span className="detail-label">Review Note</span>
                            <span>{swap.reviewNote}</span>
                        </div>
                    )}
                    <div className="modal-footer mt-lg" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
                        {/* Managers can always change a decision */}
                        <button className="btn btn-primary w-full" onClick={() => setIsEditing(true)}>✏️ Change Decision</button>
                        <button className="btn btn-secondary w-full mt-sm" onClick={onClose}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────
function RequestApprovals() {
    const { user } = useAuth();
    const { getTimeOffRequestsByStore, getEmployees, updateTimeOffRequest } = useData();
    const { effectiveStoreId, isAllStores } = useStoreFilter();

    // Main tab
    const [mainTab, setMainTab] = useState('timeoff');

    // Time-off state
    const requests = getTimeOffRequestsByStore(effectiveStoreId);
    const employees = getEmployees(effectiveStoreId);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [filterStatus, setFilterStatus] = useState('pending');
    const [reviewNote, setReviewNote] = useState('');
    const [processing, setProcessing] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [eligibleReplacements, setEligibleReplacements] = useState([]);
    const [selectedReplacement, setSelectedReplacement] = useState(null);
    const [approvalStep, setApprovalStep] = useState('review');
    const [approvalAction, setApprovalAction] = useState('empty');

    // Swap state
    const [swapRequests, setSwapRequests] = useState([]);
    const [swapFilterStatus, setSwapFilterStatus] = useState('pending');
    const [selectedSwap, setSelectedSwap] = useState(null);
    const [swapProcessing, setSwapProcessing] = useState(false);
    const [loadingSwaps, setLoadingSwaps] = useState(false);

    const filteredRequests = filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus);
    const filteredSwaps = swapFilterStatus === 'all' ? swapRequests : swapRequests.filter(s => s.status === swapFilterStatus);
    const getEmployee = (id) => employees.find(e => e.id === id);
    const getTypeLabel = (type) => TIME_OFF_TYPES.find(t => t.value === type)?.label || type;

    // Load swaps (called on tab switch + real-time socket events)
    const fetchSwaps = useCallback(() => {
        if (!effectiveStoreId) return;
        setLoadingSwaps(true);
        swapRequestsAPI.getAll({ storeId: effectiveStoreId })
            .then(r => { if (r?.success) setSwapRequests(r.swapRequests || []); })
            .catch(console.error)
            .finally(() => setLoadingSwaps(false));
    }, [effectiveStoreId]);

    useEffect(() => {
        if (mainTab !== 'swaps') return;
        fetchSwaps();
    }, [mainTab, fetchSwaps]);

    // Real-time socket: refresh swaps and time-off requests without page reload
    useSocketEvent('data_refresh', useCallback(() => {
        fetchSwaps();
        // Refresh time-off requests via the store's data
        if (effectiveStoreId) {
            getTimeOffRequestsByStore(effectiveStoreId);
        }
    }, [fetchSwaps, effectiveStoreId, getTimeOffRequestsByStore]));
    useSocketEvent('notification_refresh', useCallback(() => {
        fetchSwaps();
        if (effectiveStoreId) {
            getTimeOffRequestsByStore(effectiveStoreId);
        }
    }, [fetchSwaps, effectiveStoreId, getTimeOffRequestsByStore]));

    // Load eligible replacements for time-off requests
    useEffect(() => {
        if (selectedRequest && (selectedRequest.status === 'pending' || isEditing) && selectedRequest.shiftId) {
            requestsAPI.getEligibleReplacements(selectedRequest.id)
                .then(r => { if (r.success) setEligibleReplacements(r.eligibleEmployees); })
                .catch(console.error);
        } else {
            setEligibleReplacements([]);
            setApprovalStep('review');
        }
    }, [selectedRequest, isEditing]);

    // ── Time-off action ─────────────────────────────────────────────────────
    const handleTimeOffAction = async (action) => {
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
            console.error('Failed to update request:', error);
            alert('Failed to update status. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    // ── Swap action ─────────────────────────────────────────────────────────
    const handleSwapAction = async (status, reviewNote, partnerId) => {
        setSwapProcessing(true);
        try {
            await swapRequestsAPI.updateStatus(selectedSwap.id, {
                status,
                reviewNote,
                partnerId: partnerId || null
            });
            // Refresh swaps list
            const r = await swapRequestsAPI.getAll({ storeId: effectiveStoreId });
            if (r?.success) setSwapRequests(r.swapRequests || []);
            setSelectedSwap(null);
        } catch (err) {
            console.error('Failed to update swap request:', err);
            alert('Failed to update swap. Please try again.');
        } finally {
            setSwapProcessing(false);
        }
    };

    const pendingCount = requests.filter(r => r.status === 'pending').length;
    const pendingSwapCount = swapRequests.filter(s => s.status === 'pending').length;

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
                    <p className="page-subtitle">Review time-off requests and shift cover requests</p>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="filter-tabs mb-lg">
                <button className={`filter-tab ${mainTab === 'timeoff' ? 'active' : ''}`}
                    onClick={() => setMainTab('timeoff')}>
                    📝 Time-Off Requests
                    {pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
                </button>
                <button className={`filter-tab ${mainTab === 'swaps' ? 'active' : ''}`}
                    onClick={() => setMainTab('swaps')}>
                    🔄 Shift Covers
                    {pendingSwapCount > 0 && <span className="tab-badge">{pendingSwapCount}</span>}
                </button>
            </div>

            {/* ── TIME-OFF TAB ──────────────────────────────────────────── */}
            {mainTab === 'timeoff' && (
                <>
                    <div className="grid grid-cols-4 mb-lg">
                        <Card.Stat icon="⏳" iconColor="primary" value={pendingCount} label="Pending" />
                        <Card.Stat icon="✅" iconColor="success" value={requests.filter(r => r.status === 'approved').length} label="Approved" />
                        <Card.Stat icon="❌" iconColor="primary" value={requests.filter(r => r.status === 'denied').length} label="Denied" />
                        <Card.Stat icon="📋" iconColor="secondary" value={requests.length} label="Total" />
                    </div>

                    <div className="filter-tabs mb-lg">
                        {['pending', 'approved', 'denied', 'all'].map(status => (
                            <button key={status}
                                className={`filter-tab ${filterStatus === status ? 'active' : ''}`}
                                onClick={() => setFilterStatus(status)}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                                {status === 'pending' && pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
                            </button>
                        ))}
                    </div>

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
                                                <th>Scope</th>
                                                <th>Date / Time</th>
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
                                                        <td data-label="Scope">
                                                            <span className="badge badge-primary">
                                                                {request.requestScope === 'partial' ? '🕐 Partial' : '📅 Full Day'}
                                                            </span>
                                                        </td>
                                                        <td data-label="Date">
                                                            {formatDate(request.requestedDate || request.startDate)}
                                                            {request.requestScope === 'partial' && request.partialStartTime && (
                                                                <div style={{ fontSize: '0.8em', color: 'var(--color-text-muted)' }}>
                                                                    {formatTime(request.partialStartTime)}–{formatTime(request.partialEndTime)}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="reason-cell" data-label="Reason">{request.reason}</td>
                                                        <td data-label="Submitted">{formatDate(request.createdAt)}</td>
                                                        <td data-label="Status">
                                                            <StatusBadge status={request.status} />
                                                        </td>
                                                        <td data-label="Actions">
                                                            <button className="btn btn-secondary btn-sm"
                                                                onClick={() => {
                                                                    setSelectedRequest(request);
                                                                    setReviewNote(request.reviewNote || '');
                                                                    setIsEditing(request.status === 'pending');
                                                                }}>
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
                </>
            )}

            {/* ── SWAPS TAB ─────────────────────────────────────────────── */}
            {mainTab === 'swaps' && (
                <>
                    <div className="grid grid-cols-4 mb-lg">
                        <Card.Stat icon="⏳" iconColor="primary" value={pendingSwapCount} label="Pending" />
                        <Card.Stat icon="✅" iconColor="success" value={swapRequests.filter(s => s.status === 'approved').length} label="Approved" />
                        <Card.Stat icon="❌" iconColor="primary" value={swapRequests.filter(s => s.status === 'denied').length} label="Denied" />
                        <Card.Stat icon="🔄" iconColor="secondary" value={swapRequests.length} label="Total" />
                    </div>

                    <div className="filter-tabs mb-lg">
                        {['pending', 'approved', 'denied', 'all'].map(status => (
                            <button key={status}
                                className={`filter-tab ${swapFilterStatus === status ? 'active' : ''}`}
                                onClick={() => setSwapFilterStatus(status)}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                                {status === 'pending' && pendingSwapCount > 0 && <span className="tab-badge">{pendingSwapCount}</span>}
                            </button>
                        ))}
                    </div>

                    {loadingSwaps ? (
                        <div className="loading-container"><div className="spinner"></div><p>Loading swaps...</p></div>
                    ) : (
                        <Card>
                            {filteredSwaps.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">🔄</div>
                                    <h3 className="empty-state-title">No {swapFilterStatus} cover requests</h3>
                                    <p>No shift cover requests with this status.</p>
                                </div>
                            ) : (
                                <div className="requests-table">
                                    <div className="table-container">
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Employee</th>
                                                    <th>Shift</th>
                                                    <th>Proposed Partner</th>
                                                    <th>Submitted</th>
                                                    <th>Status</th>
                                                    <th>Decided By</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredSwaps.map(swap => (
                                                    <tr key={swap.id}>
                                                        <td>
                                                            <div className="employee-cell">
                                                                <div className="avatar avatar-sm">{swap.requesterAvatar || '👤'}</div>
                                                                <span>{swap.requesterName}</span>
                                                            </div>
                                                        </td>
                                                        <td data-label="Shift">
                                                            <div>
                                                                {swap.shiftDay && swap.shiftDay.charAt(0).toUpperCase() + swap.shiftDay.slice(1)}
                                                            </div>
                                                            <div style={{ fontSize: '0.8em', color: 'var(--color-text-muted)' }}>
                                                                {formatTime(swap.shiftStart)}–{formatTime(swap.shiftEnd)} · {swap.shiftRole}
                                                            </div>
                                                        </td>
                                                        <td data-label="Partner">
                                                            {swap.proposedPartnerName ? (
                                                                <div>
                                                                    <span className="badge badge-secondary">{swap.proposedPartnerName}</span>
                                                                    <br />
                                                                    <span style={{ fontSize: '0.8rem', color: swap.partnerStatus === 'accepted' ? 'var(--color-success)' : swap.partnerStatus === 'declined' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                                                                        {swap.partnerStatus === 'accepted' ? '✅ Accepted' : swap.partnerStatus === 'declined' ? '❌ Declined' : '⏳ Pending'}
                                                                    </span>
                                                                </div>
                                                            ) : <span className="text-muted">—</span>}
                                                        </td>
                                                        <td data-label="Submitted">{formatDate(swap.createdAt)}</td>
                                                        <td data-label="Status"><StatusBadge status={swap.status} /></td>
                                                        <td data-label="Decided By">
                                                            {swap.reviewerName ? (
                                                                <span style={{ fontSize: '0.85rem' }}>
                                                                    {swap.reviewerRole === 'manager' ? '👔' : '⭐'} {swap.reviewerName}
                                                                </span>
                                                            ) : <span className="text-muted">—</span>}
                                                        </td>
                                                        <td data-label="Actions">
                                                            <button className="btn btn-secondary btn-sm"
                                                                onClick={() => setSelectedSwap(swap)}>
                                                                {swap.status === 'pending' ? 'Review' : 'View'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </Card>
                    )}
                </>
            )}

            {/* ── Time-off Review Modal ──────────────────────────────────── */}
            <Modal isOpen={!!selectedRequest} onClose={() => { setSelectedRequest(null); setReviewNote(''); }}
                title={selectedRequest?.status === 'pending' ? 'Review Request' : 'Request Details'}
                size="medium">
                {selectedRequest && (
                    <div className="review-modal-content">
                        <div className="review-employee">
                            <div className="avatar avatar-lg">{getEmployee(selectedRequest.employeeId)?.avatar}</div>
                            <div className="review-employee-info">
                                <h4>{getEmployee(selectedRequest.employeeId)?.name}</h4>
                                <span>{getEmployee(selectedRequest.employeeId)?.position}</span>
                            </div>
                        </div>
                        <div className="review-details">
                            <div className="review-detail-row">
                                <span className="detail-label">Scope</span>
                                <span className="badge badge-primary">
                                    {selectedRequest.requestScope === 'partial' ? '🕐 Partial' : '📅 Full Day'}
                                </span>
                            </div>
                            <div className="review-detail-row">
                                <span className="detail-label">Date</span>
                                <span>{formatDate(selectedRequest.requestedDate || selectedRequest.startDate)}</span>
                            </div>
                            {selectedRequest.requestScope === 'partial' && selectedRequest.partialStartTime && (
                                <div className="review-detail-row">
                                    <span className="detail-label">Time Window</span>
                                    <span>{formatTime(selectedRequest.partialStartTime)} – {formatTime(selectedRequest.partialEndTime)}</span>
                                </div>
                            )}
                            <div className="review-detail-row">
                                <span className="detail-label">Type</span>
                                <span className="badge badge-primary">{getTypeLabel(selectedRequest.type)}</span>
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
                            approvalStep === 'options' ? (
                                <div className="approval-options-panel p-md border rounded mb-md mt-md">
                                    <h4 className="mb-sm">Approve Request</h4>
                                    <p className="text-muted mb-md">
                                        This will mark {getEmployee(selectedRequest.employeeId)?.name}'s shift as off for that day.
                                    </p>
                                    <div className="form-group">
                                        <label className="radio-label block mb-sm">
                                            <input type="radio" name="approvalAction" value="empty"
                                                checked={approvalAction === 'empty'}
                                                onChange={() => setApprovalAction('empty')} />
                                            <span className="ml-sm">Keep shift empty</span>
                                        </label>
                                        <label className="radio-label block mb-md">
                                            <input type="radio" name="approvalAction" value="replace"
                                                checked={approvalAction === 'replace'}
                                                onChange={() => setApprovalAction('replace')} />
                                            <span className="ml-sm">Reassign shift to someone else</span>
                                        </label>
                                    </div>
                                    {approvalAction === 'replace' && (
                                        <div className="form-group mt-md">
                                            <label className="form-label">Select Replacement</label>
                                            <select className="form-select" value={selectedReplacement || ''}
                                                onChange={e => setSelectedReplacement(e.target.value ? Number(e.target.value) : null)}>
                                                <option value="">-- Choose an employee --</option>
                                                {eligibleReplacements.map(emp => (
                                                    <option key={emp.id} value={emp.id}>
                                                        {emp.name} ({Math.round((emp.scheduledHours || 0) * 10) / 10} hrs)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    <div className="modal-footer mt-lg">
                                        <button className="btn btn-secondary mr-auto" onClick={() => setApprovalStep('review')}>Back</button>
                                        <button className="btn btn-success" disabled={processing || (approvalAction === 'replace' && !selectedReplacement)}
                                            onClick={() => handleTimeOffAction('approved')}>
                                            {processing ? 'Processing...' : 'Confirm Approval'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="form-group mt-md">
                                        <label className="form-label">Note (Optional)</label>
                                        <textarea className="form-textarea"
                                            placeholder="Add a note for the employee..."
                                            value={reviewNote}
                                            onChange={e => setReviewNote(e.target.value)} />
                                    </div>
                                    <div className="modal-footer">
                                        {selectedRequest.status !== 'pending' && (
                                            <button className="btn btn-secondary mr-auto" onClick={() => setIsEditing(false)}>Cancel</button>
                                        )}
                                        <button className="btn btn-danger" disabled={processing} onClick={() => handleTimeOffAction('denied')}>
                                            {selectedRequest.status === 'denied' ? 'Keep Denied' : 'Deny'}
                                        </button>
                                        <button className="btn btn-success" disabled={processing} onClick={() => handleTimeOffAction('approved')}>
                                            {selectedRequest.status === 'approved' ? 'Keep Approved' : 'Approve'}
                                        </button>
                                    </div>
                                </>
                            )
                        ) : (
                            <div className="review-result">
                                <div className="review-detail-row">
                                    <span className="detail-label">Status</span>
                                    <StatusBadge status={selectedRequest.status} />
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
                                <div className="modal-footer" style={{ marginTop: 'var(--spacing-lg)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
                                    <button className="btn btn-primary w-full" onClick={() => setIsEditing(true)}>✏️ Change Decision</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* ── Swap Review Modal ──────────────────────────────────────── */}
            <Modal isOpen={!!selectedSwap} onClose={() => setSelectedSwap(null)}
                title={selectedSwap?.status === 'pending' ? 'Review Shift Cover' : 'Cover Details'}
                size="medium">
                <SwapReviewModal
                    swap={selectedSwap}
                    storeEmployees={employees}
                    onClose={() => setSelectedSwap(null)}
                    onSubmit={handleSwapAction}
                    processing={swapProcessing}
                />
            </Modal>
        </div>
    );
}

export default RequestApprovals;
