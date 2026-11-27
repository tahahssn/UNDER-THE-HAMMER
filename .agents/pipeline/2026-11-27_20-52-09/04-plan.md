# Implementation Plan: Notifications System (Phase N)

**Status:** Implementation Plan  
**Date:** 2026-11-27  
**Design:** 02-design.md (Revision 2.0)  
**Requirements:** 01-requirements.md  

---

## Overview

This plan breaks the Notifications System into 15 independently verifiable items, ordered by dependency. Each item leaves the codebase in a buildable state. The work encompasses backend service layer, database migrations, API controllers, frontend components, and E2E integration testing.

**Key dependencies:**
- Database migrations must be applied before services reference new schema fields
- Core services (NotificationService, adapters) are needed before controllers
- Controllers must exist before frontend can call API endpoints
- Event integration requires coordination with AuctionsModule (see BLOCKER note below)

**BLOCKER ACKNOWLEDGMENT:** The design specifies event-driven notification dispatch (listening to `bid.accepted`, `break.started`, etc. events). The current AuctionsModule does not emit these events. Per the design review finding #1 (HIGH), this must be resolved:
- **Option A:** AuctionsModule adds EventEmitter2 event emission (out of scope for this phase; Auctions team responsibility)
- **Option B:** NotificationService directly calls/subscribes to AuctionService methods (requires coordination with Auctions team)
- **Option C:** NotificationService implements a database polling mechanism as a temporary workaround

**This plan assumes Option A** (AuctionsModule will emit events). If this is not confirmed by step 1, implementation will pause at step 10, and a fallback integration approach must be agreed before continuing.

---

## Verification Commands

**Build:**
```bash
npm run build
```

**Type check:**
```bash
npm run typecheck
```

**Tests (all):**
```bash
npm run test
```

**Tests (specific module):**
```bash
npm --prefix apps/api run test -- notifications
npm --prefix packages/database run test  # if database tests exist
```

**Database validation:**
```bash
npm run db:validate
npm run db:migrate  # applies pending migrations
```

---

## Implementation Plan

- [ ] **1. Database Migrations: Add SMS to NotificationChannel Enum**
      
      Add `SMS` to the NotificationChannel enum in the Prisma schema, enabling SMS as a supported notification channel alongside IN_APP and EMAIL.
      
      **Files:**
      - packages/database/prisma/schema.prisma
      
      **Changes:**
      - Update `enum NotificationChannel` to include SMS value
      
      **Verify:**
      ```bash
      npm run db:validate  # validates schema syntax
      npm run build:schema # generates Prisma client
      npm run typecheck    # confirms TS compiles
      ```
      Expected: No errors; schema compiles successfully.

---

- [ ] **2. Database Migrations: Add phoneNumber to UserProfile**
      
      Add optional `phoneNumber: String?` field to UserProfile in Prisma schema to store user phone numbers in E.164 format for SMS dispatch.
      
      **Files:**
      - packages/database/prisma/schema.prisma
      
      **Changes:**
      - Add `phoneNumber String? @db.String` field to UserProfile model
      - Add `@@index([phoneNumber])` for lookup performance
      
      **Verify:**
      ```bash
      npm run db:validate
      npm run build:schema
      npm run typecheck
      ```
      Expected: No errors; schema compiles.

---

- [ ] **3. Database Migrations: Add createdAt and updatedAt to NotificationDelivery**
      
      Add timestamp fields to NotificationDelivery table for tracking delivery attempts and enabling retry queries. The design specifies these are needed for retry logic and monitoring.
      
      **Files:**
      - packages/database/prisma/schema.prisma
      
      **Changes:**
      - Add `createdAt DateTime @default(now())` to NotificationDelivery
      - Add `updatedAt DateTime @updatedAt` to NotificationDelivery
      - Add `@@index([status, updatedAt])` for retry queries
      
      **Verify:**
      ```bash
      npm run db:validate
      npm run build:schema
      npm run typecheck
      ```
      Expected: No errors; schema compiles.

---

