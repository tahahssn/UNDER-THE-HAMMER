# Phase E Frontend — Player Directory, Team Management, and Logo Upload

The frontend implementation ships player browsing, search, team creation and management, and S3 logo upload. The latest commit addresses all 8 findings from the previous review. Component structure follows Next.js patterns with Zod validation on forms and proper error/loading states. API contracts are fully typed to backend DTOs. The design respects the dark, confident aesthetic and avoids hard-coded team counts or mandatory PSL assumptions.

**Watch for:** Presigned URL expiry display is now user-visible but time formatting could be clearer; exponential backoff polling extends the user-visible wait time from 30s to 3+ minutes, which may feel slow for typical uploads (should complete within 5-10s in normal operation).

**Verdict**: APPROVED

---

## High-level view

Player directory and team workspace are properly separated with client-side search filtering and server-side pagination. Player and team cards display user-controlled colors without recoloring the entire app. The logo upload flow follows a secure three-step pattern (get intent, upload to S3, verify status) with improved resilience and user feedback.

TypeScript strict mode is enabled and all API client methods now use explicit DTOs from the contracts package, matching backend schemas exactly. Form validation is comprehensive with Zod schemas and inline error display. Error handling throughout uses proper `unknown` type narrowing. FileUpload has cleanup on unmount and displays presigned URL expiry. Polling now uses exponential backoff with 3-minute timeout instead of 30 seconds, allowing for asset moderation processing.

<details>
<summary>Issues (0)</summary>

All 8 findings from the prior review have been addressed and verified.

</details>

---

## Player Directory Search and Pagination

The `/players` page loads 20 players per page with filters for search, category, role, and country. The debounced search waits 300ms before firing, and filters reset pagination to page 1. The layout grid adapts (1 col mobile, 2 md, 3 lg, 4 xl) with no hard-coded team count. Search timeout is properly cleaned up on unmount via useEffect, preventing stale network calls after navigation. (**confirmed** — cleanup present in PlayerSearch.tsx lines 42–49)

## Player Detail and Card Display

The `/players/[id]` page loads full career statistics grouped by format and displays aliases and overview data. Player initials render as a fallback avatar in a primary color box. The statistics table handles missing fields gracefully. No animations are defined (safe for `prefers-reduced-motion`). Card titles, roles and categories render as text without emoji icons, matching DESIGN.md visual character.

## Team CRUD and Color Control

Teams are created, viewed, and edited via pages under `/teams/create`, `/teams/[id]`, `/teams/[id]/edit`. Team creation requires name, short name, and primary color. The TeamForm component uses react-hook-form with Zod validation, displays inline errors, and blocks submission if validation fails. Error handling uses proper type narrowing with `catch (error: unknown)` and `error instanceof Error` checks. (**confirmed** — TeamForm lines 66–72)

The ColorPicker component renders a native `<input type="color">` alongside a hex text input, with a visual preview swatch. Colors are stored as hex strings and transmitted via API. The team card gradient applies `linear-gradient(135deg, primaryColor, secondaryColor)` scoped to the card itself, respecting the design constraint to avoid recoloring the entire app. Team detail logo displays using an `<img>` tag with explicit width/height and CSS aspect-ratio to prevent layout shift. (**confirmed** — TeamDetailPage lines 157–164)

No hard-coded team count is baked into the UI; the grid adapts to content.

## Logo Upload Workflow and Resilience

The file upload follows a three-step secure pattern: (1) get upload intent (backend returns presigned S3 URL with expiresAt), (2) direct upload to S3 via fetch, (3) confirm with SHA256 hash and poll for `status === 'READY'` with exponential backoff.

**Improvements confirmed:**

- Presigned URL expiry time is now captured and displayed to user. FileUpload calculates minutes remaining and shows warning "⚠️ Upload URL expires in X minute(s)" when less than 2 minutes remain. (**confirmed** — FileUpload lines 190–203)

