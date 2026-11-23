# Phase E: Player Database, Teams, and S3 File Pipeline — Implementation Plan

**Version:** 1.0  
**Date:** 2026-11-23  
**Status:** Ready for implementation

---

## Executive Summary

Phase E implements the core entities required for the auction platform: a comprehensive player database with multi-source support, user-created teams with customizable identity, and a secure S3-backed file pipeline for team logos with server-side validation and moderation.

**Key deliverables:**
- Backend: Players, PlayerAlias, PlayerSourceIdentifier, PlayerStatistic, PlayerCategory, DataProvider, DataSyncRun modules in NestJS
- Backend: Teams, TeamMember, FileAsset, AssetModerationCase modules in NestJS
- Database: Prisma schema (player, team, file asset entities) with indexes and constraints
- Frontend: Player directory and player detail pages with search and filtering
- Frontend: Team creation and management pages with logo upload
- S3 pipeline: Upload intent, presigned URL generation, file signature validation, dimension checks, moderation workflow
- Tests: Unit tests for domain logic, integration tests for database and S3, E2E for user flows

**Scope:** Establishes the data foundation for auctions (players and teams) and the asset pipeline. Does not implement auction rooms, real-time events, or bidding; those are Phase 7+ concerns.

---

## Architecture and Constraints

### Backend Authority
- Server validates all file uploads (MIME, signature, dimensions, size).
- Server generates and verifies presigned S3 URLs; no AWS credentials in browser.
- Server confirms file existence and metadata before marking assets ready.
- Team ownership and modification is server-side authorization.

### Database Constraints
- Normalized relational schema with foreign keys and unique constraints.
- Player identities are stable internal UUIDs; provider identifiers are separate.
- Teams are reusable across auctions; auction-specific team state lives in `AuctionTeam` (Phase 6+).
- File assets are immutable once uploaded; logo replacement creates a new asset, not an overwrite.
- Asset moderation cases form an audit trail of complaints and resolutions.

### TypeScript
- Strict mode throughout.
- Explicit DTOs and shared contracts between backend and frontend.
- No `any` types without explanation.

### No Hardcoded Data
- Player categories are configurable, not an enum.
- No hardcoded official PSL teams; all teams are user-created or organizer-defined.
- Data providers are configurable records; allow for future international coverage.

---

## Database Schema Additions (Prisma)

### Player and Cricket Data Entities

**Player**
- `id` (UUID, PK)
- `fullName`, `displayName` (String)
- `dateOfBirth` (Date, nullable)
- `countryCode` (Char(2), nullable, FK Country)
- `role` (PlayerRoleType enum: BATTER, BOWLER, ALL_ROUNDER, WICKETKEEPER)
- `battingStyle` (BattingStyle enum: LEFT_HAND, RIGHT_HAND, nullable)
- `bowlingStyle` (String, nullable)
- `categoryId` (UUID, nullable, FK PlayerCategory)
- `isActive` (Boolean, default true)
- `createdAt`, `updatedAt` (Timestamp)
- Indexes: displayName, countryCode, role
- Relations: PlayerAlias[], PlayerSourceIdentifier[], PlayerStatistic[], PlayerTeamHistory[], AuctionPlayer[]

**PlayerAlias**
- `id` (UUID, PK)
- `playerId` (UUID, FK Player cascade)
- `alias` (String)
- Unique constraint: (playerId, alias)
- Index: alias

**PlayerCategory**
- `id` (UUID, PK)
- `key` (String, unique) — e.g., MARQUEE, PLATINUM, GOLD, EMERGING
- `name` (String)
- `sortOrder` (Int, default 0)
- Relations: Player[], AuctionCategoryPrice[], SquadRule[]

**Country**
- `code` (Char(2), PK) — ISO 3166-1 alpha-2
- `name` (String)
- Relations: Player[]

**DataProvider**
- `id` (UUID, PK)
- `key` (String, unique) — e.g., ICC_API, CRICKETAPI, MANUAL_ENTRY
- `name` (String)
- `licenseNotes` (String, nullable) — caching/attribution requirements
- `attributionText` (String, nullable)
- `enabled` (Boolean, default false)
- Relations: PlayerSourceIdentifier[], DataSyncRun[], Match[], Competition[], PlayerStatistic[]

**PlayerSourceIdentifier**
- `id` (UUID, PK)
- `playerId` (UUID, FK Player cascade)
- `providerId` (UUID, FK DataProvider restrict)
- `externalId` (String)
- Unique constraint: (providerId, externalId)
- Index: playerId

**PlayerStatistic**
- `id` (UUID, PK)
- `playerId` (UUID, FK Player cascade)
- `format` (String) — TEST, ODI, T20I, T20, FIRST_CLASS, LIST_A, CAREER, etc.
- `providerId` (UUID, nullable, FK DataProvider)
- `matches`, `runs`, `wickets` (Int, nullable)
- `battingAverage`, `strikeRate`, `bowlingAverage`, `bowlingEconomy` (Decimal, nullable)
- `extra` (JSONB, nullable) — provider-specific fields
- `asOf` (Timestamp) — data freshness
- Index: playerId, format

**PlayerTeamHistory**
- `id` (UUID, PK)
- `playerId` (UUID, FK Player cascade)
- `teamKey` (String) — e.g., PSL_KHI, PAKISTAN_A
- `startYear`, `endYear` (Int, nullable)
- `providerId` (UUID, nullable, FK DataProvider)

**DataSyncRun**
- `id` (UUID, PK)
- `providerId` (UUID, FK DataProvider)
- `runType` (String) — FULL, INCREMENTAL, PLAYER_PROFILE, MATCH_STATE
- `status` (Enum: PENDING, IN_PROGRESS, SUCCESS, FAILED)
- `startedAt`, `completedAt` (Timestamp)
- `recordsProcessed`, `recordsFailed` (Int, nullable)
- `errorDetails` (JSONB, nullable)

### Team and File Asset Entities

**Team** (already in schema, verified)
- `id` (UUID, PK)
- `createdById` (UUID, FK User restrict)
- `name`, `shortName` (String)
- `description` (String, nullable)
- `primaryColor`, `secondaryColor` (VarChar(9), color hex)
- `countryCode` (Char(2), nullable)
- `status` (TeamStatus enum: ACTIVE, ARCHIVED, DISABLED)
- `currentLogoAssetId` (UUID, nullable, FK FileAsset)
- `createdAt`, `updatedAt` (Timestamp)
- Indexes: createdById, status
- Relations: User.teamsCreated, TeamMember[], TeamAsset[], AuctionTeam[]

**TeamMember** (already in schema, verified)
- `teamId`, `userId` (Composite PK)
- `role` (String, default MANAGER)
- `addedAt` (Timestamp)

**TeamAsset** (already in schema, verified)
- `id` (UUID, PK)
- `teamId` (UUID, FK Team cascade)
- `assetId` (UUID, FK FileAsset)
- `createdAt` (Timestamp)
- Unique constraint: (teamId, assetId)

