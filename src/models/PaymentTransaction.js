/**
 * Payment Transaction Model
 *
 * Database queries for payment transaction management
 * Tracks all payments, refunds, and payouts through Razorpay
 */

const { query, getClient } = require('../config/database');

/**
 * Creates a new payment transaction record
 *
 * @param {Object} transactionData - Transaction data
 * @returns {Promise<Object>} - Created transaction
 */
const create = async (transactionData) => {
  const {
    userId,
    analystId,
    subscriptionId,
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySignature,
    transactionType,
    amount,
    currency,
    status,
    paymentMethod,
    failureReason,
    failureCode,
    retryCount,
    metadata
  } = transactionData;

  const result = await query(
    `INSERT INTO payment_transactions (
      user_id,
      analyst_id,
      subscription_id,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      transaction_type,
      amount,
      currency,
      status,
      payment_method,
      failure_reason,
      failure_code,
      retry_count,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *`,
    [
      userId,
      analystId,
      subscriptionId || null,
      razorpayPaymentId || null,
      razorpayOrderId || null,
      razorpaySignature || null,
      transactionType,
      amount,
      currency || 'INR',
      status,
      paymentMethod || null,
      failureReason || null,
      failureCode || null,
      retryCount || 0,
      metadata ? JSON.stringify(metadata) : '{}'
    ]
  );

  return result.rows[0];
};

/**
 * Finds transaction by ID
 *
 * @param {string} transactionId - Transaction ID
 * @returns {Promise<Object|null>} - Transaction object or null
 */
