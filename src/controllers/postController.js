/**
 * Post Controller
 *
 * Handles all post-related HTTP requests
 * Implements complete content creation and feed system with AI formatting
 *
 * ENDPOINTS:
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

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const PostModel = require('../models/Post');
const BookmarkModel = require('../models/Bookmark');
const SubscriptionModel = require('../models/Subscription');
const { formatAnalystCall, formatTradingCall, getFallbackFormat, CALL_TYPES } = require('../services/aiService');
const { sendUrgentCallNotification } = require('../services/emailService');
const { query } = require('../config/database');
const { normalizeStockSymbol, isValidSymbol } = require('../utils/stockSymbolMapper');

/**
 * POST /api/posts/create
 * Create new post with AI formatting
 *
 * Request body:
 * - raw_content: string (required) - Raw text/voice transcription
 * - language: string (optional) - 'en', 'hi', 'hinglish'
 * - post_type: string (optional) - 'call', 'update', 'commentary'
 * - audience: string (required) - 'free', 'paid', 'both'
 * - is_urgent: boolean (optional)
 * - use_ai: boolean (optional, default: true) - Whether to use AI formatting
 *
 * Response:
 * - 201: Post created successfully
 * - 400: Validation error
 * - 401: Unauthorized
 * - 500: Server error
 */
const createPost = asyncHandler(async (req, res) => {
  const {
    raw_content,
    language = 'en',
    post_type = 'call',
    audience,
    is_urgent = false,
    is_pinned = false,
    use_ai = true
  } = req.body;

  // Validation
  if (!raw_content || !raw_content.trim()) {
    throw new AppError('Content is required', 400);
  }

  if (!audience || !['free', 'paid', 'both'].includes(audience)) {
    throw new AppError('Valid audience is required (free, paid, or both)', 400);
  }

  const analystId = req.user.id;

  // Check if user is an analyst
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can create posts', 403);
  }

  // Rate limiting: Check if analyst has exceeded daily post limit (20 posts per day)
  const todayPostCount = await query(
    `SELECT COUNT(*) as count
     FROM posts
     WHERE analyst_id = $1
     AND created_at >= CURRENT_DATE
     AND deleted_at IS NULL`,
    [analystId]
  );

  if (parseInt(todayPostCount.rows[0].count) >= 20) {
    throw new AppError('Daily post limit reached (20 posts per day)', 429);
  }

  let formattedData = null;
  let aiFormatSuccess = false;

  // Use AI formatting if requested and content type is 'call'
  if (use_ai && post_type === 'call') {
    try {
      const aiResult = await formatAnalystCall(raw_content, language);

      if (aiResult.success && aiResult.data) {
        formattedData = aiResult.data;
        aiFormatSuccess = true;
      } else {
        console.warn('AI formatting failed, using fallback:', aiResult.error);
        formattedData = getFallbackFormat(raw_content);
      }
    } catch (error) {
      console.error('AI formatting error:', error);
      formattedData = getFallbackFormat(raw_content);
    }
  }

  // Generate auto title for calls
  let title = null;
  if (post_type === 'call' && formattedData && formattedData.stock && formattedData.action) {
    title = `${formattedData.stock} ${formattedData.action} Call`;
  }

  // Prepare post data
  const postData = {
    analyst_id: analystId,
    title: title,
    content: raw_content,
    content_formatted: formattedData,
    post_type: post_type,
    strategy_type: formattedData?.strategy_type?.toLowerCase() || null,
    audience: audience,
    stock_symbol: formattedData?.stock || null,
    action: formattedData?.action || null,
    entry_price: formattedData?.entry_price || null,
    target_price: formattedData?.target_price || null,
    stop_loss: formattedData?.stop_loss || null,
    risk_reward_ratio: formattedData?.risk_reward_ratio || null,
    confidence_level: formattedData?.confidence || null,
    is_urgent: is_urgent,
    is_pinned: is_pinned
  };

  // Create post
  const post = await PostModel.createPost(postData);

  // Send email notifications to subscribers if urgent
  if (is_urgent && (audience === 'paid' || audience === 'both')) {
    try {
      // Get all active paid subscribers
      const subscribers = await query(
        `SELECT
          u.id,
          u.email,
          u.full_name as name
         FROM subscriptions s
         INNER JOIN users u ON s.user_id = u.id
         WHERE s.analyst_id = $1
         AND s.status = 'active'
         AND s.expires_at > NOW()
         AND s.deleted_at IS NULL`,
        [analystId]
      );

      // Get analyst info
      const analystInfo = await query(
        `SELECT full_name as name, email
         FROM users
         WHERE id = $1`,
        [analystId]
      );

      const analyst = analystInfo.rows[0];

      // Send email to each subscriber (non-blocking)
      subscribers.rows.forEach(subscriber => {
        sendUrgentCallNotification(subscriber, analyst, {
          id: post.id,
          stock: post.stock_symbol,
          action: post.action,
          strategy_type: post.strategy_type,
          entry_price: post.entry_price,
          target_price: post.target_price,
          stop_loss: post.stop_loss,
          risk_reward_ratio: post.risk_reward_ratio,
          reasoning: formattedData?.reasoning || raw_content.substring(0, 200)
        }).catch(error => {
          console.error(`Failed to send urgent notification to ${subscriber.email}:`, error);
        });
      });

      console.log(`Urgent post notifications sent to ${subscribers.rows.length} subscribers`);
    } catch (error) {
      console.error('Error sending urgent notifications:', error);
      // Don't throw error, post creation succeeded
    }
  }

  res.status(201).json({
    success: true,
    message: 'Post created successfully',
    data: {
      post,
      ai_formatted: aiFormatSuccess
    }
  });
});

