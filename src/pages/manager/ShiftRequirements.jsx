import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { DAYS_OF_WEEK } from '../../utils/constants';
import Card from '../../components/ui/Card';
import './ShiftRequirements.css';

function ShiftRequirements() {
    const { user } = useAuth();
    const { getShiftRequirements, saveShiftRequirements, getStore } = useData();

    const store = getStore(user.storeId);
    const existingRequirements = getShiftRequirements(user.storeId);

    const [requirements, setRequirements] = useState(existingRequirements);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    const timeSlots = [
        { id: 'morning', label: 'Morning', start: '06:00', end: '14:00' },
        { id: 'afternoon', label: 'Afternoon', start: '14:00', end: '22:00' },
        { id: 'evening', label: 'Evening', start: '18:00', end: '23:00' }
    ];

    const getRequirement = (day, slotId) => {
        return requirements.find(r => r.day === day && r.timeSlot === slotId);
    };

    const updateRequirement = (day, slotId, field, value) => {
        const existing = getRequirement(day, slotId);

        if (existing) {
            setRequirements(prev => prev.map(r =>
                r.day === day && r.timeSlot === slotId
                    ? { ...r, [field]: parseInt(value) || 0 }
                    : r
            ));
        } else {
            const slot = timeSlots.find(s => s.id === slotId);
            setRequirements(prev => [...prev, {
                id: `req-${Date.now()}`,
                day,
                timeSlot: slotId,
                startTime: slot.start,
                endTime: slot.end,
                minEmployees: field === 'minEmployees' ? parseInt(value) || 0 : 1,
                preferredEmployees: field === 'preferredEmployees' ? parseInt(value) || 0 : 2
            }]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        await new Promise(resolve => setTimeout(resolve, 500));

        saveShiftRequirements(user.storeId, requirements);

        setMessage({ type: 'success', text: 'Shift requirements saved successfully!' });
        setSaving(false);
        setTimeout(() => setMessage(null), 3000);
    };

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Shift Requirements</h1>
                    <p className="page-subtitle">Define minimum staffing levels for {store?.name}</p>
                </div>
            </div>

            <Card>
                {message && (
                    <div className={`message message-${message.type} mb-lg`}>
                        {message.text}
                    </div>
                )}

                <div className="requirements-info">
                    <div className="info-card">
                        <span className="info-icon">ℹ️</span>
                        <div>
                            <strong>Minimum</strong>: Absolute minimum employees needed
                        </div>
                    </div>
                    <div className="info-card">
                        <span className="info-icon">⭐</span>
                        <div>
                            <strong>Preferred</strong>: Ideal number for optimal coverage
                        </div>
                    </div>
                </div>

                <div className="requirements-table">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Day</th>
                                    {timeSlots.map(slot => (
                                        <th key={slot.id} colSpan="2">
                                            {slot.label}
                                            <div className="slot-time">{slot.start} - {slot.end}</div>
                                        </th>
                                    ))}
                                </tr>
                                <tr className="sub-header">
                                    <th></th>
                                    {timeSlots.map(slot => (
                                        <>
                                            <th key={`${slot.id}-min`} className="sub-th">Min</th>
                                            <th key={`${slot.id}-pref`} className="sub-th">Pref</th>
                                        </>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {DAYS_OF_WEEK.map(day => (
                                    <tr key={day}>
                                        <td className="day-cell">
                                            {day.charAt(0).toUpperCase() + day.slice(1)}
                                        </td>
                                        {timeSlots.map(slot => {
                                            const req = getRequirement(day, slot.id);
                                            return (
                                                <>
                                                    <td key={`${slot.id}-min`}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="20"
                                                            value={req?.minEmployees || 0}
                                                            onChange={(e) => updateRequirement(day, slot.id, 'minEmployees', e.target.value)}
                                                            className="req-input min"
                                                        />
                                                    </td>
                                                    <td key={`${slot.id}-pref`}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="20"
                                                            value={req?.preferredEmployees || 0}
                                                            onChange={(e) => updateRequirement(day, slot.id, 'preferredEmployees', e.target.value)}
                                                            className="req-input pref"
                                                        />
                                                    </td>
                                                </>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="form-actions">
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Requirements'}
                    </button>
                </div>
            </Card>
        </div>
    );
}

export default ShiftRequirements;
