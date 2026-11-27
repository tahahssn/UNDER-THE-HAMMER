# Technical Design: Notifications System (Phase N)

**Status:** Technical Design (Revision 1 - Review Findings Addressed)  
**Date:** 2026-11-27  
**Version:** 2.0  

---

## 1. Overview

The Notifications System orchestrates delivery of time-sensitive information to users across three independent channels: in-app (database), email (SendGrid), and SMS (Twilio). The backend provides a central `NotificationService` that acts as the orchestrator, resolving user preferences, enforcing rate limits, and delegating to channel-specific adapters. All delivery state is persisted durably in PostgreSQL; adapters are stateless and can safely retry without duplicating notifications.

The design prioritizes **backend authority** (no client-trusted delivery status), **non-blocking delivery** (fire-and-forget patterns), **provider independence** (adapters behind a common interface), and **user control** (preferences are enforced server-side and always respected).

**Key architectural decisions:**
- Notification dispatch is asynchronous and does not block auction or critical paths
- Rate limiting is server-side (Redis) and idempotent
- Preferences are per-user, per-notification-type, per-channel
- Adapters are independent implementations; failures in one channel do not affect others
- Notification records are durable; delivery status is tracked via NotificationDelivery table

---

## 2. Technology Stack (Locked)

### Backend
- **NestJS** (existing): HTTP controllers, dependency injection, middleware
- **Prisma** (existing): PostgreSQL ORM, schema management
- **PostgreSQL** (existing): Durable storage for Notification, NotificationPreference, NotificationDelivery tables
- **Redis** (existing): Rate-limit key storage (ioredis or redis package)
- **SendGrid SDK** (`@sendgrid/mail`): Email delivery, transactional messages
- **Twilio SDK** (`twilio`): SMS delivery, authentication
- **Jest** (existing): Unit and integration testing
- **EventEmitter2** (npm: `@nestjs/event-emitter`): Domain event subscription (audit trail integration)

### Frontend
- **React** + **TypeScript** (existing): UI components and hooks
- **Next.js** (existing): Server-side routing if applicable; client-side navigation otherwise
- **Lucide Icons or Heroicons** (existing): Bell icon and notification UI (SVG, not emoji)
- **Tailwind CSS** (existing): Responsive styling
- **Axios or native fetch** (existing): HTTP client for API calls
- **React Testing Library** (existing): Component testing
- **Cypress or Playwright** (existing): E2E testing
- **Framer Motion** (optional, existing): Smooth animations for badge and dropdown

**Dependencies to add:**
```json
{
  "@sendgrid/mail": "^8.1.3",
  "twilio": "^4.0.0",
  "@nestjs/event-emitter": "^2.1.0"
}
```

**Environment variables (never committed):**
- `SENDGRID_API_KEY` (string, secret) — SendGrid API key for transactional emails
- `TWILIO_ACCOUNT_SID` (string, secret) — Twilio account identifier
- `TWILIO_AUTH_TOKEN` (string, secret) — Twilio authentication token
- `TWILIO_PHONE_NUMBER` (string, e.g. `+1234567890`) — Twilio sending phone number
- `REDIS_URL` (string, default: `redis://localhost:6379`) — Redis connection string
- `NOTIFICATION_RETENTION_DAYS` (number, default: `90`) — How long to retain notifications
- `SMS_RATE_LIMIT_WINDOW_MINUTES` (number, default: `5`) — SMS rate-limit window
- `SMS_RATE_LIMIT_MAX_PER_WINDOW` (number, default: `1`) — Max SMS per window per user

**Payment provider note:** SafePay integration for subscription and tournament entry payments is out of scope for the Notifications System. Payment-related environment variables are managed separately in the Subscriptions module.

---

## 3. Data Model

### Database Schema

**CRITICAL SCHEMA ALIGNMENT:**
The following schema matches the existing database (packages/database/prisma/schema.prisma lines 1622–1656).

#### Notification Table
```prisma
model Notification {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  // e.g. BID_WON, BID_PLACED, BREAK_STARTED, BREAK_ENDED, AUCTION_ENDED, SUBSCRIPTION_EXPIRING
  category  String    // Field name is 'category', NOT 'type'
  title     String
  body      String?
  data      Json?     // Optional JSON payload: { playerId, auctionId, roomId, etc. }
  // Null if unread; timestamp when user marked as read (NOT a boolean 'read' flag)
  readAt    DateTime?
  createdAt DateTime  @default(now())

  user       User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  deliveries NotificationDelivery[]

  @@index([userId, readAt, createdAt])
}
```

**Field documentation:**
- `category` (String): Notification category (not "type"). Examples: "BID_WON", "BID_PLACED", "BREAK_STARTED", "BREAK_ENDED", "AUCTION_ENDED", "SUBSCRIPTION_EXPIRING".
- `readAt` (DateTime | null): Timestamp when notification was marked as read by user. Null = unread. API DTOs transform this to boolean `read` for client convenience.
- `data` (Json?): Flexible metadata store for event-specific context (playerId, auctionId, roomId, etc.). Useful for future deep links and analytics.

#### UserNotificationPreference Table (Existing, as expected)
```prisma
model UserNotificationPreference {
  id        String              @id @default(uuid()) @db.Uuid
  userId    String              @db.Uuid
  // e.g. BID_WON, BREAK_STARTED, AUCTION_ENDED, SUBSCRIPTION_EXPIRING
  category  String
  // IN_APP, EMAIL, SMS
  channel   NotificationChannel
  enabled   Boolean             @default(true)
  // Consent timestamp, required before enabling EMAIL/SMS for MARKETING categories
  consentedAt DateTime?
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, category, channel])
  @@index([userId])
}
```

#### NotificationChannel Enum (UPDATED)
```prisma
enum NotificationChannel {
  IN_APP
  EMAIL
  SMS      // <-- SMS was added in this phase (migration required)
}
```

**Migration required:** Add SMS to the existing NotificationChannel enum.

