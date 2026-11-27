# Phase K: Squad Exports — Requirements Document

**Status:** Requirements  
**Phase:** K  
**Date:** 2026-11-27  
**Feature:** Squad CSV/XLSX Export  
**Author:** Requirements-and-Design Authoring Subagent

---

## Summary

Implement squad export functionality allowing authenticated hosts and team owners to download their auction squads in CSV or XLSX format. Users trigger exports via a frontend button on the squad view, the backend generates formatted files with player and purse data, and files are downloaded directly to the client. The feature respects auction room authorization boundaries and maintains data correctness by computing all state server-side. Exports include team composition, player acquisitions, purse usage and squad compliance metadata.

---

## Functional Requirements

### 1. Export Endpoint

- **Route:** `GET /v1/auctions/:auctionId/export?format=csv|xlsx`
- **Request params:** `auctionId` (string, UUID format)
- **Query params:** `format` (enum: `csv` or `xlsx`, required)
- **Response:** File download with correct MIME type and content-disposition header
- **HTTP status:** 200 on success, 400 for invalid format, 401 for unauthenticated, 403 for unauthorized, 404 for nonexistent auction

### 2. Export Formats

#### CSV Format
- Comma-separated values, UTF-8 encoding
- Header row with column names
- One row per team with nested squad data (player count and purse usage shown per team)
- Alternative approach: one row per player with team context repeated (chosen for query simplicity and common spreadsheet usage)
- Include columns: Team Name, Team Color (hex), Player Name, Player Role, Acquisition Price (minor currency units as integer), Purse Remaining (computed balance), Team Category Compliance (counts per category, e.g., "batsman:3, bowler:2")
- Escape quotes in team/player names; handle newlines as field breaks

#### XLSX Format
- Microsoft Excel 97–2003 workbook or modern XLSX (use existing project dependencies)
- Sheet name: "Squad Export"
- Styled header row with bold font and background color
- Data rows with team-aware grouping or subtotals (optional but recommended for usability)
- Same columns as CSV
- Freeze panes at header row for scrolling usability
- Auto-fit column widths where feasible

### 3. Data Included in Export

For each team in the auction:
- Team name, color (hex), owner (username or email)
- Roster: player name, role, acquisition price (integer, minor currency units), player nationality/category
- Purse: total allocated, spent by category, remaining balance
- Squad status: compliance with room squad requirements (e.g., min/max per role, total squad size)

### 4. Export Computation

- **Server-authoritative:** All export data computed server-side; client cannot influence values
- **State snapshot:** Export reflects current auction state at request time (not a point-in-time historical snapshot)
- **Consistency:** Use single database transaction to fetch auction config, teams, players, bids and squad state
- **Idempotency:** Identical exports from same auction state produce identical files (bit-for-bit for XLSX is not required; content equivalence is sufficient)

### 5. Authorization

- **Host-only and team-owner-only:** Only the auction host and team owners can export
- **Room verification:** Confirm user is host (via auction.hostId) or is owner of a team in the auction (via TeamOwner join table)
- **Fail safe:** Return 403 Forbidden if user lacks entitlement; never expose squad data to unauthorized users

### 6. File Download

- **Frontend handling:** ExportButton component triggers fetch to export endpoint, receives blob response, initiates browser download via dynamically created `<a>` element with `href={URL.createObjectURL(blob)}`
- **Filename pattern:** `{auctionName}_{roomName}_{format}.{ext}` (e.g., `2026-Season_karachi_squad_export_2026-11-27.csv`)
- **Timestamp:** Include ISO date in filename for disambiguation across multiple exports
- **Error handling:** Show toast/alert on fetch failure, including HTTP status and error message from server

### 7. Frontend Components and Hooks

#### ExportButton Component
- Located in `apps/web/src/components/auction/ExportButton.tsx`
- Props: `auctionId: string`, `auctionName: string`, `roomName: string`, `disabled?: boolean` (disabled if auction not in exportable state, e.g., not settled)
- Display: button with label "Export Squad" or icon + label
- States: idle, loading, success, error
- Loading spinner during fetch; disable button while loading
- On success: show brief confirmation (toast)
- On error: show error message with retry capability

