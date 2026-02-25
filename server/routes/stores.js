const express = require('express');
const jwt = require('jsonwebtoken');
const { query, queryOne, run } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'shiftsync-secret-key';

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
}

// GET /api/stores — list all stores
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stores = await query(`
            SELECT s.*, 
                   e.name as manager_name,
                   (SELECT COUNT(*) FROM employees emp WHERE emp.store_id = s.id AND emp.role = 'employee') as employee_count
            FROM stores s
            LEFT JOIN employees e ON s.manager_id = e.id
            ORDER BY s.name
        `);

        const result = stores.map(s => ({
            id: s.id,
            name: s.name,
            address: s.address,
            city: s.city,
            state: s.state,
            zipCode: s.zip_code,
            phone: s.phone,
            timezone: s.timezone,
            managerId: s.manager_id,
            managerName: s.manager_name,
            employeeCount: parseInt(s.employee_count) || 0,
            createdAt: s.created_at
        }));

        res.json({ success: true, stores: result });
    } catch (error) {
        console.error('Get stores error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/stores/:id — get single store
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const store = await queryOne('SELECT * FROM stores WHERE id = $1', [id]);

        if (!store) {
            return res.status(404).json({ success: false, error: 'Store not found' });
        }

        res.json({
            success: true,
            store: {
                id: store.id,
                name: store.name,
                address: store.address,
                city: store.city,
                state: store.state,
                zipCode: store.zip_code,
                phone: store.phone,
                timezone: store.timezone,
                managerId: store.manager_id,
                createdAt: store.created_at
            }
        });
    } catch (error) {
        console.error('Get store error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/stores — create a new store
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, address, city, state, zipCode, phone, timezone } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Store name is required' });
        }

        // Generate next store ID
        const lastStore = await queryOne(
            "SELECT id FROM stores WHERE id LIKE 'store-%' ORDER BY id DESC LIMIT 1"
        );

        let nextNum = 1;
        if (lastStore) {
            const match = lastStore.id.match(/store-(\d+)/);
            if (match) {
                nextNum = parseInt(match[1]) + 1;
            }
        }
        const storeId = `store-${String(nextNum).padStart(3, '0')}`;

        // Check for duplicate ID (just in case)
        const existing = await queryOne('SELECT id FROM stores WHERE id = $1', [storeId]);
        if (existing) {
            return res.status(400).json({ success: false, error: 'Store ID already exists' });
        }

        await run(`
            INSERT INTO stores (id, name, address, city, state, zip_code, phone, timezone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [storeId, name, address || null, city || null, state || null, zipCode || null, phone || null, timezone || 'America/Chicago']);

        const newStore = await queryOne('SELECT * FROM stores WHERE id = $1', [storeId]);

        res.status(201).json({
            success: true,
            store: {
                id: newStore.id,
                name: newStore.name,
                address: newStore.address,
                city: newStore.city,
                state: newStore.state,
                zipCode: newStore.zip_code,
                phone: newStore.phone,
                timezone: newStore.timezone,
                managerId: newStore.manager_id,
                createdAt: newStore.created_at
            }
        });
    } catch (error) {
        console.error('Create store error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/stores/:id — update a store
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, city, state, zipCode, phone, timezone, managerId } = req.body;

        const existing = await queryOne('SELECT id FROM stores WHERE id = $1', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Store not found' });
        }

        let updates = [];
        let values = [];
        let paramCount = 1;

        if (name) { updates.push(`name = $${paramCount++}`); values.push(name); }
        if (address !== undefined) { updates.push(`address = $${paramCount++}`); values.push(address); }
        if (city !== undefined) { updates.push(`city = $${paramCount++}`); values.push(city); }
        if (state !== undefined) { updates.push(`state = $${paramCount++}`); values.push(state); }
        if (zipCode !== undefined) { updates.push(`zip_code = $${paramCount++}`); values.push(zipCode); }
        if (phone !== undefined) { updates.push(`phone = $${paramCount++}`); values.push(phone); }
        if (timezone !== undefined) { updates.push(`timezone = $${paramCount++}`); values.push(timezone); }
        if (managerId !== undefined) { updates.push(`manager_id = $${paramCount++}`); values.push(managerId || null); }

        if (updates.length > 0) {
            values.push(id);
            await run(`UPDATE stores SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
        }

        // If managerId is being set, also update manager's store_id
        if (managerId) {
            await run('UPDATE employees SET store_id = $1 WHERE id = $2', [id, managerId]);
        }

        const updatedStore = await queryOne('SELECT * FROM stores WHERE id = $1', [id]);

        res.json({
            success: true,
            store: {
                id: updatedStore.id,
                name: updatedStore.name,
                address: updatedStore.address,
                city: updatedStore.city,
                state: updatedStore.state,
                zipCode: updatedStore.zip_code,
                phone: updatedStore.phone,
                timezone: updatedStore.timezone,
                managerId: updatedStore.manager_id,
                createdAt: updatedStore.created_at
            }
        });
    } catch (error) {
        console.error('Update store error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// DELETE /api/stores/:id — delete a store (only if no employees assigned)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await queryOne('SELECT id FROM stores WHERE id = $1', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Store not found' });
        }

        // Check if any employees are assigned to this store
        const empCount = await queryOne('SELECT COUNT(*) as count FROM employees WHERE store_id = $1', [id]);
        if (parseInt(empCount.count) > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete store: ${empCount.count} employee(s) still assigned. Reassign them first.`
            });
        }

        await run('DELETE FROM stores WHERE id = $1', [id]);

        res.json({ success: true, message: 'Store deleted successfully' });
    } catch (error) {
        console.error('Delete store error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
