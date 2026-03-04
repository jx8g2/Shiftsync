import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useStoreFilter } from '../../context/StoreFilterContext';
import { employeesAPI } from '../../utils/api';
import Card from '../../components/ui/Card';
import '../employee/Dashboard.css';

function AdminDashboard() {
    const { user } = useAuth();
    const { stores, selectedStoreId } = useStoreFilter();
    const [stats, setStats] = useState({
        totalStores: 0,
        managers: 0,
        totalEmployees: 0,
        activeUsers: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, [selectedStoreId, stores]);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);

            // Fetch employees (optionally filtered by store)
            const empUrl = selectedStoreId !== 'all' ? `?storeId=${selectedStoreId}` : '';
            const empRes = await employeesAPI.getAll(selectedStoreId !== 'all' ? selectedStoreId : undefined);

            let allEmployees = [];
            if (empRes.success) {
                allEmployees = empRes.employees;
            }

            const managers = allEmployees.filter(e => e.role === 'manager');
            const regularEmployees = allEmployees.filter(e => e.role === 'employee');
            const activeUsers = allEmployees.filter(e => e.status === 'active');

            setStats({
                totalStores: stores.length,
                managers: managers.length,
                totalEmployees: regularEmployees.length,
                activeUsers: activeUsers.length
            });
        } catch (err) {
            console.error('Failed to fetch dashboard data:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container animate-fade-in">
            <div className="dashboard-welcome">
                <div>
                    <h2>Welcome back, {user.name.split(' ')[0]}! 🏰</h2>
                    <p>System Overview{selectedStoreId !== 'all' ? ` — ${stores.find(s => s.id === selectedStoreId)?.name || ''}` : ''}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 mb-lg">
                <Link to="/admin/stores" className="stat-link-wrapper">
                    <Card.Stat
                        icon="🏪"
                        iconColor="secondary"
                        value={loading ? '...' : stats.totalStores}
                        label="Total Stores"
                    />
                </Link>

                <Link to="/admin/managers" className="stat-link-wrapper">
                    <Card.Stat
                        icon="👔"
                        iconColor="primary"
                        value={loading ? '...' : stats.managers}
                        label="Total Managers"
                    />
                </Link>
            </div>
        </div >
    );
}

export default AdminDashboard;
