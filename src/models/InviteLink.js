/**
 * InviteLink Model
 *
 * Database operations for invite links (referral tracking system)
 * Handles invite link generation, click tracking, conversion tracking, and analytics
 *
 * CRITICAL FEATURES:
 * - Zero-CAC growth strategy (analysts bring their own audience)
 * - Custom invite codes (e.g., RAJESH_TELEGRAM50)
 * - Click and conversion tracking
 * - Discount code integration
 * - Revenue attribution
 * - UTM parameter tracking
 * - Performance analytics
 */

const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Generate random invite code
 *
 * @param {string} prefix - Optional prefix (e.g., analyst name)
 * @returns {string} - Generated invite code
 */
const generateInviteCode = (prefix = '') => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();

  if (prefix) {
    // Format: PREFIX_RANDOM (e.g., RAJESH_AB12)
    return `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, '')}_${random}${timestamp.substring(0, 2)}`;
  }

  // Format: RANDOM_TIMESTAMP (e.g., AB12_XY56)
  return `${random}_${timestamp.substring(0, 4)}`;
};

/**
 * Create new invite link
 *
 * @param {Object} inviteData - Invite link data
 * @returns {Promise<Object>} - Created invite link
 */
const create = async (inviteData) => {
  try {
    const {
      analystId,
      inviteCode,
      linkName,
      linkDescription,
      discountCodeId,
      expiresAt,
      maxUses,
      utmSource,
      utmMedium,
      utmCampaign
    } = inviteData;

    // Validate required fields
    if (!analystId) {
      throw new AppError('Analyst ID is required', 400);
    }

    // Generate invite code if not provided
    const finalInviteCode = inviteCode || generateInviteCode();

    // Validate invite code format (alphanumeric, dashes, hyphens only)
    if (!/^[A-Z0-9\-_]{3,50}$/i.test(finalInviteCode)) {
      throw new AppError('Invite code must be 3-50 characters (alphanumeric, dashes, underscores only)', 400);
    }

    const result = await query(
      `INSERT INTO invite_links (
        analyst_id,
        invite_code,
        link_name,
        link_description,
        discount_code_id,
        expires_at,
        max_uses,
        utm_source,
        utm_medium,
        utm_campaign
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        analystId,
        finalInviteCode.toUpperCase(),
        linkName || null,
        linkDescription || null,
        discountCodeId || null,
        expiresAt || null,
        maxUses || null,
        utmSource || null,
        utmMedium || null,
        utmCampaign || null
      ]
    );

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    // Handle unique constraint violation
    if (error.code === '23505' && error.constraint === 'invite_links_invite_code_key') {
      throw new AppError('This invite code is already in use. Please choose a different code.', 409);
    }

    if (error.code === '23505' && error.constraint === 'unique_analyst_invite_code') {
      throw new AppError('You already have an invite link with this code', 409);
    }

    console.error('Error creating invite link:', error);
    throw new AppError('Failed to create invite link', 500);
  }
};

/**
 * Find invite link by code
 *
 * @param {string} inviteCode - Invite code
 * @returns {Promise<Object|null>} - Invite link or null
 */
const findByCode = async (inviteCode) => {
  try {
    const result = await query(
      `SELECT
        il.*,
        u.full_name as analyst_name,
        u.email as analyst_email,
        ap.profile_photo as analyst_photo,
        ap.sebi_registration_number,
        dc.code as discount_code,
        dc.discount_type,
        dc.discount_value,
        dc.max_discount_amount,
        dc.valid_until as discount_valid_until
      FROM invite_links il
      INNER JOIN users u ON il.analyst_id = u.id
      LEFT JOIN analyst_profiles ap ON u.id = ap.user_id
      LEFT JOIN discount_codes dc ON il.discount_code_id = dc.id
      WHERE il.invite_code = $1
      AND il.deleted_at IS NULL`,
      [inviteCode.toUpperCase()]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error finding invite link by code:', error);
    throw new AppError('Failed to fetch invite link', 500);
  }
};

/**
 * Find invite link by ID
 *
 * @param {string} inviteLinkId - Invite link ID
 * @returns {Promise<Object|null>} - Invite link or null
 */
const findById = async (inviteLinkId) => {
  try {
    const result = await query(
      `SELECT
        il.*,
        u.full_name as analyst_name,
        dc.code as discount_code,
        dc.discount_type,
        dc.discount_value
      FROM invite_links il
      INNER JOIN users u ON il.analyst_id = u.id
      LEFT JOIN discount_codes dc ON il.discount_code_id = dc.id
      WHERE il.id = $1
      AND il.deleted_at IS NULL`,
      [inviteLinkId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error finding invite link by ID:', error);
    throw new AppError('Failed to fetch invite link', 500);
  }
};

/**
 * Get all invite links for an analyst
 *
 * @param {string} analystId - Analyst ID
 * @param {Object} options - { page, limit, activeOnly }
 * @returns {Promise<Object>} - { inviteLinks: Array, total: number, page: number, limit: number }
 */
const findByAnalystId = async (analystId, options = {}) => {
  try {
    const { page = 1, limit = 20, activeOnly = false } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'il.analyst_id = $1 AND il.deleted_at IS NULL';
    const params = [analystId];

    if (activeOnly) {
      whereClause += ` AND il.is_active = true AND (il.expires_at IS NULL OR il.expires_at > NOW())`;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM invite_links il
       WHERE ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get invite links with analytics
    const result = await query(
      `SELECT
        il.*,
        dc.code as discount_code,
        dc.discount_type,
        dc.discount_value,
        CASE
          WHEN il.expires_at IS NOT NULL AND il.expires_at < NOW() THEN 'expired'
          WHEN il.is_active = false THEN 'inactive'
          WHEN il.max_uses IS NOT NULL AND il.conversions_count >= il.max_uses THEN 'limit_reached'
          ELSE 'active'
        END as status
      FROM invite_links il
      LEFT JOIN discount_codes dc ON il.discount_code_id = dc.id
      WHERE ${whereClause}
      ORDER BY il.created_at DESC
      LIMIT $2 OFFSET $3`,
      [...params, limit, offset]
    );

    return {
      inviteLinks: result.rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting analyst invite links:', error);
    throw new AppError('Failed to fetch invite links', 500);
  }
};

/**
 * Track click on invite link
 * Increments total_clicks and optionally unique_visitors
 *
 * @param {string} inviteCode - Invite code
 * @param {boolean} isUniqueVisitor - Whether this is a unique visitor (tracked by IP/fingerprint)
 * @returns {Promise<Object>} - Updated invite link
 */
const trackClick = async (inviteCode, isUniqueVisitor = false) => {
  try {
    const result = await query(
      `UPDATE invite_links
       SET total_clicks = total_clicks + 1,
           unique_visitors = unique_visitors + $1,
           last_used_at = NOW(),
           updated_at = NOW()
       WHERE invite_code = $2
       AND deleted_at IS NULL
       RETURNING *`,
      [isUniqueVisitor ? 1 : 0, inviteCode.toUpperCase()]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invite link not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error tracking invite link click:', error);
    throw new AppError('Failed to track click', 500);
  }
};

/**
 * Track signup via invite link
 * Increments signups_count
 *
 * @param {string} inviteCode - Invite code
 * @returns {Promise<Object>} - Updated invite link
 */
const trackSignup = async (inviteCode) => {
  try {
    const result = await query(
      `UPDATE invite_links
       SET signups_count = signups_count + 1,
           last_used_at = NOW(),
           updated_at = NOW()
       WHERE invite_code = $1
       AND deleted_at IS NULL
       RETURNING *`,
      [inviteCode.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return null; // Invite link may have been deleted
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error tracking signup:', error);
    // Don't throw error - this is a non-critical operation
    return null;
  }
};

/**
 * Track conversion (paid subscription) via invite link
 * Increments conversions_count and total_revenue_generated
 *
 * @param {string} inviteLinkId - Invite link ID
 * @param {number} revenueInPaise - Revenue generated in paise
 * @returns {Promise<Object>} - Updated invite link
 */
const trackConversion = async (inviteLinkId, revenueInPaise = 0) => {
  try {
    const result = await query(
      `UPDATE invite_links
       SET conversions_count = conversions_count + 1,
           total_revenue_generated = total_revenue_generated + $1,
           last_used_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       AND deleted_at IS NULL
       RETURNING *`,
      [revenueInPaise, inviteLinkId]
    );

    if (result.rows.length === 0) {
      return null; // Invite link may have been deleted
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error tracking conversion:', error);
    // Don't throw error - this is a non-critical operation
    return null;
  }
};

/**
 * Validate invite link (check if active and within limits)
 *
 * @param {string} inviteCode - Invite code
 * @returns {Promise<Object>} - { isValid: boolean, reason: string, inviteLink: Object }
 */
const validateInviteLink = async (inviteCode) => {
  try {
    const inviteLink = await findByCode(inviteCode);

    if (!inviteLink) {
      return {
        isValid: false,
        reason: 'Invite link not found',
        inviteLink: null
      };
    }

    // Check if active
    if (!inviteLink.is_active) {
      return {
        isValid: false,
        reason: 'This invite link has been deactivated',
        inviteLink
      };
    }

    // Check if expired
    if (inviteLink.expires_at && new Date(inviteLink.expires_at) < new Date()) {
      return {
        isValid: false,
        reason: 'This invite link has expired',
        inviteLink
      };
    }

    // Check if max uses reached
    if (inviteLink.max_uses && inviteLink.conversions_count >= inviteLink.max_uses) {
      return {
        isValid: false,
        reason: 'This invite link has reached its maximum usage limit',
        inviteLink
      };
    }

    return {
      isValid: true,
      reason: 'Valid invite link',
      inviteLink
    };
  } catch (error) {
    console.error('Error validating invite link:', error);
    throw new AppError('Failed to validate invite link', 500);
  }
};

/**
 * Update invite link
 *
 * @param {string} inviteLinkId - Invite link ID
 * @param {string} analystId - Analyst ID (for ownership verification)
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated invite link
 */
const update = async (inviteLinkId, analystId, updates) => {
  try {
    const allowedFields = [
      'link_name',
      'link_description',
      'is_active',
      'expires_at',
      'max_uses',
      'utm_source',
      'utm_medium',
      'utm_campaign'
    ];

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key)) {
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

    values.push(inviteLinkId);
    values.push(analystId);

    const result = await query(
      `UPDATE invite_links
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       AND analyst_id = $${paramCount + 1}
       AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Invite link not found or you do not have permission to update it', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating invite link:', error);
    throw new AppError('Failed to update invite link', 500);
  }
};

