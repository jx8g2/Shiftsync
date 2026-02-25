import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useStoreFilter } from '../../context/StoreFilterContext';
import { DAYS_OF_WEEK, DAY_LABELS } from '../../data/mockData';
import Card from '../../components/ui/Card';
import './StoreHours.css';

function StoreHours() {
    const { user } = useAuth();
    const { getStore, updateStore } = useData();
    const { effectiveStoreId, isAllStores } = useStoreFilter();

    const store = getStore(effectiveStoreId);
    const [hours, setHours] = useState(store?.operatingHours || {});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    const updateDayHours = (day, field, value) => {
        setHours(prev => ({
            ...prev,
            [day]: { ...prev[day], [field]: value }
        }));
    };

    const toggleClosed = (day) => {
        setHours(prev => ({
            ...prev,
            [day]: { ...prev[day], closed: !prev[day].closed }
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        await new Promise(resolve => setTimeout(resolve, 500));

        updateStore(effectiveStoreId, { operatingHours: hours });

        setMessage({ type: 'success', text: 'Store hours updated successfully!' });
        setSaving(false);
        setTimeout(() => setMessage(null), 3000);
    };

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

    if (isAllStores) {
        return (
            <div className="page-container animate-fade-in">
                <div className="empty-state">
                    <div className="empty-state-icon">🏪</div>
                    <h3 className="empty-state-title">Select a Store</h3>
                    <p>Please select a specific store from the header filter to configure store hours.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Store Hours</h1>
                    <p className="page-subtitle">Configure operating hours for {store?.name}</p>
                </div>
            </div>

            <Card>
                {message && (
                    <div className={`message message-${message.type} mb-lg`}>
                        {message.text}
                    </div>
                )}

                <div className="store-hours-grid">
                    {DAYS_OF_WEEK.map(day => {
                        const dayHours = hours[day] || { open: '09:00', close: '17:00', closed: false };

                        return (
                            <div key={day} className={`hours-day ${dayHours.closed ? 'closed' : 'open'}`}>
                                <div className="hours-day-header">
                                    <span className="day-name">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={!dayHours.closed}
                                            onChange={() => toggleClosed(day)}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>

                                {dayHours.closed ? (
                                    <div className="closed-label">Closed</div>
                                ) : (
                                    <div className="hours-inputs">
                                        <div className="time-input-group">
                                            <label>Opens</label>
                                            <select
                                                value={dayHours.open}
                                                onChange={(e) => updateDayHours(day, 'open', e.target.value)}
                                                className="form-select"
                                            >
                                                {timeOptions.map(t => (
                                                    <option key={t} value={t}>{timeToLabel(t)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="time-input-group">
                                            <label>Closes</label>
                                            <select
                                                value={dayHours.close}
                                                onChange={(e) => updateDayHours(day, 'close', e.target.value)}
                                                className="form-select"
                                            >
                                                {timeOptions.map(t => (
                                                    <option key={t} value={t}>{timeToLabel(t)}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="form-actions">
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Hours'}
                    </button>
                </div>
            </Card>
        </div>
    );
}

export default StoreHours;
