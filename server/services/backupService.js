const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { queryOne } = require('../db');

// Configuration
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
const CONTAINER_NAME = process.env.DB_CONTAINER_NAME || 'shiftsync_db';
const DB_USER = 'postgres';
const DB_NAME = 'shiftsync';
const MAX_BACKUPS_DEFAULT = 7; // used only if DB setting is absent

let currentTask = null;

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Parse DATABASE_URL into pg_dump / psql CLI args
const parseDbUrl = () => {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL environment variable is required');
    }
    const url = new URL(process.env.DATABASE_URL);
    return {
        host: url.hostname,
        port: url.port || '5432',
        user: url.username,
        password: url.password,
        dbname: url.pathname.replace('/', '')
    };
};

// Returns env object with PGPASSWORD set (avoids password prompts)
const pgEnv = () => {
    const { password } = parseDbUrl();
    return { ...process.env, PGPASSWORD: password };
};

const performBackup = () => {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.sql`;
        const filepath = path.join(BACKUP_DIR, filename);
        const { host, port, user, dbname } = parseDbUrl();

        console.log(`[Backup] Starting database backup: ${filename}`);

        const command = `pg_dump -h ${host} -p ${port} -U ${user} -d ${dbname} -c --if-exists -f "${filepath}"`;

        exec(command, { env: pgEnv() }, (error) => {
            if (error) {
                console.error(`[Backup] Error: ${error.message}`);
                return reject(error);
            }
            console.log(`[Backup] Successfully created ${filename}`);
            cleanupOldBackups();
            resolve({ filename, filepath });
        });
    });
};

const cleanupOldBackups = async () => {
    // Read max from DB so changes take effect without a restart
    let maxBackups = MAX_BACKUPS_DEFAULT;
    try {
        const setting = await queryOne('SELECT value FROM system_settings WHERE "key" = $1', ['backup_max_count']);
        if (setting && parseInt(setting.value, 10) > 0) {
            maxBackups = parseInt(setting.value, 10);
        }
    } catch (_) { /* use default */ }

    fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) {
            console.error('[Backup] cleanup failed:', err);
            return;
        }

        const sqlFiles = files.filter(f => f.endsWith('.sql')).sort().reverse();

        if (sqlFiles.length > maxBackups) {
            const filesToDelete = sqlFiles.slice(maxBackups);
            filesToDelete.forEach(file => {
                const deletePath = path.join(BACKUP_DIR, file);
                fs.unlink(deletePath, err => {
                    if (err) console.error(`[Backup] Failed to delete old backup ${file}:`, err);
                    else console.log(`[Backup] Deleted old backup: ${file}`);
                });
            });
        }
    });
};

// Initialize Scheduler
const initBackupService = async () => {
    try {
        const setting = await queryOne('SELECT value FROM system_settings WHERE "key" = $1', ['backup_schedule']);
        const schedule = setting ? setting.value : '0 0 * * *';

        console.log(`[Backup] Service initialized. Schedule: ${schedule}`);
        rescheduleBackup(schedule);
    } catch (error) {
        console.error('[Backup] Failed to initialize service:', error);
        // Fallback
        rescheduleBackup('0 0 * * *');
    }
};

const rescheduleBackup = (schedule) => {
    if (currentTask) {
        currentTask.stop();
    }

    if (cron.validate(schedule)) {
        currentTask = cron.schedule(schedule, () => {
            performBackup();
        });
        console.log(`[Backup] Rescheduled to: ${schedule}`);
    } else {
        console.error(`[Backup] Invalid cron schedule: ${schedule}`);
    }
};

const getBackups = () => {
    return new Promise((resolve, reject) => {
        fs.readdir(BACKUP_DIR, (err, files) => {
            if (err) {
                return reject(err);
            }

            const backups = files
                .filter(f => f.endsWith('.sql'))
                .map(f => {
                    const stats = fs.statSync(path.join(BACKUP_DIR, f));
                    return {
                        filename: f,
                        size: stats.size,
                        createdAt: stats.mtime
                    };
                })
                .sort((a, b) => b.createdAt - a.createdAt);

            resolve(backups);
        });
    });
};

const restoreBackup = (filename) => {
    return new Promise((resolve, reject) => {
        // 1. Sanitize and validate filename to prevent Path Traversal and Command Injection
        if (!filename || typeof filename !== 'string') {
            return reject(new Error('Invalid filename'));
        }

        const safeFilename = path.basename(filename);
        if (safeFilename !== filename) {
            return reject(new Error('Invalid filename: Path traversal characters are not allowed'));
        }

        // Strict regex for backup filename: backup-YYYY-MM-DDTHH-mm-ss-SSSZ.sql OR mock-*.sql
        const backupRegex = /^(backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z|mock-[a-zA-Z0-9\-_]+)\.sql$/;
        if (!backupRegex.test(safeFilename)) {
            return reject(new Error('Invalid backup filename format'));
        }

        const filepath = path.join(BACKUP_DIR, safeFilename);
        if (!fs.existsSync(filepath)) {
            return reject(new Error('Backup file not found'));
        }

        // 2. Performance check: Ensure file is not empty before destructive operation
        const stats = fs.statSync(filepath);
        if (stats.size === 0) {
            return reject(new Error('Backup file is empty; restoration aborted to prevent data loss'));
        }

        const { host, port, user, dbname } = parseDbUrl();
        const env = pgEnv();

        console.log(`[Backup] Restoring from ${safeFilename}...`);

        // 3. Drop and recreate schema for a clean slate
        // Use double quotes around vars in shell command to prevent any potential injection if vars were tainted
        // though they come from URL parser which validated them.
        const dropCommand = `psql -h "${host}" -p "${port}" -U "${user}" -d "${dbname}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`;

        exec(dropCommand, { env }, (dropError) => {
            if (dropError) {
                console.error(`[Backup] Failed to drop schema: ${dropError.message}`);
                return reject(new Error(`Failed to clean database: ${dropError.message}`));
            }

            console.log('[Backup] Database cleaned. Applying backup...');

            // 4. Restore from file
            const restoreCommand = `psql -h "${host}" -p "${port}" -U "${user}" -d "${dbname}" -f "${filepath}"`;

            exec(restoreCommand, { env }, (error) => {
                if (error) {
                    console.error(`[Backup] Restore failed: ${error.message}`);
                    return reject(error);
                }
                console.log('[Backup] Restore successful.');
                resolve(true);
            });
        });
    });
};

module.exports = {
    initBackupService,
    performBackup,
    rescheduleBackup,
    getBackups,
    restoreBackup
};
