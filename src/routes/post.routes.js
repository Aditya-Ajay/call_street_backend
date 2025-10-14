/**
 * Post Routes
 *
 * Handles analyst posts (market analysis, trade ideas, educational content)
 * Complete content creation and feed system with AI formatting
 *
 * ROUTES:
 * - POST   /api/posts/create - Create post with AI formatting
 * - POST   /api/posts/:id/format-ai - Re-format with AI
 * - GET    /api/posts/feed - User's personalized feed
 * - GET    /api/posts/:id - Get single post
 * - PUT    /api/posts/:id - Update post
 * - DELETE /api/posts/:id - Delete post (soft delete)
 * - POST   /api/posts/:id/bookmark - Bookmark post
 * - DELETE /api/posts/:id/bookmark - Remove bookmark
 * - GET    /api/posts/bookmarks - User's bookmarks
 * - POST   /api/posts/:id/mark-outcome - Mark call outcome (analyst only)
 * - GET    /api/posts/analytics/:id - Post analytics (analyst only)
 * - GET    /api/posts/analyst/:analystId - Analyst's posts (public sample)
 * - GET    /api/posts/stock/:symbol - Posts by stock symbol
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, requireAnalyst, optionalAuth } = require('../middleware/auth');
const { standardLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { validateId, validatePagination } = require('../middleware/validation');

// Import controllers
const postController = require('../controllers/postController');

// ============================================
// POST CREATION & MANAGEMENT
// ============================================

/**
 * @route   POST /api/posts/create
 * @desc    Create new post with AI formatting
 * @access  Private (Analyst only)
 *
 * Body:
 * - raw_content: string (required)
 * - language: string (optional) - 'en', 'hi', 'hinglish'
 * - post_type: string (optional) - 'call', 'update', 'commentary'
 * - audience: string (required) - 'free', 'paid', 'both'
 * - is_urgent: boolean (optional)
 * - use_ai: boolean (optional, default: true)
 */
router.post(
  '/create',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  postController.createPost
);

/**
 * @route   POST /api/posts
 * @desc    Create new post (alias for /create for compatibility)
 * @access  Private (Analyst only)
 */
router.post(
  '/',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  postController.createPost
);

/**
 * @route   POST /api/posts/:id/format-ai
 * @desc    Re-format existing post with AI
 * @access  Private (Analyst only - own posts)
 *
 * Body:
 * - language: string (optional) - 'en', 'hi', 'hinglish'
 */
router.post(
  '/:id/format-ai',
  verifyToken,
  requireAnalyst,
  validateId('id'),
  standardLimiter,
  postController.reformatWithAI
);

/**
 * @route   POST /api/posts/format-call
 * @desc    Format trading call with AI (enhanced with call type categorization)
 * @access  Private (Analyst only)
 *
 * Body:
 * - raw_input: string (required) - Raw text/voice input
 * - call_type: string (optional) - Suggested call type (longterm, positional, swing, intraday, overnight, quant)
 * - stock_symbol: string (optional) - Stock symbol hint
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Trading call formatted successfully",
 *   "data": {
 *     "call_type": "intraday",
 *     "call_type_description": "Intraday trading (same day)",
 *     "stock_symbol": "NIFTY",
 *     "action": "BUY",
 *     "entry_price": 19500,
 *     "target_price": 19600,
 *     "stop_loss": 19450,
 *     "quantity_suggestion": null,
 *     "strategy": "Intraday momentum trade",
 *     "risk_reward_ratio": "1:2.0",
 *     "time_frame": "Intraday",
 *     "reasoning": null,
 *     "formatted_text": "...",
 *     "db_strategy_type": "intraday",
 *     "metadata": { ... }
 *   }
 * }
 */
router.post(
  '/format-call',
  verifyToken,
  requireAnalyst,
  standardLimiter,
  postController.formatCallWithAI
);

/**
 * @route   PUT /api/posts/:id
 * @desc    Update post
 * @access  Private (Analyst only - own posts)
 *
 * Body:
 * - title: string (optional)
 * - content: string (optional)
 * - strategy_type: string (optional)
 * - audience: string (optional)
 * - is_urgent: boolean (optional)
 * - is_pinned: boolean (optional)
 */
router.put(
  '/:id',
  verifyToken,
  requireAnalyst,
  validateId('id'),
  standardLimiter,
  postController.updatePost
);

