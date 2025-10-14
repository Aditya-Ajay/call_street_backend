# Database Migrations

This directory contains PostgreSQL database migrations for the Analyst Marketplace Platform.

## Migration Files

Migrations are numbered sequentially and must be run in order:

1. **001_enable_uuid_extension.sql** - Enable UUID and cryptographic extensions
2. **002_create_users_table.sql** - Core users table (analysts, traders, admins)
3. **003_create_otp_verifications_table.sql** - OTP verification for authentication
4. **004_create_analyst_profiles_table.sql** - Analyst profile information and SEBI verification
5. **005_create_subscription_tiers_table.sql** - Analyst pricing tiers (Free, Pro, Premium)
6. **006_create_subscriptions_table.sql** - User subscriptions to analyst tiers
7. **007_create_posts_table.sql** - Analyst posts/calls (main content table)
8. **008_create_bookmarks_table.sql** - User bookmarks for posts
9. **009_create_reviews_table.sql** - User reviews and ratings for analysts
10. **010_create_chat_channels_table.sql** - Chat channels for analyst communities
11. **011_create_chat_messages_table.sql** - Real-time chat messages
12. **012_create_payment_transactions_table.sql** - Razorpay payment tracking
13. **013_create_invite_links_table.sql** - Analyst invite links for growth tracking
14. **014_create_discount_codes_table.sql** - Discount codes for promotions
15. **015_create_foreign_key_constraints.sql** - Cross-table foreign key constraints
16. **016_create_moderation_flags_table.sql** - Content moderation and reporting
17. **017_create_support_tickets_table.sql** - User support tickets
18. **018_create_notifications_table.sql** - User notifications (email, push, in-app)
19. **019_create_triggers_and_functions.sql** - Database triggers and utility functions

## Running Migrations

### Prerequisites

1. PostgreSQL 14+ installed
2. Database created:
   ```bash
   createdb analyst_platform_dev
   ```

### Option 1: Manual Migration (Recommended for Development)

Run migrations in order using psql:

```bash
# Set your database connection
export DATABASE_URL="postgresql://username:password@localhost:5432/analyst_platform_dev"

# Run all migrations in order
for file in backend/migrations/*.sql; do
  echo "Running $file..."
  psql $DATABASE_URL -f "$file"
done
```

### Option 2: Individual Migration

Run a specific migration:

```bash
psql $DATABASE_URL -f backend/migrations/001_enable_uuid_extension.sql
```

### Option 3: Using the Migration Script

```bash
# Run all migrations
npm run migrate:up

# Run migrations with seed data
npm run migrate:seed
```

## Seed Data

After running all migrations, load seed data for development:

```bash
psql $DATABASE_URL -f backend/seeds/initial_data.sql
```

**Seed Data Includes:**
- 1 Admin user
- 5 Verified analysts with complete profiles
- 10 Trader users
- Multiple subscription tiers
- Sample posts, reviews, subscriptions
- Discount codes and invite links
- Payment transactions
- Chat channels and messages

**Test Credentials:** All users have password `password123`
- Admin: `admin@platform.com`
- Analyst: `rajesh.kumar@example.com`, `priya.sharma@example.com`, etc.
- Trader: `trader1@example.com`, `trader2@example.com`, etc.

## Database Schema Overview

### Core Tables

#### Authentication & Users
- **users** - All platform users (analysts, traders, admins)
- **otp_verifications** - OTP codes for phone/email verification
- **analyst_profiles** - Extended analyst information with SEBI verification

#### Monetization
- **subscription_tiers** - Analyst pricing plans (Free, Pro, Premium)
- **subscriptions** - User subscriptions to analysts
- **payment_transactions** - Razorpay payment tracking
- **discount_codes** - Promotional discount codes
- **invite_links** - Analyst referral tracking

