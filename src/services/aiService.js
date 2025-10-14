/**
 * AI Service - Claude API Integration
 *
 * Handles AI-powered formatting of analyst trading calls using Claude API.
 * Extracts structured information from raw text/voice input in English, Hindi, and Hinglish.
 *
 * CRITICAL REQUIREMENTS:
 * - NEVER hallucinate prices or trading data
 * - Return null for missing information
 * - Handle multilingual input (English, Hindi, Hinglish)
 * - Validate all outputs against schema
 * - Implement timeout and error handling
 * - Track API usage and costs
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/env');

// Initialize Anthropic client
let anthropic = null;

// Initialize Claude API client (only if API key is configured)
const initializeClaudeClient = () => {
  if (!config.claude.apiKey) {
    console.warn('Claude API key not configured. AI formatting features will be disabled.');
    return null;
  }

  try {
    anthropic = new Anthropic({
      apiKey: config.claude.apiKey
    });
    console.log('Claude API client initialized successfully');
    console.log(`Using model: ${config.claude.model}`);
    return anthropic;
  } catch (error) {
    console.error('Failed to initialize Claude API client:', error.message);
    return null;
  }
};

// Initialize on module load
initializeClaudeClient();

/**
 * System prompt for Claude API
 * Instructs the model to extract trading information without hallucinating
 */
const SYSTEM_PROMPT = `You are a financial trading call formatter. Your ONLY job is to extract and structure information from raw analyst text.

CRITICAL RULES:
- Extract ONLY information explicitly stated in the input
- NEVER add your own analysis, predictions, or prices
- NEVER invent or hallucinate any trading details
- If information is missing, return null for that field
- Do not provide trading advice or recommendations

TASK:
Extract trading information from analyst's text and return ONLY valid JSON in this exact format:

{
  "stock": "ticker symbol or null",
  "action": "BUY or SELL or null",
  "strategy_type": "INTRADAY or SWING or INVESTMENT or OPTIONS or null",
  "entry_price": number or null,
  "target_price": number or null,
  "stop_loss": number or null,
  "confidence": "HIGH or MEDIUM or LOW or null",
  "reasoning": "quoted reasoning from input or null",
  "risk_reward_ratio": "calculated if all prices provided, otherwise null",
  "time_horizon": "time frame mentioned or null"
}

LANGUAGE HANDLING:
- Input may be in English, Hindi, or Hinglish (Hindi-English mix)
- Always output JSON keys in English
- For Hindi/Hinglish input:
  - "khareed lo" → action: "BUY"
  - "bech do" → action: "SELL"
  - "aaj" → strategy_type: "INTRADAY"
  - Convert all Hindi numbers to English numerals

PRICE EXTRACTION:
- Recognize formats: "19,500" or "19500" or "nineteen thousand five hundred"
- Handle decimal points: "2,450.50"
- If price unclear, return null (do NOT guess)

CALCULATION:
- risk_reward_ratio: If entry, target, and SL provided, calculate:
  - Risk = |entry - stop_loss|
  - Reward = |target - entry|
  - Ratio = "1:X" where X = Reward/Risk (round to 1 decimal)
- If any price missing, return null

CONFIDENCE EXTRACTION:
- "high confidence" / "strong setup" / "best setup" → "HIGH"
- "moderate" / "good setup" / "okay" → "MEDIUM"
- "risky" / "speculative" / "uncertain" → "LOW"
- If not mentioned, return null

EXAMPLES:

Input: "NIFTY buy at 19500 target 19600 stop loss 19450 high confidence breakout above resistance"
Output:
{
  "stock": "NIFTY",
  "action": "BUY",
  "strategy_type": "INTRADAY",
  "entry_price": 19500,
  "target_price": 19600,
  "stop_loss": 19450,
  "confidence": "HIGH",
  "reasoning": "breakout above resistance",
  "risk_reward_ratio": "1:2",
  "time_horizon": null
}

Input: "RELIANCE ko 2450 pe khareed lo target 2480 stop 2430"
Output:
{
  "stock": "RELIANCE",
  "action": "BUY",
  "strategy_type": null,
  "entry_price": 2450,
  "target_price": 2480,
  "stop_loss": 2430,
  "confidence": null,
  "reasoning": null,
  "risk_reward_ratio": "1:1.5",
  "time_horizon": null
}

Input: "Good setup in IT sector for swing trade"
Output:
{
  "stock": null,
  "action": null,
  "strategy_type": "SWING",
  "entry_price": null,
  "target_price": null,
  "stop_loss": null,
  "confidence": null,
  "reasoning": "Good setup in IT sector",
  "risk_reward_ratio": null,
  "time_horizon": null
}

RETURN ONLY THE JSON. No explanations, no markdown, no extra text.`;

