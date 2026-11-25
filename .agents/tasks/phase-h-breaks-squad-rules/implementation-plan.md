# Phase H: Breaks and Squad Rules — Implementation Plan

**Status:** Planning complete  
**Date:** 2026-11-19  
**Task:** Implement break scheduling, duration adjustment, squad rule enforcement and validation UI

---

## Overview

Phase H adds two interconnected features to the auction runtime (Phase G):

1. **Breaks**: Server-authoritative break scheduling after every N accepted bids, with host-controlled duration extension/reduction within bounds. Breaks are recorded in the event history and displayed to all participants.

2. **Squad Rules**: Tournament-specific requirements (squad size, role distribution, domestic/overseas balance, category constraints) with real-time progress display during and after breaks. Squad validation occurs at settlement and informs the squad comparison view.

The database schema (`AuctionBreak`, `SquadRule`, `SquadRequirementProgress`) is already defined (Phase B). This phase implements the backend services, API endpoints, event types, DTOs and frontend components.

---

## Findings from codebase exploration

### Database

- **AuctionBreak**: Columns `id`, `auctionId`, `startedAt`, `deadline`, `originalDurationSeconds`, `reason`, `triggerBidCount`, `endedAt`. Index on `(auctionId, startedAt)`.
- **SquadRule**: Type (SQUAD_SIZE, ROLE_COUNT, DOMESTIC_COUNT, OVERSEAS_COUNT, CATEGORY_COUNT), minCount, maxCount, role, categoryId.
- **SquadRequirementProgress**: Tracks currentCount and satisfied boolean per (auctionTeamId, squadRuleId).
- **AuctionConfigurationSnapshot**: Columns `breakEveryAcceptedBids`, `breakCounterScope` (PER_PLAYER or PER_AUCTION), `breakDurationSeconds`, `breakMinSeconds`, `breakMaxSeconds`.

### Existing services

- **BreakManagerService**: Manages in-memory bid counter, tracks break scheduling, provides duration adjustment and break-info endpoints. Uses AuctionsRepository.
- **SquadValidatorService**: Validates squad requirements, returns violations, calculates progress against PSL-style rules. Uses AuctionsRepository and PrismaService.
- **AuctionEventBroadcasterService**: Broadcasts auction events via Socket.IO.
- **AuctionRoomGateway**: WebSocket connection, authentication, room join/leave.
- **AuctionsRepository**: Core ORM operations with Prisma.
- **CountdownTimerService**, **SettlementService**, **BidAcceptanceService**: Existing orchestration services.

### Socket.IO and contracts

- Contracts live in `packages/contracts/src/rooms.contract.ts` (extends to auction events).
- Gateway authenticates sockets with JWT, isolates events by room.
- Events follow pattern: `event:action` or `auction:action`.

### Frontend

- Web app in `apps/web/src/app` and `apps/web/src/components`.
- Hooks in `apps/web/src/hooks`.
- Contexts in `apps/web/src/contexts`.
- Uses React, TypeScript, Tailwind, Framer Motion, GSAP.

---

## Assumptions and unresolved items

From PRD/AGENTS.md:

1. **Break counter scope**: "Five bids" can mean per-player or per-auction. Initial assumption: **PER_PLAYER** (5 accepted bids on the current player triggers a break). Room setting allows override.
2. **Break adjustment permissions**: Only the host can extend/reduce breaks within configured bounds. No multi-approval needed.
3. **Squad rules configuration**: Host supplies min/max for each rule type at room creation. Rules snapshot at auction start.
4. **Validation at settlement**: Settlement service must call squad validator and reject unsold players if squad is incomplete (open decision D-13 on exact behavior).
5. **Display during break**: Squad table shows current count vs. required, by role and domestic/overseas. No live counter update during bidding; only on new player introduction.

---

## Implementation Plan

### 1. Backend: Break infrastructure and persistence

**What to do:** Add helper methods to AuctionsRepository to record, query and update AuctionBreak records. Extend BreakManagerService to coordinate with database instead of only in-memory state.

**Files:**
- `apps/api/src/auctions/auctions.repository.ts` — Add methods: `recordBreak()`, `getActiveBreak()`, `updateBreakDeadline()`, `endBreak()`, `getBreakHistory()`.
- `apps/api/src/auctions/services/break-manager.service.ts` — Refactor to use database, replace in-memory counter with schema-based tracking.

