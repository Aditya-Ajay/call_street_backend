/**
 * Review Routes
 *
 * Handles all review-related endpoints with proper validation and authentication
 * Routes: submit, get, edit, delete, vote helpful, analyst respond, my-reviews, report
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');

// Import middleware
const { verifyToken, requireRole, requireAnalyst } = require('../middleware/auth');
const { standardLimiter } = require('../middleware/rateLimiter');

// Import controller
const reviewController = require('../controllers/reviewController');


/**
 * Validation middleware helper
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * UUID validation helper
 */
const validateUUID = (fieldName) => {
  return param(fieldName)
    .trim()
    .notEmpty()
    .withMessage(`${fieldName} is required`)
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage(`Invalid ${fieldName} format`);
};

/**
 * NOTE: Specific routes MUST come before parameterized routes
 * Order matters in Express routing!
 */

/**
 * @route   POST /api/reviews/submit
 * @desc    Submit a review for an analyst (requires 30+ day subscription)
 * @access  Private (Trader)
 */
router.post(
  '/submit',
  verifyToken,
  standardLimiter,
  [
    body('analystId')
      .trim()
      .notEmpty()
      .withMessage('Analyst ID is required')
      .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      .withMessage('Invalid analyst ID format'),
    body('rating')
      .notEmpty()
      .withMessage('Rating is required')
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5'),
    body('reviewTitle')
      .optional()
      .trim()
      .isLength({ min: 5, max: 255 })
      .withMessage('Review title must be 5-255 characters'),
    body('reviewText')
      .optional()
      .trim()
      .isLength({ min: 50, max: 1000 })
      .withMessage('Review text must be 50-1000 characters'),
    body('isAnonymous')
      .optional()
      .isBoolean()
      .withMessage('isAnonymous must be boolean')
  ],
  handleValidationErrors,
  reviewController.submitReview
);

/**
 * @route   GET /api/reviews/my-reviews
 * @desc    Get current user's reviews
 * @access  Private
 */
router.get(
  '/my-reviews',
  verifyToken,
  reviewController.getMyReviews
);

/**
 * @route   GET /api/reviews/moderation/flagged
 * @desc    Get all flagged reviews for moderation
 * @access  Private (Admin only)
 */
router.get(
  '/moderation/flagged',
  verifyToken,
  requireRole('admin'),
  reviewController.getFlaggedReviews
);

/**
 * @route   GET /api/reviews/analyst/:analystId
 * @desc    Get all reviews for an analyst with sorting and pagination
 * @access  Public
 */
router.get(
  '/analyst/:analystId',
  [
    validateUUID('analystId'),
    query('sortBy')
      .optional()
      .isIn(['helpfulness', 'recent', 'highest', 'lowest'])
      .withMessage('Invalid sort option'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative')
  ],
  handleValidationErrors,
  reviewController.getAnalystReviews
);

/**
 * @route   PUT /api/reviews/:id
 * @desc    Edit own review
 * @access  Private (Review owner)
 */
router.put(
  '/:id',
  verifyToken,
  standardLimiter,
  [
    validateUUID('id'),
    body('rating')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5'),
    body('reviewTitle')
      .optional()
      .trim()
      .isLength({ min: 5, max: 255 })
      .withMessage('Review title must be 5-255 characters'),
    body('reviewText')
      .optional()
      .trim()
      .isLength({ min: 50, max: 1000 })
      .withMessage('Review text must be 50-1000 characters'),
    body('isAnonymous')
      .optional()
      .isBoolean()
      .withMessage('isAnonymous must be boolean')
  ],
  handleValidationErrors,
  reviewController.editReview
);

/**
 * @route   DELETE /api/reviews/:id
 * @desc    Delete own review
 * @access  Private (Review owner or Admin)
 */
router.delete(
  '/:id',
  verifyToken,
  validateUUID('id'),
  handleValidationErrors,
  reviewController.deleteReview
);

/**
 * @route   POST /api/reviews/:id/helpful
 * @desc    Vote review as helpful (toggle on/off)
 * @access  Private
 */
router.post(
  '/:id/helpful',
  verifyToken,
  standardLimiter,
  [
    validateUUID('id'),
    body('vote')
      .notEmpty()
      .withMessage('Vote parameter is required')
      .isBoolean()
      .withMessage('Vote must be true or false')
  ],
  handleValidationErrors,
  reviewController.voteHelpful
);

/**
 * @route   POST /api/reviews/:id/respond
 * @desc    Analyst responds to review
 * @access  Private (Analyst only)
 */
router.post(
  '/:id/respond',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  [
    validateUUID('id'),
    body('response')
      .trim()
      .notEmpty()
      .withMessage('Response text is required')
      .isLength({ min: 10, max: 500 })
      .withMessage('Response must be 10-500 characters')
  ],
  handleValidationErrors,
  reviewController.respondToReview
);

/**
 * @route   PUT /api/reviews/:id/respond
 * @desc    Edit analyst response
 * @access  Private (Analyst only)
 */
router.put(
  '/:id/respond',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  [
    validateUUID('id'),
    body('response')
      .trim()
      .notEmpty()
      .withMessage('Response text is required')
      .isLength({ min: 10, max: 500 })
      .withMessage('Response must be 10-500 characters')
  ],
  handleValidationErrors,
  reviewController.editResponse
);

/**
 * @route   DELETE /api/reviews/:id/respond
 * @desc    Delete analyst response
 * @access  Private (Analyst only)
 */
router.delete(
  '/:id/respond',
  verifyToken,
  requireAnalyst,
  validateUUID('id'),
  handleValidationErrors,
  reviewController.deleteResponse
);

/**
 * @route   POST /api/reviews/:id/report
 * @desc    Report review as spam/fake/abusive
 * @access  Private
 */
router.post(
  '/:id/report',
  verifyToken,
  standardLimiter,
  [
    validateUUID('id'),
    body('reason')
      .trim()
      .notEmpty()
      .withMessage('Report reason is required')
      .isIn(['spam', 'fake', 'abusive', 'inappropriate'])
      .withMessage('Invalid report reason')
  ],
  handleValidationErrors,
  reviewController.reportReview
);

/**
 * @route   POST /api/reviews/:id/moderate
 * @desc    Moderate a flagged review (approve or reject)
 * @access  Private (Admin only)
 */
router.post(
  '/:id/moderate',
  verifyToken,
  requireRole('admin'),
  [
    validateUUID('id'),
    body('action')
      .trim()
      .notEmpty()
      .withMessage('Action is required')
      .isIn(['approve', 'reject'])
      .withMessage('Action must be "approve" or "reject"')
  ],
  handleValidationErrors,
  reviewController.moderateReview
);

module.exports = router;
