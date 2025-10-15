/**
 * OTP Service
 *
 * Orchestrates OTP generation, sending, and verification
 * Combines database operations with SMS/Email delivery
 */

const { generateOTP, maskPhone, maskEmail } = require('../utils/helpers');
const OtpVerification = require('../models/OtpVerification');
const { sendOTPSMS } = require('./smsService');
const { sendOTPEmail } = require('./emailService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Send OTP to phone number
 * @param {string} phone - Phone number in +91XXXXXXXXXX format
 * @param {string} purpose - OTP purpose ('signup', 'login', 'reset_password')
 * @returns {Promise<Object>} - Send result with masked phone
 */
const sendPhoneOTP = async (phone, purpose = 'signup_or_login') => {
  try {
    // Check rate limiting (60 seconds cooldown)
    const rateLimitCheck = await OtpVerification.checkOTPRateLimit(
      phone,
      'phone',
      60
    );

    if (!rateLimitCheck.canSend) {
      throw new AppError(
        `Please wait ${rateLimitCheck.waitSeconds} seconds before requesting a new OTP`,
        429
      );
    }

    // Generate OTP (hardcoded - Twilio not in use)
    const otp = '123456';

    // Store OTP hash in database (no expiry)
    const storeResult = await OtpVerification.storeOTP({
      identifier: phone,
      identifierType: 'phone',
      otp,
      purpose,
      expiryMinutes: 999999 // Very long expiry (effectively no expiry)
    });

    // Log OTP to console (no SMS sent)
    console.log('🔐 HARDCODED OTP MODE - OTP for', maskPhone(phone), ':', otp);

    const smsResult = {
      provider: 'hardcoded',
      messageId: 'hardcoded-' + Date.now(),
      success: true
    };

    return {
      success: true,
      message: `OTP sent successfully (Use: ${otp})`,
      phone: maskPhone(phone),
      expiresIn: storeResult.expiresIn,
      provider: smsResult.provider,
      messageId: smsResult.messageId,
      devOTP: otp // Always include OTP
    };
  } catch (error) {
    // If it's already an AppError, rethrow it
    if (error instanceof AppError) {
      throw error;
    }

    // Log unexpected errors
    console.error('Send phone OTP error:', {
      phone: maskPhone(phone),
      error: error.message
    });

    throw new AppError('Failed to send OTP. Please try again', 500);
  }
};

/**
 * Send OTP to email address
 * @param {string} email - Email address
 * @param {string} purpose - OTP purpose ('signup', 'login', 'reset_password')
 * @returns {Promise<Object>} - Send result with masked email
 */
const sendEmailOTP = async (email, purpose = 'signup_or_login') => {
  try {
    // Check rate limiting (60 seconds cooldown)
    const rateLimitCheck = await OtpVerification.checkOTPRateLimit(
      email,
      'email',
      60
    );

    if (!rateLimitCheck.canSend) {
      throw new AppError(
        `Please wait ${rateLimitCheck.waitSeconds} seconds before requesting a new OTP`,
        429
      );
    }

    // Generate OTP (hardcoded - Resend email not in use)
    const otp = '123456';

    // Store OTP hash in database (no expiry)
    const storeResult = await OtpVerification.storeOTP({
      identifier: email,
      identifierType: 'email',
      otp,
      purpose,
      expiryMinutes: 999999 // Very long expiry (effectively no expiry)
    });

    // Log OTP to console (no email sent)
    console.log('🔐 HARDCODED OTP MODE - OTP for', maskEmail(email), ':', otp);

    const emailResult = {
      provider: 'hardcoded',
      messageId: 'hardcoded-' + Date.now(),
      success: true
    };

    return {
      success: true,
      message: `OTP sent successfully (Use: ${otp})`,
      email: maskEmail(email),
      expiresIn: storeResult.expiresIn,
      provider: emailResult.provider,
      messageId: emailResult.messageId,
      devOTP: otp // Always include OTP
    };
  } catch (error) {
    // If it's already an AppError, rethrow it
    if (error instanceof AppError) {
      throw error;
    }

    // Log unexpected errors
    console.error('Send email OTP error:', {
      email: maskEmail(email),
      error: error.message
    });

    throw new AppError('Failed to send OTP. Please try again', 500);
  }
};

/**
 * Verify phone OTP
 * @param {string} phone - Phone number
 * @param {string} otp - OTP entered by user
 * @returns {Promise<Object>} - Verification result
 */
const verifyPhoneOTP = async (phone, otp) => {
  try {
    const result = await OtpVerification.verifyOTP({
      identifier: phone,
      identifierType: 'phone',
      inputOTP: otp
    });

    if (!result.success) {
      // Return specific error from OTP model
      throw new AppError(result.error, 400);
    }

    // Delete OTP after successful verification
    await OtpVerification.deleteOTP(phone, 'phone');

    return {
      success: true,
      message: 'Phone number verified successfully',
      phone: maskPhone(phone)
    };
  } catch (error) {
    // If it's already an AppError, rethrow it
    if (error instanceof AppError) {
      throw error;
    }

    console.error('Verify phone OTP error:', {
      phone: maskPhone(phone),
      error: error.message
    });

    throw new AppError('OTP verification failed', 500);
  }
};

/**
 * Verify email OTP
 * @param {string} email - Email address
 * @param {string} otp - OTP entered by user
 * @returns {Promise<Object>} - Verification result
 */
const verifyEmailOTP = async (email, otp) => {
  try {
    const result = await OtpVerification.verifyOTP({
      identifier: email,
      identifierType: 'email',
      inputOTP: otp
    });

    if (!result.success) {
      // Return specific error from OTP model
      throw new AppError(result.error, 400);
    }

    // Delete OTP after successful verification
    await OtpVerification.deleteOTP(email, 'email');

    return {
      success: true,
      message: 'Email verified successfully',
      email: maskEmail(email)
    };
  } catch (error) {
    // If it's already an AppError, rethrow it
    if (error instanceof AppError) {
      throw error;
    }

    console.error('Verify email OTP error:', {
      email: maskEmail(email),
      error: error.message
    });

    throw new AppError('OTP verification failed', 500);
  }
};

/**
 * Resend OTP to phone or email
 * @param {Object} params - { phone } or { email }
 * @param {string} purpose - OTP purpose
 * @returns {Promise<Object>} - Send result
 */
const resendOTP = async (params, purpose = 'signup_or_login') => {
  try {
    if (params.phone) {
      return await sendPhoneOTP(params.phone, purpose);
    }

    if (params.email) {
      return await sendEmailOTP(params.email, purpose);
    }

    throw new AppError('Phone or email is required', 400);
  } catch (error) {
    throw error;
  }
};

/**
 * Cleanup expired OTPs (for cron job)
 * @returns {Promise<number>} - Number of deleted OTPs
 */
const cleanupExpiredOTPs = async () => {
  try {
    const deletedCount = await OtpVerification.cleanupExpiredOTPs(24);
    console.log(`Cleaned up ${deletedCount} expired OTPs`);
    return deletedCount;
  } catch (error) {
    console.error('OTP cleanup error:', error.message);
    return 0;
  }
};

module.exports = {
  sendPhoneOTP,
  sendEmailOTP,
  verifyPhoneOTP,
  verifyEmailOTP,
  resendOTP,
  cleanupExpiredOTPs
};
