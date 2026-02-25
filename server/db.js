const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
});

// Test connection with retry (handles Docker startup race condition)
const connectWithRetry = async (retries = 10, delay = 2000) => {
    for (let i = 1; i <= retries; i++) {
        try {
            const client = await pool.connect();
            const result = await client.query('SELECT NOW()');
            client.release();
            console.log('Connected to PostgreSQL database at:', result.rows[0].now);
            return;
        } catch (err) {
            console.warn(`DB connection attempt ${i}/${retries} failed: ${err.message}`);
            if (i < retries) {
                await new Promise(res => setTimeout(res, delay));
            } else {
                console.error('Could not connect to PostgreSQL after', retries, 'attempts.');
            }
        }
    }
};
connectWithRetry();

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
                    employee_id INTEGER REFERENCES employees(id),
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
                    replacement_id INTEGER,
                    shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL
                )
            `);

            // Add shift_id to time_off_requests if it doesn't exist AND update schema constraints
            await client.query(`
                DO $$
                BEGIN
                    -- Make shift employee_id nullable so managers can leave shifts empty
                    ALTER TABLE shifts ALTER COLUMN employee_id DROP NOT NULL;
                    
                    BEGIN
                        ALTER TABLE time_off_requests ADD COLUMN shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;
                    EXCEPTION
                        WHEN duplicate_column THEN null;
                    END;
                    
                    -- Update constraint from CASCADE to SET NULL so deleting a shift doesn't delete the request
                    ALTER TABLE time_off_requests DROP CONSTRAINT IF EXISTS time_off_requests_shift_id_fkey;
                    ALTER TABLE time_off_requests ADD CONSTRAINT time_off_requests_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
                END $$;
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

            // Create push_subscriptions table
            await client.query(`
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    subscription_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, subscription_json)
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

            // Create system_settings table
            await client.query(`
                CREATE TABLE IF NOT EXISTS system_settings (
                    "key" VARCHAR(50) PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Apply safe migrations for missing constraints if tables were created previously without them
            await client.query(`
                DO $$
                BEGIN
                    -- Add primary key to system_settings if it doesn't exist
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conrelid = 'system_settings'::regclass AND contype = 'p'
                    ) THEN
                        BEGIN
                            ALTER TABLE system_settings ADD PRIMARY KEY ("key");
                        EXCEPTION
                            WHEN others THEN NULL;
                        END;
                    END IF;

                    -- Add unique constraint to push_subscriptions if it doesn't exist
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conrelid = 'push_subscriptions'::regclass AND contype = 'u'
                    ) THEN
                        BEGIN
                            ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_subscription_json_key UNIQUE(user_id, subscription_json);
                        EXCEPTION
                            WHEN others THEN NULL;
                        END;
                    END IF;
                END $$;
            `);

            // Seed default backup schedule if not exists
            await client.query(`
                INSERT INTO system_settings ("key", value)
                VALUES ('backup_schedule', '0 0 * * *')
                ON CONFLICT ("key") DO NOTHING
            `);

            // Seed VAPID keys for push notifications if not exists
            const vapidCheck = await client.query('SELECT * FROM system_settings WHERE "key" = $1', ['vapid_keys']);
            if (vapidCheck.rows.length === 0) {
                const webpush = require('web-push');
                const keys = webpush.generateVAPIDKeys();
                await client.query(`
                    INSERT INTO system_settings ("key", value)
                    VALUES ($1, $2)
                `, ['vapid_keys', JSON.stringify(keys)]);
                console.log('✅ Generated and stored VAPID keys.');
            }

            // Create indexes
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_default_shifts_employee ON employee_default_shifts(employee_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_additional_roles_employee ON employee_additional_roles(employee_id)');

            await client.query('COMMIT');
            console.log('✅ Database schema created/updated successfully.');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('❌ Error during schema creation:', e);
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('❌ Failed to initialize database:', err);
    }
}

// Seed default data
async function seedDefaultData() {
    let res;
    try {
        // Check if manager exists - REMOVED per request
        // Manager role is deprecated for default seeding. Admin is now the primary.

        // Build admin credentials — env vars take priority, then hardcoded defaults
        let adminCreds = {
            username: 'admin',
            email: 'admin@shiftsync.com',
            password: 'admin123',
            name: 'System Admin',
            phone: '(512) 555-0000'
        };

        // Environment variables (Docker / production) — highest priority
        if (process.env.ADMIN_USERNAME) adminCreds.username = process.env.ADMIN_USERNAME;
        if (process.env.ADMIN_EMAIL) adminCreds.email = process.env.ADMIN_EMAIL;
        if (process.env.ADMIN_PASSWORD) adminCreds.password = process.env.ADMIN_PASSWORD;
        if (process.env.ADMIN_NAME) adminCreds.name = process.env.ADMIN_NAME;
        if (process.env.ADMIN_PHONE) adminCreds.phone = process.env.ADMIN_PHONE;

        if (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME) {
            console.log('Loaded admin credentials from environment variables.');
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