**Verify:** `npm run test:api -- auctions.repository` passes all repository tests.

---

### 2. Backend: Squad rule configuration and progress tracking

**What to do:** Add SquadsService to encapsulate squad rule management. Implement methods to load rules from database, initialize progress records on auction start, and update progress on new acquisition.

**Files:**
- `apps/api/src/auctions/services/squads.service.ts` (new) — SquadsService with methods: `loadSquadRules()`, `initializeProgressForTeam()`, `updateProgressOnAcquisition()`, `validateSquadCompletion()`, `getProgressByTeamAndRule()`.
- `apps/api/src/auctions/auctions.repository.ts` — Add methods: `createSquadRules()`, `getSquadRulesByAuction()`, `getProgressByTeam()`, `upsertProgress()`.

**Verify:** `npm run test:api -- auctions.repository` and `npm run test:api -- squads.service` pass.

---

### 3. Backend: DTOs and event types for breaks and squads

**What to do:** Define transfer objects for API responses and Socket.IO events.

**Files:**
- `apps/api/src/auctions/dto/break.dto.ts` (new) — `BreakDto`, `BreakStatusDto` (id, startedAt, deadline, secondsRemaining, reason), `BreakHistoryDto`, `BreakAdjustmentRequestDto`.
- `apps/api/src/auctions/dto/squad.dto.ts` (new) — `SquadRuleDto`, `SquadValidationResultDto` (valid, violations with rule id/type/required/current/satisfied), `SquadProgressDto`.
- `apps/api/src/auctions/dto/index.ts` — Export all DTOs.

**Verify:** `npm run typecheck` passes; DTOs are used by controllers/gateways.

---

### 4. Backend: API endpoints for break management

**What to do:** Extend AuctionsController to add endpoints for host break operations.

**Files:**
- `apps/api/src/auctions/auctions.controller.ts` — Add endpoints:
  - `GET /v1/auctions/:auctionId/breaks/current` → BreakStatusDto or null
  - `GET /v1/auctions/:auctionId/breaks` → BreakHistoryDto[]
  - `POST /v1/auctions/:auctionId/breaks/:breakId/adjust` (host-only) → BreakStatusDto (adjust deadline)
  - `POST /v1/auctions/:auctionId/breaks/:breakId/end` (host-only) → Event confirmation

**Verify:** `npm run test:api -- auctions.controller` passes; endpoint tests confirm permission checks.

---

### 5. Backend: Squad rule REST endpoints

**What to do:** Add endpoints for querying squad rules and team progress.

**Files:**
- `apps/api/src/auctions/auctions.controller.ts` — Add endpoints:
  - `GET /v1/auctions/:auctionId/squads/rules` → SquadRuleDto[] (read-only after auction start)
  - `GET /v1/auctions/:auctionId/squads/:auctionTeamId/progress` → SquadProgressDto (current/required by rule)
  - `POST /v1/auctions/:auctionId/squads/:auctionTeamId/validate` → SquadValidationResultDto

**Verify:** `npm run test:api -- auctions.controller` passes.

---

### 6. Backend: Break event types and broadcasting

**What to do:** Define event types for breaks in the auction event system and wire broadcasting via gateway.

**Files:**
- `apps/api/src/auctions/constants/auction-events.ts` — Add event types: `BREAK_STARTED`, `BREAK_EXTENDED`, `BREAK_REDUCED`, `BREAK_ENDED`.
- `apps/api/src/auctions/services/auction-event-broadcaster.service.ts` — Add method to broadcast break events to all room participants.

**Verify:** `npm run test:api -- auction-event-broadcaster` passes; events are recorded with sequence.

---

### 7. Backend: Squad event types and validation hooks

**What to do:** Define event types for squad changes and integrate validator into settlement.

**Files:**
- `apps/api/src/auctions/constants/auction-events.ts` — Add event types: `SQUAD_REQUIREMENT_PROGRESS_UPDATED`, `SQUAD_VALIDATION_STARTED`, `SQUAD_VALIDATION_PASSED`.
- `apps/api/src/auctions/services/settlement.service.ts` — Call SquadsService to validate team squad before settlement completion. Record validation event.