**FileAsset** (already in schema, verified)
- `id` (UUID, PK)
- `kind` (FileAssetKind enum: TEAM_LOGO, USER_AVATAR, EXPORT_IMAGE)
- `status` (FileAssetStatus enum: PENDING_UPLOAD, PROCESSING, READY, REJECTED, DISABLED, DELETED)
- `objectKey` (String) — S3 object key only, never a remote URL
- `bucket` (String) — which S3 bucket
- `contentType` (String, nullable)
- `sizeBytes` (BigInt, nullable)
- `width`, `height` (Int, nullable) — for images
- `sha256` (String, nullable) — file signature hash
- `uploadedById` (UUID, nullable, FK User)
- `rightsConfirmedAt` (Timestamp, nullable)
- `createdAt`, `updatedAt` (Timestamp)
- Unique constraint: (bucket, objectKey)
- Indexes: uploadedById, status
- Relations: User.filesUploaded, TeamAsset[], Team.currentLogo[], UserProfile.avatarAsset[], AssetModerationCase[]

**AssetModerationCase** (already in schema, verified)
- `id` (UUID, PK)
- `assetId` (UUID, FK FileAsset restrict)
- `reason` (String) — COPYRIGHT, TRADEMARK, POLICY, OTHER
- `complaintText` (String, nullable)
- `complainantEmail` (String, nullable)
- `status` (AssetCaseStatus enum: OPEN, ACTION_TAKEN, DISMISSED)
- `outcome` (String, nullable) — reason for resolution
- `resolvedById` (UUID, nullable, FK User)
- `createdAt`, `resolvedAt` (Timestamp)
- Indexes: assetId, status

---

## Backend Implementation: NestJS Modules

### Module: `players`

**Files:**
- `apps/api/src/modules/players/players.module.ts`
- `apps/api/src/modules/players/players.controller.ts`
- `apps/api/src/modules/players/players.service.ts`
- `apps/api/src/modules/players/dtos/player-detail.dto.ts`
- `apps/api/src/modules/players/dtos/player-search.dto.ts`
- `apps/api/src/modules/players/dtos/player-list.dto.ts`
- `apps/api/src/modules/players/dtos/player-category.dto.ts`
- `apps/api/src/modules/players/validators/player-search.validator.ts`
- `apps/api/src/modules/players/repositories/player.repository.ts`
- `apps/api/src/modules/players/__tests__/players.service.spec.ts`
- `apps/api/src/modules/players/__tests__/players.integration.spec.ts`

**Controller endpoints:**
- `GET /api/players?search=&category=&role=&country=&skip=0&take=20` — search and paginate players
  - Query: `search` (string, partial name match), `category` (string), `role` (enum), `country` (char2), `skip`/`take` (pagination)
  - Response: `{ players: PlayerListItem[], total: number, hasMore: boolean }`
  - No authentication required for public player directory
- `GET /api/players/:id` — player detail with statistics
  - Response: `{ id, fullName, displayName, role, category, country, statistics: { format: stats[] }, aliases: string[] }`
  - No authentication required

**Service methods:**
- `searchPlayers(query: PlayerSearchQuery): Promise<{ items: PlayerListItem[], total: number }>`
  - Build Prisma query from search/filter criteria
  - Apply pagination
  - Load related PlayerAlias, PlayerCategory, Country
  - Return paginated results sorted by displayName
- `getPlayerDetail(id: UUID): Promise<PlayerDetailDto>`
  - Fetch player with all aliases, statistics, team history
  - Load statistics grouped by format
  - Return full detail with provider attribution
- `getPlayersByCategory(categoryId: UUID, skip: number, take: number): Promise<Player[]>`
  - Used by auction phase later
- `getPlayerStatistics(playerId: UUID): Promise<Map<string, PlayerStatistic[]>>`
  - Group statistics by format
  - Sort by asOf descending

**Repository methods:**
- `findById(id: UUID): Player`
- `findByDisplayName(name: string): Player[]`
- `findByCategory(categoryId: UUID): Player[]`
- `findByCountry(countryCode: string): Player[]`
- `searchByName(partial: string, limit: number): Player[]`
- All methods include necessary relations (aliases, category, statistics, country)

**DTOs:**
- `PlayerListItem`: id, displayName, role, category.name, country.name, categoryId
- `PlayerDetailDto`: id, fullName, displayName, role, battingStyle, bowlingStyle, category, country, aliases, statistics grouped by format with provider
- `PlayerSearchQuery`: search (string), category (uuid), role (enum), country (string), skip, take
- `PlayerCategoryDto`: id, key, name, sortOrder

**Validators:**
- `PlayerSearchValidator`: search string <= 100 chars, skip >= 0, take 1–100

---

### Module: `player-categories`

**Files:**
- `apps/api/src/modules/player-categories/player-categories.module.ts`
- `apps/api/src/modules/player-categories/player-categories.controller.ts`
- `apps/api/src/modules/player-categories/player-categories.service.ts`
- `apps/api/src/modules/player-categories/dtos/category.dto.ts`

**Controller endpoints:**
- `GET /api/player-categories` — list all categories
  - Response: `{ categories: PlayerCategoryDto[] }`
  - No authentication required
- `POST /api/admin/player-categories` — create category (admin only)
- `PATCH /api/admin/player-categories/:id` — update category (admin only)

**Service methods:**
- `getAllCategories(): Promise<PlayerCategory[]>` — cached, used by search and auction
- `getCategoryById(id: UUID): Promise<PlayerCategory>`
- Admin methods for CRUD (Phase 10+)

---

### Module: `teams`

**Files:**
- `apps/api/src/modules/teams/teams.module.ts`
- `apps/api/src/modules/teams/teams.controller.ts`
- `apps/api/src/modules/teams/teams.service.ts`
- `apps/api/src/modules/teams/dtos/team-create.dto.ts`
- `apps/api/src/modules/teams/dtos/team-detail.dto.ts`
- `apps/api/src/modules/teams/dtos/team-list.dto.ts`
- `apps/api/src/modules/teams/dtos/team-update.dto.ts`
- `apps/api/src/modules/teams/validators/team-create.validator.ts`
- `apps/api/src/modules/teams/repositories/team.repository.ts`
- `apps/api/src/modules/teams/__tests__/teams.service.spec.ts`
- `apps/api/src/modules/teams/__tests__/teams.integration.spec.ts`

**Controller endpoints:**
- `POST /api/teams` — create a new team (authenticated)
  - Body: `{ name, shortName, description?, primaryColor, secondaryColor?, countryCode? }`
  - Response: `TeamDetailDto`
  - Only authenticated users can create teams
- `GET /api/teams/:id` — get team detail
  - Response: `TeamDetailDto` with current logo metadata
  - Public (used in auctions)