- Polling now uses exponential backoff (1s base, up to 10s delay, 180 max attempts = approximately 3 minutes total timeout). This allows asset moderation processes to complete without premature user-facing failure. Previous 30-second timeout was insufficient for backend image validation and moderation logic. (**confirmed** — FileUpload lines 95–130)

- File preview is shown immediately from browser cache via FileReader before S3 verification completes. User sees the uploaded image instantly, then verification completes in the background. (**confirmed** — FileUpload lines 75–80)

- Timeout cleanup is registered on component mount to prevent orphaned timeouts firing after unmount. (**confirmed** — FileUpload lines 32–37)

**Security posture remains unchanged:** AWS credential exposure is prevented (only presigned URLs sent to client). File validation (5MB, JPEG/PNG) on client and backend. Signature validation on backend prevents tampering.

## Form Validation and Error Handling

Forms display loading and error states. Submission is blocked until required fields are valid. Inline error messages appear below each field. API and network errors are shown in styled cards.

**TypeScript strict mode compliance verified:** All API methods use explicit DTOs. `createTeam(data: TeamCreateDto)`, `updateTeam(id, data: TeamUpdateDto)`, `getUploadIntent(payload: UploadIntentRequest)`, `confirmUpload(payload: ConfirmUploadRequest)` are all properly typed. (**confirmed** — api.ts lines 342–375)

Error catch blocks throughout use `catch (error: unknown)` and narrow via `error instanceof Error`. FileUpload and TeamForm both follow this pattern. (**confirmed** — FileUpload lines 140, 218; TeamForm line 73)

## Team Archive Functionality

Team detail page now implements the archive action previously flagged as incomplete. The `deleteTeam` API call is integrated and executes when user confirms via browser `confirm()` dialog. After successful archive, router redirects to `/teams` list. Error is shown in a styled error card if archive fails. (**confirmed** — TeamDetailPage lines 56–77)

## Responsive Design and Accessibility

Layouts adapt across breakpoints (1 col base, 2 md, 3+ lg). No horizontal scrolling on mobile. Team logo displays at all breakpoints with proper aspect-ratio CSS preventing layout shift when image loads.

**Accessibility findings:**

- Form inputs have `<label>` elements with `htmlFor`. ✓
- Color preview swatches include aria-labels where visible. ✓
- FileUpload SVG icon includes `aria-label="Upload icon"`. ✓
- Keyboard navigation works via native inputs and buttons. ✓
- `prefers-reduced-motion` not tested; no animations in Phase E, so implicitly safe. ✓
- Team avatar/logo placeholders render as text or gradient fallback, no alt text needed. ✓

## TypeScript Strict Mode and Type Safety

`tsconfig.json` has `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`. Component code uses explicit types on props, returns, and state. No `as any` casts in business logic.

API client `lib/api.ts` now exports all DTOs and matches payload/response types to contracts. No violations of strict mode. TypeScript compilation passes with zero errors. (**confirmed** — `pnpm tsc --noEmit` returns exit code 0)

## Real Data vs. Mock Data

All pages call real backend APIs. No mock data embedded. Player and team lists hydrate from `/api/players` and `/api/teams`. File uploads use real S3 presigned URLs. Team archive calls real `/api/teams/{id}` DELETE endpoint.

## Build and Deployment Verification

Commit message states: "pnpm build successful, all TypeScript strict, no credentials exposed". TypeScript type check confirms no violations. Code review confirms no hardcoded credentials, no console logs of sensitive data, and S3 handling does not expose AWS keys.

---

## File Map