**Verify:** `npm run test:api -- settlement.service` passes; squad validation is called on settlement.

---

### 8. Backend: Break scheduling coordination in bid acceptance

**What to do:** Coordinate break scheduling when a bid is accepted. After N accepted bids (per scope), trigger break state transition.

**Files:**
- `apps/api/src/auctions/services/bid-acceptance.service.ts` — After bid accepted and event recorded, call BreakManagerService to check if break should trigger. If yes, update Auction phase to BREAK and record event.
- `apps/api/src/auctions/services/break-manager.service.ts` — Extend to coordinate with AuctionStateService for phase transitions.

**Verify:** `npm run test:api -- bid-acceptance.service` passes; break triggering is tested.

---

### 9. Backend: Socket.IO events for breaks and squads

**What to do:** Define and emit Socket.IO events for break and squad state changes.

**Files:**
- `packages/contracts/src/auction-events.contract.ts` (new) — Define break and squad event DTOs: `BreakStartedEvent`, `BreakAdjustedEvent`, `BreakEndedEvent`, `SquadProgressUpdatedEvent`.
- `apps/api/src/auctions/gateways/auction-room.gateway.ts` — Add Socket.IO event handlers and emissions for breaks and squad updates (extend existing gateway).

**Verify:** Socket.IO events are type-safe and conform to contracts.

---

### 10. Frontend: Break DTO and contracts

**What to do:** Mirror backend DTOs in frontend contracts and types.

**Files:**
- `packages/contracts/src/auction-events.contract.ts` — Mirror backend event types with BreakStatusDto, SquadProgressDto, etc.
- `apps/web/src/lib/types/auction.ts` (new) — TypeScript types derived from contracts.

**Verify:** `npm run typecheck` passes in web app.

---

### 11. Frontend: Break timer component

**What to do:** Create a countdown timer display for active breaks. Must handle server deadline reconciliation and respect prefers-reduced-motion.

**Files:**
- `apps/web/src/components/auction/BreakTimer.tsx` (new) — Display remaining break time, animate countdown, reconcile with server deadline on reconnect. Props: deadline, onTimeRemaining callback.
- `apps/web/src/hooks/useBreakTimer.ts` (new) — Hook for countdown logic, reconciliation, reconnect handling.

**Verify:** Component renders correctly, countdown updates, server deadline reconciliation works.

---

### 12. Frontend: Squad requirement progress component

**What to do:** Create a table showing squad requirements (squad size, roles, domestic/overseas, categories) with current count vs. required.

**Files:**
- `apps/web/src/components/auction/SquadRequirementTable.tsx` (new) — Display SquadRuleDto[] with currentCount vs. minCount/maxCount. Color-code satisfied/unsatisfied. Responsive table.
- `apps/web/src/components/auction/SquadProgressIndicator.tsx` (new) — Badge/progress-bar version for compact display (e.g., sidebar).

**Verify:** Component displays rules correctly, reflects progress from props.

---

### 13. Frontend: Break overlay/modal

**What to do:** Display break state during auction BREAK phase with squad comparison, purse balances, and host controls (adjust duration, end early).

**Files:**
- `apps/web/src/components/auction/BreakScreen.tsx` (new) — Full-screen or modal overlay. Shows BreakTimer, all team squad progress, purse balances. Host sees adjust/end buttons. Props: break status, all teams, current user role.
- `apps/web/src/components/auction/BreakControls.tsx` (new) — Host controls: adjust duration (slider/input), end break button. Only visible to host. Submit calls API.

**Verify:** BreakScreen renders during BREAK phase, controls respond correctly.

---

### 14. Frontend: Team panel squad progress section

**What to do:** Add squad progress information to each team panel (shown during BREAK phase and final display).

**Files:**
- `apps/web/src/components/auction/TeamPanel.tsx` (modify) — Extend to show squad progress section below purse/roster. Conditionally expand during BREAK phase.

**Verify:** Component still renders for LIVE phase; squad section appears and updates correctly.

---

### 15. Frontend: Socket.IO hook for break events

**What to do:** Create a custom hook for subscribing to break and squad events from Socket.IO.

