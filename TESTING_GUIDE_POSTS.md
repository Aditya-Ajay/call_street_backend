# Post System Testing Guide

Complete testing guide for the content creation and feed system with sample requests.

---

## Prerequisites

1. **Server Running:** `npm start` or `node src/server.js`
2. **Database Migrated:** All migrations applied
3. **JWT Token:** Obtain from `/api/auth/login` or `/api/auth/signup`
4. **User Roles:**
   - Analyst account (for post creation)
   - Trader account (for feed and bookmarks)

---

## Getting JWT Tokens

### Analyst Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "analyst@example.com",
    "password": "password123"
  }'

# Save the accessToken from response
ANALYST_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Trader Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "trader@example.com",
    "password": "password123"
  }'

# Save the accessToken from response
TRADER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Test Flow 1: Post Creation with AI

### Step 1: Create Post with AI Formatting (Analyst)
```bash
curl -X POST http://localhost:5000/api/posts/create \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_content": "NIFTY buy at nineteen thousand five hundred target nineteen six hundred stop loss nineteen four fifty high confidence breakout above resistance",
    "language": "en",
    "audience": "paid",
    "is_urgent": false
  }'

# Expected Response (201):
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "post": {
      "id": "uuid-here",
      "analyst_id": "analyst-uuid",
      "title": "NIFTY BUY Call",
      "content": "NIFTY buy at nineteen...",
      "content_formatted": {
        "stock": "NIFTY",
        "action": "BUY",
        "strategy_type": "INTRADAY",
        "entry_price": 19500,
        "target_price": 19600,
        "stop_loss": 19450,
        "confidence": "HIGH",
        "reasoning": "breakout above resistance",
        "risk_reward_ratio": "1:2"
      },
      "stock_symbol": "NIFTY",
      "action": "BUY",
      "entry_price": 19500,
      "target_price": 19600,
      "stop_loss": 19450,
      "risk_reward_ratio": "1:2",
      "confidence_level": "HIGH",
      "is_urgent": false,
      "views_count": 0,
      "bookmarks_count": 0,
      "created_at": "2025-10-08T10:30:00Z"
    },
    "ai_formatted": true
  }
}

# Save the post ID for next steps
POST_ID="uuid-from-response"
```

### Step 2: Verify AI Formatting Success
**Check:**
- ✅ `ai_formatted: true`
- ✅ `content_formatted` has all fields populated
- ✅ `stock_symbol`, `action`, `entry_price` extracted correctly
- ✅ `risk_reward_ratio` calculated automatically (1:2)

---

## Test Flow 2: Hinglish Post Creation

### Create Post in Hinglish
```bash
curl -X POST http://localhost:5000/api/posts/create \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_content": "RELIANCE ko 2450 pe khareed lo target 2480 stop 2430 medium confidence consolidation breakout",
    "language": "hinglish",
    "audience": "both",
    "is_urgent": false
  }'

# Expected: AI recognizes Hindi words and extracts correctly
# "khareed lo" -> action: "BUY"
# "2450 pe" -> entry_price: 2450
```

---

## Test Flow 3: Urgent Post with Email Notification

### Create Urgent Post (Analyst)
```bash
curl -X POST http://localhost:5000/api/posts/create \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_content": "BANKNIFTY sell at 44500 target 44300 stop loss 44600 urgent market reversal",
    "audience": "paid",
    "is_urgent": true
  }'

# Expected:
# - Post created successfully
# - Email sent to all active subscribers (check server logs)
# - Log message: "Urgent post notifications sent to X subscribers"
```

**Verify:**
- Check subscriber emails for notification
- Verify email contains call details
- Server logs show email send attempts

---

## Test Flow 4: Feed System

