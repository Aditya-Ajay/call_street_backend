/**
 * Authentication & Authorization Middleware
 *
 * Handles JWT token verification and role-based access control
 * Protects routes requiring authentication
 */

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { AppError, asyncHandler } = require('./errorHandler');

/**
 * Verify JWT access token
 * Attaches user information to req.user if valid
 *
 * Usage:
 * router.get('/protected', verifyToken, (req, res) => {
 *   // Access req.user.id, req.user.role, etc.
 * });
 */
const verifyToken = asyncHandler(async (req, res, next) => {
  // Get token from cookie (primary method for web clients)
  let token = req.cookies.accessToken;
  let tokenSource = 'cookie';

  // Fallback: Check Authorization header (for mobile apps or API clients)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
      tokenSource = 'header';
    }
  }

  // No token found in either location
  if (!token) {
    // Log for debugging in development
    if (config.isDevelopment) {
      console.log('[Auth] No token found. Cookies:', Object.keys(req.cookies), 'Headers:', req.headers.authorization ? 'Present' : 'Missing');
    }
    throw new AppError('No authentication token provided', 401);
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Support both 'id' and 'user_id' for backward compatibility
    const userId = decoded.id || decoded.user_id;

    // Log successful authentication in development
    if (config.isDevelopment) {
      console.log(`[Auth] Token verified from ${tokenSource} for user:`, userId);
    }

    // Attach user info to request
    req.user = {
      id: userId,
      email: decoded.email,
      phone: decoded.phone,
      role: decoded.role,
      isVerified: decoded.isVerified || decoded.is_verified
    };

    next();
  } catch (error) {
    // Log auth errors in development
    if (config.isDevelopment) {
      console.log('[Auth] Token verification failed:', error.name, error.message);
    }

    if (error.name === 'TokenExpiredError') {
      throw new AppError('Authentication token has expired', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid authentication token', 401);
    }
    throw new AppError('Authentication failed', 401);
  }
});

/**
 * Verify refresh token
 * Used for token refresh endpoint
 */
const verifyRefreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token is required', 401);
  }

  try {
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

    req.user = {
      id: decoded.id,
      email: decoded.email,
      phone: decoded.phone,
      role: decoded.role
    };

    next();
  } catch (error) {
    throw new AppError('Invalid or expired refresh token', 401);
  }
});

/**
 * Role-based access control middleware
 * Restricts access to specific user roles
 *
 * Usage:
 * router.post('/analyst-only', verifyToken, requireRole('analyst'), handler);
 * router.get('/admin-only', verifyToken, requireRole('admin'), handler);
 */
const requireRole = (...allowedRoles) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        403
      );
    }

    next();
  });
};

/**
 * Require analyst role
 * Shorthand for requireRole('analyst')
 */
const requireAnalyst = requireRole('analyst');

/**
 * Require trader role
 * Shorthand for requireRole('trader')
 */
const requireTrader = requireRole('trader');

/**
 * Require admin role
 * Shorthand for requireRole('admin')
 */
const requireAdmin = requireRole('admin');

/**
 * Allow both analyst and trader roles
 */
const requireUser = requireRole('analyst', 'trader');

/**
 * Check if user is verified (email or phone)
 * Some features require verification
 */
const requireVerified = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (!req.user.isVerified) {
    throw new AppError('Please verify your account to access this feature', 403);
  }

  next();
});

/**
 * Optional authentication
 * Attaches user info if token is present, but doesn't require it
 * Useful for endpoints that show different content for authenticated users
 *
 * Usage:
 * router.get('/public-but-personalized', optionalAuth, handler);
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  // Try to get token from cookie first
  let token = req.cookies.accessToken;

  // Fallback to Authorization header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  // No token found - continue without authentication
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);

    // Support both 'id' and 'user_id' for backward compatibility
    const userId = decoded.id || decoded.user_id;

    req.user = {
      id: userId,
      email: decoded.email,
      phone: decoded.phone,
      role: decoded.role,
      isVerified: decoded.isVerified || decoded.is_verified
    };

    next();
  } catch (error) {
    // Invalid token, but that's okay for optional auth
    next();
  }
});

/**
 * Check if user owns the resource
 * Compares req.user.id with req.params.userId or req.params.id
 *
 * Usage:
 * router.put('/users/:userId/profile', verifyToken, checkOwnership, handler);
 */
const checkOwnership = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  const resourceUserId = req.params.userId || req.params.id;

  // Admins can access any resource
  if (req.user.role === 'admin') {
    return next();
  }

  // Check if user owns the resource
  if (req.user.id !== parseInt(resourceUserId, 10)) {
    throw new AppError('You do not have permission to access this resource', 403);
  }

  next();
});

/**
 * Generate JWT access token
 * Helper function to create tokens
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  });
};

/**
 * Generate JWT refresh token
 * Helper function to create refresh tokens
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn
  });
};

/**
 * Generate token pair (access + refresh)
 * Returns both tokens for login/signup
 */
const generateTokenPair = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isVerified: user.is_email_verified || user.is_phone_verified
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: config.jwt.expiresIn
  };
};

module.exports = {
  verifyToken,
  verifyRefreshToken,
  requireRole,
  requireAnalyst,
  requireTrader,
  requireAdmin,
  requireUser,
  requireVerified,
  optionalAuth,
  checkOwnership,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair
};
