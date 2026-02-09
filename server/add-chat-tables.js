// Add chat tables to database
const { db } = require('./db');

console.log('Adding chat and notification tables...');

try {
    // Create conversations table
    db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100),
            is_team BOOLEAN DEFAULT 0,
            created_by INTEGER REFERENCES employees(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✓ conversations table created');

    // Create conversation_members table
    db.exec(`
        CREATE TABLE IF NOT EXISTS conversation_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(conversation_id, user_id)
        )
    `);
    console.log('✓ conversation_members table created');

    // Create messages table
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
            sender_id INTEGER REFERENCES employees(id),
            content_encrypted TEXT NOT NULL,
            iv VARCHAR(32),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✓ messages table created');

    // Create notifications table
    db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(200),
            message TEXT,
            is_read BOOLEAN DEFAULT 0,
            related_entity_type VARCHAR(50),
            related_entity_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✓ notifications table created');

    console.log('\n✅ All chat tables created successfully!');
} catch (error) {
    console.error('Error creating tables:', error);
    process.exit(1);
}
