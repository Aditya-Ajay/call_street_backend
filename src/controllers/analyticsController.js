/**
 * Analytics Controller
 *
 * Comprehensive analytics dashboard for analysts
 * Provides revenue, subscriber, post, engagement, review, and churn metrics
 *
 * SECURITY:
 * - Only analysts can view their own analytics
 * - All queries scoped to analyst_id
 * - Rate limiting on analytics endpoints
 *
 * PERFORMANCE:
 * - Optimized queries with indexes
 * - Pagination for large datasets
 * - Date range filters to limit data
 * - Aggregated calculations in SQL
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get revenue metrics
 * GET /api/analytics/revenue
 *
 * Revenue breakdown, trends, and projections
 *
 * @access Private (Analyst only)
 */
const getRevenueMetrics = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { date_range = '30' } = req.query; // days to look back

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    const daysBack = parseInt(date_range);

    // Month-to-date (MTD) revenue
    const mtdResult = await query(
      `SELECT
        COALESCE(SUM(final_price * 0.80), 0) as revenue_paise,
        ROUND(COALESCE(SUM(final_price * 0.80), 0)::DECIMAL / 100, 2) as revenue_inr,
        COUNT(*) as subscription_count
      FROM subscriptions
      WHERE analyst_id = $1
      AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      AND status IN ('active', 'cancelled')
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Last N days revenue
    const recentResult = await query(
      `SELECT
        COALESCE(SUM(final_price * 0.80), 0) as revenue_paise,
        ROUND(COALESCE(SUM(final_price * 0.80), 0)::DECIMAL / 100, 2) as revenue_inr,
        COUNT(*) as subscription_count
      FROM subscriptions
      WHERE analyst_id = $1
      AND created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      AND status IN ('active', 'cancelled')
      AND deleted_at IS NULL`,
      [analystId]
    );

    // All-time revenue
    const allTimeResult = await query(
      `SELECT
        COALESCE(SUM(final_price * 0.80), 0) as revenue_paise,
        ROUND(COALESCE(SUM(final_price * 0.80), 0)::DECIMAL / 100, 2) as revenue_inr,
        COUNT(*) as total_subscriptions
      FROM subscriptions
      WHERE analyst_id = $1
      AND status IN ('active', 'cancelled')
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Daily revenue breakdown (last N days)
    const dailyResult = await query(
      `SELECT
        DATE(created_at) as date,
        ROUND(SUM(final_price * 0.80)::DECIMAL / 100, 2) as revenue_inr,
        COUNT(*) as new_subscriptions
      FROM subscriptions
      WHERE analyst_id = $1
      AND created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      AND status IN ('active', 'cancelled')
      AND deleted_at IS NULL
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [analystId]
    );

    // Revenue by tier
    const tierResult = await query(
      `SELECT
        t.name as tier_name,
        t.price as tier_price,
        COUNT(s.id) as subscriber_count,
        ROUND(SUM(s.final_price * 0.80)::DECIMAL / 100, 2) as revenue_inr
      FROM subscriptions s
      INNER JOIN subscription_tiers t ON s.tier_id = t.id
      WHERE s.analyst_id = $1
      AND s.status = 'active'
      AND s.deleted_at IS NULL
      GROUP BY t.id, t.name, t.price
      ORDER BY revenue_inr DESC`,
      [analystId]
    );

    // Projected monthly revenue (based on active subscriptions)
    const projectionResult = await query(
      `SELECT
        ROUND(SUM(
          CASE
            WHEN billing_cycle = 'monthly' THEN final_price * 0.80
            WHEN billing_cycle = 'yearly' THEN (final_price * 0.80) / 12
          END
        )::DECIMAL / 100, 2) as projected_monthly_revenue_inr
      FROM subscriptions
      WHERE analyst_id = $1
      AND status = 'active'
      AND deleted_at IS NULL`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Revenue metrics fetched successfully',
      data: {
        mtd: mtdResult.rows[0],
        recent: {
          ...recentResult.rows[0],
          days: daysBack
        },
        allTime: allTimeResult.rows[0],
        dailyBreakdown: dailyResult.rows,
        byTier: tierResult.rows,
        projection: projectionResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get subscriber metrics
 * GET /api/analytics/subscribers
 *
 * Subscriber growth, churn, and retention metrics
 *
 * @access Private (Analyst only)
 */
const getSubscriberMetrics = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { date_range = '30' } = req.query;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    const daysBack = parseInt(date_range);

    // Overall subscriber stats
    const overallResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_subscribers,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_subscribers,
        COUNT(*) FILTER (WHERE status = 'suspended') as suspended_subscribers,
        COUNT(*) as total_subscribers
      FROM subscriptions
      WHERE analyst_id = $1
      AND deleted_at IS NULL`,
      [analystId]
    );

    // New subscribers (last 7 and 30 days)
    const newSubsResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as last_7_days,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as last_30_days,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as this_month
      FROM subscriptions
      WHERE analyst_id = $1
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Cancelled subscribers (recent)
    const cancelledResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE cancelled_at >= CURRENT_DATE - INTERVAL '7 days') as last_7_days,
        COUNT(*) FILTER (WHERE cancelled_at >= CURRENT_DATE - INTERVAL '30 days') as last_30_days
      FROM subscriptions
      WHERE analyst_id = $1
      AND cancelled_at IS NOT NULL
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Daily subscriber growth (last N days)
    const dailyGrowthResult = await query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as new_subscribers,
        SUM(COUNT(*)) OVER (ORDER BY DATE(created_at)) as cumulative_subscribers
      FROM subscriptions
      WHERE analyst_id = $1
      AND created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      AND deleted_at IS NULL
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [analystId]
    );

    // Growth rate calculation
    const growthRateResult = await query(
      `WITH current_count AS (
        SELECT COUNT(*) as count
        FROM subscriptions
        WHERE analyst_id = $1
        AND status = 'active'
        AND deleted_at IS NULL
      ),
      previous_count AS (
        SELECT COUNT(*) as count
        FROM subscriptions
        WHERE analyst_id = $1
        AND status = 'active'
        AND created_at < CURRENT_DATE - INTERVAL '30 days'
        AND deleted_at IS NULL
      )
      SELECT
        current_count.count as current,
        previous_count.count as previous,
        CASE
          WHEN previous_count.count > 0 THEN
            ROUND(((current_count.count - previous_count.count)::DECIMAL / previous_count.count * 100), 2)
          ELSE 0
        END as growth_rate_percent
      FROM current_count, previous_count`,
      [analystId]
    );

    // Churn rate (last 30 days)
    const churnResult = await query(
      `WITH start_count AS (
        SELECT COUNT(*) as count
        FROM subscriptions
        WHERE analyst_id = $1
        AND created_at < CURRENT_DATE - INTERVAL '30 days'
        AND status = 'active'
        AND deleted_at IS NULL
      ),
      churned_count AS (
        SELECT COUNT(*) as count
        FROM subscriptions
        WHERE analyst_id = $1
        AND cancelled_at >= CURRENT_DATE - INTERVAL '30 days'
        AND deleted_at IS NULL
      )
      SELECT
        start_count.count as start_subscribers,
        churned_count.count as churned_subscribers,
        CASE
          WHEN start_count.count > 0 THEN
            ROUND((churned_count.count::DECIMAL / start_count.count * 100), 2)
          ELSE 0
        END as churn_rate_percent
      FROM start_count, churned_count`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Subscriber metrics fetched successfully',
      data: {
        overall: overallResult.rows[0],
        newSubscribers: newSubsResult.rows[0],
        cancelled: cancelledResult.rows[0],
        dailyGrowth: dailyGrowthResult.rows,
        growthRate: growthRateResult.rows[0],
        churnRate: churnResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get post performance metrics
 * GET /api/analytics/posts
 *
 * Post engagement, views, bookmarks, and top performing posts
 *
 * @access Private (Analyst only)
 */
const getPostMetrics = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { date_range = '30' } = req.query;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    const daysBack = parseInt(date_range);

    // Overall post stats
    const overallResult = await query(
      `SELECT
        COUNT(*) as total_posts,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as posts_this_month,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '${daysBack} days') as posts_recent,
        COALESCE(AVG(views_count), 0) as avg_views_per_post,
        COALESCE(AVG(bookmarks_count), 0) as avg_bookmarks_per_post,
        COALESCE(SUM(views_count), 0) as total_views,
        COALESCE(SUM(bookmarks_count), 0) as total_bookmarks
      FROM posts
      WHERE analyst_id = $1
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Engagement rate calculation
    const engagementResult = await query(
      `SELECT
        COALESCE(SUM(views_count), 0) as total_views,
        COALESCE(SUM(bookmarks_count), 0) as total_bookmarks,
        CASE
          WHEN SUM(views_count) > 0 THEN
            ROUND((SUM(bookmarks_count)::DECIMAL / SUM(views_count) * 100), 2)
          ELSE 0
        END as engagement_rate_percent
      FROM posts
      WHERE analyst_id = $1
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Top 5 performing posts by engagement
    const topPostsResult = await query(
      `SELECT
        id,
        title,
        stock_symbol,
        post_type,
        strategy_type,
        views_count,
        bookmarks_count,
        comments_count,
        created_at,
        CASE
          WHEN views_count > 0 THEN ROUND((bookmarks_count::DECIMAL / views_count * 100), 2)
          ELSE 0
        END as engagement_rate
      FROM posts
      WHERE analyst_id = $1
      AND deleted_at IS NULL
      ORDER BY
        (bookmarks_count + comments_count * 2) DESC,
        views_count DESC
      LIMIT 5`,
      [analystId]
    );

    // Post performance by type
    const byTypeResult = await query(
      `SELECT
        post_type,
        COUNT(*) as post_count,
        COALESCE(AVG(views_count), 0) as avg_views,
        COALESCE(AVG(bookmarks_count), 0) as avg_bookmarks
      FROM posts
      WHERE analyst_id = $1
      AND deleted_at IS NULL
      GROUP BY post_type
      ORDER BY post_count DESC`,
      [analystId]
    );

    // Daily post activity (last N days)
    const dailyActivityResult = await query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as posts_created,
        SUM(views_count) as total_views,
        SUM(bookmarks_count) as total_bookmarks
      FROM posts
      WHERE analyst_id = $1
      AND created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      AND deleted_at IS NULL
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Post metrics fetched successfully',
      data: {
        overall: overallResult.rows[0],
        engagement: engagementResult.rows[0],
        topPosts: topPostsResult.rows,
        byType: byTypeResult.rows,
        dailyActivity: dailyActivityResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get engagement metrics
 * GET /api/analytics/engagement
 *
 * Community engagement, chat activity, and user interactions
 *
 * @access Private (Analyst only)
 */
const getEngagementMetrics = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { date_range = '30' } = req.query;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    const daysBack = parseInt(date_range);

    // Chat engagement
    const chatResult = await query(
      `SELECT
        COUNT(DISTINCT cm.id) as total_messages,
        COUNT(DISTINCT cm.id) FILTER (WHERE cm.created_at >= CURRENT_DATE - INTERVAL '7 days') as messages_last_7_days,
        COUNT(DISTINCT cm.user_id) as unique_chatters,
        COUNT(DISTINCT cm.user_id) FILTER (WHERE cm.created_at >= CURRENT_DATE - INTERVAL '7 days') as active_chatters_last_7_days
      FROM chat_channels cc
      LEFT JOIN chat_messages cm ON cc.id = cm.channel_id AND cm.deleted_at IS NULL
      WHERE cc.analyst_id = $1
      AND cc.deleted_at IS NULL`,
      [analystId]
    );

    // Most active chat channel
    const activeChannelResult = await query(
      `SELECT
        cc.id,
        cc.name,
        cc.channel_type,
        COUNT(cm.id) as message_count,
        COUNT(DISTINCT cm.user_id) as unique_users
      FROM chat_channels cc
      LEFT JOIN chat_messages cm ON cc.id = cm.channel_id AND cm.deleted_at IS NULL
      WHERE cc.analyst_id = $1
      AND cc.deleted_at IS NULL
      GROUP BY cc.id, cc.name, cc.channel_type
      ORDER BY message_count DESC
      LIMIT 1`,
      [analystId]
    );

    // Bookmark trends
    const bookmarkResult = await query(
      `SELECT
        COUNT(*) as total_bookmarks,
        COUNT(*) FILTER (WHERE b.created_at >= CURRENT_DATE - INTERVAL '7 days') as bookmarks_last_7_days,
        COUNT(*) FILTER (WHERE b.created_at >= CURRENT_DATE - INTERVAL '30 days') as bookmarks_last_30_days,
        COUNT(DISTINCT b.user_id) as unique_bookmarkers
      FROM bookmarks b
      INNER JOIN posts p ON b.post_id = p.id
      WHERE p.analyst_id = $1
      AND b.deleted_at IS NULL
      AND p.deleted_at IS NULL`,
      [analystId]
    );

    // User activity heatmap (by day of week)
    const heatmapResult = await query(
      `SELECT
        TO_CHAR(created_at, 'Day') as day_of_week,
        EXTRACT(DOW FROM created_at) as day_number,
        COUNT(*) as activity_count
      FROM (
        SELECT created_at FROM posts WHERE analyst_id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT cm.created_at FROM chat_messages cm
        INNER JOIN chat_channels cc ON cm.channel_id = cc.id
        WHERE cc.analyst_id = $1 AND cm.deleted_at IS NULL AND cc.deleted_at IS NULL
      ) activity
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      GROUP BY day_of_week, day_number
      ORDER BY day_number`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Engagement metrics fetched successfully',
      data: {
        chat: chatResult.rows[0],
        mostActiveChannel: activeChannelResult.rows[0] || null,
        bookmarks: bookmarkResult.rows[0],
        activityByDay: heatmapResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get review analytics
 * GET /api/analytics/reviews
 *
 * Review ratings, trends, and sentiment
 *
 * @access Private (Analyst only)
 */
const getReviewMetrics = async (req, res, next) => {
  try {
    const analystId = req.user.id;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    // Current average rating
    const currentRatingResult = await query(
      `SELECT
        ROUND(AVG(rating), 2) as average_rating,
        COUNT(*) as total_reviews,
        COUNT(*) FILTER (WHERE is_verified_subscriber = true) as verified_reviews
      FROM reviews
      WHERE analyst_id = $1
      AND is_approved = true
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Rating distribution (1-5 stars)
    const distributionResult = await query(
      `SELECT
        rating,
        COUNT(*) as count,
        ROUND((COUNT(*)::DECIMAL / SUM(COUNT(*)) OVER () * 100), 2) as percentage
      FROM reviews
      WHERE analyst_id = $1
      AND is_approved = true
      AND deleted_at IS NULL
      GROUP BY rating
      ORDER BY rating DESC`,
      [analystId]
    );

    // Rating trend (last 6 months)
    const trendResult = await query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        ROUND(AVG(rating), 2) as average_rating,
        COUNT(*) as review_count
      FROM reviews
      WHERE analyst_id = $1
      AND is_approved = true
      AND created_at >= CURRENT_DATE - INTERVAL '6 months'
      AND deleted_at IS NULL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC`,
      [analystId]
    );

    // Recent reviews (last 5)
    const recentReviewsResult = await query(
      `SELECT
        r.id,
        r.rating,
        r.review_title,
        r.review_text,
        r.is_verified_subscriber,
        r.created_at,
        u.full_name as user_name,
        r.analyst_response,
        r.analyst_response_at
      FROM reviews r
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.analyst_id = $1
      AND r.is_approved = true
      AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
      LIMIT 5`,
      [analystId]
    );

    // Response rate
    const responseRateResult = await query(
      `SELECT
        COUNT(*) as total_reviews,
        COUNT(*) FILTER (WHERE analyst_response IS NOT NULL) as responded_reviews,
        CASE
          WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE analyst_response IS NOT NULL)::DECIMAL / COUNT(*) * 100), 2)
          ELSE 0
        END as response_rate_percent
      FROM reviews
      WHERE analyst_id = $1
      AND is_approved = true
      AND deleted_at IS NULL`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Review metrics fetched successfully',
      data: {
        current: currentRatingResult.rows[0],
        distribution: distributionResult.rows,
        trend: trendResult.rows,
        recentReviews: recentReviewsResult.rows,
        responseRate: responseRateResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get churn analysis
 * GET /api/analytics/churn
 *
 * Churn rate, reasons, and retention insights
 *
 * @access Private (Analyst only)
 */
const getChurnAnalysis = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { date_range = '90' } = req.query;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    const daysBack = parseInt(date_range);

    // Overall churn metrics
    const overallChurnResult = await query(
      `WITH cohort AS (
        SELECT COUNT(*) as total_subscribers
        FROM subscriptions
        WHERE analyst_id = $1
        AND created_at < CURRENT_DATE - INTERVAL '${daysBack} days'
        AND deleted_at IS NULL
      ),
      churned AS (
        SELECT COUNT(*) as churned_count
        FROM subscriptions
        WHERE analyst_id = $1
        AND cancelled_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
        AND deleted_at IS NULL
      )
      SELECT
        cohort.total_subscribers,
        churned.churned_count,
        CASE
          WHEN cohort.total_subscribers > 0 THEN
            ROUND((churned.churned_count::DECIMAL / cohort.total_subscribers * 100), 2)
          ELSE 0
        END as churn_rate_percent
      FROM cohort, churned`,
      [analystId]
    );

    // Monthly churn trend
    const monthlyChurnResult = await query(
      `WITH monthly_cohorts AS (
        SELECT
          DATE_TRUNC('month', created_at) as cohort_month,
          COUNT(*) as cohort_size
        FROM subscriptions
        WHERE analyst_id = $1
        AND created_at >= CURRENT_DATE - INTERVAL '12 months'
        AND deleted_at IS NULL
        GROUP BY DATE_TRUNC('month', created_at)
      ),
      monthly_churned AS (
        SELECT
          DATE_TRUNC('month', cancelled_at) as churn_month,
          COUNT(*) as churned_count
        FROM subscriptions
        WHERE analyst_id = $1
        AND cancelled_at >= CURRENT_DATE - INTERVAL '12 months'
        AND deleted_at IS NULL
        GROUP BY DATE_TRUNC('month', cancelled_at)
      )
      SELECT
        TO_CHAR(mc.cohort_month, 'YYYY-MM') as month,
        mc.cohort_size,
        COALESCE(mch.churned_count, 0) as churned_count,
        CASE
          WHEN mc.cohort_size > 0 THEN
            ROUND((COALESCE(mch.churned_count, 0)::DECIMAL / mc.cohort_size * 100), 2)
          ELSE 0
        END as churn_rate_percent
      FROM monthly_cohorts mc
      LEFT JOIN monthly_churned mch ON mc.cohort_month = mch.churn_month
      ORDER BY month ASC`,
      [analystId]
    );

    // Subscriber lifetime analysis
    const lifetimeResult = await query(
      `SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(cancelled_at, NOW()) - start_date)) / 86400), 0) as avg_lifetime_days,
        MIN(EXTRACT(EPOCH FROM (COALESCE(cancelled_at, NOW()) - start_date)) / 86400) as min_lifetime_days,
        MAX(EXTRACT(EPOCH FROM (COALESCE(cancelled_at, NOW()) - start_date)) / 86400) as max_lifetime_days
      FROM subscriptions
      WHERE analyst_id = $1
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Retention by tier
    const retentionByTierResult = await query(
      `SELECT
        t.name as tier_name,
        COUNT(*) as total_subscribers,
        COUNT(*) FILTER (WHERE s.status = 'active') as active_subscribers,
        COUNT(*) FILTER (WHERE s.cancelled_at IS NOT NULL) as churned_subscribers,
        CASE
          WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE s.status = 'active')::DECIMAL / COUNT(*) * 100), 2)
          ELSE 0
        END as retention_rate_percent
      FROM subscriptions s
      INNER JOIN subscription_tiers t ON s.tier_id = t.id
      WHERE s.analyst_id = $1
      AND s.deleted_at IS NULL
      GROUP BY t.id, t.name
      ORDER BY retention_rate_percent DESC`,
      [analystId]
    );

    // At-risk subscribers (expiring soon, no auto-renewal)
    const atRiskResult = await query(
      `SELECT
        COUNT(*) as at_risk_count,
        ARRAY_AGG(id) FILTER (WHERE expires_at <= CURRENT_DATE + INTERVAL '7 days') as expiring_this_week
      FROM subscriptions
      WHERE analyst_id = $1
      AND status = 'active'
      AND auto_renewal = false
      AND expires_at > NOW()
      AND expires_at <= CURRENT_DATE + INTERVAL '30 days'
      AND deleted_at IS NULL`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Churn analysis fetched successfully',
      data: {
        overall: overallChurnResult.rows[0],
        monthlyTrend: monthlyChurnResult.rows,
        lifetime: lifetimeResult.rows[0],
        retentionByTier: retentionByTierResult.rows,
        atRisk: atRiskResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get call outcome analytics (win rate, performance)
 * GET /api/analytics/calls
 *
 * Trading call performance and accuracy metrics
 *
 * @access Private (Analyst only)
 */
const getCallAnalytics = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { date_range = '90' } = req.query;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    const daysBack = parseInt(date_range);

    // Overall call performance
    const overallResult = await query(
      `SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE call_status = 'target_hit') as successful_calls,
        COUNT(*) FILTER (WHERE call_status = 'stop_loss_hit') as failed_calls,
        COUNT(*) FILTER (WHERE call_status = 'open') as open_calls,
        CASE
          WHEN COUNT(*) FILTER (WHERE call_status IN ('target_hit', 'stop_loss_hit')) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE call_status = 'target_hit')::DECIMAL /
                   COUNT(*) FILTER (WHERE call_status IN ('target_hit', 'stop_loss_hit')) * 100), 2)
          ELSE 0
        END as win_rate_percent,
        ROUND(AVG(actual_profit_percent) FILTER (WHERE call_status = 'target_hit'), 2) as avg_profit_on_wins,
        ROUND(AVG(actual_profit_percent) FILTER (WHERE call_status = 'stop_loss_hit'), 2) as avg_loss_on_losses
      FROM posts
      WHERE analyst_id = $1
      AND post_type = 'call'
      AND created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Performance by strategy type
    const byStrategyResult = await query(
      `SELECT
        strategy_type,
        COUNT(*) as call_count,
        COUNT(*) FILTER (WHERE call_status = 'target_hit') as wins,
        COUNT(*) FILTER (WHERE call_status = 'stop_loss_hit') as losses,
        CASE
          WHEN COUNT(*) FILTER (WHERE call_status IN ('target_hit', 'stop_loss_hit')) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE call_status = 'target_hit')::DECIMAL /
                   COUNT(*) FILTER (WHERE call_status IN ('target_hit', 'stop_loss_hit')) * 100), 2)
          ELSE 0
        END as win_rate_percent
      FROM posts
      WHERE analyst_id = $1
      AND post_type = 'call'
      AND strategy_type IS NOT NULL
      AND created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      AND deleted_at IS NULL
      GROUP BY strategy_type
      ORDER BY win_rate_percent DESC`,
      [analystId]
    );

    // Best performing stocks/sectors
    const topStocksResult = await query(
      `SELECT
        stock_symbol,
        COUNT(*) as call_count,
        COUNT(*) FILTER (WHERE call_status = 'target_hit') as wins,
        ROUND(AVG(actual_profit_percent) FILTER (WHERE call_status = 'target_hit'), 2) as avg_profit_percent
      FROM posts
      WHERE analyst_id = $1
      AND post_type = 'call'
      AND stock_symbol IS NOT NULL
      AND call_status = 'target_hit'
      AND created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      AND deleted_at IS NULL
      GROUP BY stock_symbol
      HAVING COUNT(*) >= 2
      ORDER BY avg_profit_percent DESC
      LIMIT 10`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Call analytics fetched successfully',
      data: {
        overall: overallResult.rows[0],
        byStrategy: byStrategyResult.rows,
        topStocks: topStocksResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get dashboard overview (all metrics summary)
 * GET /api/analytics/overview
 *
 * Quick summary of all key metrics for dashboard home
 *
 * @access Private (Analyst only)
 */
const getDashboardOverview = async (req, res, next) => {
  try {
    const analystId = req.user.id;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    // Key metrics summary
    const summaryResult = await query(
      `SELECT
        -- Subscriber metrics
        (SELECT COUNT(*) FROM subscriptions WHERE analyst_id = $1 AND status = 'active' AND deleted_at IS NULL) as active_subscribers,
        (SELECT COUNT(*) FROM subscriptions WHERE analyst_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days' AND deleted_at IS NULL) as new_subscribers_30d,

        -- Revenue metrics
        (SELECT ROUND(SUM(final_price * 0.80)::DECIMAL / 100, 2) FROM subscriptions WHERE analyst_id = $1 AND created_at >= DATE_TRUNC('month', CURRENT_DATE) AND status IN ('active', 'cancelled') AND deleted_at IS NULL) as revenue_mtd,
        (SELECT ROUND(SUM(final_price * 0.80)::DECIMAL / 100, 2) FROM subscriptions WHERE analyst_id = $1 AND status = 'active' AND deleted_at IS NULL) as total_revenue,

        -- Post metrics
        (SELECT COUNT(*) FROM posts WHERE analyst_id = $1 AND deleted_at IS NULL) as total_posts,
        (SELECT COALESCE(SUM(views_count), 0) FROM posts WHERE analyst_id = $1 AND deleted_at IS NULL) as total_views,

        -- Review metrics
        (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE analyst_id = $1 AND is_approved = true AND deleted_at IS NULL) as avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE analyst_id = $1 AND is_approved = true AND deleted_at IS NULL) as total_reviews`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Dashboard overview fetched successfully',
      data: summaryResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get comprehensive dashboard analytics
 * GET /api/analytics/dashboard/:analystId
 *
 * Returns all key metrics for analyst dashboard including:
 * - Total revenue
 * - Active/paid subscribers
 * - Conversion rate
 * - Subscriber growth data
 * - Top performing calls
 * - Revenue by tier
 *
 * @access Private (Analyst only - own dashboard)
 */
const getDashboardAnalytics = async (req, res, next) => {
  try {
    const { analystId } = req.params;
    const userId = req.user.id;

    // Verify user is an analyst and accessing their own dashboard
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    if (userId !== analystId) {
      throw new AppError('You can only view your own dashboard analytics', 403);
    }

    // Total revenue (all time)
    const revenueResult = await query(
      `SELECT
        COALESCE(SUM(final_price * 0.80), 0) as total_revenue_paise,
        ROUND(COALESCE(SUM(final_price * 0.80), 0)::DECIMAL / 100, 2) as total_revenue_inr,
        COUNT(*) as total_subscriptions
      FROM subscriptions
      WHERE analyst_id = $1
      AND status IN ('active', 'cancelled')
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Subscriber counts
    const subscriberResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_subscribers,
        COUNT(*) FILTER (WHERE status = 'active' AND final_price > 0) as paid_subscribers,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_subscribers_30d,
        COUNT(*) as total_subscribers
      FROM subscriptions
      WHERE analyst_id = $1
      AND deleted_at IS NULL`,
      [analystId]
    );

    // Conversion rate (paid / total subscribers)
    const conversionRate = subscriberResult.rows[0].total_subscribers > 0
      ? ((subscriberResult.rows[0].paid_subscribers / subscriberResult.rows[0].total_subscribers) * 100).toFixed(2)
      : 0;

    // Subscriber growth (last 6 months)
    const growthResult = await query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        COUNT(*) as new_subscribers,
        SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', created_at)) as cumulative_subscribers
      FROM subscriptions
      WHERE analyst_id = $1
      AND created_at >= CURRENT_DATE - INTERVAL '6 months'
      AND deleted_at IS NULL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC`,
      [analystId]
    );

    // Top performing calls (by views and engagement)
    const topCallsResult = await query(
      `SELECT
        id,
        title,
        stock_symbol,
        action,
        entry_price,
        target_price,
        stop_loss,
        views_count,
        bookmarks_count,
        call_status,
        created_at
      FROM posts
      WHERE analyst_id = $1
      AND post_type = 'call'
      AND deleted_at IS NULL
      ORDER BY (views_count + bookmarks_count * 3) DESC
      LIMIT 5`,
      [analystId]
    );

    // Revenue by tier
    const tierRevenueResult = await query(
      `SELECT
        t.tier_name,
        t.price_monthly,
        COUNT(s.id) as subscriber_count,
        ROUND(SUM(s.final_price * 0.80)::DECIMAL / 100, 2) as revenue_inr,
        ROUND((COUNT(s.id)::DECIMAL / NULLIF((SELECT COUNT(*) FROM subscriptions WHERE analyst_id = $1 AND deleted_at IS NULL), 0) * 100), 2) as percentage
      FROM subscriptions s
      INNER JOIN subscription_tiers t ON s.tier_id = t.id
      WHERE s.analyst_id = $1
      AND s.status = 'active'
      AND s.deleted_at IS NULL
      GROUP BY t.id, t.tier_name, t.price_monthly
      ORDER BY revenue_inr DESC`,
      [analystId]
    );

    // Monthly revenue trend (last 6 months)
    const monthlyRevenueResult = await query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        ROUND(SUM(final_price * 0.80)::DECIMAL / 100, 2) as revenue_inr,
        COUNT(*) as subscription_count
      FROM subscriptions
      WHERE analyst_id = $1
      AND created_at >= CURRENT_DATE - INTERVAL '6 months'
      AND status IN ('active', 'cancelled')
      AND deleted_at IS NULL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Dashboard analytics fetched successfully',
      data: {
        revenue: {
          total: revenueResult.rows[0].total_revenue_inr,
          totalSubscriptions: parseInt(revenueResult.rows[0].total_subscriptions),
          monthlyTrend: monthlyRevenueResult.rows
        },
        subscribers: {
          active: parseInt(subscriberResult.rows[0].active_subscribers),
          paid: parseInt(subscriberResult.rows[0].paid_subscribers),
          new30Days: parseInt(subscriberResult.rows[0].new_subscribers_30d),
          total: parseInt(subscriberResult.rows[0].total_subscribers),
          conversionRate: parseFloat(conversionRate),
          growthData: growthResult.rows
        },
        topPerformingCalls: topCallsResult.rows,
        revenueByTier: tierRevenueResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get revenue analytics (specific for revenue tab)
 * GET /api/analytics/revenue/:analystId
 *
 * Returns detailed revenue breakdown:
 * - Monthly revenue (last 6 months)
 * - Revenue by tier
 * - Payment methods breakdown
 * - Total earnings
 *
 * @access Private (Analyst only - own data)
 */
const getRevenueAnalytics = async (req, res, next) => {
  try {
    const { analystId } = req.params;
    const userId = req.user.id;

    // Verify user is an analyst and accessing their own data
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view analytics', 403);
    }

    if (userId !== analystId) {
      throw new AppError('You can only view your own revenue analytics', 403);
    }

    // Monthly revenue breakdown (last 6 months)
    const monthlyBreakdown = await query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month_label,
        ROUND(SUM(final_price * 0.80)::DECIMAL / 100, 2) as revenue_inr,
        COUNT(*) as subscription_count,
        COUNT(DISTINCT user_id) as unique_subscribers
      FROM subscriptions
      WHERE analyst_id = $1
      AND created_at >= CURRENT_DATE - INTERVAL '6 months'
      AND status IN ('active', 'cancelled')
      AND deleted_at IS NULL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC`,
      [analystId]
    );

    // Revenue by tier (all time)
    const revenueByTier = await query(
      `SELECT
        t.tier_name,
        t.price_monthly,
        COUNT(s.id) as total_subscriptions,
        COUNT(s.id) FILTER (WHERE s.status = 'active') as active_subscriptions,
        ROUND(SUM(s.final_price * 0.80)::DECIMAL / 100, 2) as total_revenue_inr,
        ROUND(AVG(s.final_price * 0.80)::DECIMAL / 100, 2) as avg_revenue_per_sub
      FROM subscriptions s
      INNER JOIN subscription_tiers t ON s.tier_id = t.id
      WHERE s.analyst_id = $1
      AND s.deleted_at IS NULL
      GROUP BY t.id, t.tier_name, t.price_monthly
      ORDER BY total_revenue_inr DESC`,
      [analystId]
    );

    // Payment methods breakdown
    const paymentMethods = await query(
      `SELECT
        pt.payment_method,
        COUNT(*) as transaction_count,
        ROUND(SUM(pt.amount)::DECIMAL / 100, 2) as total_amount_inr
      FROM payment_transactions pt
      WHERE pt.analyst_id = $1
      AND pt.status = 'captured'
      AND pt.deleted_at IS NULL
      GROUP BY pt.payment_method
      ORDER BY total_amount_inr DESC`,
      [analystId]
    );

    // Total earnings summary
    const totalEarnings = await query(
      `SELECT
        ROUND(COALESCE(SUM(final_price * 0.80), 0)::DECIMAL / 100, 2) as total_earnings_inr,
        COUNT(*) as total_subscriptions,
        COUNT(DISTINCT user_id) as unique_customers,
        ROUND(AVG(final_price * 0.80)::DECIMAL / 100, 2) as avg_revenue_per_subscription
      FROM subscriptions
      WHERE analyst_id = $1
      AND status IN ('active', 'cancelled')
      AND deleted_at IS NULL`,
      [analystId]
    );

    // This month's revenue
    const currentMonthRevenue = await query(
      `SELECT
        ROUND(SUM(final_price * 0.80)::DECIMAL / 100, 2) as revenue_inr,
        COUNT(*) as subscription_count
      FROM subscriptions
      WHERE analyst_id = $1
      AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      AND status IN ('active', 'cancelled')
      AND deleted_at IS NULL`,
      [analystId]
    );

    res.status(200).json({
      success: true,
      message: 'Revenue analytics fetched successfully',
      data: {
        monthlyBreakdown: monthlyBreakdown.rows,
        revenueByTier: revenueByTier.rows,
        paymentMethodsBreakdown: paymentMethods.rows,
        totalEarnings: totalEarnings.rows[0],
        currentMonth: currentMonthRevenue.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRevenueMetrics,
  getSubscriberMetrics,
  getPostMetrics,
  getEngagementMetrics,
  getReviewMetrics,
  getChurnAnalysis,
  getCallAnalytics,
  getDashboardOverview,
  getDashboardAnalytics,
  getRevenueAnalytics
};
