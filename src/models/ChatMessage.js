/**
 * ChatMessage Model
 *
 * Database operations for chat_messages table
 * Handles message history, moderation, and real-time chat storage
 *
 * Features:
 * - Message CRUD operations
 * - Pagination and message history
 * - Soft delete for moderation
 * - Rate limiting checks
 * - Message flagging and pinning
 */

const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create a new chat message
 * @param {Object} messageData - Message information
 * @returns {Promise<Object>} - Created message with user info
 */
const createMessage = async (messageData) => {
  const {
    channelId,
    userId,
    analystId,
    message,
    messageType = 'text',
    attachmentUrl = null,
    replyToMessageId = null
  } = messageData;

  try {
    const queryText = `
      INSERT INTO chat_messages (
        channel_id,
        user_id,
        analyst_id,
        message,
        message_type,
        attachment_url,
        reply_to_message_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        channel_id,
        user_id,
        analyst_id,
        message,
        message_type,
        attachment_url,
        reply_to_message_id,
        is_deleted,
        is_flagged,
        is_pinned,
        created_at,
        updated_at
    `;

    const values = [
      channelId,
      userId,
      analystId,
      message,
      messageType,
      attachmentUrl,
      replyToMessageId
    ];

    const result = await query(queryText, values);

    // Fetch message with user details
    return await getMessageById(result.rows[0].id);
  } catch (error) {
    if (error.code === '23503') { // Foreign key violation
      throw new AppError('Invalid channel, user, or analyst ID', 400);
    }
    if (error.code === '23514') { // Check constraint violation
      throw new AppError('Message is empty or too long (max 2000 characters)', 400);
    }
    console.error('Error creating message:', error);
    throw new AppError('Failed to send message', 500);
  }
};

/**
 * Get message by ID with user details
 * @param {string} messageId - Message ID
 * @returns {Promise<Object>} - Message with user info
 */
