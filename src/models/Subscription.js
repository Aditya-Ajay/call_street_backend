/**
 * Subscription Model
 *
 * Database queries for subscription management
 * Handles all CRUD operations and subscription lifecycle queries
 */

const { query, getClient } = require('../config/database');

/**
 * Creates a new subscription record
 * Note: This is typically called by paymentService after Razorpay subscription creation
 *
 * @param {Object} subscriptionData - Subscription data
 * @returns {Promise<Object>} - Created subscription
 */
const create = async (subscriptionData) => {
  const {
    userId,
    analystId,
    tierId,
    status,
    billingCycle,
    pricePaid,
    discountApplied,
    finalPrice,
    startDate,
    expiresAt,
    nextBillingDate,
    razorpaySubscriptionId,
    razorpayCustomerId,
    razorpayPlanId,
    autoRenewal,
    discountCodeUsed
  } = subscriptionData;

  const result = await query(
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
      analystId,
      tierId,
      status,
      billingCycle,
      pricePaid,
      discountApplied,
      finalPrice,
      startDate,
      expiresAt,
      nextBillingDate,
      razorpaySubscriptionId,
      razorpayCustomerId,
      razorpayPlanId,
      autoRenewal,
      discountCodeUsed
    ]
  );

  return result.rows[0];
};

/**
 * Finds subscription by ID
 *
 * @param {string} subscriptionId - Subscription ID
 * @returns {Promise<Object|null>} - Subscription object or null
 */
const findById = async (subscriptionId) => {
  const result = await query(
    `SELECT
      s.*,
      u.full_name as user_name,
      u.email as user_email,
      a.full_name as analyst_name,
      a.email as analyst_email,
      t.name as tier_name,
      t.description as tier_description
     FROM subscriptions s
     INNER JOIN users u ON s.user_id = u.id
     INNER JOIN users a ON s.analyst_id = a.id
     INNER JOIN subscription_tiers t ON s.tier_id = t.id
     WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [subscriptionId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Finds subscription by Razorpay subscription ID
 *
 * @param {string} razorpaySubscriptionId - Razorpay subscription ID
 * @returns {Promise<Object|null>} - Subscription object or null
 */
const findByRazorpayId = async (razorpaySubscriptionId) => {
  const result = await query(
    `SELECT * FROM subscriptions
     WHERE razorpay_subscription_id = $1 AND deleted_at IS NULL`,
    [razorpaySubscriptionId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Gets all subscriptions for a user
 *
 * @param {string} userId - User ID
 * @param {string} status - Optional status filter ('active', 'cancelled', etc.)
 * @returns {Promise<Array>} - Array of subscriptions
 */
const findByUserId = async (userId, status = null) => {
  let queryText = `
    SELECT
      s.*,
      a.full_name as analyst_name,
      a.profile_photo as analyst_photo,
      a.sebi_registration_number,
      t.name as tier_name,
      t.description as tier_description,
      t.max_clients
    FROM subscriptions s
    INNER JOIN users a ON s.analyst_id = a.id
    INNER JOIN subscription_tiers t ON s.tier_id = t.id
    WHERE s.user_id = $1 AND s.deleted_at IS NULL
  `;

  const params = [userId];

  if (status) {
    queryText += ` AND s.status = $2`;
    params.push(status);
  }

  queryText += ` ORDER BY s.created_at DESC`;

  const result = await query(queryText, params);
  return result.rows;
};

/**
 * Gets all subscriptions for an analyst (their subscribers)
 *
 * @param {string} analystId - Analyst ID
 * @param {string} status - Optional status filter
 * @returns {Promise<Array>} - Array of subscriptions
 */
const findByAnalystId = async (analystId, status = null) => {
  let queryText = `
    SELECT
      s.*,
      u.full_name as user_name,
      u.email as user_email,
      u.phone_number as user_phone,
      t.name as tier_name,
      t.price as tier_price
    FROM subscriptions s
    INNER JOIN users u ON s.user_id = u.id
    INNER JOIN subscription_tiers t ON s.tier_id = t.id
    WHERE s.analyst_id = $1 AND s.deleted_at IS NULL
  `;

  const params = [analystId];

  if (status) {
    queryText += ` AND s.status = $2`;
    params.push(status);
  }

  queryText += ` ORDER BY s.created_at DESC`;

  const result = await query(queryText, params);
  return result.rows;
};

/**
 * Checks if user has active subscription with analyst
 *
 * @param {string} userId - User ID
 * @param {string} analystId - Analyst ID
 * @returns {Promise<Object|null>} - Active subscription or null
 */
const findActiveByUserAndAnalyst = async (userId, analystId) => {
  const result = await query(
    `SELECT
      s.*,
      t.name as tier_name,
      t.description as tier_description
     FROM subscriptions s
     INNER JOIN subscription_tiers t ON s.tier_id = t.id
     WHERE s.user_id = $1
     AND s.analyst_id = $2
     AND s.status = 'active'
     AND s.deleted_at IS NULL
     AND s.expires_at > NOW()`,
    [userId, analystId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Updates subscription status
 *
 * @param {string} subscriptionId - Subscription ID
 * @param {string} status - New status
 * @param {Object} additionalUpdates - Optional additional fields to update
 * @returns {Promise<Object>} - Updated subscription
 */
const updateStatus = async (subscriptionId, status, additionalUpdates = {}) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Build dynamic update query
    const updates = { status, ...additionalUpdates };
    const fields = Object.keys(updates);
    const values = Object.values(updates);

    const setClause = fields.map((field, idx) => `${field} = $${idx + 1}`).join(', ');

    const result = await client.query(
      `UPDATE subscriptions
       SET ${setClause}, updated_at = NOW()
       WHERE id = $${fields.length + 1}
       RETURNING *`,
      [...values, subscriptionId]
    );

    await client.query('COMMIT');

    return result.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Updates subscription expiry and billing dates
 * Used during renewal
 *
 * @param {string} subscriptionId - Subscription ID
 * @param {Date} expiresAt - New expiry date
 * @param {Date} nextBillingDate - Next billing date
 * @returns {Promise<Object>} - Updated subscription
 */
const updateExpiryDates = async (subscriptionId, expiresAt, nextBillingDate) => {
  const result = await query(
    `UPDATE subscriptions
     SET expires_at = $1,
         next_billing_date = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [expiresAt, nextBillingDate, subscriptionId]
  );

  return result.rows[0];
};

