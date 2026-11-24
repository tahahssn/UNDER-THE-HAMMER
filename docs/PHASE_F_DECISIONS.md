# Phase F - Architectural Decisions & Technical Design

## Overview

Phase F implements the core auction room infrastructure with subscription-gated hosting, atomic room creation, team allocation with race condition prevention, and room visibility controls. This document records key architectural decisions and their rationale.

---

## 1. Database Schema Design

### 1.1 Subscription Entitlements Model

**Decision:** Flatten subscription entitlements into a fixed set of keys (bool/int values) rather than deeply nested JSON.

**Rationale:**
- Easier to query and index (`SELECT * WHERE entitlementKey = 'maxActiveRooms'`)
- Avoids expensive JSON parsing on every entitlement check
- Supports multiple entitlements per plan without schema changes
- Facilitates audit trail (each entitlement change logged separately)

**Schema:**
```prisma
model SubscriptionPlan {
  id            String   @id @default(cuid())
  key           String   @unique // e.g., "STARTER", "PRO"
  name          String
  entitlements  PlanEntitlement[]
}

model PlanEntitlement {
  id        String   @id @default(cuid())
  planId    String
  plan      SubscriptionPlan @relation(fields: [planId], references: [id])
  key       String   // e.g., "maxActiveRooms", "hostingEnabled"
  intValue  Int?
  boolValue Boolean?
  stringValue String?
  
  @@unique([planId, key])
}
```

**Standard Entitlements:**
- `hostingEnabled` (bool): User can create rooms
- `maxActiveRooms` (int): Maximum concurrent rooms user can host
- `maxTeamsPerRoom` (int): Maximum teams allowed in a room
- `maxSpectatorsPerRoom` (int): Maximum spectators allowed
- `maxRoomDurationMinutes` (int): Room duration limit

### 1.2 Room Configuration Versioning

**Decision:** Store room settings as immutable snapshots with version numbers, not mutable records.

**Rationale:**
- Settings must not change after LIVE status (enforced by immutability, not just guards)
- Audit trail: each config version is a separate row with timestamp
- Safe for concurrent reads (no optimistic locking needed for reads)
- Supports config rollback if needed (Phase G feature)

**Schema:**
```prisma
model AuctionRoom {
  id                      String   @id @default(cuid())
  hostId                  String
  tournamentId            String?
  name                    String
  status                  RoomStatus @default(DRAFT)
  visibility              Visibility @default(PRIVATE)
  listed                  Boolean  @default(false)
  currentSettingsVersion  Int      @default(1)
  settings                RoomSettings[]
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}

model RoomSettings {
  id       String   @id @default(cuid())
  roomId   String
  room     AuctionRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  version  Int      // Immutable: starts at 1, increments on each update
  config   Json     // RoomSettingsConfigDto (immutable snapshot)
  createdAt DateTime @default(now())
  
  @@unique([roomId, version])
  @@index([roomId, version])
}
```

**Guarantees:**
- Once `status = LIVE`, no new RoomSettings can be created (enforced at service level)
- Current config always retrieved via `RoomSettings.where({roomId, version: currentSettingsVersion})`
- Historical configs available for audit/debugging

### 1.3 Room Access Policy

**Decision:** Separate access control from room configuration; mutable per-room, not version-controlled.

**Rationale:**
- Access rules (spectator policy, late join, chat) can change without affecting auction settings
- Distinct from configuration (which affects gameplay)
- Allows host to adjust access mid-registration without affecting team/purse setup

**Schema:**
```prisma
model RoomAccessPolicy {
  id                   String   @id @default(cuid())
  roomId               String   @unique
  room                 AuctionRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  joinPolicy           JoinPolicy @default(FIRST_COME_FIRST_SERVED)
  spectatorPolicy      SpectatorPolicy @default(PUBLIC)
  teamOwnerCapacity    Int
  spectatorCapacity    Int
  lateJoinPolicy       LateJoinPolicy @default(DISALLOWED)
  spectatorChatEnabled Boolean
  externalLinksEnabled Boolean
  updatedAt            DateTime @updatedAt
}

enum JoinPolicy {
  FIRST_COME_FIRST_SERVED
  APPROVAL
  INVITATION
  CODE
}

enum SpectatorPolicy {
  PUBLIC
  RESTRICTED
}

enum LateJoinPolicy {
  DISALLOWED
  ALLOWED_BEFORE_FIRST_BID
  ALLOWED
}
```

---

## 2. Backend Authorization Strategy

### 2.1 Subscription Gating

**Decision:** Check subscription status synchronously at room creation; monitor renewals asynchronously in Phase G.

**Rationale:**
- Room creation is a synchronous, high-stakes operation (must succeed or fail atomically)
- Subscription status unlikely to change during single request
- Phase G adds background job to revoke rooms if subscription expires during active auction
- Reduces query load on subscription service