/**
 * POST /api/posts/:id/format-ai
 * Re-format existing post with AI
 *
 * Request params:
 * - id: Post UUID
 *
 * Request body:
 * - language: string (optional) - 'en', 'hi', 'hinglish'
 *
 * Response:
 * - 200: Formatted successfully
 * - 404: Post not found
 * - 403: Not authorized
 */
const reformatWithAI = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { language = 'en' } = req.body;
  const analystId = req.user.id;

  // Get post
  const post = await PostModel.findPostById(id);

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  // Check ownership
  if (post.analyst_id !== analystId) {
    throw new AppError('You do not have permission to edit this post', 403);
  }

  // Format with AI
  const aiResult = await formatAnalystCall(post.content, language);

  if (!aiResult.success) {
    throw new AppError(`AI formatting failed: ${aiResult.error}`, 500);
  }

  // Update post with formatted data
  const updatedPost = await PostModel.updatePost(id, analystId, {
    content_formatted: aiResult.data,
    stock_symbol: aiResult.data.stock || post.stock_symbol,
    action: aiResult.data.action || post.action,
    entry_price: aiResult.data.entry_price || post.entry_price,
    target_price: aiResult.data.target_price || post.target_price,
    stop_loss: aiResult.data.stop_loss || post.stop_loss,
    risk_reward_ratio: aiResult.data.risk_reward_ratio || post.risk_reward_ratio,
    confidence_level: aiResult.data.confidence || post.confidence_level,
    strategy_type: aiResult.data.strategy_type?.toLowerCase() || post.strategy_type
  });

  res.json({
    success: true,
    message: 'Post formatted successfully',
    data: {
      post: updatedPost,
      metadata: aiResult.metadata
    }
  });
});

/**
 * POST /api/posts/format-call
 * Format trading call with AI (enhanced version with call type categorization)
 *
 * Request body:
 * - raw_input: string (required) - Raw text/voice input
 * - call_type: string (optional) - Suggested call type (longterm, positional, swing, intraday, overnight, quant)
 * - stock_symbol: string (optional) - Stock symbol hint (will be validated and normalized)
 *
 * Response:
 * - 200: Call formatted successfully
 * - 400: Validation error
 * - 401: Unauthorized
 * - 500: AI formatting failed
 *
 * Example usage:
 * POST /api/posts/format-call
 * {
 *   "raw_input": "NIFTY buy at 19500 target 19600 stop loss 19450 intraday",
 *   "call_type": "intraday",
 *   "stock_symbol": "NIFTY"
 * }
 */
