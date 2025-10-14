/**
 * SMS Service - Twilio Integration
 *
 * Handles SMS delivery using Twilio API.
 * Primary use case: OTP verification for phone-based authentication.
 *
 * CRITICAL REQUIREMENTS:
 * - Rate limiting to prevent SMS spam and cost overruns
 * - Fallback to email OTP if SMS fails
 * - Track SMS costs (₹0.80 per SMS in India)
 * - Handle Indian phone number format (+91XXXXXXXXXX)
 * - Implement timeout and error handling
 * - Monitor delivery status
 */

const config = require('../config/env');
const { AppError } = require('../middleware/errorHandler');
const { maskPhone } = require('../utils/helpers');

// Initialize Twilio client
let twilioClient = null;

// Initialize Twilio client (only if credentials are configured)
const initializeTwilioClient = () => {
  if (!config.twilio.accountSid || !config.twilio.authToken) {
    console.warn('Twilio credentials not configured. SMS features will be disabled.');
    return null;
  }

  try {
    const twilio = require('twilio');
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
    console.log('Twilio SMS client initialized successfully');
    console.log(`Sending SMS from: ${config.twilio.phoneNumber}`);
    return twilioClient;
  } catch (error) {
    console.error('Failed to initialize Twilio client:', error.message);
    return null;
  }
};

// Initialize on module load
initializeTwilioClient();

/**
 * SMS rate limiting map
 * Format: { phone: { count: number, resetAt: timestamp, lastSent: timestamp } }
 */
const smsRateLimitMap = new Map();

/**
 * SMS rate limit settings
 */
const SMS_RATE_LIMIT = {
  MAX_SMS_PER_15MIN: 3, // Maximum 3 SMS per 15 minutes per phone
  MAX_SMS_PER_HOUR: 5, // Maximum 5 SMS per hour per phone
  WINDOW_15MIN_MS: 15 * 60 * 1000, // 15 minutes
  WINDOW_1HOUR_MS: 60 * 60 * 1000, // 1 hour
  MIN_INTERVAL_MS: 60 * 1000 // Minimum 60 seconds between SMS
};

/**
 * SMS cost tracking (for monitoring)
 */
const SMS_COST = {
  PER_SMS_INR: 0.80, // ₹0.80 per SMS in India
  MONTHLY_BUDGET_INR: 10000 // ₹10,000/month budget
};

let totalSmsCostToday = 0;
let totalSmsCountToday = 0;
let lastResetDate = new Date().toDateString();

/**
 * Check SMS rate limit
 *
 * @param {string} phone - Phone number
 * @returns {Object} - { allowed: boolean, reason: string }
 */
const checkSmsRateLimit = (phone) => {
  const now = Date.now();
  const limit = smsRateLimitMap.get(phone);

  if (!limit) {
    smsRateLimitMap.set(phone, {
      count15min: 1,
      count1hour: 1,
      resetAt15min: now + SMS_RATE_LIMIT.WINDOW_15MIN_MS,
      resetAt1hour: now + SMS_RATE_LIMIT.WINDOW_1HOUR_MS,
      lastSent: now
    });
    return { allowed: true };
  }

  // Check minimum interval between SMS
  if (now - limit.lastSent < SMS_RATE_LIMIT.MIN_INTERVAL_MS) {
    const waitSeconds = Math.ceil((SMS_RATE_LIMIT.MIN_INTERVAL_MS - (now - limit.lastSent)) / 1000);
    return {
      allowed: false,
      reason: `Please wait ${waitSeconds} seconds before requesting another SMS`
    };
  }

  // Reset 15-minute counter if window expired
  if (now > limit.resetAt15min) {
    limit.count15min = 1;
    limit.resetAt15min = now + SMS_RATE_LIMIT.WINDOW_15MIN_MS;
  } else {
    // Check 15-minute limit
    if (limit.count15min >= SMS_RATE_LIMIT.MAX_SMS_PER_15MIN) {
      const waitMinutes = Math.ceil((limit.resetAt15min - now) / 60000);
      return {
        allowed: false,
        reason: `SMS limit exceeded. Please try again in ${waitMinutes} minutes`
      };
    }
    limit.count15min++;
  }

  // Reset 1-hour counter if window expired
  if (now > limit.resetAt1hour) {
    limit.count1hour = 1;
    limit.resetAt1hour = now + SMS_RATE_LIMIT.WINDOW_1HOUR_MS;
  } else {
    // Check 1-hour limit
    if (limit.count1hour >= SMS_RATE_LIMIT.MAX_SMS_PER_HOUR) {
      const waitMinutes = Math.ceil((limit.resetAt1hour - now) / 60000);
      return {
        allowed: false,
        reason: `Hourly SMS limit exceeded. Please try again in ${waitMinutes} minutes`
      };
    }
    limit.count1hour++;
  }

  // Update last sent timestamp
  limit.lastSent = now;

  return { allowed: true };
};

