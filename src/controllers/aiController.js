/**
 * AI Controller
 *
 * Handles AI-powered features for the Analyst Marketplace Platform.
 * Primary focus: Voice-to-trading-call formatting using Claude API.
 *
 * ENDPOINTS:
 * - POST /api/ai/format-call - Format trading call from voice transcript
 *
 * SECURITY:
 * - Rate limiting: 10 requests/minute per user
 * - Analysts only (verified users)
 * - Input sanitization and validation
 * - Cost tracking per user
 *
 * ERROR HANDLING:
 * - Claude API failures → Graceful fallback
 * - Invalid transcripts → Actionable error messages
 * - Rate limits → Clear cooldown message
 * - Timeout → Retry logic with exponential backoff
 */

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { formatAnalystCall, formatWithRetry, getFallbackFormat } = require('../services/aiService');
const { normalizeStockSymbol, isValidSymbol, getSuggestions } = require('../utils/stockSymbolMapper');
const { query } = require('../config/database');

/**
 * POST /api/ai/format-call
 *
 * Format trading call from voice transcript using Claude API
 *
 * Request body:
 * - transcript: string (required) - Voice transcript to format (10-1000 chars)
 * - language: string (optional) - Language hint: 'en', 'hi', 'hinglish' (default: 'en')
 * - use_retry: boolean (optional) - Enable retry with exponential backoff (default: true)
 *
 * Response:
 * - 200: Successfully formatted
 * - 400: Validation error
 * - 401: Unauthorized
 * - 429: Rate limit exceeded
 * - 500: AI service error
 *
 * Example request:
 * {
 *   "transcript": "Buy HDFC Bank at 1520 rupees, target 1640, stop loss at 1480, this is a swing trade based on breakout pattern",
 *   "language": "en"
 * }
 *
 * Example response:
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
 *       "formatted_at": "2025-10-09T10:30:00.000Z"
 *     }
 *   }
 * }
 */
const formatTradingCall = asyncHandler(async (req, res) => {
  const { transcript, language = 'en', use_retry = true } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  // ============================================
  // VALIDATION
  // ============================================

  // Check if user is an analyst
  if (userRole !== 'analyst') {
    throw new AppError('This feature is only available for verified analysts', 403);
  }

  // Validate transcript
  if (!transcript || typeof transcript !== 'string') {
    throw new AppError('Transcript is required and must be a string', 400);
  }

  const trimmedTranscript = transcript.trim();

  if (trimmedTranscript.length < 10) {
    throw new AppError('Transcript must be at least 10 characters long', 400);
  }

  if (trimmedTranscript.length > 1000) {
    throw new AppError('Transcript too long (maximum 1000 characters)', 400);
  }

  // Validate language
  const validLanguages = ['en', 'hi', 'hinglish'];
  if (!validLanguages.includes(language)) {
    throw new AppError(`Invalid language. Must be one of: ${validLanguages.join(', ')}`, 400);
  }

  // ============================================
  // RATE LIMITING CHECK
  // ============================================

  // Check per-user rate limit (10 requests per minute)
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const recentRequests = await query(
    `SELECT COUNT(*) as count
     FROM ai_usage_logs
     WHERE user_id = $1
     AND created_at >= $2`,
    [userId, oneMinuteAgo]
  );

  const requestCount = parseInt(recentRequests.rows[0]?.count || 0);

  if (requestCount >= 10) {
    throw new AppError('Rate limit exceeded. Maximum 10 requests per minute. Please try again later.', 429);
  }

  // Check daily limit (100 requests per day per analyst)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const dailyRequests = await query(
    `SELECT COUNT(*) as count
     FROM ai_usage_logs
     WHERE user_id = $1
     AND created_at >= $2`,
    [userId, todayStart]
  );

  const dailyCount = parseInt(dailyRequests.rows[0]?.count || 0);

  if (dailyCount >= 100) {
    throw new AppError('Daily limit exceeded. Maximum 100 AI formatting requests per day.', 429);
  }

  // ============================================
  // AI FORMATTING
  // ============================================

  let formattedResult;

  try {
    // Use retry logic if enabled
    if (use_retry) {
      formattedResult = await formatWithRetry(trimmedTranscript, 0, 2);
    } else {
      formattedResult = await formatAnalystCall(trimmedTranscript, language);
    }

    // If AI formatting failed, provide fallback
    if (!formattedResult.success) {
      console.warn('AI formatting failed:', formattedResult.error);

      // Log failed attempt
      await logAIUsage(userId, 'format_call', trimmedTranscript.length, 0, false, formattedResult.error);

      // Return error with manual input suggestion
      throw new AppError(
        `AI formatting failed: ${formattedResult.error}. Please enter trading details manually.`,
        500
      );
    }

  } catch (error) {
    // If it's already an AppError, re-throw
    if (error instanceof AppError) {
      throw error;
    }

    // Log unexpected error
    console.error('Unexpected AI formatting error:', error);
    await logAIUsage(userId, 'format_call', trimmedTranscript.length, 0, false, error.message);

    throw new AppError('AI service temporarily unavailable. Please enter details manually.', 503);
  }

  // ============================================
  // STOCK SYMBOL NORMALIZATION
  // ============================================

  let normalizedStock = null;
  let stockSuggestions = null;

  if (formattedResult.data.stock) {
    normalizedStock = normalizeStockSymbol(formattedResult.data.stock);

    // If normalization failed, provide suggestions
    if (!normalizedStock) {
      stockSuggestions = getSuggestions(formattedResult.data.stock, 3);

      // If no suggestions, keep original
      if (stockSuggestions.length === 0) {
        normalizedStock = formattedResult.data.stock.toUpperCase();
      }
    }

    // Update the formatted data with normalized symbol
    if (normalizedStock) {
      formattedResult.data.stock = normalizedStock;
    }
  }

  // ============================================
  // CONFIDENCE SCORING
  // ============================================

  const confidenceScore = calculateConfidenceScore(formattedResult.data);

  // ============================================
  // LOG USAGE
  // ============================================

  const tokensUsed = formattedResult.metadata?.tokensUsed || 0;
  await logAIUsage(
    userId,
    'format_call',
    trimmedTranscript.length,
    tokensUsed,
    true,
    null,
    formattedResult.data
  );

  // ============================================
  // RESPONSE
  // ============================================

  res.status(200).json({
    success: true,
    message: 'Trading call formatted successfully',
    data: {
      formatted_call: formattedResult.data,
      original_transcript: trimmedTranscript,
      ai_confidence: confidenceScore,
      stock_suggestions: stockSuggestions || undefined,
      metadata: {
        model: formattedResult.metadata?.model || 'claude-sonnet-4-5-20250929',
        tokens_used: tokensUsed,
        latency_ms: formattedResult.metadata?.latencyMs || 0,
        formatted_at: new Date().toISOString(),
        language: language
      }
    }
  });
});