const formatCallWithAI = asyncHandler(async (req, res) => {
  const { raw_input, call_type, stock_symbol } = req.body;

  // Validation
  if (!raw_input || typeof raw_input !== 'string' || !raw_input.trim()) {
    throw new AppError('raw_input is required and must be a non-empty string', 400);
  }

  // Validate call type if provided
  if (call_type && !Object.keys(CALL_TYPES).includes(call_type)) {
    throw new AppError(
      `Invalid call_type. Must be one of: ${Object.keys(CALL_TYPES).join(', ')}`,
      400
    );
  }

  // Normalize and validate stock symbol if provided
  let normalizedSymbol = null;
  if (stock_symbol) {
    normalizedSymbol = normalizeStockSymbol(stock_symbol);
    if (!normalizedSymbol) {
      // Stock symbol hint provided but not recognized - proceed anyway (AI will try to extract)
      console.warn(`Stock symbol hint "${stock_symbol}" not recognized, AI will extract from text`);
    }
  }

  // Format with AI
  const aiResult = await formatTradingCall(raw_input, call_type, normalizedSymbol);

  if (!aiResult.success) {
    // If AI formatting failed, return error with fallback flag
    return res.status(500).json({
      success: false,
      message: 'AI formatting failed',
      error: aiResult.error,
      fallback: aiResult.fallback || false,
      shouldRetry: aiResult.shouldRetry || false
    });
  }

  const formattedCall = aiResult.data;

  // Validate and normalize the stock symbol in AI response
  if (formattedCall.stock_symbol) {
    const validatedSymbol = normalizeStockSymbol(formattedCall.stock_symbol);
    if (validatedSymbol) {
      formattedCall.stock_symbol = validatedSymbol;
    } else {
      console.warn(`AI returned unrecognized stock symbol: ${formattedCall.stock_symbol}`);
    }
  }

  // Additional validation for price logic
  const priceValidation = validatePriceLogic(formattedCall);
  if (!priceValidation.valid) {
    console.warn('Price validation warnings:', priceValidation.warnings);
  }

  // Map call_type to database strategy_type field
  // Database uses: intraday, swing, positional, long_term, options
  // Our CALL_TYPES: longterm, positional, swing, intraday, overnight, quant
  const strategyTypeMapping = {
    longterm: 'long_term',
    positional: 'positional',
    swing: 'swing',
    intraday: 'intraday',
    overnight: 'swing', // Map overnight to swing (closest match)
    quant: 'options' // Map quant to options (algorithmic trading category)
  };

  const dbStrategyType = strategyTypeMapping[formattedCall.call_type] || formattedCall.call_type;

  res.json({
    success: true,
    message: 'Trading call formatted successfully',
    data: {
      call_type: formattedCall.call_type,
      call_type_description: CALL_TYPES[formattedCall.call_type],
      stock_symbol: formattedCall.stock_symbol,
      action: formattedCall.action,
      entry_price: formattedCall.entry_price,
      target_price: formattedCall.target_price,
      stop_loss: formattedCall.stop_loss,
      quantity_suggestion: formattedCall.quantity_suggestion,
      strategy: formattedCall.strategy,
      risk_reward_ratio: formattedCall.risk_reward_ratio,
      time_frame: formattedCall.time_frame,
      reasoning: formattedCall.reasoning,
      formatted_text: formattedCall.formatted_text,
      // Database-compatible fields
      db_strategy_type: dbStrategyType,
      // Metadata
      metadata: {
        ...aiResult.metadata,
        price_validation: priceValidation,
        stock_symbol_validated: formattedCall.stock_symbol ? isValidSymbol(formattedCall.stock_symbol) : false
      }
    }
  });
});

/**
 * Validate price logic for trading calls
 *
 * @param {Object} call - Formatted call data
 * @returns {Object} - { valid: boolean, warnings: Array<string> }
 */
const validatePriceLogic = (call) => {
  const warnings = [];

  if (!call.entry_price || !call.target_price || !call.stop_loss) {
    return { valid: true, warnings: [] }; // Skip validation if prices not provided
  }

  if (call.action === 'BUY') {
    if (call.target_price <= call.entry_price) {
      warnings.push('BUY call: target price should be greater than entry price');
    }
    if (call.stop_loss >= call.entry_price) {
      warnings.push('BUY call: stop loss should be less than entry price');
    }
  } else if (call.action === 'SELL') {
    if (call.target_price >= call.entry_price) {
      warnings.push('SELL call: target price should be less than entry price');
    }
    if (call.stop_loss <= call.entry_price) {
      warnings.push('SELL call: stop loss should be greater than entry price');
    }
  }

  return {
    valid: warnings.length === 0,
    warnings: warnings
  };
};

/**
 * GET /api/posts/feed
 * Get user's personalized feed with filters
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - date_filter: string (all, today, this_week, this_month)
 * - urgency_filter: string (all, urgent_only)
 * - strategy_filter: string (all, intraday, swing, positional, long_term, options)
 * - analyst_id: UUID (optional, filter by specific analyst)
 *
 * Response:
 * - 200: Feed data
 */
