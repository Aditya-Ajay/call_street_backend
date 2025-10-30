/**
 * Trader Controller
 *
 * Handles all trader-related API endpoints including:
 * - Trader onboarding/profile setup
 * - Profile management (CRUD)
 * - Preferences and settings
 * - Trading interests and preferences
 *
 * SECURITY:
 * - Only authenticated traders can manage their own profile
 * - Profile updates require ownership verification
 */

const User = require('../models/User');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { pool } = require('../config/database');

/**
 * POST /api/traders/onboard
 * Complete trader onboarding and profile setup
 *
 * @access Private (Authenticated traders only)
 * @body {string} display_name - Display name (optional)
 * @body {Array<string>} trading_interests - Trading interests (e.g., ['Intraday', 'Options'])
 * @body {Array<string>} preferred_languages - Languages (e.g., ['English', 'Hindi'])
 * @body {string} experience_level - Experience level: 'beginner', 'intermediate', 'advanced'
 * @body {boolean} receive_notifications - Email notifications enabled
 */
const completeOnboarding = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    display_name,
    trading_interests = [],
    preferred_languages = ['English'],
    experience_level = 'beginner',
    receive_notifications = true
  } = req.body;

  // Validation
  const errors = [];

  // Validate display_name (optional, but if provided, must be valid)
  if (display_name && display_name.trim().length < 2) {
    errors.push('Display name must be at least 2 characters');
  }
  if (display_name && display_name.length > 50) {
    errors.push('Display name must be 50 characters or less');
  }

  // Validate trading_interests (optional)
  if (trading_interests.length > 0) {
    const validInterests = ['Intraday', 'Swing', 'Options', 'Investment', 'Technical', 'Fundamental'];
    const invalidInterests = trading_interests.filter(i => !validInterests.includes(i));
    if (invalidInterests.length > 0) {
      errors.push(`Invalid trading interests: ${invalidInterests.join(', ')}`);
    }
  }

  // Validate preferred_languages (at least one required)
  if (!Array.isArray(preferred_languages) || preferred_languages.length === 0) {
    errors.push('At least one language is required');
  } else {
    const validLanguages = ['English', 'Hindi', 'Hinglish', 'Tamil', 'Telugu', 'Gujarati', 'Marathi'];
    const invalidLanguages = preferred_languages.filter(l => !validLanguages.includes(l));
    if (invalidLanguages.length > 0) {
      errors.push(`Invalid languages: ${invalidLanguages.join(', ')}`);
    }
  }

  // Validate experience_level
  const validLevels = ['beginner', 'intermediate', 'advanced'];
  if (!validLevels.includes(experience_level)) {
    errors.push(`Invalid experience level. Allowed: ${validLevels.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new AppError(errors.join('. '), 400);
  }

  // Get user to check if already onboarded
  const user = await User.findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.user_type !== 'trader') {
    throw new AppError('Only traders can complete trader onboarding', 403);
  }

  if (user.profile_completed) {
    throw new AppError('Trader profile already completed', 409);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create trader profile
    const profileResult = await client.query(
      `INSERT INTO trader_profiles (
        user_id,
        display_name,
        trading_interests,
        preferred_languages,
        experience_level,
        receive_notifications,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *`,
      [
        userId,
        display_name?.trim() || null,
        trading_interests,
        preferred_languages,
        experience_level,
        receive_notifications
      ]
    );

    const profile = profileResult.rows[0];

    // Update user table - SET profile_completed = TRUE
    await client.query(
      `UPDATE users SET profile_completed = TRUE, updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: 'Trader onboarding completed successfully! You can now explore analysts and subscribe.',
      data: {
        profile: {
          id: profile.id,
          display_name: profile.display_name,
          trading_interests: profile.trading_interests,
          preferred_languages: profile.preferred_languages,
          experience_level: profile.experience_level,
          receive_notifications: profile.receive_notifications,
          created_at: profile.created_at
        }
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Trader onboarding error:', error);
    throw error;
  } finally {
    client.release();
  }
});

/**
 * GET /api/traders/profile/me
 * Get own trader profile (private view with all details)
 *
 * @access Private (Traders only)
 */
const getMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await pool.query(
    `SELECT * FROM trader_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  const profile = result.rows[0];

  if (!profile) {
    throw new AppError('Trader profile not found', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      profile: {
        id: profile.id,
        user_id: profile.user_id,
        display_name: profile.display_name,
        trading_interests: profile.trading_interests,
        preferred_languages: profile.preferred_languages,
        experience_level: profile.experience_level,
        receive_notifications: profile.receive_notifications,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      }
    }
  });
});

/**
 * PUT /api/traders/profile
 * Update own trader profile
 *
 * @access Private (Traders only)
 * @body {string} display_name - Display name
 * @body {Array<string>} trading_interests - Trading interests
 * @body {Array<string>} preferred_languages - Languages
 * @body {string} experience_level - Experience level
 * @body {boolean} receive_notifications - Email notifications
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    display_name,
    trading_interests,
    preferred_languages,
    experience_level,
    receive_notifications
  } = req.body;

  // Get trader profile
  const checkResult = await pool.query(
    `SELECT * FROM trader_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  if (checkResult.rows.length === 0) {
    throw new AppError('Trader profile not found', 404);
  }

  // Validation
  const updateData = {};
  const errors = [];

  if (display_name !== undefined) {
    if (display_name && display_name.trim().length < 2) {
      errors.push('Display name must be at least 2 characters');
    }
    if (display_name && display_name.length > 50) {
      errors.push('Display name must be 50 characters or less');
    }
    updateData.display_name = display_name?.trim() || null;
  }

  if (trading_interests !== undefined) {
    if (!Array.isArray(trading_interests)) {
      errors.push('Trading interests must be an array');
    } else {
      const validInterests = ['Intraday', 'Swing', 'Options', 'Investment', 'Technical', 'Fundamental'];
      const invalidInterests = trading_interests.filter(i => !validInterests.includes(i));
      if (invalidInterests.length > 0) {
        errors.push(`Invalid trading interests: ${invalidInterests.join(', ')}`);
      }
      updateData.trading_interests = trading_interests;
    }
  }

  if (preferred_languages !== undefined) {
    if (!Array.isArray(preferred_languages) || preferred_languages.length === 0) {
      errors.push('At least one language is required');
    } else {
      const validLanguages = ['English', 'Hindi', 'Hinglish', 'Tamil', 'Telugu', 'Gujarati', 'Marathi'];
      const invalidLanguages = preferred_languages.filter(l => !validLanguages.includes(l));
      if (invalidLanguages.length > 0) {
        errors.push(`Invalid languages: ${invalidLanguages.join(', ')}`);
      }
      updateData.preferred_languages = preferred_languages;
    }
  }

  if (experience_level !== undefined) {
    const validLevels = ['beginner', 'intermediate', 'advanced'];
    if (!validLevels.includes(experience_level)) {
      errors.push(`Invalid experience level. Allowed: ${validLevels.join(', ')}`);
    }
    updateData.experience_level = experience_level;
  }

  if (receive_notifications !== undefined) {
    if (typeof receive_notifications !== 'boolean') {
      errors.push('receive_notifications must be a boolean');
    }
    updateData.receive_notifications = receive_notifications;
  }

  if (errors.length > 0) {
    throw new AppError(errors.join('. '), 400);
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError('No valid fields provided for update', 400);
  }

  // Build dynamic UPDATE query
  const updates = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(updateData)) {
    updates.push(`${key} = $${paramCount}`);
    values.push(value);
    paramCount++;
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  const sql = `
    UPDATE trader_profiles
    SET ${updates.join(', ')}
    WHERE user_id = $${paramCount} AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(sql, values);

  if (result.rows.length === 0) {
    throw new AppError('Trader profile not found', 404);
  }

  const updatedProfile = result.rows[0];

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      profile: {
        id: updatedProfile.id,
        display_name: updatedProfile.display_name,
        trading_interests: updatedProfile.trading_interests,
        preferred_languages: updatedProfile.preferred_languages,
        experience_level: updatedProfile.experience_level,
        receive_notifications: updatedProfile.receive_notifications,
        updated_at: updatedProfile.updated_at
      }
    }
  });
});

/**
 * GET /api/traders/dashboard
 * Get trader dashboard with subscriptions, bookmarks, etc.
 *
 * @access Private (Traders only)
 */
const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get trader profile
  const profileResult = await pool.query(
    `SELECT * FROM trader_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  if (profileResult.rows.length === 0) {
    throw new AppError('Trader profile not found', 404);
  }

  const profile = profileResult.rows[0];

  // Get active subscriptions
  const subscriptionsResult = await pool.query(
    `SELECT
      s.id,
      s.status,
      s.current_period_start,
      s.current_period_end,
      ap.display_name as analyst_name,
      ap.photo_url as analyst_photo,
      st.tier_name,
      st.price_monthly
    FROM subscriptions s
    JOIN analyst_profiles ap ON s.analyst_id = ap.user_id
    JOIN subscription_tiers st ON s.tier_id = st.id
    WHERE s.user_id = $1 AND s.status = 'active'
    ORDER BY s.created_at DESC`,
    [userId]
  );

  // Get bookmarked posts count
  const bookmarksResult = await pool.query(
    `SELECT COUNT(*) as count FROM bookmarks WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  res.status(200).json({
    success: true,
    data: {
      profile,
      subscriptions: subscriptionsResult.rows,
      bookmarks_count: parseInt(bookmarksResult.rows[0].count, 10)
    }
  });
});

module.exports = {
  completeOnboarding,
  getMyProfile,
  updateProfile,
  getDashboard
};
