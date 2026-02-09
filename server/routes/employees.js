const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db, query, queryOne, run } = require('../db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'shiftsync-secret-key';
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

// GET /api/employees/chat-contacts - List all employees for chat (no role restrictions)
// Everyone can see everyone for messaging purposes
router.get('/chat-contacts', authenticateToken, async (req, res) => {
    try {
        const employees = query('SELECT id, name, avatar, role, position, status FROM employees WHERE status = ? ORDER BY name', ['active']);

        const result = employees.map(emp => ({
            id: emp.id,
            name: emp.name,
            avatar: emp.avatar,
            role: emp.role,
            position: emp.position,
            status: emp.status
        }));

        res.json({
            success: true,
            employees: result
        });
    } catch (error) {
        console.error('Get chat contacts error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// GET /api/employees - List all employees
// Admins see all users, Managers only see employees (not other managers)
router.get('/', authenticateToken, async (req, res) => {
    try {
        // If requester is a manager (not admin), filter out other managers
        const isAdmin = req.user.role === 'admin';
        const isManager = req.user.role === 'manager';

        let employeesQuery = 'SELECT * FROM employees';
        let queryParams = [];

        if (isManager && !isAdmin) {
            // Managers can only see employees with role 'employee' or themselves
            employeesQuery += ' WHERE role = ? OR id = ?';
            queryParams = ['employee', req.user.id];
        }

        employeesQuery += ' ORDER BY name';
        const employees = query(employeesQuery, queryParams);

        const result = employees.map(emp => {
            const shifts = query(
                'SELECT * FROM employee_default_shifts WHERE employee_id = ?',
                [emp.id]
            );
            const roles = query(
                'SELECT role_name FROM employee_additional_roles WHERE employee_id = ?',
                [emp.id]
            );

            return {
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
        });

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

        const emp = queryOne('SELECT * FROM employees WHERE id = ?', [id]);

        if (!emp) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        const shifts = query(
            'SELECT * FROM employee_default_shifts WHERE employee_id = ? ORDER BY day_of_week',
            [id]
        );

        const roles = query(
            'SELECT role_name FROM employee_additional_roles WHERE employee_id = ?',
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
    try {
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
            return res.status(400).json({
                success: false,
                error: 'Username, password, name, and email are required'
            });
        }

        // Determine role: admins can create managers, managers can only create employees
        let newRole = 'employee';
        if (requestedRole === 'manager') {
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Only admins can create manager accounts'
                });
            }
            newRole = 'manager';
        }

        // Check if username or email already exists
        const existing = queryOne(
            'SELECT id FROM employees WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Username or email already exists'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Generate avatar from name
        const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        // Insert employee
        const result = run(`
            INSERT INTO employees (
                username, password_hash, name, email, phone, 
                role, position, store_id, avatar, hourly_rate, max_hours_per_week
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            username,
            passwordHash,
            name,
            email,
            phone || null,
            newRole,
            position || (newRole === 'manager' ? 'Store Manager' : 'Crew Member'),
            'store-001',
            avatar,
            hourlyRate || 15.00,
            maxHoursPerWeek || 40
        ]);

        const employeeId = result.lastInsertRowid;

        // Insert default shifts
        if (defaultShifts && Array.isArray(defaultShifts)) {
            const insertShift = db.prepare(`
                INSERT INTO employee_default_shifts 
                (employee_id, day_of_week, start_time, end_time, primary_role, is_off)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const shift of defaultShifts) {
                insertShift.run(
                    employeeId,
                    shift.dayOfWeek,
                    shift.isOff ? null : shift.startTime,
                    shift.isOff ? null : shift.endTime,
                    shift.primaryRole || null,
                    shift.isOff ? 1 : 0
                );
            }
        }

        // Insert additional roles
        if (additionalRoles && Array.isArray(additionalRoles)) {
            const insertRole = db.prepare(`
                INSERT INTO employee_additional_roles (employee_id, role_name)
                VALUES (?, ?)
            `);

            for (const role of additionalRoles) {
                if (role) {
                    insertRole.run(employeeId, role);
                }
            }
        }

        // Fetch complete employee data
        const newEmployee = queryOne('SELECT * FROM employees WHERE id = ?', [employeeId]);
        const shifts = query('SELECT * FROM employee_default_shifts WHERE employee_id = ?', [employeeId]);
        const roles = query('SELECT role_name FROM employee_additional_roles WHERE employee_id = ?', [employeeId]);

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

        res.status(201).json({
            success: true,
            employee
        });

    } catch (error) {
        console.error('Create employee error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// PUT /api/employees/:id - Update employee (Manager only)
router.put('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
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
            defaultShifts,
            additionalRoles
        } = req.body;

        // Check if employee exists
        const existing = queryOne('SELECT * FROM employees WHERE id = ?', [id]);

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        // Check for duplicate username/email (excluding current employee)
        if (username || email) {
            const duplicate = queryOne(
                'SELECT id FROM employees WHERE (username = ? OR email = ?) AND id != ?',
                [username || '', email || '', id]
            );

            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: 'Username or email already exists'
                });
            }
        }

        // Build update query
        let updates = [];
        let values = [];

        if (username) {
            updates.push('username = ?');
            values.push(username);
        }
        if (password) {
            const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
            updates.push('password_hash = ?');
            values.push(passwordHash);
        }
        if (name) {
            updates.push('name = ?');
            values.push(name);
            const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            updates.push('avatar = ?');
            values.push(avatar);
        }
        if (email) {
            updates.push('email = ?');
            values.push(email);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            values.push(phone);
        }
        if (position) {
            updates.push('position = ?');
            values.push(position);
        }
        if (hourlyRate !== undefined) {
            updates.push('hourly_rate = ?');
            values.push(hourlyRate);
        }
        if (maxHoursPerWeek !== undefined) {
            updates.push('max_hours_per_week = ?');
            values.push(maxHoursPerWeek);
        }
        if (status) {
            updates.push('status = ?');
            values.push(status);
        }

        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(id);
            run(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        // Update default shifts
        if (defaultShifts && Array.isArray(defaultShifts)) {
            run('DELETE FROM employee_default_shifts WHERE employee_id = ?', [id]);

            const insertShift = db.prepare(`
                INSERT INTO employee_default_shifts 
                (employee_id, day_of_week, start_time, end_time, primary_role, is_off)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const shift of defaultShifts) {
                insertShift.run(
                    id,
                    shift.dayOfWeek,
                    shift.isOff ? null : shift.startTime,
                    shift.isOff ? null : shift.endTime,
                    shift.primaryRole || null,
                    shift.isOff ? 1 : 0
                );
            }
        }

        // Update additional roles
        if (additionalRoles && Array.isArray(additionalRoles)) {
            run('DELETE FROM employee_additional_roles WHERE employee_id = ?', [id]);

            const insertRole = db.prepare(`
                INSERT INTO employee_additional_roles (employee_id, role_name)
                VALUES (?, ?)
            `);

            for (const role of additionalRoles) {
                if (role) {
                    insertRole.run(id, role);
                }
            }
        }

        // Fetch updated employee
        const emp = queryOne('SELECT * FROM employees WHERE id = ?', [id]);
        const shifts = query('SELECT * FROM employee_default_shifts WHERE employee_id = ?', [id]);
        const roles = query('SELECT role_name FROM employee_additional_roles WHERE employee_id = ?', [id]);

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
        console.error('Update employee error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// DELETE /api/employees/:id - Delete employee (Manager only)
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if employee exists and is not a manager
        const existing = queryOne('SELECT role FROM employees WHERE id = ?', [id]);

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
        run('DELETE FROM employees WHERE id = ?', [id]);

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
