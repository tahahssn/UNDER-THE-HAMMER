# Phase F - Risk Register & Mitigations

## Critical Risks

### 1. Race Condition on Team Allocation

**Risk Level:** CRITICAL

**Problem:**
Two users simultaneously request the same team (e.g., Team #1, slot 0). Both requests are processed concurrently, and both succeed because the check-then-act window allows both to see the slot as "available". Result: double-booking of team.

**Impact:**
- Team ownership conflict: unclear which user owns the team
- Purse double-credit: two initial purses deducted from one team wallet
- Auction state corruption: member list shows two owners for one team

**Mitigation (Phase F):**
1. **Database Serializable Isolation**: All team allocation transactions run with `isolationLevel: Serializable` in Prisma.
   ```typescript
   this.prisma.$transaction(
     async (tx) => { /* create AuctionTeam */ },
     { isolationLevel: 'Serializable' }
   );
   ```
2. **Unique Constraint**: `@@unique([auctionId, slotIndex])` enforces one team per slot at the database level.
3. **Constraint Violation Handling**: Catch `P2002` (unique constraint) and return user-friendly "Team slot is already allocated" message.

**Verification:**
- Integration test: `allocateTeamUserSelected` with mocked race (simulate two concurrent requests)
- E2E test (Scenario 4): Two browser tabs attempt simultaneous allocation, verify one succeeds and one fails
- Database test: Run actual concurrent transactions, verify only one succeeds

**Residual Risk:** LOW (database-level protection is strong)

---

### 2. Configuration Mutable After LIVE Starts

**Risk Level:** CRITICAL

**Problem:**
Host modifies room settings (e.g., increases team count from 8 to 16, changes purse) after auction goes LIVE. Teams already bidding now have different rules than what they started with. Unfair advantage for new teams.

**Impact:**
- Fairness violation: inconsistent rules across auction lifecycle
- Team purse mismatch: some teams started with 10 crore, others with different amount
- Player selection rules change mid-bid: categories change, bid brackets change

**Mitigation (Phase F):**
1. **Service-Level Guard**:
   ```typescript
   private canModifyConfiguration(status: RoomStatus): boolean {
     return status === 'DRAFT'; // Only allow in DRAFT
   }
   
   async updateRoomSettings(roomId, userId, newConfig) {
     const room = await this.repo.getRoomById(roomId);
     if (!this.canModifyConfiguration(room.status)) {
       throw new BadRequestException(`Cannot modify settings for ${room.status} room`);
     }
   }
   ```
2. **Immutable Snapshots**: Each config version is immutable; updates create new version row (never mutate existing).
3. **State Machine**: Only DRAFT status allows settings modifications.
4. **Controller Guard**: API layer also checks before forwarding to service.

**Verification:**
- Integration test: Attempt to update settings on LIVE room, verify rejection
- Integration test: Verify settings are immutable (no `.update()` on RoomSettings)
- E2E test: Create room, start auction, attempt to modify settings via API, verify error

**Residual Risk:** LOW (service + database constraints prevent changes)

---

### 3. Subscription Entitlement Timing (Plan Expires Mid-Auction)

**Risk Level:** HIGH

**Problem:**
Host's subscription is ACTIVE when room is created. During the auction (12 hours later), subscription expires. Host can still bid, modify settings, or end auction with expired subscription. Payment not collected.

**Impact:**
- Revenue loss: host used premium feature without active subscription
- Unfair advantage: expired-subscription users not prevented from participating
- Audit issue: cannot track which auctions were run on paid vs. free tier

**Mitigation (Phase F):**
1. **Synchronous Check at Creation**: Verify subscription status at room creation time.
   ```typescript
   const canHost = await this.subscriptionsService.canUserHost(input.hostId);
   if (!canHost) {
     throw new ForbiddenException('Active subscription required');
   }
   ```
2. **Record Subscription at Creation**: Store `subscriptionPlanIdAtCreation` on room record for audit.
3. **Phase G Enhancement**: Background job monitors subscriptions and revokes rooms if host's subscription expires during LIVE status.

**Verification (Phase F):**
- Unit test: Mock subscription service to return false, verify room creation fails
- Integration test: Subscription check called before room creation
- E2E test: User without subscription attempts room creation, redirected to subscribe

**Mitigation (Phase G):**
- Cron job: Every 5 minutes, check if any LIVE rooms' hosts have expired subscriptions
- Action: Automatically transition room to COMPLETED and log audit event
- Notification: Send host email: "Your auction was ended because subscription expired"

**Residual Risk (Phase F):** MEDIUM (subscription can expire mid-auction; Phase G will add monitoring)

---

## High-Priority Risks

### 4. Spectator Can Bid If Permission Not Enforced

**Risk Level:** HIGH

**Problem:**
Frontend only displays "Bid" button if user is TEAM_OWNER. But if client is spoofed or API security bypassed, spectator can POST to `/bid` endpoint. If backend doesn't validate role, spectator bids succeed.

**Impact:**
- Fairness: spectators participate against rules
- Financial: phantom bids from non-participants
- Trust: system seen as insecure

**Mitigation (Phase F):**
1. **Backend Authorization Guard**:
   ```typescript
   @Post('/rooms/:roomId/bid')
   @UseGuards(AuthGuard, RoleGuard('TEAM_OWNER'))
   async placeBid(@Param('roomId') roomId: string) {
     // Only TEAM_OWNER can reach here
   }
   ```
2. **Explicit Role Check**:
   ```typescript
   const member = await this.repo.getRoomMember(roomId, userId);
   if (member.role !== 'TEAM_OWNER') {
     throw new ForbiddenException('Only team owners can bid');
   }
   ```
3. **Frontend Respects Role**: Only show bid UI for TEAM_OWNER (defense in depth).

**Verification:**
- Unit test: Mock RoomMember with SPECTATOR role, verify bid rejected
- Integration test: Attempt to bid as spectator, verify 403 Forbidden
- E2E test: Join as spectator, attempt bid via API, verify blocked

**Residual Risk:** LOW (backend validation is strong)

**Future (Phase G):**
- Spectator-read-only mode on bids (never allow spectator bids)
- If spectator permission needed, explicit `spectatorCanBid` entitlement

---

### 5. Team Capacity Exceeded If Role Changes

**Risk Level:** MEDIUM

**Problem:**
Room configured for 8 team owners max. 7 users are team owners, 50 spectators. Admin manually demotes 1 spectator to TEAM_OWNER role. Now 8 team owners + multiple new joins → capacity exceeded.

**Impact:**
- State inconsistency: more team owners than slots
- Purse allocation: unclear which teams own purse
- UI confusion: team panels don't match member list

**Mitigation (Phase F):**
1. **No Manual Role Changes in Phase F**: Only allow role selection during join (no after-join modifications).
2. **Atomic Role Transitions**: Role only changeable via API endpoints with capacity validation:
   ```typescript
   async promoteSpectatorToTeamOwner(roomId, userId) {
     // 1. Check current team owner count
     const ownerCount = await this.repo.countTeamOwners(roomId);
     const capacity = room.settings.config.teamCount;
     
     if (ownerCount >= capacity) {
       throw new ConflictException('Room is at team owner capacity');
     }
     
     // 2. Promote user
     // 3. Create AuctionTeam (allocate team slot)
   }
   ```
3. **Phase G Admin Guards**: Admin endpoints for role changes will also validate capacity.

**Verification:**
- Integration test: Try to allocate team when capacity full, verify 409 Conflict
- Integration test: Verify no manual role change endpoint exists in Phase F

**Residual Risk:** LOW (Phase F disallows role changes; Phase G will validate)

---

## Medium-Priority Risks

### 6. Race Condition on Invitation Code Uses

**Risk Level:** MEDIUM

**Problem:**
Invitation code has `maxUses: 1`. Two users submit join requests with the code simultaneously. Both see `useCount: 0`, increment it, and both join.

**Impact:**
- Invitation abuse: code used more times than allowed
- Room overcapacity: more team owners than slots
- Audit: inconsistent with recorded max uses

**Mitigation (Phase F):**
1. **Serializable Isolation on Code Validation**:
   ```typescript
   async validateCodeAndIncrement(code: string) {
     return this.prisma.$transaction(
       async (tx) => {
         // 1. Find invitation
         const invitation = await tx.roomInvitation.findUnique({ where: { code } });
         
         if (!invitation) throw new BadRequestException('Code invalid');
         if (invitation.revokedAt) throw new BadRequestException('Code revoked');
         if (invitation.maxUses && invitation.useCount >= invitation.maxUses) {
           throw new ConflictException('Code max uses exceeded');
         }
         
         // 2. Increment useCount
         return await tx.roomInvitation.update({
           where: { code },
           data: { useCount: { increment: 1 } },
         });
       },
       { isolationLevel: 'Serializable' }
     );
   }
   ```
2. **Unique Constraint on Uses**: Database prevents duplicate record creation.

**Verification:**
- Integration test: Mock two concurrent requests with same code, verify only one succeeds
- E2E test (Scenario 3): Use code, attempt to use again, verify rejection

**Residual Risk:** LOW (Serializable isolation prevents double-use)

---

### 7. Access Control: Private Room Leakage

**Risk Level:** MEDIUM

**Problem:**
API endpoint `/rooms/:roomId` returns full room detail if user is a member. Frontend filters which rooms to show. But if user manually calls API with another user's private room ID, they get the room detail even though they're not a member.

**Impact:**
- Privacy: room configuration visible to non-members
- Discovery: private room exists even though it shouldn't be discoverable
- Configuration leakage: bidding strategy (purse, bid brackets) exposed

**Mitigation (Phase F):**
1. **Backend Access Check**:
   ```typescript
   async getRoomDetail(roomId: string, userId: string) {
     // For public rooms, allow any user (or only logged-in users)
     // For private rooms, require membership
     const room = await this.repo.getRoomById(roomId);
     
     if (room.visibility === 'PRIVATE') {
       const isMember = await this.repo.isMember(roomId, userId);
       if (!isMember) {
         throw new ForbiddenException('Not a member of this room');
       }
     }
     
     return this.formatRoom(room);
   }
   ```
2. **Never Expose Room IDs**: Private room IDs only shared via invitation code (not in URLs or public lists).

**Verification:**
- Integration test: Non-member attempts to fetch private room, verify 403 Forbidden
- E2E test: Join private room, verify detail visible; non-member user, verify blocked

**Residual Risk:** LOW (backend authorization checks prevent leakage)

---

## Low-Priority Risks

### 8. Subscription Limits Not Enforced Consistently

**Risk Level:** LOW

**Problem:**
Subscription entitlement check occurs once at room creation. After room created, host can change `maxTeamsPerRoom` in backend (bug), and room persists with wrong team count.

**Impact:**
- Subscription bypass: host exploits bug to create large rooms
- Revenue impact: limited revenue if bug allows unlimited teams

**Mitigation (Phase F):**
1. **Immutable Snapshots**: Team count in settings cannot change (only create new version).
2. **Service Validation**: Team count always validated against current subscription limits.
3. **Code Review**: No endpoint allows direct team count modification without validation.

**Verification:**
- Code review: Verify no `.update()` on `config` field
- Integration test: Verify team count limits enforced on create

**Residual Risk:** VERY LOW (immutable snapshots + validation prevent bypass)

---

### 9. Timezone Issues in Countdown Timers

**Risk Level:** LOW

**Problem:**
Room created with `countdownDurationSeconds: 60` stored. Client displays countdown using local timezone. If server and client have different timezones, countdown might show wrong remaining time (Phase G real-time updates will fix this, but Phase F is just static config).

**Impact:**
- UX confusion: timer appears to drift
- Phase G: real-time updates from server will sync clocks

**Mitigation (Phase F):**
1. **Store UTC**: All timestamps in UTC (Prisma/PostgreSQL handles this).
2. **Phase G Enhancement**: Real-time Socket.IO events will sync timer state from server (this phase is config only).

**Verification:**
- E2E test: Create room, verify timestamps are UTC

**Residual Risk:** VERY LOW (Phase G will add real-time syncing)

---

## Risk Summary Table

| Risk | Level | Mitigation | Verification | Residual |
|------|-------|-----------|-------------|----------|
| Team allocation race | CRITICAL | Serializable + unique constraint | Integration + E2E (Scenario 4) | LOW |
| Config mutable after LIVE | CRITICAL | Service guard + immutable snapshots | Integration + E2E | LOW |
| Subscription expires mid-auction | HIGH | Synchronous check at creation; Phase G monitoring | Unit + Integration + E2E | MEDIUM |
| Spectator can bid | HIGH | Backend role validation | Unit + Integration + E2E | LOW |
| Team capacity exceeded on role change | MEDIUM | No role changes in Phase F; Phase G validates | Integration | LOW |
| Invitation code double-use | MEDIUM | Serializable isolation + constraint | Integration + E2E (Scenario 3) | LOW |
| Private room access leak | MEDIUM | Backend authorization check | Integration + E2E | LOW |
| Subscription limits bypassed | LOW | Immutable config + validation | Code review + Integration | VERY LOW |
| Timezone confusion | LOW | UTC storage; Phase G real-time sync | E2E | VERY LOW |

---

## Recommendations for Phase G

1. **Subscription Monitoring**: Add background job to check subscription status and revoke expired rooms.
2. **Spectator Permissions**: Explicitly allow/deny spectator bid capability via entitlement.
3. **Admin Role Changes**: If Phase G adds admin role changes, enforce capacity validation.
4. **Idempotency Keys**: Add `idempotencyKey` to allocation requests (client-side retries).
5. **Audit Logging**: Log all role changes, settings updates, team allocations for compliance.
6. **Rate Limiting**: Prevent brute-force code guessing and allocation spam.

---

## Assumptions

1. **Database Consistency**: PostgreSQL running with ACID guarantees; Prisma used correctly.
2. **JWT Authenticity**: Cognito JWT tokens are verifiable; no token tampering.
3. **Network Reliability**: Requests reach server; no silent failures.
4. **Subscription System Accuracy**: Subscription service returns correct entitlements; no data corruption.

---

## Deferred to Future Phases

- **Payment Verification**: Phase L handles subscription payment webhooks
- **Cascading Deletions**: Phase G adds soft deletes with audit trail
- **Rate Limiting**: Phase L security hardening
- **Data Encryption**: Phase L security hardening (fields like purse)
- **Real-Time Sync**: Phase G adds Socket.IO for live timer, bid updates
- **Admin Overrides**: Phase H adds admin capabilities