- `PATCH /api/teams/:id` — update team (owner only)
  - Body: `{ name?, shortName?, description?, primaryColor?, secondaryColor?, countryCode?, status? }`
  - Response: `TeamDetailDto`
  - Authorization: user is createdBy or team member with MANAGER role
- `DELETE /api/teams/:id` — archive team (owner only)
  - Soft delete via status = ARCHIVED
  - Authorization: user is createdBy
- `GET /api/teams?createdBy=&status=&skip=0&take=20` — list teams (optional filters)
  - Public endpoint
  - Response: `{ teams: TeamListItem[], total: number }`

**Service methods:**
- `createTeam(data: TeamCreateDto, userId: UUID): Promise<Team>`
  - Validate name uniqueness per creator (optional: allow team name reuse across creators)
  - Create Team record
  - Set createdById = userId
  - Return TeamDetailDto
- `getTeamDetail(id: UUID): Promise<TeamDetailDto>`
  - Fetch team with current logo asset and metadata
  - Return full detail including color and country
- `updateTeam(id: UUID, data: TeamUpdateDto, userId: UUID): Promise<TeamDetailDto>`
  - Authorize: user is createdBy or team member with MANAGER role
  - Update allowed fields
  - Return updated detail
- `archiveTeam(id: UUID, userId: UUID): Promise<void>`
  - Authorize: user is createdBy
  - Set status = ARCHIVED (soft delete)
- `listTeams(filters: TeamListFilters, skip: number, take: number): Promise<{ teams: Team[], total: number }>`
  - Optional filter by createdBy, status
  - Return paginated list

**DTOs:**
- `TeamCreateDto`: name (string, 1–100), shortName (string, 1–20), description? (string, 0–500), primaryColor (hex), secondaryColor? (hex), countryCode? (char2)
- `TeamDetailDto`: id, name, shortName, description, primaryColor, secondaryColor, countryCode, status, currentLogo (FileAssetDto), createdBy (UserSummary), createdAt
- `TeamListItem`: id, name, shortName, primaryColor, secondaryColor, currentLogoAssetId, createdBy.displayName
- `TeamUpdateDto`: name? , shortName?, description?, primaryColor?, secondaryColor?, countryCode?

**Validators:**
- `TeamCreateValidator`: name and shortName required, 1–100 chars; colors are valid hex; no special characters in shortName

**Repository methods:**
- `findById(id: UUID): Team` with currentLogo relation
- `findByCreator(createdById: UUID): Team[]`
- `findActive(): Team[]` (status = ACTIVE)
- `create(data: TeamCreateInput): Team`
- `update(id: UUID, data: TeamUpdateInput): Team`
- `archive(id: UUID): Team` (status = ARCHIVED)

---

### Module: `files`

