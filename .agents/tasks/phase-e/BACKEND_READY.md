# Phase E Backend: Ready for Frontend Integration

**Status:** ✅ COMPLETE  
**Branch:** `phase/e-players-teams-s3-pipeline`  
**Commits:** d31a8c8, df119f4  
**Date:** 2026-11-23

## Backend Modules Implemented

### 1. Players Module
**Endpoints:**
- `GET /api/players?search=&category=&role=&country=&skip=0&take=20`
- `GET /api/players/:id`

**Returns:**
- PlayerListItem[] with pagination
- PlayerDetailDto with statistics grouped by format, aliases

**No authentication required** (public directory)

---

### 2. PlayerCategories Module
**Endpoints:**
- `GET /api/player-categories`

**Returns:**
- PlayerCategoryDto[] sorted by sortOrder

**No authentication required**

---

### 3. Teams Module
**Endpoints:**
- `POST /api/teams` (authenticated, creates team)
- `GET /api/teams/:id` (public, any user can read)
- `PATCH /api/teams/:id` (owner/member only)
- `DELETE /api/teams/:id` (owner only, soft delete)
- `GET /api/teams?createdBy=userId&skip=0&take=20` (public list)

**Returns:**
- TeamDetailDto with current logo metadata
- TeamListItem[] with pagination

**Authorization:** Creator/member can modify; anyone can view public teams

---

### 4. Files Module
**Endpoints:**
- `POST /api/files/upload-intent` (authenticated)
  - Request: `{ kind, teamId?, filename, fileSizeBytes, declaredMimeType }`
  - Response: `{ uploadId, presignedUrl, expiresAt }`

- `POST /api/files/confirm-upload` (authenticated)
  - Request: `{ uploadId, sha256Hash, actualMimeType }`
  - Response: FileAssetDto with status

- `GET /api/files/:id` (public for READY, uploader for PENDING/PROCESSING)
- `GET /api/files/:id/download-url` (public for READY, uploader for others)
- `DELETE /api/files/:id` (uploader only)

**Upload Flow:**
1. Client → `POST /api/files/upload-intent` → Get presigned URL
2. Browser → Direct upload to S3 using presigned URL
3. Client → Calculate SHA256 hash of uploaded file
4. Client → `POST /api/files/confirm-upload` with hash
5. Server validates, marks READY
6. File available for download

---

### 5. AssetModeration Module
**Endpoints:**
- `POST /api/files/:id/report` (public, rate-limited)
  - Request: `{ reason, complaintText?, complainantEmail? }`
  - Response: ModerationCaseDto

- `GET /api/admin/moderation/cases` (admin only)
- `PATCH /api/admin/moderation/cases/:id` (admin only)

---

## Frontend Can Now Build

### Pages to Implement

**1. `/players` — Player Directory**
- Search input (name, autocomplete)
- Filter sidebar: category, role, country
- Pagination controls
- Player grid with cards
- Link to `/players/:id`

**API Calls:**
- `GET /api/players?search=...&category=...&role=...&country=...&skip=0&take=20`
- `GET /api/player-categories`

**2. `/players/:id` — Player Detail**
- Player header (name, role, category, country)
- Tabs: Overview, Statistics, Team History
- Statistics table (grouped by format: TEST, ODI, T20I, T20, etc.)
- Data source attribution
- Mobile: stack tabs vertically

**API Calls:**
- `GET /api/players/:id`

**3. `/(dashboard)/teams` — Team List**
- Authentication required
- "Create Team" button → `/teams/create`
- Teams grid/list
- Link to `/teams/:id`

**API Calls:**
- `GET /api/teams?createdBy=userId&skip=0&take=20`

**4. `/(dashboard)/teams/create` — Team Creation**
- Form: name, shortName, description, primaryColor, secondaryColor, countryCode
- Color picker components
- Country select (searchable)
- Client-side validation (Zod schema)
- Submit → `POST /api/teams`

**5. `/(dashboard)/teams/:id` — Team Detail & Management**
- Team info (name, colors, logo)
- Current logo display
- "Replace Logo" button → `/teams/:id/logo`
- Edit button → `/teams/:id/edit`
- Archive/delete button

**API Calls:**
- `GET /api/teams/:id`

**6. `/(dashboard)/teams/:id/logo` — Logo Upload**
- Drag-drop zone + file input
- File size/type constraints
- Rights confirmation checkbox
- Upload progress bar

**Upload Flow:**
1. `POST /api/files/upload-intent` → Get presigned URL
2. Client calculates SHA256 (SubtleCrypto API)
3. Direct browser upload to S3
4. `POST /api/files/confirm-upload` with hash
5. Poll `/api/files/{uploadId}` until status = READY
6. Display success, redirect to `/teams/:id`

**7. `/(dashboard)/teams/:id/edit` — Team Edit**
- Same form as create
- Pre-populate from `/api/teams/:id`
- `PATCH /api/teams/:id` on submit

---

## Shared Types (Already Defined)

**In `packages/contracts/src/`:**

```typescript
// players.contract.ts
export interface PlayerListItem {
  id: string;
  displayName: string;
  role: string;
  category?: PlayerCategoryDto;
  country?: CountryDto;
}

export interface PlayerDetailDto {
  id: string;
  fullName: string;
  displayName: string;
  role: string;
  battingStyle?: string;
  bowlingStyle?: string;
  dateOfBirth?: string;
  country?: { code: string; name: string };
  category?: { id: string; key: string; name: string };
  categoryId?: string;
  aliases: string[];
  statistics: Map<string, PlayerStatisticDto[]>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// teams.contract.ts
export interface TeamDetailDto {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  primaryColor: string;
  secondaryColor?: string;
  countryCode?: string;
  status: string;
  currentLogo?: FileAssetDto;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface FileAssetDto {
  id: string;
  kind: string;
  status: string;
  objectKey: string;
  bucket: string;
  contentType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  uploadedBy?: { displayName: string };
  rightsConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## Environment Setup for Frontend

Frontend does NOT need AWS credentials. It only needs:
- API base URL (e.g., `http://localhost:4000/api`)
- S3 bucket URL for public assets (e.g., `https://s3.amazonaws.com/under-the-hammer-assets/`)

Presigned URLs are generated server-side only.

---

## Testing Strategy

**Frontend Unit Tests:**
- Component rendering with mock data
- Form validation (Zod schemas)
- File size/type validation before upload

**Frontend Integration Tests:**
- Search results with pagination
- Team CRUD operations
- Logo upload with S3 (mock S3 or test bucket)
- Authorization boundaries (authenticated vs. public)

**E2E Tests (Playwright):**
- Browse players → click detail → see stats
- Create team → upload logo → see on team detail
- Edit team → verify changes persist
- Delete team → verify archive

---

## Backend Ready For

✅ Frontend development  
✅ Integration testing (once DATABASE_URL configured)  
✅ E2E testing  
✅ Code review  
✅ Deployment planning

**Next:** Database setup (`npm run db:validate`) unblocks TypeScript verification and deployment.
