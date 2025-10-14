/**
 * Analyst Profile Model
 *
 * Handles all database operations for analyst profiles including:
 * - Profile creation, read, update, delete (CRUD)
 * - SEBI/RIA verification status management
 * - Document storage and retrieval
 * - Statistics updates (subscribers, revenue, ratings)
 * - Discovery page queries with filters
 *
 * SECURITY:
 * - All queries use parameterized statements (SQL injection prevention)
 * - Soft delete support (deleted_at check)
 * - Transaction support for critical operations
 */

const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create new analyst profile
 *
 * @param {Object} profileData - Analyst profile data
 * @param {string} profileData.user_id - User UUID
 * @param {string} profileData.display_name - Public display name
 * @param {string} profileData.sebi_number - SEBI registration number (optional)
 * @param {string} profileData.ria_number - RIA registration number (optional)
 * @param {string} profileData.country - Country code (default: 'IN')
 * @returns {Promise<Object>} - Created analyst profile
 */
const create = async (profileData) => {
  try {
    const {
      user_id,
      display_name,
      bio = null,
      photo_url = null,
      specializations = [],
      languages = [],
      sebi_number = null,
      ria_number = null,
      country = 'IN',
      years_of_experience = null,
      allow_free_subscribers = true,
      invite_link_code = null
    } = profileData;

    // Validate that at least SEBI or RIA number is provided
    if (!sebi_number && !ria_number) {
      throw new AppError('Either SEBI number or RIA number is required', 400);
    }

    // Generate invite link code if not provided
    const finalInviteLinkCode = invite_link_code ||
      Math.random().toString(36).substring(2, 12).toLowerCase();

    const sql = `
      INSERT INTO analyst_profiles (
        user_id,
        display_name,
        bio,
        photo_url,
        specializations,
        languages,
        sebi_number,
        ria_number,
        country,
        years_of_experience,
        allow_free_subscribers,
        invite_link_code,
        verification_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
      RETURNING *
    `;

    const params = [
      user_id,
      display_name,
      bio,
      photo_url,
      specializations,
      languages,
      sebi_number,
      ria_number,
      country,
      years_of_experience,
      allow_free_subscribers,
      finalInviteLinkCode
    ];

    const result = await query(sql, params);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating analyst profile:', error.message);
    throw error;
  }
};

/**
 * Get analyst profile by ID
 *
 * @param {string} profileId - Analyst profile UUID
 * @param {boolean} includeDeleted - Include soft-deleted profiles (default: false)
 * @returns {Promise<Object|null>} - Analyst profile or null if not found
 */
