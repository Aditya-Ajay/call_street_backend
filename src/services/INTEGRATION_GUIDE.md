# Integration Guide: Using All Third-Party Services Together

This guide shows how to integrate the AI, Email, and SMS services in your application routes and controllers.

## Table of Contents
1. [Complete User Registration Flow](#complete-user-registration-flow)
2. [Analyst Call Publishing Flow](#analyst-call-publishing-flow)
3. [Subscription Purchase Flow](#subscription-purchase-flow)
4. [Error Handling Patterns](#error-handling-patterns)

---

## Complete User Registration Flow

This example shows how to use **SMS Service** and **Email Service** together for user registration with OTP verification.

### Route: POST /api/auth/register

```javascript
const { sendOTPSMS } = require('../services/smsService');
const { sendWelcomeEmail } = require('../services/emailService');
const { generateOTP } = require('../utils/helpers');

const register = async (req, res) => {
  try {
    const { name, email, phone, role } = req.body;

    // 1. Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // 2. Generate OTP
    const otpCode = generateOTP(6);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // 3. Send OTP via SMS (with email fallback)
    const smsResult = await sendOTPSMS(phone, otpCode, email);

    if (!smsResult.success) {
      // If SMS completely failed without fallback
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification code. Please try again.'
      });
    }

    // 4. Store OTP in database or cache
    await OTP.create({
      phone,
      email,
      code: otpCode,
      expiresAt: otpExpiry
    });

    // 5. Return success with method used
    res.status(200).json({
      success: true,
      message: smsResult.method === 'email'
        ? 'OTP sent to your email (SMS unavailable)'
        : 'OTP sent to your phone',
      method: smsResult.method,
      expiresIn: 600 // seconds
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
};
```

### Route: POST /api/auth/verify-otp

```javascript
const verifyOTP = async (req, res) => {
  try {
    const { phone, email, code } = req.body;

    // 1. Verify OTP
    const otpRecord = await OTP.findOne({ phone, email, code });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code'
      });
    }

    if (new Date() > otpRecord.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new one.'
      });
    }

    // 2. Create user account
    const user = await User.create({
      name: req.body.name,
      email,
      phone,
      role: req.body.role,
      phoneVerified: true
    });

    // 3. Send welcome email (async, don't wait)
    sendWelcomeEmail(user).catch(err => {
      console.error('Failed to send welcome email:', err);
      // Don't fail the request if welcome email fails
    });

    // 4. Generate JWT token
    const token = generateToken(user);

    // 5. Return success
    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      }
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
};
```

---

## Analyst Call Publishing Flow

This example shows how to use **AI Service** to format analyst calls, with fallback to manual posting.

### Route: POST /api/posts/create

```javascript
const { formatAnalystCall, getFallbackFormat } = require('../services/aiService');
const { sendUrgentCallNotification } = require('../services/emailService');

const createPost = async (req, res) => {
  try {
    const { rawText, language, isUrgent } = req.body;
    const analystId = req.user.id; // From JWT middleware

    let formattedCall;
    let aiFormatted = false;

    // 1. Try AI formatting
    const aiResult = await formatAnalystCall(rawText, language);

    if (aiResult.success) {
      formattedCall = aiResult.data;
      aiFormatted = true;
      console.log(`AI formatted call: ${aiResult.metadata.latencyMs}ms, ${aiResult.metadata.tokensUsed} tokens`);
    } else {
      // 2. Fallback to manual format if AI fails
      console.warn('AI formatting failed, using fallback:', aiResult.error);
      formattedCall = getFallbackFormat(rawText);
    }

    // 3. Validate required fields (even for fallback)
    if (!formattedCall.stock && !formattedCall.reasoning) {
      return res.status(400).json({
        success: false,
        message: 'Post must contain either a stock symbol or description'
      });
    }

    // 4. Create post in database
    const post = await Post.create({
      analystId,
      rawText,
      stock: formattedCall.stock,
      action: formattedCall.action,
      strategyType: formattedCall.strategy_type,
      entryPrice: formattedCall.entry_price,
      targetPrice: formattedCall.target_price,
      stopLoss: formattedCall.stop_loss,
      confidence: formattedCall.confidence,
      reasoning: formattedCall.reasoning,
      riskRewardRatio: formattedCall.risk_reward_ratio,
      timeHorizon: formattedCall.time_horizon,
      isUrgent,
      aiFormatted
    });

    // 5. If urgent, notify all subscribers (async)
    if (isUrgent) {
      const subscribers = await Subscription.getActiveSubscribers(analystId);
      const analyst = await User.findById(analystId);

      // Send notifications in background (don't wait)
      subscribers.forEach(subscriber => {
        sendUrgentCallNotification(subscriber, analyst, post).catch(err => {
          console.error(`Failed to send notification to ${subscriber.email}:`, err);
        });
      });
    }

    // 6. Return success
    res.status(201).json({
      success: true,
      message: aiFormatted
        ? 'Call published successfully'
        : 'Call published (AI formatting unavailable)',
      data: {
        post,
        aiFormatted,
        notificationsSent: isUrgent ? subscribers.length : 0
      }
    });

  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish call. Please try again.'
    });
  }
};
```

---

## Subscription Purchase Flow

This example shows how to integrate **Email Service** after successful payment.

### Route: POST /api/subscriptions/create (after Razorpay payment)

```javascript
const { sendSubscriptionConfirmation } = require('../services/emailService');
const { sendTransactionalSMS } = require('../services/smsService');

const createSubscription = async (req, res) => {
  try {
    const { analystId, tier, paymentId, orderId } = req.body;
    const userId = req.user.id;

    // 1. Verify payment with Razorpay
    const payment = await razorpay.payments.fetch(paymentId);
    if (payment.status !== 'captured') {
      return res.status(400).json({
        success: false,
        message: 'Payment not confirmed'
      });
    }

    // 2. Create subscription
    const subscription = await Subscription.create({
      userId,
      analystId,
      tier,
      amount: payment.amount / 100, // Convert paise to rupees
      status: 'active',
      paymentId,
      orderId,
      startDate: new Date(),
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });

    // 3. Get user and analyst details
    const user = await User.findById(userId);
    const analyst = await User.findById(analystId);

    // 4. Send confirmation email (async, don't wait)
    sendSubscriptionConfirmation(user, analyst, subscription).catch(err => {
      console.error('Failed to send subscription confirmation email:', err);
    });

    // 5. Send SMS notification (optional)
    const smsMessage = `Subscription confirmed! You are now subscribed to ${analyst.name}. Amount: ₹${subscription.amount}`;
    sendTransactionalSMS(user.phone, smsMessage).catch(err => {
      console.error('Failed to send subscription SMS:', err);
    });

    // 6. Return success immediately (don't wait for emails/SMS)
    res.status(201).json({
      success: true,
      message: 'Subscription activated successfully',
      data: {
        subscription,
        analyst: {
          id: analyst.id,
          name: analyst.name,
          profileImage: analyst.profileImage
        }
      }
    });

  } catch (error) {
    console.error('Subscription creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate subscription. Please contact support.'
    });
  }
};
```

---

## Error Handling Patterns

### Pattern 1: Graceful Degradation

When external services fail, don't block the main operation:

```javascript
// Good: Service failure doesn't break the main flow
const post = await Post.create(postData);

// Send notifications in background
sendUrgentCallNotification(user, analyst, post).catch(err => {
  console.error('Notification failed (non-critical):', err);
  // Log to monitoring service, but don't fail the request
});

res.status(201).json({ success: true, data: post });
```

```javascript
// Bad: Service failure breaks the main operation
const post = await Post.create(postData);

// This will throw if email fails
await sendUrgentCallNotification(user, analyst, post);

res.status(201).json({ success: true, data: post });
```

### Pattern 2: Fallback Strategy

Implement fallbacks for critical operations:

```javascript
// Try SMS first, fallback to email
const otpResult = await sendOTPSMS(phone, otpCode, email);

if (otpResult.method === 'email') {
  // SMS failed, but OTP was sent via email
  console.log('SMS fallback to email successful');
}

// Or handle manually:
try {
  await sendOTPSMS(phone, otpCode);
} catch (error) {
  console.error('SMS failed, trying email:', error);
  await sendOtpEmail(email, otpCode);
}
```

### Pattern 3: Retry with Backoff

For transient failures:

```javascript
const { formatWithRetry } = require('../services/aiService');

// Automatically retries on timeout/rate limit
const result = await formatWithRetry(rawText);

if (!result.success && !result.shouldRetry) {
  // Permanent failure, use fallback
  formattedCall = getFallbackFormat(rawText);
}
```

### Pattern 4: User-Friendly Error Messages

Never expose internal errors to users:

```javascript
try {
  await sendOTPSMS(phone, otpCode);
} catch (error) {
  // Log internal error
  console.error('SMS send error:', error);

  // Return user-friendly message
  res.status(500).json({
    success: false,
    message: 'Failed to send verification code. Please try again or use email verification.'
  });
}
```

---

## Background Job Integration

For scheduled tasks (daily digests, payment retries):

### Cron Job: Send Daily Digests

```javascript
const cron = require('node-cron');
const { sendDailyDigest } = require('../services/emailService');

// Run daily at 8:00 AM IST
cron.schedule('0 8 * * *', async () => {
  console.log('Starting daily digest job...');

  try {
    // Get all users who enabled daily digest
    const users = await User.findAll({
      where: { emailPreferences: { dailyDigest: true } }
    });

    for (const user of users) {
      // Get yesterday's posts from user's subscribed analysts
      const posts = await Post.getYesterdaysPosts(user.id);

      if (posts.length > 0) {
        await sendDailyDigest(user, posts);
        console.log(`Daily digest sent to ${user.email}`);
      }
    }

    console.log(`Daily digest job completed. Sent to ${users.length} users.`);
  } catch (error) {
    console.error('Daily digest job failed:', error);
  }
});
```

---

## Testing Your Integration

### 1. Test AI Service

```javascript
// Test in development mode
const testAI = async () => {
  const result = await formatAnalystCall(
    "RELIANCE ko 2450 pe khareed lo target 2480 stop 2430",
    "hinglish"
  );

  console.log('AI Result:', result);
  // Should extract: stock=RELIANCE, action=BUY, entry=2450, etc.
};
```

### 2. Test SMS Service (Development Mode)

```javascript
// In development, SMS is logged to console instead of sent
const testSMS = async () => {
  const result = await sendOTPSMS('+919876543210', '123456');
  console.log('SMS Result:', result);
  // Check console for OTP log
};
```

### 3. Test Email Service

```javascript
// Use a test email address
const testEmail = async () => {
  const result = await sendOtpEmail('test@example.com', '123456', 10);
  console.log('Email Result:', result);
  // Check Resend dashboard for email
};
```

---

## Production Checklist

Before deploying to production:

- [ ] All API keys configured in `.env`
- [ ] Environment variables validated (`NODE_ENV=production`)
- [ ] Rate limiting tested and configured
- [ ] Error logging enabled (connect to monitoring service)
- [ ] Cost tracking alerts configured
- [ ] Fallback strategies tested
- [ ] Email templates reviewed (mobile responsive)
- [ ] SMS delivery tested with real Indian numbers
- [ ] AI accuracy validated with test dataset
- [ ] Budget limits configured (daily/monthly)

---

## Monitoring & Alerts

Set up alerts for:

1. **High API Costs**
   - Alert if daily SMS cost > ₹200
   - Alert if Claude API cost > ₹500/day

2. **Service Failures**
   - Alert if SMS failure rate > 10%
   - Alert if email delivery rate < 95%
   - Alert if AI accuracy < 90%

3. **Rate Limit Warnings**
   - Alert if rate limits hit frequently
   - Review and adjust limits

4. **Performance Issues**
   - Alert if AI latency > 5s (P95)
   - Alert if email send time > 15s

---

## Support & Troubleshooting

If you encounter issues:

1. Check service status:
   - Claude API: https://status.anthropic.com
   - Resend: https://resend.com/status
   - Twilio: https://status.twilio.com

2. Review logs for error details

3. Test in development mode first

4. Verify environment variables are set

5. Check API key validity

6. Review rate limits and quotas

For more help, see:
- `README.md` - Service documentation
- `analyst_platform_prd.md` - Product requirements
- Individual service files for implementation details
