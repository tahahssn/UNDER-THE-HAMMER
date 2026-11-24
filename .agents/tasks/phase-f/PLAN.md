# Phase F Implementation Plan: Tournaments, Rooms, Subscriptions, and Team Allocation

**Status:** Final (ready for implementation)  
**Date:** 2026-11-24  
**Scope:** Subscription gating for hosts, tournament/room management, public/private discovery, member registration, team allocation (3 modes), spectator access control, invitations.

---

## 1. Overview

Phase F implements the foundational architecture for multiplayer auction rooms. It bridges Phase C–E (identity, players, teams) with Phase G–H (auction engine, real-time room). This phase is decomposed into 4 sequentially dependent features:

1. **FEAT-001**: Database schema + TypeScript contracts
2. **FEAT-002**: Backend authorization + subscription + room + team-allocation services
3. **FEAT-003**: Frontend auction entry experience (wizard, browse, join, subscription status)
4. **FEAT-004**: Integration tests + end-to-end tests + documentation

Each feature leaves the codebase in a buildable state. Features build on the previous one's output.

---

## 2. Architectural decisions

### 2.1 Subscription model
- **Requirement:** Host subscriptions gate room creation (AGENTS.md, PRD.md, section 2).
- **Decision:** Subscription is a separate entity (SubscriptionPlan + Subscription). Subscription.expiresAt determines eligibility. Plans define maxRooms, maxParticipants, hostFeatures.
- **Rationale:** Separates host entitlements from room capacity. Allows future tiers (free, premium, enterprise) without schema changes.
- **Verification:** Only users with ACTIVE subscription can call createRoom. Expired subscriptions are rejected on write, not by pre-check alone.

### 2.2 Room visibility and spectator policy
- **Requirement:** Room visibility (public/private) is separate from spectator access policy (AGENTS.md, section 2).
- **Decision:** RoomAccessPolicy has separate fields: joinPolicy (JoinPolicy), spectatorPolicy (SpectatorPolicy), teamOwnerCapacity, spectatorCapacity.
- **Rationale:** A public room can restrict spectators; a private room can allow spectators if invited.
- **Verification:** Discover endpoint filters by visibility=PUBLIC && listed=true. Spectator join is authorized separately.

### 2.3 Team allocation atomicity
- **Requirement:** No race condition where two users allocate the same team (AGENTS.md, section 4).
- **Decision:** Use Prisma `$transaction` with `SELECT...FOR UPDATE` row lock on AuctionTeam.id. Atomic: check availability, create TeamOwner, debit purse, return allocation.
- **Rationale:** Ensures exactly one user per team slot. Concurrent requests serialize; losers receive deterministic rejection.
- **Verification:** Integration test: 50 concurrent allocations on 10 slots → exactly 10 succeed, 40 fail with E_TEAM_UNAVAILABLE.

### 2.4 Settings immutability after LIVE
- **Requirement:** Hosts cannot modify auction settings after the auction goes LIVE (IMPLEMENTATION.md, Phase 3).
- **Decision:** Snapshot room settings at auction start (AuctionConfigurationSnapshot). Store currentSettingsVersion in Auction. Update roomSettings endpoint checks room.auction?.phase === LIVE and rejects if true.
- **Rationale:** Prevents mid-auction rule changes from destabilizing bids/purse.
- **Verification:** Unit test: attempt to PATCH /rooms/:id/settings when room.auction.phase=LIVE → 403 Forbidden.

### 2.5 Real-time room state
- **Requirement:** Room members must see consistent state (members, settings, auction if active).
- **Decision:** Implement RoomContext in frontend polling /rooms/:id/details every 10s or on focus. Backend caches room state in Redis for fast retrieval.
- **Rationale:** Defers Socket.IO complexity to Phase 5. Real-time updates added in Phase 7 (Socket.IO) without schema changes.
- **Verification:** Join room, see member list update on another browser within 10s.

---

## 3. Database schema additions

All additions use PostgreSQL constraints, BigInt for money, foreign keys enforced.

### 3.1 Subscription entities

```sql
-- SubscriptionPlan: global tiers
CREATE TABLE SubscriptionPlan (
  id UUID PRIMARY KEY,
  key STRING UNIQUE,                -- BASIC, PRO, ENTERPRISE
  name STRING,
  maxRooms INT,
  maxParticipantsPerRoom INT,
  hostFeatures JSONB,               -- { "customBranding": true, "api": true }
  createdAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(key)
);

-- Subscription: user entitlements
CREATE TABLE Subscription (
  id UUID PRIMARY KEY,
  userId UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  planId UUID NOT NULL REFERENCES SubscriptionPlan(id) ON DELETE RESTRICT,
  startsAt TIMESTAMP,
  expiresAt TIMESTAMP,
  isCancelled BOOLEAN DEFAULT FALSE,
  cancelledAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP,
  INDEX(userId, expiresAt),
  UNIQUE(userId) PARTIAL WHERE isCancelled = FALSE   -- one active per user
);
```

