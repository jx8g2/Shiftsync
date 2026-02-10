// Initial data for the scheduling application

export const initialData = {
    stores: [
        {
            id: 'store-001',
            name: 'Main Location',
            address: '123 Main Street',
            city: 'Austin',
            state: 'TX',
            zipCode: '78701',
            phone: '(512) 555-0101',
            timezone: 'America/Chicago',
            operatingHours: {
                monday: { open: '06:00', close: '22:00', closed: false },
                tuesday: { open: '06:00', close: '22:00', closed: false },
                wednesday: { open: '06:00', close: '22:00', closed: false },
                thursday: { open: '06:00', close: '22:00', closed: false },
                friday: { open: '06:00', close: '23:00', closed: false },
                saturday: { open: '07:00', close: '23:00', closed: false },
                sunday: { open: '08:00', close: '20:00', closed: false }
            },
            managerId: 'mgr-001',
            createdAt: new Date().toISOString()
        }
    ],

    employees: [
        {
            id: 'mgr-001',
            name: 'Store Manager',
            email: 'manager@shiftsync.com',
            phone: '(512) 555-0001',
            role: 'manager',
            position: 'Store Manager',
            storeId: 'store-001',
            hireDate: '2024-01-01',
            avatar: 'SM',
            status: 'active',
            createdAt: new Date().toISOString()
        }
    ],

    availability: [],

    timeOffRequests: [],

    schedules: [],

    shiftRequirements: [
        {
            id: 'req-001',
            storeId: 'store-001',
            day: 'monday',
            timeSlot: 'morning',
            startTime: '06:00',
            endTime: '14:00',
            minEmployees: 2,
            preferredEmployees: 3
        },
        {
            id: 'req-002',
            storeId: 'store-001',
            day: 'monday',
            timeSlot: 'afternoon',
            startTime: '14:00',
            endTime: '22:00',
            minEmployees: 2,
            preferredEmployees: 3
        }
    ],

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
    'Cashier',
    'Cook',
    'Shift Lead'
];

// Available roles for shift assignments
export const ROLES = [
    'Cashier',
    'Cook',
    'Shift Lead'
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
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
};

export const formatDateFull = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
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
