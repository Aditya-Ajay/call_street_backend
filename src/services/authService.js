/**
 * Authentication Service
 *
 * Core authentication business logic
 * Handles user registration, login, token management, password reset
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');
const { pool } = require('../config/database');
const User = require('../models/User');
const { hashPassword, comparePassword, generateResetToken, hashResetToken, maskPhone, maskEmail } = require('../utils/helpers');
const { validatePasswordStrength } = require('../utils/validators');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('./emailService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Generate JWT access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} - { accessToken, refreshToken, accessJti, refreshJti }
 */
const generateTokens = (user) => {
  // Access token payload
  const accessPayload = {
    user_id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.user_type,
    jti: crypto.randomUUID() // JWT ID for blacklisting
  };

  // Refresh token payload (minimal)
  const refreshPayload = {
    user_id: user.id,
    token_family: crypto.randomUUID(), // For rotation detection
    jti: crypto.randomUUID()
  };

  // Sign access token (7 days)
  const accessToken = jwt.sign(
    accessPayload,
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
      algorithm: 'HS256',
      issuer: 'analyst-marketplace',
      audience: 'analyst-marketplace-users'
    }
  );

  // Sign refresh token (30 days)
  const refreshToken = jwt.sign(
    refreshPayload,
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshExpiresIn,
      algorithm: 'HS256',
      issuer: 'analyst-marketplace',
      audience: 'analyst-marketplace-users'
    }
  );

  return {
    accessToken,
    refreshToken,
    accessJti: accessPayload.jti,
    refreshJti: refreshPayload.jti,
    tokenFamily: refreshPayload.token_family
  };
};

/**
 * Create user session in database
 * @param {Object} sessionData - Session data
 * @returns {Promise<Object>} - Session record
 */
const createSession = async (sessionData) => {
  const { userId, refreshJti, tokenFamily, ipAddress, userAgent } = sessionData;

  try {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const result = await pool.query(
      `INSERT INTO user_sessions (
        user_id,
        refresh_token_jti,
        token_family,
        ip_address,
        user_agent,
        expires_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id, created_at`,
      [userId, refreshJti, tokenFamily, ipAddress, userAgent, expiresAt]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Create session error:', error.message);
    throw error;
  }
};

/**
 * Register new user with phone OTP
 * @param {Object} userData - { phone, user_type }
 * @returns {Promise<Object>} - Created user (without password_hash)
 */
const registerWithPhone = async (userData) => {
  const { phone, user_type = 'trader' } = userData;

  try {
    // Check if user already exists
    const existingUser = await User.findUserByPhone(phone);
    if (existingUser) {
      throw new AppError('Phone number already registered', 409);
    }

    // Create user with random password (OTP-based auth, no password needed)
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(randomPassword);

    const newUser = await User.createUser({
      phone,
      password_hash: passwordHash,
      user_type
    });

    // Don't return password hash
    delete newUser.password_hash;

    return newUser;
  } catch (error) {
    throw error;
  }
};

/**
 * Register new user with email OTP
 * @param {Object} userData - { email, user_type }
 * @returns {Promise<Object>} - Created user (without password_hash)
 */
const registerWithEmail = async (userData) => {
  const { email, user_type = 'trader' } = userData;

  try {
    // Check if user already exists
    const existingUser = await User.findUserByEmail(email);
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    // Create user with random password (OTP-based auth, no password needed)
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(randomPassword);

    const newUser = await User.createUser({
      email,
      password_hash: passwordHash,
      user_type
    });

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, email.split('@')[0]).catch(err => {
      console.error('Welcome email failed:', err.message);
    });

    // Don't return password hash
    delete newUser.password_hash;

    return newUser;
  } catch (error) {
    throw error;
  }
};

/**
 * Login with email and password
 * @param {Object} credentials - { email, password }
 * @param {Object} metadata - { ipAddress, userAgent }
 * @returns {Promise<Object>} - { user, tokens }
 */
const loginWithPassword = async (credentials, metadata) => {
  const { email, password } = credentials;
  const { ipAddress, userAgent } = metadata;

  try {
    // Find user by email
    const user = await User.findUserByEmail(email);

    if (!user) {
      // Generic error to prevent email enumeration
      throw new AppError('Invalid email or password', 401);
    }

    // Check if account is locked
    const lockCheck = User.checkAccountLock(user);
    if (lockCheck.isLocked) {
      throw new AppError(
        `Account locked due to too many failed attempts. Try again in ${lockCheck.remainingSeconds} seconds`,
        403
      );
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed attempts
      const newAttempts = await User.incrementFailedLoginAttempts(user.id);

      // Lock account if 5 failed attempts
      if (newAttempts >= 5) {
        await User.lockUserAccount(user.id, 15); // 15 minutes
        throw new AppError(
          'Too many failed login attempts. Account locked for 15 minutes',
          403
        );
      }

      const attemptsLeft = 5 - newAttempts;
      throw new AppError(
        `Invalid email or password. ${attemptsLeft} attempt(s) remaining`,
        401
      );
    }

    // Check if user is active
    if (!user.is_active) {
      throw new AppError('Account is suspended. Please contact support', 403);
    }

    // Reset failed login attempts
    await User.resetFailedLoginAttempts(user.id);

    // Update login metadata
    await User.updateLoginMetadata(user.id, ipAddress);

    // Generate tokens
    const tokens = generateTokens(user);

    // Create session
    await createSession({
      userId: user.id,
      refreshJti: tokens.refreshJti,
      tokenFamily: tokens.tokenFamily,
      ipAddress,
      userAgent
    });

    // Log successful login (audit)
    await logAuditEvent('login_success', user.id, ipAddress, { userAgent });

    // Remove sensitive data
    delete user.password_hash;
    delete user.failed_login_attempts;
    delete user.locked_until;
    delete user.reset_token_hash;
    delete user.reset_token_expires_at;

    return {
      user,
      tokens
    };
  } catch (error) {
    // Log failed login attempt
    if (error.statusCode === 401 || error.statusCode === 403) {
      await logAuditEvent('login_failed', null, ipAddress, {
        email: maskEmail(email),
        reason: error.message
      });
    }

    throw error;
  }
};

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} - { accessToken }
 */
