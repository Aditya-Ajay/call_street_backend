# Backend Architecture Documentation

## Overview

This document provides a comprehensive overview of the Analyst Marketplace Platform backend architecture.

## Architecture Pattern

**MVC (Model-View-Controller)** with service layer for business logic.

```
Client Request
     ↓
  Routes (routing)
     ↓
  Middleware (auth, validation, rate limiting)
     ↓
  Controllers (request handling)
     ↓
  Services (business logic)
     ↓
  Models (database queries)
     ↓
  Database (PostgreSQL)
```

## Core Components

### 1. Configuration Layer (`src/config/`)

**Purpose:** Centralized configuration management

**Files:**
- `database.js` - PostgreSQL connection pool (20 connections max)
- `env.js` - Environment variables with validation
- `cloudinary.js` - File upload/storage configuration

**Key Features:**
- Connection pooling for optimal performance
- Environment variable validation on startup
- Graceful database connection handling
- Production/development environment support

### 2. Middleware Layer (`src/middleware/`)

**Purpose:** Request processing pipeline

**Files:**

#### `auth.js` - Authentication & Authorization
- JWT token verification
- Refresh token handling
- Role-based access control (RBAC)
- Token generation utilities
- Optional authentication support

**Functions:**
- `verifyToken` - Validates JWT access token
- `requireRole` - Restricts access by role
- `requireAnalyst/Trader/Admin` - Shortcuts for role checks
- `checkOwnership` - Verifies resource ownership
- `generateTokenPair` - Creates access + refresh tokens

#### `errorHandler.js` - Error Management
- Global error handling
- Custom error classes
- Database error translation
- JWT error handling
- Consistent error response format

**Features:**
- PostgreSQL error code handling (23505, 23503, etc.)
- Development vs production error details
- Async error wrapper
- Unhandled rejection handling

#### `rateLimiter.js` - Rate Limiting
- DDoS protection
- Endpoint-specific limits
- User-based limiting (authenticated routes)

**Limiters:**
- Standard: 100 req/15min
- Auth: 5 req/15min
- OTP: 3 req/10min
- Upload: 10 req/hour
- Chat: 50 msg/min
- Payment: 5 req/hour

#### `validation.js` - Input Validation
- express-validator integration
- Custom validation rules
- Field-specific validators
- Consistent error responses

**Validators:**
- Email, phone, password validation
- SEBI number, PAN card validation
- Subscription tier validation
- Pagination validation
- File upload validation

### 3. Route Layer (`src/routes/`)

**Purpose:** API endpoint definitions

**Route Files:**

#### `auth.routes.js` - Authentication
- Signup/Login/Logout
- OTP send/verify
- Password reset
- Token refresh
- Current user profile

#### `analyst.routes.js` - Analyst Management
- Profile CRUD
- Discovery/search
- Verification documents
- Posts, reviews, subscribers
- Trending/top-rated

#### `subscription.routes.js` - Subscriptions
- Create/cancel/renew
- Payment verification
- Razorpay webhook
- Expiring subscriptions
- Subscription status check

#### `post.routes.js` - Content Management
- Post CRUD
- Like/save/comment
- Image upload
- Personalized feed
- Tier-based access control

#### `chat.routes.js` - Messaging
- Conversation management
- Message history
- Read status
- Mute/block users
- Unread count

#### `review.routes.js` - Reviews & Ratings
- Submit/update/delete reviews
- Review eligibility check
- Helpful votes
- Analyst reviews list

#### `admin.routes.js` - Admin Panel
- Dashboard statistics
- User management
- Analyst verification
- Content moderation
- Analytics reports

### 4. Socket.io Layer (`src/socket/`)

**Purpose:** Real-time communication

**File:** `chatSocket.js`

**Features:**
- JWT authentication for sockets
- Room-based messaging
- Typing indicators
- Online/offline presence
- Message read receipts
- Notification broadcasting

**Events:**
- `connection/disconnect` - Connection lifecycle
- `join_room/leave_room` - Room management
- `send_message/receive_message` - Messaging
- `typing_start/typing_stop` - Typing indicators
- `user_online/user_offline` - Presence

**Architecture:**
```javascript
// Connection store (in-memory, use Redis in production)
connectedUsers = Map<userId, socketInfo>
userSockets = Map<userId, socket>

// Message flow
Client → authenticate → join room → send message → broadcast to room
```

### 5. Utility Layer (`src/utils/`)

**Purpose:** Reusable helper functions

**Files:**

#### `constants.js` - Application Constants
- User roles, subscription tiers
- Post types, specializations
- Payment/subscription status
- File limits, pagination defaults
- HTTP status codes
- Success/error messages
- Socket events, database tables

#### `helpers.js` - Common Utilities
- Password hashing/comparison
- OTP generation
- Phone number formatting
- Pagination helpers
- Response formatting
- Date/time utilities
- Input sanitization

#### `validators.js` - Business Validators
- SEBI/PAN/Aadhaar validation
- Tier access validation
- Rating/experience validation
- File validation
- Password strength checker
- Custom business rules

### 6. Server Entry Point (`src/server.js`)

**Purpose:** Application bootstrap

**Responsibilities:**
1. Initialize Express app
2. Create HTTP server
3. Initialize Socket.io
4. Configure middleware
5. Register routes
6. Start server
7. Handle graceful shutdown

**Middleware Order:**
```javascript
1. Helmet (security headers)
2. CORS (cross-origin)
3. Body parser (JSON/URL-encoded)
4. Morgan (HTTP logging)
5. Global rate limiter
6. Routes
7. 404 handler
8. Error handler
```

