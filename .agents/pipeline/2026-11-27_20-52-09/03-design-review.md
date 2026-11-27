# Design Review: Notifications System (Phase N)

**Review Date:** 2026-11-27  
**Reviewed Against:** Requirements at 01-requirements.md  
**Fresh Review:** No – This is a revision review against previous findings documented in Section 10 of the design  

---

## Executive Summary

The design has matured significantly from the previous review. All HIGH and MEDIUM findings from the prior review have been addressed with concrete clarifications, schema updates, and implementation guidance. The design now stands on solid ground with one notable verification gap: **event emission in the AuctionsModule must be confirmed before implementation can proceed.**

**Verdict: CHANGES_REQUESTED**  
Reasons: 2 HIGH findings require resolution; 1 MEDIUM finding requires acknowledgment.

---

## Findings

### HIGH SEVERITY

#### 1. **Missing Event Emission Implementation in AuctionsModule**
**Location:** Section 4, "Event Triggers and Integration"  
**Problem:** The design specifies event emission (e.g., `bid.accepted`, `break.started`) as the trigger mechanism for notification dispatch. However, **the actual AuctionsModule code does not emit these events.** The design includes an example of how BidService *should* emit events:

```typescript
this.eventEmitter.emit('bid.accepted', { ... });
```

But this is a proposed pattern, not an existing implementation. The design flags this with "VERIFICATION REQUIRED" but leaves it ambiguous whether:
1. The events will be added to AuctionsModule before NotificationsModule implementation
2. The events are out of scope and NotificationsModule should use a different integration point (e.g., database polling, direct method calls)
3. Event emission will be completed as part of this phase

**Impact:** Without confirmed event emission, NotificationService has no way to trigger notifications on auction state changes. This breaks all acceptance criteria #11 and #16–18 (auction triggers and E2E workflows).

**Fix:** Explicitly document:
- [ ] Will AuctionsModule emit `bid.accepted`, `break.started`, `break.ended`, `auction.ended` events using EventEmitter2?
- [ ] If yes, is this implementation out of scope and expected to be done by the Auctions team, or in scope for the Notifications phase?
- [ ] If no, propose an alternative trigger mechanism (e.g., subscription service watches Bid/Break tables for state changes, or NotificationService is called directly by AuctionService).
- [ ] Update the design section to reflect the agreed approach.

---

#### 2. **Missing Migration Instructions for Required Schema Changes**
**Location:** Section 3, "Data Model"; Section 2, "Technology Stack"  
**Problem:** The design identifies two required Prisma migrations:
1. Add `SMS` to NotificationChannel enum
2. Add `phoneNumber: String?` field to UserProfile

However, the design provides **no migration instructions, no SQL, and no guidance on sequencing.** The deployment checklist in Section 8 says:
```
- [ ] Prisma migrations applied to production database
```

But it doesn't specify *which migrations* or *how to generate them*. The document assumes developers will run `prisma migrate dev` or `prisma db push`, but:
- Does the workspace use managed migrations or direct push?
- Will the SMS enum addition break existing code that expects only IN_APP and EMAIL?
- Will the phoneNumber field addition require backfill?

**Impact:** Developers cannot implement the system until they know the exact migration strategy. This is a blocker for implementation.

**Fix:** Add a "Database Migrations" subsection under Section 8 (Deployment and Configuration) with:
1. Exact Prisma migration steps
2. SQL for adding SMS to enum (or confirmation that Prisma handles enums automatically)
3. SQL for adding phoneNumber column (nullable, default NULL)
4. Guidance on whether to apply migrations before or after code deployment
5. Rollback procedure if migration fails

---

### MEDIUM SEVERITY

#### 3. **Ambiguous NotificationDelivery createdAt / updatedAt Timestamp Management**
**Location:** Section 3, "Data Model"; Section 4, "NotificationDeliveryService"  
**Problem:** The NotificationDelivery schema includes `createdAt: DateTime @default(now())` and `updatedAt: DateTime @updatedAt`, but the adapter descriptions do not specify whether adapters should update `updatedAt` when changing status. For example, in the Email Adapter:

