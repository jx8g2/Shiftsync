-- ShiftSync Database Schema
-- Run this file to create the database structure

-- Create database (run separately if needed)
-- CREATE DATABASE shiftsync;

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'employee' CHECK (role IN ('manager', 'employee')),
    position VARCHAR(50),
    store_id VARCHAR(50) DEFAULT 'store-001',
    avatar VARCHAR(10),
    hourly_rate DECIMAL(10,2) DEFAULT 15.00,
    max_hours_per_week INTEGER DEFAULT 40,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    hire_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Weekly default shifts table (one entry per day per employee)
CREATE TABLE IF NOT EXISTS employee_default_shifts (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
    start_time TIME,
    end_time TIME,
    primary_role VARCHAR(50),
    is_off BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, day_of_week)
);

-- Additional roles (add-on roles for future coverage flexibility)
CREATE TABLE IF NOT EXISTS employee_additional_roles (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    role_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, role_name)
);

-- Stores table
CREATE TABLE IF NOT EXISTS stores (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    phone VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'America/Chicago',
    manager_id INTEGER REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store operating hours
CREATE TABLE IF NOT EXISTS store_operating_hours (
    id SERIAL PRIMARY KEY,
    store_id VARCHAR(50) REFERENCES stores(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL,
    open_time TIME,
    close_time TIME,
    is_closed BOOLEAN DEFAULT false,
    UNIQUE(store_id, day_of_week)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username);
CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store_id);
CREATE INDEX IF NOT EXISTS idx_default_shifts_employee ON employee_default_shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_additional_roles_employee ON employee_additional_roles(employee_id);

-- Insert default manager account (password: manager123)
-- Password hash generated with bcrypt
INSERT INTO employees (username, password_hash, name, phone, email, role, position, store_id, avatar)
VALUES (
    'manager',
    '$2b$10$ojXGgvLNu/Eku7QF.3dUxex2f.rRvUg5pzlv1OihzUD82DrnTPmH6',
    'Store Manager',
    '(512) 555-0001',
    'manager@shiftsync.com',
    'manager',
    'Store Manager',
    'store-001',
    'SM'
) ON CONFLICT (email) DO NOTHING;

-- Insert default store
INSERT INTO stores (id, name, address, city, state, zip_code, phone, timezone)
VALUES (
    'store-001',
    'Main Location',
    '123 Main Street',
    'Austin',
    'TX',
    '78701',
    '(512) 555-0101',
    'America/Chicago'
) ON CONFLICT (id) DO NOTHING;

-- Insert default operating hours for store
INSERT INTO store_operating_hours (store_id, day_of_week, open_time, close_time, is_closed) VALUES
    ('store-001', 'monday', '06:00', '22:00', false),
    ('store-001', 'tuesday', '06:00', '22:00', false),
    ('store-001', 'wednesday', '06:00', '22:00', false),
    ('store-001', 'thursday', '06:00', '22:00', false),
    ('store-001', 'friday', '06:00', '23:00', false),
    ('store-001', 'saturday', '07:00', '23:00', false),
    ('store-001', 'sunday', '08:00', '20:00', false)
ON CONFLICT (store_id, day_of_week) DO NOTHING;

-- ============================================
-- CHAT SYSTEM TABLES
-- ============================================

-- Chat conversations (1:1 or team/group)
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100), -- null for 1:1 chats, name for team/group chats
    is_team BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversation members
CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id)
);

-- Messages (encrypted content)
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES employees(id),
    content_encrypted TEXT NOT NULL, -- AES-encrypted message content
    iv VARCHAR(32), -- Initialization vector for AES decryption
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);

-- ============================================
-- NOTIFICATION SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'shift_replacement', 'request_update', 'message', etc.
    title VARCHAR(200) NOT NULL,
    message TEXT,
    related_entity_type VARCHAR(50), -- 'time_off_request', 'shift', 'conversation', etc.
    related_entity_id INTEGER,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);

-- ============================================
-- TIME OFF REQUESTS (with replacement tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS time_off_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    request_type VARCHAR(50) DEFAULT 'vacation', -- vacation, personal, medical, family, other
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    reviewer_id INTEGER REFERENCES employees(id),
    review_notes TEXT,
    reviewed_at TIMESTAMP,
    -- Replacement tracking
    replacement_needed BOOLEAN DEFAULT false,
    replacement_id INTEGER REFERENCES employees(id),
    replacement_notified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_time_off_employee ON time_off_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_off_status ON time_off_requests(status);

