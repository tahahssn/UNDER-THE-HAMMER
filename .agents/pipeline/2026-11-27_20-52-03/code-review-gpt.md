# CSV and XLSX squad exports for auction participants

Phase K adds an authenticated export endpoint, server-side CSV/XLSX generation, shared export types, and a React download control for completed squads. The approach keeps monetary values in minor units, generates files in memory, and checks host or active-owner entitlement before reading squad data. **Confirmed:** the implementation does not build or run against the repository’s contracts and Prisma schema, and the frontend control is not connected to a mounted page. **Confirmed:** active team owners can also receive every team’s roster instead of only their own.

Watch for: **confirmed** Prisma/schema and module-resolution blockers; **confirmed** cross-team disclosure to team owners; **confirmed** unreachable and unauthenticated frontend flow; **confirmed** non-executing tests and unsupported coverage claims.

**Verdict**: NEEDS_CHANGES

## High-level view

**Confirmed:** The service/controller split is clear, but the Prisma query targets fields and relations that do not exist in the canonical schema. Host lookup, player mapping, compliance lookup and purse aggregation all need to be rebuilt from typed Prisma payloads.

**Confirmed:** `@uth/contracts` is not configured as a resolvable workspace package or alias, so API and web typechecks fail and the test suites collect no tests. Papa Parse and ExcelJS typing errors plus explicit `any` values also violate the strict-type requirement.

**Confirmed:** Any active owner passes authorization, then the service fetches all auction teams. Host exports may contain the whole auction; an owner export must be filtered to that owner’s team.

**Confirmed:** Separate, non-transactional reads can mix acquisitions, validations and purse balances from different moments. The generated rows also omit required purse allocation and category-spend data and flatten compliance into a string that disagrees with the shared contract.

**Confirmed:** CSV cells are quoted but not protected from spreadsheet formulas. User- or provider-controlled values beginning with `=`, `+`, `-` or `@` can be interpreted as formulas when opened in spreadsheet software.

**Confirmed:** `SquadTab` has no production consumer, and the hook reads a local-storage token even though the application keeps its JWT in memory. The current frontend path therefore cannot offer an authenticated download.

**Confirmed:** The download UI misses the required filename, success-feedback and 44 px mobile-target behavior. The branch also mixes Phase K with unrelated notification, payment, subscription and pipeline work, which should be separated before merge.

<details>
<summary>Issues (17)</summary>

1. **Prisma model mismatch (confirmed)** — The export query references nonexistent auction, player, validation, violation and ledger fields. Rebuild it from the generated Prisma types and canonical relations.
2. **Shared contract package missing (confirmed)** — `@uth/contracts` cannot resolve in either app. Configure a real workspace package or a consistent TypeScript/Next/Vitest alias.
3. **Strict export types broken (confirmed)** — Papa Parse declarations are missing, ExcelJS APIs are typed incorrectly and production export files use explicit `any`. Add the declarations and replace casts with concrete types.
4. **Owner scope not filtered (confirmed)** — Any active owner receives every team’s roster and purse data. Restrict owner exports to the owner’s auction team and reserve full-auction exports for hosts.
5. **Non-atomic export snapshot (confirmed)** — Separate reads can combine acquisitions, validations and balances from different states. Fetch the export in one read transaction or one consistent query.
6. **Required export data missing (confirmed)** — Initial purse, category spend and complete compliance details are absent, and the service output disagrees with `SquadExportResponse`. Define and populate one authoritative export DTO.
7. **CSV/XLSX schemas diverge (confirmed)** — The formats use different headers and the workbook has the wrong sheet name. Generate both from one column definition.
8. **CSV formula injection (confirmed)** — User-controlled cells are quoted but not formula-escaped. Neutralize `=`, `+`, `-` and `@` prefixes and test them.
9. **Squad export UI is unmounted (confirmed)** — No production route consumes `SquadTab`. Integrate it into the real squad view with server-derived phase and role data.
10. **Authentication token source mismatch (confirmed)** — The hook reads local storage while the app keeps the JWT in memory. Reuse the authenticated API client or `getAuthToken()`.
11. **Export request validation gap (confirmed)** — The endpoint uses manual format checks and accepts an unvalidated auction id. Apply the shared Zod schema for format and UUID validation.
12. **Internal failures are unlogged (confirmed)** — Unexpected generator and database errors become generic 500 responses without server diagnostics. Log the cause and request context before returning the safe error.
13. **Filename contract ignored (confirmed)** — `roomName` is unused, the client ignores `Content-Disposition`, and the server omits the auction name. Make the server’s auction/room/date filename authoritative.
14. **Mobile and success states incomplete (confirmed)** — Buttons miss the 44 px touch target and no success confirmation exists. Add minimum height, feedback, focus treatment and viewport tests.
15. **Test suites collect zero tests (confirmed)** — Module resolution prevents all targeted suites from running, so the >85% claim has no result behind it. Fix test resolution/setup and publish coverage.
16. **Format and authorization tests are too shallow (confirmed)** — XLSX tests only check a ZIP signature, controller tests bypass guards, and E2E/responsive coverage is absent. Parse workbooks and add HTTP and browser-level tests.
17. **Unrelated changes are bundled (confirmed)** — Notification, payment, subscription and pipeline work shares the branch with Phase K. Isolate the export feature before merge.

