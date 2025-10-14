/**
 * Request Validation Middleware
 *
 * Uses express-validator to validate request inputs
 * Prevents invalid data from reaching controllers
 */

const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

/**
 * Validation result handler
 * Checks for validation errors and returns formatted response
 *
 * Usage: Place after validation rules
 * router.post('/signup', [validationRules, validate], handler);
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path,
      message: err.msg
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }

  next();
};

/**
 * Common validation rules
 */

// Email validation
const validateEmail = () =>
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail();

// Phone validation (Indian format)
const validatePhone = () =>
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[6-9]\d{9}$/).withMessage('Invalid phone number format (must be 10 digits starting with 6-9)');

// Password validation
const validatePassword = () =>
  body('password')
    .trim()
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character');

// Name validation
const validateName = (fieldName = 'name') =>
  body(fieldName)
    .trim()
    .notEmpty().withMessage(`${fieldName} is required`)
    .isLength({ min: 2, max: 100 }).withMessage(`${fieldName} must be between 2 and 100 characters`)
    .matches(/^[a-zA-Z\s]+$/).withMessage(`${fieldName} can only contain letters and spaces`);

// URL validation
const validateUrl = (fieldName) =>
  body(fieldName)
    .optional()
    .trim()
    .isURL().withMessage(`${fieldName} must be a valid URL`);

// ID parameter validation (integer)
const validateId = (paramName = 'id') =>
  param(paramName)
    .notEmpty().withMessage(`${paramName} is required`)
    .isInt({ min: 1 }).withMessage(`${paramName} must be a positive integer`)
    .toInt();

// UUID parameter validation
const validateUUID = (paramName = 'id') =>
  param(paramName)
    .notEmpty().withMessage(`${paramName} is required`)
    .isUUID(4).withMessage(`${paramName} must be a valid UUID`);

// Pagination validation
const validatePagination = () => [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt()
];

/**
 * Authentication validation rules
 */

const signupValidation = [
  validateEmail(),
  validatePhone(),
  validatePassword(),
  validateName('full_name'),
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['analyst', 'trader']).withMessage('Role must be analyst or trader'),
  validate
];

const loginValidation = [
  body('identifier')
    .trim()
    .notEmpty().withMessage('Email or phone is required'),
  validatePassword(),
  validate
];

const otpValidation = [
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[6-9]\d{9}$/).withMessage('Invalid phone number format'),
  body('otp')
    .optional()
    .trim()
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only numbers'),
  validate
];

/**
 * Analyst profile validation
 */

const analystProfileValidation = [
  validateName('display_name'),
  body('bio')
    .trim()
    .notEmpty().withMessage('Bio is required')
    .isLength({ min: 50, max: 1000 }).withMessage('Bio must be between 50 and 1000 characters'),
  body('experience_years')
    .notEmpty().withMessage('Experience is required')
    .isInt({ min: 0, max: 50 }).withMessage('Experience must be between 0 and 50 years')
    .toInt(),
  body('specialization')
    .notEmpty().withMessage('Specialization is required')
    .isIn(['equity', 'forex', 'crypto', 'commodity', 'derivatives', 'technical', 'fundamental'])
    .withMessage('Invalid specialization'),
  body('sebi_registration_number')
    .trim()
    .notEmpty().withMessage('SEBI registration number is required')
    .isLength({ min: 10, max: 20 }).withMessage('Invalid SEBI registration number'),
  validate
];

/**
 * Subscription validation
 */

const subscriptionValidation = [
  body('tier')
    .notEmpty().withMessage('Subscription tier is required')
    .isIn(['basic', 'premium', 'pro']).withMessage('Invalid subscription tier'),
  body('price')
    .notEmpty().withMessage('Price is required')
    .isFloat({ min: 0 }).withMessage('Price must be a positive number')
    .toFloat(),
  validate
];

/**
 * Post validation
 */

const postValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Title must be less than 200 characters'),
  body('content')
    .trim()
    .notEmpty().withMessage('Content is required')
    .isLength({ min: 10, max: 5000 }).withMessage('Content must be between 10 and 5000 characters'),
  body('post_type')
    .notEmpty().withMessage('Post type is required')
    .isIn(['market_analysis', 'trade_idea', 'educational', 'news', 'daily_update'])
    .withMessage('Invalid post type'),
  body('tier_access')
    .notEmpty().withMessage('Tier access is required')
    .isIn(['basic', 'premium', 'pro']).withMessage('Invalid tier access'),
  validate
];

/**
 * Review validation
 */

const reviewValidation = [
  validateId('analystId'),
  body('rating')
    .notEmpty().withMessage('Rating is required')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
    .toInt(),
  body('comment')
    .trim()
    .notEmpty().withMessage('Comment is required')
    .isLength({ min: 10, max: 500 }).withMessage('Comment must be between 10 and 500 characters'),
  validate
];

/**
 * Chat message validation
 */

const chatMessageValidation = [
  body('message')
    .trim()
    .notEmpty().withMessage('Message is required')
    .isLength({ max: 1000 }).withMessage('Message must be less than 1000 characters'),
  body('recipientId')
    .notEmpty().withMessage('Recipient is required')
    .isInt({ min: 1 }).withMessage('Invalid recipient ID')
    .toInt(),
  validate
];

/**
 * Search validation
 */

const searchValidation = [
  query('query')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Search query must be between 2 and 100 characters'),
  query('specialization')
    .optional()
    .isIn(['equity', 'forex', 'crypto', 'commodity', 'derivatives', 'technical', 'fundamental'])
    .withMessage('Invalid specialization filter'),
  query('min_experience')
    .optional()
    .isInt({ min: 0 }).withMessage('Minimum experience must be a positive integer')
    .toInt(),
  ...validatePagination(),
  validate
];

/**
 * Payment validation
 */

const paymentValidation = [
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 1 }).withMessage('Amount must be at least 1')
    .toFloat(),
  body('currency')
    .optional()
    .isIn(['INR', 'USD']).withMessage('Currency must be INR or USD'),
  validate
];

module.exports = {
  validate,
  validateEmail,
  validatePhone,
  validatePassword,
  validateName,
  validateUrl,
  validateId,
  validateUUID,
  validatePagination,
  signupValidation,
  loginValidation,
  otpValidation,
  analystProfileValidation,
  subscriptionValidation,
  postValidation,
  reviewValidation,
  chatMessageValidation,
  searchValidation,
  paymentValidation
};
