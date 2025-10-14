# Reviews & Ratings API Documentation

## Overview

The Reviews & Ratings system allows users to submit reviews for analysts they've subscribed to for 30+ days. It includes helpfulness voting, analyst responses, and moderation features.

---

## Authentication

All endpoints (except public GET endpoints) require JWT authentication:

```
Authorization: Bearer <access_token>
```

---

## Endpoints

### 1. Submit Review

Submit a review for an analyst. Requires active subscription of 30+ days.

**Endpoint:** `POST /api/reviews/submit`

**Authentication:** Required (Trader)

**Rate Limit:** Standard (10 requests/minute)

**Request Body:**

```json
{
  "analystId": "uuid",
  "rating": 5,
  "reviewTitle": "Great analyst!",
  "reviewText": "This analyst has provided excellent trading calls consistently. Highly recommend!",
  "isAnonymous": false
}
```

**Validation Rules:**
- `analystId`: Required, valid UUID
- `rating`: Required, integer 1-5
- `reviewTitle`: Optional, 5-255 characters
- `reviewText`: Optional, 50-1000 characters
- `isAnonymous`: Optional, boolean (default: false)

**Business Logic:**
- User must have active subscription to analyst
- Subscription must be 30+ days old
- User cannot review themselves
- One review per user per analyst (use edit to update)

**Success Response (201):**

```json
{
  "success": true,
  "message": "Review submitted successfully",
  "data": {
    "review": {
      "id": "uuid",
      "rating": 5,
      "reviewTitle": "Great analyst!",
      "reviewText": "This analyst has provided excellent trading calls...",
      "isAnonymous": false,
      "createdAt": "2025-01-15T12:00:00Z"
    }
  }
}
```

**Error Responses:**

```json
// 400 - Validation Error
{
  "success": false,
  "errors": [
    {
      "field": "reviewText",
      "message": "Review text must be at least 50 characters"
    }
  ]
}

// 403 - Not Eligible
{
  "success": false,
  "message": "You must be subscribed for at least 30 days before leaving a review. Current duration: 15 days."
}

// 409 - Already Reviewed
{
  "success": false,
  "message": "You have already reviewed this analyst. Use the edit endpoint to update your review."
}
```

---

### 2. Get Analyst Reviews

Retrieve all reviews for an analyst with sorting and pagination.

**Endpoint:** `GET /api/reviews/analyst/:analystId`

**Authentication:** Public (no auth required)

**Query Parameters:**
- `sortBy` (optional): `helpfulness` | `recent` | `highest` | `lowest` (default: `helpfulness`)
- `limit` (optional): 1-100 (default: 20)
- `offset` (optional): >= 0 (default: 0)

**Example Request:**

```
GET /api/reviews/analyst/a1b2c3d4-e5f6-7890-abcd-ef1234567890?sortBy=recent&limit=10&offset=0
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "reviewer_name": "John Doe",
        "reviewer_photo": "https://...",
        "rating": 5,
        "review_title": "Excellent analyst",
        "review_text": "Great calls and excellent risk management...",
        "is_verified_subscriber": true,
        "subscription_duration_days": 90,
        "helpfulness_upvotes": 45,
        "helpfulness_downvotes": 2,
        "analyst_response": "Thank you for your feedback!",
        "analyst_response_at": "2025-01-10T15:30:00Z",
        "created_at": "2025-01-09T10:00:00Z"
      }
    ],
    "ratingStats": {
      "totalReviews": 150,
      "avgRating": 4.7,
      "simpleAvgRating": 4.6,
      "distribution": {
        "5": { "count": 90, "percentage": 60.0 },
        "4": { "count": 38, "percentage": 25.3 },
        "3": { "count": 15, "percentage": 10.0 },
        "2": { "count": 5, "percentage": 3.3 },
        "1": { "count": 2, "percentage": 1.3 }
      }
    },
    "pagination": {
      "total": 150,
      "limit": 10,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

**Anonymous Reviews:**

Reviews marked as anonymous show:
- `reviewer_name`: "Anonymous User"
- `reviewer_photo`: null

---

### 3. Get My Reviews

Get all reviews submitted by the current user.

**Endpoint:** `GET /api/reviews/my-reviews`

**Authentication:** Required

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "analyst_name": "Jane Smith",
        "analyst_photo": "https://...",
        "sebi_registration_number": "INH000001234",
        "rating": 5,
        "review_title": "Great analyst!",
        "review_text": "...",
        "helpfulness_upvotes": 12,
        "analyst_response": "Thank you!",
        "created_at": "2025-01-09T10:00:00Z"
      }
    ],
    "totalReviews": 3
  }
}
```