### 3.2 Tournament and room entities

```sql
-- Tournament: optional container for auctions
CREATE TABLE Tournament (
  id UUID PRIMARY KEY,
  organizerId UUID NOT NULL REFERENCES User(id) ON DELETE RESTRICT,
  name STRING,
  description TEXT,
  entryFeeEnabled BOOLEAN DEFAULT FALSE,
  entryFeeMinor BIGINT,              -- NULL if disabled
  entryFeeCurrency CHAR(3),
  createdAt TIMESTAMP DEFAULT NOW(),
  INDEX(organizerId)
);

-- AuctionRoom: auction container
CREATE TABLE AuctionRoom (
  id UUID PRIMARY KEY,
  tournamentId UUID REFERENCES Tournament(id) ON DELETE SET NULL,
  hostId UUID NOT NULL REFERENCES User(id) ON DELETE RESTRICT,
  name STRING,
  status RoomStatus,                 -- DRAFT, REGISTRATION, READY, LIVE, COMPLETED, CANCELLED
  visibility RoomVisibility,         -- PUBLIC, PRIVATE
  listed BOOLEAN DEFAULT FALSE,      -- PUBLIC rooms listed if true
  currentSettingsVersion INT DEFAULT 0,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP,
  INDEX(visibility, listed, status),
  INDEX(hostId),
  INDEX(tournamentId)
);

-- RoomAccessPolicy: member and spectator policies
CREATE TABLE RoomAccessPolicy (
  roomId UUID PRIMARY KEY REFERENCES AuctionRoom(id) ON DELETE CASCADE,
  joinPolicy JoinPolicy DEFAULT FIRST_COME_FIRST_SERVED,
  spectatorPolicy SpectatorPolicy DEFAULT PUBLIC,
  teamOwnerCapacity INT,            -- max team owners
  spectatorCapacity INT,             -- max spectators, 0 = unlimited
  lateJoinPolicy LateJoinPolicy DEFAULT DISALLOWED,
  spectatorChatEnabled BOOLEAN DEFAULT FALSE,
  externalLinksEnabled BOOLEAN DEFAULT FALSE
);

-- RoomSettings: versioned config
CREATE TABLE RoomSettings (
  id UUID PRIMARY KEY,
  roomId UUID NOT NULL REFERENCES AuctionRoom(id) ON DELETE CASCADE,
  version INT,
  config JSONB,                      -- flexible auction config (teams, purse, etc.)
  createdAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(roomId, version),
  INDEX(roomId, version DESC)
);
```

### 3.3 Member and team-allocation entities

```sql
-- RoomMember: member registration
CREATE TABLE RoomMember (
  id UUID PRIMARY KEY,
  roomId UUID NOT NULL REFERENCES AuctionRoom(id) ON DELETE CASCADE,
  userId UUID NOT NULL REFERENCES User(id) ON DELETE RESTRICT,
  role RoomRole,                     -- HOST, TEAM_OWNER, SPECTATOR
  status MemberStatus DEFAULT ACTIVE,
  joinedAt TIMESTAMP DEFAULT NOW(),
  leftAt TIMESTAMP,
  UNIQUE(roomId, userId, role),
  INDEX(userId, status),
  INDEX(roomId, role, status)
);

-- AuctionTeam: team in an auction (not reused across auctions)
CREATE TABLE AuctionTeam (
  id UUID PRIMARY KEY,
  auctionId UUID NOT NULL REFERENCES Auction(id) ON DELETE CASCADE,
  teamId UUID NOT NULL REFERENCES Team(id) ON DELETE RESTRICT,
  name STRING,
  purseMinor BIGINT,                 -- available balance for bids
  createdAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(auctionId, teamId),
  INDEX(auctionId, purseMinor)
);

-- TeamOwner: user owns team in auction
CREATE TABLE TeamOwner (
  id UUID PRIMARY KEY,
  auctionTeamId UUID NOT NULL REFERENCES AuctionTeam(id) ON DELETE CASCADE,
  userId UUID NOT NULL REFERENCES User(id) ON DELETE RESTRICT,
  joinedAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(auctionTeamId, userId),
  INDEX(userId)
);

-- TeamPurseTransaction: append-only ledger
CREATE TABLE TeamPurseTransaction (
  id UUID PRIMARY KEY,
  auctionTeamId UUID NOT NULL REFERENCES AuctionTeam(id) ON DELETE RESTRICT,
  acquisitionId UUID REFERENCES PlayerAcquisition(id) ON DELETE RESTRICT,
  type ENUM('DEBIT', 'CREDIT'),
  amountMinor BIGINT NOT NULL,
  reason STRING,
  createdAt TIMESTAMP DEFAULT NOW(),
  INDEX(auctionTeamId, createdAt),
  INDEX(acquisitionId)
);
```

