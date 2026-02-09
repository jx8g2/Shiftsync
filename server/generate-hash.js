const bcrypt = require('bcrypt');

// Generate a proper password hash for the default manager
async function generateHash() {
    const password = 'manager123';
    const hash = await bcrypt.hash(password, 10);
    console.log('Password:', password);
    console.log('Hash:', hash);
    console.log('\nUse this in your schema.sql file');
}

generateHash();
