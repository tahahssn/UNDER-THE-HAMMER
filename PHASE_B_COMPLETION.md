# Phase B Completion — Step-by-Step

**Goal:** Get the backend foundation building and validating.

## Prerequisites

- Node 20+ ✓
- npm or pnpm ✓
- Docker (for PostgreSQL, optional for now)
- Neon database credentials (optional, can use Docker)

## Step 1: Install Dependencies

```bash
# Clean install
npm install

# If npm hangs or times out, try with explicit timeout:
npm install --fetch-timeout=120000

# Or if using pnpm:
pnpm install
```

**Expected output:** `up to date` or list of installed packages

## Step 2: Verify Schema Builds

```bash
npm run build:schema
```

**Expected output:**
```
✓ Schema built: D:\UNDER-THE-HAMMER\packages\database\prisma\schema.prisma
```

Check the generated file:
```bash
head -50 packages/database/prisma/schema.prisma
```

Should show the generator, datasource, and identity schema.

## Step 3: TypeCheck the Source

```bash
npm run typecheck
```

**Expected output:** No errors, completed in ~5 seconds

If errors occur, they will be TypeScript compilation issues in `apps/api/src/`.

## Step 4: Set Up Database Connection (Option A: Docker)

```bash
cd infrastructure/docker
docker-compose up -d
```

This starts PostgreSQL on `localhost:5432`.

Create `.env.local` in the project root:
```bash
DATABASE_URL=postgresql://uth:uth_local_only@localhost:5432/uth?schema=public
DIRECT_URL=postgresql://uth:uth_local_only@localhost:5432/uth?schema=public
```

## Step 4: Set Up Database Connection (Option B: Neon)

Get your Neon pooled connection string and non-pooled URL:

Create `.env.local` in the project root:
```bash
DATABASE_URL=postgresql://user:password@pooler.neon.tech/database?sslmode=require
DIRECT_URL=postgresql://user:password@neon.tech/database?sslmode=require
```

## Step 5: Validate Prisma Schema

```bash
npm run db:validate
```

**Expected output:**
```
✓ Prisma schema validated.
```

If you get connection errors, the DATABASE_URL is incorrect or the database isn't running.

## Step 6: Create Initial Migration

```bash
npm run db:migrate
```

This creates `packages/database/prisma/migrations/001_init/migration.sql` with the schema.

**Expected output:**
```
Your database has been successfully migrated.
```

## Step 7: Build the API

```bash
npm run build
```

**Expected output:**
```
$ turbo run build
 ▲ ✓ [1/2] packages/database:build (1.2s)
 ▲ ✓ [2/2] apps/api:build (3.4s)
```

This compiles TypeScript and generates Prisma client.

## Step 8: Verify Artifacts

Check that build outputs exist:
```bash
ls apps/api/dist/main.js
ls packages/database/dist/index.js
```

## Step 9 (Optional): Run Tests

```bash
npm run test
```

Currently no tests exist. This will show test file count is 0.

## Step 10: Check the Repository

After all steps, the structure should look like:

```
under-the-hammer/
├── node_modules/ (installed)
├── apps/
│   └── api/
│       ├── dist/
│       │   ├── main.js
│       │   ├── app.module.js
│       │   └── ...
├── packages/
│   ├── database/
│   │   ├── dist/
│   │   │   └── index.js
│   │   └── prisma/
│   │       ├── schema.prisma (generated)
│   │       └── migrations/
│   │           └── 001_init/
│   │               └── migration.sql
├── pnpm-lock.yaml or package-lock.json (generated)
└── .env.local (created by you)
```

## Troubleshooting

### npm install hangs
- Try: `npm install --fetch-timeout=180000`
- Or use Yarn: `yarn install`
- Or manually configure pnpm registry

### TypeScript errors during build
- Check `apps/api/src/` for syntax errors
- Run `npm run typecheck` first to debug

### Prisma migration fails
- Verify DATABASE_URL is correct
- Check that PostgreSQL/Neon is reachable
- Run `psql $DATABASE_URL` to test connection

### "Cannot find module '@prisma/client'"
- Run `npm run build:schema` and try again
- Delete `node_modules` and reinstall

## Gate B Checkpoint

Once all steps complete without errors, **Phase B is done**. Update `docs/IMPLEMENTATION_STATUS.md`:

```markdown
| B | Build verification | complete | Builds with no errors. Migrations created. |
```

Then proceed to Phase C (Cognito authentication).
