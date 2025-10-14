/**
 * Post Model
 *
 * Database operations for posts table
 * Handles analyst stock market calls, market updates, and content creation
 *
 * CRITICAL FEATURES:
 * - AI-formatted structured content (JSONB)
 * - Access control based on subscription tier (free/paid/both)
 * - Feed queries with filters (date, urgency, strategy, analyst)
 * - Post analytics (views, bookmarks, comments)
 * - Call outcome tracking for performance metrics
 * - Soft delete support
 */

const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create new post
 *
 * @param {Object} postData - Post data
 * @returns {Promise<Object>} - Created post
 */
const createPost = async (postData) => {
  try {
    const {
      analyst_id,
      title,
      content,
      content_formatted,
      post_type = 'call',
      strategy_type,
      audience = 'paid',
      stock_symbol,
      action,
      entry_price,
      target_price,
      stop_loss,
      risk_reward_ratio,
      confidence_level,
      is_urgent = false,
      is_pinned = false
    } = postData;

    // Validate required fields
    if (!analyst_id || !content) {
      throw new AppError('Analyst ID and content are required', 400);
    }

    // For call type, validate required fields
    if (post_type === 'call') {
      if (!stock_symbol || !action || !entry_price) {
        throw new AppError('Stock symbol, action, and entry price are required for calls', 400);
      }
    }

    const result = await query(
      `INSERT INTO posts (
        analyst_id,
        title,
        content,
        content_formatted,
        post_type,
        strategy_type,
        audience,
        stock_symbol,
        action,
        entry_price,
        target_price,
        stop_loss,
        risk_reward_ratio,
        confidence_level,
        is_urgent,
        is_pinned,
        call_status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      RETURNING
        id,
        analyst_id,
        title,
        content,
        content_formatted,
        post_type,
        strategy_type,
        audience,
        stock_symbol,
        action,
        entry_price,
        target_price,
        stop_loss,
        risk_reward_ratio,
        confidence_level,
        call_status,
        is_urgent,
        is_pinned,
        views_count,
        bookmarks_count,
        comments_count,
        created_at,
        updated_at`,
      [
        analyst_id,
        title || null,
        content,
        content_formatted ? JSON.stringify(content_formatted) : null,
        post_type,
        strategy_type || null,
        audience,
        stock_symbol || null,
        action || null,
        entry_price || null,
        target_price || null,
        stop_loss || null,
        risk_reward_ratio || null,
        confidence_level || null,
        is_urgent,
        is_pinned,
        post_type === 'call' ? 'open' : null
      ]
    );

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating post:', error);
    throw new AppError('Failed to create post', 500);
  }
};

/**
 * Find post by ID with analyst details
 *
 * @param {string} postId - Post UUID
 * @param {string} userId - Current user ID (optional, for access check)
 * @returns {Promise<Object|null>} - Post object or null
 */