#### NotificationDelivery Table (Already existing, used for delivery tracking)
```prisma
model NotificationDelivery {
  id             String              @id @default(uuid()) @db.Uuid
  notificationId String              @db.Uuid
  channel        NotificationChannel
  status         DeliveryStatus      @default(PENDING)
  attempts       Int                 @default(0)
  sentAt         DateTime?
  error          String?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  notification Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)

  @@unique([notificationId, channel])
  @@index([status, createdAt])
}

enum DeliveryStatus {
  PENDING
  SENT
  FAILED
}
```

#### UserProfile Schema Update (REQUIRED)
Add phoneNumber field to UserProfile:
```prisma
model UserProfile {
  userId      String   @id @db.Uuid
  displayName String
  avatarAssetId String? @db.Uuid
  phoneNumber String?  // E.164 format: +1234567890 (optional)
  locale      String?
  timezone    String?
  countryCode String?  @db.Char(2)
  updatedAt   DateTime @updatedAt

  user        User       @relation(fields: [userId], references: [id], onDelete: Restrict)
  avatarAsset FileAsset? @relation(fields: [avatarAssetId], references: [id], onDelete: SetNull)
}
```

**Migration required:** Add phoneNumber column to UserProfile table.

**Validation:** Phone numbers should be stored in E.164 format (e.g., +1234567890) and validated at the application layer before SMS dispatch.

---

## 4. Backend Architecture

### Module Structure
```
apps/api/src/notifications/
  notifications.module.ts
  notifications.controller.ts
  notifications-preferences.controller.ts
  
  services/
    notification.service.ts         (orchestrator)
    email-adapter.service.ts        (SendGrid)
    sms-adapter.service.ts          (Twilio)
    in-app-adapter.service.ts       (database)
    notification-preferences.service.ts
    rate-limit.service.ts           (Redis-backed)
    notification-delivery.service.ts (tracking delivery status)
  
  dto/
    notification.dto.ts
    notification-preference.dto.ts
    notification-delivery.dto.ts
  
  events/
    notification.events.ts          (Event types for auction/subscription listeners)
  
  __tests__/
    notification.service.spec.ts
    email-adapter.spec.ts
    sms-adapter.spec.ts
    notification-preferences.service.spec.ts
    rate-limit.service.spec.ts
```

### Service Layer

#### 1. NotificationService (Orchestrator)

**Responsibility:** Accept a notification intent, resolve preferences, create durable Notification record, create NotificationDelivery tracking records, dispatch to enabled channels asynchronously.

**Key methods:**

```typescript
/**
 * Dispatch a notification to a user across enabled channels.
 * Fire-and-forget; failures do not throw into caller.
 * 
 * @param intent - Notification intent with userId, category, title, body, metadata
 * @returns void (fully async, no blocking)
 */
async dispatchNotification(intent: NotificationIntent): Promise<void>

/**
 * Internal: resolve user's preferences for a notification category
 * Returns enabled channels (email, sms, inApp)
 */
private async getUserPreferences(
  userId: string,
  category: string
): Promise<EnabledChannels>

/**
 * Internal: create durable Notification record
 * Does NOT set readAt (created as unread by default)
 */
private async createNotificationRecord(
  userId: string,
  category: string,
  title: string,
  body?: string,
  data?: Record<string, any>
): Promise<Notification>

/**
 * Internal: create NotificationDelivery tracking records for each channel
 * Sets status = PENDING initially; adapters update status when delivery completes
 */
private async createDeliveryRecords(
  notificationId: string,
  enabledChannels: EnabledChannels
): Promise<NotificationDelivery[]>

/**
 * Internal: dispatch to each enabled adapter asynchronously
 * Does not wait for completion; failures are logged
 */
private async dispatchToChannelsAsync(
  userId: string,
  notification: Notification,
  deliveryRecords: NotificationDelivery[],
  enabledChannels: EnabledChannels
): Promise<void>
```

**Failure handling:**
- If database write fails (e.g., user not found), log error and return early; do not throw.
- If adapter fails (e.g., SendGrid API error), log error with context; update NotificationDelivery.status = FAILED and NotificationDelivery.error; continue to next adapter.
- Never throw into caller; all errors are logged and treated as fire-and-forget.

**Rate limiting enforcement:**
- SMS adapter checks Redis; if rate-limited, skips SMS, updates NotificationDelivery.status = PENDING (retry later), and logs as skipped.
- Other channels (email, in-app) are not rate-limited.

**Preference defaults:**
- If a preference does not exist for (userId, category, channel), default to enabled=true.
- If category is marked as MARKETING and channel is EMAIL or SMS, require consentedAt timestamp; skip if not present.

**Idempotency:**
- To prevent duplicate notifications on retry, the service checks for an existing unread notification with the same (userId, category, metadata.auctionId, metadata.playerId) created within the last 1 minute.
- If found, the existing record is returned without creating a duplicate.
- This check happens before NotificationDelivery records are created.

**Implementation note on readAt:** The database stores `readAt` as a DateTime (null = unread, non-null = read timestamp). API responses transform this to a boolean `read` field for client convenience.

---

#### 2. Email Adapter (SendGrid)

**Responsibility:** Resolve user email, construct message, send via SendGrid API, update delivery status.

**Key methods:**

```typescript
/**
 * Send email to user via SendGrid.
 * Never throw; log errors and update NotificationDelivery status.
 */
async sendEmail(
  userId: string,
  notificationId: string,
  deliveryRecordId: string,
  title: string,
  body?: string,
  metadata?: Record<string, any>
): Promise<void>

/**
 * Internal: resolve user email from User record
 */
private async getUserEmail(userId: string): Promise<string>

/**
 * Internal: construct plain-text email body
 * Email format: plain text (no HTML)
 */
private constructEmailBody(title: string, body?: string, metadata?: any): string
```

