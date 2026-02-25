const express = require('express');
const crypto = require('crypto');
const { query, queryOne, run } = require('../db');
const { sendPushNotification } = require('../utils/push');
const { publishUpdate, broadcastUpdate } = require('../utils/redis');

const router = express.Router();

// Encryption key (in production, use environment variable)
const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY || 'shiftsync-chat-key-32chars!!';
const IV_LENGTH = 16;

// Encrypt message
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { encrypted, iv: iv.toString('hex') };
}

// Decrypt message
function decrypt(encrypted, ivHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

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

// GET /api/messages/conversations - List user's conversations (store-scoped)
router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get the current user's store
        const me = await query('SELECT store_id, role FROM employees WHERE id = $1', [userId]);
        const myStoreId = me[0]?.store_id;
        const isAdmin = me[0]?.role === 'admin';

        // Only return conversations where the user is a member.
        // For non-admins, also ensure every other member in the conversation
        // belongs to the same store (prevents cross-store conversation leakage).
        const conversations = await query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
                   (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id) as last_message_at
            FROM conversations c
            INNER JOIN conversation_members cm ON c.id = cm.conversation_id
            WHERE cm.user_id = $1
            ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
        `, [userId]);

        const result = await Promise.all(conversations.map(async conv => {
            const members = await query(`
                SELECT e.id, e.name, e.avatar, e.role, e.store_id
                FROM employees e
                INNER JOIN conversation_members cm ON e.id = cm.user_id
                WHERE cm.conversation_id = $1
            `, [conv.id]);

            // For non-admins, skip conversations that contain members from other stores (unless they are admins)
            if (!isAdmin) {
                const hasOutsider = members.some(m => m.store_id !== myStoreId && m.role !== 'admin');
                if (hasOutsider) return null;
            }

            return {
                id: conv.id,
                name: conv.name,
                isTeam: Boolean(conv.is_team),
                createdBy: conv.created_by,
                createdAt: conv.created_at,
                messageCount: parseInt(conv.message_count),
                lastMessageAt: conv.last_message_at,
                members: members.map(({ store_id, ...rest }) => rest)
            };
        }));

        res.json({ success: true, conversations: result.filter(Boolean) });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/messages/conversations - Create new conversation (store-scoped)
router.post('/conversations', authenticateToken, async (req, res) => {
    try {
        const { name, isTeam, memberIds } = req.body;
        const createdBy = req.user.id;

        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ success: false, error: 'memberIds are required' });
        }

        // Enforce store isolation: all members must be in the same store as the creator
        if (req.user.role !== 'admin') {
            const creator = await queryOne('SELECT store_id FROM employees WHERE id = $1', [createdBy]);
            const myStoreId = creator?.store_id;

            const outsiders = await query(
                `SELECT id FROM employees WHERE id = ANY($1::int[]) AND store_id != $2`,
                [memberIds, myStoreId]
            );

            if (outsiders.length > 0) {
                return res.status(403).json({
                    success: false,
                    error: 'You can only start conversations with people in your store'
                });
            }
        }

        const result = await queryOne(`
            INSERT INTO conversations (name, is_team, created_by)
            VALUES ($1, $2, $3)
            RETURNING id
        `, [name || null, isTeam ? 1 : 0, createdBy]);

        const conversationId = result.id;

        const allMembers = [...new Set([createdBy, ...memberIds])];
        for (const memberId of allMembers) {
            await run(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`, [conversationId, memberId]);
        }

        const conversation = await queryOne('SELECT * FROM conversations WHERE id = $1', [conversationId]);
        const members = await query(`
            SELECT e.id, e.name, e.avatar, e.role
            FROM employees e
            INNER JOIN conversation_members cm ON e.id = cm.user_id
            WHERE cm.conversation_id = $1
        `, [conversationId]);

        res.status(201).json({
            success: true,
            conversation: {
                id: conversation.id,
                name: conversation.name,
                isTeam: Boolean(conversation.is_team),
                createdBy: conversation.created_by,
                createdAt: conversation.created_at,
                members
            }
        });
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/messages/conversations/:id/messages - Get messages for a conversation
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { limit = 50, before } = req.query;

        // Verify user is a member
        const isMember = await queryOne(
            'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
            [id, userId]
        );

        if (!isMember) {
            return res.status(403).json({ success: false, error: 'Not a member of this conversation' });
        }

        let messagesQuery = `
            SELECT m.*, e.name as sender_name, e.avatar as sender_avatar
            FROM messages m
            LEFT JOIN employees e ON m.sender_id = e.id
            WHERE m.conversation_id = $1
        `;
        const params = [id];
        let paramCount = 2;

        if (before) {
            messagesQuery += ` AND m.id < $${paramCount++}`;
            params.push(before);
        }

        messagesQuery += ` ORDER BY m.created_at DESC LIMIT $${paramCount++}`;
        params.push(parseInt(limit));

        const messages = await query(messagesQuery, params);

        // Decrypt messages
        const result = messages.map(msg => {
            let content = '';
            try {
                content = msg.iv ? decrypt(msg.content_encrypted, msg.iv) : msg.content_encrypted;
            } catch (e) {
                content = '[Decryption failed]';
            }

            return {
                id: msg.id,
                conversationId: msg.conversation_id,
                senderId: msg.sender_id,
                senderName: msg.sender_name,
                senderAvatar: msg.sender_avatar,
                content,
                createdAt: msg.created_at
            };
        }).reverse(); // Reverse to show oldest first

        res.json({ success: true, messages: result });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/messages/conversations/:id/messages - Send a message
