/**
 * Helper Utility Functions
 *
 * Reusable helper functions for common operations
 */

const bcrypt = require('bcryptjs');
const config = require('../config/env');
const { PAGINATION } = require('./constants');

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
const hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(config.security.bcryptRounds);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
  } catch (error) {
    throw new Error(`Password hashing failed: ${error.message}`);
  }
};

/**
 * Compare password with hashed password
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password from database
 * @returns {Promise<boolean>} - True if passwords match
 */
const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    throw new Error(`Password comparison failed: ${error.message}`);
  }
};

/**
 * Generate cryptographically secure random OTP
 * @param {number} length - Length of OTP (default: 6)
 * @returns {string} - Random numeric OTP
 */
const generateOTP = (length = 6) => {
  const crypto = require('crypto');

  // For 6 digits: generate number between 100000 and 999999
  if (length === 6) {
    return crypto.randomInt(100000, 999999).toString();
  }

  // For other lengths, generate random digits
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += crypto.randomInt(0, 10).toString();
  }

  return otp;
};

/**
 * Generate random string (for tokens, IDs, etc.)
 * @param {number} length - Length of string (default: 32)
 * @returns {string} - Random alphanumeric string
 */
const generateRandomString = (length = 32) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
};

/**
 * Format phone number to standard format
 * @param {string} phone - Phone number
 * @returns {string} - Formatted phone number
 */
const formatPhoneNumber = (phone) => {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');

  // If it starts with country code, keep it
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return cleaned;
  }

  // Add country code if not present
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }

  return cleaned;
};

/**
 * Sanitize user input (remove HTML tags, scripts)
 * @param {string} input - User input string
 * @returns {string} - Sanitized string
 */
const sanitizeInput = (input) => {
  if (!input) return '';

  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
};

/**
 * Pagination helper
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} - Offset and limit for SQL query
 */
const getPagination = (page, limit) => {
  const parsedPage = parseInt(page, 10) || PAGINATION.DEFAULT_PAGE;
  const parsedLimit = Math.min(
    parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT,
    PAGINATION.MAX_LIMIT
  );

  const offset = (parsedPage - 1) * parsedLimit;

  return {
    offset,
    limit: parsedLimit,
    page: parsedPage
  };
};

/**
 * Calculate total pages
 * @param {number} totalItems - Total number of items
 * @param {number} limit - Items per page
 * @returns {number} - Total pages
 */
const getTotalPages = (totalItems, limit) => {
  return Math.ceil(totalItems / limit);
};

/**
 * Format pagination response
 * @param {Array} data - Array of items
 * @param {number} totalItems - Total number of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} - Formatted pagination response
 */
const formatPaginationResponse = (data, totalItems, page, limit) => {
  const totalPages = getTotalPages(totalItems, limit);

  return {
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Format success response
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 * @returns {Object} - Formatted response
 */
const successResponse = (data = null, message = 'Success', statusCode = 200) => {
  return {
    success: true,
    message,
    statusCode,
    ...(data && { data })
  };
};

/**
 * Format error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} errors - Additional error details
 * @returns {Object} - Formatted error response
 */
const errorResponse = (message = 'Error', statusCode = 500, errors = null) => {
  return {
    success: false,
    message,
    statusCode,
    ...(errors && { errors })
  };
};

/**
 * Sleep function (for testing, delays, etc.)
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Resolves after delay
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Convert string to slug (URL-friendly)
 * @param {string} str - String to convert
 * @returns {string} - Slug
 */
const slugify = (str) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Calculate percentage
 * @param {number} value - Current value
 * @param {number} total - Total value
 * @returns {number} - Percentage
 */
const calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * 100) / 100; // Round to 2 decimals
};

/**
 * Check if date is expired
 * @param {Date|string} date - Date to check
 * @returns {boolean} - True if expired
 */
const isExpired = (date) => {
  return new Date(date) < new Date();
};

/**
 * Add days to date
 * @param {Date|string} date - Starting date
 * @param {number} days - Number of days to add
 * @returns {Date} - New date
 */
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Format date to readable string
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted date string
 */
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Format time to readable string
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted time string
 */
const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Check if email is valid
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Check if phone is valid (Indian format)
 * @param {string} phone - Phone to validate
 * @returns {boolean} - True if valid
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone);
};

/**
 * Truncate string to max length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated string
 */
const truncate = (str, maxLength = 100) => {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength)}...`;
};

/**
 * Remove undefined/null values from object
 * @param {Object} obj - Object to clean
 * @returns {Object} - Cleaned object
 */
const cleanObject = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value != null)
  );
};

/**
 * Generate unique invite code
 * @param {string} prefix - Code prefix
 * @returns {string} - Unique code
 */
const generateInviteCode = (prefix = 'INV') => {
  const timestamp = Date.now().toString(36);
  const random = generateRandomString(6);
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
};

/**
 * Mask phone number for display (security)
 * @param {string} phone - Full phone number
 * @returns {string} - Masked phone
 */
const maskPhone = (phone) => {
  if (!phone || phone.length < 7) return '******';
  // +919876543210 -> +91******3210
  return phone.substring(0, 3) + '******' + phone.substring(phone.length - 4);
};

/**
 * Mask email for display (security)
 * @param {string} email - Full email address
 * @returns {string} - Masked email
 */
const maskEmail = (email) => {
  if (!email || !email.includes('@')) return '***@***';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return '***@' + domain;
  // aditya@example.com -> a****a@example.com
  return localPart[0] + '****' + localPart[localPart.length - 1] + '@' + domain;
};

/**
 * Generate secure password reset token
 * @returns {Object} - Token and hash
 */
const generateResetToken = () => {
  const crypto = require('crypto');

  // Generate 32 random bytes = 64 hex characters
  const token = crypto.randomBytes(32).toString('hex');

  // Hash token with SHA256 before storing in database
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  return {
    token, // Send this to user via email
    tokenHash // Store this in database
  };
};

/**
 * Hash reset token for verification
 * @param {string} token - Reset token from URL
 * @returns {string} - Hashed token
 */
const hashResetToken = (token) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = {
  hashPassword,
  comparePassword,
  generateOTP,
  generateRandomString,
  formatPhoneNumber,
  sanitizeInput,
  getPagination,
  getTotalPages,
  formatPaginationResponse,
  successResponse,
  errorResponse,
  sleep,
  slugify,
  calculatePercentage,
  isExpired,
  addDays,
  formatDate,
  formatTime,
  isValidEmail,
  isValidPhone,
  truncate,
  cleanObject,
  generateInviteCode,
  maskPhone,
  maskEmail,
  generateResetToken,
  hashResetToken
};