**Files:**
- `apps/web/src/hooks/useBreakSocket.ts` (new) — Hook that subscribes to `auction:break:started`, `auction:break:adjusted`, `auction:break:ended`, `auction:squad:progress_updated`. Updates local state. Handles reconnect subscription.
- `apps/web/src/hooks/useSquadProgress.ts` (new) — Hook for querying and subscribing to squad progress for specific team.

**Verify:** Hooks correctly subscribe/unsubscribe, handle reconnect.

---

### 16. Frontend: Break state machine in auction room context

**What to do:** Extend AuctionContext or auction state hook to track break and squad state.

**Files:**
- `apps/web/src/contexts/AuctionContext.tsx` (modify) — Add breakStatus (or extend existing) to track active break. Add squads { [auctionTeamId]: SquadProgressDto } to state.
- `apps/web/src/hooks/useAuctionState.ts` (modify) — Export break and squad state with queries.

**Verify:** State updates correctly when break events arrive; persists across reconnect.

---

### 17. Frontend: Break UI integration in auction room

**What to do:** Conditionally render break overlay and squad details based on auction phase.

**Files:**
- `apps/web/src/app/auctions/[auctionId]/room/page.tsx` (modify) — Render BreakScreen component when phase === BREAK. Pass break status and squad data.
- `apps/web/src/components/auction/AuctionRoomLayout.tsx` (modify) — Adjust layout to accommodate break overlay without dismissing other UI.

**Verify:** Break overlay appears during BREAK phase; underlying UI remains visible.

---

### 18. Backend: Configuration validation for break and squad settings

**What to do:** Validate room break and squad configuration at creation and before auction start.

**Files:**
- `packages/validation/src/schemas/auction-config.schema.ts` (modify) — Add Zod schemas for `breakEveryAcceptedBids` (1–50), `breakDurationSeconds` (30–600), `breakMinSeconds` (15–300), `breakMaxSeconds` (60–900). Add squad rule schema: array of SquadRule with type/min/max validation.
- `apps/api/src/auctions/services/auction-configuration.service.ts` (new) — Validate configuration snapshot at auction start.

**Verify:** `npm run test:validation` passes; invalid configs reject at room creation.

---

### 19. Backend: Break and squad initialization

**What to do:** Initialize break state and squad rules when auction transitions to LIVE.

**Files:**
- `apps/api/src/auctions/services/auction-state.service.ts` (modify) — On DRAFT→LIVE transition, call BreakManagerService to initialize bid counter and SquadsService to initialize progress records for all teams.

**Verify:** `npm run test:api -- auction-state.service` passes; initialization is idempotent.

---

### 20. Backend: Integration test for break and squad flow

**What to do:** Write end-to-end scenario test: create room, start auction, place bids until break triggers, adjust break, verify squad progress, settle player.

**Files:**
- `apps/api/src/auctions/__tests__/breaks-squads-integration.test.ts` (new) — E2E test covering: break trigger on N bids, host extend/reduce break, squad progress update, squad validation at settlement.

**Verify:** `npm run test:api -- breaks-squads-integration` passes.

---

### 21. Frontend: Break and squad component tests

**What to do:** Unit tests for break timer, squad progress, break screen components.

**Files:**
- `apps/web/src/components/auction/__tests__/BreakTimer.test.tsx` (new) — Test countdown, deadline reconciliation, reconnect.
- `apps/web/src/components/auction/__tests__/SquadRequirementTable.test.tsx` (new) — Test rule display, satisfied/unsatisfied coloring.
- `apps/web/src/components/auction/__tests__/BreakScreen.test.tsx` (new) — Test overlay render, control visibility for host vs. participant.

**Verify:** `npm run test:web` passes all new component tests.

---

### 22. Frontend: Socket.IO integration test

**What to do:** Test Socket.IO hooks and event subscriptions with mock server.

**Files:**
- `apps/web/src/hooks/__tests__/useBreakSocket.test.ts` (new) — Mock Socket.IO server, test subscription and state updates.

**Verify:** `npm run test:web` passes integration tests.

---

### 23. Documentation and types cleanup

**What to do:** Document break and squad behavior, update types in API contracts.

