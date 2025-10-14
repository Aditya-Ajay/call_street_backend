/**
 * GetStream.io Chat Integration Service
 *
 * Handles all Stream Chat operations including:
 * - User token generation
 * - Channel creation and management
 * - Member management (add/remove)
 * - Subscription verification
 *
 * SECURITY:
 * - All tokens are generated server-side
 * - Subscription status is verified before channel access
 * - API credentials are stored in environment variables
 *
 * RATE LIMITING:
 * - Stream.io has API rate limits
 * - Implement client-side rate limiting to avoid hitting limits
 *
 * ERROR HANDLING:
 * - All external API calls are wrapped in try-catch
 * - Fallback strategies for common failures
 * - Timeouts set to 5 seconds max
 */

const { StreamChat } = require('stream-chat');
const config = require('../config/env');
const { pool } = require('../config/database');

// Initialize Stream Chat client (singleton)
let streamClient = null;

/**
 * Get or create Stream Chat client instance
 * @returns {StreamChat} Stream Chat client
 */
const getStreamClient = () => {
  if (!streamClient) {
    try {
      const apiKey = process.env.STREAM_API_KEY;
      const apiSecret = process.env.STREAM_API_SECRET;

      if (!apiKey || !apiSecret) {
        throw new Error('Stream API credentials not configured. Please set STREAM_API_KEY and STREAM_API_SECRET in .env');
      }

      streamClient = StreamChat.getInstance(apiKey, apiSecret, {
        timeout: 5000 // 5 second timeout
      });

      console.log('[Stream] Client initialized successfully');
    } catch (error) {
      console.error('[Stream] Failed to initialize client:', error.message);
      throw error;
    }
  }

  return streamClient;
};

/**
 * Generate Stream Chat token for a user
 * Tokens are used by frontend to authenticate with Stream
 *
 * @param {number} userId - User ID
 * @param {string} userName - User name
 * @param {string} userRole - User role (analyst/trader)
 * @returns {Promise<{ token: string, userId: string }>}
 */
const generateUserToken = async (userId, userName, userRole) => {
  try {
    const client = getStreamClient();

    // Create unique Stream user ID
    const streamUserId = `user_${userId}`;

    // Create or update user in Stream
    await client.upsertUser({
      id: streamUserId,
      name: userName,
      role: userRole,
      // Additional metadata
      platform_user_id: userId.toString(),
      user_type: userRole
    });

    // Generate token for this user
    const token = client.createToken(streamUserId);

    console.log(`[Stream] Token generated for user ${userId} (${userName})`);

    return {
      token,
      userId: streamUserId
    };
  } catch (error) {
    console.error('[Stream] Token generation failed:', error);
    throw new Error(`Failed to generate Stream token: ${error.message}`);
  }
};

/**
 * Create or get analyst community channel
 * Channel naming: analyst-{analystId}-community
 *
 * @param {number} analystId - Analyst user ID
 * @param {string} analystName - Analyst name
 * @returns {Promise<{ channelId: string, channelType: string }>}
 */
const createAnalystChannel = async (analystId, analystName) => {
  try {
    const client = getStreamClient();

    // Channel ID format: analyst-{analystId}-community
    const channelId = `analyst-${analystId}-community`;
    const channelType = 'messaging';

    // Create unique Stream user ID for analyst
    const streamUserId = `user_${analystId}`;

    // Create or update analyst user in Stream
    await client.upsertUser({
      id: streamUserId,
      name: analystName,
      role: 'analyst',
      platform_user_id: analystId.toString(),
      user_type: 'analyst'
    });

    // Create or get channel
    const channel = client.channel(channelType, channelId, {
      name: `${analystName}'s Community`,
      created_by_id: streamUserId,
      members: [streamUserId], // Analyst is always a member
      // Channel metadata
      analyst_id: analystId.toString(),
      channel_type: 'community',
      // Permissions
      permissions: {
        // Only analyst and moderators can update channel
        'update-channel': ['analyst', 'admin'],
        // Only analyst and moderators can delete messages
        'delete-message': ['analyst', 'admin'],
        // All members can send messages
        'send-message': ['analyst', 'trader', 'admin']
      }
    });

    await channel.create();

    console.log(`[Stream] Channel created/retrieved: ${channelId} for analyst ${analystId}`);

    return {
      channelId,
      channelType,
      channelCid: channel.cid // Channel CID (type:id format)
    };
  } catch (error) {
    console.error('[Stream] Channel creation failed:', error);
    throw new Error(`Failed to create analyst channel: ${error.message}`);
  }
};

/**
 * Verify if user has active subscription to analyst
 *
 * @param {number} traderId - Trader user ID
 * @param {number} analystId - Analyst user ID
 * @returns {Promise<boolean>}
 */