```typescript
// On success: update NotificationDelivery.status = SENT, NotificationDelivery.sentAt = now()
```

Does this operation also update `updatedAt`? In Prisma with `@updatedAt`, it does automatically. But the design should explicitly confirm this, since it affects:
- Query performance (indexes on updatedAt, status, createdAt)
- Retry logic (finding stale PENDING records requires knowing the exact field semantics)
- Monitoring dashboards (how to identify recently failed deliveries)

**Impact:** Implementers may misunderstand timestamp semantics and query the wrong field for retry logic or monitoring.

**Fix:** Add explicit note in Section 4, NotificationDeliveryService or adapters:
> "When adapters update NotificationDelivery.status or any other field, Prisma automatically updates the NotificationDelivery.updatedAt timestamp via the @updatedAt directive. Use updatedAt (not createdAt) to identify recent delivery attempts for retry or monitoring queries."

Also update Section 4, RateLimitService getPendingDeliveries method to clarify:
```typescript
async getPendingDeliveries(olderThanMinutes: number = 5): Promise<NotificationDelivery[]> {
  // Query: status = PENDING AND updatedAt < (now - olderThanMinutes)
  // This finds deliveries that have been pending for at least the specified duration
}
```

---

### NIT SEVERITY

#### 4. **Unclear Breaking Change Impact of Adding SMS to NotificationChannel Enum**
**Location:** Section 3, "Data Model"  
**Problem:** The migration adds SMS to NotificationChannel enum. Existing code may have validation or switch statements that exhaustively handle `IN_APP | EMAIL`. After the migration:
- Enum will be `IN_APP | EMAIL | SMS`
- Existing switch statements may not cover SMS, causing TypeScript strict mode errors or runtime crashes

The design doesn't warn about this.

**Fix:** Add note to Section 2 (Technology Stack) or Section 8 (Deployment):
> "Adding SMS to NotificationChannel enum is a breaking change. After migration, all code that validates or exhaustively handles NotificationChannel must be updated to include SMS case. This includes preference endpoints, adapter dispatch logic, and any client-side filters. These updates should be completed before or as part of the same deployment as the migration."

---

#### 5. **Email Adapter Error Codes Incomplete**
**Location:** Section 4, "Email Adapter Service"  
**Problem:** The Email Adapter error handling specifies:
- `USER_EMAIL_NOT_FOUND`
- `SENDGRID_AUTH_FAILED`
- `SENDGRID_RATE_LIMIT`
- `SENDGRID_OTHER_ERROR`

But Section 6 (Error Handling and Invariants) defines a canonical error code list that includes `NOTIFICATION_SENDGRID_ERROR`. There's a mismatch in naming:
- Adapter says `SENDGRID_AUTH_FAILED`
- Section 6 says `NOTIFICATION_SENDGRID_AUTH_FAILED`

This inconsistency may cause logs to be unsearchable or unstructured.

**Fix:** Update Section 4, Email Adapter error codes to prefix all with `NOTIFICATION_`:
- `NOTIFICATION_EMAIL_NOT_FOUND`
- `NOTIFICATION_SENDGRID_AUTH_FAILED`
- `NOTIFICATION_SENDGRID_RATE_LIMIT`
- `NOTIFICATION_SENDGRID_ERROR`

Confirm all adapter error codes align with Section 6 canonical list.

---

#### 6. **Missing E164 Phone Number Validation Specification**
**Location:** Section 3, "Data Model"; Section 4, "SMS Adapter"  
**Problem:** The design states UserProfile.phoneNumber should be in "E.164 format: +1234567890" and that "Validation layer will enforce E.164 format." However, the design doesn't specify *where* validation happens:
- Is it in the UserProfile update endpoint?
- Is it in the SMS Adapter before dispatch?
- Is it both?

If it's only in the adapter, what happens if an invalid phone number is stored in the database? Does the SMS fail silently or throw?

**Impact:** Implementers must guess where to place validation, risking duplicate logic or missed validation.

