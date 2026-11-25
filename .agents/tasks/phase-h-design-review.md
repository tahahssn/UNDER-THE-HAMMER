# Phase H: Breaks and Squad Rules — Design Review

**Review Date:** 2026-11-25  
**Reviewer:** Design Review Subagent  
**Plan Document:** `d:\UNDER-THE-HAMMER\.agents\tasks\phase-h-breaks-squad-rules\implementation-plan.md`

---

## Findings

### HIGH SEVERITY

**1. Break state machine ambiguity: nested or separate phase?**

**Issue:** The plan states "phase BREAK added to state machine" and shows transition LIVE → BREAK → LIVE, but does not clarify whether BREAK is a separate top-level phase or a nested state within BIDDING.

**Location:** Plan overview, item 1, state machine digest.

**Impact:** This directly affects:
- Event sequencing and broadcasting (what events interrupt BIDDING?)
- Phase timeout handling and reconciliation
- Frontend phase-based conditional rendering
- Database schema: does Auction.phase gain a BREAK enum value, or is break tracked separately?

**Evidence from source:**
- ARCHITECTURE.md § 6.1 shows "BREAK" as a distinct phase in the state machine transition diagram (DRAFT → PLAYER_INTRODUCTION → BIDDING → BREAK → SETTLEMENT → PLAYER_INTRODUCTION).
- DESIGN.md § 8.1 describes breaks as "a deliberate information phase", implying a separate phase distinct from BIDDING.
- Current Prisma schema includes `Auction.phase` enum (inferred from code), which must be verified to include BREAK.

**Concrete Fix:** Clarify and update plan items 1, 6–9, 16–17 to state explicitly:
- Break is a separate top-level phase: Auction.phase transitions to BREAK
- When phase is BREAK, no bids are accepted; all bidding timers are paused
- Break starts with event BREAK_STARTED, ends with BREAK_ENDED, triggering phase transition back to BIDDING (for next player)
- Or: If BREAK is a metadata on BIDDING, clarify how timers and bid acceptance are paused during breaks

**Severity:** HIGH — without this, bid acceptance, timer reconciliation, and frontend state management will be inconsistent across the implementation.

---

**2. Break counter scope resolution: plan assumes PER_PLAYER but product constraint says "must be configurable or explicitly resolved"**

**Issue:** Plan assumes break counter scope is PER_PLAYER (5 bids on current player). AGENTS.md § 7 explicitly states: "The counter scope must be configurable or explicitly resolved; do not silently assume."

**Location:** Plan "Assumptions and unresolved items" section, item 1; item 8 (bid acceptance integration).

**Impact:** 
- If the product decision on counter scope is not finalized, the plan should not silently default to PER_PLAYER
- Item 2 (BreakManagerService refactor) must track bid counter per scope; ambiguity here will lead to refactoring later

**Evidence:**
- PRD.md § 4 states: "Clarify in implementation whether 'five bids' means five accepted bids on the current player or five accepted bids across the auction. Recommended initial behavior: five accepted bids on the current player, with a room-level setting to change it."
- Plan assumes PER_PLAYER without documenting that this is a provisional choice pending product sign-off

**Concrete Fix:** 
1. Before implementation begins, obtain explicit product confirmation: is counter scope PER_PLAYER or PER_AUCTION (or both configurable)?
2. Update plan items 1, 2, 8, and "Open decisions" to document the confirmed scope and rationale
3. If truly configurable, update item 18 (validation schema) to validate `breakCounterScope` ∈ {PER_PLAYER, PER_AUCTION} and reject invalid values

**Severity:** HIGH — a mid-implementation pivot on counter scope will require refactoring bid acceptance and break state management.

---

**3. Squad validation at settlement vs. informational: exact UX and enforcement timing unclear**

**Issue:** Plan defers squad validation UX to "Phase J (Frontend)" but does not specify the exact point at which validation blocks settlement vs. warns.

**Location:** Plan item 7, item 20, "Open decisions deferred to later phases" section, decision D-13.

**Impact:**
- If squad validation rejects unsold players, settlement service must handle rejection and prevent state transition
- If validation is informational, settlement continues and incomplete squads are recorded
- Item 7 (SettlementService integration) assumes validation is called but doesn't specify return type or error handling

**Evidence from source:**
- ARCHITECTURE.md § 9 states: "The host may configure purse and squad requirements before auction start."
- PRD.md § 3.3 and 8 do not specify whether settlement is blocked by incomplete squads or if warning suffices
- Plan item 20 integration test assumes settlement validation is called but doesn't test rejection scenario

