# CSV and XLSX squad exports for auction hosts and team owners

## Summary

Phase K adds a guarded export endpoint, server-side CSV/XLSX generation, shared contracts, and a React download control. Owner-scoped filtering, integer money strings, and formula treatment for team and player names are useful additions. The feature is not shippable because authenticated requests do not resolve to internal user IDs, the Prisma query still contains nonexistent fields, and no authenticated mounted frontend flow reaches the endpoint. All targeted suites collect zero tests, so the stated 45+ tests and greater-than-85% coverage have not been demonstrated.

Watch for: **confirmed** authenticated host and owner requests cannot pass the new identity boundary; **confirmed** the export query is rejected by the canonical Prisma schema; **confirmed** route, package, UI, and token wiring prevent a browser download; **confirmed** required purse and compliance data is missing; **confirmed** all targeted test suites collect zero tests.

**Verdict**: NEEDS_CHANGES

## High-level view

**Confirmed:** Owner-scoped filtering is present, but the controller passes a JWT payload where the service expects an internal `User.id`. The database stores the Cognito subject separately in `UserIdentity.subject`, so authorization fails before the scope can work.

**Confirmed:** `SquadExportService` bypasses its Prisma boundary with `any`, hiding two remaining schema mismatches. Its payload also omits initial purse, category spend, and the auction-specific player category.

**Confirmed:** CSV and XLSX use separate column definitions. They expose different headers, the workbook uses the wrong sheet name, and CSV formula protection does not cover owner display names.

**Confirmed:** The effective Nest route does not match the requested route, `SquadTab` is not mounted, and the hook reads a local-storage token while the application stores its token in the shared API module.

**Confirmed:** The shared contract does not resolve for either Vitest runner, and the API fails type checking on the new service. The four targeted files declare 66 tests, but none execute; the backend mocks also describe the pre-fix service shape.

<details>
<summary>Issues (17)</summary>

1. **Internal identity mismatch (confirmed)** — `@CurrentUser('sub')` supplies the full JWT payload, and a Cognito subject is not the internal `User.id` used by room and team ownership. Resolve the subject to an internal user before authorization.
2. **Invalid Prisma export query (confirmed)** — The query orders acquisitions by nonexistent `createdAt` and selects nonexistent `User.displayName`, so exports return 500. Use `settledAt`, join `UserProfile`, and type the payload against generated Prisma types.
3. **Authorization snapshot gap (confirmed)** — Authorization, filename metadata, and export rows are loaded in separate reads, while `ReadCommitted` does not preserve one snapshot. Perform authorization and data retrieval once in a repeatable-read transaction or joined query.
4. **Missing purse and auction-category data (confirmed)** — The files omit initial purse and category spend and read the global player category instead of the auction-specific category. Add the required values to one authoritative DTO.
5. **False compliance status (confirmed)** — An unvalidated squad is labeled compliant and `SquadValidation.valid` is ignored. Represent the unvalidated state and use the stored validation result.
6. **CSV/XLSX schema divergence (confirmed)** — CSV uses camelCase headers and XLSX uses display labels, while the sheet is named `Squad` rather than `Squad Export`. Generate both from one column definition.
7. **Owner-name formula injection (confirmed)** — Owner display names are written to CSV without formula neutralization. Escape every string cell at serialization and test `=`, `+`, `-`, and `@` prefixes.
8. **Route contract mismatch (confirmed)** — Nest versioning and the hard-coded controller prefix produce a doubled version path, while the browser calls an unproxied `/api/v1` path. Use a version-neutral controller path and the configured API base.
9. **UUID validation gap (confirmed)** — `auctionId` bypasses the required Zod validation and invalid UUIDs can become database 500 responses. Validate route and query parameters at the controller boundary.
10. **Unmounted export UI (confirmed)** — No production page renders `SquadTab` or `ExportButton`. Mount the control in the real squad view with server-derived phase and role hints.
11. **Wrong frontend token source (confirmed)** — The hook reads local storage, but sign-in stores the token in the shared API module. Reuse `getAuthToken()` or the authenticated client.
12. **Filename contract ignored (confirmed)** — The hook discards `Content-Disposition`, generates a competing filename, and never uses `roomName`. Use the server-authoritative filename.
13. **Missing success and mobile states (confirmed)** — The UI has no success confirmation and its approximately 36 px buttons miss the 44 px touch target. Add success status, minimum height, and responsive tests.
14. **Unlinked shared contracts package (confirmed)** — Neither app declares `@uth/contracts`, and Vitest cannot resolve it. Add workspace dependencies, build ordering, and test resolution.
15. **Strict TypeScript escapes (confirmed)** — Production export code uses `@ts-ignore` and multiple explicit `any` values. Install the missing declarations and replace the escapes with Prisma, ExcelJS, and squad DTO types.
16. **Non-executing coverage suite (confirmed)** — All four targeted suites collect zero tests, backend mocks are stale, and XLSX/guard/browser behavior is not exercised. Repair the suites and publish measured coverage above 85%.
17. **Mixed feature scope (confirmed)** — The branch includes live-auction, notification, payment, subscription, generated contract, and pipeline work alongside Phase K. Isolate the export feature and its direct dependencies before merge.

