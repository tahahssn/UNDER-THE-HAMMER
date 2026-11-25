#!/bin/bash
# Phase H: Prisma Generation Helper
# Run this locally after pulling Phase H changes to regenerate the Prisma client

set -e

echo "🔄 Phase H: Regenerating Prisma Client"
echo "========================================"

cd "$(dirname "$0")/.."

echo "1. Building database schema..."
npm run db:validate

echo ""
echo "2. Generating Prisma client..."
cd packages/database
pnpm prisma generate

echo ""
echo "3. Validating TypeScript build..."
cd ../..
npm run build -- --filter=@uth/api

echo ""
echo "✅ Prisma generation complete!"
echo "   The API is now ready to build and test."
