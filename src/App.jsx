import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';

// Clear old incompatible data on first load
const DATA_VERSION = 'v3';
if (localStorage.getItem('shiftsync_version') !== DATA_VERSION) {
    localStorage.removeItem('shiftsync_data');
    localStorage.removeItem('shiftsync_user');
    localStorage.removeItem('shiftsync_users');
    localStorage.removeItem('shiftsync_logs');
    localStorage.setItem('shiftsync_version', DATA_VERSION);
    window.location.reload();
}

// Layout
import Layout from './components/layout/Layout';

// Auth
import Login from './pages/Login';

// Employee Pages
import EmployeeDashboard from './pages/employee/Dashboard';
import Availability from './pages/employee/Availability';
import TimeOffRequests from './pages/employee/TimeOffRequests';
import MySchedule from './pages/employee/MySchedule';

// Manager Pages
import ManagerDashboard from './pages/manager/Dashboard';
import RequestApprovals from './pages/manager/RequestApprovals';
import ScheduleBuilder from './pages/manager/ScheduleBuilder';
import StoreHours from './pages/manager/StoreHours';
import LaborReports from './pages/manager/LaborReports';
import EmployeeManagement from './pages/manager/EmployeeManagement';
import EmployeeForm from './pages/manager/EmployeeForm';

// Admin Pages
import ManagerForm from './pages/admin/ManagerForm';

// Shared Pages
import Chat from './pages/Chat';

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }) {
    const { user, isEmployee, isManager, isAdmin } = useAuth();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    const roleCheck = {
        employee: isEmployee || isManager || isAdmin,
        manager: isManager || isAdmin,
        admin: isAdmin
    };

    const hasAccess = allowedRoles.some(role => roleCheck[role]);

    if (!hasAccess) {
        // Redirect to appropriate dashboard based on role
        if (isAdmin) return <Navigate to="/manager" replace />;
        if (isManager) return <Navigate to="/manager" replace />;
        return <Navigate to="/employee" replace />;
    }

    return children;
}

// Role-based redirect from root
function RootRedirect() {
    const { user, isManager, isAdmin } = useAuth();

    if (!user) return <Navigate to="/login" replace />;
    // Both admin and manager now go to the unified manager dashboard
    if (isAdmin || isManager) return <Navigate to="/manager" replace />;
    return <Navigate to="/employee" replace />;
}

function AppRoutes() {
    const { user, loading } = useAuth();

    // Wait for auth to initialize before rendering routes
    if (loading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: 'var(--color-bg-primary)'
            }}>
                <div className="spinner" style={{ width: 48, height: 48 }}></div>
            </div>
        );
    }

    return (
        <Routes>
            {/* Public Routes */}
            <Route
                path="/login"
                element={user ? <RootRedirect /> : <Login />}
            />

            {/* Root Redirect */}
            <Route path="/" element={<RootRedirect />} />

            {/* Employee Routes */}
            <Route
                path="/employee"
                element={
                    <ProtectedRoute allowedRoles={['employee']}>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<EmployeeDashboard />} />
                <Route path="availability" element={<Availability />} />
                <Route path="time-off" element={<TimeOffRequests />} />
                <Route path="schedule" element={<MySchedule />} />
                <Route path="chat" element={<Chat />} />
            </Route>

            {/* Manager Routes (Accessed by Manager & Admin) */}
            <Route
                path="/manager"
                element={
                    <ProtectedRoute allowedRoles={['manager']}>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<ManagerDashboard />} />
                <Route path="employees" element={<EmployeeManagement />} />
                <Route path="employees/new" element={<EmployeeForm />} />
                <Route path="employees/:id/edit" element={<EmployeeForm />} />
                <Route path="requests" element={<RequestApprovals />} />
                <Route path="schedule-builder" element={<ScheduleBuilder />} />
                <Route path="store-hours" element={<StoreHours />} />
                <Route path="reports" element={<LaborReports />} />

                {/* Admin-only routes nested under manager */}
                <Route path="managers" element={<EmployeeManagement />} />
                <Route path="managers/new" element={<ManagerForm />} />
                <Route path="managers/:id/edit" element={<ManagerForm />} />

                {/* Shared routes */}
                <Route path="chat" element={<Chat />} />
            </Route>

            {/* Admin specific override - redirect to manager dashboard */}
            <Route
                path="/admin"
                element={<Navigate to="/manager" replace />}
            />

            {/* 404 Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <BrowserRouter>
            <ThemeProvider>
                <AuthProvider>
                    <NotificationProvider>
                        <DataProvider>
                            <AppRoutes />
                        </DataProvider>
                    </NotificationProvider>
                </AuthProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}

export default App;
