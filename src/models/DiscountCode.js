/**
 * DiscountCode Model
 *
 * Database operations for discount codes (promotional offers)
 * Handles discount code validation, usage tracking, and application to subscriptions
 *
 * CRITICAL FEATURES:
 * - Percentage and fixed amount discounts
 * - Tier-specific applicability
 * - Billing cycle restrictions (monthly/yearly)
 * - Usage limits and per-user limits
 * - Validity period enforcement
 * - First-time subscriber restrictions
 * - Integration with invite links
 */

const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create new discount code
 *
 * @param {Object} discountData - Discount code data
 * @returns {Promise<Object>} - Created discount code
 */
const create = async (discountData) => {
  try {
    const {
      analystId,
      code,
      codeName,
      codeDescription,
      discountType = 'percentage',
      discountValue,
      maxDiscountAmount,
      applicableTiers,
      billingCycleRestriction = 'both',
      firstTimeOnly = false,
      usageLimit,
      perUserLimit = 1,
      validFrom,
      validUntil
    } = discountData;

    // Validate required fields
    if (!analystId || !code || !discountValue) {
      throw new AppError('Analyst ID, code, and discount value are required', 400);
    }

    // Validate discount code format (alphanumeric only, no special chars)
    if (!/^[A-Z0-9]{3,50}$/i.test(code)) {
      throw new AppError('Discount code must be 3-50 characters (alphanumeric only)', 400);
    }

    // Validate discount type
    if (!['percentage', 'fixed_amount'].includes(discountType)) {
      throw new AppError('Discount type must be "percentage" or "fixed_amount"', 400);
    }

    // Validate percentage range (1-100)
    if (discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
      throw new AppError('Percentage discount must be between 1 and 100', 400);
    }

    // Validate fixed amount (must be positive)
    if (discountType === 'fixed_amount' && discountValue <= 0) {
      throw new AppError('Fixed amount discount must be greater than 0', 400);
    }

    // Validate billing cycle restriction
    if (!['monthly', 'yearly', 'both'].includes(billingCycleRestriction)) {
      throw new AppError('Billing cycle restriction must be "monthly", "yearly", or "both"', 400);
    }

    const result = await query(
      `INSERT INTO discount_codes (
        analyst_id,
        code,
        code_name,
        code_description,
        discount_type,
        discount_value,
        max_discount_amount,
        applicable_tiers,
        billing_cycle_restriction,
        first_time_only,
        usage_limit,
        per_user_limit,
        valid_from,
        valid_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        analystId,
        code.toUpperCase(),
        codeName || null,
        codeDescription || null,
        discountType,
        discountValue,
        maxDiscountAmount || null,
        applicableTiers || null,
        billingCycleRestriction,
        firstTimeOnly,
        usageLimit || null,
        perUserLimit,
        validFrom || new Date(),
        validUntil || null
      ]
    );

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    // Handle unique constraint violation
    if (error.code === '23505' && error.constraint === 'discount_codes_code_key') {
      throw new AppError('This discount code is already in use. Please choose a different code.', 409);
    }

    if (error.code === '23505' && error.constraint === 'unique_analyst_code') {
      throw new AppError('You already have a discount code with this name', 409);
    }

    console.error('Error creating discount code:', error);
    throw new AppError('Failed to create discount code', 500);
  }
};

/**
 * Find discount code by code string
 *
 * @param {string} code - Discount code
 * @returns {Promise<Object|null>} - Discount code or null
 */
const findByCode = async (code) => {
  try {
    const result = await query(
      `SELECT
        dc.*,
        u.full_name as analyst_name
      FROM discount_codes dc
      INNER JOIN users u ON dc.analyst_id = u.id
      WHERE dc.code = $1
      AND dc.deleted_at IS NULL`,
      [code.toUpperCase()]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error finding discount code:', error);
    throw new AppError('Failed to fetch discount code', 500);
  }
};

/**
 * Find discount code by ID
 *
 * @param {string} discountCodeId - Discount code ID
 * @returns {Promise<Object|null>} - Discount code or null
 */
const findById = async (discountCodeId) => {
  try {
    const result = await query(
      `SELECT
        dc.*,
        u.full_name as analyst_name
      FROM discount_codes dc
      INNER JOIN users u ON dc.analyst_id = u.id
      WHERE dc.id = $1
      AND dc.deleted_at IS NULL`,
      [discountCodeId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error finding discount code by ID:', error);
    throw new AppError('Failed to fetch discount code', 500);
  }
};

/**
 * Get all discount codes for an analyst
 *
 * @param {string} analystId - Analyst ID
 * @param {Object} options - { page, limit, activeOnly }
 * @returns {Promise<Object>} - { discountCodes: Array, total: number, page: number, limit: number }
 */
const findByAnalystId = async (analystId, options = {}) => {
  try {
    const { page = 1, limit = 20, activeOnly = false } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'dc.analyst_id = $1 AND dc.deleted_at IS NULL';
    const params = [analystId];

    if (activeOnly) {
      whereClause += ` AND dc.is_active = true AND (dc.valid_until IS NULL OR dc.valid_until > NOW())`;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM discount_codes dc
       WHERE ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get discount codes
    const result = await query(
      `SELECT
        dc.*,
        CASE
          WHEN dc.valid_until IS NOT NULL AND dc.valid_until < NOW() THEN 'expired'
          WHEN dc.is_active = false THEN 'inactive'
          WHEN dc.usage_limit IS NOT NULL AND dc.usage_count >= dc.usage_limit THEN 'limit_reached'
          ELSE 'active'
        END as status,
        -- Count how many invite links use this discount code
        (SELECT COUNT(*) FROM invite_links WHERE discount_code_id = dc.id AND deleted_at IS NULL) as linked_invite_count
      FROM discount_codes dc
      WHERE ${whereClause}
      ORDER BY dc.created_at DESC
      LIMIT $2 OFFSET $3`,
      [...params, limit, offset]
    );

    return {
      discountCodes: result.rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting analyst discount codes:', error);
    throw new AppError('Failed to fetch discount codes', 500);
  }
};

/**
 * Validate discount code for a subscription
 *
 * @param {string} code - Discount code
 * @param {string} userId - User ID
 * @param {string} tierId - Tier ID
 * @param {string} billingCycle - Billing cycle ('monthly' or 'yearly')
 * @returns {Promise<Object>} - { isValid: boolean, reason: string, discountCode: Object, discountAmount: number }
 */
const validateDiscountCode = async (code, userId, tierId, billingCycle) => {
  try {
    const discountCode = await findByCode(code);

    if (!discountCode) {
      return {
        isValid: false,
        reason: 'Discount code not found',
        discountCode: null,
        discountAmount: 0
      };
    }

    // Check if active
    if (!discountCode.is_active) {
      return {
        isValid: false,
        reason: 'This discount code has been deactivated',
        discountCode,
        discountAmount: 0
      };
    }

    // Check validity period
    const now = new Date();
    if (new Date(discountCode.valid_from) > now) {
      return {
        isValid: false,
        reason: 'This discount code is not yet active',
        discountCode,
        discountAmount: 0
      };
    }

    if (discountCode.valid_until && new Date(discountCode.valid_until) < now) {
      return {
        isValid: false,
        reason: 'This discount code has expired',
        discountCode,
        discountAmount: 0
      };
    }

    // Check usage limit
    if (discountCode.usage_limit && discountCode.usage_count >= discountCode.usage_limit) {
      return {
        isValid: false,
        reason: 'This discount code has reached its maximum usage limit',
        discountCode,
        discountAmount: 0
      };
    }

    // Check per-user limit
    const userUsageResult = await query(
      `SELECT COUNT(*) as usage_count
       FROM subscriptions
       WHERE user_id = $1
       AND discount_code_used = $2
       AND deleted_at IS NULL`,
      [userId, discountCode.id]
    );

    const userUsageCount = parseInt(userUsageResult.rows[0].usage_count);
    if (userUsageCount >= discountCode.per_user_limit) {
      return {
        isValid: false,
        reason: `You have already used this discount code ${discountCode.per_user_limit} time(s)`,
        discountCode,
        discountAmount: 0
      };
    }

    // Check billing cycle restriction
    if (discountCode.billing_cycle_restriction !== 'both' &&
        discountCode.billing_cycle_restriction !== billingCycle) {
      return {
        isValid: false,
        reason: `This discount code is only valid for ${discountCode.billing_cycle_restriction} billing`,
        discountCode,
        discountAmount: 0
      };
    }

    // Check tier applicability
    if (discountCode.applicable_tiers && discountCode.applicable_tiers.length > 0) {
      if (!discountCode.applicable_tiers.includes(tierId)) {
        return {
          isValid: false,
          reason: 'This discount code is not applicable to the selected tier',
          discountCode,
          discountAmount: 0
        };
      }
    }

    // Check first-time only restriction
    if (discountCode.first_time_only) {
      const existingSubResult = await query(
        `SELECT COUNT(*) as sub_count
         FROM subscriptions
         WHERE user_id = $1
         AND analyst_id = $2
         AND deleted_at IS NULL`,
        [userId, discountCode.analyst_id]
      );

      const hasExistingSub = parseInt(existingSubResult.rows[0].sub_count) > 0;
      if (hasExistingSub) {
        return {
          isValid: false,
          reason: 'This discount code is only valid for first-time subscribers',
          discountCode,
          discountAmount: 0
        };
      }
    }

    // All validations passed
    return {
      isValid: true,
      reason: 'Valid discount code',
      discountCode,
      discountAmount: 0 // Will be calculated when applied to tier price
    };
  } catch (error) {
    console.error('Error validating discount code:', error);
    throw new AppError('Failed to validate discount code', 500);
  }
};

/**
 * Calculate discount amount
 *
 * @param {Object} discountCode - Discount code object
 * @param {number} tierPrice - Tier price in paise
 * @returns {number} - Discount amount in paise
 */
const calculateDiscountAmount = (discountCode, tierPrice) => {
  let discountAmount = 0;

  if (discountCode.discount_type === 'percentage') {
    // Calculate percentage discount
    discountAmount = Math.floor((tierPrice * discountCode.discount_value) / 100);

    // Apply max discount cap if set
    if (discountCode.max_discount_amount && discountAmount > discountCode.max_discount_amount) {
      discountAmount = discountCode.max_discount_amount;
    }
  } else if (discountCode.discount_type === 'fixed_amount') {
    // Fixed amount discount
    discountAmount = discountCode.discount_value;

    // Ensure discount doesn't exceed tier price
    if (discountAmount > tierPrice) {
      discountAmount = tierPrice;
    }
  }

  return discountAmount;
};

/**
 * Apply discount code to a subscription (increment usage count)
 *
 * @param {string} discountCodeId - Discount code ID
 * @returns {Promise<Object>} - Updated discount code
 */
const applyDiscountCode = async (discountCodeId) => {
  try {
    const result = await query(
      `UPDATE discount_codes
       SET usage_count = usage_count + 1,
           updated_at = NOW()
       WHERE id = $1
       AND deleted_at IS NULL
       RETURNING *`,
      [discountCodeId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Discount code not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error applying discount code:', error);
    throw new AppError('Failed to apply discount code', 500);
  }
};

/**
 * Update discount code
 *
 * @param {string} discountCodeId - Discount code ID
 * @param {string} analystId - Analyst ID (for ownership verification)
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated discount code
 */
const update = async (discountCodeId, analystId, updates) => {
  try {
    const allowedFields = [
      'code_name',
      'code_description',
      'is_active',
      'usage_limit',
      'valid_from',
      'valid_until'
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

    values.push(discountCodeId);
    values.push(analystId);

    const result = await query(
      `UPDATE discount_codes
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       AND analyst_id = $${paramCount + 1}
       AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Discount code not found or you do not have permission to update it', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating discount code:', error);
    throw new AppError('Failed to update discount code', 500);
  }
};

