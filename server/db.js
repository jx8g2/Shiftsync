const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) {
            return console.error('Error executing query', err.stack);
        }
        console.log('Connected to PostgreSQL database at:', result.rows[0].now);
    });
});

// Helper function to run queries (async)
const query = async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows;
};

// Helper function to run single query (async)
const queryOne = async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows[0];
};

// Helper function to run insert/update (async)
const run = async (text, params) => {
    const res = await pool.query(text, params);
    return {
        rowCount: res.rowCount,
        rows: res.rows,
        // For compatibility with some SQLite logic if needed, 
        // though we should use RETURNING id in Postgres
        lastInsertRowid: res.rows[0]?.id
    };
};

// Initialize database schema
async function initializeDatabase() {
    console.log('Initializing database schema...');

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Create employees table
            await client.query(`
                CREATE TABLE IF NOT EXISTS employees (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    phone VARCHAR(50),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    role VARCHAR(50) DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
                    position VARCHAR(100),
                    store_id VARCHAR(50) DEFAULT 'store-001',
                    avatar VARCHAR(50),
                    hourly_rate DECIMAL(10, 2) DEFAULT 15.00,
                    max_hours_per_week INTEGER DEFAULT 40,
                    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
                    hire_date DATE DEFAULT CURRENT_DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create employee_default_shifts table
            await client.query(`
                CREATE TABLE IF NOT EXISTS employee_default_shifts (
                    id SERIAL PRIMARY KEY,
                    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
                    day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
                    start_time VARCHAR(10),
                    end_time VARCHAR(10),
                    primary_role VARCHAR(100),
                    is_off INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(employee_id, day_of_week)
                )
            `);

            // Create employee_additional_roles table
            await client.query(`
                CREATE TABLE IF NOT EXISTS employee_additional_roles (
                    id SERIAL PRIMARY KEY,
                    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
                    role_name VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(employee_id, role_name)
                )
            `);

            // Create stores table
            await client.query(`
                CREATE TABLE IF NOT EXISTS stores (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    address VARCHAR(255),
                    city VARCHAR(100),
                    state VARCHAR(50),
                    zip_code VARCHAR(20),
                    phone VARCHAR(20),
                    timezone VARCHAR(50) DEFAULT 'America/Chicago',
                    manager_id INTEGER REFERENCES employees(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create schedules table
            await client.query(`
                CREATE TABLE IF NOT EXISTS schedules (
                    id SERIAL PRIMARY KEY,
                    store_id VARCHAR(50) NOT NULL REFERENCES stores(id),
                    week_start VARCHAR(20) NOT NULL,
                    published INTEGER DEFAULT 0,
                    published_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(store_id, week_start)
                )
            `);

            // Create shifts table
            await client.query(`
                CREATE TABLE IF NOT EXISTS shifts (
                    id SERIAL PRIMARY KEY,
                    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
                    employee_id INTEGER NOT NULL REFERENCES employees(id),
                    day_of_week VARCHAR(20) NOT NULL,
                    start_time VARCHAR(10) NOT NULL,
                    end_time VARCHAR(10) NOT NULL,
                    role VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create availability table
            await client.query(`
                CREATE TABLE IF NOT EXISTS availability (
                    id SERIAL PRIMARY KEY,
                    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    week_start VARCHAR(20) NOT NULL,
                    days_json TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(employee_id, week_start)
                )
            `);

            // Create time_off_requests table
            await client.query(`
                CREATE TABLE IF NOT EXISTS time_off_requests (
                    id SERIAL PRIMARY KEY,
                    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    start_date VARCHAR(20) NOT NULL,
                    end_date VARCHAR(20) NOT NULL,
                    reason TEXT,
                    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
                    review_note TEXT,
                    reviewed_by INTEGER REFERENCES employees(id),
                    reviewed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    type VARCHAR(50) DEFAULT 'unpaid',
                    replacement_needed INTEGER DEFAULT 0,
                    replacement_notified INTEGER DEFAULT 0,
                    replacement_id INTEGER
                )
            `);

            // Create notifications table
            await client.query(`
                CREATE TABLE IF NOT EXISTS notifications (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    is_read BOOLEAN DEFAULT false,
                    related_entity_type VARCHAR(50),
                    related_entity_id INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create conversations table
            await client.query(`
                CREATE TABLE IF NOT EXISTS conversations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255),
                    is_team INTEGER DEFAULT 0,
                    created_by INTEGER REFERENCES employees(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create conversation_members table
            await client.query(`
                CREATE TABLE IF NOT EXISTS conversation_members (
                    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (conversation_id, user_id)
                )
            `);

            // Create messages table
            await client.query(`
                CREATE TABLE IF NOT EXISTS messages (
                    id SERIAL PRIMARY KEY,
                    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
                    sender_id INTEGER REFERENCES employees(id),
                    content_encrypted TEXT,
                    iv VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create indexes
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_default_shifts_employee ON employee_default_shifts(employee_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_additional_roles_employee ON employee_additional_roles(employee_id)');

            await client.query('COMMIT');
            console.log('Database schema created/updated.');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}

// Seed default data
async function seedDefaultData() {
    try {
        // Check if manager exists - REMOVED per request
        // Manager role is deprecated for default seeding. Admin is now the primary.

        // Check if admin exists
        // Load admin credentials from scripts/admin-credentials.json
        const fs = require('fs');
        let adminCreds = {
            username: 'admin',
            email: 'admin@shiftsync.com',
            password: 'admin123',
            name: 'System Admin',
            phone: '(512) 555-0000'
        };

        try {
            const credsPath = path.join(__dirname, '../scripts/admin-credentials.json');
            if (fs.existsSync(credsPath)) {
                const fileContent = fs.readFileSync(credsPath, 'utf8');
                adminCreds = { ...adminCreds, ...JSON.parse(fileContent) };
                console.log('Loaded admin credentials from configuration file.');
            }
        } catch (err) {
            console.warn('Could not load admin-credentials.json, using defaults:', err.message);
        }

        res = await pool.query("SELECT id FROM employees WHERE email = $1", [adminCreds.email]);
        const adminExists = res.rows[0];

        if (!adminExists) {
            console.log(`Creating default admin account (${adminCreds.email})...`);
            const adminPasswordHash = await bcrypt.hash(adminCreds.password, 10);

            await pool.query(`
                INSERT INTO employees (username, password_hash, name, phone, email, role, position, store_id, avatar)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [adminCreds.username, adminPasswordHash, adminCreds.name, adminCreds.phone, adminCreds.email, 'admin', 'Administrator', 'store-001', 'SA']);

            console.log('Default admin created.');
        }

        // Check if store exists
        res = await pool.query("SELECT id FROM stores WHERE id = $1", ['store-001']);
        const storeExists = res.rows[0];

        if (!storeExists) {
            console.log('Creating default store...');
            await pool.query(`
                INSERT INTO stores (id, name, address, city, state, zip_code, phone, timezone)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, ['store-001', 'Main Location', '123 Main Street', 'Austin', 'TX', '78701', '(512) 555-0101', 'America/Chicago']);
            console.log('Default store created.');
        }
    } catch (err) {
        console.error('Error seeding data:', err);
    }
}

module.exports = {
    pool,
    query,
    queryOne,
    run,
    initializeDatabase,
    seedDefaultData
};
