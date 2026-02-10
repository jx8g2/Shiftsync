import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { DAYS_OF_WEEK, DAY_LABELS, getWeekStart, addDays, formatDate } from '../../data/mockData';
import Card from '../../components/ui/Card';
import './Availability.css';

function Availability() {
    const { user } = useAuth();
    const { getAvailability, setAvailability } = useData();

    const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    // Get current availability or default
    const currentAvailability = getAvailability(user.id).find(a => a.weekStart === weekStart);

    const defaultSlots = DAYS_OF_WEEK.reduce((acc, day) => ({
        ...acc,
        [day]: { available: false, start: '09:00', end: '17:00' }
    }), {});

    const [slots, setSlots] = useState(currentAvailability?.slots || defaultSlots);

    const handlePrevWeek = () => {
        const newWeekStart = addDays(weekStart, -7);
        setWeekStart(newWeekStart);
        const existing = getAvailability(user.id).find(a => a.weekStart === newWeekStart);
        setSlots(existing?.slots || defaultSlots);
    };

    const handleNextWeek = () => {
        const newWeekStart = addDays(weekStart, 7);
        setWeekStart(newWeekStart);
        const existing = getAvailability(user.id).find(a => a.weekStart === newWeekStart);
        setSlots(existing?.slots || defaultSlots);
    };

    const toggleDay = (day) => {
        setSlots(prev => ({
            ...prev,
            [day]: { ...prev[day], available: !prev[day].available }
        }));
    };

    const updateTime = (day, field, value) => {
        setSlots(prev => ({
            ...prev,
            [day]: { ...prev[day], [field]: value }
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));

        setAvailability(user.id, weekStart, slots);
        setMessage({ type: 'success', text: 'Availability saved successfully!' });
        setSaving(false);

        setTimeout(() => setMessage(null), 3000);
    };

    const timeOptions = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            timeOptions.push(time);
        }
    }

    // Convert 24h time to AM/PM label
    const timeToLabel = (time) => {
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${m} ${ampm}`;
    };

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">My Availability</h1>
                    <p className="page-subtitle">Set your weekly availability for scheduling</p>
                </div>
            </div>

            <Card>
                <div className="week-navigation">
                    <button className="btn btn-secondary btn-icon" onClick={handlePrevWeek}>←</button>
                    <span className="week-label">
                        Week of {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
                    </span>
                    <button className="btn btn-secondary btn-icon" onClick={handleNextWeek}>→</button>
                </div>

                <div className="availability-grid">
                    {DAYS_OF_WEEK.map((day, index) => {
                        const slot = slots[day];
                        const date = addDays(weekStart, index);

                        return (
                            <div key={day} className={`availability-day ${slot.available ? 'available' : 'unavailable'}`}>
                                <div className="day-toggle">
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={slot.available}
                                            onChange={() => toggleDay(day)}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>

                                <div className="day-header">
                                    <span className="day-name">{DAY_LABELS[day]}</span>
                                    <span className="day-date">{new Date(date).getDate()}</span>
                                </div>

                                {slot.available ? (
                                    <div className="day-times">
                                        <div className="time-field">
                                            <label>Start</label>
                                            <select
                                                className="form-select"
                                                value={slot.start}
                                                onChange={(e) => updateTime(day, 'start', e.target.value)}
                                            >
                                                {timeOptions.map(t => (
                                                    <option key={t} value={t}>{timeToLabel(t)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="time-field">
                                            <label>End</label>
                                            <select
                                                className="form-select"
                                                value={slot.end}
                                                onChange={(e) => updateTime(day, 'end', e.target.value)}
                                            >
                                                {timeOptions.map(t => (
                                                    <option key={t} value={t}>{timeToLabel(t)}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="unavailable-label">Unavailable</div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {message && (
                    <div className={`message message-${message.type}`}>
                        {message.text}
                    </div>
                )}

                <div className="form-actions">
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Availability'}
                    </button>
                </div>
            </Card>
        </div>
    );
}

export default Availability;