### 3.4 Auction phase entities

```sql
-- AuctionBreak: break period
CREATE TABLE AuctionBreak (
  id UUID PRIMARY KEY,
  auctionId UUID NOT NULL REFERENCES Auction(id) ON DELETE CASCADE,
  breakNo INT,
  startsAt TIMESTAMP,
  durationSeconds INT,
  adjustedDurationSeconds INT,
  initiatedBy UUID REFERENCES User(id) ON DELETE SET NULL,
  reason STRING,
  INDEX(auctionId, breakNo)
);

-- AuctionTurn: turn in turn-based auction
CREATE TABLE AuctionTurn (
  id UUID PRIMARY KEY,
  auctionPlayerId UUID NOT NULL REFERENCES AuctionPlayer(id) ON DELETE CASCADE,
  turnNo INT,
  currentAuctionTeamId UUID REFERENCES AuctionTeam(id) ON DELETE SET NULL,
  action TurnAction,                 -- RAISE, PASS, HOLD (once D-06 finalizes)
  deadline TIMESTAMP,
  stateVersion INT,
  createdAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(auctionPlayerId, turnNo),
  INDEX(auctionPlayerId, turnNo)
);
```

### 3.5 Schema extensions

Extend existing Auction:
- Add `breakEveryNBids INT` (how often to trigger break)
- Add `breakCounterScope BreakCounterScope` (PER_PLAYER or PER_AUCTION)
- Add `currentBreakId UUID REFERENCES AuctionBreak(id)` (current break, null if not in break)

Extend RoomInvitation (if not already present):
- Ensure codeHash is used (plain code shown once at creation)
- Add expiresAt, maxUses, useCount
- Add role (RoomRole: TEAM_OWNER, SPECTATOR)

---

## 4. API contracts

### 4.1 Subscriptions

```ts
// packages/contracts/src/subscriptions.contracts.ts
export interface SubscriptionPlanResponse {
  id: string;
  key: string;              // BASIC, PRO, ENTERPRISE
  name: string;
  maxRooms: number;
  maxParticipantsPerRoom: number;
  hostFeatures: Record<string, boolean>;
}

export interface SubscriptionResponse {
  id: string;
  userId: string;
  plan: SubscriptionPlanResponse;
  startsAt: string;         // ISO 8601
  expiresAt: string;
  isActive: boolean;        // expiresAt > now && !isCancelled
}

export interface CheckHostEligibilityRequest {
  userId: string;
}

export interface CheckHostEligibilityResponse {
  eligible: boolean;
  reason?: string;          // "subscription_expired", "no_subscription", "max_rooms_reached"
  plan?: SubscriptionPlanResponse;
  roomsUsed?: number;
  roomsAvailable?: number;
}
```

### 4.2 Rooms

```ts
// packages/contracts/src/rooms.contracts.ts
export interface CreateRoomRequest {
  name: string;
  description?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  hosted: boolean;          // host will participate as team owner
}

export interface RoomResponse {
  id: string;
  hostId: string;
  name: string;
  status: 'DRAFT' | 'REGISTRATION' | 'READY' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
  visibility: 'PUBLIC' | 'PRIVATE';
  listed: boolean;
  memberCount: number;
  teamCount: number;
  createdAt: string;
  currentSettingsVersion: number;
}

export interface GetRoomDetailsResponse extends RoomResponse {
  host: UserResponse;
  accessPolicy: {
    joinPolicy: 'FIRST_COME_FIRST_SERVED' | 'APPROVAL' | 'INVITATION' | 'CODE';
    spectatorPolicy: 'PUBLIC' | 'RESTRICTED';
    teamOwnerCapacity: number;
    spectatorCapacity: number;
    lateJoinPolicy: 'DISALLOWED' | 'ALLOWED_BEFORE_FIRST_BID' | 'ALLOWED';
    spectatorChatEnabled: boolean;
    externalLinksEnabled: boolean;
  };
  members: RoomMemberResponse[];
  teams: AuctionTeamResponse[];
  settings?: RoomSettingsResponse;
  auction?: AuctionResponse;
}

export interface RoomBrowseQuery {
  limit?: number;           // default 10, max 50
  offset?: number;          // default 0
  search?: string;          // filter by room name
  format?: 'LIVE_COUNTDOWN' | 'TURN_BASED';
  controlMode?: 'HOST_CONTROLLED' | 'SYSTEM_AUTOMATIC';
  teamCountMin?: number;
  teamCountMax?: number;
}

export interface RoomBrowseResponse {
  rooms: RoomResponse[];
  total: number;
  hasMore: boolean;
}

export interface UpdateRoomSettingsRequest {
  config: RoomSettingsConfig;  // auction-specific config (versioned, schema-validated)
}

export interface RoomSettingsResponse {
  version: number;
  config: RoomSettingsConfig;
  createdAt: string;
}
```

