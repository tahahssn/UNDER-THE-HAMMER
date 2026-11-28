# Squad Export Feature (CSV/XLSX)

Implements squad export functionality for auctions with dual format support (CSV and XLSX), authorization enforcement at host/team-owner level, and responsive frontend UI. The backend service handles data aggregation with proper compliance status reporting; the frontend hook manages file download with client-side filename generation and error handling. 45+ tests cover authorization boundaries, format validation, edge cases, and responsive behavior.

Watch for: **confirmed** precision loss on BigInt to string conversion for purse balances in both CSV and XLSX (numbers exceeding JavaScript's MAX_SAFE_INTEGER will lose decimal precision when displayed); **confirmed** contract mismatch between service's formatComplianceStatus (returns string) and contracts' SquadExportResponse type (expects structured violations object); **likely** frontend filename collision issue under heavy concurrent exports (no request deduplication, race condition on simultaneous exports for same auction); **confirmed** missing test coverage for purse balance aggregation queries and transaction groupBy edge cases (empty results handling not exercised).

**Verdict**: NEEDS_CHANGES

## High-level view

The feature separates export logic cleanly into a dedicated service (SquadExportService) that aggregates auction squad data, applies authorization checks, and streams formatted output. Backend authorization mirrors product requirements—only the host or active (non-released) team owners can export, enforced via database queries. The controller validates format parameter and routes to the appropriate export method, letting NestJS exception handling surface authorization/not-found errors to the client.

The frontend hook provides a symmetrical interface: it fetches from the export endpoint, validates response status and blob size, and triggers browser download via link element. The ExportButton component wraps the hook with UI state (loading spinner, error banner with dismiss action, disabled button state) and passes auction metadata to the hook for client-side filename generation to match the backend naming scheme.

Data structure includes nested relationships (auction → teams → acquisitions → players, plus team owners and purse ledger aggregation). Compliance status is computed by checking squad validations and violation records. CSV uses PapaParse for escaping; XLSX uses ExcelJS with frozen header row and auto-fitted column widths. Both formats convert BigInt to string, which is correct for monetary values in paisa but introduces precision risk if values exceed JavaScript's safe integer range.

The testing pyramid covers authorization (host, team owner, unauthorized user), format validation (case-insensitivity, invalid format rejection), data presence (empty teams, missing squads, multiple teams), error propagation (404 auction, 403 forbidden), and UI behavior (button disabled states, error dismissal, filename generation, file download).

<details>
<summary>Issues (5)</summary>

1. **BigInt precision on export** — Purse balance and acquisition price are BigInt in the database but converted to string for CSV/XLSX export. This is correct for monetary values, but if values exceed 2^53–1 (JavaScript's MAX_SAFE_INTEGER), frontend display of that string will lose decimal precision when parsed by JavaScript or Excel. Confirm max purse balance/price in product spec; if unbounded, use decimal library or string-only storage in export cells.

2. **Compliance status contract mismatch** — SquadExportService.formatComplianceStatus returns a plain string ("Compliant" or "Violations: RuleType:Count, ..."), but SquadExportResponse type in contracts defines complianceStatus as a structured object with { valid: boolean, violations: [...] }. The API returns the string; TypeScript allows it at the type level, but runtime data doesn't match the declared shape. Align the contract or change service to return structured compliance.

3. **Frontend filename generation race condition** — useSquadExport.generateFilename is called after fetch completes, but there's no request deduplication or concurrent export guard. If a user clicks CSV then immediately clicks XLSX (before the first completes), both use the same generated timestamp and auctionId, resulting in the same filename. A second rapid click will trigger two downloads with identical names. Add request deduplication or timestamp/nonce to filename.

4. **Purse aggregation test gap** — SquadExportService.getSquadExportData calls teamPurseTransaction.groupBy and maps the result to purseMap, but test mocks don't exercise the case where groupBy returns an empty array or where auctionTeamId is not in purseMap. Edge cases like a team with acquisitions but no transactions should be verified—currently the fallback purseMap.get(team.id) || 0n is untested.

5. **Case sensitivity in test data** — ExportButton test at line 194 expects screen.getByText('Export failed: Not authorized') but the error state in the test setup only provides 'Export failed' without the detail. The test passes because fireEvent adds the error, but this fragile expectation should be tightened to match the actual error message passed into the component.

</details>

<details>
<summary>Details</summary>

### Authorization via host and team-owner check

The service enforces two-step authorization: host check against auction.hostId, then fallback to active team owner (releasedAt = null). Database queries are lean (only id and hostId selected), and error messages distinguish between missing auction (404) and unauthorized user (403). The @UseGuards(JwtGuard) decorator ensures unauthenticated requests are rejected before export logic runs.

### Data aggregation with nested relationships and compliance status

The getSquadExportData performs a single auctionTeam.findMany with four includes: team, acquisitions (with player), owners (non-released), and squadValidations (latest). The teamPurseTransaction.groupBy aggregates balances by team and falls back to 0n if no transactions exist. Compliance status is computed from squadValidations[0]—"Compliant" if no violations, else "Violations: RuleType:count". This string format is convenient for export but doesn't match the SquadExportResponse contract type, which expects structured violations.

### Format validation and error propagation

The exportSquad controller method validates format parameter: must be present and one of the ExportFormat enum values, case-insensitive. Missing or invalid format throws BadRequestException with allowed values listed. The service methods delegate to verifyExportAuthorization and getSquadExportData; authorization/not-found exceptions bubble to controller's catch block, which re-throws known exceptions and wraps unknowns as InternalServerErrorException.

### CSV serialization with PapaParse

PapaParse is called with { header: true, quotes: true, quoteChar: '"', escapeChar: '"' }, producing RFC 4180 CSV with quoted fields and escaped quotes. For teams with no acquisitions, one row is created with playerName = "(no players)"; for teams with acquisitions, one row per acquisition. This denormalized format is correct for CSV and mirrors expected spreadsheet structure.

### XLSX formatting with frozen header and column widths

ExcelJS is used with a frozen header row (bold white on blue, ySplit: 1). Data rows are structured identically to CSV. Columns are auto-fitted (team 20, color 15, owners 25, etc.); price/purse columns (7–8) are right-aligned for numeric consistency. The workbook is serialized to buffer and sent with application/vnd.openxmlformats-officedocument.spreadsheetml.sheet MIME type.

### Frontend hook with fetch, blob handling, and file download

The useSquadExport hook retrieves the token from localStorage, constructs the fetch URL with format parameter, and makes a GET request with Authorization header. If response is not ok, it attempts to parse an error message from the response body, falling back to statusText if JSON parse fails. The hook validates blob size > 0, creates an object URL, constructs an anchor element, clicks it for download, and revokes the URL after completion. This is the standard browser download pattern.

### Frontend filename generation and localStorage dependency

The hook's generateFilename function mirrors the backend naming scheme: squad_export_<shortId>_<sanitized_name>_<date>.<ext>. The sanitize logic strips special characters, collapses underscores, and caps the name at 200 characters. The hook reads the auth token from localStorage.getItem('token'). If the token key changes or the token is missing, the export fails.

### Component UI state and error dismissal

The ExportButton component receives auctionId, auctionName, roomName, and optional disabled prop. It calls useSquadExport and manages errorDismissed state to allow users to hide error messages. Buttons are disabled during loading or when the disabled prop is true. The error alert has a dismiss button. The UI is responsive (flex-col on mobile, sm:flex-row on larger screens) using Tailwind classes. Loading state shows "Generating export...", idle state shows help text.

### Test coverage summary

Backend service tests cover authorization (host, active team owner, unauthorized, released owner, missing auction), data structure (teams, acquisitions, owners, purse balance), empty squads, CSV/XLSX formatting, compliance status (Compliant, Violations, Unknown), and filename generation.

Backend controller tests cover format validation (missing, invalid, case-insensitive), CSV/XLSX headers and MIME types, authorization errors (403), auction not found (404), and internal errors (500).

Frontend hook tests cover CSV/XLSX exports, error handling (network, 404, 403, JSON parse failure), filename generation, authentication (missing token), empty blob detection, and object URL cleanup.

Component tests cover rendering, loading state, button clicks, error display, dismissal, disabled prop, multiple exports, accessibility, and hook prop passing.

**Not tested:** Purse aggregation with empty groupBy results (team with acquisitions but no transactions), concurrent export requests (filename race condition), BigInt precision loss > MAX_SAFE_INTEGER, backend service with real Prisma queries, frontend download in non-jsdom browsers, ExportButton + useSquadExport integration in live auction context.

### Responsive design and mobile compatibility

ExportButton uses `flex flex-col sm:flex-row gap-2` for responsive layout (vertical stack on mobile < 640px, horizontal on larger screens). Button text and icons scale with viewport. Text sizes are small (text-sm buttons, text-xs help text) to fit mobile. The Tailwind classes are correct for the range; no hardcoded widths or brittle layout logic.

</details>

## File map

<details>
<summary>Files changed (8)</summary>

**Backend:**
- `apps/api/src/auctions/services/squad-export.service.ts` (270 lines) — SquadExportService with authorization, data aggregation, CSV/XLSX export methods
- `apps/api/src/auctions/auctions.controller.ts` (mod ~40 lines) — Added exportSquad route handler, format validation, response headers
- `apps/api/src/auctions/__tests__/squad-export.service.spec.ts` (530+ lines) — 45+ test cases covering authorization, data structure, format generation, edge cases
- `apps/api/src/auctions/__tests__/squad-export.controller.spec.ts` (200+ lines) — Controller route tests: format validation, headers, error cases

**Frontend:**
- `apps/web/src/components/auction/ExportButton.tsx` (110 lines) — React component with CSV/XLSX buttons, loading state, error banner, Tailwind responsive layout
- `apps/web/src/hooks/useSquadExport.ts` (90 lines) — Custom hook: fetch, file download, error handling, filename generation
- `apps/web/src/components/auction/__tests__/ExportButton.spec.tsx` (280+ lines) — Component tests: rendering, button clicks, error display, accessibility
- `apps/web/src/hooks/__tests__/useSquadExport.spec.ts` (320+ lines) — Hook tests: fetch flow, error cases, filename generation, blob handling

**Contracts:**
- `packages/contracts/src/exports.contract.ts` (mod ~50 lines) — ExportFormat enum, DTO/response types (compliance status type mismatch noted)

</details>

---

**Full diff:** `git diff main -- apps/api/src/auctions/services apps/api/src/auctions/__tests__ apps/api/src/auctions/auctions.controller.ts apps/web/src/components/auction apps/web/src/hooks packages/contracts/src/exports.contract.ts`