/**
 * Soft delete invite link
 *
 * @param {string} inviteLinkId - Invite link ID
 * @param {string} analystId - Analyst ID (for ownership verification)
 * @returns {Promise<void>}
 */
const softDelete = async (inviteLinkId, analystId) => {
  try {
    const result = await query(
      `UPDATE invite_links
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       AND analyst_id = $2
       AND deleted_at IS NULL
       RETURNING id`,
      [inviteLinkId, analystId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invite link not found or you do not have permission to delete it', 404);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting invite link:', error);
    throw new AppError('Failed to delete invite link', 500);
  }
};

/**
 * Get invite link analytics
 *
 * @param {string} inviteLinkId - Invite link ID
 * @param {string} analystId - Analyst ID (for ownership verification)
 * @returns {Promise<Object>} - Analytics data
 */
const getAnalytics = async (inviteLinkId, analystId) => {
  try {
    const result = await query(
      `SELECT
        il.id,
        il.invite_code,
        il.link_name,
        il.total_clicks,
        il.unique_visitors,
        il.signups_count,
        il.conversions_count,
        il.total_revenue_generated,
        il.conversion_rate,
        il.created_at,
        il.last_used_at,
        dc.code as discount_code,
        dc.discount_type,
        dc.discount_value,
        -- Click-through rate (CTR)
        CASE
          WHEN il.total_clicks > 0 THEN ROUND((il.signups_count::DECIMAL / il.total_clicks * 100), 2)
          ELSE 0
        END as click_to_signup_rate,
        -- Signup to conversion rate
        CASE
          WHEN il.signups_count > 0 THEN ROUND((il.conversions_count::DECIMAL / il.signups_count * 100), 2)
          ELSE 0
        END as signup_to_conversion_rate,
        -- Average revenue per conversion
        CASE
          WHEN il.conversions_count > 0 THEN ROUND(il.total_revenue_generated::DECIMAL / il.conversions_count)
          ELSE 0
        END as avg_revenue_per_conversion,
        -- Revenue in rupees (for display)
        ROUND(il.total_revenue_generated::DECIMAL / 100, 2) as total_revenue_inr
      FROM invite_links il
      LEFT JOIN discount_codes dc ON il.discount_code_id = dc.id
      WHERE il.id = $1
      AND il.analyst_id = $2
      AND il.deleted_at IS NULL`,
      [inviteLinkId, analystId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invite link not found or you do not have permission to view analytics', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error getting invite link analytics:', error);
    throw new AppError('Failed to fetch invite link analytics', 500);
  }
};

/**
 * Get top performing invite links for an analyst
 *
 * @param {string} analystId - Analyst ID
 * @param {number} limit - Number of top links to return (default: 5)
 * @returns {Promise<Array>} - Array of top performing invite links
 */
const getTopPerforming = async (analystId, limit = 5) => {
  try {
    const result = await query(
      `SELECT
        il.id,
        il.invite_code,
        il.link_name,
        il.total_clicks,
        il.conversions_count,
        il.total_revenue_generated,
        il.conversion_rate,
        ROUND(il.total_revenue_generated::DECIMAL / 100, 2) as total_revenue_inr
      FROM invite_links il
      WHERE il.analyst_id = $1
      AND il.deleted_at IS NULL
      ORDER BY
        il.conversions_count DESC,
        il.total_revenue_generated DESC,
        il.conversion_rate DESC
      LIMIT $2`,
      [analystId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting top performing invite links:', error);
    throw new AppError('Failed to fetch top performing invite links', 500);
  }
};

/**
 * Get invite link summary for analyst
 *
 * @param {string} analystId - Analyst ID
 * @returns {Promise<Object>} - Summary statistics
 */
const getSummary = async (analystId) => {
  try {
    const result = await query(
      `SELECT
        COUNT(*) as total_links,
        COUNT(*) FILTER (WHERE is_active = true) as active_links,
        SUM(total_clicks) as total_clicks,
        SUM(unique_visitors) as total_unique_visitors,
        SUM(signups_count) as total_signups,
        SUM(conversions_count) as total_conversions,
        SUM(total_revenue_generated) as total_revenue_paise,
        ROUND(SUM(total_revenue_generated)::DECIMAL / 100, 2) as total_revenue_inr,
        CASE
          WHEN SUM(total_clicks) > 0 THEN ROUND((SUM(conversions_count)::DECIMAL / SUM(total_clicks) * 100), 2)
          ELSE 0
        END as overall_conversion_rate
      FROM invite_links
      WHERE analyst_id = $1
      AND deleted_at IS NULL`,
      [analystId]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error getting invite link summary:', error);
    throw new AppError('Failed to fetch invite link summary', 500);
  }
};

module.exports = {
  generateInviteCode,
  create,
  findByCode,
  findById,
  findByAnalystId,
  trackClick,
  trackSignup,
  trackConversion,
  validateInviteLink,
  update,
  softDelete,
  getAnalytics,
  getTopPerforming,
  getSummary
};
