# Subscription Tiers & Calls Management Guide

## Overview

This guide documents the subscription tiers and calls management system for the Analyst Marketplace Platform. The system supports flexible pricing (weekly/monthly/yearly) and multiple call types with free/paid visibility controls.

---

## Database Schema

### 1. Subscription Tiers Table

**Purpose:** Store analyst-defined pricing tiers (Free, Basic, Pro, Premium, etc.)

**Key Features:**
- Weekly, monthly, and yearly pricing options
- JSONB features array for flexibility
- Soft delete support
- Unique tier names per analyst
- Automatic constraint validation (yearly < monthly * 12, weekly < monthly)

**Schema:**
```sql
subscription_tiers (
  id UUID PRIMARY KEY,
  analyst_id UUID NOT NULL,
  tier_name VARCHAR(100) NOT NULL,
  tier_description TEXT,
  tier_order INTEGER DEFAULT 0,
  price_weekly INTEGER CHECK (price_weekly >= 0),      -- NEW: Weekly pricing
  price_monthly INTEGER NOT NULL CHECK (price_monthly >= 0),
  price_yearly INTEGER CHECK (price_yearly >= 0),
  currency VARCHAR(3) DEFAULT 'INR',
  features JSONB DEFAULT '[]',
  posts_per_day INTEGER,
  chat_access BOOLEAN DEFAULT FALSE,
  priority_support BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_free_tier BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT check_tier_prices CHECK (
    (price_yearly IS NULL OR price_yearly < (price_monthly * 12))
    AND (price_weekly IS NULL OR price_weekly < price_monthly)
  ),
  CONSTRAINT unique_analyst_tier_name UNIQUE (analyst_id, tier_name)
)
```

**Important Indexes:**
- `idx_subscription_tiers_analyst` - Fast tier lookup by analyst
- `idx_unique_analyst_free_tier` - Ensures only one free tier per analyst
- `idx_subscription_tiers_pricing` - Optimized pricing queries
- `idx_subscription_tiers_weekly_pricing` - Weekly pricing lookups

---

### 2. Subscriptions Table

**Purpose:** Track user subscriptions to analyst tiers

**Key Features:**
- Weekly, monthly, yearly billing cycles (UPDATED)
- Razorpay integration for payments
- Auto-renewal support
- Grace period and payment retry logic
- Subscription status tracking (active, cancelled, expired, suspended, pending_payment)

**Schema:**
```sql
subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  analyst_id UUID NOT NULL,
  tier_id UUID NOT NULL,
  status VARCHAR(20) CHECK (status IN ('active', 'cancelled', 'expired', 'suspended', 'pending_payment')),
  billing_cycle VARCHAR(20) CHECK (billing_cycle IN ('weekly', 'monthly', 'yearly')),  -- UPDATED
  price_paid INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  discount_applied INTEGER DEFAULT 0,
  final_price INTEGER NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  suspended_at TIMESTAMP WITH TIME ZONE,
  razorpay_subscription_id VARCHAR(255) UNIQUE,
  razorpay_customer_id VARCHAR(255),
  razorpay_plan_id VARCHAR(255),
  auto_renewal BOOLEAN DEFAULT TRUE,
  next_billing_date TIMESTAMP WITH TIME ZONE,
  payment_retry_count INTEGER DEFAULT 0,
  last_payment_attempt TIMESTAMP WITH TIME ZONE,
  grace_period_ends_at TIMESTAMP WITH TIME ZONE,
  referred_by_invite_link UUID,
  discount_code_used UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
)
```

---

### 3. Posts Table (Calls & Announcements)

**Purpose:** Store analyst posts including trading calls and announcements

**Key Features:**
- Multiple call types: longterm, positional, swing, intraday, overnight, quant
- Audience visibility: free, paid, both
- Channel types: free_announcements, free_calls, paid_announcements, paid_calls
- AI-formatted content support (JSONB)
- Call performance tracking (entry, target, stop loss, actual outcome)
- Voice input metadata

