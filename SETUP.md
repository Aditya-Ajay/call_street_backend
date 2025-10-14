# Backend Setup Guide

Quick start guide to get the Analyst Marketplace backend running.

## Prerequisites

Before starting, ensure you have:

- Node.js >= 18.0.0
- PostgreSQL >= 14.0
- npm >= 9.0.0

## Quick Setup (5 minutes)

### Step 1: Install Dependencies

```bash
cd backend
npm install
```

### Step 2: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your credentials
nano .env  # or use your preferred editor
```

**Required Environment Variables:**

```env
# Minimum required for local development
NODE_ENV=development
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=analyst_platform
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=change_this_to_a_random_string
JWT_REFRESH_SECRET=change_this_to_another_random_string

FRONTEND_URL=http://localhost:5173
```

### Step 3: Create Database

```bash
# Option 1: Using createdb command
createdb analyst_platform

# Option 2: Using psql
psql -U postgres
CREATE DATABASE analyst_platform;
\q
```

### Step 4: Run Database Migrations

```bash
# Install PostgreSQL migration tool (if not already installed)
npm install -g node-pg-migrate

# Run all migrations
psql -U postgres -d analyst_platform -f migrations/001_enable_uuid_extension.sql
psql -U postgres -d analyst_platform -f migrations/002_create_users_table.sql
psql -U postgres -d analyst_platform -f migrations/003_create_otp_verifications_table.sql
psql -U postgres -d analyst_platform -f migrations/004_create_analyst_profiles_table.sql
psql -U postgres -d analyst_platform -f migrations/005_create_subscription_tiers_table.sql
psql -U postgres -d analyst_platform -f migrations/006_create_subscriptions_table.sql
psql -U postgres -d analyst_platform -f migrations/007_create_posts_table.sql
psql -U postgres -d analyst_platform -f migrations/008_create_bookmarks_table.sql
psql -U postgres -d analyst_platform -f migrations/009_create_reviews_table.sql
psql -U postgres -d analyst_platform -f migrations/010_create_chat_channels_table.sql
psql -U postgres -d analyst_platform -f migrations/011_create_chat_messages_table.sql
psql -U postgres -d analyst_platform -f migrations/012_create_payment_transactions_table.sql
psql -U postgres -d analyst_platform -f migrations/013_create_invite_links_table.sql
psql -U postgres -d analyst_platform -f migrations/014_create_discount_codes_table.sql
psql -U postgres -d analyst_platform -f migrations/015_create_foreign_key_constraints.sql
psql -U postgres -d analyst_platform -f migrations/016_create_moderation_flags_table.sql
psql -U postgres -d analyst_platform -f migrations/017_create_support_tickets_table.sql

# Or run all at once
cat migrations/*.sql | psql -U postgres -d analyst_platform
```

### Step 5: Start Development Server

```bash
npm run dev
```

Server should now be running at `http://localhost:5000`

## Verify Installation

### Test Health Endpoint

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development",
  "version": "1.0.0"
}
```

### Test Database Connection

The server logs should show:
```
✅ Database connected: 2024-01-01 00:00:00
```

## Common Issues & Solutions

### Issue: Database Connection Failed

**Solution:**
```bash
# Check PostgreSQL is running
pg_isready

# Start PostgreSQL (macOS)
brew services start postgresql@14

# Start PostgreSQL (Ubuntu)
sudo systemctl start postgresql

# Verify credentials in .env match your PostgreSQL setup
psql -U postgres -d analyst_platform
```

### Issue: Port Already in Use

**Solution:**
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>

# Or change PORT in .env
PORT=5001
```

### Issue: Missing Dependencies

**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
```

## Optional Services Setup

### Cloudinary (File Upload)

1. Sign up at https://cloudinary.com
2. Get credentials from dashboard
3. Add to `.env`:
```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Razorpay (Payments)

1. Sign up at https://razorpay.com
2. Get test API keys
3. Add to `.env`:
```env
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=your_secret
```

### Twilio (SMS/OTP)

1. Sign up at https://twilio.com
2. Get account credentials
3. Add to `.env`:
```env
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
```

### Resend (Email)

1. Sign up at https://resend.com
2. Get API key
3. Add to `.env`:
```env
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@yourplatform.com
```

### Claude API (AI Features)

1. Sign up at https://console.anthropic.com
2. Get API key
3. Add to `.env`:
```env
CLAUDE_API_KEY=sk-ant-xxxxx
```

## Development Workflow

### Start Development Server

```bash
npm run dev
```

This uses nodemon for automatic restart on file changes.

### Start Production Server

```bash
npm start
```

### View Logs

Development server logs to console by default.

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration (database, env, cloudinary)
│   ├── middleware/      # Express middleware (auth, validation, errors)
│   ├── routes/          # API route definitions
│   ├── controllers/     # Request handlers (to be implemented)
│   ├── services/        # Business logic (to be implemented)
│   ├── models/          # Database models (to be implemented)
│   ├── utils/           # Utility functions
│   ├── socket/          # Socket.io handlers
│   └── server.js        # Express app entry point
├── migrations/          # Database migrations
├── seeds/               # Seed data
├── tests/               # API tests
└── .env                 # Environment variables
```

## Next Steps

1. Implement controllers for each route
2. Implement service layer for business logic
3. Implement database models
4. Add unit tests
5. Add integration tests
6. Set up CI/CD pipeline

## Need Help?

- Check the main README.md for API documentation
- Review the PRD at `../analyst_platform_prd.md`
- Check environment variables in `.env.example`

## Testing the API

Use tools like:
- Postman
- Insomnia
- cURL
- Thunder Client (VS Code extension)

Example request:
```bash
curl -X GET http://localhost:5000/health
```

---

Happy coding! 🚀
