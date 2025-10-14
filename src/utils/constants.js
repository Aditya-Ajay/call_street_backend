/**
 * Application Constants
 *
 * Centralized constants for the entire application
 * Makes it easy to update values in one place
 */

// User roles
const USER_ROLES = {
  ANALYST: 'analyst',
  TRADER: 'trader',
  ADMIN: 'admin'
};

// Subscription tiers
const SUBSCRIPTION_TIERS = {
  BASIC: 'basic',
  PREMIUM: 'premium',
  PRO: 'pro'
};

// Subscription tier prices (in INR)
const SUBSCRIPTION_PRICES = {
  BASIC: 299,
  PREMIUM: 799,
  PRO: 1499
};

// Subscription status
const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  PENDING: 'pending',
  FAILED: 'failed'
};

// Analyst verification status
const VERIFICATION_STATUS = {
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  RESUBMIT_REQUIRED: 'resubmit_required'
};

// Post types
const POST_TYPES = {
  MARKET_ANALYSIS: 'market_analysis',
  TRADE_IDEA: 'trade_idea',
  EDUCATIONAL: 'educational',
  NEWS: 'news',
  DAILY_UPDATE: 'daily_update'
};

// Analyst specializations
const SPECIALIZATIONS = {
  EQUITY: 'equity',
  FOREX: 'forex',
  CRYPTO: 'crypto',
  COMMODITY: 'commodity',
  DERIVATIVES: 'derivatives',
  TECHNICAL: 'technical',
  FUNDAMENTAL: 'fundamental'
};

// Payment status
const PAYMENT_STATUS = {
  CREATED: 'created',
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  REFUNDED: 'refunded',
  FAILED: 'failed'
};

// Payment retry days (as per PRD)
const PAYMENT_RETRY_DAYS = [3, 7, 10];

// Chat message types
const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file',
  TRADE_IDEA: 'trade_idea',
  SYSTEM: 'system'
};

// Notification types
const NOTIFICATION_TYPES = {
  NEW_POST: 'new_post',
  NEW_SUBSCRIBER: 'new_subscriber',
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  NEW_MESSAGE: 'new_message',
  NEW_REVIEW: 'new_review',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',
  VERIFICATION_APPROVED: 'verification_approved',
  VERIFICATION_REJECTED: 'verification_rejected'
};

// File upload limits
const FILE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_PROFILE_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_DOCUMENT_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
};

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

// OTP settings
const OTP_SETTINGS = {
  LENGTH: 6,
  EXPIRY_MINUTES: 10,
  MAX_ATTEMPTS: 3
};

// Chat settings
const CHAT_SETTINGS = {
  MAX_MESSAGE_LENGTH: 1000,
  MESSAGES_PER_PAGE: 50,
  TYPING_INDICATOR_TIMEOUT: 3000 // 3 seconds
};

// Review settings
const REVIEW_SETTINGS = {
  MIN_RATING: 1,
  MAX_RATING: 5,
  MIN_COMMENT_LENGTH: 10,
  MAX_COMMENT_LENGTH: 500
};

// Rate limiting windows
const RATE_LIMITS = {
  STANDARD: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100
  },
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5
  },
  OTP: {
    WINDOW_MS: 10 * 60 * 1000, // 10 minutes
    MAX_REQUESTS: 3
  },
  UPLOAD: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 10
  },
  CHAT: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 50
  }
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};

// Success/Error messages
const MESSAGES = {
  // Auth
  SIGNUP_SUCCESS: 'Account created successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  OTP_SENT: 'OTP sent successfully',
  OTP_VERIFIED: 'OTP verified successfully',
  TOKEN_REFRESHED: 'Token refreshed successfully',

  // Profile
  PROFILE_UPDATED: 'Profile updated successfully',
  PROFILE_DELETED: 'Profile deleted successfully',

  // Posts
  POST_CREATED: 'Post created successfully',
  POST_UPDATED: 'Post updated successfully',
  POST_DELETED: 'Post deleted successfully',

  // Subscriptions
  SUBSCRIPTION_CREATED: 'Subscription created successfully',
  SUBSCRIPTION_CANCELLED: 'Subscription cancelled successfully',
  SUBSCRIPTION_RENEWED: 'Subscription renewed successfully',

  // Reviews
  REVIEW_SUBMITTED: 'Review submitted successfully',
  REVIEW_UPDATED: 'Review updated successfully',
  REVIEW_DELETED: 'Review deleted successfully',

  // Errors
  INVALID_CREDENTIALS: 'Invalid email/phone or password',
  UNAUTHORIZED: 'You are not authorized to perform this action',
  NOT_FOUND: 'Resource not found',
  ALREADY_EXISTS: 'Resource already exists',
  VALIDATION_ERROR: 'Validation failed',
  SERVER_ERROR: 'Internal server error'
};

// Cron job schedules
const CRON_SCHEDULES = {
  PAYMENT_RETRY: '0 9 * * *', // Daily at 9 AM
  EMAIL_DIGEST: '0 8 * * *', // Daily at 8 AM
  SUBSCRIPTION_CHECK: '0 0 * * *', // Daily at midnight
  SEBI_REVALIDATION: '0 0 1 * *' // Monthly on 1st at midnight
};

// Email templates
const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  OTP: 'otp',
  PASSWORD_RESET: 'password_reset',
  SUBSCRIPTION_CONFIRMATION: 'subscription_confirmation',
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  PAYMENT_FAILED: 'payment_failed',
  VERIFICATION_APPROVED: 'verification_approved',
  VERIFICATION_REJECTED: 'verification_rejected',
  DAILY_DIGEST: 'daily_digest'
};

// Socket events
const SOCKET_EVENTS = {
  // Connection
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  ERROR: 'error',

  // Authentication
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',

  // Chat
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SEND_MESSAGE: 'send_message',
  RECEIVE_MESSAGE: 'receive_message',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  MESSAGE_READ: 'message_read',

  // Presence
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',

  // Notifications
  NEW_NOTIFICATION: 'new_notification'
};

// Database table names
const DB_TABLES = {
  USERS: 'users',
  ANALYST_PROFILES: 'analyst_profiles',
  SUBSCRIPTIONS: 'subscriptions',
  POSTS: 'posts',
  REVIEWS: 'reviews',
  CHAT_MESSAGES: 'chat_messages',
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
  OTP_VERIFICATIONS: 'otp_verifications',
  INVITE_LINKS: 'invite_links'
};

module.exports = {
  USER_ROLES,
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PRICES,
  SUBSCRIPTION_STATUS,
  VERIFICATION_STATUS,
  POST_TYPES,
  SPECIALIZATIONS,
  PAYMENT_STATUS,
  PAYMENT_RETRY_DAYS,
  MESSAGE_TYPES,
  NOTIFICATION_TYPES,
  FILE_LIMITS,
  PAGINATION,
  OTP_SETTINGS,
  CHAT_SETTINGS,
  REVIEW_SETTINGS,
  RATE_LIMITS,
  HTTP_STATUS,
  MESSAGES,
  CRON_SCHEDULES,
  EMAIL_TEMPLATES,
  SOCKET_EVENTS,
  DB_TABLES
};
