# Third-Party Integration Services

This directory contains all third-party API integrations for the Analyst Marketplace Platform.

## Services Overview

### 1. AI Service (Claude API)
**File:** `aiService.js`
**Provider:** Anthropic Claude API
**Purpose:** Format raw analyst text/voice input into structured trading calls

#### Features
- Extract trading information (stock, action, prices, confidence)
- Handle multilingual input (English, Hindi, Hinglish)
- Hallucination prevention (never invents data)
- Automatic risk:reward calculation
- Rate limiting and cost tracking
- Fallback to manual posting on failure

#### Usage Example
```javascript
const { formatAnalystCall } = require('./services/aiService');

// Format analyst call
const result = await formatAnalystCall(
  "NIFTY buy at 19500 target 19600 stop loss 19450 high confidence",
  "en"
);

if (result.success) {
  console.log(result.data);
  // {
  //   stock: "NIFTY",
  //   action: "BUY",
  //   entry_price: 19500,
  //   target_price: 19600,
  //   stop_loss: 19450,
  //   confidence: "HIGH",
  //   risk_reward_ratio: "1:2",
  //   ...
  // }
}
```

#### Configuration
```env
CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
CLAUDE_MODEL=claude-sonnet-4-5-20250929
```

#### Cost & Performance
- **Cost:** ~₹0.50 per API call (based on 500 tokens average)
- **Latency:** Target <2s (P50), <4s (P95)
- **Budget:** ₹15,000/month for 100 analysts × 5 posts/day
- **Accuracy:** >95% extraction accuracy

---

### 2. Email Service (Resend)
**File:** `emailService.js`
**Provider:** Resend
**Purpose:** Send transactional emails with HTML templates

#### Features
- OTP verification emails
- Welcome emails
- Subscription confirmations
- Payment failure notifications
- Password reset emails
- Daily digest emails
- Urgent call notifications
- Rate limiting (max 10 emails/hour per recipient)
- Responsive HTML templates
- Automatic retry on failure

#### Usage Example
```javascript
const {
  sendOtpEmail,
  sendWelcomeEmail,
  sendUrgentCallNotification
} = require('./services/emailService');

// Send OTP email
await sendOtpEmail('user@example.com', '123456', 10);

// Send welcome email
await sendWelcomeEmail({ email: 'user@example.com', name: 'John' });

// Send urgent call notification
await sendUrgentCallNotification(user, analyst, callData);
```

#### Configuration
```env
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=noreply@analystplatform.com
EMAIL_FROM_NAME=Analyst Marketplace
```

#### Email Templates
All emails use responsive HTML templates with:
- Mobile-friendly design
- Consistent branding
- Clear CTAs
- Unsubscribe links (where applicable)
- Security warnings (for OTP/password reset)

#### Rate Limiting
- **Max:** 10 emails per hour per recipient
- **Window:** 60 minutes
- **Critical emails** (OTP, password reset) skip rate limiting

---

### 3. SMS Service (Twilio)
**File:** `smsService.js`
**Provider:** Twilio
**Purpose:** Send SMS OTP and transactional messages

#### Features
- OTP delivery via SMS
- Rate limiting (3 SMS per 15 min, 5 per hour)
- Cost tracking (₹0.80 per SMS)
- Indian phone number validation (+91XXXXXXXXXX)
- Fallback to email if SMS fails
- Daily budget protection
- Delivery status verification
- Development mode (logs OTP without sending)

#### Usage Example
```javascript
const { sendOTPSMS, verifySmsDelivery } = require('./services/smsService');

// Send OTP via SMS
const result = await sendOTPSMS('+919876543210', '123456', 'user@example.com');

if (result.success) {
  console.log(`SMS sent: ${result.messageSid}`);

  // Verify delivery status
  const status = await verifySmsDelivery(result.messageSid);
  console.log(status);
}
```

#### Configuration
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Cost Tracking
- **Per SMS:** ₹0.80 (India)
- **Daily Budget:** ₹333 (₹10,000/month ÷ 30)
- **Monthly Budget:** ₹10,000
- **Automatic shutdown** when daily budget exceeded

#### Rate Limits
- **Max:** 3 SMS per 15 minutes per phone number
- **Max:** 5 SMS per hour per phone number
- **Min interval:** 60 seconds between SMS to same number

---

## Error Handling

All services implement comprehensive error handling:

### Success Response
```javascript
{
  success: true,
  data: { /* service-specific data */ },
  metadata: { /* timestamps, costs, etc. */ }
}
```

### Error Response
```javascript
{
  success: false,
  error: "Human-readable error message",
  shouldRetry: true, // For transient failures
  fallback: true // If fallback available
}
```

### Retry Logic
All services implement exponential backoff:
- **Initial delay:** 1 second
- **Max retries:** 2
- **Backoff multiplier:** 2x (1s, 2s, 4s)

