# Analyst Verification System - Implementation Documentation

## Overview

This document provides comprehensive documentation for the Analyst Verification System implemented for the Analyst Marketplace Platform. The system handles analyst onboarding, document verification, SEBI/RIA validation, and admin approval workflows.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [File Uploads](#file-uploads)
5. [Verification Workflow](#verification-workflow)
6. [Email Notifications](#email-notifications)
7. [Security Measures](#security-measures)
8. [Testing Guide](#testing-guide)
9. [Deployment Checklist](#deployment-checklist)

---

## Architecture

### Components Created

```
backend/src/
├── models/
│   └── AnalystProfile.js          # Database operations for analyst profiles
├── controllers/
│   ├── analystController.js       # Analyst endpoints (apply, upload, profile)
│   └── adminController.js         # Admin verification endpoints
├── middleware/
│   └── upload.js                  # Multer file upload configuration
└── routes/
    ├── analyst.routes.js          # Analyst API routes
    └── admin.routes.js            # Admin API routes
```

### Technology Stack

- **Express.js**: RESTful API framework
- **PostgreSQL**: Relational database with JSONB for documents
- **Cloudinary**: Document and image storage
- **Multer**: Multipart form data handling
- **Resend**: Transactional email service
- **JWT**: Authentication and authorization

---

## Database Schema

### `analyst_profiles` Table

```sql
CREATE TABLE analyst_profiles (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES users(id),
  display_name VARCHAR(255) NOT NULL,
  bio TEXT,
  photo_url VARCHAR(500),
  specializations TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{}',
  country VARCHAR(2) DEFAULT 'IN',

  -- Verification
  sebi_number VARCHAR(50) UNIQUE,
  ria_number VARCHAR(50) UNIQUE,
  verification_status VARCHAR(20) DEFAULT 'pending',
  verification_documents JSONB DEFAULT '[]',
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES users(id),
  rejection_reason TEXT,

  -- Statistics
  avg_rating DECIMAL(3,2) DEFAULT 0.00,
  total_reviews INTEGER DEFAULT 0,
  total_subscribers INTEGER DEFAULT 0,
  active_subscribers INTEGER DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  monthly_revenue INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);
```

### Indexes

```sql
-- User lookup
CREATE UNIQUE INDEX idx_analyst_profiles_user_id
  ON analyst_profiles(user_id) WHERE deleted_at IS NULL;

-- SEBI verification
CREATE UNIQUE INDEX idx_analyst_profiles_sebi
  ON analyst_profiles(sebi_number) WHERE deleted_at IS NULL;

-- Discovery page
CREATE INDEX idx_analyst_profiles_discovery
  ON analyst_profiles(verification_status, avg_rating DESC, active_subscribers DESC)
  WHERE verification_status = 'approved' AND deleted_at IS NULL;

-- Specialization filtering (GIN index for arrays)
CREATE INDEX idx_analyst_profiles_specializations
  ON analyst_profiles USING gin(specializations);

-- Verification queue
CREATE INDEX idx_analyst_profiles_verification
  ON analyst_profiles(verification_status, created_at ASC)
  WHERE verification_status IN ('pending', 'in_review');
```

---

## API Endpoints

### Analyst Endpoints

#### 1. Submit Verification Application
```http
POST /api/analysts/apply
Authorization: Bearer <token>
Content-Type: application/json

{
  "display_name": "John Trader",
  "sebi_number": "INH200001234",
  "country": "IN"
}

Response:
{
  "success": true,
  "message": "Application submitted successfully",
  "data": {
    "profile": {
      "id": "uuid",
      "display_name": "John Trader",
      "verification_status": "pending",
      "sebi_number": "INH200001234",
      "created_at": "2025-01-15T10:00:00Z"
    }
  }
}
```

#### 2. Upload Verification Documents
```http
POST /api/analysts/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

Fields:
- document_type: sebi_certificate | pan_card | bank_statement
- file: <PDF or Image file, max 5MB>

Response:
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "document": {
      "type": "sebi_certificate",
      "url": "https://res.cloudinary.com/...",
      "uploaded_at": "2025-01-15T10:05:00Z"
    },
    "documents_uploaded": 1,
    "verification_status": "pending"
  }
}
```

#### 3. Upload Profile Photo
```http
POST /api/analysts/profile/photo
Authorization: Bearer <token>
Content-Type: multipart/form-data

Fields:
- photo: <Image file, max 5MB>

Response:
{
  "success": true,
  "message": "Profile photo uploaded successfully",
  "data": {
    "photo_url": "https://res.cloudinary.com/..."
  }
}
```

#### 4. Get Own Profile
```http
GET /api/analysts/profile/me
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "profile": {
      "id": "uuid",
      "user_id": "uuid",
      "display_name": "John Trader",
      "bio": "10 years of trading experience...",
      "photo_url": "https://...",
      "specializations": ["Intraday", "Options"],
      "languages": ["English", "Hindi"],
      "sebi_number": "INH200001234",
      "verification_status": "approved",
      "verified_at": "2025-01-16T10:00:00Z",
      "avg_rating": 4.5,
      "total_reviews": 120,
      "active_subscribers": 50,
      "total_posts": 200,
      "monthly_revenue": 50000,
      "created_at": "2025-01-15T10:00:00Z"
    }
  }
}
```

#### 5. Update Profile
```http
PUT /api/analysts/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "bio": "Updated bio text...",
  "specializations": ["Intraday", "Swing", "Options"],
  "languages": ["English", "Hindi", "Hinglish"]
}

Response:
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "profile": { ... }
  }
}
```

#### 6. Complete Profile Setup
```http
POST /api/analysts/profile/setup
Authorization: Bearer <token>
Content-Type: application/json

{
  "bio": "Trading for 10 years...",
  "specializations": ["Intraday", "Options"],
  "languages": ["English", "Hindi"]
}

Response:
{
  "success": true,
  "message": "Profile setup completed successfully",
  "data": { ... }
}
```

#### 7. Get Dashboard
```http
GET /api/analysts/dashboard
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "profile": { ... },
    "revenue": {
      "monthly": 500.00,
      "dailyBreakdown": [...]
    },
    "recentSubscribers": [...],
    "recentPosts": [...],
    "recentReviews": [...]
  }
}
```

#### 8. Get Public Profile
```http
GET /api/analysts/profile/:id

Response:
{
  "success": true,
  "data": {
    "profile": {
      "id": "uuid",
      "display_name": "John Trader",
      "bio": "...",
      "photo_url": "...",
      "specializations": [...],
      "languages": [...],
      "sebi_number": "INH200001234",
      "avg_rating": 4.5,
      "total_reviews": 120,
      "active_subscribers": 50,
      "total_posts": 200,
      "is_featured": false,
      "verified_at": "...",
      "created_at": "..."
    }
  }
}
```

#### 9. Discovery Page
```http
GET /api/analysts/discovery?specializations=Intraday,Options&languages=English&minRating=4&sortBy=rating&page=1&limit=20

Response:
{
  "success": true,
  "data": {
    "analysts": [
      {
        "id": "uuid",
        "display_name": "John Trader",
        "bio": "...",
        "photo_url": "...",
        "specializations": ["Intraday", "Options"],
        "languages": ["English", "Hindi"],
        "avg_rating": 4.8,
        "total_reviews": 200,
        "active_subscribers": 150,
        "total_posts": 500
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalPages": 5,
      "totalCount": 95
    },
    "filters": {
      "specializations": ["Intraday", "Options"],
      "languages": ["English"],
      "minRating": 4,
      "sortBy": "rating"
    }
  }
}
```

### Admin Endpoints

#### 1. Get Verification Queue
```http
GET /api/admin/verification-queue?status=pending&page=1&limit=20
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "data": {
    "queue": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "display_name": "John Trader",
        "sebi_number": "INH200001234",
        "verification_status": "pending",
        "verification_documents": [...],
        "email": "john@example.com",
        "phone": "+919876543210",
        "created_at": "2025-01-15T10:00:00Z"
      }
    ],
    "pagination": { ... },
    "statusCounts": {
      "pending": 10,
      "in_review": 5,
      "total": 15
    }
  }
}
```

#### 2. View Analyst Documents
```http
GET /api/admin/analysts/:id/documents
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "data": {
    "analyst": {
      "id": "uuid",
      "display_name": "John Trader",
      "sebi_number": "INH200001234",
      "verification_documents": [
        {
          "type": "sebi_certificate",
          "url": "https://res.cloudinary.com/...",
          "uploaded_at": "2025-01-15T10:05:00Z",
          "file_size": 1234567,
          "file_format": "pdf"
        }
      ],
      "verification_status": "pending"
    },
    "user": {
      "email": "john@example.com",
      "phone": "+919876543210",
      "is_email_verified": true,
      "is_phone_verified": true
    }
  }
}
```

#### 3. Approve Analyst
```http
POST /api/admin/analysts/:id/approve
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "message": "Analyst verified successfully",
  "data": {
    "profile": {
      "id": "uuid",
      "display_name": "John Trader",
      "verification_status": "approved",
      "verified_at": "2025-01-16T10:00:00Z",
      "verified_by": "admin-uuid"
    }
  }
}
```

#### 4. Reject Analyst
```http
POST /api/admin/analysts/:id/reject
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "rejection_reason": "SEBI number does not match certificate. Please upload correct documents."
}

Response:
{
  "success": true,
  "message": "Analyst verification rejected",
  "data": {
    "profile": {
      "id": "uuid",
      "display_name": "John Trader",
      "verification_status": "rejected",
      "rejection_reason": "SEBI number does not match certificate..."
    }
  }
}
```

#### 5. Update Analyst Status
```http
PUT /api/admin/analysts/:id/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "in_review"
}

Response:
{
  "success": true,
  "message": "Analyst status updated successfully",
  "data": { ... }
}
```

#### 6. Get Platform Analytics
```http
GET /api/admin/analytics
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "data": {
    "analysts": {
      "approved": 150,
      "pending": 10,
      "in_review": 5,
      "rejected": 20,
      "total": 185,
      "avg_rating": 4.3
    },
    "users": {
      "traders": 1000,
      "analysts": 150,
      "admins": 5,
      "total": 1155,
      "new_last_7_days": 50,
      "new_last_30_days": 200
    },
    "subscriptions": {
      "active": 500,
      "cancelled": 100,
      "expired": 50,
      "total": 650
    },
    "revenue": {
      "total": 50000.00,
      "last_7_days": 5000.00,
      "last_30_days": 20000.00,
      "monthly_recurring": 25000.00
    },
    "posts": {
      "total": 5000,
      "last_7_days": 200,
      "last_30_days": 800
    },
    "reviews": {
      "total": 1000,
      "avg_rating": 4.5
    },
    "topAnalysts": [...]
  }
}
```

---

## File Uploads

### Configuration

File uploads are handled using **Multer** middleware with the following configuration:

```javascript
// Profile Images
- Max size: 5MB
- Allowed types: JPG, PNG, WebP
- Storage: Cloudinary
- Transformation: 400x400 circular crop

// Verification Documents
- Max size: 5MB
- Allowed types: PDF, JPG, PNG
- Storage: Cloudinary
- Folder: analyst-platform/verifications/{analyst_id}
```

### Upload Flow

1. **Client** uploads file via multipart/form-data
2. **Multer** saves file temporarily to `/tmp`
3. **Controller** validates file type and size
4. **Cloudinary** uploads file and returns secure URL
5. **Database** stores URL in `verification_documents` JSONB field
6. **Temporary file** is automatically cleaned up

### Cloudinary Structure

```
analyst-platform/
├── profiles/{user_id}/
│   └── profile_photo.jpg
└── verifications/{analyst_id}/
    ├── sebi_certificate.pdf
    ├── pan_card.jpg
    └── bank_statement.pdf
```

---

## Verification Workflow

### Step-by-Step Process

```
1. User Signup
   └─> Role: trader (default)

2. Apply for Verification
   POST /api/analysts/apply
   └─> Creates analyst_profile
   └─> Updates user role to 'analyst'
   └─> Status: pending
   └─> Email: Application received

3. Upload Documents
   POST /api/analysts/documents/upload
   └─> Upload SEBI certificate
   └─> Upload PAN card
   └─> Upload bank statement
   └─> Status: pending (until admin review)

4. Complete Profile Setup
   POST /api/analysts/profile/setup
   └─> Add bio (voice input supported in frontend)
   └─> Select specializations
   └─> Select languages
   └─> Upload profile photo

5. Admin Review
   GET /api/admin/verification-queue
   └─> Admin views pending applications
   └─> Admin clicks on analyst to review
   GET /api/admin/analysts/:id/documents
   └─> View all uploaded documents
   └─> Verify SEBI number on SEBI website

6a. Approve (Happy Path)
    POST /api/admin/analysts/:id/approve
    └─> Status: approved
    └─> verified_at: NOW()
    └─> verified_by: admin_user_id
    └─> Email: Verification approved
    └─> Analyst can now post content

6b. Reject (Error Path)
    POST /api/admin/analysts/:id/reject
    └─> Status: rejected
    └─> rejection_reason: stored
    └─> Email: Verification rejected with reason
    └─> Analyst can resubmit documents

7. Resubmission (if rejected)
   POST /api/analysts/documents/upload
   └─> Upload corrected documents
   └─> Status: back to pending
   └─> Goes back into admin queue
```

### Status Transitions

```
pending → in_review → approved ✓
pending → in_review → rejected → pending (resubmit)
```

### Validation Rules

**SEBI Number:**
- Format: INH200001234 (3 letters + 9 digits)
- Must be unique across platform
- Validated against format regex

**PAN Card:**
- Format: ABCDE1234F (5 letters + 4 digits + 1 letter)
- Not stored in database (only document uploaded)

**Documents:**
- SEBI Certificate: Required
- PAN Card: Required
- Bank Statement: Required
- All must be uploaded before approval

**Profile:**
- Display name: Min 3 characters
- Bio: Max 500 characters
- At least 1 specialization
- At least 1 language

---

## Email Notifications

### Templates Implemented

#### 1. Application Received
**Trigger:** POST /api/analysts/apply
**Recipient:** Analyst
**Content:**
- Application confirmation
- Next steps (upload documents)
- Required documents list
- CTA: Upload Documents button

#### 2. Profile Setup Complete
**Trigger:** POST /api/analysts/profile/setup
**Recipient:** Analyst
**Content:**
- Setup completion confirmation
- Next steps (wait for admin review)
- Estimated review time (24-48 hours)

#### 3. Verification Approved
**Trigger:** POST /api/admin/analysts/:id/approve
**Recipient:** Analyst
**Content:**
- Approval confirmation
- What's next (start posting, set up pricing)
- Tips for success
- CTA: Go to Dashboard button

#### 4. Verification Rejected
**Trigger:** POST /api/admin/analysts/:id/reject
**Recipient:** Analyst
**Content:**
- Rejection notification
- Specific rejection reason
- What to do next (upload corrected docs)
- CTA: Upload Documents button

### Email Service Configuration

```javascript
// Service: Resend
// From: Analyst Platform <noreply@analystplatform.com>
// Rate limit: 10 emails per hour per recipient
// Skip rate limit: true (for critical verification emails)
```

---

## Security Measures

### Authentication & Authorization

```javascript
// Analyst endpoints
- verifyToken: JWT validation
- requireAnalyst: Role check (analyst only)

// Admin endpoints
- verifyToken: JWT validation
- requireAdmin: Role check (admin only)

// Public endpoints
- optionalAuth: Optional JWT (personalized content)
```

### Input Validation

```javascript
// SEBI number
- Format: /^IN[A-Z]\d{8}$/
- Uniqueness check in database

// PAN number
- Format: /^[A-Z]{5}\d{4}[A-Z]$/

// File uploads
- Type validation (MIME + extension)
- Size validation (5MB max)
- Malicious file detection

// SQL injection prevention
- Parameterized queries for all database operations
- No raw SQL with user input
```

### Rate Limiting

```javascript
// Upload endpoints: 10 uploads per hour
// Standard endpoints: 100 requests per 15 minutes
// Admin endpoints: 200 requests per 15 minutes
```

### Data Privacy

```javascript
// Public profile: Excludes sensitive data
- No verification_documents URLs
- No email/phone
- No rejection_reason

// Private profile: Full access for owner
- All fields including documents
- Verification status and reason
```

### Audit Trail

```javascript
// Admin actions logged
- APPROVE_ANALYST: admin_id, analyst_id, timestamp
- REJECT_ANALYST: admin_id, analyst_id, reason, timestamp
- UPDATE_STATUS: admin_id, analyst_id, old_status, new_status
```

---

## Testing Guide

### Unit Tests (Model Layer)

```javascript
// AnalystProfile.create()
- ✓ Creates profile with valid data
- ✓ Throws error if SEBI and RIA both missing
- ✓ Throws error if SEBI number already exists

// AnalystProfile.approve()
- ✓ Updates status to approved
- ✓ Sets verified_at and verified_by
- ✓ Clears rejection_reason

// AnalystProfile.reject()
- ✓ Updates status to rejected
- ✓ Stores rejection_reason
- ✓ Clears verified_at and verified_by
```

### Integration Tests (API Layer)

```bash
# Analyst Application Flow
1. POST /api/analysts/apply
   - ✓ 201 Created with valid data
   - ✓ 400 Bad Request with invalid SEBI number
   - ✓ 409 Conflict with duplicate SEBI number
   - ✓ 401 Unauthorized without token

2. POST /api/analysts/documents/upload
   - ✓ 200 OK with valid document
   - ✓ 400 Bad Request with invalid file type
   - ✓ 400 Bad Request with file > 5MB
   - ✓ 403 Forbidden if analyst role missing

3. GET /api/analysts/profile/me
   - ✓ 200 OK with complete profile data
   - ✓ 401 Unauthorized without token
   - ✓ 404 Not Found if no profile exists

4. GET /api/analysts/discovery
   - ✓ 200 OK with filtered results
   - ✓ Pagination works correctly
   - ✓ Filters by specialization
   - ✓ Filters by language
   - ✓ Sorts by rating/popular/newest/price
```

### Admin Verification Flow

```bash
1. GET /api/admin/verification-queue
   - ✓ 200 OK with pending analysts
   - ✓ 403 Forbidden if not admin
   - ✓ Filters by status (pending/in_review)

2. POST /api/admin/analysts/:id/approve
   - ✓ 200 OK and sends email
   - ✓ 400 Bad Request if already approved
   - ✓ 400 Bad Request if no documents uploaded
   - ✓ 404 Not Found if analyst doesn't exist

3. POST /api/admin/analysts/:id/reject
   - ✓ 200 OK and sends email with reason
   - ✓ 400 Bad Request if rejection_reason too short
   - ✓ 400 Bad Request if already approved
```

### Manual Testing Checklist

```
□ Apply for verification with valid SEBI number
□ Apply with duplicate SEBI number (should fail)
□ Upload SEBI certificate (PDF)
□ Upload PAN card (Image)
□ Upload bank statement (PDF)
□ Upload profile photo
□ Complete profile setup
□ View own profile (private view)
□ Admin: View verification queue
□ Admin: View analyst documents
□ Admin: Approve analyst (check email sent)
□ Admin: Reject analyst (check email sent)
□ View public analyst profile
□ Discovery page with filters
□ Discovery page pagination
□ Sort by rating, popular, newest, price
```

---

## Deployment Checklist

### Environment Variables

```bash
# Cloudinary (Required)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email (Required)
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Analyst Platform

# Database (Required)
DB_HOST=your_postgres_host
DB_PORT=5432
DB_NAME=analyst_platform
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT (Required)
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret

# Frontend URL (Required for emails)
FRONTEND_URL=https://yourdomain.com
```

### Database Migration

```bash
# Run migrations in order
psql -U postgres -d analyst_platform -f migrations/004_create_analyst_profiles_table.sql

# Verify indexes created
psql -U postgres -d analyst_platform -c "\d analyst_profiles"
```

### NPM Dependencies

```bash
# Install required packages
npm install multer cloudinary resend express-rate-limit
```

### File System Permissions

```bash
# Ensure /tmp directory is writable (for Multer)
chmod 777 /tmp

# Note: Temporary files are auto-cleaned after upload
```

### Cloudinary Setup

```bash
1. Create account at cloudinary.com
2. Create folder structure:
   - analyst-platform/profiles
   - analyst-platform/verifications
3. Set upload presets (optional)
4. Enable signed URLs for documents (security)
```

### Email Setup

```bash
1. Create account at resend.com
2. Verify domain for sending emails
3. Set up SPF/DKIM records
4. Test email delivery
```

### Post-Deployment Verification

```bash
# Health checks
✓ POST /api/analysts/apply returns 201
✓ POST /api/analysts/documents/upload uploads to Cloudinary
✓ Emails are being sent (check Resend dashboard)
✓ Admin can access /api/admin/verification-queue
✓ Public can access /api/analysts/discovery
✓ Rate limiting is working (test with 100+ requests)
✓ File uploads respect 5MB limit
✓ SQL queries use indexes (check with EXPLAIN ANALYZE)
```

---

## API Error Responses

### Standard Error Format

```json
{
  "success": false,
  "message": "User-friendly error message",
  "statusCode": 400,
  "error": "Technical details (dev only)"
}
```

### Common Error Codes

```javascript
400 Bad Request: Invalid input, validation failure
401 Unauthorized: Missing or invalid token
403 Forbidden: Insufficient permissions
404 Not Found: Resource doesn't exist
409 Conflict: Duplicate resource (SEBI number)
422 Unprocessable Entity: Business logic validation failed
429 Too Many Requests: Rate limit exceeded
500 Internal Server Error: Server-side failure
```

---

## Performance Considerations

### Database Optimization

```sql
-- Use indexes for all queries
-- Discovery page: idx_analyst_profiles_discovery
-- Verification queue: idx_analyst_profiles_verification
-- Specialization filter: idx_analyst_profiles_specializations (GIN)

-- Query performance targets
-- Discovery page: < 100ms (P95)
-- Profile fetch: < 50ms (P95)
-- Document upload: < 500ms (P95)
```

### Caching Strategy

```javascript
// Future: Implement Redis caching for
- Discovery page results (TTL: 5 minutes)
- Public profiles (TTL: 10 minutes)
- Analytics dashboard (TTL: 1 hour)
```

### File Upload Optimization

```javascript
// Cloudinary transformations
- Profile images: Resize to 400x400, circular crop
- Documents: No transformation (preserve quality)
- Use signed URLs for security (24-hour expiry)
```

---

## Support & Troubleshooting

### Common Issues

**Issue: File upload fails with 500 error**
- Check Cloudinary credentials in .env
- Ensure /tmp directory is writable
- Verify file size < 5MB

**Issue: Emails not being sent**
- Check Resend API key
- Verify domain in Resend dashboard
- Check email service logs

**Issue: SEBI number validation fails**
- Verify format: INH200001234
- Check for leading/trailing spaces
- Ensure uppercase letters

**Issue: Discovery page returns no results**
- Check verification_status is 'approved'
- Verify deleted_at IS NULL
- Check indexes exist

### Logs to Monitor

```bash
# Admin action logs
- APPROVE_ANALYST
- REJECT_ANALYST
- UPDATE_ANALYST_STATUS

# Email logs
- Email send success/failure
- Rate limit exceeded

# Upload logs
- Cloudinary upload success/failure
- File size exceeded
```

---

## Future Enhancements

### Planned Features

1. **Bulk Approval**: Admin can approve multiple analysts at once
2. **SEBI API Integration**: Auto-verify SEBI numbers via API
3. **Document OCR**: Auto-extract SEBI number from certificate
4. **Re-verification Workflow**: Annual SEBI re-verification
5. **Analyst Badges**: Top Performer, Consistent, New badges
6. **Advanced Analytics**: Conversion rates, approval times
7. **Webhook Integration**: Notify external systems on approval

---

## Conclusion

This implementation provides a complete, production-ready analyst verification system with:

- ✓ Secure document uploads
- ✓ Admin approval workflow
- ✓ Email notifications
- ✓ Discovery page with filters
- ✓ Public and private profiles
- ✓ Comprehensive error handling
- ✓ Rate limiting
- ✓ Audit trail
- ✓ Database optimization

All endpoints are fully tested, documented, and ready for deployment.

For questions or support, contact the development team.

---

**Last Updated:** January 15, 2025
**Version:** 1.0.0
**Author:** Senior Backend Engineer
