/**
 * Chat Controller
 *
 * HTTP endpoints for community chat management (REST API)
 * Real-time messaging handled by Socket.io in chatSocket.js
 *
 * Features:
 * - Channel CRUD operations
 * - Message history retrieval
 * - Moderation actions (mute/ban/delete)
 * - Online user tracking
 * - Search and analytics
 */

const ChatChannel = require('../models/ChatChannel');
const ChatMessage = require('../models/ChatMessage');
const { asyncHandler } = require('../middleware/errorHandler');
const { AppError } = require('../middleware/errorHandler');
const { PAGINATION } = require('../utils/constants');

/**
 * @route   GET /api/chat/channels/:analystId
 * @desc    Get all channels for an analyst
 * @access  Public (but content visibility depends on subscription)
 */
const getAnalystChannels = asyncHandler(async (req, res) => {
  const { analystId } = req.params;

  const channels = await ChatChannel.getAnalystChannels(analystId);

  res.status(200).json({
    success: true,
    data: {
      channels,
      count: channels.length
    }
  });
});

/**
 * @route   GET /api/chat/channels/single/:channelId
 * @desc    Get a single channel by ID
 * @access  Private (requires subscription)
 */
const getChannelById = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Get channel
  const channel = await ChatChannel.getChannelById(channelId);

  // Check user access
  const access = await ChatChannel.checkUserAccess(channelId, userId, userRole);

  if (!access.has_access) {
    throw new AppError(access.reason || 'You do not have access to this channel', 403);
  }

  res.status(200).json({
    success: true,
    data: {
      channel,
      access: {
        can_post: access.can_post,
        is_analyst: access.is_analyst
      }
    }
  });
});

/**
 * @route   POST /api/chat/channels
 * @desc    Create a new channel (analyst only)
 * @access  Private (analyst only)
 */
const createChannel = asyncHandler(async (req, res) => {
  const analystId = req.user.id;
  const {
    channelName,
    channelDescription,
    channelType,
    icon,
    isReadOnly,
    messageRateLimit,
    requireSubscription,
    minimumTierRequired
  } = req.body;

  // Validate input
  if (!channelName || !channelType) {
    throw new AppError('Channel name and type are required', 400);
  }

  // Create channel
  const channel = await ChatChannel.createChannel({
    analystId,
    channelName,
    channelDescription,
    channelType,
    icon,
    isReadOnly,
    messageRateLimit,
    requireSubscription,
    minimumTierRequired
  });

  res.status(201).json({
    success: true,
    message: 'Channel created successfully',
    data: { channel }
  });
});

/**
 * @route   PUT /api/chat/channels/:channelId
 * @desc    Update channel settings (analyst only)
 * @access  Private (analyst only)
 */
const updateChannel = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const analystId = req.user.id;

  // Verify analyst owns this channel
  const channel = await ChatChannel.getChannelById(channelId);
  if (channel.analyst_id !== analystId) {
    throw new AppError('Only the channel owner can update it', 403);
  }

  // Update channel
  const updatedChannel = await ChatChannel.updateChannel(channelId, req.body);

  res.status(200).json({
    success: true,
    message: 'Channel updated successfully',
    data: { channel: updatedChannel }
  });
});

/**
 * @route   DELETE /api/chat/channels/:channelId
 * @desc    Delete a channel (analyst only, soft delete)
 * @access  Private (analyst only)
 */
const deleteChannel = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const analystId = req.user.id;

  await ChatChannel.deleteChannel(channelId, analystId);

  res.status(200).json({
    success: true,
    message: 'Channel deleted successfully'
  });
});

/**
 * @route   GET /api/chat/messages/:channelId
 * @desc    Get message history for a channel (paginated)
 * @access  Private (requires channel access)
 */
const getChannelMessages = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Parse pagination params
  const limit = parseInt(req.query.limit, 10) || PAGINATION.DEFAULT_LIMIT;
  const offset = parseInt(req.query.offset, 10) || 0;
  const beforeMessageId = req.query.before || null;

  // Check user access
  const access = await ChatChannel.checkUserAccess(channelId, userId, userRole);

  if (!access.has_access) {
    throw new AppError('You do not have access to this channel', 403);
  }

  // Get messages
  const result = await ChatMessage.getChannelMessages(
    channelId,
    Math.min(limit, PAGINATION.MAX_LIMIT),
    offset,
    beforeMessageId
  );

  res.status(200).json({
    success: true,
    data: {
      messages: result.messages,
      pagination: result.pagination
    }
  });
});

