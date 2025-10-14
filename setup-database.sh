#!/bin/bash

# Database Setup Script for Analyst Marketplace Platform
# This script creates the database and runs all migrations in order

set -e  # Exit on error

echo "🚀 Setting up Analyst Marketplace Database..."
echo "=============================================="

# Database credentials
DB_USER="postgres"
DB_NAME="analyst_platform"

# Check if database exists
if psql -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "⚠️  Database '$DB_NAME' already exists"
    read -p "Do you want to drop and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Dropping existing database..."
        dropdb -U $DB_USER $DB_NAME
    else
        echo "✅ Using existing database"
    fi
fi

# Create database if it doesn't exist
if ! psql -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "📦 Creating database '$DB_NAME'..."
    createdb -U $DB_USER $DB_NAME
    echo "✅ Database created successfully"
fi

# Run migrations in order
echo ""
echo "🔄 Running migrations..."
echo "=============================================="

MIGRATION_DIR="./migrations"

# Get all SQL files and sort them numerically
for migration in $(ls $MIGRATION_DIR/*.sql | sort -V); do
    filename=$(basename "$migration")
    echo "  ▶ Running: $filename"
    psql -U $DB_USER -d $DB_NAME -f "$migration" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "    ✅ Success"
    else
        echo "    ❌ Failed"
        exit 1
    fi
done

echo ""
echo "=============================================="
echo "✅ Database setup complete!"
echo ""
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Host: localhost"
echo "Port: 5432"
echo ""
echo "You can now start the backend server with:"
echo "  npm run dev"
echo "=============================================="
