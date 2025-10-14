# Quick Start Guide: Analyst Verification System

## Overview

This guide will help you quickly test the analyst verification system end-to-end.

---

## Prerequisites

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env

# Required variables:
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
RESEND_API_KEY=your_resend_key
FRONTEND_URL=http://localhost:3000
```

---

## Testing Flow (Using Postman/curl)

### Step 1: Create Test User

```bash
POST http://localhost:5000/api/auth/signup
Content-Type: application/json

{
  "email": "analyst@test.com",
  "phone": "+919876543210",
  "password": "Test@123",
  "role": "trader"
}

# Save the accessToken from response
```

### Step 2: Apply for Verification

```bash
POST http://localhost:5000/api/analysts/apply
Authorization: Bearer <your_access_token>
Content-Type: application/json

{
  "display_name": "John Trader",
  "sebi_number": "INH200001234",
  "country": "IN"
}

# Note: User role automatically changes to 'analyst'
# Save the profile.id from response
```

### Step 3: Upload Documents

```bash
# Upload SEBI Certificate
POST http://localhost:5000/api/analysts/documents/upload
Authorization: Bearer <your_access_token>
Content-Type: multipart/form-data

Fields:
- document_type: sebi_certificate
- file: <select PDF file>

# Upload PAN Card
POST http://localhost:5000/api/analysts/documents/upload
Authorization: Bearer <your_access_token>
Content-Type: multipart/form-data

Fields:
- document_type: pan_card
- file: <select image file>

# Upload Bank Statement
POST http://localhost:5000/api/analysts/documents/upload
Authorization: Bearer <your_access_token>
Content-Type: multipart/form-data

Fields:
- document_type: bank_statement
- file: <select PDF file>
```

### Step 4: Upload Profile Photo

```bash
POST http://localhost:5000/api/analysts/profile/photo
Authorization: Bearer <your_access_token>
Content-Type: multipart/form-data

Fields:
- photo: <select image file>
```

### Step 5: Complete Profile Setup

```bash
POST http://localhost:5000/api/analysts/profile/setup
Authorization: Bearer <your_access_token>
Content-Type: application/json

{
  "bio": "I am a professional trader with 10 years of experience in the stock market. Specialized in intraday and options trading.",
  "specializations": ["Intraday", "Options", "Technical"],
  "languages": ["English", "Hindi", "Hinglish"]
}
```

### Step 6: View Own Profile

```bash
GET http://localhost:5000/api/analysts/profile/me
Authorization: Bearer <your_access_token>

# You should see status: "pending"
```

### Step 7: Admin - View Verification Queue

```bash
# First, create an admin user or use existing admin token

GET http://localhost:5000/api/admin/verification-queue?status=pending
Authorization: Bearer <admin_access_token>

# You should see your analyst in the queue
```

### Step 8: Admin - View Documents

```bash
GET http://localhost:5000/api/admin/analysts/<analyst_id>/documents
Authorization: Bearer <admin_access_token>

# You should see all uploaded documents with URLs
```

### Step 9: Admin - Approve Analyst

```bash
POST http://localhost:5000/api/admin/analysts/<analyst_id>/approve
Authorization: Bearer <admin_access_token>

# Analyst receives email notification
# Status changes to "approved"
```

### Step 10: View Public Profile

```bash
GET http://localhost:5000/api/analysts/profile/<analyst_id>

# No authentication required
# Public data only (no documents, no email)
```

### Step 11: Test Discovery Page

```bash
GET http://localhost:5000/api/analysts/discovery?sortBy=rating&page=1&limit=20

# Should see your approved analyst in results
```

---

## Testing Admin Rejection Flow

### Reject Analyst

```bash
POST http://localhost:5000/api/admin/analysts/<analyst_id>/reject
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "rejection_reason": "SEBI number does not match the certificate. Please upload correct documents and ensure the SEBI number is clearly visible."
}

# Analyst receives rejection email with reason
# Status changes to "rejected"
```

### Resubmit Documents

```bash
# Analyst can upload corrected documents
POST http://localhost:5000/api/analysts/documents/upload
Authorization: Bearer <your_access_token>
Content-Type: multipart/form-data

Fields:
- document_type: sebi_certificate
- file: <corrected PDF file>

# Status automatically changes back to "pending"
# Goes back into admin verification queue
```

---

## Testing Discovery Filters

### Filter by Specialization

```bash
GET http://localhost:5000/api/analysts/discovery?specializations=Intraday,Options
```

### Filter by Language

```bash
GET http://localhost:5000/api/analysts/discovery?languages=English,Hindi
```

### Filter by Rating

```bash
GET http://localhost:5000/api/analysts/discovery?minRating=4
```

### Sort Options

```bash
# Most Popular (default)
GET http://localhost:5000/api/analysts/discovery?sortBy=popular

# Highest Rated
GET http://localhost:5000/api/analysts/discovery?sortBy=rating

# Newest
GET http://localhost:5000/api/analysts/discovery?sortBy=newest

# Lowest Price
GET http://localhost:5000/api/analysts/discovery?sortBy=price
```

### Combined Filters

```bash
GET http://localhost:5000/api/analysts/discovery?specializations=Intraday&languages=English&minRating=4&sortBy=rating&page=1&limit=10
```

---

## Testing Analytics Dashboard

```bash
GET http://localhost:5000/api/admin/analytics
Authorization: Bearer <admin_access_token>

