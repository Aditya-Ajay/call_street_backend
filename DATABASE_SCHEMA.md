# Analyst Marketplace Platform - Database Schema Documentation

## Overview

This document provides a complete reference for the PostgreSQL database schema for the Analyst Marketplace Platform. The database is designed to support 10,000+ analysts and 1M+ users with sub-2-second query performance.

## Architecture Principles

1. **Normalization:** All tables are normalized to 3NF to avoid data redundancy
2. **UUID Primary Keys:** All tables use UUID for distributed system compatibility
3. **Soft Deletes:** `deleted_at` timestamp instead of hard deletes for data retention
4. **Timestamps:** Every table has `created_at` and `updated_at` for audit trails
5. **Constraints:** Extensive use of CHECK, UNIQUE, and FOREIGN KEY constraints
6. **Indexes:** Strategic indexing on foreign keys and frequently queried columns
7. **Triggers:** Automatic stats updates for analyst profiles, reviews, subscriptions

---

## Table Reference

### 1. users

**Purpose:** All platform users (analysts, traders, admins)

**Columns:**
- `id` UUID PRIMARY KEY
- `email` VARCHAR(255) UNIQUE - Login email (optional if phone provided)
- `phone` VARCHAR(20) UNIQUE - Login phone (optional if email provided)
- `password_hash` VARCHAR(255) NOT NULL - Bcrypt hashed password
- `user_type` VARCHAR(20) CHECK - 'analyst', 'trader', 'admin'
- `email_verified` BOOLEAN DEFAULT FALSE
- `phone_verified` BOOLEAN DEFAULT FALSE
- `is_active` BOOLEAN DEFAULT TRUE
- `last_active` TIMESTAMP WITH TIME ZONE
- `login_count` INTEGER DEFAULT 0
- `created_at` TIMESTAMP WITH TIME ZONE DEFAULT NOW()
- `updated_at` TIMESTAMP WITH TIME ZONE DEFAULT NOW()
- `deleted_at` TIMESTAMP WITH TIME ZONE

**Key Constraints:**
- At least one of email or phone must be provided
- Email must match valid email format
- Phone must match international format (+[country_code][number])

**Indexes:**
- `idx_users_email` - Fast email login lookup
- `idx_users_phone` - Fast phone login lookup
- `idx_users_user_type` - Filter by user type (analysts, traders)
- `idx_users_is_active` - Active users queries

---

### 2. otp_verifications

**Purpose:** OTP codes for phone/email verification during signup, login, password reset

**Columns:**
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id) - NULL during signup
- `phone` VARCHAR(20)
- `email` VARCHAR(255)
- `otp_code` VARCHAR(6) NOT NULL - 6-digit numeric code
- `purpose` VARCHAR(50) CHECK - 'signup', 'login', 'reset_password', 'verify_phone', 'verify_email'
- `verified` BOOLEAN DEFAULT FALSE
- `verified_at` TIMESTAMP WITH TIME ZONE
- `expires_at` TIMESTAMP WITH TIME ZONE NOT NULL - Typically 10 minutes
- `attempts` INTEGER DEFAULT 0
- `max_attempts` INTEGER DEFAULT 3
- `created_at` TIMESTAMP WITH TIME ZONE DEFAULT NOW()

**Business Logic:**
- OTP expires after 10 minutes
- Maximum 3 verification attempts
- Cleanup job deletes expired OTPs after 24 hours

---

### 3. analyst_profiles

**Purpose:** Extended profile for analysts with SEBI/RIA verification

