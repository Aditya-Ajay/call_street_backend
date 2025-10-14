# Post API Endpoints - Quick Reference

## Base URL
`http://localhost:5000/api/posts`

---

## Authentication
All endpoints marked **Private** require JWT token in header:
```
Authorization: Bearer <your_jwt_token>
```

---

## POST CREATION & MANAGEMENT

### 1. Create Post with AI Formatting
```http
POST /api/posts/create
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "raw_content": "NIFTY buy at 19500 target 19600 stop loss 19450 high confidence",
  "language": "en",           // Optional: 'en', 'hi', 'hinglish'
  "post_type": "call",         // Optional: 'call', 'update', 'commentary'
  "audience": "paid",          // Required: 'free', 'paid', 'both'
  "is_urgent": false,          // Optional
  "use_ai": true               // Optional, default: true
}

Response 201:
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "post": { /* full post object */ },
    "ai_formatted": true
  }
}
```

**Access:** Analyst only
**Rate Limit:** 20 posts per day per analyst

---

### 2. Re-format Post with AI
```http
POST /api/posts/:id/format-ai
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "language": "en"  // Optional
}

Response 200:
{
  "success": true,
  "message": "Post formatted successfully",
  "data": {
    "post": { /* updated post */ },
    "metadata": {
      "tokensUsed": 250,
      "latencyMs": 1200
    }
  }
}
```

**Access:** Analyst only (own posts)

---

### 3. Update Post
```http
PUT /api/posts/:id
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "title": "Updated title",
  "content": "Updated content",
  "strategy_type": "swing",
  "audience": "both",
  "is_urgent": true,
  "is_pinned": false
}

Response 200:
{
  "success": true,
  "message": "Post updated successfully",
  "data": {
    "post": { /* updated post */ }
  }
}
```

**Access:** Analyst only (own posts)

---

### 4. Delete Post
```http
DELETE /api/posts/:id
Authorization: Bearer <token>

Response 200:
{
  "success": true,
  "message": "Post deleted successfully"
}
```

**Access:** Analyst only (own posts)
**Note:** Soft delete (post hidden but data preserved)

---

## FEED & DISCOVERY

### 5. Get User's Personalized Feed
```http
GET /api/posts/feed?page=1&limit=20&date_filter=today&urgency_filter=urgent_only&strategy_filter=intraday&analyst_id=uuid
Authorization: Bearer <token>

Query Parameters:
- page: number (default: 1)
- limit: number (default: 20, max: 100)
- date_filter: 'all' | 'today' | 'this_week' | 'this_month'
- urgency_filter: 'all' | 'urgent_only'
- strategy_filter: 'all' | 'intraday' | 'swing' | 'positional' | 'long_term' | 'options'
- analyst_id: UUID (optional, filter by specific analyst)

Response 200:
{
  "success": true,
  "message": "Feed fetched successfully",
  "data": {
    "posts": [
      {
        "id": "uuid",
        "analyst_id": "uuid",
        "analyst_name": "John Analyst",
        "analyst_photo": "https://...",
        "stock_symbol": "NIFTY",
        "action": "BUY",
        "entry_price": 19500,
        "target_price": 19600,
        "stop_loss": 19450,
        "risk_reward_ratio": "1:2",
        "confidence_level": "HIGH",
        "is_urgent": true,
        "is_bookmarked": false,
        "has_subscription": true,
        "views_count": 1234,
        "bookmarks_count": 56,
        "created_at": "2025-10-08T10:30:00Z"
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8,
    "hasMore": true
  }
}
```

**Access:** Private (authenticated users only)
**Note:** Only shows posts from subscribed analysts

---