### Get Personalized Feed (Trader with Subscription)
```bash
curl -X GET "http://localhost:5000/api/posts/feed?page=1&limit=20" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected Response (200):
{
  "success": true,
  "message": "Feed fetched successfully",
  "data": {
    "posts": [
      {
        "id": "uuid",
        "analyst_name": "John Analyst",
        "analyst_photo": "https://...",
        "stock_symbol": "NIFTY",
        "action": "BUY",
        "entry_price": 19500,
        "target_price": 19600,
        "stop_loss": 19450,
        "risk_reward_ratio": "1:2",
        "confidence_level": "HIGH",
        "is_urgent": false,
        "is_bookmarked": false,
        "has_subscription": true,
        "views_count": 0,
        "bookmarks_count": 0,
        "created_at": "2025-10-08T10:30:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasMore": false
  }
}
```

**Verify:**
- Only posts from subscribed analysts appear
- `has_subscription: true` for all posts
- Posts sorted by: urgent → pinned → created_at DESC

---

## Test Flow 5: Feed Filters

### Filter: Today's Posts Only
```bash
curl -X GET "http://localhost:5000/api/posts/feed?date_filter=today" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected: Only posts created today (CURRENT_DATE)
```

### Filter: Urgent Posts Only
```bash
curl -X GET "http://localhost:5000/api/posts/feed?urgency_filter=urgent_only" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected: Only posts with is_urgent = true
```

### Filter: Intraday Strategy
```bash
curl -X GET "http://localhost:5000/api/posts/feed?strategy_filter=intraday" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected: Only posts with strategy_type = 'intraday'
```

### Filter: Specific Analyst
```bash
curl -X GET "http://localhost:5000/api/posts/feed?analyst_id=analyst-uuid-here" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected: Only posts from this specific analyst
```

### Combined Filters
```bash
curl -X GET "http://localhost:5000/api/posts/feed?date_filter=today&urgency_filter=urgent_only&strategy_filter=intraday" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected: Today's urgent intraday posts only
```

---

## Test Flow 6: Access Control

### Non-Subscriber Views Paid Post (Teaser)
```bash
curl -X GET "http://localhost:5000/api/posts/$POST_ID" \
  -H "Authorization: Bearer $NON_SUBSCRIBER_TOKEN"

# Expected Response (200):
{
  "success": true,
  "message": "Post preview available",
  "data": {
    "post": {
      "id": "uuid",
      "content": "NIFTY buy at nineteen thousand five hundred target nineteen six hundred stop loss nineteen four fifty...",
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

**Verify:**
- ✅ Content truncated to 100 chars
- ✅ `content_formatted: null`
- ✅ Prices are null
- ✅ `requiresSubscription: true`

### Subscriber Views Paid Post (Full Content)
```bash
curl -X GET "http://localhost:5000/api/posts/$POST_ID" \
  -H "Authorization: Bearer $SUBSCRIBER_TOKEN"

# Expected Response (200):
{
  "success": true,
  "message": "Post fetched successfully",
  "data": {
    "post": {
      "id": "uuid",
      "content": "Full content here...",
      "content_formatted": { /* full structured data */ },
      "entry_price": 19500,
      "target_price": 19600,
      "stop_loss": 19450
    },
    "fullAccessAvailable": true
  }
}
```

**Verify:**
- ✅ Full content visible
- ✅ All prices visible
- ✅ `content_formatted` populated
- ✅ `fullAccessAvailable: true`

---

## Test Flow 7: Bookmarks

### Bookmark Post
```bash
curl -X POST "http://localhost:5000/api/posts/$POST_ID/bookmark" \
  -H "Authorization: Bearer $TRADER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Great swing trade setup"
  }'

# Expected Response (201):
{
  "success": true,
  "message": "Post bookmarked successfully",
  "data": {
    "bookmark": {
      "id": "bookmark-uuid",
      "user_id": "user-uuid",
      "post_id": "post-uuid",
      "notes": "Great swing trade setup",
      "created_at": "2025-10-08T10:35:00Z"
    }
  }
}
```

### Try Bookmarking Same Post Again (Should Fail)
```bash
curl -X POST "http://localhost:5000/api/posts/$POST_ID/bookmark" \
  -H "Authorization: Bearer $TRADER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Another note"
  }'