**Columns:**
- `id` UUID PRIMARY KEY
- `user_id` UUID UNIQUE REFERENCES users(id) - One-to-one relationship
- `display_name` VARCHAR(255) NOT NULL - Public name
- `bio` TEXT - Markdown bio (max 2000 chars)
- `photo_url` VARCHAR(500) - S3/Cloudinary URL
- `specializations` TEXT[] - ['Intraday', 'Options', 'Swing Trading']
- `languages` TEXT[] - ['English', 'Hindi', 'Tamil']
- `country` VARCHAR(2) DEFAULT 'IN' - ISO country code
- `sebi_number` VARCHAR(50) UNIQUE - India verification
- `ria_number` VARCHAR(50) UNIQUE - USA verification
- `verification_status` VARCHAR(20) CHECK - 'pending', 'in_review', 'approved', 'rejected'
- `verification_documents` JSONB - Array of document metadata
- `verified_at` TIMESTAMP WITH TIME ZONE
- `verified_by` UUID REFERENCES users(id) - Admin who approved
- `rejection_reason` TEXT
- `avg_rating` DECIMAL(3,2) DEFAULT 0 - 0.00 to 5.00 (auto-updated by trigger)
- `total_reviews` INTEGER DEFAULT 0 (auto-updated by trigger)
- `total_subscribers` INTEGER DEFAULT 0 (auto-updated by trigger)
- `active_subscribers` INTEGER DEFAULT 0 (auto-updated by trigger)
- `total_posts` INTEGER DEFAULT 0 (auto-updated by trigger)
- `monthly_revenue` INTEGER DEFAULT 0 - In paise (auto-updated)
- `commission_rate` DECIMAL(4,3) DEFAULT 0.200 - 20% platform commission
- `is_featured` BOOLEAN DEFAULT FALSE
- `feature_position` INTEGER - Homepage ordering
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE
- `last_post_at` TIMESTAMP WITH TIME ZONE
- `deleted_at` TIMESTAMP WITH TIME ZONE

**Key Indexes:**
- `idx_analyst_profiles_discovery` - Discovery page sorting (rating, subscribers)
- `idx_analyst_profiles_specializations` - GIN index for array filtering
- `idx_analyst_profiles_verification` - Admin verification queue

**Triggers:**
- Auto-updates stats when reviews, subscriptions, or posts change

---

### 4. subscription_tiers

**Purpose:** Analyst pricing plans (Free, Pro, Premium, etc.)

**Columns:**
- `id` UUID PRIMARY KEY
- `analyst_id` UUID REFERENCES users(id)
- `tier_name` VARCHAR(100) - 'Free', 'Pro', 'Premium'
- `tier_description` TEXT - Markdown description
- `tier_order` INTEGER DEFAULT 0 - Display order
- `price_monthly` INTEGER NOT NULL - In paise (₹999 = 99900)
- `price_yearly` INTEGER - Discounted yearly price
- `currency` VARCHAR(3) DEFAULT 'INR'
- `features` JSONB - Array of feature strings
- `posts_per_day` INTEGER - NULL = unlimited
- `chat_access` BOOLEAN DEFAULT FALSE
- `priority_support` BOOLEAN DEFAULT FALSE
- `is_active` BOOLEAN DEFAULT TRUE
- `is_free_tier` BOOLEAN DEFAULT FALSE
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE
- `deleted_at` TIMESTAMP WITH TIME ZONE

**Constraints:**
- Yearly price must be less than (monthly * 12)
- Only one free tier per analyst
- Unique tier name per analyst

---

### 5. subscriptions

**Purpose:** User subscriptions to analyst tiers with Razorpay billing

**Columns:**
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id)
- `analyst_id` UUID REFERENCES users(id) - Denormalized for performance
- `tier_id` UUID REFERENCES subscription_tiers(id)
- `status` VARCHAR(20) CHECK - 'active', 'cancelled', 'expired', 'suspended', 'pending_payment'
- `billing_cycle` VARCHAR(20) - 'monthly', 'yearly'
- `price_paid` INTEGER - Original tier price (snapshot)
- `currency` VARCHAR(3) DEFAULT 'INR'
- `discount_applied` INTEGER - Discount amount in paise
- `final_price` INTEGER - Actual charged amount
- `start_date` TIMESTAMP WITH TIME ZONE
- `expires_at` TIMESTAMP WITH TIME ZONE
- `cancelled_at` TIMESTAMP WITH TIME ZONE
- `suspended_at` TIMESTAMP WITH TIME ZONE
- `razorpay_subscription_id` VARCHAR(255) UNIQUE
- `razorpay_customer_id` VARCHAR(255)
- `razorpay_plan_id` VARCHAR(255)
- `auto_renewal` BOOLEAN DEFAULT TRUE
- `next_billing_date` TIMESTAMP WITH TIME ZONE
- `payment_retry_count` INTEGER DEFAULT 0
- `last_payment_attempt` TIMESTAMP WITH TIME ZONE
- `grace_period_ends_at` TIMESTAMP WITH TIME ZONE
- `referred_by_invite_link` UUID - Conversion tracking
- `discount_code_used` UUID
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE
- `deleted_at` TIMESTAMP WITH TIME ZONE

**Business Logic:**
- Users cannot subscribe to themselves
- Only one active subscription per user-analyst pair
- Payment retries: Max 3 attempts over 7 days
- Grace period: 7 days after payment failure

