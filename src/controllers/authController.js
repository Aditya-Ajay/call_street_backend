/**
 * Authentication Controller
 *
 * Handles all authentication-related HTTP requests
 * All 9 authentication endpoints with comprehensive error handling
 */

const otpService = require('../services/otpService');
const authService = require('../services/authService');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { AppError } = require('../middleware/errorHandler');
const { maskPhone, maskEmail } = require('../utils/helpers');
const config = require('../config/env');

/**
 * 1. POST /api/auth/signup/phone
 * Send OTP to phone number for signup
 */
const signupWithPhone = asyncHandler(async (req, res) => {
  const { phone, user_type } = req.body;

  // Check if phone already registered
  const existingUser = await User.findUserByPhone(phone);
  if (existingUser) {
    throw new AppError('Phone number already registered. Please login instead', 409);
  }

  // Send OTP
  const result = await otpService.sendPhoneOTP(phone, 'signup');

  return res.status(200).json({
    success: true,
    message: `OTP sent to ${maskPhone(phone)}`,
    data: {
      phone: maskPhone(phone),
      expiresIn: result.expiresIn,
      purpose: 'signup'
    }
  });
});

/**
 * 2. POST /api/auth/signup/email
 * Send OTP to email address for signup
 */
const signupWithEmail = asyncHandler(async (req, res) => {
  const { email, user_type } = req.body;

  // Check if email already registered
  const existingUser = await User.findUserByEmail(email);
  if (existingUser) {
    throw new AppError('Email already registered. Please login instead', 409);
  }

  // Send OTP
  const result = await otpService.sendEmailOTP(email, 'signup');

  return res.status(200).json({
    success: true,
    message: `OTP sent to ${maskEmail(email)}`,
    data: {
      email: maskEmail(email),
      expiresIn: result.expiresIn,
      purpose: 'signup'
    }
  });
});

/**
 * 3. POST /api/auth/verify-otp
 * Verify OTP and create user account or login
 */
