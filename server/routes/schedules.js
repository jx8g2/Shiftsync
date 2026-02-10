const express = require('express');
const { pool, query, queryOne, run } = require('../db');
const router = express.Router();

// Get schedule for a specific week and store
router.get('/', async (req, res) => {
    try {
        const { storeId, weekStart } = req.query;

        if (!storeId) {
            return res.status(400).json({ success: false, error: 'Store ID is required' });
        }

        let sql = 'SELECT * FROM schedules WHERE store_id = $1';
        const params = [storeId];
        let paramCount = 2;

        if (weekStart) {
            sql += ` AND week_start = $${paramCount++}`;
            params.push(weekStart);
        }

        // Get schedule meta
        const schedules = await query(sql, params);

        if (schedules.length === 0) {
            return res.json({ success: true, schedule: weekStart ? null : [] });
        }

        // For each schedule, get shifts
        const scheduleIds = schedules.map(s => s.id);

        // Postgres ANY($1) syntax for array
        const allShifts = await query(
            'SELECT * FROM shifts WHERE schedule_id = ANY($1)',
            [scheduleIds]
        );

        // Map shifts to schedules
        const result = schedules.map(schedule => {
            const scheduleShifts = allShifts.filter(shift => shift.schedule_id === schedule.id);

            const formattedShifts = scheduleShifts.map(shift => ({
                id: shift.id,
                employeeId: shift.employee_id,
                day: shift.day_of_week,
                start: shift.start_time,
                end: shift.end_time,
                role: shift.role
            }));

            return {
                id: schedule.id,
                storeId: schedule.store_id,
                weekStart: schedule.week_start,
                published: Boolean(schedule.published),
                publishedAt: schedule.published_at,
                shifts: formattedShifts
            };
        });

        if (weekStart) {
            res.json({ success: true, schedule: result[0] || null });
        } else {
            res.json({ success: true, schedules: result });
        }

    } catch (error) {
        console.error('Get schedule error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save or Update Schedule
router.post('/', async (req, res) => {
    console.log('Received schedule save payload:', JSON.stringify(req.body, null, 2));

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const { storeId, weekStart, shifts, published } = req.body;

        // 1. Check if schedule exists
        const scheduleRes = await client.query(
            'SELECT id FROM schedules WHERE store_id = $1 AND week_start = $2',
            [storeId, weekStart]
        );
        let schedule = scheduleRes.rows[0];
        let scheduleId;

        if (schedule) {
            scheduleId = schedule.id;
            // Update published status if provided
            await client.query(
                "UPDATE schedules SET published = $1, published_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
                [published ? 1 : 0, published ? new Date().toISOString() : null, scheduleId]
            );

            // Delete existing shifts
            await client.query('DELETE FROM shifts WHERE schedule_id = $1', [scheduleId]);
        } else {
            // Create new schedule
            const insertRes = await client.query(
                'INSERT INTO schedules (store_id, week_start, published, published_at) VALUES ($1, $2, $3, $4) RETURNING id',
                [storeId, weekStart, published ? 1 : 0, published ? new Date().toISOString() : null]
            );
            scheduleId = insertRes.rows[0].id;
        }

        // 2. Insert new shifts
        if (shifts && shifts.length > 0) {
            for (const shift of shifts) {
                await client.query(
                    'INSERT INTO shifts (schedule_id, employee_id, day_of_week, start_time, end_time, role) VALUES ($1, $2, $3, $4, $5, $6)',
                    [scheduleId, shift.employeeId, shift.day, shift.start, shift.end, shift.role]
                );
            }
        }

        await client.query('COMMIT');

        // If publishing, notify all employees with shifts (OUTSIDE transaction or inside? Outside is safer for logic separation but inside guarantees consistency. Let's do it after commit to ensure DB is saved before notifying.)
        if (published) {
            const employeesWithShifts = await query(
                'SELECT DISTINCT employee_id FROM shifts WHERE schedule_id = $1',
                [scheduleId]
            );

            for (const emp of employeesWithShifts) {
                await run(`
                    INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
                    VALUES ($1, 'schedule', $2, $3, 'schedule', $4)
                `, [
                    emp.employee_id,
                    '📅 New Schedule Published',
                    `Your schedule for the week of ${weekStart} has been published. Check your shifts!`,
                    scheduleId
                ]);
            }
            console.log(`Notified ${employeesWithShifts.length} employees about published schedule`);
        }

        res.json({ success: true, scheduleId });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Save schedule error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Publish schedule
router.post('/:id/publish', async (req, res) => {
    try {
        const { id } = req.params;
        const { published } = req.body;

        await run(
            "UPDATE schedules SET published = $1, published_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
            [published ? 1 : 0, published ? new Date().toISOString() : null, id]
        );

        // When publishing, notify all employees who have shifts in this schedule
        if (published) {
            const schedule = await queryOne('SELECT week_start FROM schedules WHERE id = $1', [id]);

            // Get all employees with shifts in this schedule
            const employeesWithShifts = await query(
                'SELECT DISTINCT employee_id FROM shifts WHERE schedule_id = $1',
                [id]
            );

            // Create notification for each employee
            for (const emp of employeesWithShifts) {
                await run(`
                    INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
                    VALUES ($1, 'schedule', $2, $3, 'schedule', $4)
                `, [
                    emp.employee_id,
                    '📅 New Schedule Published',
                    `Your schedule for the week of ${schedule.week_start} has been published. Check your shifts!`,
                    id
                ]);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Publish schedule error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get published schedule date ranges (for time-off validation)
router.get('/published-weeks', async (req, res) => {
    try {
        const { storeId } = req.query;

        if (!storeId) {
            return res.status(400).json({ success: false, error: 'Store ID is required' });
        }

        const publishedSchedules = await query(
            'SELECT week_start FROM schedules WHERE store_id = $1 AND published = 1 ORDER BY week_start',
            [storeId]
        );

        // Return array of week start dates
        const weekStarts = publishedSchedules.map(s => s.week_start);

        res.json({ success: true, weekStarts });
    } catch (error) {
        console.error('Get published weeks error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