/**
 * Increments payment retry count
 * Used during payment failure recovery
 *
 * @param {string} subscriptionId - Subscription ID
 * @returns {Promise<Object>} - Updated subscription
 */
const incrementRetryCount = async (subscriptionId) => {
  const result = await query(
    `UPDATE subscriptions
     SET payment_retry_count = payment_retry_count + 1,
         last_payment_attempt = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [subscriptionId]
  );

  return result.rows[0];
};

/**
 * Sets grace period for subscription
 * Called when payment fails
 *
 * @param {string} subscriptionId - Subscription ID
 * @param {Date} gracePeriodEndsAt - Grace period end date
 * @returns {Promise<Object>} - Updated subscription
 */
const setGracePeriod = async (subscriptionId, gracePeriodEndsAt) => {
  const result = await query(
    `UPDATE subscriptions
     SET grace_period_ends_at = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [gracePeriodEndsAt, subscriptionId]
  );

  return result.rows[0];
};

/**
 * Gets subscriptions expiring soon (within specified days)
 *
 * @param {number} daysAhead - Number of days to look ahead (default: 5)
 * @returns {Promise<Array>} - Array of expiring subscriptions
 */
const findExpiringSoon = async (daysAhead = 5) => {
  const result = await query(
    `SELECT
      s.*,
      u.full_name as user_name,
      u.email as user_email,
      a.full_name as analyst_name,
      t.name as tier_name
     FROM subscriptions s
     INNER JOIN users u ON s.user_id = u.id
     INNER JOIN users a ON s.analyst_id = a.id
     INNER JOIN subscription_tiers t ON s.tier_id = t.id
     WHERE s.status = 'active'
     AND s.auto_renewal = false
     AND s.deleted_at IS NULL
     AND s.expires_at > NOW()
     AND s.expires_at <= NOW() + INTERVAL '${daysAhead} days'
     ORDER BY s.expires_at ASC`
  );

  return result.rows;
};

/**
 * Gets subscriptions needing payment retry
 * Called by cron job to retry failed payments
 *
 * @returns {Promise<Array>} - Array of subscriptions needing retry
 */
const findNeedingPaymentRetry = async () => {
  const result = await query(
    `SELECT
      s.*,
      u.email as user_email,
      u.phone_number as user_phone,
      a.full_name as analyst_name
     FROM subscriptions s
     INNER JOIN users u ON s.user_id = u.id
     INNER JOIN users a ON s.analyst_id = a.id
     WHERE s.status IN ('pending_payment', 'suspended')
     AND s.payment_retry_count < 3
     AND s.deleted_at IS NULL
     AND (
       s.last_payment_attempt IS NULL
       OR s.last_payment_attempt < NOW() - INTERVAL '24 hours'
     )
     ORDER BY s.last_payment_attempt ASC`
  );

  return result.rows;
};

/**
 * Gets expired subscriptions that need status update
 * Called by cron job to mark subscriptions as expired
 *
 * @returns {Promise<Array>} - Array of expired subscriptions
 */
const findExpired = async () => {
  const result = await query(
    `SELECT * FROM subscriptions
     WHERE status = 'active'
     AND expires_at < NOW()
     AND deleted_at IS NULL`
  );

  return result.rows;
};

