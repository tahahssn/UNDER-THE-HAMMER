# Phase G Implementation Plan: Auction Engine and Live Bidding

**Status:** Ready for implementation  
**Target phases:** DRAFT → REGISTRATION → READY → LIVE → SETTLEMENT → CONCLUDED  
**Integration scope:** Backend auction state machine, bid validation, purse ledger, real-time events, frontend room UI  

---

## Overview

Phase G implements the core auction engine: a server-authoritative state machine that manages the entire auction lifecycle, validates and accepts bids with transaction-safe increment checking and purse validation, maintains an append-only purse ledger, selects players manually or automatically, and broadcasts synchronized events to all participants via WebSocket.

The database schema (packages/database/prisma/schema.prisma) already defines all entities (Auction, AuctionPlayer, Bid, PlayerAcquisition, AuctionTeam, TeamPurseTransaction, AuctionEvent, etc.). Implementation must create the NestJS service layer, state machine, bid validation rules, real-time WebSocket gateway, and frontend room UI that consumes those events.

**Key constraints:**
- Backend is authoritative for all auction state, bids, timers, purse balances and results.
- All money amounts stored and calculated as BigInt (minor units, no floating-point).
- Bid validation is transaction-safe with optimistic concurrency checks.
- Purse ledger is append-only; corrections use compensating transactions.
- Real-time events are authenticated, room-scoped and broadcast only after durable commit.
- State transitions are deterministic and validated server-side.
- Idempotency required for bid operations (duplicate request rejection).

---

## Implementation Items

### 1. NestJS Auction Module Structure
   
   **What:** Create the foundation modules for auction domain: core module structure, DTOs, error codes, enums.
   
   **Files to create:**
   - `apps/api/src/auctions/auctions.module.ts`
   - `apps/api/src/auctions/auctions.service.ts`
   - `apps/api/src/auctions/auctions.repository.ts`
   - `apps/api/src/auctions/auctions.controller.ts`
   - `apps/api/src/auctions/services/auction-state-machine.service.ts`
   - `apps/api/src/auctions/services/auction-configuration.service.ts`
   - `apps/api/src/auctions/dto/index.ts` (CreateAuctionDto, StartAuctionDto, etc.)
   - `apps/api/src/auctions/constants/auction-errors.ts` (error codes like INVALID_STATE_TRANSITION, etc.)
   
   **Verify:**
   - Run `npm --prefix apps/api run typecheck` — no TS errors.
   - Module can be imported into AppModule.

