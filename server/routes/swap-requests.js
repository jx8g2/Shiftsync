const express = require('express');
const jwt = require('jsonwebtoken');
const { pool, query, queryOne, run } = require('../db');
const { sendPushNotification } = require('../utils/push');
const { publishUpdate, broadcastUpdate } = require('../utils/redis');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET environment variable is not defined.');
    process.exit(1);
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

router.use(authenticateToken);

// Helper: format a swap request row
function formatSwap(r) {
    return {
        id: r.id,
        requesterId: r.requester_id,
        requesterName: r.requester_name,
        requesterAvatar: r.requester_avatar,
        requesterShiftId: r.requester_shift_id,
        shiftDay: r.shift_day,
        shiftStart: r.shift_start,
        shiftEnd: r.shift_end,
        shiftRole: r.shift_role,
        shiftWeekStart: r.week_start,
        proposedPartnerId: r.proposed_partner_id,
        proposedPartnerName: r.proposed_partner_name,
        status: r.status,
        partnerStatus: r.partner_status,
        reason: r.reason,
        reviewNote: r.review_note,
        reviewedBy: r.reviewed_by,
        reviewerName: r.reviewer_name,
        reviewerRole: r.reviewer_role,
        reviewedAt: r.reviewed_at,
        createdAt: r.created_at
    };
}

const SWAP_SELECT = `
    SELECT sr.*,
           req.name AS requester_name, req.avatar AS requester_avatar,
           partner.name AS proposed_partner_name,
           reviewer.name AS reviewer_name, reviewer.role AS reviewer_role,
           sh.day_of_week AS shift_day, sh.start_time AS shift_start, sh.end_time AS shift_end, sh.role AS shift_role,
           sc.week_start
    FROM shift_swap_requests sr
    JOIN employees req ON sr.requester_id = req.id
    LEFT JOIN employees partner ON sr.proposed_partner_id = partner.id
    LEFT JOIN employees reviewer ON sr.reviewed_by = reviewer.id
    JOIN shifts sh ON sr.requester_shift_id = sh.id
    JOIN schedules sc ON sh.schedule_id = sc.id
`;

// Helper: get all managers + shift leads for a store to notify
async function getStoreApprovers(storeId) {
    return query(
        `SELECT e.id FROM employees e
         WHERE e.store_id = $1 AND e.status = 'active'
           AND (e.role IN ('admin', 'manager') OR e.position = 'shift lead')`,
        [storeId]
    );
}

