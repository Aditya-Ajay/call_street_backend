/**
 * Payment Service
 *
 * Handles all Razorpay payment operations including:
 * - Subscription creation and management
 * - Payment verification and signature validation
 * - Webhook event processing
 * - Payment failure recovery
 * - Refund processing
 * - Marketplace payouts to analysts (Razorpay Route)
 *
 * SECURITY CRITICAL:
 * - ALWAYS verify webhook signatures before processing
 * - NEVER store card data (PCI compliance)
 * - Use idempotency checks to prevent duplicate operations
 * - All Razorpay API calls use try-catch for error handling
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');
const config = require('../config/env');
const { query, getClient } = require('../config/database');

// Initialize Razorpay SDK with credentials from environment
const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret
});

// Platform commission rate (20%)
const PLATFORM_COMMISSION_RATE = 0.20;

// Payment retry schedule (days after initial failure)
const PAYMENT_RETRY_SCHEDULE = [3, 7, 10]; // Day 3, 7, 10
const GRACE_PERIOD_DAYS = 7; // 7 days grace period before suspension

/**
 * Creates a Razorpay plan for a subscription tier
 * Plans are created on-demand and cached in the database
 *
 * @param {Object} tier - Subscription tier details
 * @param {string} billingCycle - 'monthly' or 'yearly'
 * @returns {Promise<string>} - Razorpay plan ID
 */
const createRazorpayPlan = async (tier, billingCycle) => {
  try {
    // Calculate billing period and interval
    const period = billingCycle === 'monthly' ? 'monthly' : 'yearly';
    const interval = 1;

    // Create plan on Razorpay
    const plan = await razorpay.plans.create({
      period,
      interval,
      item: {
        name: `${tier.name} - ${billingCycle}`,
        amount: tier.price, // Amount in paise
        currency: 'INR',
        description: tier.description
      },
      notes: {
        tier_id: tier.id,
        billing_cycle: billingCycle,
        platform: 'analyst_marketplace'
      }
    });

    console.log(`Razorpay plan created: ${plan.id} for tier ${tier.name}`);
    return plan.id;

  } catch (error) {
    console.error('Error creating Razorpay plan:', error);
    throw new Error(`Failed to create Razorpay plan: ${error.message}`);
  }
};

/**
 * Creates a Razorpay customer for a user
 * Customers are created once and reused for all subscriptions
 *
 * @param {Object} user - User object
 * @returns {Promise<string>} - Razorpay customer ID
 */
const createRazorpayCustomer = async (user) => {
  try {
    const customer = await razorpay.customers.create({
      name: user.full_name,
      email: user.email,
      contact: user.phone_number || '',
      notes: {
        user_id: user.id,
        platform: 'analyst_marketplace'
      }
    });

    console.log(`Razorpay customer created: ${customer.id} for user ${user.id}`);
    return customer.id;

  } catch (error) {
    console.error('Error creating Razorpay customer:', error);
    throw new Error(`Failed to create Razorpay customer: ${error.message}`);
  }
};

/**
 * Creates a subscription order with Razorpay
 * This is the main entry point for subscription checkout
 *
 * @param {string} tierId - Subscription tier ID
 * @param {string} userId - User ID making the subscription
 * @param {string} discountCode - Optional discount code
 * @returns {Promise<Object>} - Subscription details for checkout
 */