**Implementation:**
```typescript
async createRoom(input: { hostId: string; ... }) {
  const canHost = await this.subscriptionsService.canUserHost(input.hostId);
  if (!canHost) {
    throw new ForbiddenException('Active subscription required');
  }
  
  const limits = await this.subscriptionsService.getRoomLimits(input.hostId);
  if (input.config.teamCount > limits.maxTeamsPerRoom) {
    throw new BadRequestException('Exceeds subscription limit');
  }
  
  // Create room atomically with settings + access policy
  return this.repo.createRoomWithSettings(input);
}
```

### 2.2 Role-Based Access Control

**Decision:** Enforce role checks server-side; never trust client role selection.

**Rationale:**
- Client can be spoofed; role determines permissions
- Roles: HOST, TEAM_OWNER, SPECTATOR
- Each role has explicit method access

**Guards:**
```typescript
// @UseGuards(JwtAuthGuard)
async updateRoomSettings(roomId: string, userId: string, config: RoomSettingsConfigDto) {
  // 1. Verify user is room host
  const isHost = await this.repo.isRoomHost(roomId, userId);
  if (!isHost) {
    throw new ForbiddenException('Only room host can update settings');
  }
  
  // 2. Verify room status allows changes
  const room = await this.repo.getRoomById(roomId);
  if (room.status === 'LIVE' || room.status === 'COMPLETED') {
    throw new BadRequestException('Cannot modify settings for live auction');
  }
  
  // 3. Proceed with update
  return this.repo.updateRoomSettings(roomId, config);
}
```

### 2.3 Spectator Permissions (Phase G)

**Decision:** Spectators are read-only by default; bidding requires explicit permission grant.

**Rationale:**
- Security: prevents accidental/malicious spectator bids
- Phase G will add `spectatorCanBid` entitlement if needed
- Current phase: spectators can observe, not participate

---

## 3. Team Allocation Atomicity

### 3.1 Race Condition Prevention

**Problem:** Two users simultaneously request Team #1 → both succeed (double-booking).

**Solution:** Serializable isolation level + uniqueness constraint.

**Implementation:**
```typescript
async allocateTeamUserSelected(input: {
  roomId: string;
  userId: string;
  teamId: string;
  slotIndex: number;
}) {
  try {
    return this.prisma.$transaction(
      async (tx) => {
        // Create AuctionTeam (fails if slot already taken)
        const auctionTeam = await tx.auctionTeam.create({
          data: {
            auctionId: input.roomId,
            teamId: input.teamId,
            slotIndex: input.slotIndex, // UNIQUE constraint
            allocationMethod: 'USER_SELECTED',
          },
        });

        // Add user as team owner (fails if user already owns a team)
        await tx.teamOwner.create({
          data: {
            auctionId: input.roomId,
            auctionTeamId: auctionTeam.id,
            userId: input.userId,
            method: 'USER_SELECTED',
          },
        });

        return { success: true, auctionTeamId: auctionTeam.id };
      },
      {
        isolationLevel: 'Serializable', // Strongest isolation
      },
    );
  } catch (error) {
    if (error.code === 'P2002') {
      // Unique constraint violation → slot/team already taken
      return { success: false, error: 'Team slot is already allocated' };
    }
    throw error;
  }
}
```

**Database Constraints:**
```prisma
model AuctionTeam {
  id              String   @id @default(cuid())
  auctionId       String   // Foreign key to AuctionRoom
  teamId          String
  slotIndex       Int      // Immutable: once set, cannot change
  allocationMethod AllocationMethod
  
  @@unique([auctionId, slotIndex])    // One team per slot
  @@unique([auctionId, teamId])        // One instance per team
  @@index([auctionId])
}

model TeamOwner {
  id              String   @id @default(cuid())
  auctionId       String
  auctionTeamId   String
  userId          String
  method          AllocationMethod
  
  @@unique([auctionId, userId])        // One team per user
  @@index([auctionId])
}
```

### 3.2 Idempotency

**Decision:** Each allocation is unique; re-requesting same allocation returns error (not duplicate).

**Rationale:**
- Financial correctness: idempotent operations prevent double-spending
- Phase G will add `idempotencyKey` for client-side retries
- Current phase: client must handle allocation failures gracefully

---

## 4. Room Configuration Immutability

### 4.1 State Machine

**Decision:** Settings frozen when status transitions from DRAFT → REGISTRATION/READY → LIVE.

**Rationale:**
- Prevents configuration changes mid-auction (unfair to participants)
- Guarantees all players know exact rules before bidding
- Enforced at service layer + database constraints

**State Transitions:**
```
DRAFT → REGISTRATION (settings locked)
REGISTRATION → READY (settings locked)
READY → LIVE (settings locked)
LIVE → COMPLETED (settings locked)
```

**Service-Level Guard:**
```typescript
private canModifyConfiguration(status: RoomStatus): boolean {
  return status === 'DRAFT'; // Only allow in DRAFT
}
```