**Files:**
- `docs/PHASE_H_SUMMARY.md` (new) — Architecture, decisions made, behavior specification for breaks and squads.
- `packages/contracts/src/index.ts` — Export new event contracts.
- `docs/decisions/DECISIONS.md` (modify) — Record decision D-06 (break counter scope = PER_PLAYER) and D-13 (squad validation at settlement).

**Verify:** TypeScript build succeeds; documentation is consistent.

---

### 24. Build and typecheck verification

**What to do:** Run full build and test suite for API and web.

**Files:** (all modified above)

**Verify:** 
- `npm run build:api` succeeds, no TypeScript errors.
- `npm run build:web` succeeds, no TypeScript errors.
- `npm run lint` passes (ESLint + Prettier).
- `npm run test:api` passes all tests.
- `npm run test:web` passes all tests.

---

### 25. Git commit strategy

**What to do:** Commit work by layer (database, backend services, API, frontend) to keep history clear.

**Verify:** Each commit compiles and core tests pass.

**Example commit sequence:**
1. `chore: add AuctionBreak persistence to repository` (item 1)
2. `feat: implement SquadsService and progress tracking` (item 2)
3. `feat: add break and squad DTOs` (item 3)
4. `feat: add break management API endpoints` (item 4–6)
5. `feat: add break event types and Socket.IO broadcasting` (item 7–9)
6. `feat: add break and squad contracts to web` (item 10)
7. `feat: implement BreakTimer and SquadRequirementTable components` (item 11–14)
8. `feat: add useBreakSocket and squad progress hooks` (item 15–16)
9. `feat: integrate break overlay into auction room` (item 17–18)
10. `feat: validate break and squad configuration` (item 18–19)
11. `test: add breaks and squads integration test` (item 20–22)
12. `docs: add PHASE_H summary and decisions` (item 23)

---

## Digest

### Breaks (phase BREAK added to state machine)

| File | Block | Test |
|---|---|---|
| `apps/api/src/auctions/auctions.repository.ts` | `recordBreak()`, `getActiveBreak()`, `updateBreakDeadline()`, `endBreak()` | `npm run test:api -- auctions.repository` |
| `apps/api/src/auctions/services/break-manager.service.ts` | Refactored for DB-backed state, bid counter tracking, deadline coordination | `npm run test:api -- break-manager.service` |
| `apps/api/src/auctions/dto/break.dto.ts` | `BreakDto`, `BreakStatusDto`, `BreakHistoryDto`, `BreakAdjustmentRequestDto` | Compile-time (types) |
| `apps/api/src/auctions/constants/auction-events.ts` | Event types: `BREAK_STARTED`, `BREAK_EXTENDED`, `BREAK_REDUCED`, `BREAK_ENDED` | Compile-time + event tests |
| `apps/api/src/auctions/services/auction-event-broadcaster.service.ts` | `broadcastBreakEvent()` method | `npm run test:api -- auction-event-broadcaster` |
| `apps/api/src/auctions/services/bid-acceptance.service.ts` | Integration with BreakManagerService on bid accepted | `npm run test:api -- bid-acceptance.service` |
| `apps/api/src/auctions/auctions.controller.ts` | Endpoints for break status, history, adjustment (host-only) | `npm run test:api -- auctions.controller` |
| `packages/contracts/src/auction-events.contract.ts` | `BreakStartedEvent`, `BreakAdjustedEvent`, `BreakEndedEvent` | Compile-time + Socket.IO contract tests |
| `apps/web/src/hooks/useBreakTimer.ts` | Countdown reconciliation, server deadline handling | `npm run test:web` |
| `apps/web/src/components/auction/BreakTimer.tsx` | Display remaining time, animated countdown | `npm run test:web` |
| `apps/web/src/components/auction/BreakScreen.tsx` | Overlay during BREAK phase, squad/purse display | `npm run test:web` |
| `apps/web/src/components/auction/BreakControls.tsx` | Host controls: adjust duration, end early | `npm run test:web` |
| `apps/web/src/hooks/useBreakSocket.ts` | Subscribe to break events, reconnect handling | `npm run test:web` |
| `apps/web/src/contexts/AuctionContext.tsx` | Add `breakStatus` to state | `npm run test:web` |

### Squad rules (validation and progress tracking)