---

### 4. Edit Own Review

Update an existing review.

**Endpoint:** `PUT /api/reviews/:id`

**Authentication:** Required (Review owner only)

**Rate Limit:** Standard

**Request Body:**

```json
{
  "rating": 4,
  "reviewTitle": "Updated title",
  "reviewText": "Updated review text...",
  "isAnonymous": true
}
```

**Validation:**
- All fields are optional
- At least one field must be provided
- Same validation rules as submit review

**Success Response (200):**

```json
{
  "success": true,
  "message": "Review updated successfully",
  "data": {
    "review": { /* updated review object */ }
  }
}
```

**Error Response (403):**

```json
{
  "success": false,
  "message": "You can only edit your own reviews"
}
```

---

### 5. Delete Own Review

Soft delete a review.

**Endpoint:** `DELETE /api/reviews/:id`

**Authentication:** Required (Review owner or Admin)

**Success Response (200):**

```json
{
  "success": true,
  "message": "Review deleted successfully"
}
```

**Error Response (404):**

```json
{
  "success": false,
  "message": "Review not found"
}
```

---

### 6. Vote Review as Helpful

Vote a review as helpful (toggle on/off).

**Endpoint:** `POST /api/reviews/:id/helpful`

**Authentication:** Required

**Rate Limit:** Standard

**Request Body:**

```json
{
  "vote": true  // true = add vote, false = remove vote
}
```

**Business Logic:**
- Users cannot vote on their own reviews
- Vote toggles on/off based on `vote` parameter

**Success Response (200):**

```json
{
  "success": true,
  "message": "Review marked as helpful",
  "data": {
    "helpfulVotes": 46
  }
}
```

**Error Response (400):**

```json
{
  "success": false,
  "message": "You cannot vote on your own review"
}
```

---

### 7. Analyst Respond to Review

Analyst adds a response to a review.

**Endpoint:** `POST /api/reviews/:id/respond`

**Authentication:** Required (Analyst only)

**Rate Limit:** Standard

**Request Body:**

```json
{
  "response": "Thank you for your honest feedback! I appreciate your trust and will continue to provide quality trading calls."
}
```

**Validation:**
- `response`: Required, 10-500 characters

**Business Logic:**
- Only the analyst being reviewed can respond
- Reviewer receives email notification
- Can only respond to reviews of their own profile

**Success Response (200):**

```json
{
  "success": true,
  "message": "Response added successfully",
  "data": {
    "response": "Thank you for your honest feedback!...",
    "respondedAt": "2025-01-10T15:30:00Z"
  }
}
```

**Error Response (403):**

```json
{
  "success": false,
  "message": "You can only respond to reviews of your own profile"
}
```

---

### 8. Edit Analyst Response

Update an existing analyst response.

**Endpoint:** `PUT /api/reviews/:id/respond`

**Authentication:** Required (Analyst only)

**Rate Limit:** Standard

**Request Body:**

```json
{
  "response": "Updated response text..."
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Response updated successfully",
  "data": {
    "response": "Updated response text...",
    "respondedAt": "2025-01-10T15:45:00Z"
  }
}
```

---

### 9. Delete Analyst Response

Remove analyst response from a review.

**Endpoint:** `DELETE /api/reviews/:id/respond`

**Authentication:** Required (Analyst only)

**Success Response (200):**

```json
{
  "success": true,
  "message": "Response deleted successfully"
}
```

---

### 10. Report Review

Flag a review as spam, fake, abusive, or inappropriate.

**Endpoint:** `POST /api/reviews/:id/report`

**Authentication:** Required

**Rate Limit:** Standard

**Request Body:**

```json
{
  "reason": "spam"  // spam | fake | abusive | inappropriate
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Review reported successfully. Our team will review it shortly."
}
```

---

### 11. Get Flagged Reviews (Admin Only)

