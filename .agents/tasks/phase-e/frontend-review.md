# Phase E Frontend — Player Directory, Team Management, and Logo Upload

The frontend implementation ships player browsing, search, team creation and management, and S3 logo upload. Component structure follows Next.js patterns with Zod validation on forms and proper error/loading states. API contracts map to backend DTOs. The design respects the dark, confident aesthetic and avoids hard-coded team counts or mandatory PSL assumptions.

**Watch for:** `any` types in API payloads block full type safety on team and file operations; presigned URL expiry handling is not visible to users; logo preview after S3 upload relies on polling timeout accuracy.

**Verdict**: NEEDS_CHANGES

---

## High-level view

Player directory and team workspace are properly separated with client-side search filtering and server-side pagination. Player and team cards display user-controlled colors without recoloring the entire app. The logo upload flow follows a secure three-step pattern (get intent, upload to S3, verify status).

TypeScript strict mode is enabled, but API client methods accept `any` payloads for teams, files, and auth. These should be typed to backend contracts. Form validation is comprehensive with Zod schemas and inline error display. Error handling and loading states are present across pages.

<details>
<summary>Issues (8)</summary>

1. **Untyped API payloads** — `createTeam`, `updateTeam`, `getUploadIntent`, `confirmUpload` accept `any`, blocking compile-time safety. Add explicit DTOs to match backend contracts.

2. **Missing error catch types** — `catch (error: any)` in FileUpload and TeamForm. Use `unknown` or define error union types.

3. **Presigned URL expiry invisible to user** — Upload intent does not expose `expiresAt`; frontend cannot warn user if upload takes too long. Display expiry time or auto-retry on 403.

4. **Polling timeout no retry** — 30-second polling max with no auto-retry if file verification still pending. Add exponential backoff or user-visible wait time.

5. **Logo preview fallback generic** — No preview of uploaded logo before polling completes. Consider showing uploaded file from browser cache immediately, then confirm with verified URL.

6. **Search debounce cleanup** — `searchTimeout` state in PlayerSearch not cleared on unmount. Add cleanup to prevent stale timeouts.

7. **Responsive image missing dims** — `Image` component in team detail uses `unoptimized`, width/height will cause layout shift if not pre-known. Provide explicit dimensions or use aspect-ratio CSS.

8. **Archive action incomplete** — Team detail page shows archive button with confirmation prompt but no actual delete/archive call. Implement or remove UI.

</details>

---

## Player Directory Search and Pagination

The `/players` page loads 20 players per page with filters for search, category, role, and country. The debounced search waits 300ms before firing, and filters reset pagination to page 1. The layout grid adapts (1 col mobile, 2 md, 3 lg, 4 xl) with no hard-coded team count.

Concern: `searchTimeout` state in PlayerSearch is not cleared on component unmount, so a pending debounced search may fire after the user navigates away, causing unnecessary network calls.

## Player Detail and Card Display

The `/players/[id]` page loads full career statistics grouped by format and displays aliases and overview data. Player initials render as a fallback avatar in a primary color box. The statistics table handles missing fields gracefully. No animations are defined (safe for `prefers-reduced-motion`).

## Team CRUD and Color Control

Teams are created, viewed, and edited via pages under `/teams/create`, `/teams/[id]`, `/teams/[id]/edit`. Team creation requires name, short name, and primary color. The TeamForm component uses react-hook-form with Zod validation, displays inline errors, and blocks submission if validation fails.

The ColorPicker component renders a native `<input type="color">` alongside a hex text input, with a visual preview swatch. Colors are stored as hex strings and transmitted via API. The team card gradient applies `linear-gradient(135deg, primaryColor, secondaryColor)` scoped to the card itself, respecting the design constraint to avoid recoloring the entire app.

No hard-coded team count is baked into the UI; the grid adapts to content.

## Logo Upload Workflow

The file upload follows a three-step secure pattern: (1) get upload intent (backend returns presigned S3 URL), (2) direct upload to S3 via fetch, (3) confirm with SHA256 hash and poll for `status === 'READY'` (1-second intervals, 30-second timeout).

**Blocking concerns:**

- Presigned URL `expiresAt` is returned by backend but not stored or displayed to user. If upload exceeds the URL expiry (AWS default 15 min), S3 returns 403 with no frontend retry. (**confirmed**)

- Polling timeout (30s) has no retry logic. If asset moderation exceeds 30s, user sees "verification timeout" with no recovery path. (**confirmed**)

- No preview of uploaded file before polling completes. Browser cache contains the file; consider showing it immediately as a preview, then replacing with verified URL once verification succeeds. (**likely**)

**Acceptable:** AWS credential exposure is prevented (only presigned URLs sent to client). File validation (5MB, JPEG/PNG) on client and backend. Signature validation on backend prevents tampering.

