const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const { adminEmail, adminPassword } = require('./admin_config');

const DB_PATH = path.join(__dirname, 'shiftsync.db');

// Create database connection
const db = new Database(DB_PATH, { timeout: 5000 });

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
    console.log('Initializing database...');

    // Create employees table
    db.exec(`
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT UNIQUE NOT NULL,
            role TEXT DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
            position TEXT,
            store_id TEXT DEFAULT 'store-001',
            avatar TEXT,
            hourly_rate REAL DEFAULT 15.00,
            max_hours_per_week INTEGER DEFAULT 40,
            status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
            hire_date TEXT DEFAULT (date('now')),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Create employee_default_shifts table
    db.exec(`
        CREATE TABLE IF NOT EXISTS employee_default_shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
            day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
            start_time TEXT,
            end_time TEXT,
            primary_role TEXT,
            is_off INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(employee_id, day_of_week)
        )
    `);

    // Create employee_additional_roles table
    db.exec(`
        CREATE TABLE IF NOT EXISTS employee_additional_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
            role_name TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(employee_id, role_name)
        )
    `);

    // Create stores table
    db.exec(`
        CREATE TABLE IF NOT EXISTS stores (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            address TEXT,
            city TEXT,
            state TEXT,
            zip_code TEXT,
            phone TEXT,
            timezone TEXT DEFAULT 'America/Chicago',
            manager_id INTEGER REFERENCES employees(id),
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Create schedules table
    db.exec(`
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id TEXT NOT NULL REFERENCES stores(id),
            week_start TEXT NOT NULL,
            published INTEGER DEFAULT 0,
            published_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(store_id, week_start)
        )
    `);

    // Create shifts table
    db.exec(`
        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
            employee_id INTEGER NOT NULL REFERENCES employees(id),
            day_of_week TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            role TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Create availability table
    db.exec(`
        CREATE TABLE IF NOT EXISTS availability (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            week_start TEXT NOT NULL,
            days_json TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(employee_id, week_start)
        )
    `);

    // Create time_off_requests table
    db.exec(`
        CREATE TABLE IF NOT EXISTS time_off_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            reason TEXT,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
            review_note TEXT,
            reviewed_by INTEGER REFERENCES employees(id),
            reviewed_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Migration: Check and add columns robustly
    const columns = db.pragma('table_info(time_off_requests)');
    const hasReviewNote = columns.some(c => c.name === 'review_note');
    const hasReviewedBy = columns.some(c => c.name === 'reviewed_by');
    const hasReviewedAt = columns.some(c => c.name === 'reviewed_at');

    if (!hasReviewNote) {
        db.exec("ALTER TABLE time_off_requests ADD COLUMN review_note TEXT");
        console.log("Added review_note column");
    }

    if (!hasReviewedBy) {
        // SQLite doesn't support adding FK constraints via ALTER TABLE, so just add INTEGER
        db.exec("ALTER TABLE time_off_requests ADD COLUMN reviewed_by INTEGER");
        console.log("Added reviewed_by column");
    }

    if (!hasReviewedAt) {
        db.exec("ALTER TABLE time_off_requests ADD COLUMN reviewed_at TEXT");
        console.log("Added reviewed_at column");
    }

    const hasType = columns.some(c => c.name === 'type');
    if (!hasType) {
        db.exec("ALTER TABLE time_off_requests ADD COLUMN type TEXT DEFAULT 'unpaid'");
        console.log("Added type column");
    }

    // Migration: Add replacement tracking columns
    const hasReplacementNeeded = columns.some(c => c.name === 'replacement_needed');
    if (!hasReplacementNeeded) {
        db.exec("ALTER TABLE time_off_requests ADD COLUMN replacement_needed INTEGER DEFAULT 0");
        console.log("Added replacement_needed column");
    }

    const hasReplacementNotified = columns.some(c => c.name === 'replacement_notified');
    if (!hasReplacementNotified) {
        db.exec("ALTER TABLE time_off_requests ADD COLUMN replacement_notified INTEGER DEFAULT 0");
        console.log("Added replacement_notified column");
    }

    const hasReplacementId = columns.some(c => c.name === 'replacement_id');
    if (!hasReplacementId) {
        db.exec("ALTER TABLE time_off_requests ADD COLUMN replacement_id INTEGER");
        console.log("Added replacement_id column");
    }

    // Create indexes
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
        CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username);
        CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store_id);
        CREATE INDEX IF NOT EXISTS idx_default_shifts_employee ON employee_default_shifts(employee_id);
        CREATE INDEX IF NOT EXISTS idx_additional_roles_employee ON employee_additional_roles(employee_id);
    `);

    console.log('Database schema created/updated.');
}

// Seed default data
async function seedDefaultData() {
    // Manager creation removed for production build

    // Check if admin exists
    const adminExists = db.prepare('SELECT id FROM employees WHERE email = ?').get(adminEmail);

    if (!adminExists) {
        console.log('Creating default admin account...');

        const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

        db.prepare(`
            INSERT INTO employees (username, password_hash, name, phone, email, role, position, store_id, avatar)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'admin',
            adminPasswordHash,
            'System Admin',
            '(512) 555-0000',
            adminEmail,
            'admin',
            'Administrator',
            'store-001',
            'SA'
        );

        console.log(`Default admin created: ${adminEmail} / ${adminPassword}`);
    } else {
        // Update admin password if it matches the config (simplified: just update hash)
        // Ideally we only update if changed, but hashing is cheap enough for startup
        const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
        db.prepare('UPDATE employees SET password_hash = ? WHERE email = ?').run(adminPasswordHash, adminEmail);
        console.log('Admin password updated from config file');
    }

    // Check if store exists
    const storeExists = db.prepare('SELECT id FROM stores WHERE id = ?').get('store-001');

    if (!storeExists) {
        console.log('Creating default store...');

        db.prepare(`
            INSERT INTO stores (id, name, address, city, state, zip_code, phone, timezone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'store-001',
            'Main Location',
            '123 Main Street',
            'Austin',
            'TX',
            '78701',
            '(512) 555-0101',
            'America/Chicago'
        );

        console.log('Default store created.');
    }
}

// Helper function to run queries (sync)
const query = (sql, params = []) => {
    return db.prepare(sql).all(...params);
};

// Helper function to run single query
const queryOne = (sql, params = []) => {
    return db.prepare(sql).get(...params);
};

// Helper function to run insert/update
const run = (sql, params = []) => {
    return db.prepare(sql).run(...params);
};

// Initialize on load
try {
    initializeDatabase();
} catch (error) {
    console.error('Failed to initialize database:', error);
}


module.exports = {
    db,
    query,
    queryOne,
    run,
    seedDefaultData
};