**Behavior:**
- Query User record for email; if not found or email not set, log and update NotificationDelivery.status = FAILED with error "USER_EMAIL_NOT_FOUND"; return.
- Construct email subject from `title`, body from `body`.
- **Email format:** Plain text (no HTML). Subject = title, Body = body.
- Call SendGrid transactional email API (via SDK).
- On success: update NotificationDelivery.status = SENT, NotificationDelivery.sentAt = now(), increment attempts.
- On failure (API error, network error, quota exceeded): log detailed error with context; update NotificationDelivery.status = FAILED, NotificationDelivery.error = error message; do not retry within request.

**Error conditions:**
- User email not found: status = FAILED, error = "USER_EMAIL_NOT_FOUND"
- SendGrid auth failure: status = FAILED, error = "SENDGRID_AUTH_FAILED"
- SendGrid rate limit: status = FAILED, error = "SENDGRID_RATE_LIMIT" (can retry later)
- SendGrid other error: status = FAILED, error = SendGrid error message with status code

---

#### 3. SMS Adapter (Twilio)

**Responsibility:** Resolve user phone, enforce rate limit, construct message, send via Twilio, update delivery status.

**Key methods:**

```typescript
/**
 * Send SMS to user via Twilio.
 * Enforces rate limit: 1 SMS per user per 5 minutes (global across all rooms).
 * Never throw; log errors and update NotificationDelivery status.
 */
async sendSms(
  userId: string,
  notificationId: string,
  deliveryRecordId: string,
  title: string,
  body?: string,
  metadata?: Record<string, any>
): Promise<void>

/**
 * Internal: resolve user phone from UserProfile
 */
private async getUserPhone(userId: string): Promise<string>

/**
 * Internal: check and enforce rate limit via Redis
 */
private async enforceRateLimit(userId: string): Promise<boolean>

/**
 * Internal: construct SMS body (title + body, max 160 chars)
 */
private constructSmsBody(title: string, body?: string): string
```

**Behavior:**
- Query UserProfile for phoneNumber; if not found or phone not set, log and update NotificationDelivery.status = FAILED with error "USER_PHONE_NOT_FOUND"; return.
- Check rate limit: query Redis for key `NOTIFICATIONS:SMS:RATE_LIMIT:{userId}`.
- If rate limit hit (counter > 1 within window), update NotificationDelivery.status = PENDING (keep for retry), log as rate-limited, increment attempts, return without sending.
- If rate limit not hit, increment counter, set expiry to 5 minutes, continue.
- Construct SMS body: combine title and body, truncate to 160 chars if needed.
- Call Twilio SMS API with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.
- On success: update NotificationDelivery.status = SENT, NotificationDelivery.sentAt = now(), increment attempts.
- On failure: log error; update NotificationDelivery.status = FAILED, NotificationDelivery.error = error message; do not retry within request.

**Error conditions:**
- User phone not found: status = FAILED, error = "USER_PHONE_NOT_FOUND"
- Rate limit exceeded: status = PENDING (not an error; will retry later), log as "SMS_RATE_LIMIT_HIT"
- Twilio auth failure: status = FAILED, error = "TWILIO_AUTH_FAILED"
- Twilio quota exceeded: status = FAILED, error = "TWILIO_QUOTA_EXCEEDED"
- Twilio other error: status = FAILED, error = Twilio error message with error code

**Rate limit enforcement:**
- Redis key: `NOTIFICATIONS:SMS:RATE_LIMIT:{userId}` (global per user, not per-room)
- Logic: `INCR` key; if TTL not set, `EXPIRE` key to windowMinutes; if counter > 1, limit is hit
- **Rate limit scope:** SMS limiting is global per user across all rooms and auctions. If a user receives (or attempts to receive) an SMS notification in one auction, they cannot receive SMS in any other auction for 5 minutes. This prevents SMS spam platform-wide.

---

#### 4. In-App Adapter

**Responsibility:** Confirm Notification record is accessible and mark delivery as successful.

**Key methods:**

```typescript
/**
 * In-app notifications are already persisted by NotificationService.
 * This adapter confirms delivery and updates tracking.
 */
async sendInApp(
  userId: string,
  notificationId: string,
  deliveryRecordId: string
): Promise<void>
```

**Behavior:**
- Notification record already exists in database (created by NotificationService).
- Verify record is accessible and owned by correct userId.
- Update NotificationDelivery.status = SENT, NotificationDelivery.sentAt = now().
- Future: broadcast WebSocket event to Socket.IO room to trigger real-time UI update (out of scope for this phase).

---

#### 5. NotificationDeliveryService

**Responsibility:** Track and manage NotificationDelivery records; support retry logic.

**Key methods:**

```typescript
/**
 * Create NotificationDelivery records for each enabled channel
 */
async createDeliveryRecords(
  notificationId: string,
  channels: NotificationChannel[]
): Promise<NotificationDelivery[]>

/**
 * Update delivery record status after adapter completes
 */
async updateDeliveryStatus(
  deliveryRecordId: string,
  status: DeliveryStatus,
  error?: string,
  sentAt?: Date
): Promise<void>

/**
 * Increment attempts counter on retry
 */
async incrementAttempts(deliveryRecordId: string): Promise<void>

/**
 * Find pending deliveries for retry (future background job)
 */
async getPendingDeliveries(olderThanMinutes: number = 5): Promise<NotificationDelivery[]>
```

---

#### 6. NotificationPreferencesService

**Responsibility:** Get and update user notification preferences.

**Key methods:**

```typescript
/**
 * Get all notification preferences for a user.
 * Returns array of { category, channels: { email, sms, inApp } }.
 * If preference does not exist for a (category, channel) pair, return default enabled.
 */
async getUserPreferences(userId: string): Promise<UserPreferenceDto[]>

/**
 * Update preferences for a notification category and user.
 * Request body: { email: boolean, sms: boolean, inApp: boolean }
 * Creates or updates preference records.
 * If enabling EMAIL or SMS for MARKETING category, require consentedAt.
 */
async updatePreferencesForCategory(
  userId: string,
  category: string,
  channels: { email: boolean; sms: boolean; inApp: boolean }
): Promise<UserPreferenceDto[]>

/**
 * Internal: validate notification category is recognized
 */
private validateNotificationCategory(category: string): void

/**
 * Internal: enforce MARKETING consent requirement
 */
private requireConsentIfMarketing(category: string, channel: 'email' | 'sms'): void
```