**Concrete Fix:** 
1. Confirm with product owner: does incomplete squad block settlement or allow completion with warning?
2. Update item 7 (SettlementService integration):
   - If blocking: `await squadsService.validateSquadCompletion(auctionTeamId); // throws if invalid`
   - If warning: `const validation = await squadsService.validateSquadCompletion(auctionTeamId); return { settlement, squads: validation };`
3. Update item 20 integration test to include both paths: blocked and warning
4. Move D-13 decision from "deferred" to "confirmed" once product decision is finalized

**Severity:** HIGH — settlement and squad validation are part of financial and competitive correctness; ambiguity will cause disputes.

---

**4. Frontend Socket.IO events and state reconciliation: reconnect handling unspecified**

**Issue:** Plan items 15–16 describe Socket.IO hooks and state context but do not specify how break and squad state are reconciled on reconnect.

**Location:** Plan items 11, 15–16 (useBreakTimer, useBreakSocket, AuctionContext modification).

**Impact:**
- If client loses connection during break, it must fetch current break status and all squad progress on reconnect
- Ambiguity on whether to refetch from endpoint or rely on broadcast events can cause inconsistent UI state
- Item 15 (useBreakSocket hook) must specify subscription vs. fetch strategy

**Evidence from code:**
- AGENTS.md § 4 (Real-time correctness): "Use event sequence/state version. Recover state after reconnect."
- Existing Phase G likely has reconnect logic; plan should reference and extend it

**Concrete Fix:**
1. Clarify item 11 (useBreakTimer hook): on reconnect, client must call `GET /v1/auctions/:auctionId/breaks/current` to fetch current break status, not rely on events
2. Clarify item 15 (useBreakSocket hook): subscribe to real-time events **after** fetching current state to avoid race condition
3. Add to item 15 implementation: `useEffect(() => { onReconnect, fetchBreakAndSquadState(); resubscribe(); }, [socket.connected])`
4. Update item 20 integration test to test reconnect: disconnect during break, verify BreakTimer reconciles deadline correctly

**Severity:** HIGH — reconnect edge cases cause data inconsistency and incorrect UI rendering.

---

**5. Break adjustment permissions and idempotency: no optimistic concurrency documented**

**Issue:** Item 4 (break adjustment endpoint) specifies "host-only" but does not address concurrent adjustments or idempotency.

**Location:** Plan item 4 endpoint definition; item 20 integration test.

**Impact:**
- If two clients send concurrent `POST /v1/auctions/:auctionId/breaks/:breakId/adjust` with different adjustments, which one wins?
- Lacks version/sequence check; can lead to lost updates
- Idempotency key strategy not specified

**Evidence from AGENTS.md:**
- § 4 (Backend authority): "Break scheduling... is authoritative for... Timer deadlines"
- § 9 (Mandatory tests): "Simultaneous bid race" is listed but equivalent test for concurrent break adjustments is not

**Concrete Fix:**
1. Update item 4 endpoint to include version check: `POST /v1/auctions/:auctionId/breaks/:breakId/adjust { adjustmentSeconds: int, expectedDeadline?: DateTime }`
2. Backend compares expectedDeadline to current deadline; rejects if mismatch (concurrent modification)
3. Update item 20 integration test: add scenario "concurrent host adjustments" (two requests in rapid sequence, verify second rejects or one overwrites with version validation)
4. Document retry strategy for clients: if adjustment rejected, refetch current break and retry with new deadline

**Severity:** HIGH — concurrent adjustments can silently override host intent and confuse participants about break duration.

---

**6. Squad progress update: when does SquadRequirementProgress.satisfied get set to true?**

**Issue:** Plan items 2 and 7 mention `updateProgressOnAcquisition()` and `SquadRequirementProgress.satisfied` but do not specify the logic for calculating satisfied.

**Location:** Plan item 2 (SquadsService), item 7 (squad event types).

**Impact:**
- If satisfied is calculated as `currentCount >= minCount`, plan must specify how maxCount is handled (e.g., cap currentCount at maxCount before comparison?)
- If rules can conflict (e.g., DOMESTIC_COUNT max 7 vs. SQUAD_SIZE min 11), unsatisfiable rules will show perpetually unsatisfied
- Frontend coloring (green for satisfied, red for unsatisfied) depends on this logic