/**
 * Calculate confidence score based on completeness of extracted data
 *
 * @param {Object} formattedData - Formatted trading call data
 * @returns {string} - Confidence level: 'high', 'medium', 'low'
 */
const calculateConfidenceScore = (formattedData) => {
  let score = 0;
  const maxScore = 7;

  // Essential fields (higher weight)
  if (formattedData.stock) score += 2;
  if (formattedData.action) score += 2;
  if (formattedData.entry_price) score += 1;

  // Optional but important fields
  if (formattedData.target_price) score += 0.5;
  if (formattedData.stop_loss) score += 0.5;
  if (formattedData.strategy_type) score += 0.5;
  if (formattedData.reasoning) score += 0.5;

  const percentage = (score / maxScore) * 100;

  if (percentage >= 80) return 'high';
  if (percentage >= 50) return 'medium';
  return 'low';
};

/**
 * Log AI usage to database for analytics and cost tracking
 *
 * @param {string} userId - User ID
 * @param {string} operation - Operation type (e.g., 'format_call')
 * @param {number} inputLength - Input text length
 * @param {number} tokensUsed - API tokens consumed
 * @param {boolean} success - Whether operation succeeded
 * @param {string|null} errorMessage - Error message if failed
 * @param {Object|null} outputData - Formatted output data
 */
const logAIUsage = async (userId, operation, inputLength, tokensUsed, success, errorMessage = null, outputData = null) => {
  try {
    // Calculate approximate cost
    // Claude API pricing: ~$3 per 1M input tokens, ~$15 per 1M output tokens
    // Average: ~$9 per 1M tokens = ~₹750 per 1M tokens
    const costInr = (tokensUsed / 1000000) * 750;

    await query(
      `INSERT INTO ai_usage_logs (
        user_id,
        operation_type,
        input_length,
        tokens_used,
        cost_inr,
        success,
        error_message,
        output_data,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        userId,
        operation,
        inputLength,
        tokensUsed,
        parseFloat(costInr.toFixed(4)),
        success,
        errorMessage,
        outputData ? JSON.stringify(outputData) : null
      ]
    );
  } catch (error) {
    // Don't throw error, just log it
    console.error('Failed to log AI usage:', error.message);
  }
};

/**
 * GET /api/ai/usage-stats
 *
 * Get AI usage statistics for the current user
 *
 * Response:
 * - 200: Usage statistics
 * - 401: Unauthorized
 */
const getUsageStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get today's usage
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayStats = await query(
    `SELECT
      COUNT(*) as total_requests,
      SUM(tokens_used) as total_tokens,
      SUM(cost_inr) as total_cost,
      COUNT(CASE WHEN success = true THEN 1 END) as successful_requests,
      COUNT(CASE WHEN success = false THEN 1 END) as failed_requests
     FROM ai_usage_logs
     WHERE user_id = $1
     AND created_at >= $2`,
    [userId, todayStart]
  );

  // Get this month's usage
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthStats = await query(
    `SELECT
      COUNT(*) as total_requests,
      SUM(tokens_used) as total_tokens,
      SUM(cost_inr) as total_cost
     FROM ai_usage_logs
     WHERE user_id = $1
     AND created_at >= $2`,
    [userId, monthStart]
  );

  res.json({
    success: true,
    message: 'Usage statistics fetched successfully',
    data: {
      today: {
        requests: parseInt(todayStats.rows[0].total_requests || 0),
        tokens: parseInt(todayStats.rows[0].total_tokens || 0),
        cost_inr: parseFloat(todayStats.rows[0].total_cost || 0),
        successful: parseInt(todayStats.rows[0].successful_requests || 0),
        failed: parseInt(todayStats.rows[0].failed_requests || 0),
        remaining_requests: Math.max(0, 100 - parseInt(todayStats.rows[0].total_requests || 0))
      },
      this_month: {
        requests: parseInt(monthStats.rows[0].total_requests || 0),
        tokens: parseInt(monthStats.rows[0].total_tokens || 0),
        cost_inr: parseFloat(monthStats.rows[0].total_cost || 0)
      },
      limits: {
        per_minute: 10,
        per_day: 100,
        per_month: 3000
      }
    }
  });
});

module.exports = {
  formatTradingCall,
  getUsageStats
};