</details>

<details>
<summary>Details</summary>

## JWT claims never become the internal user ID used by auction ownership

**Confidence: confirmed.** `exportSquad` declares `@CurrentUser('sub') userId: string` (`apps/api/src/auctions/auctions.controller.ts:198-202`), but `CurrentUser` ignores its selector and returns the complete JWT payload (`apps/api/src/auth/current-user.decorator.ts:13-15`). The service compares that object with `AuctionRoom.hostId` and passes it into the UUID-valued `TeamOwner.userId` filter (`squad-export.service.ts:43-65`). A host cannot match, and an owner lookup receives the wrong value type.

**Confidence: confirmed.** Selecting `payload.sub` would still use the wrong identifier. Cognito's `sub` is `UserIdentity.subject`, while `AuctionRoom.hostId` and `TeamOwner.userId` reference the separate internal `User.id` (`packages/database/prisma/schema/identity.prisma:17-27,85-97`; `squads.prisma:38-49`). Resolve the subject once at the authentication boundary and pass the resulting `User.id` to authorization.

```text
Cognito JWT
  `sub` -> UserIdentity.subject -> UserIdentity.userId
                                      |
                                      v
                         AuctionRoom.hostId / TeamOwner.userId
```

## The export query still cannot execute against the canonical Prisma schema

**Confidence: confirmed.** The acquisition include sorts by `createdAt` (`squad-export.service.ts:107-124`), but `PlayerAcquisition` has `settledAt` and no `createdAt` (`packages/database/prisma/schema/auction.prisma:207-225`). The owner include selects `user.displayName` (`squad-export.service.ts:125-129`), but `displayName` belongs to `UserProfile`; `User` exposes `username`, `email`, and a `profile` relation (`identity.prisma:17-27,100-109`). Prisma rejects the query before reading rows, so exports return 500.

**Confidence: confirmed.** `tx: any`, `team: any`, `owner: any`, and `acq: any` suppress the checks that would expose these errors (`squad-export.service.ts:85,159-167`). API typecheck also reports that `auctionRoom`, `teamOwner`, and `$transaction` do not exist on the installed client at lines 43, 59, and 84. Regenerate the client from the assembled schema, define a `Prisma.*GetPayload`, correct the relations, and remove the escapes.

## Authorization and file generation do not share one snapshot

**Confidence: confirmed.** The controller authorizes and loads export data for the filename, then each format method repeats authorization and reloads the data (`auctions.controller.ts:218-238`; `squad-export.service.ts:182-184,232-234`). Authorization also occurs outside the data transaction, leaving a release or host change between check and read as a time-of-check/time-of-use gap.

**Confidence: confirmed.** `ReadCommitted` permits the transaction's metadata and team queries to observe different committed states (`squad-export.service.ts:84-179`). Return authorization scope, metadata, and rows from one repeatable-read transaction or joined query, then generate the file and filename from that result.

## Purse usage, category assignment, and compliance are incomplete

