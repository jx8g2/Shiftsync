const { db } = require('./db');

try {
    console.log("Fixing 'unpaid' types in database...");

    // Check current state
    const before = db.prepare("SELECT count(*) as count FROM time_off_requests WHERE type = 'unpaid' OR type IS NULL").get();
    console.log(`Found ${before.count} requests with 'unpaid' or NULL type.`);

    // Update to 'personal' (safe default)
    const result = db.prepare("UPDATE time_off_requests SET type = 'personal' WHERE type = 'unpaid' OR type IS NULL").run();
    console.log(`Updated ${result.changes} records to 'personal'.`);

} catch (error) {
    console.error('Error fixing DB:', error);
}
