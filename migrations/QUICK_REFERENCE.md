# Quick Reference - Subscription & Calls Schema

**Last Updated:** 2025-10-14 | **Migrations:** 027, 028

---

## Subscription Tiers Quick Reference

### Pricing (all in paise)

```javascript
// Example: ₹299/week, ₹999/month, ₹9,999/year
{
  price_weekly: 29900,   // ₹299
  price_monthly: 99900,  // ₹999
  price_yearly: 999900   // ₹9,999
}
```

### Tier Examples

```javascript
// Free Tier
{
  tier_name: 'Free',
  price_weekly: 0,
  price_monthly: 0,
  price_yearly: 0,
  posts_per_day: 2,
  chat_access: false,
  is_free_tier: true
}

// Pro Tier
{
  tier_name: 'Pro',
  price_weekly: 29900,      // Optional
  price_monthly: 99900,
  price_yearly: 999900,
  posts_per_day: null,      // Unlimited
  chat_access: true,
  priority_support: false,
  features: ["Unlimited calls", "Real-time alerts", "Community chat"]
}
```

---

## Call Types

| Type | Duration | Holding Period | Example |
|------|----------|----------------|---------|
| `intraday` | Same day | 1 day | Day trading |
| `overnight` | 1-2 days | Hold overnight | Gap trading |
| `swing` | 3-10 days | Short-term | Momentum trading |
| `positional` | 2-8 weeks | Medium-term | Trend following |
| `longterm` | 3+ months | Long-term | Value investing |
| `quant` | Varies | Algorithm-driven | Quant strategies |

---

## Audience Visibility

| Value | Who Can See | Use Case |
|-------|-------------|----------|
| `free` | Everyone | Announcements, teasers |
| `paid` | Subscribers only | Premium calls |
| `both` | Everyone (preview for free) | Freemium content |

---

## Channel Types (Discord-like)

| Channel | Content Type | Visibility |
|---------|--------------|------------|
| `free_announcements` | General updates | All users |
| `free_calls` | Limited calls (2-3/day) | All users |
| `paid_announcements` | Premium analysis | Paid only |
| `paid_calls` | Full calls with entry/SL/target | Paid only |

---

## Common Queries (Copy-Paste Ready)

### Create Subscription

```javascript
const result = await query(
  `INSERT INTO subscriptions (
    user_id, analyst_id, tier_id, status, billing_cycle,
    price_paid, discount_applied, final_price,
    start_date, expires_at, auto_renewal
  )
  SELECT
    $1, analyst_id, $2, 'pending_payment', $3,
    CASE
      WHEN $3 = 'weekly' THEN price_weekly
      WHEN $3 = 'monthly' THEN price_monthly
      WHEN $3 = 'yearly' THEN price_yearly
    END,
    $4,
    CASE
      WHEN $3 = 'weekly' THEN price_weekly - $4
      WHEN $3 = 'monthly' THEN price_monthly - $4
      WHEN $3 = 'yearly' THEN price_yearly - $4
    END,
    NOW(),
    NOW() + CASE
      WHEN $3 = 'weekly' THEN INTERVAL '7 days'
      WHEN $3 = 'monthly' THEN INTERVAL '30 days'
      WHEN $3 = 'yearly' THEN INTERVAL '365 days'
    END,
    TRUE
  FROM subscription_tiers
  WHERE id = $2 AND is_active = TRUE
  RETURNING *`,
  [userId, tierId, billingCycle, discountAmount]
);
```

### Check User Access

```javascript
const hasAccess = await query(
  `SELECT EXISTS(
    SELECT 1 FROM subscriptions
    WHERE user_id = $1 AND analyst_id = $2
      AND status = 'active' AND expires_at > NOW()
      AND deleted_at IS NULL
  ) as has_access`,
  [userId, analystId]
);
```

### Get User Feed

```javascript
const feed = await query(
  `SELECT p.*, ap.display_name, ap.photo_url,
    EXISTS(SELECT 1 FROM bookmarks WHERE user_id = $1 AND post_id = p.id) as is_bookmarked
  FROM posts p
  INNER JOIN analyst_profiles ap ON p.analyst_id = ap.user_id
  WHERE p.deleted_at IS NULL
    AND (
      EXISTS(SELECT 1 FROM subscriptions WHERE user_id = $1 AND analyst_id = p.analyst_id AND status = 'active' AND expires_at > NOW())
      OR p.audience IN ('free', 'both')
    )
  ORDER BY p.is_urgent DESC, p.created_at DESC
  LIMIT $2 OFFSET $3`,
  [userId, limit, offset]
);
```