**Validation rules:**
- Notification category must be one of: `BID_WON`, `BID_PLACED`, `BREAK_STARTED`, `BREAK_ENDED`, `AUCTION_ENDED`, `SUBSCRIPTION_EXPIRING`
- Channels must be valid: `email`, `sms`, `inApp`
- If enabling EMAIL or SMS for a MARKETING category, consentedAt timestamp is required (set to current time on first enable)

**Database operations:**
- GET: query UserNotificationPreference where userId and category match; fill in defaults for missing (category, channel) pairs
- POST/PUT: upsert UserNotificationPreference records for the specified category and each channel

---

#### 7. RateLimitService

**Responsibility:** Manage SMS rate-limit state in Redis.

**Key methods:**

```typescript
/**
 * Check if user has hit SMS rate limit (1 SMS per 5 minutes).
 * Increments counter; if counter > 1, limit is exceeded.
 * Sets expiry to windowMinutes.
 */
async checkAndIncrementRateLimit(
  userId: string,
  windowMinutes: number = 5
): Promise<{ isLimited: boolean; attemptsInWindow: number }>

/**
 * Reset rate limit for a user (admin override or testing).
 */
async resetRateLimit(userId: string): Promise<void>
```

**Implementation:**
- Redis key: `NOTIFICATIONS:SMS:RATE_LIMIT:{userId}`
- Commands: `INCR` key, check value; if TTL not set, `EXPIRE` key to windowMinutes
- Logic: increment key, check value; if > 1, return isLimited=true; on first increment, set TTL

---

### Controllers

#### NotificationsController

**Routes:**

```typescript
/**
 * GET /v1/notifications
 * Query: page=1, limit=20, category=BID_WON,BREAK_STARTED (optional filter)
 * Returns: paginated Notification array with transformed DTO (read as boolean)
 */
@Get()
@UseGuards(JwtGuard)
async getNotifications(
  @Request() req: { user: JwtPayload },
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 20,
  @Query('category') categories?: string
): Promise<{ notifications: NotificationDto[]; total: number; page: number; limit: number }>

/**
 * POST /v1/notifications/:id/mark-read
 * Sets readAt = now() (UTC)
 * Idempotent: if already read, no error
 * Returns updated notification with read = true
 */
@Post(':id/mark-read')
@UseGuards(JwtGuard)
async markNotificationRead(
  @Request() req: { user: JwtPayload },
  @Param('id') notificationId: string
): Promise<{ success: boolean; notification: NotificationDto }>

/**
 * POST /v1/notifications/mark-all-read
 * Mark all unread notifications as read (all where readAt is null)
 */
@Post('mark-all-read')
@UseGuards(JwtGuard)
async markAllAsRead(
  @Request() req: { user: JwtPayload }
): Promise<{ updated: number }>

/**
 * DELETE /v1/notifications/:id
 * Hard-delete Notification record (not soft-delete; no isDeleted flag in schema)
 */
@Delete(':id')
@UseGuards(JwtGuard)
async deleteNotification(
  @Request() req: { user: JwtPayload },
  @Param('id') notificationId: string
): Promise<{ success: boolean }>
```

**DTO Transformation (readAt -> read boolean):**
```typescript
interface NotificationDto {
  id: string;
  category: string; // Not "type"
  title: string;
  body?: string;
  read: boolean;    // Derived: readAt !== null
  createdAt: string; // ISO 8601
  data?: Record<string, any>;
}

// Transformation function used in all responses
function transformNotification(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    category: notification.category,
    title: notification.title,
    body: notification.body,
    read: notification.readAt !== null, // <-- Transform DateTime to boolean
    createdAt: notification.createdAt.toISOString(),
    data: notification.data,
  };
}
```

**Authorization:**
- All endpoints require JWT Bearer token (JwtGuard)
- Extract userId from JWT `sub` claim
- Verify notification belongs to authenticated user before allowing read/delete

**Error handling:**
- Notification not found: 404 NOT_FOUND
- User not authenticated: 401 UNAUTHENTICATED
- User attempting to access another user's notification: 403 FORBIDDEN
- Database error: 500 INTERNAL

---

#### NotificationPreferencesController

**Routes:**

```typescript
/**
 * GET /v1/notifications/preferences
 * Returns array of { category, channels: { email, sms, inApp } }
 * Includes defaults for all supported categories even if no preference record exists
 */
@Get('preferences')
@UseGuards(JwtGuard)
async getPreferences(
  @Request() req: { user: JwtPayload }
): Promise<{ preferences: UserPreferenceDto[] }>

/**
 * POST /v1/notifications/preferences/:category
 * Body: { email: boolean, sms: boolean, inApp: boolean }
 * Updates preferences for the notification category
 * Note: parameter is "category", not "type"
 */
@Post('preferences/:category')
@UseGuards(JwtGuard)
async updatePreferences(
  @Request() req: { user: JwtPayload },
  @Param('category') category: string,
  @Body(new ZodValidationPipe(updatePreferencesSchema)) dto: UpdatePreferencesDto
): Promise<{ preferences: UserPreferenceDto[] }>
```

**Request/Response DTOs:**

```typescript
// updatePreferencesSchema
const UpdatePreferencesSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
  inApp: z.boolean(),
});
type UpdatePreferencesDto = z.infer<typeof UpdatePreferencesSchema>;

// UserPreferenceDto
interface UserPreferenceDto {
  category: string;
  channels: {
    email: { enabled: boolean; consentedAt?: string };
    sms: { enabled: boolean; consentedAt?: string };
    inApp: { enabled: boolean };
  };
}
```

---

### Event Triggers and Integration

**CRITICAL: Event emission must be verified against actual AuctionsModule implementation before final deployment.**

#### Event System Design

Notification dispatch is triggered by domain events emitted from other modules (Auctions, Subscriptions, etc.). The NotificationService subscribes to these events and dispatches notifications asynchronously.