const verifyOTP = asyncHandler(async (req, res) => {
  const { phone, email, otp, user_type = 'trader' } = req.body;

  console.log('🔐 [verifyOTP] Request body:', { phone, email, user_type });

  let user;
  let isNewUser = false;

  // Verify phone OTP
  if (phone) {
    // Verify OTP
    await otpService.verifyPhoneOTP(phone, otp);

    // Check if user exists
    user = await User.findUserByPhone(phone);

    if (!user) {
      console.log('✨ [verifyOTP] Creating NEW user with user_type:', user_type);
      // Create new user
      user = await authService.registerWithPhone({ phone, user_type });
      isNewUser = true;
    } else {
      console.log('👤 [verifyOTP] Existing user found:', { id: user.id, user_type: user.user_type });
    }
  }
  // Verify email OTP
  else if (email) {
    // Verify OTP
    await otpService.verifyEmailOTP(email, otp);

    // Check if user exists
    user = await User.findUserByEmail(email);

    if (!user) {
      console.log('✨ [verifyOTP] Creating NEW user with user_type:', user_type);
      // Create new user
      user = await authService.registerWithEmail({ email, user_type });
      isNewUser = true;
    } else {
      console.log('👤 [verifyOTP] Existing user found:', { id: user.id, user_type: user.user_type });
    }
  }
  else {
    throw new AppError('Phone or email is required', 400);
  }

  // Generate tokens
  const tokens = authService.generateTokens(user);

  // Create session
  await authService.createSession({
    userId: user.id,
    refreshJti: tokens.refreshJti,
    tokenFamily: tokens.tokenFamily,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Update login metadata
  await User.updateLoginMetadata(user.id, req.ip);

  // Log audit event
  await authService.logAuditEvent(
    isNewUser ? 'signup_success' : 'login_success',
    user.id,
    req.ip,
    { userAgent: req.headers['user-agent'] }
  );

  // Set tokens in httpOnly cookies
  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  // Remove sensitive data
  delete user.password_hash;

  // Build response user object
  const responseUser = {
    id: user.id,
    email: user.email,
    phone: user.phone ? maskPhone(user.phone) : null,
    user_type: user.user_type,
    email_verified: user.email_verified,
    phone_verified: user.phone_verified,
    created_at: user.created_at
  };

  // For new analysts, include profile_completed status
  if (user.user_type === 'analyst') {
    responseUser.profile_completed = user.profile_completed || false;
  }

  return res.status(isNewUser ? 201 : 200).json({
    success: true,
    message: isNewUser ? 'Account created successfully' : 'Login successful',
    data: {
      user: responseUser,
      isNewUser,
      // Send tokens in response for clients that can't use cookies (due to third-party cookie blocking)
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: '7d'
      }
    }
  });
});

/**
 * 4. POST /api/auth/request-otp
 * Request OTP to phone or email (unified endpoint for signup/login)
 */
const requestOTP = asyncHandler(async (req, res) => {
  const { phone, email, user_type, sebi_number } = req.body;

  // If analyst signup, verify SEBI number first
  if (user_type === 'analyst' && sebi_number) {
    console.log(`[Request OTP] Analyst signup - verifying SEBI: ${sebi_number}`);

    const sebiVerificationService = require('../services/sebiVerificationService');

    try {
      const verificationResult = await sebiVerificationService.verifySEBIRegistration(sebi_number);

      if (!verificationResult.isValid) {
        console.error(`[Request OTP] SEBI verification failed: ${verificationResult.reason}`);
        throw new AppError(
          `SEBI verification failed: ${verificationResult.reason}. Please ensure your SEBI registration number is correct and currently active.`,
          400
        );
      }

      console.log(`[Request OTP] ✅ SEBI verified: ${verificationResult.registrationType}`);
    } catch (sebiError) {
      // If it's already an AppError (from verification service), re-throw it
      if (sebiError instanceof AppError) {
        throw sebiError;
      }

      // For network/timeout errors, provide helpful message
      console.error('[Request OTP] SEBI verification error:', sebiError.message);
      throw new AppError(
        'Unable to verify SEBI registration at this time. Please try again later.',
        503
      );
    }
  }

  let result;

  if (phone) {
    result = await otpService.sendPhoneOTP(phone, 'signup_or_login');
  } else if (email) {
    result = await otpService.sendEmailOTP(email, 'signup_or_login');
  } else {
    throw new AppError('Phone or email is required', 400);
  }

  return res.status(200).json({
    success: true,
    message: 'OTP sent successfully',
    data: {
      phone: phone ? maskPhone(phone) : undefined,
      email: email ? maskEmail(email) : undefined,
      expiresIn: result.expiresIn
    }
  });
});

/**
 * 5. POST /api/auth/resend-otp
 * Resend OTP to phone or email
 */
const resendOTP = asyncHandler(async (req, res) => {
  const { phone, email, user_type, sebi_number } = req.body;

  // If analyst signup, verify SEBI number first
  if (user_type === 'analyst' && sebi_number) {
    console.log(`[Resend OTP] Analyst signup - verifying SEBI: ${sebi_number}`);

    const sebiVerificationService = require('../services/sebiVerificationService');

    try {
      const verificationResult = await sebiVerificationService.verifySEBIRegistration(sebi_number);

      if (!verificationResult.isValid) {
        console.error(`[Resend OTP] SEBI verification failed: ${verificationResult.reason}`);
        throw new AppError(
          `SEBI verification failed: ${verificationResult.reason}. Please ensure your SEBI registration number is correct and currently active.`,
          400
        );
      }

      console.log(`[Resend OTP] ✅ SEBI verified: ${verificationResult.registrationType}`);
    } catch (sebiError) {
      // If it's already an AppError (from verification service), re-throw it
      if (sebiError instanceof AppError) {
        throw sebiError;
      }

      // For network/timeout errors, provide helpful message
      console.error('[Resend OTP] SEBI verification error:', sebiError.message);
      throw new AppError(
        'Unable to verify SEBI registration at this time. Please try again later.',
        503
      );
    }
  }

  let result;

  if (phone) {
    result = await otpService.sendPhoneOTP(phone, 'signup_or_login');
  } else if (email) {
    result = await otpService.sendEmailOTP(email, 'signup_or_login');
  } else {
    throw new AppError('Phone or email is required', 400);
  }

  return res.status(200).json({
    success: true,
    message: 'OTP resent successfully',
    data: {
      phone: phone ? maskPhone(phone) : undefined,
      email: email ? maskEmail(email) : undefined,
      expiresIn: result.expiresIn
    }
  });
});

/**
 * 6. POST /api/auth/login
 * Login with email and password
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Login with password
  const { user, tokens } = await authService.loginWithPassword(
    { email, password },
    { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
  );

  // Set tokens in httpOnly cookies
  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  return res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone ? maskPhone(user.phone) : null,
        user_type: user.user_type,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified
      }
    }
  });
});

/**
 * 7. POST /api/auth/refresh-token
 * Refresh access token using refresh token
 */
const refreshToken = asyncHandler(async (req, res) => {
  // Get refresh token from cookie
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    throw new AppError('Refresh token required', 401);
  }

  // Refresh access token
  const { accessToken } = await authService.refreshAccessToken(refreshToken);

  // Set new access token in cookie with consistent settings
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: true, // Always secure for production
    sameSite: config.isProduction ? 'none' : 'lax', // 'none' for cross-domain support
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });

  // Log for debugging
  console.log('[Refresh Token] New access token cookie set:', {
    secure: true,
    sameSite: config.isProduction ? 'none' : 'lax'
  });

  return res.status(200).json({
    success: true,
    message: 'Token refreshed successfully'
  });
});

