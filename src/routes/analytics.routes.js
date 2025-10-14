/**
 * Analytics Routes
 *
 * Comprehensive analytics dashboard for analysts
 * Provides insights on revenue, subscribers, posts, engagement, reviews, and churn
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireAnalyst } = require('../middleware/auth');
const { standardLimiter } = require('../middleware/rateLimiter');

// Import controllers
const analyticsController = require('../controllers/analyticsController');

// ============================================
// ANALYTICS ROUTES (All require analyst authentication)
// ============================================

/**
 * @route   GET /api/analytics/overview
 * @desc    Get dashboard overview with key metrics summary
 * @access  Private (Analyst only)
 */
router.get('/overview', verifyToken, requireAnalyst, standardLimiter, analyticsController.getDashboardOverview);

/**
 * @route   GET /api/analytics/dashboard/:analystId
 * @desc    Get comprehensive dashboard analytics for specific analyst
 * @access  Private (Analyst only - own dashboard)
 *
 * Returns:
 * - Total revenue
 * - Active/paid subscribers count
 * - Conversion rate
 * - Subscriber growth data (6 months)
 * - Top performing calls
 * - Revenue by tier
 */
router.get('/dashboard/:analystId', verifyToken, requireAnalyst, standardLimiter, analyticsController.getDashboardAnalytics);

/**
 * @route   GET /api/analytics/revenue/:analystId
 * @desc    Get detailed revenue analytics for specific analyst
 * @access  Private (Analyst only - own data)
 *
 * Returns:
 * - Monthly revenue breakdown (last 6 months)
 * - Revenue by tier
 * - Payment methods breakdown
 * - Total earnings
 */
router.get('/revenue/:analystId', verifyToken, requireAnalyst, standardLimiter, analyticsController.getRevenueAnalytics);

/**
 * @route   GET /api/analytics/revenue
 * @desc    Get revenue metrics and trends
 * @access  Private (Analyst only)
 *
 * Query params:
 * - date_range: Number of days to look back (default: 30)
 *
 * Returns:
 * - MTD revenue
 * - Last N days revenue
 * - All-time revenue
 * - Daily breakdown
 * - Revenue by tier
 * - Projected monthly revenue
 */
router.get('/revenue', verifyToken, requireAnalyst, standardLimiter, analyticsController.getRevenueMetrics);

/**
 * @route   GET /api/analytics/subscribers
 * @desc    Get subscriber growth and churn metrics
 * @access  Private (Analyst only)
 *
 * Query params:
 * - date_range: Number of days to look back (default: 30)
 *
 * Returns:
 * - Total subscribers (active, cancelled, suspended)
 * - New subscribers (last 7, 30 days)
 * - Cancelled subscribers
 * - Daily growth chart
 * - Growth rate percentage
 * - Churn rate
 */
router.get('/subscribers', verifyToken, requireAnalyst, standardLimiter, analyticsController.getSubscriberMetrics);

/**
 * @route   GET /api/analytics/posts
 * @desc    Get post performance metrics
 * @access  Private (Analyst only)
 *
 * Query params:
 * - date_range: Number of days to look back (default: 30)
 *
 * Returns:
 * - Total posts
 * - Average views and bookmarks per post
 * - Engagement rate
 * - Top 5 performing posts
 * - Performance by post type
 * - Daily post activity
 */
router.get('/posts', verifyToken, requireAnalyst, standardLimiter, analyticsController.getPostMetrics);

/**
 * @route   GET /api/analytics/engagement
 * @desc    Get community engagement metrics
 * @access  Private (Analyst only)
 *
 * Query params:
 * - date_range: Number of days to look back (default: 30)
 *
 * Returns:
 * - Chat message count
 * - Active chat users
 * - Most active channel
 * - Bookmark trends
 * - User activity heatmap (by day of week)
 */
router.get('/engagement', verifyToken, requireAnalyst, standardLimiter, analyticsController.getEngagementMetrics);

/**
 * @route   GET /api/analytics/reviews
 * @desc    Get review analytics and ratings
 * @access  Private (Analyst only)
 *
 * Returns:
 * - Current average rating
 * - Total reviews count
 * - Rating distribution (1-5 stars)
 * - Rating trend (last 6 months)
 * - Recent reviews (last 5)
 * - Response rate
 */
router.get('/reviews', verifyToken, requireAnalyst, standardLimiter, analyticsController.getReviewMetrics);

/**
 * @route   GET /api/analytics/churn
 * @desc    Get churn analysis and retention insights
 * @access  Private (Analyst only)
 *
 * Query params:
 * - date_range: Number of days to look back (default: 90)
 *
 * Returns:
 * - Overall churn rate
 * - Monthly churn trend
 * - Average subscriber lifetime
 * - Retention by tier
 * - At-risk subscribers (expiring soon without auto-renewal)
 */
router.get('/churn', verifyToken, requireAnalyst, standardLimiter, analyticsController.getChurnAnalysis);

/**
 * @route   GET /api/analytics/calls
 * @desc    Get trading call performance analytics
 * @access  Private (Analyst only)
 *
 * Query params:
 * - date_range: Number of days to look back (default: 90)
 *
 * Returns:
 * - Total calls
 * - Win rate percentage
 * - Average profit on wins
 * - Average loss on losses
 * - Performance by strategy type
 * - Best performing stocks
 */
router.get('/calls', verifyToken, requireAnalyst, standardLimiter, analyticsController.getCallAnalytics);

module.exports = router;