### 4.2 Snapshot Strategy

**Decision:** Store entire config as single JSON snapshot, not normalized rows.

**Rationale:**
- Settings are rarely queried individually (always need full config)
- Immutability guarantees: treat as single atomic unit
- Easier to serialize/deserialize for API responses
- Schema flexibility for future config additions

**Example Snapshot:**
```json
{
  "teamCount": 8,
  "teamPurseMinor": 10000000,
  "currency": "PKR",
  "format": "LIVE_COUNTDOWN",
  "controlMode": "HOST_CONTROLLED",
  "bidIncrementBrackets": [
    { "fromMinor": 0, "toMinor": 100000000, "incrementMinor": 1000000 },
    ...
  ],
  "squadSizeMin": 11,
  "squadSizeMax": 15,
  "squadRules": []
}
```

---

## 5. Visibility & Discovery

### 5.1 Public Room Discovery

**Decision:** Only REGISTRATION and READY rooms appear in public list; DRAFT and LIVE hidden.

**Rationale:**
- DRAFT: not ready for joins yet
- REGISTRATION: open for team owner selection
- READY: closed for joins, waiting to start
- LIVE: cannot join mid-auction
- COMPLETED: archived

**Query:**
```sql
SELECT * FROM AuctionRoom
WHERE visibility = 'PUBLIC'
  AND status IN ('REGISTRATION', 'READY')
  AND listed = true
ORDER BY createdAt DESC;
```

### 5.2 Private Room Access

**Decision:** Private rooms not in public list; access only via invitation code or direct member link.

**Rationale:**
- Protects host privacy
- Requires explicit code/link generation (host controls who joins)
- Invitation code has expiration + max uses

---

## 6. Financial Data Integrity

### 6.1 Purse Ledger

**Decision:** Store purse as immutable transaction ledger; balance computed from transactions.

**Rationale:**
- Auditability: cannot modify history
- Prevents manual balance adjustment errors
- Each bid creates compensating transaction entry
- Supports settlement retries in Phase G

**Schema:**
```prisma
model TeamPurseTransaction {
  id                  String   @id @default(cuid())
  auctionTeamId       String
  type                TransactionType // INITIAL_CREDIT, BID, ADJUSTMENT
  amountMinor         BigInt   // Positive or negative
  balanceAfterMinor   BigInt   // Snapshot of balance after this transaction
  reason              String   // "Initial purse", "Bid on Player XYZ", etc.
  createdAt           DateTime @default(now())
  
  @@index([auctionTeamId])
}

enum TransactionType {
  INITIAL_CREDIT
  BID
  WIN
  ADJUSTMENT
  REFUND
}
```

### 6.2 BigInt for Money

**Decision:** All monetary values stored as BigInt in minor units (paisa for PKR).

**Rationale:**
- Avoids floating-point precision issues
- 1 PKR = 100 paisa → store as integer
- Database native support (PostgreSQL BIGINT)
- Cannot accidentally round down

**Examples:**
- 1 crore (10,000,000 PKR) = 1,000,000,000 minor units
- 50 paisa = 50 minor units

---

## 7. Error Handling

### 7.1 Expected vs. Unexpected Errors

**Expected Errors (HTTP 4xx):**
- Room not found (404)
- Subscription required (403)
- Configuration invalid (400)
- Team slot taken (409 Conflict)

**Unexpected Errors (HTTP 5xx):**
- Database connection failed
- Transaction deadlock (retried by Prisma)
- S3 upload failed

**Implementation:**
```typescript
// Expected: throw BadRequestException, ForbiddenException, etc.
if (!canHost) {
  throw new ForbiddenException('Subscription required');
}

// Unexpected: throw InternalServerErrorException
if (s3Error) {
  throw new InternalServerErrorException('Failed to upload room logo');
}
```

### 7.2 Conflict Handling

**Decision:** Allocation conflicts return 409 Conflict + user-friendly message.

**Rationale:**
- 409 is standard for resource conflicts
- Client can distinguish from server errors (500) and show appropriate UI
- Retry logic can be implemented client-side

---

## Summary

| Area | Decision | Benefit |
|------|----------|---------|
| **Subscriptions** | Flat entitlements model | Query-efficient, audit-friendly |
| **Configuration** | Immutable versioned snapshots | Fairness, audit trail, no mid-auction changes |
| **Team Allocation** | Serializable + unique constraints | Race condition prevention, atomicity |
| **Access Policy** | Separate from config | Flexible access rules independent of gameplay |
| **Visibility** | Status-based discovery | Public/private rooms, staged disclosure |
| **Purse** | Transaction ledger in BigInt | Auditability, precision, no float errors |
| **Authorization** | Server-side role checks | Cannot be spoofed from client |
| **Errors** | Expected vs. unexpected | Clear error handling, appropriate HTTP status |

