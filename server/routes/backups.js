const express = require('express');
const router = express.Router();
const {
    performBackup,
    rescheduleBackup,
    getBackups,
    restoreBackup
} = require('../services/backupService');
const { queryOne, run } = require('../db');

// Middleware to check if user is admin
const authenticateToken = (req, res, next) => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false, error: 'Access token required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: 'Invalid token' });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, error: 'Admin access required' });
    }
};

// Apply middleware to all routes
router.use(authenticateToken);
router.use(isAdmin);

// GET /api/admin/backups/config - Get current schedule
router.get('/config', async (req, res) => {
    try {
        const setting = await queryOne('SELECT value FROM system_settings WHERE "key" = $1', ['backup_schedule']);
        res.json({ success: true, schedule: setting ? setting.value : '0 0 * * *' });
    } catch (error) {
        console.error('Get backup config error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/admin/backups/config - Update schedule
router.post('/config', async (req, res) => {
    try {
        const { schedule } = req.body;

        const cron = require('node-cron');

        // Validate cron expression using node-cron
        if (!schedule || !cron.validate(schedule)) {
            return res.status(400).json({ success: false, error: 'Invalid cron expression format. Please use standard 5-part cron syntax.' });
        }

        await run(`
            INSERT INTO system_settings ("key", value)
            VALUES ('backup_schedule', $1)
            ON CONFLICT ("key") DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
        `, [schedule]);

        rescheduleBackup(schedule);

        res.json({ success: true, message: 'Backup schedule updated' });
    } catch (error) {
        console.error('Update backup config error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/admin/backups/config/max-count - Get max backup count
router.get('/config/max-count', async (req, res) => {
    try {
        const setting = await queryOne('SELECT value FROM system_settings WHERE "key" = $1', ['backup_max_count']);
        res.json({ success: true, maxCount: setting ? parseInt(setting.value, 10) : 7 });
    } catch (error) {
        console.error('Get max backup count error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/admin/backups/config/max-count - Update max backup count
router.post('/config/max-count', async (req, res) => {
    try {
        const { maxCount } = req.body;
        const n = parseInt(maxCount, 10);
        if (!n || n < 1 || n > 100) {
            return res.status(400).json({ success: false, error: 'Max count must be between 1 and 100.' });
        }

        await run(`
            INSERT INTO system_settings ("key", value)
            VALUES ('backup_max_count', $1)
            ON CONFLICT ("key") DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
        `, [String(n)]);

        res.json({ success: true, message: 'Max backup count updated', maxCount: n });
    } catch (error) {
        console.error('Update max backup count error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/admin/backups/list - List available backups
router.get('/list', async (req, res) => {
    try {
        const backups = await getBackups();
        res.json({ success: true, backups });
    } catch (error) {
        console.error('Get backups list error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/admin/backups/create - Trigger manual backup
router.post('/create', async (req, res) => {
    try {
        const result = await performBackup();
        res.json({ success: true, message: 'Backup created successfully', filename: result.filename });
    } catch (error) {
        console.error('Create backup error:', error);
        res.status(500).json({ success: false, error: 'Backup failed: ' + error.message });
    }
});

// POST /api/admin/backups/restore - Restore a backup
router.post('/restore', async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) {
            return res.status(400).json({ success: false, error: 'Filename is required' });
        }

        await restoreBackup(filename);
        res.json({ success: true, message: 'Restore completed successfully' });
    } catch (error) {
        console.error('Restore backup error:', error);
        res.status(500).json({ success: false, error: 'Restore failed: ' + error.message });
    }
});

module.exports = router;