**Triggers:**
- Updates analyst subscriber counts on insert/update/delete

---

### 6. posts

**Purpose:** Analyst stock market calls and content (main content table)

**Columns:**
- `id` UUID PRIMARY KEY
- `analyst_id` UUID REFERENCES users(id)
- `title` VARCHAR(255) - Auto-generated for calls
- `content` TEXT NOT NULL - Raw content or voice transcription
- `content_formatted` JSONB - AI-formatted structured call data
- `post_type` VARCHAR(50) CHECK - 'call', 'update', 'analysis', 'commentary', 'educational'
- `strategy_type` VARCHAR(50) - 'intraday', 'swing', 'positional', 'long_term', 'options'
- `audience` VARCHAR(20) CHECK - 'free', 'paid', 'both'
- `stock_symbol` VARCHAR(50) - NIFTY, RELIANCE, etc.
- `action` VARCHAR(10) - 'BUY', 'SELL', 'HOLD'
- `entry_price` DECIMAL(12,2)
- `target_price` DECIMAL(12,2)
- `stop_loss` DECIMAL(12,2)
- `risk_reward_ratio` VARCHAR(20) - "1:2", "1:3"
- `confidence_level` VARCHAR(20) - 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'
- `call_status` VARCHAR(20) - 'open', 'target_hit', 'stop_loss_hit', 'closed', 'expired'
- `actual_entry_price` DECIMAL(12,2)
- `actual_exit_price` DECIMAL(12,2)
- `actual_profit_percent` DECIMAL(6,2)
- `closed_at` TIMESTAMP WITH TIME ZONE
- `views_count` INTEGER DEFAULT 0
- `bookmarks_count` INTEGER DEFAULT 0 (auto-updated by trigger)
- `comments_count` INTEGER DEFAULT 0
- `is_urgent` BOOLEAN DEFAULT FALSE
- `is_pinned` BOOLEAN DEFAULT FALSE
- `is_featured` BOOLEAN DEFAULT FALSE
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE
- `deleted_at` TIMESTAMP WITH TIME ZONE

**Key Indexes:**
- `idx_posts_analyst_timeline` - Analyst's post feed
- `idx_posts_urgent` - Urgent calls for homepage
- `idx_posts_stock_symbol` - Stock-specific queries
- Full-text search index on content

---

### 7. bookmarks

**Purpose:** User-saved posts for later reference

**Columns:**
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id)
- `post_id` UUID REFERENCES posts(id)
- `notes` TEXT - Optional user notes
- `created_at` TIMESTAMP WITH TIME ZONE

**Constraints:**
- Unique user-post combination (can't bookmark same post twice)

---

### 8. reviews

**Purpose:** User ratings and reviews of analysts

**Columns:**
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id)
- `analyst_id` UUID REFERENCES users(id)
- `rating` INTEGER CHECK (1 to 5)
- `review_title` VARCHAR(255)
- `review_text` TEXT
- `is_verified_subscriber` BOOLEAN - Was user subscribed when reviewing?
- `subscription_duration_days` INTEGER
- `is_approved` BOOLEAN DEFAULT TRUE
- `is_flagged` BOOLEAN DEFAULT FALSE
- `flagged_reason` TEXT
- `moderated_by` UUID REFERENCES users(id)
- `moderated_at` TIMESTAMP WITH TIME ZONE
- `helpfulness_upvotes` INTEGER DEFAULT 0
- `helpfulness_downvotes` INTEGER DEFAULT 0
- `analyst_response` TEXT
- `analyst_response_at` TIMESTAMP WITH TIME ZONE
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE
- `deleted_at` TIMESTAMP WITH TIME ZONE

**Business Rules:**
- Users must be subscribed for 30 days before reviewing (app-level enforcement)
- One review per user per analyst
- Users cannot review themselves

**Triggers:**
- Updates analyst avg_rating and total_reviews

---

### 9. chat_channels

**Purpose:** Community chat rooms for analyst subscribers

