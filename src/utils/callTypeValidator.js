/**
 * Call Type Validator
 *
 * Provides validation and utility functions for trading call types.
 * Ensures consistency between frontend call types and database strategy types.
 *
 * CALL TYPES (Frontend/API):
 * - longterm: Long-term investments (weeks to months)
 * - positional: Position trading (days to weeks)
 * - swing: Swing trading (2-10 days)
 * - intraday: Intraday trading (same day)
 * - overnight: Overnight positions (1-2 days)
 * - quant: Quantitative/algorithmic strategies
 *
 * DATABASE STRATEGY TYPES:
 * - long_term: Long-term investments
 * - positional: Position trading
 * - swing: Swing trading
 * - intraday: Intraday trading
 * - options: Options trading / Algorithmic strategies
 */

/**
 * Supported call types for the API
 */
const CALL_TYPES = {
  longterm: {
    label: 'Long-term',
    description: 'Long-term investments (weeks to months)',
    dbMapping: 'long_term',
    keywords: ['long term', 'investment', 'accumulate', 'hold for months', 'long-term']
  },
  positional: {
    label: 'Positional',
    description: 'Position trading (days to weeks)',
    dbMapping: 'positional',
    keywords: ['positional', 'swing positional', 'few weeks', 'position trade']
  },
  swing: {
    label: 'Swing',
    description: 'Swing trading (2-10 days)',
    dbMapping: 'swing',
    keywords: ['swing', 'few days', 'short term', '2-10 days', 'swing trade']
  },
  intraday: {
    label: 'Intraday',
    description: 'Intraday trading (same day)',
    dbMapping: 'intraday',
    keywords: ['intraday', 'today', 'aaj', 'day trade', 'same day', 'scalp']
  },
  overnight: {
    label: 'Overnight',
    description: 'Overnight positions (1-2 days)',
    dbMapping: 'swing', // Map to swing as closest database match
    keywords: ['overnight', 'tomorrow', '1-2 days', 'next day', 'kal']
  },
  quant: {
    label: 'Quant',
    description: 'Quantitative/algorithmic strategies',
    dbMapping: 'options', // Map to options as algorithmic category
    keywords: ['algo', 'quant', 'systematic', 'algorithm', 'strategy', 'quantitative']
  }
};

/**
 * Database strategy types (from posts table schema)
 */
const DB_STRATEGY_TYPES = [
  'intraday',
  'swing',
  'positional',
  'long_term',
  'options'
];

/**
 * Validate if a call type is valid
 *
 * @param {string} callType - Call type to validate
 * @returns {boolean} - True if valid
 */
const isValidCallType = (callType) => {
  if (!callType || typeof callType !== 'string') {
    return false;
  }
  return Object.keys(CALL_TYPES).includes(callType.toLowerCase());
};

/**
 * Get call type metadata
 *
 * @param {string} callType - Call type
 * @returns {Object|null} - Call type metadata or null
 */
const getCallTypeMetadata = (callType) => {
  if (!callType || typeof callType !== 'string') {
    return null;
  }
  return CALL_TYPES[callType.toLowerCase()] || null;
};

/**
 * Map call type to database strategy type
 *
 * @param {string} callType - Frontend call type
 * @returns {string|null} - Database strategy type or null
 */
const mapToDbStrategyType = (callType) => {
  const metadata = getCallTypeMetadata(callType);
  return metadata ? metadata.dbMapping : null;
};

/**
 * Map database strategy type to call type
 *
 * @param {string} dbStrategyType - Database strategy type
 * @returns {string|null} - Call type or null
 */
const mapFromDbStrategyType = (dbStrategyType) => {
  if (!dbStrategyType || typeof dbStrategyType !== 'string') {
    return null;
  }

  // Find call type with matching dbMapping
  for (const [callType, metadata] of Object.entries(CALL_TYPES)) {
    if (metadata.dbMapping === dbStrategyType.toLowerCase()) {
      // Return first match (intraday, swing, positional, longterm)
      // Note: overnight and quant map to existing DB types, so this returns base type
      if (callType === 'longterm' && dbStrategyType.toLowerCase() === 'long_term') {
        return 'longterm';
      }
      return callType;
    }
  }

  return null;
};

