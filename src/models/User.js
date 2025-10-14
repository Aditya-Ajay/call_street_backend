/**
 * User Model
 *
 * Database operations for users table
 * Handles all user-related CRUD operations with proper security
 */

const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Create new user
 * @param {Object} userData - User data (email, phone, password_hash, user_type)
 * @returns {Promise<Object>} - Created user object
 */
const createUser = async (userData) => {
  const { email, phone, password_hash, user_type = 'trader' } = userData;

  try {
    const result = await pool.query(
      `INSERT INTO users (
        email,
        phone,
        password_hash,
        user_type,
        email_verified,
        phone_verified,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING
        id,
        email,
        phone,
        user_type,
        email_verified,
        phone_verified,
        is_active,
        created_at`,
      [
        email || null,
        phone || null,
        password_hash,
        user_type,
        email ? true : false, // Auto-verify if using OTP
        phone ? true : false, // Auto-verify if using OTP
        true
      ]
    );

    return result.rows[0];
  } catch (error) {
    // Handle duplicate email/phone
    if (error.code === '23505') {
      if (error.constraint === 'users_email_key') {
        throw new AppError('Email already registered', 409);
      }
      if (error.constraint === 'users_phone_key') {
        throw new AppError('Phone number already registered', 409);
      }
    }
    throw error;
  }
};

/**
 * Find user by ID
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} - User object or null
 */
const findUserById = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        email,
        phone,
        password_hash,
        user_type,
        email_verified,
        phone_verified,
        is_active,
        profile_completed,
        last_active,
        login_count,
        failed_login_attempts,
        locked_until,
        last_login_at,
        last_login_ip,
        reset_token_hash,
        reset_token_expires_at,
        created_at,
        updated_at
      FROM users
      WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} - User object or null
 */
const findUserByEmail = async (email) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        email,
        phone,
        password_hash,
        user_type,
        email_verified,
        phone_verified,
        is_active,
        profile_completed,
        failed_login_attempts,
        locked_until,
        created_at,
        updated_at
      FROM users
      WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );

    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Find user by phone
 * @param {string} phone - User phone number
 * @returns {Promise<Object|null>} - User object or null
 */
const findUserByPhone = async (phone) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        email,
        phone,
        password_hash,
        user_type,
        email_verified,
        phone_verified,
        is_active,
        profile_completed,
        failed_login_attempts,
        locked_until,
        created_at,
        updated_at
      FROM users
      WHERE phone = $1 AND deleted_at IS NULL`,
      [phone]
    );

    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Find user by email or phone
 * @param {Object} identifier - { email } or { phone }
 * @returns {Promise<Object|null>} - User object or null
 */
const findUserByIdentifier = async (identifier) => {
  if (identifier.email) {
    return findUserByEmail(identifier.email);
  }
  if (identifier.phone) {
    return findUserByPhone(identifier.phone);
  }
  return null;
};

/**
 * Update user fields
 * @param {string} userId - User UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated user object
 */
const updateUser = async (userId, updates) => {
  try {
    const allowedFields = [
      'email',
      'phone',
      'password_hash',
      'email_verified',
      'phone_verified',
      'is_active',
      'profile_completed',
      'last_active',
      'failed_login_attempts',
      'locked_until',
      'last_login_at',
      'last_login_ip',
      'reset_token_hash',
      'reset_token_expires_at'
    ];

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    // Add updated_at
    fields.push(`updated_at = NOW()`);

    values.push(userId); // Last parameter

    const result = await pool.query(
      `UPDATE users
       SET ${fields.join(', ')}
       WHERE id = $${paramCount} AND deleted_at IS NULL
       RETURNING
         id,
         email,
         phone,
         user_type,
         email_verified,
         phone_verified,
         is_active,
         profile_completed,
         updated_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Increment failed login attempts
 * @param {string} userId - User UUID
 * @returns {Promise<number>} - New attempt count
 */
