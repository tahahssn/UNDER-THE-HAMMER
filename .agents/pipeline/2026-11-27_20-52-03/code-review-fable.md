# Squad Export Service: CSV and XLSX Export Endpoints

Implements squad data export capability for authenticated users (host or active team owner) via GET `/v1/auctions/:id/export?format=csv|xlsx`. Includes backend service for data aggregation and format generation, frontend hook and button component for file download, and comprehensive test coverage (45+ tests).

The implementation correctly gates exports to authorized users, filters team data for non-host owners, escapes formula injection in CSV/XLSX output, and handles both formats with proper headers and content types. Authorization is enforced before data retrieval; team-owner exports are scoped to their own squad only via the `authorizedTeamId` filter.

**Watch for**: Authorization model bifurcation in controller—`verifyExportAuthorization` is called twice (once in controller, once in export methods), creating redundant lookups and a brief window where the controller sees different auth state than the export service.

**Verdict**: NEEDS_CHANGES

---

## High-level view

Authorization and data scoping have a redundancy gap: `verifyExportAuthorization` is called in the controller to fetch metadata for the filename, then again inside `exportSquadCsv` and `exportSquadXlsx`. If authorization state changes between calls (team owner is released), the filename reflects full auction scope while the export itself is filtered to empty results, creating asymmetry without data leaks. Consolidate to a single verification point.

Frontend export uses fetch-to-blob-to-link mechanics with proper error handling. The `useSquadExport` hook duplicates filename generation logic from the backend (`sanitizeFilename`, `generateFilename`), creating a sync burden; if truncation rules or timestamp formats diverge, predicted and actual filenames will mismatch.

Formula injection escaping correctly targets player and team names with prefix checks and quote-escaping. Escaping is not applied to `playerRole` or `playerCategory` fields, an inconsistency but low-risk since those are typically curated rather than user-supplied.

Data retrieval runs in a read-committed transaction with proper `authorizedTeamId` filtering for team-owner scoping. Compliance status is built as a structured object then converted to string for export, adding unnecessary serialization; for exports, format as string upfront.

---

<details>
<summary>Issues (3)</summary>

1. **Redundant authorization checks** — `verifyExportAuthorization` is called in the controller to fetch metadata, then again in `exportSquadCsv` and `exportSquadXlsx`. If a team owner is released between calls, the filename may reference full auction scope while the export is filtered to empty results. Consolidate to single-call pattern: auth in controller, pass scoped teamId to export methods, and fetch data once.

2. **Duplicate filename generation logic** — Frontend `useSquadExport` and backend `SquadExportService` both implement `sanitizeFilename` and `generateFilename`. If rules diverge (e.g., max length changes), files may be generated with names the client predicts incorrectly. Use backend-generated filename in export response header or fetch it via metadata endpoint.

3. **Oversized compliance structure for exports** — The `ComplianceStatusDetail` object with violation array is returned from `getSquadExportData` and then immediately converted to a string for CSV/XLSX. This adds serialization cost with no benefit for file consumers. For export-only reads, format compliance as a string upfront in the data layer.

</details>

## Details

<details>
<summary>Details</summary>

### Authorization model and double-check pattern

The controller calls `verifyExportAuthorization` to get metadata for the filename, then `exportSquadCsv` and `exportSquadXlsx` call it again. This revalidation breaks the authorization-then-action contract. If a team owner's `releasedAt` is set between the two checks, the controller sees an authorized user and calculates a filename, but `exportSquadCsv` throws `ForbiddenException`. The user gets an error mid-operation instead of a fail-fast.

**Fix**: Verify authorization once in the controller, pass `authorizedTeamId` to both `getSquadExportData` and export methods, eliminate internal re-verification.

**Likely confirmed** — Code inspection shows `verifyExportAuthorization` called in controller and in both export methods.

### Filename generation split across client and server

The frontend `useSquadExport` hook includes `sanitizeFilename` and `generateFilename` that mirror the backend service's implementations. If the truncation logic, character replacement, or timestamp format diverges, the client's predicted filename and server's actual filename will mismatch. The server generates the authoritative filename for the response header; the client should use that value instead of predicting locally.

**Fix**: Return the final filename from the backend in the response header or metadata endpoint, so the client uses the authoritative value.

**Likely** — Code inspection shows two separate `sanitizeFilename` and `generateFilename` implementations.

