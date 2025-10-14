/**
 * Global Error Handler Middleware
 *
 * Centralized error handling for all Express routes
 * Handles different types of errors (validation, auth, database, etc.)
 * Returns consistent error response format
 */

const config = require('../config/env');

/**
 * Custom Error Class
 * Use this to throw errors with custom status codes and messages
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error response formatter
 * Creates consistent error response structure
 */
const formatErrorResponse = (error, isDevelopment) => {
  const response = {
    success: false,
    message: error.message || 'An unexpected error occurred',
    statusCode: error.statusCode || 500
  };

  // Include stack trace in development mode
  if (isDevelopment) {
    response.stack = error.stack;
    response.error = error;
  }

  return response;
};

/**
 * Handle PostgreSQL database errors
 */
const handleDatabaseError = (error) => {
  // Unique constraint violation
  if (error.code === '23505') {
    const field = error.detail?.match(/Key \(([^)]+)\)/)?.[1] || 'field';
    return new AppError(`${field} already exists`, 409);
  }

  // Foreign key constraint violation
  if (error.code === '23503') {
    return new AppError('Referenced resource not found', 400);
  }

  // Not null constraint violation
  if (error.code === '23502') {
    const column = error.column || 'required field';
    return new AppError(`${column} is required`, 400);
  }

  // Invalid text representation
  if (error.code === '22P02') {
    return new AppError('Invalid data format', 400);
  }

  // Default database error
  return new AppError('Database operation failed', 500);
};

/**
 * Handle JWT authentication errors
 */
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new AppError('Invalid authentication token', 401);
  }

  if (error.name === 'TokenExpiredError') {
    return new AppError('Authentication token has expired', 401);
  }

  return new AppError('Authentication failed', 401);
};

/**
 * Handle validation errors (express-validator)
 */
const handleValidationError = (errors) => {
  const messages = errors.map(err => err.msg).join(', ');
  return new AppError(`Validation error: ${messages}`, 400);
};

/**
 * Handle Multer file upload errors
 */
const handleMulterError = (error) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File size exceeds the maximum limit', 400);
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('Unexpected field in file upload', 400);
  }

  return new AppError('File upload failed', 400);
};

/**
 * Main error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode;

  // Log error details
  console.error('Error occurred:', {
    message: err.message,
    statusCode: err.statusCode,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    ...(config.isDevelopment && { stack: err.stack })
  });

  // Handle different types of errors
  if (err.code && err.code.startsWith('23')) {
    error = handleDatabaseError(err);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = handleJWTError(err);
  } else if (err.name === 'MulterError') {
    error = handleMulterError(err);
  } else if (err.name === 'ValidationError' && err.errors) {
    error = handleValidationError(err.errors);
  }

  // Ensure error has status code
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  // Send error response
  res.status(statusCode).json(formatErrorResponse(
    { ...error, message, statusCode },
    config.isDevelopment
  ));
};

/**
 * Handle 404 Not Found errors
 * Place this middleware after all routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Cannot ${req.method} ${req.originalUrl}`,
    404
  );
  next(error);
};

/**
 * Async error handler wrapper
 * Wraps async route handlers to catch errors automatically
 *
 * Usage:
 * router.get('/route', asyncHandler(async (req, res) => {
 *   // Your async code here
 * }));
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log to external service in production (e.g., Sentry)
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Log to external service in production (e.g., Sentry)
  process.exit(1); // Exit process to avoid undefined state
});

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError
};