const incrementFailedLoginAttempts = async (userId) => {
  try {
    const result = await pool.query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING failed_login_attempts`,
      [userId]
    );

    return result.rows[0].failed_login_attempts;
  } catch (error) {
    throw error;
  }
};

/**
 * Reset failed login attempts
 * @param {string} userId - User UUID
 * @returns {Promise<void>}
 */
const resetFailedLoginAttempts = async (userId) => {
  try {
    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

/**
 * Lock user account
 * @param {string} userId - User UUID
 * @param {number} lockDurationMinutes - Lock duration in minutes
 * @returns {Promise<Date>} - Lock expiry timestamp
 */
const lockUserAccount = async (userId, lockDurationMinutes = 15) => {
  try {
    const lockedUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000);

    await pool.query(
      `UPDATE users
       SET locked_until = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [lockedUntil, userId]
    );

    return lockedUntil;
  } catch (error) {
    throw error;
  }
};

/**
 * Check if user is locked
 * @param {Object} user - User object with locked_until field
 * @returns {Object} - { isLocked: boolean, remainingSeconds: number }
 */
const checkAccountLock = (user) => {
  if (!user.locked_until) {
    return { isLocked: false, remainingSeconds: 0 };
  }

  const now = new Date();
  const lockedUntil = new Date(user.locked_until);

  if (lockedUntil > now) {
    const remainingSeconds = Math.ceil((lockedUntil - now) / 1000);
    return { isLocked: true, remainingSeconds };
  }

  return { isLocked: false, remainingSeconds: 0 };
};

/**
 * Store password reset token
 * @param {string} userId - User UUID
 * @param {string} tokenHash - Hashed reset token
 * @param {number} expiryMinutes - Token expiry in minutes (default: 60)
 * @returns {Promise<Date>} - Token expiry timestamp
 */
const storeResetToken = async (userId, tokenHash, expiryMinutes = 60) => {
  try {
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await pool.query(
      `UPDATE users
       SET reset_token_hash = $1,
           reset_token_expires_at = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [tokenHash, expiresAt, userId]
    );

    return expiresAt;
  } catch (error) {
    throw error;
  }
};

/**
 * Find user by reset token
 * @param {string} tokenHash - Hashed reset token
 * @returns {Promise<Object|null>} - User object or null if token invalid/expired
 */
const findUserByResetToken = async (tokenHash) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        email,
        phone,
        user_type,
        reset_token_expires_at
      FROM users
      WHERE reset_token_hash = $1
        AND reset_token_expires_at > NOW()
        AND deleted_at IS NULL`,
      [tokenHash]
    );

    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Clear reset token after use
 * @param {string} userId - User UUID
 * @returns {Promise<void>}
 */
const clearResetToken = async (userId) => {
  try {
    await pool.query(
      `UPDATE users
       SET reset_token_hash = NULL,
           reset_token_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

/**
 * Update login metadata
 * @param {string} userId - User UUID
 * @param {string} ipAddress - Login IP address
 * @returns {Promise<void>}
 */
const updateLoginMetadata = async (userId, ipAddress) => {
  try {
    await pool.query(
      `UPDATE users
       SET last_login_at = NOW(),
           last_login_ip = $1,
           last_active = NOW(),
           login_count = login_count + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [ipAddress, userId]
    );
  } catch (error) {
    throw error;
  }
};

/**
 * Soft delete user
 * @param {string} userId - User UUID
 * @returns {Promise<void>}
 */
const deleteUser = async (userId) => {
  try {
    await pool.query(
      `UPDATE users
       SET deleted_at = NOW(),
           is_active = false,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createUser,
  findUserById,
  findUserByEmail,
  findUserByPhone,
  findUserByIdentifier,
  updateUser,
  incrementFailedLoginAttempts,
  resetFailedLoginAttempts,
  lockUserAccount,
  checkAccountLock,
  storeResetToken,
  findUserByResetToken,
  clearResetToken,
  updateLoginMetadata,
  deleteUser
};
