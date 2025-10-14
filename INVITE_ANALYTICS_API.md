# Invite Link System & Analytics Dashboard API

Complete API documentation for the invite link system and analytics dashboard.

## Table of Contents
- [Invite Link System](#invite-link-system)
- [Discount Codes](#discount-codes)
- [Analytics Dashboard](#analytics-dashboard)
- [Integration Guide](#integration-guide)

---

## Invite Link System

The invite link system enables zero-CAC (Customer Acquisition Cost) growth by allowing analysts to bring their own audiences.

### Generate Invite Link

**Endpoint:** `POST /api/invites/generate`

**Access:** Private (Analyst only)

**Request Body:**
```json
{
  "invite_code": "RAJESH_TELEGRAM50",  // Optional: custom code (auto-generated if not provided)
  "link_name": "Telegram Migration",
  "link_description": "Special link for Telegram subscribers",
  "discount_code_id": "uuid",          // Optional: link to discount code
  "expires_at": "2025-12-31T23:59:59Z", // Optional: expiry date
  "max_uses": 100,                     // Optional: usage limit
  "utm_source": "telegram",            // Optional: UTM tracking
  "utm_medium": "social",
  "utm_campaign": "migration_2025"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invite link generated successfully",
  "data": {
    "inviteLink": {
      "id": "uuid",
      "analyst_id": "uuid",
      "invite_code": "RAJESH_TELEGRAM50",
      "link_name": "Telegram Migration",
      "is_active": true,
      "total_clicks": 0,
      "conversions_count": 0,
      "created_at": "2025-10-09T..."
    },
    "fullUrl": "https://platform.com/signup?invite=RAJESH_TELEGRAM50"
  }
}
```

---

### Get Invite Details (Public)

**Endpoint:** `GET /api/invites/:code`

**Access:** Public

**Example:** `GET /api/invites/RAJESH_TELEGRAM50`

**Response:**
```json
{
  "success": true,
  "message": "Invite link is valid",
  "data": {
    "isValid": true,
    "invite_code": "RAJESH_TELEGRAM50",
    "analyst_name": "Rajesh Kumar",
    "analyst_photo": "https://...",
    "sebi_registration_number": "INH000001234",
    "discount_code": "TELEGRAM50",
    "discount_type": "percentage",
    "discount_value": 50,
    "expires_at": null
  }
}
```

---

### Track Click

**Endpoint:** `POST /api/invites/:code/track-click`

**Access:** Public (rate-limited)

**Request Body:**
```json
{
  "fingerprint": "browser_fingerprint_hash"  // Optional: for unique visitor tracking
}
```

**Response:**
```json
{
  "success": true,
  "message": "Click tracked successfully",
  "data": {
    "invite_code": "RAJESH_TELEGRAM50",
    "total_clicks": 150
  }
}
```

---

### Get My Invite Links

**Endpoint:** `GET /api/invites/my-links`

**Access:** Private (Analyst only)

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)
- `active_only` (default: false)

**Response:**
```json
{
  "success": true,
  "message": "Invite links fetched successfully",
  "data": {
    "inviteLinks": [
      {
        "id": "uuid",
        "invite_code": "RAJESH_TELEGRAM50",
        "link_name": "Telegram Migration",
        "total_clicks": 523,
        "unique_visitors": 412,
        "signups_count": 89,
        "conversions_count": 34,
        "conversion_rate": 6.5,
        "total_revenue_generated": 340000,
        "status": "active",
        "fullUrl": "https://platform.com/signup?invite=RAJESH_TELEGRAM50"
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

---

### Get Invite Analytics

**Endpoint:** `GET /api/invites/:id/analytics`

**Access:** Private (Analyst only, own links)

**Response:**
```json
{
  "success": true,
  "message": "Invite link analytics fetched successfully",
  "data": {
    "id": "uuid",
    "invite_code": "RAJESH_TELEGRAM50",
    "total_clicks": 523,
    "unique_visitors": 412,
    "signups_count": 89,
    "conversions_count": 34,
    "total_revenue_generated": 340000,
    "conversion_rate": 6.5,
    "click_to_signup_rate": 17.02,
    "signup_to_conversion_rate": 38.2,
    "avg_revenue_per_conversion": 10000,
    "total_revenue_inr": 3400.00
  }
}
```

---

### Update Invite Link

**Endpoint:** `PUT /api/invites/:id`

**Access:** Private (Analyst only, own links)

**Request Body:**
```json
{
  "link_name": "Updated Name",
  "is_active": false,
  "max_uses": 200
}
```

---

### Delete Invite Link

**Endpoint:** `DELETE /api/invites/:id`

**Access:** Private (Analyst only, own links)

---

### Get Invite Summary

**Endpoint:** `GET /api/invites/summary`

**Access:** Private (Analyst only)

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_links": 15,
      "active_links": 12,
      "total_clicks": 5234,
      "total_unique_visitors": 4102,
      "total_signups": 823,
      "total_conversions": 312,
      "total_revenue_inr": 31200.00,
      "overall_conversion_rate": 5.96
    },
    "topPerforming": [
      {
        "id": "uuid",
        "invite_code": "RAJESH_TELEGRAM50",
        "conversions_count": 89,
        "total_revenue_inr": 8900.00,
        "conversion_rate": 7.8
      }
    ]
  }
}
```

---

## Discount Codes

### Create Discount Code

**Endpoint:** `POST /api/invites/discount-codes`

**Access:** Private (Analyst only)

**Request Body:**
```json
{
  "code": "TELEGRAM50",
  "code_name": "Telegram 50% Off",
  "code_description": "50% discount for first month",
  "discount_type": "percentage",        // or "fixed_amount"
  "discount_value": 50,                 // 50% or amount in paise
  "max_discount_amount": 50000,         // Optional: cap in paise (₹500)
  "applicable_tiers": ["tier_uuid"],    // Optional: specific tiers
  "billing_cycle_restriction": "both",  // "monthly", "yearly", or "both"
  "first_time_only": true,              // Only for new subscribers
  "usage_limit": 100,                   // Optional: total uses
  "per_user_limit": 1,                  // Uses per user
  "valid_from": "2025-10-01T00:00:00Z",
  "valid_until": "2025-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Discount code created successfully",
  "data": {
    "id": "uuid",
    "code": "TELEGRAM50",
    "discount_type": "percentage",
    "discount_value": 50,
    "usage_count": 0,
    "usage_limit": 100,
    "is_active": true
  }
}
```

---

### Validate Discount Code

**Endpoint:** `POST /api/invites/discount-codes/validate`

**Access:** Private (Authenticated users)

**Request Body:**
```json
{
  "code": "TELEGRAM50",
  "tier_id": "uuid",
  "billing_cycle": "monthly"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Valid discount code",
  "data": {
    "isValid": true,
    "reason": "Valid discount code",
    "discountCode": {
      "code": "TELEGRAM50",
      "discount_type": "percentage",
      "discount_value": 50,
      "max_discount_amount": 50000
    }
  }
}
```

---

### Get Discount Code Statistics

**Endpoint:** `GET /api/invites/discount-codes/:id/stats`

**Access:** Private (Analyst only, own codes)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "code": "TELEGRAM50",
    "usage_count": 45,
    "usage_limit": 100,
    "total_revenue_inr": 4500.00,
    "total_discount_given_inr": 4500.00,
    "active_subscriptions": 38,
    "total_subscriptions": 45
  }
}
```

---

## Analytics Dashboard

### Dashboard Overview

**Endpoint:** `GET /api/analytics/overview`

**Access:** Private (Analyst only)

**Response:**
```json
{
  "success": true,
  "data": {
    "active_subscribers": 156,
    "new_subscribers_30d": 23,
    "revenue_mtd": 15600.00,
    "total_revenue": 234500.00,
    "total_posts": 342,
    "total_views": 45678,
    "avg_rating": 4.7,
    "total_reviews": 89
  }
}
```

---

### Revenue Metrics

**Endpoint:** `GET /api/analytics/revenue?date_range=30`

**Access:** Private (Analyst only)

**Query Parameters:**
- `date_range`: Days to look back (default: 30)

**Response:**
```json
{
  "success": true,
  "data": {
    "mtd": {
      "revenue_inr": 15600.00,
      "subscription_count": 12
    },
    "recent": {
      "revenue_inr": 23400.00,
      "subscription_count": 18,
      "days": 30
    },
    "allTime": {
      "revenue_inr": 234500.00,
      "total_subscriptions": 189
    },
    "dailyBreakdown": [
      {
        "date": "2025-10-01",
        "revenue_inr": 800.00,
        "new_subscriptions": 2
      }
    ],
    "byTier": [
      {
        "tier_name": "Premium",
        "subscriber_count": 45,
        "revenue_inr": 45000.00
      }
    ],
    "projection": {
      "projected_monthly_revenue_inr": 15600.00
    }
  }
}
```

---

### Subscriber Metrics

**Endpoint:** `GET /api/analytics/subscribers?date_range=30`

**Access:** Private (Analyst only)

**Response:**
```json
{
  "success": true,
  "data": {
    "overall": {
      "active_subscribers": 156,
      "cancelled_subscribers": 23,
      "suspended_subscribers": 5,
      "total_subscribers": 184
    },
    "newSubscribers": {
      "last_7_days": 8,
      "last_30_days": 23,
      "this_month": 18
    },
    "cancelled": {
      "last_7_days": 2,
      "last_30_days": 7
    },
    "dailyGrowth": [
      {
        "date": "2025-10-01",
        "new_subscribers": 3,
        "cumulative_subscribers": 153
      }
    ],
    "growthRate": {
      "current": 156,
      "previous": 133,
      "growth_rate_percent": 17.29
    },
    "churnRate": {
      "start_subscribers": 133,
      "churned_subscribers": 7,
      "churn_rate_percent": 5.26
    }
  }
}
```

---

### Post Performance

**Endpoint:** `GET /api/analytics/posts?date_range=30`

**Access:** Private (Analyst only)

**Response:**
```json
{
  "success": true,
  "data": {
    "overall": {
      "total_posts": 342,
      "posts_this_month": 28,
      "posts_recent": 35,
      "avg_views_per_post": 133.5,
      "avg_bookmarks_per_post": 12.3,
      "total_views": 45678,
      "total_bookmarks": 4205
    },
    "engagement": {
      "total_views": 45678,
      "total_bookmarks": 4205,
      "engagement_rate_percent": 9.2
    },
    "topPosts": [
      {
        "id": "uuid",
        "title": "NIFTY BUY Call",
        "stock_symbol": "NIFTY",
        "views_count": 456,
        "bookmarks_count": 89,
        "engagement_rate": 19.52
      }
    ],
    "byType": [
      {
        "post_type": "call",
        "post_count": 234,
        "avg_views": 145.3,
        "avg_bookmarks": 15.2
      }
    ],
    "dailyActivity": [
      {
        "date": "2025-10-01",
        "posts_created": 3,
        "total_views": 423,
        "total_bookmarks": 45
      }
    ]
  }
}
```

---

### Engagement Metrics

**Endpoint:** `GET /api/analytics/engagement?date_range=30`

**Access:** Private (Analyst only)

**Response:**
```json
{
  "success": true,
  "data": {
    "chat": {
      "total_messages": 5234,
      "messages_last_7_days": 823,
      "unique_chatters": 89,
      "active_chatters_last_7_days": 45
    },
    "mostActiveChannel": {
      "id": "uuid",
      "name": "Premium Traders",
      "channel_type": "premium",
      "message_count": 3456,
      "unique_users": 67
    },
    "bookmarks": {
      "total_bookmarks": 4205,
      "bookmarks_last_7_days": 234,
      "bookmarks_last_30_days": 823,
      "unique_bookmarkers": 123
    },
    "activityByDay": [
      {
        "day_of_week": "Monday",
        "day_number": 1,
        "activity_count": 1234
      }
    ]
  }
}
```

---

### Review Analytics

**Endpoint:** `GET /api/analytics/reviews`

**Access:** Private (Analyst only)

**Response:**
```json
{
  "success": true,
  "data": {
    "current": {
      "average_rating": 4.7,
      "total_reviews": 89,
      "verified_reviews": 67
    },
    "distribution": [
      {
        "rating": 5,
        "count": 56,
        "percentage": 62.92
      },
      {
        "rating": 4,
        "count": 23,
        "percentage": 25.84
      }
    ],
    "trend": [
      {
        "month": "2025-09",
        "average_rating": 4.6,
        "review_count": 12
      }
    ],
    "recentReviews": [
      {
        "id": "uuid",
        "rating": 5,
        "review_title": "Excellent analyst!",
        "user_name": "John Doe",
        "created_at": "2025-10-05T...",
        "analyst_response": "Thank you!"
      }
    ],
    "responseRate": {
      "total_reviews": 89,
      "responded_reviews": 67,
      "response_rate_percent": 75.28
    }
  }
}
```

---

### Churn Analysis

**Endpoint:** `GET /api/analytics/churn?date_range=90`

**Access:** Private (Analyst only)

**Response:**
```json
{
  "success": true,
  "data": {
    "overall": {
      "total_subscribers": 133,
      "churned_count": 18,
      "churn_rate_percent": 13.53
    },
    "monthlyTrend": [
      {
        "month": "2025-09",
        "cohort_size": 45,
        "churned_count": 5,
        "churn_rate_percent": 11.11
      }
    ],
    "lifetime": {
      "avg_lifetime_days": 156,
      "min_lifetime_days": 7,
      "max_lifetime_days": 365
    },
    "retentionByTier": [
      {
        "tier_name": "Premium",
        "total_subscribers": 67,
        "active_subscribers": 61,
        "churned_subscribers": 6,
        "retention_rate_percent": 91.04
      }
    ],
    "atRisk": {
      "at_risk_count": 12,
      "expiring_this_week": ["uuid1", "uuid2"]
    }
  }
}
```

---

### Call Performance Analytics

**Endpoint:** `GET /api/analytics/calls?date_range=90`

**Access:** Private (Analyst only)

**Response:**
```json
{
  "success": true,
  "data": {
    "overall": {
      "total_calls": 145,
      "successful_calls": 98,
      "failed_calls": 32,
      "open_calls": 15,
      "win_rate_percent": 75.38,
      "avg_profit_on_wins": 8.5,
      "avg_loss_on_losses": -3.2
    },
    "byStrategy": [
      {
        "strategy_type": "swing",
        "call_count": 67,
        "wins": 52,
        "losses": 12,
        "win_rate_percent": 81.25
      }
    ],
    "topStocks": [
      {
        "stock_symbol": "RELIANCE",
        "call_count": 12,
        "wins": 10,
        "avg_profit_percent": 9.2
      }
    ]
  }
}
```

---

## Integration Guide

### Frontend Integration Example

```javascript
// Generate invite link
const generateInviteLink = async (data) => {
  const response = await fetch('/api/invites/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  return await response.json();
};

// Track invite click (on signup page)
const trackInviteClick = async (inviteCode) => {
  const fingerprint = await generateBrowserFingerprint();

  await fetch(`/api/invites/${inviteCode}/track-click`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fingerprint })
  });
};