**Evidence from code:**
- Current SquadValidatorService compares `squadSize >= 11` and `bowlers >= 3`, but no upper-bound handling
- Prisma schema has `minCount Int?` and `maxCount Int?` on SquadRule, implying both are nullable

**Concrete Fix:**
1. Clarify logic in plan item 2:
   ```
   satisfied = (currentCount >= minCount) && (maxCount is null OR currentCount <= maxCount)
   ```
2. Update item 2 implementation to validate that rules are not contradictory at auction init:
   - Sum of all role minimums ≤ squad size max
   - Sum of all role maximums ≥ squad size min
3. Document in item 23 that contradictory rules will be caught at room creation validation (item 18)
4. Add to item 20 integration test: rule that can never be satisfied (e.g., SQUAD_SIZE min 11, ROLE_COUNT max 1 for all roles), verify it's rejected at auction start

**Severity:** HIGH — logic error here will cause incorrect progress display and misled users about whether squad is valid.

---

### MEDIUM SEVERITY

**7. Break reason field: enum or free-text string?**

**Issue:** AuctionBreak.reason is a string in the schema. Plan does not specify whether reasons are enumerated (e.g., "AUTOMATIC_TRIGGER", "HOST_ADJUSTMENT") or free-form.

**Location:** Plan item 1 (repo method `recordBreak()`), item 6 (BreakDto).

**Impact:**
- Frontend displays reason to participants; free-text allows arbitrary values
- Enumerated reasons allow UI to localize/icon them
- API should validate reason against allowed values if enumerated

**Evidence:**
- Plan states `reason?: string` in BreakAdjustmentRequestDto but does not specify validation
- DESIGN.md § 8 says "Show: Break timer and reason" but does not define reason format

**Concrete Fix:**
1. Define enum: `BreakReason = "BID_COUNT_THRESHOLD" | "HOST_REQUESTED"` (or similar)
2. Update item 1 to specify: `recordBreak(reason: BreakReason)` with validation
3. Update item 3 (BreakDto) to include reason as readonly enum, not string
4. Update item 6 (event types) to broadcast reason enum
5. Document in item 23: reason enum values and their localization/icons

**Severity:** MEDIUM — impacts frontend localization and UI consistency, but not core correctness.

---

**8. BreakManagerService bidCounter reset on reconnect: in-memory state loss**

**Issue:** Plan item 1 notes BreakManagerService has `private bidCounters: Map<string, number>`. This in-memory map is lost on server restart, causing incorrect break triggering after restart.

**Location:** Plan item 1, item 8 (integration with bid acceptance).

**Impact:**
- If server restarts mid-auction, bid counter resets
- If 3 bids placed before restart, counter shows 0 after restart
- Next 5 bids will trigger a break incorrectly (too early)

**Evidence from AGENTS.md:**
- § 4 (Backend authority): "Persist the server deadline and phase version… Clients calculate a display countdown from the server timestamp and reconcile when new state arrives."
- Implies all state must be persisted, not held in memory

**Concrete Fix:**
1. Remove `bidCounters` Map from BreakManagerService
2. Update item 1 (AuctionsRepository): add method `getBidCountForAuction(auctionId: string, scope: BreakCounterScope): Promise<number>`
3. This method queries the database: if scope is PER_PLAYER, count bids since last player introduction; if PER_AUCTION, count all bids since auction start
4. Item 8 (bid acceptance integration): after bid accepted, call `const count = await breakMgr.getBidCountForAuction(...); if (count % bidsPerBreak === 0) triggerBreak()`
5. Update item 20 integration test: restart server mid-auction, verify bid counter recovers correctly from database

**Severity:** MEDIUM — impacts correctness after failure/restart, but not normal operation.

---

**9. Squad progress initialization: when and by whom?**

**Issue:** Plan item 19 says "On DRAFT→LIVE transition, call SquadsService to initialize progress records for all teams." But does not specify idempotency or what happens if already initialized.

**Location:** Plan item 19 (AuctionStateService modification).

**Impact:**
- If transition is called twice, duplicate SquadRequirementProgress records may be created
- Upsert vs. insert strategy unclear
- If a team joins late (after LIVE), does its progress get initialized?

**Evidence from AGENTS.md:**
- § 4: "Make callbacks and settlement idempotent."
- Plan does not document idempotency key or upsert logic