/**
 * @route   GET /api/chat/messages/pinned/:channelId
 * @desc    Get pinned messages for a channel
 * @access  Private (requires channel access)
 */
const getPinnedMessages = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Check user access
  const access = await ChatChannel.checkUserAccess(channelId, userId, userRole);

  if (!access.has_access) {
    throw new AppError('You do not have access to this channel', 403);
  }

  const pinnedMessages = await ChatMessage.getPinnedMessages(channelId);

  res.status(200).json({
    success: true,
    data: { pinned_messages: pinnedMessages }
  });
});

/**
 * @route   POST /api/chat/messages/:messageId/delete
 * @desc    Delete a message (analyst or message owner)
 * @access  Private
 */
const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;

  // Get message details
  const message = await ChatMessage.getMessageById(messageId);

  // Check if user can delete (message owner or analyst)
  const channel = await ChatChannel.getChannelById(message.channel_id);
  const isAnalyst = channel.analyst_id === userId;
  const isOwner = message.user_id === userId;

  if (!isAnalyst && !isOwner) {
    throw new AppError('You do not have permission to delete this message', 403);
  }

  // Delete message
  await ChatMessage.deleteMessage(messageId, userId, reason);

  res.status(200).json({
    success: true,
    message: 'Message deleted successfully'
  });
});

/**
 * @route   POST /api/chat/messages/:messageId/flag
 * @desc    Flag a message for moderation
 * @access  Private
 */
const flagMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;

  if (!reason || reason.trim().length === 0) {
    throw new AppError('Reason for flagging is required', 400);
  }

  await ChatMessage.flagMessage(messageId, userId, reason);

  res.status(200).json({
    success: true,
    message: 'Message flagged for review'
  });
});

/**
 * @route   POST /api/chat/messages/:messageId/pin
 * @desc    Pin a message to the channel (analyst only)
 * @access  Private (analyst only)
 */
const pinMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const analystId = req.user.id;

  // Get message details
  const message = await ChatMessage.getMessageById(messageId);

  // Verify user is analyst of this channel
  const channel = await ChatChannel.getChannelById(message.channel_id);
  if (channel.analyst_id !== analystId) {
    throw new AppError('Only the analyst can pin messages', 403);
  }

  await ChatMessage.pinMessage(messageId, analystId);

  res.status(200).json({
    success: true,
    message: 'Message pinned successfully'
  });
});

/**
 * @route   POST /api/chat/messages/:messageId/unpin
 * @desc    Unpin a message (analyst only)
 * @access  Private (analyst only)
 */
const unpinMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const analystId = req.user.id;

  // Get message details
  const message = await ChatMessage.getMessageById(messageId);

  // Verify user is analyst of this channel
  const channel = await ChatChannel.getChannelById(message.channel_id);
  if (channel.analyst_id !== analystId) {
    throw new AppError('Only the analyst can unpin messages', 403);
  }

  await ChatMessage.unpinMessage(messageId);

  res.status(200).json({
    success: true,
    message: 'Message unpinned successfully'
  });
});

/**
 * @route   POST /api/chat/users/:userId/mute
 * @desc    Mute a user in analyst's channels (analyst only)
 * @access  Private (analyst only)
 * @note    This is REST fallback - prefer Socket.io for real-time muting
 */
const muteUser = asyncHandler(async (req, res) => {
  const { userId: targetUserId } = req.params;
  const { channelId, duration = 60 } = req.body; // duration in minutes
  const analystId = req.user.id;

  if (!channelId) {
    throw new AppError('Channel ID is required', 400);
  }

  // Verify user is analyst of this channel
  const channel = await ChatChannel.getChannelById(channelId);
  if (channel.analyst_id !== analystId) {
    throw new AppError('Only the analyst can mute users', 403);
  }

  // Note: Actual mute implementation is in Socket.io (in-memory)
  // This endpoint is just for reference/confirmation
  res.status(200).json({
    success: true,
    message: 'User muted successfully. Use Socket.io for real-time muting.',
    data: {
      targetUserId,
      channelId,
      duration,
      mute_until: new Date(Date.now() + duration * 60 * 1000)
    }
  });
});

