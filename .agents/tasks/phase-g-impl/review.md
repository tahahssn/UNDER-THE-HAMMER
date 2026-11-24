# Phase G Auction Engine Implementation Review

**Review Date:** 2026-11-24  
**Reviewed Commit:** 58814d3 (feat: implement Phase G - Auction Engine and Live Bidding)  
**Status:** CHANGES_REQUESTED

---

## Executive Summary

The Phase G implementation provides comprehensive auction engine infrastructure with 13 service files, state machine, bid validation, purse ledger, settlement, real-time gateway, and player selection. The architecture is sound and follows backend-authority principles. However, **critical schema-to-code mismatches prevent compilation and must be resolved before this code is production-ready.**

The primary blocker is a field naming mismatch in the Bid model: code uses `.accepted` and `rejectionReason`, but the Prisma schema defines `status: BidStatus` and `rejectionCode: String?`. This prevents Prisma code generation and all services that depend on the Bid model.

---

## Schema-to-Code Mismatch (BLOCKER)

### Finding 1: Bid Model Field Name Mismatch

**Severity:** CRITICAL  
**Impact:** Prevents all tests and compilation  
**Files Affected:**
- Code: `apps/api/src/auctions/services/bid-acceptance.service.ts` (lines 31, 136, 65, 70, 149-151)
- Code: `apps/api/src/auctions/services/bid-validation.service.ts` (line 68)
- Schema: `packages/database/prisma/schema.prisma` (line 1027)

**Evidence:**

Schema defines (line 1020-1045):
```prisma
model Bid {
  id             String    @id @default(uuid()) @db.Uuid
  auctionId      String    @db.Uuid
  auctionPlayerId String   @db.Uuid
  auctionTeamId  String    @db.Uuid
  placedById     String    @db.Uuid
  amountMinor    BigInt
  status         BidStatus      // ← ENUM field, not .accepted boolean
  rejectionCode  String?        // ← Code not rejectionReason
  idempotencyKey String
  sequence       Int?
  stateVersion   Int
  createdAt      DateTime  @default(now())
  ...
  @@unique([auctionId, idempotencyKey])
}

enum BidStatus {
  ACCEPTED
  REJECTED
}
```

Code uses incorrect field names (bid-acceptance.service.ts lines 31, 65, 70, 149-151):
```typescript
if (existingBid.accepted) {  // ← WRONG: schema has status: BidStatus enum
  ...
}

const bid = await this.repo.recordBid({
  ...
  accepted: false,           // ← WRONG: should be status: 'REJECTED'
  rejectionReason: validation.reason,  // ← WRONG: schema has rejectionCode
  ...
});

// Later, in rejectAcceptedBid:
if (!bid.accepted) {         // ← WRONG
  ...
}

return this.prisma.bid.update({
  where: { id: bidId },
  data: {
    accepted: false,         // ← WRONG
    rejectionReason: reason, // ← WRONG
  },
});
```