const findById = async (profileId, includeDeleted = false) => {
  try {
    const sql = `
      SELECT
        ap.*,
        u.email,
        u.phone,
        u.created_at as user_created_at
      FROM analyst_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE ap.id = $1
        ${includeDeleted ? '' : 'AND ap.deleted_at IS NULL'}
    `;

    const result = await query(sql, [profileId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching analyst profile by ID:', error.message);
    throw error;
  }
};

/**
 * Get analyst profile by user ID
 *
 * @param {string} userId - User UUID
 * @param {boolean} includeDeleted - Include soft-deleted profiles (default: false)
 * @returns {Promise<Object|null>} - Analyst profile or null if not found
 */
const findByUserId = async (userId, includeDeleted = false) => {
  try {
    const sql = `
      SELECT
        ap.*,
        u.email,
        u.phone,
        u.created_at as user_created_at
      FROM analyst_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE ap.user_id = $1
        ${includeDeleted ? '' : 'AND ap.deleted_at IS NULL'}
    `;

    const result = await query(sql, [userId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching analyst profile by user ID:', error.message);
    throw error;
  }
};

/**
 * Get analyst profile by SEBI number
 *
 * @param {string} sebiNumber - SEBI registration number
 * @returns {Promise<Object|null>} - Analyst profile or null if not found
 */
const findBySebiNumber = async (sebiNumber) => {
  try {
    const sql = `
      SELECT * FROM analyst_profiles
      WHERE sebi_number = $1 AND deleted_at IS NULL
    `;

    const result = await query(sql, [sebiNumber]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching analyst profile by SEBI number:', error.message);
    throw error;
  }
};

/**
 * Update analyst profile
 *
 * @param {string} profileId - Analyst profile UUID
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object>} - Updated analyst profile
 */
const update = async (profileId, updateData) => {
  try {
    // Build dynamic SET clause based on provided fields
    const allowedFields = [
      'display_name',
      'bio',
      'photo_url',
      'specializations',
      'languages',
      'sebi_number',
      'ria_number',
      'country',
      'years_of_experience',
      'allow_free_subscribers',
      'verification_documents'
    ];

    const updates = [];
    const params = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        params.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      throw new AppError('No valid fields provided for update', 400);
    }

    // Add updated_at timestamp
    updates.push(`updated_at = NOW()`);

    // Add profileId as last parameter
    params.push(profileId);

    const sql = `
      UPDATE analyst_profiles
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new AppError('Analyst profile not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error updating analyst profile:', error.message);
    throw error;
  }
};

/**
 * Update verification status and documents
 *
 * @param {string} profileId - Analyst profile UUID
 * @param {Object} verificationData - Verification data
 * @param {string} verificationData.status - Verification status
 * @param {Array} verificationData.documents - Document metadata array
 * @returns {Promise<Object>} - Updated analyst profile
 */
const updateVerificationStatus = async (profileId, verificationData) => {
  try {
    const { status, documents } = verificationData;

    const sql = `
      UPDATE analyst_profiles
      SET
        verification_status = $1,
        verification_documents = $2,
        updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `;

    const params = [status, JSON.stringify(documents), profileId];
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new AppError('Analyst profile not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error updating verification status:', error.message);
    throw error;
  }
};

/**
 * Approve analyst verification
 *
 * @param {string} profileId - Analyst profile UUID
 * @param {string} adminUserId - Admin user ID who approved
 * @returns {Promise<Object>} - Updated analyst profile
 */
const approve = async (profileId, adminUserId) => {
  try {
    const sql = `
      UPDATE analyst_profiles
      SET
        verification_status = 'approved',
        verified_at = NOW(),
        verified_by = $1,
        rejection_reason = NULL,
        updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const params = [adminUserId, profileId];
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new AppError('Analyst profile not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error approving analyst verification:', error.message);
    throw error;
  }
};

/**
 * Reject analyst verification
 *
 * @param {string} profileId - Analyst profile UUID
 * @param {string} rejectionReason - Reason for rejection
 * @returns {Promise<Object>} - Updated analyst profile
 */
const reject = async (profileId, rejectionReason) => {
  try {
    const sql = `
      UPDATE analyst_profiles
      SET
        verification_status = 'rejected',
        rejection_reason = $1,
        verified_at = NULL,
        verified_by = NULL,
        updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const params = [rejectionReason, profileId];
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new AppError('Analyst profile not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error rejecting analyst verification:', error.message);
    throw error;
  }
};

/**
 * Get analysts for discovery page with filters
 *
 * @param {Object} filters - Filter options
 * @param {Array<string>} filters.specializations - Filter by specializations
 * @param {Array<string>} filters.languages - Filter by languages
 * @param {number} filters.minRating - Minimum rating filter
 * @param {number} filters.maxPrice - Maximum price filter (monthly)
 * @param {string} filters.search - Search by name
 * @param {string} filters.sortBy - Sort option (popular, rating, newest, price)
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.limit - Results per page (default: 20)
 * @returns {Promise<Object>} - Paginated analyst list with metadata
 */
const findForDiscovery = async (filters = {}) => {
  try {
    const {
      specializations = [],
      languages = [],
      minRating = 0,
      maxPrice = null,
      search = '',
      sortBy = 'popular',
      page = 1,
      limit = 20
    } = filters;

    // Build WHERE conditions
    const conditions = ['ap.verification_status = $1', 'ap.deleted_at IS NULL'];
    const params = ['approved'];
    let paramCount = 2;

    // Specialization filter (array overlap)
    if (specializations.length > 0) {
      conditions.push(`ap.specializations && $${paramCount}`);
      params.push(specializations);
      paramCount++;
    }

    // Language filter (array overlap)
    if (languages.length > 0) {
      conditions.push(`ap.languages && $${paramCount}`);
      params.push(languages);
      paramCount++;
    }

    // Rating filter
    if (minRating > 0) {
      conditions.push(`ap.avg_rating >= $${paramCount}`);
      params.push(minRating);
      paramCount++;
    }

    // Search filter
    if (search) {
      conditions.push(`ap.display_name ILIKE $${paramCount}`);
      params.push(`%${search}%`);
      paramCount++;
    }

    // Build ORDER BY clause
    let orderBy;
    switch (sortBy) {
      case 'rating':
        orderBy = 'ap.avg_rating DESC, ap.total_reviews DESC';
        break;
      case 'newest':
        orderBy = 'ap.created_at DESC';
        break;
      case 'price':
        orderBy = 'ap.monthly_revenue ASC';
        break;
      case 'popular':
      default:
        orderBy = 'ap.active_subscribers DESC, ap.avg_rating DESC';
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get total count
    const countSql = `
      SELECT COUNT(*) as total
      FROM analyst_profiles ap
      WHERE ${conditions.join(' AND ')}
    `;

    const countResult = await query(countSql, params);
    const totalCount = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    const dataSql = `
      SELECT
        ap.id,
        ap.user_id,
        ap.display_name,
        ap.bio,
        ap.photo_url,
        ap.specializations,
        ap.languages,
        ap.sebi_number,
        ap.avg_rating,
        ap.total_reviews,
        ap.active_subscribers,
        ap.total_posts,
        ap.is_featured,
        ap.created_at,
        ap.last_post_at
      FROM analyst_profiles ap
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    params.push(limit, offset);
    const dataResult = await query(dataSql, params);

    return {
      analysts: dataResult.rows,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    };
  } catch (error) {
    console.error('Error fetching analysts for discovery:', error.message);
    throw error;
  }
};

/**
 * Get verification queue for admin
 *
 * @param {string} status - Filter by status (pending, in_review)
 * @param {number} page - Page number
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} - Paginated verification queue
 */
const getVerificationQueue = async (status = null, page = 1, limit = 20) => {
  try {
    const conditions = ['ap.deleted_at IS NULL'];
    const params = [];
    let paramCount = 1;

    // Status filter
    if (status) {
      conditions.push(`ap.verification_status = $${paramCount}`);
      params.push(status);
      paramCount++;
    } else {
      conditions.push(`ap.verification_status IN ('pending', 'in_review')`);
    }

    const offset = (page - 1) * limit;

    // Get total count
    const countSql = `
      SELECT COUNT(*) as total
      FROM analyst_profiles ap
      WHERE ${conditions.join(' AND ')}
    `;

    const countResult = await query(countSql, params);
    const totalCount = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    const dataSql = `
      SELECT
        ap.*,
        u.email,
        u.phone,
        u.created_at as user_created_at
      FROM analyst_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ap.created_at ASC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    params.push(limit, offset);
    const dataResult = await query(dataSql, params);

    return {
      analysts: dataResult.rows,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    };
  } catch (error) {
    console.error('Error fetching verification queue:', error.message);
    throw error;
  }
};

/**
 * Update analyst statistics
 *
 * @param {string} profileId - Analyst profile UUID
 * @param {Object} stats - Statistics to update
 * @param {number} stats.avg_rating - Average rating
 * @param {number} stats.total_reviews - Total reviews
 * @param {number} stats.total_subscribers - Total subscribers
 * @param {number} stats.active_subscribers - Active subscribers
 * @param {number} stats.total_posts - Total posts
 * @param {number} stats.monthly_revenue - Monthly revenue (in paise)
 * @returns {Promise<Object>} - Updated analyst profile
 */
const updateStats = async (profileId, stats) => {
  try {
    const updates = [];
    const params = [];
    let paramCount = 1;

    const allowedStats = [
      'avg_rating',
      'total_reviews',
      'total_subscribers',
      'active_subscribers',
      'total_posts',
      'monthly_revenue'
    ];

    for (const [key, value] of Object.entries(stats)) {
      if (allowedStats.includes(key) && value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        params.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      throw new AppError('No valid statistics provided for update', 400);
    }

    updates.push(`updated_at = NOW()`);
    params.push(profileId);

    const sql = `
      UPDATE analyst_profiles
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new AppError('Analyst profile not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error updating analyst statistics:', error.message);
    throw error;
  }
};

/**
 * Update last post timestamp
 *
 * @param {string} profileId - Analyst profile UUID
 * @returns {Promise<Object>} - Updated analyst profile
 */
const updateLastPostAt = async (profileId) => {
  try {
    const sql = `
      UPDATE analyst_profiles
      SET
        last_post_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await query(sql, [profileId]);

    if (result.rows.length === 0) {
      throw new AppError('Analyst profile not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error updating last post timestamp:', error.message);
    throw error;
  }
};

/**
 * Soft delete analyst profile
 *
 * @param {string} profileId - Analyst profile UUID
 * @returns {Promise<boolean>} - True if deleted successfully
 */
const softDelete = async (profileId) => {
  try {
    const sql = `
      UPDATE analyst_profiles
      SET
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;

    const result = await query(sql, [profileId]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error soft deleting analyst profile:', error.message);
    throw error;
  }
};

/**
 * Get analyst dashboard data
 *
 * @param {string} profileId - Analyst profile UUID
 * @returns {Promise<Object>} - Dashboard metrics and data
 */
const getDashboardData = async (profileId) => {
  try {
    // Get profile with stats
    const profile = await findById(profileId);

    if (!profile) {
      throw new AppError('Analyst profile not found', 404);
    }

    // Get revenue breakdown (last 30 days)
    const revenueSql = `
      SELECT
        DATE(created_at) as date,
        SUM(amount) as daily_revenue,
        COUNT(*) as transaction_count
      FROM payment_transactions
      WHERE
        analyst_id = $1
        AND status = 'captured'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const revenueResult = await query(revenueSql, [profileId]);

    // Get recent subscribers (last 10)
    const subscribersSql = `
      SELECT
        s.id,
        s.created_at as subscribed_at,
        u.id as user_id,
        u.email,
        u.phone,
        st.name as tier_name,
        st.monthly_price
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      JOIN subscription_tiers st ON s.tier_id = st.id
      WHERE s.analyst_id = $1 AND s.status = 'active'
      ORDER BY s.created_at DESC
      LIMIT 10
    `;

    const subscribersResult = await query(subscribersSql, [profileId]);

    // Get post performance (last 10 posts)
    const postsSql = `
      SELECT
        id,
        title,
        content,
        created_at,
        views_count,
        bookmarks_count,
        comments_count
      FROM posts
      WHERE analyst_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const postsResult = await query(postsSql, [profileId]);

    // Get recent reviews (last 5)
    const reviewsSql = `
      SELECT
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.email as reviewer_email
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.analyst_id = $1
      ORDER BY r.created_at DESC
      LIMIT 5
    `;

    const reviewsResult = await query(reviewsSql, [profileId]);

    return {
      profile,
      revenue: {
        monthly: profile.monthly_revenue / 100, // Convert from paise to rupees
        dailyBreakdown: revenueResult.rows.map(row => ({
          date: row.date,
          revenue: row.daily_revenue / 100,
          transactions: parseInt(row.transaction_count, 10)
        }))
      },
      recentSubscribers: subscribersResult.rows,
      recentPosts: postsResult.rows,
      recentReviews: reviewsResult.rows
    };
  } catch (error) {
    console.error('Error fetching analyst dashboard data:', error.message);
    throw error;
  }
};

/**
 * Get featured analysts (for homepage)
 *
 * @param {number} limit - Number of featured analysts to fetch
 * @returns {Promise<Array>} - Featured analysts
 */
const getFeaturedAnalysts = async (limit = 5) => {
  try {
    const sql = `
      SELECT
        id,
        user_id,
        display_name,
        bio,
        photo_url,
        specializations,
        languages,
        avg_rating,
        total_reviews,
        active_subscribers,
        total_posts
      FROM analyst_profiles
      WHERE
        is_featured = true
        AND verification_status = 'approved'
        AND deleted_at IS NULL
      ORDER BY feature_position ASC NULLS LAST
      LIMIT $1
    `;

    const result = await query(sql, [limit]);
    return result.rows;
  } catch (error) {
    console.error('Error fetching featured analysts:', error.message);
    throw error;
  }
};

module.exports = {
  create,
  findById,
  findByUserId,
  findBySebiNumber,
  update,
  updateVerificationStatus,
  approve,
  reject,
  findForDiscovery,
  getVerificationQueue,
  updateStats,
  updateLastPostAt,
  softDelete,
  getDashboardData,
  getFeaturedAnalysts
};
