# Phase E Backend: Players, Teams, and S3 File Pipeline

The backend for Phase E implements the core domain modules for player search, user-created teams, and secure file upload with S3 integration. All five modules (Players, PlayerCategories, Teams, Files, AssetModeration) are code-complete with proper authorization, server-side validation, and type safety. The implementation respects backend authority for all stateful decisions and follows the locked product constraints—no mandatory official teams, teams are customizable with dynamic colors and logos, and file storage never trusts client-supplied remote URLs.

Watch for: **confirmed** test coverage is not yet written (spec files are absent). **Likely** concern: S3 presigned POST URL generation returns a URI format rather than a proper signed POST object with form fields. **Confirmed** JPEG dimension extraction is stubbed with placeholder return values and will not validate dimensions correctly until a library like `sharp` is used.

**Verdict**: NEEDS_CHANGES

---

## High-level view

The Players module exposes a public, filterable directory. Search and detail endpoints return comprehensive player information including statistics grouped by format, provider attribution, and country/category metadata. No authentication required. The PlayerCategories module lists sortable categories used throughout the platform (e.g., MARQUEE, GOLD, EMERGING).

Teams are user-created and fully customizable. Creation requires authentication and returns a soft-deletable team entity with owner authorization. The backend stores primary/secondary colors as hex strings and validates format server-side. Team ownership controls who can modify or archive; member-based access is prepared but not yet enforced at the authorization layer. Any user can read any team; only the creator can modify or delete.

The Files module enforces the full secure upload pipeline. Clients request an upload intent, receive a presigned URL, upload directly to S3, then confirm the upload by sending the SHA256 hash of the file they uploaded. The backend downloads the file from S3, validates the hash, checks the file signature (magic bytes), confirms MIME type matches the declared type, and marks the asset ready. Authorization ensures that only the uploader can confirm their own upload and that only ready files are visible to everyone else. Presigned URLs never expose credentials to the browser.

Asset moderation provides a public reporting mechanism (rate-limited via endpoint but no implementation visible) and an admin-only case management workflow. Moderation cases track the reason, complaint text, resolution, and resolver identity, forming an audit trail.

---

<details>
<summary>Issues (8)</summary>

1. **Presigned POST URL format** — The S3 service returns `s3://{bucket}/{key}` which is not a valid HTTP upload URL. This likely breaks the entire client upload flow. See `s3.client.ts:generatePresignedPostUrl`.

2. **JPEG dimension parsing incomplete** — `FileSignatureValidator.extractImageDimensions` returns `{ width: 0, height: 0 }` for JPEG files, so dimension validation will never work for JPEG uploads. PNG parsing is correct but JPEG requires library integration.

3. **Team authorization not fully enforced** — The `isMember()` check in `teams.service.ts:updateTeam` is called but `TeamRepository.isMember()` just checks membership without validating role (MANAGER vs. regular MEMBER). Update authorization should distinguish whether members can actually modify the team.

4. **No unit or integration tests** — The phase summary claims "deferred to future phases" but Phase E is code-complete per the status. The instructions require testing for every feature before shipping. Player upsert correctness, S3 validation paths, and team permission boundaries are not tested.

5. **Player statistics provider attribution present but not complete** — Statistics DTO includes provider name and license notes, which is good for attribution. However, there's no enforcement that old/stale statistics still include provider metadata when fetched. If a player statistics record loses its provider FK relationship, attribution becomes silent.

6. **File asset authorization gap: uploader can read PENDING files** — `files.service.ts:getFile` allows the uploader to read PENDING_UPLOAD and PROCESSING status files. This is intentional to allow progress polling, but there's no documented timeout or cleanup for stale PENDING uploads. A very old upload request could accumulate indefinitely in the database.

7. **AssetModerationCase has no soft-delete or audit trail of resolver actions** — When a case is resolved, `resolvedById`, `status`, and `outcome` are updated in place. If an admin makes a mistake or malicious change, there's no history of who changed what and when. The model should include `resolutionChangedBy`, `resolutionChangedAt`, or an audit log relation.

8. **Shared contracts use Map<string, PlayerStatisticDto[]> for statistics** — JSON does not natively support Map. This will serialize/deserialize incorrectly over HTTP. The contract should use `Record<string, PlayerStatisticDto[]>` instead, and the service must convert the Map before returning the DTO.

</details>

---

<details>
<summary>Details</summary>