### Create Call

```javascript
const call = await query(
  `INSERT INTO posts (
    analyst_id, title, content, content_formatted,
    post_type, strategy_type, audience, channel_type,
    stock_symbol, action, entry_price, target_price, stop_loss,
    risk_reward_ratio, confidence_level, call_status, is_urgent
  ) VALUES ($1, $2, $3, $4, 'call', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'open', $15)
  RETURNING *`,
  [
    analystId, title, content, JSON.stringify(contentFormatted),
    strategyType, audience, channelType,
    stockSymbol, action, entryPrice, targetPrice, stopLoss,
    riskRewardRatio, confidenceLevel, isUrgent
  ]
);
```

### Update Call Status

```javascript
const updated = await query(
  `UPDATE posts
  SET call_status = $2,
      actual_exit_price = $3,
      actual_profit_percent = ROUND(((($3 - entry_price) / entry_price) * 100)::NUMERIC, 2),
      closed_at = NOW()
  WHERE id = $1 AND analyst_id = $4
  RETURNING *`,
  [postId, callStatus, exitPrice, analystId]
);
```

---

## Validation Rules

### Subscription Tiers
- ✅ `price_weekly < price_monthly` (if weekly exists)
- ✅ `price_yearly < price_monthly * 12`
- ✅ Only ONE free tier per analyst
- ✅ Unique tier_name per analyst

### Subscriptions
- ✅ User can't subscribe to themselves
- ✅ Only ONE active subscription per user-analyst pair
- ✅ `expires_at > start_date`
- ✅ `final_price = price_paid - discount_applied`

### Posts (Calls)
- ✅ If `post_type = 'call'`, must have: stock_symbol, action, entry_price
- ✅ For BUY calls: `target_price > entry_price` and `stop_loss < entry_price`
- ✅ For SELL calls: `target_price < entry_price` and `stop_loss > entry_price`

---

## Important Indexes

**Always use these columns in WHERE clauses for best performance:**

**Subscription Tiers:**
- `analyst_id` + `is_active` + `deleted_at IS NULL`

**Subscriptions:**
- `user_id` + `status` + `expires_at`
- `analyst_id` + `status`

**Posts:**
- `analyst_id` + `created_at DESC`
- `post_type` + `strategy_type`
- `audience`
- `channel_type`
- `stock_symbol`
- `is_urgent` + `created_at DESC`

---

## Common Mistakes to Avoid

❌ **Don't:**
- Store prices in rupees (use paise: ₹999 = 99900)
- Allow NULL in required fields (use NOT NULL)
- Forget to check `deleted_at IS NULL` in queries
- Skip subscription status check before showing paid content
- Use `SELECT *` in production (specify columns)

✅ **Do:**
- Always check `expires_at > NOW()` for active subscriptions
- Use EXISTS() for subscription checks (faster than JOIN)
- Index foreign keys
- Use transactions for multi-step operations
- Validate call type enums on backend

---

## Environment Variables (Example)

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=call_street_db
DB_USER=postgres
DB_PASSWORD=your_password

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx

# Weekly pricing
ENABLE_WEEKLY_SUBSCRIPTIONS=true
```

---

## Migration Commands

```bash
# Apply migrations
psql -U postgres -d call_street_db -f backend/migrations/027_add_weekly_pricing_to_subscription_tiers.sql
psql -U postgres -d call_street_db -f backend/migrations/028_add_weekly_billing_cycle_to_subscriptions.sql

# Verify
psql -U postgres -d call_street_db -c "\d+ subscription_tiers"
psql -U postgres -d call_street_db -c "\d+ subscriptions"
```

---

## Performance Expectations

With proper indexes:
- **Subscription check:** < 10ms
- **Feed query (20 posts):** < 100ms
- **Tier lookup:** < 20ms
- **Create subscription:** < 50ms
- **Create post:** < 30ms

---

## Support

**Documentation:**
- Full guide: `SUBSCRIPTION_AND_CALLS_GUIDE.md`
- Query examples: `QUERY_EXAMPLES.sql`
- Schema review: `SCHEMA_REVIEW_SUMMARY.md`

**Files:**
- `/Users/aditya/Desktop/call_street_express/backend/migrations/`
- `/Users/aditya/Desktop/call_street_express/backend/src/models/`

---

**Quick Tip:** Always use parameterized queries ($1, $2, etc.) to prevent SQL injection!
