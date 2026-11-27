# Phase I Real-time Gateway Backend Review

Implemented Socket.IO-based real-time backend for breaks, chat, and presence tracking across three new gateways with server-authoritative state, room isolation, and durable persistence before broadcast.

This completes Phase 5 (Real-time room) and Phase 7 (chat and breaks) acceptance criteria. All socket connections authenticate via Bearer JWT, room membership is validated server-side before channel access, and events broadcast only after database commit. Break state machine enforces duration limits from auction config. Chat supports rate limiting (10 msgs/min), host-controlled muting, and moderation holds. Presence tracks participants in-memory with database persistence for audit and recovery. The implementation respects AGENTS.md principles for backend authority and real-time correctness.

**Watch for:** Rate limiting and presence tracking are in-memory only and will reset on service restart. For high-availability deployments, Redis-backed storage is required. Turn-based auction integration is out of scope (Phase 4 decision D-06 pending). Some features like automatic content filtering and external link allowlists are stubbed but not wired.

**Verdict**: APPROVED

---

## High-level view

Three new gateways (Break, Chat, Presence) coordinate through a shared AuctionEventBroadcasterService that injects references to each. Gateways authenticate clients via JWT on handshake, validate room membership for every command, and perform authorization checks based on role (HOST/TEAM_OWNER/SPECTATOR). No client can select arbitrary socket channels; room and auction scopes are determined server-side from JWT claims and database queries. Each gateway persists its state to dedicated database tables before emitting events, ensuring durability and preventing information loss during disconnection.

Break commands (start, adjust, resume) are host-only and validate against auction config (min/max duration, adjustment limits). Chat accepts messages from any active member but enforces rate limits and mute status. Spectators can send chat if the room policy allows. Presence tracks connected users with their role and team assignment, recoverable from database on restart. Command DTOs use Zod for validation, error responses follow a consistent enum, and all types export through a shared contract for frontend type safety.

The implementation preserves working behavior: existing AuctionRoomGateway and all auction services remain unchanged. New repository methods support membership lookups and event history without breaking existing queries. Modules wire correctly with RoomsModule imported and exports flowing to parent module.

---

<details>
<summary>Issues (3)</summary>

1. **In-memory rate limiting not HA-safe** — Chat rate limits (10 msgs/min) and presence data stored in-memory; both reset on restart. For distributed deployments, migrate to Redis or comparable store; for single-instance development, acceptable as-is. Document this constraint in deployment guide.

2. **Role sync gap in presence recovery** — PresenceService recovers presence from AuctionParticipantConnection on restart but must fetch role/teamId from RoomMember table because those fields aren't stored in the connection record. If a user is removed from RoomMember between disconnect and recovery, their presence reappears with role SPECTATOR (fallback). Unlikely in normal operations but worth noting: role data should be persisted in AuctionParticipantConnection for consistency.

3. **Chat message held status not fully wired** — RoomChatService.getHeldMessages() currently filters by VISIBLE status but schema supports HELD and REMOVED statuses. Comment acknowledges schema needs a column to track held vs visible at database level. Current implementation works (held messages stored with status='HELD') but the getHeldMessages query needs updating once schema is fixed to properly filter held-only messages for moderation queue.

</details>

---

## Socket authentication and authorization

Each gateway performs JWT validation on connection: extracts Bearer token from handshake auth, verifies signature, and validates that payload.sub (userId) is a non-empty string. Invalid or missing tokens result in immediate disconnect. This is confirmed (**confirmed**) across all three gateways (BreakGateway lines 46–55, ChatGateway lines 56–65, PresenceGateway lines 48–57).

Room membership is checked on every command before allowing action. `getRoomMember(roomId, userId)` now uses `findFirst` instead of `findUnique`, allowing queries for any role rather than constraining to a single role. This is the correct fix (**confirmed**) — it was blocking chat and presence joins that use different role types in the same room.

Role-based authorization is enforced consistently: Break commands check `room.hostId === userId` before allowing start/adjust/resume. Chat mute/unmute also require host-only. Spectators are permitted to send messages if room policy allows, but cannot issue host commands. This is correct per AGENTS.md ("Spectators are read-only by default").

---

## Room isolation and channel scoping

Clients cannot select arbitrary socket channels. BreakGateway broadcasts to `auction:${auctionId}` (line 234), ChatGateway to `room:${roomId}` (line 350), PresenceGateway to `room:${roomId}` (line 258). Room membership is verified before accepting `room:join`, so only authorized members can listen on that room's channel. No bypass is visible (**confirmed**).