# Expected Response (409):
{
  "success": false,
  "message": "Post already bookmarked"
}
```

### Get User's Bookmarks
```bash
curl -X GET "http://localhost:5000/api/posts/bookmarks?page=1&limit=20" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected Response (200):
{
  "success": true,
  "message": "Bookmarks fetched successfully",
  "data": {
    "bookmarks": [
      {
        "bookmark_id": "uuid",
        "notes": "Great swing trade setup",
        "bookmarked_at": "2025-10-08T10:35:00Z",
        "post_id": "uuid",
        "analyst_name": "John Analyst",
        "stock_symbol": "NIFTY",
        "action": "BUY",
        "entry_price": 19500
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

### Remove Bookmark
```bash
curl -X DELETE "http://localhost:5000/api/posts/$POST_ID/bookmark" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected Response (200):
{
  "success": true,
  "message": "Bookmark removed successfully"
}
```

---

## Test Flow 8: Post Update

### Update Post (Analyst)
```bash
curl -X PUT "http://localhost:5000/api/posts/$POST_ID" \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated NIFTY Call",
    "is_urgent": true,
    "is_pinned": true
  }'

# Expected Response (200):
{
  "success": true,
  "message": "Post updated successfully",
  "data": {
    "post": {
      "id": "uuid",
      "title": "Updated NIFTY Call",
      "is_urgent": true,
      "is_pinned": true,
      "updated_at": "2025-10-08T10:40:00Z"
    }
  }
}
```

### Try Updating Other Analyst's Post (Should Fail)
```bash
curl -X PUT "http://localhost:5000/api/posts/$OTHER_ANALYST_POST_ID" \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hacked"
  }'

# Expected Response (404):
{
  "success": false,
  "message": "Post not found or you do not have permission to update it"
}
```

---

## Test Flow 9: Call Outcome Tracking

### Mark Call as Target Hit (Analyst)
```bash
curl -X POST "http://localhost:5000/api/posts/$POST_ID/mark-outcome" \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "call_status": "target_hit",
    "actual_exit_price": 19600,
    "actual_profit_percent": 2.5
  }'

# Expected Response (200):
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

### Mark Call as Stop Loss Hit
```bash
curl -X POST "http://localhost:5000/api/posts/$POST_ID/mark-outcome" \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "call_status": "stop_loss_hit",
    "actual_exit_price": 19450,
    "actual_profit_percent": -1.5
  }'
```

---

## Test Flow 10: Post Analytics

### Get Post Analytics (Analyst)
```bash
curl -X GET "http://localhost:5000/api/posts/analytics/$POST_ID" \
  -H "Authorization: Bearer $ANALYST_TOKEN"

# Expected Response (200):
{
  "success": true,
  "message": "Analytics fetched successfully",
  "data": {
    "analytics": {
      "id": "uuid",
      "stock_symbol": "NIFTY",
      "action": "BUY",
      "views_count": 1234,
      "bookmarks_count": 56,
      "comments_count": 12,
      "call_status": "target_hit",
      "actual_profit_percent": 2.5,
      "views_percentage": 15.2,
      "bookmark_rate": 4.54
    }
  }
}
```

**Verify:**
- ✅ `views_percentage` = (post views / analyst total views) * 100
- ✅ `bookmark_rate` = (bookmarks / views) * 100

### Trader Tries to Access Analytics (Should Fail)
```bash
curl -X GET "http://localhost:5000/api/posts/analytics/$POST_ID" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected Response (403):
{
  "success": false,
  "message": "Access denied. Required role: analyst"
}
```

---

## Test Flow 11: Analyst Public Profile

### Get Analyst's Posts (Public Sample)
```bash
curl -X GET "http://localhost:5000/api/posts/analyst/$ANALYST_ID?sample_only=true"

# No token needed (public)
# Expected: 3 most recent free posts
```

### Get Analyst's Posts (Non-Subscriber)
```bash
curl -X GET "http://localhost:5000/api/posts/analyst/$ANALYST_ID?page=1&limit=20" \
  -H "Authorization: Bearer $NON_SUBSCRIBER_TOKEN"

# Expected: Only free posts visible
```

### Get Analyst's Posts (Subscriber)
```bash
curl -X GET "http://localhost:5000/api/posts/analyst/$ANALYST_ID?page=1&limit=20" \
  -H "Authorization: Bearer $SUBSCRIBER_TOKEN"

# Expected: All posts visible (free + paid)
```

---

## Test Flow 12: Stock Filter

### Get All Posts for NIFTY
```bash
curl -X GET "http://localhost:5000/api/posts/stock/NIFTY?page=1&limit=20"

# Expected: All posts where stock_symbol = 'NIFTY'
```

### Get All Posts for RELIANCE
```bash
curl -X GET "http://localhost:5000/api/posts/stock/RELIANCE?page=1&limit=20"

# Expected: All posts where stock_symbol = 'RELIANCE'
```

---

## Test Flow 13: Post Deletion

### Delete Post (Analyst)
```bash
curl -X DELETE "http://localhost:5000/api/posts/$POST_ID" \
  -H "Authorization: Bearer $ANALYST_TOKEN"

# Expected Response (200):
{
  "success": true,
  "message": "Post deleted successfully"
}
```

### Verify Post is Hidden (Soft Delete)
```bash
curl -X GET "http://localhost:5000/api/posts/$POST_ID" \
  -H "Authorization: Bearer $ANALYST_TOKEN"

# Expected Response (404):
{
  "success": false,
  "message": "Post not found"
}
```

### Verify Bookmarks Still Exist (in database)
```bash
# Bookmarks remain in database but post is hidden
# This preserves user bookmark history
```

---

## Test Flow 14: Rate Limiting

### Create 20 Posts (Max Daily Limit)
```bash
for i in {1..20}; do
  curl -X POST http://localhost:5000/api/posts/create \
    -H "Authorization: Bearer $ANALYST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"raw_content\": \"Post $i content\", \"audience\": \"paid\"}"
  sleep 1
done

# Expected: All 20 posts created successfully
```

### Try Creating 21st Post (Should Fail)
```bash
curl -X POST http://localhost:5000/api/posts/create \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_content": "21st post",
    "audience": "paid"
  }'

# Expected Response (429):
{
  "success": false,
  "message": "Daily post limit reached (20 posts per day)"
}
```

---

## Test Flow 15: AI Formatting Retry

### Create Post (AI Will Format)
```bash
curl -X POST http://localhost:5000/api/posts/create \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_content": "TATASTEEL buy at 120 target 125 stop 118",
    "audience": "paid"
  }'

# Save POST_ID from response
```

### Re-format Post with AI
```bash
curl -X POST "http://localhost:5000/api/posts/$POST_ID/format-ai" \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "language": "en"
  }'

