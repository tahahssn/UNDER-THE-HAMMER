# Phase H: Migration Guide for SquadValidation and SquadViolation Models

## Summary

The Phase H schema updates have been committed. The database schema includes two new models:
- `SquadValidation`: Records whether a team's squad was valid at settlement
- `SquadViolation`: Audit trail of individual rule violations (append-only)

## Prerequisites

Before running migrations:
- PostgreSQL running on `localhost:5432`
- Database `uth` exists with user `uth`
- `.env.local` file contains `DATABASE_URL` and `DIRECT_URL`
- `npx prisma` available (installed via `npm install`)

## Steps to Unblock

### Step 1: Run Schema Generation (Already Done)
The schema has been built and committed:
```bash
npm run build:schema
```
This generates `packages/database/prisma/schema.prisma` from modular .prisma files.

### Step 2: Generate and Apply Migration
Run the Prisma migration (requires database connection):
```bash
npx prisma migrate dev --schema packages/database/prisma/schema.prisma \
  --name "phase-h-squad-validation-and-violations"
```

This will:
1. Compare current schema with database
2. Generate SQL migration in `packages/database/prisma/migrations/`
3. Apply the migration to the database
4. Regenerate the Prisma client

### Step 3: Verify Migration
```bash
npx prisma db push --schema packages/database/prisma/schema.prisma
```

### Step 4: Generate Prisma Client
```bash
npx prisma generate --schema packages/database/prisma/schema.prisma
```

## Expected Migration

The migration will create two new tables and add foreign key relations:

```sql
-- SquadValidation table
CREATE TABLE public."SquadValidation" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "auctionId" UUID NOT NULL REFERENCES public."Auction"(id) ON DELETE CASCADE,
  "auctionTeamId" UUID NOT NULL REFERENCES public."AuctionTeam"(id) ON DELETE CASCADE,
  valid BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SquadValidation_auctionTeamId_createdAt_idx" 
  ON public."SquadValidation"("auctionTeamId", "createdAt");
CREATE INDEX "SquadValidation_auctionId_createdAt_idx"
  ON public."SquadValidation"("auctionId", "createdAt");

-- SquadViolation table
CREATE TABLE public."SquadViolation" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "squadValidationId" UUID NOT NULL REFERENCES public."SquadValidation"(id) ON DELETE CASCADE,
  "auctionTeamId" UUID NOT NULL REFERENCES public."AuctionTeam"(id) ON DELETE CASCADE,
  "squadRuleId" UUID NOT NULL REFERENCES public."SquadRule"(id) ON DELETE CASCADE,
  "violationType" VARCHAR NOT NULL,
  "currentCount" INTEGER NOT NULL,
  "requiredMinCount" INTEGER,
  "requiredMaxCount" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SquadViolation_auctionTeamId_createdAt_idx"
  ON public."SquadViolation"("auctionTeamId", "createdAt");
CREATE INDEX "SquadViolation_squadValidationId_idx"
  ON public."SquadViolation"("squadValidationId");

-- Add relations to existing tables
ALTER TABLE public."AuctionTeam" ADD COLUMN "validations" (implicit via FK)
ALTER TABLE public."AuctionTeam" ADD COLUMN "violations" (implicit via FK)
ALTER TABLE public."SquadRule" ADD COLUMN "violations" (implicit via FK)
ALTER TABLE public."Auction" ADD COLUMN "squadValidations" (implicit via FK)
```

## Troubleshooting

### "DIRECT_URL not found"
Make sure `.env.local` includes:
```
DATABASE_URL=postgresql://uth:uth_local_only@localhost:5432/uth?schema=public
DIRECT_URL=postgresql://uth:uth_local_only@localhost:5432/uth
```

### "No database connection"
Ensure PostgreSQL is running:
```bash
docker-compose up -d  # if using docker-compose
# or verify local PostgreSQL service is running
```

### Migration already applied
If you've already run this migration, Prisma will skip it:
```bash
npx prisma migrate status
```

## Automated Script

An automated script is available to handle all steps:
```bash
bash .agents/phase-h-prisma-generation.sh
```

This script:
1. Builds schema
2. Generates and applies migration
3. Regenerates Prisma client
4. Runs `npm run typecheck` to verify build

## Rollback

If you need to rollback the migration:
```bash
npx prisma migrate resolve --rolled-back phase-h-squad-validation-and-violations
```

Then manually remove the migration folder (if needed) and re-run the generation.

## Next Steps

After migration is applied:
1. Run full build: `npm run build`
2. Run tests: `npm run test`
3. Merge to main
4. Deploy to staging/production via CI/CD