**Fix:** Add subsection to Section 4, "SMS Adapter Service":
> "Phone Number Validation: Before attempting SMS delivery, the SMS Adapter validates that the phone number is in E.164 format (regex: ^\+[1-9]\d{1,14}$). If invalid, log error 'NOTIFICATION_SMS_PHONE_INVALID', update NotificationDelivery.status = FAILED with error message 'Invalid phone format', and return without calling Twilio API. Note: Phone numbers should also be validated when stored in UserProfile via the user profile update endpoint to prevent invalid data at the source."

---

#### 7. **Missing Guidance on RoomMember Status Field Query for Break Notifications**
**Location:** Section 4, "Event Listener Implementation"  
**Problem:** The design shows:
```typescript
const members = await this.prisma.roomMember.findMany({
  where: {
    roomId: event.roomId,
    // Assuming a status field exists; adjust query if different
  },
  select: { userId: true },
});
```

But the actual RoomMember schema includes:
```prisma
status MemberStatus @default(ACTIVE)
```

The design doesn't specify whether to filter by `status = ACTIVE` or include all members (including those who have leftAt set). Should a user who left the room before the break started still receive the break notification?

**Impact:** Unclear recipient set may send notifications to inactive members or miss active spectators.

**Fix:** Clarify in Section 4, "Event Listener Implementation" > onBreakStarted:
> "Query RoomMembers with where: { roomId: event.roomId, status: 'ACTIVE', leftAt: null }. This ensures only currently active room members (not those who have left) receive the notification. Future enhancement: allow room configuration to include spectators in break notifications."

---

#### 8. **Ambiguous Idempotency Check Timing**
**Location:** Section 4, "NotificationService" > "Idempotency"  
**Problem:** The idempotency check is described as:
> "If a preference does not exist for (userId, category, metadata.auctionId, metadata.playerId) created within the last 1 minute. If found, the existing record is returned without creating a duplicate."

But the logic is unclear:
1. If two rapid bids occur for the same player in the same auction (e.g., bid accepted, then immediately bid rejected), does the second one hit the dedup cache? (Probably not intended.)
2. Does the 1-minute window count from notification creation or from dispatch? (Affects race conditions.)
3. If a notification exists but is already read, does idempotency still apply? (Should probably still deduplicate.)

**Impact:** Developers may implement dedup incorrectly, creating duplicates or missing legitimate duplicates.

**Fix:** Clarify idempotency logic in Section 4, "NotificationService" > "Idempotency":
> "Idempotency Check: Before creating a new Notification record, query for an existing unread notification where:
> - userId = intent.userId
> - category = intent.category
> - data.auctionId = intent.metadata.auctionId
> - data.playerId = intent.metadata.playerId
> - createdAt > (now - 1 minute)
> - readAt IS NULL (must be unread)
> 
> If found, return the existing record and skip NotificationDelivery creation. If not found, proceed with creation.
> 
> Example: If two BID_WON notifications fire for the same player within 1 minute due to retry logic, the second dispatch will find the first notification and reuse it. If the user manually marks the notification as read, a subsequent retry will create a new notification (since the idempotency check requires readAt = null)."

---

## Verified Assumptions

The following claims in the design were verified against the actual source code:

1. ✓ **Notification schema fields exist as specified:** Checked prisma schema; confirmed `id`, `userId`, `category`, `title`, `body`, `data`, `readAt`, `createdAt`, `deliveries` relation, and index on `(userId, readAt, createdAt)`.

2. ✓ **NotificationChannel enum supports IN_APP and EMAIL:** Confirmed in schema. SMS not yet added (requires migration).

3. ✓ **NotificationDelivery schema matches design:** Confirmed `id`, `notificationId`, `channel`, `status`, `attempts`, `sentAt`, `error`, `createdAt`, `updatedAt`, unique constraint on `(notificationId, channel)`, and index on `(status, createdAt)`.

4. ✓ **UserNotificationPreference schema exists:** Confirmed with `userId`, `category`, `channel`, `enabled`, `consentedAt`, unique constraint on `(userId, category, channel)`.

