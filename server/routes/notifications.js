const express = require('express');
const { query, queryOne, run } = require('../db');

const router = express.Router();

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'shiftsync-secret-key';
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

// GET /api/notifications - Get user's notifications
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { unreadOnly, limit = 50 } = req.query;

        let notificationsQuery = 'SELECT * FROM notifications WHERE user_id = ?';
        const params = [userId];

        if (unreadOnly === 'true') {
            notificationsQuery += ' AND is_read = 0';
        }

        notificationsQuery += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const notifications = query(notificationsQuery, params);

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
                isRead: Boolean(n.is_read),
                createdAt: n.created_at ? n.created_at.replace(' ', 'T') + 'Z' : null
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
        const result = queryOne('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);

        res.json({
            success: true,
            unreadCount: result?.count || 0
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
        const notification = queryOne('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);

        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);

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
        run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);

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
        const notification = queryOne('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);

        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        run('DELETE FROM notifications WHERE id = ?', [id]);

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