const getMessageById = async (messageId) => {
  try {
    const queryText = `
      SELECT
        m.id,
        m.channel_id,
        m.user_id,
        m.analyst_id,
        m.message,
        m.message_type,
        m.attachment_url,
        m.reply_to_message_id,
        m.is_deleted,
        m.deleted_by,
        m.deleted_at,
        m.deletion_reason,
        m.is_flagged,
        m.flagged_by,
        m.flagged_reason,
        m.is_pinned,
        m.pinned_by,
        m.pinned_at,
        m.created_at,
        m.updated_at,
        u.full_name as user_name,
        u.profile_image_url as user_image,
        u.role as user_role,
        CASE WHEN m.reply_to_message_id IS NOT NULL THEN
          json_build_object(
            'id', rm.id,
            'message', rm.message,
            'user_name', ru.full_name,
            'created_at', rm.created_at
          )
        ELSE NULL END as reply_to
      FROM chat_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN chat_messages rm ON m.reply_to_message_id = rm.id
      LEFT JOIN users ru ON rm.user_id = ru.id
      WHERE m.id = $1
    `;

    const result = await query(queryText, [messageId]);

    if (result.rows.length === 0) {
      throw new AppError('Message not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error fetching message by ID:', error);
    throw new AppError('Failed to fetch message', 500);
  }
};

/**
 * Get channel message history (paginated)
 * @param {string} channelId - Channel ID
 * @param {number} limit - Max messages to return
 * @param {number} offset - Pagination offset
 * @param {string} beforeMessageId - Get messages before this ID (for infinite scroll)
 * @returns {Promise<Object>} - Messages and pagination info
 */
const getChannelMessages = async (channelId, limit = 100, offset = 0, beforeMessageId = null) => {
  try {
    let queryText = `
      SELECT
        m.id,
        m.channel_id,
        m.user_id,
        m.analyst_id,
        m.message,
        m.message_type,
        m.attachment_url,
        m.reply_to_message_id,
        m.is_deleted,
        m.is_flagged,
        m.is_pinned,
        m.pinned_at,
        m.created_at,
        m.updated_at,
        u.full_name as user_name,
        u.profile_image_url as user_image,
        u.role as user_role,
        CASE WHEN m.reply_to_message_id IS NOT NULL THEN
          json_build_object(
            'id', rm.id,
            'message', rm.message,
            'user_name', ru.full_name,
            'created_at', rm.created_at
          )
        ELSE NULL END as reply_to
      FROM chat_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN chat_messages rm ON m.reply_to_message_id = rm.id
      LEFT JOIN users ru ON rm.user_id = ru.id
      WHERE m.channel_id = $1
        AND m.is_deleted = FALSE
    `;

    const values = [channelId];
    let valueIndex = 2;

    // If beforeMessageId provided, get messages before that timestamp
    if (beforeMessageId) {
      queryText += ` AND m.created_at < (
        SELECT created_at FROM chat_messages WHERE id = $${valueIndex}
      )`;
      values.push(beforeMessageId);
      valueIndex++;
    }

    queryText += `
      ORDER BY m.created_at DESC
      LIMIT $${valueIndex} OFFSET $${valueIndex + 1}
    `;

    values.push(limit, offset);

    const result = await query(queryText, values);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM chat_messages
      WHERE channel_id = $1
        AND is_deleted = FALSE
    `;
    const countResult = await query(countQuery, [channelId]);

    return {
      messages: result.rows.reverse(), // Reverse to show oldest first
      pagination: {
        total: parseInt(countResult.rows[0].total, 10),
        limit,
        offset,
        has_more: result.rows.length === limit
      }
    };
  } catch (error) {
    console.error('Error fetching channel messages:', error);
    throw new AppError('Failed to fetch messages', 500);
  }
};

/**
 * Get pinned messages for a channel
 * @param {string} channelId - Channel ID
 * @returns {Promise<Array>} - Pinned messages
 */
const getPinnedMessages = async (channelId) => {
  try {
    const queryText = `
      SELECT
        m.id,
        m.channel_id,
        m.user_id,
        m.message,
        m.message_type,
        m.attachment_url,
        m.is_pinned,
        m.pinned_by,
        m.pinned_at,
        m.created_at,
        u.full_name as user_name,
        u.profile_image_url as user_image,
        u.role as user_role,
        pu.full_name as pinned_by_name
      FROM chat_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN users pu ON m.pinned_by = pu.id
      WHERE m.channel_id = $1
        AND m.is_pinned = TRUE
        AND m.is_deleted = FALSE
      ORDER BY m.pinned_at DESC
      LIMIT 10
    `;

    const result = await query(queryText, [channelId]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching pinned messages:', error);
    throw new AppError('Failed to fetch pinned messages', 500);
  }
};

/**
 * Soft delete a message
 * @param {string} messageId - Message ID
 * @param {string} deletedBy - User ID who deleted the message
 * @param {string} reason - Reason for deletion
 * @returns {Promise<Object>} - Deleted message
 */
const deleteMessage = async (messageId, deletedBy, reason = null) => {
  try {
    const queryText = `
      UPDATE chat_messages
      SET
        is_deleted = TRUE,
        deleted_by = $2,
        deleted_at = NOW(),
        deletion_reason = $3,
        updated_at = NOW()
      WHERE id = $1
        AND is_deleted = FALSE
      RETURNING
        id,
        channel_id,
        user_id,
        message,
        is_deleted,
        deleted_by,
        deleted_at,
        deletion_reason
    `;

    const result = await query(queryText, [messageId, deletedBy, reason]);

    if (result.rows.length === 0) {
      throw new AppError('Message not found or already deleted', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error deleting message:', error);
    throw new AppError('Failed to delete message', 500);
  }
};

/**
 * Flag a message for moderation
 * @param {string} messageId - Message ID
 * @param {string} flaggedBy - User ID who flagged the message
 * @param {string} reason - Reason for flagging
 * @returns {Promise<Object>} - Flagged message
 */
const flagMessage = async (messageId, flaggedBy, reason) => {
  try {
    const queryText = `
      UPDATE chat_messages
      SET
        is_flagged = TRUE,
        flagged_by = $2,
        flagged_reason = $3,
        updated_at = NOW()
      WHERE id = $1
        AND is_deleted = FALSE
      RETURNING id, channel_id, user_id, message, is_flagged, flagged_reason
    `;

    const result = await query(queryText, [messageId, flaggedBy, reason]);

    if (result.rows.length === 0) {
      throw new AppError('Message not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error flagging message:', error);
    throw new AppError('Failed to flag message', 500);
  }
};

/**
 * Pin a message to the channel
 * @param {string} messageId - Message ID
 * @param {string} pinnedBy - User ID who pinned the message
 * @returns {Promise<Object>} - Pinned message
 */
const pinMessage = async (messageId, pinnedBy) => {
  try {
    const queryText = `
      UPDATE chat_messages
      SET
        is_pinned = TRUE,
        pinned_by = $2,
        pinned_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND is_deleted = FALSE
      RETURNING id, channel_id, message, is_pinned, pinned_by, pinned_at
    `;

    const result = await query(queryText, [messageId, pinnedBy]);

    if (result.rows.length === 0) {
      throw new AppError('Message not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error pinning message:', error);
    throw new AppError('Failed to pin message', 500);
  }
};

/**
 * Unpin a message
 * @param {string} messageId - Message ID
 * @returns {Promise<Object>} - Unpinned message
 */
const unpinMessage = async (messageId) => {
  try {
    const queryText = `
      UPDATE chat_messages
      SET
        is_pinned = FALSE,
        pinned_by = NULL,
        pinned_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, channel_id, is_pinned
    `;

    const result = await query(queryText, [messageId]);

    if (result.rows.length === 0) {
      throw new AppError('Message not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error unpinning message:', error);
    throw new AppError('Failed to unpin message', 500);
  }
};

/**
 * Check user's message rate limit
 * @param {string} userId - User ID
 * @param {string} channelId - Channel ID
 * @param {number} limitPerMinute - Messages allowed per minute
 * @returns {Promise<Object>} - Rate limit status
 */
const checkRateLimit = async (userId, channelId, limitPerMinute = 10) => {
  try {
    const queryText = `
      SELECT COUNT(*) as message_count
      FROM chat_messages
      WHERE user_id = $1
        AND channel_id = $2
        AND created_at > NOW() - INTERVAL '1 minute'
        AND is_deleted = FALSE
    `;

    const result = await query(queryText, [userId, channelId]);
    const messageCount = parseInt(result.rows[0].message_count, 10);

    const isLimited = messageCount >= limitPerMinute;
    const remaining = Math.max(0, limitPerMinute - messageCount);

    return {
      is_limited: isLimited,
      message_count: messageCount,
      limit: limitPerMinute,
      remaining,
      retry_after: isLimited ? 60 : 0 // seconds
    };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // Don't throw error - allow message if check fails
    return {
      is_limited: false,
      message_count: 0,
      limit: limitPerMinute,
      remaining: limitPerMinute,
      retry_after: 0
    };
  }
};

/**
 * Get user's recent messages in a channel
 * @param {string} userId - User ID
 * @param {string} channelId - Channel ID
 * @param {number} limit - Max messages to return
 * @returns {Promise<Array>} - User's messages
 */
const getUserChannelMessages = async (userId, channelId, limit = 50) => {
  try {
    const queryText = `
      SELECT
        m.id,
        m.channel_id,
        m.message,
        m.message_type,
        m.is_deleted,
        m.is_flagged,
        m.created_at,
        c.channel_name
      FROM chat_messages m
      JOIN chat_channels c ON m.channel_id = c.id
      WHERE m.user_id = $1
        AND m.channel_id = $2
      ORDER BY m.created_at DESC
      LIMIT $3
    `;

    const result = await query(queryText, [userId, channelId, limit]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching user channel messages:', error);
    throw new AppError('Failed to fetch user messages', 500);
  }
};

/**
 * Search messages in a channel
 * @param {string} channelId - Channel ID
 * @param {string} searchQuery - Search term
 * @param {number} limit - Max results
 * @returns {Promise<Array>} - Matching messages
 */
const searchMessages = async (channelId, searchQuery, limit = 50) => {
  try {
    const queryText = `
      SELECT
        m.id,
        m.channel_id,
        m.user_id,
        m.message,
        m.message_type,
        m.created_at,
        u.full_name as user_name,
        u.profile_image_url as user_image,
        u.role as user_role,
        ts_rank(to_tsvector('english', m.message), plainto_tsquery('english', $2)) as rank
      FROM chat_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = $1
        AND m.is_deleted = FALSE
        AND to_tsvector('english', m.message) @@ plainto_tsquery('english', $2)
      ORDER BY rank DESC, m.created_at DESC
      LIMIT $3
    `;

    const result = await query(queryText, [channelId, searchQuery, limit]);

    return result.rows;
  } catch (error) {
    console.error('Error searching messages:', error);
    throw new AppError('Failed to search messages', 500);
  }
};

/**
 * Get flagged messages for moderation
 * @param {string} analystId - Analyst ID
 * @param {number} limit - Max results
 * @param {number} offset - Pagination offset
 * @returns {Promise<Object>} - Flagged messages and pagination
 */
const getFlaggedMessages = async (analystId, limit = 50, offset = 0) => {
  try {
    const queryText = `
      SELECT
        m.id,
        m.channel_id,
        m.user_id,
        m.message,
        m.message_type,
        m.is_flagged,
        m.flagged_by,
        m.flagged_reason,
        m.created_at,
        c.channel_name,
        u.full_name as user_name,
        fu.full_name as flagged_by_name
      FROM chat_messages m
      JOIN chat_channels c ON m.channel_id = c.id
      JOIN users u ON m.user_id = u.id
      LEFT JOIN users fu ON m.flagged_by = fu.id
      WHERE m.analyst_id = $1
        AND m.is_flagged = TRUE
        AND m.is_deleted = FALSE
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(queryText, [analystId, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM chat_messages
      WHERE analyst_id = $1
        AND is_flagged = TRUE
        AND is_deleted = FALSE
    `;
    const countResult = await query(countQuery, [analystId]);

    return {
      messages: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total, 10),
        limit,
        offset
      }
    };
  } catch (error) {
    console.error('Error fetching flagged messages:', error);
    throw new AppError('Failed to fetch flagged messages', 500);
  }
};

/**
 * Get channel message statistics
 * @param {string} channelId - Channel ID
 * @returns {Promise<Object>} - Message statistics
 */
const getChannelStats = async (channelId) => {
  try {
    const queryText = `
      SELECT
        COUNT(*) as total_messages,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as messages_last_24h,
        MAX(created_at) as last_message_at
      FROM chat_messages
      WHERE channel_id = $1
        AND is_deleted = FALSE
    `;

    const result = await query(queryText, [channelId]);

    return result.rows[0];
  } catch (error) {
    console.error('Error fetching channel stats:', error);
    throw new AppError('Failed to fetch channel statistics', 500);
  }
};

module.exports = {
  createMessage,
  getMessageById,
  getChannelMessages,
  getPinnedMessages,
  deleteMessage,
  flagMessage,
  pinMessage,
  unpinMessage,
  checkRateLimit,
  getUserChannelMessages,
  searchMessages,
  getFlaggedMessages,
  getChannelStats
};