const findPostById = async (postId, userId = null) => {
  try {
    const result = await query(
      `SELECT
        p.*,
        ap.display_name as analyst_name,
        u.email as analyst_email,
        ap.photo_url as analyst_photo,
        ap.sebi_number as sebi_registration_number,
        ap.bio as analyst_bio,
        ${userId ? `
          EXISTS(
            SELECT 1 FROM bookmarks b
            WHERE b.post_id = p.id AND b.user_id = $2
          ) as is_bookmarked
        ` : 'false as is_bookmarked'}
      FROM posts p
      INNER JOIN users u ON p.analyst_id = u.id
      LEFT JOIN analyst_profiles ap ON u.id = ap.user_id
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
      userId ? [postId, userId] : [postId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Parse content_formatted if it's a string
    const post = result.rows[0];
    if (post.content_formatted && typeof post.content_formatted === 'string') {
      post.content_formatted = JSON.parse(post.content_formatted);
    }

    return post;
  } catch (error) {
    console.error('Error finding post by ID:', error);
    throw new AppError('Failed to fetch post', 500);
  }
};

/**
 * Get user's personalized feed with filters
 *
 * @param {string} userId - User ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} - { posts: Array, total: number, page: number, limit: number }
 */
const getFeedForUser = async (userId, filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      date_filter = 'all', // all, today, this_week, this_month
      urgency_filter = 'all', // all, urgent_only
      strategy_filter = 'all', // all, intraday, swing, positional, long_term, options
      analyst_id = null
    } = filters;

    const offset = (page - 1) * limit;

    // Build WHERE clause based on filters
    let whereConditions = ['p.deleted_at IS NULL'];
    let params = [userId, limit, offset];
    let paramCount = 3;

    // Filter: User must be subscribed to the analyst OR post is free/both
    whereConditions.push(`(
      EXISTS(
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = $1
        AND s.analyst_id = p.analyst_id
        AND s.status = 'active'
        AND s.expires_at > NOW()
        AND s.deleted_at IS NULL
      )
      OR p.audience IN ('free', 'both')
    )`);

    // Filter: Date
    if (date_filter === 'today') {
      whereConditions.push(`p.created_at >= CURRENT_DATE`);
    } else if (date_filter === 'this_week') {
      whereConditions.push(`p.created_at >= DATE_TRUNC('week', CURRENT_DATE)`);
    } else if (date_filter === 'this_month') {
      whereConditions.push(`p.created_at >= DATE_TRUNC('month', CURRENT_DATE)`);
    }

    // Filter: Urgency
    if (urgency_filter === 'urgent_only') {
      whereConditions.push(`p.is_urgent = true`);
    }

    // Filter: Strategy type
    if (strategy_filter !== 'all') {
      paramCount++;
      params.push(strategy_filter);
      whereConditions.push(`p.strategy_type = $${paramCount}`);
    }

    // Filter: Specific analyst
    if (analyst_id) {
      paramCount++;
      params.push(analyst_id);
      whereConditions.push(`p.analyst_id = $${paramCount}`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM posts p
       WHERE ${whereClause}`,
      params.slice(0, paramCount)
    );

    const total = parseInt(countResult.rows[0].total);

    // Get posts
    const result = await query(
      `SELECT
        p.id,
        p.analyst_id,
        p.title,
        p.content,
        p.content_formatted,
        p.post_type,
        p.strategy_type,
        p.audience,
        p.stock_symbol,
        p.action,
        p.entry_price,
        p.target_price,
        p.stop_loss,
        p.risk_reward_ratio,
        p.confidence_level,
        p.call_status,
        p.is_urgent,
        p.is_pinned,
        p.views_count,
        p.bookmarks_count,
        p.comments_count,
        p.created_at,
        p.updated_at,
        ap.display_name as analyst_name,
        ap.photo_url as analyst_photo,
        ap.sebi_number as sebi_registration_number,
        EXISTS(
          SELECT 1 FROM bookmarks b
          WHERE b.post_id = p.id AND b.user_id = $1
        ) as is_bookmarked,
        EXISTS(
          SELECT 1 FROM subscriptions s
          WHERE s.user_id = $1
          AND s.analyst_id = p.analyst_id
          AND s.status = 'active'
          AND s.expires_at > NOW()
          AND s.deleted_at IS NULL
        ) as has_subscription
      FROM posts p
      INNER JOIN users u ON p.analyst_id = u.id
      LEFT JOIN analyst_profiles ap ON u.id = ap.user_id
      WHERE ${whereClause}
      ORDER BY
        p.is_urgent DESC,
        p.is_pinned DESC,
        p.created_at DESC
      LIMIT $2 OFFSET $3`,
      params
    );

    // Parse content_formatted for each post
    const posts = result.rows.map(post => {
      if (post.content_formatted && typeof post.content_formatted === 'string') {
        post.content_formatted = JSON.parse(post.content_formatted);
      }
      return post;
    });

    return {
      posts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      hasMore: offset + posts.length < total
    };
  } catch (error) {
    console.error('Error getting user feed:', error);
    throw new AppError('Failed to fetch feed', 500);
  }
};

/**
 * Get analyst's posts (public sample or full for subscribers)
 *
 * @param {string} analystId - Analyst UUID
 * @param {string} userId - Current user ID (optional)
 * @param {Object} options - { page, limit, sampleOnly }
 * @returns {Promise<Object>} - { posts: Array, total: number, page: number, limit: number }
 */
