/**
 * Review Model
 *
 * Database operations for reviews and ratings
 * Handles CRUD operations, helpfulness voting, analyst responses, and rating calculations
 */

const { pool, query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create a new review
 * @param {Object} reviewData - Review data
 * @returns {Promise<Object>} - Created review
 */
const createReview = async (reviewData) => {
  const {
    userId,
    analystId,
    rating,
    reviewTitle,
    reviewText,
    isVerifiedSubscriber,
    subscriptionDurationDays,
    isAnonymous = false
  } = reviewData;

  try {
    const result = await query(
      `INSERT INTO reviews (
        user_id,
        analyst_id,
        rating,
        review_title,
        review_text,
        is_verified_subscriber,
        subscription_duration_days,
        is_anonymous,
        is_approved,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *`,
      [
        userId,
        analystId,
        rating,
        reviewTitle || null,
        reviewText || null,
        isVerifiedSubscriber,
        subscriptionDurationDays,
        isAnonymous,
        true // Auto-approve (can be changed for moderation workflow)
      ]
    );

    return result.rows[0];
  } catch (error) {
    // Handle duplicate review (one review per user per analyst)
    if (error.code === '23505' && error.constraint === 'unique_user_analyst_review') {
      throw new AppError('You have already reviewed this analyst. Please edit your existing review.', 409);
    }
    // Handle self-review
    if (error.code === '23514' && error.constraint === 'check_user_not_analyst') {
      throw new AppError('You cannot review yourself', 400);
    }
    throw error;
  }
};

/**
 * Find review by ID
 * @param {string} reviewId - Review UUID
 * @returns {Promise<Object|null>} - Review object or null
 */
const findById = async (reviewId) => {
  try {
    const result = await query(
      `SELECT
        r.*,
        u.full_name as reviewer_name,
        u.profile_photo as reviewer_photo,
        a.full_name as analyst_name
      FROM reviews r
      INNER JOIN users u ON r.user_id = u.id
      INNER JOIN users a ON r.analyst_id = a.id
      WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [reviewId]
    );

    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Find all reviews for an analyst with pagination and sorting
 * @param {string} analystId - Analyst UUID
 * @param {Object} options - Query options (sortBy, limit, offset)
 * @returns {Promise<Object>} - Reviews array and metadata
 */
const findByAnalystId = async (analystId, options = {}) => {
  const {
    sortBy = 'helpfulness', // helpfulness, recent, highest, lowest
    limit = 20,
    offset = 0,
    includeUnapproved = false
  } = options;

  try {
    // Determine sort order
    let orderClause;
    switch (sortBy) {
      case 'recent':
        orderClause = 'r.created_at DESC';
        break;
      case 'highest':
        orderClause = 'r.rating DESC, r.created_at DESC';
        break;
      case 'lowest':
        orderClause = 'r.rating ASC, r.created_at DESC';
        break;
      case 'helpfulness':
      default:
        orderClause = 'r.helpfulness_upvotes DESC, r.created_at DESC';
        break;
    }

    // Build query with approval filter
    const approvalFilter = includeUnapproved ? '' : 'AND r.is_approved = true';

    const result = await query(
      `SELECT
        r.id,
        r.user_id,
        CASE
          WHEN r.is_anonymous = true THEN 'Anonymous User'
          ELSE u.full_name
        END as reviewer_name,
        CASE
          WHEN r.is_anonymous = true THEN NULL
          ELSE u.profile_photo
        END as reviewer_photo,
        r.rating,
        r.review_title,
        r.review_text,
        r.is_verified_subscriber,
        r.subscription_duration_days,
        r.helpfulness_upvotes,
        r.helpfulness_downvotes,
        r.analyst_response,
        r.analyst_response_at,
        r.is_flagged,
        r.created_at,
        r.updated_at
      FROM reviews r
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.analyst_id = $1
        AND r.deleted_at IS NULL
        ${approvalFilter}
      ORDER BY ${orderClause}
      LIMIT $2 OFFSET $3`,
      [analystId, limit, offset]
    );

    // Get total count for pagination
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM reviews
       WHERE analyst_id = $1
         AND deleted_at IS NULL
         ${approvalFilter}`,
      [analystId]
    );

    return {
      reviews: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total, 10),
        limit,
        offset,
        hasMore: offset + result.rows.length < parseInt(countResult.rows[0].total, 10)
      }
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Find review by user and analyst (check if user already reviewed)
 * @param {string} userId - User UUID
 * @param {string} analystId - Analyst UUID
 * @returns {Promise<Object|null>} - Review object or null
 */
const findByUserAndAnalyst = async (userId, analystId) => {
  try {
    const result = await query(
      `SELECT * FROM reviews
       WHERE user_id = $1
         AND analyst_id = $2
         AND deleted_at IS NULL`,
      [userId, analystId]
    );

    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all reviews by a user
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} - Array of reviews
 */
const findByUserId = async (userId) => {
  try {
    const result = await query(
      `SELECT
        r.*,
        a.full_name as analyst_name,
        a.profile_photo as analyst_photo,
        a.sebi_registration_number
      FROM reviews r
      INNER JOIN users a ON r.analyst_id = a.id
      WHERE r.user_id = $1
        AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    throw error;
  }
};

/**
 * Update review
 * @param {string} reviewId - Review UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated review
 */
const updateReview = async (reviewId, updates) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const allowedFields = [
      'rating',
      'review_title',
      'review_text',
      'is_anonymous'
    ];

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    // Add updated_at
    fields.push(`updated_at = NOW()`);
    values.push(reviewId);

    const result = await client.query(
      `UPDATE reviews
       SET ${fields.join(', ')}
       WHERE id = $${paramCount} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Review not found', 404);
    }

    await client.query('COMMIT');
    return result.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Add or update analyst response to review
 * @param {string} reviewId - Review UUID
 * @param {string} response - Analyst response text
 * @returns {Promise<Object>} - Updated review
 */
const addAnalystResponse = async (reviewId, response) => {
  try {
    const result = await query(
      `UPDATE reviews
       SET analyst_response = $1,
           analyst_response_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [response, reviewId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Review not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Delete analyst response
 * @param {string} reviewId - Review UUID
 * @returns {Promise<Object>} - Updated review
 */
const deleteAnalystResponse = async (reviewId) => {
  try {
    const result = await query(
      `UPDATE reviews
       SET analyst_response = NULL,
           analyst_response_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [reviewId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Review not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Increment helpfulness upvotes
 * @param {string} reviewId - Review UUID
 * @returns {Promise<Object>} - Updated review
 */
const incrementHelpfulness = async (reviewId) => {
  try {
    const result = await query(
      `UPDATE reviews
       SET helpfulness_upvotes = helpfulness_upvotes + 1,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [reviewId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Review not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Decrement helpfulness upvotes (remove vote)
 * @param {string} reviewId - Review UUID
 * @returns {Promise<Object>} - Updated review
 */
const decrementHelpfulness = async (reviewId) => {
  try {
    const result = await query(
      `UPDATE reviews
       SET helpfulness_upvotes = GREATEST(helpfulness_upvotes - 1, 0),
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [reviewId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Review not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Flag review for moderation
 * @param {string} reviewId - Review UUID
 * @param {string} reason - Flag reason
 * @returns {Promise<Object>} - Updated review
 */
const flagReview = async (reviewId, reason) => {
  try {
    const result = await query(
      `UPDATE reviews
       SET is_flagged = true,
           flagged_reason = $1,
           updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [reason, reviewId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Review not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Soft delete review
 * @param {string} reviewId - Review UUID
 * @returns {Promise<Object>} - Deleted review
 */
const deleteReview = async (reviewId) => {
  try {
    const result = await query(
      `UPDATE reviews
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [reviewId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Review not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Calculate analyst's average rating and rating distribution
 * Uses weighted calculation based on helpfulness votes
 * @param {string} analystId - Analyst UUID
 * @returns {Promise<Object>} - Rating statistics
 */
const getAnalystRatingStats = async (analystId) => {
  try {
    const result = await query(
      `SELECT
        COUNT(*) as total_reviews,
        -- Weighted average rating (helpfulness increases weight)
        ROUND(
          SUM(rating * (1 + helpfulness_upvotes * 0.1)) /
          NULLIF(SUM(1 + helpfulness_upvotes * 0.1), 0),
          1
        ) as avg_rating,
        -- Simple average for comparison
        ROUND(AVG(rating)::numeric, 1) as simple_avg_rating,
        -- Rating distribution
        COUNT(*) FILTER (WHERE rating = 5) as five_star_count,
        COUNT(*) FILTER (WHERE rating = 4) as four_star_count,
        COUNT(*) FILTER (WHERE rating = 3) as three_star_count,
        COUNT(*) FILTER (WHERE rating = 2) as two_star_count,
        COUNT(*) FILTER (WHERE rating = 1) as one_star_count,
        -- Percentage distribution
        ROUND(COUNT(*) FILTER (WHERE rating = 5) * 100.0 / NULLIF(COUNT(*), 0), 1) as five_star_pct,
        ROUND(COUNT(*) FILTER (WHERE rating = 4) * 100.0 / NULLIF(COUNT(*), 0), 1) as four_star_pct,
        ROUND(COUNT(*) FILTER (WHERE rating = 3) * 100.0 / NULLIF(COUNT(*), 0), 1) as three_star_pct,
        ROUND(COUNT(*) FILTER (WHERE rating = 2) * 100.0 / NULLIF(COUNT(*), 0), 1) as two_star_pct,
        ROUND(COUNT(*) FILTER (WHERE rating = 1) * 100.0 / NULLIF(COUNT(*), 0), 1) as one_star_pct
      FROM reviews
      WHERE analyst_id = $1
        AND is_approved = true
        AND deleted_at IS NULL`,
      [analystId]
    );

    const stats = result.rows[0];

    return {
      totalReviews: parseInt(stats.total_reviews, 10),
      avgRating: parseFloat(stats.avg_rating) || 0,
      simpleAvgRating: parseFloat(stats.simple_avg_rating) || 0,
      distribution: {
        5: {
          count: parseInt(stats.five_star_count, 10),
          percentage: parseFloat(stats.five_star_pct) || 0
        },
        4: {
          count: parseInt(stats.four_star_count, 10),
          percentage: parseFloat(stats.four_star_pct) || 0
        },
        3: {
          count: parseInt(stats.three_star_count, 10),
          percentage: parseFloat(stats.three_star_pct) || 0
        },
        2: {
          count: parseInt(stats.two_star_count, 10),
          percentage: parseFloat(stats.two_star_pct) || 0
        },
        1: {
          count: parseInt(stats.one_star_count, 10),
          percentage: parseFloat(stats.one_star_pct) || 0
        }
      }
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Update analyst's cached rating in analyst_profiles table
 * Called after review creation, update, or deletion
 * @param {string} analystId - Analyst UUID
 * @returns {Promise<void>}
 */
const updateAnalystCachedRating = async (analystId) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get rating stats
    const stats = await getAnalystRatingStats(analystId);

    // Update analyst_profiles table
    await client.query(
      `UPDATE analyst_profiles
       SET avg_rating = $1,
           total_reviews = $2,
           updated_at = NOW()
       WHERE user_id = $3`,
      [stats.avgRating, stats.totalReviews, analystId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get flagged reviews for moderation
 * @returns {Promise<Array>} - Flagged reviews
 */
const getFlaggedReviews = async () => {
  try {
    const result = await query(
      `SELECT
        r.*,
        u.full_name as reviewer_name,
        u.email as reviewer_email,
        a.full_name as analyst_name,
        a.email as analyst_email
      FROM reviews r
      INNER JOIN users u ON r.user_id = u.id
      INNER JOIN users a ON r.analyst_id = a.id
      WHERE r.is_flagged = true
        AND r.moderated_at IS NULL
        AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC`
    );

    return result.rows;
  } catch (error) {
    throw error;
  }
};

/**
 * Moderate flagged review (approve or reject)
 * @param {string} reviewId - Review UUID
 * @param {string} moderatorId - Admin user ID
 * @param {boolean} approve - Approve (true) or reject (false)
 * @returns {Promise<Object>} - Moderated review
 */
const moderateReview = async (reviewId, moderatorId, approve) => {
  try {
    const result = await query(
      `UPDATE reviews
       SET is_approved = $1,
           is_flagged = false,
           moderated_by = $2,
           moderated_at = NOW(),
           updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [approve, moderatorId, reviewId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Review not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createReview,
  findById,
  findByAnalystId,
  findByUserAndAnalyst,
  findByUserId,
  updateReview,
  addAnalystResponse,
  deleteAnalystResponse,
  incrementHelpfulness,
  decrementHelpfulness,
  flagReview,
  deleteReview,
  getAnalystRatingStats,
  updateAnalystCachedRating,
  getFlaggedReviews,
  moderateReview
};