**Schema:**
```sql
posts (
  id UUID PRIMARY KEY,
  analyst_id UUID NOT NULL,

  -- Content
  title VARCHAR(255),
  content TEXT NOT NULL,
  content_formatted JSONB,  -- AI-formatted structured content

  -- Classification
  post_type VARCHAR(50) CHECK (post_type IN ('call', 'update', 'analysis', 'commentary', 'educational')),
  strategy_type VARCHAR(50) CHECK (strategy_type IN ('longterm', 'positional', 'swing', 'intraday', 'overnight', 'quant')),
  audience VARCHAR(20) CHECK (audience IN ('free', 'paid', 'both')),
  channel_type VARCHAR(30) CHECK (channel_type IN ('free_announcements', 'free_calls', 'paid_announcements', 'paid_calls')),

  -- Call-specific fields
  stock_symbol VARCHAR(50),
  action VARCHAR(10) CHECK (action IN ('BUY', 'SELL', 'HOLD')),
  entry_price DECIMAL(12,2),
  target_price DECIMAL(12,2),
  stop_loss DECIMAL(12,2),
  risk_reward_ratio VARCHAR(20),
  confidence_level VARCHAR(20) CHECK (confidence_level IN ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH')),

  -- Call tracking
  call_status VARCHAR(20) CHECK (call_status IN ('open', 'target_hit', 'stop_loss_hit', 'closed', 'expired')),
  actual_entry_price DECIMAL(12,2),
  actual_exit_price DECIMAL(12,2),
  actual_profit_percent DECIMAL(6,2),
  closed_at TIMESTAMP WITH TIME ZONE,

  -- Voice input
  voice_transcript TEXT,
  voice_audio_url VARCHAR(500),
  ai_formatted BOOLEAN DEFAULT FALSE,
  ai_formatting_metadata JSONB,

  -- Engagement
  views_count INTEGER DEFAULT 0,
  bookmarks_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,

  -- Flags
  is_urgent BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
)
```

---

## Common SQL Operations

### Create Subscription Tiers for Analyst

```sql
-- Example: Create 3 tiers (Free, Pro, Premium) for an analyst

-- Tier 1: Free
INSERT INTO subscription_tiers (
  analyst_id,
  tier_name,
  tier_description,
  tier_order,
  price_weekly,
  price_monthly,
  price_yearly,
  features,
  posts_per_day,
  chat_access,
  is_free_tier,
  is_active
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',  -- analyst_id
  'Free',
  'Basic access to announcements and limited calls',
  0,
  0,      -- Free
  0,      -- Free
  0,      -- Free
  '["2 calls per day", "View announcements", "No chat access"]'::jsonb,
  2,      -- Max 2 posts per day
  FALSE,
  TRUE,   -- is_free_tier
  TRUE
);

-- Tier 2: Pro (Weekly/Monthly/Yearly)
INSERT INTO subscription_tiers (
  analyst_id,
  tier_name,
  tier_description,
  tier_order,
  price_weekly,
  price_monthly,
  price_yearly,
  features,
  posts_per_day,
  chat_access,
  is_free_tier,
  is_active
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  'Pro',
  'Full access to all calls with community chat',
  1,
  29900,      -- ₹299/week
  99900,      -- ₹999/month
  999900,     -- ₹9,999/year (saves ₹2,000)
  '["Unlimited calls", "Real-time alerts", "Community chat", "Priority support"]'::jsonb,
  NULL,       -- Unlimited posts
  TRUE,
  FALSE,
  TRUE
);

-- Tier 3: Premium (Monthly/Yearly only, no weekly option)
INSERT INTO subscription_tiers (
  analyst_id,
  tier_name,
  tier_description,
  tier_order,
  price_weekly,
  price_monthly,
  price_yearly,
  features,
  posts_per_day,
  chat_access,
  priority_support,
  is_free_tier,
  is_active
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  'Premium',
  'VIP access with personal guidance and 1-on-1 support',
  2,
  NULL,       -- No weekly option
  299900,     -- ₹2,999/month
  2999900,    -- ₹29,999/year (saves ₹6,000)
  '["All Pro benefits", "Personal portfolio review", "1-on-1 chat with analyst", "Exclusive research reports"]'::jsonb,
  NULL,       -- Unlimited
  TRUE,
  TRUE,       -- priority_support
  FALSE,
  TRUE
);
```

### Get Analyst's Active Tiers with Pricing

```sql
-- Get all active tiers for an analyst, sorted by price

SELECT
  id,
  tier_name,
  tier_description,
  tier_order,
  price_weekly / 100.0 as price_weekly_rupees,
  price_monthly / 100.0 as price_monthly_rupees,
  price_yearly / 100.0 as price_yearly_rupees,
  features,
  posts_per_day,
  chat_access,
  priority_support,
  is_free_tier,
  -- Calculate savings
  CASE
    WHEN price_yearly IS NOT NULL AND price_monthly > 0
    THEN ROUND(((price_monthly * 12 - price_yearly) / 100.0), 2)
    ELSE 0
  END as yearly_savings_rupees,
  CASE
    WHEN price_weekly IS NOT NULL AND price_monthly > 0
    THEN ROUND(((price_weekly * 4 - price_monthly) / 100.0), 2)
    ELSE 0
  END as monthly_vs_weekly_savings_rupees
FROM subscription_tiers
WHERE analyst_id = $1
  AND is_active = TRUE
  AND deleted_at IS NULL
ORDER BY tier_order ASC, price_monthly ASC;
```

