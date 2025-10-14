/**
 * Email Service - Resend Integration
 *
 * Handles transactional emails using Resend API.
 * Includes email templates for OTP, welcome, notifications, and digests.
 *
 * CRITICAL REQUIREMENTS:
 * - All emails must be sent asynchronously (non-blocking)
 * - Implement rate limiting to prevent spam
 * - Handle email delivery failures gracefully
 * - Track email sends for monitoring
 * - All templates must be responsive (mobile-friendly)
 * - Include unsubscribe links where applicable
 */

const { Resend } = require('resend');
const config = require('../config/env');
const { formatDate, formatTime, maskEmail } = require('../utils/helpers');

// Initialize Resend client
let resend = null;

// Initialize Resend client (only if API key is configured)
const initializeResendClient = () => {
  if (!config.email.apiKey) {
    console.warn('Resend API key not configured. Email features will be disabled.');
    return null;
  }

  try {
    resend = new Resend(config.email.apiKey);
    console.log('Resend email client initialized successfully');
    console.log(`Sending emails from: ${config.email.fromName} <${config.email.from}>`);
    return resend;
  } catch (error) {
    console.error('Failed to initialize Resend client:', error.message);
    return null;
  }
};

// Initialize on module load
initializeResendClient();

/**
 * Rate limiting map to prevent email spam
 * Format: { email: { count: number, resetAt: timestamp } }
 */
const rateLimitMap = new Map();

/**
 * Email rate limit settings
 */
const RATE_LIMIT = {
  MAX_EMAILS_PER_HOUR: 10, // Maximum 10 emails per hour per recipient
  WINDOW_MS: 60 * 60 * 1000 // 1 hour
};

/**
 * Base email template wrapper (HTML)
 */
