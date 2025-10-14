/**
 * Admin Controller
 *
 * Handles all admin-related API endpoints including:
 * - Analyst verification queue management
 * - Approve/reject analyst applications
 * - View analyst documents
 * - Platform analytics
 * - User management
 *
 * SECURITY:
 * - All endpoints require admin role authentication
 * - Audit trail logging for all admin actions
 * - Document access with security checks
 */

const AnalystProfile = require('../models/AnalystProfile');
const User = require('../models/User');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { sendEmail, getEmailTemplate } = require('../services/emailService');
const { query } = require('../config/database');
const config = require('../config/env');

/**
 * GET /api/admin/verification-queue
 * Get pending analyst verifications
 *
 * @access Private (Admin only)
 * @query {string} status - Filter by status (pending, in_review, all)
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Results per page (default: 20)
 */
const getVerificationQueue = asyncHandler(async (req, res) => {
  const { status = null, page = 1, limit = 20 } = req.query;

  // Validate status filter
  const validStatuses = ['pending', 'in_review', null];
  const filterStatus = status === 'all' ? null : status;

  if (filterStatus && !validStatuses.includes(filterStatus)) {
    throw new AppError('Invalid status filter', 400);
  }

  // Get verification queue
  const result = await AnalystProfile.getVerificationQueue(
    filterStatus,
    parseInt(page, 10),
    parseInt(limit, 10)
  );

  // Get counts by status for UI display
  const countsSql = `
    SELECT
      verification_status,
      COUNT(*) as count
    FROM analyst_profiles
    WHERE verification_status IN ('pending', 'in_review')
      AND deleted_at IS NULL
    GROUP BY verification_status
  `;

  const countsResult = await query(countsSql, []);
  const statusCounts = countsResult.rows.reduce((acc, row) => {
    acc[row.verification_status] = parseInt(row.count, 10);
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    data: {
      queue: result.analysts,
      pagination: result.pagination,
      statusCounts: {
        pending: statusCounts.pending || 0,
        in_review: statusCounts.in_review || 0,
        total: (statusCounts.pending || 0) + (statusCounts.in_review || 0)
      }
    }
  });
});

/**
 * GET /api/admin/analysts/:id/documents
 * View analyst verification documents
 *
 * @access Private (Admin only)
 * @param {string} id - Analyst profile ID
 */
const getAnalystDocuments = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get analyst profile
  const profile = await AnalystProfile.findById(id);

  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  // Get user details
  const user = await User.findById(profile.user_id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Return profile with documents
  res.status(200).json({
    success: true,
    data: {
      analyst: {
        id: profile.id,
        user_id: profile.user_id,
        display_name: profile.display_name,
        bio: profile.bio,
        photo_url: profile.photo_url,
        specializations: profile.specializations,
        languages: profile.languages,
        sebi_number: profile.sebi_number,
        ria_number: profile.ria_number,
        country: profile.country,
        verification_status: profile.verification_status,
        verification_documents: profile.verification_documents,
        verified_at: profile.verified_at,
        verified_by: profile.verified_by,
        rejection_reason: profile.rejection_reason,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      },
      user: {
        email: user.email,
        phone: user.phone,
        created_at: user.created_at,
        is_email_verified: user.is_email_verified,
        is_phone_verified: user.is_phone_verified
      }
    }
  });
});

/**
 * POST /api/admin/analysts/:id/approve
 * Approve analyst verification
 *
 * @access Private (Admin only)
 * @param {string} id - Analyst profile ID
 */
const approveAnalyst = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminUserId = req.user.id;

  // Get analyst profile
  const profile = await AnalystProfile.findById(id);

  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  // Check if already approved
  if (profile.verification_status === 'approved') {
    throw new AppError('This analyst is already verified', 400);
  }

  // Check if documents are uploaded
  const documents = profile.verification_documents || [];
  if (documents.length === 0) {
    throw new AppError('Cannot approve: No verification documents uploaded', 400);
  }

  // Approve the analyst
  const updatedProfile = await AnalystProfile.approve(id, adminUserId);

  // Send approval email
  try {
    const user = await User.findById(profile.user_id);
    if (user.email) {
      await sendVerificationApprovedEmail(user.email, profile.display_name);
    }
  } catch (emailError) {
    console.error('Failed to send approval email:', emailError.message);
    // Don't throw - email failure should not block approval
  }

  // Log admin action
  console.log('Admin Action:', {
    action: 'APPROVE_ANALYST',
    admin_user_id: adminUserId,
    analyst_profile_id: id,
    analyst_name: profile.display_name,
    timestamp: new Date().toISOString()
  });

  res.status(200).json({
    success: true,
    message: 'Analyst verified successfully',
    data: {
      profile: {
        id: updatedProfile.id,
        display_name: updatedProfile.display_name,
        verification_status: updatedProfile.verification_status,
        verified_at: updatedProfile.verified_at,
        verified_by: updatedProfile.verified_by
      }
    }
  });
});