/**
 * @route   DELETE /api/posts/:id
 * @desc    Soft delete post
 * @access  Private (Analyst only - own posts)
 */
router.delete(
  '/:id',
  verifyToken,
  requireAnalyst,
  validateId('id'),
  standardLimiter,
  postController.deletePost
);

// ============================================
// FEED & DISCOVERY
// NOTE: Specific routes MUST come before parameterized routes
// ============================================

/**
 * @route   GET /api/posts/feed
 * @desc    Get user's personalized feed with filters
 * @access  Private
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - date_filter: string (all, today, this_week, this_month)
 * - urgency_filter: string (all, urgent_only)
 * - strategy_filter: string (all, intraday, swing, positional, long_term, options)
 * - analyst_id: UUID (optional)
 */
router.get(
  '/feed',
  verifyToken,
  validatePagination(),
  standardLimiter,
  postController.getUserFeed
);

/**
 * @route   GET /api/posts/bookmarks
 * @desc    Get user's bookmarked posts
 * @access  Private
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 */
router.get(
  '/bookmarks',
  verifyToken,
  validatePagination(),
  standardLimiter,
  postController.getUserBookmarks
);

/**
 * @route   GET /api/posts/analyst/:analystId
 * @desc    Get analyst's posts (public sample or full for subscribers)
 * @access  Public (with optional auth for personalization)
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - sample_only: boolean (default: false) - Get only 3 most recent posts
 */
router.get(
  '/analyst/:analystId',
  optionalAuth,
  validateId('analystId'),
  validatePagination(),
  standardLimiter,
  postController.getAnalystPosts
);

/**
 * @route   GET /api/posts/stock/:symbol
 * @desc    Get posts by stock symbol
 * @access  Public (with optional auth)
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 */
router.get(
  '/stock/:symbol',
  optionalAuth,
  validatePagination(),
  standardLimiter,
  postController.getPostsByStock
);

/**
 * @route   GET /api/posts
 * @desc    Get all posts with filters (public discovery)
 * @access  Public (with optional auth)
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - analyst_id: UUID (optional) - Filter by analyst
 * - strategy_type: string (optional) - intraday, swing, options, etc.
 * - stock_symbol: string (optional) - Filter by stock
 * - audience: string (optional) - free, paid
 * - sort: string (default: 'recent') - recent, popular, trending
 */
router.get(
  '/',
  optionalAuth,
  validatePagination(),
  standardLimiter,
  postController.getAllPosts
);

/**
 * @route   GET /api/posts/:id
 * @desc    Get single post by ID (with access control)
 * @access  Public (with optional auth for access check)
 */
router.get(
  '/:id',
  optionalAuth,
  validateId('id'),
  standardLimiter,
  postController.getPostById
);

// ============================================
// BOOKMARKS
// ============================================

/**
 * @route   POST /api/posts/:id/bookmark
 * @desc    Bookmark a post
 * @access  Private
 *
 * Body:
 * - notes: string (optional)
 */
router.post(
  '/:id/bookmark',
  verifyToken,
  validateId('id'),
  standardLimiter,
  postController.bookmarkPost
);

/**
 * @route   DELETE /api/posts/:id/bookmark
 * @desc    Remove bookmark
 * @access  Private
 */
router.delete(
  '/:id/bookmark',
  verifyToken,
  validateId('id'),
  standardLimiter,
  postController.removeBookmark
);

// ============================================
// ANALYTICS & OUTCOMES (ANALYST ONLY)
// ============================================

/**
 * @route   POST /api/posts/:id/mark-outcome
 * @desc    Mark call outcome (analyst only)
 * @access  Private (Analyst only - own posts)
 *
 * Body:
 * - call_status: string (required) - 'target_hit', 'stop_loss_hit', 'closed', 'expired'
 * - actual_exit_price: number (optional)
 * - actual_profit_percent: number (optional)
 */
router.post(
  '/:id/mark-outcome',
  verifyToken,
  requireAnalyst,
  validateId('id'),
  standardLimiter,
  postController.markCallOutcome
);

/**
 * @route   GET /api/posts/analytics/:id
 * @desc    Get post analytics (analyst only)
 * @access  Private (Analyst only - own posts)
 */
router.get(
  '/analytics/:id',
  verifyToken,
  requireAnalyst,
  validateId('id'),
  standardLimiter,
  postController.getPostAnalytics
);

module.exports = router;