/**
 * Format phone number to international format
 *
 * @param {string} phone - Phone number (10 digits or with country code)
 * @returns {string} - Formatted phone number (+91XXXXXXXXXX)
 */
const formatPhoneNumber = (phone) => {
  if (!phone) {
    throw new AppError('Phone number is required', 400);
  }

  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');

  // If already has country code (91XXXXXXXXXX)
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`;
  }

  // If 10-digit Indian number
  if (cleaned.length === 10 && cleaned[0] >= '6' && cleaned[0] <= '9') {
    return `+91${cleaned}`;
  }

  // If already formatted with +
  if (phone.startsWith('+91') && cleaned.length === 12) {
    return phone;
  }

  throw new AppError(`Invalid Indian phone number format: ${maskPhone(phone)}`, 400);
};

/**
 * Log SMS cost and usage for monitoring
 *
 * @param {string} phone - Phone number
 * @param {number} cost - Cost in INR
 * @param {string} status - Delivery status
 * @param {string} messageSid - Twilio message SID
 * @param {number} latency - API latency in milliseconds
 * @param {string} error - Error message if failed
 */
const logSmsCost = async (phone, cost, status, messageSid = null, latency = 0, error = null) => {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'twilio-sms',
      phone: maskPhone(phone),
      costInr: cost,
      status: status,
      messageSid: messageSid,
      latencyMs: latency,
      error: error,
      dailyTotal: totalSmsCostToday,
      dailyCount: totalSmsCountToday
    };

    // Log to console (in production, this should go to a monitoring service)
    if (config.isDevelopment) {
      console.log('SMS Cost Log:', logEntry);
    }

    // TODO: In production, save to database for analytics
    // await db.query('INSERT INTO sms_logs SET ?', logEntry);

    return logEntry;
  } catch (error) {
    console.error('Failed to log SMS cost:', error.message);
  }
};

/**
 * Send OTP via SMS
 * @param {string} phone - Phone number in E.164 format (+919876543210)
 * @param {string} otp - 6-digit OTP code
 * @param {string} email - Email for fallback (optional)
 * @returns {Promise<Object>} - Send result
 */
const sendOTPSMS = async (phone, otp, email = null) => {
  const startTime = Date.now();

  try {
    // Validate OTP code
    if (!otp || !/^\d{6}$/.test(otp)) {
      throw new AppError('Invalid OTP code format. Must be 6 digits.', 400);
    }

    // Format phone number
    let formattedPhone;
    try {
      formattedPhone = formatPhoneNumber(phone);
    } catch (error) {
      console.error('Phone number formatting error:', error.message);
      throw error;
    }

    // Skip actual sending in development if Twilio not configured
    if (config.isDevelopment && !twilioClient) {
      console.log('\n=== DEVELOPMENT MODE - SMS NOT SENT ===');
      console.log(`To: ${formattedPhone}`);
      console.log(`OTP: ${otp}`);
      console.log('========================================\n');

      return {
        success: true,
        messageId: 'dev-mode-' + Date.now(),
        provider: 'twilio-dev',
        phone: maskPhone(formattedPhone)
      };
    }

    if (!twilioClient) {
      console.error('Twilio not initialized. Cannot send SMS.');
      throw new AppError('SMS service unavailable', 500);
    }

    // Check rate limit
    const rateLimit = checkSmsRateLimit(formattedPhone);
    if (!rateLimit.allowed) {
      console.warn(`SMS rate limit exceeded for ${maskPhone(formattedPhone)}: ${rateLimit.reason}`);
      throw new AppError(rateLimit.reason, 429);
    }

    // Reset daily cost tracking if new day
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
      totalSmsCostToday = 0;
      totalSmsCountToday = 0;
      lastResetDate = today;
    }

    // Check daily budget
    if (totalSmsCostToday >= SMS_COST.MONTHLY_BUDGET_INR / 30) {
      console.error('Daily SMS budget exceeded.');
      throw new AppError('SMS service temporarily unavailable. Please try email OTP.', 503);
    }

    // Compose OTP message
    const message = `Your OTP for ${config.email.fromName} is: ${otp}\n\nValid for 10 minutes. Do not share this code with anyone.`;

    // Send SMS via Twilio with timeout
    const sendPromise = twilioClient.messages.create({
      body: message,
      from: config.twilio.phoneNumber,
      to: formattedPhone
    });

    const result = await Promise.race([
      sendPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Twilio API timeout after 10 seconds')), 10000)
      )
    ]);

    const endTime = Date.now();
    const latency = endTime - startTime;

    // Track cost
    totalSmsCostToday += SMS_COST.PER_SMS_INR;
    totalSmsCountToday++;

    // Log successful send
    await logSmsCost(formattedPhone, SMS_COST.PER_SMS_INR, 'delivered', result.sid, latency);

    console.log(`SMS sent successfully to ${maskPhone(formattedPhone)}: ${result.sid}`);

    return {
      success: true,
      messageId: result.sid,
      status: result.status,
      provider: 'twilio',
      phone: maskPhone(formattedPhone),
      cost: SMS_COST.PER_SMS_INR,
      latencyMs: latency
    };
  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;

    console.error('SMS send error:', {
      phone: maskPhone(phone),
      error: error.message,
      code: error.code,
      latency: latency
    });

    // Log failed send
    await logSmsCost(phone, 0, 'failed', null, latency, error.message);

    // Handle Twilio-specific errors
    if (error.code === 21211) {
      throw new AppError('Invalid phone number', 400);
    }

    if (error.code === 21608) {
      throw new AppError('Phone number is not permitted to receive SMS', 400);
    }

    if (error.code === 21614) {
      throw new AppError('Invalid phone number format', 400);
    }

    if (error.code === 21612) {
      throw new AppError('Phone number not capable of receiving SMS', 400);
    }

    // Re-throw if already an AppError
    if (error instanceof AppError) {
      throw error;
    }

    // Generic SMS error
    throw new AppError('Failed to send SMS. Please try again', 500);
  }
};

/**
 * Send transactional SMS (subscriptions, payments, etc.)
 * @param {string} phone - Phone number in E.164 format
 * @param {string} message - SMS message content
 * @returns {Promise<Object>} - Send result
 */
const sendTransactionalSMS = async (phone, message) => {
  try {
    // Validate phone format
    if (!phone.startsWith('+91')) {
      throw new AppError('Invalid phone number format. Use +91XXXXXXXXXX', 400);
    }

    // Skip actual sending in development if Twilio not configured
    if (config.isDevelopment && !twilioClient) {
      console.log('\n=== DEVELOPMENT MODE - SMS NOT SENT ===');
      console.log(`To: ${phone}`);
      console.log(`Message: ${message}`);
      console.log('========================================\n');

      return {
        success: true,
        messageId: 'dev-mode-' + Date.now(),
        provider: 'twilio-dev',
        phone
      };
    }

    if (!twilioClient) {
      throw new AppError('SMS service not configured', 500);
    }

    // Send SMS via Twilio
    const result = await twilioClient.messages.create({
      body: message,
      from: config.twilio.phoneNumber,
      to: phone
    });

    console.log('Transactional SMS sent:', {
      to: phone,
      messageId: result.sid,
      status: result.status
    });

    return {
      success: true,
      messageId: result.sid,
      status: result.status,
      provider: 'twilio',
      phone
    };
  } catch (error) {
    console.error('Transactional SMS error:', {
      phone,
      error: error.message
    });

    throw new AppError('Failed to send SMS notification', 500);
  }
};

/**
 * Verify phone number using Twilio Verify Service
 * (Alternative to manual OTP implementation)
 * @param {string} phone - Phone number in E.164 format
 * @returns {Promise<Object>} - Verification result
 */
const sendVerificationCode = async (phone) => {
  try {
    if (!config.twilio.verifyServiceSid) {
      throw new AppError('Twilio Verify service not configured', 500);
    }

    if (!twilioClient) {
      throw new AppError('SMS service not configured', 500);
    }

    const verification = await twilioClient.verify
      .services(config.twilio.verifyServiceSid)
      .verifications.create({
        to: phone,
        channel: 'sms'
      });

    return {
      success: true,
      status: verification.status,
      provider: 'twilio-verify',
      phone
    };
  } catch (error) {
    console.error('Twilio Verify error:', error.message);
    throw new AppError('Failed to send verification code', 500);
  }
};

/**
 * Check verification code using Twilio Verify Service
 * @param {string} phone - Phone number
 * @param {string} code - Verification code
 * @returns {Promise<Object>} - Verification result
 */
const checkVerificationCode = async (phone, code) => {
  try {
    if (!config.twilio.verifyServiceSid) {
      throw new AppError('Twilio Verify service not configured', 500);
    }

    if (!twilioClient) {
      throw new AppError('SMS service not configured', 500);
    }

    const verificationCheck = await twilioClient.verify
      .services(config.twilio.verifyServiceSid)
      .verificationChecks.create({
        to: phone,
        code: code
      });

    return {
      success: verificationCheck.status === 'approved',
      status: verificationCheck.status,
      provider: 'twilio-verify'
    };
  } catch (error) {
    console.error('Twilio Verify check error:', error.message);
    throw new AppError('Failed to verify code', 500);
  }
};

/**
 * Verify SMS delivery status
 *
 * @param {string} messageSid - Twilio message SID
 * @returns {Promise<Object>} - Delivery status
 */
const verifySmsDelivery = async (messageSid) => {
  try {
    if (!twilioClient) {
      return {
        success: false,
        error: 'Twilio not initialized'
      };
    }

    const message = await twilioClient.messages(messageSid).fetch();

    return {
      success: true,
      status: message.status,
      to: maskPhone(message.to),
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      dateCreated: message.dateCreated,
      dateUpdated: message.dateUpdated,
      dateSent: message.dateSent
    };

  } catch (error) {
    console.error('SMS delivery verification error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get SMS cost summary (for analytics)
 *
 * @returns {Object} - Cost summary
 */
const getSmsCostSummary = () => {
  return {
    today: {
      count: totalSmsCountToday,
      cost: totalSmsCostToday,
      date: lastResetDate
    },
    perSms: SMS_COST.PER_SMS_INR,
    monthlyBudget: SMS_COST.MONTHLY_BUDGET_INR,
    dailyBudget: SMS_COST.MONTHLY_BUDGET_INR / 30
  };
};

/**
 * Clean up expired rate limit entries (run periodically)
 */
const cleanupSmsRateLimits = () => {
  const now = Date.now();
  let cleaned = 0;

  for (const [phone, limit] of smsRateLimitMap.entries()) {
    // Remove if both windows expired
    if (now > limit.resetAt15min && now > limit.resetAt1hour) {
      smsRateLimitMap.delete(phone);
      cleaned++;
    }
  }

  if (cleaned > 0 && config.isDevelopment) {
    console.log(`Cleaned up ${cleaned} expired SMS rate limit entries`);
  }
};

// Run cleanup every hour
setInterval(cleanupSmsRateLimits, 60 * 60 * 1000);

/**
 * Validate phone number format
 * @param {string} phone - Phone number
 * @returns {boolean} - True if valid Indian phone number
 */
const isValidIndianPhone = (phone) => {
  // +91 followed by 10 digits starting with 6-9
  const indianPhoneRegex = /^\+91[6-9]\d{9}$/;
  return indianPhoneRegex.test(phone);
};

module.exports = {
  sendOTPSMS,
  sendTransactionalSMS,
  sendVerificationCode,
  checkVerificationCode,
  verifySmsDelivery,
  formatPhoneNumber,
  logSmsCost,
  getSmsCostSummary,
  checkSmsRateLimit,
  cleanupSmsRateLimits,
  isValidIndianPhone,
  SMS_COST,
  SMS_RATE_LIMIT
};