### 2. Bid Validation and Increment Engine

   **What:** Implement bid validation rules, minimum bid calculation, increment bracket lookup, and idempotency checking.
   
   **Files to create:**
   - `apps/api/src/auctions/services/bid-validation.service.ts`
     - `validateBidPlacement(auctionId, teamId, amountMinor, stateVersion, idempotencyKey)`
     - `computeMinimumBid(auctionId, currentBidMinor)` — lookup bracket, apply increment
     - `checkIdempotency(auctionId, idempotencyKey)` — prevent duplicate bids
   - `apps/api/src/auctions/services/bid-acceptance.service.ts`
     - `acceptBid(auctionId, playerId, teamId, amountMinor, userId, idempotencyKey, stateVersion)`
     - Atomically validate, reserve purse, update high bid and event sequence
   - `apps/api/src/auctions/constants/bid-errors.ts` (BELOW_MINIMUM, INSUFFICIENT_PURSE, UNSUPPORTED_STATE, DUPLICATE_BID, etc.)
   
   **Test coverage:**
   - Unit tests for increment bracket edge cases (PKR 1 crore boundary, above 4 crore).
   - Below-minimum bid rejection.
   - Insufficient purse rejection.
   - Idempotent retry of same bid (same idempotencyKey returns same result without duplicate).
   - Concurrent bids from different teams on same player (only highest wins).
   - Bid after server deadline (rejected deterministically).
   - Invalid team, room, or auction rejection.
   
   **Files to modify:**
   - `packages/database/prisma/schema.prisma` — verify Bid, AuctionIncrementBracket, AuctionTeam schemas (no changes needed; already present).
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/services/bid-validation.service.spec.ts` — all tests pass.
   - Run `npm --prefix apps/api run test -- auctions/services/bid-acceptance.service.spec.ts` — concurrent bid tests pass.

### 3. Purse Ledger and Financial Correctness

   **What:** Implement append-only purse ledger with balance tracking, acquisition settlement, and reversals.
   
   **Files to create:**
   - `apps/api/src/auctions/services/purse-ledger.service.ts`
     - `creditInitialPurse(auctionTeamId, purseMinor, currency)`
     - `debitAcquisition(auctionTeamId, acquisitionId, priceMinor)` — atomically debit and record
     - `reversePreviousDebit(auctionTeamId, acquisitionId)` — idempotent compensating entry
     - `getBalance(auctionTeamId)` — sum ledger with CHECK constraint enforcement
   - `apps/api/src/auctions/services/settlement.service.ts`
     - `settleBidAndAcquirePlayer(auctionId, auctionPlayerId, auctionTeamId, bidId, priceMinor)` — create acquisition and ledger entry atomically
     - `idempotentSettle(auctionId, auctionPlayerId)` — retry-safe, checks for prior settlement
   - `apps/api/src/auctions/constants/ledger-errors.ts` (INSUFFICIENT_BALANCE, INVALID_LEDGER_STATE, etc.)
   
   **Database changes:**
   - Add database CHECK constraint in migration: `ALTER TABLE "TeamPurseTransaction" ADD CONSTRAINT "purse_balance_non_negative" CHECK ("balanceAfterMinor" >= 0);`
   - Verify AuctionTeam.purseBalanceMinor is kept in sync with ledger sum (application-level enforcement).
   
   **Test coverage:**
   - Initial credit adds correct balance.
   - Acquisition debit reduces balance correctly.
   - Reversal adds compensating entry.
   - Balance underflow rejected (CHECK constraint).
   - Repeated settlement produces only one acquisition (idempotency).
   - Concurrent acquisitions on same team are serialized correctly.
   - Balance query correctly sums all ledger entries.
   
   **Files to modify:**
   - `packages/database/prisma/schema.prisma` — add migration script to add CHECK constraint.
   
   **Verify:**
   - Run `npm --prefix packages/database run migrate:dev` — migration succeeds.
   - Run `npm --prefix apps/api run test -- auctions/services/purse-ledger.service.spec.ts` — all tests pass.

### 4. Auction State Machine and Phase Transitions

   **What:** Implement deterministic state machine for DRAFT → REGISTRATION → READY → LIVE → SETTLEMENT → CONCLUDED with validation and immutability rules.
   
   **Files to create:**
   - `apps/api/src/auctions/services/auction-state-machine.service.ts`
     - `transitionTo(auctionId, targetPhase, stateVersion)` — validate transition, update phase, increment stateVersion
     - `validateTransition(currentPhase, targetPhase)` — allowed transitions only
     - `freezeConfigurationSnapshot(auctionId)` — capture settings before LIVE (immutable during auction)
     - `getCurrentPhase(auctionId)` — read current phase with version
   - Allowed transitions:
     - DRAFT → REGISTRATION (host only)
     - REGISTRATION → READY (all slots filled or deadline reached)
     - READY → LIVE (host only, snapshot configuration)
     - LIVE → SETTLEMENT (all players settled or auction ended)
     - SETTLEMENT → CONCLUDED (cleanup complete)
     - LIVE ⇄ PAUSED (host-controlled or system-driven)
   - Reject invalid transitions (e.g., LIVE → DRAFT, SETTLEMENT → REGISTRATION).
   
   **Configuration immutability:**
   - After transition to LIVE, AuctionConfigurationSnapshot is created from RoomSettings (version at that moment).
   - Auction uses snapshot during LIVE; RoomSettings edits do not affect running auction.
   - After CONCLUDED, entire auction is read-only.
   
   **Test coverage:**
   - Valid state transitions succeed.
   - Invalid transitions rejected with specific error code.
   - Configuration snapshot created at LIVE transition.
   - Stateversion incremented on each transition.
   - Concurrent transition attempts (race condition) resolved atomically.
   - PAUSED → LIVE resumes to correct phase.
   
   **Files to modify:**
   - `packages/database/prisma/schema.prisma` — verify Auction.phase, Auction.stateVersion, AuctionConfigurationSnapshot (already present).
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/services/auction-state-machine.service.spec.ts` — all tests pass.