**Concrete Fix:**
1. Update item 2 (SquadsService): method signature `initializeProgressForTeam(auctionTeamId: string, force: boolean = false): Promise<void>`
2. If force=false and progress already exists, return early
3. Item 19 calls: `await squadsService.initializeProgressForTeam(teamId)` for each team on DRAFT→LIVE
4. If a team is added after LIVE (not planned for Phase H but good for future), callers must invoke initialization explicitly
5. Add to item 20 integration test: verify calling initialization twice does not duplicate records

**Severity:** MEDIUM — edge case but essential for data correctness and idempotency.

---

**10. BreakTimer reconciliation: what if deadline has passed?**

**Issue:** Plan item 11 (useBreakTimer hook) says "reconciliation on every state update and reconnect" but does not specify behavior if server deadline has already passed.

**Location:** Plan item 11 (useBreakTimer hook), item 20 integration test.

**Impact:**
- If client reconnects after break has ended, useBreakTimer receives a past deadline
- Countdown will show negative or zero; component must handle gracefully
- If break ended while client was offline, should trigger BREAK_ENDED event or fetch new state?

**Concrete Fix:**
1. Update item 11 implementation note:
   ```
   if (deadline <= now) {
     // Break has ended; don't render timer
     // If phase is still BREAK, fetch current auction state
     // If phase changed to LIVE, trigger phase transition
   }
   ```
2. Add to item 11: `useBreakTimer` must handle `deadline < now` case gracefully (no negative countdown)
3. Update item 20 integration test: test reconnect **after** break ends, verify UI transitions correctly

**Severity:** MEDIUM — impacts UX edge case but not core functionality.

---

**11. Frontend responsive layout for break overlay: mobile specifics missing**

**Issue:** Plan items 12–13 mention BreakScreen component and responsive layout, but mobile-specific behavior is not detailed.

**Location:** Plan items 12–13 (BreakScreen, BreakControls), item 17 (AuctionRoomLayout).

**Impact:**
- DESIGN.md § 10 (Mobile) says "Move chat and detailed squad views into tabs/drawers."
- Plan does not specify how break overlay is laid out on 375px width
- Ambiguous whether squad table is a scrollable section or modal overlay

**Evidence from DESIGN.md:**
- § 10.3 (Mobile): "Present teams in a horizontally scrollable or compact list… Move chat and detailed squad views into tabs/drawers."
- § 8: "Show squad list for each team, role distribution, domestic/overseas progress, remaining squad slots."

**Concrete Fix:**
1. Update item 12 (BreakScreen component) to specify responsive layout:
   - Desktop (1024px+): Side-by-side timer and squad table
   - Tablet (768px): Stacked timer, squad table below
   - Mobile (375px): Full-height timer, squad table in scrollable drawer below, host controls in fixed footer
2. Update item 13 (BreakControls): on mobile, render as fixed footer buttons, not inline
3. Update item 17 (AuctionRoomLayout): ensure break overlay does not hide critical elements on mobile
4. Add to item 21 frontend tests: test responsive renders at 375px, 768px, 1024px, 1440px

**Severity:** MEDIUM — impacts mobile usability; design is correct but implementation details are missing.

---

**12. Squad rule configuration: host-editable after auction start?**

**Issue:** Plan item 18 (validation schema) specifies that squad rules are validated at room creation but does not state whether host can edit rules after auction starts.

**Location:** Plan item 18 (configuration validation), AGENTS.md § 7.

**Impact:**
- If host can change squad rules mid-auction, all existing SquadRequirementProgress records are invalidated
- If host cannot change, database needs constraint to prevent edits after auction start

**Evidence from AGENTS.md:**
- § 4 (Backend authority): "The host may configure purse and squad requirements before auction start. Changes after start require explicit policy, permission and audit."

**Concrete Fix:**
1. Update item 18 (validation schema) to include audit note: "Squad rules are frozen at auction start; no edits allowed after DRAFT phase ends."
2. If needed, add database constraint: `AuctionRoom` or `Auction` should have `rulesLockedAt: DateTime` to enforce read-only after start
3. Add to item 20 integration test: attempt to edit squad rules after auction start, verify rejection
4. Document in item 23: squad rules are immutable during auction; to change, host must create new room

**Severity:** MEDIUM — missing constraint can allow accidental/malicious mid-auction rule changes.

---

### NIT SEVERITY

**13. DTOs lack serialization annotations (NestJS @Expose, @Transform)**

**Issue:** Plan item 3 defines DTOs but does not specify serialization (e.g., camelCase ↔ snake_case mapping in JSON responses).