const getAnalystPosts = async (analystId, userId = null, options = {}) => {
  try {
    const { page = 1, limit = 20, sampleOnly = false } = options;
    const offset = (page - 1) * limit;

    // Check if user has active subscription
    let hasSubscription = false;
    if (userId) {
      const subCheck = await query(
        `SELECT 1 FROM subscriptions
         WHERE user_id = $1
         AND analyst_id = $2
         AND status = 'active'
         AND expires_at > NOW()
         AND deleted_at IS NULL
         LIMIT 1`,
        [userId, analystId]
      );
      hasSubscription = subCheck.rows.length > 0;
    }

    let whereClause = 'p.analyst_id = $1 AND p.deleted_at IS NULL';
    let params = [analystId];

    // If no subscription, only show free/both posts
    if (!hasSubscription) {
      whereClause += ` AND p.audience IN ('free', 'both')`;

      // If sampleOnly, limit to 3 most recent posts
      if (sampleOnly) {
        params.push(3);
        params.push(0);
      } else {
        params.push(limit);
        params.push(offset);
      }
    } else {
      params.push(limit);
      params.push(offset);
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM posts p
       WHERE ${whereClause.split(' LIMIT')[0].split(' OFFSET')[0]}`,
      [analystId]
    );

    const total = parseInt(countResult.rows[0].total);

    // Get posts
    const result = await query(
      `SELECT
        p.*,
        ${userId ? `
          EXISTS(
            SELECT 1 FROM bookmarks b
            WHERE b.post_id = p.id AND b.user_id = $${params.length + 1}
          ) as is_bookmarked
        ` : 'false as is_bookmarked'}
      FROM posts p
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      userId ? [...params, userId] : params
    );

    // Parse content_formatted for each post
    const posts = result.rows.map(post => {
      if (post.content_formatted && typeof post.content_formatted === 'string') {
        post.content_formatted = JSON.parse(post.content_formatted);
      }
      return post;
    });

    return {
      posts,
      total,
      page: parseInt(page),
      limit: sampleOnly ? 3 : parseInt(limit),
      totalPages: Math.ceil(total / (sampleOnly ? 3 : limit)),
      hasSubscription
    };
  } catch (error) {
    console.error('Error getting analyst posts:', error);
    throw new AppError('Failed to fetch analyst posts', 500);
  }
};

/**
 * Update post
 *
 * @param {string} postId - Post UUID
 * @param {string} analystId - Analyst UUID (for ownership verification)
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated post
 */