### 5. Player Queue and Selection

   **What:** Implement manual player selection (host picks) and automatic draw (system selects random from pool).
   
   **Files to create:**
   - `apps/api/src/auctions/services/player-selection.service.ts`
     - `selectPlayerManual(auctionId, playerId)` — host picks player, move to ACTIVE
     - `drawPlayerAutomatic(auctionId)` — system randomly selects from QUEUED, move to ACTIVE
     - `getPlayerQueue(auctionId)` — ordered list of QUEUED players
     - `withdrawPlayer(auctionId, playerId)` — host removes player from auction
     - `markPlayerSold(auctionId, playerId, teamId, priceMinor)` — after settlement
     - `markPlayerUnsold(auctionId, playerId)` — if no bids or failed settlement
   - Queue ordering: configurable by host (category, role, random, etc.).
   
   **Test coverage:**
   - Manual selection moves player to ACTIVE.
   - Automatic draw randomly selects from QUEUED.
   - Withdrawn player removed from queue.
   - Current player fetched correctly.
   - Sold/unsold status updated.
   - Queue maintains integrity when players removed.
   
   **Files to modify:**
   - `packages/database/prisma/schema.prisma` — verify AuctionPlayer.status, .queuePosition, .selectionSource (already present).
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/services/player-selection.service.spec.ts` — all tests pass.

### 6. Real-Time WebSocket Gateway (Socket.IO)

   **What:** Implement Socket.IO gateway with authentication, room scoping, event broadcasting and reconnection recovery.
   
   **Files to create:**
   - `apps/api/src/auctions/gateways/auction-room.gateway.ts`
     - Authenticate socket via JWT middleware
     - `room:join` command → verify room membership, send snapshot
     - `room:leave` command → clean up connection
     - `bid:submit` command → validate, accept/reject, broadcast result
     - `auction:request-snapshot` command → resend current state
     - `chat:send` command → validate, broadcast to room
     - `auction:host-action` command → pause, resume, start, end (host only)
   - `apps/api/src/auctions/services/auction-event-broadcaster.service.ts`
     - `broadcastBidAccepted(roomId, auctionId, event)` — emit to room
     - `broadcastBidRejected(roomId, auctionId, event)` — emit to room
     - `broadcastPlayerSold(roomId, auctionId, event)` — emit to room
     - `broadcastPhaseChanged(roomId, auctionId, phase)` — emit to room
     - `broadcastCountdownUpdate(roomId, auctionId, secondsRemaining)` — emit to room
     - `broadcastBreakStarted(roomId, auctionId, durationSeconds)` — emit to room
     - Isolate events by room; never leak spectator-only or private data.
   - `apps/api/src/auctions/services/auction-snapshot.service.ts`
     - `generateSnapshot(auctionId, userId, role)` — full state for reconnect
     - Include: phase, current player, bids, purse balances, acquisitions, teams, timer state.
   - `apps/api/src/auctions/constants/socket-events.ts` — event names as constants.
   
   **Dependencies to add:**
   - `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`
   - Add to `apps/api/package.json`.
   
   **Configuration:**
   - Socket.IO adapter for horizontal scaling (Redis or in-memory for single server).
   - CORS allows only the web app domain.
   - JWT verification on socket connection.
   - Automatic reconnection recovery: last known event sequence, resend if gap detected.
   
   **Test coverage:**
   - Socket authentication required; unauthenticated connections rejected.
   - Room join validates membership; unauthorized joins rejected.
   - Bid submission calls bid-acceptance service and broadcasts result.
   - Reconnecting client receives fresh snapshot.
   - Events isolated per room; other rooms do not receive events.
   - Spectators cannot invoke bidding commands.
   - Host-only actions rejected for non-hosts.
   - Concurrent event broadcasts maintain order.
   
   **Files to modify:**
   - `apps/api/src/app.module.ts` — register WebSocketsModule.
   - `apps/api/src/auth/auth.module.ts` — add JWT verification guard for sockets.
   
   **Verify:**
   - Run `npm --prefix apps/api run typecheck` — no TS errors.
   - Run `npm --prefix apps/api run test -- auctions/gateways/auction-room.gateway.spec.ts` — all tests pass.
   - Run `npm --prefix apps/api run build` — build succeeds.

### 7. Auction Controllers (REST endpoints for setup and administration)

   **What:** Implement REST endpoints for creating auctions, starting, pausing, host actions, and querying state.
   
   **Files to create:**
   - `apps/api/src/auctions/auctions.controller.ts`
     - `POST /v1/auctions` — `createAuction(roomId, userId)` — create auction record from room
     - `GET /v1/auctions/:auctionId` — `getAuctionDetail(auctionId, userId)` — public if public room
     - `PUT /v1/auctions/:auctionId/start` — `startAuction(auctionId, userId)` — transition REGISTRATION → READY → LIVE
     - `PUT /v1/auctions/:auctionId/pause` — `pauseAuction(auctionId, userId, reason)` — host only
     - `PUT /v1/auctions/:auctionId/resume` — `resumeAuction(auctionId, userId)` — host only
     - `PUT /v1/auctions/:auctionId/conclude` — `concludeAuction(auctionId, userId)` — settle remaining, transition to CONCLUDED
     - `GET /v1/auctions/:auctionId/events` — `getAuctionEvents(auctionId, userId, fromSequence?)` — paginated event history
     - `POST /v1/auctions/:auctionId/select-player` — `selectPlayerManual(auctionId, userId, playerId)` — host only
     - `POST /v1/auctions/:auctionId/draw-player` — `drawPlayerAutomatic(auctionId, userId)` — host only (or system)
     - `GET /v1/auctions/:auctionId/teams` — `getTeams(auctionId, userId)` — team rosters, purses, acquisitions
   - Authorize all endpoints: verify user is participant, host, or spectator with appropriate permissions.
   
   **Test coverage:**
   - Unauthorized users cannot create or modify auctions.
   - Creating auction from non-existent room fails.
   - Creating auction binds room + auction + teams + players.
   - Starting auction freezes configuration.
   - Host can pause/resume.
   - Non-hosts cannot pause.
   - Conclude settles all remaining players.
   - Event history is complete and ordered.
   - Team data matches purse ledger sum.
   
   **Files to modify:**
   - `apps/api/src/app.module.ts` — ensure AuctionsModule is imported.
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/auctions.controller.spec.ts` — all tests pass.

