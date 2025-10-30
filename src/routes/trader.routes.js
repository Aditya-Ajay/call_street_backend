/**
 * Trader Routes
 *
 * Handles trader profile management, onboarding, and dashboard
 *
 * ENDPOINTS:
 * - POST /api/traders/onboard - Complete trader onboarding
 * - GET /api/traders/profile/me - Get own profile (private)
 * - PUT /api/traders/profile - Update own profile
 * - GET /api/traders/dashboard - Get trader dashboard
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireTrader } = require('../middleware/auth');
const { standardLimiter } = require('../middleware/rateLimiter');

// Import controller
const traderController = require('../controllers/traderController');

/**
 * @route   POST /api/traders/onboard
 * @desc    Complete trader onboarding and profile setup
 * @access  Private (Authenticated traders only)
 */
router.post(
  '/onboard',
  verifyToken,
  requireTrader,
  standardLimiter,
  traderController.completeOnboarding
);

/**
 * @route   GET /api/traders/profile/me
 * @desc    Get own trader profile (private view)
 * @access  Private (Traders only)
 */
router.get(
  '/profile/me',
  verifyToken,
  requireTrader,
  traderController.getMyProfile
);

/**
 * @route   PUT /api/traders/profile
 * @desc    Update own trader profile
 * @access  Private (Traders only)
 */
router.put(
  '/profile',
  verifyToken,
  requireTrader,
  standardLimiter,
  traderController.updateProfile
);

/**
 * @route   GET /api/traders/dashboard
 * @desc    Get trader dashboard
 * @access  Private (Traders only)
 */
router.get(
  '/dashboard',
  verifyToken,
  requireTrader,
  traderController.getDashboard
);

module.exports = router;
