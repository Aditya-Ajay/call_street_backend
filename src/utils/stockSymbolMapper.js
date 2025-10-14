/**
 * Stock Symbol Mapper
 *
 * Maps common stock names to NSE/BSE symbols for the Indian stock market.
 * Handles multiple name variations for popular stocks to improve voice recognition accuracy.
 *
 * USAGE:
 * const { normalizeStockSymbol, isValidSymbol } = require('./stockSymbolMapper');
 *
 * const symbol = normalizeStockSymbol('hdfc bank'); // Returns 'HDFCBANK'
 * const symbol = normalizeStockSymbol('reliance'); // Returns 'RELIANCE'
 *
 * FEATURES:
 * - Case-insensitive matching
 * - Handles Hindi/Hinglish names
 * - Supports abbreviations and full names
 * - Top 100 NSE stocks coverage
 * - Validates symbol format
 */

/**
 * Comprehensive mapping of stock names to NSE symbols
 * Includes multiple variations for voice recognition
 */
const STOCK_NAME_TO_SYMBOL = {
  // Banking Sector
  'hdfc bank': 'HDFCBANK',
  'hdfc': 'HDFCBANK',
  'hdfcbank': 'HDFCBANK',
  'icici bank': 'ICICIBANK',
  'icici': 'ICICIBANK',
  'icicibank': 'ICICIBANK',
  'state bank': 'SBIN',
  'sbi': 'SBIN',
  'state bank of india': 'SBIN',
  'axis bank': 'AXISBANK',
  'axis': 'AXISBANK',
  'kotak bank': 'KOTAKBANK',
  'kotak': 'KOTAKBANK',
  'kotak mahindra': 'KOTAKBANK',
  'indusind bank': 'INDUSINDBK',
  'indusind': 'INDUSINDBK',
  'yes bank': 'YESBANK',
  'yes': 'YESBANK',
  'bandhan bank': 'BANDHANBNK',
  'federal bank': 'FEDERALBNK',
  'idfc first bank': 'IDFCFIRSTB',
  'idfc': 'IDFCFIRSTB',

  // IT Sector
  'tcs': 'TCS',
  'tata consultancy': 'TCS',
  'tata consultancy services': 'TCS',
  'infosys': 'INFY',
  'infy': 'INFY',
  'wipro': 'WIPRO',
  'hcl tech': 'HCLTECH',
  'hcl': 'HCLTECH',
  'hcl technologies': 'HCLTECH',
  'tech mahindra': 'TECHM',
  'tech m': 'TECHM',
  'lti mindtree': 'LTIM',
  'ltim': 'LTIM',
  'coforge': 'COFORGE',
  'mphasis': 'MPHASIS',
  'persistent': 'PERSISTENT',

  // Conglomerate
  'reliance': 'RELIANCE',
  'ril': 'RELIANCE',
  'reliance industries': 'RELIANCE',
  'tata steel': 'TATASTEEL',
  'tata motors': 'TATAMOTORS',
  'tata power': 'TATAPOWER',
  'tata consumer': 'TATACONSUM',
  'tata chemicals': 'TATACHEM',
  'aditya birla': 'ADANIPORTS',
  'larsen toubro': 'LT',
  'larsen and toubro': 'LT',
  'l&t': 'LT',
  'lt': 'LT',

  // Adani Group
  'adani enterprises': 'ADANIENT',
  'adani ports': 'ADANIPORTS',
  'adani power': 'ADANIPOWER',
  'adani green': 'ADANIGREEN',
  'adani total gas': 'ATGL',
  'adani transmission': 'ADANITRANS',

  // FMCG
  'hindustan unilever': 'HINDUNILVR',
  'hul': 'HINDUNILVR',
  'itc': 'ITC',
  'itc limited': 'ITC',
  'britannia': 'BRITANNIA',
  'britannia industries': 'BRITANNIA',
  'nestle': 'NESTLEIND',
  'nestle india': 'NESTLEIND',
  'dabur': 'DABUR',
  'marico': 'MARICO',
  'godrej consumer': 'GODREJCP',
  'colgate': 'COLPAL',
  'colgate palmolive': 'COLPAL',

  // Pharma
  'sun pharma': 'SUNPHARMA',
  'sun pharmaceutical': 'SUNPHARMA',
  'cipla': 'CIPLA',
  'dr reddy': 'DRREDDY',
  'drreddys': 'DRREDDY',
  'divis lab': 'DIVISLAB',
  'divis': 'DIVISLAB',
  'biocon': 'BIOCON',
  'lupin': 'LUPIN',
  'torrent pharma': 'TORNTPHARM',
  'aurobindo pharma': 'AUROPHARMA',

  // Auto
  'maruti': 'MARUTI',
  'maruti suzuki': 'MARUTI',
  'mahindra': 'M&M',
  'm&m': 'M&M',
  'mahindra and mahindra': 'M&M',
  'bajaj auto': 'BAJAJ-AUTO',
  'bajaj': 'BAJAJ-AUTO',
  'hero motocorp': 'HEROMOTOCO',
  'hero': 'HEROMOTOCO',
  'eicher motors': 'EICHERMOT',
  'eicher': 'EICHERMOT',
  'tvs motor': 'TVSMOTOR',
  'tvs': 'TVSMOTOR',

  // Telecom
  'bharti airtel': 'BHARTIARTL',
  'airtel': 'BHARTIARTL',
  'vodafone idea': 'IDEA',
  'vi': 'IDEA',
  'idea': 'IDEA',

  // Metals & Mining
  'tata steel': 'TATASTEEL',
  'jsw steel': 'JSWSTEEL',
  'jsw': 'JSWSTEEL',
  'hindalco': 'HINDALCO',
  'vedanta': 'VEDL',
  'vedl': 'VEDL',
  'coal india': 'COALINDIA',
  'nmdc': 'NMDC',
  'jindal steel': 'JINDALSTEL',

  // Energy & Power
  'ntpc': 'NTPC',
  'power grid': 'POWERGRID',
  'powergrid': 'POWERGRID',
  'ongc': 'ONGC',
  'oil and natural gas': 'ONGC',
  'bpcl': 'BPCL',
  'bharat petroleum': 'BPCL',
  'ioc': 'IOC',
  'indian oil': 'IOC',
  'gail': 'GAIL',

  // Cement
  'ultratech': 'ULTRACEMCO',
  'ultratech cement': 'ULTRACEMCO',
  'ambuja cement': 'AMBUJACEM',
  'ambuja': 'AMBUJACEM',
  'acc': 'ACC',
  'shree cement': 'SHREECEM',

  // Realty
  'dlf': 'DLF',
  'godrej properties': 'GODREJPROP',
  'oberoi realty': 'OBEROIRLTY',
  'phoenix mills': 'PHOENIXLTD',

  // Insurance & Finance
  'bajaj finance': 'BAJFINANCE',
  'bajaj finserv': 'BAJAJFINSV',
  'hdfc life': 'HDFCLIFE',
  'sbi life': 'SBILIFE',
  'icici lombard': 'ICICIGI',
  'icici prudential': 'ICICIPRULI',
  'lic': 'LICI',
  'lic india': 'LICI',
  'pnb': 'PNB',
  'punjab national bank': 'PNB',
  'bank of baroda': 'BANKBARODA',
  'bob': 'BANKBARODA',

  // Others
  'asian paints': 'ASIANPAINT',
  'asian paint': 'ASIANPAINT',
  'berger paints': 'BERGEPAINT',
  'pidilite': 'PIDILITIND',
  'grasim': 'GRASIM',
  'upl': 'UPL',
  'srf': 'SRF',
  'siemens': 'SIEMENS',
  'abb': 'ABB',
  'havells': 'HAVELLS',
  'voltas': 'VOLTAS',

  // Indices
  'nifty': 'NIFTY',
  'nifty 50': 'NIFTY',
  'nifty fifty': 'NIFTY',
  'sensex': 'SENSEX',
  'bank nifty': 'BANKNIFTY',
  'banknifty': 'BANKNIFTY',
  'nifty bank': 'BANKNIFTY',
  'nifty it': 'NIFTYIT',
  'finnifty': 'FINNIFTY',
  'midcap nifty': 'NIFTYMIDCAP',
};