router.post('/conversations/:id/messages', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const senderId = req.user.id;

        if (!content || content.trim() === '') {
            return res.status(400).json({ success: false, error: 'Message content is required' });
        }

        // Verify user is a member
        const isMember = await queryOne(
            'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
            [id, senderId]
        );

        if (!isMember) {
            return res.status(403).json({ success: false, error: 'Not a member of this conversation' });
        }

        // Encrypt and store message
        const { encrypted, iv } = encrypt(content);
        const result = await queryOne(`
            INSERT INTO messages (conversation_id, sender_id, content_encrypted, iv)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [id, senderId, encrypted, iv]);

        const messageId = result.id;
        const msg = await queryOne(`
            SELECT m.*, e.name as sender_name, e.avatar as sender_avatar
            FROM messages m
            LEFT JOIN employees e ON m.sender_id = e.id
            WHERE m.id = $1
        `, [messageId]);

        // Create notifications for other members in the conversation
        const sender = await queryOne('SELECT name FROM employees WHERE id = $1', [senderId]);
        const senderNameStr = sender?.name || 'Someone';

        const otherMembers = await query(`
            SELECT cm.user_id
            FROM conversation_members cm
            WHERE cm.conversation_id = $1
              AND cm.user_id != $2
        `, [id, senderId]);

        for (const member of otherMembers) {
            await run(`
                INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
                VALUES ($1, 'message', $2, $3, 'conversation', $4)
            `, [member.user_id, `New message from ${senderNameStr}`, content.substring(0, 100), id]);

            // Background Push
            sendPushNotification(member.user_id, {
                title: `💬 New message from ${senderNameStr}`,
                body: content.substring(0, 100),
                url: '/employee/chat' // Adjust if manager
            });

            // WebSocket Refresh
            publishUpdate(member.user_id, 'notification_refresh');
            publishUpdate(member.user_id, 'data_refresh'); // For conversation list update if needed
        }

        res.status(201).json({
            success: true,
            message: {
                id: msg.id,
                conversationId: msg.conversation_id,
                senderId: msg.sender_id,
                senderName: msg.sender_name,
                senderAvatar: msg.sender_avatar,
                content,
                createdAt: msg.created_at
            }
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
