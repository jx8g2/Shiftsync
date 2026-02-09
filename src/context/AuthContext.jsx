import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, setToken, removeToken } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for saved session
        const initAuth = async () => {
            const savedUser = localStorage.getItem('shiftsync_user');
            const savedToken = localStorage.getItem('shiftsync_token');

            if (savedUser && savedToken) {
                try {
                    // Verify token is still valid
                    const response = await authAPI.getCurrentUser();
                    if (response.success) {
                        setUser(response.user);
                    } else {
                        // Token invalid, clear storage
                        localStorage.removeItem('shiftsync_user');
                        removeToken();
                    }
                } catch (e) {
                    // API unavailable, use cached user
                    console.warn('API unavailable, using cached user data');
                    try {
                        setUser(JSON.parse(savedUser));
                    } catch {
                        localStorage.removeItem('shiftsync_user');
                        removeToken();
                    }
                }
            }
            setLoading(false);
        };

        initAuth();
    }, []);

    const logAction = useCallback((action, details, actionUser = null) => {
        const logs = JSON.parse(localStorage.getItem('shiftsync_logs') || '[]');
        const currentUser = actionUser || user;
        logs.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            userId: currentUser?.id || 'system',
            userName: currentUser?.name || 'System',
            action,
            details
        });
        // Keep only last 500 logs
        localStorage.setItem('shiftsync_logs', JSON.stringify(logs.slice(0, 500)));
    }, [user]);

    const login = async (email, password) => {
        try {
            const result = await authAPI.login(email, password);

            if (result.success) {
                setUser(result.user);
                localStorage.setItem('shiftsync_user', JSON.stringify(result.user));
                logAction('LOGIN', `${result.user.role === 'manager' ? 'Manager' : 'Employee'} ${result.user.name} logged in`, result.user);
                return { success: true, user: result.user };
            } else {
                return { success: false, error: result.error || 'Login failed' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message || 'Unable to connect to server' };
        }
    };

    const logout = () => {
        if (user) {
            logAction('LOGOUT', `User ${user.name} logged out`);
        }
        setUser(null);
        localStorage.removeItem('shiftsync_user');
        removeToken();
    };

    // Update user data (after profile changes)
    const refreshUser = async () => {
        try {
            const response = await authAPI.getCurrentUser();
            if (response.success) {
                setUser(response.user);
                localStorage.setItem('shiftsync_user', JSON.stringify(response.user));
            }
        } catch (error) {
            console.error('Failed to refresh user:', error);
        }
    };

    const value = {
        user,
        loading,
        login,
        logout,
        logAction,
        refreshUser,
        isEmployee: user?.role === 'employee',
        isManager: user?.role === 'manager',
        isAdmin: user?.role === 'admin'
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
