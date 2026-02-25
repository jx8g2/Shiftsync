const express = require('express');
const jwt = require('jsonwebtoken');
const { query, queryOne, run } = require('../db');
const { sendPushNotification } = require('../utils/push');
const { publishUpdate, broadcastUpdate } = require('../utils/redis');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'shiftsync-secret-key';

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

// Apply authentication to all request routes
router.use(authenticateToken);

// Get requests (can filter by storeId or employeeId)
router.get('/', async (req, res) => {
    try {
        const { storeId, employeeId } = req.query;

        let sql = `
            SELECT r.*, e.name as employee_name, e.avatar as employee_avatar, 
                   reviewer.name as reviewer_name,
                   replacement.name as replacement_name,
                   s.day_of_week as shift_day, s.start_time as shift_start, s.end_time as shift_end, s.role as shift_role
            FROM time_off_requests r 
            JOIN employees e ON r.employee_id = e.id
            LEFT JOIN employees reviewer ON r.reviewed_by = reviewer.id
            LEFT JOIN employees replacement ON r.replacement_id = replacement.id
            LEFT JOIN shifts s ON r.shift_id = s.id
        `;
        const params = [];
        let paramCount = 1;

        if (employeeId) {
            sql += ` WHERE r.employee_id = $${paramCount++}`;
            params.push(employeeId);
        } else if (storeId) {
            // Filter by employees in this store
            sql += ` WHERE e.store_id = $${paramCount++}`;
            params.push(storeId);
        }

        sql += ' ORDER BY r.created_at DESC';

        const requests = await query(sql, params);

        // Format for frontend
        const formattedRequests = requests.map(r => ({
            id: r.id,
            employeeId: r.employee_id,
            employeeName: r.employee_name,
            startDate: r.start_date,
            endDate: r.end_date,
            reason: r.reason,
            type: r.type || 'other',
            status: r.status,
            createdAt: r.created_at,
            reviewNote: r.review_note,
            reviewedBy: r.reviewed_by,
            reviewerName: r.reviewer_name,
            reviewedAt: r.reviewed_at,
            replacementId: r.replacement_id,
            replacementName: r.replacement_name,
            shiftId: r.shift_id,
            shiftDay: r.shift_day,
            shiftStart: r.shift_start,
            shiftEnd: r.shift_end,
            shiftRole: r.shift_role
        }));

        res.json({ success: true, requests: formattedRequests });

    } catch (error) {
        console.error('Get requests error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create new request
router.post('/', async (req, res) => {
    try {
        const { employeeId, startDate, endDate, reason, type, shiftId } = req.body;

        if (!employeeId || !startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Use RETURNING id
        const result = await queryOne(
            'INSERT INTO time_off_requests (employee_id, start_date, end_date, reason, type, shift_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [employeeId, startDate, endDate, reason, type || 'other', shiftId || null]
        );
        const requestId = result.id;

        // Notify all managers about the new request
        const employee = await queryOne('SELECT name, store_id FROM employees WHERE id = $1', [employeeId]);
        const managers = await query(
            "SELECT id FROM employees WHERE (role = 'admin' OR (role = 'manager' AND store_id = $1)) AND status = 'active'",
            [employee.store_id]
        );

        for (const manager of managers) {
            await run(`
                INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
                VALUES ($1, 'request', $2, $3, 'request', $4)
            `, [
                manager.id,
                '📝 New Time-Off Request',
                `${employee?.name || 'An employee'} submitted a time-off request for ${startDate} - ${endDate}`,
                requestId
            ]);

            // Background Push
            sendPushNotification(manager.id, {
                title: '📝 New Time-Off Request',
                body: `${employee?.name || 'An employee'} submitted a time-off request for ${startDate} - ${endDate}`,
                url: '/manager/requests'
            });

            // WebSocket Refresh
            publishUpdate(manager.id, 'data_refresh');
            publishUpdate(manager.id, 'notification_refresh');
        }

        // Fetch the full request to return exactly what GET / returns
        const fullRequest = await queryOne(`
            SELECT r.*, e.name as employee_name, e.avatar as employee_avatar,
                   replacement.name as replacement_name,
                   s.day_of_week as shift_day, s.start_time as shift_start, s.end_time as shift_end, s.role as shift_role
            FROM time_off_requests r 
            JOIN employees e ON r.employee_id = e.id
            LEFT JOIN employees replacement ON r.replacement_id = replacement.id
            LEFT JOIN shifts s ON r.shift_id = s.id
            WHERE r.id = $1
        `, [requestId]);

        res.json({
            success: true,
            request: {
                id: fullRequest.id,
                employeeId: fullRequest.employee_id,
                employeeName: fullRequest.employee_name,
                startDate: fullRequest.start_date,
                endDate: fullRequest.end_date,
                reason: fullRequest.reason,
                type: fullRequest.type || 'other',
                status: fullRequest.status,
                createdAt: fullRequest.created_at,
                reviewNote: fullRequest.review_note,
                reviewedBy: fullRequest.reviewed_by,
                reviewedAt: fullRequest.reviewed_at,
                replacementId: fullRequest.replacement_id,
                replacementName: fullRequest.replacement_name,
                shiftId: fullRequest.shift_id,
                shiftDay: fullRequest.shift_day,
                shiftStart: fullRequest.shift_start,
                shiftEnd: fullRequest.shift_end,
                shiftRole: fullRequest.shift_role
            }
        });

    } catch (error) {
        console.error('Create request error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update request status
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reviewNote, reviewedBy, reviewedAt, approvalAction, replacementId } = req.body;

        console.log(`[PUT /requests/${id}] Updating status to: ${status}`, req.body);

        if (!['pending', 'approved', 'denied'].includes(status)) {
            console.error('Invalid status provided:', status);
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const params = [
            status,
            reviewNote || null,
            reviewedBy || null,
            reviewedAt || null,
            (status === 'approved' && approvalAction === 'replace') ? replacementId : null,
            id
        ];
        console.log('Update SQL Params:', params);

        const result = await run(
            `UPDATE time_off_requests 
             SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = $4, replacement_id = $5, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $6`,
            params
        );

        console.log(`Update result for request ${id}: `, result);

        if (result.rowCount === 0) {
            console.warn(`No changes made for request ${id}. ID might not exist.`);
        }

        const request = await queryOne('SELECT employee_id, start_date, end_date, shift_id FROM time_off_requests WHERE id = $1', [id]);

        // Process shift logic if approved
        if (status === 'approved' && request?.shift_id) {
            if (approvalAction === 'empty') {
                await run('UPDATE shifts SET employee_id = NULL WHERE id = $1', [request.shift_id]);
            } else if (approvalAction === 'replace' && replacementId) {
                await run('UPDATE shifts SET employee_id = $1 WHERE id = $2', [replacementId, request.shift_id]);
            }
        }

        // Notify the employee about their request status change
        if (request) {
            const statusEmoji = status === 'approved' ? '✅' : (status === 'denied' ? '❌' : '📝');
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);

            await run(`
                INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
                VALUES ($1, 'approval', $2, $3, 'request', $4)
            `, [
                request.employee_id,
                `${statusEmoji} Request ${statusText}`,
                `Your time-off request for ${request.start_date} - ${request.end_date} has been ${status}.${reviewNote ? ' Note: ' + reviewNote : ''}`,
                id
            ]);

            // Background Push
            sendPushNotification(request.employee_id, {
                title: `${statusEmoji} Request ${statusText}`,
                body: `Your time-off request for ${request.start_date} - ${request.end_date} has been ${status}.`,
                url: '/employee/time-off'
            });

            // WebSocket Refresh
            publishUpdate(request.employee_id, 'data_refresh');
            publishUpdate(request.employee_id, 'notification_refresh');
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Update request error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/requests/:id/notify-replacements - Notify eligible employees about shift opening
router.post('/:id/notify-replacements', async (req, res) => {
    try {
        const { id } = req.params;

        // Get the request details
        const request = await queryOne(`
            SELECT r.*, e.position, e.store_id 
            FROM time_off_requests r 
            JOIN employees e ON r.employee_id = e.id 
            WHERE r.id = $1
        `, [id]);

        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        if (request.status !== 'approved') {
            return res.status(400).json({ success: false, error: 'Request must be approved first' });
        }

        // Find eligible employees (same position, active, not the original employee)
        const eligibleEmployees = await query(`
            SELECT DISTINCT e.id, e.name, e.position
            FROM employees e
            LEFT JOIN employee_additional_roles ar ON e.id = ar.employee_id
            WHERE e.status = 'active' 
            AND e.id != $1
            AND e.store_id = $2
            AND (e.position = $3 OR ar.role_name = $4)
        `, [request.employee_id, request.store_id, request.position, request.position]);

        // Create notifications for eligible employees
        const startDate = request.start_date;
        const endDate = request.end_date;

        for (const emp of eligibleEmployees) {
            await run(`
                INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
                VALUES ($1, 'shift_replacement', 'Shift Available', $2, 'time_off_request', $3)
            `, [
                emp.id,
                `A shift from ${startDate} to ${endDate} is available. Contact your manager if interested.`,
                id
            ]);
            sendPushNotification(emp.id, {
                title: '📅 Shift Available',
                body: `A shift from ${startDate} to ${endDate} is available.`,
                url: '/employee/schedule'
            });

            // WebSocket Refresh
            publishUpdate(emp.id, 'data_refresh');
            publishUpdate(emp.id, 'notification_refresh');
        }

        // Mark replacement notification as sent
        await run('UPDATE time_off_requests SET replacement_needed = 1, replacement_notified = 1 WHERE id = $1', [id]);

        res.json({
            success: true,
            message: `Notified ${eligibleEmployees.length} eligible employees`,
            notifiedCount: eligibleEmployees.length,
            eligibleEmployees: eligibleEmployees.map(e => ({ id: e.id, name: e.name, position: e.position }))
        });

    } catch (error) {
        console.error('Notify replacements error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/requests/:id/assign-replacement - Assign a replacement employee
router.post('/:id/assign-replacement', async (req, res) => {
    try {
        const { id } = req.params;
        const { replacementId } = req.body;

        if (!replacementId) {
            return res.status(400).json({ success: false, error: 'replacementId is required' });
        }

        // Verify request exists and is approved
        const request = await queryOne('SELECT * FROM time_off_requests WHERE id = $1', [id]);

        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        if (request.status !== 'approved') {
            return res.status(400).json({ success: false, error: 'Request must be approved first' });
        }

        // Verify replacement employee exists
        const replacement = await queryOne('SELECT id, name FROM employees WHERE id = $1', [replacementId]);

        if (!replacement) {
            return res.status(404).json({ success: false, error: 'Replacement employee not found' });
        }

        // Update the request with replacement
        await run('UPDATE time_off_requests SET replacement_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [replacementId, id]);

        // Notify the replacement that they've been assigned
        const originalEmployee = await queryOne('SELECT name FROM employees WHERE id = $1', [request.employee_id]);
        await run(`
            INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
            VALUES ($1, 'shift_replacement', 'Shift Assigned', $2, 'time_off_request', $3)
        `, [
            replacementId,
            `You have been assigned to cover a shift from ${request.start_date} to ${request.end_date} for ${originalEmployee?.name || 'a coworker'}.`,
            id
        ]);
        sendPushNotification(replacementId, {
            title: '📅 Shift Assigned',
            body: `You have been assigned to cover a shift for ${originalEmployee?.name || 'a coworker'}.`,
            url: '/employee/schedule'
        });

        // WebSocket Refresh
        publishUpdate(replacementId, 'data_refresh');
        publishUpdate(replacementId, 'notification_refresh');
        publishUpdate(request.employee_id, 'data_refresh'); // Notify original requester too

        res.json({
            success: true,
            message: `Replacement assigned: ${replacement.name}`
        });

    } catch (error) {
        console.error('Assign replacement error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/requests/:id/eligible-replacements - Get eligible replacement employees
router.get('/:id/eligible-replacements', async (req, res) => {
    try {
        const { id } = req.params;

        // Get the request details
        const request = await queryOne(`
            SELECT r.*, e.position, e.store_id 
            FROM time_off_requests r 
            JOIN employees e ON r.employee_id = e.id 
            WHERE r.id = $1
        `, [id]);

        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        // Find eligible employees (same position or additional role, active, not the original employee)
        const eligibleEmployees = await query(`
            SELECT DISTINCT e.id, e.name, e.position, e.avatar
            FROM employees e
            LEFT JOIN employee_additional_roles ar ON e.id = ar.employee_id
            WHERE e.status = 'active' 
            AND e.id != $1
            AND e.store_id = $2
            AND (e.position = $3 OR ar.role_name = $4)
            ORDER BY e.name
        `, [request.employee_id, request.store_id, request.position, request.position]);

        let scheduleId = null;
        if (request.shift_id) {
            const shift = await queryOne('SELECT schedule_id FROM shifts WHERE id = $1', [request.shift_id]);
            scheduleId = shift?.schedule_id;
        }

        let allShifts = [];
        if (scheduleId) {
            allShifts = await query('SELECT employee_id, start_time, end_time FROM shifts WHERE schedule_id = $1', [scheduleId]);
        }

        const calculateHours = (empId) => {
            const empShifts = allShifts.filter(s => s.employee_id === empId);
            let total = 0;
            for (const s of empShifts) {
                const [startH, startM] = s.start_time.split(':').map(Number);
                const [endH, endM] = s.end_time.split(':').map(Number);
                total += ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
            }
            return total;
        };

        res.json({
            success: true,
            eligibleEmployees: eligibleEmployees.map(e => ({
                id: e.id,
                name: e.name,
                position: e.position,
                avatar: e.avatar,
                scheduledHours: calculateHours(e.id)
            }))
        });

    } catch (error) {
        console.error('Get eligible replacements error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/requests/:id - Employee canceling their own pending request
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const employeeId = req.user.id; // From authenticateToken middleware if added, or use req.body

        // Verify request exists, belongs to user, and is pending
        const request = await queryOne('SELECT * FROM time_off_requests WHERE id = $1', [id]);

        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        // Security check: Only owner can delete (Admin could too, but let's stick to owner for now as requested)
        if (request.employee_id !== employeeId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Unauthorized to cancel this request' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, error: 'Only pending requests can be canceled' });
        }

        await run('DELETE FROM time_off_requests WHERE id = $1', [id]);

        // Optional: Notify managers that request was canceled? 
        // For now, just delete.

        res.json({ success: true, message: 'Request canceled successfully' });
    } catch (error) {
        console.error('Cancel request error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