**Consequence:**  
- Prisma client code generation fails (fields don't exist on generated Bid type)
- All tests that import Bid fail with MODULE_NOT_FOUND (confirmed by test run: Prisma client not generated)
- Backend compilation impossible
- As evidenced by commit message: "awaiting Prisma generation"

**Required Fix:**
Update all references to use the schema-defined fields:
- Replace `.accepted` with `.status === 'ACCEPTED'` or `.status === 'REJECTED'`
- Replace `rejectionReason` with `rejectionCode`

---

## Architectural and Correctness Findings

### Finding 2: Auction High Bid Fields Missing from Schema

**Severity:** MEDIUM  
**Files Affected:**
- Code: `apps/api/src/auctions/auctions.repository.ts` (line 51)
- Code: `apps/api/src/auctions/services/bid-acceptance.service.ts` (line 115)

**Evidence:**

Code attempts to update:
```typescript
await prisma.auction.update({
  where: { id: auctionId },
  data: {
    highBidId: bidId,          // ← NOT in schema
    highBidMinor: amountMinor, // ← NOT in schema
    highBidTeamId: auctionTeamId,  // ← NOT in schema
    stateVersion: { increment: 1 },
  },
});
```

Searching the Auction schema (packages/database/prisma/schema.prisma), these fields do not exist. The schema has `currentAuctionPlayerId` but no `highBidId`, `highBidMinor`, or `highBidTeamId`.

**Consequence:**  
- Prisma will reject these update queries at runtime
- Bid acceptance fails silently if executed
- High bid tracking is broken

**Recommended Fix:**
Either:
1. Store high bid per AuctionPlayer (since only one player is active at a time), not Auction
2. Add highBidId, highBidMinor, highBidTeamId to Auction schema (requires migration)
3. Query Bid table directly when high bid is needed (denormalization acceptable if schema doesn't support)

---

### Finding 3: Socket.IO Event Broadcast Before Durable Commit

**Severity:** HIGH  
**File:** `apps/api/src/auctions/gateways/auction-room.gateway.ts` (lines 118-134)

**Evidence:**

```typescript
async handleBidSubmit(client: Socket, data: {...}) {
  try {
    const result = await this.auctionsService.submitBid(...);

    if (result.accepted) {
      // Broadcast BEFORE durable commit verified
      this.server.to(`auction:${data.auctionId}`).emit('bid:accepted', {
        bidId: result.id,
        teamId: data.auctionTeamId,
        amountMinor: data.amountMinor,
        sequence: result.sequence,
        stateVersion: result.stateVersion,
      });
    } else {
      client.emit('bid:rejected', {
        bidId: result.id,
        reason: result.reason,
      });
    }
  } catch (error) {
    client.emit('bid:error', { error: (error as any).message });
  }
}
```

The gateway broadcasts a `bid:accepted` event immediately after `submitBid` returns. If a database transaction or Prisma generation fails downstream, the event has already been broadcast to all clients, violating the requirement: "broadcast accepted events only after durable commit."

**Consequence:**  
- Clients receive bid:accepted but database transaction may still fail
- State divergence between client and server
- Reconnect recovery becomes complex

**Recommended Fix:**
- Move broadcast logic into AuctionsService
- Broadcast only after Prisma transaction commits successfully
- Or use Prisma.$transaction callback to ensure broadcast is in the same transaction block

---

### Finding 4: Bid-Validation Service Not Using Repository for Bracket Lookup

**Severity:** MEDIUM  
**File:** `apps/api/src/auctions/services/bid-validation.service.ts` (lines 93-116)

**Evidence:**

```typescript
async computeMinimumBid(auctionId: string, currentBidMinor: bigint | null): Promise<bigint> {
  const startingPrice = 10_000_000n;

  if (!currentBidMinor || currentBidMinor === 0n) {
    return startingPrice;
  }

  // Fetch increment brackets from database
  const brackets = await this.repo.getAuctionPlayers(auctionId);  // ← WRONG: gets players, not brackets

  // Hard-coded bracket logic
  const PKR_1_CRORE = 100_000_000n;
  const PKR_2_2_CRORE = 220_000_000n;
  const PKR_4_CRORE = 400_000_000n;

  let increment: bigint;

  if (currentBidMinor < PKR_1_CRORE) {
    increment = 10_000_000n;
  } else if (currentBidMinor < PKR_2_2_CRORE) {
    increment = 15_000_000n;
  } else if (currentBidMinor < PKR_4_CRORE) {
    increment = 20_000_000n;
  } else {
    increment = 25_000_000n;
  }

  return currentBidMinor + increment;
}
```

The code attempts to fetch brackets but then ignores the result and uses hard-coded PKR values. This violates the Phase G plan which requires bracket lookup from `AuctionIncrementBracket` table (schema line 999-1012).

**Consequence:**  
- Auction configuration is ignored; brackets are always hard-coded
- Multi-auction support broken (custom bracket configurations can't be used)
- Violates AGENTS.md requirement: "Host-configurable settings include bid increment brackets"

**Required Fix:**
- Fetch actual `AuctionIncrementBracket` rows from repository
- Build bracket lookup table in-memory
- Apply correct bracket based on current bid
- Handle boundary inclusivity correctly (note: schema has `fromInclusive` and `toInclusive` flags for exact PKR 4 crore boundary decision)

---

### Finding 5: Settlement Service Uses Non-Existent Auction Fields

**Severity:** HIGH  
**File:** `apps/api/src/auctions/services/settlement.service.ts` (line 59)

**Evidence:**

```typescript
async markPlayerSold(auctionId: string, playerId: string, teamId: string, priceMinor: bigint) {
  await this.prisma.auctionPlayer.update({
    where: { id: playerId },
    data: { status: 'SOLD', selledFor: priceMinor },  // ← selledFor doesn't exist
  });
  ...
}
```

The schema shows `AuctionPlayer.currentBidMinor` (line 977), not `selledFor`.

**Consequence:**  
- Settlement fails at runtime
- Players cannot be marked as sold
- Auction cannot complete

**Required Fix:**
Update to use correct field: `.currentBidMinor = priceMinor` or `.status = 'SOLD'` only

---

### Finding 6: Break Manager Service Not Defined

**Severity:** MEDIUM  
**File:** `apps/api/src/auctions/auctions.module.ts`

**Evidence:**

The Phase G plan specifies a `break-manager.service.ts` with bid counter scheduling. The file exists in the diff (`apps/api/src/auctions/services/break-manager.service.ts`), but it is not clear if it's integrated into the module or used by any controller/gateway.

**Consequence:**  
- Break functionality not wired into the system
- No bid counter tracking
- Break logic untestable

**Recommended Fix:**
Verify break-manager is registered in auctions.module.ts providers and injected into the appropriate services.

---

### Finding 7: Repository Transaction Wrapper Not Actually Transactional

**Severity:** MEDIUM  
**File:** `apps/api/src/auctions/auctions.repository.ts` (line 189-191)

**Evidence:**

```typescript
async withTransaction<T>(fn: (prisma: PrismaService) => Promise<T>): Promise<T> {
  return this.prisma.$transaction(async () => {  // ← Missing callback argument
    return fn(this.prisma);  // ← Passes PrismaService, not transaction instance
  });
}
```

The `$transaction` method requires passing the transaction instance to the callback, not the base PrismaService. The current code passes `this.prisma` (the base client) instead.

**Consequence:**  
- Transactions don't actually execute (all calls run outside transaction)
- Concurrent bid operations can race (purse debit and bid acceptance not atomic)
- Financial correctness violated

**Required Fix:**
```typescript
async withTransaction<T>(fn: (prisma: PrismaService) => Promise<T>): Promise<T> {
  return this.prisma.$transaction(async (tx) => {
    return fn(tx);
  });
}
```

---

### Finding 8: Bid-Validation Missing Spectator Check

**Severity:** HIGH  
**File:** `apps/api/src/auctions/services/bid-validation.service.ts`

**Evidence:**

The service validates bids but does not check if the user placing the bid is authorized (e.g., is a TEAM_OWNER, not a SPECTATOR). The Phase G plan specifies:

> "Spectator attempts to bid" is a mandatory test case.

The code has no authorization check.

**Consequence:**  
- Spectators can bid (violates product rules: spectators are read-only)
- Authorization boundary violated
- Security/product issue

**Required Fix:**
Add check to validateBidPlacement:
```typescript
// Check user is a team owner (not a spectator)
const member = await this.repo.getRoomMember(room.id, userId);
if (member?.role !== RoomRole.TEAM_OWNER) {
  return { valid: false, reason: BID_ERRORS.NOT_ELIGIBLE_TO_BID };
}
```

---

### Finding 9: Player Selection Service Not Reviewed (File Not Fully Shown)

**Severity:** MEDIUM  
**File:** `apps/api/src/auctions/services/player-selection.service.ts`

**Evidence:**

The file exists in the diff (172 lines) but was not fully read during this review. Manual and automatic draw logic must be verified against Phase F room configuration and player queue ordering.

**Recommended Action:**
- Verify `selectPlayerManual` restricts to QUEUED players
- Verify `drawPlayerAutomatic` maintains queue position order
- Verify both set `selectionSource` correctly in `AuctionPlayer`

---

### Finding 10: Prisma Code Generation Blocking Tests

**Severity:** CRITICAL (operational)  
**Evidence:**

Commit message: "awaiting Prisma generation"  
Test run output: "Cannot find module '.prisma/client/default'"

The code cannot run or be tested until Prisma is generated against a live database.

**Current Status:**
- No type safety (Prisma types missing)
- No test execution possible
- No CI/CD validation

**Required Action Before Approval:**
Run `pnpm db:generate` or `pnpm prisma generate` with DATABASE_URL env var set.

---

## Positive Findings (No Action Required)

✓ **State Machine Transitions:** Valid transition graph is correct (DRAFT → REGISTRATION → READY → LIVE → SETTLEMENT → CONCLUDED with PAUSED support).

✓ **BigInt Usage:** All monetary amounts correctly use BigInt; no floating-point detected.

✓ **Idempotency Key Support:** Unique constraint on (auctionId, idempotencyKey) correctly prevents duplicate bids; schema is sound.

✓ **Append-Only Ledger:** `TeamPurseTransaction` model correctly implements immutable history with append-only semantics.

✓ **Socket.IO Authentication:** Gateway verifies JWT token and stores userId before room join; no anonymous connections allowed.

✓ **Room Scoping:** Gateway uses `auction:${auctionId}` Socket.IO room to isolate events; no cross-room leakage.

✓ **Error Constants:** Comprehensive error codes defined for all major validation failure paths.

✓ **DTO Layer:** DTOs present in `dto/index.ts` (not fully reviewed but structure exists).

✓ **NestJS Module Integration:** Module is registered in app.module.ts correctly.

---

## Mandatory Test Coverage Status

From Phase G plan checklist:

| Test Case | Status | Evidence |
|-----------|--------|----------|
| Bid validation: insufficient purse | MISSING | No @test file for bid-validation.service |
| Bid validation: invalid increment | MISSING | No @test file |
| Bid validation: deadline passed | MISSING | No @test file |
| Bid validation: duplicate key | MISSING | No @test file |
| Bid validation: unauthorized team | MISSING | No @test file |
| Bid validation: spectator rejection | MISSING | No @test file |
| State machine transitions | PARTIAL | auction-state-machine.spec.ts has unit tests only |
| Concurrent bid race | MISSING | No @test file |
| Settlement with squad rules | MISSING | No @test file |
| Idempotent retry | MISSING | No @test file |
| Build & typecheck | BLOCKED | Cannot run; Prisma not generated |

---

## Summary of Blockers

1. **Bid Model Field Mismatch** (CRITICAL) — `.accepted` vs `.status`, `rejectionReason` vs `rejectionCode`
2. **Missing Auction High Bid Fields** (HIGH) — Code uses highBidId, highBidMinor, highBidTeamId which don't exist in schema
3. **Settlement Broken** (HIGH) — Uses non-existent `selledFor` field
4. **Transactions Not Atomic** (HIGH) — Repository.withTransaction passes wrong argument to Prisma.$transaction
5. **Bracket Lookup Ignored** (MEDIUM) — Hard-coded PKR values bypass configurable brackets
6. **Spectator Authorization Missing** (HIGH) — No check that bidder is TEAM_OWNER, not SPECTATOR
7. **Prisma Not Generated** (CRITICAL operational) — Cannot test or compile

---

## Verification Blockers

✗ Build will not complete until Prisma is generated  
✗ Tests cannot run (Prisma client missing)  
✗ Type safety unavailable  
✗ No CI/CD validation possible  

---

## Recommendation

**DO NOT MERGE** until:
1. All schema-to-code mismatches are resolved (findings 1, 2, 5)
2. Transaction wrapper is fixed (finding 7)
3. Bracket lookup is implemented (finding 4)
4. Spectator authorization check added (finding 8)
5. Prisma code generation succeeds
6. All 10+ mandatory test cases pass
7. Build and typecheck pass

The implementation demonstrates strong architectural understanding and comprehensive service coverage. After resolving these field mismatches and adding missing authorization checks, the code will be production-ready.