**Graceful Shutdown:**
- Close HTTP server
- Close Socket.io connections
- Close database pool
- 10-second force shutdown timeout

## Database Architecture

### Connection Pooling

```javascript
Pool Configuration:
- Max connections: 20
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds
- SSL: Enabled in production
```

### Query Execution

All queries use parameterized statements:
```javascript
pool.query('SELECT * FROM users WHERE id = $1', [userId])
```

**Benefits:**
- SQL injection prevention
- Query plan caching
- Type safety

### Transaction Support

```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... multiple queries
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

## Security Implementation

### Authentication Flow

```
1. User signs up → password hashed with bcrypt
2. User logs in → JWT access token (7d) + refresh token (30d)
3. Client stores tokens
4. Client includes access token in Authorization header
5. Server verifies token on protected routes
6. Token expires → client uses refresh token
7. Server issues new access token
```

### Authorization Levels

```
Public routes → No authentication
Authenticated routes → verifyToken
Role-based routes → verifyToken + requireRole
Ownership routes → verifyToken + checkOwnership
Admin routes → verifyToken + requireAdmin
```

### Security Measures

1. **Input Validation:** All inputs validated before processing
2. **SQL Injection:** Parameterized queries only
3. **XSS Prevention:** Input sanitization
4. **CSRF:** Token-based authentication
5. **Rate Limiting:** Multiple layers of protection
6. **Password Security:** bcrypt with cost factor 10
7. **Token Security:** Short-lived access tokens
8. **File Upload:** Size and type restrictions

## Performance Optimizations

### Database

- Connection pooling (20 connections)
- Indexed queries (foreign keys, frequent searches)
- Pagination (max 100 items per page)
- Prepared statements (query plan caching)

### API

- Efficient Socket.io configuration
- Response compression (future)
- Caching layer (future with Redis)
- Async/await throughout
- Promise.all for parallel operations

### Monitoring

- Slow query logging (>1 second)
- Request logging (Morgan)
- Error logging with context
- Connection pool metrics

## Scalability Considerations

### Current Architecture

- Stateless API (horizontal scaling ready)
- Database pooling (efficient resource use)
- Socket.io (currently in-memory, needs Redis)

### Production Recommendations

1. **Load Balancer:** NGINX/AWS ALB
2. **Multiple Instances:** PM2 cluster mode
3. **Redis:** For session store and Socket.io
4. **Database:** Read replicas for queries
5. **CDN:** Cloudinary for static assets
6. **Caching:** Redis for frequently accessed data
7. **Message Queue:** Bull/RabbitMQ for async jobs

### Horizontal Scaling

```
                Load Balancer (NGINX)
                        ↓
        ┌───────────────┼───────────────┐
        ↓               ↓               ↓
    Instance 1      Instance 2      Instance 3
        ↓               ↓               ↓
        └───────────────┼───────────────┘
                        ↓
                Redis (sessions + Socket.io)
                        ↓
                PostgreSQL (master)
                ↓               ↓
        Read Replica 1  Read Replica 2
```

## Error Handling Strategy

### Error Types

1. **Validation Errors** (400) - Bad input
2. **Authentication Errors** (401) - Invalid/expired token
3. **Authorization Errors** (403) - Insufficient permissions
4. **Not Found Errors** (404) - Resource doesn't exist
5. **Conflict Errors** (409) - Duplicate resource
6. **Rate Limit Errors** (429) - Too many requests
7. **Server Errors** (500) - Unexpected errors

### Error Response Format

```json
{
  "success": false,
  "message": "User-friendly message",
  "statusCode": 400,
  "errors": {
    "field": "Specific error"
  },
  "stack": "... (development only)"
}
```

## Testing Strategy (To Be Implemented)

### Unit Tests
- Utility functions
- Validators
- Middleware
- Models

### Integration Tests
- API endpoints
- Database operations
- Authentication flow

### E2E Tests
- Complete user flows
- Payment processing
- Real-time chat

## Deployment Architecture

### Development
```
Local Machine
├── Node.js server (localhost:5000)
├── PostgreSQL (localhost:5432)
└── Frontend (localhost:5173)
```

### Production
```
Cloud Provider (AWS/GCP/Azure)
├── Application Servers (multiple instances)
├── PostgreSQL (managed service)
├── Redis (managed service)
├── Load Balancer
├── CDN (Cloudinary)
└── Monitoring (CloudWatch/Datadog)
```

## Monitoring & Logging

### Current Logging
- Console logs (development)
- Morgan HTTP logs
- Error logs with context
- Database connection logs

### Production Recommendations
- Structured logging (Winston/Pino)
- Log aggregation (ELK/CloudWatch)
- Error tracking (Sentry)
- Performance monitoring (New Relic/Datadog)
- Uptime monitoring (Pingdom/UptimeRobot)

## API Documentation

### Standards
- RESTful conventions
- Consistent response format
- Proper HTTP status codes
- Error messages

### Future Additions
- OpenAPI/Swagger documentation
- API versioning (/api/v1/)
- GraphQL endpoint (optional)

## Next Steps

1. Implement controllers and services
2. Complete database models
3. Add comprehensive tests
4. Set up CI/CD pipeline
5. Add API documentation (Swagger)
6. Implement caching layer
7. Set up monitoring
8. Performance testing
9. Security audit
10. Load testing

---

**Built with production-grade standards for scalability, security, and maintainability.**
