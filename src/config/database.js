/**
 * PostgreSQL Database Configuration
 *
 * Implements connection pooling for optimal performance and resource management.
 * Pool size: 20 connections (suitable for 10K+ concurrent users)
 *
 * Features:
 * - Connection pooling with automatic reconnection
 * - Error handling and logging
 * - Health check on initialization
 * - Graceful shutdown support
 */

const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // Pool configuration
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection cannot be established

  // Additional settings for production
  ...(process.env.NODE_ENV === 'production' && {
    ssl: {
      rejectUnauthorized: false // For managed databases like AWS RDS
    }
  })
});

// Test database connection on startup
pool.query('SELECT NOW() as current_time, version() as pg_version', (err, res) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    console.error('Please check your database credentials in .env file');
    process.exit(1);
  }

  console.log('Database connected successfully');
  console.log(`PostgreSQL Version: ${res.rows[0].pg_version.split(' ')[1]}`);
  console.log(`Connection Time: ${res.rows[0].current_time}`);
});

// Handle unexpected database errors
pool.on('error', (err, client) => {
  console.error('Unexpected database error on idle client', err);
  // Don't exit - let the pool handle reconnection
});

// Handle pool connection events (for debugging)
pool.on('connect', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('New database client connected');
  }
});

pool.on('acquire', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Client acquired from pool');
  }
});

pool.on('remove', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Client removed from pool');
  }
});

/**
 * Helper function to execute parameterized queries safely
 * Prevents SQL injection by using prepared statements
 *
 * @param {string} text - SQL query with $1, $2, etc. placeholders
 * @param {Array} params - Array of parameter values
 * @returns {Promise<Object>} - Query result
 */
const query = async (text, params) => {
  const start = Date.now();

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 1 second)
    if (duration > 1000) {
      console.warn('Slow query detected:', {
        text,
        duration: `${duration}ms`,
        rows: res.rowCount
      });
    }

    return res;
  } catch (error) {
    console.error('Database query error:', {
      text,
      error: error.message
    });
    throw error;
  }
};

/**
 * Helper function to get a client from the pool for transactions
 * Use this when you need to run multiple queries in a transaction
 *
 * @returns {Promise<Object>} - Database client
 */
const getClient = async () => {
  try {
    const client = await pool.connect();
    return client;
  } catch (error) {
    console.error('Error acquiring database client:', error.message);
    throw error;
  }
};

/**
 * Graceful shutdown - close all database connections
 */
const closePool = async () => {
  try {
    await pool.end();
    console.log('Database pool closed successfully');
  } catch (error) {
    console.error('Error closing database pool:', error.message);
    throw error;
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

module.exports = {
  pool,
  query,
  getClient,
  closePool
};
