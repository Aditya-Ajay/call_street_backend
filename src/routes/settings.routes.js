/**
 * Settings Routes
 *
 * Handles analyst settings endpoints:
 * - Profile settings (display name, bio, photo, etc.)
 * - Pricing tiers management (CRUD)
 * - Preferences (notifications, privacy, etc.)
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireAnalyst } = require('../middleware/auth');
const { standardLimiter } = require('../middleware/rateLimiter');
const { validateId } = require('../middleware/validation');

// Import controllers
const settingsController = require('../controllers/settingsController');

// ============================================
// PROFILE SETTINGS
// ============================================

/**
 * @route   GET /api/settings/profile
 * @desc    Get analyst profile settings
 * @access  Private (Analyst only)
 *
 * Returns:
 * - Display name
 * - Bio
 * - Photo URL
 * - Specializations
 * - Languages
 * - SEBI/RIA numbers
 * - Years of experience
 * - Free subscriber settings
 */
router.get(
  '/profile',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  settingsController.getProfileSettings
);

/**
 * @route   PUT /api/settings/profile
 * @desc    Update analyst profile settings
 * @access  Private (Analyst only)
 *
 * Body:
 * - display_name: string (optional)
 * - bio: string (optional)
 * - photo_url: string (optional)
 * - specializations: array (optional)
 * - languages: array (optional)
 * - years_of_experience: number (optional)
 * - allow_free_subscribers: boolean (optional)
 */
router.put(
  '/profile',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  settingsController.updateProfileSettings
);

// ============================================
// PRICING TIERS MANAGEMENT
// ============================================

/**
 * @route   GET /api/settings/pricing-tiers
 * @desc    Get all pricing tiers for the analyst (including inactive)
 * @access  Private (Analyst only)
 */
router.get(
  '/pricing-tiers',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  settingsController.getPricingTiers
);

/**
 * @route   POST /api/settings/pricing-tiers
 * @desc    Create a new pricing tier
 * @access  Private (Analyst only)
 *
 * Body:
 * - tier_name: string (required)
 * - tier_description: string (optional)
 * - price_monthly: number (required for paid tiers)
 * - price_yearly: number (optional)
 * - features: array (optional)
 * - posts_per_day: number (optional)
 * - chat_access: boolean (optional, default: false)
 * - priority_support: boolean (optional, default: false)
 * - is_free_tier: boolean (optional, default: false)
 * - max_subscribers: number (optional)
 * - tier_order: number (optional, default: 0)
 */
router.post(
  '/pricing-tiers',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  settingsController.createPricingTier
);

/**
 * @route   PUT /api/settings/pricing-tiers/:id
 * @desc    Update a pricing tier
 * @access  Private (Analyst only - own tiers)
 *
 * Body:
 * - tier_name: string (optional)
 * - tier_description: string (optional)
 * - tier_order: number (optional)
 * - price_monthly: number (optional)
 * - price_yearly: number (optional)
 * - features: array (optional)
 * - posts_per_day: number (optional)
 * - chat_access: boolean (optional)
 * - priority_support: boolean (optional)
 * - max_subscribers: number (optional)
 * - is_active: boolean (optional)
 */
router.put(
  '/pricing-tiers/:id',
  verifyToken,
  requireAnalyst,
  validateId('id'),
  standardLimiter,
  settingsController.updatePricingTier
);

/**
 * @route   DELETE /api/settings/pricing-tiers/:id
 * @desc    Delete (soft delete) a pricing tier
 * @access  Private (Analyst only - own tiers)
 *
 * Note: Cannot delete tiers with active subscriptions
 */
router.delete(
  '/pricing-tiers/:id',
  verifyToken,
  requireAnalyst,
  validateId('id'),
  standardLimiter,
  settingsController.deletePricingTier
);

// ============================================
// PREFERENCES
// ============================================

/**
 * @route   GET /api/settings/preferences
 * @desc    Get analyst preferences (notifications, privacy, etc.)
 * @access  Private (Analyst only)
 */
router.get(
  '/preferences',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  settingsController.getPreferences
);

/**
 * @route   PUT /api/settings/preferences
 * @desc    Update analyst preferences
 * @access  Private (Analyst only)
 *
 * Body:
 * - email_notifications: boolean (optional)
 * - push_notifications: boolean (optional)
 * - sms_notifications: boolean (optional)
 * - marketing_emails: boolean (optional)
 * - privacy_settings: object (optional)
 */
router.put(
  '/preferences',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  settingsController.updatePreferences
);

module.exports = router;