5. ✓ **User model has notifications relation:** Confirmed `notifications: Notification[]` exists in User model.

6. ✓ **RoomMember model has status field:** Confirmed `status: MemberStatus @default(ACTIVE)` and `leftAt: DateTime?` fields exist.

7. ✓ **Bid model uses amountMinor (integer) for bid amount:** Confirmed `amountMinor: BigInt` in schema (aligns with financial correctness requirement: no floating-point).

---

## Unverified / Wrong Assumptions

The following claims in the design could NOT be verified or are contradicted by actual code:

1. ❌ **EventEmitter2 and @nestjs/event-emitter are available:** NOT FOUND in package.json. The design assumes `EventEmitter2` is available, but neither `@nestjs/event-emitter` nor `eventemitter2` packages are listed as dependencies. This is a **blocker** for the event-driven architecture proposed in the design.

2. ⚠️ **AuctionsModule emits domain events (bid.accepted, break.started, etc.):** NOT VERIFIED. The existing AuctionEventBroadcasterService handles **WebSocket broadcasting** to clients, not durable domain event emission. The design assumes these events exist and NotificationService will subscribe to them. **This is NOT currently implemented.**

3. ⚠️ **Redis is available for rate-limit storage:** NOT CONFIRMED. Neither `redis` nor `ioredis` packages are in dependencies. Rate-limiting logic cannot be implemented without a Redis client. The design assumes `REDIS_URL` environment variable will be set, but infrastructure is not confirmed.

4. ⚠️ **SendGrid SDK (@sendgrid/mail) will be added:** NOT IN DEPENDENCIES. The design lists this as a required dependency, but it's not currently installed. Same with Twilio SDK (`twilio`).

5. ⚠️ **UserProfile has phoneNumber field:** NOT FOUND in schema. The design proposes adding this, but it must be added via migration. Current schema does not include it.

6. ⚠️ **NotificationChannel supports SMS:** NOT FOUND in enum. Only IN_APP and EMAIL are defined. Migration required.

---

## Summary by Finding Severity

| Severity | Count | Status |
|----------|-------|--------|
| HIGH | 2 | 🔴 Must resolve before implementation |
| MEDIUM | 1 | 🟠 Should resolve for clarity |
| NIT | 5 | 🟡 Should resolve before code review |
| **TOTAL** | **8** | |

**Verdict: CHANGES_REQUESTED**

---

## Blockers for Implementation

1. **Event emission mechanism:** Confirm whether AuctionsModule will emit events, and if so, provide implementation plan or coordinate with Auctions team.
2. **Missing dependencies:** Confirm that @nestjs/event-emitter, @sendgrid/mail, twilio, and ioredis will be added to package.json.
3. **Migration strategy:** Define exact Prisma migration steps for SMS enum and phoneNumber field.

---

## Recommendations for Next Step

1. **Address all HIGH findings** before design approval.
2. **Resolve ambiguities in MEDIUM and NIT findings** in a revision or during code review.
3. **Document external dependencies** (npm packages, Redis, SendGrid/Twilio credentials) in a separate "Prerequisites" section of the design.
4. **Coordinate with Auctions team** on event emission: either they will add events, or NotificationService must use alternative integration (direct method calls, database polling).
5. **Add a "Breaking Changes" section** documenting the SMS enum addition and its impact on existing validators and switch statements.

---

## Design Quality Assessment

**Strengths:**
- Clear service layer design with well-defined responsibilities
- Comprehensive error handling and status tracking
- Good coverage of database invariants and referential integrity
- Thorough testing strategy aligned with requirements
- Strong documentation of environment variables and security concerns
- Responsive to prior review findings; shows iterative improvement

**Weaknesses:**
- Event-driven architecture not grounded in actual codebase (no existing event emitter)
- Missing Redis and third-party SDK availability confirmation
- Vague on migration strategy and breaking change impact
- Some ambiguity on timestamp semantics and phone validation

**Overall:** The design is well-structured and thoughtful, but has critical gaps in verifying external dependencies and integration points. These should be resolved before implementation begins.

