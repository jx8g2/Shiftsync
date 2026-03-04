const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initializeDatabase, seedDefaultData } = require('./db');
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const scheduleRoutes = require('./routes/schedules');
const requestRoutes = require('./routes/requests');
const swapRequestRoutes = require('./routes/swap-requests');
const messagesRoutes = require('./routes/messages');
const notificationsRoutes = require('./routes/notifications');
const storesRoutes = require('./routes/stores');

const app = express();
const PORT = process.env.PORT || 3001;
const backupRoutes = require('./routes/backups');

// Middleware
app.use(cors({
    origin: true, // Allow any origin in development
    credentials: true
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/swap-requests', swapRequestRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/admin/backups', backupRoutes);

// Debug endpoint removed (PostgreSQL migration)


// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

const path = require('path');
// ...

// Serve static frontend files (if built)
app.use(express.static(path.join(__dirname, '../dist')));

// Handle React routing (SPA catch-all)
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// 404 handler (for API calls not found)
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

const http = require('http');
const { initRedis } = require('./utils/redis');
const { initSocket } = require('./utils/socket');

const server = http.createServer(app);

// ... existing routes ...

// Start server
const startServer = async () => {
    const { initBackupService } = require('./services/backupService');

    try {
        // Initialize database and seed default data
        await initializeDatabase();
        await seedDefaultData();

        // Initialize Redis
        await initRedis();

        // Initialize Socket.io
        initSocket(server);

        // Start backup service
        initBackupService();

        server.listen(PORT, () => {
            console.log(`\n🚀 Server running on http://localhost:${PORT}`);
            // ... logs ...
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
