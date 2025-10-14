/**
 * Migration Runner Script
 * Runs all SQL migration files in order
 *
 * Usage:
 *   node scripts/run_migrations.js
 *
 * Environment Variables Required:
 *   DATABASE_URL or individual DB_* variables
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Get all migration files in order
const getMigrationFiles = () => {
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort alphabetically (001_, 002_, etc.)

  return files.map(file => ({
    name: file,
    path: path.join(migrationsDir, file)
  }));
};

// Run a single migration file
const runMigration = async (migration) => {
  const sql = fs.readFileSync(migration.path, 'utf8');

  console.log(`\n📄 Running migration: ${migration.name}`);

  try {
    await pool.query(sql);
    console.log(`✅ Success: ${migration.name}`);
    return { success: true, name: migration.name };
  } catch (error) {
    console.error(`❌ Failed: ${migration.name}`);
    console.error(`   Error: ${error.message}`);
    return { success: false, name: migration.name, error: error.message };
  }
};

// Main execution
const runAllMigrations = async () => {
  console.log('🚀 Starting database migrations...\n');
  console.log(`Database: ${pool.options.database || 'Unknown'}`);
  console.log(`Host: ${pool.options.host || 'Unknown'}`);

  try {
    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    console.log(`✅ Connected to PostgreSQL: ${result.rows[0].version.split(' ')[1]}\n`);
    client.release();

    // Get all migrations
    const migrations = getMigrationFiles();
    console.log(`Found ${migrations.length} migration files\n`);

    // Run each migration
    const results = [];
    for (const migration of migrations) {
      const result = await runMigration(migration);
      results.push(result);

      // Stop on first error
      if (!result.success) {
        console.error('\n❌ Migration failed. Stopping...');
        break;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${results.length}`);

    if (failed === 0) {
      console.log('\n✅ All migrations completed successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ Some migrations failed. Please check errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Run if called directly
if (require.main === module) {
  runAllMigrations();
}

module.exports = { runAllMigrations };
