import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { backupsAPI } from '../../utils/api';
import './BackupSettings.css';

/**
 * Build a cron expression from a numeric value + unit.
 *  - unit 'minutes': every N minutes  => `*\/N * * * *`
 *  - unit 'hours':   every N hours     => `0 *\/N * * *`  (special-case 24h = `0 0 * * *`)
 */
const buildCron = (value, unit) => {
    const v = parseInt(value, 10);
    if (isNaN(v) || v <= 0) return '0 0 * * *';

    if (unit === 'minutes') {
        // node-cron supports 1-59 minutes; cap at 59
        const mins = Math.min(v, 59);
        return `*/${mins} * * * *`;
    }

    // hours
    if (v === 24) return '0 0 * * *';
    if (v > 24) {
        const days = Math.floor(v / 24) || 1;
        return `0 0 */${days} * *`;
    }
    return `0 */${v} * * *`;
};

/**
 * Parse a stored cron expression back into { value, unit }.
 */
const parseCron = (cronStr) => {
    if (!cronStr) return { value: 24, unit: 'hours' };

    const parts = cronStr.split(' ');
    if (parts.length < 5) return { value: 24, unit: 'hours' };

    const [minutePart, hourPart, dayPart] = parts;

    // Every-N-minutes pattern: `*/N * * * *`
    if (minutePart.startsWith('*/') && hourPart === '*') {
        return { value: parseInt(minutePart.replace('*/', ''), 10), unit: 'minutes' };
    }

    // Daily at midnight: `0 0 * * *`
    if (minutePart === '0' && hourPart === '0' && dayPart === '*') {
        return { value: 24, unit: 'hours' };
    }

    // Every-N-hours: `0 */N * * *`
    if (minutePart === '0' && hourPart.startsWith('*/')) {
        return { value: parseInt(hourPart.replace('*/', ''), 10), unit: 'hours' };
    }

    // Every-N-days: `0 0 */N * *`
    if (minutePart === '0' && hourPart === '0' && dayPart.startsWith('*/')) {
        return { value: parseInt(dayPart.replace('*/', ''), 10) * 24, unit: 'hours' };
    }

    return { value: 24, unit: 'hours' };
};

/** Human-readable label for the current schedule */
const describeSchedule = (value, unit) => {
    const v = parseInt(value, 10);
    if (!v || v <= 0) return 'Invalid schedule';
    if (unit === 'minutes') return `every ${v} minute${v === 1 ? '' : 's'}`;
    if (v === 24) return 'every 24 hours (daily)';
    if (v > 24) {
        const days = Math.floor(v / 24);
        return `every ${days} day${days === 1 ? '' : 's'}`;
    }
    return `every ${v} hour${v === 1 ? '' : 's'}`;
};

