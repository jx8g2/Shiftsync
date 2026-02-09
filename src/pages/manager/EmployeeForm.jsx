import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { employeesAPI } from '../../utils/api';
import { DAYS_OF_WEEK, DAY_LABELS, ROLES, POSITIONS } from '../../utils/constants';
import Card from '../../components/ui/Card';
import './EmployeeForm.css';

function EmployeeForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(id);

    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Basic info
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [position, setPosition] = useState('Cashier');
    const [hourlyRate, setHourlyRate] = useState('15.00');
    const [maxHoursPerWeek, setMaxHoursPerWeek] = useState('40');
    const [status, setStatus] = useState('active');

    // Default shifts for each day
    const [defaultShifts, setDefaultShifts] = useState(
        DAYS_OF_WEEK.map(day => ({
            dayOfWeek: day,
            startTime: '09:00',
            endTime: '17:00',
            primaryRole: '',
            isOff: true
        }))
    );

    // Additional roles
    const [additionalRoles, setAdditionalRoles] = useState([]);
    const [newRole, setNewRole] = useState('');

    // Fetch employee data if editing
    useEffect(() => {
        if (isEditing) {
            fetchEmployee();
        }
    }, [id]);

    const fetchEmployee = async () => {
        try {
            setLoading(true);
            const response = await employeesAPI.getById(id);
            if (response.success) {
                const emp = response.employee;
                setUsername(emp.username || '');
                setName(emp.name || '');
                setEmail(emp.email || '');
                setPhone(emp.phone || '');
                setPosition(emp.position || 'Cashier');
                setHourlyRate(emp.hourlyRate?.toString() || '15.00');
                setMaxHoursPerWeek(emp.maxHoursPerWeek?.toString() || '40');
                setStatus(emp.status || 'active');
                setAdditionalRoles(emp.additionalRoles || []);

                // Map existing shifts to form state
                if (emp.defaultShifts && emp.defaultShifts.length > 0) {
                    setDefaultShifts(DAYS_OF_WEEK.map(day => {
                        const existingShift = emp.defaultShifts.find(s => s.dayOfWeek === day);
                        if (existingShift) {
                            return {
                                dayOfWeek: day,
                                startTime: existingShift.startTime || '09:00',
                                endTime: existingShift.endTime || '17:00',
                                primaryRole: existingShift.primaryRole || '',
                                isOff: existingShift.isOff
                            };
                        }
                        return {
                            dayOfWeek: day,
                            startTime: '09:00',
                            endTime: '17:00',
                            primaryRole: '',
                            isOff: true
                        };
                    }));
                }
            } else {
                setError(response.error || 'Failed to load employee');
            }
        } catch (err) {
            setError(err.message || 'Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    const updateShift = (dayOfWeek, field, value) => {
        setDefaultShifts(shifts =>
            shifts.map(shift =>
                shift.dayOfWeek === dayOfWeek
                    ? { ...shift, [field]: value }
                    : shift
            )
        );
    };

    // Time options for dropdowns
    const timeOptions = [];
    for (let h = 0; h < 24; h++) {
        timeOptions.push(`${h.toString().padStart(2, '0')}:00`);
        timeOptions.push(`${h.toString().padStart(2, '0')}:30`);
    }

    // Convert 24h time to AM/PM label
    const timeToLabel = (time) => {
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${m} ${ampm}`;
    };

    const addAdditionalRole = () => {
        if (newRole && !additionalRoles.includes(newRole)) {
            setAdditionalRoles([...additionalRoles, newRole]);
            setNewRole('');
        }
    };

    const removeAdditionalRole = (role) => {
        setAdditionalRoles(additionalRoles.filter(r => r !== role));
    };

    const validateForm = () => {
        if (!username.trim()) {
            setError('Username is required');
            return false;
        }
        if (!isEditing && !password) {
            setError('Password is required for new employees');
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
            setError('Employee name is required');
            return false;
        }
        if (!email.trim()) {
            setError('Email is required');
            return false;
        }
        if (!phone.trim()) {
            setError('Phone number is required');
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
            const employeeData = {
                username: username.trim(),
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim(),
                position,
                hourlyRate: parseFloat(hourlyRate),
                maxHoursPerWeek: parseInt(maxHoursPerWeek),
                status,
                defaultShifts: defaultShifts.map(shift => ({
                    ...shift,
                    startTime: shift.isOff ? null : shift.startTime,
                    endTime: shift.isOff ? null : shift.endTime
                })),
                additionalRoles
            };

            // Include password only if provided
            if (password) {
                employeeData.password = password;
            }

            let response;
            if (isEditing) {
                response = await employeesAPI.update(id, employeeData);
            } else {
                response = await employeesAPI.create(employeeData);
            }

            if (response.success) {
                navigate('/manager/employees');
            } else {
                setError(response.error || 'Failed to save employee');
            }
        } catch (err) {
            setError(err.message || 'Failed to connect to server');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="employee-form-page">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading employee...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="employee-form-page">
            <div className="page-header">
                <button
                    className="btn btn-secondary back-btn"
                    onClick={() => navigate('/manager/employees')}
                >
                    ← Back
                </button>
                <div className="page-header-content">
                    <h1>{isEditing ? 'Edit Employee' : 'Add New Employee'}</h1>
                    <p className="page-subtitle">
                        {isEditing ? 'Update employee information and schedule' : 'Set up a new team member account'}
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

            <form onSubmit={handleSubmit} className="employee-form">
                {/* Basic Information Section */}
                <Card className="form-section">
                    <h2 className="section-title">
                        <span className="section-icon">👤</span>
                        Basic Information
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
                            <label className="form-label">Employee Name *</label>
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
                            <label className="form-label">Phone Number *</label>
                            <input
                                type="tel"
                                className="form-input"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="(555) 555-5555"
                                required
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

                        <div className="form-group">
                            <label className="form-label">Position</label>
                            <select
                                className="form-input"
                                value={position}
                                onChange={(e) => setPosition(e.target.value)}
                            >
                                {POSITIONS.map(pos => (
                                    <option key={pos} value={pos}>{pos}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Hourly Rate ($)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={hourlyRate}
                                onChange={(e) => setHourlyRate(e.target.value)}
                                min="0"
                                step="0.01"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Max Hours/Week</label>
                            <input
                                type="number"
                                className="form-input"
                                value={maxHoursPerWeek}
                                onChange={(e) => setMaxHoursPerWeek(e.target.value)}
                                min="0"
                                max="80"
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

                {/* Default Shifts Section */}
                <Card className="form-section">
                    <h2 className="section-title">
                        <span className="section-icon">📅</span>
                        Default Weekly Schedule
                    </h2>
                    <p className="section-description">
                        Set the default shift times and role for each day of the week
                    </p>

                    <div className="shifts-table">
                        <div className="shifts-header">
                            <span>Day</span>
                            <span>Day Off</span>
                            <span>Start Time</span>
                            <span>End Time</span>
                            <span>Role</span>
                        </div>

                        {defaultShifts.map(shift => (
                            <div key={shift.dayOfWeek} className={`shift-row ${shift.isOff ? 'day-off' : ''}`}>
                                <span className="shift-day">
                                    {DAY_LABELS[shift.dayOfWeek] || shift.dayOfWeek}
                                </span>

                                <label className="checkbox-container">
                                    <input
                                        type="checkbox"
                                        checked={shift.isOff}
                                        onChange={(e) => updateShift(shift.dayOfWeek, 'isOff', e.target.checked)}
                                    />
                                    <span className="checkmark"></span>
                                </label>

                                <select
                                    className="form-input shift-time"
                                    value={shift.startTime}
                                    onChange={(e) => updateShift(shift.dayOfWeek, 'startTime', e.target.value)}
                                    disabled={shift.isOff}
                                >
                                    {timeOptions.map(t => (
                                        <option key={t} value={t}>{timeToLabel(t)}</option>
                                    ))}
                                </select>

                                <select
                                    className="form-input shift-time"
                                    value={shift.endTime}
                                    onChange={(e) => updateShift(shift.dayOfWeek, 'endTime', e.target.value)}
                                    disabled={shift.isOff}
                                >
                                    {timeOptions.map(t => (
                                        <option key={t} value={t}>{timeToLabel(t)}</option>
                                    ))}
                                </select>

                                <select
                                    className="form-input shift-role"
                                    value={shift.primaryRole}
                                    onChange={(e) => updateShift(shift.dayOfWeek, 'primaryRole', e.target.value)}
                                    disabled={shift.isOff}
                                >
                                    <option value="">Select role...</option>
                                    {ROLES.map(role => (
                                        <option key={role} value={role}>{role}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Additional Roles Section */}
                <Card className="form-section">
                    <h2 className="section-title">
                        <span className="section-icon">🔄</span>
                        Additional Roles
                    </h2>
                    <p className="section-description">
                        Add roles this employee can cover when needed (for shift flexibility)
                    </p>

                    <div className="additional-roles-container">
                        <div className="add-role-row">
                            <select
                                className="form-input role-select"
                                value={newRole}
                                onChange={(e) => setNewRole(e.target.value)}
                            >
                                <option value="">Select a role to add...</option>
                                {ROLES.filter(r => !additionalRoles.includes(r)).map(role => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={addAdditionalRole}
                                disabled={!newRole}
                            >
                                + Add Role
                            </button>
                        </div>

                        {additionalRoles.length > 0 ? (
                            <div className="roles-list">
                                {additionalRoles.map((role, idx) => (
                                    <div key={idx} className="role-item">
                                        <span>{role}</span>
                                        <button
                                            type="button"
                                            className="role-remove"
                                            onClick={() => removeAdditionalRole(role)}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="no-roles-message">No additional roles added yet</p>
                        )}
                    </div>
                </Card>

                {/* Form Actions */}
                <div className="form-actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-lg"
                        onClick={() => navigate('/manager/employees')}
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
                            isEditing ? 'Update Employee' : 'Create Employee'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default EmployeeForm;