### 4.3 Room members

```ts
// packages/contracts/src/room-members.contracts.ts
export interface RoomMemberResponse {
  id: string;
  userId: string;
  user: UserResponse;
  role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'LEFT' | 'REMOVED' | 'BANNED';
  joinedAt: string;
  team?: AuctionTeamResponse;  // if TEAM_OWNER
}

export interface ListRoomMembersResponse {
  members: RoomMemberResponse[];
  totalTeamOwners: number;
  totalSpectators: number;
}

export interface JoinRoomRequest {
  roomId: string;
  invitationCode?: string;   // if CODE or INVITATION policy
}

export interface JoinRoomResponse {
  roomId: string;
  role: 'TEAM_OWNER' | 'SPECTATOR';
  memberId: string;
  joinedAt: string;
}
```

### 4.4 Team allocation

```ts
// packages/contracts/src/team-allocation.contracts.ts
export interface AuctionTeamResponse {
  id: string;
  auctionId: string;
  teamId: string;
  name: string;
  purseMinor: number;        // as integer
  owners: TeamOwnerResponse[];
  createdAt: string;
}

export interface TeamOwnerResponse {
  userId: string;
  user: UserResponse;
  joinedAt: string;
}

export interface AllocateTeamRequest {
  auctionId: string;
  userId: string;
  teamId?: string;           // for USER_SELECTED mode
  mode?: 'RANDOM' | 'AUTO_DRAW';  // if null, picks from available slots
  idempotencyKey: string;    // UUID, guards against retries
}

export interface AllocateTeamResponse {
  auctionTeamId: string;
  teamName: string;
  purseMinor: number;
  owners: TeamOwnerResponse[];
  allocatedAt: string;
}

export interface ListTeamAllocationsResponse {
  teams: AuctionTeamResponse[];
  totalCapacity: number;
  usedCapacity: number;
}
```

### 4.5 Invitations

```ts
// packages/contracts/src/room-invitations.contracts.ts (if separate)
export interface CreateInvitationRequest {
  roomId: string;
  role: 'TEAM_OWNER' | 'SPECTATOR';
  expiresIn?: number;        // seconds from now, default 7 days
  maxUses?: number;          // unlimited if null
}

export interface CreateInvitationResponse {
  code: string;              // shown once; hash stored in DB
  codeHash: string;
  expiresAt: string;
  maxUses: number | null;
}

export interface AcceptInvitationRequest {
  code: string;
}

export interface AcceptInvitationResponse {
  roomId: string;
  role: 'TEAM_OWNER' | 'SPECTATOR';
  joinedAt: string;
}
```

---

## 5. Backend module structure

### 5.1 Subscriptions module

```
apps/api/src/modules/subscriptions/
├── subscriptions.module.ts
├── subscriptions.service.ts         -- business logic
├── subscriptions.controller.ts
├── dto/
│   ├── check-eligibility.dto.ts
│   └── subscription-response.dto.ts
├── guards/
│   └── subscription.guard.ts        -- @HasActiveSubscription() decorator
├── test/
│   ├── subscriptions.service.spec.ts
│   └── subscriptions.integration.spec.ts
└── errors.ts                        -- E_SUBSCRIPTION_REQUIRED, E_MAX_ROOMS_REACHED
```

**Service methods:**
- `getActiveSubscription(userId: string): Promise<SubscriptionResponse | null>`
- `checkHostEligibility(userId: string): Promise<CheckHostEligibilityResponse>`
- `validateFeatureLimitRooms(userId: string, newRoomCount: number): Promise<void>`
  - throws `SubscriptionException` if limit exceeded
- `createSubscription(userId: string, planId: string): Promise<Subscription>`
- `cancelSubscription(userId: string): Promise<void>`

### 5.2 Rooms module

```
apps/api/src/modules/rooms/
├── rooms.module.ts
├── rooms.service.ts
├── rooms.controller.ts
├── dto/
│   ├── create-room.dto.ts
│   ├── update-settings.dto.ts
│   ├── room-response.dto.ts
│   └── room-browse.dto.ts
├── guards/
│   ├── is-room-host.guard.ts
│   └── is-room-member.guard.ts
├── test/
│   ├── rooms.service.spec.ts
│   └── rooms.integration.spec.ts
└── errors.ts
```

**Service methods:**
- `createRoom(hostId: string, req: CreateRoomRequest): Promise<AuctionRoom>`
  - calls `subscriptionsService.checkHostEligibility(hostId)` first
  - rejects if ineligible
- `getRoomWithDetails(roomId: string, userId?: string): Promise<GetRoomDetailsResponse>`
- `listPublicRooms(query: RoomBrowseQuery): Promise<RoomBrowseResponse>`
- `updateRoomSettings(roomId: string, hostId: string, config: RoomSettingsConfig): Promise<RoomSettings>`
  - rejects if room.auction?.phase === LIVE