/**
 * Cancels subscription
 *
 * @param {string} subscriptionId - Subscription ID
 * @param {boolean} immediate - If true, cancel immediately; if false, cancel at cycle end
 * @returns {Promise<Object>} - Updated subscription
 */
const cancel = async (subscriptionId, immediate = false) => {
  const updates = {
    cancelled_at: new Date(),
    auto_renewal: false
  };

  if (immediate) {
    updates.status = 'cancelled';
  }

  const result = await query(
    `UPDATE subscriptions
     SET cancelled_at = $1,
         auto_renewal = $2,
         status = CASE WHEN $3 = true THEN 'cancelled' ELSE status END,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [updates.cancelled_at, updates.auto_renewal, immediate, subscriptionId]
  );

  return result.rows[0];
};

/**
 * Soft deletes subscription
 *
 * @param {string} subscriptionId - Subscription ID
 * @returns {Promise<Object>} - Deleted subscription
 */
const softDelete = async (subscriptionId) => {
  const result = await query(
    `UPDATE subscriptions
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [subscriptionId]
  );

  return result.rows[0];
};

/**
 * Gets subscription statistics for an analyst
 *
 * @param {string} analystId - Analyst ID
 * @returns {Promise<Object>} - Subscription statistics
 */
const getAnalystStats = async (analystId) => {
  const result = await query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'active') as active_count,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
      COUNT(*) FILTER (WHERE status = 'suspended') as suspended_count,
      SUM(final_price) FILTER (WHERE status = 'active') as monthly_revenue,
      AVG(final_price) FILTER (WHERE status = 'active') as avg_subscription_price
     FROM subscriptions
     WHERE analyst_id = $1
     AND deleted_at IS NULL`,
    [analystId]
  );

  return result.rows[0];
};

/**
 * Gets user's subscription history with payment details
 *
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Subscription history
 */
const getUserHistory = async (userId) => {
  const result = await query(
    `SELECT
      s.*,
      a.full_name as analyst_name,
      a.profile_photo as analyst_photo,
      t.name as tier_name,
      (
        SELECT SUM(amount)
        FROM payment_transactions pt
        WHERE pt.subscription_id = s.id
        AND pt.status = 'captured'
      ) as total_paid
     FROM subscriptions s
     INNER JOIN users a ON s.analyst_id = a.id
     INNER JOIN subscription_tiers t ON s.tier_id = t.id
     WHERE s.user_id = $1
     AND s.deleted_at IS NULL
     ORDER BY s.created_at DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * Toggles auto-renewal for subscription
 *
 * @param {string} subscriptionId - Subscription ID
 * @param {boolean} autoRenewal - Auto-renewal flag
 * @returns {Promise<Object>} - Updated subscription
 */
const toggleAutoRenewal = async (subscriptionId, autoRenewal) => {
  const result = await query(
    `UPDATE subscriptions
     SET auto_renewal = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [autoRenewal, subscriptionId]
  );

  return result.rows[0];
};

/**
 * Gets count of active subscribers for an analyst
 *
 * @param {string} analystId - Analyst ID
 * @returns {Promise<number>} - Active subscriber count
 */
const getActiveSubscriberCount = async (analystId) => {
  const result = await query(
    `SELECT COUNT(*) as count
     FROM subscriptions
     WHERE analyst_id = $1
     AND status = 'active'
     AND deleted_at IS NULL`,
    [analystId]
  );

  return parseInt(result.rows[0].count);
};

/**
 * Checks if tier is at max capacity
 *
 * @param {string} tierId - Tier ID
 * @returns {Promise<boolean>} - True if at capacity
 */
const isTierAtCapacity = async (tierId) => {
  const result = await query(
    `SELECT
      t.max_clients,
      COUNT(s.id) as current_subscribers
     FROM subscription_tiers t
     LEFT JOIN subscriptions s ON t.id = s.tier_id AND s.status = 'active' AND s.deleted_at IS NULL
     WHERE t.id = $1
     GROUP BY t.id, t.max_clients`,
    [tierId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  const { max_clients, current_subscribers } = result.rows[0];

  if (max_clients === null) {
    return false; // Unlimited capacity
  }

  return parseInt(current_subscribers) >= parseInt(max_clients);
};

module.exports = {
  create,
  findById,
  findByRazorpayId,
  findByUserId,
  findByAnalystId,
  findActiveByUserAndAnalyst,
  updateStatus,
  updateExpiryDates,
  incrementRetryCount,
  setGracePeriod,
  findExpiringSoon,
  findNeedingPaymentRetry,
  findExpired,
  cancel,
  softDelete,
  getAnalystStats,
  getUserHistory,
  toggleAutoRenewal,
  getActiveSubscriberCount,
  isTierAtCapacity
};
