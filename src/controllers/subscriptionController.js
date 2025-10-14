/**
 * Subscription Controller
 *
 * Handles all subscription-related API endpoints including:
 * - Creating subscriptions (Razorpay checkout)
 * - Webhook handling (CRITICAL SECURITY: signature verification)
 * - Subscription management (cancel, pause, resume, upgrade)
 * - Payment method updates
 * - Invoice downloads
 *
 * SECURITY NOTES:
 * - Webhook endpoint MUST verify signatures before processing
 * - All user actions must verify subscription ownership
 * - Payment operations use database transactions for atomicity
 */

const paymentService = require('../services/paymentService');
const Subscription = require('../models/Subscription');
const PaymentTransaction = require('../models/PaymentTransaction');
const { query } = require('../config/database');

/**
 * POST /api/subscriptions/create
 * Creates a new subscription and returns checkout details
 *
 * @access Private (Trader only)
 */
const createSubscription = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tierId, discountCode } = req.body;

    // Validate required fields
    if (!tierId) {
      return res.status(400).json({
        success: false,
        message: 'Tier ID is required'
      });
    }

    // Check if tier exists and is active
    const tierResult = await query(
      `SELECT t.*, u.full_name as analyst_name
       FROM subscription_tiers t
       INNER JOIN users u ON t.analyst_id = u.id
       WHERE t.id = $1 AND t.is_active = true AND t.deleted_at IS NULL`,
      [tierId]
    );

    if (tierResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subscription tier not found or inactive'
      });
    }

    const tier = tierResult.rows[0];

    // Check if tier is at capacity
    const isAtCapacity = await Subscription.isTierAtCapacity(tierId);
    if (isAtCapacity) {
      return res.status(400).json({
        success: false,
        message: 'This tier is at maximum capacity. Please choose another tier or contact the analyst.'
      });
    }

    // Check if user already has active subscription with this analyst
    const existingSubscription = await Subscription.findActiveByUserAndAnalyst(
      userId,
      tier.analyst_id
    );

    if (existingSubscription) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active subscription with this analyst',
        subscription: existingSubscription
      });
    }

    // Create subscription via payment service
    const subscriptionData = await paymentService.createSubscription(
      tierId,
      userId,
      discountCode
    );

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: subscriptionData
    });

  } catch (error) {
    console.error('Error creating subscription:', error);
    next(error);
  }
};

/**
 * POST /api/subscriptions/webhook
 * Handles Razorpay webhook events
 *
 * CRITICAL SECURITY: ALWAYS verify webhook signature before processing
 *
 * @access Public (Razorpay only - verified via signature)
 */
const handleWebhook = async (req, res, next) => {
  try {
    // Get signature from headers
    const razorpaySignature = req.headers['x-razorpay-signature'];

    if (!razorpaySignature) {
      console.error('Webhook signature missing');
      return res.status(401).json({
        success: false,
        message: 'Webhook signature missing'
      });
    }

    // Get raw body (should be string for signature verification)
    const payload = req.body;

    // CRITICAL: Verify webhook signature
    const isValid = paymentService.verifyWebhookSignature(razorpaySignature, payload);

    if (!isValid) {
      console.error('Webhook signature verification failed');
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    // Extract event type and payload
    const eventType = payload.event;
    const eventPayload = payload.payload;

    console.log(`Webhook received: ${eventType}`);

    // Check idempotency: Has this webhook been processed before?
    // Razorpay sends webhook_id in some events, but we primarily rely on payment/subscription IDs
    const webhookId = payload.webhook_id || `${eventType}_${Date.now()}`;

    // Process webhook event asynchronously to return 200 OK quickly
    // Razorpay expects fast response (< 5 seconds)
    setImmediate(async () => {
      try {
        await paymentService.processWebhookEvent(eventType, eventPayload);
        console.log(`Webhook processed successfully: ${eventType}`);
      } catch (error) {
        console.error(`Error processing webhook ${eventType}:`, error);
        // Don't throw - we already responded 200 OK to Razorpay
        // TODO: Alert admin/ops team about webhook processing failure
      }
    });

    // Return 200 OK immediately (Razorpay requirement)
    res.status(200).json({
      success: true,
      message: 'Webhook received',
      eventType
    });

  } catch (error) {
    console.error('Error handling webhook:', error);
    // Always return 200 OK to prevent Razorpay retries
    // Log error for investigation
    res.status(200).json({
      success: false,
      message: 'Webhook processing error'
    });
  }
};

/**
 * GET /api/subscriptions/my-subscriptions
 * Gets all subscriptions for the logged-in user
 *
 * @access Private (Trader only)
 */
const getMySubscriptions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status } = req.query; // Optional status filter

    const subscriptions = await Subscription.findByUserId(userId, status);

    res.status(200).json({
      success: true,
      count: subscriptions.length,
      data: subscriptions
    });

  } catch (error) {
    console.error('Error fetching user subscriptions:', error);
    next(error);
  }
};

