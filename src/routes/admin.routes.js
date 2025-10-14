/**
 * Admin Routes
 *
 * Handles admin dashboard, analyst verification, and platform management
 *
 * ENDPOINTS:
 * - GET /api/admin/verification-queue - Get pending analyst verifications
 * - GET /api/admin/analysts/:id/documents - View analyst documents
 * - POST /api/admin/analysts/:id/approve - Approve analyst verification
 * - POST /api/admin/analysts/:id/reject - Reject analyst verification
 * - PUT /api/admin/analysts/:id/status - Update analyst status (in_review)
 * - GET /api/admin/analytics - Get platform analytics
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { adminLimiter, standardLimiter } = require('../middleware/rateLimiter');
const { validateId, validatePagination } = require('../middleware/validation');

// Import controller
const adminController = require('../controllers/adminController');

/**
 * @route   GET /api/admin/verification-queue
 * @desc    Get analysts pending verification
 * @access  Private (Admin only)
 */
router.get(
  '/verification-queue',
  verifyToken,
  requireAdmin,
  standardLimiter,
  adminController.getVerificationQueue
);

/**
 * @route   GET /api/admin/analysts/:id/documents
 * @desc    View analyst verification documents
 * @access  Private (Admin only)
 */
router.get(
  '/analysts/:id/documents',
  verifyToken,
  requireAdmin,
  validateId('id'),
  adminController.getAnalystDocuments
);

/**
 * @route   POST /api/admin/analysts/:id/approve
 * @desc    Approve analyst verification
 * @access  Private (Admin only)
 */
router.post(
  '/analysts/:id/approve',
  verifyToken,
  requireAdmin,
  validateId('id'),
  adminController.approveAnalyst
);

/**
 * @route   POST /api/admin/analysts/:id/reject
 * @desc    Reject analyst verification
 * @access  Private (Admin only)
 */
router.post(
  '/analysts/:id/reject',
  verifyToken,
  requireAdmin,
  validateId('id'),
  adminController.rejectAnalyst
);

/**
 * @route   PUT /api/admin/analysts/:id/status
 * @desc    Update analyst verification status
 * @access  Private (Admin only)
 */
router.put(
  '/analysts/:id/status',
  verifyToken,
  requireAdmin,
  validateId('id'),
  adminController.updateAnalystStatus
);

/**
 * @route   GET /api/admin/analytics
 * @desc    Get platform analytics and reports
 * @access  Private (Admin only)
 */
router.get(
  '/analytics',
  verifyToken,
  requireAdmin,
  standardLimiter,
  adminController.getAnalytics
);

/**
 * Legacy routes (kept for backward compatibility)
 */

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard statistics - DEPRECATED
 * @access  Private (Admin only)
 * @deprecated Use GET /api/admin/analytics instead
 */
router.get('/dashboard', verifyToken, requireAdmin, (req, res) => {
  // Redirect to analytics endpoint
  adminController.getAnalytics(req, res);
});

/**
 * @route   GET /api/admin/analysts/pending-verification
 * @desc    Get analysts pending verification - DEPRECATED
 * @access  Private (Admin only)
 * @deprecated Use GET /api/admin/verification-queue instead
 */
router.get('/analysts/pending-verification', verifyToken, requireAdmin, validatePagination(), (req, res) => {
  // Redirect to verification-queue endpoint
  adminController.getVerificationQueue(req, res);
});

/**
 * @route   POST /api/admin/analysts/:analystId/approve
 * @desc    Approve analyst verification - DEPRECATED (analystId param)
 * @access  Private (Admin only)
 * @deprecated Use POST /api/admin/analysts/:id/approve instead
 */
router.post('/analysts/:analystId/approve', verifyToken, requireAdmin, validateId('analystId'), (req, res) => {
  // Map analystId to id for consistency
  req.params.id = req.params.analystId;
  adminController.approveAnalyst(req, res);
});

/**
 * @route   POST /api/admin/analysts/:analystId/reject
 * @desc    Reject analyst verification - DEPRECATED (analystId param)
 * @access  Private (Admin only)
 * @deprecated Use POST /api/admin/analysts/:id/reject instead
 */
router.post('/analysts/:analystId/reject', verifyToken, requireAdmin, validateId('analystId'), (req, res) => {
  // Map analystId to id for consistency
  req.params.id = req.params.analystId;
  adminController.rejectAnalyst(req, res);
});

/**
 * Future endpoints (to be implemented)
 */

/**
 * @route   GET /api/admin/users
 * @desc    Get all users (with filters)
 * @access  Private (Admin only)
 */
router.get('/users', verifyToken, requireAdmin, validatePagination(), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Get all users endpoint - Implementation pending'
  });
});

/**
 * @route   PUT /api/admin/users/:userId/suspend
 * @desc    Suspend user account
 * @access  Private (Admin only)
 */
router.put('/users/:userId/suspend', verifyToken, requireAdmin, validateId('userId'), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Suspend user endpoint - Implementation pending'
  });
});

/**
 * @route   PUT /api/admin/users/:userId/activate
 * @desc    Activate suspended user account
 * @access  Private (Admin only)
 */
router.put('/users/:userId/activate', verifyToken, requireAdmin, validateId('userId'), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Activate user endpoint - Implementation pending'
  });
});

/**
 * @route   DELETE /api/admin/posts/:postId
 * @desc    Delete any post (moderation)
 * @access  Private (Admin only)
 */
router.delete('/posts/:postId', verifyToken, requireAdmin, validateId('postId'), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Delete post endpoint - Implementation pending'
  });
});

/**
 * @route   GET /api/admin/reports
 * @desc    Get platform analytics and reports - DEPRECATED
 * @access  Private (Admin only)
 * @deprecated Use GET /api/admin/analytics instead
 */
router.get('/reports', verifyToken, requireAdmin, (req, res) => {
  adminController.getAnalytics(req, res);
});

/**
 * @route   GET /api/admin/subscriptions
 * @desc    Get all subscriptions with filters
 * @access  Private (Admin only)
 */
router.get('/subscriptions', verifyToken, requireAdmin, validatePagination(), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Get all subscriptions endpoint - Implementation pending'
  });
});

/**
 * @route   GET /api/admin/payments
 * @desc    Get all payments with filters
 * @access  Private (Admin only)
 */
router.get('/payments', verifyToken, requireAdmin, validatePagination(), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Get all payments endpoint - Implementation pending'
  });
});

module.exports = router;
