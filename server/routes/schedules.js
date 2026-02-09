const express = require('express');
const { db, query, queryOne, run } = require('../db');
const router = express.Router();

// Get schedule for a specific week and store
router.get('/', (req, res) => {
    try {
        const { storeId, weekStart } = req.query;

        if (!storeId) {
            return res.status(400).json({ success: false, error: 'Store ID is required' });
        }

        let sql = 'SELECT * FROM schedules WHERE store_id = ?';
        const params = [storeId];

        if (weekStart) {
            sql += ' AND week_start = ?';
            params.push(weekStart);
        }

        // Get schedule meta
        const schedules = query(sql, params);

        if (schedules.length === 0) {
            return res.json({ success: true, schedule: weekStart ? null : [] });
        }

        // For each schedule, get shifts
        const scheduleIds = schedules.map(s => s.id);
        const placeholders = scheduleIds.map(() => '?').join(',');

        const allShifts = query(
            `SELECT * FROM shifts WHERE schedule_id IN (${placeholders})`,
            scheduleIds
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
                storeId: schedule.store_id, // Added storeId
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
router.post('/', (req, res) => {
    console.log('Received schedule save payload:', JSON.stringify(req.body, null, 2));
    // Transaction to ensure atomicity
    const saveTransaction = db.transaction((data) => {
        const { storeId, weekStart, shifts, published } = data;

        // 1. Check if schedule exists
        let schedule = db.prepare('SELECT id FROM schedules WHERE store_id = ? AND week_start = ?').get(storeId, weekStart);
        let scheduleId;

        if (schedule) {
            scheduleId = schedule.id;
            // Update published status if provided
            db.prepare("UPDATE schedules SET published = ?, published_at = ?, updated_at = datetime('now') WHERE id = ?")
                .run(published ? 1 : 0, published ? new Date().toISOString() : null, scheduleId);

            // Delete existing shifts (simple overwrite strategy)
            db.prepare('DELETE FROM shifts WHERE schedule_id = ?').run(scheduleId);
        } else {
            // Create new schedule
            const info = db.prepare('INSERT INTO schedules (store_id, week_start, published, published_at) VALUES (?, ?, ?, ?)')
                .run(storeId, weekStart, published ? 1 : 0, published ? new Date().toISOString() : null);
            scheduleId = info.lastInsertRowid;
        }

        // 2. Insert new shifts
        const insertShift = db.prepare('INSERT INTO shifts (schedule_id, employee_id, day_of_week, start_time, end_time, role) VALUES (?, ?, ?, ?, ?, ?)');

        for (const shift of shifts) {
            insertShift.run(scheduleId, shift.employeeId, shift.day, shift.start, shift.end, shift.role);
        }

        return { scheduleId, weekStart, published };
    });

    try {
        const result = saveTransaction(req.body);

        // If publishing, notify all employees with shifts
        if (result.published) {
            const employeesWithShifts = query(
                'SELECT DISTINCT employee_id FROM shifts WHERE schedule_id = ?',
                [result.scheduleId]
            );

            for (const emp of employeesWithShifts) {
                run(`
                    INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
                    VALUES (?, 'schedule', ?, ?, 'schedule', ?)
                `, [
                    emp.employee_id,
                    '📅 New Schedule Published',
                    `Your schedule for the week of ${result.weekStart} has been published. Check your shifts!`,
                    result.scheduleId
                ]);
            }
            console.log(`Notified ${employeesWithShifts.length} employees about published schedule`);
        }

        res.json({ success: true, scheduleId: result.scheduleId });
    } catch (error) {
        console.error('Save schedule error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Publish schedule
router.post('/:id/publish', (req, res) => {
    try {
        const { id } = req.params;
        const { published } = req.body;

        run(
            "UPDATE schedules SET published = ?, published_at = ?, updated_at = datetime('now') WHERE id = ?",
            [published ? 1 : 0, published ? new Date().toISOString() : null, id]
        );

        // When publishing, notify all employees who have shifts in this schedule
        if (published) {
            const schedule = queryOne('SELECT week_start FROM schedules WHERE id = ?', [id]);

            // Get all employees with shifts in this schedule
            const employeesWithShifts = query(
                'SELECT DISTINCT employee_id FROM shifts WHERE schedule_id = ?',
                [id]
            );

            // Create notification for each employee
            for (const emp of employeesWithShifts) {
                run(`
                    INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
                    VALUES (?, 'schedule', ?, ?, 'schedule', ?)
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
router.get('/published-weeks', (req, res) => {
    try {
        const { storeId } = req.query;

        if (!storeId) {
            return res.status(400).json({ success: false, error: 'Store ID is required' });
        }

        const publishedSchedules = query(
            'SELECT week_start FROM schedules WHERE store_id = ? AND published = 1 ORDER BY week_start',
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
