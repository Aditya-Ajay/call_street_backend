/**
 * Community Chat Routes
 *
 * HTTP REST API endpoints for Discord-style community chat
 * Real-time messaging handled by Socket.io (see chatSocket.js)
 *
 * Features:
 * - Channel management (CRUD)
 * - Message history retrieval
 * - Moderation (mute/ban/delete/flag)
 * - Search and analytics
 * - Pinned messages
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireAnalyst } = require('../middleware/auth');
const { chatLimiter } = require('../middleware/rateLimiter');

// Import controller
const chatController = require('../controllers/chatController');

// ============================================
// CHANNEL ROUTES
// NOTE: Specific routes MUST come before parameterized routes
// ============================================

/**
 * @route   POST /api/chat/channels
 * @desc    Create a new channel (analyst only)
 * @access  Private (analyst only)
 */
router.post('/channels', verifyToken, requireAnalyst, chatController.createChannel);

/**
 * @route   GET /api/chat/channels/single/:channelId
 * @desc    Get a single channel by ID with access info
 * @access  Private (requires subscription for full access)
 */
router.get('/channels/single/:channelId', verifyToken, chatController.getChannelById);

/**
 * @route   POST /api/chat/channels/default/:analystId
 * @desc    Create default channels for new analyst (onboarding)
 * @access  Private (analyst or admin only)
 */
router.post(
  '/channels/default/:analystId',
  verifyToken,
  chatController.createDefaultChannels
);

/**
 * @route   GET /api/chat/channels/:analystId
 * @desc    Get all channels for an analyst
 * @access  Public (but messages require subscription)
 */
router.get('/channels/:analystId', chatController.getAnalystChannels);

/**
 * @route   PUT /api/chat/channels/:channelId
 * @desc    Update channel settings (analyst only)
 * @access  Private (analyst only)
 */
router.put('/channels/:channelId', verifyToken, requireAnalyst, chatController.updateChannel);

/**
 * @route   DELETE /api/chat/channels/:channelId
 * @desc    Delete a channel (analyst only, soft delete)
 * @access  Private (analyst only)
 */
router.delete('/channels/:channelId', verifyToken, requireAnalyst, chatController.deleteChannel);

/**
 * @route   GET /api/chat/channels/:channelId/members
 * @desc    Get all members of a channel (analyst only)
 * @access  Private (analyst only)
 */
router.get(
  '/channels/:channelId/members',
  verifyToken,
  requireAnalyst,
  chatController.getChannelMembers
);

// ============================================
// MESSAGE ROUTES
// NOTE: Specific routes MUST come before parameterized routes
// ============================================

/**
 * @route   GET /api/chat/messages/pinned/:channelId
 * @desc    Get pinned messages for a channel
 * @access  Private (requires channel access)
 */
router.get('/messages/pinned/:channelId', verifyToken, chatController.getPinnedMessages);

/**
 * @route   GET /api/chat/messages/:channelId
 * @desc    Get message history for a channel (paginated)
 * @access  Private (requires channel access)
 */
router.get('/messages/:channelId', verifyToken, chatController.getChannelMessages);

/**
 * @route   POST /api/chat/messages/:messageId/delete
 * @desc    Delete a message (analyst or message owner)
 * @access  Private
 */
router.post('/messages/:messageId/delete', verifyToken, chatController.deleteMessage);

/**
 * @route   POST /api/chat/messages/:messageId/flag
 * @desc    Flag a message for moderation
 * @access  Private
 */
router.post('/messages/:messageId/flag', verifyToken, chatLimiter, chatController.flagMessage);

/**
 * @route   POST /api/chat/messages/:messageId/pin
 * @desc    Pin a message to the channel (analyst only)
 * @access  Private (analyst only)
 */
router.post(
  '/messages/:messageId/pin',
  verifyToken,
  requireAnalyst,
  chatController.pinMessage
);

/**
 * @route   POST /api/chat/messages/:messageId/unpin
 * @desc    Unpin a message (analyst only)
 * @access  Private (analyst only)
 */
router.post(
  '/messages/:messageId/unpin',
  verifyToken,
  requireAnalyst,
  chatController.unpinMessage
);

/**
 * @route   GET /api/chat/user/messages
 * @desc    Get current user's messages in a channel
 * @access  Private
 */
router.get('/user/messages', verifyToken, chatController.getUserMessages);

// ============================================
// MODERATION ROUTES
// ============================================

/**
 * @route   POST /api/chat/users/:userId/mute
 * @desc    Mute a user in analyst's channels (REST fallback)
 * @access  Private (analyst only)
 * @note    Prefer Socket.io for real-time muting
 */
router.post(
  '/users/:userId/mute',
  verifyToken,
  requireAnalyst,
  chatController.muteUser
);

/**
 * @route   POST /api/chat/users/:userId/ban
 * @desc    Ban a user from analyst's channels (REST fallback)
 * @access  Private (analyst only)
 * @note    Prefer Socket.io for real-time banning
 */
router.post(
  '/users/:userId/ban',
  verifyToken,
  requireAnalyst,
  chatController.banUser
);

/**
 * @route   GET /api/chat/moderation/flagged
 * @desc    Get flagged messages for analyst moderation
 * @access  Private (analyst only)
 */
router.get(
  '/moderation/flagged',
  verifyToken,
  requireAnalyst,
  chatController.getFlaggedMessages
);

// ============================================
// PRESENCE & ANALYTICS ROUTES
// ============================================

/**
 * @route   GET /api/chat/users/:channelId/online
 * @desc    Get online users in a channel (REST fallback)
 * @access  Private (requires channel access)
 * @note    Prefer Socket.io for real-time online tracking
 */
router.get('/users/:channelId/online', verifyToken, chatController.getOnlineUsers);

/**
 * @route   GET /api/chat/stats/:channelId
 * @desc    Get channel statistics (analyst only)
 * @access  Private (analyst only)
 */
router.get(
  '/stats/:channelId',
  verifyToken,
  requireAnalyst,
  chatController.getChannelStats
);

/**
 * @route   GET /api/chat/search/:channelId
 * @desc    Search messages in a channel
 * @access  Private (requires channel access)
 */
router.get('/search/:channelId', verifyToken, chatController.searchMessages);

module.exports = router;