## Form Validation and Error Handling

Forms display loading and error states. Submission is blocked until required fields are valid. Inline error messages appear below each field. API and network errors are shown in styled cards.

**TypeScript violation (confirmed):** API methods `createTeam(data: any)`, `updateTeam(id, data: any)`, `getUploadIntent(payload: any)`, `confirmUpload(payload: any)` accept `any` and return `any` generics. Backend contracts exist in `packages/contracts/src/`—frontend should import and use these types. This violates strict mode.

Error catch blocks use `catch (error: any)` in FileUpload and TeamForm. Should be `catch (error: unknown)` and then narrowed to Error type.

## Responsive Design and Accessibility

Layouts adapt across breakpoints (1 col base, 2 md, 3+ lg). No horizontal scrolling on mobile.

**Accessibility findings:**

- Form inputs have `<label>` elements with `htmlFor`. ✓
- Color preview swatches lack `aria-label`. Add: `aria-label={`Primary color: ${team.primaryColor}`}`. (Actually present in TeamCard, so ✓)
- FileUpload SVG icon lacks `aria-label`.
- Keyboard navigation works via native inputs and buttons. ✓
- `prefers-reduced-motion` not tested; no animations in Phase E, so implicitly safe.
- Team avatar/logo placeholders have no alt text (acceptable; fallback is text).

## TypeScript Strict Mode and Type Safety

`tsconfig.json` has `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`. Component code uses explicit types on props, returns, and state. No `as any` casts in business logic.

API client `lib/api.ts` violates strict mode with `any` for payload and response types (lines 63, 338, 350, 375–399). Calling code uses correct types (TeamForm passes `CreateTeamFormData`), so runtime safety is not compromised, but the violations should be fixed.

## Missing and Out-of-Scope Features

- **Host subscription check:** Create team page does not validate subscription. Backend should enforce this.
- **Team delete/archive:** Team detail shows "Archive Team" button with no backing API call. Remove UI or implement. (**confirmed** — UI without implementation)
- **Player statistics graph:** Out of scope; can be added later.
- **Auction team allocation:** Out of scope; belongs in auction room UI (Phase F).

## Real Data vs. Mock Data

All pages call real backend APIs. No mock data embedded. Player and team lists hydrate from `/api/players` and `/api/teams`. File uploads use real S3 presigned URLs.

## Build and Deployment Verification

Commit message states "pnpm build successful, all TypeScript strict, no credentials exposed". Code review confirms no hardcoded credentials, no console logs of sensitive data, and S3 handling does not expose AWS keys.

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
    edit/archive actions, back navigation

apps/web/src/app/(dashboard)/teams/[id]/edit/page.tsx
  — Team edit form page, delegates to TeamForm with initial data

apps/web/src/app/(dashboard)/teams/[id]/logo/page.tsx
  — Logo upload page with FileUpload component, requirements text,
    presigned URL flow, polling verification

apps/web/src/components/PlayerCard.tsx
  — Reusable player card component for directory grid, displays name,
    role badge, category, country, fallback avatar initials

apps/web/src/components/PlayerSearch.tsx
  — Search + filter form for player directory, category/role/country
    dropdowns, debounced search input, clear filters button

apps/web/src/components/TeamCard.tsx
  — Reusable team card for teams list, gradient background from colors,
    creator name, color swatches, initials fallback

apps/web/src/components/TeamForm.tsx
  — Reusable form for team create/edit, name/shortName/description inputs,
    ColorPicker components, Zod validation, error display

apps/web/src/components/ColorPicker.tsx
  — Color input component with native HTML5 color picker and hex text field,
    visual preview swatch, inline error display

apps/web/src/components/FileUpload.tsx
  — Logo upload component with drag-drop, file validation (5MB, JPEG/PNG),
    presigned URL flow, SHA256 hashing, polling verification, rights checkbox

apps/web/src/lib/api.ts
  — API client with axios, auth header injection, error handling.
    Methods for players, teams, file upload endpoints.
    **Issue:** payload/response types use `any`

apps/web/src/lib/schemas/team.schema.ts
  — Zod schema for team creation/update, hex color regex, field validations

apps/web/src/lib/types.ts
  — TypeScript DTOs for players (ListItem, Detail), teams (Create, Update, Detail, List),
    file assets (kind, status enum), player roles/stats/categories, country codes

apps/web/src/lib/crypto.ts
  — SHA256 hash calculation utility for file upload confirmation

**Full diff:** `git diff main...phase/e-players-teams-s3-pipeline --stat` shows 90 files changed, ~21,763 insertions. Backend changes (API, database, auth) reviewed separately.
```