- `acceptableRoomAccess(userId: string, roomId: string, requiredRole?: RoomRole): Promise<boolean>`

### 5.3 Room members module

```
apps/api/src/modules/room-members/
├── room-members.module.ts
├── room-members.service.ts
├── room-members.controller.ts
├── dto/
│   ├── join-room.dto.ts
│   ├── room-member-response.dto.ts
│   └── list-members-response.dto.ts
├── test/
│   ├── room-members.service.spec.ts
│   └── room-members.integration.spec.ts
└── errors.ts
```

**Service methods:**
- `registerMember(roomId: string, userId: string, role: RoomRole): Promise<RoomMember>`
  - enforces capacity limits (teamOwnerCapacity, spectatorCapacity)
  - rejects if room is LIVE (unless lateJoinPolicy allows)
- `getMember(roomId: string, userId: string): Promise<RoomMember | null>`
- `listMembers(roomId: string, spectatorPolicy: SpectatorPolicy): Promise<RoomMember[]>`
  - filters based on spectator visibility
- `removeMember(roomId: string, userId: string, hostId: string): Promise<void>`
- `banUser(roomId: string, userId: string, hostId: string, reason: string): Promise<RoomBan>`

### 5.4 Team allocation module

```
apps/api/src/modules/team-allocation/
├── team-allocation.module.ts
├── team-allocation.service.ts
├── team-allocation.controller.ts
├── dto/
│   ├── allocate-team.dto.ts
│   ├── allocation-response.dto.ts
│   └── list-allocations-response.dto.ts
├── test/
│   ├── team-allocation.service.spec.ts
│   ├── team-allocation.race-condition.spec.ts
│   └── team-allocation.integration.spec.ts
└── errors.ts
```

**Service methods:**
- `allocateTeam(auctionId: string, userId: string, req: AllocateTeamRequest): Promise<AllocateTeamResponse>`
  - **ATOMIC TRANSACTION:**
    1. `SELECT auctionTeam WHERE auctionId=? AND id=? FOR UPDATE` (lock)
    2. check owner count < capacity
    3. check idempotency key (prevent double-allocation on retry)
    4. INSERT TeamOwner
    5. UPDATE auctionTeam.purseMinor (deduct base price or initialize)
    6. COMMIT
  - rejects with E_TEAM_UNAVAILABLE if owner count >= capacity
  - rejects with E_DUPLICATE_ALLOCATION if same user+team combo exists
- `listTeamAllocations(auctionId: string): Promise<AuctionTeam[]>`
- `releaseTeam(auctionId: string, userId: string): Promise<void>`
  - removes user from TeamOwner
  - refunds purse (creates compensating transaction)

### 5.5 Room invitations module

```
apps/api/src/modules/room-invitations/
├── room-invitations.module.ts
├── room-invitations.service.ts
├── room-invitations.controller.ts
├── dto/
│   ├── create-invitation.dto.ts
│   ├── accept-invitation.dto.ts
│   └── invitation-response.dto.ts
├── test/
│   ├── room-invitations.service.spec.ts
│   └── room-invitations.integration.spec.ts
└── errors.ts
```

**Service methods:**
- `createInvitation(roomId: string, hostId: string, req: CreateInvitationRequest): Promise<CreateInvitationResponse>`
  - generates code (uuid), hashes it (SHA256)
  - stores codeHash + role + expiresAt + maxUses
  - returns plain code once (never stored plain)
- `validateInvitationCode(code: string, roomId: string): Promise<{ valid: true; role: RoomRole } | { valid: false; reason: string }>`
  - hashes code, looks up codeHash
  - checks expiry, maxUses, revocation
- `acceptInvitation(userId: string, code: string): Promise<{ roomId: string; role: RoomRole }>`
  - validates code, then calls roomMembersService.registerMember
  - increments useCount
- `revokeInvitation(invitationId: string, hostId: string): Promise<void>`

### 5.6 Tournaments module

```
apps/api/src/modules/tournaments/
├── tournaments.module.ts
├── tournaments.service.ts
├── tournaments.controller.ts
├── dto/
│   ├── create-tournament.dto.ts
│   └── tournament-response.dto.ts
├── test/
│   └── tournaments.service.spec.ts
└── errors.ts
```

**Service methods:**
- `createTournament(organizerId: string, name: string, description?: string): Promise<Tournament>`
- `addMember(tournamentId: string, userId: string, role: string): Promise<TournamentMember>`
- `removeMember(tournamentId: string, userId: string, organizerId: string): Promise<void>`

---

## 6. Frontend pages and components

### 6.1 Pages