/**
 * Expected schema for formatted call output
 */
const CALL_SCHEMA = {
  stock: 'string|null',
  action: 'string|null',
  strategy_type: 'string|null',
  entry_price: 'number|null',
  target_price: 'number|null',
  stop_loss: 'number|null',
  confidence: 'string|null',
  reasoning: 'string|null',
  risk_reward_ratio: 'string|null',
  time_horizon: 'string|null'
};

/**
 * Prohibited keywords that require manual review
 */
const PROHIBITED_KEYWORDS = [
  'guaranteed returns',
  'insider tip',
  'pump and dump',
  'risk-free',
  'guaranteed profit',
  'sure shot',
  'zero risk',
  '100% returns'
];

/**
 * Format analyst call using Claude API
 *
 * @param {string} rawText - Raw analyst input (text/voice transcription)
 * @param {string} language - Language hint ('en', 'hi', 'hinglish')
 * @returns {Promise<Object>} - Formatted call data or error
 */
const formatAnalystCall = async (rawText, language = 'en') => {
  const startTime = Date.now();

  try {
    // Validation
    if (!rawText || typeof rawText !== 'string') {
      return {
        success: false,
        error: 'Invalid input: rawText is required and must be a string',
        fallback: true
      };
    }

    // Trim and validate minimum length
    const trimmedText = rawText.trim();
    if (trimmedText.length < 5) {
      return {
        success: false,
        error: 'Input text too short (minimum 5 characters)',
        fallback: true
      };
    }

    // Check for prohibited content
    const containsProhibited = checkProhibitedContent(trimmedText);
    if (containsProhibited) {
      return {
        success: false,
        error: 'Content contains prohibited keywords and requires manual review',
        flagged: true,
        fallback: true
      };
    }

    // Check if Claude API is available
    if (!anthropic) {
      console.error('Claude API not initialized. Falling back to manual posting.');
      return {
        success: false,
        error: 'AI formatting service unavailable',
        fallback: true
      };
    }

    // Call Claude API with timeout
    const response = await Promise.race([
      anthropic.messages.create({
        model: config.claude.model,
        max_tokens: 1024,
        temperature: 0.1,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: trimmedText
          }
        ]
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Claude API timeout after 5 seconds')), 5000)
      )
    ]);

    const endTime = Date.now();
    const latency = endTime - startTime;

    // Extract response text
    const responseText = response.content[0].text;

    // Parse JSON response
    let formattedCall;
    try {
      formattedCall = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', responseText);
      return {
        success: false,
        error: 'AI returned invalid JSON format',
        fallback: true
      };
    }

    // Validate response against schema
    const validation = validateFormattedCall(formattedCall);
    if (!validation.valid) {
      console.error('Schema validation failed:', validation.errors);
      return {
        success: false,
        error: 'AI response does not match expected schema',
        validationErrors: validation.errors,
        fallback: true
      };
    }

    // Calculate risk:reward if not provided
    if (!formattedCall.risk_reward_ratio &&
        formattedCall.entry_price &&
        formattedCall.target_price &&
        formattedCall.stop_loss) {
      formattedCall.risk_reward_ratio = calculateRiskReward(
        formattedCall.entry_price,
        formattedCall.target_price,
        formattedCall.stop_loss
      );
    }

    // Log API usage
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    await logApiUsage(tokensUsed, latency, true);

    // Log latency warning if >4 seconds (P95 target)
    if (latency > 4000) {
      console.warn(`Claude API latency exceeded P95 target: ${latency}ms`);
    }

    return {
      success: true,
      data: formattedCall,
      metadata: {
        rawInput: trimmedText,
        language: language,
        tokensUsed: tokensUsed,
        latencyMs: latency,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;

    console.error('Claude API error:', {
      message: error.message,
      stack: error.stack,
      latency: latency
    });

    // Log failed API call
    await logApiUsage(0, latency, false, error.message);

    // Determine if we should retry
    const shouldRetry = error.message.includes('timeout') ||
                       error.message.includes('rate limit') ||
                       error.message.includes('500');

    return {
      success: false,
      error: error.message,
      shouldRetry: shouldRetry,
      fallback: true
    };
  }
};

/**
 * Validate formatted call against schema
 *
 * @param {Object} callData - Formatted call data from AI
 * @returns {Object} - Validation result { valid: boolean, errors: Array }
 */
const validateFormattedCall = (callData) => {
  const errors = [];

  // Check if callData is an object
  if (!callData || typeof callData !== 'object') {
    return {
      valid: false,
      errors: ['Response is not a valid object']
    };
  }

  // Validate each field in schema
  for (const [field, type] of Object.entries(CALL_SCHEMA)) {
    if (!(field in callData)) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }

    const value = callData[field];
    const allowedTypes = type.split('|');

    // Check if value is null (allowed for all fields)
    if (value === null) {
      continue;
    }

    // Validate type
    const actualType = typeof value;
    if (!allowedTypes.includes(actualType)) {
      errors.push(`Field ${field} has invalid type: expected ${type}, got ${actualType}`);
    }

    // Additional validations for specific fields
    if (field === 'action' && value !== null) {
      if (!['BUY', 'SELL'].includes(value)) {
        errors.push(`Invalid action value: ${value} (must be BUY or SELL)`);
      }
    }

    if (field === 'strategy_type' && value !== null) {
      if (!['INTRADAY', 'SWING', 'INVESTMENT', 'OPTIONS'].includes(value)) {
        errors.push(`Invalid strategy_type: ${value}`);
      }
    }

    if (field === 'confidence' && value !== null) {
      if (!['HIGH', 'MEDIUM', 'LOW'].includes(value)) {
        errors.push(`Invalid confidence value: ${value}`);
      }
    }

    // Validate price fields are positive numbers
    if (['entry_price', 'target_price', 'stop_loss'].includes(field) && value !== null) {
      if (typeof value === 'number' && value <= 0) {
        errors.push(`Field ${field} must be a positive number`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
};

/**
 * Calculate risk:reward ratio
 *
 * @param {number} entry - Entry price
 * @param {number} target - Target price
 * @param {number} stopLoss - Stop loss price
 * @returns {string|null} - Risk:reward ratio (e.g., "1:2.5") or null
 */
const calculateRiskReward = (entry, target, stopLoss) => {
  try {
    if (!entry || !target || !stopLoss) {
      return null;
    }

    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(target - entry);

    if (risk === 0) {
      return null;
    }

    const ratio = reward / risk;
    return `1:${ratio.toFixed(1)}`;
  } catch (error) {
    console.error('Error calculating risk:reward ratio:', error.message);
    return null;
  }
};

/**
 * Get fallback format (unformatted raw text)
 *
 * @param {string} rawText - Original analyst input
 * @returns {Object} - Fallback format with all fields null
 */
const getFallbackFormat = (rawText) => {
  return {
    stock: null,
    action: null,
    strategy_type: null,
    entry_price: null,
    target_price: null,
    stop_loss: null,
    confidence: null,
    reasoning: rawText, // Store original text in reasoning field
    risk_reward_ratio: null,
    time_horizon: null
  };
};

/**
 * Check for prohibited content
 *
 * @param {string} text - Text to check
 * @returns {boolean} - True if contains prohibited keywords
 */
const checkProhibitedContent = (text) => {
  const lowerText = text.toLowerCase();
  return PROHIBITED_KEYWORDS.some(keyword => lowerText.includes(keyword));
};

/**
 * Log API usage for monitoring and cost tracking
 *
 * @param {number} tokens - Total tokens used (input + output)
 * @param {number} latency - API call latency in milliseconds
 * @param {boolean} success - Whether the call succeeded
 * @param {string} errorMessage - Error message if failed
 */
const logApiUsage = async (tokens, latency, success, errorMessage = null) => {
  try {
    // Calculate approximate cost
    // Claude API pricing: ~$3 per 1M input tokens, ~$15 per 1M output tokens
    // Assuming 50/50 split for simplicity: ~$9 per 1M tokens average
    // In INR: ~₹750 per 1M tokens
    const costInr = (tokens / 1000000) * 750;

    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'claude-api',
      model: config.claude.model,
      tokensUsed: tokens,
      latencyMs: latency,
      costInr: parseFloat(costInr.toFixed(4)),
      success: success,
      error: errorMessage
    };

    // Log to console (in production, this should go to a monitoring service)
    if (config.isDevelopment) {
      console.log('Claude API Usage:', logEntry);
    }

    // TODO: In production, save to database for analytics
    // await db.query('INSERT INTO ai_api_logs SET ?', logEntry);

    return logEntry;
  } catch (error) {
    console.error('Failed to log API usage:', error.message);
  }
};

/**
 * Retry API call with exponential backoff
 *
 * @param {string} rawText - Raw input text
 * @param {number} retryCount - Current retry attempt (default: 0)
 * @param {number} maxRetries - Maximum retries (default: 2)
 * @returns {Promise<Object>} - Formatted result
 */
const formatWithRetry = async (rawText, retryCount = 0, maxRetries = 2) => {
  const result = await formatAnalystCall(rawText);

  if (!result.success && result.shouldRetry && retryCount < maxRetries) {
    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, retryCount) * 1000;
    console.log(`Retrying Claude API call in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

    await new Promise(resolve => setTimeout(resolve, delay));
    return formatWithRetry(rawText, retryCount + 1, maxRetries);
  }

  return result;
};

/**
 * Batch format multiple calls (for bulk processing)
 *
 * @param {Array<string>} textArray - Array of raw text inputs
 * @returns {Promise<Array<Object>>} - Array of formatted results
 */
const batchFormatCalls = async (textArray) => {
  try {
    if (!Array.isArray(textArray) || textArray.length === 0) {
      throw new Error('Invalid input: textArray must be a non-empty array');
    }

    // Process in parallel with limit to avoid rate limiting
    const BATCH_SIZE = 5; // Process 5 at a time
    const results = [];

    for (let i = 0; i < textArray.length; i += BATCH_SIZE) {
      const batch = textArray.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(text => formatAnalystCall(text))
      );
      results.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < textArray.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  } catch (error) {
    console.error('Batch formatting error:', error.message);
    throw error;
  }
};

/**
 * Supported call types for categorization
 */
const CALL_TYPES = {
  longterm: 'Long-term investments (weeks to months)',
  positional: 'Position trading (days to weeks)',
  swing: 'Swing trading (2-10 days)',
  intraday: 'Intraday trading (same day)',
  overnight: 'Overnight positions (1-2 days)',
  quant: 'Quantitative/algorithmic strategies'
};

/**
 * System prompt for trading call formatter with call type categorization
 */
const TRADING_CALL_SYSTEM_PROMPT = `You are a professional trading call formatter. Your job is to structure raw trading calls into a standardized format.

CRITICAL RULES:
- Extract ONLY explicitly stated information from the input
- NEVER hallucinate or invent prices, targets, or stop losses
- If information is missing, return null for that field
- NEVER provide your own trading advice or analysis
- Return ONLY valid JSON with no additional text or markdown

CALL TYPES:
- longterm: Long-term investments (weeks to months) - Look for keywords: "long term", "investment", "accumulate", "hold for months"
- positional: Position trading (days to weeks) - Look for keywords: "positional", "swing positional", "few weeks"
- swing: Swing trading (2-10 days) - Look for keywords: "swing", "few days", "short term"
- intraday: Intraday trading (same day) - Look for keywords: "intraday", "today", "aaj", "day trade", "same day"
- overnight: Overnight positions (1-2 days) - Look for keywords: "overnight", "tomorrow", "1-2 days", "next day"
- quant: Quantitative/algorithmic strategies - Look for keywords: "algo", "quant", "systematic", "algorithm", "strategy"

OUTPUT FORMAT (JSON ONLY):
{
  "call_type": "intraday|swing|positional|longterm|overnight|quant",
  "stock_symbol": "TICKER or null",
  "action": "BUY|SELL or null",
  "entry_price": number or null,
  "target_price": number or null,
  "stop_loss": number or null,
  "quantity_suggestion": number or null,
  "strategy": "Brief strategy description or null",
  "risk_reward_ratio": "1:X format or null",
  "time_frame": "Time frame mentioned or null",
  "reasoning": "Quoted reasoning from input or null",
  "formatted_text": "Professional formatted display text"
}

PRICE EXTRACTION:
- Recognize: "2450", "2,450", "2450.50", "two thousand four hundred fifty"
- For ranges: "2450-2460" → use midpoint 2455
- If unclear or not stated, return null

RISK-REWARD CALCULATION:
- Only calculate if entry, target, and stop loss are provided
- For BUY: Risk = entry - stop_loss, Reward = target - entry
- For SELL: Risk = stop_loss - entry, Reward = entry - target
- Format: "1:X" where X = Reward/Risk (round to 1 decimal)
- If cannot calculate, return null

FORMATTED TEXT GENERATION:
Create a professional display format like:
"🎯 **[CALL_TYPE] CALL**

📊 Stock: [SYMBOL]
📈 Action: [BUY/SELL]
💰 Entry: ₹[PRICE]
🎯 Target: ₹[PRICE]
🛡️ Stop Loss: ₹[PRICE]
⚖️ Risk:Reward = [RATIO]

📝 Strategy: [STRATEGY]
💡 Reasoning: [REASONING]"

LANGUAGE HANDLING:
- Support English, Hindi, and Hinglish
- Hindi keywords: "khareed lo"→BUY, "bech do"→SELL, "aaj"→intraday, "swing"→swing
- Convert Hindi numbers to English numerals

EXAMPLES:

Input: "NIFTY buy at 19500 target 19600 stop loss 19450 intraday"
Output:
{
  "call_type": "intraday",
  "stock_symbol": "NIFTY",
  "action": "BUY",
  "entry_price": 19500,
  "target_price": 19600,
  "stop_loss": 19450,
  "quantity_suggestion": null,
  "strategy": "Intraday momentum trade",
  "risk_reward_ratio": "1:2.0",
  "time_frame": "Intraday",
  "reasoning": null,
  "formatted_text": "🎯 **INTRADAY CALL**\\n\\n📊 Stock: NIFTY\\n📈 Action: BUY\\n💰 Entry: ₹19,500\\n🎯 Target: ₹19,600\\n🛡️ Stop Loss: ₹19,450\\n⚖️ Risk:Reward = 1:2.0\\n\\n📝 Strategy: Intraday momentum trade"
}

Input: "RELIANCE ko 2450 pe khareed lo swing trade ke liye target 2550 stop 2400"
Output:
{
  "call_type": "swing",
  "stock_symbol": "RELIANCE",
  "action": "BUY",
  "entry_price": 2450,
  "target_price": 2550,
  "stop_loss": 2400,
  "quantity_suggestion": null,
  "strategy": "Swing trade setup",
  "risk_reward_ratio": "1:2.0",
  "time_frame": "Swing (2-10 days)",
  "reasoning": null,
  "formatted_text": "🎯 **SWING CALL**\\n\\n📊 Stock: RELIANCE\\n📈 Action: BUY\\n💰 Entry: ₹2,450\\n🎯 Target: ₹2,550\\n🛡️ Stop Loss: ₹2,400\\n⚖️ Risk:Reward = 1:2.0\\n\\n📝 Strategy: Swing trade setup"
}

Input: "Good setup in TCS for long term investment around 3500"
Output:
{
  "call_type": "longterm",
  "stock_symbol": "TCS",
  "action": "BUY",
  "entry_price": 3500,
  "target_price": null,
  "stop_loss": null,
  "quantity_suggestion": null,
  "strategy": "Long-term investment",
  "risk_reward_ratio": null,
  "time_frame": "Long term (months)",
  "reasoning": "Good setup",
  "formatted_text": "🎯 **LONG-TERM CALL**\\n\\n📊 Stock: TCS\\n📈 Action: BUY\\n💰 Entry: ₹3,500\\n\\n📝 Strategy: Long-term investment\\n💡 Reasoning: Good setup"
}

RETURN ONLY THE JSON. No markdown code blocks, no explanations, no extra text.`;

/**
 * Format trading call with AI (enhanced version with call type categorization)
 *
 * @param {string} rawInput - Raw text/voice input from analyst
 * @param {string} callType - Suggested call type (optional, AI will validate/correct)
 * @param {string} stockSymbol - Stock symbol hint (optional, AI will validate)
 * @returns {Promise<Object>} - Formatted call with structured data
 */
const formatTradingCall = async (rawInput, callType = null, stockSymbol = null) => {
  const startTime = Date.now();

  try {
    // Validation
    if (!rawInput || typeof rawInput !== 'string') {
      return {
        success: false,
        error: 'Invalid input: rawInput is required and must be a string',
        fallback: true
      };
    }

    const trimmedInput = rawInput.trim();
    if (trimmedInput.length < 5) {
      return {
        success: false,
        error: 'Input text too short (minimum 5 characters)',
        fallback: true
      };
    }

    // Validate call type if provided
    if (callType && !Object.keys(CALL_TYPES).includes(callType)) {
      return {
        success: false,
        error: `Invalid call type. Must be one of: ${Object.keys(CALL_TYPES).join(', ')}`,
        fallback: true
      };
    }

    // Check for prohibited content
    const containsProhibited = checkProhibitedContent(trimmedInput);
    if (containsProhibited) {
      return {
        success: false,
        error: 'Content contains prohibited keywords and requires manual review',
        flagged: true,
        fallback: true
      };
    }

    // Check if Claude API is available
    if (!anthropic) {
      console.error('Claude API not initialized. Falling back to manual posting.');
      return {
        success: false,
        error: 'AI formatting service unavailable',
        fallback: true
      };
    }

    // Construct prompt with hints if provided
    let userPrompt = trimmedInput;
    if (callType || stockSymbol) {
      userPrompt = `${trimmedInput}\n\n[HINTS - Use if consistent with input: Call Type: ${callType || 'auto-detect'}, Stock: ${stockSymbol || 'auto-detect'}]`;
    }

    // Call Claude API with timeout
    const response = await Promise.race([
      anthropic.messages.create({
        model: config.claude.model,
        max_tokens: 1500,
        temperature: 0.1,
        system: TRADING_CALL_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Claude API timeout after 5 seconds')), 5000)
      )
    ]);

    const endTime = Date.now();
    const latency = endTime - startTime;

    // Extract response text
    const responseText = response.content[0].text;

    // Parse JSON response (handle potential markdown code blocks)
    let formattedCall;
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      formattedCall = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', responseText);
      return {
        success: false,
        error: 'AI returned invalid JSON format',
        fallback: true
      };
    }

    // Validate required fields
    if (!formattedCall.call_type || !Object.keys(CALL_TYPES).includes(formattedCall.call_type)) {
      console.error('Invalid call_type in AI response:', formattedCall.call_type);
      return {
        success: false,
        error: 'AI returned invalid call type',
        fallback: true
      };
    }

    // Calculate risk:reward if not provided and all prices available
    if (!formattedCall.risk_reward_ratio &&
        formattedCall.entry_price &&
        formattedCall.target_price &&
        formattedCall.stop_loss) {
      formattedCall.risk_reward_ratio = calculateRiskReward(
        formattedCall.entry_price,
        formattedCall.target_price,
        formattedCall.stop_loss,
        formattedCall.action
      );
    }

    // Validate price logic for BUY calls
    if (formattedCall.action === 'BUY') {
      if (formattedCall.target_price && formattedCall.entry_price &&
          formattedCall.target_price <= formattedCall.entry_price) {
        console.warn('Invalid BUY call: target <= entry price');
      }
      if (formattedCall.stop_loss && formattedCall.entry_price &&
          formattedCall.stop_loss >= formattedCall.entry_price) {
        console.warn('Invalid BUY call: stop loss >= entry price');
      }
    }

    // Validate price logic for SELL calls
    if (formattedCall.action === 'SELL') {
      if (formattedCall.target_price && formattedCall.entry_price &&
          formattedCall.target_price >= formattedCall.entry_price) {
        console.warn('Invalid SELL call: target >= entry price');
      }
      if (formattedCall.stop_loss && formattedCall.entry_price &&
          formattedCall.stop_loss <= formattedCall.entry_price) {
        console.warn('Invalid SELL call: stop loss <= entry price');
      }
    }

    // Log API usage
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    await logApiUsage(tokensUsed, latency, true);

    // Log latency warning if >4 seconds (P95 target)
    if (latency > 4000) {
      console.warn(`Claude API latency exceeded P95 target: ${latency}ms`);
    }

    return {
      success: true,
      data: formattedCall,
      metadata: {
        rawInput: trimmedInput,
        suggestedCallType: callType,
        suggestedStock: stockSymbol,
        tokensUsed: tokensUsed,
        latencyMs: latency,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;

    console.error('Claude API error in formatTradingCall:', {
      message: error.message,
      stack: error.stack,
      latency: latency
    });

    // Log failed API call
    await logApiUsage(0, latency, false, error.message);

    // Determine if we should retry
    const shouldRetry = error.message.includes('timeout') ||
                       error.message.includes('rate limit') ||
                       error.message.includes('500');

    return {
      success: false,
      error: error.message,
      shouldRetry: shouldRetry,
      fallback: true
    };
  }
};

/**
 * Calculate risk:reward ratio (enhanced for BUY and SELL)
 *
 * @param {number} entry - Entry price
 * @param {number} target - Target price
 * @param {number} stopLoss - Stop loss price
 * @param {string} action - BUY or SELL
 * @returns {string|null} - Risk:reward ratio (e.g., "1:2.5") or null
 */
const calculateRiskRewardEnhanced = (entry, target, stopLoss, action = 'BUY') => {
  try {
    if (!entry || !target || !stopLoss) {
      return null;
    }

    let risk, reward;

    if (action === 'BUY') {
      risk = Math.abs(entry - stopLoss);
      reward = Math.abs(target - entry);
    } else if (action === 'SELL') {
      risk = Math.abs(stopLoss - entry);
      reward = Math.abs(entry - target);
    } else {
      return null;
    }

    if (risk === 0) {
      return null;
    }

    const ratio = reward / risk;
    return `1:${ratio.toFixed(1)}`;
  } catch (error) {
    console.error('Error calculating risk:reward ratio:', error.message);
    return null;
  }
};

module.exports = {
  formatAnalystCall,
  formatTradingCall,
  formatWithRetry,
  validateFormattedCall,
  calculateRiskReward,
  calculateRiskRewardEnhanced,
  getFallbackFormat,
  checkProhibitedContent,
  logApiUsage,
  batchFormatCalls,
  CALL_TYPES,
  SYSTEM_PROMPT,
  TRADING_CALL_SYSTEM_PROMPT,
  CALL_SCHEMA
};