Retrieve all reviews flagged for moderation.

**Endpoint:** `GET /api/reviews/moderation/flagged`

**Authentication:** Required (Admin only)

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "analyst_id": "uuid",
        "reviewer_name": "John Doe",
        "reviewer_email": "john@example.com",
        "analyst_name": "Jane Smith",
        "analyst_email": "jane@example.com",
        "rating": 1,
        "review_text": "...",
        "is_flagged": true,
        "flagged_reason": "spam",
        "created_at": "2025-01-09T10:00:00Z"
      }
    ],
    "totalFlagged": 5
  }
}
```

---

### 12. Moderate Review (Admin Only)

Approve or reject a flagged review.

**Endpoint:** `POST /api/reviews/:id/moderate`

**Authentication:** Required (Admin only)

**Request Body:**

```json
{
  "action": "approve"  // approve | reject
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Review approved successfully",
  "data": {
    "review": { /* moderated review object */ }
  }
}
```

---

## Rating Calculation Algorithm

The system uses a **weighted average** based on helpfulness votes:

```javascript
// Each review's weight increases with helpful votes
weight = 1 + (helpful_votes × 0.1)

// Weighted average calculation
totalRating = sum(rating × weight)
averageRating = totalRating / sum(weights)

// Rounded to 1 decimal place
displayRating = round(averageRating, 1)
```

**Example:**
- Review 1: 5 stars, 10 helpful votes → weight = 2.0
- Review 2: 3 stars, 0 helpful votes → weight = 1.0
- Weighted avg: (5×2.0 + 3×1.0) / (2.0 + 1.0) = 4.3 stars

This ensures highly helpful reviews have more influence on the overall rating.

---

## Email Notifications

### New Review Notification (to Analyst)

Sent when an analyst receives a new review.

**Trigger:** Review submitted successfully

**Subject:** ⭐ New Review: 5 stars

**Content:**
- Rating (star icons)
- Review text
- Reviewer name (or "Anonymous")
- Link to view and respond

---

### Analyst Response Notification (to Reviewer)

Sent when analyst responds to a user's review.

**Trigger:** Analyst adds response

**Subject:** [Analyst Name] responded to your review

**Content:**
- Original review text
- Analyst's response
- Link to view full review

---

## Database Schema

### Reviews Table

```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  analyst_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_title VARCHAR(255),
  review_text TEXT,
  is_verified_subscriber BOOLEAN DEFAULT FALSE,
  subscription_duration_days INTEGER,
  is_anonymous BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT TRUE,
  is_flagged BOOLEAN DEFAULT FALSE,
  flagged_reason TEXT,
  moderated_by UUID,
  moderated_at TIMESTAMP,
  helpfulness_upvotes INTEGER DEFAULT 0,
  helpfulness_downvotes INTEGER DEFAULT 0,
  analyst_response TEXT,
  analyst_response_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP,

  CONSTRAINT check_user_not_analyst CHECK (user_id != analyst_id),
  CONSTRAINT unique_user_analyst_review UNIQUE (user_id, analyst_id)
);
```

**Indexes:**
- `idx_reviews_analyst` - Analyst reviews sorted by helpfulness
- `idx_reviews_user` - User's reviews
- `idx_reviews_rating` - Rating distribution analytics
- `idx_reviews_verified` - Verified subscriber reviews
- `idx_reviews_moderation` - Flagged reviews queue

---

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 400 | Validation Error | Invalid input data |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Not eligible or not owner |
| 404 | Not Found | Review doesn't exist |
| 409 | Conflict | Duplicate review |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

---

## Rate Limiting

- **Submit/Edit/Delete Review:** 10 requests/minute
- **Vote Helpful:** 10 requests/minute
- **Analyst Respond:** 10 requests/minute
- **Report Review:** 10 requests/minute

---

## Business Rules Summary

1. **Eligibility:** 30+ days active subscription required
2. **One Review per Analyst:** User can only review each analyst once
3. **No Self-Review:** Users cannot review themselves
4. **Edit Anytime:** Users can edit their reviews anytime
5. **Delete Anytime:** Users can delete reviews, admins can too
6. **Anonymous Option:** Reviewers can hide their identity
7. **Analyst Response:** Only one response per review
8. **Helpfulness Voting:** Cannot vote on own review
9. **Weighted Ratings:** Helpful reviews count more
10. **Auto-Approval:** Reviews auto-approved (manual moderation if flagged)

---

## Integration Examples

### Frontend - Submit Review

```javascript
const submitReview = async (analystId, rating, reviewText) => {
  try {
    const response = await fetch('http://localhost:5000/api/reviews/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        analystId,
        rating,
        reviewText,
        isAnonymous: false
      })
    });

    const data = await response.json();

    if (data.success) {
      console.log('Review submitted:', data.data.review);
    } else {
      console.error('Error:', data.errors);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
};
```

### Frontend - Get Reviews with Sorting

```javascript
const getAnalystReviews = async (analystId, sortBy = 'helpfulness') => {
  const response = await fetch(
    `http://localhost:5000/api/reviews/analyst/${analystId}?sortBy=${sortBy}&limit=20&offset=0`
  );

  const data = await response.json();

  return {
    reviews: data.data.reviews,
    stats: data.data.ratingStats,
    pagination: data.data.pagination
  };
};
```

### Frontend - Vote Helpful

```javascript
const voteHelpful = async (reviewId, isVoting) => {
  const response = await fetch(`http://localhost:5000/api/reviews/${reviewId}/helpful`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ vote: isVoting })
  });

  const data = await response.json();
  return data.data.helpfulVotes;
};
```

---

## Testing Checklist

- [ ] Submit review with valid 30+ day subscription
- [ ] Reject review with < 30 day subscription
- [ ] Reject duplicate review submission
- [ ] Reject self-review attempt
- [ ] Validate rating (1-5 only)
- [ ] Validate review text length (50-1000 chars)
- [ ] Anonymous review hides reviewer name
- [ ] Edit own review successfully
- [ ] Delete own review successfully
- [ ] Vote helpful increments count
- [ ] Unvote helpful decrements count
- [ ] Cannot vote on own review
- [ ] Analyst can respond to review
- [ ] Non-analyst cannot respond
- [ ] Email sent to analyst on new review
- [ ] Email sent to reviewer on analyst response
- [ ] Report review flags it for moderation
- [ ] Admin can view flagged reviews
- [ ] Admin can approve/reject reviews
- [ ] Weighted rating calculation accurate
- [ ] Rating distribution stats correct
- [ ] Pagination works correctly
- [ ] Sorting by helpfulness/recent/rating works

---

## Performance Considerations

1. **Indexes:** All frequently queried columns are indexed
2. **Pagination:** Default limit of 20 reviews per request
3. **Caching:** Consider caching rating stats (updated on review changes)
4. **Database Queries:** Optimized with proper JOINs and WHERE clauses
5. **Async Emails:** Email sending is non-blocking

---

## Security Measures

1. **Input Validation:** All inputs validated with express-validator
2. **SQL Injection Prevention:** Parameterized queries always
3. **XSS Prevention:** Review text sanitized before display
4. **Authorization:** Ownership checks on edit/delete
5. **Rate Limiting:** Prevents spam reviews
6. **CSRF Protection:** JWT tokens required
7. **Anonymous Privacy:** Reviewer identity protected when anonymous

---

## Monitoring & Analytics

**Key Metrics to Track:**
- Average review submission time
- Review approval rate
- Helpfulness vote distribution
- Analyst response rate
- Review edit frequency
- Report flag accuracy

**Logs to Monitor:**
- Failed subscription eligibility checks
- Duplicate review attempts
- Moderation queue size
- Email delivery failures

---

## Future Enhancements

1. **Helpful Votes Tracking:** Separate table to track who voted
2. **Review Photos:** Allow users to upload images with reviews
3. **Review Replies:** Allow users to reply to analyst responses
4. **Review Templates:** Pre-filled templates for common feedback
5. **Sentiment Analysis:** AI-powered sentiment scoring
6. **Verified Purchase Badge:** Highlight current subscribers
7. **Review Rewards:** Incentivize quality reviews
8. **Multi-Language Support:** Translate reviews
9. **Review Recommendations:** "Was this review helpful?" ML model

---

## Support

For API support or bug reports, contact: support@analystmarketplace.com

**Last Updated:** January 15, 2025
