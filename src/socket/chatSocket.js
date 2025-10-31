/**
 * Socket.io Discord-Style Community Chat Handler
 *
 * Manages real-time chat functionality for analyst communities
 * Features:
 * - Multi-channel support (Discord-style)
 * - Rate limiting (10 msgs/min for users, 30 for analysts)
 * - Typing indicators
 * - Online presence tracking
 * - Moderation (mute/ban)
 * - Free tier read-only access
 * - Paid tier full access
 */

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { SOCKET_EVENTS } = require('../utils/constants');
const ChatChannel = require('../models/ChatChannel');
const ChatMessage = require('../models/ChatMessage');

// In-memory stores (use Redis in production for multi-server support)
const connectedUsers = new Map(); // userId -> { socketId, channels: Set, connectedAt, role }
const userSockets = new Map(); // userId -> socket instance
const channelUsers = new Map(); // channelId -> Set of userIds
const typingUsers = new Map(); // channelId -> Set of userIds
const mutedUsers = new Map(); // channelId -> Map(userId -> muteUntil)
const bannedUsers = new Map(); // channelId -> Set of userIds

/**
 * Initialize Socket.io chat server
 * @param {Object} io - Socket.io server instance
 */
const initializeChatSocket = (io) => {
  // Socket.io authentication middleware
  io.use((socket, next) => {
    try {
      // Get token from cookie (sent automatically by browser)
      const cookies = socket.handshake.headers.cookie;

      if (!cookies) {
        return next(new Error('Authentication token required'));
      }

      // Parse cookies
      const cookieArray = cookies.split(';').map(c => c.trim());
      const accessTokenCookie = cookieArray.find(c => c.startsWith('accessToken='));

      if (!accessTokenCookie) {
        return next(new Error('Authentication token required'));
      }

      const token = accessTokenCookie.split('=')[1];

      // Verify JWT token
      const decoded = jwt.verify(token, config.jwt.secret, {
        algorithms: ['HS256'],
        issuer: 'analyst-marketplace',
        audience: 'analyst-marketplace-users'
      });

      // Attach user info to socket
      socket.userId = decoded.user_id;
      socket.userRole = decoded.role;
      socket.userEmail = decoded.email;
      socket.userName = decoded.email || 'User';

      next();
    } catch (error) {
      console.error('Socket authentication error:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  // Handle new connections
  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    console.log(`User connected: ${socket.userId} (${socket.userName}) - Socket: ${socket.id}`);

    // Store user connection
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      channels: new Set(),
      connectedAt: new Date(),
      role: socket.userRole,
      userName: socket.userName
    });

    // Store socket reference
    userSockets.set(socket.userId, socket);

    // Notify user is online (broadcast to all)
    socket.broadcast.emit(SOCKET_EVENTS.USER_ONLINE, {
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });

    /**
     * JOIN_CHANNEL - User joins a chat channel
     */
    socket.on('join_channel', async (data) => {
      try {
        const { channelId } = data;

        if (!channelId) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'join_channel',
            message: 'Channel ID is required'
          });
          return;
        }

        // Get channel to check if it's a community channel
        const channel = await ChatChannel.getChannelById(channelId);

        // Check if user has access to this channel
        let access;
        if (channel.is_community_channel) {
          // Community channels - all authenticated users have access
          access = await ChatChannel.checkCommunityChannelAccess(channelId, socket.userId);
        } else {
          // Analyst-specific channels
          access = await ChatChannel.checkUserAccess(
            channelId,
            socket.userId,
            socket.userRole
          );
        }

        if (!access.has_access) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'join_channel',
            message: access.reason || 'You do not have access to this channel'
          });
          return;
        }

        // Check if user is banned from this channel
        const channelBanned = bannedUsers.get(channelId);
        if (channelBanned && channelBanned.has(socket.userId)) {
          socket.emit('user_banned', {
            channelId,
            message: 'You have been banned from this channel by the analyst'
          });
          return;
        }

        // Join Socket.io room
        socket.join(`channel_${channelId}`);

        // Track user in channel
        const userData = connectedUsers.get(socket.userId);
        if (userData) {
          userData.channels.add(channelId);
        }

        // Track channel users
        if (!channelUsers.has(channelId)) {
          channelUsers.set(channelId, new Set());
        }
        channelUsers.get(channelId).add(socket.userId);

        // Update active members count
        const onlineCount = channelUsers.get(channelId).size;
        await ChatChannel.updateActiveMembersCount(channelId, onlineCount);

        // Load last 100 messages
        const messageHistory = await ChatMessage.getChannelMessages(channelId, 100, 0);

        // Get pinned messages
        const pinnedMessages = await ChatMessage.getPinnedMessages(channelId);

        // Send confirmation to user with channel data
        socket.emit('channel_joined', {
          channelId,
          channel,
          messages: messageHistory.messages,
          pinned_messages: pinnedMessages,
          online_count: onlineCount,
          can_post: access.can_post,
          is_analyst: access.is_analyst,
          timestamp: new Date()
        });

        // Notify others in channel
        socket.to(`channel_${channelId}`).emit('user_joined', {
          channelId,
          userId: socket.userId,
          userName: socket.userName,
          userRole: socket.userRole,
          online_count: onlineCount,
          timestamp: new Date()
        });

        console.log(`User ${socket.userId} joined channel ${channelId}`);
      } catch (error) {
        console.error('Error joining channel:', error);
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: 'join_channel',
          message: 'Failed to join channel'
        });
      }
    });

    /**
     * LEAVE_CHANNEL - User leaves a chat channel
     */
    socket.on('leave_channel', async (data) => {
      try {
        const { channelId } = data;

        if (!channelId) {
          return;
        }

        // Leave Socket.io room
        socket.leave(`channel_${channelId}`);

        // Remove user from channel tracking
        const userData = connectedUsers.get(socket.userId);
        if (userData) {
          userData.channels.delete(channelId);
        }

        if (channelUsers.has(channelId)) {
          channelUsers.get(channelId).delete(socket.userId);

          // Update online count
          const onlineCount = channelUsers.get(channelId).size;
          await ChatChannel.updateActiveMembersCount(channelId, onlineCount);

          // Notify others
          socket.to(`channel_${channelId}`).emit('user_left', {
            channelId,
            userId: socket.userId,
            userName: socket.userName,
            online_count: onlineCount,
            timestamp: new Date()
          });
        }

        // Remove from typing users
        if (typingUsers.has(channelId)) {
          typingUsers.get(channelId).delete(socket.userId);
        }

        console.log(`User ${socket.userId} left channel ${channelId}`);
      } catch (error) {
        console.error('Error leaving channel:', error);
      }
    });

    /**
     * SEND_MESSAGE - Send a message to a channel
     */
    socket.on('send_message', async (data) => {
      try {
        const { channelId, message, messageType = 'text', replyToMessageId = null } = data;

        // Validate input
        if (!channelId || !message) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'send_message',
            message: 'Channel ID and message are required'
          });
          return;
        }

        if (message.trim().length === 0) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'send_message',
            message: 'Message cannot be empty'
          });
          return;
        }

        if (message.length > 500) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'send_message',
            message: 'Message too long (max 500 characters)'
          });
          return;
        }

        // Check if user has access to post
        const access = await ChatChannel.checkUserAccess(
          channelId,
          socket.userId,
          socket.userRole
        );

        if (!access.has_access) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'send_message',
            message: 'You do not have access to this channel'
          });
          return;
        }

        if (!access.can_post) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'send_message',
            message: 'Upgrade to Paid tier to post messages'
          });
          return;
        }

        // Check if user is muted
        const channelMuted = mutedUsers.get(channelId);
        if (channelMuted && channelMuted.has(socket.userId)) {
          const muteUntil = channelMuted.get(socket.userId);
          if (new Date() < muteUntil) {
            const remainingTime = Math.ceil((muteUntil - new Date()) / 1000 / 60);
            socket.emit('user_muted', {
              channelId,
              message: `You have been muted by the analyst. Time remaining: ${remainingTime} minutes`
            });
            return;
          } else {
            // Mute expired
            channelMuted.delete(socket.userId);
          }
        }

        // Check if user is banned
        const channelBanned = bannedUsers.get(channelId);
        if (channelBanned && channelBanned.has(socket.userId)) {
          socket.emit('user_banned', {
            channelId,
            message: 'You have been banned from this channel by the analyst'
          });
          return;
        }

        // Get channel info for rate limiting
        const channel = await ChatChannel.getChannelById(channelId);

        // Check rate limit (bypass for announcement channels if user is analyst)
        const isAnalyst = channel.analyst_id === socket.userId;
        const rateLimit = isAnalyst ? 30 : (channel.message_rate_limit || 10);

        if (!isAnalyst || channel.channel_type !== 'announcement') {
          const rateLimitCheck = await ChatMessage.checkRateLimit(
            socket.userId,
            channelId,
            rateLimit
          );

          if (rateLimitCheck.is_limited) {
            socket.emit('rate_limit_exceeded', {
              channelId,
              message: `You're sending too fast. Wait ${rateLimitCheck.retry_after} seconds`,
              retry_after: rateLimitCheck.retry_after,
              limit: rateLimit
            });
            return;
          }

          // Warn user approaching rate limit (at 80%)
          if (rateLimitCheck.remaining <= Math.ceil(rateLimit * 0.2)) {
            socket.emit('rate_limit_warning', {
              channelId,
              message: `Slow down! Max ${rateLimit} messages per minute`,
              remaining: rateLimitCheck.remaining
            });
          }
        }

        // Save message to database
        const savedMessage = await ChatMessage.createMessage({
          channelId,
          userId: socket.userId,
          analystId: channel.analyst_id,
          message: message.trim(),
          messageType,
          replyToMessageId
        });

        // Update channel stats
        await ChatChannel.updateChannelStats(channelId);

        // Broadcast message to all users in channel
        io.to(`channel_${channelId}`).emit('message', {
          ...savedMessage,
          user_name: socket.userName,
          user_role: socket.userRole
        });

        // Stop typing indicator for this user
        if (typingUsers.has(channelId)) {
          typingUsers.get(channelId).delete(socket.userId);
        }

        console.log(`Message sent by ${socket.userId} in channel ${channelId}`);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: 'send_message',
          message: 'Failed to send message'
        });
      }
    });

    /**
     * TYPING_START - User started typing
     */
    socket.on('typing_start', (data) => {
      try {
        const { channelId } = data;

        if (!channelId) {
          return;
        }

        // Track typing user
        if (!typingUsers.has(channelId)) {
          typingUsers.set(channelId, new Set());
        }
        typingUsers.get(channelId).add(socket.userId);

        // Get all typing users (max 5 names shown)
        const typingSet = typingUsers.get(channelId);
        const typingUsersList = Array.from(typingSet)
          .filter((id) => id !== socket.userId)
          .slice(0, 5)
          .map((id) => {
            const user = connectedUsers.get(id);
            return user ? user.userName : 'Someone';
          });

        // Emit to others in channel
        socket.to(`channel_${channelId}`).emit('typing_indicator', {
          channelId,
          userId: socket.userId,
          userName: socket.userName,
          typing_users: typingUsersList,
          typing_count: typingSet.size - 1
        });
      } catch (error) {
        console.error('Error handling typing start:', error);
      }
    });

    /**
     * TYPING_STOP - User stopped typing
     */
    socket.on('typing_stop', (data) => {
      try {
        const { channelId } = data;

        if (!channelId) {
          return;
        }

        // Remove user from typing list
        if (typingUsers.has(channelId)) {
          typingUsers.get(channelId).delete(socket.userId);

          // Notify others
          socket.to(`channel_${channelId}`).emit('typing_indicator', {
            channelId,
            userId: socket.userId,
            userName: socket.userName,
            stopped: true
          });
        }
      } catch (error) {
        console.error('Error handling typing stop:', error);
      }
    });

    /**
     * DELETE_MESSAGE - Delete a message (analyst or message owner)
     */
    socket.on('delete_message', async (data) => {
      try {
        const { messageId, channelId, reason = 'Deleted by user' } = data;

        if (!messageId || !channelId) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'delete_message',
            message: 'Message ID and Channel ID are required'
          });
          return;
        }

        // Get message details
        const message = await ChatMessage.getMessageById(messageId);

        // Check if user can delete (message owner or analyst)
        const channel = await ChatChannel.getChannelById(channelId);
        const isAnalyst = channel.analyst_id === socket.userId;
        const isOwner = message.user_id === socket.userId;

        if (!isAnalyst && !isOwner) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'delete_message',
            message: 'You do not have permission to delete this message'
          });
          return;
        }

        // Delete message
        await ChatMessage.deleteMessage(messageId, socket.userId, reason);

        // Notify all users in channel
        io.to(`channel_${channelId}`).emit('message_deleted', {
          channelId,
          messageId,
          deletedBy: socket.userId,
          reason: isAnalyst ? reason : 'Deleted by user',
          timestamp: new Date()
        });

        console.log(`Message ${messageId} deleted by ${socket.userId}`);
      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: 'delete_message',
          message: 'Failed to delete message'
        });
      }
    });

    /**
     * MUTE_USER - Analyst mutes a user in the channel
     */
    socket.on('mute_user', async (data) => {
      try {
        const { channelId, targetUserId, duration = 60 } = data; // duration in minutes

        if (!channelId || !targetUserId) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'mute_user',
            message: 'Channel ID and Target User ID are required'
          });
          return;
        }

        // Verify user is analyst of this channel
        const channel = await ChatChannel.getChannelById(channelId);
        if (channel.analyst_id !== socket.userId) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'mute_user',
            message: 'Only the analyst can mute users'
          });
          return;
        }

        // Calculate mute expiry
        const muteUntil = new Date(Date.now() + duration * 60 * 1000);

        // Store mute
        if (!mutedUsers.has(channelId)) {
          mutedUsers.set(channelId, new Map());
        }
        mutedUsers.get(channelId).set(targetUserId, muteUntil);

        // Notify the muted user
        const targetSocket = userSockets.get(targetUserId);
        if (targetSocket) {
          targetSocket.emit('user_muted', {
            channelId,
            message: `You have been muted by the analyst for ${duration} minutes`,
            duration,
            mute_until: muteUntil
          });
        }

        // Notify analyst
        socket.emit('mute_success', {
          channelId,
          targetUserId,
          duration,
          mute_until: muteUntil
        });

        console.log(`User ${targetUserId} muted in channel ${channelId} for ${duration} minutes`);
      } catch (error) {
        console.error('Error muting user:', error);
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: 'mute_user',
          message: 'Failed to mute user'
        });
      }
    });

    /**
     * BAN_USER - Analyst permanently bans a user from the channel
     */
    socket.on('ban_user', async (data) => {
      try {
        const { channelId, targetUserId, reason = 'Banned by analyst' } = data;

        if (!channelId || !targetUserId) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'ban_user',
            message: 'Channel ID and Target User ID are required'
          });
          return;
        }

        // Verify user is analyst of this channel
        const channel = await ChatChannel.getChannelById(channelId);
        if (channel.analyst_id !== socket.userId) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'ban_user',
            message: 'Only the analyst can ban users'
          });
          return;
        }

        // Store ban
        if (!bannedUsers.has(channelId)) {
          bannedUsers.set(channelId, new Set());
        }
        bannedUsers.get(channelId).add(targetUserId);

        // Kick user from channel
        const targetSocket = userSockets.get(targetUserId);
        if (targetSocket) {
          targetSocket.leave(`channel_${channelId}`);
          targetSocket.emit('user_banned', {
            channelId,
            message: `You have been banned from this channel by the analyst. Reason: ${reason}`,
            reason
          });
        }

        // Remove from online users list
        if (channelUsers.has(channelId)) {
          channelUsers.get(channelId).delete(targetUserId);
        }

        // Notify analyst
        socket.emit('ban_success', {
          channelId,
          targetUserId,
          reason
        });

        // Notify others in channel
        socket.to(`channel_${channelId}`).emit('user_banned_notification', {
          channelId,
          targetUserId,
          bannedBy: socket.userId
        });

        console.log(`User ${targetUserId} banned from channel ${channelId}`);
      } catch (error) {
        console.error('Error banning user:', error);
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: 'ban_user',
          message: 'Failed to ban user'
        });
      }
    });

    /**
     * GET_ONLINE_USERS - Get list of online users in a channel
     */
    socket.on('get_online_users', async (data) => {
      try {
        const { channelId } = data;

        if (!channelId) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: 'get_online_users',
            message: 'Channel ID is required'
          });
          return;
        }

        const onlineUserIds = channelUsers.get(channelId) || new Set();
        const onlineUsersList = Array.from(onlineUserIds).map((userId) => {
          const user = connectedUsers.get(userId);
          return {
            userId,
            userName: user ? user.userName : 'Unknown',
            userRole: user ? user.role : 'trader',
            connectedAt: user ? user.connectedAt : null
          };
        });

        socket.emit('online_users', {
          channelId,
          users: onlineUsersList,
          count: onlineUsersList.length
        });
      } catch (error) {
        console.error('Error getting online users:', error);
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: 'get_online_users',
          message: 'Failed to get online users'
        });
      }
    });

    /**
     * PRESENCE_UPDATE - Update user's presence (every 30 seconds)
     */
    socket.on('presence_update', (data) => {
      try {
        const userData = connectedUsers.get(socket.userId);
        if (userData) {
          userData.lastActivity = new Date();

          // Broadcast presence to all channels user is in
          userData.channels.forEach((channelId) => {
            socket.to(`channel_${channelId}`).emit('presence_update', {
              userId: socket.userId,
              userName: socket.userName,
              lastActivity: userData.lastActivity
            });
          });
        }
      } catch (error) {
        console.error('Error updating presence:', error);
      }
    });

    /**
     * DISCONNECT - Handle user disconnect
     */
    socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
      console.log(`User disconnected: ${socket.userId} (${socket.userName}) - Socket: ${socket.id}`);

      try {
        const userData = connectedUsers.get(socket.userId);

        if (userData) {
          // Leave all channels
          for (const channelId of userData.channels) {
            // Remove from channel users
            if (channelUsers.has(channelId)) {
              channelUsers.get(channelId).delete(socket.userId);

              // Update online count
              const onlineCount = channelUsers.get(channelId).size;
              await ChatChannel.updateActiveMembersCount(channelId, onlineCount);

              // Notify others in channel
              socket.to(`channel_${channelId}`).emit('user_left', {
                channelId,
                userId: socket.userId,
                userName: socket.userName,
                online_count: onlineCount,
                timestamp: new Date()
              });
            }

            // Remove from typing users
            if (typingUsers.has(channelId)) {
              typingUsers.get(channelId).delete(socket.userId);
            }
          }
        }

        // Remove user from connected users
        connectedUsers.delete(socket.userId);
        userSockets.delete(socket.userId);

        // Notify all users
        socket.broadcast.emit(SOCKET_EVENTS.USER_OFFLINE, {
          userId: socket.userId,
          userName: socket.userName,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });

    // Handle errors
    socket.on(SOCKET_EVENTS.ERROR, (error) => {
      console.error('Socket error:', error);
    });
  });

  console.log('Socket.io Discord-style community chat server initialized');
};

