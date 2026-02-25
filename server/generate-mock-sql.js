/**
 * Generates a pg_dump-style .sql backup file with mock data AND SCHEMA.
 * Run: node generate-mock-sql.js
 * Then restore through the app's backup UI.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const ADMIN_PASS = 'admin123';

const stores = [
    { id: 'store-001', name: 'Downtown Austin', address: '501 Congress Ave', city: 'Austin', state: 'TX', zip: '78701', phone: '(512) 555-0101' },
    { id: 'store-002', name: 'Round Rock Plaza', address: '200 E Main St', city: 'Round Rock', state: 'TX', zip: '78664', phone: '(512) 555-0202' },
    { id: 'store-003', name: 'Cedar Park Location', address: '1890 Ranch Blvd', city: 'Cedar Park', state: 'TX', zip: '78613', phone: '(512) 555-0303' }
];

const managers = [
    { firstName: 'Maria', lastName: 'Garcia', phone: '(512) 555-1001', storeId: 'store-001', avatar: 'MG' },
    { firstName: 'James', lastName: 'Wilson', phone: '(512) 555-2001', storeId: 'store-002', avatar: 'JW' },
    { firstName: 'Sarah', lastName: 'Chen', phone: '(512) 555-3001', storeId: 'store-003', avatar: 'SC' }
];

const firstNames = [
    'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery', 'Cameron', 'Dakota',
    'Skyler', 'Reese', 'Charlie', 'Finley', 'Emerson', 'Peyton', 'Hayden', 'Rowan', 'Blake', 'Drew',
    'Jesse', 'Logan', 'Parker', 'Sawyer', 'Harley', 'Kendall', 'Remy', 'Kai', 'Phoenix', 'River',
    'Sage', 'Tatum', 'Wren', 'Lennox', 'Spencer', 'Marley', 'Ellis', 'Dallas', 'Justice', 'Briar',
    'Shiloh', 'Eden', 'Oakley', 'Arden', 'Milan', 'Zion', 'Frankie', 'Rory', 'Lane', 'Marlowe',
    'Hollis', 'Elliot', 'Sutton', 'Kit', 'Baylor', 'Devon', 'Amari', 'Stevie', 'Noel', 'Leighton'
];
const lastNames = [
    'Johnson', 'Smith', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Martinez', 'Anderson', 'Taylor',
    'Thomas', 'Jackson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen',
    'King', 'Wright', 'Scott', 'Torres', 'Hill', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter',
    'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins'
];

const positions = ['Cashier', 'Cook', 'Shift Lead'];
const defaultShifts = { 'Cashier': ['08:00', '16:00'], 'Cook': ['06:00', '14:00'], 'Shift Lead': ['07:00', '15:00'] };
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

async function generate() {
    console.log('Generating hashes (this may take a moment)...');

    // Admin
    const adminHash = await bcrypt.hash(ADMIN_PASS, 10);

    let empId = 1;
    let shiftId = 1;
    const lines = [];
    const usedUsernames = new Set(['admin']);

    lines.push('--');
    lines.push('-- ShiftSync Mock Database');
    lines.push('-- Generated: ' + new Date().toISOString());
    lines.push('--');
    lines.push('');

    // Schema (Compact for script)
    lines.push('-- 1. Schema Creation');
    lines.push(`
    DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE public.employees (id SERIAL PRIMARY KEY, username VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255) UNIQUE NOT NULL, role VARCHAR(50) DEFAULT 'employee', position VARCHAR(100), store_id VARCHAR(50), avatar VARCHAR(50), hourly_rate DECIMAL(10, 2), max_hours_per_week INTEGER DEFAULT 40, status VARCHAR(50) DEFAULT 'active', hire_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE public.stores (id VARCHAR(50) PRIMARY KEY, name VARCHAR(255) NOT NULL, address VARCHAR(255), city VARCHAR(100), state VARCHAR(50), zip_code VARCHAR(20), phone VARCHAR(20), timezone VARCHAR(50) DEFAULT 'America/Chicago', manager_id INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE public.employee_default_shifts (id SERIAL PRIMARY KEY, employee_id INTEGER, day_of_week VARCHAR(20), start_time VARCHAR(10), end_time VARCHAR(10), primary_role VARCHAR(100), is_off INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(employee_id, day_of_week));
    CREATE TABLE public.employee_additional_roles (id SERIAL PRIMARY KEY, employee_id INTEGER, role_name VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(employee_id, role_name));
    CREATE TABLE public.schedules (id SERIAL PRIMARY KEY, store_id VARCHAR(50) NOT NULL, week_start VARCHAR(20) NOT NULL, published INTEGER DEFAULT 0, published_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(store_id, week_start));
    CREATE TABLE public.shifts (id SERIAL PRIMARY KEY, schedule_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, day_of_week VARCHAR(20) NOT NULL, start_time VARCHAR(10) NOT NULL, end_time VARCHAR(10) NOT NULL, role VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE public.availability (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL, week_start VARCHAR(20) NOT NULL, days_json TEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(employee_id, week_start));
    CREATE TABLE public.time_off_requests (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL, start_date VARCHAR(20) NOT NULL, end_date VARCHAR(20) NOT NULL, reason TEXT, status VARCHAR(20) DEFAULT 'pending', review_note TEXT, reviewed_by INTEGER, reviewed_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, type VARCHAR(50) DEFAULT 'unpaid', replacement_needed INTEGER DEFAULT 0, replacement_notified INTEGER DEFAULT 0, replacement_id INTEGER, shift_id INTEGER REFERENCES shifts(id) ON DELETE CASCADE);
    CREATE TABLE public.notifications (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, type VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL, message TEXT NOT NULL, is_read BOOLEAN DEFAULT false, related_entity_type VARCHAR(50), related_entity_id INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE public.conversations (id SERIAL PRIMARY KEY, name VARCHAR(255), is_team INTEGER DEFAULT 0, created_by INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE public.conversation_members (conversation_id INTEGER NOT NULL, user_id INTEGER NOT NULL, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (conversation_id, user_id));
    CREATE TABLE public.messages (id SERIAL PRIMARY KEY, conversation_id INTEGER, sender_id INTEGER, content_encrypted TEXT, iv VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE public.system_settings (key VARCHAR(50) NOT NULL, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);

    lines.push('');
    lines.push('-- 2. Seed Data');
    lines.push('');

    // --- Stores ---
    lines.push('-- Stores');
    for (const s of stores) {
        lines.push(`INSERT INTO stores (id, name, address, city, state, zip_code, phone, timezone) VALUES ('${s.id}', '${s.name}', '${s.address}', '${s.city}', '${s.state}', '${s.zip}', '${s.phone}', 'America/Chicago');`);
    }
    lines.push('');

    // --- Admin ---
    lines.push('-- Admin account (admin / admin123)');
    lines.push(`INSERT INTO employees (id, username, password_hash, name, phone, email, role, position, store_id, avatar, hourly_rate, max_hours_per_week, status, hire_date, created_at, updated_at) VALUES (${empId}, 'admin', '${adminHash}', 'System Admin', '(512) 555-0000', 'admin@shiftsync.com', 'admin', 'Administrator', 'store-001', 'SA', 15.00, 40, 'active', CURRENT_DATE, '${now}', '${now}');`);
    empId++;
    lines.push('');

    // --- Managers ---
    lines.push('-- Managers');
    const mgrIds = {};
    for (const m of managers) {
        mgrIds[m.storeId] = empId;
        const hireDate = '2024-06-01';

        let username = m.firstName.toLowerCase();
        let counter = 1;
        while (usedUsernames.has(username)) {
            username = m.firstName.toLowerCase() + counter;
            counter++;
        }
        usedUsernames.add(username);

        const password = username + '123';
        const passHash = await bcrypt.hash(password, 10);
        const email = `${username}@shiftsync.com`;

        lines.push(`-- Login: ${username} / ${password}`);
        lines.push(`INSERT INTO employees (id, username, password_hash, name, phone, email, role, position, store_id, avatar, hourly_rate, max_hours_per_week, status, hire_date, created_at, updated_at) VALUES (${empId}, '${username}', '${passHash}', '${m.firstName} ${m.lastName}', '${m.phone}', '${email}', 'manager', 'Store Manager', '${m.storeId}', '${m.avatar}', 18.00, 40, 'active', '${hireDate}', '${now}', '${now}');`);
        empId++;
    }
    lines.push('');

    // Link managers to stores
    lines.push('-- Link managers to stores');
    for (const [storeId, mid] of Object.entries(mgrIds)) {
        lines.push(`UPDATE stores SET manager_id = ${mid} WHERE id = '${storeId}';`);
    }
    lines.push('');

    // --- Employees (20 per store) ---
    lines.push('-- Employees');
    const empShiftLines = [];

    for (let si = 0; si < stores.length; si++) {
        const store = stores[si];
        lines.push(`-- Store: ${store.name}`);

        for (let i = 0; i < 20; i++) {
            const first = firstNames[(si * 20 + i) % firstNames.length];
            const last = lastNames[(si * 13 + i * 3) % lastNames.length];
            const pos = positions[i % 3];
            const avatar = `${first[0]}${last[0]}`;

            let username = first.toLowerCase();
            let counter = 1;
            while (usedUsernames.has(username)) {
                username = first.toLowerCase() + counter;
                counter++;
            }
            usedUsernames.add(username);

            const password = username + '123';
            const passHash = await bcrypt.hash(password, 10);
            const email = `${username}@shiftsync.com`;

            const phone = `(512) 555-${si + 1}${String(i + 10).padStart(3, '0')}`;
            const daysAgo = 100 + si * 50 + i * 30;
            const hireDate = new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0];
            const rate = (13 + (i % 8)).toFixed(2);

            lines.push(`INSERT INTO employees (id, username, password_hash, name, phone, email, role, position, store_id, avatar, hourly_rate, max_hours_per_week, status, hire_date, created_at, updated_at) VALUES (${empId}, '${username}', '${passHash}', '${first} ${last}', '${phone}', '${email}', 'employee', '${pos}', '${store.id}', '${avatar}', ${rate}, 40, 'active', '${hireDate}', '${now}', '${now}');`);

            // Default shifts
            const workDays = days.slice(0, 5);
            // Rotate schedule slightly per employee
            const rotated = [...days.slice(i % 7), ...days.slice(0, i % 7)];
            const work = rotated.slice(0, 5);
            const off = rotated.slice(5);
            const shift = defaultShifts[pos];

            for (const d of work) {
                empShiftLines.push(`INSERT INTO employee_default_shifts (id, employee_id, day_of_week, start_time, end_time, primary_role, is_off, created_at, updated_at) VALUES (${shiftId}, ${empId}, '${d}', '${shift[0]}', '${shift[1]}', '${pos}', 0, '${now}', '${now}');`);
                shiftId++;
            }
            for (const d of off) {
                empShiftLines.push(`INSERT INTO employee_default_shifts (id, employee_id, day_of_week, start_time, end_time, primary_role, is_off, created_at, updated_at) VALUES (${shiftId}, ${empId}, '${d}', NULL, NULL, NULL, 1, '${now}', '${now}');`);
                shiftId++;
            }
            empId++;
        }
        lines.push('');
    }

    // Default shifts
    lines.push('-- Employee default shifts');
    lines.push(...empShiftLines);
    lines.push('');

    // Reset sequences
    lines.push('-- Reset sequences');
    lines.push(`SELECT setval('employees_id_seq', ${empId}, true);`);
    lines.push(`SELECT setval('employee_default_shifts_id_seq', ${shiftId}, true);`);
    lines.push('');

    const outPath = path.join(__dirname, '..', 'backups', 'mock-database.sql');
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    console.log(`\n✅ Generated: ${outPath}`);
    console.log(`   ${stores.length} stores, ${managers.length} managers, 60 employees, ${shiftId - 1} default shifts`);
    console.log(`\nRestore this file through Admin > Backup Settings > Restore.`);
}

generate().catch(err => { console.error(err); process.exit(1); });
