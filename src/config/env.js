/**
 * Environment Configuration
 *
 * Centralized environment variable management with validation
 * Ensures all required environment variables are set before app starts
 */

require('dotenv').config();

/**
 * Validates that required environment variables are set
 * @param {Array<string>} requiredVars - Array of required variable names
 * @throws {Error} If any required variable is missing
 */
const validateEnvVariables = (requiredVars) => {
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(varName => console.error(`  - ${varName}`));
    throw new Error('Missing required environment variables. Please check your .env file.');
  }
};

// List of required environment variables
const REQUIRED_ENV_VARS = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET'
];

// Validate on module load
validateEnvVariables(REQUIRED_ENV_VARS);

// Export configuration object
const config = {
  // Application
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Database
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    url: process.env.DATABASE_URL
  },

  // JWT Authentication
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRE || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  },

  // Frontend
  frontend: {
    url: process.env.FRONTEND_URL
  },

  // Razorpay
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
  },

  // Claude API
  claude: {
    apiKey: process.env.CLAUDE_API_KEY,
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929'
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  },

  // Resend Email
  email: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || 'noreply@analystplatform.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Analyst Marketplace'
  },

  // Twilio SMS
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
  },

  // File Upload
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760, // 10MB
    allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf'
    ]
  },

  // Cron Jobs
  cron: {
    enabled: process.env.ENABLE_CRON_JOBS === 'true',
    paymentRetry: process.env.PAYMENT_RETRY_CRON || '0 9 * * *',
    emailDigest: process.env.EMAIL_DIGEST_CRON || '0 8 * * *'
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false'
  },

  // Security
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
    otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10,
    sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES, 10) || 60
  },

  // Feature Flags
  features: {
    enableAI: process.env.ENABLE_AI_FEATURES !== 'false',
    enableChat: process.env.ENABLE_CHAT !== 'false',
    enableNotifications: process.env.ENABLE_NOTIFICATIONS !== 'false'
  }
};

// Log configuration on startup (hide sensitive data)
if (config.isDevelopment) {
  console.log('Environment Configuration Loaded:');
  console.log({
    env: config.env,
    port: config.port,
    database: {
      host: config.database.host,
      name: config.database.name
    },
    frontend: config.frontend.url,
    features: config.features
  });
}

module.exports = config;