---

## Security Best Practices

### 1. API Key Protection
- Never commit API keys to Git
- Use environment variables (`.env`)
- Rotate keys regularly
- Use different keys for dev/staging/production

### 2. Rate Limiting
- Prevent abuse and cost overruns
- Implemented at application level
- Track per user/phone/email

### 3. Input Validation
- Validate all inputs before sending to external APIs
- Sanitize user data
- Mask sensitive data in logs (phone, email)

### 4. Timeout Protection
- All API calls have 5-10 second timeouts
- Prevent hanging requests
- Fail fast and fallback

---

## Monitoring & Logging

### Cost Tracking
All services log usage for cost monitoring:

```javascript
// AI Service
{
  service: 'claude-api',
  tokensUsed: 542,
  costInr: 0.407,
  latencyMs: 1823,
  success: true
}

// SMS Service
{
  service: 'twilio-sms',
  phone: '+91******3210',
  costInr: 0.80,
  status: 'delivered',
  messageSid: 'SM...',
  dailyTotal: 15.20,
  dailyCount: 19
}
```

### Analytics Functions
```javascript
// Get SMS cost summary
const { getSmsCostSummary } = require('./services/smsService');
const summary = getSmsCostSummary();
// { today: { count: 19, cost: 15.20, date: '2025-10-08' }, ... }
```

---

## Testing

### Development Mode
All services detect development environment and provide testing modes:

**SMS Service:**
```bash
=== DEVELOPMENT MODE - SMS NOT SENT ===
To: +919876543210
OTP: 123456
========================================
```

**Email Service:**
- Emails sent normally in dev (use test email)
- Or configure Resend test mode

**AI Service:**
- Works normally (uses real API)
- Monitor token usage in logs

### Production Mode
- Set `NODE_ENV=production`
- All services use real API credentials
- Full cost tracking enabled
- Rate limiting enforced

---

## Troubleshooting

### Common Issues

#### 1. "Claude API not initialized"
**Cause:** Missing or invalid `CLAUDE_API_KEY`
**Solution:** Check `.env` file, verify API key is valid

#### 2. "SMS rate limit exceeded"
**Cause:** Too many SMS to same number
**Solution:** User must wait (shown in error message), or use email OTP fallback

#### 3. "Email rate limit exceeded"
**Cause:** Too many emails to same address
**Solution:** User must wait 1 hour, or critical emails skip rate limit

#### 4. "Daily SMS budget exceeded"
**Cause:** Cost exceeded ₹333 for the day
**Solution:** Automatically falls back to email, resets next day

#### 5. "Twilio API timeout"
**Cause:** Network issues or Twilio downtime
**Solution:** Automatic retry, then fallback to email

---

## Fallback Strategy

### AI Service
```
Claude API fails → Manual posting allowed (raw text)
```

### SMS Service
```
SMS fails → Email OTP automatically sent
Rate limit → Email OTP automatically sent
Budget exceeded → Email OTP automatically sent
```

### Email Service
```
Resend fails → Log error, retry once
Rate limit → Critical emails skip limit
```

---

## API Reference

### AI Service

#### `formatAnalystCall(rawText, language)`
Format raw analyst text into structured trading call.

**Parameters:**
- `rawText` (string): Raw input from analyst
- `language` (string): 'en', 'hi', or 'hinglish' (default: 'en')

**Returns:** `Promise<Object>`

#### `validateFormattedCall(callData)`
Validate AI output against schema.

#### `calculateRiskReward(entry, target, stopLoss)`
Calculate risk:reward ratio.

---

### Email Service

#### `sendOtpEmail(email, otpCode, expiryMinutes)`
Send OTP verification email.

#### `sendWelcomeEmail(user, analystName)`
Send welcome email after signup.

#### `sendSubscriptionConfirmation(user, analyst, subscription)`
Send subscription confirmation.

#### `sendUrgentCallNotification(user, analyst, call)`
Send urgent call notification.

---

### SMS Service

#### `sendOTPSMS(phone, otpCode, email)`
Send OTP via SMS with email fallback.

**Parameters:**
- `phone` (string): Phone number (auto-formatted to +91XXXXXXXXXX)
- `otpCode` (string): 6-digit OTP
- `email` (string, optional): Fallback email if SMS fails

**Returns:** `Promise<Object>`

#### `verifySmsDelivery(messageSid)`
Check SMS delivery status.

#### `getSmsCostSummary()`
Get current SMS cost summary.

---

## Environment Variables Summary

```bash
# Claude API
CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
CLAUDE_MODEL=claude-sonnet-4-5-20250929

# Resend Email
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=noreply@analystplatform.com
EMAIL_FROM_NAME=Analyst Marketplace

# Twilio SMS
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Support

For integration issues, contact:
- Integration Engineer
- Check logs in development mode
- Review PRD: `analyst_platform_prd.md`
