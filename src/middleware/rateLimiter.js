/**
 * Rate Limiting Middleware
 *
 * Protects API endpoints from abuse and DDoS attacks
 * Implements different rate limits for different endpoint types
 */

const rateLimit = require('express-rate-limit');
const config = require('../config/env');

/**
 * Standard rate limiter for general API endpoints
 * 100 requests per 15 minutes per IP
 */
const standardLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 15 minutes
  max: config.rateLimit.maxRequests, // 100 requests per window
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please slow down.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Strict rate limiter for authentication endpoints
 * 1000 requests per 15 minutes per IP (DEVELOPMENT MODE - Relaxed for testing)
 * Prevents brute force attacks on login/signup
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window (DEVELOPMENT)
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  handler: (req, res) => {
    console.warn('Auth rate limit exceeded:', {
      ip: req.ip,
      path: req.path,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Rate limiter for OTP requests
 * 1000 OTP requests per 10 minutes per IP (DEVELOPMENT MODE - Relaxed for testing)
 * Prevents OTP spam
 */
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 1000, // 1000 requests per window (DEVELOPMENT)
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again later.',
    retryAfter: '10 minutes'
  },
  handler: (req, res) => {
    console.warn('OTP rate limit exceeded:', {
      ip: req.ip,
      phone: req.body.phone,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      success: false,
      message: 'Too many OTP requests. Please wait 10 minutes before trying again.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Rate limiter for file upload endpoints
 * 10 uploads per hour per IP
 * Prevents storage abuse
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: 'Upload limit exceeded. Please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'You have exceeded the upload limit. Please try again in 1 hour.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Rate limiter for chat messages
 * 50 messages per minute per user
 * Prevents chat spam
 */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 messages per minute
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Use user ID instead of IP for authenticated routes
    return req.user?.id || req.ip;
  },
  message: {
    success: false,
    message: 'Too many messages. Please slow down.',
    retryAfter: '1 minute'
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'You are sending messages too quickly. Please wait a moment.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Rate limiter for payment endpoints
 * 5 payment attempts per hour per user
 * Prevents payment spam and fraud attempts
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 payments per hour
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  message: {
    success: false,
    message: 'Too many payment attempts. Please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req, res) => {
    console.warn('Payment rate limit exceeded:', {
      userId: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      success: false,
      message: 'You have exceeded the payment attempt limit. Please try again in 1 hour.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Rate limiter for search/discovery endpoints
 * 30 requests per minute per IP
 * Prevents scraping
 */
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many search requests. Please try again later.',
    retryAfter: '1 minute'
  }
});

/**
 * Rate limiter for admin endpoints
 * 200 requests per 15 minutes per user
 * Higher limit for admin operations
 */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  message: {
    success: false,
    message: 'Admin rate limit exceeded.',
    retryAfter: '15 minutes'
  }
});

/**
 * Global rate limiter for all API endpoints
 * Acts as a safety net
 * 10000 requests per 15 minutes per IP (DEVELOPMENT MODE - Very relaxed for testing)
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // 10000 requests total (DEVELOPMENT)
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Global rate limit exceeded. Please contact support if this continues.',
    retryAfter: '15 minutes'
  }
});

module.exports = {
  standardLimiter,
  authLimiter,
  otpLimiter,
  uploadLimiter,
  chatLimiter,
  paymentLimiter,
  searchLimiter,
  adminLimiter,
  globalLimiter
};
