# Authentication API Testing Guide

Complete guide for testing all 9 authentication endpoints using cURL, Postman, or any HTTP client.

---

## Base URL

```
Development: http://localhost:5000
Production: https://api.yourplatform.com
```

---

## Endpoint Reference

| # | Method | Endpoint | Description | Auth Required |
|---|--------|----------|-------------|---------------|
| 1 | POST | /api/auth/signup/phone | Send OTP to phone for signup | No |
| 2 | POST | /api/auth/signup/email | Send OTP to email for signup | No |
| 3 | POST | /api/auth/verify-otp | Verify OTP and create account/login | No |
| 4 | POST | /api/auth/resend-otp | Resend OTP | No |
| 5 | POST | /api/auth/login | Login with email + password | No |
| 6 | POST | /api/auth/refresh-token | Refresh access token | Cookie |
| 7 | POST | /api/auth/logout | Logout and revoke tokens | Yes |
| 8 | POST | /api/auth/forgot-password | Request password reset email | No |
| 9 | POST | /api/auth/reset-password | Reset password with token | No |

---

## 1. Phone OTP Signup

### Request OTP

```bash
curl -X POST http://localhost:5000/api/auth/signup/phone \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "user_type": "trader"
  }'
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "OTP sent to +91******3210",
  "data": {
    "phone": "+91******3210",
    "expiresIn": 360,
    "purpose": "signup"
  }
}
```

**Error Response - Already Registered (409 Conflict):**
```json
{
  "success": false,
  "message": "Phone number already registered. Please login instead"
}
```

**Error Response - Invalid Phone (400 Bad Request):**
```json
{
  "success": false,
  "errors": [
    {
      "field": "phone",
      "message": "Invalid phone number. Use +91XXXXXXXXXX format"
    }
  ]
}
```

**Error Response - Rate Limited (429 Too Many Requests):**
```json
{
  "success": false,
  "error": "Please wait 45 seconds before requesting a new OTP"
}
```

---

## 2. Email OTP Signup

### Request OTP

```bash
curl -X POST http://localhost:5000/api/auth/signup/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "trader@example.com",
    "user_type": "trader"
  }'
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "OTP sent to t****r@example.com",
  "data": {
    "email": "t****r@example.com",
    "expiresIn": 360,
    "purpose": "signup"
  }
}
```

---

## 3. Verify OTP (Phone or Email)

### Verify Phone OTP

```bash
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "phone": "+919876543210",
    "otp": "123456",
    "user_type": "trader"
  }'
```

### Verify Email OTP

```bash
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "trader@example.com",
    "otp": "654321",
    "user_type": "analyst"
  }'
```

**Success Response - New User (201 Created):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "trader@example.com",
      "phone": null,
      "user_type": "analyst",
      "email_verified": true,
      "phone_verified": false,
      "created_at": "2025-10-08T12:00:00.000Z"
    },
    "isNewUser": true
  }
}
```

**Success Response - Existing User Login (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "trader@example.com",
      "phone": "+91******3210",
      "user_type": "trader",
      "email_verified": true,
      "phone_verified": true
    },
    "isNewUser": false
  }
}
```

**Cookies Set:**
- `accessToken` - HttpOnly, 7 days expiry, path=/
- `refreshToken` - HttpOnly, 30 days expiry, path=/api/auth/refresh

**Error Response - Invalid OTP (400 Bad Request):**
```json
{
  "success": false,
  "message": "Invalid OTP. 2 attempt(s) remaining"
}
```

**Error Response - OTP Expired (400 Bad Request):**
```json
{
  "success": false,
  "message": "OTP expired. Please request a new one"
}
```

**Error Response - Too Many Attempts (400 Bad Request):**
```json
{
  "success": false,
  "error": "Too many failed attempts. Account locked for 15 minutes",
  "code": "OTP_LOCKED",
  "locked": true,
  "retryAfter": 900
}
```

---

## 4. Resend OTP

### Resend Phone OTP

```bash
curl -X POST http://localhost:5000/api/auth/resend-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210"
  }'
```

### Resend Email OTP

```bash
curl -X POST http://localhost:5000/api/auth/resend-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "trader@example.com"
  }'
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "OTP resent successfully",
  "data": {
    "phone": "+91******3210",
    "expiresIn": 360
  }
}
```

---

## 5. Login with Password

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "trader@example.com",
    "password": "SecurePass123!"
  }'
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "trader@example.com",
      "phone": "+91******3210",
      "user_type": "trader",
      "email_verified": true,
      "phone_verified": true
    }
  }
}
```

**Error Response - Invalid Credentials (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid email or password. 4 attempt(s) remaining"
}
```

**Error Response - Account Locked (403 Forbidden):**
```json
{
  "success": false,
  "error": "Too many failed login attempts. Account locked for 15 minutes"
}
```

---

## 6. Refresh Access Token

```bash
curl -X POST http://localhost:5000/api/auth/refresh-token \
  -b cookies.txt \
  -c cookies.txt
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Token refreshed successfully"
}
```

**New Cookie Set:**
- `accessToken` - New token with extended expiry

**Error Response - No Refresh Token (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Refresh token required"
}
```

**Error Response - Invalid Refresh Token (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid refresh token"
}
```

---

## 7. Logout

```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -b cookies.txt
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Cookies Cleared:**
- `accessToken`
- `refreshToken`

**Error Response - No Session (400 Bad Request):**
```json
{
  "success": false,
  "error": "No active session found"
}
```

---

## 8. Forgot Password

```bash
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "trader@example.com"
  }'
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "If an account exists with this email, you will receive password reset instructions"
}
```

**Note:** Response is always the same (security - no email enumeration)

**Email Sent:**
Subject: Reset Your Password - Analyst Marketplace
Body: Contains reset link: `http://localhost:3000/reset-password?token=<64-char-hex>`
Token Expiry: 1 hour