### 8. Auction Domain Events (Event Sourcing Backbone)

   **What:** Create AuctionEvent records for every state change, bid, settlement and host action. Events are immutable, ordered and act as audit trail.
   
   **Files to create:**
   - `apps/api/src/auctions/services/auction-event-store.service.ts`
     - `recordEvent(auctionId, type, payload, actorId)` → atomically append with sequence number
     - Event types: AUCTION_CREATED, AUCTION_STARTED, PLAYER_INTRODUCED, BID_ACCEPTED, BID_REJECTED, PLAYER_SOLD, PLAYER_UNSOLD, BREAK_STARTED, BREAK_ENDED, AUCTION_PAUSED, AUCTION_RESUMED, AUCTION_CONCLUDED, PURSE_ADJUSTED, etc.
     - Each event includes stateVersion at time of emission.
   - Events are recorded only after successful state change; never for rejected operations.
   - getEventsSince(auctionId, fromSequence) — for reconnection recovery.
   
   **Test coverage:**
   - Events recorded in order (sequence is monotonic).
   - Event sequence gaps trigger reconnection resync.
   - Stateversion in event matches auction state at that moment.
   - Events are immutable (no updates, only new append).
   - All state transitions produce corresponding events.
   
   **Files to modify:**
   - `packages/database/prisma/schema.prisma` — verify AuctionEvent.sequence, .stateVersion, .type (already present).
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/services/auction-event-store.service.spec.ts` — all tests pass.

### 9. Break Management

   **What:** Implement break scheduling, countdown, duration adjustment and squad comparison display during breaks.
   
   **Files to create:**
   - `apps/api/src/auctions/services/break-manager.service.ts`
     - `scheduleBreakerOnBidCount(auctionId, bidsPerBreak, breakCounterScope)` — track bids, schedule break
     - `startBreak(auctionId, durationSeconds, reason)` — transition to BREAK phase, set deadline
     - `updateBreakDuration(auctionId, adjustmentSeconds)` — extend/shorten, host only, within limits
     - `endBreak(auctionId)` — transition back to BIDDING
     - `getBreakInfo(auctionId)` — current break state, deadline, remaining time
   - Respect configuration: break every N bids, duration limits, max adjustments per host.
   
   **Test coverage:**
   - Break scheduled after configured bid count.
   - Break countdown sent to clients.
   - Duration adjustment within limits accepted.
   - Adjustment beyond limit rejected.
   - Non-hosts cannot adjust.
   - Break ends correctly, returns to BIDDING phase.
   
   **Files to modify:**
   - `packages/database/prisma/schema.prisma` — verify AuctionBreak (already present).
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/services/break-manager.service.spec.ts` — all tests pass.