```
apps/web/src/app/(dashboard)/
├── auction/
│   ├── page.tsx                              -- entry hub (host, join, spectate)
│   ├── host/
│   │   └── create/
│   │       └── page.tsx                      -- 11-step wizard
│   ├── browse/
│   │   └── page.tsx                          -- discover & search public rooms
│   ├── [roomId]/
│   │   ├── page.tsx                          -- room details & join button
│   │   ├── members/
│   │   │   └── page.tsx                      -- member list
│   │   ├── settings/
│   │   │   └── page.tsx                      -- host-only settings editor
│   │   └── layout.tsx                        -- RoomContext provider
│   └── invite/
│       └── [code]/
│           └── page.tsx                      -- accept invitation link
└── subscription/
    └── page.tsx                              -- status & upgrade
```

### 6.2 Components

```
apps/web/src/components/
├── RoomCreationWizard/
│   ├── RoomCreationWizard.tsx
│   ├── Step1Visibility.tsx
│   ├── Step2NameDescription.tsx
│   ├── Step3TeamCount.tsx
│   ├── Step4AllocationMode.tsx
│   ├── Step5Purse.tsx
│   ├── Step6PlayerSelection.tsx
│   ├── Step7Format.tsx
│   ├── Step8ControlMode.tsx
│   ├── Step9HostParticipation.tsx
│   ├── Step10Review.tsx
│   ├── Step11Confirm.tsx
│   └── WizardProgress.tsx
├── RoomBrowse/
│   ├── RoomBrowseList.tsx
│   ├── RoomBrowseFilters.tsx
│   └── RoomCard.tsx
├── RoomDetails/
│   ├── RoomHeader.tsx
│   ├── TeamAllocationCard.tsx
│   ├── JoinRoomButton.tsx
│   ├── TeamSelector.tsx
│   └── RoomMembersList.tsx
├── SubscriptionStatus/
│   ├── SubscriptionStatusCard.tsx
│   ├── FeatureLimitIndicator.tsx
│   └── UpgradeCTA.tsx
└── ErrorBoundaries/
    ├── UnauthorizedError.tsx
    ├── RoomFullError.tsx
    ├── InvalidInvitationError.tsx
    └── GeneralErrorFallback.tsx
```

### 6.3 Hooks

```
apps/web/src/hooks/
├── useSubscriptionStatus.ts
├── useRoomAccess.ts
├── useRoomDetails.ts
├── useRoomMembers.ts
├── useTeamAllocation.ts
├── useBrowseRooms.ts
└── useInvitation.ts
```

### 6.4 Contexts

```
apps/web/src/contexts/
├── RoomContext.tsx                 -- room state, member updates
├── SubscriptionContext.tsx
└── AuthContext.tsx
```

---

## 7. Authorization matrix

| Endpoint | Unauthenticated | Authenticated | Host | ADMIN |
|---|---|---|---|---|
| GET /rooms (browse) | ✓ (PUBLIC only) | ✓ (PUBLIC + private via code) | ✓ | ✓ |
| POST /rooms | ✗ | ✓ (if subscribed) | — | — |
| GET /rooms/:id | ✓ (PUBLIC) | ✓ (if visible) | ✓ | ✓ |
| PATCH /rooms/:id/settings | ✗ | ✗ (if host) | ✓ | ✓ |
| GET /rooms/:id/members | ✗ | ✓ (if member) | ✓ | ✓ |
| POST /rooms/:id/members | ✗ | ✓ (if capacity) | ✓ (all) | ✓ |
| DELETE /rooms/:id/members/:uid | ✗ | ✗ (if host) | ✓ | ✓ |
| POST /rooms/:id/invitations | ✗ | ✗ (if host) | ✓ | ✓ |
| POST /rooms/accept-invitation | ✗ | ✓ | — | — |
| POST /auctions/:id/teams/allocate | ✗ | ✓ (if member) | ✓ | ✓ |
| GET /subscriptions/:uid | ✗ | ✓ (self only) | — | ✓ (ADMIN) |
| GET /subscriptions/check-eligibility | ✗ | ✓ | — | — |

---

## 8. Error codes

| Code | HTTP | Meaning | Recovery |
|---|---|---|---|
| `E_SUBSCRIPTION_REQUIRED` | 403 | User lacks active subscription to host | Upgrade subscription |
| `E_MAX_ROOMS_REACHED` | 403 | Plan allows N rooms; user has N | Upgrade or cancel old room |
| `E_ROOM_FULL` | 409 | No capacity for user's requested role | Join different room or spectate |
| `E_TEAM_UNAVAILABLE` | 409 | Team slot filled (race condition lost) | Retry with different team |
| `E_TEAM_ALLOCATION_CONFLICT` | 409 | User already owns team in room | Release before reallocating |
| `E_INVALID_INVITATION_CODE` | 400 | Code invalid, expired, or max uses hit | Request new code from host |
| `E_ROOM_NOT_ACCEPTING_MEMBERS` | 409 | Room status not REGISTRATION/READY | Wait or join different room |
| `E_SETTINGS_IMMUTABLE_AFTER_LIVE` | 403 | Cannot modify settings once LIVE | Contact host for rule clarification |
| `E_SPECTATOR_POLICY_RESTRICTED` | 403 | Spectator not invited to this room | Request invitation |