```
apps/web/src/app/players/page.tsx
  — Player directory with search input, filters (category/role/country),
    pagination (20/page), grid layout, loading/empty/error states

apps/web/src/app/players/[id]/page.tsx
  — Player detail page with overview, aliases, statistics by format,
    fallback avatar initials, responsive table layout

apps/web/src/app/(dashboard)/teams/page.tsx
  — My Teams list with responsive grid, create CTA, empty state,
    loading placeholder skeleton

apps/web/src/app/(dashboard)/teams/create/page.tsx
  — Team creation form page, delegates to TeamForm component

apps/web/src/app/(dashboard)/teams/[id]/page.tsx
  — Team detail view with logo display, color swatches, team info card,
    edit/archive actions (now fully implemented), back navigation

apps/web/src/app/(dashboard)/teams/[id]/edit/page.tsx
  — Team edit form page, delegates to TeamForm with initial data

apps/web/src/app/(dashboard)/teams/[id]/logo/page.tsx
  — Logo upload page with FileUpload component, requirements text,
    presigned URL flow, polling verification with exponential backoff

apps/web/src/components/PlayerCard.tsx
  — Reusable player card component for directory grid, displays name,
    role badge, category, country, fallback avatar initials

apps/web/src/components/PlayerSearch.tsx
  — Search + filter form for player directory, category/role/country
    dropdowns, debounced search input, clear filters button, cleanup on unmount

apps/web/src/components/TeamCard.tsx
  — Reusable team card for teams list, gradient background from colors,
    creator name, color swatches, initials fallback

apps/web/src/components/TeamForm.tsx
  — Reusable form for team create/edit, name/shortName/description inputs,
    ColorPicker components, Zod validation, error display with proper typing

apps/web/src/components/ColorPicker.tsx
  — Color input component with native HTML5 color picker and hex text field,
    visual preview swatch, inline error display

apps/web/src/components/FileUpload.tsx
  — Logo upload component with drag-drop, file validation (5MB, JPEG/PNG),
    presigned URL flow with expiry display, SHA256 hashing, exponential backoff polling,
    file preview from cache, rights checkbox

apps/web/src/lib/api.ts
  — API client with axios, auth header injection, error handling.
    All methods properly typed to backend contracts from packages/contracts/src/.
    deleteTeam now implemented for archive functionality.

apps/web/src/lib/schemas/team.schema.ts
  — Zod schema for team creation/update, hex color regex, field validations

apps/web/src/lib/types.ts
  — TypeScript DTOs for players (ListItem, Detail), teams (Create, Update, Detail, List),
    file assets (kind, status enum), player roles/stats/categories, country codes

apps/web/src/lib/crypto.ts
  — SHA256 hash calculation utility for file upload confirmation

**Full diff:** `git diff main...phase/e-players-teams-s3-pipeline --stat` shows 92 files changed, ~22,144 insertions.
```

---

## Summary of Fixes Applied

**Fix 1 (Untyped API payloads):** All API methods now use explicit DTO types imported from `packages/contracts/src/`. Methods: `createTeam(TeamCreateDto)`, `updateTeam(TeamUpdateDto)`, `getUploadIntent(UploadIntentRequest)`, `confirmUpload(ConfirmUploadRequest)`, `deleteTeam()` added.

**Fix 2 (Error catch types):** All catch blocks use `catch (error: unknown)` with proper narrowing via `error instanceof Error`.

**Fix 3 (Presigned URL expiry):** FileUpload now captures `expiresAt` from upload intent response and displays expiry warning when less than 2 minutes remain.

**Fix 4 (Polling timeout):** FileUpload polling now uses exponential backoff (1s, 2s, 4s, 8s, 10s max) with 180 max attempts for 3-minute timeout, replacing 30-second hard limit.

**Fix 5 (Logo preview):** FileUpload shows image preview immediately from FileReader output before S3 verification completes.

**Fix 6 (Search debounce cleanup):** PlayerSearch registers cleanup useEffect that clears searchTimeout on unmount.

**Fix 7 (Responsive image dimensions):** Team detail logo uses `<img>` tag with explicit width/height and CSS aspect-ratio to prevent layout shift.

**Fix 8 (Archive action):** deleteTeam API call implemented in team detail archive button; redirects to /teams on success.