// Validate discount code during checkout
const validateDiscountCode = async (code, tierId, billingCycle) => {
  const response = await fetch('/api/invites/discount-codes/validate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      tier_id: tierId,
      billing_cycle: billingCycle
    })
  });

  return await response.json();
};

// Get analytics dashboard data
const getAnalyticsDashboard = async () => {
  const [overview, revenue, subscribers, posts] = await Promise.all([
    fetch('/api/analytics/overview', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }).then(r => r.json()),

    fetch('/api/analytics/revenue?date_range=30', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }).then(r => r.json()),

    fetch('/api/analytics/subscribers?date_range=30', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }).then(r => r.json()),

    fetch('/api/analytics/posts?date_range=30', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }).then(r => r.json())
  ]);

  return { overview, revenue, subscribers, posts };
};
```

---

## Error Responses

All endpoints follow a consistent error format:

```json
{
  "success": false,
  "message": "User-friendly error message",
  "error": "Technical error details (development only)"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation error)
- `401`: Unauthorized (missing/invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (duplicate resource)
- `429`: Too Many Requests (rate limit)
- `500`: Internal Server Error

---

## Rate Limits

- **Standard endpoints:** 100 requests per 15 minutes
- **Auth endpoints:** 5 requests per 15 minutes
- **Track click:** 5 requests per 15 minutes
- **Analytics:** 100 requests per 15 minutes

Rate limit headers are included in all responses:
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining
- `RateLimit-Reset`: Timestamp when limit resets