/**
 * Hindi/Hinglish stock name mappings
 */
const HINDI_STOCK_NAMES = {
  'एचडीएफसी': 'HDFCBANK',
  'रिलायंस': 'RELIANCE',
  'टीसीएस': 'TCS',
  'इंफोसिस': 'INFY',
  'आईसीआईसीआई': 'ICICIBANK',
  'एसबीआई': 'SBIN',
};

/**
 * NSE symbol pattern for validation
 */
const NSE_SYMBOL_PATTERN = /^[A-Z0-9&-]{1,20}$/;

/**
 * Normalize stock symbol from various name formats
 *
 * @param {string} input - Stock name or symbol (case-insensitive)
 * @returns {string|null} - Normalized NSE symbol or null if not found
 */
const normalizeStockSymbol = (input) => {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Trim and convert to lowercase
  const normalized = input.trim().toLowerCase();

  // If already a valid symbol format, return uppercase
  if (NSE_SYMBOL_PATTERN.test(input.trim().toUpperCase())) {
    return input.trim().toUpperCase();
  }

  // Check in main mapping
  if (STOCK_NAME_TO_SYMBOL[normalized]) {
    return STOCK_NAME_TO_SYMBOL[normalized];
  }

  // Check in Hindi mapping
  if (HINDI_STOCK_NAMES[input.trim()]) {
    return HINDI_STOCK_NAMES[input.trim()];
  }

  // Try removing common suffixes
  const withoutSuffixes = normalized
    .replace(/\s+(ltd|limited|pvt|private|corporation|corp|inc|company|co)$/i, '')
    .trim();

  if (STOCK_NAME_TO_SYMBOL[withoutSuffixes]) {
    return STOCK_NAME_TO_SYMBOL[withoutSuffixes];
  }

  // Not found
  return null;
};

