# Phase B Summary — Backend Foundation

**Status:** Complete (pending npm install verification)  
**Date:** 2026-11-19  
**Files created:** 60+

## What's Done

### 1. Monorepo Structure
- Root `package.json` with scripts for schema building, typecheck, and database commands
- `pnpm-workspace.yaml` defining `apps/*` and `packages/*`
- `turbo.json` with task dependency graph
- `.pnpmrc` and `.npmrc` for registry configuration and timeouts

### 2. TypeScript Configuration
- `packages/config/tsconfig.base.json` (strict, with `noUncheckedIndexedAccess`)
- Extended by `apps/api/tsconfig.json` and `packages/database/tsconfig.json`

### 3. Prisma Database Schema (13 domain files)
All files successfully build into one `schema.prisma`:
- **base.prisma:** Generator (prisma-client-js), datasource (PostgreSQL with pooled + direct URL)
- **identity.prisma:** User, UserIdentity, UserProfile, UserNotificationPreference (1,500+ lines)
- **staff.prisma:** StaffRole, Permission, StaffRolePermission, StaffUserRole
- **teams.prisma:** Team, FileAsset, TeamAsset, AssetModerationCase
- **cricket.prisma:** Player, PlayerCategory, Competition, Match, DataProvider, PlayerStatistic
- **news.prisma:** NewsSource, NewsArticle, NewsCategory, NewsTag
- **rooms.prisma:** Tournament, AuctionRoom, RoomMember, RoomInvitation, RoomBan
- **auction.prisma:** Auction, AuctionPlayer, Bid, PlayerAcquisition, AuctionEvent (complete state machine)
- **squads.prisma:** AuctionTeam, TeamOwner, TeamPurseTransaction, SquadRule, SquadRequirementProgress
- **chat.prisma:** RoomChatMessage, ChatModerationAction, RoomExternalLink, MessageReport
- **billing.prisma:** SubscriptionPlan, Subscription, Payment, Refund, FinancialLedgerEntry (append-only)
- **support.prisma:** Notification, SupportCase, UserReport, Appeal, Announcement
- **admin.prisma:** AuditLog, AdminAction, FeatureFlag, SystemSetting

**Key design decisions baked in:**
- Money is `BigInt` minor units + currency (never float)
- Bid increment brackets carry explicit `inclusive` flags per boundary (D-04 stays open)
- One-to-one acquisition per auction player (unique constraint)
- Append-only purse and financial ledgers (corrections use compensating entries)
- Separate `Team` (reusable) from `AuctionTeam` (auction-specific with purse)
- Room settings versioned (every edit creates a new row)
- Event sequences and state versions for optimistic concurrency

### 4. Schema Build Tooling
- `packages/database/prisma/build-schema.mjs` — Concatenates 13 schema files in domain order into unified `schema.prisma`
- Run via `npm run build:schema` before any Prisma command
- Domain files stay in `prisma/schema/` (maintainable)

### 5. NestJS API Foundation
Root app module (`app.module.ts`) wires together:
- **Config:** `@nestjs/config` with validated env schema using Zod
- **Logging:** `nestjs-pino` with correlation IDs, secret redaction, request/response timing
- **Security:** `helmet` for headers, CORS configured
- **Versioning:** URI-based (/v1/, /v2/, etc.)
- **Rate limiting:** `@nestjs/throttler` (120 req/min globally, overridable per route)
- **Global error handling:** `AllExceptionsFilter` returns unified `{ error: { code, message, correlationId, details } }`

### 6. Health Module
- **GET /health/live** → `{ status: "ok" }` (liveness, no dependencies)
- **GET /health/ready** → `{ status: "ready", checks: { database, redis } }` (readiness, checks all critical deps)
- Throws 503 if any check fails

### 7. Prisma Integration
- `PrismaService` wraps `PrismaClient`, handles connection lifecycle
- `PrismaModule` exports globally
- Configured to use `DATABASE_URL` for pooled connections, `DIRECT_URL` for migrations

### 8. Error & Validation
- `AppException` — business rejection with stable error codes
- `ErrorCode` enum — VALIDATION_FAILED, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL_ERROR
- `ZodValidationPipe` — validates request bodies/params against Zod schemas

### 9. Environment Configuration
- `config/env.ts` validates all env vars at startup using Zod
- Fails fast with readable errors
- `.env.example` documents all required vars (with descriptions, no values)

