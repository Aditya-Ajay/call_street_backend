/**
 * Settings Controller
 *
 * Handles analyst settings including:
 * - Profile settings (display name, bio, photo, etc.)
 * - Pricing tiers management (create, update, delete)
 * - Preferences (notifications, privacy, etc.)
 *
 * SECURITY:
 * - Only analysts can access settings endpoints
 * - Analysts can only modify their own settings
 * - All inputs validated and sanitized
 */

const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const AnalystProfile = require('../models/AnalystProfile');

/**
 * GET /api/settings/profile
 * Get analyst profile settings
 *
 * @access Private (Analyst only)
 */
const getProfileSettings = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Verify user is an analyst
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can access profile settings', 403);
  }

  // Get analyst profile
  const profile = await AnalystProfile.findByUserId(userId);

  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  res.status(200).json({
    success: true,
    message: 'Profile settings fetched successfully',
    data: {
      profile: {
        id: profile.id,
        display_name: profile.display_name,
        bio: profile.bio,
        photo_url: profile.photo_url,
        specializations: profile.specializations,
        languages: profile.languages,
        sebi_number: profile.sebi_number,
        ria_number: profile.ria_number,
        country: profile.country,
        years_of_experience: profile.years_of_experience,
        allow_free_subscribers: profile.allow_free_subscribers,
        verification_status: profile.verification_status,
        invite_link_code: profile.invite_link_code
      }
    }
  });
});

/**
 * PUT /api/settings/profile
 * Update analyst profile settings
 *
 * @access Private (Analyst only)
 */
const updateProfileSettings = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Verify user is an analyst
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can update profile settings', 403);
  }

  // Get analyst profile
  const profile = await AnalystProfile.findByUserId(userId);

  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  // Extract allowed update fields
  const {
    display_name,
    bio,
    photo_url,
    specializations,
    languages,
    years_of_experience,
    allow_free_subscribers
  } = req.body;

  // Build update object
  const updateData = {};
  if (display_name !== undefined) updateData.display_name = display_name;
  if (bio !== undefined) updateData.bio = bio;
  if (photo_url !== undefined) updateData.photo_url = photo_url;
  if (specializations !== undefined) updateData.specializations = specializations;
  if (languages !== undefined) updateData.languages = languages;
  if (years_of_experience !== undefined) updateData.years_of_experience = years_of_experience;
  if (allow_free_subscribers !== undefined) updateData.allow_free_subscribers = allow_free_subscribers;

  // Validate at least one field is being updated
  if (Object.keys(updateData).length === 0) {
    throw new AppError('No valid fields provided for update', 400);
  }

  // Update profile
  const updatedProfile = await AnalystProfile.update(profile.id, updateData);

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      profile: updatedProfile
    }
  });
});

/**
 * GET /api/settings/pricing-tiers
 * Get all pricing tiers for the analyst
 *
 * @access Private (Analyst only)
 */
const getPricingTiers = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Verify user is an analyst
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can access pricing tiers', 403);
  }

  // Get analyst profile to get analyst_id
  const profile = await AnalystProfile.findByUserId(userId);

  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  // Get all tiers (including inactive ones for settings page)
  const tiersResult = await query(
    `SELECT
      id,
      tier_name,
      tier_description,
      tier_order,
      price_monthly,
      price_yearly,
      currency,
      features,
      posts_per_day,
      chat_access,
      priority_support,
      is_free_tier,
      is_active,
      max_subscribers,
      created_at,
      updated_at
    FROM subscription_tiers
    WHERE analyst_id = $1
    AND deleted_at IS NULL
    ORDER BY tier_order ASC, price_monthly ASC`,
    [userId]
  );

  res.status(200).json({
    success: true,
    message: 'Pricing tiers fetched successfully',
    data: {
      tiers: tiersResult.rows,
      count: tiersResult.rows.length
    }
  });
});

/**
 * POST /api/settings/pricing-tiers
 * Create a new pricing tier
 *
 * @access Private (Analyst only)
 */
