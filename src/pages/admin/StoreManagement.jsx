import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { storesAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import '../manager/EmployeeManagement.css';

function StoreManagement() {
    const [stores, setStores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchStores();
    }, []);

    const fetchStores = async () => {
        try {
            setLoading(true);
            const res = await storesAPI.getAll();
            if (res.success) setStores(res.stores);
        } catch (err) {
            setError(err.message || 'Failed to load stores');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (storeId) => {
        try {
            setDeleting(true);
            const res = await storesAPI.delete(storeId);
            if (res.success) {
                setStores(stores.filter(s => s.id !== storeId));
                setDeleteConfirm(null);
            } else {
                setError(res.error || 'Failed to delete store');
            }
        } catch (err) {
            setError(err.message || 'Failed to delete store');
        } finally {
            setDeleting(false);
        }
    };

    const formatLocation = (store) => {
        const parts = [store.address, store.city, store.state, store.zipCode].filter(Boolean);
        return parts.join(', ') || '—';
    };

    const filteredStores = stores.filter(store => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
            store.name?.toLowerCase().includes(s) ||
            store.city?.toLowerCase().includes(s) ||
            store.state?.toLowerCase().includes(s) ||
            store.id?.toLowerCase().includes(s) ||
            store.managerName?.toLowerCase().includes(s)
        );
    });

    if (loading) {
        return (
            <div className="employee-management">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading stores...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="employee-management animate-fade-in">
            <div className="page-header">
                <div className="page-header-content">
                    <h1>🏪 Store Management</h1>
                    <p className="page-subtitle">Manage your locations and store settings</p>
                </div>
                <Link to="/admin/stores/new" className="btn btn-primary">
                    <span className="btn-icon">➕</span>
                    Add Store
                </Link>
            </div>

            {error && (
                <div className="error-banner">
                    <span>⚠️</span>
                    {error}
                    <button onClick={() => setError('')} className="error-dismiss">×</button>
                </div>
            )}

            <Card className="search-card">
                <div className="search-container">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        placeholder="Search by name, city, state, manager..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-input search-input"
                    />
                    {searchTerm && (
                        <button className="search-clear" onClick={() => setSearchTerm('')}>×</button>
                    )}
                </div>
            </Card>

            <div className="employee-stats">
                <div className="stat-item">
                    <span className="stat-value">{filteredStores.length}</span>
                    <span className="stat-label">Total Stores</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{stores.reduce((sum, s) => sum + (s.employeeCount || 0), 0)}</span>
                    <span className="stat-label">Total Employees</span>
                </div>
            </div>

            {filteredStores.length === 0 ? (
                <Card className="empty-state">
                    <span className="empty-icon">🏪</span>
                    <h3>No stores found</h3>
                    <p>{searchTerm ? 'Try adjusting your search' : 'Add your first store to get started'}</p>
                    {!searchTerm && (
                        <Link to="/admin/stores/new" className="btn btn-primary">Add Store</Link>
                    )}
                </Card>
            ) : (
                <div className="employee-grid">
                    {filteredStores.map(store => (
                        <Card key={store.id} className="employee-card">
                            <div className="employee-card-header">
                                <div className="employee-avatar" data-role="store">
                                    🏪
                                </div>
                                <div className="employee-info">
                                    <h3 className="employee-name">{store.name}</h3>
                                    <span className="employee-position" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                        {store.id}
                                    </span>
                                </div>
                                <span className="badge badge-primary" style={{ alignSelf: 'flex-start' }}>
                                    {store.employeeCount ?? 0} emp
                                </span>
                            </div>

                            <div className="employee-details">
                                <div className="detail-row">
                                    <span className="detail-icon">📍</span>
                                    <span className="detail-value">{formatLocation(store)}</span>
                                </div>
                                {store.phone && (
                                    <div className="detail-row">
                                        <span className="detail-icon">📞</span>
                                        <span className="detail-value">{store.phone}</span>
                                    </div>
                                )}
                                <div className="detail-row">
                                    <span className="detail-icon">👔</span>
                                    <span className="detail-value">
                                        {store.managerName || <span style={{ opacity: 0.5 }}>No manager assigned</span>}
                                    </span>
                                </div>
                            </div>

                            <div className="employee-actions">
                                <Link
                                    to={`/admin/stores/${store.id}/edit`}
                                    className="btn btn-secondary btn-sm"
                                >
                                    ✏️ Edit
                                </Link>
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => setDeleteConfirm(store)}
                                >
                                    🗑️ Delete
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>Delete Store</h3>
                        <p>Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?</p>
                        <p className="modal-warning">This action cannot be undone and will affect all associated employees and schedules.</p>
                        <div className="modal-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setDeleteConfirm(null)}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={() => handleDelete(deleteConfirm.id)}
                                disabled={deleting}
                            >
                                {deleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default StoreManagement;