const refreshAccessToken = async (refreshToken) => {
  try {
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, {
        algorithms: ['HS256'],
        issuer: 'analyst-marketplace',
        audience: 'analyst-marketplace-users'
      });
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        throw new AppError('Refresh token expired. Please login again', 401);
      }
      throw new AppError('Invalid refresh token', 401);
    }

    // Check if token is blacklisted
    const blacklistCheck = await pool.query(
      `SELECT 1 FROM token_blacklist WHERE jti = $1`,
      [decoded.jti]
    );

    if (blacklistCheck.rows.length > 0) {
      throw new AppError('Refresh token has been revoked', 401);
    }

    // Get user
    const user = await User.findUserById(decoded.user_id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.is_active) {
      throw new AppError('Account suspended', 403);
    }

    // Generate new access token ONLY (refresh token stays the same)
    const newAccessPayload = {
      user_id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.user_type,
      jti: crypto.randomUUID()
    };

    const newAccessToken = jwt.sign(
      newAccessPayload,
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiresIn,
        algorithm: 'HS256',
        issuer: 'analyst-marketplace',
        audience: 'analyst-marketplace-users'
      }
    );

    return {
      accessToken: newAccessToken
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Logout user and revoke tokens
 * @param {Object} tokens - { accessToken, refreshToken }
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
const logout = async (tokens, userId) => {
  const { accessToken, refreshToken } = tokens;

  try {
    // Decode tokens to get JTI (don't verify, might be expired)
    const accessDecoded = jwt.decode(accessToken);
    const refreshDecoded = jwt.decode(refreshToken);

    // Add access token to blacklist
    if (accessDecoded && accessDecoded.jti) {
      await pool.query(
        `INSERT INTO token_blacklist (jti, user_id, token_type, expires_at, reason)
         VALUES ($1, $2, 'access', $3, 'logout')`,
        [
          accessDecoded.jti,
          userId,
          new Date(accessDecoded.exp * 1000)
        ]
      );
    }

    // Add refresh token to blacklist
    if (refreshDecoded && refreshDecoded.jti) {
      await pool.query(
        `INSERT INTO token_blacklist (jti, user_id, token_type, expires_at, reason)
         VALUES ($1, $2, 'refresh', $3, 'logout')`,
        [
          refreshDecoded.jti,
          userId,
          new Date(refreshDecoded.exp * 1000)
        ]
      );

      // Delete session
      await pool.query(
        `DELETE FROM user_sessions WHERE refresh_token_jti = $1`,
        [refreshDecoded.jti]
      );
    }

    // Log logout event
    await logAuditEvent('logout', userId, null, {});
  } catch (error) {
    console.error('Logout error:', error.message);
    throw new AppError('Logout failed', 500);
  }
};

/**
 * Request password reset
 * @param {string} email - User email
 * @returns {Promise<Object>} - Success message
 */
const requestPasswordReset = async (email) => {
  try {
    // Find user by email
    const user = await User.findUserByEmail(email);

    if (!user) {
      // Don't reveal if email exists (security)
      return {
        success: true,
        message: 'If an account exists with this email, you will receive password reset instructions'
      };
    }

    // Generate reset token
    const { token, tokenHash } = generateResetToken();

    // Store token hash in database (1 hour expiry)
    await User.storeResetToken(user.id, tokenHash, 60);

    // Send reset email
    await sendPasswordResetEmail(email, token);

    // Log password reset request
    await logAuditEvent('password_reset_requested', user.id, null, {
      email: maskEmail(email)
    });

    return {
      success: true,
      message: 'Password reset email sent successfully'
    };
  } catch (error) {
    console.error('Password reset request error:', error.message);
    throw new AppError('Failed to send password reset email', 500);
  }
};

/**
 * Reset password with token
 * @param {string} token - Reset token from email
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} - Success message
 */
const resetPassword = async (token, newPassword) => {
  try {
    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new AppError(
        `Password too weak: ${passwordValidation.feedback.join(', ')}`,
        400
      );
    }

    // Hash the token to find user
    const tokenHash = hashResetToken(token);

    // Find user by token hash
    const user = await User.findUserByResetToken(tokenHash);

    if (!user) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await User.updateUser(user.id, {
      password_hash: newPasswordHash,
      failed_login_attempts: 0,
      locked_until: null
    });

    // Clear reset token
    await User.clearResetToken(user.id);

    // Log password reset
    await logAuditEvent('password_reset_completed', user.id, null, {});

    return {
      success: true,
      message: 'Password reset successfully. You can now login with your new password'
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Log audit event
 * @param {string} eventType - Event type
 * @param {string} userId - User ID (null if not authenticated)
 * @param {string} ipAddress - IP address
 * @param {Object} details - Additional details
 */
const logAuditEvent = async (eventType, userId, ipAddress, details = {}) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (event_type, user_id, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        eventType,
        userId || null,
        ipAddress || null,
        details.userAgent || null,
        JSON.stringify(details)
      ]
    );
  } catch (error) {
    console.error('Audit log error:', error.message);
    // Don't throw - logging failure shouldn't break the flow
  }
};

module.exports = {
  generateTokens,
  createSession,
  registerWithPhone,
  registerWithEmail,
  loginWithPassword,
  refreshAccessToken,
  logout,
  requestPasswordReset,
  resetPassword,
  logAuditEvent
};
