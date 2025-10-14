/**
 * Authentication Routes
 *
 * Handles user signup, login, OTP verification, password reset, and token refresh
 * All 9 authentication endpoints with proper middleware
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');
const { body, validationResult } = require('express-validator');

// Import controller
const authController = require('../controllers/authController');

/**
 * Validation middleware helper
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * Phone validation
 */
const validatePhone = [
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\+91[6-9]\d{9}$/).withMessage('Invalid phone number. Use +91XXXXXXXXXX format')
];

/**
 * Email validation
 */
const validateEmail = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
];

/**
 * OTP validation
 */
const validateOTP = [
  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .matches(/^\d{6}$/).withMessage('OTP must be 6 digits')
];

/**
 * Password validation
 */
const validatePassword = [
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/[a-z]/).withMessage('Password must contain lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain uppercase letter')
    .matches(/\d/).withMessage('Password must contain number')
    .matches(/[@$!%*?&#^()_+=\-{}[\]:;"'<>,.?/\\|`~]/).withMessage('Password must contain special character')
];

/**
 * @route   POST /api/auth/signup/phone
 * @desc    Send OTP to phone number for signup
 * @access  Public
 */
router.post(
  '/signup/phone',
  otpLimiter,
  validatePhone,
  body('user_type').optional().isIn(['analyst', 'trader']).withMessage('Invalid user type'),
  handleValidationErrors,
  authController.signupWithPhone
);

/**
 * @route   POST /api/auth/signup/email
 * @desc    Send OTP to email address for signup
 * @access  Public
 */
router.post(
  '/signup/email',
  otpLimiter,
  validateEmail,
  body('user_type').optional().isIn(['analyst', 'trader']).withMessage('Invalid user type'),
  handleValidationErrors,
  authController.signupWithEmail
);

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP and create user account or login
 * @access  Public
 */
router.post(
  '/verify-otp',
  authLimiter,
  [
    body('phone').optional().matches(/^\+91[6-9]\d{9}$/),
    body('email').optional().isEmail(),
    ...validateOTP,
    body('user_type').optional().isIn(['analyst', 'trader'])
  ],
  handleValidationErrors,
  authController.verifyOTP
);

/**
 * @route   POST /api/auth/request-otp
 * @desc    Request OTP to phone or email (unified endpoint)
 * @access  Public
 */
router.post(
  '/request-otp',
  otpLimiter,
  [
    body('phone').optional().matches(/^\+91[6-9]\d{9}$/),
    body('email').optional().isEmail()
  ],
  handleValidationErrors,
  authController.requestOTP
);

/**
 * @route   POST /api/auth/resend-otp
 * @desc    Resend OTP to phone or email
 * @access  Public
 */
router.post(
  '/resend-otp',
  otpLimiter,
  [
    body('phone').optional().matches(/^\+91[6-9]\d{9}$/),
    body('email').optional().isEmail()
  ],
  handleValidationErrors,
  authController.resendOTP
);

/**
 * @route   POST /api/auth/login
 * @desc    Login with email and password
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  [...validateEmail, ...validatePassword],
  handleValidationErrors,
  authController.login
);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token using refresh token
 * @access  Public (requires refresh token in cookie)
 */
router.post(
  '/refresh-token',
  authController.refreshToken
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (invalidate tokens)
 * @access  Private
 */
router.post(
  '/logout',
  verifyToken,
  authController.logout
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user information
 * @access  Private
 */
router.get(
  '/me',
  verifyToken,
  authController.getCurrentUser
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post(
  '/forgot-password',
  authLimiter,
  validateEmail,
  handleValidationErrors,
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using reset token
 * @access  Public
 */
router.post(
  '/reset-password',
  authLimiter,
  [
    body('token')
      .trim()
      .notEmpty().withMessage('Reset token is required')
      .isLength({ min: 64, max: 64 }).withMessage('Invalid reset token format'),
    body('new_password')
      .notEmpty().withMessage('New password is required')
      .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
      .matches(/[a-z]/).withMessage('Password must contain lowercase letter')
      .matches(/[A-Z]/).withMessage('Password must contain uppercase letter')
      .matches(/\d/).withMessage('Password must contain number')
      .matches(/[@$!%*?&#^()_+=\-{}[\]:;"'<>,.?/\\|`~]/).withMessage('Password must contain special character')
  ],
  handleValidationErrors,
  authController.resetPassword
);

module.exports = router;