### Create Subscription (User Subscribes to Analyst)

```sql
-- Example: User subscribes to analyst's Pro tier (monthly billing)

INSERT INTO subscriptions (
  user_id,
  analyst_id,
  tier_id,
  status,
  billing_cycle,
  price_paid,
  discount_applied,
  final_price,
  start_date,
  expires_at,
  auto_renewal,
  next_billing_date
) VALUES (
  '987e6543-e21b-98d7-a654-426614174111',  -- user_id
  '123e4567-e89b-12d3-a456-426614174000',  -- analyst_id
  'tier-id-from-subscription-tiers-table',  -- tier_id
  'pending_payment',                        -- status (changes to 'active' after payment)
  'monthly',                                -- billing_cycle
  99900,                                    -- price_paid (₹999)
  10000,                                    -- discount_applied (₹100 discount)
  89900,                                    -- final_price (₹899)
  NOW(),                                    -- start_date
  NOW() + INTERVAL '30 days',               -- expires_at
  TRUE,                                     -- auto_renewal
  NOW() + INTERVAL '30 days'                -- next_billing_date
)
RETURNING id, status, expires_at;
```

### Get User's Active Subscriptions

```sql
-- Get all active subscriptions for a user with analyst and tier details

SELECT
  s.id as subscription_id,
  s.status,
  s.billing_cycle,
  s.final_price / 100.0 as price_paid_rupees,
  s.start_date,
  s.expires_at,
  s.auto_renewal,
  EXTRACT(DAY FROM s.expires_at - NOW()) as days_remaining,

  -- Analyst details
  ap.display_name as analyst_name,
  ap.photo_url as analyst_photo,
  ap.sebi_number,

  -- Tier details
  st.tier_name,
  st.features,
  st.posts_per_day,
  st.chat_access,
  st.priority_support

FROM subscriptions s
INNER JOIN users u ON s.analyst_id = u.id
INNER JOIN analyst_profiles ap ON u.id = ap.user_id
INNER JOIN subscription_tiers st ON s.tier_id = st.id
WHERE s.user_id = $1
  AND s.status = 'active'
  AND s.expires_at > NOW()
  AND s.deleted_at IS NULL
ORDER BY s.created_at DESC;
```

### Check if User Has Access to Analyst's Content

```sql
-- Check if user has an active subscription to a specific analyst

SELECT EXISTS(
  SELECT 1
  FROM subscriptions
  WHERE user_id = $1              -- user_id
    AND analyst_id = $2           -- analyst_id
    AND status = 'active'
    AND expires_at > NOW()
    AND deleted_at IS NULL
) as has_active_subscription;
```

---

## Posts & Calls Operations

### Create Trading Call (Voice Input)

```sql
-- Example: Analyst creates a BUY call for RELIANCE (intraday strategy)

INSERT INTO posts (
  analyst_id,
  title,
  content,
  content_formatted,
  post_type,
  strategy_type,
  audience,
  channel_type,
  stock_symbol,
  action,
  entry_price,
  target_price,
  stop_loss,
  risk_reward_ratio,
  confidence_level,
  call_status,
  voice_transcript,
  ai_formatted,
  ai_formatting_metadata,
  is_urgent
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',  -- analyst_id
  'RELIANCE BUY - Intraday Breakout',
  'Buy Reliance at 2450, target 2480, stop loss 2440',
  '{
    "stock": "RELIANCE",
    "action": "BUY",
    "strategy": "intraday",
    "entry": 2450,
    "target": 2480,
    "stop_loss": 2440,
    "risk_reward": "1:3",
    "confidence": "HIGH",
    "reasoning": "Breakout above resistance with strong volume"
  }'::jsonb,
  'call',                    -- post_type
  'intraday',                -- strategy_type
  'paid',                    -- audience (paid subscribers only)
  'paid_calls',              -- channel_type
  'RELIANCE',                -- stock_symbol
  'BUY',                     -- action
  2450.00,                   -- entry_price
  2480.00,                   -- target_price
  2440.00,                   -- stop_loss
  '1:3',                     -- risk_reward_ratio
  'HIGH',                    -- confidence_level
  'open',                    -- call_status
  'Buy Reliance at twenty four fifty, target twenty four eighty, stop loss twenty four forty',  -- voice_transcript
  TRUE,                      -- ai_formatted
  '{"model": "claude-3-5-sonnet", "confidence": 0.95}'::jsonb,
  TRUE                       -- is_urgent
)
RETURNING id, stock_symbol, action, entry_price, target_price, created_at;
```

