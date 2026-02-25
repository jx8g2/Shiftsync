import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { backupsAPI } from '../../utils/api';
import './BackupSettings.css';

const BackupSettings = () => {
    const { user } = useAuth();
    const [backups, setBackups] = useState([]);
    const [schedule, setSchedule] = useState('');
    const [hoursInput, setHoursInput] = useState(24);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState(false);
    const [message, setMessage] = useState(null);

    const cronToHours = (cronStr) => {
        if (!cronStr) return 24;
        if (cronStr === '0 0 * * *') return 24;

        const parts = cronStr.split(' ');
        if (parts.length >= 3) {
            const hourPart = parts[1];
            const dayPart = parts[2];

            if (hourPart.startsWith('*/')) {
                return parseInt(hourPart.replace('*/', ''), 10);
            } else if (dayPart.startsWith('*/') && hourPart === '0') {
                return parseInt(dayPart.replace('*/', ''), 10) * 24;
            }
        }
        return 24; // fallback
    };

    const hoursToCron = (hours) => {
        const h = parseInt(hours, 10);
        if (isNaN(h) || h <= 0) return '0 0 * * *';
        if (h === 24) return '0 0 * * *';
        if (h < 24) return `0 */${h} * * *`;

        if (h > 24) {
            const days = Math.floor(h / 24) || 1;
            return `0 0 */${days} * *`;
        }
        return '0 0 * * *'; // fallback
    };

    useEffect(() => {
        fetchConfig();
        fetchBackups();
    }, []);

    const fetchConfig = async () => {
        try {
            const data = await backupsAPI.getConfig();
            if (data.success) {
                setSchedule(data.schedule);
                setHoursInput(cronToHours(data.schedule));
            }
        } catch (error) {
            console.error('Failed to fetch config:', error);
        }
    };

    const fetchBackups = async () => {
        try {
            setLoading(true);
            const data = await backupsAPI.getList();
            if (data.success) {
                setBackups(data.backups);
            }
        } catch (error) {
            console.error('Failed to fetch backups:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleScheduleChange = async (e) => {
        e.preventDefault();

        const newCron = hoursToCron(hoursInput);

        try {
            const res = await backupsAPI.updateConfig(newCron);
            if (res.success) {
                setSchedule(newCron);
                setHoursInput(cronToHours(newCron)); // Normalize input
                showMessage(`Schedule updated to run every ${cronToHours(newCron)} hours`, 'success');
            }
        } catch (error) {
            showMessage(error.message || 'Failed to update schedule', 'error');
        }
    };

    const handleCreateBackup = async () => {
        try {
            const res = await backupsAPI.create();
            if (res.success) {
                showMessage('Backup started in background', 'success');
                // Refresh list after a delay
                setTimeout(fetchBackups, 2000);
            }
        } catch (error) {
            showMessage('Failed to start backup', 'error');
        }
    };

    const handleRestore = async (filename) => {
        if (!window.confirm(`WARNING: Restoring ${filename} will OVERWRITE the current database. Are you sure?`)) {
            return;
        }

        try {
            setRestoring(true);
            const res = await backupsAPI.restore(filename);
            if (res.success) {
                showMessage('Database restored successfully! Please restart the application.', 'success');
            }
        } catch (error) {
            showMessage('Restore failed: ' + error.message, 'error');
        } finally {
            setRestoring(false);
        }
    };

    const showMessage = (text, type) => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 5000);
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (user.role !== 'admin') {
        return <div className="p-4">Access Denied. Admin only.</div>;
    }

    return (
        <div className="backup-settings-container animate-fade-in">
            <div className="page-header">
                <h1>Database Backups</h1>
                <p className="subtitle">Manage automated backups and automated restoration.</p>
            </div>

            {message && (
                <div className={`message-alert ${message.type}`}>
                    {message.text}
                </div>
            )}

            <div className="settings-section">
                <h2>Automated Schedule</h2>
                <div className="schedule-form">
                    <label>Hours between backups:</label>
                    <div className="time-input-group">
                        <input
                            type="number"
                            min="1"
                            max="720"
                            value={hoursInput}
                            onChange={(e) => setHoursInput(e.target.value)}
                            style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        />
                        <button className="btn btn-primary" onClick={handleScheduleChange}>
                            Save Schedule
                        </button>
                    </div>
                    <p className="cron-info">Current Internal Cron: <code>{schedule}</code> (Runs every {cronToHours(schedule)} hours)</p>
                </div>
            </div>

            <div className="settings-section">
                <div className="section-header">
                    <h2>Available Backups</h2>
                    <button className="btn-primary" onClick={handleCreateBackup} disabled={loading || restoring}>
                        {loading ? 'Creating...' : 'Backup Now'}
                    </button>
                </div>

                {loading && !backups.length ? (
                    <p>Loading backups...</p>
                ) : (
                    <div className="backups-table-container">
                        <table className="backups-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Filename</th>
                                    <th>Size</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {backups.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="text-center">No backups found</td>
                                    </tr>
                                ) : (
                                    backups.map((backup) => (
                                        <tr key={backup.filename}>
                                            <td>{new Date(backup.createdAt).toLocaleString()}</td>
                                            <td className="filename">{backup.filename}</td>
                                            <td>{formatBytes(backup.size)}</td>
                                            <td>
                                                <button
                                                    className="btn-restore"
                                                    onClick={() => handleRestore(backup.filename)}
                                                    disabled={restoring}
                                                >
                                                    {restoring ? 'Restoring...' : 'Restore'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {restoring && (
                <div className="restore-overlay">
                    <div className="restore-modal">
                        <div className="spinner"></div>
                        <h3>Restoring Database...</h3>
                        <p>Please do not close this window.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BackupSettings;