const createPricingTier = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Verify user is an analyst
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can create pricing tiers', 403);
  }

  // Validate required fields
  const {
    tier_name,
    tier_description,
    price_monthly,
    price_yearly,
    features = [],
    posts_per_day = null,
    chat_access = false,
    priority_support = false,
    is_free_tier = false,
    max_subscribers = null,
    tier_order = 0
  } = req.body;

  if (!tier_name) {
    throw new AppError('Tier name is required', 400);
  }

  if (!price_monthly && !is_free_tier) {
    throw new AppError('Monthly price is required for paid tiers', 400);
  }

  // Create tier
  const tierResult = await query(
    `INSERT INTO subscription_tiers (
      analyst_id,
      tier_name,
      tier_description,
      tier_order,
      price_monthly,
      price_yearly,
      currency,
      features,
      posts_per_day,
      chat_access,
      priority_support,
      is_free_tier,
      max_subscribers,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
    RETURNING *`,
    [
      userId,
      tier_name,
      tier_description,
      tier_order,
      price_monthly || 0,
      price_yearly || 0,
      'INR',
      JSON.stringify(features),
      posts_per_day,
      chat_access,
      priority_support,
      is_free_tier,
      max_subscribers
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Pricing tier created successfully',
    data: {
      tier: tierResult.rows[0]
    }
  });
});

/**
 * PUT /api/settings/pricing-tiers/:id
 * Update a pricing tier
 *
 * @access Private (Analyst only - own tiers)
 */
const updatePricingTier = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  // Verify user is an analyst
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can update pricing tiers', 403);
  }

  // Get tier and verify ownership
  const tierCheck = await query(
    `SELECT * FROM subscription_tiers
     WHERE id = $1 AND analyst_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );

  if (tierCheck.rows.length === 0) {
    throw new AppError('Pricing tier not found or you do not have permission to update it', 404);
  }

  // Extract update fields
  const {
    tier_name,
    tier_description,
    tier_order,
    price_monthly,
    price_yearly,
    features,
    posts_per_day,
    chat_access,
    priority_support,
    max_subscribers,
    is_active
  } = req.body;

  // Build update query dynamically
  const updates = [];
  const params = [];
  let paramCount = 1;

  if (tier_name !== undefined) {
    updates.push(`tier_name = $${paramCount}`);
    params.push(tier_name);
    paramCount++;
  }
  if (tier_description !== undefined) {
    updates.push(`tier_description = $${paramCount}`);
    params.push(tier_description);
    paramCount++;
  }
  if (tier_order !== undefined) {
    updates.push(`tier_order = $${paramCount}`);
    params.push(tier_order);
    paramCount++;
  }
  if (price_monthly !== undefined) {
    updates.push(`price_monthly = $${paramCount}`);
    params.push(price_monthly);
    paramCount++;
  }
  if (price_yearly !== undefined) {
    updates.push(`price_yearly = $${paramCount}`);
    params.push(price_yearly);
    paramCount++;
  }
  if (features !== undefined) {
    updates.push(`features = $${paramCount}`);
    params.push(JSON.stringify(features));
    paramCount++;
  }
  if (posts_per_day !== undefined) {
    updates.push(`posts_per_day = $${paramCount}`);
    params.push(posts_per_day);
    paramCount++;
  }
  if (chat_access !== undefined) {
    updates.push(`chat_access = $${paramCount}`);
    params.push(chat_access);
    paramCount++;
  }
  if (priority_support !== undefined) {
    updates.push(`priority_support = $${paramCount}`);
    params.push(priority_support);
    paramCount++;
  }
  if (max_subscribers !== undefined) {
    updates.push(`max_subscribers = $${paramCount}`);
    params.push(max_subscribers);
    paramCount++;
  }
  if (is_active !== undefined) {
    updates.push(`is_active = $${paramCount}`);
    params.push(is_active);
    paramCount++;
  }

  if (updates.length === 0) {
    throw new AppError('No valid fields provided for update', 400);
  }

  // Add updated_at
  updates.push(`updated_at = NOW()`);

  // Add tier ID and analyst ID for WHERE clause
  params.push(id, userId);

  const sql = `
    UPDATE subscription_tiers
    SET ${updates.join(', ')}
    WHERE id = $${paramCount} AND analyst_id = $${paramCount + 1} AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await query(sql, params);

  res.status(200).json({
    success: true,
    message: 'Pricing tier updated successfully',
    data: {
      tier: result.rows[0]
    }
  });
});