const getEmailTemplate = (title, content, footerText = null) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f5f5f5;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      padding: 30px 40px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 40px;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px 40px;
      text-align: center;
      font-size: 12px;
      color: #6c757d;
      border-top: 1px solid #e9ecef;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background-color: #667eea;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      margin: 20px 0;
    }
    .otp-code {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #667eea;
      text-align: center;
      padding: 20px;
      background-color: #f8f9fa;
      border-radius: 8px;
      margin: 20px 0;
    }
    .info-box {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .success-box {
      background-color: #d4edda;
      border-left: 4px solid #28a745;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .call-card {
      border: 1px solid #e9ecef;
      border-radius: 8px;
      padding: 20px;
      margin: 15px 0;
      background-color: #f8f9fa;
    }
    .call-card h3 {
      margin: 0 0 10px 0;
      color: #667eea;
    }
    .price-row {
      display: flex;
      justify-content: space-between;
      margin: 8px 0;
      font-size: 14px;
    }
    .action-buy {
      color: #28a745;
      font-weight: 600;
    }
    .action-sell {
      color: #dc3545;
      font-weight: 600;
    }
    @media only screen and (max-width: 600px) {
      .container {
        margin: 0;
        border-radius: 0;
      }
      .content {
        padding: 20px;
      }
      .header {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${config.email.fromName}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      ${footerText || 'You are receiving this email because you have an account with ' + config.email.fromName + '.'}
      <br><br>
      &copy; ${new Date().getFullYear()} ${config.email.fromName}. All rights reserved.
    </div>
  </div>
</body>
</html>
  `.trim();
};

/**
 * Check email rate limit
 *
 * @param {string} email - Recipient email
 * @returns {boolean} - True if rate limit exceeded
 */
const checkRateLimit = (email) => {
  const now = Date.now();
  const limit = rateLimitMap.get(email);

  if (!limit) {
    rateLimitMap.set(email, { count: 1, resetAt: now + RATE_LIMIT.WINDOW_MS });
    return false;
  }

  // Reset if window expired
  if (now > limit.resetAt) {
    rateLimitMap.set(email, { count: 1, resetAt: now + RATE_LIMIT.WINDOW_MS });
    return false;
  }

  // Check if limit exceeded
  if (limit.count >= RATE_LIMIT.MAX_EMAILS_PER_HOUR) {
    console.warn(`Email rate limit exceeded for ${maskEmail(email)}`);
    return true;
  }

  // Increment counter
  limit.count++;
  return false;
};

/**
 * Send email via Resend
 *
 * @param {Object} emailData - Email configuration
 * @param {string} emailData.to - Recipient email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.html - HTML content
 * @param {string} emailData.text - Plain text content (optional)
 * @param {boolean} emailData.skipRateLimit - Skip rate limiting (for critical emails)
 * @returns {Promise<Object>} - Send result
 */
const sendEmail = async (emailData) => {
  try {
    const { to, subject, html, text, skipRateLimit = false } = emailData;

    // Validation
    if (!to || !subject || !html) {
      throw new Error('Missing required email fields: to, subject, html');
    }

    // Check if Resend is initialized
    if (!resend) {
      console.error('Resend not initialized. Cannot send email.');
      return {
        success: false,
        error: 'Email service unavailable'
      };
    }

    // Check rate limit (unless skipped for critical emails)
    if (!skipRateLimit && checkRateLimit(to)) {
      return {
        success: false,
        error: 'Email rate limit exceeded. Please try again later.',
        rateLimited: true
      };
    }

    // Send email with timeout
    const sendPromise = resend.emails.send({
      from: `${config.email.fromName} <${config.email.from}>`,
      to: to,
      subject: subject,
      html: html,
      text: text || null
    });

    const result = await Promise.race([
      sendPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Email send timeout after 10 seconds')), 10000)
      )
    ]);

    // Log successful send
    console.log(`Email sent successfully to ${maskEmail(to)}: ${subject}`);

    return {
      success: true,
      messageId: result.id,
      to: to
    };

  } catch (error) {
    console.error('Email send error:', {
      to: maskEmail(emailData.to),
      subject: emailData.subject,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send OTP verification email
 *
 * @param {string} email - Recipient email
 * @param {string} otpCode - 6-digit OTP code
 * @param {number} expiryMinutes - OTP expiry time in minutes
 * @returns {Promise<Object>} - Send result
 */
const sendOtpEmail = async (email, otpCode, expiryMinutes = 10) => {
  const content = `
    <h2>Your Verification Code</h2>
    <p>Hello,</p>
    <p>You requested a verification code to access your account. Please use the code below:</p>
    <div class="otp-code">${otpCode}</div>
    <p><strong>This code will expire in ${expiryMinutes} minutes.</strong></p>
    <div class="info-box">
      <strong>Security Tip:</strong> Never share this code with anyone. Our team will never ask for your OTP.
    </div>
    <p>If you didn't request this code, please ignore this email or contact support if you have concerns.</p>
  `;

  const html = getEmailTemplate('Email Verification', content);

  return sendEmail({
    to: email,
    subject: `Your verification code: ${otpCode}`,
    html: html,
    skipRateLimit: true // OTP is critical, skip rate limit
  });
};

/**
 * Send welcome email after signup
 *
 * @param {Object} user - User object
 * @param {string} user.email - User email
 * @param {string} user.name - User name
 * @param {string} analystName - Analyst name (if subscribing)
 * @returns {Promise<Object>} - Send result
 */
const sendWelcomeEmail = async (user, analystName = null) => {
  const content = `
    <h2>Welcome to ${config.email.fromName}!</h2>
    <p>Hi ${user.name},</p>
    <p>Thank you for joining our community of traders and analysts. We're excited to have you on board!</p>
    ${analystName ? `
      <div class="success-box">
        You've successfully subscribed to <strong>${analystName}</strong>'s trading calls!
      </div>
    ` : ''}
    <p>Here's what you can do now:</p>
    <ul>
      <li>Browse top-performing analysts</li>
      <li>Subscribe to premium trading calls</li>
      <li>Track your favorite analysts</li>
      <li>Join community discussions</li>
    </ul>
    <a href="${config.frontend.url}/dashboard" class="button">Go to Dashboard</a>
    <p>If you have any questions, feel free to reach out to our support team.</p>
    <p>Happy Trading!</p>
  `;

  const html = getEmailTemplate('Welcome!', content);

  return sendEmail({
    to: user.email,
    subject: `Welcome to ${config.email.fromName}!`,
    html: html
  });
};

/**
 * Send subscription confirmation email
 *
 * @param {Object} user - User object
 * @param {Object} analyst - Analyst object
 * @param {Object} subscription - Subscription details
 * @returns {Promise<Object>} - Send result
 */
const sendSubscriptionConfirmation = async (user, analyst, subscription) => {
  const content = `
    <h2>Subscription Confirmed!</h2>
    <p>Hi ${user.name},</p>
    <div class="success-box">
      Your subscription to <strong>${analyst.name}</strong> is now active!
    </div>
    <p><strong>Subscription Details:</strong></p>
    <ul>
      <li><strong>Analyst:</strong> ${analyst.name}</li>
      <li><strong>Tier:</strong> ${subscription.tier}</li>
      <li><strong>Amount:</strong> ₹${subscription.amount}</li>
      <li><strong>Billing Cycle:</strong> ${subscription.billingCycle}</li>
      <li><strong>Next Renewal:</strong> ${formatDate(subscription.nextBillingDate)}</li>
    </ul>
    <p>You will now receive:</p>
    <ul>
      <li>Instant notifications for urgent trading calls</li>
      <li>Access to exclusive community chat</li>
      <li>Historical call performance data</li>
      <li>Priority support from ${analyst.name}</li>
    </ul>
    <a href="${config.frontend.url}/analyst/${analyst.id}" class="button">View Analyst Profile</a>
    <p>You can manage your subscription anytime from your account settings.</p>
  `;

  const html = getEmailTemplate('Subscription Confirmed', content);

  return sendEmail({
    to: user.email,
    subject: `Subscription Confirmed: ${analyst.name}`,
    html: html
  });
};

/**
 * Send payment failure notification
 *
 * @param {Object} user - User object
 * @param {Object} subscription - Subscription details
 * @param {string} retryDate - Next retry date
 * @returns {Promise<Object>} - Send result
 */
const sendPaymentFailure = async (user, subscription, retryDate) => {
  const content = `
    <h2>Payment Failed</h2>
    <p>Hi ${user.name},</p>
    <div class="info-box">
      We were unable to process your payment for <strong>${subscription.analystName}</strong> subscription.
    </div>
    <p><strong>Subscription Details:</strong></p>
    <ul>
      <li><strong>Amount:</strong> ₹${subscription.amount}</li>
      <li><strong>Billing Date:</strong> ${formatDate(subscription.billingDate)}</li>
      <li><strong>Next Retry:</strong> ${formatDate(retryDate)}</li>
    </ul>
    <p><strong>What happens now?</strong></p>
    <p>We will automatically retry the payment on ${formatDate(retryDate)}. If the payment fails again, your subscription will be paused after 3 attempts.</p>
    <p><strong>To avoid service interruption:</strong></p>
    <ul>
      <li>Update your payment method</li>
      <li>Ensure sufficient balance in your account</li>
      <li>Check if your card is expired</li>
    </ul>
    <a href="${config.frontend.url}/settings/billing" class="button">Update Payment Method</a>
    <p>If you have questions, please contact our support team.</p>
  `;

  const html = getEmailTemplate('Payment Failed', content);

  return sendEmail({
    to: user.email,
    subject: 'Payment Failed - Action Required',
    html: html,
    skipRateLimit: true // Payment failures are critical
  });
};

/**
 * Send password reset email
 *
 * @param {string} email - User email
 * @param {string} resetToken - Password reset token
 * @param {number} expiryHours - Token expiry in hours
 * @returns {Promise<Object>} - Send result
 */
const sendPasswordReset = async (email, resetToken, expiryHours = 1) => {
  const resetUrl = `${config.frontend.url}/reset-password?token=${resetToken}`;

  const content = `
    <h2>Reset Your Password</h2>
    <p>Hello,</p>
    <p>You requested to reset your password. Click the button below to create a new password:</p>
    <a href="${resetUrl}" class="button">Reset Password</a>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
    <p><strong>This link will expire in ${expiryHours} hour${expiryHours > 1 ? 's' : ''}.</strong></p>
    <div class="info-box">
      <strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
    </div>
  `;

  const html = getEmailTemplate('Reset Your Password', content);

  return sendEmail({
    to: email,
    subject: 'Reset Your Password',
    html: html,
    skipRateLimit: true // Password resets are critical
  });
};

/**
 * Send daily digest email
 *
 * @param {Object} user - User object
 * @param {Array} posts - Array of posts from yesterday
 * @returns {Promise<Object>} - Send result
 */
const sendDailyDigest = async (user, posts) => {
  // Group posts by analyst
  const postsByAnalyst = posts.reduce((acc, post) => {
    if (!acc[post.analystName]) {
      acc[post.analystName] = [];
    }
    acc[post.analystName].push(post);
    return acc;
  }, {});

  const totalCalls = posts.length;
  const totalAnalysts = Object.keys(postsByAnalyst).length;

  let callsHtml = '';
  for (const [analystName, analystPosts] of Object.entries(postsByAnalyst)) {
    callsHtml += `<h3 style="color: #667eea; margin-top: 30px;">${analystName}</h3>`;

    analystPosts.forEach(post => {
      const actionClass = post.action === 'BUY' ? 'action-buy' : 'action-sell';
      callsHtml += `
        <div class="call-card">
          <h4 style="margin: 0 0 10px 0;">
            ${post.stock || 'Market Update'}
            ${post.action ? `<span class="${actionClass}"> • ${post.action}</span>` : ''}
          </h4>
          ${post.entry_price ? `
            <div class="price-row">
              <span>Entry:</span>
              <strong>₹${post.entry_price}</strong>
            </div>
          ` : ''}
          ${post.target_price ? `
            <div class="price-row">
              <span>Target:</span>
              <strong>₹${post.target_price}</strong>
            </div>
          ` : ''}
          ${post.stop_loss ? `
            <div class="price-row">
              <span>Stop Loss:</span>
              <strong>₹${post.stop_loss}</strong>
            </div>
          ` : ''}
          ${post.reasoning ? `
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #6c757d;">
              <em>${post.reasoning}</em>
            </p>
          ` : ''}
        </div>
      `;
    });
  }

  const content = `
    <h2>Your Daily Trading Digest</h2>
    <p>Hi ${user.name},</p>
    <p>Here's your summary of trading calls from yesterday:</p>
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <strong style="font-size: 18px;">${totalCalls}</strong> calls from
      <strong style="font-size: 18px;">${totalAnalysts}</strong> analyst${totalAnalysts > 1 ? 's' : ''}
    </div>
    ${callsHtml}
    <a href="${config.frontend.url}/dashboard" class="button">View All Calls</a>
    <p style="margin-top: 30px; font-size: 12px; color: #6c757d;">
      You can manage your email preferences in your account settings.
    </p>
  `;

  const footerText = `
    You are receiving this daily digest because you opted in for email notifications.<br>
    <a href="${config.frontend.url}/settings/notifications" style="color: #667eea;">Manage email preferences</a>
  `;

  const html = getEmailTemplate('Daily Trading Digest', content, footerText);

  return sendEmail({
    to: user.email,
    subject: `Daily Digest: ${totalCalls} new trading calls`,
    html: html
  });
};

/**
 * Send urgent call notification
 *
 * @param {Object} user - User object
 * @param {Object} analyst - Analyst object
 * @param {Object} call - Call/post details
 * @returns {Promise<Object>} - Send result
 */
const sendUrgentCallNotification = async (user, analyst, call) => {
  const actionClass = call.action === 'BUY' ? 'action-buy' : 'action-sell';
  const actionEmoji = call.action === 'BUY' ? '📈' : '📉';

  const content = `
    <h2 style="color: #dc3545;">🔥 Urgent Trading Call</h2>
    <p>Hi ${user.name},</p>
    <p><strong>${analyst.name}</strong> just posted an urgent call:</p>
    <div class="call-card" style="border-color: #dc3545; background-color: #fff5f5;">
      <h3 style="color: #dc3545; font-size: 24px; margin: 0 0 15px 0;">
        ${actionEmoji} ${call.stock || 'Market Alert'}
        ${call.action ? `<span class="${actionClass}" style="font-size: 20px;"> • ${call.action}</span>` : ''}
      </h3>
      ${call.strategy_type ? `
        <p style="margin: 10px 0;"><strong>Strategy:</strong> ${call.strategy_type}</p>
      ` : ''}
      ${call.entry_price ? `
        <div class="price-row" style="font-size: 16px;">
          <span>Entry Price:</span>
          <strong style="color: #667eea;">₹${call.entry_price}</strong>
        </div>
      ` : ''}
      ${call.target_price ? `
        <div class="price-row" style="font-size: 16px;">
          <span>Target:</span>
          <strong style="color: #28a745;">₹${call.target_price}</strong>
        </div>
      ` : ''}
      ${call.stop_loss ? `
        <div class="price-row" style="font-size: 16px;">
          <span>Stop Loss:</span>
          <strong style="color: #dc3545;">₹${call.stop_loss}</strong>
        </div>
      ` : ''}
      ${call.risk_reward_ratio ? `
        <p style="margin: 15px 0; font-size: 16px;">
          <strong>Risk:Reward:</strong> ${call.risk_reward_ratio}
        </p>
      ` : ''}
      ${call.reasoning ? `
        <div style="margin: 15px 0; padding: 15px; background-color: white; border-radius: 6px;">
          <strong>Reasoning:</strong><br>
          <em>${call.reasoning}</em>
        </div>
      ` : ''}
    </div>
    <a href="${config.frontend.url}/post/${call.id}" class="button" style="background-color: #dc3545;">View Full Call</a>
    <p style="margin-top: 20px; font-size: 13px; color: #6c757d;">
      ⚠️ Trading involves risk. Past performance does not guarantee future results. This is not personalized advice. You are responsible for your own trading decisions.
    </p>
  `;

  const footerText = `
    You are receiving this urgent notification because you subscribed to ${analyst.name}.<br>
    <a href="${config.frontend.url}/settings/notifications" style="color: #667eea;">Manage notification preferences</a>
  `;

  const html = getEmailTemplate(`🔥 Urgent: ${analyst.name} posted ${call.stock || 'new'} call`, content, footerText);

  return sendEmail({
    to: user.email,
    subject: `🔥 Urgent: ${analyst.name} posted ${call.stock || 'new'} call`,
    html: html,
    skipRateLimit: true // Urgent calls should bypass rate limit
  });
};

/**
 * Send analyst new subscriber notification
 *
 * @param {Object} analyst - Analyst object
 * @param {Object} subscriber - Subscriber details
 * @returns {Promise<Object>} - Send result
 */
const sendNewSubscriberNotification = async (analyst, subscriber) => {
  const content = `
    <h2>🎉 New Subscriber!</h2>
    <p>Hi ${analyst.name},</p>
    <div class="success-box">
      Great news! You have a new subscriber.
    </div>
    <p><strong>Subscriber Details:</strong></p>
    <ul>
      <li><strong>Name:</strong> ${subscriber.name}</li>
      <li><strong>Tier:</strong> ${subscriber.tier}</li>
      <li><strong>Revenue:</strong> +₹${subscriber.amount}/month</li>
      <li><strong>Joined:</strong> ${formatDate(subscriber.subscribedAt)}</li>
    </ul>
    <a href="${config.frontend.url}/analyst/subscribers" class="button">View All Subscribers</a>
    <p>Keep up the great work!</p>
  `;

  const html = getEmailTemplate('New Subscriber!', content);

  return sendEmail({
    to: analyst.email,
    subject: '🎉 You have a new subscriber!',
    html: html
  });
};

/**
 * Send payout processed notification
 *
 * @param {Object} analyst - Analyst object
 * @param {Object} payout - Payout details
 * @returns {Promise<Object>} - Send result
 */
const sendPayoutProcessed = async (analyst, payout) => {
  const content = `
    <h2>💰 Payout Processed</h2>
    <p>Hi ${analyst.name},</p>
    <div class="success-box">
      Your payout has been processed successfully!
    </div>
    <p><strong>Payout Details:</strong></p>
    <ul>
      <li><strong>Amount:</strong> ₹${payout.amount}</li>
      <li><strong>Period:</strong> ${formatDate(payout.periodStart)} - ${formatDate(payout.periodEnd)}</li>
      <li><strong>Bank Account:</strong> ****${payout.lastFourDigits}</li>
      <li><strong>Status:</strong> ${payout.status}</li>
      <li><strong>Estimated Arrival:</strong> ${payout.estimatedArrival}</li>
    </ul>
    <a href="${config.frontend.url}/analyst/payouts" class="button">View Payout History</a>
    <p>The funds should arrive in your bank account within 2-3 business days.</p>
  `;

  const html = getEmailTemplate('Payout Processed', content);

  return sendEmail({
    to: analyst.email,
    subject: `💰 Payout Processed: ₹${payout.amount}`,
    html: html
  });
};

/**
 * Send new review notification to analyst
 *
 * @param {Object} analyst - Analyst object
 * @param {Object} review - Review details
 * @returns {Promise<Object>} - Send result
 */
const sendNewReviewNotification = async (analyst, review) => {
  const stars = '⭐'.repeat(review.rating);

  const content = `
    <h2>📝 New Review Received</h2>
    <p>Hi ${analyst.name},</p>
    <div class="success-box">
      You received a new review!
    </div>
    <p><strong>Rating:</strong> ${stars} (${review.rating}/5)</p>
    ${review.reviewText ? `
      <div class="call-card">
        <p style="margin: 0; font-style: italic;">"${review.reviewText}"</p>
        <p style="margin: 10px 0 0 0; text-align: right; color: #6c757d; font-size: 14px;">
          - ${review.reviewerName}
        </p>
      </div>
    ` : ''}
    <p>Take a moment to respond and show your appreciation!</p>
    <a href="${config.frontend.url}/analyst/reviews" class="button">View & Respond</a>
    <p style="margin-top: 20px; font-size: 13px; color: #6c757d;">
      💡 Tip: Responding to reviews builds trust with your subscribers and shows you value their feedback.
    </p>
  `;

  const html = getEmailTemplate('New Review', content);

  return sendEmail({
    to: analyst.email,
    subject: `⭐ New Review: ${review.rating} stars`,
    html: html
  });
};

/**
 * Send analyst response notification to reviewer
 *
 * @param {Object} reviewer - Reviewer object
 * @param {Object} response - Response details
 * @returns {Promise<Object>} - Send result
 */
const sendAnalystResponseNotification = async (reviewer, response) => {
  const content = `
    <h2>💬 Analyst Responded to Your Review</h2>
    <p>Hi ${reviewer.name},</p>
    <div class="info-box">
      <strong>${response.analystName}</strong> responded to your review!
    </div>
    <p><strong>Your Review:</strong></p>
    <div class="call-card" style="background-color: #f8f9fa;">
      <p style="margin: 0; font-style: italic;">"${response.reviewText}"</p>
    </div>
    <p><strong>Analyst Response:</strong></p>
    <div class="call-card" style="background-color: #fff3cd; border-left: 4px solid #667eea;">
      <p style="margin: 0; color: #333;">
        <strong>📝 ${response.analystName}:</strong><br>
        "${response.response}"
      </p>
    </div>
    <a href="${config.frontend.url}/analyst/${response.analystId}" class="button">View Full Review</a>
    <p>Thank you for being part of our community!</p>
  `;

  const footerText = `
    You are receiving this notification because ${response.analystName} responded to your review.
  `;

  const html = getEmailTemplate('Analyst Responded', content, footerText);

  return sendEmail({
    to: reviewer.email,
    subject: `${response.analystName} responded to your review`,
    html: html
  });
};

/**
 * Clean up expired rate limit entries (run periodically)
 */
const cleanupRateLimits = () => {
  const now = Date.now();
  let cleaned = 0;

  for (const [email, limit] of rateLimitMap.entries()) {
    if (now > limit.resetAt) {
      rateLimitMap.delete(email);
      cleaned++;
    }
  }

  if (cleaned > 0 && config.isDevelopment) {
    console.log(`Cleaned up ${cleaned} expired rate limit entries`);
  }
};

// Run cleanup every hour
setInterval(cleanupRateLimits, 60 * 60 * 1000);

module.exports = {
  sendEmail,
  sendOtpEmail,
  sendWelcomeEmail,
  sendSubscriptionConfirmation,
  sendPaymentFailure,
  sendPasswordReset,
  sendDailyDigest,
  sendUrgentCallNotification,
  sendNewSubscriberNotification,
  sendPayoutProcessed,
  sendNewReviewNotification,
  sendAnalystResponseNotification,
  getEmailTemplate,
  checkRateLimit,
  cleanupRateLimits
};