</details>

<details>
<summary>Details</summary>

## Export generation does not match the Prisma model

**Confidence: confirmed.** The service selects `Auction.hostId` and `Auction.name` (`apps/api/src/auctions/services/squad-export.service.ts:30-59`), but `Auction` only owns a room relation (`packages/database/prisma/schema/auction.prisma:38-62`); `hostId` and `name` live on `AuctionRoom` (`packages/database/prisma/schema/rooms.prisma:82-86`).

**Confidence: confirmed.** It also selects `Player.name` and scalar `Player.category`, includes `AuctionTeam.squadValidations`, sums `TeamPurseTransaction.amountChangeMinor`, and reads `violation.ruleType` (`squad-export.service.ts:66-99,255-265`). The schema exposes `Player.fullName`/`displayName` and a category relation, `AuctionTeam.validations`, `TeamPurseTransaction.amountMinor`, and `SquadViolation.violationType`. Replace the mocked shape with a typed Prisma payload from the canonical schema.

```text
GET /v1/auctions/:id/export
        |
        v
verify authorization --X--> Auction.hostId
        |
        v
read export data ------X--> Auction.name / Player.name /
                          AuctionTeam.squadValidations /
                          amountChangeMinor
```

## Shared contracts and strict compilation are broken

**Confidence: confirmed.** The controller, service, hook and component import `@uth/contracts`, but `packages/contracts` has no `package.json`, workspace identity or TypeScript path mapping. Both package typechecks report `TS2307`, and the targeted Vitest commands collect zero tests because Vite cannot resolve the module. Configure a real shared package or one alias used consistently by TypeScript, Next and Vitest.

**Confidence: confirmed.** API typecheck also reports missing `papaparse` declarations, invalid `Cell.columnNumber` access and an unsafe ExcelJS buffer conversion. Production code uses `as any` for ExcelJS values and `any` for compliance and squad player data. Add the correct declarations, use ExcelJS’s actual types, and remove these escapes.

## Owner authorization exposes competitors’ squads

**Confidence: confirmed.** `verifyExportAuthorization` accepts any active owner (`squad-export.service.ts:26-50`), then `getSquadExportData` fetches every team for the auction (`squad-export.service.ts:66-90`). The file includes competitor owners, acquisitions, balances and compliance. Return the authorized team id and filter owner exports to it; reserve full-auction exports for the host and test this boundary over HTTP.

## Snapshot and row contracts lose required information

**Confidence: confirmed.** Authorization, metadata, teams/acquisitions and ledger sums use separate Prisma calls without `$transaction` (`squad-export.service.ts:26-101`). Because the endpoint does not require a concluded phase, settlement can produce a mixed-state file between those reads. Use one read transaction or one query that captures a consistent snapshot.

**Confidence: confirmed.** Both formats omit initial purse allocation and spend by category, while compliance becomes `Compliant`, `Unknown` or a partial violation string. `SquadExportResponse` declares structured compliance instead (`packages/contracts/src/exports.contract.ts:37-45`). Define one export DTO with allocated, spent and remaining purse plus complete violations, then generate both formats from it.

**Confidence: confirmed.** XLSX names the sheet `Squad` instead of `Squad Export`, while CSV exposes camelCase object keys rather than the human-readable XLSX headers. Use one column definition for both formats.

## CSV crosses the spreadsheet trust boundary unsafely

**Confidence: confirmed.** `Papa.unparse` enables quoting but not formula escaping (`squad-export.service.ts:163-169`). Quoting alone does not neutralize formula prefixes in spreadsheet applications. Enable Papa Parse formula escaping or prefix dangerous leading characters, with tests for all four prefixes and ordinary Unicode values.

## The frontend export path is not usable

**Confidence: confirmed.** Production references to `SquadTab` and `ExportButton` end inside the new component files; no route or existing squad display mounts `SquadTab`. Integrate it into the actual squad view using server-derived phase and role information.