**Confidence: confirmed.** The response exposes acquisition price and remaining purse only (`packages/contracts/src/exports.contract.ts:40-47`). It omits `AuctionTeam.purseInitialMinor` and spend grouped by category, although the accepted contract requires allocated, category spend, and remaining values. Add them to one authoritative export DTO.

**Confidence: confirmed.** The query exports `Player.category` instead of `AuctionPlayer.category` (`squad-export.service.ts:107-121`). Because the schema permits auction-specific reclassification (`auction.prisma:146-165`), the exported category can be wrong.

**Confidence: confirmed.** A team with no validation becomes `{ valid: true }` and then `Compliant`; the formatter also ignores `SquadValidation.valid` (`squad-export.service.ts:327-358`). Represent an unvalidated squad explicitly and use the snapshot's `valid` value.

## CSV and XLSX disagree and formula protection is incomplete

**Confidence: confirmed.** Papa Parse derives CSV headers from camelCase object keys, while XLSX uses human-readable labels (`squad-export.service.ts:15-25,218-224,240-250`). The workbook is `Squad` instead of the required `Squad Export` (`squad-export.service.ts:237-239`). Generate both formats from one ordered column definition.

**Confidence: confirmed.** Team and player names are escaped, but owner display names are joined directly into CSV cells (`squad-export.service.ts:191-212`). A user-controlled value beginning with `=`, `+`, `-`, or `@` remains executable when opened in a spreadsheet. Neutralize every string cell at serialization and test all prefixes.

## The public endpoint and browser request target different routes

**Confidence: confirmed.** URI versioning adds `/v1` (`apps/api/src/main.ts:24`), while the controller hard-codes `v1/auctions` (`auctions.controller.ts:18`), placing the new handler under a doubled version prefix rather than `GET /v1/auctions/:id/export`. The hook calls `/api/v1/auctions/...`, and `apps/web/next.config.js` has no `/api` rewrite despite the existing `API_CONFIG.baseUrl`.

**Confidence: confirmed.** The controller lowercases `format` but never validates `auctionId` as a UUID or uses the required shared Zod schema (`auctions.controller.ts:197-216`). An invalid identifier can become a database 500. Use a version-neutral controller path, the configured API client, and boundary validation for both parameters.

## The export control is unmounted and reads the wrong token store

**Confidence: confirmed.** Production references to `SquadTab` and `ExportButton` end inside the new component files; no route mounts them. `isAuctionCompleted` and `isAuthorized` therefore never come from server-derived auction state (`apps/web/src/components/auction/SquadTab.tsx:27-48`). Integrate the control into the real squad view while retaining server enforcement.

**Confidence: confirmed.** `useSquadExport` reads `localStorage.getItem('token')` (`apps/web/src/hooks/useSquadExport.ts:38-46`), while sign-in stores the token in module memory through `setAuthToken` (`apps/web/src/lib/api.ts:22-32`; `apps/web/src/contexts/AuthContext.tsx:45-76`). Signed-in users receive `Authentication required`. Reuse `getAuthToken()` or the authenticated API client.

```text
Mounted squad page --X--> SquadTab --> ExportButton --> useSquadExport
                                                        |
                                                        X localStorage token
                                                          (actual token is in api.ts)
```

## Filename, success, and mobile behavior miss the UI contract

**Confidence: confirmed.** The server creates a filename with room and auction metadata, but the hook ignores `Content-Disposition`, generates a different name, and never uses `roomName` (`useSquadExport.ts:12-31,60-75`). Parse and use the server-authoritative filename.

**Confidence: confirmed.** The hook exposes no success state, and the component shows no confirmation (`useSquadExport.ts:6-10,77-90`; `ExportButton.tsx:98-106`). `text-sm py-2` produces an approximately 36 px button instead of the required 44 px touch target (`ExportButton.tsx:60-95`). Add success feedback, `min-h-[44px]`, status semantics, and viewport coverage at 375, 768, 1024, and 1440 px.

## Shared contracts are not consumable as a workspace dependency