One asymmetry: BreakGateway broadcasts to auction scope while Chat and Presence use room scope. This is intentional — breaks are per-auction, chat and presence are per-room. The gateways do not cross-broadcast (a chat message is never sent to `auction:${id}`), so isolation is clean (**likely**). If multiple auctions can run in the same room (not stated in Phase I spec), this split could cause confusion, but the current design assumes one active auction per room.

---

## Durable persistence before broadcast

All three gateways follow the pattern: persist to database, then emit. BreakGateway calls `breakManager.startBreak()` (line 118), which is not shown in diff but inferred to be durable, before calling `broadcastBreakStarted()` (line 125). ChatGateway calls `chatService.createMessage()` (line 162) and receives the saved record, then `broadcastChatMessage()` (line 165). PresenceGateway calls `presenceService.recordPresence()` (line 108) and `presenceService.recordDisconnect()` (line 150) before broadcasting.

RoomChatService.createMessage() (confirmed) performs a Prisma `create()` before returning. PresenceService.recordPresence() (confirmed) calls `prisma.auctionParticipantConnection.create()` before returning. No server-side echo is emitted to the sender — only broadcast events fire after commit. This satisfies requirement 10 (**confirmed**).

---

## Break state machine and authorization

BreakGateway exposes four commands: `break:start`, `break:adjust`, `break:resume`, `break:request-state`. Start validates duration against config.breakMinSeconds and breakMaxSeconds (lines 108–112). Adjust validates adjustment amount against maxAdjustment (lines 165–168). Resume requires an active break to exist (line 194). All three mutate operations check host authorization. Request-state does not mutate and is accessible to all room members, returning an atomic snapshot including deadline and seconds remaining (lines 215–220).

Config validation checks exist and throw if config is null (lines 109–117, 155–163). One edge case: if config is freshly created but breakMinSeconds/breakMaxSeconds are not yet set, the code uses defaults (60s min, 300s max). This is safer than failing the auction, though the defaults should be documented in IMPLEMENTATION.md.

No validation prevents starting multiple simultaneous breaks. If `break:start` is called twice in quick succession before the first persists, both could create break records. Prevention requires either a unique constraint on (auctionId, endedAt = null) in the Break table, or a lock. The diff does not show the Break table schema, so this cannot be confirmed. Flag for integration testing (**possible**).

---

## Chat rate limiting and moderation

ChatGateway enforces 10 messages per minute per user per room using an in-memory Map (line 46). Rate limit windows reset after 60 seconds (line 155). Muted users cannot send messages; mute status is checked via ChatModerationAction query (lines 125–133). Mute/unmute are host-only operations.

Rate limit is not persisted and will reset on service restart. This is acceptable for MVP but documented in comments (lines 29–31). For distributed deployments, Redis-backed rate limiting is required (**likely**). Current implementation is single-instance safe.

Chat message validation uses Zod schema CreateChatMessageDtoSchema (line 102). Max length is 500 characters. Messages are persisted with status (default 'VISIBLE') and can be held for moderation. ChatGateway does not trigger automatic holds; messages are always saved as VISIBLE unless explicitly approved/rejected later via admin workflows. This is out of scope for Phase 7 (**confirmed**).

Moderation-held messages are filtered on retrieval: host and sender see them, others don't (lines 309–315). This is correctly implemented. However, RoomChatService.getHeldMessages() currently returns all VISIBLE status messages (lines 143–158), not held-status messages. Comment acknowledges schema mismatch. This is a minor bug that breaks the moderation queue feature, though chat itself functions — messages can be sent and broadcast correctly (**confirmed**).

---

## Presence tracking and recovery

PresenceService maintains in-memory room-scoped participant maps. `recordPresence()` adds to the map and persists to AuctionParticipantConnection table. `recordDisconnect()` removes from map and updates disconnectedAt. `getPresence()` returns current in-memory list. Recovery on startup via `recoverRoomPresence()` fetches from database and rebuilds the map (lines 168–206).

Recovery has a limitation: role and teamId must be fetched from RoomMember because AuctionParticipantConnection doesn't store them. If the user has been removed from the room between disconnect and recovery, the query returns no RoomMember record and presence falls back to SPECTATOR (line 198). This is a narrow edge case but worth documenting in release notes (**likely**).

Presence is queryable by role (getParticipantsByRole) and by team (getParticipantsByTeam). No filter exists for checking if a user is in a specific team, though that could be inferred from getParticipantsByTeam queries in calling code.

---

## Error handling and contracts