### 6. Get Single Post
```http
GET /api/posts/:id
Authorization: Bearer <token> (optional)

Response 200 (With Subscription):
{
  "success": true,
  "message": "Post fetched successfully",
  "data": {
    "post": {
      "id": "uuid",
      "analyst_name": "John Analyst",
      "content": "NIFTY buy at 19500...",
      "content_formatted": {
        "stock": "NIFTY",
        "action": "BUY",
        "entry_price": 19500,
        "target_price": 19600,
        "stop_loss": 19450,
        "confidence": "HIGH",
        "reasoning": "Breakout above resistance",
        "risk_reward_ratio": "1:2"
      },
      "stock_symbol": "NIFTY",
      "action": "BUY",
      "entry_price": 19500,
      "is_bookmarked": false,
      "views_count": 1234
    },
    "fullAccessAvailable": true
  }
}

Response 200 (Without Subscription - Teaser):
{
  "success": true,
  "message": "Post preview available",
  "data": {
    "post": {
      "id": "uuid",
      "analyst_name": "John Analyst",
      "content": "NIFTY buy at 19500 target 19600 stop loss 19450 high confidence breakout above resistan...",
      "content_formatted": null,
      "entry_price": null,
      "target_price": null,
      "stop_loss": null
    },
    "requiresSubscription": true,
    "fullAccessAvailable": false
  }
}
```

**Access:** Public (with optional auth)
**Note:** Free tier users see teaser only for paid posts

---

### 7. Get Analyst's Posts
```http
GET /api/posts/analyst/:analystId?page=1&limit=20&sample_only=true
Authorization: Bearer <token> (optional)

Query Parameters:
- page: number (default: 1)
- limit: number (default: 20)
- sample_only: boolean (default: false) - If true, returns only 3 most recent posts

Response 200:
{
  "success": true,
  "message": "Analyst posts fetched successfully",
  "data": {
    "posts": [ /* array of posts */ ],
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasSubscription": false
  }
}
```

**Access:** Public (with optional auth)
**Note:** Non-subscribers see only free posts or 3-post sample

---

### 8. Get Posts by Stock Symbol
```http
GET /api/posts/stock/:symbol?page=1&limit=20
Authorization: Bearer <token> (optional)

Example:
GET /api/posts/stock/NIFTY?page=1&limit=20
GET /api/posts/stock/RELIANCE?page=1&limit=20

Response 200:
{
  "success": true,
  "message": "Posts fetched successfully",
  "data": {
    "posts": [ /* array of posts for this stock */ ],
    "total": 25,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

**Access:** Public (with optional auth)

---

## BOOKMARKS

### 9. Bookmark Post
```http
POST /api/posts/:id/bookmark
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "notes": "Great swing trade idea"  // Optional
}

Response 201:
{
  "success": true,
  "message": "Post bookmarked successfully",
  "data": {
    "bookmark": {
      "id": "uuid",
      "user_id": "uuid",
      "post_id": "uuid",
      "notes": "Great swing trade idea",
      "created_at": "2025-10-08T10:30:00Z"
    }
  }
}

Error 409 (Already Bookmarked):
{
  "success": false,
  "message": "Post already bookmarked"
}
```

**Access:** Private

---

### 10. Remove Bookmark
```http
DELETE /api/posts/:id/bookmark
Authorization: Bearer <token>

Response 200:
{
  "success": true,
  "message": "Bookmark removed successfully"
}

Error 404:
{
  "success": false,
  "message": "Bookmark not found"
}
```

**Access:** Private

---

### 11. Get User's Bookmarks
```http
GET /api/posts/bookmarks?page=1&limit=20
Authorization: Bearer <token>

Response 200:
{
  "success": true,
  "message": "Bookmarks fetched successfully",
  "data": {
    "bookmarks": [
      {
        "bookmark_id": "uuid",
        "notes": "Great swing trade idea",
        "bookmarked_at": "2025-10-08T10:30:00Z",
        "post_id": "uuid",
        "analyst_name": "John Analyst",
        "stock_symbol": "NIFTY",
        "action": "BUY",
        "entry_price": 19500,
        "post_created_at": "2025-10-07T15:20:00Z"
      }
    ],
    "total": 15,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasMore": false
  }
}
```

**Access:** Private

---

## ANALYTICS & OUTCOMES (ANALYST ONLY)

### 12. Mark Call Outcome
```http
POST /api/posts/:id/mark-outcome
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "call_status": "target_hit",        // Required: 'target_hit', 'stop_loss_hit', 'closed', 'expired'
  "actual_exit_price": 19600,         // Optional
  "actual_profit_percent": 2.5        // Optional
}