### Create Announcement

```sql
-- Example: Analyst posts a free announcement visible to all users

INSERT INTO posts (
  analyst_id,
  title,
  content,
  post_type,
  audience,
  channel_type,
  is_pinned
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  'Market Update: Nifty Outlook for This Week',
  'Based on technical analysis, Nifty is showing strong support at 19500. Expecting bullish momentum if it breaks 19800. Key levels to watch...',
  'analysis',                 -- post_type (not a call)
  'free',                     -- audience (free for all)
  'free_announcements',       -- channel_type
  TRUE                        -- is_pinned (pin to top of feed)
)
RETURNING id, title, created_at;
```

### Get User Feed (Posts from Subscribed Analysts)

```sql
-- Get personalized feed for a user (posts from analysts they're subscribed to)

SELECT
  p.id,
  p.title,
  p.content,
  p.content_formatted,
  p.post_type,
  p.strategy_type,
  p.audience,
  p.channel_type,
  p.stock_symbol,
  p.action,
  p.entry_price,
  p.target_price,
  p.stop_loss,
  p.call_status,
  p.is_urgent,
  p.is_pinned,
  p.created_at,

  -- Analyst details
  ap.display_name as analyst_name,
  ap.photo_url as analyst_photo,
  ap.sebi_number,

  -- Check if bookmarked
  EXISTS(
    SELECT 1 FROM bookmarks b
    WHERE b.user_id = $1 AND b.post_id = p.id
  ) as is_bookmarked

FROM posts p
INNER JOIN users u ON p.analyst_id = u.id
INNER JOIN analyst_profiles ap ON u.id = ap.user_id
WHERE p.deleted_at IS NULL
  AND (
    -- User has active subscription
    EXISTS(
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = $1
        AND s.analyst_id = p.analyst_id
        AND s.status = 'active'
        AND s.expires_at > NOW()
        AND s.deleted_at IS NULL
    )
    -- OR post is free/both
    OR p.audience IN ('free', 'both')
  )
ORDER BY
  p.is_urgent DESC,
  p.is_pinned DESC,
  p.created_at DESC
LIMIT 20 OFFSET $2;
```

### Filter Posts by Call Type

```sql
-- Get only intraday calls from an analyst (paid subscribers only)

SELECT
  p.id,
  p.stock_symbol,
  p.action,
  p.entry_price,
  p.target_price,
  p.stop_loss,
  p.risk_reward_ratio,
  p.confidence_level,
  p.call_status,
  p.created_at
FROM posts p
WHERE p.analyst_id = $1
  AND p.post_type = 'call'
  AND p.strategy_type = 'intraday'
  AND p.deleted_at IS NULL
ORDER BY p.created_at DESC
LIMIT 50;
```

### Get Announcements Only (Separate from Calls)

```sql
-- Get all announcements (analysis, commentary, educational) from an analyst

SELECT
  p.id,
  p.title,
  p.content,
  p.post_type,
  p.audience,
  p.channel_type,
  p.is_pinned,
  p.views_count,
  p.created_at
FROM posts p
WHERE p.analyst_id = $1
  AND p.post_type IN ('analysis', 'commentary', 'educational', 'update')
  AND p.channel_type IN ('free_announcements', 'paid_announcements')
  AND p.deleted_at IS NULL
ORDER BY p.is_pinned DESC, p.created_at DESC
LIMIT 20;
```

### Update Call Status (Mark Target Hit or Stop Loss Hit)

```sql
-- Mark a call as target_hit when target price is reached

UPDATE posts
SET
  call_status = 'target_hit',
  actual_exit_price = $2,
  actual_profit_percent = ROUND(((($2 - entry_price) / entry_price) * 100)::NUMERIC, 2),
  closed_at = NOW(),
  updated_at = NOW()
WHERE id = $1
  AND analyst_id = $3
  AND post_type = 'call'
  AND deleted_at IS NULL
RETURNING id, stock_symbol, call_status, actual_profit_percent;
```

---

## Performance Optimization Indexes

All necessary indexes are already created in migrations. Key indexes:

**Subscription Tiers:**
- `idx_subscription_tiers_analyst` - Analyst tier lookups
- `idx_subscription_tiers_pricing` - Price-based filtering
- `idx_subscription_tiers_weekly_pricing` - Weekly pricing queries

**Subscriptions:**
- `idx_subscriptions_user_active` - User's active subscriptions
- `idx_subscriptions_analyst_active` - Analyst's subscriber count
- `idx_subscriptions_expiry` - Renewal/expiry jobs
- `idx_subscriptions_user_analyst_active` - Prevent duplicate subscriptions

**Posts:**
- `idx_posts_analyst_timeline` - Analyst feed
- `idx_posts_urgent` - Urgent posts at top
- `idx_posts_feed` - User feed queries
- `idx_posts_type` - Filter by call type
- `idx_posts_channel_type` - Discord-like channel filtering
- `idx_posts_stock_symbol` - Stock-specific calls
- `idx_posts_content_search` - Full-text search

---

## Call Types Reference

| Call Type | Duration | Holding Period | Use Case |
|-----------|----------|----------------|----------|
| `intraday` | Same day | Entry to exit within market hours | Day trading, quick scalps |
| `overnight` | 1-2 days | Hold overnight, exit next day | Swing trading, gap plays |
| `swing` | 3-10 days | Short-term momentum | Swing trading strategies |
| `positional` | 2-8 weeks | Medium-term trends | Trend following, breakouts |
| `longterm` | 3+ months | Long-term investment | Value investing, fundamentals |
| `quant` | Varies | Algorithm-driven | Quantitative strategies |

---

## Audience Visibility Options

| Audience | Visibility | Use Case |
|----------|-----------|----------|
| `free` | All users (including non-subscribers) | Free content, teasers, announcements |
| `paid` | Only active subscribers | Premium calls, exclusive content |
| `both` | All users, but preview for free users | Freemium model, upgrade prompts |

---

## Channel Types (Discord-like Structure)

| Channel Type | Description | Visibility |
|--------------|-------------|------------|
| `free_announcements` | General updates, market commentary | All users |
| `free_calls` | Limited trading calls (2-3 per day) | All users |
| `paid_announcements` | Premium analysis, research reports | Paid subscribers only |
| `paid_calls` | Full trading calls with entry/target/SL | Paid subscribers only |

---

## Best Practices

### 1. Pricing Strategy
- **Weekly pricing:** ~30% of monthly price (₹299/week vs ₹999/month)
- **Yearly pricing:** Save 15-20% vs monthly * 12 (₹9,999/year vs ₹11,988)
- **Free tier:** Always offer at least 2 calls/day to attract users

### 2. Call Classification
- Use `is_urgent: true` for time-sensitive intraday calls
- Use `is_pinned: true` for important announcements
- Always set `audience` based on tier access rules

### 3. Performance Tracking
- The `analyst_call_performance` table automatically tracks all calls
- Daily cron job updates call performance using NSE/BSE data
- Performance metrics are PRIVATE (only visible to analyst)

### 4. Query Optimization
- Always use indexed columns in WHERE clauses
- Use `deleted_at IS NULL` for soft delete filtering
- Paginate large result sets (LIMIT/OFFSET)
- Use EXISTS() for subscription checks (faster than JOIN)

---

## Migration Commands

Apply migrations in order:

```bash
# 1. Add weekly pricing to subscription_tiers
psql -U your_user -d your_db -f backend/migrations/027_add_weekly_pricing_to_subscription_tiers.sql

# 2. Add weekly billing cycle to subscriptions
psql -U your_user -d your_db -f backend/migrations/028_add_weekly_billing_cycle_to_subscriptions.sql
```

Rollback if needed:

```sql
-- Rollback migration 028
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_cycle_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_billing_cycle_check CHECK (billing_cycle IN ('monthly', 'yearly'));

-- Rollback migration 027
ALTER TABLE subscription_tiers DROP CONSTRAINT IF EXISTS check_weekly_vs_monthly_price;
ALTER TABLE subscription_tiers DROP CONSTRAINT IF EXISTS check_tier_prices;
ALTER TABLE subscription_tiers DROP COLUMN IF EXISTS price_weekly;
```

---

## Support

For questions or issues, refer to:
- `/Users/aditya/Desktop/call_street_express/backend/migrations/README.md`
- `/Users/aditya/Desktop/call_street_express/backend/src/models/Post.js`
- Database schema documentation in each migration file

---

**Last Updated:** 2025-10-14
**Migrations:** 027, 028
**Database Version:** PostgreSQL 14+