const getUserFeed = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const filters = {
    page: parseInt(req.query.page) || 1,
    limit: Math.min(parseInt(req.query.limit) || 20, 100),
    date_filter: req.query.date_filter || 'all',
    urgency_filter: req.query.urgency_filter || 'all',
    strategy_filter: req.query.strategy_filter || 'all',
    analyst_id: req.query.analyst_id || null
  };

  const feed = await PostModel.getFeedForUser(userId, filters);

  res.json({
    success: true,
    message: 'Feed fetched successfully',
    data: feed
  });
});

/**
 * GET /api/posts/:id
 * Get single post by ID
 *
 * Request params:
 * - id: Post UUID
 *
 * Response:
 * - 200: Post data
 * - 404: Post not found
 * - 403: Access denied (subscription required)
 */
const getPostById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Check post access
  const accessCheck = await PostModel.checkPostAccess(id, userId);

  if (!accessCheck.hasAccess) {
    throw new AppError(accessCheck.reason, 404);
  }

  // If user doesn't have full access, inform them
  if (!accessCheck.showFullContent) {
    return res.json({
      success: true,
      message: 'Post preview available',
      data: {
        post: accessCheck.post,
        requiresSubscription: true,
        fullAccessAvailable: false
      }
    });
  }

  // Increment view count (non-blocking)
  if (userId) {
    PostModel.incrementViews(id).catch(err => {
      console.error('Failed to increment views:', err);
    });
  }

  res.json({
    success: true,
    message: 'Post fetched successfully',
    data: {
      post: accessCheck.post,
      fullAccessAvailable: true
    }
  });
});

/**
 * PUT /api/posts/:id
 * Update post
 *
 * Request params:
 * - id: Post UUID
 *
 * Request body:
 * - title: string (optional)
 * - content: string (optional)
 * - strategy_type: string (optional)
 * - audience: string (optional)
 * - is_urgent: boolean (optional)
 * - is_pinned: boolean (optional)
 * - ... other post fields
 *
 * Response:
 * - 200: Post updated
 * - 404: Post not found
 * - 403: Not authorized
 */
const updatePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const analystId = req.user.id;

  // Extract allowed update fields
  const updates = {};
  const allowedFields = [
    'title',
    'content',
    'strategy_type',
    'audience',
    'stock_symbol',
    'action',
    'entry_price',
    'target_price',
    'stop_loss',
    'risk_reward_ratio',
    'confidence_level',
    'is_urgent',
    'is_pinned'
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  const updatedPost = await PostModel.updatePost(id, analystId, updates);

  res.json({
    success: true,
    message: 'Post updated successfully',
    data: { post: updatedPost }
  });
});

/**
 * DELETE /api/posts/:id
 * Soft delete post
 *
 * Request params:
 * - id: Post UUID
 *
 * Response:
 * - 200: Post deleted
 * - 404: Post not found
 * - 403: Not authorized
 */
const deletePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const analystId = req.user.id;

  await PostModel.deletePost(id, analystId);

  res.json({
    success: true,
    message: 'Post deleted successfully'
  });
});

/**
 * POST /api/posts/:id/bookmark
 * Bookmark a post
 *
 * Request params:
 * - id: Post UUID
 *
 * Request body:
 * - notes: string (optional) - User notes
 *
 * Response:
 * - 201: Bookmarked successfully
 * - 409: Already bookmarked
 * - 404: Post not found
 */
const bookmarkPost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes = null } = req.body;
  const userId = req.user.id;

  const bookmark = await BookmarkModel.createBookmark(userId, id, notes);

  res.status(201).json({
    success: true,
    message: 'Post bookmarked successfully',
    data: { bookmark }
  });
});

/**
 * DELETE /api/posts/:id/bookmark
 * Remove bookmark
 *
 * Request params:
 * - id: Post UUID
 *
 * Response:
 * - 200: Bookmark removed
 * - 404: Bookmark not found
 */
const removeBookmark = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  await BookmarkModel.removeBookmark(userId, id);

  res.json({
    success: true,
    message: 'Bookmark removed successfully'
  });
});

/**
 * GET /api/posts/bookmarks
 * Get user's bookmarked posts
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 *
 * Response:
 * - 200: Bookmarks data
 */
const getUserBookmarks = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const options = {
    page: parseInt(req.query.page) || 1,
    limit: Math.min(parseInt(req.query.limit) || 20, 100)
  };

  const bookmarks = await BookmarkModel.getUserBookmarks(userId, options);

  res.json({
    success: true,
    message: 'Bookmarks fetched successfully',
    data: bookmarks
  });
});