**Event subscription mechanism:**
- Use NestJS `EventEmitter2` (npm: `@nestjs/event-emitter`) to emit and subscribe to domain events
- NotificationService is an event listener that reacts to specific event types
- On event emission, NotificationService queues notification dispatch (fully async, non-blocking)

**Events and notification categories:**

| Event Name | Notification Category | Recipients | Trigger | Event Payload |
|----------|----------------------|-------------|---------|---------------|
| `bid.accepted` | `BID_WON` | Winning bidder | When a bid is accepted in an auction | `BidAcceptedEvent` (see below) |
| `bid.accepted` | `BID_PLACED` | All other participants | When a bid is accepted in an auction | `BidAcceptedEvent` |
| `break.started` | `BREAK_STARTED` | All room members (active RoomMembers, any role) | When a break begins | `BreakStartedEvent` |
| `break.ended` | `BREAK_ENDED` | All room members (active RoomMembers, any role) | When a break ends | `BreakEndedEvent` |
| `auction.ended` | `AUCTION_ENDED` | All team owners in the room | When an auction completes | `AuctionEndedEvent` |
| `subscription.expiring` | `SUBSCRIPTION_EXPIRING` | Host with expiring subscription | 7 days before expiry (via scheduled job) | `SubscriptionExpiringEvent` |

**Event payload specifications:**

```typescript
interface BidAcceptedEvent {
  winningBidderId: string;              // User ID of winning bidder
  otherParticipantIds: string[];        // User IDs of all other room members
  playerName: string;                   // Player's name for notification body
  playerCategory: string;               // Category (e.g., "Batsman", "Bowler")
  teamName: string;                     // Winning team name
  bidAmount: string;                    // Bid amount in integer minor units (e.g., "100000" = PKR 1 lakh)
  auctionId: string;                    // Auction/room ID for context linking
  playerId: string;                     // Player ID for deep linking
  roomId: string;                       // Room ID for context
}

interface BreakStartedEvent {
  roomId: string;
  durationMinutes: number;
  startedAt: Date;
}

interface BreakEndedEvent {
  roomId: string;
  startedAt: Date;
  endedAt: Date;
}

interface AuctionEndedEvent {
  auctionId: string;
  roomId: string;
  endedAt: Date;
  totalAuctionedPlayers: number;
}

interface SubscriptionExpiringEvent {
  userId: string;                       // Host ID
  subscriptionId: string;
  expiresAt: Date;
  daysUntilExpiry: number;              // Should be 7
}
```

**Event listener implementation in NotificationService:**

```typescript
@Injectable()
export class NotificationService {
  constructor(
    private eventEmitter: EventEmitter2,
    private prisma: PrismaService,
    // ... adapters
  ) {
    // Subscribe to domain events
    this.eventEmitter.on('bid.accepted', (event: BidAcceptedEvent) =>
      this.onBidAccepted(event).catch((err) => logger.error('Notification dispatch failed', err))
    );
    this.eventEmitter.on('break.started', (event: BreakStartedEvent) =>
      this.onBreakStarted(event).catch((err) => logger.error('Notification dispatch failed', err))
    );
    // ... other events
  }

  private async onBidAccepted(event: BidAcceptedEvent): Promise<void> {
    // Send BID_WON to winning bidder
    await this.dispatchNotification({
      userId: event.winningBidderId,
      category: 'BID_WON',
      title: `${event.playerName} sold to ${event.teamName}!`,
      body: `Congratulations! ${event.playerName} has been sold to ${event.teamName} for ${this.formatBidAmount(event.bidAmount)}.`,
      data: {
        playerId: event.playerId,
        auctionId: event.auctionId,
        roomId: event.roomId,
        bidAmount: event.bidAmount,
      },
    });

    // Send BID_PLACED to all other participants
    for (const userId of event.otherParticipantIds) {
      await this.dispatchNotification({
        userId,
        category: 'BID_PLACED',
        title: `${event.playerName} sold`,
        body: `${event.playerName} (${event.playerCategory}) has been sold to ${event.teamName} for ${this.formatBidAmount(event.bidAmount)}.`,
        data: {
          playerId: event.playerId,
          auctionId: event.auctionId,
          roomId: event.roomId,
          bidAmount: event.bidAmount,
        },
      });
    }
  }

  private async onBreakStarted(event: BreakStartedEvent): Promise<void> {
    // Query room members with active participation
    const members = await this.prisma.roomMember.findMany({
      where: {
        roomId: event.roomId,
        // Assuming a status field exists; adjust query if different
      },
      select: { userId: true },
    });

    for (const { userId } of members) {
      await this.dispatchNotification({
        userId,
        category: 'BREAK_STARTED',
        title: 'Break started',
        body: `A ${event.durationMinutes}-minute break has started. Bidding will resume shortly.`,
        data: {
          roomId: event.roomId,
          durationMinutes: event.durationMinutes,
        },
      });
    }
  }

  // ... similar handlers for other events
}
```

**Event emission (in AuctionsModule or relevant module):**

```typescript
// Example: in BidService or AuctionService
@Injectable()
export class BidService {
  constructor(
    private eventEmitter: EventEmitter2,
    private prisma: PrismaService,
  ) {}

  async acceptBid(bidId: string): Promise<void> {
    // ... business logic to accept bid and update state

    // Emit event that NotificationService listens to
    this.eventEmitter.emit('bid.accepted', {
      winningBidderId: bid.teamOwner.userId,
      otherParticipantIds: otherTeamOwnerIds,
      playerName: player.name,
      playerCategory: player.category,
      teamName: team.name,
      bidAmount: bid.amount.toString(), // Ensure as string
      auctionId: bid.auctionId,
      playerId: bid.playerId,
      roomId: bid.room.id,
    } as BidAcceptedEvent);
  }
}
```

**VERIFICATION REQUIRED BEFORE IMPLEMENTATION:**
1. Verify that the AuctionsModule (or other relevant modules) already emit events like `bid.accepted`, `break.started`, etc., OR confirm that event emission will be added to those modules.
2. Document exact event names, payload structures, and emission points.
3. If events do not currently exist, coordinate with the Auctions team to add event emission, or propose an alternative integration mechanism (database polling, direct method calls, etc.).

