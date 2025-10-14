/**
 * Stream Chat Controller
 *
 * Handles HTTP endpoints for Stream Chat integration:
 * - Generate user tokens
 * - Create analyst channels
 * - Manage channel members
 *
 * SECURITY:
 * - All endpoints require authentication
 * - Channel creation restricted to analysts
 * - Member management requires ownership verification
 * - Subscription verification before granting access
 *
 * ERROR HANDLING:
 * - Comprehensive error catching and logging
 * - User-friendly error messages
 * - Proper HTTP status codes
 */

const streamService = require('../services/streamService');
const { pool } = require('../config/database');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

/**
 * Generate Stream Chat token for authenticated user
 *
 * POST /api/stream/token
 *
 * @returns {
 *   success: boolean,
 *   data: { token: string, userId: string }
 * }
 */
const generateToken = asyncHandler(async (req, res) => {
  const { id: userId, role } = req.user;

  try {
    // Get user details from database
    const userQuery = `
      SELECT id, email, phone, name, role
      FROM users
      WHERE id = $1
    `;
    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const user = userResult.rows[0];

    // Generate Stream token
    const tokenData = await streamService.generateUserToken(
      user.id,
      user.name || user.email,
      user.role
    );

    console.log(`[Stream Controller] Token generated for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Stream token generated successfully',
      data: tokenData
    });
  } catch (error) {
    console.error('[Stream Controller] Token generation error:', error);
    throw new AppError(
      error.message || 'Failed to generate Stream token',
      error.statusCode || 500
    );
  }
});

/**
 * Create analyst community channel
 * Only analysts can create channels
 *
 * POST /api/stream/channel
 *
 * @returns {
 *   success: boolean,
 *   data: { channelId: string, channelType: string, channelCid: string }
 * }
 */
const createChannel = asyncHandler(async (req, res) => {
  const { id: userId, role } = req.user;

  // Only analysts can create channels
  if (role !== 'analyst') {
    throw new AppError('Only analysts can create community channels', 403);
  }

  try {
    // Get analyst details
    const analystQuery = `
      SELECT id, name, email
      FROM users
      WHERE id = $1 AND role = 'analyst'
    `;
    const analystResult = await pool.query(analystQuery, [userId]);

    if (analystResult.rows.length === 0) {
      throw new AppError('Analyst not found', 404);
    }

    const analyst = analystResult.rows[0];

    // Create channel in Stream
    const channelData = await streamService.createAnalystChannel(
      analyst.id,
      analyst.name || analyst.email
    );

    console.log(`[Stream Controller] Channel created for analyst ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Channel created successfully',
      data: channelData
    });
  } catch (error) {
    console.error('[Stream Controller] Channel creation error:', error);
    throw new AppError(
      error.message || 'Failed to create channel',
      error.statusCode || 500
    );
  }
});

/**
 * Add subscriber to analyst community channel
 * Verifies subscription status before adding
 *
 * POST /api/stream/channel/:channelId/members
 * Body: { traderId: number }
 *
 * @returns {
 *   success: boolean,
 *   message: string
 * }
 */
const addMember = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { traderId } = req.body;
  const { id: requesterId, role } = req.user;

  if (!traderId) {
    throw new AppError('Trader ID is required', 400);
  }

  try {
    // Extract analyst ID from channel ID (format: analyst-{id}-community)
    const analystId = parseInt(channelId.split('-')[1], 10);

    if (isNaN(analystId)) {
      throw new AppError('Invalid channel ID format', 400);
    }

    // Verify requester is the analyst who owns the channel OR the trader themselves
    if (role === 'analyst' && requesterId !== analystId) {
      throw new AppError('You can only add members to your own channel', 403);
    }

    if (role === 'trader' && requesterId !== traderId) {
      throw new AppError('You can only join channels as yourself', 403);
    }

    // Get trader details
    const traderQuery = `
      SELECT id, name, email
      FROM users
      WHERE id = $1 AND role = 'trader'
    `;
    const traderResult = await pool.query(traderQuery, [traderId]);

    if (traderResult.rows.length === 0) {
      throw new AppError('Trader not found', 404);
    }

    const trader = traderResult.rows[0];

    // Add member to channel (includes subscription verification)
    await streamService.addMemberToChannel(
      channelId,
      trader.id,
      trader.name || trader.email,
      analystId
    );

    console.log(`[Stream Controller] Member ${traderId} added to channel ${channelId}`);

    res.status(200).json({
      success: true,
      message: 'Member added to channel successfully'
    });
  } catch (error) {
    console.error('[Stream Controller] Add member error:', error);

    // Check for subscription error
    if (error.message.includes('subscription')) {
      throw new AppError(error.message, 403);
    }

    throw new AppError(
      error.message || 'Failed to add member to channel',
      error.statusCode || 500
    );
  }
});

