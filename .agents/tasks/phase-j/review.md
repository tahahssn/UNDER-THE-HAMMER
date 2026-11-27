# Live auction room: player advancement and reconnect leading-bid now work; four polish items remain

Third-pass review. The prior pass (CHANGES_REQUESTED, two MEDIUM blockers) flagged that the next player never advanced live and that reconnect/sold snapshots dropped the leading bid. Commit `cc5c32a` resolves both: player selection now broadcasts a `player:introduced` socket event that the client reacts to by re-snapshotting, and the snapshot sources the high bid from the active `AuctionPlayer` (not the legacy `auction.highBidMinor`) while `reconcileFromSnapshot` maps it back into the current player's leading team. I traced both fixes end-to-end through the gateway, broadcaster, service, snapshot service, and the two client hooks; they are real and consistent. What remains are the four LOW items the commit explicitly deferred as non-blocking.

**Watch for:** the break-cadence countdown (`bidsUntilBreak`) is a per-player client approximation that resets whenever the bid feed clears on a player change, so it can diverge from the server's configurable/global cadence (confirmed, LOW); the bid form still defaults to the product sample increment brackets rather than the room's configured ones, so a customized room gets a mismatched "next valid bid" preview while the backend stays authoritative (confirmed, LOW); squad-requirement rows render zero progress for every team because `mapSquadRules` hardcodes `currentCount: 0`/`satisfied: false` (confirmed, LOW); `BidPlacementForm` still declares a required `roomId` prop it never reads (confirmed, LOW).

**Verdict**: APPROVED

## High-level view

The live loop now functions end-to-end. When a host picks the next player, `AuctionsService.selectPlayerManual`/`drawPlayerAutomatic` call `broadcaster.broadcastPlayerIntroduced`, the gateway emits `player:introduced` to the room, and `useAuctionRealTime` requests a fresh `room:snapshot` in response. The snapshot handler on the gateway (`auction:request-snapshot`) exists and answers, so the active player, its base price, and its leading bid advance during the auction rather than only on reconnect. This closes the pass-2 MEDIUM-1 gap and the core "players introduced one by one" journey.

Reconnect no longer loses the leading bid. The snapshot service reads `currentBidMinor`/`leadingAuctionTeamId` from the active `AuctionPlayer` and emits them as string-encoded top-level `highBidMinor`/`highBidTeamId`; `reconcileFromSnapshot` resolves the team name from the snapshot's team list and reconstructs `currentPlayer.leadingTeam`. The bid form therefore computes its minimum from the real leading amount after a reconnect or a `player:sold` snapshot, closing MEDIUM-2. Sourcing the high bid from `AuctionPlayer` instead of the legacy `auction.highBidMinor` is the correct call and the one the pass-2 review asked to verify.

The remaining items are all presentation-layer and non-blocking, and the commit message acknowledges each. The break countdown is a client preview scoped per player; the increment brackets shown are the product defaults, not the room's configured ones; the break overlay's requirement rows carry no per-team fulfillment; and the form has one dead prop. None of these affect backend-authoritative behaviour — bids, purses, and break decisions remain server-validated.

<details>
<summary>Issues (4)</summary>

1. **Break cadence counter is a per-player approximation** — `bidsUntilBreak = 5 - (acceptedThisPlayer % 5)` counts accepted bids in the current feed, which `reconcileFromSnapshot` clears on each new player, so the countdown restarts per player instead of tracking the server's configurable/global cadence (AGENTS.md §7 warns against silently assuming counter scope). Source the remaining count from the backend or scope the client preview explicitly and document it.
2. **Room increment brackets not wired** — `BidPlacementForm` defaults `incrementBrackets` to `DEFAULT_INCREMENT_BRACKETS` and the page passes none, so a room with host-configured brackets gets a mismatched "next valid bid" preview (backend still authoritative). Fetch and pass the room's configured brackets.
3. **Squad-requirement rows show no progress** — `mapSquadRules` hardcodes `currentCount: 0` and `satisfied: false`, so the break overlay lists the configured requirements but every row reads zero for every team. Populate per-team progress or document that the rows are static requirement labels.
4. **Dead `roomId` prop on BidPlacementForm** — declared required and passed by the page, but never read inside the component. Remove it or use it.

</details>

<details>
<summary>Details</summary>

### Live player advancement (pass-2 MEDIUM-1, resolved)

The advance path is now wired across three layers and I traced each hop:

```
selectPlayerManual/drawPlayerAutomatic
  -> playerSelection.selectPlayerManual(...)   // sets auction.currentAuctionPlayerId
  -> eventStore.recordEvent('PLAYER_INTRODUCED', ...)
  -> broadcaster.broadcastPlayerIntroduced(auctionId, { auctionPlayerId, selectionSource })
       -> gateway.broadcastPlayerIntroduced -> server.to(`auction:${id}`).emit('player:introduced', ...)
```

On the client, `useAuctionRealTime` subscribes to `player:introduced` and responds with `socket.emit('auction:request-snapshot', { auctionId })`; the gateway's `@SubscribeMessage('auction:request-snapshot')` handler generates a role-filtered snapshot and emits `room:snapshot`, which `reconcileFromSnapshot` applies. Because the player-selection service persists `currentAuctionPlayerId` before the broadcast returns, the requested snapshot reflects the newly active player. The `player:sold` handler still re-snapshots to refresh purses and squad counts; the next player now arrives via the subsequent `player:introduced`, not by a snapshot timed to the sale. The pass-2 freeze-after-sale behaviour is gone.

