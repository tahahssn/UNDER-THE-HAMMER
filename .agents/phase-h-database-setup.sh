#!/bin/bash
# Phase H: Automated Database Migration and Prisma Client Generation
# This script handles all Prisma setup steps for Phase H

set -e

echo "==================================================================="
echo "Phase H: Database Migration and Prisma Client Generation"
echo "==================================================================="

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found. Create it first with DATABASE_URL and DIRECT_URL."
  exit 1
fi

# Load environment
source .env.local

# Check database connection
echo ""
echo "1. Checking database connection..."
if ! psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
  echo "ERROR: Cannot connect to PostgreSQL at $DATABASE_URL"
  echo "Make sure PostgreSQL is running and credentials are correct."
  exit 1
fi
echo "✓ Database connection OK"

# Build schema
echo ""
echo "2. Building Prisma schema from modular files..."
npm run build:schema
if [ -f packages/database/prisma/schema.prisma ]; then
  echo "✓ Schema built successfully"
else
  echo "ERROR: Schema build failed"
  exit 1
fi

# Validate schema
echo ""
echo "3. Validating Prisma schema..."
npx prisma validate --schema packages/database/prisma/schema.prisma
echo "✓ Schema validation passed"

# Generate migration
echo ""
echo "4. Generating database migration..."
npx prisma migrate dev \
  --schema packages/database/prisma/schema.prisma \
  --name "phase-h-squad-validation-and-violations" \
  --skip-generate

if [ $? -eq 0 ]; then
  echo "✓ Migration applied successfully"
else
  echo "WARNING: Migration may have failed or already applied. Continuing..."
fi

# Regenerate Prisma client
echo ""
echo "5. Regenerating Prisma client types..."
npx prisma generate --schema packages/database/prisma/schema.prisma
echo "✓ Prisma client generated"

# TypeScript validation
echo ""
echo "6. Validating TypeScript build..."
npm run typecheck
echo "✓ TypeScript validation passed"

echo ""
echo "==================================================================="
echo "✓ Phase H database setup complete!"
echo "==================================================================="
echo ""
echo "Next steps:"
echo "  1. Run full build: npm run build"
echo "  2. Run tests: npm run test"
echo "  3. Review changes: git status"
echo "  4. Commit and merge"
echo ""
