const express = require('express');
const { query, queryOne, run } = require('../db');
const { publishUpdate, broadcastUpdate } = require('../utils/redis');

const router = express.Router();

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }
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

// GET /api/notifications/vapid-public-key - Get public key for push notifications
router.get('/vapid-public-key', authenticateToken, async (req, res) => {
    try {
        const vapidKeys = await queryOne('SELECT value FROM system_settings WHERE "key" = $1', ['vapid_keys']);
        if (!vapidKeys) {
            return res.status(404).json({ success: false, error: 'VAPID keys not configured' });
        }
        const keys = JSON.parse(vapidKeys.value);
        res.json({ success: true, publicKey: keys.publicKey });
    } catch (error) {
        console.error('Get VAPID key error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/notifications/subscribe - Save push subscription
router.post('/subscribe', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const subscription = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, error: 'Invalid subscription object' });
        }

        const subscriptionJson = JSON.stringify(subscription);

        // Use ON CONFLICT to avoid duplicate subscriptions for the same user/device
        await run(`
            INSERT INTO push_subscriptions (user_id, subscription_json)
            VALUES ($1, $2)
            ON CONFLICT (user_id, subscription_json) DO NOTHING
        `, [userId, subscriptionJson]);

        res.json({ success: true, message: 'Subscribed to push notifications' });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/notifications - Get user's notifications
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { unreadOnly } = req.query;
        let limit = parseInt(req.query.limit) || 50;

        // DoS Protection: Cap the limit
        if (limit > 100) limit = 100;

        let notificationsQuery = 'SELECT * FROM notifications WHERE user_id = $1';
        const params = [userId];
        let paramIndex = 2;

        if (unreadOnly === 'true') {
            notificationsQuery += ' AND is_read = false';
        }

        notificationsQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
        params.push(limit);

        const notifications = await query(notificationsQuery, params);

        res.json({
            success: true,
            notifications: notifications.map(n => ({
                id: n.id,
                userId: n.user_id,
                type: n.type,
                title: n.title,
                message: n.message,
                relatedEntityType: n.related_entity_type,
                relatedEntityId: n.related_entity_id,
                isRead: n.is_read,
                createdAt: n.created_at
            }))
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/notifications/unread-count - Get count of unread notifications
router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await queryOne('SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false', [userId]);

        res.json({
            success: true,
            unreadCount: parseInt(result?.count || 0)
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Verify ownership
        const notification = await queryOne('SELECT * FROM notifications WHERE id = $1 AND user_id = $2', [id, userId]);

        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        await run('UPDATE notifications SET is_read = true WHERE id = $1', [id]);

        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put('/mark-all-read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await run('UPDATE notifications SET is_read = true WHERE user_id = $1', [userId]);

        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Verify ownership
        const notification = await queryOne('SELECT * FROM notifications WHERE id = $1 AND user_id = $2', [id, userId]);

        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        await run('DELETE FROM notifications WHERE id = $1', [id]);

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