| File | Block | Test |
|---|---|---|
| `apps/api/src/auctions/services/squads.service.ts` | `loadSquadRules()`, `initializeProgressForTeam()`, `updateProgressOnAcquisition()`, `validateSquadCompletion()` | `npm run test:api -- squads.service` |
| `apps/api/src/auctions/auctions.repository.ts` | `createSquadRules()`, `getSquadRulesByAuction()`, `getProgressByTeam()`, `upsertProgress()` | `npm run test:api -- auctions.repository` |
| `apps/api/src/auctions/dto/squad.dto.ts` | `SquadRuleDto`, `SquadValidationResultDto`, `SquadProgressDto` | Compile-time |
| `apps/api/src/auctions/constants/auction-events.ts` | Event types: `SQUAD_REQUIREMENT_PROGRESS_UPDATED`, `SQUAD_VALIDATION_STARTED`, `SQUAD_VALIDATION_PASSED` | Compile-time + event tests |
| `apps/api/src/auctions/services/settlement.service.ts` | Integration with SquadsService validation before settlement | `npm run test:api -- settlement.service` |
| `apps/api/src/auctions/auctions.controller.ts` | Endpoints for squad rules, progress, validation (read-only) | `npm run test:api -- auctions.controller` |
| `packages/validation/src/schemas/auction-config.schema.ts` | Squad rule schema validation | `npm run test:validation` |
| `apps/web/src/components/auction/SquadRequirementTable.tsx` | Display rule rows with current/required, satisfied/unsatisfied | `npm run test:web` |
| `apps/web/src/components/auction/SquadProgressIndicator.tsx` | Compact progress badge for sidebar | `npm run test:web` |
| `apps/web/src/hooks/useSquadProgress.ts` | Query and subscribe to squad progress | `npm run test:web` |
| `packages/contracts/src/auction-events.contract.ts` | `SquadProgressUpdatedEvent` | Compile-time + Socket.IO contract tests |

### Verification procedures

**Backend:**
```bash
npm run build:api                    # TypeScript compilation
npm run typecheck                    # Type checking
npm run test:api                     # Unit tests: breaks, squads, bid acceptance, settlement
npm run test:api -- integration      # Integration test: full break and squad flow
npm run lint                         # ESLint and Prettier
```

**Frontend:**
```bash
npm run build:web                    # Next.js build
npm run typecheck                    # TypeScript compilation
npm run test:web                     # Component and hook tests
npm run lint                         # ESLint and Prettier
```

**Full verification:**
```bash
npm run build                        # Monorepo build (all apps and packages)
npm run test                         # All tests
npm run typecheck                    # All TypeScript
npm run lint                         # Lint all code
```

---

## Open decisions deferred to later phases

- **D-06** (break counter scope): Implemented as PER_PLAYER with room config override. Can be revisited if turn-based auction (D-05) requires different behavior.
- **D-13** (squad validation at settlement): Implemented as validation check before settlement completion with event record. Exact UX for incomplete squads (block vs. warn) can be refined in Phase J (Frontend).
- Break adjustment limits (min/max seconds): Configured via snapshot. Product owner to finalize bounds.
- Exact squad rule presets (PSL vs. configurable): Room specifies; no hard-coded defaults in code.

---

## Risk mitigations

1. **Break deadline accuracy**: Server-authoritative deadline sent to clients; clients calculate display countdown. Reconciliation on every state update and reconnect prevents skew.
2. **Squad progress accuracy**: Progress records updated in same transaction as acquisition. Idempotent updates prevent double-counting.
3. **Break state collision**: Only host can adjust/end. Optimistic concurrency on deadline update with version check.
4. **Spectator visibility**: Squad progress and break info are broadcast to all participants (team owners and spectators where enabled). No private data leaked.

---

## Success criteria

- All unit and integration tests pass.
- Break and squad events broadcast correctly to all participants.
- Breaks trigger after configured bid count, can be adjusted by host within bounds.
- Squad progress tracks correctly on acquisition and displays in UI.
- Squad validation executes at settlement and blocks incomplete squads (or warns, per final UX decision).
- BreakTimer reconciles with server and handles reconnect.
- All frontend components render correctly at desktop, tablet and mobile sizes.
- TypeScript strict mode passes; no `any` types introduced.
