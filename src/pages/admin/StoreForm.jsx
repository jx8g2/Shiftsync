import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { storesAPI, employeesAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import './ManagerForm.css';

const US_TIMEZONES = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu'
];

function StoreForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(id);

    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Available managers for assignment
    const [managers, setManagers] = useState([]);

    // Form fields
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [zipCode, setZipCode] = useState('');
    const [phone, setPhone] = useState('');
    const [timezone, setTimezone] = useState('America/Chicago');
    const [managerId, setManagerId] = useState('');

    useEffect(() => {
        fetchManagers();
        if (isEditing) {
            fetchStore();
        }
    }, [id]);

    const fetchManagers = async () => {
        try {
            const res = await employeesAPI.getAll();
            if (res.success) {
                const mgrs = res.employees.filter(e => e.role === 'manager');
                setManagers(mgrs);
            }
        } catch (err) {
            console.error('Failed to fetch managers:', err);
        }
    };

    const fetchStore = async () => {
        try {
            setLoading(true);
            const res = await storesAPI.getById(id);
            if (res.success) {
                const store = res.store;
                setName(store.name || '');
                setAddress(store.address || '');
                setCity(store.city || '');
                setState(store.state || '');
                setZipCode(store.zipCode || '');
                setPhone(store.phone || '');
                setTimezone(store.timezone || 'America/Chicago');
                setManagerId(store.managerId || '');
            } else {
                setError(res.error || 'Failed to load store');
            }
        } catch (err) {
            setError(err.message || 'Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = () => {
        if (!name.trim()) {
            setError('Store name is required');
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!validateForm()) return;

        setSaving(true);

        try {
            const storeData = {
                name: name.trim(),
                address: address.trim(),
                city: city.trim(),
                state: state.trim(),
                zipCode: zipCode.trim(),
                phone: phone.trim(),
                timezone,
                managerId: managerId || null
            };

            let response;
            if (isEditing) {
                response = await storesAPI.update(id, storeData);
            } else {
                response = await storesAPI.create(storeData);
            }

            if (response.success) {
                navigate('/admin/stores');
            } else {
                setError(response.error || 'Failed to save store');
            }
        } catch (err) {
            setError(err.message || 'Failed to connect to server');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="manager-form-page">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading store...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="manager-form-page animate-fade-in">
            <div className="page-header">
                <button
                    className="btn btn-secondary back-btn"
                    onClick={() => navigate('/admin/stores')}
                >
                    ← Back
                </button>
                <div className="page-header-content">
                    <h1>{isEditing ? 'Edit Store' : 'Add New Store'}</h1>
                    <p className="page-subtitle">
                        {isEditing ? `Editing ${id}` : 'Create a new store location'}
                    </p>
                </div>
            </div>

            {error && (
                <div className="error-banner">
                    <span>⚠️</span>
                    {error}
                    <button onClick={() => setError('')} className="error-dismiss">×</button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="manager-form">
                <Card className="form-section">
                    <h2 className="section-title">
                        <span className="section-icon">🏪</span>
                        Store Information
                    </h2>

                    <div className="form-grid">
                        <div className="form-group">
                            <label className="form-label">Store Name *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Downtown Location"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Address</label>
                            <input
                                type="text"
                                className="form-input"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="123 Main Street"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">City</label>
                            <input
                                type="text"
                                className="form-input"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="Austin"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">State</label>
                            <input
                                type="text"
                                className="form-input"
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                placeholder="TX"
                                maxLength={2}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Zip Code</label>
                            <input
                                type="text"
                                className="form-input"
                                value={zipCode}
                                onChange={(e) => setZipCode(e.target.value)}
                                placeholder="78701"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input
                                type="tel"
                                className="form-input"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="(512) 555-0101"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Timezone</label>
                            <select
                                className="form-input"
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                            >
                                {US_TIMEZONES.map(tz => (
                                    <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Assigned Manager</label>
                            <select
                                className="form-input"
                                value={managerId}
                                onChange={(e) => setManagerId(e.target.value)}
                            >
                                <option value="">— No Manager —</option>
                                {managers.map(mgr => (
                                    <option key={mgr.id} value={mgr.id}>
                                        {mgr.name} ({mgr.email})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </Card>

                <div className="form-actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-lg"
                        onClick={() => navigate('/admin/stores')}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        disabled={saving}
                    >
                        {saving ? (
                            <>
                                <span className="spinner" style={{ width: 20, height: 20 }}></span>
                                Saving...
                            </>
                        ) : (
                            isEditing ? 'Update Store' : 'Create Store'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default StoreForm;