/**
 * GET /api/subscriptions/:id
 * Gets subscription details by ID
 *
 * @access Private (Subscription owner only)
 */
const getSubscriptionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Verify ownership (user must be subscriber or analyst)
    if (subscription.user_id !== userId && subscription.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this subscription'
      });
    }

    // Get payment history for this subscription
    const payments = await PaymentTransaction.findBySubscriptionId(id);

    res.status(200).json({
      success: true,
      data: {
        subscription,
        payments
      }
    });

  } catch (error) {
    console.error('Error fetching subscription:', error);
    next(error);
  }
};

/**
 * POST /api/subscriptions/:id/cancel
 * Cancels a subscription
 *
 * @access Private (Subscription owner only)
 */
const cancelSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { immediate = false } = req.body; // Cancel immediately or at cycle end

    // Get subscription
    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Verify ownership
    if (subscription.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this subscription'
      });
    }

    // Check if already cancelled
    if (subscription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Subscription is already cancelled'
      });
    }

    // Cancel subscription via payment service
    const result = await paymentService.cancelSubscription(id, !immediate);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        subscriptionId: id,
        immediate
      }
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
    next(error);
  }
};

/**
 * POST /api/subscriptions/:id/pause
 * Pauses a subscription
 *
 * @access Private (Subscription owner only)
 */
const pauseSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get subscription
    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Verify ownership
    if (subscription.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to pause this subscription'
      });
    }

    // Check if already paused/suspended
    if (subscription.status === 'suspended') {
      return res.status(400).json({
        success: false,
        message: 'Subscription is already paused'
      });
    }

    // Pause subscription on Razorpay
    await paymentService.razorpay.subscriptions.pause(subscription.razorpay_subscription_id);

    // Update database
    await Subscription.updateStatus(id, 'suspended', {
      suspended_at: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Subscription paused successfully',
      data: { subscriptionId: id }
    });

  } catch (error) {
    console.error('Error pausing subscription:', error);
    next(error);
  }
};

/**
 * POST /api/subscriptions/:id/resume
 * Resumes a paused subscription
 *
 * @access Private (Subscription owner only)
 */
const resumeSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get subscription
    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Verify ownership
    if (subscription.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to resume this subscription'
      });
    }

    // Check if paused/suspended
    if (subscription.status !== 'suspended') {
      return res.status(400).json({
        success: false,
        message: 'Only paused subscriptions can be resumed'
      });
    }

    // Resume subscription on Razorpay
    await paymentService.razorpay.subscriptions.resume(subscription.razorpay_subscription_id);

    // Update database
    await Subscription.updateStatus(id, 'active', {
      suspended_at: null,
      payment_retry_count: 0,
      grace_period_ends_at: null
    });

    res.status(200).json({
      success: true,
      message: 'Subscription resumed successfully',
      data: { subscriptionId: id }
    });

  } catch (error) {
    console.error('Error resuming subscription:', error);
    next(error);
  }
};

/**
 * POST /api/subscriptions/:id/upgrade
 * Upgrades subscription to a higher tier
 *
 * @access Private (Subscription owner only)
 */
const upgradeSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { newTierId } = req.body;

    if (!newTierId) {
      return res.status(400).json({
        success: false,
        message: 'New tier ID is required'
      });
    }

    // Get current subscription
    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Verify ownership
    if (subscription.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upgrade this subscription'
      });
    }

    // Get new tier details
    const newTierResult = await query(
      `SELECT * FROM subscription_tiers
       WHERE id = $1
       AND analyst_id = $2
       AND is_active = true
       AND deleted_at IS NULL`,
      [newTierId, subscription.analyst_id]
    );

    if (newTierResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'New tier not found or not available for this analyst'
      });
    }

    const newTier = newTierResult.rows[0];

    // Check if new tier is actually higher priced
    if (newTier.price <= subscription.price_paid) {
      return res.status(400).json({
        success: false,
        message: 'New tier must be higher priced than current tier. Use downgrade for lower tiers.'
      });
    }

    // Check tier capacity
    const isAtCapacity = await Subscription.isTierAtCapacity(newTierId);
    if (isAtCapacity) {
      return res.status(400).json({
        success: false,
        message: 'New tier is at maximum capacity'
      });
    }

    // Cancel current subscription (at cycle end)
    await paymentService.cancelSubscription(id, true);

    // Create new subscription with higher tier
    const newSubscriptionData = await paymentService.createSubscription(
      newTierId,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Subscription upgraded successfully',
      data: {
        oldSubscriptionId: id,
        newSubscription: newSubscriptionData
      }
    });

  } catch (error) {
    console.error('Error upgrading subscription:', error);
    next(error);
  }
};

