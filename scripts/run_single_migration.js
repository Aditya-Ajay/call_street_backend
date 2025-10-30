/**
 * Run a Single Migration Script
 *
 * Usage: node scripts/run_single_migration.js <migration_file>
 * Example: node scripts/run_single_migration.js 029_create_trader_profiles_table.sql
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

async function runMigration(migrationFile) {
  console.log(`\n========================================`);
  console.log(`Running migration: ${migrationFile}`);
  console.log(`========================================\n`);

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations', migrationFile);

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await pool.query(sql);

    console.log(`✅ Migration ${migrationFile} completed successfully\n`);
  } catch (error) {
    console.error(`❌ Migration ${migrationFile} failed:`, error.message);
    throw error;
  }
}

// Get migration file from command line args
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node scripts/run_single_migration.js <migration_file>');
  console.error('Example: node scripts/run_single_migration.js 029_create_trader_profiles_table.sql');
  process.exit(1);
}

// Run migration
runMigration(migrationFile)
  .then(() => {
    console.log('✅ All migrations completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