/**
 * 8. POST /api/auth/logout
 * Logout user and revoke tokens
 * Requires authentication
 */
const logout = asyncHandler(async (req, res) => {
  const accessToken = req.cookies.accessToken;
  const refreshToken = req.cookies.refreshToken;
  const userId = req.user.id;

  if (!accessToken && !refreshToken) {
    throw new AppError('No active session found', 400);
  }

  // Revoke tokens and cleanup sessions
  await authService.logout(
    { accessToken, refreshToken },
    userId
  );

  // Get user to determine role for additional cleanup
  const user = await User.findUserById(userId);

  // Log logout event
  await authService.logAuditEvent(
    'logout',
    userId,
    req.ip,
    {
      userAgent: req.headers['user-agent'],
      userType: user?.user_type
    }
  );

  // Clear cookies with proper configuration
  const cookieOptions = {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/'
  };

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', {
    ...cookieOptions,
    path: '/api/auth/refresh-token'
  });

  console.log(`[Logout] User ${userId} (${user?.user_type || 'unknown'}) logged out successfully`);

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully. Your session has been cleared.'
  });
});

/**
 * 9. GET /api/auth/me
 * Get current user information
 * Requires authentication
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  // User is already attached to req by verifyToken middleware
  const user = await User.findUserById(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Remove sensitive data
  delete user.password_hash;
  delete user.failed_login_attempts;
  delete user.locked_until;
  delete user.reset_token_hash;
  delete user.reset_token_expires_at;

  // Build response user object
  const responseUser = {
    id: user.id,
    email: user.email,
    phone: user.phone ? maskPhone(user.phone) : null,
    user_type: user.user_type,
    email_verified: user.email_verified,
    phone_verified: user.phone_verified,
    is_active: user.is_active,
    created_at: user.created_at,
    last_login_at: user.last_login_at
  };

  // For analysts, include profile_completed status
  if (user.user_type === 'analyst') {
    responseUser.profile_completed = user.profile_completed || false;
  }

  return res.status(200).json({
    success: true,
    data: {
      user: responseUser
    }
  });
});

/**
 * 10. POST /api/auth/forgot-password
 * Request password reset email
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Request password reset
  const result = await authService.requestPasswordReset(email);

  return res.status(200).json({
    success: true,
    message: result.message
  });
});

/**
 * 11. POST /api/auth/reset-password
 * Reset password with token
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, new_password } = req.body;

  // Reset password
  const result = await authService.resetPassword(token, new_password);

  return res.status(200).json({
    success: true,
    message: result.message
  });
});

/**
 * Helper: Set JWT tokens in httpOnly cookies
 * @param {Object} res - Express response object
 * @param {string} accessToken - Access token
 * @param {string} refreshToken - Refresh token
 */
const setTokenCookies = (res, accessToken, refreshToken) => {
  // Cookie configuration
  const cookieOptions = {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: true, // Always use secure in production (HTTPS required for cross-domain)
    sameSite: config.isProduction ? 'none' : 'lax', // 'none' allows cross-site in production (required for cross-domain cookies)
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };

  // Access token cookie
  res.cookie('accessToken', accessToken, cookieOptions);

  // Refresh token cookie (30 days, restricted path)
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/auth/refresh-token' // Only sent to refresh-token endpoint
  });

  // Log cookie settings
  console.log('[Auth] Cookies set with options:', {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge
  });

  // Log Set-Cookie header for debugging
  console.log('[Auth] Set-Cookie headers:', res.getHeaders()['set-cookie']);

  // Log all response headers for debugging
  console.log('[Auth] All response headers:', {
    'access-control-allow-origin': res.getHeader('access-control-allow-origin'),
    'access-control-allow-credentials': res.getHeader('access-control-allow-credentials'),
    'set-cookie': res.getHeader('set-cookie')
  });
};

module.exports = {
  signupWithPhone,
  signupWithEmail,
  verifyOTP,
  requestOTP,
  resendOTP,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  forgotPassword,
  resetPassword
};