// Helper: insert notification + push for one user
async function notifyUser(userId, type, title, message, entityType, entityId, pushUrl) {
    await run(`
        INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, [userId, type, title, message, entityType, entityId]);
    if (pushUrl) {
        sendPushNotification(userId, { title, body: message, url: pushUrl });
    }
    publishUpdate(userId, 'notification_refresh');
}

// GET /api/swap-requests?storeId=&employeeId=
router.get('/', async (req, res) => {
    try {
        const { storeId, employeeId } = req.query;
        let sql = SWAP_SELECT;
        const params = [];
        let paramCount = 1;
        let conditions = [];

        if (req.user.role === 'admin') {
            if (employeeId) {
                conditions.push(`(sr.requester_id = $${paramCount} OR sr.proposed_partner_id = $${paramCount})`);
                params.push(employeeId);
                paramCount++;
            } else if (storeId) {
                conditions.push(`req.store_id = $${paramCount++}`);
                params.push(storeId);
            }
        } else if (req.user.role === 'manager') {
            const me = await queryOne('SELECT store_id FROM employees WHERE id = $1', [req.user.id]);
            conditions.push(`req.store_id = $${paramCount++}`);
            params.push(me.store_id);
            if (employeeId) {
                conditions.push(`(sr.requester_id = $${paramCount} OR sr.proposed_partner_id = $${paramCount})`);
                params.push(employeeId);
                paramCount++;
            }
        } else {
            // Check if the employee is a shift lead
            const me = await queryOne('SELECT store_id, position FROM employees WHERE id = $1', [req.user.id]);
            const isShiftLead = me && me.position && me.position.toLowerCase() === 'shift lead';

            if (isShiftLead && storeId) {
                // Shift leads see all requests for their store (to make decisions)
                conditions.push(`req.store_id = $${paramCount++}`);
                params.push(me.store_id);
                if (employeeId) {
                    conditions.push(`(sr.requester_id = $${paramCount} OR sr.proposed_partner_id = $${paramCount})`);
                    params.push(employeeId);
                    paramCount++;
                }
            } else {
                // Regular employees only see their own requests (as requester or proposed partner)
                conditions.push(`(sr.requester_id = $${paramCount} OR sr.proposed_partner_id = $${paramCount})`);
                params.push(req.user.id);
                paramCount++;
            }
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY sr.created_at DESC';
        const rows = await query(sql, params);
        res.json({ success: true, swapRequests: rows.map(formatSwap) });
    } catch (error) {
        console.error('Get swap requests error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/swap-requests — create a swap request
router.post('/', async (req, res) => {
    try {
        const { requesterId, requesterShiftId, proposedPartnerId, reason } = req.body;

        if (!requesterId || !requesterShiftId) {
            return res.status(400).json({ success: false, error: 'requesterId and requesterShiftId are required' });
        }

        // Verify the shift belongs to the requesterId
        const shift = await queryOne(`
            SELECT sh.*, sc.published, sc.week_start, e.position, e.store_id
            FROM shifts sh
            JOIN schedules sc ON sh.schedule_id = sc.id
            JOIN employees e ON sh.employee_id = e.id
            WHERE sh.id = $1 AND sh.employee_id = $2
        `, [requesterShiftId, requesterId]);

        if (!shift) {
            return res.status(404).json({ success: false, error: 'Shift not found or does not belong to this employee' });
        }

        if (!shift.published) {
            return res.status(400).json({ success: false, error: 'Shift swaps can only be requested for published schedule shifts' });
        }

        // If a partner was nominated, verify same position and same store
        if (proposedPartnerId) {
            const partner = await queryOne('SELECT id, position, store_id FROM employees WHERE id = $1', [proposedPartnerId]);
            if (!partner) {
                return res.status(404).json({ success: false, error: 'Proposed partner employee not found' });
            }

            // Verify same position category (compare via positions table)
            const requesterPos = await queryOne('SELECT category FROM positions WHERE name = $1', [shift.position]);
            const partnerCategory = await queryOne('SELECT category FROM positions WHERE name = $1', [partner.position]);

            if (requesterPos && partnerCategory) {
                if (requesterPos.category !== 'ALL') {
                    if (partnerCategory.category !== requesterPos.category) {
                        return res.status(400).json({ success: false, error: 'Cover partner must be in the same department (FOH/BOH)' });
                    }
                }
            }

            // Cannot propose to swap with managers or admins
            const partnerRole = await queryOne('SELECT role FROM employees WHERE id = $1', [proposedPartnerId]);
            if (partnerRole && (partnerRole.role === 'manager' || partnerRole.role === 'admin')) {
                return res.status(400).json({ success: false, error: 'Cannot swap shifts with managers or admins' });
            }

            if (partner.store_id !== shift.store_id) {
                return res.status(400).json({ success: false, error: 'Swap partner must be at the same store' });
            }
        }

        const result = await queryOne(
            `INSERT INTO shift_swap_requests (requester_id, requester_shift_id, proposed_partner_id, reason, partner_status)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [requesterId, requesterShiftId, proposedPartnerId || null, reason || null, proposedPartnerId ? 'pending' : 'accepted']
        );
        const swapId = result.id;

        const employee = await queryOne('SELECT name, store_id FROM employees WHERE id = $1', [requesterId]);

        // Always notify all approvers (managers + shift leads) for their store
        const approvers = await getStoreApprovers(employee.store_id);
        const partnerSuffix = proposedPartnerId ? '' : ' and is looking for a partner.';
        for (const approver of approvers) {
            if (approver.id === requesterId) continue; // don't notify yourself
            await notifyUser(
                approver.id,
                'swap_request',
                '🔄 New Shift Cover Request',
                `${employee.name} requested a shift cover for ${shift.day_of_week} (${shift.start_time}–${shift.end_time})${partnerSuffix}`,
                'swap_request',
                swapId,
                '/manager/requests'
            );
            publishUpdate(approver.id, 'data_refresh');
        }

        // Notify the proposed partner if one was specified
        if (proposedPartnerId) {
            await notifyUser(
                proposedPartnerId,
                'swap_request',
                '🔄 Shift Cover Proposed',
                `${employee.name} wants to give you their ${shift.day_of_week} shift (${shift.start_time}–${shift.end_time}). Please accept or decline.`,
                'swap_request',
                swapId,
                '/employee/time-off'
            );
            publishUpdate(proposedPartnerId, 'data_refresh');
        }

        // Fetch full swap to return
        const fullSwap = await queryOne(SWAP_SELECT + ' WHERE sr.id = $1', [swapId]);
        res.json({ success: true, swapRequest: formatSwap(fullSwap) });

    } catch (error) {
        console.error('Create swap request error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/swap-requests/:id — Requester cancels request
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await queryOne('DELETE FROM shift_swap_requests WHERE id = $1 AND requester_id = $2 RETURNING id', [id, req.user.id]);

        if (!result) {
            return res.status(404).json({ success: false, error: 'Request not found or you are not authorized to cancel it' });
        }

        broadcastUpdate('data_refresh');
        res.json({ success: true });
    } catch (error) {
        console.error('Cancel swap request error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/swap-requests/:id/partner-response — Proposal partner accepts or declines
router.put('/:id/partner-response', async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body;

        if (!['accepted', 'declined'].includes(action)) {
            return res.status(400).json({ success: false, error: 'Invalid action. Must be accepted or declined.' });
        }

        const swap = await queryOne(`
            SELECT sr.*, sh.day_of_week, sh.start_time, sh.end_time, e.name AS requester_name, e.store_id
            FROM shift_swap_requests sr
            JOIN shifts sh ON sr.requester_shift_id = sh.id
            JOIN employees e ON sr.requester_id = e.id
            WHERE sr.id = $1 AND sr.proposed_partner_id = $2 AND sr.status = 'pending'
        `, [id, req.user.id]);

        if (!swap) {
            return res.status(404).json({ success: false, error: 'Pending cover request not found for your account' });
        }

        await run('UPDATE shift_swap_requests SET partner_status = $1 WHERE id = $2', [action, id]);

        const partner = await queryOne('SELECT name FROM employees WHERE id = $1', [req.user.id]);

        if (action === 'accepted') {
            // Notify managers + shift leads that it's ready for approval
            const approvers = await getStoreApprovers(swap.store_id);
            for (const approver of approvers) {
                await notifyUser(
                    approver.id,
                    'swap_request',
                    '🔄 Shift Cover Ready for Review',
                    `${partner.name} accepted ${swap.requester_name}'s shift cover for ${swap.day_of_week}. Awaiting your approval.`,
                    'swap_request',
                    id,
                    '/manager/requests'
                );
                publishUpdate(approver.id, 'data_refresh');
            }

            // Also notify the requester that their partner accepted
            await notifyUser(
                swap.requester_id,
                'swap_request',
                '✅ Cover Partner Accepted',
                `${partner.name} accepted your shift cover request for ${swap.day_of_week}. Awaiting manager approval.`,
                'swap_request',
                id,
                '/employee/time-off'
            );
            publishUpdate(swap.requester_id, 'notification_refresh');

        } else {
            // Notify requester it was declined
            await notifyUser(
                swap.requester_id,
                'swap_request',
                '❌ Shift Cover Declined',
                `${partner.name} declined your shift cover request for ${swap.day_of_week}.`,
                'swap_request',
                id,
                '/employee/time-off'
            );
            publishUpdate(swap.requester_id, 'notification_refresh');
        }

        broadcastUpdate('data_refresh');
        res.json({ success: true });
    } catch (error) {
        console.error('Partner response error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/swap-requests/shift/:shiftId/eligible-partners — used by employees BEFORE creating a swap
router.get('/shift/:shiftId/eligible-partners', async (req, res) => {
    try {
        const { shiftId } = req.params;

        // 1. Get the details of the shift they want to give away
        const shift = await queryOne(`
            SELECT sh.id, sh.schedule_id, sh.employee_id as requester_id,
                   sh.day_of_week, sh.start_time, sh.end_time,
                   e.position, e.store_id
            FROM shifts sh
            JOIN employees e ON sh.employee_id = e.id
            WHERE sh.id = $1
        `, [shiftId]);

        if (!shift) return res.status(404).json({ success: false, error: 'Shift not found' });

        // 2. Find eligible partners: same store, same/compatible position, active, not requester
        const partners = await query(`
            SELECT e.id, e.name, e.position, e.avatar,
                   COALESCE(SUM(
                       EXTRACT(EPOCH FROM (s_all.end_time::time - s_all.start_time::time))/3600
                   ), 0) AS current_weekly_hours
            FROM employees e
            JOIN positions pos ON e.position = pos.name
            LEFT JOIN shifts s_all ON s_all.employee_id = e.id AND s_all.schedule_id = $1
            WHERE e.id != $2
              AND e.store_id = $3
              AND e.status = 'active'
              AND e.role NOT IN ('manager', 'admin')
              AND (
                  (SELECT category FROM positions WHERE name = $4) = 'ALL'
                  OR pos.category = (SELECT category FROM positions WHERE name = $4)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM shifts s_overlap
                  WHERE s_overlap.employee_id = e.id 
                    AND s_overlap.schedule_id = $1 
                    AND s_overlap.day_of_week = $5 
                    AND s_overlap.start_time < $6 
                    AND s_overlap.end_time > $7
              )
            GROUP BY e.id, e.name, e.position, e.avatar
            ORDER BY e.name
        `, [shift.schedule_id, shift.requester_id, shift.store_id, shift.position, shift.day_of_week, shift.end_time, shift.start_time]);

        res.json({
            success: true,
            eligiblePartners: partners.map(p => ({
                id: p.id,
                name: p.name,
                position: p.position,
                avatar: p.avatar,
                current_weekly_hours: parseFloat(p.current_weekly_hours) || 0
            }))
        });
    } catch (error) {
        console.error('Get eligible partners for shift error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/swap-requests/:id/eligible-partners — used by managers/shift leads WHEN REVIEWING a pending swap
router.get('/:id/eligible-partners', async (req, res) => {
    try {
        const { id } = req.params;

        const swap = await queryOne(`
            SELECT sr.requester_id, sr.requester_shift_id,
                   sh.day_of_week, sh.start_time, sh.end_time, sh.schedule_id,
                   e.position, e.store_id
            FROM shift_swap_requests sr
            JOIN shifts sh ON sr.requester_shift_id = sh.id
            JOIN employees e ON sr.requester_id = e.id
            WHERE sr.id = $1
        `, [id]);

        if (!swap) return res.status(404).json({ success: false, error: 'Swap request not found' });

        const partners = await query(`
            SELECT e.id, e.name, e.position, e.avatar,
                   COALESCE(SUM(
                       EXTRACT(EPOCH FROM (s_all.end_time::time - s_all.start_time::time))/3600
                   ), 0) AS current_weekly_hours
            FROM employees e
            JOIN positions pos ON e.position = pos.name
            LEFT JOIN shifts s_all ON s_all.employee_id = e.id AND s_all.schedule_id = $1
            WHERE e.id != $2
              AND e.store_id = $3
              AND e.status = 'active'
              AND e.role NOT IN ('manager', 'admin')
              AND (
                  (SELECT category FROM positions WHERE name = $4) = 'ALL'
                  OR pos.category = (SELECT category FROM positions WHERE name = $4)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM shifts s_overlap
                  WHERE s_overlap.employee_id = e.id 
                    AND s_overlap.schedule_id = $1 
                    AND s_overlap.day_of_week = $5 
                    AND s_overlap.start_time < $6 
                    AND s_overlap.end_time > $7
              )
            GROUP BY e.id, e.name, e.position, e.avatar
            ORDER BY e.name
        `, [swap.schedule_id, swap.requester_id, swap.store_id, swap.position, swap.day_of_week, swap.end_time, swap.start_time]);

        res.json({
            success: true,
            eligiblePartners: partners.map(p => ({
                id: p.id,
                name: p.name,
                position: p.position,
                avatar: p.avatar,
                current_weekly_hours: parseFloat(p.current_weekly_hours) || 0
            }))
        });
    } catch (error) {
        console.error('Get eligible partners error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/swap-requests/:id — manager or shift lead approves/denies, optionally changes partner
router.put('/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status, reviewNote, partnerId } = req.body;

        if (!['pending', 'approved', 'denied'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const swap = await queryOne(`
            SELECT sr.*, sh.day_of_week, sh.start_time, sh.end_time, sh.role, sh.schedule_id, sh.employee_id AS current_shift_emp,
                   prev_reviewer.role AS prev_reviewer_role
            FROM shift_swap_requests sr
            JOIN shifts sh ON sr.requester_shift_id = sh.id
            LEFT JOIN employees prev_reviewer ON sr.reviewed_by = prev_reviewer.id
            WHERE sr.id = $1
        `, [id]);

        if (!swap) return res.status(404).json({ success: false, error: 'Swap request not found' });

        // Override protection: shift leads cannot override a manager's decision
        if (req.user.role === 'employee' && swap.reviewed_by && swap.prev_reviewer_role === 'manager') {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to override a decision made by a manager.'
            });
        }

        const finalPartnerId = partnerId || swap.proposed_partner_id;
        const oldStatus = swap.status;

        // Get reviewer info for notifications
        const reviewer = await queryOne('SELECT name, role FROM employees WHERE id = $1', [req.user.id]);
        const reviewerLabel = reviewer.role === 'manager' ? 'Manager' : 'Shift Lead';

        await client.query('BEGIN');

        // Update swap request record
        await client.query(
            `UPDATE shift_swap_requests
             SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = $4, proposed_partner_id = $5, updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [status, reviewNote || null, req.user.id, new Date().toISOString(), finalPartnerId, id]
        );

        // Logic for shift ownership changes
        if (status === 'approved' && finalPartnerId) {
            await client.query('UPDATE shifts SET employee_id = $1 WHERE id = $2', [finalPartnerId, swap.requester_shift_id]);
        } else if (status === 'denied' && oldStatus === 'approved') {
            await client.query('UPDATE shifts SET employee_id = $1 WHERE id = $2', [swap.requester_id, swap.requester_shift_id]);
        }

        await client.query('COMMIT');

        // ── Notifications ───────────────────────────────────────────────
        const statusEmoji = status === 'approved' ? '✅' : '❌';
        const statusText = status === 'approved' ? 'Approved' : 'Denied';
        const noteText = reviewNote ? ` Note: ${reviewNote}` : '';
        const isChanged = oldStatus && oldStatus !== 'pending';
        const decidedByText = `Decided by ${reviewerLabel} ${reviewer.name}.`;
        const changedByText = `Decision changed by ${reviewerLabel} ${reviewer.name}.`;

        // Notify requester
        const requesterTitle = isChanged
            ? `${statusEmoji} Shift Cover Decision Changed to ${statusText}`
            : `${statusEmoji} Shift Cover ${statusText}`;
        const requesterMessage = isChanged
            ? `Your shift cover request for ${swap.day_of_week} was changed to ${status} by ${reviewerLabel} ${reviewer.name}.${noteText}`
            : `Your shift cover request for ${swap.day_of_week} has been ${status}. ${decidedByText}${noteText}`;

        await notifyUser(
            swap.requester_id,
            'approval',
            requesterTitle,
            requesterMessage,
            'swap_request',
            id,
            '/employee/time-off'
        );
        publishUpdate(swap.requester_id, 'data_refresh');

        // Notify partner if approved
        if (status === 'approved' && finalPartnerId) {
            const requesterName = await queryOne('SELECT name FROM employees WHERE id = $1', [swap.requester_id]);
            const partnerTitle = isChanged ? '🔄 Shift Cover Decision Changed to Approved' : '🔄 Shift Cover Approved';
            const partnerMsg = isChanged
                ? `The shift cover for ${requesterName?.name || 'a coworker'}'s shift on ${swap.day_of_week} was changed to approved. ${changedByText}`
                : `You have been approved to cover ${requesterName?.name || 'a coworker'}'s shift on ${swap.day_of_week}. ${decidedByText}`;
            await notifyUser(
                finalPartnerId,
                'approval',
                partnerTitle,
                partnerMsg,
                'swap_request',
                id,
                '/employee/schedule'
            );
            publishUpdate(finalPartnerId, 'data_refresh');
        }

        // Notify partner if denied (and they were assigned)
        if (status === 'denied' && finalPartnerId && finalPartnerId !== swap.requester_id) {
            const requesterName = await queryOne('SELECT name FROM employees WHERE id = $1', [swap.requester_id]);
            const partnerTitle = isChanged ? '❌ Shift Cover Decision Changed to Denied' : '❌ Shift Cover Denied';
            const partnerMsg = isChanged
                ? `The shift cover for ${requesterName?.name || 'a coworker'}'s shift on ${swap.day_of_week} was changed to denied. ${changedByText}`
                : `The shift cover for ${requesterName?.name || 'a coworker'}'s shift on ${swap.day_of_week} was denied. ${decidedByText}`;
            await notifyUser(
                finalPartnerId,
                'approval',
                partnerTitle,
                partnerMsg,
                'swap_request',
                id,
                '/employee/time-off'
            );
            publishUpdate(finalPartnerId, 'notification_refresh');
        }

        broadcastUpdate('data_refresh');

        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update swap request error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;