/**
 * POST /api/posts/:id/mark-outcome
 * Mark call outcome (analyst only)
 *
 * Request params:
 * - id: Post UUID
 *
 * Request body:
 * - call_status: string (required) - 'target_hit', 'stop_loss_hit', 'closed', 'expired'
 * - actual_exit_price: number (optional)
 * - actual_profit_percent: number (optional)
 *
 * Response:
 * - 200: Outcome marked
 * - 404: Post not found
 * - 403: Not authorized
 */
const markCallOutcome = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { call_status, actual_exit_price, actual_profit_percent } = req.body;
  const analystId = req.user.id;

  if (!call_status) {
    throw new AppError('Call status is required', 400);
  }

  const outcomeData = {
    call_status,
    actual_exit_price: actual_exit_price || null,
    actual_profit_percent: actual_profit_percent || null
  };

  const updatedPost = await PostModel.markCallOutcome(id, analystId, outcomeData);

  res.json({
    success: true,
    message: 'Call outcome marked successfully',
    data: { post: updatedPost }
  });
});

/**
 * GET /api/posts/analytics/:id
 * Get post analytics (analyst only)
 *
 * Request params:
 * - id: Post UUID
 *
 * Response:
 * - 200: Analytics data
 * - 404: Post not found
 * - 403: Not authorized
 */
const getPostAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const analystId = req.user.id;

  const analytics = await PostModel.getPostAnalytics(id, analystId);

  res.json({
    success: true,
    message: 'Analytics fetched successfully',
    data: { analytics }
  });
});

/**
 * GET /api/posts/analyst/:analystId
 * Get analyst's posts (public sample or full for subscribers)
 *
 * Request params:
 * - analystId: Analyst UUID
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - sample_only: boolean (default: false) - Get only 3 most recent posts
 *
 * Response:
 * - 200: Analyst's posts
 */
const getAnalystPosts = asyncHandler(async (req, res) => {
  const { analystId } = req.params;
  const userId = req.user?.id;

  const options = {
    page: parseInt(req.query.page) || 1,
    limit: Math.min(parseInt(req.query.limit) || 20, 100),
    sampleOnly: req.query.sample_only === 'true'
  };

  const posts = await PostModel.getAnalystPosts(analystId, userId, options);

  res.json({
    success: true,
    message: 'Analyst posts fetched successfully',
    data: posts
  });
});

/**
 * GET /api/posts/stock/:symbol
 * Get posts by stock symbol
 *
 * Request params:
 * - symbol: Stock symbol (e.g., 'NIFTY', 'RELIANCE')
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 *
 * Response:
 * - 200: Posts for stock
 */
const getPostsByStock = asyncHandler(async (req, res) => {
  const { symbol } = req.params;

  const options = {
    page: parseInt(req.query.page) || 1,
    limit: Math.min(parseInt(req.query.limit) || 20, 100)
  };

  const posts = await PostModel.getPostsByStock(symbol, options);

  res.json({
    success: true,
    message: 'Posts fetched successfully',
    data: posts
  });
});

/**
 * GET /api/posts
 * Get all posts with filters (public discovery)
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - analyst_id: UUID (optional) - Filter by analyst
 * - strategy_type: string (optional) - intraday, swing, options, etc.
 * - stock_symbol: string (optional) - Filter by stock
 * - audience: string (optional) - free, paid
 * - sort: string (default: 'recent') - recent, popular, trending
 *
 * Response:
 * - 200: Posts with pagination
 */
const getAllPosts = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const filters = {
    analyst_id: req.query.analyst_id,
    strategy_type: req.query.strategy_type,
    stock_symbol: req.query.stock_symbol,
    audience: req.query.audience,
    sort: req.query.sort || 'recent'
  };

  const options = {
    page: parseInt(req.query.page) || 1,
    limit: Math.min(parseInt(req.query.limit) || 20, 100)
  };

  const posts = await PostModel.getAllPosts(filters, userId, options);

  res.json({
    success: true,
    message: 'Posts fetched successfully',
    data: posts
  });
});

module.exports = {
  createPost,
  reformatWithAI,
  formatCallWithAI,
  getUserFeed,
  getPostById,
  updatePost,
  deletePost,
  bookmarkPost,
  removeBookmark,
  getUserBookmarks,
  markCallOutcome,
  getPostAnalytics,
  getAnalystPosts,
  getPostsByStock,
  getAllPosts
};
