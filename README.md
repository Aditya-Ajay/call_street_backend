# Analyst Marketplace Platform - Backend API

Production-grade Express.js backend for connecting SEBI-verified stock market analysts with retail traders through paid subscriptions.

## Tech Stack

- **Framework:** Express.js (JavaScript)
- **Database:** PostgreSQL (with pg connection pooling)
- **Authentication:** JWT + bcrypt
- **Real-time:** Socket.io
- **Payments:** Razorpay
- **File Storage:** Cloudinary
- **Email:** Resend
- **SMS/OTP:** Twilio
- **AI:** Claude API (Anthropic)

## Features

- JWT-based authentication with refresh tokens
- Role-based access control (Analyst, Trader, Admin)
- Real-time chat with Socket.io
- Subscription management with Razorpay
- File upload and storage with Cloudinary
- Rate limiting and security middleware
- Comprehensive error handling
- Database connection pooling
- Graceful shutdown

## Project Structure

```
backend/
├── src/
│   ├── config/              # Configuration files
│   │   ├── database.js      # PostgreSQL connection pool
│   │   ├── env.js           # Environment variables
│   │   └── cloudinary.js    # Cloudinary setup
│   ├── middleware/          # Express middleware
│   │   ├── auth.js          # JWT authentication
│   │   ├── validation.js    # Request validation
│   │   ├── errorHandler.js  # Global error handling
│   │   └── rateLimiter.js   # Rate limiting
│   ├── models/              # Database models (to be implemented)
│   ├── routes/              # API route definitions
│   │   ├── auth.routes.js
│   │   ├── analyst.routes.js
│   │   ├── subscription.routes.js
│   │   ├── post.routes.js
│   │   ├── chat.routes.js
│   │   ├── review.routes.js
│   │   └── admin.routes.js
│   ├── controllers/         # Request handlers (to be implemented)
│   ├── services/            # Business logic (to be implemented)
│   ├── utils/               # Utility functions
│   │   ├── helpers.js       # Common helpers
│   │   ├── validators.js    # Custom validators
│   │   └── constants.js     # Application constants
│   ├── socket/              # Socket.io handlers
│   │   └── chatSocket.js    # Real-time chat
│   └── server.js            # Express app entry point
├── migrations/              # Database migrations (to be created)
├── seeds/                   # Seed data (to be created)
├── tests/                   # API tests (to be created)
├── .env.example             # Environment variables template
├── package.json             # Dependencies
└── README.md               # This file
```

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14.0
- npm >= 9.0.0

## Installation

### 1. Clone the repository

```bash
cd backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` file with your credentials:

```env
# Application
NODE_ENV=development
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=analyst_platform
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key
JWT_REFRESH_SECRET=your_refresh_secret

# Frontend
FRONTEND_URL=http://localhost:5173

# Razorpay
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret

# Claude API
CLAUDE_API_KEY=your_api_key

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Resend Email
RESEND_API_KEY=your_api_key

# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_phone_number
```

### 4. Set up PostgreSQL database

```bash
# Create database
createdb analyst_platform

# Or using psql
psql -U postgres
CREATE DATABASE analyst_platform;
```

### 5. Run database migrations

```bash
# To be implemented
npm run migrate
```

### 6. Start development server

```bash
npm run dev
```

Server will start on `http://localhost:5000`

## Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (to be implemented)

## API Endpoints

### Authentication (`/api/auth`)

- `POST /signup` - Register new user
- `POST /login` - Login with credentials
- `POST /send-otp` - Send OTP for verification
- `POST /verify-otp` - Verify OTP
- `POST /refresh-token` - Refresh access token
- `POST /logout` - Logout user
- `POST /forgot-password` - Send password reset link
- `POST /reset-password` - Reset password
- `GET /me` - Get current user profile

### Analysts (`/api/analysts`)

- `GET /` - Get all analysts (with filters)
- `GET /:id` - Get analyst profile by ID
- `POST /profile` - Create analyst profile
- `PUT /profile` - Update analyst profile
- `GET /:id/posts` - Get analyst posts
- `GET /:id/reviews` - Get analyst reviews
- `GET /:id/subscribers` - Get analyst subscribers
- `POST /verify` - Submit verification documents
- `GET /trending` - Get trending analysts
- `GET /top-rated` - Get top-rated analysts

### Subscriptions (`/api/subscriptions`)

- `POST /create` - Create subscription
- `GET /my-subscriptions` - Get user subscriptions
- `GET /:id` - Get subscription details
- `POST /:id/cancel` - Cancel subscription
- `POST /:id/renew` - Renew subscription
- `GET /analyst/:analystId` - Check subscription status
- `POST /payment/verify` - Verify payment
- `POST /webhook` - Razorpay webhook
- `GET /expiring-soon` - Get expiring subscriptions