/**
 * Remove subscriber from analyst community channel
 * Used when subscription expires or is cancelled
 *
 * DELETE /api/stream/channel/:channelId/members/:traderId
 *
 * @returns {
 *   success: boolean,
 *   message: string
 * }
 */
const removeMember = asyncHandler(async (req, res) => {
  const { channelId, traderId } = req.params;
  const { id: requesterId, role } = req.user;

  try {
    // Extract analyst ID from channel ID
    const analystId = parseInt(channelId.split('-')[1], 10);

    if (isNaN(analystId)) {
      throw new AppError('Invalid channel ID format', 400);
    }

    // Verify requester is the analyst who owns the channel OR admin
    if (role !== 'admin' && requesterId !== analystId) {
      throw new AppError('You can only remove members from your own channel', 403);
    }

    // Remove member from channel
    await streamService.removeMemberFromChannel(channelId, parseInt(traderId, 10));

    console.log(`[Stream Controller] Member ${traderId} removed from channel ${channelId}`);

    res.status(200).json({
      success: true,
      message: 'Member removed from channel successfully'
    });
  } catch (error) {
    console.error('[Stream Controller] Remove member error:', error);
    throw new AppError(
      error.message || 'Failed to remove member from channel',
      error.statusCode || 500
    );
  }
});

/**
 * Get channel members with online status
 *
 * GET /api/stream/channel/:channelId/members
 *
 * @returns {
 *   success: boolean,
 *   data: { members: Array }
 * }
 */
const getMembers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { id: requesterId, role } = req.user;

  try {
    // Extract analyst ID from channel ID
    const analystId = parseInt(channelId.split('-')[1], 10);

    if (isNaN(analystId)) {
      throw new AppError('Invalid channel ID format', 400);
    }

    // Verify requester has access (analyst owner or subscribed trader)
    if (role === 'analyst' && requesterId !== analystId) {
      throw new AppError('You can only view members of your own channel', 403);
    }

    if (role === 'trader') {
      // Verify trader has subscription
      const hasSubscription = await streamService.verifySubscription(requesterId, analystId);
      if (!hasSubscription) {
        throw new AppError('Active subscription required to view channel members', 403);
      }
    }

    // Get channel members
    const members = await streamService.getChannelMembers(channelId);

    console.log(`[Stream Controller] Retrieved ${members.length} members from channel ${channelId}`);

    res.status(200).json({
      success: true,
      data: { members }
    });
  } catch (error) {
    console.error('[Stream Controller] Get members error:', error);
    throw new AppError(
      error.message || 'Failed to get channel members',
      error.statusCode || 500
    );
  }
});

/**
 * Health check for Stream Chat service
 *
 * GET /api/stream/health
 *
 * @returns {
 *   success: boolean,
 *   data: { status: string, message: string }
 * }
 */
const healthCheck = asyncHandler(async (req, res) => {
  try {
    const health = await streamService.healthCheck();

    res.status(health.status === 'healthy' ? 200 : 503).json({
      success: health.status === 'healthy',
      data: health
    });
  } catch (error) {
    console.error('[Stream Controller] Health check error:', error);
    res.status(503).json({
      success: false,
      data: {
        status: 'unhealthy',
        message: error.message
      }
    });
  }
});

module.exports = {
  generateToken,
  createChannel,
  addMember,
  removeMember,
  getMembers,
  healthCheck
};
