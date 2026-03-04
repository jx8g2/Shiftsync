const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, query, queryOne, run } = require('../db');
const { publishUpdate, broadcastUpdate } = require('../utils/redis');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET environment variable is not defined.');
    process.exit(1);
}
const SALT_ROUNDS = 10;

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

// Middleware to check if user is manager or admin
function requireManager(req, res, next) {
    if (req.user.role !== 'manager' && req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Manager access required'
        });
    }
    next();
}

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
    }
    next();
}

// GET /api/employees/chat-contacts - List employees for chat, scoped to same store
router.get('/chat-contacts', authenticateToken, async (req, res) => {
    try {
        let employees;

        if (req.user.role === 'admin') {
            // Admins can see everyone (for cross-store admin tasks)
            employees = await query(
                `SELECT id, name, avatar, role, position, status, store_id
                 FROM employees WHERE status = $1 ORDER BY name`,
                ['active']
            );
        } else {
            // Employees and managers only see people in their own store
            const me = await queryOne('SELECT store_id FROM employees WHERE id = $1', [req.user.id]);
            employees = await query(
                `SELECT id, name, avatar, role, position, status, store_id
                 FROM employees
                 WHERE status = $1 AND store_id = $2 AND role != 'admin'
                 ORDER BY name`,
                ['active', me?.store_id]
            );
        }

        res.json({
            success: true,
            employees: employees.map(emp => ({
                id: emp.id,
                name: emp.name,
                avatar: emp.avatar,
                role: emp.role,
                position: emp.position,
                status: emp.status,
                storeId: emp.store_id
            }))
        });
    } catch (error) {
        console.error('Get chat contacts error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/employees - List all employees
// Admins see all users (optionally filtered by storeId query param)
// Managers only see employees in their own store
router.get('/', authenticateToken, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const isManager = req.user.role === 'manager';
        const filterStoreId = req.query.storeId; // Admin can filter by store

        let employeesQuery = 'SELECT e.*, p.category as position_category FROM employees e LEFT JOIN positions p ON e.position = p.name';
        let queryParams = [];
        let conditions = [];
        let paramCount = 1;

        if (!isAdmin) {
            // Both Managers AND regular Employees see only employees in their store
            const me = await queryOne('SELECT store_id FROM employees WHERE id = $1', [req.user.id]);
            const myStoreId = me?.store_id;
            conditions.push(`e.store_id = $${paramCount++}`);
            queryParams.push(myStoreId);

            if (isManager) {
                // filter out admins for managers
                conditions.push(`e.role != 'admin'`);
            }
        } else if (isAdmin && filterStoreId) {
            // Admin filtering by a specific store
            conditions.push(`e.store_id = $${paramCount++}`);
            queryParams.push(filterStoreId);
        }

        if (conditions.length > 0) {
            employeesQuery += ' WHERE ' + conditions.join(' AND ');
        }

        employeesQuery += ' ORDER BY e.name';
        const employees = await query(employeesQuery, queryParams);

        // Bulk-fetch shifts and roles for all employees at once (avoids N+1)
        const employeeIds = employees.map(e => e.id);
        const allShifts = employeeIds.length > 0
            ? await query('SELECT * FROM employee_default_shifts WHERE employee_id = ANY($1)', [employeeIds])
            : [];
        const allRoles = employeeIds.length > 0
            ? await query('SELECT employee_id, role_name FROM employee_additional_roles WHERE employee_id = ANY($1)', [employeeIds])
            : [];

        const result = employees.map(emp => {
            const empShifts = allShifts.filter(s => s.employee_id === emp.id);
            const empRoles = allRoles.filter(r => r.employee_id === emp.id);

            return {
                id: emp.id,
                username: emp.username,
                name: emp.name,
                email: emp.email,
                phone: emp.phone,
                role: emp.role,
                position: emp.position,
                positionCategory: emp.position_category,
                storeId: emp.store_id,
                avatar: emp.avatar,
                hourlyRate: emp.hourly_rate,
                maxHoursPerWeek: emp.max_hours_per_week,
                status: emp.status,
                hireDate: emp.hire_date,
                createdAt: emp.created_at,
                defaultShifts: empShifts.map(s => ({
                    dayOfWeek: s.day_of_week,
                    startTime: s.start_time,
                    endTime: s.end_time,
                    primaryRole: s.primary_role,
                    isOff: Boolean(s.is_off)
                })),
                additionalRoles: empRoles.map(r => r.role_name)
            };
        });

        console.log('Sending employees payload. First employee:', result[0]);

        res.json({
            success: true,
            employees: result
        });

    } catch (error) {
        console.error('Get employees error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// GET /api/employees/:id - Get single employee
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const emp = await queryOne('SELECT * FROM employees WHERE id = $1', [id]);

        if (!emp) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        const shifts = await query(
            'SELECT * FROM employee_default_shifts WHERE employee_id = $1 ORDER BY day_of_week',
            [id]
        );

        const roles = await query(
            'SELECT role_name FROM employee_additional_roles WHERE employee_id = $1',
            [id]
        );

        const employee = {
            id: emp.id,
            username: emp.username,
            name: emp.name,
            email: emp.email,
            phone: emp.phone,
            role: emp.role,
            position: emp.position,
            storeId: emp.store_id,
            avatar: emp.avatar,
            hourlyRate: emp.hourly_rate,
            maxHoursPerWeek: emp.max_hours_per_week,
            status: emp.status,
            hireDate: emp.hire_date,
            createdAt: emp.created_at,
            defaultShifts: shifts.map(s => ({
                dayOfWeek: s.day_of_week,
                startTime: s.start_time,
                endTime: s.end_time,
                primaryRole: s.primary_role,
                isOff: Boolean(s.is_off)
            })),
            additionalRoles: roles.map(r => r.role_name)
        };

        res.json({
            success: true,
            employee
        });

    } catch (error) {
        console.error('Get employee error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// POST /api/employees - Create new employee or manager
// Admin can create managers, Manager can only create employees
router.post('/', authenticateToken, requireManager, async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const {
            username,
            password,
            name,
            email,
            phone,
            position,
            hourlyRate,
            maxHoursPerWeek,
            defaultShifts,
            additionalRoles,
            role: requestedRole
        } = req.body;

        // Validate required fields
        if (!username || !password || !name || !email) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({
                success: false,
                error: 'Username, password, name, and email are required'
            });
        }

        // Determine role: admins can create managers, managers can only create employees
        let newRole = 'employee';
        if (requestedRole === 'manager') {
            if (req.user.role !== 'admin') {
                await client.query('ROLLBACK');
                client.release();
                return res.status(403).json({
                    success: false,
                    error: 'Only admins can create manager accounts'
                });
            }
            newRole = 'manager';
        }

        // Check if username or email already exists
        const existingRes = await client.query(
            'SELECT id FROM employees WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingRes.rows[0]) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({
                success: false,
                error: 'Username or email already exists'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Generate avatar from name
        const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        // Determine store_id
        let assignedStoreId = req.body.storeId || 'store-001';
        if (req.user.role === 'manager') {
            const mgrRes = await client.query('SELECT store_id FROM employees WHERE id = $1', [req.user.id]);
            assignedStoreId = mgrRes.rows[0]?.store_id || 'store-001';
        }

        // Insert employee
        const insertRes = await client.query(`
            INSERT INTO employees (
                username, password_hash, name, email, phone, 
                role, position, store_id, avatar, hourly_rate, max_hours_per_week
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
        `, [
            username,
            passwordHash,
            name,
            email,
            phone || null,
            newRole,
            position || (newRole === 'manager' ? 'Store Manager' : 'Crew Member'),
            assignedStoreId,
            avatar,
            hourlyRate || 15.00,
            maxHoursPerWeek || 40
        ]);

        const employeeId = insertRes.rows[0].id;

        // Insert default shifts
        if (defaultShifts && Array.isArray(defaultShifts)) {
            for (const shift of defaultShifts) {
                await client.query(`
                    INSERT INTO employee_default_shifts 
                    (employee_id, day_of_week, start_time, end_time, primary_role, is_off)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    employeeId,
                    shift.dayOfWeek,
                    shift.isOff ? null : shift.startTime,
                    shift.isOff ? null : shift.endTime,
                    shift.primaryRole || null,
                    shift.isOff ? 1 : 0
                ]);
            }
        }

        // Insert additional roles
        if (additionalRoles && Array.isArray(additionalRoles)) {
            for (const role of additionalRoles) {
                if (role) {
                    await client.query(`
                        INSERT INTO employee_additional_roles (employee_id, role_name)
                        VALUES ($1, $2)
                    `, [employeeId, role]);
                }
            }
        }

        await client.query('COMMIT');

        // Fetch complete employee data (outside transaction, read-only)
        const newEmployee = await queryOne('SELECT * FROM employees WHERE id = $1', [employeeId]);
        const shifts = await query('SELECT * FROM employee_default_shifts WHERE employee_id = $1', [employeeId]);
        const roles = await query('SELECT role_name FROM employee_additional_roles WHERE employee_id = $1', [employeeId]);

        const employee = {
            id: newEmployee.id,
            username: newEmployee.username,
            name: newEmployee.name,
            email: newEmployee.email,
            phone: newEmployee.phone,
            role: newEmployee.role,
            position: newEmployee.position,
            storeId: newEmployee.store_id,
            avatar: newEmployee.avatar,
            hourlyRate: newEmployee.hourly_rate,
            maxHoursPerWeek: newEmployee.max_hours_per_week,
            status: newEmployee.status,
            hireDate: newEmployee.hire_date,
            createdAt: newEmployee.created_at,
            defaultShifts: shifts.map(s => ({
                dayOfWeek: s.day_of_week,
                startTime: s.start_time,
                endTime: s.end_time,
                primaryRole: s.primary_role,
                isOff: Boolean(s.is_off)
            })),
            additionalRoles: roles.map(r => r.role_name)
        };

        // WebSocket Refresh
        broadcastUpdate('data_refresh');

        res.status(201).json({
            success: true,
            employee
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create employee error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    } finally {
        client.release();
    }
});

// PUT /api/employees/:id - Update employee (Manager only)
router.put('/:id', authenticateToken, requireManager, async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const { id } = req.params;
        const {
            username,
            password,
            name,
            email,
            phone,
            position,
            hourlyRate,
            maxHoursPerWeek,
            status,
            storeId,
            defaultShifts,
            additionalRoles
        } = req.body;

        // Check if employee exists
        const existingRes = await client.query('SELECT * FROM employees WHERE id = $1', [id]);
        const existing = existingRes.rows[0];

        if (!existing) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        // Managers can only edit employees in their own store
        if (req.user.role === 'manager') {
            const mgrRes = await client.query('SELECT store_id FROM employees WHERE id = $1', [req.user.id]);
            if (existing.store_id !== mgrRes.rows[0]?.store_id) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(403).json({
                    success: false,
                    error: 'You can only edit employees in your own store'
                });
            }
        }

        // Check for duplicate username/email (excluding current employee)
        if (username || email) {
            const dupRes = await client.query(
                'SELECT id FROM employees WHERE (username = $1 OR email = $2) AND id != $3',
                [username || '', email || '', id]
            );

            if (dupRes.rows[0]) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(400).json({
                    success: false,
                    error: 'Username or email already exists'
                });
            }
        }

        // Build update query
        let updates = [];
        let values = [];
        let paramCount = 1;

        if (username) {
            updates.push(`username = $${paramCount++}`);
            values.push(username);
        }
        if (password) {
            const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
            updates.push(`password_hash = $${paramCount++}`);
            values.push(passwordHash);
        }
        if (name) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
            const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            updates.push(`avatar = $${paramCount++}`);
            values.push(avatar);
        }
        if (email) {
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }
        if (phone !== undefined) {
            updates.push(`phone = $${paramCount++}`);
            values.push(phone);
        }
        if (position) {
            updates.push(`position = $${paramCount++}`);
            values.push(position);
        }
        if (hourlyRate !== undefined) {
            updates.push(`hourly_rate = $${paramCount++}`);
            values.push(hourlyRate);
        }
        if (maxHoursPerWeek !== undefined) {
            updates.push(`max_hours_per_week = $${paramCount++}`);
            values.push(maxHoursPerWeek);
        }
        if (status) {
            updates.push(`status = $${paramCount++}`);
            values.push(status);
        }
        // Only admin can change store assignment
        if (storeId && req.user.role === 'admin') {
            updates.push(`store_id = $${paramCount++}`);
            values.push(storeId);
        }

        if (updates.length > 0) {
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(id);
            await client.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
        }

        // Update default shifts
        if (defaultShifts && Array.isArray(defaultShifts)) {
            await client.query('DELETE FROM employee_default_shifts WHERE employee_id = $1', [id]);

            for (const shift of defaultShifts) {
                await client.query(`
                    INSERT INTO employee_default_shifts 
                    (employee_id, day_of_week, start_time, end_time, primary_role, is_off)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    id,
                    shift.dayOfWeek,
                    shift.isOff ? null : shift.startTime,
                    shift.isOff ? null : shift.endTime,
                    shift.primaryRole || null,
                    shift.isOff ? 1 : 0
                ]);
            }
        }

        // Update additional roles
        if (additionalRoles && Array.isArray(additionalRoles)) {
            await client.query('DELETE FROM employee_additional_roles WHERE employee_id = $1', [id]);

            for (const role of additionalRoles) {
                if (role) {
                    await client.query(`
                        INSERT INTO employee_additional_roles (employee_id, role_name)
                        VALUES ($1, $2)
                    `, [id, role]);
                }
            }
        }

        await client.query('COMMIT');

        // Fetch updated employee (outside transaction, read-only)
        const emp = await queryOne('SELECT * FROM employees WHERE id = $1', [id]);
        const shifts = await query('SELECT * FROM employee_default_shifts WHERE employee_id = $1', [id]);
        const roles = await query('SELECT role_name FROM employee_additional_roles WHERE employee_id = $1', [id]);

        const employee = {
            id: emp.id,
            username: emp.username,
            name: emp.name,
            email: emp.email,
            phone: emp.phone,
            role: emp.role,
            position: emp.position,
            storeId: emp.store_id,
            avatar: emp.avatar,
            hourlyRate: emp.hourly_rate,
            maxHoursPerWeek: emp.max_hours_per_week,
            status: emp.status,
            hireDate: emp.hire_date,
            createdAt: emp.created_at,
            defaultShifts: shifts.map(s => ({
                dayOfWeek: s.day_of_week,
                startTime: s.start_time,
                endTime: s.end_time,
                primaryRole: s.primary_role,
                isOff: Boolean(s.is_off)
            })),
            additionalRoles: roles.map(r => r.role_name)
        };

        // WebSocket Refresh
        publishUpdate(id, 'data_refresh');
        broadcastUpdate('data_refresh');

        res.json({
            success: true,
            employee
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update employee error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    } finally {
        client.release();
    }
});

// DELETE /api/employees/:id - Delete employee (Manager only)
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if employee exists and is not a manager
        const existing = await queryOne('SELECT role FROM employees WHERE id = $1', [id]);

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        if (existing.role === 'manager') {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete a manager account'
            });
        }

        // Delete employee (cascade will handle related records)
        await run('DELETE FROM employees WHERE id = $1', [id]);

        // WebSocket Refresh
        broadcastUpdate('data_refresh');

        res.json({
            success: true,
            message: 'Employee deleted successfully'
        });

    } catch (error) {
        console.error('Delete employee error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