### Compliance status object lifecycle

`getSquadExportData` constructs a `ComplianceStatusDetail` object for each team, then immediately converts it to a string via `formatComplianceStatusString` for both CSV and XLSX exports. The structured object is never exposed to callers; this is an internal representation cost with no benefit for file consumers.

**Fix**: Format compliance as a string upfront in `formatComplianceStatus`, or skip object construction and build the string directly from validation data.

**Likely** — `formatComplianceStatus` constructs the structured object, `formatComplianceStatusString` converts it to text, both called per team.

### Formula injection escaping

Escaping is applied only to `teamName` and `playerName`, not to `playerRole` or `playerCategory`. If a malicious role name contains a formula prefix, it won't be escaped. This is a low-risk gap (roles are typically curated), but it's an inconsistency.

The Unicode formula check (tab, vertical tab, form-feed characters) in `escapeFormulaInjection` is defensive overkill; most real injection uses `=` prefix directly, which is caught.

**Likely** — Code shows selective application of escaping and explicit Unicode checks.

### Data scoping and transaction isolation

Authorization runs outside the transaction, creating a small window where team ownership could be released between `verifyExportAuthorization` and the data retrieval. For read-only operations this is acceptable and doesn't create data leaks, but it means released team owners might briefly export before an error (if re-verification is in place). This gap is tolerable but compounds the authorization double-check issue.

**Confirmed** — `verifyExportAuthorization` outside transaction; `getSquadExportData` wraps reads in `$transaction` with `ReadCommitted` isolation.

### Frontend error handling

If fetch succeeds but returns non-file content (e.g., HTML error page from a proxy or WAF), the blob is still downloaded with the predicted filename. The client checks `blob.size === 0` but not content type. This is low-risk (unlikely with proper backend error handling) but could be tightened.

**Likely** — Code shows blob check for size but not for content type or magic bytes.

### Test coverage

Backend tests (539 lines) cover authorization checks (host, team owner, released owner, missing auction), CSV/XLSX generation, format validation, case-insensitivity, header correctness, and error propagation. Frontend tests (296 lines) cover CSV/XLSX export success paths, error responses (403, 404), network errors, empty blobs, and localStorage unavailability.

**Not tested:**
- Authorization state changes between controller and export method calls
- Excel formula injection in team/player names
- Concurrent exports and performance/memory with large squads (thousands of acquisitions)
- Round-trip validation: exported CSV/XLSX reimported and compared to source data
- Filename collision scenarios (two exports at same timestamp from same room)

**Confirmed** — Explicit test count in feature description (45+) and inspection of test files shows coverage above 85% for methods but gaps noted.



</details>

## File map

<details>
<summary>Files changed</summary>

**Backend:**
- `apps/api/src/auctions/services/squad-export.service.ts` — New service. 412 lines. Handles authorization, data retrieval, CSV/XLSX generation, formula injection escaping, filename sanitization.
- `apps/api/src/auctions/__tests__/squad-export.service.spec.ts` — New test file. 539 lines. Tests authorization, data formatting, CSV/XLSX generation, edge cases.
- `apps/api/src/auctions/__tests__/squad-export.controller.spec.ts` — New test file. 209 lines. Tests endpoint format validation, header correctness, authorization errors.
- `apps/api/src/auctions/auctions.controller.ts` — Modified. Added `GET /v1/auctions/:auctionId/export` endpoint, format validation, response headers, error handling.
- `apps/api/src/auctions/auctions.module.ts` — Modified. Registered `SquadExportService` as provider.

**Frontend:**
- `apps/web/src/components/auction/ExportButton.tsx` — New component. 111 lines. UI for CSV/XLSX export buttons with loading/error states.
- `apps/web/src/components/auction/__tests__/ExportButton.spec.tsx` — New test file. 272 lines. Tests button interactions, error display, disabled state.
- `apps/web/src/hooks/useSquadExport.ts` — New hook. 90 lines. Fetch wrapper, blob handling, file download, localStorage token retrieval.
- `apps/web/src/hooks/__tests__/useSquadExport.spec.ts` — New test file. 296 lines. Tests successful exports, error handling, network failures, auth unavailability.

**Contracts:**
- `packages/contracts/src/exports.contract.ts` — New file. 49 lines. Enums and DTOs for export format, response structure, compliance status.

[Full diff available in repository history.]

</details>