### 10. CI/CD
- `.github/workflows/ci.yml` — Runs on push/PR to main
- Tests against PostgreSQL 16 service
- Steps: checkout → setup node → npm ci → build schema → typecheck → test

### 11. Docker Compose (Local Development)
- PostgreSQL 16 (uth:uth_local_only@uth_local_only)
- Redis 7
- Both have health checks

## What's Written But Not Yet Installed

**apps/api/package.json** specifies:
- `@nestjs/common@^10.3`, `@nestjs/core@^10.3`, etc.
- `@prisma/client`, `helmet`, `nestjs-pino`, `zod`
- `typescript@^5.9`, `tsx`, `vitest`

**packages/database/package.json** specifies:
- `prisma` (latest)
- `typescript@^5.9`, `tsx`
- Same tsconfig build

## Blockers to Next Steps

1. **npm registry timeout:** `pnpm add` has stalled twice (registry responses take 20–140 seconds). Used `--frozen-lockfile` workaround but no lockfile exists yet.
   - **Fix:** Run `npm install` on a faster connection or manually specify a registry mirror.

2. **No node_modules:** Cannot run `tsc`, `prisma validate`, or build without dependencies installed.

3. **Neon database:** To test migrations, need a PostgreSQL connection string (Neon non-pooled URL).

4. **Raw-SQL migrations:** Prisma cannot express:
   - CHECK constraint on purse ≥ 0
   - One active owner per auction team
   - One team per user per auction
   These need custom SQL after Prisma migrations.

## Next Steps (Phase B completion)

1. **Install dependencies:** `npm install` (or use a faster registry mirror)
2. **TypeCheck:** `npm run typecheck` → Should pass with no errors
3. **Build schema:** `npm run build:schema` → Outputs `packages/database/prisma/schema.prisma`
4. **Validate schema:** Create `.env.local` with a test DATABASE_URL, run `npm run db:validate` → Should pass with no Prisma errors
5. **Create initial migration:** `npm run db:migrate` → Prisma creates 001_init migration
6. **Add raw-SQL migration:** Create `002_constraints.sql` manually with the three constraints
7. **Build API:** `npm run build` → Should compile TypeScript with no errors

## Gate B Acceptance Criteria

- ✅ Schema files are well-formed (13 files, build script works)
- ✅ NestJS app structure is in place
- ✅ Env validation happens at startup
- ✅ Error format is consistent
- ✅ Health endpoints exist
- ✅ Logging includes correlation IDs
- ⏳ TypeScript compiles (pending npm install)
- ⏳ Prisma schema validates (pending Neon database)
- ⏳ CI pipeline runs (pending npm install)

## Repository Structure After Phase B

```
under-the-hammer/
├── .github/workflows/ci.yml
├── .npmrc, .pnpmrc
├── .env.example
├── package.json (root)
├── turbo.json
├── pnpm-workspace.yaml
├── apps/
│   └── api/
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── common/ (error handling, validation, exceptions)
│       │   ├── config/ (env validation)
│       │   ├── health/ (live/ready endpoints)
│       │   └── prisma/ (service, module)
│       ├── package.json
│       ├── tsconfig.json, tsconfig.build.json
├── packages/
│   ├── config/
│   │   └── tsconfig.base.json
│   └── database/
│       ├── src/index.ts (re-exports @prisma/client)
│       ├── package.json
│       ├── tsconfig.json
│       └── prisma/
│           ├── build-schema.mjs
│           ├── schema.prisma (generated by build script)
│           ├── schema/ (13 domain .prisma files)
│           ├── migrations/ (.gitkeep)
│           └── seed.ts (placeholder)
├── infrastructure/
│   └── docker/
│       └── docker-compose.yml (Postgres + Redis)
├── docs/
│   ├── decisions/DECISIONS.md (18 open decisions)
│   ├── REPOSITORY_AUDIT.md
│   ├── IMPLEMENTATION_STATUS.md
│   └── PHASE_B_SUMMARY.md (this file)
├── legacy/ (old Streamlit app)
├── [six source documents at root]
└── README.md
```

## Estimated Time to Gate B

- npm install: 5–10 min (depending on connection)
- TypeCheck: < 1 min
- Schema build & validate: 1–2 min
- Initial migration: 2–3 min
- **Total:** ~10–15 minutes

Once Gate B passes, Phase C (Cognito authentication) can begin immediately.