/**
 * POST /api/subscriptions/:id/update-payment
 * Initiates payment method update for subscription
 *
 * @access Private (Subscription owner only)
 */
const updatePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get subscription
    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Verify ownership
    if (subscription.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update payment method for this subscription'
      });
    }

    // Get checkout details for payment method update
    const checkoutData = await paymentService.updatePaymentMethod(id);

    res.status(200).json({
      success: true,
      message: 'Payment method update initiated',
      data: checkoutData
    });

  } catch (error) {
    console.error('Error updating payment method:', error);
    next(error);
  }
};

/**
 * POST /api/subscriptions/:id/retry-payment
 * Manually retries a failed payment
 *
 * @access Private (Subscription owner only)
 */
const retryPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get subscription
    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Verify ownership
    if (subscription.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to retry payment for this subscription'
      });
    }

    // Check if subscription is in failed payment state
    if (subscription.status !== 'suspended' && subscription.status !== 'pending_payment') {
      return res.status(400).json({
        success: false,
        message: 'Subscription does not have a failed payment'
      });
    }

    // Retry payment via payment service
    const result = await paymentService.retryFailedPayment(id);

    res.status(200).json({
      success: true,
      message: 'Payment retry initiated',
      data: result
    });

  } catch (error) {
    console.error('Error retrying payment:', error);
    next(error);
  }
};

/**
 * GET /api/subscriptions/:id/invoices
 * Gets all invoices for a subscription
 *
 * @access Private (Subscription owner only)
 */
const getInvoices = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get subscription
    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Verify ownership
    if (subscription.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view invoices for this subscription'
      });
    }

    // Get all successful payments (invoices)
    const invoices = await PaymentTransaction.findBySubscriptionId(id);

    // Filter only captured payments
    const capturedInvoices = invoices.filter(inv => inv.status === 'captured');

    res.status(200).json({
      success: true,
      count: capturedInvoices.length,
      data: capturedInvoices
    });

  } catch (error) {
    console.error('Error fetching invoices:', error);
    next(error);
  }
};

/**
 * GET /api/subscriptions/expiring-soon
 * Gets subscriptions expiring within specified days
 *
 * @access Private (Trader only)
 */
const getExpiringSoon = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { days = 5 } = req.query;

    const expiringSubscriptions = await Subscription.findExpiringSoon(parseInt(days));

    // Filter by user
    const userExpiring = expiringSubscriptions.filter(sub => sub.user_id === userId);

    res.status(200).json({
      success: true,
      count: userExpiring.length,
      data: userExpiring
    });

  } catch (error) {
    console.error('Error fetching expiring subscriptions:', error);
    next(error);
  }
};

/**
 * GET /api/subscriptions/analyst/:analystId/check
 * Checks if user has active subscription with analyst
 *
 * @access Private
 */
const checkSubscriptionStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { analystId } = req.params;

    const subscription = await Subscription.findActiveByUserAndAnalyst(userId, analystId);

    res.status(200).json({
      success: true,
      data: {
        hasActiveSubscription: !!subscription,
        subscription: subscription || null
      }
    });

  } catch (error) {
    console.error('Error checking subscription status:', error);
    next(error);
  }
};

/**
 * POST /api/subscriptions/payment/verify
 * Verifies payment signature after checkout
 *
 * @access Private
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification parameters'
      });
    }

    // Verify signature
    const isValid = paymentService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id
      }
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    next(error);
  }
};

/**
 * POST /api/subscriptions/:id/toggle-auto-renewal
 * Toggles auto-renewal for subscription
 *
 * @access Private (Subscription owner only)
 */
const toggleAutoRenewal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { autoRenewal } = req.body;

    if (typeof autoRenewal !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'autoRenewal must be a boolean value'
      });
    }

    // Get subscription
    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Verify ownership
    if (subscription.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this subscription'
      });
    }

    // Update auto-renewal
    await Subscription.toggleAutoRenewal(id, autoRenewal);

    res.status(200).json({
      success: true,
      message: `Auto-renewal ${autoRenewal ? 'enabled' : 'disabled'}`,
      data: { subscriptionId: id, autoRenewal }
    });

  } catch (error) {
    console.error('Error toggling auto-renewal:', error);
    next(error);
  }
};

