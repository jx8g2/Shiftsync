const webpush = require('web-push');
const { query, queryOne } = require('../db');

let vapidKeysInitialized = false;

async function initVapidKeys() {
    if (vapidKeysInitialized) return;

    try {
        const vapidKeysSetting = await queryOne('SELECT value FROM system_settings WHERE "key" = $1', ['vapid_keys']);
        if (vapidKeysSetting) {
            const keys = JSON.parse(vapidKeysSetting.value);
            webpush.setVapidDetails(
                'mailto:admin@shiftsync.com',
                keys.publicKey,
                keys.privateKey
            );
            vapidKeysInitialized = true;
            console.log('WebPush VAPID details set.');
        } else {
            console.error('VAPID keys not found in database. Push notifications will not work.');
        }
    } catch (error) {
        console.error('Error initializing VAPID keys:', error);
    }
}

/**
 * Send a push notification to a specific user
 * @param {number} userId - The ID of the recipient
 * @param {object} payload - The notification content (title, body, etc.)
 */
async function sendPushNotification(userId, payload) {
    if (!vapidKeysInitialized) {
        await initVapidKeys();
    }

    try {
        // Get all active subscriptions for this user
        const subscriptions = await query('SELECT subscription_json FROM push_subscriptions WHERE user_id = $1', [userId]);

        console.log(`Sending push notification to user ${userId} (${subscriptions.length} devices)`);

        const notifications = subscriptions.map(sub => {
            const subscription = JSON.parse(sub.subscription_json);
            return webpush.sendNotification(subscription, JSON.stringify(payload))
                .catch(async (err) => {
                    // If subscription has expired or is invalid, remove it from the database
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        console.log(`Removing expired subscription for user ${userId}`);
                        await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription_json = $2',
                            [userId, sub.subscription_json]);
                    } else {
                        console.error('Push notification error:', err);
                    }
                });
        });

        return Promise.all(notifications);
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}

module.exports = {
    sendPushNotification
};