const findById = async (transactionId) => {
  const result = await query(
    `SELECT
      pt.*,
      u.full_name as user_name,
      u.email as user_email,
      a.full_name as analyst_name,
      s.tier_id
     FROM payment_transactions pt
     INNER JOIN users u ON pt.user_id = u.id
     INNER JOIN users a ON pt.analyst_id = a.id
     LEFT JOIN subscriptions s ON pt.subscription_id = s.id
     WHERE pt.id = $1`,
    [transactionId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Finds transaction by Razorpay payment ID
 *
 * @param {string} razorpayPaymentId - Razorpay payment ID
 * @returns {Promise<Object|null>} - Transaction object or null
 */
const findByRazorpayPaymentId = async (razorpayPaymentId) => {
  const result = await query(
    `SELECT * FROM payment_transactions
     WHERE razorpay_payment_id = $1`,
    [razorpayPaymentId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Gets all transactions for a user
 *
 * @param {string} userId - User ID
 * @param {Object} options - Query options (limit, offset, status filter)
 * @returns {Promise<Array>} - Array of transactions
 */
const findByUserId = async (userId, options = {}) => {
  const { limit = 50, offset = 0, status = null } = options;

  let queryText = `
    SELECT
      pt.*,
      a.full_name as analyst_name,
      a.profile_photo as analyst_photo,
      s.tier_id,
      t.name as tier_name
    FROM payment_transactions pt
    INNER JOIN users a ON pt.analyst_id = a.id
    LEFT JOIN subscriptions s ON pt.subscription_id = s.id
    LEFT JOIN subscription_tiers t ON s.tier_id = t.id
    WHERE pt.user_id = $1
  `;

  const params = [userId];
  let paramIndex = 2;

  if (status) {
    queryText += ` AND pt.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  queryText += ` ORDER BY pt.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await query(queryText, params);
  return result.rows;
};

/**
 * Gets all transactions for an analyst (their revenue)
 *
 * @param {string} analystId - Analyst ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of transactions
 */
const findByAnalystId = async (analystId, options = {}) => {
  const { limit = 50, offset = 0, status = null, transactionType = null } = options;

  let queryText = `
    SELECT
      pt.*,
      u.full_name as user_name,
      u.email as user_email,
      s.tier_id,
      t.name as tier_name
    FROM payment_transactions pt
    INNER JOIN users u ON pt.user_id = u.id
    LEFT JOIN subscriptions s ON pt.subscription_id = s.id
    LEFT JOIN subscription_tiers t ON s.tier_id = t.id
    WHERE pt.analyst_id = $1
  `;

  const params = [analystId];
  let paramIndex = 2;

  if (status) {
    queryText += ` AND pt.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (transactionType) {
    queryText += ` AND pt.transaction_type = $${paramIndex}`;
    params.push(transactionType);
    paramIndex++;
  }

  queryText += ` ORDER BY pt.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await query(queryText, params);
  return result.rows;
};

/**
 * Gets transactions for a specific subscription
 *
 * @param {string} subscriptionId - Subscription ID
 * @returns {Promise<Array>} - Array of transactions
 */
const findBySubscriptionId = async (subscriptionId) => {
  const result = await query(
    `SELECT * FROM payment_transactions
     WHERE subscription_id = $1
     ORDER BY created_at DESC`,
    [subscriptionId]
  );

  return result.rows;
};

/**
 * Updates transaction status
 *
 * @param {string} transactionId - Transaction ID
 * @param {string} status - New status
 * @param {Object} additionalData - Additional fields to update
 * @returns {Promise<Object>} - Updated transaction
 */
const updateStatus = async (transactionId, status, additionalData = {}) => {
  const updates = { status, ...additionalData };
  const fields = Object.keys(updates);
  const values = Object.values(updates);

  const setClause = fields.map((field, idx) => `${field} = $${idx + 1}`).join(', ');

  const result = await query(
    `UPDATE payment_transactions
     SET ${setClause}, updated_at = NOW()
     WHERE id = $${fields.length + 1}
     RETURNING *`,
    [...values, transactionId]
  );

  return result.rows[0];
};

/**
 * Records a refund for a transaction
 *
 * @param {string} transactionId - Transaction ID
 * @param {number} refundAmount - Refund amount in paise
 * @param {string} refundReason - Reason for refund
 * @param {string} razorpayRefundId - Razorpay refund ID
 * @returns {Promise<Object>} - Updated transaction
 */
const recordRefund = async (transactionId, refundAmount, refundReason, razorpayRefundId) => {
  const result = await query(
    `UPDATE payment_transactions
     SET status = 'refunded',
         refund_amount = $1,
         refund_reason = $2,
         refunded_at = NOW(),
         razorpay_refund_id = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [refundAmount, refundReason, razorpayRefundId, transactionId]
  );

  return result.rows[0];
};

/**
 * Records a payout to analyst
 *
 * @param {Object} payoutData - Payout data
 * @returns {Promise<Object>} - Created payout transaction
 */
const recordPayout = async (payoutData) => {
  const {
    analystId,
    amount,
    payoutAmount,
    platformCommission,
    razorpayPayoutId,
    metadata
  } = payoutData;

  const result = await query(
    `INSERT INTO payment_transactions (
      user_id,
      analyst_id,
      transaction_type,
      amount,
      payout_amount,
      platform_commission,
      status,
      payout_status,
      razorpay_payout_id,
      paid_out_at,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      analystId, // user_id = analyst_id for payout transactions
      analystId,
      'payout',
      amount,
      payoutAmount,
      platformCommission,
      'captured',
      'completed',
      razorpayPayoutId,
      new Date(),
      JSON.stringify(metadata || {})
    ]
  );

  return result.rows[0];
};

/**
 * Gets total revenue for an analyst in a date range
 *
 * @param {string} analystId - Analyst ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} - Revenue statistics
 */
const getAnalystRevenue = async (analystId, startDate, endDate) => {
  const result = await query(
    `SELECT
      COUNT(*) as transaction_count,
      SUM(amount) as total_revenue,
      SUM(CASE WHEN status = 'captured' THEN amount ELSE 0 END) as captured_revenue,
      SUM(CASE WHEN status = 'refunded' THEN refund_amount ELSE 0 END) as refunded_amount,
      AVG(amount) as avg_transaction_amount
     FROM payment_transactions
     WHERE analyst_id = $1
     AND transaction_type IN ('subscription_payment', 'renewal')
     AND created_at >= $2
     AND created_at <= $3`,
    [analystId, startDate, endDate]
  );

  return {
    transactionCount: parseInt(result.rows[0].transaction_count) || 0,
    totalRevenue: parseInt(result.rows[0].total_revenue) || 0,
    capturedRevenue: parseInt(result.rows[0].captured_revenue) || 0,
    refundedAmount: parseInt(result.rows[0].refunded_amount) || 0,
    avgTransactionAmount: parseFloat(result.rows[0].avg_transaction_amount) || 0
  };
};

/**
 * Gets user's total spending
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Spending statistics
 */
const getUserSpending = async (userId) => {
  const result = await query(
    `SELECT
      COUNT(*) as transaction_count,
      SUM(CASE WHEN status = 'captured' THEN amount ELSE 0 END) as total_spent,
      SUM(CASE WHEN status = 'refunded' THEN refund_amount ELSE 0 END) as total_refunded,
      MIN(created_at) as first_payment_date,
      MAX(created_at) as last_payment_date
     FROM payment_transactions
     WHERE user_id = $1
     AND transaction_type IN ('subscription_payment', 'renewal')`,
    [userId]
  );

  return {
    transactionCount: parseInt(result.rows[0].transaction_count) || 0,
    totalSpent: parseInt(result.rows[0].total_spent) || 0,
    totalRefunded: parseInt(result.rows[0].total_refunded) || 0,
    firstPaymentDate: result.rows[0].first_payment_date,
    lastPaymentDate: result.rows[0].last_payment_date
  };
};

/**
 * Gets failed payment transactions needing retry
 *
 * @returns {Promise<Array>} - Array of failed transactions
 */
const findFailedPayments = async () => {
  const result = await query(
    `SELECT
      pt.*,
      u.email as user_email,
      u.phone_number as user_phone,
      s.id as subscription_id
     FROM payment_transactions pt
     INNER JOIN users u ON pt.user_id = u.id
     LEFT JOIN subscriptions s ON pt.subscription_id = s.id
     WHERE pt.status = 'failed'
     AND pt.retry_count < 3
     AND pt.created_at > NOW() - INTERVAL '10 days'
     ORDER BY pt.created_at DESC`
  );

  return result.rows;
};

/**
 * Gets pending payouts for an analyst
 *
 * @param {string} analystId - Analyst ID
 * @returns {Promise<Array>} - Array of pending payout transactions
 */
const getPendingPayouts = async (analystId) => {
  const result = await query(
    `SELECT * FROM payment_transactions
     WHERE analyst_id = $1
     AND transaction_type = 'payout'
     AND payout_status = 'pending'
     ORDER BY created_at ASC`,
    [analystId]
  );

  return result.rows;
};

/**
 * Gets platform revenue statistics
 *
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} - Platform revenue statistics
 */
const getPlatformRevenue = async (startDate, endDate) => {
  const result = await query(
    `SELECT
      COUNT(*) as transaction_count,
      SUM(amount) as total_revenue,
      SUM(platform_commission) as total_commission,
      COUNT(DISTINCT analyst_id) as active_analysts,
      COUNT(DISTINCT user_id) as active_customers
     FROM payment_transactions
     WHERE status = 'captured'
     AND transaction_type IN ('subscription_payment', 'renewal')
     AND created_at >= $1
     AND created_at <= $2`,
    [startDate, endDate]
  );

  return {
    transactionCount: parseInt(result.rows[0].transaction_count) || 0,
    totalRevenue: parseInt(result.rows[0].total_revenue) || 0,
    totalCommission: parseInt(result.rows[0].total_commission) || 0,
    activeAnalysts: parseInt(result.rows[0].active_analysts) || 0,
    activeCustomers: parseInt(result.rows[0].active_customers) || 0
  };
};

/**
 * Gets payment method distribution
 *
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} - Payment method statistics
 */
const getPaymentMethodStats = async (startDate, endDate) => {
  const result = await query(
    `SELECT
      payment_method,
      COUNT(*) as count,
      SUM(amount) as total_amount
     FROM payment_transactions
     WHERE status = 'captured'
     AND created_at >= $1
     AND created_at <= $2
     GROUP BY payment_method
     ORDER BY count DESC`,
    [startDate, endDate]
  );

  return result.rows;
};

/**
 * Gets transaction success rate
 *
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} - Success rate statistics
 */
const getSuccessRate = async (startDate, endDate) => {
  const result = await query(
    `SELECT
      COUNT(*) as total_attempts,
      COUNT(*) FILTER (WHERE status = 'captured') as successful,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      ROUND(
        (COUNT(*) FILTER (WHERE status = 'captured')::NUMERIC / COUNT(*)::NUMERIC) * 100,
        2
      ) as success_rate_percentage
     FROM payment_transactions
     WHERE transaction_type IN ('subscription_payment', 'renewal')
     AND created_at >= $1
     AND created_at <= $2`,
    [startDate, endDate]
  );

  return {
    totalAttempts: parseInt(result.rows[0].total_attempts) || 0,
    successful: parseInt(result.rows[0].successful) || 0,
    failed: parseInt(result.rows[0].failed) || 0,
    successRatePercentage: parseFloat(result.rows[0].success_rate_percentage) || 0
  };
};

/**
 * Checks if transaction already exists (idempotency check)
 *
 * @param {string} razorpayPaymentId - Razorpay payment ID
 * @returns {Promise<boolean>} - True if transaction exists
 */
const transactionExists = async (razorpayPaymentId) => {
  const result = await query(
    `SELECT id FROM payment_transactions
     WHERE razorpay_payment_id = $1
     LIMIT 1`,
    [razorpayPaymentId]
  );

  return result.rows.length > 0;
};

/**
 * Gets recent transactions for admin dashboard
 *
 * @param {number} limit - Number of transactions to fetch
 * @returns {Promise<Array>} - Recent transactions
 */
const getRecentTransactions = async (limit = 20) => {
  const result = await query(
    `SELECT
      pt.*,
      u.full_name as user_name,
      a.full_name as analyst_name
     FROM payment_transactions pt
     INNER JOIN users u ON pt.user_id = u.id
     INNER JOIN users a ON pt.analyst_id = a.id
     ORDER BY pt.created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
};

/**
 * Gets transactions requiring reconciliation
 * (Transactions older than 1 hour still in pending/authorized state)
 *
 * @returns {Promise<Array>} - Transactions needing reconciliation
 */
const findNeedingReconciliation = async () => {
  const result = await query(
    `SELECT * FROM payment_transactions
     WHERE status IN ('pending', 'authorized')
     AND created_at < NOW() - INTERVAL '1 hour'
     ORDER BY created_at ASC`
  );

  return result.rows;
};

/**
 * Exports transaction data for a user (for tax purposes)
 *
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} - Transaction export data
 */
const exportUserTransactions = async (userId, startDate, endDate) => {
  const result = await query(
    `SELECT
      pt.created_at as date,
      a.full_name as analyst_name,
      t.name as tier_name,
      pt.amount / 100.0 as amount_inr,
      pt.status,
      pt.payment_method,
      pt.razorpay_payment_id as transaction_id
     FROM payment_transactions pt
     INNER JOIN users a ON pt.analyst_id = a.id
     LEFT JOIN subscriptions s ON pt.subscription_id = s.id
     LEFT JOIN subscription_tiers t ON s.tier_id = t.id
     WHERE pt.user_id = $1
     AND pt.transaction_type IN ('subscription_payment', 'renewal')
     AND pt.created_at >= $2
     AND pt.created_at <= $3
     ORDER BY pt.created_at DESC`,
    [userId, startDate, endDate]
  );

  return result.rows;
};

module.exports = {
  create,
  findById,
  findByRazorpayPaymentId,
  findByUserId,
  findByAnalystId,
  findBySubscriptionId,
  updateStatus,
  recordRefund,
  recordPayout,
  getAnalystRevenue,
  getUserSpending,
  findFailedPayments,
  getPendingPayouts,
  getPlatformRevenue,
  getPaymentMethodStats,
  getSuccessRate,
  transactionExists,
  getRecentTransactions,
  findNeedingReconciliation,
  exportUserTransactions
};
