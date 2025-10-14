# Analyst Onboarding - Quick Testing Guide

## Prerequisites

1. **Database Migration:**
   ```bash
   psql "postgresql://aditya@localhost:5433/analyst_platform" -f migrations/025_add_profile_completed_to_users.sql
   ```

2. **Backend Server Running:**
   ```bash
   npm run dev
   # Server should be running on http://localhost:8080
   ```

---

## Test Case 1: New Analyst Signup

### Step 1: Request OTP
```bash
curl -X POST http://localhost:8080/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "9876543210"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "OTP sent to ******3210",
  "data": {
    "phone": "******3210",
    "expiresIn": 600000
  }
}
```

### Step 2: Verify OTP with user_type = 'analyst'
```bash
curl -X POST http://localhost:8080/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "9876543210",
    "otp": "YOUR_OTP_HERE",
    "user_type": "analyst"
  }' \
  -c cookies.txt
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": {
      "id": "...",
      "phone": "******3210",
      "user_type": "analyst",
      "profile_completed": false,  // ← KEY FIELD
      "created_at": "2025-10-09T..."
    },
    "isNewUser": true
  }
}
```

**✅ Verify:** `profile_completed` is `false` for new analyst

---

## Test Case 2: Complete Onboarding

### Step 3: Complete Profile Setup
```bash
curl -X POST http://localhost:8080/api/analysts/profile/setup \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "display_name": "John Doe",
    "bio": "Experienced stock market analyst with 5+ years of expertise in technical analysis and swing trading. I help retail traders make informed decisions.",
    "specializations": ["Technical Analysis", "Swing Trading", "Options Trading"],
    "years_of_experience": 5,
    "sebi_number": "INH200001234",
    "sebi_document_url": "https://cloudinary.com/example/sebi-cert.pdf",
    "allow_free_subscribers": true,
    "pricing_tiers": {
      "weekly_enabled": true,
      "monthly_enabled": true,
      "yearly_enabled": false
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Profile setup completed successfully. Your application is under review.",
  "data": {
    "profile": {
      "id": "...",
      "display_name": "John Doe",
      "bio": "Experienced stock market analyst...",
      "specializations": ["Technical Analysis", "Swing Trading", "Options Trading"],
      "years_of_experience": 5,
      "verification_status": "pending",
      "invite_link": "http://localhost:5173/analyst/abc123xyz",
      "invite_link_code": "abc123xyz"
    }
  }
}
```

**✅ Verify:**
- Profile created successfully
- Invite link generated
- Verification status is "pending"

---

## Test Case 3: Verify Database Changes

### Check Users Table
```sql
SELECT id, user_type, profile_completed, created_at
FROM users
WHERE phone = '9876543210';
```

**Expected:**
- `user_type` = 'analyst'
- `profile_completed` = TRUE

### Check Analyst Profile
```sql
SELECT
  id,
  display_name,
  bio,
  specializations,
  years_of_experience,
  sebi_number,
  invite_link_code,
  verification_status
FROM analyst_profiles
WHERE user_id = 'USER_ID_FROM_ABOVE';
```

**Expected:**
- All fields populated correctly
- `invite_link_code` is unique 10-char code
- `verification_status` = 'pending'

### Check Subscription Tiers
```sql
SELECT
  tier_name,
  price_monthly,
  chat_access,
  is_free_tier,
  tier_order
FROM subscription_tiers
WHERE analyst_id = 'USER_ID_FROM_ABOVE'
ORDER BY tier_order;
```

**Expected Result:**
| tier_name | price_monthly | chat_access | is_free_tier | tier_order |
|-----------|---------------|-------------|--------------|------------|
| Free      | 0             | false       | true         | 0          |
| Weekly    | 29900         | true        | false        | 1          |
| Monthly   | 99900         | true        | false        | 2          |

**✅ Verify:**
- Free tier always created
- Weekly and Monthly tiers created (as requested)
- Yearly tier NOT created (not enabled)

---

## Test Case 4: Get Current User

### Step 4: Check Profile Completed Status
```bash
curl -X GET http://localhost:8080/api/auth/me \
  -b cookies.txt
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "phone": "******3210",
      "user_type": "analyst",
      "profile_completed": true,  // ← NOW TRUE
      "is_active": true,
      "created_at": "2025-10-09T..."
    }
  }
}
```

**✅ Verify:** `profile_completed` is now `true`

---

## Test Case 5: Validation Errors

### Test 5.1: Invalid SEBI Number
```bash
curl -X POST http://localhost:8080/api/analysts/profile/setup \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "display_name": "Test User",
    "bio": "Testing validation",
    "specializations": ["Technical Analysis"],
    "years_of_experience": 5,
    "sebi_number": "INVALID123",
    "pricing_tiers": { "monthly_enabled": true }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Invalid SEBI number format. Expected: INH/INA/INM followed by 9 digits",
  "statusCode": 400
}
```

### Test 5.2: No Paid Tiers Enabled
```bash
curl -X POST http://localhost:8080/api/analysts/profile/setup \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "display_name": "Test User",
    "bio": "Testing validation",
    "specializations": ["Technical Analysis"],
    "years_of_experience": 5,
    "sebi_number": "INH200001234",
    "pricing_tiers": {
      "weekly_enabled": false,
      "monthly_enabled": false,
      "yearly_enabled": false
    }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "At least one paid subscription tier must be enabled",
  "statusCode": 400
}
```

### Test 5.3: Bio Too Short
```bash
curl -X POST http://localhost:8080/api/analysts/profile/setup \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "display_name": "Test User",
    "bio": "Short",
    "specializations": ["Technical Analysis"],
    "years_of_experience": 5,
    "sebi_number": "INH200001234",
    "pricing_tiers": { "monthly_enabled": true }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Bio must be at least 10 characters",
  "statusCode": 400
}
```

