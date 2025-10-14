/**
 * OTP Verification Model
 *
 * Database operations for otp_verifications table
 * Handles OTP storage, verification, and security measures
 */

const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const { AppError } = require('../middleware/errorHandler');

/**
 * Store OTP hash in database (upsert)
 * @param {Object} otpData - OTP data
 * @param {string} otpData.identifier - Phone or email
 * @param {string} otpData.identifierType - 'phone' or 'email'
 * @param {string} otpData.otp - Plain text OTP (will be hashed)
 * @param {string} otpData.purpose - 'signup', 'login', 'reset_password', etc.
 * @param {number} otpData.expiryMinutes - OTP validity in minutes (default: 6)
 * @returns {Promise<Object>} - Result with expires_at
 */
const storeOTP = async (otpData) => {
  const {
    identifier,
    identifierType,
    otp,
    purpose = 'signup_or_login',
    expiryMinutes = 6
  } = otpData;

  try {
    // Hash OTP with bcrypt (cost 10 is sufficient for temporary OTPs)
    const otpHash = await bcrypt.hash(otp, 10);

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const column = identifierType === 'phone' ? 'phone' : 'email';

    // Upsert: Insert or update if exists
    const result = await pool.query(
      `INSERT INTO otp_verifications (
        ${column},
        otp_hash,
        purpose,
        expires_at,
        attempts,
        locked_until,
        created_at
      ) VALUES ($1, $2, $3, $4, 0, NULL, NOW())
      ON CONFLICT (${column})
      DO UPDATE SET
        otp_hash = $2,
        purpose = $3,
        expires_at = $4,
        attempts = 0,
        locked_until = NULL,
        created_at = NOW()
      RETURNING id, expires_at`,
      [identifier, otpHash, purpose, expiresAt]
    );

    return {
      success: true,
      expiresAt,
      expiresIn: expiryMinutes * 60, // seconds
      otpId: result.rows[0].id
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Verify OTP with attempts tracking and lockout
 * @param {Object} verifyData - Verification data
 * @param {string} verifyData.identifier - Phone or email
 * @param {string} verifyData.identifierType - 'phone' or 'email'
 * @param {string} verifyData.inputOTP - OTP entered by user
 * @returns {Promise<Object>} - Verification result
 */
const verifyOTP = async (verifyData) => {
  const { identifier, identifierType, inputOTP } = verifyData;
  const column = identifierType === 'phone' ? 'phone' : 'email';

  try {
    // Get OTP record
    const result = await pool.query(
      `SELECT
        id,
        otp_hash,
        expires_at,
        attempts,
        locked_until,
        verified
      FROM otp_verifications
      WHERE ${column} = $1`,
      [identifier]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'OTP not found or expired. Please request a new one',
        code: 'OTP_NOT_FOUND'
      };
    }

    const record = result.rows[0];

    // Check if already verified (prevent re-verification)
    if (record.verified) {
      return {
        success: false,
        error: 'OTP already verified. Please request a new one',
        code: 'OTP_ALREADY_VERIFIED'
      };
    }

    // Check if locked
    if (record.locked_until && new Date(record.locked_until) > new Date()) {
      const remainingSeconds = Math.ceil(
        (new Date(record.locked_until) - new Date()) / 1000
      );
      return {
        success: false,
        error: `Too many failed attempts. Try again in ${remainingSeconds} seconds`,
        code: 'OTP_LOCKED',
        locked: true,
        retryAfter: remainingSeconds
      };
    }

    // Check expiration
    if (new Date(record.expires_at) < new Date()) {
      // Delete expired OTP
      await pool.query(
        `DELETE FROM otp_verifications WHERE ${column} = $1`,
        [identifier]
      );
      return {
        success: false,
        error: 'OTP expired. Please request a new one',
        code: 'OTP_EXPIRED'
      };
    }

    // Check attempts limit (BEFORE verification)
    if (record.attempts >= 3) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await pool.query(
        `UPDATE otp_verifications
         SET locked_until = $1
         WHERE ${column} = $2`,
        [lockedUntil, identifier]
      );
      return {
        success: false,
        error: 'Too many failed attempts. Account locked for 15 minutes',
        code: 'OTP_LOCKED',
        locked: true,
        retryAfter: 900
      };
    }

    // Verify OTP (constant-time comparison via bcrypt)
    const isValid = await bcrypt.compare(inputOTP, record.otp_hash);

    if (!isValid) {
      // Increment attempts
      await pool.query(
        `UPDATE otp_verifications
         SET attempts = attempts + 1
         WHERE ${column} = $1`,
        [identifier]
      );

      const attemptsLeft = 3 - (record.attempts + 1);
      return {
        success: false,
        error: `Invalid OTP. ${attemptsLeft} attempt(s) remaining`,
        code: 'OTP_INVALID',
        attemptsLeft
      };
    }

    // Success - mark as verified (don't delete yet, for audit)
    await pool.query(
      `UPDATE otp_verifications
       SET verified = true,
           verified_at = NOW()
       WHERE ${column} = $1`,
      [identifier]
    );

    return {
      success: true,
      message: 'OTP verified successfully'
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Check if OTP was recently sent (rate limiting)
 * @param {string} identifier - Phone or email
 * @param {string} identifierType - 'phone' or 'email'
 * @param {number} cooldownSeconds - Cooldown period in seconds (default: 60)
 * @returns {Promise<Object>} - { canSend: boolean, waitSeconds: number }
 */
const checkOTPRateLimit = async (identifier, identifierType, cooldownSeconds = 60) => {
  const column = identifierType === 'phone' ? 'phone' : 'email';

  try {
    const result = await pool.query(
      `SELECT created_at
       FROM otp_verifications
       WHERE ${column} = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [identifier]
    );

    if (result.rows.length === 0) {
      return { canSend: true, waitSeconds: 0 };
    }

    const lastSentAt = new Date(result.rows[0].created_at);
    const now = new Date();
    const elapsedSeconds = Math.floor((now - lastSentAt) / 1000);

    if (elapsedSeconds < cooldownSeconds) {
      return {
        canSend: false,
        waitSeconds: cooldownSeconds - elapsedSeconds
      };
    }

    return { canSend: true, waitSeconds: 0 };
  } catch (error) {
    throw error;
  }
};

/**
 * Delete OTP after successful verification or cleanup
 * @param {string} identifier - Phone or email
 * @param {string} identifierType - 'phone' or 'email'
 * @returns {Promise<void>}
 */
const deleteOTP = async (identifier, identifierType) => {
  const column = identifierType === 'phone' ? 'phone' : 'email';

  try {
    await pool.query(
      `DELETE FROM otp_verifications WHERE ${column} = $1`,
      [identifier]
    );
  } catch (error) {
    throw error;
  }
};

/**
 * Cleanup expired OTPs (for cron job)
 * @param {number} olderThanHours - Delete OTPs older than X hours (default: 24)
 * @returns {Promise<number>} - Number of deleted records
 */
const cleanupExpiredOTPs = async (olderThanHours = 24) => {
  try {
    const result = await pool.query(
      `DELETE FROM otp_verifications
       WHERE expires_at < NOW() - INTERVAL '${olderThanHours} hours'
       RETURNING id`
    );

    return result.rowCount;
  } catch (error) {
    throw error;
  }
};

/**
 * Get OTP statistics for monitoring
 * @returns {Promise<Object>} - OTP stats
 */
const getOTPStats = async () => {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_active_otps,
        COUNT(*) FILTER (WHERE verified = true) as verified_count,
        COUNT(*) FILTER (WHERE locked_until IS NOT NULL AND locked_until > NOW()) as locked_count,
        COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_count
       FROM otp_verifications`
    );

    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

module.exports = {
  storeOTP,
  verifyOTP,
  checkOTPRateLimit,
  deleteOTP,
  cleanupExpiredOTPs,
  getOTPStats
};
