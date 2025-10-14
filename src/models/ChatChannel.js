/**
 * ChatChannel Model
 *
 * Database operations for chat_channels table
 * Handles Discord-style community chat channels for analyst communities
 *
 * Channel Types:
 * - announcement: Read-only, analyst posts only
 * - general: Free-form discussion
 * - trading: Trading calls and ideas
 * - ideas: Share and discuss trade ideas
 */

const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create a new chat channel
 * @param {Object} channelData - Channel information
 * @returns {Promise<Object>} - Created channel
 */
const createChannel = async (channelData) => {
  const {
    analystId,
    channelName,
    channelDescription,
    channelType = 'general',
    icon = '💬',
    isReadOnly = false,
    messageRateLimit = 10,
    requireSubscription = true,
    minimumTierRequired = null
  } = channelData;

  try {
    const queryText = `
      INSERT INTO chat_channels (
        analyst_id,
        channel_name,
        channel_description,
        channel_type,
        icon,
        is_read_only,
        message_rate_limit,
        require_subscription,
        minimum_tier_required,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
      RETURNING
        id,
        analyst_id,
        channel_name,
        channel_description,
        channel_type,
        icon,
        is_read_only,
        message_rate_limit,
        require_subscription,
        minimum_tier_required,
        is_active,
        total_messages,
        active_members_count,
        created_at,
        updated_at
    `;

    const values = [
      analystId,
      channelName,
      channelDescription,
      channelType,
      icon,
      isReadOnly,
      messageRateLimit,
      requireSubscription,
      minimumTierRequired
    ];

    const result = await query(queryText, values);

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      throw new AppError('A channel with this name already exists for this analyst', 409);
    }
    if (error.code === '23503') { // Foreign key violation
      throw new AppError('Invalid analyst ID or tier ID', 400);
    }
    console.error('Error creating chat channel:', error);
    throw new AppError('Failed to create chat channel', 500);
  }
};

/**
 * Get all channels for an analyst
 * @param {string} analystId - Analyst's user ID
 * @returns {Promise<Array>} - List of channels
 */
