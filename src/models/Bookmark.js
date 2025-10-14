/**
 * Bookmark Model
 *
 * Database operations for bookmarks table
 * Handles user bookmarks for saving important posts/calls
 *
 * FEATURES:
 * - Bookmark/unbookmark posts
 * - Get user's bookmarked posts
 * - Check if post is bookmarked
 * - Optional user notes for bookmarks
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create bookmark (user saves a post)
 *
 * @param {string} userId - User UUID
 * @param {string} postId - Post UUID
 * @param {string} notes - Optional user notes
 * @returns {Promise<Object>} - Created bookmark
 */
const createBookmark = async (userId, postId, notes = null) => {
  try {
    // Check if already bookmarked
    const existingBookmark = await query(
      `SELECT id FROM bookmarks
       WHERE user_id = $1 AND post_id = $2`,
      [userId, postId]
    );

    if (existingBookmark.rows.length > 0) {
      throw new AppError('Post already bookmarked', 409);
    }

    // Check if post exists
    const postCheck = await query(
      `SELECT id FROM posts WHERE id = $1 AND deleted_at IS NULL`,
      [postId]
    );

    if (postCheck.rows.length === 0) {
      throw new AppError('Post not found', 404);
    }

    // Create bookmark
    const result = await query(
      `INSERT INTO bookmarks (user_id, post_id, notes, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING
         id,
         user_id,
         post_id,
         notes,
         created_at`,
      [userId, postId, notes]
    );

    // Increment bookmark count on post
    await query(
      `UPDATE posts
       SET bookmarks_count = bookmarks_count + 1
       WHERE id = $1`,
      [postId]
    );

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating bookmark:', error);
    throw new AppError('Failed to bookmark post', 500);
  }
};

/**
 * Remove bookmark
 *
 * @param {string} userId - User UUID
 * @param {string} postId - Post UUID
 * @returns {Promise<void>}
 */