/**
 * POST /api/admin/analysts/:id/reject
 * Reject analyst verification
 *
 * @access Private (Admin only)
 * @param {string} id - Analyst profile ID
 * @body {string} rejection_reason - Reason for rejection (required)
 */
const rejectAnalyst = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejection_reason } = req.body;
  const adminUserId = req.user.id;

  // Validation
  if (!rejection_reason || rejection_reason.trim().length < 10) {
    throw new AppError('Rejection reason must be at least 10 characters', 400);
  }

  // Get analyst profile
  const profile = await AnalystProfile.findById(id);

  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  // Check if already approved (can't reject approved analysts)
  if (profile.verification_status === 'approved') {
    throw new AppError('Cannot reject an already approved analyst. Contact support for deactivation.', 400);
  }

  // Reject the analyst
  const updatedProfile = await AnalystProfile.reject(id, rejection_reason.trim());

  // Send rejection email
  try {
    const user = await User.findById(profile.user_id);
    if (user.email) {
      await sendVerificationRejectedEmail(
        user.email,
        profile.display_name,
        rejection_reason.trim()
      );
    }
  } catch (emailError) {
    console.error('Failed to send rejection email:', emailError.message);
    // Don't throw - email failure should not block rejection
  }

  // Log admin action
  console.log('Admin Action:', {
    action: 'REJECT_ANALYST',
    admin_user_id: adminUserId,
    analyst_profile_id: id,
    analyst_name: profile.display_name,
    rejection_reason: rejection_reason.trim(),
    timestamp: new Date().toISOString()
  });

  res.status(200).json({
    success: true,
    message: 'Analyst verification rejected',
    data: {
      profile: {
        id: updatedProfile.id,
        display_name: updatedProfile.display_name,
        verification_status: updatedProfile.verification_status,
        rejection_reason: updatedProfile.rejection_reason
      }
    }
  });
});

/**
 * PUT /api/admin/analysts/:id/status
 * Update analyst verification status (for in_review transition)
 *
 * @access Private (Admin only)
 * @param {string} id - Analyst profile ID
 * @body {string} status - New status (in_review)
 */
const updateAnalystStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const adminUserId = req.user.id;

  // Validation
  const allowedStatuses = ['in_review', 'pending'];
  if (!allowedStatuses.includes(status)) {
    throw new AppError(`Invalid status. Allowed: ${allowedStatuses.join(', ')}`, 400);
  }

  // Get analyst profile
  const profile = await AnalystProfile.findById(id);

  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  // Update status using updateVerificationStatus
  const updatedProfile = await AnalystProfile.updateVerificationStatus(id, {
    status,
    documents: profile.verification_documents || []
  });

  // Log admin action
  console.log('Admin Action:', {
    action: 'UPDATE_ANALYST_STATUS',
    admin_user_id: adminUserId,
    analyst_profile_id: id,
    old_status: profile.verification_status,
    new_status: status,
    timestamp: new Date().toISOString()
  });

  res.status(200).json({
    success: true,
    message: 'Analyst status updated successfully',
    data: {
      profile: {
        id: updatedProfile.id,
        display_name: updatedProfile.display_name,
        verification_status: updatedProfile.verification_status
      }
    }
  });
});

/**
 * GET /api/admin/analytics
 * Get platform analytics
 *
 * @access Private (Admin only)
 */