const getAnalystChannels = async (analystId) => {
  try {
    const queryText = `
      SELECT
        id,
        analyst_id,
        channel_name,
        channel_description,
        channel_type,
        icon,
        is_read_only,
        message_rate_limit,
        require_subscription,
        minimum_tier_required,
        is_active,
        is_archived,
        total_messages,
        active_members_count,
        last_message_at,
        created_at,
        updated_at
      FROM chat_channels
      WHERE analyst_id = $1
        AND deleted_at IS NULL
      ORDER BY
        CASE channel_type
          WHEN 'announcement' THEN 1
          WHEN 'general' THEN 2
          WHEN 'trading' THEN 3
          WHEN 'ideas' THEN 4
          ELSE 5
        END,
        created_at ASC
    `;

    const result = await query(queryText, [analystId]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching analyst channels:', error);
    throw new AppError('Failed to fetch channels', 500);
  }
};

/**
 * Get channel by ID with analyst info
 * @param {string} channelId - Channel ID
 * @returns {Promise<Object>} - Channel details
 */
const getChannelById = async (channelId) => {
  try {
    const queryText = `
      SELECT
        c.id,
        c.analyst_id,
        c.channel_name,
        c.channel_description,
        c.channel_type,
        c.icon,
        c.is_read_only,
        c.message_rate_limit,
        c.require_subscription,
        c.minimum_tier_required,
        c.is_active,
        c.is_archived,
        c.total_messages,
        c.active_members_count,
        c.last_message_at,
        c.created_at,
        c.updated_at,
        u.full_name as analyst_name,
        u.profile_image_url as analyst_image
      FROM chat_channels c
      JOIN users u ON c.analyst_id = u.id
      WHERE c.id = $1
        AND c.deleted_at IS NULL
    `;

    const result = await query(queryText, [channelId]);

    if (result.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error fetching channel by ID:', error);
    throw new AppError('Failed to fetch channel', 500);
  }
};

/**
 * Update channel details
 * @param {string} channelId - Channel ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated channel
 */
const updateChannel = async (channelId, updates) => {
  const allowedFields = [
    'channel_name',
    'channel_description',
    'icon',
    'is_read_only',
    'message_rate_limit',
    'require_subscription',
    'minimum_tier_required',
    'is_active',
    'is_archived'
  ];

  // Build dynamic update query
  const updateFields = [];
  const values = [];
  let valueIndex = 1;

  Object.keys(updates).forEach((key) => {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = $${valueIndex}`);
      values.push(updates[key]);
      valueIndex++;
    }
  });

  if (updateFields.length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  // Add updated_at
  updateFields.push(`updated_at = NOW()`);
  values.push(channelId);

  try {
    const queryText = `
      UPDATE chat_channels
      SET ${updateFields.join(', ')}
      WHERE id = $${valueIndex}
        AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error updating channel:', error);
    throw new AppError('Failed to update channel', 500);
  }
};

/**
 * Soft delete a channel
 * @param {string} channelId - Channel ID
 * @param {string} analystId - Analyst ID (for verification)
 * @returns {Promise<boolean>} - Success status
 */
const deleteChannel = async (channelId, analystId) => {
  try {
    const queryText = `
      UPDATE chat_channels
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1
        AND analyst_id = $2
        AND deleted_at IS NULL
      RETURNING id
    `;

    const result = await query(queryText, [channelId, analystId]);

    if (result.rows.length === 0) {
      throw new AppError('Channel not found or unauthorized', 404);
    }

    return true;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error deleting channel:', error);
    throw new AppError('Failed to delete channel', 500);
  }
};

/**
 * Check if user has access to a channel
 * @param {string} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} userRole - User role (analyst/trader)
 * @returns {Promise<Object>} - Access status and channel info
 */
const checkUserAccess = async (channelId, userId, userRole) => {
  try {
    const queryText = `
      SELECT
        c.id,
        c.analyst_id,
        c.channel_type,
        c.is_read_only,
        c.require_subscription,
        c.minimum_tier_required,
        c.is_active,
        c.is_archived,
        CASE
          WHEN c.analyst_id = $2 THEN TRUE
          WHEN c.require_subscription = FALSE THEN TRUE
          WHEN EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = $2
              AND s.analyst_id = c.analyst_id
              AND s.status = 'active'
              AND (
                c.minimum_tier_required IS NULL
                OR s.tier_id = c.minimum_tier_required
              )
          ) THEN TRUE
          ELSE FALSE
        END as has_access,
        CASE
          WHEN c.analyst_id = $2 THEN TRUE
          WHEN c.is_read_only = TRUE THEN FALSE
          WHEN EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = $2
              AND s.analyst_id = c.analyst_id
              AND s.status = 'active'
              AND s.tier_id IN (
                SELECT id FROM subscription_tiers WHERE tier_name != 'free'
              )
          ) THEN TRUE
          ELSE FALSE
        END as can_post
      FROM chat_channels c
      WHERE c.id = $1
        AND c.deleted_at IS NULL
    `;

    const result = await query(queryText, [channelId, userId]);

    if (result.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    const channel = result.rows[0];

    // If channel is not active or archived, only analyst can access
    if ((!channel.is_active || channel.is_archived) && channel.analyst_id !== userId) {
      return {
        has_access: false,
        can_post: false,
        reason: channel.is_archived ? 'Channel is archived' : 'Channel is not active'
      };
    }

    return {
      has_access: channel.has_access,
      can_post: channel.can_post && !channel.is_archived,
      channel_type: channel.channel_type,
      is_read_only: channel.is_read_only,
      is_analyst: channel.analyst_id === userId
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error checking user access:', error);
    throw new AppError('Failed to check channel access', 500);
  }
};

/**
 * Update channel statistics (total messages, last message time)
 * @param {string} channelId - Channel ID
 * @returns {Promise<boolean>} - Success status
 */
const updateChannelStats = async (channelId) => {
  try {
    const queryText = `
      UPDATE chat_channels
      SET
        total_messages = total_messages + 1,
        last_message_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `;

    await query(queryText, [channelId]);

    return true;
  } catch (error) {
    console.error('Error updating channel stats:', error);
    // Don't throw error, just log it (non-critical operation)
    return false;
  }
};

/**
 * Update active members count
 * @param {string} channelId - Channel ID
 * @param {number} count - New count
 * @returns {Promise<boolean>} - Success status
 */
const updateActiveMembersCount = async (channelId, count) => {
  try {
    const queryText = `
      UPDATE chat_channels
      SET active_members_count = $2, updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `;

    await query(queryText, [channelId, count]);

    return true;
  } catch (error) {
    console.error('Error updating active members count:', error);
    return false;
  }
};

/**
 * Get channel member list (users with active subscriptions)
 * @param {string} channelId - Channel ID
 * @param {number} limit - Max results
 * @param {number} offset - Pagination offset
 * @returns {Promise<Array>} - List of members
 */
const getChannelMembers = async (channelId, limit = 50, offset = 0) => {
  try {
    const queryText = `
      SELECT DISTINCT
        u.id,
        u.full_name,
        u.profile_image_url,
        u.role,
        s.tier_id,
        st.tier_name,
        s.subscribed_at
      FROM chat_channels c
      JOIN subscriptions s ON s.analyst_id = c.analyst_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN subscription_tiers st ON st.id = s.tier_id
      WHERE c.id = $1
        AND s.status = 'active'
        AND c.deleted_at IS NULL
      ORDER BY s.subscribed_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(queryText, [channelId, limit, offset]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching channel members:', error);
    throw new AppError('Failed to fetch channel members', 500);
  }
};

/**
 * Create default channels for a new analyst
 * @param {string} analystId - Analyst's user ID
 * @returns {Promise<Array>} - Created channels
 */
const createDefaultChannels = async (analystId) => {
  const client = await getClient();
  const defaultChannels = [
    {
      name: 'Announcements',
      description: 'Important updates and announcements from the analyst',
      type: 'announcement',
      icon: '📢',
      isReadOnly: true,
      rateLimit: 30 // Higher for analyst
    },
    {
      name: 'General Discussion',
      description: 'Chat about anything related to markets and trading',
      type: 'general',
      icon: '💬',
      isReadOnly: false,
      rateLimit: 10
    },
    {
      name: "Today's Calls",
      description: 'Discuss current trading calls and strategies',
      type: 'trading',
      icon: '📊',
      isReadOnly: false,
      rateLimit: 10
    },
    {
      name: 'Trade Ideas',
      description: 'Share and discuss trade ideas with the community',
      type: 'ideas',
      icon: '🎯',
      isReadOnly: false,
      rateLimit: 10
    }
  ];

  try {
    await client.query('BEGIN');

    const createdChannels = [];

    for (const channel of defaultChannels) {
      const queryText = `
        INSERT INTO chat_channels (
          analyst_id,
          channel_name,
          channel_description,
          channel_type,
          icon,
          is_read_only,
          message_rate_limit,
          require_subscription,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE)
        RETURNING *
      `;

      const values = [
        analystId,
        channel.name,
        channel.description,
        channel.type,
        channel.icon,
        channel.isReadOnly,
        channel.rateLimit
      ];

      const result = await client.query(queryText, values);
      createdChannels.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return createdChannels;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating default channels:', error);
    throw new AppError('Failed to create default channels', 500);
  } finally {
    client.release();
  }
};

module.exports = {
  createChannel,
  getAnalystChannels,
  getChannelById,
  updateChannel,
  deleteChannel,
  checkUserAccess,
  updateChannelStats,
  updateActiveMembersCount,
  getChannelMembers,
  createDefaultChannels
};