**Files:**
- `apps/api/src/modules/files/files.module.ts`
- `apps/api/src/modules/files/files.controller.ts`
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/modules/files/dtos/upload-intent.dto.ts`
- `apps/api/src/modules/files/dtos/file-asset.dto.ts`
- `apps/api/src/modules/files/validators/file-upload.validator.ts`
- `apps/api/src/modules/files/s3/s3.client.ts`
- `apps/api/src/modules/files/s3/file-signature.validator.ts`
- `apps/api/src/modules/files/repositories/file-asset.repository.ts`
- `apps/api/src/modules/files/__tests__/files.service.spec.ts`
- `apps/api/src/modules/files/__tests__/s3-integration.spec.ts`

**Controller endpoints:**
- `POST /api/files/upload-intent` — request upload intent (authenticated)
  - Body: `{ kind, teamId?, filename, fileSizeBytes, declaredMimeType }`
  - Validate user has permission to upload (owns team for TEAM_LOGO, is authenticated for AVATAR)
  - Create FileAsset record with status = PENDING_UPLOAD
  - Return: `{ uploadId, presignedUrl, expiresAt }`
  - Response: HTTP 201 Created
- `POST /api/files/confirm-upload` — confirm upload and trigger verification (authenticated)
  - Body: `{ uploadId, sha256Hash, actualMimeType }`
  - Verify upload exists and belongs to user
  - Verify file signature and MIME type against server storage
  - Trigger background verification (dimensions, re-encoding for images)
  - Update FileAsset status = PROCESSING
  - Return: `{ uploadId, status }`
- `GET /api/files/:id` — get file metadata (authenticated for uploads, public for READY assets)
  - Return: `{ id, kind, status, bucket, objectKey, contentType, dimensions, uploadedBy, createdAt }`
- `DELETE /api/files/:id` — delete/disable file (uploader or admin)
  - Soft delete via status = DELETED
  - If file is a team logo, clear `Team.currentLogoAssetId` and audit
  - Return: HTTP 204 No Content
- `GET /api/files/:id/download-url` — get signed download URL (authenticated or public for READY)
  - Return: `{ url, expiresAt }`
  - URL valid for 24 hours
  - Public files (team logos once READY) can use longer expiry via CloudFront

**Service methods:**
- `requestUploadIntent(request: UploadIntentRequest, userId: UUID): Promise<UploadIntentResponse>`
  - Authorize: user owns team (for TEAM_LOGO) or is authenticated (for AVATAR)
  - Validate file size (<=5MB for logos), MIME type (image/jpeg, image/png)
  - Create FileAsset record with status = PENDING_UPLOAD
  - Generate presigned POST URL valid for 15 minutes
  - Return presigned URL + uploadId
- `confirmUpload(request: ConfirmUploadRequest, userId: UUID): Promise<FileAssetDto>`
  - Verify FileAsset exists and belongs to user
  - Download file from S3 and validate:
    - File exists (HEAD object)
    - SHA256 hash matches reported value
    - MIME type matches actual S3 content-type
    - Dimensions (for images) are within bounds (200x200 to 2000x2000)
  - Enqueue background job to re-encode image (JPEG quality compression, metadata strip)
  - Set status = PROCESSING
  - Return updated FileAssetDto
- `markFileReady(uploadId: UUID): Promise<FileAssetDto>` (called by background job)
  - Update status = READY
  - If kind = TEAM_LOGO and logoReplacementFor teamId provided, update Team.currentLogoAssetId
  - Return FileAssetDto
- `getDownloadUrl(id: UUID, userId: UUID): Promise<{ url: string, expiresAt: Timestamp }>`
  - For PENDING/PROCESSING, only return to uploader
  - For READY, return to anyone (unless file is DISABLED)
  - Generate presigned GET URL valid for 24 hours
- `disableFile(id: UUID, userId: UUID, reason: string): Promise<void>`
  - Authorize: uploader or admin
  - Set status = DISABLED
  - If team logo, audit and notify team
- `processRejectedUpload(uploadId: UUID, reason: string): Promise<void>`
  - Called when S3 validation fails
  - Set status = REJECTED
  - Clean up S3 object (best-effort, can retry)

**S3 Client (`s3.client.ts`):**
- `generatePresignedPostUrl(bucket: string, uploadId: UUID, contentType: string, maxSize: number): Promise<{ url, fields }>`
  - Use AWS SDK to create presigned POST URL
  - Enforce Content-Length and Content-Type conditions
  - Return URL valid for 15 minutes
- `generatePresignedGetUrl(bucket: string, key: string, expirySeconds: number): Promise<string>`
  - Use AWS SDK to create presigned GET URL
  - Return URL valid for specified duration (default 24 hours)
- `headObject(bucket: string, key: string): Promise<{ size, contentType, lastModified }>`
  - Check if object exists and get metadata
  - Return 404 or metadata
- `getObject(bucket: string, key: string): Promise<Buffer>`
  - Download entire object for server-side validation
  - Use streams for large files
- `deleteObject(bucket: string, key: string): Promise<void>`
  - Clean up rejected uploads

**File Signature Validator (`file-signature.validator.ts`):**
- `validateFileSignature(buffer: Buffer, declaredMimeType: string): Promise<boolean>`
  - Verify MIME type by file magic bytes (magic-bytes library)
  - Supported: image/jpeg, image/png
  - Reject mismatches
- `validateImageDimensions(buffer: Buffer): Promise<{ width: number, height: number }>`
  - Use `sharp` to inspect image dimensions
  - Enforce 200x200 to 2000x2000 bounds for team logos
  - Return dimensions

**DTOs:**
- `UploadIntentRequest`: kind (TEAM_LOGO | AVATAR), teamId? (UUID), filename (string), fileSizeBytes (number), declaredMimeType (string)
- `UploadIntentResponse`: uploadId (UUID), presignedUrl (string), expiresAt (Timestamp)
- `ConfirmUploadRequest`: uploadId (UUID), sha256Hash (string), actualMimeType (string)
- `FileAssetDto`: id, kind, status, objectKey, bucket, contentType, width, height, sizeBytes, uploadedBy (UserSummary), rightsConfirmed, createdAt, updatedAt
- `DownloadUrlResponse`: url (string), expiresAt (Timestamp)

**Validators:**
- `FileUploadValidator`: fileSizeBytes <= 5MB, MIME type in [image/jpeg, image/png], filename <= 100 chars, sha256 is valid hex

**Repository methods:**
- `findById(id: UUID): FileAsset`
- `findByUploadId(uploadId: UUID): FileAsset`
- `findByBucketAndKey(bucket: string, objectKey: string): FileAsset?`
- `create(data: FileAssetInput): FileAsset`
- `updateStatus(id: UUID, status: FileAssetStatus): FileAsset`
- `markReady(id: UUID, dimensions: { width, height }): FileAsset`
- `disable(id: UUID, reason: string): FileAsset`

---

### Module: `asset-moderation`

**Files:**
- `apps/api/src/modules/asset-moderation/asset-moderation.module.ts`
- `apps/api/src/modules/asset-moderation/asset-moderation.controller.ts` (admin only)
- `apps/api/src/modules/asset-moderation/asset-moderation.service.ts`
- `apps/api/src/modules/asset-moderation/dtos/moderation-case.dto.ts`

**Controller endpoints:**
- `POST /api/files/:id/report` — file copyright/trademark complaint (public, rate-limited)
  - Body: `{ reason, complaintText, complainantEmail }`
  - Create AssetModerationCase with status = OPEN
  - Queue notification to asset uploader and admins
  - Return: HTTP 201 Created
- `GET /api/admin/moderation/cases?status=&assetId=&skip=0&take=50` — list moderation cases (admin)
- `PATCH /api/admin/moderation/cases/:id` — resolve case (admin)
  - Body: `{ status, outcome, action? }`
  - If action = DISABLE_ASSET: set FileAsset.status = DISABLED
  - If action = DISMISS: leave FileAsset unchanged
  - Set case.resolvedById = userId, resolvedAt = now()
  - Return updated case

**Service methods:**
- `createModerationCase(assetId: UUID, data: ModerationCaseInput): Promise<AssetModerationCase>`
  - Create case
  - Queue notification
- `listCases(filters: ModerationFilters, skip: number, take: number): Promise<{ cases, total }>`
- `resolveCase(caseId: UUID, resolution: ModerationResolution, userId: UUID): Promise<AssetModerationCase>`
  - Authorize: admin
  - Perform action (disable asset or dismiss)
  - Return updated case

**DTOs:**
- `ModerationCaseDto`: id, assetId, reason, complaintText, complainantEmail, status, outcome, resolvedBy, createdAt, resolvedAt
- `ModerationCaseInput`: reason, complaintText, complainantEmail

---

## Frontend Implementation: Next.js Pages and Components

### Pages

**`apps/web/src/app/players/page.tsx`** — Player directory and search
- Public page (no sign-in required)
- Components:
  - Page header with title
  - Search input (name autocomplete)
  - Filter sidebar: category, role, country (dropdowns)
  - Pagination controls
  - Player grid/list (uses PlayerCard component)
- Data fetching:
  - `GET /api/players?search=&category=&role=&country=&skip=0&take=20`
  - Fallback to empty state if no results
  - Loading state with skeleton placeholders
- Mobile: search and filters collapse into drawer/modal

**`apps/web/src/app/players/[id]/page.tsx`** — Player detail page
- Public page
- Components:
  - Player header with name, role, category, country
  - Player image/initials placeholder
  - Tabs: Overview, Statistics, Team History
  - Statistics table grouped by format (TEST, ODI, T20I, T20, etc.)
  - Career highlights
  - Data source attribution
- Data fetching:
  - `GET /api/players/:id`
  - 404 if not found
- Mobile: stack tabs vertically

**`apps/web/src/app/(dashboard)/teams/page.tsx`** — Teams list (authenticated)
- Access from profile dropdown → Auction → Teams
- Authenticated only (redirects to sign-in)
- Components:
  - Page header with "Create Team" button
  - Teams grid/list (TeamCard component)
  - Pagination
- Shows:
  - Current user's teams (createdBy = userId)
  - Team membership (TeamMember entries)
- Data fetching:
  - `GET /api/teams?createdBy=userId&status=ACTIVE`
  - Fallback to empty state ("Create your first team")

**`apps/web/src/app/(dashboard)/teams/create/page.tsx`** — Team creation form
- Authenticated only
- Components:
  - Form with fields: name, shortName, description, primaryColor, secondaryColor, countryCode
  - Color picker for primary/secondary colors
  - Country select (dropdown, searchable)
  - Submit and cancel buttons
- Form handling:
  - Client-side validation (Zod schema)
  - `POST /api/teams`
  - On success: redirect to `/teams/[id]` or `/teams/[id]/logo`
  - Error messages displayed inline
- Mobile: form fields stack, color picker is touch-friendly

**`apps/web/src/app/(dashboard)/teams/[id]/page.tsx`** — Team detail and management
- Authenticated, authorized (owner or member)
- Components:
  - Team header with name, logo, colors
  - Team info section (description, country, colors)
  - Logo section with current logo + "Replace Logo" button
  - Team members list (Phase 6+ for multi-member support)
  - Edit button (redirects to `/teams/[id]/edit`)
  - Delete/Archive button
- Data fetching:
  - `GET /api/teams/:id`
  - 404 if not found
  - 403 if not owner/member
- Mobile: stack sections, logo takes full width

**`apps/web/src/app/(dashboard)/teams/[id]/logo/page.tsx`** — Logo upload
- Authenticated, authorized (team owner only)
- Components:
  - Current logo preview (or placeholder)
  - Upload area (drag-drop + file input)
  - File size/type constraints display
  - Upload progress indicator
  - Rights confirmation checkbox ("I confirm I have permission to use this asset")
  - Submit and cancel buttons
- Upload flow:
  - 1. User selects file (validate size/type client-side)
  - 2. `POST /api/files/upload-intent` with kind=TEAM_LOGO, teamId
  - 3. Receive presignedUrl + uploadId
  - 4. Upload file to S3 using presigned URL (direct browser upload)
  - 5. Calculate SHA256 hash client-side (SubtleCrypto API)
  - 6. `POST /api/files/confirm-upload` with uploadId, sha256Hash, actualMimeType
  - 7. Poll `/api/files/{uploadId}` or await notification for status = READY
  - 8. Redirect to `/teams/[id]`
- Error handling:
  - Display upload errors (network, file too large, invalid type, server validation)
  - Retry capability
- Mobile: upload area is centered, full-width

**`apps/web/src/app/(dashboard)/teams/[id]/edit/page.tsx`** — Team edit form
- Authenticated, authorized (team owner only)
- Pre-populate form from `/api/teams/:id`
- Same form as create, but `PATCH /api/teams/:id` instead of `POST /api/teams`
- Include Archive button (soft delete)

---

### Components

**`apps/web/src/components/PlayerCard.tsx`**
- Props: `player: PlayerListItem`
- Display:
  - Player initials or image (placeholder)
  - Player name and display name
  - Role badge (Batter, Bowler, All-rounder, Wicketkeeper)
  - Nationality flag/code
  - Category name (if assigned)
- Link to `/players/:id`
- Responsive: adjust text size and badge layout for mobile
- Hover state: slight scale/shadow

**`apps/web/src/components/PlayerDetail.tsx`**
- Props: `player: PlayerDetailDto`
- Display: full player information
- Sub-components: StatisticsTable, TeamHistory, CareerHighlights

**`apps/web/src/components/PlayerSearch.tsx`**
- Props: `onSearch: (query) => void`, `filters: SearchFilters`
- Input with debounce (300ms)
- Autocomplete suggestion list (from `/api/players?search=...`)
- Filter dropdowns (category, role, country)
- Clear button

**`apps/web/src/components/TeamCard.tsx`**
- Props: `team: TeamListItem`
- Display:
  - Team logo (or placeholder with initials)
  - Team name and shortName
  - Primary/secondary color indicators (small swatches)
  - Creator name
- Link to `/teams/:id`
- Hover state: logo scale slightly

**`apps/web/src/components/TeamForm.tsx`**
- Props: `initialData?: Team`, `onSubmit: (data) => void`, `isLoading: boolean`
- Fields: name, shortName, description, primaryColor, secondaryColor, countryCode
- Validation feedback (Zod errors)
- Submit and cancel buttons
- Uses ColorPicker and CountrySelect components

**`apps/web/src/components/ColorPicker.tsx`**
- Props: `value: string`, `onChange: (hex) => void`, `label: string`
- Input: hex color code (e.g., #FF5733)
- Display: color preview swatch
- Click to open native color picker (HTML5 input[type=color])
- Mobile: easy touch target

**`apps/web/src/components/CountrySelect.tsx`**
- Props: `value?: string`, `onChange: (code) => void`, `label: string`
- Dropdown with country list
- Searchable by country name or code
- Optional (nullable)

**`apps/web/src/components/FileUpload.tsx`**
- Props: `kind: FileAssetKind`, `teamId?: UUID`, `onSuccess: (asset) => void`, `onError: (error) => void`
- Drag-drop zone + file input
- Display file size/type constraints
- Upload progress bar
- Rights confirmation checkbox
- Cancel button
- Calls `/api/files/upload-intent` and handles S3 direct upload

**`apps/web/src/components/LoadingState.tsx`**
- Skeleton loaders for player cards, team cards, forms

**`apps/web/src/components/EmptyState.tsx`**
- Generic empty state with icon, message, action button

**`apps/web/src/components/ErrorState.tsx`**
- Error display with retry button

**`apps/web/src/components/Pagination.tsx`**
- Props: `currentPage, totalPages, onPageChange, isLoading`
- Previous/next buttons, page numbers
- Mobile: compact layout

---

## API Contracts (Shared DTOs)

### In `packages/contracts/`

**`players.contract.ts`**
```typescript
export type PlayerListItem = {
  id: string;
  displayName: string;
  role: PlayerRoleType;
  category?: PlayerCategoryDto;
  country?: CountryDto;
};

