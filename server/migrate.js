const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'shiftsync.db');
const db = new Database(DB_PATH);

console.log('Running migration check...');

const columns = [
    { name: 'review_note', type: 'TEXT' },
    { name: 'reviewed_by', type: 'INTEGER REFERENCES employees(id)' },
    { name: 'reviewed_at', type: 'TEXT' }
];

columns.forEach(col => {
    try {
        db.exec(`ALTER TABLE time_off_requests ADD COLUMN ${col.name} ${col.type}`);
        console.log(`✅ Added column: ${col.name}`);
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log(`ℹ️ Column exists: ${col.name}`);
        } else {
            console.error(`❌ Error adding ${col.name}:`, e.message);
        }
    }
});

console.log('Migration check complete.');
db.close();