/**
 * Validate if a symbol is in correct NSE format
 *
 * @param {string} symbol - Stock symbol to validate
 * @returns {boolean} - True if valid NSE symbol format
 */
const isValidSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') {
    return false;
  }

  return NSE_SYMBOL_PATTERN.test(symbol);
};

/**
 * Get stock name suggestions based on partial input
 *
 * @param {string} partialName - Partial stock name
 * @param {number} limit - Maximum suggestions to return (default: 5)
 * @returns {Array<Object>} - Array of { name, symbol } suggestions
 */
const getSuggestions = (partialName, limit = 5) => {
  if (!partialName || typeof partialName !== 'string') {
    return [];
  }

  const normalized = partialName.trim().toLowerCase();
  const suggestions = [];

  for (const [name, symbol] of Object.entries(STOCK_NAME_TO_SYMBOL)) {
    if (name.includes(normalized)) {
      suggestions.push({
        name: name,
        symbol: symbol
      });

      if (suggestions.length >= limit) {
        break;
      }
    }
  }

  return suggestions;
};

/**
 * Get all supported stock symbols
 *
 * @returns {Array<string>} - Array of all NSE symbols
 */
const getAllSymbols = () => {
  return [...new Set(Object.values(STOCK_NAME_TO_SYMBOL))];
};

/**
 * Check if stock is in a specific sector
 *
 * @param {string} symbol - Stock symbol
 * @param {string} sector - Sector name (banking, it, pharma, auto, etc.)
 * @returns {boolean} - True if stock belongs to sector
 */
const isInSector = (symbol, sector) => {
  const sectorMapping = {
    banking: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK', 'INDUSINDBK', 'YESBANK', 'BANDHANBNK', 'FEDERALBNK', 'IDFCFIRSTB', 'PNB', 'BANKBARODA'],
    it: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'LTIM', 'COFORGE', 'MPHASIS', 'PERSISTENT'],
    pharma: ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'DIVISLAB', 'BIOCON', 'LUPIN', 'TORNTPHARM', 'AUROPHARMA'],
    auto: ['MARUTI', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'TVSMOTOR', 'TATAMOTORS'],
    fmcg: ['HINDUNILVR', 'ITC', 'BRITANNIA', 'NESTLEIND', 'DABUR', 'MARICO', 'GODREJCP', 'COLPAL'],
    energy: ['NTPC', 'POWERGRID', 'ONGC', 'BPCL', 'IOC', 'GAIL', 'RELIANCE'],
    metals: ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'COALINDIA', 'NMDC', 'JINDALSTEL'],
  };

  const sectorSymbols = sectorMapping[sector.toLowerCase()];
  return sectorSymbols ? sectorSymbols.includes(symbol) : false;
};

module.exports = {
  normalizeStockSymbol,
  isValidSymbol,
  getSuggestions,
  getAllSymbols,
  isInSector,
  STOCK_NAME_TO_SYMBOL,
  HINDI_STOCK_NAMES
};