export type PlayerDetailDto = {
  id: string;
  fullName: string;
  displayName: string;
  role: PlayerRoleType;
  battingStyle?: BattingStyle;
  bowlingStyle?: string;
  dateOfBirth?: Date;
  country?: CountryDto;
  category?: PlayerCategoryDto;
  aliases: string[];
  statistics: Map<string, PlayerStatistic[]>;
};

export type PlayerSearchQuery = {
  search?: string;
  category?: string;
  role?: PlayerRoleType;
  country?: string;
  skip: number;
  take: number;
};

export type PlayerSearchResponse = {
  players: PlayerListItem[];
  total: number;
  hasMore: boolean;
};

export type PlayerCategoryDto = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
};
```

**`teams.contract.ts`**
```typescript
export type TeamCreateDto = {
  name: string;
  shortName: string;
  description?: string;
  primaryColor: string; // hex
  secondaryColor?: string;
  countryCode?: string;
};

export type TeamDetailDto = {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  primaryColor: string;
  secondaryColor?: string;
  countryCode?: string;
  status: TeamStatus;
  currentLogo?: FileAssetDto;
  createdBy: UserSummary;
  createdAt: Date;
};

export type TeamListItem = {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor?: string;
  currentLogoAssetId?: string;
  createdBy: { displayName: string };
};

export type TeamUpdateDto = {
  name?: string;
  shortName?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  countryCode?: string;
};

export type TeamListResponse = {
  teams: TeamListItem[];
  total: number;
  hasMore: boolean;
};
```

**`files.contract.ts`**
```typescript
export type UploadIntentRequest = {
  kind: FileAssetKind;
  teamId?: string;
  filename: string;
  fileSizeBytes: number;
  declaredMimeType: string;
};

