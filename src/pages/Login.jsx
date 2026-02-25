import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await login(email, password);

        if (result.success) {
            // Redirect based on role
            if (result.user.role === 'admin') {
                navigate('/admin');
            } else if (result.user.role === 'manager') {
                navigate('/manager');
            } else {
                navigate('/employee');
            }
        } else {
            setError(result.error);
        }

        setLoading(false);
    };

    return (
        <div className="login-page">
            <div className="login-background">
                <div className="bg-gradient bg-gradient-1"></div>
                <div className="bg-gradient bg-gradient-2"></div>
                <div className="bg-gradient bg-gradient-3"></div>
            </div>

            <div className="login-container">
                <div className="login-header">
                    <div className="login-logo">
                        <span className="logo-icon">⏱️</span>
                        <h1>ShiftSync</h1>
                    </div>
                    <p className="login-subtitle">Employee Scheduling Made Simple</p>
                </div>

                <form className="login-form" onSubmit={handleLogin}>
                    <div className="form-group">
                        <label className="form-label">Email or Username</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Enter username or email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            className="form-input"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <div className="login-error">{error}</div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg login-btn"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="spinner" style={{ width: 20, height: 20 }}></span>
                        ) : (
                            'Sign In'
                        )}
                    </button>

                    <div className="login-info">
                        <p className="login-info-text">
                            <span className="info-icon">ℹ️</span>
                            Contact your manager to set up your account
                        </p>
                    </div>
                </form>

                <div className="login-features">
                    <div className="feature">
                        <span className="feature-icon">📅</span>
                        <span>Smart Scheduling</span>
                    </div>
                    <div className="feature">
                        <span className="feature-icon">🔔</span>
                        <span>Shift Reminders</span>
                    </div>
                    <div className="feature">
                        <span className="feature-icon">📊</span>
                        <span>Labor Reports</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;