### 10. Turn-Based Auction Mode (Core; Turn-Based Logic)

   **What:** Implement turn-based auction format where each team gets a turn, can raise or pass, deadlines are per-turn.
   
   **Files to create:**
   - `apps/api/src/auctions/services/turn-based-engine.service.ts`
     - `initiateTurns(auctionId, auctionPlayerId)` — create turn for each team in order
     - `getCurrentTurn(auctionId, auctionPlayerId)` — which team's turn is it
     - `submitTurnAction(auctionId, auctionPlayerId, auctionTeamId, action: 'RAISE' | 'PASS', bidAmountMinor?)` — validate team, verify deadline, record action
     - `advanceTurn(auctionId, auctionPlayerId)` — move to next team
     - `determineTurnWinner(auctionId, auctionPlayerId)` — if one team left, they win; settle
   - Turn deadlines are server-managed; client cannot extend.
   - If timeout reached, auto-pass.
   
   **Test coverage:**
   - Turn order respects team slot index.
   - Raise records bid and validates purse.
   - Pass skips to next team.
   - Timeout auto-passes.
   - Final team raises and wins.
   - Only current team can act.
   - Bid validation same as countdown mode.
   
   **Files to modify:**
   - `packages/database/prisma/schema.prisma` — verify AuctionTurn (already present).
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/services/turn-based-engine.service.spec.ts` — all tests pass.

### 11. Countdown Timer Service (Server-Authoritative Timing)

   **What:** Implement server-driven countdown with client offset correction and deadline validation.
   
   **Files to create:**
   - `apps/api/src/auctions/services/countdown.service.ts`
     - `startCountdown(auctionId, durationSeconds)` — set phaseDeadline = now + duration
     - `getCountdownState(auctionId)` — returns { deadline: ISO timestamp, secondsRemaining: int }
     - `isDeadlineReached(auctionId)` — boolean; bid validation checks this
     - `extendCountdown(auctionId, extensionSeconds, reason)` — host extensible, within limits
     - Broadcast countdown updates at regular intervals (e.g., every 5 seconds).
   - Client receives deadline timestamp and calculates locally; server always wins in disputes.
   
   **Test coverage:**
   - Countdown starts with correct duration.
   - SecondRemaining decreases as expected.
   - Deadline reached check is accurate.
   - Extension within limit accepted.
   - Extension beyond limit rejected.
   - Bid rejected if placed after deadline.
   
   **Files to modify:**
   - `packages/database/prisma/schema.prisma` — verify Auction.phaseDeadline (already present).
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/services/countdown.service.spec.ts` — all tests pass.