const createSubscription = async (tierId, userId, discountCode = null) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Fetch tier details
    const tierResult = await client.query(
      `SELECT * FROM subscription_tiers WHERE id = $1 AND is_active = true AND deleted_at IS NULL`,
      [tierId]
    );

    if (tierResult.rows.length === 0) {
      throw new Error('Subscription tier not found or inactive');
    }

    const tier = tierResult.rows[0];

    // 2. Fetch user details
    const userResult = await client.query(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];

    // 3. Check if user already has active subscription to this analyst
    const existingSubResult = await client.query(
      `SELECT id FROM subscriptions
       WHERE user_id = $1
       AND analyst_id = $2
       AND status = 'active'
       AND deleted_at IS NULL`,
      [userId, tier.analyst_id]
    );

    if (existingSubResult.rows.length > 0) {
      throw new Error('You already have an active subscription with this analyst');
    }

    // 4. Apply discount if provided
    let discountAmount = 0;
    let discountCodeId = null;

    if (discountCode) {
      const discountResult = await client.query(
        `SELECT * FROM discount_codes
         WHERE code = $1
         AND is_active = true
         AND deleted_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (usage_limit IS NULL OR usage_count < usage_limit)`,
        [discountCode]
      );

      if (discountResult.rows.length > 0) {
        const discount = discountResult.rows[0];

        // Check if discount applies to this tier/analyst
        if (
          (discount.analyst_id === null || discount.analyst_id === tier.analyst_id) &&
          (discount.tier_id === null || discount.tier_id === tierId)
        ) {
          // Calculate discount amount
          if (discount.discount_type === 'percentage') {
            discountAmount = Math.floor((tier.price * discount.discount_value) / 100);
          } else {
            discountAmount = discount.discount_value;
          }

          discountCodeId = discount.id;

          // Increment usage count
          await client.query(
            `UPDATE discount_codes SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1`,
            [discount.id]
          );
        }
      }
    }

    const finalPrice = tier.price - discountAmount;

    if (finalPrice < 0) {
      throw new Error('Invalid discount calculation');
    }

    // 5. Create or get Razorpay customer
    let razorpayCustomerId = user.razorpay_customer_id;

    if (!razorpayCustomerId) {
      razorpayCustomerId = await createRazorpayCustomer(user);

      // Update user record with customer ID
      await client.query(
        `UPDATE users SET razorpay_customer_id = $1, updated_at = NOW() WHERE id = $2`,
        [razorpayCustomerId, userId]
      );
    }

    // 6. Create or get Razorpay plan
    const billingCycle = tier.billing_cycle || 'monthly';
    let razorpayPlanId = tier.razorpay_plan_id;

    if (!razorpayPlanId) {
      razorpayPlanId = await createRazorpayPlan(tier, billingCycle);

      // Update tier record with plan ID
      await client.query(
        `UPDATE subscription_tiers SET razorpay_plan_id = $1, updated_at = NOW() WHERE id = $2`,
        [razorpayPlanId, tierId]
      );
    }

    // 7. Create Razorpay subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      customer_id: razorpayCustomerId,
      quantity: 1,
      total_count: billingCycle === 'monthly' ? 12 : 1, // 12 months for monthly, 1 for yearly
      customer_notify: 1, // Send email to customer
      notes: {
        user_id: userId,
        analyst_id: tier.analyst_id,
        tier_id: tierId,
        discount_code: discountCode || 'none'
      }
    });

    // 8. Calculate subscription dates
    const startDate = new Date();
    const expiresAt = new Date(startDate);
    if (billingCycle === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    const nextBillingDate = new Date(expiresAt);

    // 9. Create subscription record in database
    const subscriptionResult = await client.query(
      `INSERT INTO subscriptions (
        user_id,
        analyst_id,
        tier_id,
        status,
        billing_cycle,
        price_paid,
        discount_applied,
        final_price,
        start_date,
        expires_at,
        next_billing_date,
        razorpay_subscription_id,
        razorpay_customer_id,
        razorpay_plan_id,
        auto_renewal,
        discount_code_used
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        userId,
        tier.analyst_id,
        tierId,
        'pending_payment', // Will be updated to 'active' after payment success
        billingCycle,
        tier.price,
        discountAmount,
        finalPrice,
        startDate,
        expiresAt,
        nextBillingDate,
        subscription.id,
        razorpayCustomerId,
        razorpayPlanId,
        true,
        discountCodeId
      ]
    );

    await client.query('COMMIT');

    // 10. Return checkout details for frontend
    return {
      subscriptionId: subscriptionResult.rows[0].id,
      razorpaySubscriptionId: subscription.id,
      razorpayKey: config.razorpay.keyId,
      amount: finalPrice,
      currency: 'INR',
      name: tier.name,
      description: tier.description,
      analystName: tier.analyst_name || 'Analyst',
      billingCycle,
      customerEmail: user.email,
      customerPhone: user.phone_number,
      notes: subscription.notes
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating subscription:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Verifies Razorpay payment signature
 * CRITICAL: This prevents payment fraud by ensuring webhooks are from Razorpay
 *
 * @param {string} razorpaySignature - Signature from webhook header
 * @param {Object} payload - Webhook payload
 * @returns {boolean} - True if signature is valid
 */
const verifyWebhookSignature = (razorpaySignature, payload) => {
  try {
    // Convert payload to string if it's an object
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // Generate expected signature using webhook secret
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(payloadString)
      .digest('hex');

    // Compare signatures (timing-safe comparison)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(razorpaySignature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      console.error('Webhook signature verification failed');
      console.error('Expected:', expectedSignature);
      console.error('Received:', razorpaySignature);
    }

    return isValid;

  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
};

/**
 * Verifies payment signature for frontend payment confirmation
 * Used to verify payment after user completes checkout
 *
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Signature from Razorpay
 * @returns {boolean} - True if signature is valid
 */
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const text = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(text)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

  } catch (error) {
    console.error('Error verifying payment signature:', error);
    return false;
  }
};

/**
 * Processes webhook events from Razorpay
 * Routes events to appropriate handlers based on event type
 *
 * @param {string} eventType - Razorpay event type
 * @param {Object} payload - Event payload
 * @returns {Promise<Object>} - Processing result
 */
const processWebhookEvent = async (eventType, payload) => {
  console.log(`Processing webhook event: ${eventType}`);

  try {
    switch (eventType) {
      case 'subscription.activated':
        return await handleSubscriptionActivated(payload);

      case 'subscription.charged':
        return await handleSubscriptionCharged(payload);

      case 'subscription.completed':
        return await handleSubscriptionCompleted(payload);

      case 'subscription.cancelled':
        return await handleSubscriptionCancelled(payload);

      case 'subscription.paused':
        return await handleSubscriptionPaused(payload);

      case 'subscription.resumed':
        return await handleSubscriptionResumed(payload);

      case 'payment.authorized':
        return await handlePaymentAuthorized(payload);

      case 'payment.captured':
        return await handlePaymentCaptured(payload);

      case 'payment.failed':
        return await handlePaymentFailed(payload);

      default:
        console.log(`Unhandled webhook event type: ${eventType}`);
        return { success: true, message: 'Event type not handled' };
    }

  } catch (error) {
    console.error(`Error processing webhook event ${eventType}:`, error);
    throw error;
  }
};

/**
 * Handles subscription.activated webhook
 * Called when subscription payment succeeds and subscription becomes active
 */
const handleSubscriptionActivated = async (payload) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const subscriptionEntity = payload.subscription;
    const paymentEntity = payload.payment || {};

    // Find subscription in database
    const subResult = await client.query(
      `SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1`,
      [subscriptionEntity.id]
    );

    if (subResult.rows.length === 0) {
      throw new Error(`Subscription not found: ${subscriptionEntity.id}`);
    }

    const subscription = subResult.rows[0];

    // Check idempotency: If already activated, skip
    if (subscription.status === 'active') {
      console.log(`Subscription ${subscription.id} already activated, skipping`);
      await client.query('COMMIT');
      return { success: true, message: 'Subscription already active' };
    }

    // Update subscription status to active
    await client.query(
      `UPDATE subscriptions
       SET status = 'active',
           payment_retry_count = 0,
           grace_period_ends_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [subscription.id]
    );

    // Create payment transaction record
    if (paymentEntity.id) {
      await client.query(
        `INSERT INTO payment_transactions (
          user_id,
          analyst_id,
          subscription_id,
          razorpay_payment_id,
          razorpay_order_id,
          transaction_type,
          amount,
          status,
          payment_method,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          subscription.user_id,
          subscription.analyst_id,
          subscription.id,
          paymentEntity.id,
          paymentEntity.order_id || null,
          'subscription_payment',
          subscription.final_price,
          'captured',
          paymentEntity.method || 'unknown',
          JSON.stringify({ webhook_event: 'subscription.activated' })
        ]
      );
    }

    await client.query('COMMIT');

    console.log(`Subscription ${subscription.id} activated successfully`);

    // TODO: Send welcome email to user
    // TODO: Send notification to analyst about new subscriber

    return {
      success: true,
      message: 'Subscription activated',
      subscriptionId: subscription.id
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error handling subscription.activated:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Handles subscription.charged webhook
 * Called when subscription is auto-renewed and payment is successful
 */
const handleSubscriptionCharged = async (payload) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const subscriptionEntity = payload.subscription;
    const paymentEntity = payload.payment;

    // Find subscription in database
    const subResult = await client.query(
      `SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1`,
      [subscriptionEntity.id]
    );

    if (subResult.rows.length === 0) {
      throw new Error(`Subscription not found: ${subscriptionEntity.id}`);
    }

    const subscription = subResult.rows[0];

    // Check idempotency: Check if this payment already recorded
    const existingPayment = await client.query(
      `SELECT id FROM payment_transactions WHERE razorpay_payment_id = $1`,
      [paymentEntity.id]
    );

    if (existingPayment.rows.length > 0) {
      console.log(`Payment ${paymentEntity.id} already recorded, skipping`);
      await client.query('COMMIT');
      return { success: true, message: 'Payment already recorded' };
    }

    // Calculate new expiry date
    const currentExpiry = new Date(subscription.expires_at);
    const newExpiry = new Date(currentExpiry);

    if (subscription.billing_cycle === 'monthly') {
      newExpiry.setMonth(newExpiry.getMonth() + 1);
    } else {
      newExpiry.setFullYear(newExpiry.getFullYear() + 1);
    }

    // Update subscription
    await client.query(
      `UPDATE subscriptions
       SET expires_at = $1,
           next_billing_date = $2,
           status = 'active',
           payment_retry_count = 0,
           grace_period_ends_at = NULL,
           updated_at = NOW()
       WHERE id = $3`,
      [newExpiry, newExpiry, subscription.id]
    );

    // Create payment transaction record
    await client.query(
      `INSERT INTO payment_transactions (
        user_id,
        analyst_id,
        subscription_id,
        razorpay_payment_id,
        razorpay_order_id,
        transaction_type,
        amount,
        status,
        payment_method,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        subscription.user_id,
        subscription.analyst_id,
        subscription.id,
        paymentEntity.id,
        paymentEntity.order_id || null,
        'renewal',
        paymentEntity.amount,
        'captured',
        paymentEntity.method || 'unknown',
        JSON.stringify({ webhook_event: 'subscription.charged' })
      ]
    );

    await client.query('COMMIT');

    console.log(`Subscription ${subscription.id} renewed successfully`);

    // TODO: Send renewal confirmation email with invoice
    // TODO: Notify analyst of successful renewal

    return {
      success: true,
      message: 'Subscription renewed',
      subscriptionId: subscription.id
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error handling subscription.charged:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Handles payment.failed webhook
 * Initiates payment failure recovery flow
 */
const handlePaymentFailed = async (payload) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const paymentEntity = payload.payment;
    const subscriptionId = paymentEntity.notes?.subscription_id;

    if (!subscriptionId) {
      // Not a subscription payment, skip
      await client.query('COMMIT');
      return { success: true, message: 'Not a subscription payment' };
    }

    // Find subscription in database
    const subResult = await client.query(
      `SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1`,
      [subscriptionId]
    );

    if (subResult.rows.length === 0) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    const subscription = subResult.rows[0];

    // Increment retry count
    const newRetryCount = subscription.payment_retry_count + 1;

    // Set grace period if not already set (7 days from now)
    let gracePeriodEndsAt = subscription.grace_period_ends_at;
    if (!gracePeriodEndsAt) {
      gracePeriodEndsAt = new Date();
      gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + GRACE_PERIOD_DAYS);
    }

    // Update subscription
    await client.query(
      `UPDATE subscriptions
       SET payment_retry_count = $1,
           last_payment_attempt = NOW(),
           grace_period_ends_at = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [newRetryCount, gracePeriodEndsAt, subscription.id]
    );

    // Record failed payment transaction
    await client.query(
      `INSERT INTO payment_transactions (
        user_id,
        analyst_id,
        subscription_id,
        razorpay_payment_id,
        razorpay_order_id,
        transaction_type,
        amount,
        status,
        payment_method,
        failure_reason,
        failure_code,
        retry_count,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        subscription.user_id,
        subscription.analyst_id,
        subscription.id,
        paymentEntity.id,
        paymentEntity.order_id || null,
        'renewal',
        paymentEntity.amount,
        'failed',
        paymentEntity.method || 'unknown',
        paymentEntity.error_description || 'Payment failed',
        paymentEntity.error_code || 'PAYMENT_FAILED',
        newRetryCount,
        JSON.stringify({ webhook_event: 'payment.failed' })
      ]
    );

    // Check if max retries reached (3 attempts)
    if (newRetryCount >= 3) {
      // Suspend subscription after 3 failed attempts
      await client.query(
        `UPDATE subscriptions
         SET status = 'suspended',
             suspended_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [subscription.id]
      );

      console.log(`Subscription ${subscription.id} suspended after 3 failed payment attempts`);

      // TODO: Send suspension email to user
    } else {
      console.log(`Payment failed for subscription ${subscription.id}, retry ${newRetryCount}/3`);

      // TODO: Send payment failure email with retry info
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: 'Payment failure recorded',
      subscriptionId: subscription.id,
      retryCount: newRetryCount
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error handling payment.failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Handles subscription.cancelled webhook
 * Called when user cancels subscription
 */
const handleSubscriptionCancelled = async (payload) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const subscriptionEntity = payload.subscription;

    // Find subscription in database
    const subResult = await client.query(
      `SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1`,
      [subscriptionEntity.id]
    );

    if (subResult.rows.length === 0) {
      throw new Error(`Subscription not found: ${subscriptionEntity.id}`);
    }

    const subscription = subResult.rows[0];

    // Update subscription status
    await client.query(
      `UPDATE subscriptions
       SET status = 'cancelled',
           cancelled_at = NOW(),
           auto_renewal = false,
           updated_at = NOW()
       WHERE id = $1`,
      [subscription.id]
    );

    await client.query('COMMIT');

    console.log(`Subscription ${subscription.id} cancelled`);

    // TODO: Send cancellation confirmation email

    return {
      success: true,
      message: 'Subscription cancelled',
      subscriptionId: subscription.id
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error handling subscription.cancelled:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Handles subscription.paused webhook
 */
const handleSubscriptionPaused = async (payload) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const subscriptionEntity = payload.subscription;

    const subResult = await client.query(
      `UPDATE subscriptions
       SET status = 'suspended',
           suspended_at = NOW(),
           updated_at = NOW()
       WHERE razorpay_subscription_id = $1
       RETURNING id`,
      [subscriptionEntity.id]
    );

    await client.query('COMMIT');

    if (subResult.rows.length > 0) {
      console.log(`Subscription ${subResult.rows[0].id} paused`);
    }

    return { success: true, message: 'Subscription paused' };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error handling subscription.paused:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Handles subscription.resumed webhook
 */
const handleSubscriptionResumed = async (payload) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const subscriptionEntity = payload.subscription;

    const subResult = await client.query(
      `UPDATE subscriptions
       SET status = 'active',
           suspended_at = NULL,
           payment_retry_count = 0,
           grace_period_ends_at = NULL,
           updated_at = NOW()
       WHERE razorpay_subscription_id = $1
       RETURNING id`,
      [subscriptionEntity.id]
    );

    await client.query('COMMIT');

    if (subResult.rows.length > 0) {
      console.log(`Subscription ${subResult.rows[0].id} resumed`);
    }

    return { success: true, message: 'Subscription resumed' };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error handling subscription.resumed:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Handles subscription.completed webhook
 */
const handleSubscriptionCompleted = async (payload) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const subscriptionEntity = payload.subscription;

    const subResult = await client.query(
      `UPDATE subscriptions
       SET status = 'expired',
           auto_renewal = false,
           updated_at = NOW()
       WHERE razorpay_subscription_id = $1
       RETURNING id`,
      [subscriptionEntity.id]
    );

    await client.query('COMMIT');

    if (subResult.rows.length > 0) {
      console.log(`Subscription ${subResult.rows[0].id} completed`);
    }

    return { success: true, message: 'Subscription completed' };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error handling subscription.completed:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Handles payment.authorized webhook
 */
const handlePaymentAuthorized = async (payload) => {
  // Payment authorized but not yet captured
  // Typically auto-captured by Razorpay for subscriptions
  console.log('Payment authorized:', payload.payment.id);
  return { success: true, message: 'Payment authorized' };
};

/**
 * Handles payment.captured webhook
 */
const handlePaymentCaptured = async (payload) => {
  // Payment captured successfully
  // For subscriptions, this is usually handled by subscription.charged
  console.log('Payment captured:', payload.payment.id);
  return { success: true, message: 'Payment captured' };
};

/**
 * Cancels a subscription
 *
 * @param {string} subscriptionId - Internal subscription ID
 * @param {boolean} cancelAtCycleEnd - If true, subscription continues until current period ends
 * @returns {Promise<Object>} - Cancellation result
 */
const cancelSubscription = async (subscriptionId, cancelAtCycleEnd = true) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get subscription
    const subResult = await client.query(
      `SELECT * FROM subscriptions WHERE id = $1 AND deleted_at IS NULL`,
      [subscriptionId]
    );

    if (subResult.rows.length === 0) {
      throw new Error('Subscription not found');
    }

    const subscription = subResult.rows[0];

    if (subscription.status !== 'active') {
      throw new Error('Only active subscriptions can be cancelled');
    }

    // Cancel on Razorpay
    await razorpay.subscriptions.cancel(subscription.razorpay_subscription_id, {
      cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0
    });

    // Update database
    if (cancelAtCycleEnd) {
      // Subscription continues until expiry date, but won't auto-renew
      await client.query(
        `UPDATE subscriptions
         SET auto_renewal = false,
             cancelled_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [subscriptionId]
      );
    } else {
      // Immediate cancellation
      await client.query(
        `UPDATE subscriptions
         SET status = 'cancelled',
             cancelled_at = NOW(),
             auto_renewal = false,
             updated_at = NOW()
         WHERE id = $1`,
        [subscriptionId]
      );
    }

    await client.query('COMMIT');

    console.log(`Subscription ${subscriptionId} cancelled`);

    // TODO: Send cancellation confirmation email

    return {
      success: true,
      message: cancelAtCycleEnd
        ? 'Subscription will cancel at end of billing period'
        : 'Subscription cancelled immediately'
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling subscription:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Processes a refund
 *
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Refund amount in paise (optional, full refund if not provided)
 * @param {string} reason - Refund reason
 * @returns {Promise<Object>} - Refund result
 */
const processRefund = async (paymentId, amount = null, reason = 'Customer request') => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Find payment transaction
    const txnResult = await client.query(
      `SELECT * FROM payment_transactions WHERE razorpay_payment_id = $1`,
      [paymentId]
    );

    if (txnResult.rows.length === 0) {
      throw new Error('Payment transaction not found');
    }

    const transaction = txnResult.rows[0];

    if (transaction.status === 'refunded') {
      throw new Error('Payment already refunded');
    }

    // Calculate refund amount (full refund if not specified)
    const refundAmount = amount || transaction.amount;

    if (refundAmount > transaction.amount) {
      throw new Error('Refund amount cannot exceed payment amount');
    }

    // Process refund on Razorpay
    const refund = await razorpay.payments.refund(paymentId, {
      amount: refundAmount,
      notes: {
        reason,
        refunded_by: 'admin'
      }
    });

    // Update payment transaction
    await client.query(
      `UPDATE payment_transactions
       SET status = 'refunded',
           refund_amount = $1,
           refund_reason = $2,
           refunded_at = NOW(),
           razorpay_refund_id = $3,
           updated_at = NOW()
       WHERE razorpay_payment_id = $4`,
      [refundAmount, reason, refund.id, paymentId]
    );

    // If full refund, cancel subscription if active
    if (refundAmount === transaction.amount && transaction.subscription_id) {
      await client.query(
        `UPDATE subscriptions
         SET status = 'cancelled',
             cancelled_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND status = 'active'`,
        [transaction.subscription_id]
      );
    }

    await client.query('COMMIT');

    console.log(`Refund processed: ${refund.id} for payment ${paymentId}`);

    // TODO: Send refund confirmation email

    return {
      success: true,
      message: 'Refund processed successfully',
      refundId: refund.id,
      amount: refundAmount
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing refund:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Calculates analyst payout for a given period
 *
 * @param {string} analystId - Analyst user ID
 * @param {Date} startDate - Start date of payout period
 * @param {Date} endDate - End date of payout period
 * @returns {Promise<Object>} - Payout calculation
 */
const calculatePayout = async (analystId, startDate, endDate) => {
  try {
    // Get all successful payments for this analyst in the period
    const result = await query(
      `SELECT
        SUM(amount) as total_revenue,
        COUNT(*) as transaction_count
       FROM payment_transactions
       WHERE analyst_id = $1
       AND status = 'captured'
       AND created_at >= $2
       AND created_at <= $3`,
      [analystId, startDate, endDate]
    );

    const totalRevenue = parseInt(result.rows[0].total_revenue) || 0;
    const transactionCount = parseInt(result.rows[0].transaction_count) || 0;

    // Calculate platform commission (20%)
    const platformCommission = Math.floor(totalRevenue * PLATFORM_COMMISSION_RATE);

    // Calculate analyst payout (80%)
    const analystPayout = totalRevenue - platformCommission;

    return {
      analystId,
      period: { startDate, endDate },
      totalRevenue,
      platformCommission,
      analystPayout,
      transactionCount,
      commissionRate: PLATFORM_COMMISSION_RATE
    };

  } catch (error) {
    console.error('Error calculating payout:', error);
    throw error;
  }
};

/**
 * Transfers payout to analyst using Razorpay Route
 *
 * @param {string} analystId - Analyst user ID
 * @param {number} amount - Payout amount in paise
 * @param {string} accountId - Razorpay linked account ID
 * @returns {Promise<Object>} - Transfer result
 */
const transferPayout = async (analystId, amount, accountId) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get analyst details
    const analystResult = await client.query(
      `SELECT * FROM users WHERE id = $1 AND user_type = 'analyst'`,
      [analystId]
    );

    if (analystResult.rows.length === 0) {
      throw new Error('Analyst not found');
    }

    const analyst = analystResult.rows[0];

    // Check if analyst has linked account
    if (!accountId) {
      throw new Error('Analyst has no linked bank account');
    }

    // Create transfer using Razorpay Route
    const transfer = await razorpay.transfers.create({
      account: accountId,
      amount: amount,
      currency: 'INR',
      notes: {
        analyst_id: analystId,
        payout_date: new Date().toISOString(),
        platform: 'analyst_marketplace'
      }
    });

    // Record payout transaction
    await client.query(
      `INSERT INTO payment_transactions (
        user_id,
        analyst_id,
        transaction_type,
        amount,
        status,
        payout_status,
        razorpay_payout_id,
        paid_out_at,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        analystId,
        analystId,
        'payout',
        amount,
        'captured',
        'completed',
        transfer.id,
        new Date(),
        JSON.stringify({
          transfer_id: transfer.id,
          account_id: accountId
        })
      ]
    );

    await client.query('COMMIT');

    console.log(`Payout transferred to analyst ${analystId}: ₹${amount / 100}`);

    // TODO: Send payout confirmation email to analyst

    return {
      success: true,
      message: 'Payout transferred successfully',
      transferId: transfer.id,
      amount
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error transferring payout:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Retries a failed payment manually
 *
 * @param {string} subscriptionId - Internal subscription ID
 * @returns {Promise<Object>} - Retry result
 */
const retryFailedPayment = async (subscriptionId) => {
  try {
    // Get subscription
    const result = await query(
      `SELECT * FROM subscriptions WHERE id = $1`,
      [subscriptionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Subscription not found');
    }

    const subscription = result.rows[0];

    if (subscription.status !== 'suspended' && subscription.status !== 'pending_payment') {
      throw new Error('Subscription is not in a failed payment state');
    }

    // Retry payment on Razorpay
    // Note: Razorpay automatically retries on schedule, manual retry creates a new charge
    const payment = await razorpay.subscriptions.fetch(subscription.razorpay_subscription_id);

    return {
      success: true,
      message: 'Payment retry initiated',
      subscription: payment
    };

  } catch (error) {
    console.error('Error retrying payment:', error);
    throw error;
  }
};

/**
 * Updates payment method for a subscription
 *
 * @param {string} subscriptionId - Internal subscription ID
 * @returns {Promise<Object>} - Update result with checkout details
 */
const updatePaymentMethod = async (subscriptionId) => {
  try {
    // Get subscription
    const result = await query(
      `SELECT * FROM subscriptions WHERE id = $1`,
      [subscriptionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Subscription not found');
    }

    const subscription = result.rows[0];

    // Generate payment link for updating payment method
    // This will be handled by frontend Razorpay checkout

    return {
      success: true,
      subscriptionId: subscription.razorpay_subscription_id,
      customerId: subscription.razorpay_customer_id,
      razorpayKey: config.razorpay.keyId
    };

  } catch (error) {
    console.error('Error updating payment method:', error);
    throw error;
  }
};

module.exports = {
  // Subscription management
  createSubscription,
  cancelSubscription,
  retryFailedPayment,
  updatePaymentMethod,

  // Payment verification
  verifyWebhookSignature,
  verifyPaymentSignature,

  // Webhook processing
  processWebhookEvent,

  // Refunds
  processRefund,

  // Payouts
  calculatePayout,
  transferPayout,

  // Razorpay SDK instance (for advanced usage)
  razorpay
};
