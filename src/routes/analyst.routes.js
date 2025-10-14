/**
 * Analyst Routes
 *
 * Handles analyst profile management, discovery, verification, and dashboard
 *
 * ENDPOINTS:
 * - POST /api/analysts/apply - Submit verification application
 * - POST /api/analysts/documents/upload - Upload verification documents
 * - POST /api/analysts/profile/photo - Upload profile photo
 * - GET /api/analysts/profile/me - Get own profile (private)
 * - GET /api/analysts/profile/:id - Get public analyst profile
 * - PUT /api/analysts/profile - Update own profile
 * - POST /api/analysts/profile/setup - Complete profile setup wizard
 * - GET /api/analysts/dashboard - Get private dashboard
 * - GET /api/analysts/discovery - Discovery page with filters
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireAnalyst, optionalAuth } = require('../middleware/auth');
const { standardLimiter, searchLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { validateId, validateUUID } = require('../middleware/validation');
const { uploadDocument, uploadProfileImage } = require('../middleware/upload');

// Import controller
const analystController = require('../controllers/analystController');

/**
 * @route   POST /api/analysts/apply
 * @desc    Submit analyst verification application
 * @access  Private (Authenticated users only)
 */
router.post(
  '/apply',
  verifyToken,
  standardLimiter,
  analystController.applyForVerification
);

/**
 * @route   POST /api/analysts/documents/upload
 * @desc    Upload verification documents (SEBI cert, PAN, bank statement)
 * @access  Private (Analysts only)
 */
router.post(
  '/documents/upload',
  verifyToken,
  requireAnalyst,
  uploadLimiter,
  uploadDocument,
  analystController.uploadDocument
);

/**
 * @route   POST /api/analysts/profile/photo
 * @desc    Upload profile photo
 * @access  Private (Analysts only)
 */
router.post(
  '/profile/photo',
  verifyToken,
  requireAnalyst,
  uploadLimiter,
  uploadProfileImage,
  analystController.uploadProfilePhoto
);

/**
 * @route   GET /api/analysts/profile/me
 * @desc    Get own analyst profile (private view)
 * @access  Private (Analysts only)
 */
router.get(
  '/profile/me',
  verifyToken,
  requireAnalyst,
  analystController.getMyProfile
);

/**
 * @route   GET /api/analysts/profile/:id
 * @desc    Get analyst profile by ID (public view)
 * @access  Public
 */
router.get(
  '/profile/:id',
  optionalAuth,
  validateUUID('id'),
  analystController.getPublicProfile
);

/**
 * @route   PUT /api/analysts/profile
 * @desc    Update own analyst profile
 * @access  Private (Analysts only)
 */
router.put(
  '/profile',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  analystController.updateProfile
);

/**
 * @route   POST /api/analysts/profile/setup
 * @desc    Complete profile setup wizard
 * @access  Private (Analysts only)
 */
router.post(
  '/profile/setup',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  analystController.completeProfileSetup
);

/**
 * @route   GET /api/analysts/dashboard
 * @desc    Get private analyst dashboard
 * @access  Private (Analysts only)
 */
router.get(
  '/dashboard',
  verifyToken,
  requireAnalyst,
  analystController.getDashboard
);

/**
 * @route   GET /api/analysts/discovery
 * @desc    Get analysts for discovery page (with filters)
 * @access  Public
 */
router.get(
  '/discovery',
  searchLimiter,
  analystController.getDiscoveryList
);

/**
 * Legacy routes (kept for backward compatibility)
 * TODO: Update frontend to use new routes, then remove these
 */

/**
 * @route   GET /api/analysts
 * @desc    Get all analysts (discovery page) - DEPRECATED
 * @access  Public
 * @deprecated Use GET /api/analysts/discovery instead
 */
router.get('/', searchLimiter, (req, res) => {
  // Redirect to discovery endpoint
  req.url = '/discovery';
  analystController.getDiscoveryList(req, res);
});

/**
 * @route   GET /api/analysts/:id
 * @desc    Get analyst profile by ID - DEPRECATED
 * @access  Public
 * @deprecated Use GET /api/analysts/profile/:id instead
 */
router.get('/:id', optionalAuth, validateUUID('id'), (req, res) => {
  // This conflicts with /discovery, so it's disabled
  // Frontend should use /api/analysts/profile/:id instead
  res.status(400).json({
    success: false,
    message: 'Please use /api/analysts/profile/:id to fetch analyst profiles'
  });
});

/**
 * Future endpoints (to be implemented)
 */

/**
 * @route   GET /api/analysts/:id/posts
 * @desc    Get all posts by analyst
 * @access  Public
 */
router.get('/:id/posts', optionalAuth, validateUUID('id'), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Get analyst posts endpoint - Implementation pending'
  });
});

/**
 * @route   GET /api/analysts/:id/reviews
 * @desc    Get all reviews for analyst
 * @access  Public
 */
router.get('/:id/reviews', validateUUID('id'), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Get analyst reviews endpoint - Implementation pending'
  });
});

/**
 * @route   GET /api/analysts/:id/subscribers
 * @desc    Get analyst subscribers count and list
 * @access  Private (Analyst only - own profile)
 */
router.get('/:id/subscribers', verifyToken, requireAnalyst, validateUUID('id'), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Get analyst subscribers endpoint - Implementation pending'
  });
});

module.exports = router;