# Should return comprehensive platform statistics
```

---

## Postman Collection

Import this collection to test all endpoints:

```json
{
  "info": {
    "name": "Analyst Verification System",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Analyst - Apply",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/analysts/apply",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{analyst_token}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"display_name\": \"John Trader\",\n  \"sebi_number\": \"INH200001234\",\n  \"country\": \"IN\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        }
      }
    },
    {
      "name": "Analyst - Upload Document",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/analysts/documents/upload",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{analyst_token}}"
          }
        ],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "document_type",
              "value": "sebi_certificate",
              "type": "text"
            },
            {
              "key": "file",
              "type": "file",
              "src": ""
            }
          ]
        }
      }
    },
    {
      "name": "Admin - Approve Analyst",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/admin/analysts/{{analyst_id}}/approve",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{admin_token}}"
          }
        ]
      }
    },
    {
      "name": "Discovery - Get Analysts",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/api/analysts/discovery?sortBy=rating&page=1&limit=20"
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:5000"
    },
    {
      "key": "analyst_token",
      "value": ""
    },
    {
      "key": "admin_token",
      "value": ""
    },
    {
      "key": "analyst_id",
      "value": ""
    }
  ]
}
```

---

## Test Data

### Valid SEBI Numbers

```
INH200001234
INA200005678
INZ200009012
```

### Valid PAN Numbers

```
ABCDE1234F
PQRST5678G
XYZAB9012C
```

### Sample Specializations

```
["Intraday", "Swing", "Options", "Investment", "Technical", "Fundamental"]
```

### Sample Languages

```
["English", "Hindi", "Hinglish", "Tamil", "Telugu"]
```

---

## Common Test Scenarios

### Scenario 1: Happy Path (Approval)

1. User signs up → analyst applies → uploads documents → admin approves → analyst can post

### Scenario 2: Rejection & Resubmission

1. User signs up → analyst applies → uploads documents → admin rejects → analyst resubmits → admin approves

### Scenario 3: Duplicate SEBI Number

1. Analyst 1 applies with INH200001234 → Success
2. Analyst 2 applies with INH200001234 → 409 Conflict

### Scenario 4: Missing Documents

1. Analyst applies → skips document upload → admin tries to approve → 400 Bad Request

### Scenario 5: Discovery Filters

1. Create 5 analysts with different specializations
2. Test filtering by each specialization
3. Test combined filters
4. Test pagination

---

## Debugging Tips

### Check Logs

```bash
# Watch server logs
npm run dev

# Look for:
- "Admin Action: APPROVE_ANALYST"
- "Email sent successfully to..."
- "Document uploaded successfully"
```

### Check Database

```sql
-- View all analyst profiles
SELECT id, display_name, verification_status, sebi_number, created_at
FROM analyst_profiles
ORDER BY created_at DESC;

-- View verification queue
SELECT id, display_name, verification_status, created_at
FROM analyst_profiles
WHERE verification_status IN ('pending', 'in_review')
ORDER BY created_at ASC;

-- Check document uploads
SELECT
  id,
  display_name,
  verification_documents,
  verification_status
FROM analyst_profiles
WHERE id = '<analyst_id>';
```

### Check Cloudinary

```bash
# Login to Cloudinary dashboard
# Navigate to: Media Library → analyst-platform
# Verify folders exist:
  - profiles/{user_id}
  - verifications/{analyst_id}
```

### Check Email Delivery

```bash
# Login to Resend dashboard
# Navigate to: Logs
# Verify emails were sent:
  - Application Received
  - Verification Approved
  - Verification Rejected
```

---

## Performance Testing

### Load Test Discovery Page

```bash
# Install artillery
npm install -g artillery

# Create test.yml
config:
  target: "http://localhost:5000"
  phases:
    - duration: 60
      arrivalRate: 10

scenarios:
  - flow:
      - get:
          url: "/api/analysts/discovery?page=1&limit=20"

# Run test
artillery run test.yml

# Target: < 2s response time at 10 req/sec
```

---

## Troubleshooting

### Issue: 401 Unauthorized

```bash
# Solution: Ensure token is not expired
# Generate new token via /api/auth/login
```

### Issue: File upload returns 500

```bash
# Check Cloudinary credentials
# Verify /tmp directory is writable
# Check file size < 5MB
```

### Issue: Discovery page returns empty array

```bash
# Ensure analyst is approved
# Check deleted_at IS NULL
# Verify indexes exist
```

### Issue: Email not received

```bash
# Check Resend API key
# Verify domain in Resend
# Check spam folder
```

---

## Next Steps

After completing this quick start:

1. ✓ Implement frontend integration
2. ✓ Set up production environment
3. ✓ Configure monitoring (Sentry, Datadog)
4. ✓ Set up automated tests (Jest, Supertest)
5. ✓ Deploy to staging environment
6. ✓ Perform security audit
7. ✓ Load test with expected traffic
8. ✓ Deploy to production

---

**Happy Testing!**

For detailed documentation, see: `ANALYST_VERIFICATION_IMPLEMENTATION.md`