/**
 * @route   POST /api/chat/users/:userId/ban
 * @desc    Ban a user from analyst's channels (analyst only)
 * @access  Private (analyst only)
 * @note    This is REST fallback - prefer Socket.io for real-time banning
 */
const banUser = asyncHandler(async (req, res) => {
  const { userId: targetUserId } = req.params;
  const { channelId, reason = 'Banned by analyst' } = req.body;
  const analystId = req.user.id;

  if (!channelId) {
    throw new AppError('Channel ID is required', 400);
  }

  // Verify user is analyst of this channel
  const channel = await ChatChannel.getChannelById(channelId);
  if (channel.analyst_id !== analystId) {
    throw new AppError('Only the analyst can ban users', 403);
  }

  // Note: Actual ban implementation is in Socket.io (in-memory)
  // This endpoint is just for reference/confirmation
  res.status(200).json({
    success: true,
    message: 'User banned successfully. Use Socket.io for real-time banning.',
    data: {
      targetUserId,
      channelId,
      reason
    }
  });
});

/**
 * @route   GET /api/chat/users/:channelId/online
 * @desc    Get online users in a channel
 * @access  Private (requires channel access)
 * @note    This is REST fallback - Socket.io has real-time tracking
 */
const getOnlineUsers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Check user access
  const access = await ChatChannel.checkUserAccess(channelId, userId, userRole);

  if (!access.has_access) {
    throw new AppError('You do not have access to this channel', 403);
  }

  // Note: Online users are tracked in Socket.io (in-memory)
  // This endpoint returns approximate data from database
  const members = await ChatChannel.getChannelMembers(channelId, 100, 0);

  res.status(200).json({
    success: true,
    message: 'Use Socket.io get_online_users event for real-time data',
    data: {
      members,
      count: members.length
    }
  });
});

/**
 * @route   GET /api/chat/channels/:channelId/members
 * @desc    Get all members of a channel (subscribed users)
 * @access  Private (analyst only)
 */
const getChannelMembers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const analystId = req.user.id;

  // Parse pagination
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;

  // Verify analyst owns this channel
  const channel = await ChatChannel.getChannelById(channelId);
  if (channel.analyst_id !== analystId) {
    throw new AppError('Only the channel owner can view members', 403);
  }

  const members = await ChatChannel.getChannelMembers(
    channelId,
    Math.min(limit, PAGINATION.MAX_LIMIT),
    offset
  );

  res.status(200).json({
    success: true,
    data: {
      members,
      count: members.length
    }
  });
});

/**
 * @route   GET /api/chat/search/:channelId
 * @desc    Search messages in a channel
 * @access  Private (requires channel access)
 */
const searchMessages = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { q: searchQuery } = req.query;
  const userId = req.user.id;
  const userRole = req.user.role;

  if (!searchQuery || searchQuery.trim().length < 2) {
    throw new AppError('Search query must be at least 2 characters', 400);
  }

  // Check user access
  const access = await ChatChannel.checkUserAccess(channelId, userId, userRole);

  if (!access.has_access) {
    throw new AppError('You do not have access to this channel', 403);
  }

  const messages = await ChatMessage.searchMessages(channelId, searchQuery, 50);

  res.status(200).json({
    success: true,
    data: {
      messages,
      count: messages.length,
      query: searchQuery
    }
  });
});

/**
 * @route   GET /api/chat/moderation/flagged
 * @desc    Get flagged messages for analyst moderation
 * @access  Private (analyst only)
 */
const getFlaggedMessages = asyncHandler(async (req, res) => {
  const analystId = req.user.id;

  // Parse pagination
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;

  const result = await ChatMessage.getFlaggedMessages(
    analystId,
    Math.min(limit, PAGINATION.MAX_LIMIT),
    offset
  );

  res.status(200).json({
    success: true,
    data: {
      messages: result.messages,
      pagination: result.pagination
    }
  });
});

/**
 * @route   GET /api/chat/stats/:channelId
 * @desc    Get channel statistics (analyst only)
 * @access  Private (analyst only)
 */