### Test 5.4: Years of Experience Out of Range
```bash
curl -X POST http://localhost:8080/api/analysts/profile/setup \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "display_name": "Test User",
    "bio": "Testing experience validation",
    "specializations": ["Technical Analysis"],
    "years_of_experience": 100,
    "sebi_number": "INH200001234",
    "pricing_tiers": { "monthly_enabled": true }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Years of experience must be between 0 and 50",
  "statusCode": 400
}
```

---

## Test Case 6: Duplicate SEBI Number

### Step 1: Create First Analyst
Complete onboarding with SEBI number `INH200001234` (as in Test Case 2)

### Step 2: Try Creating Second Analyst with Same SEBI
```bash
# First, signup as new analyst with different phone
curl -X POST http://localhost:8080/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "9876543211",
    "otp": "YOUR_OTP_HERE",
    "user_type": "analyst"
  }' \
  -c cookies2.txt

# Then try to use same SEBI number
curl -X POST http://localhost:8080/api/analysts/profile/setup \
  -H "Content-Type: application/json" \
  -b cookies2.txt \
  -d '{
    "display_name": "Another Analyst",
    "bio": "Testing duplicate SEBI validation",
    "specializations": ["Technical Analysis"],
    "years_of_experience": 3,
    "sebi_number": "INH200001234",
    "pricing_tiers": { "monthly_enabled": true }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "This SEBI number is already registered by another analyst",
  "statusCode": 409
}
```

---

## Test Case 7: Re-Setup (Update Existing Profile)

### Step 1: Update Profile with Different Tiers
```bash
curl -X POST http://localhost:8080/api/analysts/profile/setup \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "display_name": "John Doe Updated",
    "bio": "Updated bio with new information about my trading expertise and strategies.",
    "specializations": ["Technical Analysis", "Fundamental Analysis"],
    "years_of_experience": 6,
    "sebi_number": "INH200001234",
    "allow_free_subscribers": false,
    "pricing_tiers": {
      "weekly_enabled": false,
      "monthly_enabled": true,
      "yearly_enabled": true
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Profile setup completed successfully. Your application is under review.",
  "data": {
    "profile": {
      "display_name": "John Doe Updated",
      "years_of_experience": 6,
      ...
    }
  }
}
```

### Step 2: Verify Tiers Were Replaced
```sql
SELECT tier_name, price_monthly
FROM subscription_tiers
WHERE analyst_id = 'USER_ID'
ORDER BY tier_order;
```

**Expected Result:**
| tier_name | price_monthly |
|-----------|---------------|
| Free      | 0             |
| Monthly   | 99900         |
| Yearly    | 999900        |

**✅ Verify:**
- Old tiers deleted (Weekly removed)
- New tiers created (Yearly added)
- Free tier always present

---

## Test Case 8: Trader Signup (Should NOT Have profile_completed)

### Step 1: Signup as Trader
```bash
curl -X POST http://localhost:8080/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "9876543220",
    "otp": "YOUR_OTP_HERE",
    "user_type": "trader"
  }' \
  -c cookies_trader.txt
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": {
      "id": "...",
      "user_type": "trader",
      // NO profile_completed field (not relevant for traders)
      "created_at": "2025-10-09T..."
    },
    "isNewUser": true
  }
}
```

### Step 2: Get Current User
```bash
curl -X GET http://localhost:8080/api/auth/me \
  -b cookies_trader.txt
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "user_type": "trader",
      // NO profile_completed field
      ...
    }
  }
}
```

**✅ Verify:** Traders don't see `profile_completed` field (only analysts)

---

## Quick Verification Checklist

After running all tests, verify:

- [ ] New analyst signup includes `profile_completed: false`
- [ ] Profile setup endpoint creates analyst_profile record
- [ ] Profile setup endpoint creates subscription tiers (Free + selected paid)
- [ ] Profile setup endpoint updates user.profile_completed to TRUE
- [ ] Invite link code is generated and unique
- [ ] SEBI number validation works (INH/INA/INM + 9 digits)
- [ ] Duplicate SEBI number is rejected
- [ ] All validation errors return proper messages
- [ ] Transaction rollback works on errors
- [ ] Re-setup updates existing profile and replaces tiers
- [ ] Trader signup does NOT include profile_completed field

---

## Cleanup After Testing

### Delete Test Users
```sql
-- Get test user IDs
SELECT id, phone FROM users WHERE phone IN ('9876543210', '9876543211', '9876543220');

-- Delete related data (cascades will handle most)
DELETE FROM users WHERE phone IN ('9876543210', '9876543211', '9876543220');
```

---

## Troubleshooting

### Issue: "Analyst profile not found"
**Cause:** JWT token doesn't match test user
**Solution:** Use correct cookies file for the test user

### Issue: "This SEBI number is already registered"
**Cause:** Previous test data not cleaned up
**Solution:** Delete test users or use different SEBI number

### Issue: Transaction rollback errors
**Cause:** Database constraints or foreign key violations
**Solution:** Check database logs and verify schema is correct

---

## Success Criteria

All tests pass when:
1. ✅ New analysts can complete 4-screen onboarding
2. ✅ All required data is validated
3. ✅ Profile, tiers, and user are updated atomically
4. ✅ Invite link is generated
5. ✅ profile_completed flag works correctly
6. ✅ Error handling is comprehensive
7. ✅ Traders are unaffected by new changes

---

**Testing Complete! 🎉**
