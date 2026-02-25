const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { subscriber } = require('./redis');

const JWT_SECRET = process.env.JWT_SECRET || 'shiftsync-secret-key';

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: true,
            credentials: true
        }
    });

    // Authentication Middleware for Sockets
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return next(new Error('Authentication error'));
            socket.user = user;
            next();
        });
    });

    io.on('connection', (socket) => {
        const userId = socket.user.id;
        console.log(`🔌 WS Connected: ${socket.user.email} (${userId}) | SID: ${socket.id}`);

        // Join user-specific room
        socket.join(`user:${userId}`);

        socket.on('error', (err) => {
            console.error(`🔌 WS Socket Error (${userId}):`, err);
        });

        socket.on('disconnect', (reason) => {
            console.log(`🔌 WS Disconnected: ${userId} | Reason: ${reason}`);
        });
    });

    // Bridge Redis Pub/Sub to Socket.io
    const setupRedisSubscriber = async () => {
        // Subscribe to user channels and global channel
        await subscriber.pSubscribe('user:*', (message, channel) => {
            const data = JSON.parse(message);
            // channel is 'user:123', we can emit directly to that room
            io.to(channel).emit(data.type, data.data);
            console.log(`[Socket] Bridged Redis user channel ${channel} to WS`);
        });

        await subscriber.subscribe('global_broadcast', (message) => {
            const data = JSON.parse(message);
            io.emit(data.type, data.data);
            console.log(`[Socket] Bridged Redis global broadcast to all WS`);
        });
    };

    setupRedisSubscriber();

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

module.exports = {
    initSocket,
    getIO
};
