/**
 * Invite Link Routes
 *
 * Handles invite link generation, tracking, and discount code management
 * Core to zero-CAC growth strategy where analysts bring their own audiences
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireAnalyst } = require('../middleware/auth');
const { standardLimiter, authLimiter } = require('../middleware/rateLimiter');
const { validateId } = require('../middleware/validation');

// Import controllers
const inviteController = require('../controllers/inviteController');

// ============================================
// ANALYST ROUTES (Invite Link Management)
// NOTE: These specific routes MUST come before parameterized routes like /:code
// ============================================

/**
 * @route   POST /api/invites/generate
 * @desc    Generate new invite link
 * @access  Private (Analyst only)
 */
router.post('/generate', verifyToken, requireAnalyst, standardLimiter, inviteController.generateInviteLink);

/**
 * @route   GET /api/invites/my-links
 * @desc    Get all invite links for authenticated analyst
 * @access  Private (Analyst only)
 */
router.get('/my-links', verifyToken, requireAnalyst, standardLimiter, inviteController.getMyInviteLinks);

/**
 * @route   GET /api/invites/summary
 * @desc    Get invite link summary and top performers
 * @access  Private (Analyst only)
 */
router.get('/summary', verifyToken, requireAnalyst, standardLimiter, inviteController.getInviteSummary);

// ============================================
// DISCOUNT CODE ROUTES
// NOTE: These specific routes MUST come before parameterized routes
// ============================================

/**
 * @route   POST /api/invites/discount-codes
 * @desc    Create new discount code
 * @access  Private (Analyst only)
 */
router.post('/discount-codes', verifyToken, requireAnalyst, standardLimiter, inviteController.createDiscountCode);

/**
 * @route   GET /api/invites/discount-codes
 * @desc    Get all discount codes for authenticated analyst
 * @access  Private (Analyst only)
 */
router.get('/discount-codes', verifyToken, requireAnalyst, standardLimiter, inviteController.getMyDiscountCodes);

/**
 * @route   POST /api/invites/discount-codes/validate
 * @desc    Validate discount code for subscription
 * @access  Private (Authenticated users)
 */
router.post('/discount-codes/validate', verifyToken, standardLimiter, inviteController.validateDiscountCodePublic);

/**
 * @route   GET /api/invites/discount-codes/:id/stats
 * @desc    Get discount code usage statistics
 * @access  Private (Analyst only, own codes)
 */
router.get('/discount-codes/:id/stats', verifyToken, requireAnalyst, validateId('id'), standardLimiter, inviteController.getDiscountCodeStats);

/**
 * @route   PUT /api/invites/discount-codes/:id
 * @desc    Update discount code
 * @access  Private (Analyst only, own codes)
 */
router.put('/discount-codes/:id', verifyToken, requireAnalyst, validateId('id'), standardLimiter, inviteController.updateDiscountCode);

/**
 * @route   DELETE /api/invites/discount-codes/:id
 * @desc    Delete discount code (soft delete)
 * @access  Private (Analyst only, own codes)
 */
router.delete('/discount-codes/:id', verifyToken, requireAnalyst, validateId('id'), standardLimiter, inviteController.deleteDiscountCode);

// ============================================
// PUBLIC ROUTES (No authentication required)
// NOTE: Parameterized routes like /:code MUST come after specific routes
// ============================================

/**
 * @route   GET /api/invites/:code
 * @desc    Get invite link details (validate invite code)
 * @access  Public
 */
router.get('/:code', standardLimiter, inviteController.getInviteDetails);

/**
 * @route   POST /api/invites/:code/track-click
 * @desc    Track click on invite link
 * @access  Public (with rate limiting to prevent abuse)
 */
router.post('/:code/track-click', authLimiter, inviteController.trackClick);

// ============================================
// INVITE LINK SPECIFIC OPERATIONS (with ID param)
// NOTE: These come last since they use :id parameter
// ============================================

/**
 * @route   GET /api/invites/:id/analytics
 * @desc    Get detailed analytics for specific invite link
 * @access  Private (Analyst only, own links)
 */
router.get('/:id/analytics', verifyToken, requireAnalyst, validateId('id'), standardLimiter, inviteController.getInviteAnalytics);

/**
 * @route   PUT /api/invites/:id
 * @desc    Update invite link
 * @access  Private (Analyst only, own links)
 */
router.put('/:id', verifyToken, requireAnalyst, validateId('id'), standardLimiter, inviteController.updateInviteLink);

/**
 * @route   DELETE /api/invites/:id
 * @desc    Delete invite link (soft delete)
 * @access  Private (Analyst only, own links)
 */
router.delete('/:id', verifyToken, requireAnalyst, validateId('id'), standardLimiter, inviteController.deleteInviteLink);

module.exports = router;