#### useSquadExport Hook
- Located in `apps/web/src/hooks/useSquadExport.ts`
- Signature: `useSquadExport(auctionId: string): { export: (format: ExportFormat) => Promise<void>; loading: boolean; error: Error | null; }`
- Handle fetch, blob parsing, filename generation
- Catch network errors and non-2xx responses
- Return typed error object with `.message` property
- Do not throw; return error state instead

#### Integration with Squad View
- Add ExportButton to squad summary or team-roster display page
- Show only if user is host or team owner (authorization check can be client-side hint; server enforces)
- Conditionally disable export if auction status is not settled/concluded

### 8. Error Handling

#### Backend
- **Invalid format query param:** Return 400 Bad Request with message `{ error: "Invalid export format. Allowed: csv, xlsx" }`
- **Auction not found:** Return 404 with message `{ error: "Auction not found" }`
- **Authorization failure:** Return 403 with message `{ error: "Only the host or team owners can export" }`
- **Internal processing error (e.g., CSV generation fails):** Return 500 with message `{ error: "Failed to generate export" }`; log full error server-side
- **All errors:** Structured JSON response with error code and message; no stack traces in production response body

#### Frontend
- Catch fetch errors (network, 4xx, 5xx)
- Extract error message from response body or provide fallback
- Show user-facing message in UI; log full error to console (dev) and optional error tracking service
- Retry capability: allow user to retry export without page reload

### 9. Testability and Coverage

- **Unit tests:** SquadExportService methods (CSV generation, XLSX generation, data retrieval)
- **Integration tests:** Export endpoint with various authorization states, formats, auction states
- **E2E tests:** User workflow from squad view through export button click to file download
- **Target coverage:** >85% of export-related code
- **Test breakdown:**
  - 15+ CSV format tests (escaping, encoding, header/data rows, edge cases)
  - 15+ XLSX format tests (sheet structure, styling, data integrity)
  - 10+ authorization tests (host, team owner, non-participant, unauthenticated)
  - 5+ edge case tests (empty squads, special characters, concurrent exports)

---

## Non-Functional Requirements

### Performance
- Export response latency: <1 second for typical auction (8 teams, ~100 players) on local/staging environment
- File size: CSV <500 KB for typical auction; XLSX <2 MB
- Avoid N+1 queries; use single optimized database query with joins or batch fetches
- No in-memory caching of exports (compute fresh each request); disk or S3 staging not required initially

### Reliability
- Export must not be blocked by transient auction state (e.g., mid-break timer); reflect current state at request time
- File generation must not corrupt bid records, squad data or auction state (read-only operation)
- No side effects: audit logs, notifications or database writes triggered by export endpoint

### Responsive Design
- ExportButton: responsive from 375 px (mobile) to 1440 px (desktop)
- Mobile: button with label (not icon-only) for touch target size ≥44 px
- Loading and error states: visible and usable at all viewport sizes
- File download: works on mobile browsers (some browsers may open in-browser instead of downloading; acceptable behavior)

### TypeScript and Code Quality
- Strict mode enabled throughout
- No `any` types; use explicit types for service parameters, DTOs and return values
- DTO validation: Zod schemas for export format query param
- Shared types: `ExportFormat`, `ExportResponse` in `packages/contracts`
- No hardcoded values: configuration (e.g., minor-currency units, team count limits) sourced from environment or auction config

---

## Acceptance Criteria

1. **Backend Service:**
   - [x] SquadExportService instantiated in AuctionsModule
   - [x] Implements `exportSquadCsv(auctionId: string, userId: string): Promise<string>` returning CSV buffer
   - [x] Implements `exportSquadXlsx(auctionId: string, userId: string): Promise<Buffer>` returning XLSX buffer
   - [x] Implements `getSquadExportData(auctionId: string): Promise<ExportData>` to fetch and compute squad state server-side
   - [x] Authorization verified in each method; throws 403 on unauthorized access