**Columns:**
- `id` UUID PRIMARY KEY
- `analyst_id` UUID REFERENCES users(id)
- `channel_name` VARCHAR(255)
- `channel_description` TEXT
- `channel_type` VARCHAR(50) - 'community', 'premium', 'support'
- `is_active` BOOLEAN DEFAULT TRUE
- `is_archived` BOOLEAN DEFAULT FALSE
- `max_members` INTEGER - NULL = unlimited
- `message_rate_limit` INTEGER DEFAULT 10 - Messages per user per minute
- `is_rate_limited` BOOLEAN DEFAULT TRUE
- `require_subscription` BOOLEAN DEFAULT TRUE
- `minimum_tier_required` UUID REFERENCES subscription_tiers(id)
- `total_messages` INTEGER DEFAULT 0 (auto-updated by trigger)
- `active_members_count` INTEGER DEFAULT 0
- `last_message_at` TIMESTAMP WITH TIME ZONE
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE
- `deleted_at` TIMESTAMP WITH TIME ZONE

---

### 10. chat_messages

**Purpose:** Real-time chat messages within channels

**Columns:**
- `id` UUID PRIMARY KEY
- `channel_id` UUID REFERENCES chat_channels(id)
- `user_id` UUID REFERENCES users(id)
- `analyst_id` UUID REFERENCES users(id) - Denormalized
- `message` TEXT NOT NULL (max 2000 chars)
- `message_type` VARCHAR(50) - 'text', 'image', 'file', 'system'
- `attachment_url` VARCHAR(500)
- `reply_to_message_id` UUID REFERENCES chat_messages(id)
- `is_deleted` BOOLEAN DEFAULT FALSE
- `deleted_by` UUID REFERENCES users(id)
- `deleted_at` TIMESTAMP WITH TIME ZONE
- `deletion_reason` TEXT
- `is_flagged` BOOLEAN DEFAULT FALSE
- `flagged_by` UUID REFERENCES users(id)
- `flagged_reason` TEXT
- `is_pinned` BOOLEAN DEFAULT FALSE
- `pinned_by` UUID REFERENCES users(id)
- `pinned_at` TIMESTAMP WITH TIME ZONE
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE

**Rate Limiting:**
- Function `check_chat_rate_limit(user_id, channel_id, rate_limit)` validates before insert

---

### 11. payment_transactions

**Purpose:** All Razorpay payment tracking (subscriptions, refunds, payouts)

**Columns:**
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id)
- `analyst_id` UUID REFERENCES users(id)
- `subscription_id` UUID REFERENCES subscriptions(id)
- `razorpay_payment_id` VARCHAR(255) UNIQUE
- `razorpay_order_id` VARCHAR(255)
- `razorpay_signature` VARCHAR(500)
- `transaction_type` VARCHAR(50) - 'subscription_payment', 'renewal', 'refund', 'payout'
- `amount` INTEGER - In paise
- `currency` VARCHAR(3) DEFAULT 'INR'
- `status` VARCHAR(50) - 'pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled'
- `payment_method` VARCHAR(50) - UPI, card, netbanking
- `failure_reason` TEXT
- `failure_code` VARCHAR(100)
- `retry_count` INTEGER DEFAULT 0
- `refund_amount` INTEGER
- `refund_reason` TEXT
- `refunded_at` TIMESTAMP WITH TIME ZONE
- `razorpay_refund_id` VARCHAR(255)
- `payout_amount` INTEGER - Analyst's share (80%)
- `platform_commission` INTEGER - Platform's share (20%)
- `payout_status` VARCHAR(50)
- `razorpay_payout_id` VARCHAR(255)
- `paid_out_at` TIMESTAMP WITH TIME ZONE
- `metadata` JSONB
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE

**Business Logic:**
- payout_amount + platform_commission = amount (verified by constraint)

---

### 12. invite_links

**Purpose:** Analyst referral tracking for zero-CAC growth strategy

**Columns:**
- `id` UUID PRIMARY KEY
- `analyst_id` UUID REFERENCES users(id)
- `invite_code` VARCHAR(50) UNIQUE - Short code (e.g., "RAJESH-TELEGRAM")
- `link_name` VARCHAR(255) - Campaign name
- `link_description` TEXT
- `is_active` BOOLEAN DEFAULT TRUE
- `expires_at` TIMESTAMP WITH TIME ZONE
- `max_uses` INTEGER
- `discount_code_id` UUID REFERENCES discount_codes(id)
- `total_clicks` INTEGER DEFAULT 0
- `unique_visitors` INTEGER DEFAULT 0
- `signups_count` INTEGER DEFAULT 0
- `conversions_count` INTEGER DEFAULT 0 - Paid subscriptions
- `total_revenue_generated` INTEGER DEFAULT 0
- `conversion_rate` DECIMAL(5,2) GENERATED ALWAYS - Auto-calculated
- `utm_source` VARCHAR(100)
- `utm_medium` VARCHAR(100)
- `utm_campaign` VARCHAR(100)
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE
- `last_used_at` TIMESTAMP WITH TIME ZONE
- `deleted_at` TIMESTAMP WITH TIME ZONE