---

### Module Integration

#### NotificationsModule

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    // Event emitter for domain event subscription
    EventEmitterModule.forRoot(),
  ],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [
    NotificationService,
    EmailAdapterService,
    SmsAdapterService,
    InAppAdapterService,
    NotificationPreferencesService,
    NotificationDeliveryService,
    RateLimitService,
  ],
  exports: [NotificationService, NotificationPreferencesService], // Export for other modules to inject
})
export class NotificationsModule {}
```

**Injection into other modules:**

The NotificationService can be injected into other modules but notification dispatch is primarily triggered by domain events, not direct calls. Direct injection is provided for ad-hoc manual dispatch (admin actions, special cases).

```typescript
// In AuctionModule or other modules
export class AuctionService {
  constructor(
    private notifications: NotificationService,
    private eventEmitter: EventEmitter2,
    // ... other deps
  ) {}

  async acceptBid(bidId: string): Promise<void> {
    // ... business logic

    // Emit event that NotificationService listens to
    this.eventEmitter.emit('bid.accepted', {
      // ... payload
    });
  }
}
```

---

## 5. Frontend Architecture

### Component Structure
```
apps/web/src/
  components/
    notifications/
      NotificationBell.tsx
      NotificationDropdown.tsx
      NotificationItem.tsx
  
  pages/account/
    notifications/
      index.tsx               (History page)
      preferences.tsx         (Preferences page)
  
  hooks/
    useNotifications.ts       (Fetch and cache notifications)
    useNotificationPreferences.ts (Fetch and update preferences)
  
  contexts/
    NotificationsContext.tsx  (Real-time unread count, polling)
  
  __tests__/
    NotificationBell.spec.tsx
    NotificationDropdown.spec.tsx
    useNotifications.spec.ts
    useNotificationPreferences.spec.ts
```

### Components

#### NotificationBell

**Purpose:** Display bell icon with unread badge; open/close dropdown on click.

**Props:**
```typescript
interface NotificationBellProps {
  unreadCount: number;
  onOpen?: () => void;
  onClose?: () => void;
}
```

**Behavior:**
- Render Lucide/Heroicons bell icon (SVG, not emoji)
- If unreadCount > 0, show red badge with count in top-right corner
- On click, toggle dropdown visibility
- Close dropdown on backdrop click or Escape key
- Use Framer Motion for smooth badge scale animation

---

#### NotificationDropdown

**Purpose:** Display 5 most recent notifications; link to full history.

**Props:**
```typescript
interface NotificationDropdownProps {
  onClose?: () => void;
}
```

**Behavior:**
- Query GET `/v1/notifications?limit=5` on mount
- Display up to 5 recent notifications in a dropdown list
- Each item shows: category badge, title, truncated body (max 100 chars), createdAt (relative time, e.g. "5m ago"), read indicator
- "View all" link at bottom opens full history page at `/account/notifications`
- Loading state: skeleton loaders
- Error state: error message with retry button
- Mark notification as read on click (optional: POST `/v1/notifications/{id}/mark-read` on item click)

---

#### NotificationItem

**Purpose:** Display a single notification in list (dropdown or history page).

**Props:**
```typescript
interface NotificationItemProps {
  notification: NotificationDto;
  onClose?: () => void;
  onMarkRead?: (notificationId: string) => void;
}

