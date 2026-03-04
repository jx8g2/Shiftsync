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

            // ══════════════════════════════════════════════════════════════
            // TABLE CREATION ORDER:
            // 1. employees  (no store_id FK yet — circular dependency)
            // 2. stores     (manager_id → employees)
            // 3. ALTER employees to add store_id FK → stores
            // 4. employee_default_shifts, employee_additional_roles
            // 5. schedules → stores
            // 6. shifts → schedules, employees
            // 7. availability → employees
            // 8. time_off_requests → employees, shifts
            // 9. notifications, push_subscriptions → employees
            // 10. conversations, conversation_members, messages → employees
            // 11. system_settings (standalone)
            // ══════════════════════════════════════════════════════════════

            // 1. Create positions table
            await client.query(`
                CREATE TABLE IF NOT EXISTS positions (
                    name VARCHAR(100) PRIMARY KEY,
                    category VARCHAR(50) NOT NULL CHECK (category IN ('FOH', 'BOH', 'ALL'))
                )
            `);

            // Seed positions
            await client.query(`
                INSERT INTO positions (name, category) VALUES
                ('front-house', 'FOH'),
                ('back-house', 'BOH'),
                ('shift lead', 'ALL'),
                ('Store Manager', 'ALL'),
                ('Administrator', 'ALL'),
                ('Assistant Manager', 'ALL')
                ON CONFLICT (name) DO NOTHING
            `);

            // 2. Create roles table
            await client.query(`
                CREATE TABLE IF NOT EXISTS roles (
                    name VARCHAR(100) PRIMARY KEY,
                    category VARCHAR(50) NOT NULL CHECK (category IN ('FOH', 'BOH', 'ALL'))
                )
            `);

            // Seed roles
            await client.query(`
                INSERT INTO roles (name, category) VALUES
                ('Drive Through Cashier', 'FOH'),
                ('Front Line Cashier', 'FOH'),
                ('Drive Through Order Taker', 'FOH'),
                ('Line Cook', 'BOH'),
                ('Biscuits', 'BOH'),
                ('Grill', 'BOH'),
                ('Prep', 'BOH'),
                ('Backup Cook', 'BOH'),
                ('Store Manager', 'ALL'),
                ('Administrator', 'ALL'),
                ('Assistant Manager', 'ALL')
                ON CONFLICT (name) DO NOTHING
            `);

            // 3. Create employees table (store_id column exists but FK added later to break circular dep)
            await client.query(`
                CREATE TABLE IF NOT EXISTS employees (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    phone VARCHAR(50),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    role VARCHAR(50) DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
                    position VARCHAR(100) REFERENCES positions(name),
                    store_id VARCHAR(50) DEFAULT 'store-001',
                    avatar VARCHAR(50),
                    hourly_rate DECIMAL(10, 2) DEFAULT 15.00,
                    max_hours_per_week INTEGER DEFAULT 40,
                    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
                    hire_date DATE DEFAULT CURRENT_DATE,
                    failed_login_attempts INTEGER DEFAULT 0,
                    locked_until TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 1b. Safe migration: add brute-force protection columns if missing
            await client.query(`
                DO $$
                BEGIN
                    BEGIN
                        ALTER TABLE employees ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
                    EXCEPTION
                        WHEN duplicate_column THEN NULL;
                    END;
                    
                    BEGIN
                        ALTER TABLE employees ADD COLUMN locked_until TIMESTAMP;
                    EXCEPTION
                        WHEN duplicate_column THEN NULL;
                    END;
                END $$;
            `);

            // 2. Create stores table (manager_id FK → employees with ON DELETE SET NULL)
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
                    manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 3. Add FK constraint: employees.store_id → stores.id (resolves circular dependency)
            //    Uses safe migration: only adds if not already present on existing databases
            await client.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'employees'::regclass
                          AND conname = 'employees_store_id_fkey'
                    ) THEN
                        ALTER TABLE employees
                            ADD CONSTRAINT employees_store_id_fkey
                            FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
                    END IF;
                END $$;
            `);

            // 3b. Ensure stores.manager_id has ON DELETE SET NULL (fix for existing DBs)
            await client.query(`
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'stores'::regclass
                          AND conname = 'stores_manager_id_fkey'
                    ) THEN
                        ALTER TABLE stores DROP CONSTRAINT stores_manager_id_fkey;
                    END IF;
                    ALTER TABLE stores
                        ADD CONSTRAINT stores_manager_id_fkey
                        FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL;
                EXCEPTION
                    WHEN others THEN NULL;
                END $$;
            `);

            // 4a. Create employee_default_shifts table
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

            // 4b. Create employee_additional_roles table
            await client.query(`
                CREATE TABLE IF NOT EXISTS employee_additional_roles (
                    id SERIAL PRIMARY KEY,
                    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
                    role_name VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(employee_id, role_name)
                )
            `);

            // 5. Create schedules table
            await client.query(`
                CREATE TABLE IF NOT EXISTS schedules (
                    id SERIAL PRIMARY KEY,
                    store_id VARCHAR(50) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
                    week_start VARCHAR(20) NOT NULL,
                    published INTEGER DEFAULT 0,
                    published_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(store_id, week_start)
                )
            `);

            // 7. Create shifts table (employee_id nullable — managers can leave shifts empty)
            await client.query(`
                CREATE TABLE IF NOT EXISTS shifts (
                    id SERIAL PRIMARY KEY,
                    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
                    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                    day_of_week VARCHAR(20) NOT NULL,
                    start_time VARCHAR(10) NOT NULL,
                    end_time VARCHAR(10) NOT NULL,
                    role VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 7b. Create trigger to validate shift roles against employee positions
            await client.query(`
                CREATE OR REPLACE FUNCTION validate_shift_role()
                RETURNS TRIGGER AS $$
                DECLARE
                    emp_position VARCHAR(100);
                    emp_sys_role VARCHAR(50);
                    pos_category VARCHAR(50);
                    role_category VARCHAR(50);
                BEGIN
                    -- If no employee assigned, allow it
                    IF NEW.employee_id IS NULL THEN
                        RETURN NEW;
                    END IF;

                    -- Get employee position and system role
                    SELECT e.position, e.role INTO emp_position, emp_sys_role
                    FROM employees e WHERE e.id = NEW.employee_id;

                    -- If admin or manager, allow anything
                    IF emp_sys_role IN ('admin', 'manager') THEN
                        RETURN NEW;
                    END IF;

                    -- Get position category
                    SELECT category INTO pos_category
                    FROM positions WHERE name = emp_position;

                    -- If shift lead (ALL), allow anything
                    IF pos_category = 'ALL' THEN
                        RETURN NEW;
                    END IF;
                    
                    -- Get role category for the assigned shift role
                    SELECT category INTO role_category
                    FROM roles WHERE name = NEW.role;

                    -- If the role is not found in the roles table, we assume it's a custom role and we might want to restrict or allow it. 
                    -- For now, if role is recognized, enforce match.
                    IF role_category IS NOT NULL THEN
                        IF pos_category != role_category THEN
                            RAISE EXCEPTION 'Employee with position % (%) cannot take role % (%)', emp_position, pos_category, NEW.role, role_category;
                        END IF;
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            `);

            await client.query(`
                DROP TRIGGER IF EXISTS trg_validate_shift_role ON shifts;
                CREATE TRIGGER trg_validate_shift_role
                BEFORE INSERT OR UPDATE ON shifts
                FOR EACH ROW
                EXECUTE FUNCTION validate_shift_role();
            `);

            // 7c. For existing DBs: ensure employee_id is nullable and FK has ON DELETE SET NULL
            await client.query(`
                DO $$
                BEGIN
                    ALTER TABLE shifts ALTER COLUMN employee_id DROP NOT NULL;
                EXCEPTION
                    WHEN others THEN NULL;
                END $$;
            `);
            await client.query(`
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'shifts'::regclass
                          AND conname = 'shifts_employee_id_fkey'
                    ) THEN
                        ALTER TABLE shifts DROP CONSTRAINT shifts_employee_id_fkey;
                    END IF;
                    ALTER TABLE shifts
                        ADD CONSTRAINT shifts_employee_id_fkey
                        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
                EXCEPTION
                    WHEN others THEN NULL;
                END $$;
            `);

            // 7. Create availability table
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

            // 8. Create time_off_requests table (all FKs with proper ON DELETE)
            await client.query(`
                CREATE TABLE IF NOT EXISTS time_off_requests (
                    id SERIAL PRIMARY KEY,
                    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    start_date VARCHAR(20) NOT NULL,
                    end_date VARCHAR(20) NOT NULL,
                    requested_date VARCHAR(20),
                    request_scope VARCHAR(20) DEFAULT 'full_day' CHECK (request_scope IN ('full_day', 'partial')),
                    partial_start_time VARCHAR(10),
                    partial_end_time VARCHAR(10),
                    reason TEXT,
                    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
                    review_note TEXT,
                    reviewed_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                    reviewed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    type VARCHAR(50) DEFAULT 'unpaid',
                    replacement_needed INTEGER DEFAULT 0,
                    replacement_notified INTEGER DEFAULT 0,
                    replacement_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                    shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL
                )
            `);

            // 8b. Safe migrations for existing DBs: add missing columns/FKs on time_off_requests
            // Using IF NOT EXISTS for columns (Postgres 9.6+)
            await client.query(`
                ALTER TABLE time_off_requests ADD COLUMN IF NOT EXISTS shift_id INTEGER;
                ALTER TABLE time_off_requests ADD COLUMN IF NOT EXISTS requested_date VARCHAR(20);
                ALTER TABLE time_off_requests ADD COLUMN IF NOT EXISTS request_scope VARCHAR(20) DEFAULT 'full_day';
                ALTER TABLE time_off_requests ADD COLUMN IF NOT EXISTS partial_start_time VARCHAR(10);
                ALTER TABLE time_off_requests ADD COLUMN IF NOT EXISTS partial_end_time VARCHAR(10);
            `);

            // Ensure shift_id FK has ON DELETE SET NULL
            await client.query(`
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_off_requests_shift_id_fkey') THEN
                        ALTER TABLE time_off_requests DROP CONSTRAINT time_off_requests_shift_id_fkey;
                    END IF;
                    ALTER TABLE time_off_requests ADD CONSTRAINT time_off_requests_shift_id_fkey
                        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
                EXCEPTION
                    WHEN others THEN NULL;
                END $$;
            `);

            // Ensure reviewed_by FK has ON DELETE SET NULL
            await client.query(`
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_off_requests_reviewed_by_fkey') THEN
                        ALTER TABLE time_off_requests DROP CONSTRAINT time_off_requests_reviewed_by_fkey;
                    END IF;
                    ALTER TABLE time_off_requests ADD CONSTRAINT time_off_requests_reviewed_by_fkey
                        FOREIGN KEY (reviewed_by) REFERENCES employees(id) ON DELETE SET NULL;
                EXCEPTION
                    WHEN others THEN NULL;
                END $$;
            `);

            // Ensure replacement_id FK → employees with ON DELETE SET NULL
            await client.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'time_off_requests'::regclass
                          AND conname = 'time_off_requests_replacement_id_fkey'
                    ) THEN
                        ALTER TABLE time_off_requests ADD CONSTRAINT time_off_requests_replacement_id_fkey
                            FOREIGN KEY (replacement_id) REFERENCES employees(id) ON DELETE SET NULL;
                    END IF;
                EXCEPTION
                    WHEN others THEN NULL;
                END $$;
            `);

            // 8b-2. Enforce one time-off request per employee per day (excluding denied)
            await client.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS uq_time_off_emp_date
                ON time_off_requests (employee_id, requested_date)
                WHERE status != 'denied'
            `);

            // 8c. Create shift_swap_requests table

            await client.query(`
                CREATE TABLE IF NOT EXISTS shift_swap_requests (
                    id SERIAL PRIMARY KEY,
                    requester_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    requester_shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
                    proposed_partner_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
                    partner_status VARCHAR(20) DEFAULT 'pending' CHECK (partner_status IN ('pending', 'accepted', 'declined')),
                    reason TEXT,
                    review_note TEXT,
                    reviewed_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                    reviewed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 8c-2. Safe migration: add partner_status to existing databases
            await client.query(`
                ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS partner_status VARCHAR(20) DEFAULT 'pending';
            `);
            await client.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'shift_swap_requests'::regclass
                          AND conname = 'shift_swap_requests_partner_status_check'
                    ) THEN
                        ALTER TABLE shift_swap_requests ADD CONSTRAINT shift_swap_requests_partner_status_check
                            CHECK (partner_status IN ('pending', 'accepted', 'declined'));
                    END IF;
                EXCEPTION
                    WHEN others THEN NULL;
                END $$;
            `);

            // 8d. Safe migration: add index for shift_swap_requests
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_swap_requests_requester ON shift_swap_requests(requester_id);
                CREATE INDEX IF NOT EXISTS idx_swap_requests_partner ON shift_swap_requests(proposed_partner_id);
                CREATE INDEX IF NOT EXISTS idx_swap_requests_status ON shift_swap_requests(status);
            `);

            // 9a. Create notifications table
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

            // 9b. Create push_subscriptions table
            await client.query(`
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    subscription_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, subscription_json)
                )
            `);

            // 10a. Create conversations table
            await client.query(`
                CREATE TABLE IF NOT EXISTS conversations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255),
                    is_team INTEGER DEFAULT 0,
                    created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 10b. Create conversation_members table
            await client.query(`
                CREATE TABLE IF NOT EXISTS conversation_members (
                    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (conversation_id, user_id)
                )
            `);

            // 10c. Create messages table
            await client.query(`
                CREATE TABLE IF NOT EXISTS messages (
                    id SERIAL PRIMARY KEY,
                    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
                    sender_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
                    content_encrypted TEXT,
                    iv VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 10d. Safe migration: ensure conversations.created_by and messages.sender_id have ON DELETE SET NULL
            await client.query(`
                DO $$
                BEGIN
                    -- conversations.created_by
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'conversations'::regclass
                          AND conname = 'conversations_created_by_fkey'
                    ) THEN
                        ALTER TABLE conversations DROP CONSTRAINT conversations_created_by_fkey;
                    END IF;
                    ALTER TABLE conversations ADD CONSTRAINT conversations_created_by_fkey
                        FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL;

                    -- messages.sender_id
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'messages'::regclass
                          AND conname = 'messages_sender_id_fkey'
                    ) THEN
                        ALTER TABLE messages DROP CONSTRAINT messages_sender_id_fkey;
                    END IF;
                    ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey
                        FOREIGN KEY (sender_id) REFERENCES employees(id) ON DELETE SET NULL;
                EXCEPTION
                    WHEN others THEN NULL;
                END $$;
            `);

            // 11. Create system_settings table
            await client.query(`
                CREATE TABLE IF NOT EXISTS system_settings (
                    "key" VARCHAR(50) PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Safe migrations for existing DBs: ensure PKs and unique constraints
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

            // ════════════════════════════════════════════
            // SEED DATA
            // ════════════════════════════════════════════

            // Seed default backup schedule if not exists
            await client.query(`
                INSERT INTO system_settings ("key", value)
                VALUES ('backup_schedule', '0 0 * * *')
                ON CONFLICT ("key") DO NOTHING
            `);

            // Seed default max backup count if not exists
            await client.query(`
                INSERT INTO system_settings ("key", value)
                VALUES ('backup_max_count', '7')
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

            // ════════════════════════════════════════════
            // INDEXES (on all FK and frequently queried columns)
            // ════════════════════════════════════════════

            // employees
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status)');
            // employee_default_shifts / additional_roles
            await client.query('CREATE INDEX IF NOT EXISTS idx_default_shifts_employee ON employee_default_shifts(employee_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_additional_roles_employee ON employee_additional_roles(employee_id)');
            // shifts
            await client.query('CREATE INDEX IF NOT EXISTS idx_shifts_schedule ON shifts(schedule_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_id)');
            // schedules
            await client.query('CREATE INDEX IF NOT EXISTS idx_schedules_store ON schedules(store_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_schedules_week ON schedules(week_start)');
            // time_off_requests
            await client.query('CREATE INDEX IF NOT EXISTS idx_time_off_employee ON time_off_requests(employee_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_time_off_status ON time_off_requests(status)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_time_off_shift ON time_off_requests(shift_id)');
            // notifications
            await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read)');
            // push_subscriptions
            await client.query('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)');
            // conversations / messages
            await client.query('CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_messages_conversation_time ON messages(conversation_id, created_at DESC)');

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

    // ── Standalone migrations (run independently outside main transaction) ──
    // These are critical columns that must exist regardless of transaction history.
    const standaloneMigrations = [
        // partner_status on shift_swap_requests
        `ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS partner_status VARCHAR(20) DEFAULT 'pending'`,
        // Add CHECK constraint safely (ignore if already exists)
        `DO $$ BEGIN
            ALTER TABLE shift_swap_requests ADD CONSTRAINT shift_swap_requests_partner_status_check
                CHECK (partner_status IN ('pending', 'accepted', 'declined'));
        EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        // Ensure reviewed_by is nullable with correct FK
        `ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS reviewed_by INTEGER`,
        `ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP`,
        `ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS review_note TEXT`,
    ];

    for (const sql of standaloneMigrations) {
        try {
            await pool.query(sql);
        } catch (err) {
            // Non-fatal: log but continue
            console.warn('⚠️  Standalone migration skipped:', err.message);
        }
    }
    console.log('✅ Standalone migrations complete.');
}

// Seed default data
async function seedDefaultData() {
    let res;
    try {
        // ── Create default store FIRST (must exist before admin due to FK) ──
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

        // ── Create default admin account ──
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

        if (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || process.env.ADMIN_PASSWORD) {
            console.log('Loaded admin credentials from environment variables.');
        } else {
            console.warn('WARNING: No admin credentials found in environment. Default admin creation skipped for security.');
            return;
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