---

## 9. Reset Password

```bash
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "a1b2c3d4e5f6...64-character-hex-token-from-email",
    "new_password": "NewSecurePass456!"
  }'
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Password reset successfully. You can now login with your new password"
}
```

**Error Response - Invalid Token (400 Bad Request):**
```json
{
  "success": false,
  "message": "Invalid or expired reset token"
}
```

**Error Response - Weak Password (400 Bad Request):**
```json
{
  "success": false,
  "message": "Password too weak: Password must contain uppercase letter, Password must contain special character"
}
```

---

## Postman Collection

### Environment Variables

```
BASE_URL: http://localhost:5000
```

### Pre-request Script (for authenticated requests)

```javascript
// Automatically sets access token from cookies
pm.request.headers.add({
  key: 'Cookie',
  value: pm.environment.get('accessToken')
});
```

### Test Scripts

**For Login/Verify OTP endpoints:**
```javascript
// Save tokens to environment
const cookies = pm.cookies.toObject();
pm.environment.set('accessToken', `accessToken=${cookies.accessToken}`);
pm.environment.set('refreshToken', `refreshToken=${cookies.refreshToken}`);
```

---

## Testing Flows

### Flow 1: Phone OTP Signup → Login

1. POST /api/auth/signup/phone
2. Check SMS for OTP
3. POST /api/auth/verify-otp (creates account)
4. POST /api/auth/logout
5. POST /api/auth/signup/phone (same phone)
6. POST /api/auth/verify-otp (logs in existing user)

### Flow 2: Email OTP Signup → Password Login

1. POST /api/auth/signup/email
2. Check email for OTP
3. POST /api/auth/verify-otp (creates account)
4. POST /api/auth/logout
5. POST /api/auth/login (with email + password)

### Flow 3: Password Reset

1. POST /api/auth/forgot-password
2. Check email for reset link
3. Extract token from link
4. POST /api/auth/reset-password
5. POST /api/auth/login (with new password)

### Flow 4: Token Refresh

1. POST /api/auth/login
2. Wait 30 seconds
3. POST /api/auth/refresh-token
4. Continue making authenticated requests

---

## Rate Limiting Tests

### Test OTP Rate Limit (3 per 15 min)

```bash
# Send 4 OTP requests quickly
for i in {1..4}; do
  curl -X POST http://localhost:5000/api/auth/signup/phone \
    -H "Content-Type: application/json" \
    -d '{"phone": "+919876543210"}';
  echo "\nRequest $i completed\n";
done
```

**Expected:** 4th request returns 429 Too Many Requests

### Test Login Rate Limit (5 per 15 min)

```bash
# Try 6 login attempts
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "password": "wrong"}';
  echo "\nAttempt $i completed\n";
done
```

**Expected:** 6th request returns 429 Too Many Requests

### Test Account Lockout (5 failed logins)

```bash
# Try 5 wrong passwords
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "trader@example.com", "password": "WrongPassword"}';
  echo "\nFailed login $i\n";
done
```

**Expected:** 5th attempt returns 403 Forbidden (account locked)

---

## Error Codes Reference

| Status Code | Meaning | Common Causes |
|-------------|---------|---------------|
| 200 | OK | Successful request |
| 201 | Created | New user account created |
| 400 | Bad Request | Invalid input, validation error |
| 401 | Unauthorized | Invalid credentials, expired token |
| 403 | Forbidden | Account locked, suspended |
| 409 | Conflict | Email/phone already registered |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error, database error |

---

## Development Mode Notes

In development mode (`NODE_ENV=development`):

1. **SMS OTPs are NOT sent** - OTP is logged to console instead
2. **Email OTPs are NOT sent** - OTP is logged to console instead
3. **Console logs show:**
   ```
   === DEVELOPMENT MODE - SMS NOT SENT ===
   To: +919876543210
   OTP: 123456
   ========================================
   ```

4. **To test with actual SMS/Email:**
   - Set `TWILIO_*` and `RESEND_*` environment variables
   - OTPs will be sent to real phone/email

---

## Common Testing Issues

### Issue: Cookies not being set

**Solution:** Ensure you're using `-c cookies.txt` (cURL) or enable cookie storage (Postman)

### Issue: "Refresh token required"

**Solution:** The refresh token is sent only to `/api/auth/refresh` endpoint. Make sure the request includes cookies.

### Issue: "OTP not found or expired"

**Solution:**
- Check if 6 minutes passed (OTP expired)
- Verify you're using the same phone/email in both requests
- Check console logs for the actual OTP in development mode

### Issue: "Invalid phone number format"

**Solution:** Phone must be in format `+91XXXXXXXXXX` (country code + 10 digits starting with 6-9)

---

## Security Notes

1. **Never log sensitive data** in production (passwords, OTPs, tokens)
2. **Always use HTTPS** in production
3. **Rotate JWT secrets** regularly
4. **Monitor rate limit violations** for potential attacks
5. **Set up alerts** for account lockouts
6. **Review audit logs** regularly

---

## Next Steps

After authentication is working:

1. Test protected endpoints (requires authentication)
2. Implement profile management
3. Add role-based access control testing
4. Set up automated integration tests
5. Load test authentication endpoints

---

**Testing Status: Ready for QA**

All 9 endpoints are implemented and ready for testing. Use this guide to validate all functionality and edge cases.
