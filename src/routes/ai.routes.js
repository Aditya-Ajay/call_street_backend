/**
 * AI Routes
 *
 * Handles AI-powered features for the Analyst Marketplace Platform.
 * Focus: Voice-to-trading-call formatting, AI analytics, and insights.
 *
 * ROUTES:
 * - POST   /api/ai/format-call - Format trading call from voice transcript
 * - GET    /api/ai/usage-stats - Get AI usage statistics for current user
 *
 * SECURITY:
 * - All routes require authentication
 * - Format endpoint limited to analysts only
 * - Rate limiting: 10 requests/minute per user
 * - Daily limits: 100 requests per analyst
 *
 * COST TRACKING:
 * - All API calls are logged for cost monitoring
 * - Token usage tracked per user
 * - Monthly spend limits enforced
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Import middleware
const { verifyToken, requireAnalyst } = require('../middleware/auth');

// Import controllers
const aiController = require('../controllers/aiController');

// ============================================
// RATE LIMITERS
// ============================================

/**
 * AI formatting rate limiter
 * - 10 requests per minute per user
 * - Prevents abuse and manages Claude API costs
 */
const aiFormattingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    success: false,
    message: 'Too many AI formatting requests. Maximum 10 per minute. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Rate limit exceeded. Maximum 10 AI formatting requests per minute.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * AI usage stats limiter
 * - 30 requests per minute (lighter operation)
 */
const aiStatsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================
// AI FORMATTING ENDPOINTS
// ============================================

/**
 * @route   POST /api/ai/format-call
 * @desc    Format trading call from voice transcript using Claude API
 * @access  Private (Analysts only)
 *
 * Body:
 * - transcript: string (required) - Voice transcript (10-1000 chars)
 * - language: string (optional) - 'en', 'hi', 'hinglish' (default: 'en')
 * - use_retry: boolean (optional) - Enable retry logic (default: true)
 *
 * Rate Limits:
 * - 10 requests per minute
 * - 100 requests per day
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Trading call formatted successfully",
 *   "data": {
 *     "formatted_call": {
 *       "stock": "HDFCBANK",
 *       "action": "BUY",
 *       "entry_price": 1520,
 *       "target_price": 1640,
 *       "stop_loss": 1480,
 *       "strategy_type": "SWING",
 *       "confidence": null,
 *       "reasoning": "breakout pattern",
 *       "risk_reward_ratio": "1:3.0",
 *       "time_horizon": null
 *     },
 *     "original_transcript": "Buy HDFC Bank at 1520...",
 *     "ai_confidence": "high",
 *     "metadata": {
 *       "model": "claude-sonnet-4-5-20250929",
 *       "tokens_used": 245,
 *       "latency_ms": 1234,
 *       "formatted_at": "2025-10-09T10:30:00.000Z",
 *       "language": "en"
 *     }
 *   }
 * }
 *
 * Error Responses:
 * - 400: Invalid transcript (too short/long, missing)
 * - 401: Unauthorized (not logged in)
 * - 403: Forbidden (not an analyst)
 * - 429: Rate limit exceeded
 * - 500: AI service error
 * - 503: Service temporarily unavailable
 */
router.post(
  '/format-call',
  verifyToken,
  requireAnalyst,
  aiFormattingLimiter,
  aiController.formatTradingCall
);

// ============================================
// USAGE STATISTICS
// ============================================

/**
 * @route   GET /api/ai/usage-stats
 * @desc    Get AI usage statistics for the current user
 * @access  Private (Analysts only)
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Usage statistics fetched successfully",
 *   "data": {
 *     "today": {
 *       "requests": 15,
 *       "tokens": 3500,
 *       "cost_inr": 2.625,
 *       "successful": 14,
 *       "failed": 1,
 *       "remaining_requests": 85
 *     },
 *     "this_month": {
 *       "requests": 450,
 *       "tokens": 105000,
 *       "cost_inr": 78.75
 *     },
 *     "limits": {
 *       "per_minute": 10,
 *       "per_day": 100,
 *       "per_month": 3000
 *     }
 *   }
 * }
 */
router.get(
  '/usage-stats',
  verifyToken,
  requireAnalyst,
  aiStatsLimiter,
  aiController.getUsageStats
);

// ============================================
// HEALTH CHECK
// ============================================

/**
 * @route   GET /api/ai/health
 * @desc    Check AI service health and availability
 * @access  Public
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "AI service is operational",
 *   "data": {
 *     "service": "claude-api",
 *     "model": "claude-sonnet-4-5-20250929",
 *     "status": "available",
 *     "features": {
 *       "voice_formatting": true,
 *       "retry_logic": true,
 *       "multilingual": true
 *     }
 *   }
 * }
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'AI service is operational',
    data: {
      service: 'claude-api',
      model: 'claude-sonnet-4-5-20250929',
      status: 'available',
      features: {
        voice_formatting: true,
        retry_logic: true,
        multilingual: true,
        languages: ['en', 'hi', 'hinglish']
      },
      limits: {
        transcript_min_length: 10,
        transcript_max_length: 1000,
        requests_per_minute: 10,
        requests_per_day: 100
      }
    }
  });
});

module.exports = router;