/**
 * Soft delete discount code
 *
 * @param {string} discountCodeId - Discount code ID
 * @param {string} analystId - Analyst ID (for ownership verification)
 * @returns {Promise<void>}
 */
const softDelete = async (discountCodeId, analystId) => {
  try {
    const result = await query(
      `UPDATE discount_codes
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       AND analyst_id = $2
       AND deleted_at IS NULL
       RETURNING id`,
      [discountCodeId, analystId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Discount code not found or you do not have permission to delete it', 404);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error deleting discount code:', error);
    throw new AppError('Failed to delete discount code', 500);
  }
};

/**
 * Get discount code usage statistics
 *
 * @param {string} discountCodeId - Discount code ID
 * @param {string} analystId - Analyst ID (for ownership verification)
 * @returns {Promise<Object>} - Usage statistics
 */
const getUsageStats = async (discountCodeId, analystId) => {
  try {
    const result = await query(
      `SELECT
        dc.id,
        dc.code,
        dc.code_name,
        dc.discount_type,
        dc.discount_value,
        dc.usage_count,
        dc.usage_limit,
        dc.valid_from,
        dc.valid_until,
        dc.created_at,
        -- Calculate total revenue with this code
        COALESCE(SUM(s.final_price), 0) as total_revenue_paise,
        ROUND(COALESCE(SUM(s.final_price), 0)::DECIMAL / 100, 2) as total_revenue_inr,
        -- Calculate total discount given
        COALESCE(SUM(s.discount_applied), 0) as total_discount_given_paise,
        ROUND(COALESCE(SUM(s.discount_applied), 0)::DECIMAL / 100, 2) as total_discount_given_inr,
        -- Count active subscriptions using this code
        COUNT(s.id) FILTER (WHERE s.status = 'active') as active_subscriptions,
        COUNT(s.id) as total_subscriptions
      FROM discount_codes dc
      LEFT JOIN subscriptions s ON dc.id = s.discount_code_used AND s.deleted_at IS NULL
      WHERE dc.id = $1
      AND dc.analyst_id = $2
      AND dc.deleted_at IS NULL
      GROUP BY dc.id`,
      [discountCodeId, analystId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Discount code not found or you do not have permission to view statistics', 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error getting discount code usage stats:', error);
    throw new AppError('Failed to fetch discount code statistics', 500);
  }
};

/**
 * Get discount codes summary for analyst
 *
 * @param {string} analystId - Analyst ID
 * @returns {Promise<Object>} - Summary statistics
 */
const getSummary = async (analystId) => {
  try {
    const result = await query(
      `SELECT
        COUNT(*) as total_codes,
        COUNT(*) FILTER (WHERE is_active = true) as active_codes,
        SUM(usage_count) as total_usage,
        -- Calculate total discount given across all codes
        COALESCE(
          (SELECT SUM(discount_applied)
           FROM subscriptions s
           WHERE s.discount_code_used IN (
             SELECT id FROM discount_codes WHERE analyst_id = $1 AND deleted_at IS NULL
           )
           AND s.deleted_at IS NULL),
          0
        ) as total_discount_given_paise,
        -- Calculate total revenue from discount code subscriptions
        COALESCE(
          (SELECT SUM(final_price)
           FROM subscriptions s
           WHERE s.discount_code_used IN (
             SELECT id FROM discount_codes WHERE analyst_id = $1 AND deleted_at IS NULL
           )
           AND s.deleted_at IS NULL),
          0
        ) as total_revenue_paise
      FROM discount_codes
      WHERE analyst_id = $1
      AND deleted_at IS NULL`,
      [analystId]
    );

    const stats = result.rows[0];

    return {
      ...stats,
      total_discount_given_inr: Math.round(stats.total_discount_given_paise / 100 * 100) / 100,
      total_revenue_inr: Math.round(stats.total_revenue_paise / 100 * 100) / 100
    };
  } catch (error) {
    console.error('Error getting discount codes summary:', error);
    throw new AppError('Failed to fetch discount codes summary', 500);
  }
};

module.exports = {
  create,
  findByCode,
  findById,
  findByAnalystId,
  validateDiscountCode,
  calculateDiscountAmount,
  applyDiscountCode,
  update,
  softDelete,
  getUsageStats,
  getSummary
};