export type UploadIntentResponse = {
  uploadId: string;
  presignedUrl: string;
  expiresAt: Date;
};

export type ConfirmUploadRequest = {
  uploadId: string;
  sha256Hash: string;
  actualMimeType: string;
};

export type FileAssetDto = {
  id: string;
  kind: FileAssetKind;
  status: FileAssetStatus;
  objectKey: string;
  bucket: string;
  contentType?: string;
  width?: number;
  height?: number;
  sizeBytes?: bigint;
  uploadedBy?: UserSummary;
  rightsConfirmed: boolean;
  createdAt: Date;
};

export type DownloadUrlResponse = {
  url: string;
  expiresAt: Date;
};
```

---

## S3 Upload Pipeline Architecture

### Upload Flow (Detailed)

**Step 1: Request Upload Intent**
- Client calls `POST /api/files/upload-intent` with metadata
- Backend:
  - Authorize: user owns team (for TEAM_LOGO) or is authenticated (for AVATAR)
  - Validate: file size ≤ 5MB, MIME type in [image/jpeg, image/png]
  - Generate uploadId (UUID)
  - Create FileAsset record with status = PENDING_UPLOAD
  - Generate presigned POST URL using AWS SDK:
    - Conditions: Content-Length ≤ 5MB, Content-Type matches declared
    - Expiry: 15 minutes
    - Policy signed with AWS credentials (never exposed to client)
  - Return: uploadId, presignedUrl, expiresAt

**Step 2: Browser Direct Upload to S3**
- Client:
  - Displays upload form with drag-drop and file input
  - User selects file (browser-side validation: size, type, dimensions not checked here)
  - Form post to presignedUrl with file and metadata fields
  - Browser uploads directly to S3 (no backend proxy)
  - Server receives S3 event notification (optional) or client confirms completion

**Step 3: Confirm Upload**
- Client calls `POST /api/files/confirm-upload` with uploadId, sha256Hash (calculated client-side), actualMimeType (from browser file type)
- Backend:
  - Retrieve FileAsset by uploadId
  - Verify user ownership
  - Verify file exists in S3: `HEAD object`
  - Download file: `GET object` (stream to avoid memory overload)
  - Validate:
    - SHA256 hash matches reported value (server calculates hash on download)
    - MIME type matches declared (via magic bytes check)
    - File size within bounds
    - For images: dimensions within 200x200 to 2000x2000
  - On validation success:
    - Update FileAsset: status = PROCESSING, sizeBytes, width, height, contentType, sha256
    - Enqueue background job: image re-encoding (JPEG compression, metadata strip)
    - Return FileAssetDto with status = PROCESSING
  - On validation failure:
    - Update FileAsset: status = REJECTED
    - Optionally clean up S3 object
    - Return error response

**Step 4: Background Image Processing**
- Worker job (optional, for image optimization):
  - Re-encode JPEG to quality 90, strip EXIF
  - Re-encode PNG with optimized compression
  - Upload re-encoded version to S3
  - On completion: update FileAsset status = READY, store final size
  - Queue notification: file is ready

**Step 5: Availability**
- FileAsset status = READY: file is available for use
- For team logo: set Team.currentLogoAssetId = fileAssetId
- Download URL available via `/api/files/:id/download-url` (presigned GET URL, 24-hour expiry)
- For public use (team logo in auctions): presigned URL or CloudFront CDN URL with long-term caching

### Error Handling

**Upload Intent failures:**
- File size > 5MB: return 400 with error code FILE_TOO_LARGE
- Invalid MIME type: return 400 with error code INVALID_FILE_TYPE
- User not authorized: return 403

**Upload confirmation failures:**
- File not found in S3: return 410 with error code UPLOAD_NOT_FOUND
- SHA256 mismatch: return 400 with error code CHECKSUM_MISMATCH
- MIME type mismatch: return 400 with error code MIME_TYPE_MISMATCH
- Dimensions out of bounds: return 400 with error code INVALID_DIMENSIONS

**Client retry logic:**
- On transient S3 upload error (network timeout, 500): retry up to 3 times with exponential backoff
- On permanent failure (400, 403): display error and allow user to retry
- Cancel upload: clean up local state, optionally request S3 deletion

---

## Database Migrations

**Migration 1: Player and Cricket Data Entities**
- File: `packages/database/prisma/migrations/202411XX_add_players.sql`
- Changes:
  - Add `Country` table
  - Add `PlayerCategory` table
  - Add `DataProvider` table
  - Add `Player` table with indexes
  - Add `PlayerAlias` table with unique constraint
  - Add `PlayerSourceIdentifier` table with unique constraint
  - Add `PlayerStatistic` table with indexes
  - Add `PlayerTeamHistory` table
  - Add `DataSyncRun` table

**Migration 2: File Assets and Team Associations**
- File: `packages/database/prisma/migrations/202411XX_add_files_and_teams.sql`
- Changes:
  - Already in schema: `FileAsset`, `AssetModerationCase`, `Team`, `TeamMember`, `TeamAsset`
  - Add indexes on status, uploadedById, bucket+objectKey

Prisma: `pnpm db:migrate` applies migrations and regenerates client.

---

## Testing Strategy

### Unit Tests

**Players Service:**
- `searchPlayers()` with various filters (search, category, role, country)
- Pagination (skip, take validation)
- Sorting by displayName
- Empty search results

**Teams Service:**
- `createTeam()` with valid/invalid data
- `updateTeam()` authorization (only owner/member can update)
- `archiveTeam()` soft delete
- `getTeamDetail()` with relations

**Files Service:**
- `requestUploadIntent()`: authorization, validation
- `confirmUpload()`: SHA256 validation, MIME type checking, dimension validation
- `markFileReady()`: status transitions
- `disableFile()`: authorization

**Asset Moderation:**
- `createModerationCase()`: case creation and notification
- `resolveCase()`: disable asset or dismiss

### Integration Tests

**Players Module:**
- `GET /api/players?search=&category=&role=&country=&skip=0&take=20`: verify database queries and pagination
- `GET /api/players/:id`: verify relations are loaded
- Filter by category, role, country

**Teams Module:**
- `POST /api/teams`: create team, verify ownership
- `GET /api/teams/:id`: retrieve team with logo
- `PATCH /api/teams/:id`: update team, verify authorization
- `DELETE /api/teams/:id`: archive team
- `GET /api/teams?createdBy=userId`: list user's teams

**Files Module:**
- `POST /api/files/upload-intent`: create FileAsset, generate presigned URL
- `POST /api/files/confirm-upload`: validate file, trigger processing
- `GET /api/files/:id`: retrieve file metadata
- `DELETE /api/files/:id`: disable file

**S3 Integration:**
- Presigned URL generation and usage
- File upload to S3 (mock or test bucket)
- File download and signature validation
- Cleanup of rejected uploads

### E2E Tests (Playwright)

**Player Directory:**
- Navigate to `/players`
- Search by name, filter by category/role/country
- Click player card → navigate to `/players/:id`
- Verify player detail page loads

**Team Creation:**
- Sign in
- Navigate to `/teams`
- Click "Create Team"
- Fill form: name, shortName, colors, country
- Submit → redirect to `/teams/:id`
- Verify team appears in list

**Team Logo Upload:**
- Navigate to `/teams/:id/logo`
- Select image file (drag-drop or file input)
- Verify upload progress
- Confirm rights checkbox
- Submit
- Verify upload succeeds, logo appears on team detail page
- (Mock S3 or use test bucket)

**Team Edit:**
- Navigate to `/teams/:id/edit`
- Update team details
- Submit
- Verify changes persist

---

## Verification Checklist

### Build and Typecheck
- `pnpm install` — dependencies resolve
- `pnpm build` — no TypeScript errors, all modules compile
- `pnpm typecheck` — strict mode passes

### Tests
- `pnpm test:unit` — all unit tests pass
- `pnpm test:integration` — all integration tests pass, database queries work
- `pnpm test:e2e` — Playwright tests pass for player search, team creation, logo upload
- Code coverage: >80% for domain services

### Linting
- `pnpm lint` — no ESLint errors, Prettier formatting correct

### No Credentials or Secrets
- Grep for hardcoded AWS credentials, API keys: `grep -r "AKIA" apps/ packages/` → no results
- `.env.example` documents required variables; `.env` is git-ignored
- Presigned URLs are generated server-side only, never logged or exposed

### Authorization
- `/api/teams/create` requires authentication (401 if anonymous)
- `/api/teams/:id/edit` requires team ownership (403 if not owner)
- `/api/files/upload-intent` checks team ownership for TEAM_LOGO (403 if not owner)
- `/api/admin/*` require staff authorization (403 if not staff)

### Data Exposure
- Player details do not leak personal contact info
- File assets do not expose S3 credentials or internal URLs
- Team colors and logos are public data
- User email hidden from team members list (show displayName only)

### Database Constraints
- Foreign key relationships enforce referential integrity
- Unique constraints on (provider, subject), (teamId, assetId), (bucket, objectKey)
- Indexes on frequently queried columns (displayName, role, status, uploadedById)

### Responsive Design
- Pages tested at 375px (mobile), 768px (tablet), 1024px, 1440px (desktop)
- Forms and inputs are touch-friendly on mobile
- Logo upload drag-drop works on touch devices
- No horizontal scroll on mobile

### Accessibility
- Form labels associated with inputs
- Buttons have clear text or aria-label
- Color picker has accessible color input (type=color)
- Error messages announced by screen readers
- Keyboard navigation works for search, filters, pagination

---

## Open Decisions / Ambiguities

1. **Player name uniqueness:** Should platform enforce unique player names, or allow duplicates? (Recommended: allow, use UUID as primary key; deduplication is data-provider work)

2. **Team name reuse:** Can different creators use the same team name? (Recommended: yes; team identity is scoped to creator)

3. **Background image processing:** Is image re-encoding/compression required for MVP, or acceptable to store original after validation? (Recommended: MVP skips re-encoding; add optimization in Phase 9)

4. **S3 bucket structure:** Use one bucket for all asset kinds (logos, avatars, exports) or separate buckets? (Recommended: one bucket with prefix structure: team-logos/, user-avatars/, exports/)

5. **Presigned URL caching:** Should CloudFront be added for team logos to reduce presigned URL generation? (Recommended: defer to Phase 11; use presigned URLs in MVP)

6. **File retention policy:** How long are rejected/disabled FileAsset records kept? Should S3 cleanup happen immediately or via retention job? (Recommended: immediate best-effort cleanup, with retention job for failed deletions)

7. **Player image source:** Player detail page shows initials placeholder. Should platform source official player images in Phase 9? (Yes, from data provider or cricket-data API)

8. **Category sorting:** PlayerCategory.sortOrder determines display order. Should admin be able to reorder? (Recommended: yes, Phase 10 admin UI; MVP uses fixed order)

9. **Data provider configuration:** Should every DataProvider be manually created in database, or seeded with known providers? (Recommended: seed with ICC, ESPNcricinfo, Cricketapi; allow admin to enable/disable and add new ones in Phase 10)

---

## Digest: Files, Blocks, and Verification

### Backend Files and Blocks to Change

**Module: `players`**
- File: `apps/api/src/modules/players/players.module.ts`
  - Block: Create new module; export PlayersModule
  - Verify: `pnpm build` succeeds; module loads in app.module

- File: `apps/api/src/modules/players/players.controller.ts`
  - Block: Endpoints GET `/players`, GET `/players/:id`
  - Test: `GET /api/players?search=john&role=BATTER` returns players; `GET /api/players/valid-uuid` returns detail; `GET /api/players/invalid-id` returns 404
  - Verify: `pnpm test:integration -- players.controller`

- File: `apps/api/src/modules/players/players.service.ts`
  - Block: Methods searchPlayers(), getPlayerDetail(), getPlayersByCategory(), getPlayerStatistics()
  - Test: `searchPlayers()` with various filters; `getPlayerDetail()` loads aliases and statistics; `getPlayerStatistics()` groups by format
  - Verify: `pnpm test:unit -- players.service`

- File: `apps/api/src/modules/players/repositories/player.repository.ts`
  - Block: Prisma repository with find, search, and relation-loading methods
  - Test: Database queries execute correctly; relations are loaded
  - Verify: `pnpm test:integration -- player.repository`

**Module: `player-categories`**
- File: `apps/api/src/modules/player-categories/player-categories.controller.ts`
  - Block: Endpoint GET `/player-categories`
  - Test: Returns all categories sorted by sortOrder
  - Verify: `pnpm test:integration -- player-categories.controller`

**Module: `teams`**
- File: `apps/api/src/modules/teams/teams.module.ts`
  - Block: Create new module; export TeamsModule
  - Verify: `pnpm build` succeeds

- File: `apps/api/src/modules/teams/teams.controller.ts`
  - Block: Endpoints POST `/teams`, GET `/teams/:id`, PATCH `/teams/:id`, DELETE `/teams/:id`, GET `/teams`
  - Test: Create team (authenticated); update team (authorization check); list teams; delete/archive
  - Verify: `pnpm test:integration -- teams.controller`

- File: `apps/api/src/modules/teams/teams.service.ts`
  - Block: Methods createTeam(), getTeamDetail(), updateTeam(), archiveTeam(), listTeams()
  - Test: Create team with valid data; prevent update if not owner; archive team
  - Verify: `pnpm test:unit -- teams.service`

**Module: `files`**
- File: `apps/api/src/modules/files/files.module.ts`
  - Block: Create new module; export FilesModule
  - Verify: `pnpm build` succeeds

- File: `apps/api/src/modules/files/files.controller.ts`
  - Block: Endpoints POST `/files/upload-intent`, POST `/files/confirm-upload`, GET `/files/:id`, DELETE `/files/:id`, GET `/files/:id/download-url`
  - Test: Request upload intent; confirm upload with valid SHA256; download signed URL; delete file
  - Verify: `pnpm test:integration -- files.controller`

- File: `apps/api/src/modules/files/files.service.ts`
  - Block: Methods requestUploadIntent(), confirmUpload(), markFileReady(), getDownloadUrl(), disableFile()
  - Test: Presigned URL generation; file validation (MIME, dimensions, hash); status transitions
  - Verify: `pnpm test:unit -- files.service` and `pnpm test:integration -- files.integration`

- File: `apps/api/src/modules/files/s3/s3.client.ts`
  - Block: AWS SDK integration; presigned URL generation, file download, cleanup
  - Test: Presigned URLs work; file exists check; signature validation
  - Verify: `pnpm test:integration -- s3-integration` (may require AWS test bucket)

- File: `apps/api/src/modules/files/s3/file-signature.validator.ts`
  - Block: Magic byte validation, dimension checking
  - Test: Valid JPEG/PNG images pass; mismatched MIME fails; out-of-bounds dimensions fail
  - Verify: `pnpm test:unit -- file-signature.validator`

**Module: `asset-moderation`**
- File: `apps/api/src/modules/asset-moderation/asset-moderation.controller.ts`
  - Block: Endpoints POST `/files/:id/report`, GET `/admin/moderation/cases`, PATCH `/admin/moderation/cases/:id`
  - Test: File report creates case; list cases (admin); resolve case with disable action
  - Verify: `pnpm test:integration -- asset-moderation.controller`

**Database Schema:**
- File: `packages/database/prisma/schema.prisma`
  - Block: Sections for cricket.prisma (Player, Country, PlayerCategory, DataProvider, PlayerSourceIdentifier, PlayerStatistic, PlayerTeamHistory, DataSyncRun)
  - Block: Teams section already in schema; verify FileAsset and AssetModerationCase sections exist
  - Verify: `pnpm db:validate` succeeds; schema compiles

**Migration:**
- File: `packages/database/prisma/migrations/202411XX_add_players.sql`
  - Block: SQL to create Player, Country, PlayerCategory, DataProvider, PlayerSourceIdentifier, PlayerStatistic, PlayerTeamHistory, DataSyncRun tables
  - Verify: `pnpm db:migrate` applies migration; `pnpm db:push` syncs schema; schema is current

**Shared Contracts:**
- File: `packages/contracts/players.contract.ts`
  - Block: Export PlayerListItem, PlayerDetailDto, PlayerSearchQuery, PlayerSearchResponse, PlayerCategoryDto
  - Verify: Imports compile in frontend and backend without errors

- File: `packages/contracts/teams.contract.ts`
  - Block: Export TeamCreateDto, TeamDetailDto, TeamListItem, TeamUpdateDto, TeamListResponse
  - Verify: Imports compile

- File: `packages/contracts/files.contract.ts`
  - Block: Export UploadIntentRequest, UploadIntentResponse, ConfirmUploadRequest, FileAssetDto, DownloadUrlResponse
  - Verify: Imports compile

### Frontend Files and Blocks

**Pages:**
- File: `apps/web/src/app/players/page.tsx`
  - Block: Player search and directory
  - Test: `GET /api/players` returns results; search filters work; pagination works
  - E2E: Navigate to `/players`, search, filter, click player card
  - Verify: `pnpm test:e2e -- players-directory`

- File: `apps/web/src/app/players/[id]/page.tsx`
  - Block: Player detail page
  - Test: `GET /api/players/:id` returns data; statistics displayed; 404 on invalid ID
  - E2E: Click player card, detail page loads, statistics visible
  - Verify: `pnpm test:e2e -- player-detail`

- File: `apps/web/src/app/(dashboard)/teams/page.tsx`
  - Block: Teams list (authenticated)
  - Test: `GET /api/teams?createdBy=userId` returns user's teams; redirect to sign-in if anonymous
  - E2E: Sign in, navigate to `/teams`, team list appears
  - Verify: `pnpm test:e2e -- teams-list`

- File: `apps/web/src/app/(dashboard)/teams/create/page.tsx`
  - Block: Team creation form
  - Test: Form validation; `POST /api/teams` succeeds; redirect to `/teams/:id`
  - E2E: Create team, form validates, submit succeeds
  - Verify: `pnpm test:e2e -- teams-create`

- File: `apps/web/src/app/(dashboard)/teams/[id]/page.tsx`
  - Block: Team detail page
  - Test: `GET /api/teams/:id` returns team; display logo, colors, info
  - E2E: Navigate to team detail, information displayed
  - Verify: `pnpm test:e2e -- teams-detail`

- File: `apps/web/src/app/(dashboard)/teams/[id]/logo/page.tsx`
  - Block: Logo upload page
  - Test: `POST /api/files/upload-intent` returns presigned URL; file upload to S3; `POST /api/files/confirm-upload` succeeds
  - E2E: Upload logo, progress displayed, success feedback
  - Verify: `pnpm test:e2e -- teams-logo-upload`

**Components:**
- File: `apps/web/src/components/PlayerCard.tsx`
  - Block: Display player summary with link
  - Test: Props pass through; click navigates to detail
  - Verify: `pnpm test:unit -- PlayerCard`

- File: `apps/web/src/components/TeamCard.tsx`
  - Block: Display team summary with link
  - Test: Props pass through; color swatches display
  - Verify: `pnpm test:unit -- TeamCard`

- File: `apps/web/src/components/FileUpload.tsx`
  - Block: Upload form, presigned URL integration, S3 direct upload
  - Test: Request upload intent, receive presigned URL, upload file, confirm
  - Verify: `pnpm test:unit -- FileUpload` and integration test with S3

---

## Summary of Implementation Order

1. **Database schema and migrations:** Add Player, PlayerCategory, Country, DataProvider, PlayerSourceIdentifier, PlayerStatistic, PlayerTeamHistory, DataSyncRun tables
2. **Players backend module:** Create controller, service, repository, DTOs
3. **Teams backend module:** Create controller, service, repository, DTOs
4. **Files backend module:** Create controller, service, S3 client, validators
5. **Asset moderation backend module:** Create controller, service
6. **Player-categories backend module:** Create controller, service
7. **Shared contracts:** Define TypeScript DTOs in packages/contracts
8. **Player frontend pages:** Directory, search, detail
9. **Team frontend pages:** List, create, edit, detail
10. **Logo upload component:** File upload with S3 integration
11. **Supporting components:** PlayerCard, TeamCard, ColorPicker, CountrySelect, FileUpload
12. **E2E tests:** Playwright tests for user flows
13. **Build verification:** Ensure no TypeScript, ESLint, or test failures; no credentials exposed
