/**
 * Subscription Routes
 *
 * Handles subscription creation, management, and payment integration
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireTrader } = require('../middleware/auth');
const { paymentLimiter, standardLimiter } = require('../middleware/rateLimiter');
const { subscriptionValidation, validateId, validateUUID, paymentValidation } = require('../middleware/validation');

// Import controllers
const subscriptionController = require('../controllers/subscriptionController');

/**
 * @route   POST /api/subscriptions/webhook
 * @desc    Razorpay webhook for payment events (MUST be first to avoid auth middleware)
 * @access  Public (Razorpay only - verified via signature)
 */
router.post('/webhook', subscriptionController.handleWebhook);

/**
 * @route   GET /api/subscriptions/tiers/:analystId
 * @desc    Get pricing tiers for an analyst
 * @access  Public
 */
router.get('/tiers/:analystId', validateUUID('analystId'), subscriptionController.getPricingTiers);

/**
 * @route   POST /api/subscriptions/create
 * @desc    Create subscription (initiate payment)
 * @access  Private (Trader only)
 */
router.post('/create', verifyToken, requireTrader, paymentLimiter, subscriptionValidation, subscriptionController.createSubscription);

/**
 * @route   GET /api/subscriptions/my-subscriptions
 * @desc    Get all user subscriptions
 * @access  Private (Trader only)
 */
router.get('/my-subscriptions', verifyToken, requireTrader, subscriptionController.getMySubscriptions);

/**
 * @route   GET /api/subscriptions/payment-history
 * @desc    Get user's payment history
 * @access  Private (Trader only)
 */
router.get('/payment-history', verifyToken, requireTrader, subscriptionController.getPaymentHistory);

/**
 * @route   GET /api/subscriptions/export-transactions
 * @desc    Export user's transactions as CSV
 * @access  Private (Trader only)
 */
router.get('/export-transactions', verifyToken, requireTrader, subscriptionController.exportTransactions);

/**
 * @route   GET /api/subscriptions/expiring-soon
 * @desc    Get subscriptions expiring within specified days
 * @access  Private (Trader only)
 */
router.get('/expiring-soon', verifyToken, requireTrader, subscriptionController.getExpiringSoon);

/**
 * @route   GET /api/subscriptions/analyst/:analystId/check
 * @desc    Check subscription status with specific analyst
 * @access  Private
 */
router.get('/analyst/:analystId/check', verifyToken, validateId('analystId'), subscriptionController.checkSubscriptionStatus);

/**
 * @route   GET /api/subscriptions/analyst/:analystId/subscribers
 * @desc    Get list of subscribers for an analyst
 * @access  Private (Analyst only - own subscribers)
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - status: string (default: 'all') - 'all', 'active', 'cancelled', 'suspended'
 */
router.get('/analyst/:analystId/subscribers', verifyToken, validateId('analystId'), subscriptionController.getAnalystSubscribers);

/**
 * @route   GET /api/subscriptions/:id
 * @desc    Get subscription details by ID
 * @access  Private
 */
router.get('/:id', verifyToken, validateId('id'), subscriptionController.getSubscriptionById);

/**
 * @route   GET /api/subscriptions/:id/invoices
 * @desc    Get all invoices for subscription
 * @access  Private (Subscription owner only)
 */
router.get('/:id/invoices', verifyToken, validateId('id'), subscriptionController.getInvoices);

/**
 * @route   POST /api/subscriptions/:id/cancel
 * @desc    Cancel subscription
 * @access  Private (Trader only)
 */
router.post('/:id/cancel', verifyToken, requireTrader, validateId('id'), subscriptionController.cancelSubscription);

/**
 * @route   POST /api/subscriptions/:id/pause
 * @desc    Pause subscription
 * @access  Private (Trader only)
 */
router.post('/:id/pause', verifyToken, requireTrader, validateId('id'), subscriptionController.pauseSubscription);

/**
 * @route   POST /api/subscriptions/:id/resume
 * @desc    Resume paused subscription
 * @access  Private (Trader only)
 */
router.post('/:id/resume', verifyToken, requireTrader, validateId('id'), subscriptionController.resumeSubscription);

/**
 * @route   POST /api/subscriptions/:id/upgrade
 * @desc    Upgrade subscription to higher tier
 * @access  Private (Trader only)
 */
router.post('/:id/upgrade', verifyToken, requireTrader, paymentLimiter, validateId('id'), subscriptionController.upgradeSubscription);

/**
 * @route   POST /api/subscriptions/:id/update-payment
 * @desc    Update payment method for subscription
 * @access  Private (Trader only)
 */
router.post('/:id/update-payment', verifyToken, requireTrader, validateId('id'), subscriptionController.updatePaymentMethod);

/**
 * @route   POST /api/subscriptions/:id/retry-payment
 * @desc    Manually retry failed payment
 * @access  Private (Trader only)
 */
router.post('/:id/retry-payment', verifyToken, requireTrader, paymentLimiter, validateId('id'), subscriptionController.retryPayment);

/**
 * @route   POST /api/subscriptions/:id/toggle-auto-renewal
 * @desc    Toggle auto-renewal for subscription
 * @access  Private (Trader only)
 */
router.post('/:id/toggle-auto-renewal', verifyToken, requireTrader, validateId('id'), subscriptionController.toggleAutoRenewal);

/**
 * @route   POST /api/subscriptions/payment/verify
 * @desc    Verify Razorpay payment signature
 * @access  Private
 */
router.post('/payment/verify', verifyToken, paymentValidation, subscriptionController.verifyPayment);

module.exports = router;
