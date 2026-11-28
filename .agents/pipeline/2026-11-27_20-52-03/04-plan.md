# Implementation Plan: Phase K — Squad Exports (CSV/XLSX)

## Overview

Implement server-authoritative squad export functionality allowing authenticated hosts and team owners to download auction squads in CSV or XLSX format. Features one-off in-memory generation with no database writes or side effects.

---

## Plan Items

### Backend Implementation

- [x] 1. Add dependencies and type declarations to `apps/api/package.json`
      Add `papaparse` v5.4.1, `exceljs` v4.4.0, and `@types/papaparse` to dependencies/devDependencies.
      Add `@uth/contracts` workspace link.
      Files: `apps/api/package.json`
      Verify: Dependencies resolved in workspace.

- [x] 2. Create shared export contract in `packages/contracts/src/exports.contract.ts`
      Define `ExportFormat` enum (CSV/XLSX), error response interfaces, and BigInt serialization pattern (as string).
      Files: `packages/contracts/src/exports.contract.ts`
      Verify: Run `npm --prefix apps/api run typecheck` and confirm no type errors.

- [x] 3. Update `packages/contracts/src/index.ts` to export the new contract.
      Files: `packages/contracts/src/index.ts`
      Verify: Run `npm --prefix apps/api run typecheck` and confirm contract is importable.

- [x] 4. Create `SquadExportService` in `apps/api/src/auctions/services/squad-export.service.ts`
      Implement three public methods: `verifyExportAuthorization()` (authorization check), `getSquadExportData()` (fetch and structure data), `exportSquadCsv()` and `exportSquadXlsx()` (format and return). Follow existing service patterns in the auctions module. Use Prisma's `include()` with nested relations to avoid N+1 queries. Serialize BigInt to string. Format compliance status as human-readable string.
      Files: `apps/api/src/auctions/services/squad-export.service.ts`
      Verify: `npm --prefix apps/api run typecheck` passes. Run unit tests (item 7 below) and confirm service methods work without database errors (use mocked Prisma in tests).

- [x] 5. Add export endpoint `GET /v1/auctions/:auctionId/export` to `apps/api/src/auctions/auctions.controller.ts`
      Implement query param validation (format required, enum: csv/xlsx). Call `SquadExportService` based on format. Return proper headers (Content-Disposition, mime type). Handle errors (400 for invalid format, 403 for unauthorized, 404 for missing auction). Follow existing error handling patterns in controller.
      Files: `apps/api/src/auctions/auctions.controller.ts`
      Verify: `npm --prefix apps/api run typecheck` passes. Run controller tests (item 7) and confirm endpoint returns correct status codes and headers.

- [x] 6. Register `SquadExportService` in `apps/api/src/auctions/auctions.module.ts`
      Add provider to module's providers array.
      Files: `apps/api/src/auctions/auctions.module.ts`
      Verify: `npm --prefix apps/api run typecheck` passes. Confirm no module initialization errors (service is injectable).

- [x] 7. Write backend tests in `apps/api/src/auctions/__tests__/squad-export.service.spec.ts`
      Test categories:
      - CSV format (5 tests): header row, one row per player, BigInt serialization, special character escaping, empty team handling
      - XLSX format (5 tests): worksheet creation, header styling, frozen panes, file validity, column widths
      - Authorization (5 tests): host can export, team owner can export, non-participant forbidden, unauthenticated rejected, authorization before data fetch
      - Edge cases (3 tests): no teams, one team one player, empty squads
      Total: 18+ tests covering authorization, data formatting, and error handling.
      Files: `apps/api/src/auctions/__tests__/squad-export.service.spec.ts`, `apps/api/src/auctions/__tests__/squad-export.controller.spec.ts`
      Verify: `npm run test` from monorepo root passes all tests. Coverage >85% for squad-export code.

---

### Frontend Implementation

- [x] 8. Create `useSquadExport` hook in `apps/web/src/hooks/useSquadExport.ts`
      Implement fetch logic, error handling, file download initiation. Return `{ export, loading, error }` state. Parse responses, generate filenames, trigger browser download via `URL.createObjectURL` and `<a>` link.
      Files: `apps/web/src/hooks/useSquadExport.ts`
      Verify: `npm --prefix apps/web run typecheck` passes. Run hook tests (item 10) and confirm download is triggered.