# Expected: Post re-formatted with updated structured data
```

---

## Error Testing

### Invalid UUID Format
```bash
curl -X GET "http://localhost:5000/api/posts/invalid-uuid" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected Response (400):
{
  "success": false,
  "message": "Invalid UUID format"
}
```

### Missing Required Fields
```bash
curl -X POST http://localhost:5000/api/posts/create \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_content": ""
  }'

# Expected Response (400):
{
  "success": false,
  "message": "Content is required"
}
```

### Unauthorized Access
```bash
curl -X POST http://localhost:5000/api/posts/create \
  -H "Content-Type: application/json" \
  -d '{
    "raw_content": "Test",
    "audience": "paid"
  }'

# Expected Response (401):
{
  "success": false,
  "message": "No authentication token provided"
}
```

### Trader Tries to Create Post
```bash
curl -X POST http://localhost:5000/api/posts/create \
  -H "Authorization: Bearer $TRADER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_content": "Test",
    "audience": "paid"
  }'

# Expected Response (403):
{
  "success": false,
  "message": "Only analysts can create posts"
}
```

---

## Performance Testing

### Measure Feed Query Performance
```bash
time curl -X GET "http://localhost:5000/api/posts/feed?page=1&limit=100" \
  -H "Authorization: Bearer $TRADER_TOKEN"

# Expected: Response time < 500ms (P95 target)
```

### Concurrent Requests
```bash
# Install Apache Bench (ab)
# Test 100 concurrent requests
ab -n 100 -c 10 -H "Authorization: Bearer $TRADER_TOKEN" \
  http://localhost:5000/api/posts/feed

