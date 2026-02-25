const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const publisher = createClient({ url: redisUrl });
const subscriber = createClient({ url: redisUrl });

publisher.on('error', (err) => console.error('Redis Publisher Error', err));
subscriber.on('error', (err) => console.error('Redis Subscriber Error', err));

let isConnected = false;

const initRedis = async () => {
    if (isConnected) return;
    try {
        await publisher.connect();
        await subscriber.connect();
        console.log('✅ Connected to Redis');
        isConnected = true;
    } catch (error) {
        console.error('❌ Failed to connect to Redis:', error);
    }
};

/**
 * Publishes an update to a user-specific Redis channel.
 * @param {number|string} userId 
 * @param {string} type - 'data_refresh' or 'notification_refresh'
 * @param {object} data - optional payload
 */
const publishUpdate = async (userId, type, data = {}) => {
    if (!isConnected) await initRedis();

    const channel = `user:${userId}`;
    const message = JSON.stringify({ type, data });

    try {
        await publisher.publish(channel, message);
        console.log(`[Redis] Published ${type} to user:${userId}`);
    } catch (error) {
        console.error(`[Redis] Publish error for user:${userId}`, error);
    }
};

/**
 * Publishes a broadcast to all users (global channel).
 */
const broadcastUpdate = async (type, data = {}) => {
    if (!isConnected) await initRedis();

    const channel = 'global_broadcast';
    const message = JSON.stringify({ type, data });

    try {
        await publisher.publish(channel, message);
        console.log(`[Redis] Broadcasted ${type} globally`);
    } catch (error) {
        console.error(`[Redis] Broadcast error`, error);
    }
};

module.exports = {
    initRedis,
    publishUpdate,
    broadcastUpdate,
    subscriber
};