#### Content & Social
- **posts** - Analyst stock market calls/recommendations
- **bookmarks** - User-saved posts
- **reviews** - Analyst ratings and reviews
- **chat_channels** - Community chat rooms
- **chat_messages** - Real-time chat messages

#### Platform Management
- **notifications** - User notifications (email, push, in-app)
- **moderation_flags** - Content/user reports
- **support_tickets** - Customer support tickets

## Database Triggers

Automatic triggers maintain data integrity and update statistics:

1. **update_updated_at_column()** - Auto-updates `updated_at` timestamp on row updates
2. **update_analyst_review_stats()** - Recalculates analyst average rating and review count
3. **update_analyst_subscriber_counts()** - Updates analyst subscriber counts
4. **update_post_bookmark_count()** - Updates post bookmark count
5. **update_analyst_post_stats()** - Updates analyst total posts and last post time
6. **update_chat_channel_stats()** - Updates chat channel message count
7. **increment_discount_code_usage()** - Increments discount code usage count

## Utility Functions

Available for application use:

- **expire_old_subscriptions()** - Expires subscriptions past expiry date
- **cleanup_expired_otps()** - Deletes old OTP codes
- **calculate_analyst_monthly_revenue(UUID)** - Calculates analyst monthly revenue
- **check_chat_rate_limit(UUID, UUID, INTEGER)** - Validates chat rate limits

## Performance Considerations

### Indexes

All foreign keys have indexes for optimal JOIN performance. Additional indexes include:

- **Partial indexes** - For filtered queries (e.g., `WHERE deleted_at IS NULL`)
- **Composite indexes** - For multi-column queries (e.g., user_id + created_at)
- **GIN indexes** - For array columns (specializations, languages)
- **Full-text search** - For post content search

### Query Optimization

- Use `EXPLAIN ANALYZE` to verify query plans
- Monitor slow queries with `pg_stat_statements`
- Consider partitioning for tables exceeding 10M rows (posts, chat_messages)
- Use connection pooling (e.g., pgBouncer) for production

## Rollback Procedure

Each migration file includes commented-out DOWN migration commands. To rollback:

1. Review the DOWN migration section at the bottom of the file
2. Uncomment the DROP statements
3. Run the file again (or execute DROP commands manually)

**WARNING:** Rollbacks will delete data. Always backup before rollback.

```bash
# Example: Rollback last migration
psql $DATABASE_URL -c "DROP TABLE IF EXISTS notifications CASCADE;"
```

## Best Practices

1. **Never modify existing migrations** - Create new migrations to fix issues
2. **Always backup before production migrations** - Use `pg_dump`
3. **Test migrations on copy of production data** - Verify performance impact
4. **Run migrations during low-traffic periods** - Minimize downtime
5. **Monitor migration execution time** - Large migrations may lock tables

## Troubleshooting

### Migration fails with "relation already exists"

```bash
# Check if table exists
psql $DATABASE_URL -c "\dt tablename"

# Drop and re-run if in development
psql $DATABASE_URL -c "DROP TABLE IF EXISTS tablename CASCADE;"
```

### Extension not available

```bash
# Install PostgreSQL contrib package
sudo apt-get install postgresql-contrib-14
```

### Permission denied

```bash
# Grant necessary permissions
psql $DATABASE_URL -c "GRANT ALL PRIVILEGES ON DATABASE analyst_platform_dev TO your_user;"
```

## Production Deployment

For production deployment:

1. **Backup current database**
   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Run migrations in transaction**
   ```bash
   psql $DATABASE_URL -f migrations/001_enable_uuid_extension.sql
   # ... continue for all migrations
   ```

3. **Verify table structure**
   ```bash
   psql $DATABASE_URL -c "\dt+"
   psql $DATABASE_URL -c "\di+"
   ```

4. **Monitor performance**
   ```bash
   psql $DATABASE_URL -c "SELECT * FROM pg_stat_user_tables;"
   ```

## Contact

For questions about database schema or migrations, contact the backend team.
