const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'shiftsync.db');

try {
    console.log('Connecting to DB at:', DB_PATH);
    const db = new Database(DB_PATH, { timeout: 5000 });
    console.log('Connected.');

    const employees = db.prepare('SELECT id, name, email FROM employees').all();
    console.log('Employees:', JSON.stringify(employees, null, 2));

} catch (e) {
    console.error('DB Error:', e);
}
