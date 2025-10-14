# Analyst Onboarding Flow - Backend Implementation

## Overview

This document describes the complete backend implementation for the new 4-screen analyst onboarding flow based on PRD requirements.

**Implementation Date:** October 9, 2025
**Status:** ✅ Complete (Pending Database Migration)

---

## Changes Summary

### 1. Database Migration

**File:** `/migrations/025_add_profile_completed_to_users.sql`

**Changes:**
- Added `profile_completed` BOOLEAN field to `users` table (defaults to FALSE)
- Set `profile_completed = TRUE` for existing traders (no onboarding needed)
- Set `profile_completed = TRUE` for analysts who already completed profiles
- Created index: `idx_users_profile_completed` for query optimization

**To Run Migration:**
```bash
psql "$DATABASE_URL" -f migrations/025_add_profile_completed_to_users.sql
```

---

### 2. Authentication Controller Updates

**File:** `/src/controllers/authController.js`

#### `verifyOTP` Function (Line 74)
**Changes:**
- Now accepts `user_type` parameter from request body ('analyst' or 'trader')
- Passes `user_type` to registration functions
- For analysts, includes `profile_completed` field in response
- Response includes `profile_completed: false` for new analyst signups

**Example Response (New Analyst):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": {
      "id": "uuid",
      "email": "analyst@example.com",
      "user_type": "analyst",
      "profile_completed": false,
      "created_at": "2025-10-09T..."
    },
    "isNewUser": true
  }
}
```

#### `getCurrentUser` Function (Line 319)
**Changes:**
- For analysts, includes `profile_completed` field in response
- Allows frontend to check if analyst needs to complete onboarding

---

### 3. User Model Updates

**File:** `/src/models/User.js`

**Changes:**
- Added `profile_completed` to SELECT queries in:
  - `findUserById` (Line 84)
  - `findUserByEmail` (Line 123)
  - `findUserByPhone` (Line 156)
- Added `profile_completed` to allowed update fields (Line 202)
- Added `profile_completed` to UPDATE RETURNING clause (Line 245)

---

### 4. Analyst Profile Model Updates

**File:** `/src/models/AnalystProfile.js`

#### `create` Function (Line 31)
**Changes:**
- Added support for new fields:
  - `years_of_experience` INTEGER (0-50)
  - `allow_free_subscribers` BOOLEAN (defaults to TRUE)
  - `invite_link_code` VARCHAR(50) (auto-generated if not provided)
- Auto-generates 10-character alphanumeric invite link code
- Stores SEBI document URL in `verification_documents` JSONB

#### `update` Function (Line 186)
**Changes:**
- Added new fields to allowed update fields:
  - `years_of_experience`
  - `allow_free_subscribers`
  - `verification_documents`

---

### 5. Analyst Controller - Complete Rewrite

**File:** `/src/controllers/analystController.js`

#### `completeProfileSetup` Function (Line 507)
**Completely rewritten to support full 4-screen onboarding.**

**New Request Body:**
```json
{
  "display_name": "John Doe",
  "bio": "Experienced trader with 5+ years...",
  "specializations": ["Technical Analysis", "Swing Trading"],
  "years_of_experience": 5,
  "sebi_number": "INH200001234",
  "sebi_document_url": "https://cloudinary.../cert.pdf",
  "allow_free_subscribers": true,
  "pricing_tiers": {
    "weekly_enabled": true,
    "monthly_enabled": true,
    "yearly_enabled": false
  }
}
```

**Implementation Details:**

1. **Transaction-Based:**
   - Uses PostgreSQL transaction (BEGIN/COMMIT/ROLLBACK)
   - Ensures atomicity - either all operations succeed or none

2. **Comprehensive Validation:**
   - Display name: min 3 characters
   - Bio: 10-500 characters
   - Specializations: at least 1 required
   - Years of experience: 0-50 integer
   - SEBI number: INH/INA/INM + 9 digits format
   - At least 1 paid tier must be enabled
   - Checks for duplicate SEBI numbers

3. **Profile Creation/Update:**
   - Creates new profile if doesn't exist
   - Updates existing profile if found
   - Stores SEBI document URL in `verification_documents` JSONB array
   - Auto-generates unique 10-character invite link code

4. **Subscription Tier Creation:**
   - Deletes existing tiers (allows re-setup)
   - Always creates FREE tier (price=0, no chat access)
   - Creates WEEKLY tier if enabled (₹299 = 29900 paise)
   - Creates MONTHLY tier if enabled (₹999 = 99900 paise)
   - Creates YEARLY tier if enabled (₹9999 = 999900 paise)
   - All paid tiers have `chat_access = true`

5. **User Table Update:**
   - Sets `profile_completed = TRUE` in users table
   - Frontend uses this to determine redirect destination

6. **Email Notification:**
   - Sends profile setup complete email (non-blocking)
   - Email failure doesn't prevent onboarding completion

**Response Format:**
```json
{
  "success": true,
  "message": "Profile setup completed successfully. Your application is under review.",
  "data": {
    "profile": {
      "id": "uuid",
      "display_name": "John Doe",
      "bio": "Experienced trader...",
      "specializations": ["Technical Analysis", "Swing Trading"],
      "years_of_experience": 5,
      "verification_status": "pending",
      "invite_link": "https://platform.com/analyst/abc123xyz",
      "invite_link_code": "abc123xyz"
    }
  }
}
```

---

### 6. Validator Updates

**File:** `/src/utils/validators.js`

#### `isValidSebiNumber` Function (Line 15)
**Changes:**
- Updated SEBI number validation regex
- Now accepts: INH/INA/INM followed by 9 digits
- INH = Investment Adviser (Non-Individual)
- INA = Investment Adviser (Individual)
- INM = Portfolio Manager

**Valid Examples:**
- `INH200001234`
- `INA100012345`
- `INM300099999`

---

## Frontend Integration

### Expected Flow

1. **User Signup:**
   ```
   POST /api/auth/verify-otp
   Body: { phone: "9876543210", otp: "123456", user_type: "analyst" }
   ```

2. **Frontend Checks Response:**
   ```javascript
   if (user.user_type === 'analyst' && !user.profile_completed) {
     // Redirect to /analyst/onboarding/profile
   } else {
     // Redirect to dashboard
   }
   ```

3. **Analyst Completes 4-Screen Form:**
   - Screen 1: Basic Info (name, bio, specializations)
   - Screen 2: Experience (years_of_experience)
   - Screen 3: SEBI Verification (upload document, enter number)
   - Screen 4: Pricing Tiers (select enabled tiers)

4. **Frontend Submits Complete Data:**
   ```
   POST /api/analysts/profile/setup
   Body: { all onboarding data }
   ```

5. **Backend Response:**
   - Success: Profile created, tiers created, `profile_completed = true`
   - Frontend redirects to analyst dashboard

6. **Future Logins:**
   ```
   GET /api/auth/me
   Response includes: profile_completed: true
   ```

---

## Database Schema Updates

### `users` Table
```sql
ALTER TABLE users
ADD COLUMN profile_completed BOOLEAN DEFAULT FALSE;
```

### `analyst_profiles` Table
Already has these fields from migration 024:
- `years_of_experience` INTEGER
- `allow_free_subscribers` BOOLEAN DEFAULT TRUE
- `invite_link_code` VARCHAR(50) UNIQUE
- `invite_link_clicks` INTEGER DEFAULT 0
- `invite_link_conversions` INTEGER DEFAULT 0

### `subscription_tiers` Table
No schema changes needed - existing structure supports all requirements.

---

## Pricing Configuration

### Tier Pricing (in paise, ₹1 = 100 paise)

| Tier    | Price     | Paise     | Duration | Chat Access |
|---------|-----------|-----------|----------|-------------|
| Free    | ₹0        | 0         | Infinite | No          |
| Weekly  | ₹299      | 29900     | 7 days   | Yes         |
| Monthly | ₹999      | 99900     | 30 days  | Yes         |
| Yearly  | ₹9999     | 999900    | 365 days | Yes         |

**Note:** Frontend sends which tiers to enable. Backend creates only enabled tiers.

---

## Error Handling

### Validation Errors (400)
```json
{
  "success": false,
  "message": "Display name must be at least 3 characters. Bio must be at least 10 characters.",
  "statusCode": 400
}
```

### Duplicate SEBI Number (409)
```json
{
  "success": false,
  "message": "This SEBI number is already registered by another analyst",
  "statusCode": 409
}
```

### Transaction Rollback
If ANY step fails (profile creation, tier creation, user update), entire transaction is rolled back. Database remains in consistent state.

---

## Security Considerations

1. **SQL Injection Prevention:**
   - All queries use parameterized statements
   - No string concatenation in SQL

2. **SEBI Number Validation:**
   - Format validation prevents invalid data
   - Duplicate check prevents fraud

3. **Transaction Atomicity:**
   - All-or-nothing approach prevents partial data corruption
   - Rollback on any error

4. **Input Sanitization:**
   - Display name and bio are trimmed
   - SEBI number is uppercased
   - Specializations validated as array

5. **Authorization:**
   - Endpoint requires authentication (JWT)
   - User can only update their own profile

---

## Testing Checklist

### Manual Testing Steps

1. **Create New Analyst Account:**
   ```bash
   # 1. Request OTP
   POST /api/auth/request-otp
   Body: { phone: "9876543210" }

   # 2. Verify OTP
   POST /api/auth/verify-otp
   Body: { phone: "9876543210", otp: "123456", user_type: "analyst" }

   # Check response includes: profile_completed: false
   ```

2. **Complete Onboarding:**
   ```bash
   POST /api/analysts/profile/setup
   Headers: { Cookie: accessToken }
   Body: {
     "display_name": "Test Analyst",
     "bio": "Testing onboarding flow with minimum 10 characters",
     "specializations": ["Technical Analysis"],
     "years_of_experience": 5,
     "sebi_number": "INH200001234",
     "sebi_document_url": "https://test.com/doc.pdf",
     "allow_free_subscribers": true,
     "pricing_tiers": {
       "weekly_enabled": true,
       "monthly_enabled": true,
       "yearly_enabled": false
     }
   }
   ```

3. **Verify Database Changes:**
   ```sql
   -- Check user table
   SELECT id, user_type, profile_completed FROM users WHERE phone = '9876543210';

   -- Check analyst profile
   SELECT id, display_name, years_of_experience, invite_link_code
   FROM analyst_profiles WHERE user_id = 'USER_UUID';

   -- Check subscription tiers
   SELECT tier_name, price_monthly, chat_access
   FROM subscription_tiers WHERE analyst_id = 'USER_UUID';
   ```

4. **Test Edge Cases:**
   - Invalid SEBI number format
   - Duplicate SEBI number
   - No paid tiers enabled
   - Bio too short (<10 chars)
   - Bio too long (>500 chars)
   - Years of experience out of range (negative or >50)
   - Missing required fields

---

## API Endpoint Summary

### Updated Endpoints

| Method | Endpoint                     | Purpose                          | Auth Required |
|--------|------------------------------|----------------------------------|---------------|
| POST   | `/api/auth/verify-otp`       | Signup/Login with user_type      | No            |
| GET    | `/api/auth/me`               | Get current user + profile status| Yes           |
| POST   | `/api/analysts/profile/setup`| Complete 4-screen onboarding     | Yes (Analyst) |

### Existing Endpoints (Still Work)

| Method | Endpoint                        | Purpose                    |
|--------|---------------------------------|----------------------------|
| POST   | `/api/analysts/profile/photo`   | Upload profile photo       |
| POST   | `/api/analysts/documents/upload`| Upload SEBI document       |
| GET    | `/api/analysts/profile/me`      | Get full analyst profile   |

---

## Migration Instructions

### Step 1: Run Migration
```bash
cd /Users/aditya/dev/call_street_express/backend
psql "$DATABASE_URL" -f migrations/025_add_profile_completed_to_users.sql
```

### Step 2: Restart Backend Server
```bash
npm run dev
```

### Step 3: Verify Migration
```sql
-- Check if column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'profile_completed';