const verifySubscription = async (traderId, analystId) => {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM subscriptions
      WHERE trader_id = $1
        AND analyst_id = $2
        AND status = 'active'
        AND expires_at > NOW()
    `;

    const result = await pool.query(query, [traderId, analystId]);
    const hasSubscription = result.rows[0].count > 0;

    console.log(`[Stream] Subscription check: Trader ${traderId} -> Analyst ${analystId} = ${hasSubscription}`);

    return hasSubscription;
  } catch (error) {
    console.error('[Stream] Subscription verification failed:', error);
    throw new Error(`Failed to verify subscription: ${error.message}`);
  }
};

/**
 * Add subscriber to analyst community channel
 * Verifies subscription status before adding
 *
 * @param {string} channelId - Channel ID (e.g., analyst-123-community)
 * @param {number} traderId - Trader user ID
 * @param {string} traderName - Trader name
 * @param {number} analystId - Analyst user ID
 * @returns {Promise<{ success: boolean }>}
 */
const addMemberToChannel = async (channelId, traderId, traderName, analystId) => {
  try {
    // Verify subscription first
    const hasSubscription = await verifySubscription(traderId, analystId);

    if (!hasSubscription) {
      throw new Error('Active subscription required to join community channel');
    }

    const client = getStreamClient();

    // Create unique Stream user ID for trader
    const streamUserId = `user_${traderId}`;

    // Create or update trader user in Stream
    await client.upsertUser({
      id: streamUserId,
      name: traderName,
      role: 'trader',
      platform_user_id: traderId.toString(),
      user_type: 'trader'
    });

    // Get channel
    const channel = client.channel('messaging', channelId);

    // Add member to channel
    await channel.addMembers([streamUserId]);

    console.log(`[Stream] Member added: ${streamUserId} to channel ${channelId}`);

    return { success: true };
  } catch (error) {
    console.error('[Stream] Add member failed:', error);
    throw new Error(`Failed to add member to channel: ${error.message}`);
  }
};

/**
 * Remove subscriber from analyst community channel
 * Used when subscription expires or is cancelled
 *
 * @param {string} channelId - Channel ID (e.g., analyst-123-community)
 * @param {number} traderId - Trader user ID
 * @returns {Promise<{ success: boolean }>}
 */
const removeMemberFromChannel = async (channelId, traderId) => {
  try {
    const client = getStreamClient();

    // Create unique Stream user ID for trader
    const streamUserId = `user_${traderId}`;

    // Get channel
    const channel = client.channel('messaging', channelId);

    // Remove member from channel
    await channel.removeMembers([streamUserId]);

    console.log(`[Stream] Member removed: ${streamUserId} from channel ${channelId}`);

    return { success: true };
  } catch (error) {
    console.error('[Stream] Remove member failed:', error);
    throw new Error(`Failed to remove member from channel: ${error.message}`);
  }
};

/**
 * Get channel members list with online status
 *
 * @param {string} channelId - Channel ID
 * @returns {Promise<Array>}
 */
const getChannelMembers = async (channelId) => {
  try {
    const client = getStreamClient();

    // Get channel
    const channel = client.channel('messaging', channelId);

    // Query channel state with members
    const state = await channel.query({
      members: { limit: 100 },
      watchers: { limit: 100 }
    });

    // Extract member information
    const members = state.members.map(member => ({
      userId: member.user_id,
      name: member.user.name,
      role: member.user.role,
      online: member.user.online || false,
      lastActive: member.user.last_active
    }));

    console.log(`[Stream] Retrieved ${members.length} members from channel ${channelId}`);

    return members;
  } catch (error) {
    console.error('[Stream] Get members failed:', error);
    throw new Error(`Failed to get channel members: ${error.message}`);
  }
};

/**
 * Delete analyst channel (cleanup)
 * Should only be called when analyst account is deleted
 *
 * @param {string} channelId - Channel ID
 * @returns {Promise<{ success: boolean }>}
 */
const deleteChannel = async (channelId) => {
  try {
    const client = getStreamClient();

    // Get channel
    const channel = client.channel('messaging', channelId);

    // Delete channel
    await channel.delete();

    console.log(`[Stream] Channel deleted: ${channelId}`);

    return { success: true };
  } catch (error) {
    console.error('[Stream] Delete channel failed:', error);
    throw new Error(`Failed to delete channel: ${error.message}`);
  }
};

/**
 * Health check for Stream Chat service
 * Tests connection to Stream API
 *
 * @returns {Promise<{ status: string, message: string }>}
 */
const healthCheck = async () => {
  try {
    const client = getStreamClient();

    // Simple API call to verify connection
    await client.getAppSettings();

    return {
      status: 'healthy',
      message: 'Stream Chat service is operational'
    };
  } catch (error) {
    console.error('[Stream] Health check failed:', error);
    return {
      status: 'unhealthy',
      message: `Stream Chat service error: ${error.message}`
    };
  }
};

module.exports = {
  getStreamClient,
  generateUserToken,
  createAnalystChannel,
  addMemberToChannel,
  removeMemberFromChannel,
  getChannelMembers,
  deleteChannel,
  verifySubscription,
  healthCheck
};