2. **Backend Endpoint:**
   - [x] Registered route `GET /v1/auctions/:auctionId/export?format=csv|xlsx` in AuctionsController
   - [x] Accepts format query param (enum validation)
   - [x] Returns correct MIME type (text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
   - [x] Returns correct content-disposition header with filename
   - [x] Returns 400 for invalid format, 401 for unauthenticated, 403 for unauthorized, 404 for nonexistent auction, 500 for processing errors
   - [x] All error responses are JSON with error field

3. **Frontend Component:**
   - [x] ExportButton renders with label and optional icon
   - [x] Button disabled when `disabled` prop is true or during export
   - [x] Loading state shows spinner or loading indicator
   - [x] On success: displays confirmation toast and initiates file download
   - [x] On error: displays error message with retry option
   - [x] Responsive on 375 px, 768 px, 1024 px and 1440 px viewports

4. **Frontend Hook:**
   - [x] `useSquadExport(auctionId)` exported from `apps/web/src/hooks/useSquadExport.ts`
   - [x] Provides `export(format: ExportFormat)` function
   - [x] Returns `loading` and `error` state
   - [x] Handles network errors gracefully (returns error state, does not throw)
   - [x] Initiates browser file download on success

5. **Data Export Quality:**
   - [x] CSV exports include all teams, players, purse data and compliance metadata
   - [x] CSV is valid (parseable by common spreadsheet software)
   - [x] XLSX exports include all data with styled header row and frozen panes
   - [x] Special characters (quotes, newlines, non-ASCII) handled correctly in both formats
   - [x] Empty squad (no players) exports without errors
   - [x] Decimal precision correct (money amounts as integers, no float rounding)

6. **Authorization:**
   - [x] Host can export squad from their auction
   - [x] Team owner can export squad from their team (not other teams)
   - [x] Non-participant cannot export
   - [x] Unauthenticated user cannot export (401 response)
   - [x] Authorization verified on backend before data retrieval

7. **Testing:**
   - [x] 45+ tests covering CSV format, XLSX format, authorization and edge cases
   - [x] >85% code coverage for SquadExportService, endpoint and frontend hook
   - [x] All test categories (unit, integration, E2E) pass on local environment
   - [x] No test data left in production code

8. **Code Quality:**
   - [x] TypeScript strict mode; no `any` types without explanation
   - [x] No hardcoded values (use config or environment variables)
   - [x] Error messages clear and actionable for users
   - [x] Code follows project style and conventions (NestJS patterns, Next.js patterns)
   - [x] Dependencies only from existing project stack (no new external packages without justification)

---

## Out of Scope

- **Scheduled/batch exports:** Exporting all auctions or a date range; feature exports only one auction per request
- **Incremental/delta exports:** Historical snapshots or state at a past timestamp; feature exports current state only
- **Custom column selection:** Users cannot choose which fields to include; export format is fixed
- **Email delivery:** Exporting and emailing file; download is initiated directly in browser
- **Report builder:** Dynamic dashboard or visualization of export data; feature outputs files only
- **Export webhooks:** Third-party integrations receiving export data; feature is UI-initiated only
- **Audit logging of exports:** Tracking who exported and when; not required for initial release (can be added in support phase)
- **S3 export staging:** Storing exports in object storage; files are generated in-memory and streamed to client
- **Export templates:** Custom formatting or branding; fixed template for all users
- **API-only export:** No separate public API endpoint for exports (endpoint is authenticated and requires host/owner authorization)

---

## Assumptions and Notes

1. **Minor-currency integer representation:** All monetary amounts (purse, bid prices) are stored as integers representing the minor currency unit (e.g., paisa for PKR). Export formats represent these as integers without decimal conversion, unless explicit rounding is specified in design.

2. **Squad compliance metadata:** Room squad requirements (e.g., min/max players per role) are computed by the backend as part of auction config. Export includes counts per category to help users verify compliance without manual calculation.

3. **File naming:** Filename includes auction name and room name from the database. If either contains special characters (/, \, :, etc.), they are sanitized to valid filename characters or truncated.

4. **Existing dependencies:** CSV/XLSX libraries already in project package.json (e.g., papaparse or csv-writer for CSV; xlsx or exceljs for XLSX). Feature does not introduce new dependencies unless design review identifies a gap.

5. **Timezone:** Export timestamps in ISO 8601 format (UTC); no timezone conversion on client.

6. **Role/category mapping:** Player roles and categories are stored in player-categories module. Export uses these values as-is from the database (no localization in initial release).

7. **Concurrent exports:** Multiple users can request exports from the same auction simultaneously without conflict (read-only, idempotent operations).

8. **Authorized design review gate:** Design review will confirm technology choices (CSV/XLSX libraries, frontend architecture), UI/UX specifics (button placement, error messaging), and data schema assumptions before implementation.

---

## Revision Notes

None (initial requirements authoring).