const removeBookmark = async (userId, postId) => {
  try {
    const result = await query(
      `DELETE FROM bookmarks
       WHERE user_id = $1 AND post_id = $2
       RETURNING id`,
      [userId, postId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Bookmark not found', 404);
    }

    // Decrement bookmark count on post
    await query(
      `UPDATE posts
       SET bookmarks_count = GREATEST(bookmarks_count - 1, 0)
       WHERE id = $1`,
      [postId]
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error removing bookmark:', error);
    throw new AppError('Failed to remove bookmark', 500);
  }
};

/**
 * Get user's bookmarked posts
 *
 * @param {string} userId - User UUID
 * @param {Object} options - { page, limit }
 * @returns {Promise<Object>} - { bookmarks: Array, total: number, page: number, limit: number }
 */
const getUserBookmarks = async (userId, options = {}) => {
  try {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM bookmarks b
       INNER JOIN posts p ON b.post_id = p.id
       WHERE b.user_id = $1 AND p.deleted_at IS NULL`,
      [userId]
    );

    const total = parseInt(countResult.rows[0].total);

    // Get bookmarks with post details
    const result = await query(
      `SELECT
        b.id as bookmark_id,
        b.notes,
        b.created_at as bookmarked_at,
        p.id as post_id,
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
        p.views_count,
        p.bookmarks_count,
        p.comments_count,
        p.created_at as post_created_at,
        u.full_name as analyst_name,
        ap.profile_photo as analyst_photo,
        ap.sebi_registration_number
      FROM bookmarks b
      INNER JOIN posts p ON b.post_id = p.id
      INNER JOIN users u ON p.analyst_id = u.id
      LEFT JOIN analyst_profiles ap ON u.id = ap.user_id
      WHERE b.user_id = $1 AND p.deleted_at IS NULL
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Parse content_formatted for each bookmark
    const bookmarks = result.rows.map(bookmark => {
      if (bookmark.content_formatted && typeof bookmark.content_formatted === 'string') {
        bookmark.content_formatted = JSON.parse(bookmark.content_formatted);
      }
      return bookmark;
    });

    return {
      bookmarks,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      hasMore: offset + bookmarks.length < total
    };
  } catch (error) {
    console.error('Error getting user bookmarks:', error);
    throw new AppError('Failed to fetch bookmarks', 500);
  }
};

/**
 * Check if user has bookmarked a post
 *
 * @param {string} userId - User UUID
 * @param {string} postId - Post UUID
 * @returns {Promise<boolean>} - True if bookmarked
 */
const isPostBookmarked = async (userId, postId) => {
  try {
    const result = await query(
      `SELECT 1 FROM bookmarks
       WHERE user_id = $1 AND post_id = $2
       LIMIT 1`,
      [userId, postId]
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking bookmark status:', error);
    return false; // Return false on error (non-critical)
  }
};

/**
 * Update bookmark notes
 *
 * @param {string} userId - User UUID
 * @param {string} postId - Post UUID
 * @param {string} notes - New notes
 * @returns {Promise<Object>} - Updated bookmark
 */
const updateBookmarkNotes = async (userId, postId, notes) => {
  try {
    const result = await query(
      `UPDATE bookmarks
       SET notes = $1
       WHERE user_id = $2 AND post_id = $3
       RETURNING
         id,
         user_id,
         post_id,
         notes,
         created_at`,
      [notes, userId, postId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Bookmark not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating bookmark notes:', error);
    throw new AppError('Failed to update bookmark', 500);
  }
};

/**
 * Get bookmark count for user
 *
 * @param {string} userId - User UUID
 * @returns {Promise<number>} - Bookmark count
 */
const getUserBookmarkCount = async (userId) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM bookmarks b
       INNER JOIN posts p ON b.post_id = p.id
       WHERE b.user_id = $1 AND p.deleted_at IS NULL`,
      [userId]
    );

    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting bookmark count:', error);
    return 0;
  }
};

/**
 * Get most bookmarked posts (trending posts)
 *
 * @param {Object} options - { limit, days }
 * @returns {Promise<Array>} - Array of trending posts
 */
const getTrendingPosts = async (options = {}) => {
  try {
    const { limit = 10, days = 7 } = options;

    const result = await query(
      `SELECT
        p.id,
        p.analyst_id,
        p.title,
        p.stock_symbol,
        p.action,
        p.strategy_type,
        p.bookmarks_count,
        p.views_count,
        p.created_at,
        u.full_name as analyst_name,
        ap.profile_photo as analyst_photo,
        COALESCE(
          (p.bookmarks_count::float / NULLIF(p.views_count, 0)) * 100,
          0
        ) as bookmark_rate
      FROM posts p
      INNER JOIN users u ON p.analyst_id = u.id
      LEFT JOIN analyst_profiles ap ON u.id = ap.user_id
      WHERE p.deleted_at IS NULL
      AND p.created_at >= NOW() - INTERVAL '${days} days'
      ORDER BY p.bookmarks_count DESC, p.views_count DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting trending posts:', error);
    throw new AppError('Failed to fetch trending posts', 500);
  }
};

/**
 * Delete all bookmarks for a post (used when post is deleted)
 *
 * @param {string} postId - Post UUID
 * @returns {Promise<number>} - Number of bookmarks deleted
 */
const deletePostBookmarks = async (postId) => {
  try {
    const result = await query(
      `DELETE FROM bookmarks
       WHERE post_id = $1
       RETURNING id`,
      [postId]
    );

    return result.rows.length;
  } catch (error) {
    console.error('Error deleting post bookmarks:', error);
    return 0;
  }
};

module.exports = {
  createBookmark,
  removeBookmark,
  getUserBookmarks,
  isPostBookmarked,
  updateBookmarkNotes,
  getUserBookmarkCount,
  getTrendingPosts,
  deletePostBookmarks
};