---

## 9. Risk mitigation

### Risk 1: Team allocation race condition
- **Symptom:** Two users concurrently bid on same team, both appear as owners.
- **Mitigation:** Prisma transaction with `SELECT...FOR UPDATE` lock on AuctionTeam row. Atomic check + insert.
- **Test:** 50 concurrent `allocateTeam` requests on 10 slots. Verify 10 wins, 40 losses, no double ownership.

### Risk 2: Subscription entitlement timing
- **Symptom:** User's subscription expires between eligibility check and room creation.
- **Mitigation:** Re-validate subscription at room creation time. Use `checkHostEligibility` as early check; re-check in `createRoom`.
- **Test:** Subscription expires during wizard flow. Expect error on final submit, not before.

### Risk 3: Settings modified after LIVE
- **Symptom:** Host changes team count or purse mid-auction, invalidating bids.
- **Mitigation:** Snapshot settings at auction start (AuctionConfigurationSnapshot). Reject updates if `auction.phase === LIVE`.
- **Test:** Host tries to PATCH /rooms/:id/settings when room.auction.phase=LIVE. Expect 403.

### Risk 4: Spectator sees private member list
- **Symptom:** Spectator policy "RESTRICTED" but GET /rooms/:id/members returns all members.
- **Mitigation:** Backend enforces policy: if caller is spectator and policy is RESTRICTED, omit non-spectators.
- **Test:** Spectator calls GET /rooms/:id/members. Expect empty list or spectators only.

### Risk 5: Team overselling (UI + race)
- **Symptom:** UI shows 1 slot free, user clicks join, two click same slot, both see success.
- **Mitigation:** UI remains authoritative on server; client UI is display only. Server returns deterministic rejection on race loss.
- **Test:** Rapid clicks on join button. Second click fails with E_TEAM_UNAVAILABLE, first succeeds.

---

## 10. Testing strategy

### 10.1 Unit tests (per module)

Each module has `service.spec.ts`:
- Subscriptions: eligibility checks, feature limits, expiry
- Rooms: CRUD, visibility filtering, settings immutability
- Members: join, role-based access, capacity enforcement
- Team allocation: atomicity, race condition, purse consistency
- Invitations: code generation, expiry, max uses

### 10.2 Integration tests

`apps/api/test/integration/`:
- **Subscription gating:** non-subscriber → E_SUBSCRIPTION_REQUIRED; subscriber → success
- **Room flow:** create → register → member join → allocate team → list members
- **Team allocation race:** 50 concurrent requests on 10 slots → 10 succeed, 40 fail
- **Room-members permissions:** spectator cannot see team-owner-only data
- **Settings immutability:** modify settings after LIVE → 403

### 10.3 E2E tests (Playwright)

`apps/web/e2e/`:
- **Wizard flow:** step through 11 steps, submit, room created
- **Browse and join:** find room, join, allocated team shown
- **Subscription check:** non-subscriber sees upgrade CTA, cannot access host create
- **Team allocation UI race:** two rapid joins on same team, one fails

### 10.4 Load test (optional)

If needed: JMeter or k6 script simulating 100 users joining same room, verifying no oversell.

---

## 11. Frontend UX flow

### 11.1 For subscribers (host creation)

1. **Auction hub** → "Host an Auction"
2. **Subscription check** → passes (active subscription)
3. **11-step wizard**
   - Step 1: Choose visibility (PUBLIC/PRIVATE)
   - Step 2: Room name, description
   - Step 3: Team count slider
   - Step 4: Allocation mode (USER_SELECTED / RANDOM / CUSTOM)
   - Step 5: Team purse (preset or custom)
   - Step 6: Player selection (MANUAL / AUTO_DRAW)
   - Step 7: Auction format (LIVE_COUNTDOWN / TURN_BASED)
   - Step 8: Control mode (HOST_CONTROLLED / SYSTEM_AUTOMATIC)
   - Step 9: Host participates? (yes/no toggle)
   - Step 10: Review settings
   - Step 11: Confirm & Create
4. **Success** → Redirect to room details (status=DRAFT, host-only settings editor visible)

### 11.2 For non-subscribers

1. **Auction hub** → "Host an Auction"
2. **Subscription check** → fails
3. **Upgrade CTA** → Link to subscription page or modal
4. **Cannot proceed** past check

### 11.3 For participants (join public room)

1. **Auction hub** → "Join Public Auction"
2. **Browse page** → list of PUBLIC, listed rooms
3. **Search/filter** → by name, format, team count
4. **Click room** → room details
5. **Join button** → allocate team (if USER_SELECTED, show picker; else auto)
6. **Success** → member list updated, your team highlighted
7. **Can now bid** (after auction goes LIVE)