/**
 * Get online users globally
 * @returns {Array} - Array of online user IDs
 */
const getOnlineUsers = () => {
  return Array.from(connectedUsers.keys());
};

/**
 * Check if user is online
 * @param {string} userId - User ID
 * @returns {boolean} - True if user is online
 */
const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

/**
 * Get online users in a specific channel
 * @param {string} channelId - Channel ID
 * @returns {Array} - Array of user IDs
 */
const getChannelOnlineUsers = (channelId) => {
  const users = channelUsers.get(channelId);
  return users ? Array.from(users) : [];
};

/**
 * Send notification to specific user
 * @param {Object} io - Socket.io server instance
 * @param {string} userId - User ID
 * @param {Object} notification - Notification data
 */
const sendNotificationToUser = (io, userId, notification) => {
  const userSocket = userSockets.get(userId);

  if (userSocket) {
    userSocket.emit(SOCKET_EVENTS.NEW_NOTIFICATION, notification);
  }
};

/**
 * Broadcast notification to all users in a channel
 * @param {Object} io - Socket.io server instance
 * @param {string} channelId - Channel ID
 * @param {Object} notification - Notification data
 */
const broadcastToChannel = (io, channelId, event, data) => {
  io.to(`channel_${channelId}`).emit(event, data);
};

/**
 * Get chat statistics (for admin dashboard)
 * @returns {Object} - Chat statistics
 */
const getChatStats = () => {
  return {
    total_connected: connectedUsers.size,
    total_channels: channelUsers.size,
    users_by_channel: Array.from(channelUsers.entries()).map(([channelId, users]) => ({
      channelId,
      userCount: users.size
    })),
    muted_users_count: Array.from(mutedUsers.values()).reduce((sum, m) => sum + m.size, 0),
    banned_users_count: Array.from(bannedUsers.values()).reduce((sum, s) => sum + s.size, 0)
  };
};

module.exports = initializeChatSocket;

// Export utility functions
module.exports.getOnlineUsers = getOnlineUsers;
module.exports.isUserOnline = isUserOnline;
module.exports.getChannelOnlineUsers = getChannelOnlineUsers;
module.exports.sendNotificationToUser = sendNotificationToUser;
module.exports.broadcastToChannel = broadcastToChannel;
module.exports.getChatStats = getChatStats;