- [x] 9. Create `ExportButton` component in `apps/web/src/components/auction/ExportButton.tsx`
      Implement two buttons (CSV/XLSX) with responsive layout (mobile stacked, desktop side-by-side). Show loading spinner during export. Display error state with retry. Disable buttons during load. Use Lucide icons (Download, Loader2). Follow existing component patterns in auction folder (use Tailwind, responsive breakpoints, accessibility).
      Files: `apps/web/src/components/auction/ExportButton.tsx`
      Verify: `npm --prefix apps/web run typecheck` passes. Run component tests (item 10) and confirm buttons render, disable during load, and error handling works.

- [x] 10. Write frontend tests in `apps/web/src/components/auction/__tests__/ExportButton.spec.tsx` and `apps/web/src/hooks/__tests__/useSquadExport.spec.ts`
       Test categories:
       - ExportButton component (8 tests): render both buttons, disable when loading, loading spinner shows, success initiates download, error state shown, retry button, CSV/XLSX buttons send correct format param
       - useSquadExport hook (7 tests): initialize with no error/loading, success triggers download, error response shown, network error handled, 403/404 responses, graceful JSON parse failure, filename generation
       Total: 15+ tests covering UI states, hook behavior, and fetch error paths.
       Files: `apps/web/src/components/auction/__tests__/ExportButton.spec.tsx`, `apps/web/src/hooks/__tests__/useSquadExport.spec.ts`
       Verify: `npm run test` from monorepo root passes all tests. Coverage >85% for export-related code.

- [x] 11. Integrate `ExportButton` into squad view page (or the existing squad component)
       Add ExportButton component to the squad tab/page. Conditionally render only if user is authorized (server-side check) and auction status is COMPLETED. Import component and use in JSX.
       Files: `apps/web/src/components/auction/SquadTab.tsx` (or relevant squad page)
       Verify: `npm --prefix apps/web run typecheck` passes. Render the page in browser and confirm button appears only when auction is completed.

---

### Integration & Verification

- [x] 12. Run full monorepo build and test suite
       Execute `npm run build`, `npm run typecheck`, and `npm run test` from workspace root to confirm all changes integrate correctly.
       Files: (all modified files)
       Verify: Build succeeds with no errors. All tests pass (backend 18+ tests, frontend 15+ tests). No lint errors.

- [x] 13. Manual verification of export files
       Using a test auction with known data, export CSV and XLSX files. Open files in Excel / Sheets. Verify:
       - CSV: correct headers, one row per player, team context repeated, BigInt as string, special characters escaped
       - XLSX: correct headers with bold/background, frozen panes at row 1, one row per player, file is valid XLSX
       - Both formats: empty teams show "(no players)", compliance status formatted correctly, filenames are sanitized and timestamped
       Files: (manual testing)
       Verify: Files open in Excel/Sheets without errors. Data matches squad state in audit.

---

## Digest

### Backend Files

**`apps/api/package.json`**
- Block: dependencies section
- Added: `"papaparse": "^5.4.1"`, `"exceljs": "^4.4.0"`
- Test: `npm list papaparse exceljs` from api workspace

**`packages/contracts/src/exports.contract.ts`** (new)
- Block: entire file
- Exports: `ExportFormat` enum, `SquadExportRequestDto`, `SquadExportResponse`, `ExportErrorResponse` interfaces
- Test: `npm --prefix apps/api run typecheck` confirms importable

**`packages/contracts/src/index.ts`**
- Block: export statements
- Added: `export * from "./exports.contract"`
- Test: `npm --prefix apps/api run typecheck`

**`apps/api/src/auctions/services/squad-export.service.ts`** (new)
- Block: entire service (5 methods: constructor, verifyExportAuthorization, getSquadExportData, exportSquadCsv, exportSquadXlsx, formatComplianceStatus)
- Methods use Prisma with `include()`, serialize BigInt to string, return CSV string or XLSX Buffer
- Test: 18+ unit tests covering CSV, XLSX, authorization, edge cases

**`apps/api/src/auctions/auctions.controller.ts`**
- Block: new endpoint `@Get(':auctionId/export')`
- Added: query param validation, format enum check, service call, response headers
- Test: controller tests confirm 400/403/404/200 responses