**Analytics:**
- Conversion rate = (conversions / total_clicks * 100)
- Tracks entire funnel: clicks → signups → paid conversions → revenue

---

### 13. discount_codes

**Purpose:** Promotional discount codes for subscriptions

**Columns:**
- `id` UUID PRIMARY KEY
- `analyst_id` UUID REFERENCES users(id)
- `code` VARCHAR(50) UNIQUE - e.g., "TELEGRAM50"
- `code_name` VARCHAR(255)
- `code_description` TEXT
- `discount_type` VARCHAR(20) - 'percentage', 'fixed_amount'
- `discount_value` INTEGER - 1-100 for percentage, paise for fixed
- `max_discount_amount` INTEGER - Cap for percentage discounts
- `applicable_tiers` UUID[] - Array of tier IDs
- `billing_cycle_restriction` VARCHAR(20) - 'monthly', 'yearly', 'both'
- `first_time_only` BOOLEAN DEFAULT FALSE
- `is_active` BOOLEAN DEFAULT TRUE
- `usage_limit` INTEGER
- `usage_count` INTEGER DEFAULT 0 (auto-updated by trigger)
- `per_user_limit` INTEGER DEFAULT 1
- `valid_from` TIMESTAMP WITH TIME ZONE
- `valid_until` TIMESTAMP WITH TIME ZONE
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE
- `deleted_at` TIMESTAMP WITH TIME ZONE

**Validation:**
- Percentage must be 1-100
- usage_count cannot exceed usage_limit

---

### 14. moderation_flags

**Purpose:** User reports of inappropriate content or fraudulent activity

**Columns:**
- `id` UUID PRIMARY KEY
- `reported_by` UUID REFERENCES users(id)
- `flagged_entity_type` VARCHAR(50) - 'user', 'analyst', 'post', 'chat_message', 'review'
- `flagged_entity_id` UUID - Polymorphic reference
- `flag_reason` VARCHAR(100) - 'spam', 'harassment', 'fraudulent_activity', 'fake_calls', etc.
- `flag_description` TEXT
- `status` VARCHAR(50) - 'pending', 'under_review', 'resolved', 'dismissed', 'action_taken'
- `priority` VARCHAR(20) - 'low', 'medium', 'high', 'critical'
- `reviewed_by` UUID REFERENCES users(id)
- `reviewed_at` TIMESTAMP WITH TIME ZONE
- `resolution_notes` TEXT
- `action_taken` VARCHAR(100) - 'content_removed', 'user_warned', 'user_suspended', 'user_banned'
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE

---

### 15. support_tickets

**Purpose:** User support requests and issue tracking

**Columns:**
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id)
- `subject` VARCHAR(500)
- `description` TEXT
- `ticket_type` VARCHAR(50) - 'technical_issue', 'payment_issue', 'account_issue', 'verification_issue', etc.
- `status` VARCHAR(50) - 'open', 'in_progress', 'waiting_user', 'resolved', 'closed', 'escalated'
- `priority` VARCHAR(20) - 'low', 'medium', 'high', 'critical'
- `assigned_to` UUID REFERENCES users(id)
- `assigned_at` TIMESTAMP WITH TIME ZONE
- `resolution_notes` TEXT
- `resolved_at` TIMESTAMP WITH TIME ZONE
- `resolved_by` UUID REFERENCES users(id)
- `related_entity_type` VARCHAR(50)
- `related_entity_id` UUID
- `attachments` JSONB
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE
- `last_response_at` TIMESTAMP WITH TIME ZONE
- `closed_at` TIMESTAMP WITH TIME ZONE

---

### 16. notifications

**Purpose:** User notifications (email, push, in-app)

