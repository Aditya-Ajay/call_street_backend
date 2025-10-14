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

    // Generate OTP (hardcoded in development)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const otp = isDevelopment ? '123456' : generateOTP(6);

    // Store OTP hash in database
    const storeResult = await OtpVerification.storeOTP({
      identifier: phone,
      identifierType: 'phone',
      otp,
      purpose,
      expiryMinutes: 6
    });

    let smsResult;

    if (isDevelopment) {
      // In development, just log OTP to console
      console.log('🔐 DEVELOPMENT MODE - OTP for', maskPhone(phone), ':', otp);
      smsResult = {
        provider: 'development',
        messageId: 'dev-' + Date.now(),
        success: true
      };
    } else {
      // In production, send actual SMS
      smsResult = await sendOTPSMS(phone, otp);
    }

    return {
      success: true,
      message: isDevelopment
        ? `OTP sent successfully (Dev mode: ${otp})`
        : 'OTP sent successfully',
      phone: maskPhone(phone),
      expiresIn: storeResult.expiresIn,
      provider: smsResult.provider,
      messageId: smsResult.messageId,
      ...(isDevelopment && { devOTP: otp }) // Include OTP in dev mode
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

    // Generate OTP (hardcoded in development)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const otp = isDevelopment ? '123456' : generateOTP(6);

    // Store OTP hash in database
    const storeResult = await OtpVerification.storeOTP({
      identifier: email,
      identifierType: 'email',
      otp,
      purpose,
      expiryMinutes: 6
    });

    let emailResult;

    if (isDevelopment) {
      // In development, just log OTP to console
      console.log('🔐 DEVELOPMENT MODE - OTP for', maskEmail(email), ':', otp);
      emailResult = {
        provider: 'development',
        messageId: 'dev-' + Date.now(),
        success: true
      };
    } else {
      // In production, send actual email
      emailResult = await sendOTPEmail(email, otp);
    }

    return {
      success: true,
      message: isDevelopment
        ? `OTP sent successfully (Dev mode: ${otp})`
        : 'OTP sent successfully',
      email: maskEmail(email),
      expiresIn: storeResult.expiresIn,
      provider: emailResult.provider,
      messageId: emailResult.messageId,
      ...(isDevelopment && { devOTP: otp }) // Include OTP in dev mode
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