### Snapshot reconcile restores the leading bid (pass-2 MEDIUM-2, resolved)

`auction-snapshot.service.ts` now reads the high bid from the active player:

```
highBidMinor = current.currentBidMinor != null ? current.currentBidMinor.toString() : null;
highBidTeamId = current.leadingAuctionTeamId ?? null;
```

and emits both at the snapshot top level (plus `basePriceMinor` as a string) so the Socket.IO JSON serializer can carry the `BigInt` money. `reconcileFromSnapshot` reads `snap.highBidMinor`/`snap.highBidTeamId`, resolves the team name from `snap.teams`, and sets `currentPlayer.leadingTeam` accordingly; `asMinor` tolerates the string encoding. A player with no bid yields `currentBidMinor == null` → `leadingTeam = null`, which `PlayerIntroduction` renders as "no bids yet". The page derives `currentLeadingBid` from `leadingTeam`, so `computeMinimumBid` now starts from the real leading amount after reconnect instead of the base price. The comment in the snapshot service correctly documents that `auction.highBidMinor` is legacy and no longer maintained — this is the verification the pass-2 review requested, and it checks out.

### Break cadence counter scope (LOW, unresolved)

`bidsUntilBreak = BREAK_AFTER_N_BIDS - (acceptedThisPlayer % BREAK_AFTER_N_BIDS)` where `acceptedThisPlayer` counts accepted bids in the current feed. Since `reconcileFromSnapshot` clears `bids` on every player change, the counter restarts per player and reflects per-player accepted bids, not a running or host-configurable cadence. AGENTS.md §7 requires the counter scope to be configurable or explicitly resolved. The page documents `BREAK_AFTER_N_BIDS = 5` as a client preview with the backend authoritative, which softens this to LOW, but the displayed countdown can still mislead.

### Increment brackets default to the product sample (LOW, unresolved)

`BidPlacementForm` defaults `incrementBrackets` to `DEFAULT_INCREMENT_BRACKETS` (the AGENTS.md §7 sample tiers) and the page passes no room-specific brackets. Rooms may configure their own brackets, so the client's "next valid bid" suggestion can disagree with server validation for a customized room. Money handling itself is sound — integer minor units throughout, consistent between `computeMinimumBid` and `formatMoney`.

### Squad requirement rows are static (LOW, unresolved)

`mapSquadRules` builds each requirement with `currentCount: 0` and `satisfied: false` unconditionally (confirmed at `useAuctionState.ts:164,167`). The break overlay lists the configured requirements but shows no per-team fulfillment, so each row reads "0 / min" mid-auction. Either populate per-team progress or document the rows as static labels.

### Dead `roomId` prop (LOW, unresolved)

`BidPlacementForm` declares `roomId: string` as required and the page passes it, but `roomId` appears exactly once in the file (the declaration) — it is never read. No correctness impact.

### What is solid

The two blocking fixes are the substance of this pass and both hold up under tracing. Beyond them: new code stays TypeScript-strict with no `any`; the optimistic-bid reconciliation keys off the idempotency key the gateway echoes on `bid:accepted`/`bid:rejected`/`bid:error`, with a double-submit guard; `BidPlacementError` maps every Phase G rejection code the spec names to a title plus recovery suggestion and announces via `role="alert"`; `TeamStandings` is driven entirely by the `teams` prop with a 1/2/3/4-column responsive grid and no eight-team assumption; keyboard support (Enter submit, Escape clear), `focus-visible` outlines, and `motion-safe:` transitions are present. The coder reports Phase J suites 71/71 passing at ~97.6% statement/line coverage, with the 12 failing web tests isolated to untouched Phase I `usePresence`/`useRoomChat` harnesses; per instruction these suites were not re-run this pass.

</details>

<details>
<summary>File map</summary>

- `apps/api/.../auctions.service.ts` — `selectPlayerManual`/`drawPlayerAutomatic` now broadcast `player:introduced` after recording the event (MEDIUM-1 fix).
- `apps/api/.../gateways/auction-room.gateway.ts` — `broadcastPlayerIntroduced` emitter; `auction:request-snapshot` handler; echoes idempotency key on bid broadcasts/errors.
- `apps/api/.../services/auction-event-broadcaster.service.ts` — `broadcastPlayerIntroduced` passthrough.
- `apps/api/.../services/auction-snapshot.service.ts` — sources high bid and base price from the active `AuctionPlayer`, emitted as strings (MEDIUM-2 fix).
- `apps/web/src/hooks/useAuctionRealTime.ts` — subscribes to `player:introduced` → re-snapshot; `reconcileFromSnapshot` maps `highBidMinor`/`highBidTeamId` into `leadingTeam`.
- `apps/web/src/hooks/useBidPlacement.ts` — emits `bid:submit`, reconciles by echoed idempotency key (resolved earlier pass).
- `apps/web/src/hooks/useAuctionState.ts` — REST state fetch + cache; `mapSquadRules` still zeroes progress (issue 3).
- `apps/web/src/app/auctions/[id]/live/page.tsx` — room layout, membership gate, break overlay; per-player break counter (issue 1), default brackets (issue 2), passes dead `roomId` (issue 4).
- `apps/web/src/components/auction/*` — six presentational/form components; `BidPlacementForm` has the unused `roomId` prop (issue 4).
- `apps/web/src/hooks/*.spec.ts`, `components/auction/__tests__/*` — tests updated to the real contract; not re-run this pass.

Full diff: `git -C d:\UNDER-THE-HAMMER diff main...HEAD`

</details>