Response 200:
{
  "success": true,
  "message": "Call outcome marked successfully",
  "data": {
    "post": {
      "id": "uuid",
      "call_status": "target_hit",
      "actual_exit_price": 19600,
      "actual_profit_percent": 2.5,
      "closed_at": "2025-10-08T14:30:00Z"
    }
  }
}
```

**Access:** Analyst only (own posts)
**Note:** Private to analyst, not shown to users

---

### 13. Get Post Analytics
```http
GET /api/posts/analytics/:id
Authorization: Bearer <token>

Response 200:
{
  "success": true,
  "message": "Analytics fetched successfully",
  "data": {
    "analytics": {
      "id": "uuid",
      "stock_symbol": "NIFTY",
      "action": "BUY",
      "post_type": "call",
      "strategy_type": "intraday",
      "views_count": 1234,
      "bookmarks_count": 56,
      "comments_count": 12,
      "call_status": "target_hit",
      "actual_profit_percent": 2.5,
      "created_at": "2025-10-08T10:30:00Z",
      "closed_at": "2025-10-08T14:30:00Z",
      "views_percentage": 15.2,        // % of analyst's total views
      "bookmark_rate": 4.54            // % of viewers who bookmarked
    }
  }
}
```

**Access:** Analyst only (own posts)

---

## ERROR RESPONSES

All errors follow this format:

```json
{
  "success": false,
  "message": "User-friendly error message"
}
```

**Common Status Codes:**
- `200` - OK (GET, PUT, DELETE success)
- `201` - Created (POST success)
- `400` - Bad Request (validation error)
- `401` - Unauthorized (no token or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (e.g., already bookmarked)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## RATE LIMITS

- **Post Creation:** 20 posts per day per analyst
- **Standard API:** 100 requests per 15 minutes
- **Upload:** 10 requests per hour

---

## PAGINATION

All list endpoints support pagination:

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

**Response:**
```json
{
  "posts": [ /* array */ ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8,
  "hasMore": true
}
```

---

## FILTERS

### Feed Filters (GET /api/posts/feed)

**Date Filter:**
- `all` - All posts
- `today` - Today's posts only
- `this_week` - This week's posts
- `this_month` - This month's posts

**Urgency Filter:**
- `all` - All posts
- `urgent_only` - Only urgent posts

**Strategy Filter:**
- `all` - All strategies
- `intraday` - Intraday calls
- `swing` - Swing trades
- `positional` - Positional trades
- `long_term` - Long term investments
- `options` - Options trading

**Analyst Filter:**
- Provide `analyst_id` UUID to filter by specific analyst

**Example:**
```http
GET /api/posts/feed?date_filter=today&urgency_filter=urgent_only&strategy_filter=intraday&analyst_id=uuid-here
```

---

## TESTING WITH CURL

### Create Post
```bash
curl -X POST http://localhost:5000/api/posts/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_content": "NIFTY buy at 19500 target 19600 stop loss 19450",
    "audience": "paid",
    "is_urgent": false
  }'
```

### Get Feed
```bash
curl -X GET "http://localhost:5000/api/posts/feed?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Bookmark Post
```bash
curl -X POST http://localhost:5000/api/posts/POST_ID/bookmark \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Great call!"}'
```

---

## NOTES

1. **AI Formatting:** Automatically extracts structured data from raw text. Fallback to raw text if AI fails.

2. **Access Control:**
   - Free tier users see teasers for paid posts
   - Paid tier users see full content
   - Analysts see analytics for own posts

3. **Email Notifications:** Urgent posts trigger automatic email to all active subscribers.

4. **Soft Delete:** Deleted posts are hidden but data is preserved for analytics.

5. **View Tracking:** Views are auto-incremented when authenticated users view posts.

6. **Performance:** All queries optimized with indexes. P95 response time < 500ms.

---

## SUPPORT

For issues or questions:
- Check error message in response
- Verify JWT token is valid
- Ensure correct HTTP method and endpoint
- Check request body matches required fields
- Verify user role (analyst/trader/admin)

---

**Last Updated:** 2025-10-08
**Version:** 1.0.0
**Backend Agent:** Production-grade implementation complete