const BackupSettings = () => {
    const { user } = useAuth();
    const [backups, setBackups] = useState([]);
    const [schedule, setSchedule] = useState('0 0 * * *'); // raw cron
    const [intervalValue, setIntervalValue] = useState(24);
    const [intervalUnit, setIntervalUnit] = useState('hours');
    const [maxCount, setMaxCount] = useState(7);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false); // separate from loading
    const [restoring, setRestoring] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        fetchConfig();
        fetchMaxCount();
        fetchBackups();
    }, []);

    const fetchConfig = async () => {
        try {
            const data = await backupsAPI.getConfig();
            if (data.success) {
                const cronStr = data.schedule || '0 0 * * *';
                setSchedule(cronStr);
                const { value, unit } = parseCron(cronStr);
                setIntervalValue(value);
                setIntervalUnit(unit);
            }
        } catch (error) {
            console.error('Failed to fetch backup config:', error);
        }
    };

    const fetchMaxCount = async () => {
        try {
            const data = await backupsAPI.getMaxCount();
            if (data.success) setMaxCount(data.maxCount);
        } catch (error) {
            console.error('Failed to fetch max backup count:', error);
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
        const newCron = buildCron(intervalValue, intervalUnit);
        try {
            const res = await backupsAPI.updateConfig(newCron);
            if (res.success) {
                setSchedule(newCron);
                showMessage(
                    `Schedule saved — backups will run ${describeSchedule(intervalValue, intervalUnit)}`,
                    'success'
                );
            } else {
                showMessage(res.error || 'Failed to update schedule', 'error');
            }
        } catch (error) {
            showMessage(error.message || 'Failed to update schedule', 'error');
        }
    };

    const handleMaxCountChange = async (e) => {
        e.preventDefault();
        try {
            const res = await backupsAPI.updateMaxCount(maxCount);
            if (res.success) {
                setMaxCount(res.maxCount);
                showMessage(`Retention limit set to ${res.maxCount} backup${res.maxCount === 1 ? '' : 's'}`, 'success');
            } else {
                showMessage(res.error || 'Failed to update retention limit', 'error');
            }
        } catch (error) {
            showMessage(error.message || 'Failed to update retention limit', 'error');
        }
    };

    const handleCreateBackup = async () => {
        try {
            setCreating(true);
            const res = await backupsAPI.create();
            if (res.success) {
                showMessage('Backup started in the background — list will refresh shortly', 'success');
                setTimeout(fetchBackups, 3000);
            } else {
                showMessage(res.error || 'Failed to start backup', 'error');
            }
        } catch (error) {
            showMessage(error.message || 'Failed to start backup', 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleRestore = async (filename) => {
        if (!window.confirm(`WARNING: Restoring "${filename}" will OVERWRITE the current database. Are you sure?`)) {
            return;
        }
        try {
            setRestoring(true);
            const res = await backupsAPI.restore(filename);
            if (res.success) {
                showMessage('Database restored successfully! Please restart the application.', 'success');
            }
        } catch (error) {
            showMessage('Restore failed: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            setRestoring(false);
        }
    };

    const showMessage = (text, type) => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 6000);
    };

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 Bytes';
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
                <p className="subtitle">Manage automated backup schedules and restore points.</p>
            </div>

            {message && (
                <div className={`message-alert ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* ── Configuration Grid ── */}
            <div className="settings-grid">
                {/* ── Backup Schedule ── */}
                <div className="settings-section">
                    <h2>Automated Schedule</h2>
                    <form className="schedule-form" onSubmit={handleScheduleChange}>
                        <label>Backup interval:</label>
                        <div className="time-input-group">
                            <input
                                type="number"
                                min="1"
                                max={intervalUnit === 'minutes' ? 59 : 720}
                                value={intervalValue}
                                onChange={(e) => setIntervalValue(e.target.value)}
                                className="interval-number-input"
                            />
                            <select
                                value={intervalUnit}
                                onChange={(e) => setIntervalUnit(e.target.value)}
                                className="interval-unit-select"
                            >
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                            </select>
                            <button type="submit" className="btn-primary">
                                Save Schedule
                            </button>
                        </div>
                        <p className="cron-info">
                            Runs {describeSchedule(intervalValue, intervalUnit)}
                            {' '}<span className="cron-raw">({schedule})</span>
                        </p>
                    </form>
                </div>

                {/* ── Retention Limit ── */}
                <div className="settings-section">
                    <h2>Retention Limit</h2>
                    <form className="schedule-form" onSubmit={handleMaxCountChange}>
                        <label>Maximum backups to keep:</label>
                        <div className="time-input-group">
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={maxCount}
                                onChange={(e) => setMaxCount(e.target.value)}
                                className="interval-number-input"
                            />
                            <button type="submit" className="btn-primary">
                                Save Limit
                            </button>
                        </div>
                        <p className="cron-info">
                            Oldest is automatically deleted after {maxCount} saved backups.
                        </p>
                    </form>
                </div>
            </div>

            {/* ── Available Backups ── */}
            <div className="settings-section">
                <div className="section-header">
                    <h2>Available Backups</h2>
                    <button
                        className="btn-primary"
                        onClick={handleCreateBackup}
                        disabled={creating || restoring}
                    >
                        {creating ? 'Starting...' : '⬛ Backup Now'}
                    </button>
                </div>

                {loading ? (
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
                                                    disabled={restoring || creating}
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