**Confidence: confirmed.** Both apps import `@uth/contracts`, but neither declares it in `package.json`, no workspace link exists under either app, and both Vitest configurations lack an alias. The API points TypeScript directly outside the app rather than consuming a built package. Both targeted runners stop during collection with `Failed to resolve import "@uth/contracts"`.

**Confidence: confirmed.** Production code suppresses Papa Parse types and uses `any` for Prisma and ExcelJS (`squad-export.service.ts:10,85,159-167,255,261,307,327-337`); `SquadTab` also declares `player: any` (`SquadTab.tsx:11-16`). Add `@uth/contracts: workspace:*` to consumers, build it before the apps, add test resolution, install Papa Parse declarations, and replace the `any` values.

## Sixty-six declared tests provide no executed coverage

**Confidence: confirmed.** The two API and two web suites each collect zero tests because contract resolution fails. Current working-tree matcher, DOM setup, and import fixes make `pnpm --filter @uth/web typecheck` pass, but do not make Vitest resolve the package. No coverage percentage can be inferred.

**Confidence: confirmed.** Backend suites use Jest globals under Vitest, mock `auction.findUnique` instead of `auctionRoom.findFirst`, omit `$transaction`, expect authorization to resolve `undefined`, and omit the controller's new metadata calls (`squad-export.service.spec.ts:12-25,47-68`; `squad-export.controller.spec.ts:13-17,66-90`). The XLSX test checks only the ZIP signature, and direct controller calls do not exercise `JwtGuard`, HTTP routing, unauthenticated access, or responsive behavior. Rebuild the tests around typed payloads, parse generated workbooks, add HTTP and browser tests, and publish measured coverage above 85%.

## Phase K is mixed with other product phases

**Confidence: confirmed.** The branch-level change set includes live-auction, notification, payment, subscription, generated contract, and pipeline work alongside squad exports. Isolate Phase K and its direct dependency/configuration changes before merge.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/auctions/services/squad-export.service.ts` — authorizes scope, loads squad data, and generates CSV/XLSX files.
- `apps/api/src/auctions/auctions.controller.ts` — exposes the guarded download endpoint and headers.
- `apps/api/src/auctions/auctions.module.ts` — registers the export service.
- `apps/api/src/auctions/__tests__/squad-export.service.spec.ts` — declares tests against an obsolete mock shape.
- `apps/api/src/auctions/__tests__/squad-export.controller.spec.ts` — declares direct controller tests without the guard or current metadata calls.
- `apps/api/package.json` and `apps/api/tsconfig.json` — add generator dependencies and contract source aliases.
- `packages/contracts/src/exports.contract.ts` and `packages/contracts/src/index.ts` — define and publish export types.
- `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, and `packages/contracts/src/teams.contract.ts` — establish the contract package and resolve a working-tree re-export conflict.
- `apps/web/src/hooks/useSquadExport.ts` — fetches a blob and initiates download.
- `apps/web/src/components/auction/ExportButton.tsx` — renders format actions and loading/error states.
- `apps/web/src/components/auction/SquadTab.tsx` — composes squad display with export controls.
- `apps/web/src/hooks/__tests__/useSquadExport.spec.ts` and `apps/web/src/components/auction/__tests__/ExportButton.spec.tsx` — declare hook and component tests.
- `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`, and `apps/web/package.json` — add working-tree test setup and dependencies.
- `pnpm-lock.yaml` — locks generator and concurrent workspace dependencies.

Tracked feature diff: `git diff origin/main -- apps/api/src/auctions apps/api/package.json apps/api/tsconfig.json apps/web/src/components/auction/ExportButton.tsx apps/web/src/components/auction/SquadTab.tsx apps/web/src/components/auction/__tests__/ExportButton.spec.tsx apps/web/src/hooks/useSquadExport.ts apps/web/src/hooks/__tests__/useSquadExport.spec.ts apps/web/vitest.config.ts packages/contracts/src/exports.contract.ts packages/contracts/src/index.ts packages/contracts/package.json packages/contracts/tsconfig.json pnpm-lock.yaml`. Use `git status --short` to include the untracked `apps/web/vitest.setup.ts` in the review scope.

</details>
