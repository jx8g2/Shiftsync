// Initial empty data — all real data comes from the database
export const initialData = {
    stores: [],
    employees: [],
    availability: [],
    timeOffRequests: [],
    schedules: [],
    shiftRequirements: [],
    reminders: []
};

// Helper functions
export const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const DAY_LABELS = {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun'
};

export const TIME_OFF_TYPES = [
    { value: 'vacation', label: 'Vacation' },
    { value: 'personal', label: 'Personal' },
    { value: 'medical', label: 'Medical' },
    { value: 'family', label: 'Family Emergency' },
    { value: 'other', label: 'Other' }
];

export const POSITIONS = [
    { value: 'front-house', label: 'Front of House', category: 'FOH' },
    { value: 'back-house', label: 'Back of House', category: 'BOH' },
    { value: 'shift lead', label: 'Shift Lead', category: 'ALL' }
];

// Available roles for shift assignments
export const ROLES = [
    { value: 'Drive Through Cashier', label: 'Drive Through Cashier', category: 'FOH' },
    { value: 'Front Line Cashier', label: 'Front Line Cashier', category: 'FOH' },
    { value: 'Drive Through Order Taker', label: 'Drive Through Order Taker', category: 'FOH' },
    { value: 'Line Cook', label: 'Line Cook', category: 'BOH' },
    { value: 'Biscuits', label: 'Biscuits (Breakfast Only)', category: 'BOH' },
    { value: 'Grill', label: 'Grill (Breakfast Only)', category: 'BOH' },
    { value: 'Prep', label: 'Prep', category: 'BOH' },
    { value: 'Backup Cook', label: 'Backup Cook', category: 'BOH' }
];

export const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
};

export const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        let date;
        if (dateStr.includes('T')) {
            // Already an ISO string, parsing directly
            date = new Date(dateStr);
        } else {
            // Replace dashes with slashes to force local timezone parsing for simple date strings
            // "2024-03-05" -> "2024/03/05"
            const localDateStr = dateStr.includes('-') ? dateStr.replace(/-/g, '/') : dateStr;
            date = new Date(localDateStr);
        }
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return 'Invalid Date';
    }
};

export const formatDateFull = (dateStr) => {
    if (!dateStr) return '';
    try {
        let date;
        if (dateStr.includes('T')) {
            date = new Date(dateStr);
        } else {
            const localDateStr = dateStr.includes('-') ? dateStr.replace(/-/g, '/') : dateStr;
            date = new Date(localDateStr);
        }
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        return 'Invalid Date';
    }
};

export const getWeekStart = (date = new Date()) => {
    const d = new Date(date);
    // Treat the date as UTC to avoid local timezone shifts
    const utcDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = utcDate.getUTCDay(); // 0 is Sunday
    // Calculate difference to get to Monday (1)
    // If Sunday (0), subtract 6 days. If Monday (1), subtract 0. If Saturday (6), subtract 5.
    const diff = day === 0 ? 6 : day - 1;
    utcDate.setUTCDate(utcDate.getUTCDate() - diff);
    return utcDate.toISOString().split('T')[0];
};

export const addDays = (dateStr, days) => {
    // Create date as UTC
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
};

export const calculateHours = (start, end) => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return (endMinutes - startMinutes) / 60;
};