**`apps/api/src/auctions/auctions.module.ts`**
- Block: providers array
- Added: `SquadExportService`
- Test: `npm --prefix apps/api run typecheck` confirms no module errors

**`apps/api/src/auctions/__tests__/squad-export.service.spec.ts`** (new)
- Block: entire test file (18+ tests)
- Tests: CSV format (5), XLSX format (5), authorization (5), edge cases (3)
- Run: `npm run test`

**`apps/api/src/auctions/__tests__/squad-export.controller.spec.ts`** (new)
- Block: entire test file (endpoint validation, error responses, authorization check)
- Tests: 400 missing/invalid format, 403 unauthorized, 404 not found, 200 success
- Run: `npm run test`

### Frontend Files

**`apps/web/src/hooks/useSquadExport.ts`** (new)
- Block: entire hook (~80 lines)
- Exports: `useSquadExport` function returning `{ export, loading, error }` object
- Behavior: fetch, blob parse, filename generation, URL.createObjectURL, link download, error handling
- Test: 7 hook tests covering success, error, network failure, filename generation

**`apps/web/src/components/auction/ExportButton.tsx`** (new)
- Block: entire component (~120 lines)
- Exports: `ExportButton` React component
- Props: auctionId, auctionName, roomName, disabled
- UI: two buttons (CSV/XLSX), loading spinner, error message with retry, responsive layout
- Test: 8 component tests covering render, disable, loading, success, error, retry

**`apps/web/src/components/auction/__tests__/ExportButton.spec.tsx`** (new)
- Block: entire test file (8 tests)
- Tests: render both buttons, disabled states, loading spinner, success download, error state, retry button, format params
- Run: `npm run test`

**`apps/web/src/hooks/__tests__/useSquadExport.spec.ts`** (new)
- Block: entire test file (7 tests)
- Tests: initialize, success download, error responses (403, 404, 500), network error, graceful JSON fallback, filename generation
- Run: `npm run test`

**`apps/web/src/components/auction/SquadTab.tsx` (or relevant squad page)**
- Block: render section for export controls
- Added: `<ExportButton auctionId={...} ... />` with conditional rendering
- Test: page renders with/without button based on authorization and status

---

## Build & Test Commands

**Build:** `npm run build` (from workspace root, runs turbo)  
**Type check:** `npm run typecheck` (from workspace root, runs turbo)  
**Test:** `npm run test` (from workspace root, runs turbo)  
**API only:** `npm --prefix apps/api run build`, `npm --prefix apps/api run test`  
**Web only:** `npm --prefix apps/web run build`, `npm --prefix apps/web run test`  

---

## Notes

- **BigInt Serialization:** All monetary fields (priceMinor, purseBalanceMinor) are BigInt in database, converted to string in export. Frontend parses as `BigInt(value)` for calculations or `Number(value)` for display.
- **Authorization Model:** Server-authoritative. Backend checks in every export method: host OR active team owner only.
- **No Side Effects:** Export is read-only. No audit logs, notifications, or database writes triggered.
- **Empty Teams:** Teams with no acquisitions appear in export with "(no players)" placeholder row.
- **Error Responses:** 400 (invalid/missing format), 401 (unauthenticated), 403 (forbidden), 404 (not found), 500 (generation error).
- **Dependencies:** papaparse v5.4.1 (CSV), exceljs v4.4.0 (XLSX). Both actively maintained, zero critical advisories.

---

## Assumptions from Design

1. All monetary amounts serialized as JSON strings (BigInt precision).
2. Only active team owners (releasedAt IS NULL) are authorized to export.
3. Compliance status from latest squad validation record.
4. Filename pattern: `squad_export_{auctionId_first_8_chars}_{format}_{ISO_DATE}.{ext}`.
5. Export works only on completed auctions (design implies, frontend enforces via disabled state).
6. No scheduled exports; current state only.
7. Files downloaded directly in browser, not stored externally.

---

## Success Criteria

✓ All backend tests pass (18+ unit tests)  
✓ All frontend tests pass (15+ unit tests)  
✓ Full build succeeds with no errors  
✓ CSV and XLSX files are valid and parseable  
✓ Authorization boundaries enforced (403 for non-auth, 404 for missing)  
✓ No secrets or credentials in code  
✓ Performance: <1s response latency for typical auction (8 teams, ~100 players)  
✓ File sizes: CSV <500KB, XLSX <2MB  
