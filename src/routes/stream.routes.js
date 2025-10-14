/**
 * Stream Chat Routes
 *
 * Defines all HTTP endpoints for Stream Chat integration
 *
 * BASE PATH: /api/stream
 *
 * All routes require authentication (verifyToken middleware)
 * Some routes require specific roles (analyst only)
 *
 * ENDPOINTS:
 * - POST   /token                              - Generate user token
 * - POST   /channel                            - Create analyst channel (analyst only)
 * - POST   /channel/:channelId/members         - Add member to channel
 * - DELETE /channel/:channelId/members/:userId - Remove member from channel
 * - GET    /channel/:channelId/members         - Get channel members
 * - GET    /health                             - Health check
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireAnalyst, requireUser } = require('../middleware/auth');

// Import controllers
const streamController = require('../controllers/streamController');

// ============================================
// PUBLIC ROUTES (with authentication)
// ============================================

/**
 * Generate Stream Chat token for authenticated user
 * Required for frontend to connect to Stream
 */
router.post('/token', verifyToken, streamController.generateToken);

/**
 * Health check for Stream Chat service
 * Verifies connection to Stream API
 */
router.get('/health', verifyToken, streamController.healthCheck);

// ============================================
// CHANNEL MANAGEMENT ROUTES
// ============================================

/**
 * Create analyst community channel
 * Only analysts can create channels
 */
router.post('/channel', verifyToken, requireAnalyst, streamController.createChannel);

/**
 * Add member to channel
 * Analyst can add any subscriber
 * Trader can add themselves (with valid subscription)
 */
router.post('/channel/:channelId/members', verifyToken, requireUser, streamController.addMember);

/**
 * Remove member from channel
 * Only analyst owner or admin can remove members
 */
router.delete('/channel/:channelId/members/:traderId', verifyToken, streamController.removeMember);

/**
 * Get channel members with online status
 * Accessible by channel members only
 */
router.get('/channel/:channelId/members', verifyToken, requireUser, streamController.getMembers);

module.exports = router;