const updatePost = async (postId, analystId, updates) => {
  try {
    const allowedFields = [
      'title',
      'content',
      'content_formatted',
      'strategy_type',
      'audience',
      'stock_symbol',
      'action',
      'entry_price',
      'target_price',
      'stop_loss',
      'risk_reward_ratio',
      'confidence_level',
      'is_urgent',
      'is_pinned'
    ];

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(
          key === 'content_formatted' && updates[key]
            ? JSON.stringify(updates[key])
            : updates[key]
        );
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    // Add updated_at
    fields.push(`updated_at = NOW()`);

    values.push(postId);
    values.push(analystId);

    const result = await query(
      `UPDATE posts
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       AND analyst_id = $${paramCount + 1}
       AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Post not found or you do not have permission to update it', 404);
    }

    // Parse content_formatted if it's a string
    const post = result.rows[0];
    if (post.content_formatted && typeof post.content_formatted === 'string') {
      post.content_formatted = JSON.parse(post.content_formatted);
    }

    return post;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating post:', error);
    throw new AppError('Failed to update post', 500);
  }
};

/**
 * Soft delete post
 *
 * @param {string} postId - Post UUID
 * @param {string} analystId - Analyst UUID (for ownership verification)
 * @returns {Promise<void>}
 */
const deletePost = async (postId, analystId) => {
  try {
    const result = await query(
      `UPDATE posts
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       AND analyst_id = $2
       AND deleted_at IS NULL
       RETURNING id`,
      [postId, analystId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Post not found or you do not have permission to delete it', 404);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting post:', error);
    throw new AppError('Failed to delete post', 500);
  }
};

/**
 * Increment post views
 *
 * @param {string} postId - Post UUID
 * @returns {Promise<void>}
 */
const incrementViews = async (postId) => {
  try {
    await query(
      `UPDATE posts
       SET views_count = views_count + 1
       WHERE id = $1`,
      [postId]
    );
  } catch (error) {
    console.error('Error incrementing views:', error);
    // Don't throw error, just log it (non-critical operation)
  }
};

/**
 * Mark call outcome (analyst only)
 *
 * @param {string} postId - Post UUID
 * @param {string} analystId - Analyst UUID (for ownership verification)
 * @param {Object} outcomeData - { call_status, actual_exit_price, actual_profit_percent }
 * @returns {Promise<Object>} - Updated post
 */
const markCallOutcome = async (postId, analystId, outcomeData) => {
  try {
    const {
      call_status,
      actual_exit_price = null,
      actual_profit_percent = null
    } = outcomeData;

    if (!call_status) {
      throw new AppError('Call status is required', 400);
    }

    const validStatuses = ['open', 'target_hit', 'stop_loss_hit', 'closed', 'expired'];
    if (!validStatuses.includes(call_status)) {
      throw new AppError('Invalid call status', 400);
    }

    const result = await query(
      `UPDATE posts
       SET call_status = $1,
           actual_exit_price = $2,
           actual_profit_percent = $3,
           closed_at = CASE WHEN $1 != 'open' THEN NOW() ELSE closed_at END,
           updated_at = NOW()
       WHERE id = $4
       AND analyst_id = $5
       AND post_type = 'call'
       AND deleted_at IS NULL
       RETURNING *`,
      [call_status, actual_exit_price, actual_profit_percent, postId, analystId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Post not found or you do not have permission to update it', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error marking call outcome:', error);
    throw new AppError('Failed to mark call outcome', 500);
  }
};

/**
 * Get post analytics (analyst only)
 *
 * @param {string} postId - Post UUID
 * @param {string} analystId - Analyst UUID (for ownership verification)
 * @returns {Promise<Object>} - Analytics data
 */
const getPostAnalytics = async (postId, analystId) => {
  try {
    const result = await query(
      `SELECT
        p.id,
        p.stock_symbol,
        p.action,
        p.post_type,
        p.strategy_type,
        p.views_count,
        p.bookmarks_count,
        p.comments_count,
        p.call_status,
        p.actual_profit_percent,
        p.created_at,
        p.closed_at,
        COALESCE(
          (p.views_count::float / NULLIF((
            SELECT SUM(views_count)
            FROM posts
            WHERE analyst_id = p.analyst_id
            AND deleted_at IS NULL
          ), 0)) * 100,
          0
        ) as views_percentage,
        COALESCE(
          (p.bookmarks_count::float / NULLIF(p.views_count, 0)) * 100,
          0
        ) as bookmark_rate
      FROM posts p
      WHERE p.id = $1
      AND p.analyst_id = $2
      AND p.deleted_at IS NULL`,
      [postId, analystId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Post not found or you do not have permission to view analytics', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error getting post analytics:', error);
    throw new AppError('Failed to fetch post analytics', 500);
  }
};

/**
 * Check if user has access to view post
 *
 * @param {string} postId - Post UUID
 * @param {string} userId - User UUID
 * @returns {Promise<Object>} - { hasAccess: boolean, reason: string, post: Object }
 */
const checkPostAccess = async (postId, userId) => {
  try {
    const result = await query(
      `SELECT
        p.*,
        EXISTS(
          SELECT 1 FROM subscriptions s
          WHERE s.user_id = $2
          AND s.analyst_id = p.analyst_id
          AND s.status = 'active'
          AND s.expires_at > NOW()
          AND s.deleted_at IS NULL
        ) as has_subscription
      FROM posts p
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [postId, userId]
    );

    if (result.rows.length === 0) {
      return {
        hasAccess: false,
        reason: 'Post not found',
        post: null
      };
    }

    const post = result.rows[0];

    // Parse content_formatted if it's a string
    if (post.content_formatted && typeof post.content_formatted === 'string') {
      post.content_formatted = JSON.parse(post.content_formatted);
    }

    // Check access based on audience and subscription
    if (post.audience === 'free' || post.audience === 'both') {
      return {
        hasAccess: true,
        reason: 'Free or public post',
        post,
        showFullContent: true
      };
    }

    if (post.audience === 'paid' && post.has_subscription) {
      return {
        hasAccess: true,
        reason: 'Active subscription',
        post,
        showFullContent: true
      };
    }

    // User can see post teaser but not full content
    return {
      hasAccess: true,
      reason: 'Subscription required for full access',
      post: {
        ...post,
        content: post.content.substring(0, 100) + '...',
        content_formatted: null,
        entry_price: null,
        target_price: null,
        stop_loss: null
      },
      showFullContent: false,
      requiresSubscription: true
    };
  } catch (error) {
    console.error('Error checking post access:', error);
    throw new AppError('Failed to check post access', 500);
  }
};