/**
 * Get all available call types
 *
 * @returns {Array<Object>} - Array of call type objects with metadata
 */
const getAllCallTypes = () => {
  return Object.entries(CALL_TYPES).map(([key, metadata]) => ({
    type: key,
    label: metadata.label,
    description: metadata.description,
    dbMapping: metadata.dbMapping
  }));
};

/**
 * Detect call type from text content (keyword matching)
 *
 * @param {string} text - Text to analyze
 * @returns {string|null} - Detected call type or null
 */
const detectCallTypeFromText = (text) => {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const lowerText = text.toLowerCase();

  // Check for keywords in order of specificity
  for (const [callType, metadata] of Object.entries(CALL_TYPES)) {
    for (const keyword of metadata.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return callType;
      }
    }
  }

  return null;
};

/**
 * Validate if database strategy type is valid
 *
 * @param {string} strategyType - Database strategy type
 * @returns {boolean} - True if valid
 */
const isValidDbStrategyType = (strategyType) => {
  if (!strategyType || typeof strategyType !== 'string') {
    return false;
  }
  return DB_STRATEGY_TYPES.includes(strategyType.toLowerCase());
};

/**
 * Validate trading call structure
 *
 * @param {Object} call - Trading call object
 * @returns {Object} - { valid: boolean, errors: Array<string> }
 */
const validateTradingCall = (call) => {
  const errors = [];

  // Required fields
  if (!call.call_type) {
    errors.push('call_type is required');
  } else if (!isValidCallType(call.call_type)) {
    errors.push(`Invalid call_type: ${call.call_type}. Must be one of: ${Object.keys(CALL_TYPES).join(', ')}`);
  }

  // Optional but recommended fields
  if (call.action && !['BUY', 'SELL', 'HOLD'].includes(call.action)) {
    errors.push(`Invalid action: ${call.action}. Must be BUY, SELL, or HOLD`);
  }

  // Price validation
  if (call.entry_price !== null && call.entry_price !== undefined) {
    if (typeof call.entry_price !== 'number' || call.entry_price <= 0) {
      errors.push('entry_price must be a positive number');
    }
  }

  if (call.target_price !== null && call.target_price !== undefined) {
    if (typeof call.target_price !== 'number' || call.target_price <= 0) {
      errors.push('target_price must be a positive number');
    }
  }

  if (call.stop_loss !== null && call.stop_loss !== undefined) {
    if (typeof call.stop_loss !== 'number' || call.stop_loss <= 0) {
      errors.push('stop_loss must be a positive number');
    }
  }

  // Price logic validation
  if (call.action === 'BUY' && call.entry_price && call.target_price && call.stop_loss) {
    if (call.target_price <= call.entry_price) {
      errors.push('For BUY calls, target_price must be greater than entry_price');
    }
    if (call.stop_loss >= call.entry_price) {
      errors.push('For BUY calls, stop_loss must be less than entry_price');
    }
  }

  if (call.action === 'SELL' && call.entry_price && call.target_price && call.stop_loss) {
    if (call.target_price >= call.entry_price) {
      errors.push('For SELL calls, target_price must be less than entry_price');
    }
    if (call.stop_loss <= call.entry_price) {
      errors.push('For SELL calls, stop_loss must be greater than entry_price');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
};

/**
 * Get call type display name for UI
 *
 * @param {string} callType - Call type
 * @returns {string} - Display name
 */
const getCallTypeDisplayName = (callType) => {
  const metadata = getCallTypeMetadata(callType);
  return metadata ? metadata.label : callType;
};

module.exports = {
  CALL_TYPES,
  DB_STRATEGY_TYPES,
  isValidCallType,
  getCallTypeMetadata,
  mapToDbStrategyType,
  mapFromDbStrategyType,
  getAllCallTypes,
  detectCallTypeFromText,
  isValidDbStrategyType,
  validateTradingCall,
  getCallTypeDisplayName
};