**Columns:**
- `id` UUID PRIMARY KEY
- `user_id` UUID REFERENCES users(id)
- `notification_type` VARCHAR(50) - 'new_post', 'urgent_post', 'payment_success', 'subscription_expiring', etc.
- `title` VARCHAR(255)
- `message` TEXT
- `action_url` VARCHAR(500) - Deep link
- `related_entity_type` VARCHAR(50)
- `related_entity_id` UUID
- `send_email` BOOLEAN DEFAULT TRUE
- `send_push` BOOLEAN DEFAULT TRUE
- `send_in_app` BOOLEAN DEFAULT TRUE
- `status` VARCHAR(50) - 'pending', 'sent', 'failed', 'read'
- `sent_at` TIMESTAMP WITH TIME ZONE
- `read_at` TIMESTAMP WITH TIME ZONE
- `email_sent` BOOLEAN DEFAULT FALSE
- `email_sent_at` TIMESTAMP WITH TIME ZONE
- `email_opened` BOOLEAN DEFAULT FALSE
- `email_opened_at` TIMESTAMP WITH TIME ZONE
- `email_clicked` BOOLEAN DEFAULT FALSE
- `push_sent` BOOLEAN DEFAULT FALSE
- `push_sent_at` TIMESTAMP WITH TIME ZONE
- `priority` VARCHAR(20) - 'low', 'medium', 'high', 'urgent'
- `notification_group` VARCHAR(100) - For batching (daily_digest)
- `created_at` TIMESTAMP WITH TIME ZONE
- `updated_at` TIMESTAMP WITH TIME ZONE

---

## Database Functions & Triggers

### Auto-Update Triggers

- **update_updated_at_column()** - Updates `updated_at` on row modification (applied to all tables)

### Statistics Triggers

- **update_analyst_review_stats()** - Recalculates avg_rating and total_reviews
- **update_analyst_subscriber_counts()** - Updates total_subscribers and active_subscribers
- **update_post_bookmark_count()** - Updates bookmarks_count on posts
- **update_analyst_post_stats()** - Updates total_posts and last_post_at
- **update_chat_channel_stats()** - Updates total_messages and last_message_at
- **increment_discount_code_usage()** - Increments usage_count

### Utility Functions

- **expire_old_subscriptions()** - Marks subscriptions as expired (cron job)
- **cleanup_expired_otps()** - Deletes old OTP codes (cron job)
- **calculate_analyst_monthly_revenue(UUID)** - Calculates revenue from active subscriptions
- **check_chat_rate_limit(UUID, UUID, INTEGER)** - Validates chat rate limits

---

## Performance Optimization

### Index Strategy

1. **Foreign Keys:** All foreign keys have indexes
2. **Partial Indexes:** Filtered for common queries (e.g., `WHERE deleted_at IS NULL`)
3. **Composite Indexes:** Multi-column queries (user_id + created_at)
4. **GIN Indexes:** Array columns (specializations, languages)
5. **Full-Text Search:** Posts content search

### Query Patterns

Optimized for:
- User feed (posts from subscribed analysts)
- Analyst discovery page (filtered by specialization, rating)
- Payment history and analytics
- Real-time chat message loading
- Notification delivery batching

### Scalability Considerations

- **Connection Pooling:** Use pgBouncer for production
- **Read Replicas:** For analytics and reporting queries
- **Partitioning:** Consider partitioning posts and chat_messages when exceeding 10M rows
- **Archiving:** Archive old data (expired subscriptions, old OTPs, read notifications)

---

## Security Considerations

1. **Row-Level Security:** Implemented at application middleware layer
2. **Password Storage:** Bcrypt hashed passwords only
3. **Soft Deletes:** Preserve data for compliance and auditing
4. **Audit Trail:** All tables have created_at, updated_at
5. **Data Validation:** CHECK constraints prevent invalid data

---

## Backup & Maintenance

### Daily Tasks (Cron Jobs)

```sql
-- Expire old subscriptions
SELECT expire_old_subscriptions();

-- Clean up expired OTPs
SELECT cleanup_expired_otps();
```

### Weekly Tasks

- Analyze tables for query optimization
- Review slow query log
- Check index usage statistics

### Monthly Tasks

- Archive old notifications (read + 30 days old)
- Archive old support tickets (closed + 60 days old)
- Review and optimize indexes

---

## Migration Execution Order

1. Extensions (uuid-ossp, pgcrypto)
2. Core tables (users, analyst_profiles)
3. Monetization (tiers, subscriptions, payments)
4. Content (posts, bookmarks, reviews)
5. Communication (chat_channels, chat_messages)
6. Platform (notifications, support, moderation)
7. Cross-table constraints
8. Triggers and functions

---

## Contact & Support

For database-related questions:
- Schema changes: Create migration file, do not modify existing
- Performance issues: Use EXPLAIN ANALYZE, share query plan
- Data integrity: Check constraints and triggers first

Database designed and maintained by the Backend Architecture Team.
