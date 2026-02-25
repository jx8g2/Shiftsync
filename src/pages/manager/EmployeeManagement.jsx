import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStoreFilter } from '../../context/StoreFilterContext';
import { employeesAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import './EmployeeManagement.css';

function EmployeeManagement() {
    const { user, isAdmin } = useAuth();
    const { effectiveStoreId } = useStoreFilter();
    const location = useLocation();

    // Determine mode based on URL or role
    // If URL contains 'managers', we are in manager management mode
    // Otherwise default to employee management
    const isManagerView = location.pathname.includes('/managers');
    const basePath = isAdmin ? '/admin' : '/manager';

    const pageTitle = isManagerView ? 'Manager Management' : 'Employee Management';
    const pageSubtitle = isManagerView ? 'Create and manage store managers' : 'Manage your team members and their schedules';
    const targetRole = isManagerView ? 'manager' : 'employee';
    const addLink = isManagerView ? `${basePath}/managers/new` : `${basePath}/employees/new`;
    const addLabel = isManagerView ? 'Add New Manager' : 'Add New Employee';
    const editLinkBase = isManagerView ? `${basePath}/managers` : `${basePath}/employees`;

    const [people, setPeople] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Fetch data from API
    const fetchData = async () => {
        try {
            setLoading(true);
            const response = await employeesAPI.getAll(effectiveStoreId || undefined);
            if (response.success) {
                setPeople(response.employees);
            } else {
                setError(response.error || 'Failed to fetch data');
            }
        } catch (err) {
            setError(err.message || 'Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [isManagerView, effectiveStoreId]); // Refetch if mode or store changes

    // Filter people based on search and target role
    const filteredPeople = people.filter(person => {
        // First filter by role
        if (person.role !== targetRole) return false;

        // Then filter by search term
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
            person.name?.toLowerCase().includes(search) ||
            person.email?.toLowerCase().includes(search) ||
            person.username?.toLowerCase().includes(search) ||
            person.position?.toLowerCase().includes(search)
        );
    });

    const handleDelete = async (id) => {
        try {
            setDeleting(true);
            const response = await employeesAPI.delete(id);
            if (response.success) {
                setPeople(people.filter(p => p.id !== id));
                setDeleteConfirm(null);
            } else {
                setError(response.error || 'Failed to delete user');
            }
        } catch (err) {
            setError(err.message || 'Failed to delete user');
        } finally {
            setDeleting(false);
        }
    };

    const formatShiftSummary = (shifts) => {
        if (!shifts || shifts.length === 0) return 'No shifts assigned';
        const workDays = shifts.filter(s => !s.isOff).length;
        return `${workDays} day${workDays !== 1 ? 's' : ''}/week`;
    };

    if (loading) {
        return (
            <div className="employee-management">
                <div className="page-header">
                    <h1>{pageTitle}</h1>
                </div>
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="employee-management animate-fade-in">
            {isAdmin && (
                <div className="role-tabs">
                    <Link
                        to={`${basePath}/managers`}
                        className={`role-tab ${isManagerView ? 'active' : ''}`}
                    >
                        👔 Managers
                    </Link>
                    <Link
                        to={`${basePath}/employees`}
                        className={`role-tab ${!isManagerView ? 'active' : ''}`}
                    >
                        👥 Employees
                    </Link>
                </div>
            )}

            <div className="page-header">
                <div className="page-header-content">
                    <h1>{pageTitle}</h1>
                    <p className="page-subtitle">{pageSubtitle}</p>
                </div>
                {/* Only show Add button if user is allowed to add this role 
                    Admins can add managers. Managers can add employees.
                */}
                {(isAdmin || !isManagerView) && (
                    <Link to={addLink} className="btn btn-primary">
                        <span className="btn-icon">➕</span>
                        {addLabel}
                    </Link>
                )}
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
                        placeholder="Search by name, email, username..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-input search-input"
                    />
                    {searchTerm && (
                        <button
                            className="search-clear"
                            onClick={() => setSearchTerm('')}
                        >
                            ×
                        </button>
                    )}
                </div>
            </Card>

            <div className="employee-stats">
                <div className="stat-item">
                    <span className="stat-value">{filteredPeople.length}</span>
                    <span className="stat-label">Total {isManagerView ? 'Managers' : 'Employees'}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{filteredPeople.filter(p => p.status === 'active').length}</span>
                    <span className="stat-label">Active</span>
                </div>
            </div>

            {filteredPeople.length === 0 ? (
                <Card className="empty-state">
                    <span className="empty-icon">{isManagerView ? '👔' : '👥'}</span>
                    <h3>No {isManagerView ? 'managers' : 'employees'} found</h3>
                    <p>{searchTerm ? 'Try adjusting your search' : `Add your first ${isManagerView ? 'manager' : 'employee'} to get started`}</p>
                    {!searchTerm && (isAdmin || !isManagerView) && (
                        <Link to={addLink} className="btn btn-primary">
                            {addLabel}
                        </Link>
                    )}
                </Card>
            ) : (
                <div className="employee-grid">
                    {filteredPeople.map(person => (
                        <Card key={person.id} className="employee-card">
                            <div className="employee-card-header">
                                <div className="employee-avatar" data-role={person.role}>
                                    {person.avatar || person.name?.charAt(0)}
                                </div>
                                <div className="employee-info">
                                    <h3 className="employee-name">{person.name}</h3>
                                    <span className="employee-position">{person.position}</span>
                                </div>
                                <span className={`status-badge status-${person.status}`}>
                                    {person.status}
                                </span>
                            </div>

                            <div className="employee-details">
                                <div className="detail-row">
                                    <span className="detail-icon">📧</span>
                                    <span className="detail-value">{person.email}</span>
                                </div>
                                {person.phone && (
                                    <div className="detail-row">
                                        <span className="detail-icon">📱</span>
                                        <span className="detail-value">{person.phone}</span>
                                    </div>
                                )}
                                <div className="detail-row">
                                    <span className="detail-icon">👤</span>
                                    <span className="detail-value">@{person.username}</span>
                                </div>
                                {!isManagerView && (
                                    <div className="detail-row">
                                        <span className="detail-icon">📅</span>
                                        <span className="detail-value">{formatShiftSummary(person.defaultShifts)}</span>
                                    </div>
                                )}
                            </div>

                            <div className="employee-actions">
                                <Link
                                    to={`${editLinkBase}/${person.id}/edit`}
                                    className="btn btn-secondary btn-sm"
                                >
                                    ✏️ Edit
                                </Link>
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => setDeleteConfirm(person)}
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
                        <h3>Delete {isManagerView ? 'Manager' : 'Employee'}</h3>
                        <p>Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?</p>
                        <p className="modal-warning">This action cannot be undone.</p>
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

export default EmployeeManagement;