**Location:** Plan item 3 (DTOs), item 4–5 (API endpoints).

**Impact:** Low — NestJS defaults to pass-through JSON, but explicit @Expose/@Transform improves code clarity.

**Concrete Fix:** Update item 3 DTO definitions to include serialization:
```typescript
export class BreakStatusDto {
  id: string;
  startedAt: Date;
  @Transform(({ value }) => value ? Math.floor((value - new Date()) / 1000) : 0)
  secondsRemaining: number;
}
```

---

**14. Event sequence not mentioned for break/squad events**

**Issue:** Plan item 6–7 defines event types but does not specify how event sequence is assigned and incremented for break/squad events.

**Location:** Plan items 6–7 (event types), item 23 (documentation).

**Impact:** Low — existing phase G likely has event sequence; plan should reference it, not redefine.

**Concrete Fix:** Update item 6–7 to note: "Break and squad events follow existing AuctionEvent.sequence pattern; sequencer increments automatically."

---

**15. TypeScript `any` avoidance: squad rule definitions**

**Issue:** Plan item 2 defines SquadsService methods but does not fully specify types for squad rule parameters (e.g., `role: PlayerRoleType | null`).

**Location:** Plan item 2 (SquadsService).

**Impact:** Low — minor type clarity issue.

**Concrete Fix:** Ensure all SquadsService methods explicitly type role, categoryId, minCount, maxCount parameters; avoid `any`.

---

## Verified Assumptions

✓ **Database schema is complete:** AuctionBreak, SquadRule, SquadRequirementProgress, AuctionConfigurationSnapshot, and BreakCounterScope enum are defined in Prisma schema.

✓ **Phase G foundation exists:** Existing services (BidAcceptanceService, SettlementService, AuctionEventBroadcasterService) can be extended with break/squad coordination.

✓ **Backend authority principle applies:** Plan respects that backend is authoritative for timers, bid validation, squad settlement.

✓ **State machine separation:** Plan correctly treats BREAK as a separate phase distinct from BIDDING.

✓ **Domain boundaries respected:** SquadsService and BreakManagerService are properly scoped to auction domain.

✓ **Socket.IO isolation:** Plan correctly specifies room-scoped events, no arbitrary channel selection.

---

## Unverified / Wrong Assumptions

✗ **ASSUMPTION: BreakManagerService in-memory bidCounter is acceptable.** 
   - **REALITY:** In-memory state is lost on restart; must persist to database.
   - **FIX:** See finding #8 (MEDIUM).

✗ **ASSUMPTION: Break counter scope is PER_PLAYER (default).**
   - **REALITY:** PRD and AGENTS.md explicitly state scope is unresolved pending product decision.
   - **FIX:** See finding #2 (HIGH).

✗ **ASSUMPTION: Break adjustment uses no optimistic concurrency.**
   - **REALITY:** Concurrent adjustments can collide; must use version check or deadline timestamp.
   - **FIX:** See finding #5 (HIGH).

✗ **ASSUMPTION: Squad validation integration into settlement is unspecified.**
   - **REALITY:** Plan does not state whether validation blocks or warns; defers to later phase.
   - **FIX:** See finding #3 (HIGH).

✗ **ASSUMPTION: Reconnect state reconciliation is covered by existing Phase G logic.**
   - **REALITY:** Plan does not explicitly specify break/squad state fetch on reconnect.
   - **FIX:** See finding #4 (HIGH).

---

## Summary

The implementation plan is **well-structured and mostly thorough**, but it contains **5 HIGH-severity ambiguities** that must be resolved before coding begins:

1. **Break state machine:** Confirm BREAK is a separate top-level phase, not nested.
2. **Counter scope:** Obtain explicit product decision on PER_PLAYER vs. PER_AUCTION.
3. **Squad validation at settlement:** Clarify whether validation blocks or warns.
4. **Reconnect reconciliation:** Specify fetch vs. event strategy for break/squad state.
5. **Concurrent break adjustments:** Add version/timestamp check for idempotent updates.

Additionally, 7 MEDIUM-severity issues and 3 NITs should be addressed via plan updates before implementation.

**Recommendation:** Resolve all HIGH findings and document answers in plan before assigning implementation tasks.

---

## Verdict

**Status:** `CHANGES_REQUESTED`

**Reason:** 5 HIGH-severity findings require resolution. Plan cannot proceed to implementation without clarifications on break phase semantics, counter scope decision, squad validation timing, reconnect logic, and concurrent update handling.

