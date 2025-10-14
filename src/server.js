/**
 * Express Server with Socket.io Integration
 *
 * Main entry point for the Analyst Marketplace Platform backend
 * Initializes Express app, Socket.io, middleware, routes, and database
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const socketIo = require('socket.io');

// Import configuration
const config = require('./config/env');
const { pool } = require('./config/database');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth.routes');
const analystRoutes = require('./routes/analyst.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const postRoutes = require('./routes/post.routes');
const chatRoutes = require('./routes/chat.routes');
const reviewRoutes = require('./routes/review.routes');
const adminRoutes = require('./routes/admin.routes');
const inviteRoutes = require('./routes/invite.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const aiRoutes = require('./routes/ai.routes');
const streamRoutes = require('./routes/stream.routes');
const settingsRoutes = require('./routes/settings.routes');

// Import Socket.io handler
const initializeChatSocket = require('./socket/chatSocket');

// Initialize Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = socketIo(server, {
  cors: {
    origin: config.frontend.url,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000 // 25 seconds
});

// Make io accessible to routes
app.set('io', io);

// ============================================
// MIDDLEWARE
// ============================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.isProduction ? undefined : false,
  crossOriginEmbedderPolicy: config.isProduction ? undefined : false
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      config.frontend.url,
      'http://localhost:5173',
      'http://localhost:3000',
      'https://call-street-frontend.vercel.app'
    ].filter(Boolean); // Remove any undefined values

    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // CRITICAL: Allows cookies to be sent with requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'], // Allow frontend to read Set-Cookie header
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser middleware
app.use(cookieParser());

// HTTP request logger
if (config.logging.enableRequestLogging) {
  app.use(morgan(config.isDevelopment ? 'dev' : 'combined'));
}

// Global rate limiter (safety net)
app.use('/api/', globalLimiter);

// ============================================
// API ROUTES
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: config.env,
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/analysts', analystRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/settings', settingsRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Analyst Marketplace Platform API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      analysts: '/api/analysts',
      subscriptions: '/api/subscriptions',
      posts: '/api/posts',
      chat: '/api/chat',
      reviews: '/api/reviews',
      admin: '/api/admin',
      invites: '/api/invites',
      analytics: '/api/analytics',
      ai: '/api/ai',
      stream: '/api/stream',
      settings: '/api/settings'
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ============================================
// SOCKET.IO INITIALIZATION
// ============================================

// Initialize Socket.io chat server
initializeChatSocket(io);

// ============================================
// SERVER STARTUP
// ============================================

// Start server
const PORT = config.port || 8080;

server.listen(PORT, () => {
  console.log('================================================');
  console.log('  ANALYST MARKETPLACE PLATFORM - BACKEND API');
  console.log('================================================');
  console.log(`Server running on port: ${PORT}`);
  console.log(`Environment: ${config.env}`);
  console.log(`Frontend URL: ${config.frontend.url}`);
  console.log(`Socket.io enabled: Yes`);
  console.log(`Database connected: Yes`);
  console.log('================================================');
  console.log(`Server URL: http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('================================================');

  if (config.isDevelopment) {
    console.log('\nDevelopment Mode Features:');
    console.log('- Request logging enabled');
    console.log('- Detailed error messages');
    console.log('- CORS enabled for frontend');
    console.log('================================================\n');
  }
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Close HTTP server
  server.close(async () => {
    console.log('HTTP server closed');

    // Close Socket.io connections
    io.close(() => {
      console.log('Socket.io connections closed');
    });

    // Close database pool
    try {
      await pool.end();
      console.log('Database connections closed');
    } catch (error) {
      console.error('Error closing database:', error);
    }

    console.log('Graceful shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Export for testing
module.exports = { app, server, io };