### 11.4 For private room (code-based)

1. **Auction hub** → "Join Private Auction"
2. **Enter code** → validates code
3. **Allocate team** (same as public)
4. **Join room** → added to member list

---

## 12. Database migration strategy

1. Create migration file: `npx prisma migrate dev --name phase-f-schema`
2. Review generated SQL
3. Test on local DB
4. Test on staging (Neon)
5. Backup production DB (Neon)
6. Apply to production: `npx prisma migrate deploy` (in CI/CD or manually)
7. Verify no data loss: SELECT COUNT(*) on old tables, check FK counts

---

## 13. Deployment order

1. **Database** (migrations applied first)
2. **Backend** (new modules deployed, feature flags off if needed)
3. **Frontend** (UI changes deployed)
4. **Verification** (integration tests run; smoke tests in staging)
5. **Go live** (feature flag on, or direct if no flag)

---

## 14. Success criteria

- ✓ Subscription gating: only active subscribers can create rooms
- ✓ Room discovery: PUBLIC rooms visible to all; PRIVATE invisible
- ✓ Member join: users register atomically, no overselling
- ✓ Team allocation: no race condition (50 concurrent requests on 10 slots → 10 wins)
- ✓ Settings immutability: cannot modify after LIVE
- ✓ Invitation codes: code hash used, plain text never stored; expiry + max uses enforced
- ✓ Authorization: all checks server-side; spectator permissions enforced
- ✓ Responsive UI: wizard + browse work on 375px mobile
- ✓ Error handling: user-friendly messages; recovery suggestions
- ✓ All tests pass: unit, integration, E2E; >95% pass rate
- ✓ Build succeeds: pnpm run build, pnpm run lint, pnpm run type-check

---

## 15. File list

### Database & Contracts
- `packages/database/prisma/schema.prisma` (extend)
- `packages/database/prisma/migrations/<timestamp>_phase_f_schema.sql` (new)
- `packages/contracts/src/subscriptions.contracts.ts` (new)
- `packages/contracts/src/rooms.contracts.ts` (new)
- `packages/contracts/src/team-allocation.contracts.ts` (new)
- `packages/contracts/src/room-members.contracts.ts` (new)
- `packages/contracts/src/room-invitations.contracts.ts` (new)
- `packages/contracts/src/index.ts` (extend)

### Backend
- `apps/api/src/modules/subscriptions/` (new, 7 files)
- `apps/api/src/modules/rooms/` (new, 7 files)
- `apps/api/src/modules/room-members/` (new, 7 files)
- `apps/api/src/modules/room-invitations/` (new, 7 files)
- `apps/api/src/modules/team-allocation/` (new, 7 files)
- `apps/api/src/modules/tournaments/` (new, 7 files)
- `apps/api/src/common/errors.ts` (extend)
- `apps/api/src/common/guards.ts` (extend with subscription, room-member guards)
- `apps/api/src/app.module.ts` (import new modules)
- `apps/api/test/integration/` (new, 6 test files)

### Frontend
- `apps/web/src/app/(dashboard)/auction/page.tsx` (new)
- `apps/web/src/app/(dashboard)/auction/host/create/page.tsx` (new)
- `apps/web/src/app/(dashboard)/auction/browse/page.tsx` (new)
- `apps/web/src/app/(dashboard)/auction/[roomId]/page.tsx` (new)
- `apps/web/src/app/(dashboard)/auction/[roomId]/members/page.tsx` (new)
- `apps/web/src/app/(dashboard)/auction/[roomId]/layout.tsx` (new)
- `apps/web/src/app/(dashboard)/subscription/page.tsx` (new)
- `apps/web/src/components/RoomCreationWizard/` (new, 13 files)
- `apps/web/src/components/RoomBrowse/` (new, 3 files)
- `apps/web/src/components/RoomDetails/` (new, 5 files)
- `apps/web/src/components/SubscriptionStatus/` (new, 3 files)
- `apps/web/src/hooks/` (new, 7 hook files)
- `apps/web/src/contexts/RoomContext.tsx` (new)
- `apps/web/e2e/room-creation-wizard.e2e.ts` (new)
- `apps/web/e2e/room-browse-join.e2e.ts` (new)

### Documentation
- `docs/PHASE_F_DECISIONS.md` (new)
- `docs/PHASE_F_SCHEMA_NOTES.md` (new)
- `docs/PHASE_F_API_REFERENCE.md` (new)
- `docs/PHASE_F_RISKS.md` (new)
- `IMPLEMENTATION.md` (update Phase 3 section)

---

## 16. Next phases

- **Phase G:** Real-time Socket.IO integration, room synchronization, spectator updates
- **Phase H:** Auction engine domain logic (bidding, settlement, timers)
- **Phase I:** Auction room UI with live team panels, bid controls, timer, break overlay

---

**End of Phase F Implementation Plan**
