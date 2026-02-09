import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { employeesAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import './ManagerForm.css';

function ManagerForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(id);

    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Form fields
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [status, setStatus] = useState('active');

    useEffect(() => {
        if (isEditing) {
            fetchManager();
        }
    }, [id]);

    const fetchManager = async () => {
        try {
            setLoading(true);
            const response = await employeesAPI.getById(id);
            if (response.success) {
                const mgr = response.employee;
                setUsername(mgr.username || '');
                setName(mgr.name || '');
                setEmail(mgr.email || '');
                setPhone(mgr.phone || '');
                setStatus(mgr.status || 'active');
            } else {
                setError(response.error || 'Failed to load manager');
            }
        } catch (err) {
            setError(err.message || 'Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = () => {
        if (!username.trim()) {
            setError('Username is required');
            return false;
        }
        if (!isEditing && !password) {
            setError('Password is required');
            return false;
        }
        if (password && password.length < 6) {
            setError('Password must be at least 6 characters');
            return false;
        }
        if (password && password !== confirmPassword) {
            setError('Passwords do not match');
            return false;
        }
        if (!name.trim()) {
            setError('Name is required');
            return false;
        }
        if (!email.trim()) {
            setError('Email is required');
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
            const managerData = {
                username: username.trim(),
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim(),
                role: 'manager',
                position: 'Store Manager',
                status
            };

            if (password) {
                managerData.password = password;
            }

            let response;
            if (isEditing) {
                response = await employeesAPI.update(id, managerData);
            } else {
                response = await employeesAPI.create(managerData);
            }

            if (response.success) {
                navigate('/admin/managers');
            } else {
                setError(response.error || 'Failed to save manager');
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
                    <p>Loading manager...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="manager-form-page animate-fade-in">
            <div className="page-header">
                <button
                    className="btn btn-secondary back-btn"
                    onClick={() => navigate('/admin/managers')}
                >
                    ← Back
                </button>
                <div className="page-header-content">
                    <h1>{isEditing ? 'Edit Manager' : 'Add New Manager'}</h1>
                    <p className="page-subtitle">
                        {isEditing ? 'Update manager information' : 'Create a new manager account'}
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
                        <span className="section-icon">👔</span>
                        Manager Information
                    </h2>

                    <div className="form-grid">
                        <div className="form-group">
                            <label className="form-label">Username *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter username"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Full Name *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter full name"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Email *</label>
                            <input
                                type="email"
                                className="form-input"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter email address"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Phone Number</label>
                            <input
                                type="tel"
                                className="form-input"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="(555) 555-5555"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">
                                Password {isEditing ? '(leave blank to keep current)' : '*'}
                            </label>
                            <input
                                type="password"
                                className="form-input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={isEditing ? 'Enter new password' : 'Create password'}
                                required={!isEditing}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirm Password</label>
                            <input
                                type="password"
                                className="form-input"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm password"
                                required={Boolean(password)}
                            />
                        </div>

                        {isEditing && (
                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select
                                    className="form-input"
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                        )}
                    </div>
                </Card>

                <div className="form-actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-lg"
                        onClick={() => navigate('/admin/managers')}
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
                            isEditing ? 'Update Manager' : 'Create Manager'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default ManagerForm;