### S3 Upload Pipeline — Presigned URL Contract Mismatch

The `generatePresignedPostUrl` method returns `s3://bucket/team-logos/uuid`, which browsers cannot POST to. Correct presigned POST requires calling `AWS.S3.createPresignedPost()` which returns an HTTPS endpoint and form fields (including signature) for a multipart POST. The current implementation only generates a GET-signed URL syntax, breaking the entire client upload flow.

---

### File Signature Validation — PNG Only, JPEG Stubbed

JPEG dimension extraction is stubbed (`{ width: 0, height: 0 }`), so JPEG uploads bypass dimension validation. JPEG parsing requires scanning SOF markers, which is non-trivial without a library like `sharp`. If JPEG uploads are accepted without validation, the product silently changes from "validate dimensions 100x100 to 2000x2000" to "accept JPEG, skip dimension checks."

---

### Team Authorization — Member Role Not Validated

`TeamRepository.isMember()` checks existence but ignores the role field. Any team member can modify the team, regardless of role. This may be intentional (all members are editors) but is undocumented.

---

### No Test Coverage — Deferred But Required

The instructions require "unit test domain rules" and "integration test database behavior and authorization" for every feature. No `.spec.ts` files exist in the diff. The service business logic, authorization boundaries, and S3 validation paths are untested.

---

### Player Statistics Provider Attribution — Incomplete Relation Chain

If a DataProvider record is deleted, statistics lose provider attribution. The PLAN requires "Record data provider and freshness" and "Show attribution where required," but there's no constraint preventing provider deletion or policy defining when attribution is required. If statistics lose their provider, attribution becomes silent.

---

### File Upload Progress State — No Cleanup or Timeout

PENDING_UPLOAD records never expire. If a client abandons the browser after requesting an upload intent, the FileAsset record accumulates indefinitely. The presigned URL expires after 15 minutes, but the FileAsset does not, creating confusion when a client confirms an upload that no longer exists in S3.

---

### Asset Moderation — No Audit Trail of Resolutions

AssetModerationCase updates `resolvedById`, `status`, and `outcome` in place. If an admin changes their decision or escalates a case, the original decision is lost. The instructions require "Every sensitive action must write an audit event," but case resolutions have no audit trail.

---

### Shared Contracts — Map Type Breaks JSON Serialization

PlayerDetailDto uses `statistics: Map<string, PlayerStatisticDto[]>`. JSON does not serialize Map; it becomes an empty object `{}`. The contract should use `Record<string, PlayerStatisticDto[]>` and the service should convert the Map to a plain object before returning.

---

### File Asset Authorization — Public Read vs. Upload Status

Authorization logic differs between `getFile` and `getDownloadUrl` methods. `getFile` allows uploaders to see PENDING files (for polling), while `getDownloadUrl` has the same rules but different status checks. No documented polling contract exists (frequency, timeout).

---

### Type Safety — Error Handling Response Format

No error code enum exists. Clients receive error messages that may change, making error handling brittle. The backend should define error codes (e.g., `FILES:FILE_TOO_LARGE`, `FILES:HASH_MISMATCH`) and include them in all error responses.

---

</details>

---

<details>
<summary>File map</summary>

**New modules (5 total):**

- `apps/api/src/players/` — Player search, detail, category endpoints
- `apps/api/src/player-categories/` — Category listing
- `apps/api/src/teams/` — Team CRUD with ownership authorization
- `apps/api/src/files/` — Upload intent, confirmation, download, deletion
- `apps/api/src/asset-moderation/` — Public reporting, admin case management

**Shared contracts:**

- `packages/contracts/src/players.contract.ts` — PlayerListItem, PlayerDetailDto, PlayerStatisticDto
- `packages/contracts/src/teams.contract.ts` — TeamDetailDto, TeamListItem, FileAssetDto
- `packages/contracts/src/files.contract.ts` — UploadIntentRequest/Response, ConfirmUploadRequest, ModerationCaseDto

**Configuration:**

- `.env.example` — AWS S3, file size, MIME type constraints
- `apps/api/src/app.module.ts` — Module imports
- `apps/api/package.json` — AWS SDK dependencies

**Database schema (unchanged, existing):**

- `packages/database/prisma/schema.prisma` — Player, Team, FileAsset, AssetModerationCase models

**Full diff**: `git diff main...phase/e-players-teams-s3-pipeline`

</details>
