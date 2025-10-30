/**
 * Run Migration on Production Database
 *
 * This script runs the trader_profiles migration on the production database
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Production database configuration
const productionConfig = {
  host: 'dpg-d3n0qqbe5dus73cc1elg-a.oregon-postgres.render.com', // Full hostname with region
  port: 5432,
  database: 'analyst_platform',
  user: 'analyst_admin',
  password: 'ZBe5z0KPV7taAbRCcpeRreENVIqSGhBV',
  ssl: {
    rejectUnauthorized: false // Required for Render.com databases
  }
};

async function runMigration() {
  console.log('\n========================================');
  console.log('PRODUCTION DATABASE MIGRATION');
  console.log('========================================\n');

  console.log('Database Configuration:');
  console.log(`Host: ${productionConfig.host}`);
  console.log(`Port: ${productionConfig.port}`);
  console.log(`Database: ${productionConfig.database}`);
  console.log(`User: ${productionConfig.user}`);
  console.log('\n');

  // Create connection pool
  const pool = new Pool(productionConfig);

  try {
    // Test connection
    console.log('Testing database connection...');
    const testResult = await pool.query('SELECT NOW(), version()');
    console.log('✅ Connected to database');
    console.log(`   Server time: ${testResult.rows[0].now}`);
    console.log(`   PostgreSQL version: ${testResult.rows[0].version.split(' ')[0]} ${testResult.rows[0].version.split(' ')[1]}`);
    console.log('\n');

    // Check if table already exists
    console.log('Checking if trader_profiles table exists...');
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'trader_profiles'
      );
    `);

    if (checkTable.rows[0].exists) {
      console.log('⚠️  WARNING: trader_profiles table already exists!');
      console.log('   Skipping migration to avoid errors.');
      console.log('\n');

      // Show table info
      const tableInfo = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'trader_profiles'
        ORDER BY ordinal_position;
      `);

      console.log('Current table structure:');
      tableInfo.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
      });

      await pool.end();
      return;
    }

    console.log('✅ Table does not exist, proceeding with migration...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/029_create_trader_profiles_table.sql');
    console.log(`Reading migration file: ${migrationPath}`);

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Migration file loaded\n');

    // Execute migration
    console.log('Executing migration...');
    await pool.query(sql);
    console.log('✅ Migration executed successfully\n');

    // Verify table creation
    console.log('Verifying table creation...');
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'trader_profiles'
      ORDER BY ordinal_position;
    `);

    console.log('✅ Table created with columns:');
    verifyResult.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });
    console.log('\n');

    // Check indexes
    console.log('Verifying indexes...');
    const indexResult = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'trader_profiles'
      ORDER BY indexname;
    `);

    console.log('✅ Indexes created:');
    indexResult.rows.forEach(idx => {
      console.log(`   - ${idx.indexname}`);
    });
    console.log('\n');

    console.log('========================================');
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ MIGRATION FAILED');
    console.error('========================================\n');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    throw error;
  } finally {
    // Close connection
    await pool.end();
    console.log('Database connection closed.\n');
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('✅ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration process failed:', error.message);
    process.exit(1);
  });