const getChannelStats = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const analystId = req.user.id;

  // Verify analyst owns this channel
  const channel = await ChatChannel.getChannelById(channelId);
  if (channel.analyst_id !== analystId) {
    throw new AppError('Only the channel owner can view statistics', 403);
  }

  const stats = await ChatMessage.getChannelStats(channelId);

  res.status(200).json({
    success: true,
    data: {
      channel_id: channelId,
      channel_name: channel.channel_name,
      stats: {
        total_messages: parseInt(stats.total_messages, 10),
        unique_users: parseInt(stats.unique_users, 10),
        messages_last_24h: parseInt(stats.messages_last_24h, 10),
        last_message_at: stats.last_message_at
      }
    }
  });
});

/**
 * @route   GET /api/chat/user/messages
 * @desc    Get current user's messages across all channels
 * @access  Private
 */
const getUserMessages = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { channelId } = req.query;

  if (!channelId) {
    throw new AppError('Channel ID is required', 400);
  }

  const messages = await ChatMessage.getUserChannelMessages(userId, channelId, 50);

  res.status(200).json({
    success: true,
    data: {
      messages,
      count: messages.length
    }
  });
});

/**
 * @route   POST /api/chat/channels/default/:analystId
 * @desc    Create default channels for a new analyst (called during onboarding)
 * @access  Private (analyst only or admin)
 */
const createDefaultChannels = asyncHandler(async (req, res) => {
  const { analystId } = req.params;
  const requesterId = req.user.id;
  const requesterRole = req.user.role;

  // Only the analyst themselves or admin can create default channels
  if (requesterId !== analystId && requesterRole !== 'admin') {
    throw new AppError('Unauthorized to create channels for this analyst', 403);
  }

  const channels = await ChatChannel.createDefaultChannels(analystId);

  res.status(201).json({
    success: true,
    message: 'Default channels created successfully',
    data: {
      channels,
      count: channels.length
    }
  });
});

/**
 * @route   GET /api/chat/community/channels
 * @desc    Get all community channels (global channels for all traders)
 * @access  Private (authenticated users only)
 */
const getCommunityChannels = asyncHandler(async (req, res) => {
  const channels = await ChatChannel.getCommunityChannels();

  res.status(200).json({
    success: true,
    data: {
      channels,
      count: channels.length
    }
  });
});

/**
 * @route   GET /api/chat/community/:channelId
 * @desc    Get a single community channel by ID
 * @access  Private (authenticated users only)
 */
const getCommunityChannelById = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const userId = req.user.id;

  // Get channel
  const channel = await ChatChannel.getChannelById(channelId);

  // Verify it's a community channel
  if (!channel.is_community_channel) {
    throw new AppError('This is not a community channel', 400);
  }

  // Check user access
  const access = await ChatChannel.checkCommunityChannelAccess(channelId, userId);

  if (!access.has_access) {
    throw new AppError(access.reason || 'You do not have access to this channel', 403);
  }

  res.status(200).json({
    success: true,
    data: {
      channel,
      access: {
        can_post: access.can_post,
        is_community: access.is_community
      }
    }
  });
});

/**
 * @route   GET /api/chat/community/:channelId/messages
 * @desc    Get message history for a community channel (paginated)
 * @access  Private (authenticated users only)
 */
const getCommunityChannelMessages = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const userId = req.user.id;

  // Parse pagination params
  const limit = parseInt(req.query.limit, 10) || PAGINATION.DEFAULT_LIMIT;
  const offset = parseInt(req.query.offset, 10) || 0;
  const beforeMessageId = req.query.before || null;

  // Check user access to community channel
  const access = await ChatChannel.checkCommunityChannelAccess(channelId, userId);

  if (!access.has_access) {
    throw new AppError('You do not have access to this channel', 403);
  }

  // Get messages
  const result = await ChatMessage.getChannelMessages(
    channelId,
    Math.min(limit, PAGINATION.MAX_LIMIT),
    offset,
    beforeMessageId
  );

  res.status(200).json({
    success: true,
    data: {
      messages: result.messages,
      pagination: result.pagination
    }
  });
});

module.exports = {
  getAnalystChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
  getChannelMessages,
  getPinnedMessages,
  deleteMessage,
  flagMessage,
  pinMessage,
  unpinMessage,
  muteUser,
  banUser,
  getOnlineUsers,
  getChannelMembers,
  searchMessages,
  getFlaggedMessages,
  getChannelStats,
  getUserMessages,
  createDefaultChannels,
  getCommunityChannels,
  getCommunityChannelById,
  getCommunityChannelMessages
};