**Confidence: confirmed.** `useSquadExport` reads `localStorage.getItem('token')` (`apps/web/src/hooks/useSquadExport.ts:39`), while the app stores the JWT in the module-level API client (`apps/web/src/lib/api.ts:25-32`; `apps/web/src/contexts/AuthContext.tsx:53,75`). Reuse `getAuthToken()` or the authenticated API client.

```text
Mounted squad page --X--> SquadTab --> ExportButton --> useSquadExport
                                                     |
                                                     X localStorage token
                                                       (JWT is in memory)
```

## Request, failure and download behavior miss the contract

**Confidence: confirmed.** The endpoint manually checks a raw format string and does not validate `auctionId` as a UUID (`apps/api/src/auctions/auctions.controller.ts:195-208`). Apply the required shared Zod query/parameter schema at the controller boundary.

**Confidence: confirmed.** Unexpected errors become a generic 500 without logging the original cause (`auctions.controller.ts:228-237`). Log the error with auction id, format and correlation metadata before returning the safe response.

**Confidence: confirmed.** `roomName` is unused, the client ignores `Content-Disposition`, and the controller calls `generateFilename` without an auction name. Make the server’s auction/room/date filename authoritative and use it for the browser download.

**Confidence: confirmed.** The component has no success confirmation, and `text-sm py-2` produces an approximately 36 px mobile button instead of the required 44 px touch target. Add success feedback, `min-h-[44px]`, visible focus treatment and viewport tests at 375, 768, 1024 and 1440 px.

## The test count does not establish coverage

**Confidence: confirmed.** The files declare 66 tests, but both targeted backend and frontend commands fail during collection on unresolved `@uth/contracts`; zero execute. Web typecheck also finds the component test’s wrong hook path, missing DOM matcher typings and unsupported `toEndWith` assertions. Fix the test setup and publish a real coverage result before claiming more than 85%.

**Confidence: confirmed.** The sole XLSX content test only checks the ZIP `PK` signature (`squad-export.service.spec.ts:327-372`). Controller tests call the class directly, so they skip `JwtGuard`, HTTP behavior and unauthenticated access; no export E2E or responsive test exists. Reopen generated workbooks for structural assertions and add Nest HTTP and mounted browser tests.

## Phase K is bundled with unrelated work

**Confidence: confirmed.** The branch diff includes notification, SafePay/payment, subscription and pipeline changes alongside exports, and the current uncommitted diff contains subscription work only. Split Phase K into a focused change so its dependencies, behavior and verification can be reviewed independently.

</details>

<details>
<summary>File map</summary>

- `apps/api/package.json` — adds Papa Parse and ExcelJS.
- `apps/api/src/auctions/services/squad-export.service.ts` — authorizes and generates squad files.
- `apps/api/src/auctions/auctions.controller.ts` — exposes the export route and response headers.
- `apps/api/src/auctions/auctions.module.ts` — registers the service.
- `apps/api/src/auctions/__tests__/squad-export.service.spec.ts` — mocks service behavior.
- `apps/api/src/auctions/__tests__/squad-export.controller.spec.ts` — tests controller dispatch directly.
- `packages/contracts/src/exports.contract.ts` — defines export types.
- `packages/contracts/src/index.ts` — re-exports those types.
- `apps/web/src/hooks/useSquadExport.ts` — fetches a blob and starts a download.
- `apps/web/src/components/auction/ExportButton.tsx` — renders format actions and states.
- `apps/web/src/components/auction/SquadTab.tsx` — combines squad display and export controls.
- `apps/web/src/hooks/__tests__/useSquadExport.spec.ts` — mocks fetch and downloads.
- `apps/web/src/components/auction/__tests__/ExportButton.spec.tsx` — tests component interactions.
- `pnpm-lock.yaml` — locks export dependencies.

Full feature diff, including any working-tree edits on these paths: `git diff origin/main -- apps/api/package.json apps/api/src/auctions/auctions.controller.ts apps/api/src/auctions/auctions.module.ts apps/api/src/auctions/services/squad-export.service.ts apps/api/src/auctions/__tests__/squad-export.controller.spec.ts apps/api/src/auctions/__tests__/squad-export.service.spec.ts apps/web/src/components/auction/ExportButton.tsx apps/web/src/components/auction/SquadTab.tsx apps/web/src/components/auction/__tests__/ExportButton.spec.tsx apps/web/src/hooks/useSquadExport.ts apps/web/src/hooks/__tests__/useSquadExport.spec.ts packages/contracts/src/exports.contract.ts packages/contracts/src/index.ts pnpm-lock.yaml`

</details>
