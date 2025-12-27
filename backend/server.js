/**
 * AI Browser Controller - Backend Server
 * Express API for processing DOM and generating AI actions
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const agentRoutes = require('./routes/agent');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: '*', // Allow Chrome Extension
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' })); // Large DOM payloads

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api', agentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        version: '1.0.0'
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           AI Browser Controller Backend                   ║
║                                                            ║
║   Server running on http://localhost:${PORT}                ║
║                                                            ║
║   Endpoints:                                               ║
║   • POST /api/analyze      - Analyze DOM and actions       ║
║   • POST /api/chat         - Chat and summarization        ║
║   • POST /api/auth/verify  - Verify Google OAuth token     ║
║   • GET  /health           - Health check                  ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