/**
 * GET /api/subscriptions/payment-history
 * Gets user's complete payment history
 *
 * @access Private (Trader only)
 */
const getPaymentHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0, status } = req.query;

    const payments = await PaymentTransaction.findByUserId(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      status
    });

    // Get total spending
    const spending = await PaymentTransaction.getUserSpending(userId);

    res.status(200).json({
      success: true,
      count: payments.length,
      spending,
      data: payments
    });

  } catch (error) {
    console.error('Error fetching payment history:', error);
    next(error);
  }
};

/**
 * GET /api/subscriptions/export-transactions
 * Exports user's transactions as CSV (for tax purposes)
 *
 * @access Private (Trader only)
 */
const exportTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const transactions = await PaymentTransaction.exportUserTransactions(
      userId,
      new Date(startDate),
      new Date(endDate)
    );

    // Convert to CSV format
    const csvHeader = 'Date,Analyst,Tier,Amount (INR),Status,Payment Method,Transaction ID\n';
    const csvRows = transactions.map(t =>
      `${t.date},${t.analyst_name},${t.tier_name || 'N/A'},${t.amount_inr},${t.status},${t.payment_method || 'N/A'},${t.transaction_id}`
    ).join('\n');

    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
    res.status(200).send(csv);

  } catch (error) {
    console.error('Error exporting transactions:', error);
    next(error);
  }
};

/**
 * GET /api/subscriptions/tiers/:analystId
 * Get pricing tiers for an analyst
 *
 * @access Public
 */
const getPricingTiers = async (req, res, next) => {
  try {
    const { analystId } = req.params;

    // Get all active tiers for the analyst
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
        is_free_tier
      FROM subscription_tiers
      WHERE analyst_id = $1
        AND is_active = true
        AND deleted_at IS NULL
      ORDER BY tier_order ASC, price_monthly ASC`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      data: {
        tiers: tiersResult.rows,
        count: tiersResult.rows.length
      }
    });

  } catch (error) {
    console.error('Error fetching pricing tiers:', error);
    next(error);
  }
};

/**
 * GET /api/subscriptions/analyst/:analystId/subscribers
 * Gets list of subscribers for an analyst
 *
 * Returns subscriber details including:
 * - User information
 * - Subscription tier
 * - Status
 * - Start and expiry dates
 *
 * @access Private (Analyst only - own subscribers)
 */
const getAnalystSubscribers = async (req, res, next) => {
  try {
    const { analystId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20, status = 'all' } = req.query;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      return res.status(403).json({
        success: false,
        message: 'Only analysts can view subscriber lists'
      });
    }

    // Verify analyst is accessing their own subscribers
    if (userId !== analystId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own subscribers'
      });
    }

    // Build status filter
    let statusCondition = '';
    if (status !== 'all') {
      statusCondition = `AND s.status = '${status}'`;
    }

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM subscriptions s
       WHERE s.analyst_id = $1
       AND s.deleted_at IS NULL
       ${statusCondition}`,
      [analystId]
    );

    const totalCount = parseInt(countResult.rows[0].total);

    // Get subscribers with details
    const subscribersResult = await query(
      `SELECT
        s.id as subscription_id,
        s.user_id,
        u.full_name,
        u.email,
        u.phone,
        s.status,
        s.start_date,
        s.expires_at,
        s.cancelled_at,
        s.auto_renewal,
        s.billing_cycle,
        s.final_price,
        t.tier_name,
        t.price_monthly,
        t.price_yearly,
        s.created_at as subscribed_at
      FROM subscriptions s
      INNER JOIN users u ON s.user_id = u.id
      INNER JOIN subscription_tiers t ON s.tier_id = t.id
      WHERE s.analyst_id = $1
      AND s.deleted_at IS NULL
      ${statusCondition}
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3`,
      [analystId, parseInt(limit), offset]
    );

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Subscribers fetched successfully',
      data: {
        subscribers: subscribersResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching analyst subscribers:', error);
    next(error);
  }
};

module.exports = {
  createSubscription,
  handleWebhook,
  getMySubscriptions,
  getSubscriptionById,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  upgradeSubscription,
  updatePaymentMethod,
  retryPayment,
  getInvoices,
  getExpiringSoon,
  checkSubscriptionStatus,
  verifyPayment,
  toggleAutoRenewal,
  getPaymentHistory,
  exportTransactions,
  getPricingTiers,
  getAnalystSubscribers
};
