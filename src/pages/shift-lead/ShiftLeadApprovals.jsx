import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/SocketContext';
import { formatDate } from '../../data/mockData';
import { swapRequestsAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';

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

// ─── Swap Review Modal ──────────────────────────────────────────────────────
function SwapReviewModal({ swap, onClose, onSubmit, processing }) {
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

    // Shift leads cannot override a manager's decision
    const isManagerDecision = swap.reviewerRole === 'manager';
    const showForm = (swap.status === 'pending' || isEditing) && !isManagerDecision;
    const canEdit = swap.status !== 'pending' && !isManagerDecision;

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
                        <span className="detail-label">Last Decision</span>
                        <span>
                            <strong>{swap.reviewerRole === 'manager' ? 'Manager' : 'Shift Lead'} {swap.reviewerName}</strong>
                            {swap.reviewedAt ? ` on ${formatDate(swap.reviewedAt)}` : ''}
                        </span>
                    </div>
                )}
            </div>

            {isManagerDecision && swap.status !== 'pending' && (
                <div className="info-banner mt-md" style={{ background: 'rgba(var(--color-warning-rgb,245,158,11),0.1)', borderColor: 'var(--color-warning)' }}>
                    <span>🔒</span>
                    <span>This decision was made by a Manager and cannot be changed by a Shift Lead.</span>
                </div>
            )}

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
                                    {eligiblePartners.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} · {p.position} (Current: {Math.round(p.current_weekly_hours * 10) / 10} hrs)
                                        </option>
                                    ))}
                                </select>
                            )
                        }
                    </div>

                    <div className="form-group mt-md">
                        <label className="form-label">Note (Optional)</label>
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
                        <div className="review-detail-row" style={{ borderLeft: '3px solid var(--color-success)', paddingLeft: 'var(--spacing-md)', background: 'rgba(34,197,94,0.05)', marginTop: 'var(--spacing-md)' }}>
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
                        {canEdit && (
                            <button className="btn btn-primary w-full" onClick={() => setIsEditing(true)}>✏️ Change Decision</button>
                        )}
                        <button className="btn btn-secondary w-full mt-sm" onClick={onClose}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function ShiftLeadApprovals() {
    const { user } = useAuth();
    const storeId = user.storeId || user.store_id;

    const [swapRequests, setSwapRequests] = useState([]);
    const [filterStatus, setFilterStatus] = useState('pending');
    const [selectedSwap, setSelectedSwap] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchSwaps = useCallback(() => {
        if (!storeId) return;
        setLoading(true);
        swapRequestsAPI.getAll({ storeId })
            .then(r => { if (r?.success) setSwapRequests(r.swapRequests || []); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [storeId]);

    useEffect(() => {
        fetchSwaps();
    }, [fetchSwaps]);

    // Real-time updates via socket events
    useSocketEvent('data_refresh', fetchSwaps);
    useSocketEvent('notification_refresh', fetchSwaps);

    const filteredSwaps = filterStatus === 'all'
        ? swapRequests
        : swapRequests.filter(s => s.status === filterStatus);

    const pendingCount = swapRequests.filter(s => s.status === 'pending').length;

    const handleSwapAction = async (status, reviewNote, partnerId) => {
        setProcessing(true);
        try {
            await swapRequestsAPI.updateStatus(selectedSwap.id, {
                status,
                reviewNote,
                partnerId: partnerId || null
            });
            fetchSwaps();
            setSelectedSwap(null);
        } catch (err) {
            console.error('Failed to update swap request:', err);
            alert('Failed to update swap. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Shift Cover Approvals</h1>
                    <p className="page-subtitle">Review and make decisions on shift cover requests</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 mb-lg">
                <Card.Stat icon="⏳" iconColor="primary" value={pendingCount} label="Pending" />
                <Card.Stat icon="✅" iconColor="success" value={swapRequests.filter(s => s.status === 'approved').length} label="Approved" />
                <Card.Stat icon="❌" iconColor="danger" value={swapRequests.filter(s => s.status === 'denied').length} label="Denied" />
                <Card.Stat icon="🔄" iconColor="secondary" value={swapRequests.length} label="Total" />
            </div>

            {/* Filter tabs */}
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

            {loading ? (
                <div className="loading-container"><div className="spinner"></div><p>Loading...</p></div>
            ) : (
                <Card>
                    {filteredSwaps.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🔄</div>
                            <h3 className="empty-state-title">No {filterStatus} cover requests</h3>
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
                                                    <div>{swap.shiftDay && swap.shiftDay.charAt(0).toUpperCase() + swap.shiftDay.slice(1)}</div>
                                                    <div style={{ fontSize: '0.8em', color: 'var(--color-text-muted)' }}>
                                                        {formatTime(swap.shiftStart)}–{formatTime(swap.shiftEnd)} · {swap.shiftRole}
                                                    </div>
                                                </td>
                                                <td data-label="Partner">
                                                    {swap.proposedPartnerName ? (
                                                        <div>
                                                            <span className="badge badge-secondary">{swap.proposedPartnerName}</span><br />
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
                                                    <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSwap(swap)}>
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

            {/* Review Modal */}
            <Modal isOpen={!!selectedSwap} onClose={() => setSelectedSwap(null)}
                title={selectedSwap?.status === 'pending' ? 'Review Shift Cover' : 'Cover Details'}
                size="medium">
                <SwapReviewModal
                    swap={selectedSwap}
                    onClose={() => setSelectedSwap(null)}
                    onSubmit={handleSwapAction}
                    processing={processing}
                />
            </Modal>
        </div>
    );
}