### Posts (`/api/posts`)

- `POST /` - Create post
- `GET /` - Get all posts
- `GET /:id` - Get post by ID
- `PUT /:id` - Update post
- `DELETE /:id` - Delete post
- `POST /:id/like` - Like/unlike post
- `POST /:id/save` - Save/bookmark post
- `GET /:id/comments` - Get post comments
- `POST /:id/comments` - Add comment
- `POST /upload-image` - Upload image
- `GET /feed` - Get personalized feed
- `GET /saved` - Get saved posts

### Chat (`/api/chat`)

- `GET /conversations` - Get all conversations
- `GET /conversations/:userId` - Get conversation with user
- `GET /messages` - Get chat messages
- `POST /messages` - Send message
- `DELETE /messages/:messageId` - Delete message
- `PUT /messages/:messageId/read` - Mark as read
- `GET /unread-count` - Get unread count
- `POST /conversations/:userId/mute` - Mute conversation
- `POST /conversations/:userId/block` - Block user

### Reviews (`/api/reviews`)

- `POST /analyst/:analystId` - Submit review
- `GET /analyst/:analystId` - Get analyst reviews
- `GET /:reviewId` - Get review by ID
- `PUT /:reviewId` - Update review
- `DELETE /:reviewId` - Delete review
- `POST /:reviewId/helpful` - Mark as helpful
- `GET /my-reviews` - Get my reviews
- `GET /analyst/:analystId/eligibility` - Check eligibility

### Admin (`/api/admin`)

- `GET /dashboard` - Get dashboard statistics
- `GET /users` - Get all users
- `GET /analysts/pending-verification` - Get pending analysts
- `POST /analysts/:analystId/approve` - Approve analyst
- `POST /analysts/:analystId/reject` - Reject analyst
- `PUT /users/:userId/suspend` - Suspend user
- `PUT /users/:userId/activate` - Activate user
- `DELETE /posts/:postId` - Delete post
- `GET /reports` - Get analytics reports
- `GET /subscriptions` - Get all subscriptions
- `GET /payments` - Get all payments

## Socket.io Events

### Connection

- `connection` - User connects
- `disconnect` - User disconnects
- `authenticate` - Authenticate socket connection

### Chat

- `join_room` - Join chat room
- `leave_room` - Leave chat room
- `send_message` - Send message
- `receive_message` - Receive message
- `typing_start` - User starts typing
- `typing_stop` - User stops typing
- `message_read` - Mark message as read

### Presence

- `user_online` - User comes online
- `user_offline` - User goes offline

### Notifications

- `new_notification` - Receive notification

## Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### Getting Access Token

```bash
POST /api/auth/login
Content-Type: application/json

{
  "identifier": "user@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

### Using Access Token

Include the access token in the `Authorization` header:

```bash
GET /api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Refreshing Access Token

```bash
POST /api/auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Standard:** 100 requests per 15 minutes
- **Authentication:** 5 requests per 15 minutes
- **OTP:** 3 requests per 10 minutes
- **Upload:** 10 requests per hour
- **Chat:** 50 messages per minute
- **Payment:** 5 requests per hour
- **Global:** 500 requests per 15 minutes

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "message": "User-friendly error message",
  "statusCode": 400,
  "errors": {
    "field": "error details"
  }
}
```

### HTTP Status Codes

- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `429` - Too Many Requests
- `500` - Internal Server Error

## Security Features

- Helmet.js for security headers
- CORS configuration
- Rate limiting on all endpoints
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- Password hashing with bcrypt
- JWT token expiration and refresh
- File upload size limits

## Performance Optimizations

- Database connection pooling (max 20 connections)
- Pagination for list endpoints
- Indexed database queries
- Efficient Socket.io configuration
- Graceful shutdown handling

## Testing

```bash
# Run tests (to be implemented)
npm test

# Run tests with coverage
npm run test:coverage
```

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secrets
- [ ] Configure database connection pooling
- [ ] Set up SSL/HTTPS
- [ ] Enable PostgreSQL SSL
- [ ] Configure CORS for production domain
- [ ] Set up monitoring (PM2, New Relic, etc.)
- [ ] Configure logging service
- [ ] Set up database backups
- [ ] Enable rate limiting
- [ ] Review security headers

### Environment Variables for Production

Update `.env` with production values:

```env
NODE_ENV=production
PORT=5000
DB_HOST=your-production-db-host
FRONTEND_URL=https://your-production-domain.com
# ... other production values
```

## Contributing

1. Follow existing code structure
2. Write meaningful commit messages
3. Add tests for new features
4. Update documentation
5. Follow JavaScript best practices

## License

ISC

## Support

For issues and questions, please contact the development team.

---

**Built with excellence for the Analyst Marketplace Platform**