interface NotificationDto {
  id: string;
  category: string; // BID_WON, BID_PLACED, etc. (not "type")
  title: string;
  body?: string;
  read: boolean;
  createdAt: string; // ISO 8601
  data?: Record<string, any>;
}
```

**Behavior:**
- Render category as a badge (e.g., "BID_WON" in blue, "BREAK_STARTED" in amber)
- Display title in bold, body truncated to 100 chars
- Show relative time (e.g. "5m ago") on the right
- If not read, slightly highlight the row (lighter background) or show a dot indicator
- On click, optionally call onMarkRead and navigate to relevant auction/room if data contains auctionId/roomId

---

### Pages

#### /account/notifications (History Page)

**Purpose:** Full paginated history of all notifications with filtering and bulk actions.

**Features:**
- Paginated list (20 per page)
- Filter by notification category (dropdown: "All categories", "BID_WON", "BID_PLACED", etc.)
- Columns: category badge, title, body, createdAt, read status checkbox, delete button
- Bulk actions: "Mark selected as read", "Delete selected"
- Responsive: on mobile, collapse columns or use card layout
- Empty state: "No notifications"

**Responsive design:**
- Mobile (375px): Card layout, single-column, stacked buttons
- Tablet (768px): Two-column table or card grid
- Desktop (1024px+): Full table layout with all columns

---

#### /account/settings/notifications (Preferences Page)

**Purpose:** User controls per-notification-category per-channel preferences.

**Features:**
- Load current preferences via GET `/v1/notifications/preferences`
- Display table or card grid:
  - Rows: notification category (BID_WON, BREAK_STARTED, etc.)
  - Columns: In-App, Email, SMS (each a toggle switch)
- On toggle change, POST `/v1/notifications/preferences/{category}` with updated state
- Show loading state during POST, success toast on save, error message on failure
- Display info text: "SMS limited to 1 per user per 5 minutes platform-wide"
- Optional confirmation modal before disabling a channel

**Responsive design:**
- Mobile: Single-column, stacked toggles
- Tablet/Desktop: Table or grid layout

---

## 6. Error Handling and Invariants

### Database Invariants

1. **User existence:** Foreign key constraint ensures userId references valid User record. If user is deleted, cascade deletes all Notification records.
2. **Preference uniqueness:** Unique constraint on (userId, category, channel) prevents duplicate preferences.
3. **Delivery tracking:** Each (Notification, channel) pair has at most one NotificationDelivery record (unique constraint).
4. **Referential integrity:** NotificationDelivery.notificationId references valid Notification; cascade delete on Notification deletion.

### Application Invariants

1. **Notification idempotency:** Calling dispatchNotification multiple times with the same intent (userId, category, metadata.auctionId, metadata.playerId) within 1 minute returns the existing record without creating a duplicate.
2. **Preference defaults:** If a preference does not exist for (userId, category, channel), the service treats it as enabled.
3. **Rate limit enforcement:** SMS dispatch is globally rate-limited per user; a user rate-limited in one room cannot send/receive SMS in any other room for the window duration.
4. **Delivery status progression:** NotificationDelivery.status transitions are: PENDING → SENT (success) or PENDING → FAILED (error). Status can be reset to PENDING for retry.
5. **readAt semantics:** readAt is null until user marks notification as read. API responses transform `readAt !== null` to `read: true`.

### Error Codes

Standard error codes to use in logs and error responses:
- `NOTIFICATION_EMAIL_NOT_FOUND` — User has no email on file
- `NOTIFICATION_SMS_PHONE_NOT_FOUND` — User has no phone number on file
- `NOTIFICATION_SMS_RATE_LIMITED` — SMS rate limit exceeded; delivery deferred
- `NOTIFICATION_SENDGRID_AUTH_FAILED` — SendGrid API key invalid
- `NOTIFICATION_SENDGRID_RATE_LIMIT` — SendGrid rate limit exceeded
- `NOTIFICATION_SENDGRID_ERROR` — SendGrid API error
- `NOTIFICATION_TWILIO_AUTH_FAILED` — Twilio credentials invalid
- `NOTIFICATION_TWILIO_QUOTA_EXCEEDED` — Twilio account quota exceeded
- `NOTIFICATION_TWILIO_ERROR` — Twilio API error
- `NOTIFICATION_INVALID_CATEGORY` — Notification category not recognized
- `NOTIFICATION_INVALID_CHANNEL` — Notification channel not recognized
- `NOTIFICATION_PREFERENCE_CONSENT_REQUIRED` — Marketing category requires consent
- `NOTIFICATION_NOT_FOUND` — Notification record does not exist
- `NOTIFICATION_FORBIDDEN` — User unauthorized to access notification
- `NOTIFICATION_INTERNAL_ERROR` — Unexpected error (log details)

---

## 7. Testing Strategy

### Unit Tests (60%+ coverage)

**Services:**
- `NotificationService`: preference resolution, idempotency check, dispatchNotification (mocked adapters)
- `EmailAdapterService`: email construction, error logging, failure handling
- `SmsAdapterService`: SMS body construction, rate-limit check, error logging
- `NotificationPreferencesService`: preference CRUD, validation, default logic
- `RateLimitService`: rate-limit increment, TTL management, reset

**Test cases:**
- Happy paths: dispatch with all channels enabled, successful delivery
- Preference defaults: missing preferences default to enabled
- Rate limiting: user rate-limited on second SMS, subsequent attempts skipped
- Error paths: user email not found, SMS phone not found, SendGrid/Twilio API errors
- Idempotency: duplicate dispatch within 1 minute returns existing record

### Integration Tests (20%+ coverage)

**Database:**
- Notification creation and retrieval
- NotificationDelivery tracking (PENDING → SENT/FAILED)
- Preference CRUD with database persistence
- Cascade deletes on user deletion

**External APIs (mocked):**
- SendGrid mock: test successful email send and error scenarios
- Twilio mock: test successful SMS send, rate limit, error scenarios
- Redis mock: test rate-limit key increment and TTL

**Test cases:**
- Create notification, verify record in database with readAt = null
- Mark notification as read, verify readAt timestamp is set
- Delete notification, verify hard-delete
- Create preference, update preference, delete preference
- SMS rate limit: increment key, verify counter > 1 on second call

### E2E Tests (5%+ coverage)

**Workflows:**
- Bid acceptance triggers BID_WON notification to bidder and BID_PLACED to others
- User clicks bell icon, dropdown shows 5 recent notifications
- User clicks "View all", history page loads with pagination
- User toggles email preference off, POST succeeds, preference is updated
- User marks notification as read, UI reflects change

**Test scenarios:**
- Full bid-to-notification workflow
- Preferences page toggle and save
- History page pagination and filtering
- Mobile responsiveness at 375px, 1024px, 1440px

### Security Tests

- Unauthorized user cannot access another user's notifications (403 FORBIDDEN)
- Unauthorized user cannot update another user's preferences (403 FORBIDDEN)
- Sensitive data (SendGrid key, Twilio token) not logged or exposed to client

---

## 8. Deployment and Configuration

### Environment Setup

**Backend environment variables (.env or secrets manager):**
```
SENDGRID_API_KEY=sk_test_...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890
REDIS_URL=redis://localhost:6379
NOTIFICATION_RETENTION_DAYS=90
SMS_RATE_LIMIT_WINDOW_MINUTES=5
SMS_RATE_LIMIT_MAX_PER_WINDOW=1
```

**Database migrations required:**
1. Add `SMS` to NotificationChannel enum
2. Add `phoneNumber` field to UserProfile table

### Deployment Checklist

- [ ] Prisma migrations applied to production database
- [ ] Environment variables configured in production secret manager
- [ ] SendGrid API key validated and tested
- [ ] Twilio credentials validated and tested
- [ ] Redis connection verified
- [ ] EventEmitter2 integration tested with actual auction events
- [ ] Rate-limit Redis keys validated
- [ ] Email and SMS test messages sent successfully
- [ ] Notification retention policy (90 days) confirmed
- [ ] Logging configured to capture errors without sensitive data
- [ ] Admin dashboard access to NotificationDelivery records for monitoring

---

## 9. Future Enhancements (Out of Scope)

- **Webhook retry:** Implement background job to retry failed deliveries based on NotificationDelivery.attempts counter
- **DLR (Delivery Receipts):** Twilio webhook to update SMS delivery status to SENT/FAILED based on network carrier feedback
- **Real-time WebSocket updates:** Broadcast in-app notifications to connected clients via Socket.IO
- **Template system:** Parameterized email and SMS templates with variable substitution
- **Internationalization:** Translate notification titles and bodies based on user locale
- **A/B testing:** Track notification open rates, click-through rates, and conversions
- **Frequency capping:** Per-user daily/weekly limits on notifications per category
- **Deep linking:** Generate deep links to relevant auction/room from notification metadata
- **Push notifications:** Native mobile app push notifications (future, requires mobile app)

---

## 10. Responses to Design Review Findings

### HIGH SEVERITY FINDINGS

**Finding 1: Notification Schema Mismatch (`read` vs. `readAt`, `type` vs. `category`)**
- **Status:** ADDRESSED
- **Action:** Updated Section 3 (Data Model) to use actual schema fields: `readAt: DateTime?` instead of `read: Boolean`, `category: String` instead of `type: String`.
- **Impact:** All backend logic, DTOs, and frontend code updated to reference correct field names. DTO transformation layer clarified.

**Finding 2: Missing SMS Channel in NotificationChannel Enum**
- **Status:** ADDRESSED
- **Action:** Updated Section 3 (Data Model) to include SMS in NotificationChannel enum. Noted that migration is required.
- **Impact:** SMS preferences and delivery tracking can now be persisted. Migration must be applied before implementation.

**Finding 3: UserProfile Missing phoneNumber Field**
- **Status:** ADDRESSED
- **Action:** Updated Section 3 (Data Model) to include `phoneNumber: String?` in UserProfile schema. Noted E.164 format and that migration is required.
- **Impact:** SMS adapter can resolve user phone numbers. Validation layer will enforce E.164 format.

**Finding 4: NotificationDelivery Scope and Retry Logic Unclear**
- **Status:** ADDRESSED
- **Action:** Clarified in Section 4 (Backend Architecture) that NotificationDelivery is in scope for initial phase. Added NotificationDeliveryService with methods to track status transitions (PENDING → SENT/FAILED) and increment attempts. Specified adapter responsibility to update delivery records.
- **Impact:** Delivery status is now explicitly tracked. Retry mechanism documented (future background job or webhook callback).

**Finding 5: Missing Event Emission Specification**
- **Status:** ADDRESSED (with VERIFICATION REQUIRED)
- **Action:** Added Section 4 "Event Triggers and Integration" with detailed event specifications, payload types, listener implementation, and emission examples. Included VERIFICATION REQUIRED note that events must be confirmed in actual AuctionsModule before final deployment.
- **Impact:** Event contracts are now concrete. Event handler implementation is documented. Verification step flagged for implementation phase.

### MEDIUM SEVERITY FINDINGS

**Finding 6: SafePay Payment Provider Context**
- **Status:** ADDRESSED
- **Action:** Added clarification in Section 2 (Technology Stack): "Payment provider note: SafePay integration for subscription and tournament entry payments is out of scope for the Notifications System."
- **Impact:** No ambiguity; developers understand notifications scope excludes payment processing.

**Finding 7: Ambiguous Mark-Read Semantics (`readAt` vs. `read`)**
- **Status:** ADDRESSED
- **Action:** Updated Section 4 (NotificationsController) with explicit note: "Implementation note on readAt: The database stores readAt as a DateTime (null = unread, non-null = read timestamp). API responses transform this to a boolean read field for client convenience. The mark-read endpoint sets readAt = now()."
- **Impact:** DTO transformation is explicit. All code will correctly handle DateTime-to-boolean conversion.

**Finding 8: SMS Rate-Limit Scope (Global vs. Per-Room)**
- **Status:** ADDRESSED
- **Action:** Updated Section 4 (SMS Adapter) with explicit scope clarification: "Rate limit scope: SMS limiting is global per user across all rooms and auctions." Noted in Section 5 (Frontend) that UI should display this clearly.
- **Impact:** Developers and users understand rate limit applies platform-wide, not per-room. No unexpected behavior on second room SMS request.

### NIT SEVERITY FINDINGS

**Finding 9: Email Adapter Description Vague on HTML vs. Plain Text**
- **Status:** ADDRESSED
- **Action:** Updated Section 4 (Email Adapter) to explicitly specify: "Email format: Plain text (no HTML). Subject = title, Body = body."
- **Impact:** Implementers have explicit format guidance; no ambiguity on HTML templating.

**Finding 10: Missing Specification of Idempotency for Notification Dispatch**
- **Status:** ADDRESSED
- **Action:** Updated Section 4 (NotificationService) with concrete idempotency logic: "To prevent duplicate notifications on retry, the service checks for an existing unread notification with the same (userId, category, metadata.auctionId, metadata.playerId) created within the last 1 minute. If found, the existing record is returned without creating a duplicate."
- **Impact:** Idempotency mechanism is explicit. Concurrent retries will not create duplicates.

**Finding 11: Break-Related Notifications Trigger Specification Incomplete**
- **Status:** ADDRESSED
- **Action:** Updated event trigger table in Section 4 to clarify: "All room members (active RoomMembers, any role)" and added event payload specification for BreakStartedEvent.
- **Impact:** Recipient set is clear. Implementers know to query RoomMembers for dispatch.

---

## 11. Summary of Changes from Revision 1.0 to 2.0

1. **Schema alignment:** All Notification fields updated to match actual schema (readAt, category, data).
2. **SMS channel:** Added SMS to NotificationChannel enum with migration note.
3. **Phone number field:** Added phoneNumber to UserProfile schema with migration note.
4. **Delivery tracking:** Added NotificationDeliveryService and clarified delivery status workflow.
5. **Event integration:** Added detailed event specifications, payload types, and verification requirements.
6. **DTO transformation:** Clarified readAt-to-read transformation layer.
7. **Rate limit scope:** Explicitly documented global per-user SMS rate limiting.
8. **Email format:** Specified plain text format.
9. **Idempotency:** Added concrete deduplication logic.
10. **Environment variables:** Added SafePay clarification.
11. **Break recipients:** Clarified recipient set for BREAK_STARTED/BREAK_ENDED.

---