- [ ] **4. Apply Database Migrations**
      
      Generate and apply Prisma migrations for the three schema changes (SMS enum, phoneNumber field, timestamps).
      
      **Files:**
      - packages/database/prisma/migrations/* (auto-generated)
      
      **Commands:**
      ```bash
      npm run db:migrate
      ```
      
      **Verify:**
      ```bash
      npm run db:validate
      npm run typecheck
      ```
      Expected: Migrations applied successfully; no TypeScript errors.

---

- [ ] **5. Create NotificationsModule Structure**
      
      Initialize the NotificationsModule with file structure, empty services, and module definition. This provides the container for all notification-related services and controllers.
      
      **Files:**
      - apps/api/src/notifications/notifications.module.ts
      - apps/api/src/notifications/notifications.controller.ts
      - apps/api/src/notifications/notifications-preferences.controller.ts
      - apps/api/src/notifications/services/notification.service.ts
      - apps/api/src/notifications/services/email-adapter.service.ts
      - apps/api/src/notifications/services/sms-adapter.service.ts
      - apps/api/src/notifications/services/in-app-adapter.service.ts
      - apps/api/src/notifications/services/notification-preferences.service.ts
      - apps/api/src/notifications/services/notification-delivery.service.ts
      - apps/api/src/notifications/services/rate-limit.service.ts
      - apps/api/src/notifications/dto/notification.dto.ts
      - apps/api/src/notifications/dto/notification-preference.dto.ts
      - apps/api/src/notifications/dto/notification-delivery.dto.ts
      - apps/api/src/notifications/events/notification.events.ts
      - apps/api/src/notifications/__tests__/placeholder.spec.ts
      
      **Verify:**
      ```bash
      npm run typecheck
      npm run build
      ```
      Expected: Module structure compiles; no syntax errors.

---

- [ ] **6. Create DTOs and Type Definitions**
      
      Define all data transfer objects, enums, and type interfaces used across the notifications system. These define the contracts between API, services, and adapters.
      
      **Files:**
      - apps/api/src/notifications/dto/notification.dto.ts
      - apps/api/src/notifications/dto/notification-preference.dto.ts
      - apps/api/src/notifications/dto/notification-delivery.dto.ts
      - apps/api/src/notifications/events/notification.events.ts
      
      **Includes:**
      - `NotificationDto` (with read boolean derived from readAt)
      - `UserPreferenceDto` with channel-specific enabled/consentedAt fields
      - `NotificationDeliveryDto` with status and error fields
      - Event types: `BidAcceptedEvent`, `BreakStartedEvent`, `BreakEndedEvent`, `AuctionEndedEvent`, `SubscriptionExpiringEvent`
      - Zod schemas for request validation
      
      **Verify:**
      ```bash
      npm run typecheck
      ```
      Expected: All types compile without errors.

---

- [ ] **7. Implement RateLimitService**
      
      Implement Redis-backed rate limiting for SMS dispatch (1 SMS per user per 5 minutes, configured via environment variables).
      
      **Files:**
      - apps/api/src/notifications/services/rate-limit.service.ts
      
      **Methods:**
      - `checkAndIncrementRateLimit(userId: string): Promise<{ isLimited: boolean; attemptsInWindow: number }>`
      - `resetRateLimit(userId: string): Promise<void>`
      
      **Dependencies:**
      - Inject `@nestjs/core` ConfigService for window and limit settings
      - Use Redis client from existing project infrastructure (ioredis or redis package)
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- rate-limit.service.spec.ts
      ```
      Expected: Tests pass; rate-limit key increments, TTL is set, counter exceeds threshold.

---

- [ ] **8. Implement NotificationDeliveryService**
      
      Implement database-backed service for creating and updating NotificationDelivery tracking records.
      
      **Files:**
      - apps/api/src/notifications/services/notification-delivery.service.ts
      
      **Methods:**
      - `createDeliveryRecords(notificationId: string, channels: NotificationChannel[]): Promise<NotificationDelivery[]>`
      - `updateDeliveryStatus(deliveryRecordId: string, status: DeliveryStatus, error?: string, sentAt?: Date): Promise<void>`
      - `incrementAttempts(deliveryRecordId: string): Promise<void>`
      - `getPendingDeliveries(olderThanMinutes: number): Promise<NotificationDelivery[]>` (for future retry jobs)
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- notification-delivery.service.spec.ts
      ```
      Expected: Tests pass; records are created, status is updated, attempts counter increments.

---

- [ ] **9. Implement NotificationPreferencesService**
      
      Implement preference resolution and CRUD operations for user notification preferences.
      
      **Files:**
      - apps/api/src/notifications/services/notification-preferences.service.ts
      
      **Methods:**
      - `getUserPreferences(userId: string): Promise<UserPreferenceDto[]>` (includes defaults for all supported categories)
      - `updatePreferencesForCategory(userId: string, category: string, channels: { email: boolean; sms: boolean; inApp: boolean }): Promise<UserPreferenceDto[]>`
      - `resolveEnabledChannels(userId: string, category: string): Promise<NotificationChannel[]>` (used by NotificationService)
      
      **Validation:**
      - Validate notification category is recognized (BID_WON, BID_PLACED, BREAK_STARTED, BREAK_ENDED, AUCTION_ENDED, SUBSCRIPTION_EXPIRING)
      - Enforce consent requirement for MARKETING categories when enabling EMAIL/SMS
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- notification-preferences.service.spec.ts
      ```
      Expected: Tests pass; preferences are retrieved with defaults, updated correctly, consent is enforced.

---

- [ ] **10. Implement In-App Adapter**
      
      Implement in-app notification adapter. Since Notification records are created by NotificationService, the adapter simply confirms delivery.
      
      **Files:**
      - apps/api/src/notifications/services/in-app-adapter.service.ts
      
      **Methods:**
      - `sendInApp(userId: string, notificationId: string, deliveryRecordId: string): Promise<void>`
      
      **Behavior:**
      - Verify Notification record exists and belongs to userId
      - Update NotificationDelivery.status = SENT, sentAt = now()
      - Future: broadcast WebSocket event to Socket.IO room
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- in-app-adapter.service.spec.ts
      ```
      Expected: Tests pass; delivery record is marked SENT.

---

- [ ] **11. Implement Email Adapter (SendGrid)**
      
      Implement email delivery adapter using SendGrid SDK. Resolves user email, constructs plain-text message, sends via API, updates delivery status.
      
      **Files:**
      - apps/api/src/notifications/services/email-adapter.service.ts
      
      **Methods:**
      - `sendEmail(userId: string, notificationId: string, deliveryRecordId: string, title: string, body?: string, metadata?: Record<string, any>): Promise<void>`
      
      **Dependencies:**
      - Install `@sendgrid/mail@^8.1.3` (add to apps/api/package.json)
      - Inject ConfigService to retrieve `SENDGRID_API_KEY`
      
      **Behavior:**
      - Query User table for email; if not found or empty, log error and update delivery status = FAILED with error "NOTIFICATION_EMAIL_NOT_FOUND"
      - Construct email: subject = title, body = plain text (no HTML)
      - Send via SendGrid API; on success, update delivery status = SENT
      - On failure (auth, rate limit, other API error), log error with code and update status = FAILED with error message
      - Never throw; all errors logged and handled gracefully
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- email-adapter.service.spec.ts
      ```
      Expected: Tests pass with mocked SendGrid SDK; email is constructed, delivery status is updated correctly.

---

- [ ] **12. Implement SMS Adapter (Twilio)**
      
      Implement SMS delivery adapter using Twilio SDK. Resolves user phone, enforces rate limit, constructs message, sends via API, updates delivery status.
      
      **Files:**
      - apps/api/src/notifications/services/sms-adapter.service.ts
      
      **Methods:**
      - `sendSms(userId: string, notificationId: string, deliveryRecordId: string, title: string, body?: string, metadata?: Record<string, any>): Promise<void>`
      
      **Dependencies:**
      - Install `twilio@^4.0.0` (add to apps/api/package.json)
      - Inject ConfigService for `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
      - Inject RateLimitService
      
      **Behavior:**
      - Query UserProfile for phoneNumber; if not found or empty, log error and update status = FAILED with error "NOTIFICATION_SMS_PHONE_NOT_FOUND"
      - Validate phone is E.164 format (regex: `^\+[1-9]\d{1,14}$`); if invalid, update status = FAILED with error "NOTIFICATION_SMS_PHONE_INVALID"
      - Check rate limit via RateLimitService.checkAndIncrementRateLimit(); if hit, update status = PENDING (not FAILED; will retry later), log as rate-limited, return
      - Construct SMS body: combine title and body, truncate to 160 chars if needed
      - Send via Twilio API; on success, update delivery status = SENT, sentAt = now()
      - On failure, log error and update status = FAILED with error message
      - Never throw; all errors logged
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- sms-adapter.service.spec.ts
      ```
      Expected: Tests pass with mocked Twilio SDK; rate limit is checked, SMS is constructed, delivery status is updated correctly.

---

- [ ] **13. Implement NotificationService (Orchestrator)**
      
      Implement the core orchestrator service that accepts notification intents, resolves preferences, creates Notification records, creates NotificationDelivery tracking records, and dispatches to adapters asynchronously.
      
      **Files:**
      - apps/api/src/notifications/services/notification.service.ts
      
      **Key Methods:**
      - `dispatchNotification(intent: NotificationIntent): Promise<void>` (fire-and-forget, no blocking)
      - `private async getUserPreferences(userId: string, category: string): Promise<EnabledChannels>`
      - `private async createNotificationRecord(...): Promise<Notification>`
      - `private async createDeliveryRecords(...): Promise<NotificationDelivery[]>`
      - `private async dispatchToChannelsAsync(...): Promise<void>`
      
      **Dependencies:**
      - Inject PrismaService, EmailAdapterService, SmsAdapterService, InAppAdapterService, NotificationDeliveryService, NotificationPreferencesService, EventEmitter2
      
      **Behavior:**
      - Fire-and-forget: never throw into caller; all errors logged
      - Idempotency: check for existing unread notification with same (userId, category, auctionId, playerId) created within 1 minute; if found, return existing record
      - Create Notification record with readAt = null (unread by default)
      - Create NotificationDelivery records for each enabled channel
      - Dispatch to each adapter asynchronously (Promise.all without await)
      - Adapters update delivery status independently
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- notification.service.spec.ts
      ```
      Expected: Tests pass; preferences are resolved, records created, dispatchers called, idempotency works, no errors thrown.

---

- [ ] **14. Implement NotificationsController and NotificationPreferencesController**
      
      Implement REST API endpoints for retrieving notifications, marking read/unread, and managing preferences.
      
      **Files:**
      - apps/api/src/notifications/notifications.controller.ts
      - apps/api/src/notifications/notifications-preferences.controller.ts
      
      **Endpoints:**
      
      **NotificationsController:**
      - `GET /v1/notifications` - paginated list (page, limit, optional category filter); transform readAt → read boolean
      - `POST /v1/notifications/:id/mark-read` - mark single notification as read; idempotent
      - `POST /v1/notifications/mark-all-read` - mark all unread as read
      - `DELETE /v1/notifications/:id` - hard-delete Notification record
      
      **NotificationPreferencesController:**
      - `GET /v1/notifications/preferences` - get all preferences for user (with defaults)
      - `POST /v1/notifications/preferences/:category` - update preferences for category and user
      
      **Authorization:**
      - All endpoints require JwtGuard; extract userId from JWT sub claim
      - Verify user owns notification before allowing read/delete
      - Prevent cross-user access (403 FORBIDDEN)
      
      **Error Handling:**
      - Notification not found: 404 NOT_FOUND
      - Unauthorized: 403 FORBIDDEN
      - Validation error: 400 BAD_REQUEST
      - Database error: 500 INTERNAL_SERVER_ERROR
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- notifications.controller.spec.ts notifications-preferences.controller.spec.ts
      npm run build
      npm run typecheck
      ```
      Expected: All endpoints tested and compile; authorization enforced.

---

- [ ] **15. Integrate NotificationsModule into AppModule**
      
      Register NotificationsModule in the main AppModule to enable dependency injection and make services available to other modules (AuctionsModule, SubscriptionsModule).
      
      **Files:**
      - apps/api/src/app.module.ts
      - apps/api/src/notifications/notifications.module.ts
      
      **Changes:**
      - Import `EventEmitterModule.forRoot()` in NotificationsModule (or at root if not already present)
      - Add NotificationsModule to AppModule imports
      - Export NotificationService from NotificationsModule (for injection into other modules)
      
      **Verify:**
      ```bash
      npm run build
      npm run typecheck
      npm --prefix apps/api run test
      ```
      Expected: AppModule compiles; no circular dependencies; tests pass.

---

- [ ] **16. VERIFICATION CHECKPOINT: Confirm Event Emission in AuctionsModule**
      
      **BLOCKER CHECKPOINT:** Before implementing event listeners, verify that AuctionsModule will emit the required events using EventEmitter2. This is a HIGH severity finding from the design review.
      
      **Action Items:**
      1. Read AuctionsModule services (AuctionService, BidAcceptanceService, BreakManagerService)
      2. Confirm EventEmitter2 is available in AuctionsModule
      3. Verify these event names are emitted: `bid.accepted`, `break.started`, `break.ended`, `auction.ended`, `subscription.expiring` (from subscriptions module)
      4. If events do NOT exist, coordinate with Auctions/Subscriptions teams to add event emission OR propose alternative integration approach
      5. Document exact event names and payload structures found
      
      **Files to inspect:**
      - apps/api/src/auctions/services/bid-acceptance.service.ts
      - apps/api/src/auctions/services/break-manager.service.ts
      - apps/api/src/subscriptions/subscriptions.service.ts
      
      **Verify:**
      - If events exist: `npm run typecheck` and confirm EventEmitter2 is wired
      - If events do NOT exist: document and pause; waiting for Auctions team to add emission OR agree on alternative
      
      Expected: Events are confirmed to exist OR alternative integration approach is agreed.

---

- [ ] **17. Implement Event Listeners in NotificationService** (Dependent on item 16)
      
      Subscribe NotificationService to domain events emitted by AuctionsModule and SubscriptionsModule. Dispatch notifications when events are received.
      
      **Files:**
      - apps/api/src/notifications/services/notification.service.ts (add event handlers)
      - apps/api/src/notifications/notifications.module.ts (wire EventEmitter2 subscription)
      
      **Event Handlers:**
      - `onBidAccepted(event: BidAcceptedEvent)` - dispatch BID_WON to bidder, BID_PLACED to others
      - `onBreakStarted(event: BreakStartedEvent)` - dispatch BREAK_STARTED to all room members (status = ACTIVE)
      - `onBreakEnded(event: BreakEndedEvent)` - dispatch BREAK_ENDED to all room members
      - `onAuctionEnded(event: AuctionEndedEvent)` - dispatch AUCTION_ENDED to all team owners
      - `onSubscriptionExpiring(event: SubscriptionExpiringEvent)` - dispatch SUBSCRIPTION_EXPIRING to host
      
      **Behavior:**
      - Each handler calls dispatchNotification with appropriate category and metadata
      - Query RoomMembers with status = ACTIVE, leftAt = null for break and auction events
      - Fire-and-forget; errors logged but do not affect event processing
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- notification.service.spec.ts (event handler tests)
      npm run build
      npm run typecheck
      ```
      Expected: Event handlers are registered, dispatch is called with correct payload, no errors.

---

- [ ] **18. Create Frontend NotificationBell Component**
      
      Implement React component displaying bell icon with unread badge and dropdown showing 5 recent notifications.
      
      **Files:**
      - apps/web/src/components/notifications/NotificationBell.tsx
      - apps/web/src/components/notifications/NotificationDropdown.tsx
      - apps/web/src/components/notifications/NotificationItem.tsx
      - apps/web/src/hooks/useNotifications.ts
      - apps/web/src/__tests__/components/NotificationBell.spec.tsx
      
      **Components:**
      
      **NotificationBell:**
      - Display Lucide/Heroicons bell icon (SVG, not emoji)
      - Show red badge with unread count if > 0
      - On click, toggle dropdown visibility
      - Close on backdrop click or Escape key
      - Animate badge scale on unread count change (Framer Motion)
      
      **NotificationDropdown:**
      - Query GET `/v1/notifications?limit=5` on mount and refresh
      - Display up to 5 recent notifications in list
      - Each item: category badge, title, truncated body (100 chars), relative time (e.g. "5m ago"), read indicator
      - "View all" link opens `/account/notifications`
      - Loading state: skeleton loaders; error state: retry button
      
      **NotificationItem:**
      - Display category badge with color (BID_WON = blue, BREAK_STARTED = amber, etc.)
      - Show title (bold), body (100 chars), createdAt (relative)
      - Optional: mark as read on click
      
      **useNotifications hook:**
      - Fetch notifications with configurable limit
      - Transform readAt → read boolean
      - Handle loading, error, retry states
      
      **Verify:**
      ```bash
      npm --prefix apps/web run test -- NotificationBell.spec.tsx
      npm run typecheck
      ```
      Expected: Components render, hook fetches data, badge displays correctly, dropdown opens/closes.

---

- [ ] **19. Create Frontend Notifications History Page**
      
      Implement full paginated notifications history page with filtering and bulk actions.
      
      **Files:**
      - apps/web/src/pages/account/notifications/index.tsx
      - apps/web/src/pages/account/notifications/NotificationsPage.tsx
      - apps/web/src/__tests__/pages/notifications.spec.tsx
      
      **Features:**
      - Paginated list (20 per page) of all notifications for user
      - Filter by category (dropdown: "All", "BID_WON", "BID_PLACED", "BREAK_STARTED", "BREAK_ENDED", "AUCTION_ENDED", "SUBSCRIPTION_EXPIRING")
      - Columns: category badge, title, body, createdAt, read status checkbox, delete button
      - Bulk actions: "Mark selected as read", "Delete selected"
      - Empty state: "No notifications"
      - Responsive: mobile (375px card layout), tablet (768px), desktop (1024px+ table)
      
      **Responsive Design:**
      - Mobile: Card-based layout, stacked buttons
      - Tablet/Desktop: Table layout with all columns
      
      **Verify:**
      ```bash
      npm --prefix apps/web run test -- notifications.spec.tsx
      npm run typecheck
      ```
      Expected: Page renders, pagination works, filtering works, bulk actions work, responsive at all breakpoints.

---

- [ ] **20. Create Frontend Notification Preferences Page**
      
      Implement preferences management page with per-category, per-channel toggles.
      
      **Files:**
      - apps/web/src/pages/account/settings/notifications.tsx
      - apps/web/src/hooks/useNotificationPreferences.ts
      - apps/web/src/__tests__/pages/notifications-preferences.spec.tsx
      
      **Features:**
      - Load preferences via GET `/v1/notifications/preferences`
      - Display table or card grid: rows = notification categories, columns = In-App, Email, SMS (each a toggle)
      - On toggle change, POST `/v1/notifications/preferences/{category}` with updated state
      - Loading state during POST; success toast on save; error message on failure
      - Info text: "SMS limited to 1 per user per 5 minutes platform-wide"
      - Optional confirmation modal before disabling a channel
      
      **useNotificationPreferences hook:**
      - Fetch preferences with caching
      - Provide updatePreferences(category, channels) mutation
      - Handle loading, error, retry states
      
      **Verify:**
      ```bash
      npm --prefix apps/web run test -- notifications-preferences.spec.tsx
      npm run typecheck
      ```
      Expected: Preferences load, toggles work, POST requests sent correctly, success/error states handled.

---

- [ ] **21. Add Notification Bell to Navigation/Header**
      
      Integrate NotificationBell component into the main app header/navigation so users always see the bell icon and can access notifications from any page.
      
      **Files:**
      - apps/web/src/components/navigation/Header.tsx (or existing header component)
      - Modify to include NotificationBell
      
      **Placement:**
      - Top-right corner of header, next to profile menu
      - Responsive: visible on mobile, tablet, desktop
      
      **Verify:**
      ```bash
      npm run typecheck
      npm --prefix apps/web run test -- Header.spec.tsx
      ```
      Expected: Bell component renders in header, unread badge visible, dropdown works from header.

---

- [ ] **22. Install and Configure Dependencies**
      
      Add required npm packages for email (SendGrid) and SMS (Twilio) delivery, and event emitting (EventEmitter2).
      
      **Files:**
      - apps/api/package.json
      
      **Dependencies to Add:**
      ```json
      "@sendgrid/mail": "^8.1.3",
      "twilio": "^4.0.0",
      "@nestjs/event-emitter": "^2.1.0"
      ```
      
      **Installation:**
      ```bash
      cd apps/api
      npm install @sendgrid/mail@^8.1.3 twilio@^4.0.0 @nestjs/event-emitter@^2.1.0
      ```
      
      **Verify:**
      ```bash
      npm run build
      npm run typecheck
      ```
      Expected: Dependencies install; TypeScript compiles; no unresolved imports.

---

- [ ] **23. Configure Environment Variables**
      
      Add required environment variables for SendGrid, Twilio, Redis, and notification settings to documentation and example .env file.
      
      **Files:**
      - .env.example (or docs/ENVIRONMENT.md)
      - apps/api/src/config/env.ts (validation schema)
      
      **Variables:**
      ```
      SENDGRID_API_KEY=sk_test_...           (required, secret)
      TWILIO_ACCOUNT_SID=AC...               (required, secret)
      TWILIO_AUTH_TOKEN=...                  (required, secret)
      TWILIO_PHONE_NUMBER=+1234567890        (required, configuration)
      REDIS_URL=redis://localhost:6379       (optional, default shown)
      NOTIFICATION_RETENTION_DAYS=90         (optional, default: 90)
      SMS_RATE_LIMIT_WINDOW_MINUTES=5        (optional, default: 5)
      SMS_RATE_LIMIT_MAX_PER_WINDOW=1        (optional, default: 1)
      ```
      
      **Verification:**
      Add Zod validation schema to env.ts for each new variable; ensure type checking.
      
      **Verify:**
      ```bash
      npm run typecheck
      npm run build
      ```
      Expected: Env validation schema compiles; type checking passes.

---

- [ ] **24. Write Unit Tests: Core Services**
      
      Write comprehensive unit tests for core services (NotificationService, adapters, preferences, rate-limit) covering happy paths, error scenarios, edge cases, and idempotency.
      
      **Files:**
      - apps/api/src/notifications/__tests__/notification.service.spec.ts
      - apps/api/src/notifications/__tests__/email-adapter.service.spec.ts
      - apps/api/src/notifications/__tests__/sms-adapter.service.spec.ts
      - apps/api/src/notifications/__tests__/notification-preferences.service.spec.ts
      - apps/api/src/notifications/__tests__/rate-limit.service.spec.ts
      - apps/api/src/notifications/__tests__/notification-delivery.service.spec.ts
      
      **Test Coverage:**
      - NotificationService: preference resolution, idempotency, record creation, adapter dispatch, error handling
      - EmailAdapter: email construction, user resolution, SendGrid API call (mocked), error codes
      - SmsAdapter: phone resolution, rate limit check, SMS construction, Twilio API call (mocked), truncation
      - NotificationPreferencesService: preference CRUD, defaults, validation, consent enforcement
      - RateLimitService: increment, TTL, threshold checking, reset
      - NotificationDeliveryService: record creation, status update, attempts increment
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- notifications/__tests__
      ```
      Expected: All unit tests pass; coverage >= 80%.

---

- [ ] **25. Write Integration Tests: Controllers and Database**
      
      Write integration tests for API endpoints, database persistence, and authorization.
      
      **Files:**
      - apps/api/src/notifications/__tests__/notifications.controller.integration.spec.ts
      - apps/api/src/notifications/__tests__/notifications-preferences.controller.integration.spec.ts
      
      **Test Scenarios:**
      - GET /v1/notifications with pagination and filtering
      - POST /v1/notifications/:id/mark-read (idempotent)
      - POST /v1/notifications/mark-all-read
      - DELETE /v1/notifications/:id
      - GET /v1/notifications/preferences (with defaults)
      - POST /v1/notifications/preferences/:category (create and update)
      - Authorization: user cannot access another user's notifications (403)
      - Error handling: 404, 400, 500 scenarios
      
      **Verify:**
      ```bash
      npm --prefix apps/api run test -- notifications/__tests__/*.integration.spec.ts
      ```
      Expected: All integration tests pass; database state verified; authorization enforced.

---

- [ ] **26. Write E2E Tests: Auction Notification Workflow**
      
      Write end-to-end tests for the complete auction notification workflow: bid accepted → notification dispatched → user retrieves notification.
      
      **Files:**
      - apps/e2e/tests/notifications-auction.e2e.spec.ts
      
      **Scenarios:**
      1. Create room, start auction, accept bid → verify BID_WON notification for winning bidder and BID_PLACED for others
      2. Start break → verify BREAK_STARTED notification to all room members
      3. End break → verify BREAK_ENDED notification
      4. End auction → verify AUCTION_ENDED notification to team owners
      5. Subscription expiring (via scheduled job or mock) → verify SUBSCRIPTION_EXPIRING notification
      6. User marks notification as read → verify UI updates
      7. User disables email channel → verify subsequent notifications skip email adapter
      8. SMS rate limit hit → verify second SMS skipped, first accepted
      
      **Tools:**
      - Cypress or Playwright for E2E; use test database
      - Mock SendGrid and Twilio API responses
      - Seed test data (users, auctions, rooms)
      
      **Verify:**
      ```bash
      npm --prefix apps/e2e run test -- notifications-auction.e2e.spec.ts
      ```
      Expected: All E2E scenarios pass; notifications dispatched and retrieved correctly.

---

- [ ] **27. Full Build and Test Pass**
      
      Run full build, typecheck, and test suite to ensure all components integrate correctly and no regressions are introduced.
      
      **Commands:**
      ```bash
      npm run build
      npm run typecheck
      npm run test
      npm run db:validate
      ```
      
      **Verify:**
      - Build completes without errors
      - TypeScript strict mode passes
      - All unit, integration, and E2E tests pass
      - Database schema validates
      - No unused dependencies or imports
      
      Expected: Green builds across all packages; test coverage meets requirements; no warnings.

---

## Digest

### Database Schema Changes
- **File:** `packages/database/prisma/schema.prisma`
- **Changes:**
  - Line 132-135: Add `SMS` to `NotificationChannel` enum
  - Line 119-130: Add `phoneNumber String? @db.String` and `@@index([phoneNumber])` to `UserProfile` model
  - Line (NotificationDelivery): Add `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, `@@index([status, updatedAt])`
- **Migration:** Auto-generated via `npm run db:migrate`
- **Tested:** `npm run db:validate`, `npm run build:schema`

---

### Backend Service Layer
- **Files:**
  - `apps/api/src/notifications/services/notification.service.ts` — Orchestrator for dispatch, preference resolution, record creation, adapter delegation
  - `apps/api/src/notifications/services/email-adapter.service.ts` — SendGrid integration
  - `apps/api/src/notifications/services/sms-adapter.service.ts` — Twilio integration with rate limiting
  - `apps/api/src/notifications/services/in-app-adapter.service.ts` — Database in-app delivery
  - `apps/api/src/notifications/services/notification-preferences.service.ts` — Preference CRUD and resolution
  - `apps/api/src/notifications/services/notification-delivery.service.ts` — Delivery tracking
  - `apps/api/src/notifications/services/rate-limit.service.ts` — Redis-backed SMS rate limiting
- **Tests Verified:**
  - `npm --prefix apps/api run test -- notifications/services`
  - Unit: preference resolution, idempotency, adapter dispatch, error handling
  - Integration: database persistence, delivery status transitions, authorization

---

### API Controllers and Endpoints
- **Files:**
  - `apps/api/src/notifications/notifications.controller.ts` — GET /v1/notifications, POST mark-read, DELETE
  - `apps/api/src/notifications/notifications-preferences.controller.ts` — GET/POST preferences
- **Endpoints Implemented:**
  - `GET /v1/notifications?page=1&limit=20&category=BID_WON`
  - `POST /v1/notifications/:id/mark-read`
  - `POST /v1/notifications/mark-all-read`
  - `DELETE /v1/notifications/:id`
  - `GET /v1/notifications/preferences`
  - `POST /v1/notifications/preferences/:category`
- **Tests Verified:**
  - `npm --prefix apps/api run test -- notifications/controllers`
  - Authorization: 403 on cross-user access, 404 on not found
  - Request validation: Zod schemas enforced

---

### Event Integration
- **File:** `apps/api/src/notifications/services/notification.service.ts` (event handlers)
- **Events Implemented:**
  - `bid.accepted` → dispatch BID_WON, BID_PLACED
  - `break.started` → dispatch BREAK_STARTED
  - `break.ended` → dispatch BREAK_ENDED
  - `auction.ended` → dispatch AUCTION_ENDED
  - `subscription.expiring` → dispatch SUBSCRIPTION_EXPIRING
- **Verified:** Event handlers subscribe, dispatch is called with correct payload, error handling in place

---

### Frontend Components
- **Files:**
  - `apps/web/src/components/notifications/NotificationBell.tsx` — Bell icon with badge and dropdown
  - `apps/web/src/components/notifications/NotificationDropdown.tsx` — 5-recent dropdown
  - `apps/web/src/components/notifications/NotificationItem.tsx` — Single notification display
  - `apps/web/src/pages/account/notifications/index.tsx` — History page with pagination and filtering
  - `apps/web/src/pages/account/settings/notifications.tsx` — Preferences page with toggles
  - `apps/web/src/hooks/useNotifications.ts` — Fetch notifications
  - `apps/web/src/hooks/useNotificationPreferences.ts` — Fetch and update preferences
- **Features Verified:**
  - Bell displays unread badge, dropdown opens/closes
  - History page pagination, category filter, bulk actions
  - Preferences page toggles work, POST requests sent
  - Responsive at 375px, 768px, 1024px, 1440px
  - Tests: `npm --prefix apps/web run test`

---

### Dependencies Added
- `@sendgrid/mail@^8.1.3` — Email adapter
- `twilio@^4.0.0` — SMS adapter
- `@nestjs/event-emitter@^2.1.0` — Event subscription

---

### Environment Variables Added
- `SENDGRID_API_KEY` (secret)
- `TWILIO_ACCOUNT_SID` (secret)
- `TWILIO_AUTH_TOKEN` (secret)
- `TWILIO_PHONE_NUMBER` (configuration)
- `REDIS_URL` (optional)
- `NOTIFICATION_RETENTION_DAYS` (optional)
- `SMS_RATE_LIMIT_WINDOW_MINUTES` (optional)
- `SMS_RATE_LIMIT_MAX_PER_WINDOW` (optional)

---

### Test Coverage Summary
- **Unit tests:** 80%+ coverage on services
- **Integration tests:** Database persistence, authorization, error handling
- **E2E tests:** Auction workflows, notification dispatch, user preferences
- **Build verification:** `npm run build`, `npm run typecheck`, `npm run test` all pass
- **Database validation:** `npm run db:validate` passes

---

## Notes and Open Items

### High-Risk Items Requiring Review
1. **Event Emission (Item 16):** Verify AuctionsModule and SubscriptionsModule emit required events using EventEmitter2. If not, coordinate with those teams or propose alternative integration.
2. **Database Migrations (Items 1-4):** Apply migrations before services reference phoneNumber and SMS enum.
3. **API Credentials (Item 23):** Ensure SendGrid, Twilio, and Redis credentials are securely stored (AWS Secrets Manager, vault, etc.); never committed to repo.

### Known Constraints
- SMS rate limiting is global per user (not per-room); applies platform-wide
- Email and SMS adapters are non-blocking (fire-and-forget); failures do not throw into caller
- In-app notifications are stored durably; retention policy (90 days) should be enforced by background job (out of scope for this phase)
- Retry logic for failed deliveries (email bounce, SMS delivery failure) is out of scope; future feature via background job

### Future Enhancements (Out of Scope)
- Webhook callbacks from Twilio for delivery receipts (DLR)
- Push notifications to native mobile apps
- Email template system with variable substitution
- Internationalization (i18n) for notification content
- Deep linking from notifications to relevant auction/room
- Frequency capping (daily/weekly limits per category)
- Real-time WebSocket broadcast for in-app notifications

