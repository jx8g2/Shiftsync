const { db } = require('./db');

try {
    const info = db.prepare('PRAGMA table_info(time_off_requests)').all();
    console.log('Columns in time_off_requests:', info.map(c => c.name));
} catch (error) {
    console.error('Error checking DB:', error);
}