-- Check existing data
SELECT user_type, profile_completed, COUNT(*)
FROM users
GROUP BY user_type, profile_completed;
```

---

## Rollback Plan

If issues arise, rollback the migration:

```sql
-- Drop index
DROP INDEX IF EXISTS idx_users_profile_completed;

-- Drop column
ALTER TABLE users DROP COLUMN IF EXISTS profile_completed;
```

Then revert code changes by checking out the previous commit.

---

## Future Enhancements

1. **Multi-Document Upload:**
   - Allow uploading PAN card, bank statement in same flow
   - Store multiple documents in `verification_documents` array

2. **Custom Tier Pricing:**
   - Allow analysts to set custom prices for each tier
   - Validate minimum prices (e.g., Weekly ≥ ₹99)

3. **Profile Photo Upload:**
   - Integrate photo upload in Step 1 of onboarding
   - Make it required instead of optional

4. **Email Verification:**
   - Add email verification step before profile setup
   - Prevent spam analyst registrations

5. **Admin Review Dashboard:**
   - Show newly completed onboardings in admin panel
   - Allow admins to approve/reject with reasons

---

## Files Modified

1. ✅ `/migrations/025_add_profile_completed_to_users.sql` (NEW)
2. ✅ `/src/controllers/authController.js` (UPDATED)
3. ✅ `/src/models/User.js` (UPDATED)
4. ✅ `/src/models/AnalystProfile.js` (UPDATED)
5. ✅ `/src/controllers/analystController.js` (MAJOR REWRITE)
6. ✅ `/src/utils/validators.js` (UPDATED)

---

## Deployment Notes

### Environment Variables
No new environment variables needed. Existing config is sufficient:
- `FRONTEND_URL` - Used for generating invite links
- `DATABASE_URL` - For running migration

### Database Backup
Before deploying to production:
```bash
pg_dump "$DATABASE_URL" > backup_before_onboarding_$(date +%Y%m%d).sql
```

### Deployment Steps
1. Backup production database
2. Run migration: `025_add_profile_completed_to_users.sql`
3. Deploy backend code
4. Verify migration success
5. Deploy frontend changes
6. Monitor error logs for 24 hours

---

## Support & Troubleshooting

### Common Issues

**Issue:** New analysts not redirected to onboarding
**Solution:** Check `profile_completed` field in `/api/auth/me` response

**Issue:** Profile setup fails with "No valid fields"
**Solution:** Ensure all required fields are sent in request body

**Issue:** SEBI number validation fails
**Solution:** Verify format is INH/INA/INM + 9 digits (e.g., INH200001234)

**Issue:** Transaction rollback on tier creation
**Solution:** Check subscription_tiers table constraints (unique, foreign keys)

---

## Contact

For questions or issues with this implementation:
- **Backend Lead:** Claude (AI Assistant)
- **Date:** October 9, 2025
- **Documentation:** This file

---

## Changelog

### Version 1.0 (October 9, 2025)
- Initial implementation of 4-screen analyst onboarding
- Added `profile_completed` field to users table
- Rewrote `completeProfileSetup` endpoint with transaction support
- Added subscription tier creation during onboarding
- Updated SEBI number validation to INH/INA/INM format
- Created comprehensive documentation

---

**End of Documentation**
