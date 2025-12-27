/**
 * AI Browser Controller - Auth Routes
 * Handles Google OAuth token verification
 */

const express = require('express');
const router = express.Router();

/**
 * POST /api/auth/verify
 * Verifies Google OAuth token and returns user info
 */
router.post('/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Missing or invalid authorization header'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify token with Google
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            return res.status(401).json({
                error: 'Invalid or expired token'
            });
        }

        const userInfo = await response.json();

        console.log(`[Auth] User verified: ${userInfo.email}`);

        res.json({
            success: true,
            user: {
                id: userInfo.id,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture
            }
        });

    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            message: error.message
        });
    }
});

/**
 * GET /api/auth/status
 * Check if user is authenticated (middleware helper)
 */
router.get('/status', (req, res) => {
    const authHeader = req.headers.authorization;

    res.json({
        authenticated: !!authHeader && authHeader.startsWith('Bearer '),
        timestamp: Date.now()
    });
});

module.exports = router;