### 12. Squad Requirements and Validation

   **What:** Implement dynamic squad rule validation (squad size, role counts, domestic/overseas limits, category counts).
   
   **Files to create:**
   - `apps/api/src/auctions/services/squad-validator.service.ts`
     - `validateSquadRequirements(auctionId, auctionTeamId)` → boolean, error list
     - `getSquadProgress(auctionId, auctionTeamId)` → { rule, currentCount, required, satisfied }
     - `updateProgressOnAcquisition(auctionId, auctionTeamId, playerId, role, domestic)` — recalculate progress
   - Rules applied at settlement and displayed during breaks.
   - Rules configured per auction (host/room settings).
   
   **Test coverage:**
   - Rules validated correctly.
   - Progress updated after each acquisition.
   - Unsatisfied rules identified.
   - Domestic/overseas counts correct based on player nationality and room rules.
   - Role counts correct based on player role.
   
   **Files to modify:**
   - `packages/database/prisma/schema.prisma` — verify SquadRule, SquadRequirementProgress (already present).
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/services/squad-validator.service.spec.ts` — all tests pass.

### 13. Frontend Auction Room (Next.js React)

   **What:** Build live auction room UI with real-time updates, bid controls, team panels, player card and countdown.
   
   **Files to create:**
   - `apps/web/src/app/(authenticated)/auction/[auctionId]/page.tsx` — room layout
   - `apps/web/src/components/auction-room/AuctionStage.tsx` — central player card and current state
   - `apps/web/src/components/auction-room/TeamPanel.tsx` — team purse, squad, role counts (reusable for all teams)
   - `apps/web/src/components/auction-room/CurrentTeamPanel.tsx` — highlighted for current user's team
   - `apps/web/src/components/auction-room/BidControl.tsx` — bid button, next-bid display, error states
   - `apps/web/src/components/auction-room/Countdown.tsx` — server-driven timer with client offset
   - `apps/web/src/components/auction-room/BreakOverlay.tsx` — squad comparison during break
   - `apps/web/src/components/auction-room/RoomChat.tsx` — real-time messages
   - `apps/web/src/components/auction-room/ConnectionIndicator.tsx` — reconnection state
   - `apps/web/src/hooks/useAuctionRoom.ts` — Socket.IO connection, event subscriptions, state management
   - `apps/web/src/hooks/useCountdownState.ts` — client-side countdown calculation from server deadline
   - `apps/web/src/lib/auction-socket-client.ts` — Socket.IO wrapper with event contracts
   - `apps/web/src/app/(authenticated)/auction/[auctionId]/layout.tsx` — authenticated shell
   - Responsive layout for desktop, tablet, mobile.
   - Respect reduced-motion.
   - Animate bid confirmations, sold/unsold moments, timer updates (smoothly, not blocky).
   - **Never show unconfirmed bid as accepted** until server confirms.
   
   **Components behavior:**
   - AuctionStage: displays current player card (front/back flip on click), leading bid, team.
   - TeamPanel: shows each team's remaining purse, acquired players, role/domestic counts.
   - CurrentTeamPanel: larger, highlighted, includes Bid button and next-bid amount.
   - BidControl: disabled when user not eligible, auction not in BIDDING, or purse insufficient. Shows reason on hover.
   - Countdown: receives deadline from server, displays remaining seconds, updates every 1s client-side.
   - BreakOverlay: full-screen, shows all teams' squads, requirements progress.
   - RoomChat: paginated, real-time append, rate-limit display.
   - ConnectionIndicator: visible when disconnected, shows reconnection progress.
   
   **Test coverage (Playwright E2E):**
   - Signed-in user can join public auction room.
   - Countdown displays and counts down.
   - Placing a valid bid shows pending state, then confirmation.
   - Placing below-minimum bid shows error.
   - Insufficient purse shows error and disables bid button.
   - Placing a bid updates team purse and other clients' views immediately.
   - Sold player triggers animation, removes from queue, updates acquisition list.
   - Spectator view is read-only; bid button disabled.
   - Disconnect and reconnect recovers state.
   - Break view shows squad requirements.
   - Chat message sent and received.
   
   **Files to modify:**
   - `apps/web/src/app/(authenticated)/auction/layout.tsx` — ensure layout exists.
   - `apps/web/src/lib/api-client.ts` — add Socket.IO client initialization.
   
   **Verify:**
   - Run `npm --prefix apps/web run typecheck` — no TS errors.
   - Run `npm run test -- apps/web` — component unit tests pass (if any).
   - Run E2E tests: `npm --prefix apps/e2e run test -- auction-room.spec.ts` — user journey passes.

### 14. Comprehensive Test Suite

   **What:** Add targeted tests for all critical paths: bid acceptance, concurrent scenarios, state transitions, settlement, reconnection.
   
   **Files to create:**
   - `apps/api/src/auctions/__tests__/bid-concurrent.integration.spec.ts`
     - Simulate 2+ teams bidding on same player simultaneously.
     - Only highest bid accepted; other bids rejected.
     - Both teams' purses updated correctly.
     - Event sequence and state version incremented correctly.
   - `apps/api/src/auctions/__tests__/settlement-idempotency.spec.ts`
     - Settlement called twice with same input.
     - Only one acquisition created.
     - Only one purse debit recorded.
     - Balance correct.
   - `apps/api/src/auctions/__tests__/deadline-enforcement.spec.ts`
     - Bid placed before deadline accepted.
     - Bid placed at deadline accepted.
     - Bid placed after deadline rejected (DEADLINE_PASSED).
   - `apps/api/src/auctions/__tests__/state-machine.spec.ts`
     - Valid transitions succeed.
     - Invalid transitions rejected.
     - Configuration immutability after LIVE.
   - `apps/api/src/auctions/__tests__/reconnection.integration.spec.ts`
     - Client disconnects mid-bidding.
     - Client reconnects, receives snapshot.
     - Snapshot includes all bids up to current sequence.
     - State is consistent.
   - `apps/api/src/auctions/__tests__/host-subscription-enforcement.spec.ts`
     - User without host entitlement cannot create auction.
     - User with entitlement can create.
   - `apps/web/src/__tests__/auction-room.e2e.spec.ts` (Playwright)
     - Full end-to-end: sign in, join room, place bid, observe confirmation, disconnect/reconnect.
   
   **Verify:**
   - Run `npm --prefix apps/api run test -- auctions/__tests__` — all tests pass.
   - Run `npm --prefix apps/e2e run test -- auction-room.spec.ts` — E2E passes.

### 15. Database Migrations

   **What:** Create Prisma migration to add CHECK constraint on purse balance and create indexes for performance.
   
   **Files to create:**
   - `packages/database/prisma/migrations/<timestamp>_auction_constraints.sql`
     ```sql
     ALTER TABLE "TeamPurseTransaction" 
       ADD CONSTRAINT "purse_balance_non_negative" 
       CHECK ("balanceAfterMinor" >= 0);
     
     CREATE INDEX "idx_auction_event_sequence" ON "AuctionEvent"("auctionId", "sequence");
     CREATE INDEX "idx_bid_auction_idempotency" ON "Bid"("auctionId", "idempotencyKey");
     CREATE INDEX "idx_acquisition_auction_player" ON "PlayerAcquisition"("auctionId", "auctionPlayerId");
     CREATE INDEX "idx_purse_transaction_team" ON "TeamPurseTransaction"("auctionTeamId", "createdAt");
     ```
   
   **Verify:**
   - Run `npm --prefix packages/database run migrate:dev` — migration succeeds.
   - Run `npm run db:validate` — schema compiles without errors.

### 16. Integration with App Module and Boot

   **What:** Register all auction services and gateways in NestJS AppModule, enable WebSockets, verify boot.
   
   **Files to modify:**
   - `apps/api/src/app.module.ts`
     - Import `AuctionsModule`
     - Import `WebSocketsModule` or ensure Socket.IO is configured
   - `apps/api/src/main.ts`
     - Verify Socket.IO is attached to the Express app via NestJS platform
   
   **Verify:**
   - Run `npm --prefix apps/api run build` — full build succeeds.
   - Run `npm --prefix apps/api run start` — API starts, WebSocket gateway initializes.
   - Check logs: no errors on startup.

### 17. Build and Full Integration Verification

   **What:** Run full test suite, type checking, build for all packages and verify no regressions.
   
   **Verify:**
   - Run `npm run typecheck` — no TS errors across entire monorepo.
   - Run `npm run test` — all tests pass (backend unit, integration, E2E).
   - Run `npm run build` — full build succeeds.
   - Run API locally: `npm --prefix apps/api run start` — connects to database, listens on port, Socket.IO ready.
   - Run web app locally: `npm --prefix apps/web run dev` — Next.js starts, can navigate to auction room.
   - Manual smoke test: sign in, join room, place bid, observe real-time updates.

---

## Digest

### Core Auction Service Layer
**Block:** Auction entity lifecycle, state machine, event sourcing  
**Files:** `auctions.service.ts`, `auction-state-machine.service.ts`, `auction-event-store.service.ts`, `auctions.repository.ts`  
**Tests:** `auctions.service.spec.ts`, `auction-state-machine.service.spec.ts`  
**Verified:** State transitions, event sequence, configuration immutability

### Bid Validation and Acceptance
**Block:** Bid submission validation, increment bracket lookup, idempotency, concurrent safety  
**Files:** `bid-validation.service.ts`, `bid-acceptance.service.ts`  
**Tests:** `bid-validation.service.spec.ts`, `bid-concurrent.integration.spec.ts`  
**Verified:** Minimum bid calculation, purse deduction, duplicate prevention, concurrent bid race handling

### Financial Correctness
**Block:** Append-only purse ledger, acquisition settlement, reversals, balance enforcement  
**Files:** `purse-ledger.service.ts`, `settlement.service.ts`  
**Tests:** `purse-ledger.service.spec.ts`, `settlement-idempotency.spec.ts`  
**Verified:** Ledger integrity, CHECK constraint on negative balance, idempotent settlement, concurrent debit serialization

### Real-Time Events
**Block:** Socket.IO gateway, authentication, room scoping, reconnection recovery, event broadcasting  
**Files:** `auction-room.gateway.ts`, `auction-event-broadcaster.service.ts`, `auction-snapshot.service.ts`  
**Tests:** `auction-room.gateway.spec.ts`, `reconnection.integration.spec.ts`  
**Verified:** Socket authentication, room isolation, event order, snapshot completeness, concurrent broadcasts

### Player Selection and Lifecycle
**Block:** Queue management, manual/automatic selection, sold/unsold marking  
**Files:** `player-selection.service.ts`  
**Tests:** `player-selection.service.spec.ts`  
**Verified:** Queue ordering, random draw fairness, status transitions, current player tracking

### Auction Configuration
**Block:** Rules snapshot at LIVE, bid increment brackets, squad requirements, break scheduling  
**Files:** `auction-configuration.service.ts`, `break-manager.service.ts`, `squad-validator.service.ts`, `countdown.service.ts`  
**Tests:** Respective `.spec.ts` files  
**Verified:** Configuration immutability after LIVE, bracket edge cases, rule validation, timer accuracy

### REST API Layer
**Block:** Endpoints for auction CRUD, state transitions, player selection, event history  
**Files:** `auctions.controller.ts`  
**Tests:** `auctions.controller.spec.ts`  
**Verified:** Authorization checks, state validation, payload validation

### Frontend UI
**Block:** Live room layout, real-time bid control, countdown, team panels, break view  
**Files:** React components in `apps/web/src/components/auction-room/`, hooks, page layout  
**Tests:** Playwright E2E test  
**Verified:** Real-time updates, bid submission flow, spectator read-only, disconnect/reconnect, responsive layout

### Database and Migrations
**Block:** CHECK constraint on purse balance, performance indexes  
**Files:** Prisma migration SQL  
**Verified:** Migration succeeds, schema compiles, constraints enforced

### Build and Integration
**Block:** AppModule imports, WebSocket registration, full monorepo build  
**Verified:** TypeScript strict mode, full build succeeds, no regressions, API and web start cleanly

---

## Key Architecture Decisions

1. **State Machine:** DRAFT → REGISTRATION → READY → LIVE → SETTLEMENT → CONCLUDED. Prevents invalid transitions. Configuration snapshot at LIVE blocks mid-auction changes.

2. **Financial Model:** All amounts as BigInt (minor units, no floating-point). Append-only ledger with CHECK constraint prevents negative balance. Idempotent settlement prevents double-debit.

3. **Idempotency:** Bid operations identified by `idempotencyKey`. Duplicate requests return same result without duplicate side effects.

4. **Real-Time Architecture:** Socket.IO authenticated per user, scoped per room, events broadcast after durable commit. Snapshot on reconnect includes all events since last known sequence.

5. **Bid Validation:** Server-authoritative deadline, purse, increment checks. Client cannot override. Rejected bids return deterministic error codes, never accepted.

6. **Concurrency:** Optimistic stateVersion on Auction; bids check and increment. Acquisition settled atomically with ledger entry. Turn order and countdown are server-managed.

7. **Auditability:** All state changes produce AuctionEvent records (append-only). Host actions logged in AuctionHostAction. Admin can inspect full history.

8. **Scalability:** Modular services allow independent testing and potential extraction. Redis adapter for Socket.IO supports horizontal scaling. Indexes on frequently queried fields.

---

## Open Decisions Remaining

These are recorded in PRD.md and do not block Phase G implementation; resolve before release:

1. Exact host subscription entitlement limits (rooms, spectators, team count per room).
2. Exact PSL preset rules for the target season (squad composition, overseas limits).
3. Turn-based auction rules (D-06): join after start, host participation, final winner determination.
4. Five-bid break counter scope: per player or per auction (D-01 clarification).
5. External meeting link allowlist: initial providers (Google Meet, Discord).
6. Payment webhook retry and idempotency (payment processing is separate Phase 8).

---

## Implementation Notes

- **Shared Contracts:** Use `packages/contracts/src/` for auction DTOs and Socket.IO event schemas. Keep them in sync with database models.
- **Validation:** Use Zod schemas for all external input (REST and Socket.IO).
- **Error Handling:** NestJS global exception filter catches and logs; return deterministic HTTP/event error codes to clients.
- **Logging:** Structured logs via pino. Correlation ID in every request. Audit-sensitive operations (bids, settlements, refunds).
- **Testing:** Unit tests for domain logic, integration tests for database interactions, E2E for user journeys. Target >80% coverage for auction module.
- **Deployment:** Environment variables for database, Redis, Cognito, S3. Secrets in secret manager (never source control). Migrations run on deploy.
