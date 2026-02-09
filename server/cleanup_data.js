const Database = require('better-sqlite3');
const path = require('path');
const { adminEmail } = require('./admin_config');

const DB_PATH = path.join(__dirname, 'shiftsync.db');

console.log('Starting comprehensive cleanup...');
console.log('Target DB:', DB_PATH);
console.log('Keeping Admin:', adminEmail);

try {
    const db = new Database(DB_PATH, { timeout: 10000 });
    console.log('Connected.');

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    const tablesToClear = [
        'notifications',
        'messages',
        'conversation_members',
        'conversations',
        'time_off_requests',
        'availability',
        'shifts',
        'schedules',
        'employee_default_shifts',
        'employee_additional_roles'
    ];

    db.transaction(() => {
        // 1. Clear dependent tables
        for (const table of tablesToClear) {
            // Check if table exists first to avoid errors
            const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
            if (tableExists) {
                const res = db.prepare(`DELETE FROM ${table}`).run();
                console.log(`Deleted ${res.changes} rows from ${table}`);
            } else {
                console.log(`Skipping ${table} (not found)`);
            }
        }

        // 2. Get Admin ID
        const admin = db.prepare('SELECT id FROM employees WHERE email = ?').get(adminEmail);
        if (!admin) {
            throw new Error(`Admin user ${adminEmail} not found! Cannot reassign store manager.`);
        }
        console.log(`Admin ID: ${admin.id}`);

        // 3. Update Stores to point to Admin
        const storeUpdate = db.prepare('UPDATE stores SET manager_id = ?').run(admin.id);
        console.log(`Updated ${storeUpdate.changes} stores to have Admin as manager.`);

        // 4. Delete employees except admin
        const res = db.prepare('DELETE FROM employees WHERE email != ?').run(adminEmail);
        console.log(`Deleted ${res.changes} employees.`);

    })();

    console.log('Cleanup transaction complete.');

    // Verify
    const remaining = db.prepare('SELECT id, name, email FROM employees').all();
    console.log('Remaining Employees:', JSON.stringify(remaining, null, 2));

} catch (e) {
    console.error('Cleanup Failed:', e);
}