/**
 * Get posts by stock symbol
 *
 * @param {string} stockSymbol - Stock symbol (e.g., 'NIFTY', 'RELIANCE')
 * @param {Object} options - { page, limit }
 * @returns {Promise<Object>} - { posts: Array, total: number }
 */
const getPostsByStock = async (stockSymbol, options = {}) => {
  try {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM posts
       WHERE stock_symbol = $1 AND deleted_at IS NULL`,
      [stockSymbol.toUpperCase()]
    );

    const total = parseInt(countResult.rows[0].total);

    const result = await query(
      `SELECT
        p.*,
        ap.display_name as analyst_name,
        ap.photo_url as analyst_photo,
        ap.avg_rating,
        ap.sebi_number
      FROM posts p
      INNER JOIN users u ON p.analyst_id = u.id
      LEFT JOIN analyst_profiles ap ON u.id = ap.user_id
      WHERE p.stock_symbol = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3`,
      [stockSymbol.toUpperCase(), limit, offset]
    );

    const posts = result.rows.map(post => {
      if (post.content_formatted && typeof post.content_formatted === 'string') {
        post.content_formatted = JSON.parse(post.content_formatted);
      }
      return post;
    });

    return {
      posts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting posts by stock:', error);
    throw new AppError('Failed to fetch posts', 500);
  }
};

/**
 * Get all posts with filters
 * @param {Object} filters - Filter criteria
 * @param {string} userId - Current user ID (optional)
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Posts with pagination
 */
const getAllPosts = async (filters = {}, userId = null, options = {}) => {
  try {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    // Build WHERE clause dynamically
    const conditions = ['p.deleted_at IS NULL'];
    const params = [];
    let paramIndex = 1;

    if (filters.analyst_id) {
      conditions.push(`p.analyst_id = $${paramIndex}`);
      params.push(filters.analyst_id);
      paramIndex++;
    }

    if (filters.strategy_type) {
      conditions.push(`p.strategy_type = $${paramIndex}`);
      params.push(filters.strategy_type);
      paramIndex++;
    }

    if (filters.stock_symbol) {
      conditions.push(`p.stock_symbol = $${paramIndex}`);
      params.push(filters.stock_symbol.toUpperCase());
      paramIndex++;
    }

    if (filters.audience) {
      conditions.push(`p.audience = $${paramIndex}`);
      params.push(filters.audience);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Determine sort order
    let orderClause = 'p.created_at DESC'; // Default: recent
    if (filters.sort === 'popular') {
      orderClause = 'p.views_count DESC, p.created_at DESC';
    } else if (filters.sort === 'trending') {
      orderClause = 'p.likes_count DESC, p.created_at DESC';
    }

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM posts p
       WHERE ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get posts
    const result = await query(
      `SELECT
        p.*,
        ap.display_name as analyst_name,
        ap.photo_url as analyst_photo,
        ap.avg_rating,
        ap.sebi_number,
        u.email
      FROM posts p
      INNER JOIN users u ON p.analyst_id = u.id
      LEFT JOIN analyst_profiles ap ON u.id = ap.user_id
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const posts = result.rows.map(post => {
      if (post.content_formatted && typeof post.content_formatted === 'string') {
        post.content_formatted = JSON.parse(post.content_formatted);
      }
      return post;
    });

    return {
      posts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting all posts:', error);
    throw new AppError('Failed to fetch posts', 500);
  }
};

module.exports = {
  createPost,
  findPostById,
  getFeedForUser,
  getAnalystPosts,
  updatePost,
  deletePost,
  incrementViews,
  markCallOutcome,
  getPostAnalytics,
  checkPostAccess,
  getPostsByStock,
  getAllPosts
};