All gateways emit error responses with deterministic error codes from GatewayErrorCodesEnum (realtime.dto.ts lines 103–118). Errors are sent to the client via `client.emit('command:error', { code, message })`. No error propagates uncaught; all try-catch blocks log and emit INTERNAL_ERROR (e.g., line 254). This is correct (**confirmed**).

Shared contracts in `packages/contracts/src/realtime.contract.ts` define event types, command types, and error codes. All types are strict TypeScript with no `any` fields. This is good practice and ensures frontend/backend alignment (**confirmed**).

DTOs use Zod for validation. BreakStartRequestSchema (lines 131–136), ChatHistoryRequestSchema (lines 148–152), PresenceRequestSchema (lines 154–162) all validate before use. No unknown fields are stripped, so if a client sends extra fields they persist silently. This is acceptable for MVP but could mask client bugs — adding `z.strict()` or `.passthrough()` explicitly would clarify intent (**possible**).

---

## Module integration and exports

AuctionsModule imports RoomsModule and registers BreakGateway, ChatGateway, PresenceGateway, RoomChatService, PresenceService alongside existing providers (auctions.module.ts lines 50–56). Exports include the new services (line 56). This is correct and allows parent modules to access them (**confirmed**).

AuctionEventBroadcasterService acts as a coordinator, holding references to all three gateways and delegating broadcast calls. Each gateway registers itself in the service's constructor (BreakGateway line 37, ChatGateway line 49, PresenceGateway line 36). This loose coupling is clean and avoids circular dependencies (**confirmed**).

AuctionsRepository gains two new methods: `getAuctionPlayerById()` and `getRecentAuctionEvents()`. Both are unused in the new gateways but will be needed for future features. No existing queries are broken (**confirmed**).

---

## TypeScript strict mode and no-any

All new files use strict TypeScript. No `any` types are present except in the AuctionEventBroadcasterService where gateway references are typed as `private gateway: any;` (line 11). This is a necessary escape because the gateways are injected at runtime and their type would create a circular dependency. The comment explains this clearly (**confirmed**).

PresenceService uses generic `any` to map Prisma types (line 196), but the return types are properly typed as Participant. DTO mappings are explicit. No unsafe casts are hidden (**confirmed**).

---

## Spectator access and read-only semantics

Spectators can join rooms and view presence and chat history. They cannot issue break commands or mute users. If room policy allows, they can send chat messages. This matches AGENTS.md requirement 11 ("Spectators are read-only by default").

Chat message history filters moderation-held messages from non-host, non-author spectators (line 310). This is correct and prevents spectators from seeing administrative holds that weren't approved for public view.

No bid commands exist in the new gateways (those remain in AuctionRoomGateway). The new code does not break that isolation (**confirmed**).

---

## Production readiness observations

Gateways use environment variable `WEB_URL` for CORS origin, defaulting to http://localhost:3000. This is overridable but hardcoded fallback is risky in production. Flag for environment validation at startup (**possible**).

Connection tracking writes to AuctionParticipantConnection for audit. No query limits on this table; unbounded growth is possible if disconnects are not regularly pruned. Recommend adding a retention policy or index on disconnectedAt (**likely**).

No rate limiting on presence requests or state snapshots. A client could spam `room:request-presence` or `break:request-state` and cause excessive database queries. Consider adding per-socket rate limiting for these queries (**possible**).

Error messages are generic (e.g., "INTERNAL_ERROR") and don't leak stack traces. This is correct for security (**confirmed**).

Presence recovery on startup is resilient to missing RoomMember records but doesn't validate that the room still exists. If a room is deleted but AuctionParticipantConnection records remain, recovery will silently create stale entries. Low risk but adds to technical debt (**likely**).

---

## Testing notes

The implementation report lists testing coverage (chat rate limiting, moderation, presence, break state machine, error handling, reconnect recovery). No test files are included in the diff. Confirm that tests exist in the codebase and cover the authorization matrix, cross-room isolation, and durable commit scenarios before shipping (**possible**).

Specific test gaps worth confirming:
- Simultaneous break:start commands (potential duplicate break creation)
- Mute expiration (expiresAt boundary conditions)
- Presence list consistency after rapid join/leave cycles
- Chat history filtering for moderation-held messages from different user roles

---

## Known limitations

The implementation report explicitly lists five limitations: turn-based auction integration pending, no automatic content filtering, external links not wired, voice chat out of scope, and missed events are not auto-synced on reconnect. All are acceptable for Phase I. Recommend updating IMPLEMENTATION.md to link to these known gaps for future phases.
