const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db, queryOne, query } = require('../db');

const router = express.Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET environment variable is not defined.');
    process.exit(1);
}
const JWT_EXPIRES_IN = '24h';

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password, username } = req.body;

        // Allow login by email or username
        const loginIdentifier = email || username;

        if (!loginIdentifier || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email/username and password are required'
            });
        }

        // Find user by email or username
        const user = await queryOne(
            `SELECT e.*, p.category AS position_category 
             FROM employees e 
             LEFT JOIN positions p ON e.position = p.name 
             WHERE e.email = $1 OR e.username = $2`,
            [loginIdentifier, loginIdentifier]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // --- BRUTE FORCE PROTECTION: Check if account is locked ---
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(403).json({
                success: false,
                error: 'Account temporarily locked due to too many failed login attempts. Please try again later.'
            });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            // --- BRUTE FORCE PROTECTION: Increment failed attempts ---
            const maxAttempts = 5;
            const lockoutDurationMinutes = 15;

            const newAttempts = (user.failed_login_attempts || 0) + 1;
            let lockedUntil = null;

            if (newAttempts >= maxAttempts) {
                const lockTime = new Date();
                lockTime.setMinutes(lockTime.getMinutes() + lockoutDurationMinutes);
                lockedUntil = lockTime;
            }

            await query(
                'UPDATE employees SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
                [newAttempts, lockedUntil, user.id]
            );

            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // --- BRUTE FORCE PROTECTION: Reset attempts on success ---
        if (user.failed_login_attempts > 0 || user.locked_until !== null) {
            await query(
                'UPDATE employees SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
                [user.id]
            );
        }

        // Check if user is active
        if (user.status !== 'active') {
            return res.status(401).json({
                success: false,
                error: 'Account is inactive. Please contact your manager.'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Get user's default shifts
        const shifts = await query(
            'SELECT * FROM employee_default_shifts WHERE employee_id = $1 ORDER BY day_of_week',
            [user.id]
        );

        // Get user's additional roles
        const roles = await query(
            'SELECT role_name FROM employee_additional_roles WHERE employee_id = $1',
            [user.id]
        );

        // Format user response (exclude password)
        const userResponse = {
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            position: user.position,
            positionCategory: user.position_category,
            storeId: user.store_id,
            avatar: user.avatar,
            hourlyRate: user.hourly_rate,
            maxHoursPerWeek: user.max_hours_per_week,
            status: user.status,
            hireDate: user.hire_date,
            defaultShifts: shifts.map(shift => ({
                dayOfWeek: shift.day_of_week,
                startTime: shift.start_time,
                endTime: shift.end_time,
                primaryRole: shift.primary_role,
                isOff: Boolean(shift.is_off)
            })),
            additionalRoles: roles.map(r => r.role_name)
        };

        res.json({
            success: true,
            token,
            user: userResponse
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await queryOne(
            `SELECT e.*, p.category AS position_category 
             FROM employees e 
             LEFT JOIN positions p ON e.position = p.name 
             WHERE e.id = $1`,
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get user's default shifts
        const shifts = await query(
            'SELECT * FROM employee_default_shifts WHERE employee_id = $1 ORDER BY day_of_week',
            [user.id]
        );

        // Get user's additional roles
        const roles = await query(
            'SELECT role_name FROM employee_additional_roles WHERE employee_id = $1',
            [user.id]
        );

        const userResponse = {
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            position: user.position,
            positionCategory: user.position_category,
            storeId: user.store_id,
            avatar: user.avatar,
            hourlyRate: user.hourly_rate,
            maxHoursPerWeek: user.max_hours_per_week,
            status: user.status,
            hireDate: user.hire_date,
            defaultShifts: shifts.map(shift => ({
                dayOfWeek: shift.day_of_week,
                startTime: shift.start_time,
                endTime: shift.end_time,
                primaryRole: shift.primary_role,
                isOff: Boolean(shift.is_off)
            })),
            additionalRoles: roles.map(r => r.role_name)
        };

        res.json({
            success: true,
            user: userResponse
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access token required'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }
        req.user = user;
        next();
    });
}

// Export middleware for use in other routes
router.authenticateToken = authenticateToken;

module.exports = router;