/**
 * DELETE /api/settings/pricing-tiers/:id
 * Delete (soft delete) a pricing tier
 *
 * @access Private (Analyst only - own tiers)
 */
const deletePricingTier = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  // Verify user is an analyst
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can delete pricing tiers', 403);
  }

  // Get tier and verify ownership
  const tierCheck = await query(
    `SELECT * FROM subscription_tiers
     WHERE id = $1 AND analyst_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );

  if (tierCheck.rows.length === 0) {
    throw new AppError('Pricing tier not found or you do not have permission to delete it', 404);
  }

  // Check if tier has active subscriptions
  const activeSubsCheck = await query(
    `SELECT COUNT(*) as count FROM subscriptions
     WHERE tier_id = $1 AND status = 'active' AND deleted_at IS NULL`,
    [id]
  );

  if (parseInt(activeSubsCheck.rows[0].count) > 0) {
    throw new AppError('Cannot delete tier with active subscriptions. Please deactivate it instead.', 400);
  }

  // Soft delete tier
  await query(
    `UPDATE subscription_tiers
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND analyst_id = $2`,
    [id, userId]
  );

  res.status(200).json({
    success: true,
    message: 'Pricing tier deleted successfully'
  });
});

/**
 * GET /api/settings/preferences
 * Get analyst preferences (notifications, privacy, etc.)
 *
 * @access Private (Analyst only)
 */
const getPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Verify user is an analyst
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can access preferences', 403);
  }

  // Get user preferences
  const prefsResult = await query(
    `SELECT
      email_notifications,
      push_notifications,
      sms_notifications,
      marketing_emails,
      privacy_settings,
      created_at,
      updated_at
    FROM users
    WHERE id = $1`,
    [userId]
  );

  if (prefsResult.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  res.status(200).json({
    success: true,
    message: 'Preferences fetched successfully',
    data: {
      preferences: prefsResult.rows[0]
    }
  });
});

/**
 * PUT /api/settings/preferences
 * Update analyst preferences
 *
 * @access Private (Analyst only)
 */
const updatePreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Verify user is an analyst
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can update preferences', 403);
  }

  // Extract preference fields
  const {
    email_notifications,
    push_notifications,
    sms_notifications,
    marketing_emails,
    privacy_settings
  } = req.body;

  // Build update query
  const updates = [];
  const params = [];
  let paramCount = 1;

  if (email_notifications !== undefined) {
    updates.push(`email_notifications = $${paramCount}`);
    params.push(email_notifications);
    paramCount++;
  }
  if (push_notifications !== undefined) {
    updates.push(`push_notifications = $${paramCount}`);
    params.push(push_notifications);
    paramCount++;
  }
  if (sms_notifications !== undefined) {
    updates.push(`sms_notifications = $${paramCount}`);
    params.push(sms_notifications);
    paramCount++;
  }
  if (marketing_emails !== undefined) {
    updates.push(`marketing_emails = $${paramCount}`);
    params.push(marketing_emails);
    paramCount++;
  }
  if (privacy_settings !== undefined) {
    updates.push(`privacy_settings = $${paramCount}`);
    params.push(JSON.stringify(privacy_settings));
    paramCount++;
  }

  if (updates.length === 0) {
    throw new AppError('No valid preferences provided for update', 400);
  }

  // Add updated_at
  updates.push(`updated_at = NOW()`);
  params.push(userId);

  const sql = `
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING email_notifications, push_notifications, sms_notifications, marketing_emails, privacy_settings
  `;

  const result = await query(sql, params);

  res.status(200).json({
    success: true,
    message: 'Preferences updated successfully',
    data: {
      preferences: result.rows[0]
    }
  });
});

module.exports = {
  getProfileSettings,
  updateProfileSettings,
  getPricingTiers,
  createPricingTier,
  updatePricingTier,
  deletePricingTier,
  getPreferences,
  updatePreferences
};