const getAnalytics = asyncHandler(async (req, res) => {
  try {
    // Get analyst statistics
    const analystStatsSql = `
      SELECT
        COUNT(*) FILTER (WHERE verification_status = 'approved') as approved_analysts,
        COUNT(*) FILTER (WHERE verification_status = 'pending') as pending_analysts,
        COUNT(*) FILTER (WHERE verification_status = 'in_review') as in_review_analysts,
        COUNT(*) FILTER (WHERE verification_status = 'rejected') as rejected_analysts,
        COUNT(*) as total_analysts,
        AVG(avg_rating) FILTER (WHERE verification_status = 'approved') as avg_platform_rating,
        SUM(active_subscribers) FILTER (WHERE verification_status = 'approved') as total_active_subscriptions,
        SUM(monthly_revenue) FILTER (WHERE verification_status = 'approved') as total_monthly_revenue
      FROM analyst_profiles
      WHERE deleted_at IS NULL
    `;

    const analystStats = await query(analystStatsSql, []);

    // Get user statistics
    const userStatsSql = `
      SELECT
        COUNT(*) FILTER (WHERE role = 'trader') as total_traders,
        COUNT(*) FILTER (WHERE role = 'analyst') as total_analyst_users,
        COUNT(*) FILTER (WHERE role = 'admin') as total_admins,
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE is_email_verified = true) as verified_emails,
        COUNT(*) FILTER (WHERE is_phone_verified = true) as verified_phones,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_users_last_30_days
      FROM users
      WHERE deleted_at IS NULL
    `;

    const userStats = await query(userStatsSql, []);

    // Get subscription statistics
    const subscriptionStatsSql = `
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_subscriptions,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_subscriptions,
        COUNT(*) FILTER (WHERE status = 'expired') as expired_subscriptions,
        COUNT(*) as total_subscriptions,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_subscriptions_last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_subscriptions_last_30_days
      FROM subscriptions
      WHERE deleted_at IS NULL
    `;

    const subscriptionStats = await query(subscriptionStatsSql, []);

    // Get revenue statistics (last 30 days)
    const revenueStatsSql = `
      SELECT
        COUNT(*) as total_transactions,
        SUM(amount) FILTER (WHERE status = 'captured') as total_revenue,
        SUM(amount) FILTER (WHERE status = 'captured' AND created_at >= NOW() - INTERVAL '7 days') as revenue_last_7_days,
        SUM(amount) FILTER (WHERE status = 'captured' AND created_at >= NOW() - INTERVAL '30 days') as revenue_last_30_days,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_transactions,
        COUNT(*) FILTER (WHERE status = 'refunded') as refunded_transactions
      FROM payment_transactions
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `;

    const revenueStats = await query(revenueStatsSql, []);

    // Get post statistics
    const postStatsSql = `
      SELECT
        COUNT(*) as total_posts,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as posts_last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as posts_last_30_days,
        AVG(views_count) as avg_views_per_post,
        AVG(bookmarks_count) as avg_bookmarks_per_post
      FROM posts
      WHERE deleted_at IS NULL
    `;

    const postStats = await query(postStatsSql, []);

    // Get review statistics
    const reviewStatsSql = `
      SELECT
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating_platform_wide,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as reviews_last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as reviews_last_30_days
      FROM reviews
      WHERE deleted_at IS NULL
    `;

    const reviewStats = await query(reviewStatsSql, []);

    // Get top analysts by revenue
    const topAnalystsSql = `
      SELECT
        ap.id,
        ap.display_name,
        ap.photo_url,
        ap.avg_rating,
        ap.total_reviews,
        ap.active_subscribers,
        ap.monthly_revenue,
        ap.total_posts
      FROM analyst_profiles ap
      WHERE ap.verification_status = 'approved' AND ap.deleted_at IS NULL
      ORDER BY ap.monthly_revenue DESC
      LIMIT 10
    `;

    const topAnalysts = await query(topAnalystsSql, []);

    // Format response
    res.status(200).json({
      success: true,
      data: {
        analysts: {
          approved: parseInt(analystStats.rows[0].approved_analysts, 10),
          pending: parseInt(analystStats.rows[0].pending_analysts, 10),
          in_review: parseInt(analystStats.rows[0].in_review_analysts, 10),
          rejected: parseInt(analystStats.rows[0].rejected_analysts, 10),
          total: parseInt(analystStats.rows[0].total_analysts, 10),
          avg_rating: parseFloat(analystStats.rows[0].avg_platform_rating) || 0
        },
        users: {
          traders: parseInt(userStats.rows[0].total_traders, 10),
          analysts: parseInt(userStats.rows[0].total_analyst_users, 10),
          admins: parseInt(userStats.rows[0].total_admins, 10),
          total: parseInt(userStats.rows[0].total_users, 10),
          verified_emails: parseInt(userStats.rows[0].verified_emails, 10),
          verified_phones: parseInt(userStats.rows[0].verified_phones, 10),
          new_last_7_days: parseInt(userStats.rows[0].new_users_last_7_days, 10),
          new_last_30_days: parseInt(userStats.rows[0].new_users_last_30_days, 10)
        },
        subscriptions: {
          active: parseInt(subscriptionStats.rows[0].active_subscriptions, 10),
          cancelled: parseInt(subscriptionStats.rows[0].cancelled_subscriptions, 10),
          expired: parseInt(subscriptionStats.rows[0].expired_subscriptions, 10),
          total: parseInt(subscriptionStats.rows[0].total_subscriptions, 10),
          new_last_7_days: parseInt(subscriptionStats.rows[0].new_subscriptions_last_7_days, 10),
          new_last_30_days: parseInt(subscriptionStats.rows[0].new_subscriptions_last_30_days, 10),
          total_active_count: parseInt(analystStats.rows[0].total_active_subscriptions, 10)
        },
        revenue: {
          total: parseInt(revenueStats.rows[0].total_revenue || 0, 10) / 100, // Convert paise to rupees
          last_7_days: parseInt(revenueStats.rows[0].revenue_last_7_days || 0, 10) / 100,
          last_30_days: parseInt(revenueStats.rows[0].revenue_last_30_days || 0, 10) / 100,
          monthly_recurring: parseInt(analystStats.rows[0].total_monthly_revenue || 0, 10) / 100,
          total_transactions: parseInt(revenueStats.rows[0].total_transactions, 10),
          failed_transactions: parseInt(revenueStats.rows[0].failed_transactions, 10),
          refunded_transactions: parseInt(revenueStats.rows[0].refunded_transactions, 10)
        },
        posts: {
          total: parseInt(postStats.rows[0].total_posts, 10),
          last_7_days: parseInt(postStats.rows[0].posts_last_7_days, 10),
          last_30_days: parseInt(postStats.rows[0].posts_last_30_days, 10),
          avg_views: parseFloat(postStats.rows[0].avg_views_per_post) || 0,
          avg_bookmarks: parseFloat(postStats.rows[0].avg_bookmarks_per_post) || 0
        },
        reviews: {
          total: parseInt(reviewStats.rows[0].total_reviews, 10),
          avg_rating: parseFloat(reviewStats.rows[0].avg_rating_platform_wide) || 0,
          last_7_days: parseInt(reviewStats.rows[0].reviews_last_7_days, 10),
          last_30_days: parseInt(reviewStats.rows[0].reviews_last_30_days, 10)
        },
        topAnalysts: topAnalysts.rows.map(analyst => ({
          id: analyst.id,
          display_name: analyst.display_name,
          photo_url: analyst.photo_url,
          avg_rating: parseFloat(analyst.avg_rating),
          total_reviews: analyst.total_reviews,
          active_subscribers: analyst.active_subscribers,
          monthly_revenue: analyst.monthly_revenue / 100, // Convert to rupees
          total_posts: analyst.total_posts
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error.message);
    throw new AppError('Failed to fetch analytics', 500);
  }
});

/**
 * Helper: Send verification approved email
 */
const sendVerificationApprovedEmail = async (email, displayName) => {
  const content = `
    <h2>Verification Approved!</h2>
    <p>Hi ${displayName},</p>
    <div class="success-box">
      Congratulations! Your analyst profile has been verified and approved.
    </div>
    <p><strong>What's next?</strong></p>
    <ul>
      <li>You can now start posting trading calls and market analysis</li>
      <li>Set up your subscription tiers and pricing</li>
      <li>Share your profile link to attract subscribers</li>
      <li>Engage with your community in chat channels</li>
    </ul>
    <a href="${config.frontend.url}/analyst/dashboard" class="button">Go to Dashboard</a>
    <p>We're excited to have you on our platform. Good luck!</p>
    <p><strong>Tips for Success:</strong></p>
    <ul>
      <li>Post regularly to keep subscribers engaged</li>
      <li>Provide detailed reasoning for your trading calls</li>
      <li>Respond to subscriber questions promptly</li>
      <li>Be transparent about your performance</li>
    </ul>
  `;

  const html = getEmailTemplate('Verification Approved!', content);

  return sendEmail({
    to: email,
    subject: 'Your Analyst Profile is Now Verified!',
    html: html,
    skipRateLimit: true // Verification emails are critical
  });
};

/**
 * Helper: Send verification rejected email
 */
const sendVerificationRejectedEmail = async (email, displayName, rejectionReason) => {
  const content = `
    <h2>Verification Update</h2>
    <p>Hi ${displayName},</p>
    <div class="info-box">
      Thank you for your interest in becoming a verified analyst on our platform.
      After reviewing your application, we are unable to approve it at this time.
    </div>
    <p><strong>Reason for rejection:</strong></p>
    <p style="background-color: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
      ${rejectionReason}
    </p>
    <p><strong>What can you do?</strong></p>
    <ul>
      <li>Review the rejection reason carefully</li>
      <li>Correct the issues mentioned above</li>
      <li>Upload updated verification documents</li>
      <li>Resubmit your application for review</li>
    </ul>
    <a href="${config.frontend.url}/analyst/documents" class="button">Upload Documents</a>
    <p>If you have any questions or need clarification, please contact our support team.</p>
  `;

  const html = getEmailTemplate('Verification Status Update', content);

  return sendEmail({
    to: email,
    subject: 'Analyst Verification Update Required',
    html: html,
    skipRateLimit: true // Verification emails are critical
  });
};

module.exports = {
  getVerificationQueue,
  getAnalystDocuments,
  approveAnalyst,
  rejectAnalyst,
  updateAnalystStatus,
  getAnalytics
};