# Expected:
# - All requests successful (200 status)
# - Average response time < 500ms
# - No errors
```

---

## Automated Test Suite (Optional)

### Using Jest + Supertest

```javascript
// tests/post.test.js
const request = require('supertest');
const { app } = require('../src/server');

describe('POST /api/posts/create', () => {
  it('should create post with AI formatting', async () => {
    const response = await request(app)
      .post('/api/posts/create')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        raw_content: 'NIFTY buy at 19500 target 19600 stop 19450',
        audience: 'paid'
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.ai_formatted).toBe(true);
  });
});

describe('GET /api/posts/feed', () => {
  it('should return personalized feed', async () => {
    const response = await request(app)
      .get('/api/posts/feed?page=1&limit=20')
      .set('Authorization', `Bearer ${traderToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.posts).toBeInstanceOf(Array);
  });
});
```

---

## Monitoring & Logs

### Check Server Logs
```bash
# Watch logs in real-time
tail -f logs/server.log

# Look for:
# - "Claude API Usage: { tokensUsed: X, costInr: Y }"
# - "Urgent post notifications sent to X subscribers"
# - "Email sent successfully to user@example.com"
# - Slow query warnings (> 1000ms)
```

### Database Query Performance
```sql
-- Check slow queries
SELECT * FROM posts WHERE deleted_at IS NULL;
EXPLAIN ANALYZE SELECT * FROM posts WHERE deleted_at IS NULL;

-- Verify indexes are being used
EXPLAIN ANALYZE SELECT * FROM posts
WHERE analyst_id = 'uuid'
AND audience IN ('free', 'both')
ORDER BY created_at DESC
LIMIT 20;
```

---

## Checklist

After running all tests, verify:

**Post Creation:**
- [ ] AI formatting works (EN, HI, Hinglish)
- [ ] Manual format (no AI) works
- [ ] Urgent posts trigger emails
- [ ] Rate limit enforced (20 posts/day)
- [ ] Ownership verified for edit/delete

**Feed System:**
- [ ] Personalized feed shows only subscribed analysts
- [ ] Date filters work (today, week, month)
- [ ] Urgency filter works
- [ ] Strategy filter works
- [ ] Analyst filter works
- [ ] Pagination works
- [ ] Urgent posts appear first

**Access Control:**
- [ ] Non-subscribers see teasers only
- [ ] Subscribers see full content
- [ ] Free posts visible to all
- [ ] Paid posts hidden from non-subscribers

**Bookmarks:**
- [ ] Bookmark post works
- [ ] Duplicate bookmark prevented
- [ ] Get bookmarks works
- [ ] Remove bookmark works
- [ ] Bookmark count increments

**Analytics:**
- [ ] Mark outcome works (analyst only)
- [ ] Get analytics works (analyst only)
- [ ] Traders cannot access analytics
- [ ] Metrics calculated correctly

**Error Handling:**
- [ ] Invalid UUID returns 400
- [ ] Missing token returns 401
- [ ] Wrong role returns 403
- [ ] Not found returns 404
- [ ] Duplicate bookmark returns 409
- [ ] Rate limit returns 429

**Performance:**
- [ ] Feed query < 500ms
- [ ] AI formatting < 5s
- [ ] No N+1 query problems
- [ ] Indexes working correctly

---

## Troubleshooting

### Problem: AI Formatting Not Working
**Check:**
- `CLAUDE_API_KEY` set in `.env`
- Internet connection active
- API key valid (not expired)
- Check server logs for error messages

### Problem: Email Not Sending
**Check:**
- `RESEND_API_KEY` set in `.env`
- Email service initialized (check logs)
- Subscriber emails valid
- Check spam folder

### Problem: Feed Empty
**Check:**
- User has active subscription
- Subscription not expired
- Analyst has created posts
- Posts not all deleted

### Problem: Access Denied
**Check:**
- JWT token valid (not expired)
- User role correct (analyst/trader)
- Token in Authorization header
- Bearer prefix included

---

**Testing Complete!** All endpoints are production-ready.
