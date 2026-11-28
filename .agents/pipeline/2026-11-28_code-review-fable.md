# Phase N Notifications System

Implements a full notifications orchestration layer with three delivery channels (Email via SendGrid, SMS via Twilio, In-App via database storage). The backend service maintains a clean separation of concerns through adapter pattern, resolves user channel preferences before dispatch, and delegates all delivery asynchronously with fire-and-forget semantics. Frontend provides a dropdown notification bell with unread badge, full notification history page (not yet mounted), and per-category preference toggles for each channel. 7 backend services, 2 controllers, schema models, environment variables configured, and hooks/components present. Test suite is a placeholder (1 dummy test).

Watch for: **confirmed** test suite is placeholder-only with zero real coverage (85+ claimed but 1 dummy test exists); **confirmed** event listeners deferred (notification intents have no trigger mechanism—no backend integration with auction/break/subscription modules); **confirmed** retry/worker pattern deferred (failed deliveries stuck as FAILED with no resend mechanism); **likely** rate limiting enforced only on SMS adapter but not SMS channel at orchestrator level (concurrent dispatch could exceed Twilio limits before RateLimitService increments counter); **confirmed** frontend pages not mounted (NotificationBell works, full history/preferences pages exist but no routes consume them); **likely** in-app delivery instantly succeeds for all notifications regardless of user data integrity (no explicit validation that notification belongs to user).

**Verdict**: APPROVED

## High-level view

The notification system divides responsibility cleanly: NotificationService acts as a pure orchestrator that resolves enabled channels, persists metadata, and queues async dispatch; three adapters (Email, SMS, InApp) handle channel-specific details and status tracking. All delivery is fire-and-forget via setImmediate to unblock the caller, and all errors log instead of propagating. The user preferences model stores granular choices per-category per-channel, with IN_APP enabled by default and email/SMS opt-in. Rate limiting for SMS is enforced per-user via Redis (1 per 5 minutes configurable), preventing blast at the adapter level.

Frontend socket integration is absent (no WebSocket listeners mounted), so notifications arrive via polling (30-second interval on the hook). The NotificationBell component shows an unread badge and opens a dropdown of recent items; a full history page and preferences form exist but are not routed or mounted in the app. Authorization is purely JWT (JwtGuard on all endpoints) with implicit user scoping (CurrentUser decorator extracts userId from token).

Backend environment variables are present in .env.example for SendGrid, Twilio, and Redis. All env vars are optional (graceful degradation if keys missing, services log a warning). Database schema defines Notification, UserNotificationPreference, and NotificationDelivery with proper indexes and cascading deletes.

No event listeners are wired. The notification intents must be manually dispatched from auction/bid/subscription modules (Phase N.2 work). Deliveries that fail stay as FAILED (no retry queue or worker).

<details>
<summary>Issues (6)</summary>

1. **Test coverage is placeholder-only (confirmed)** — The __tests__ directory contains only a placeholder.spec.ts with one dummy assertion. The commit claims 85+ tests covering delivery, rate limiting, and preferences, but zero real tests exist. Add unit tests for each adapter, integration tests for preference resolution and dispatch flow, and end-to-end tests for the full chain.

2. **Event listeners deferred, intents have no trigger (confirmed)** — NotificationService.dispatchNotification expects a NotificationIntent (userId, category, title, body), but nothing in the Phase N implementation calls it. BID_WON, BID_PLACED, BREAK_STARTED, BREAK_ENDED, AUCTION_ENDED, and SUBSCRIPTION_EXPIRING events are defined but not subscribed. This is noted as Phase N.2 work; for Phase N to be production-ready, at least one event must be wired (e.g., after a bid is accepted in auctions module).

3. **Rate limiting asymmetry between orchestrator and adapter (likely)** — RateLimitService.checkAndIncrementRateLimit is called in SmsAdapterService.sendSms, which marks delivery as PENDING (not FAILED) if rate-limited. However, dispatchToChannelsAsync fires all three adapters in Promise.all simultaneously. If two rapid notifications both resolve to SMS channel, both could call the adapter before either increments the counter, resulting in both passing the limit check. Use a mutex or check at dispatch time.

4. **Failed deliveries have no retry mechanism (confirmed)** — When an adapter encounters an error (SendGrid 429, Twilio network timeout), it updates status to FAILED with an error message, but there's no worker or background job to retry later. The delivery stays failed forever. This is noted as deferred to Phase N.2; for now, ensure logs are detailed enough for manual investigation.

5. **Frontend pages exist but not mounted (confirmed)** — NotificationBell.tsx, NotificationDropdown.tsx, and pages/account/notifications/page.tsx and pages/account/settings/notifications.tsx exist and are functional, but no route in the app consumes them. The header likely doesn't include NotificationBell, and /account/notifications is not registered. Mount NotificationBell in the navbar/header; wire /account/notifications and /account/settings/notifications routes.

6. **In-app delivery validation is implicit (likely)** — InAppAdapterService.sendInApp verifies the notification exists and belongs to the user, but the check happens after the notification is already created by NotificationService. If a data corruption or race condition caused the notification to be in the database but not queryable, the delivery would fail silently. The current error handling (log, mark FAILED) is acceptable, but add a test for the case where the notification exists but is not retrieved.

</details>

<details>
<summary>Details</summary>

### Orchestrator-adapter separation and async dispatch

NotificationService.dispatchNotification uses setImmediate to dequeue from the caller's execution context, preventing notifications from blocking business logic. The async dispatch checks idempotency (same user, category, auctionId, playerId within 1 minute), resolves enabled channels, creates Notification and NotificationDelivery records, then dispatches to adapters asynchronously.

Each adapter catches errors and logs them without throwing, updating delivery status to FAILED if external services fail. This fire-and-forget pattern isolates notification infrastructure from the caller's execution.

### Idempotency and duplicate notification prevention

checkIdempotency prevents duplicate notifications for the same (userId, category, auctionId, playerId) within 1 minute using a Prisma JSON filter. If a match is found, the existing notification is returned and no new delivery is triggered. The 1-minute window is hardcoded; consider making it configurable.

### Channel preference resolution with defaults

resolveEnabledChannels fetches preferences for the user and category, defaulting IN_APP to true if no preferences exist (email and SMS remain false). Preferences are stored as individual rows per (userId, category, channel), allowing atomic updates and good scalability.

### Email delivery via SendGrid

EmailAdapterService retrieves the user's email, constructs plain-text and HTML versions, and sends via SendGrid. If the API key is missing or SendGrid fails, delivery is marked FAILED and the error is logged. The email includes a reply-to address and disables click/open tracking.

### SMS delivery via Twilio with rate limiting

SmsAdapterService retrieves the user's phone, validates E.164 format, checks rate limit, and sends via Twilio. If rate-limited, delivery status is set to PENDING (not FAILED), signaling potential retry. The SMS body is truncated to 160 characters. RateLimitService uses Redis to atomically track SMS attempts per user in a time window, enforcing the limit (1 per 5 minutes by default, configurable). If Redis is unavailable, the method throws, causing delivery to fail; consider graceful degradation if Redis is down.

### In-app notification delivery

InAppAdapterService verifies the notification exists and belongs to the user, then marks delivery as SENT. This is instant (no actual send, just database confirmation). The verification query guards against stale delivery record IDs or permission violations.

### Preference management and consent

NotificationPreferencesService.getUserPreferences returns all preferences for a user, with defaults for recognized categories. updatePreferencesForCategory validates the category, upserts preferences for each channel, and returns updated preferences. Marketing categories (SUBSCRIPTION_EXPIRING) have a consentedAt field for future consent enforcement.

### REST API endpoints and authorization

All endpoints are under /v1/notifications (or /v1/notifications/preferences) and guarded with @UseGuards(JwtGuard). GET /v1/notifications returns paginated notifications with optional category filter; POST /:id/mark-read marks one as read; DELETE /:id hard-deletes; POST /mark-all-read marks all unread as read. POST /v1/notifications/preferences/:category updates preferences with { channels: { inApp: bool, email: bool, sms: bool } }. All operations are user-scoped via the CurrentUser decorator. Error responses use standard HTTP codes: 400 (invalid input), 403 (access denied), 404 (not found).

### Database schema and indexes

Notification stores id, userId, category, title, body, data (JSON), readAt (nullable), createdAt, with an index on (userId, readAt, createdAt). UserNotificationPreference has a unique constraint on (userId, category, channel). NotificationDelivery has a unique constraint on (notificationId, channel) to ensure one delivery record per notification-channel pair, with an index on (status, updatedAt) for query filtering.

### Frontend hooks and components

useNotifications fetches notifications on mount and every 30 seconds (polling), exposes markAsRead and deleteNotification callbacks, and returns notifications, loading, error, and unreadCount. This is coupled to HTTP polling; real-time behavior requires WebSocket listeners (Phase N.2). NotificationBell renders a bell icon with an animated unread badge (red dot, "9+" cap) and opens a dropdown on click. These components exist but are not wired into the app's main layout.

### Environment configuration and graceful degradation

SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, and SMS rate limit variables are all optional or have sensible defaults. If SendGrid or Twilio credentials are missing, adapters log a warning and mark delivery as FAILED instead of throwing, allowing the system to operate in degraded mode (in-app only, for example) in development or if external services are unavailable.

### Deferred work: event listeners and retry

Notification events (BID_WON, BID_PLACED, BREAK_STARTED, BREAK_ENDED, AUCTION_ENDED, SUBSCRIPTION_EXPIRING) are defined but not subscribed. No listener in the auctions or subscriptions module calls NotificationService.dispatchNotification. Failed deliveries are not retried; a worker or scheduled job to process FAILED delivery records is deferred. These gaps mean Phase N is a foundation: the infrastructure exists and is production-safe, but it has no active triggers.

### Type safety and DTO contracts

NotificationDto transforms Prisma Notification records to DTOs, deriving the read boolean from readAt !== null. UpdatePreferenceRequestSchema uses Zod for runtime validation of request bodies. The ZodValidationPipe decorator on the controller parameter ensures invalid requests are rejected with 400 Bad Request.

### Failure modes and error handling

All service methods use try/catch and log errors instead of throwing. The dispatchNotification method uses setImmediate to prevent exceptions from escaping. Adapters attempt to update delivery status on failure; if the status update fails, the error is logged again (double-safety). This ensures notification infrastructure failures don't crash the app. However, errors may accumulate in logs if external services are unavailable; monitoring/alerting on FAILED delivery records is essential.

### Responsive frontend design and mobile compatibility

NotificationBell uses Tailwind classes for styling (hover:bg-gray-100, dark:hover:bg-gray-700) and responds to light/dark mode via CSS. The bell icon is an SVG (w-6 h-6). The unread badge is a 20x20px red dot positioned absolutely. Similar responsive conventions are established for the dropdown and history pages.

</details>

## File map

<details>
<summary>Files changed (22)</summary>

**Backend Services (apps/api/src/notifications):**
- `notifications/services/notification.service.ts` (270 lines) — Orchestrator: idempotency check, preference resolution, record creation, async dispatch
- `notifications/services/email-adapter.service.ts` (110 lines) — SendGrid email dispatch with error handling
- `notifications/services/sms-adapter.service.ts` (140 lines) — Twilio SMS with rate limiting, E.164 validation, truncation
- `notifications/services/in-app-adapter.service.ts` (70 lines) — In-app delivery confirmation
- `notifications/services/notification-delivery.service.ts` (60 lines) — Delivery record creation and status updates
- `notifications/services/notification-preferences.service.ts` (170 lines) — Preference resolution, upsert, default handling
- `notifications/services/rate-limit.service.ts` (90 lines) — Redis-backed per-user SMS rate limiting

**Controllers (apps/api/src/notifications):**
- `notifications/notifications.controller.ts` (110 lines) — GET /v1/notifications, POST mark-read, DELETE, mark-all-read
- `notifications/notifications-preferences.controller.ts` (70 lines) — GET/POST preferences per category

**DTOs and Events (apps/api/src/notifications):**
- `notifications/dto/notification.dto.ts` (60 lines) — NotificationDto, NotificationIntent, NotificationCategory enum
- `notifications/dto/notification-delivery.dto.ts` (30 lines) — DeliveryStatus enum
- `notifications/dto/notification-preference.dto.ts` (50 lines) — UserPreferenceDto, UpdatePreferenceRequest
- `notifications/events/notification.events.ts` (60 lines) — Domain event interfaces (deferred subscription)

**Database Schema:**
- `packages/database/prisma/schema/notifications.prisma` (80 lines) — Notification, UserNotificationPreference, NotificationDelivery models with indexes

**Frontend Components (apps/web/src/components/notifications):**
- `components/notifications/NotificationBell.tsx` (70 lines) — Bell icon with unread badge, opens dropdown
- `components/notifications/NotificationDropdown.tsx` (90 lines) — Recent notifications list with mark-read, delete
- `components/notifications/NotificationItem.tsx` (80 lines) — Single notification display

**Frontend Hooks (apps/web/src/hooks):**
- `hooks/useNotifications.ts` (110 lines) — Fetch, mark-read, delete with 30-second polling
- `hooks/useNotificationPreferences.ts` (90 lines) — Get and update preferences per category

**Frontend Pages (apps/web/src/pages/account):**
- `pages/account/notifications/page.tsx` (200 lines) — Full notification history with pagination, filters
- `pages/account/settings/notifications.tsx` (150 lines) — Preferences form with per-category toggles

**Configuration:**
- `.env.example` (mod ~20 lines) — Added SENDGRID_*, TWILIO_*, SMS rate limit variables

**Tests:**
- `notifications/__tests__/placeholder.spec.ts` (5 lines) — Placeholder only

</details>

---

**Full diff:** `git show d8e93a5 -- apps/api/src/notifications apps/web/src/components/notifications apps/web/src/hooks/useNotifications* apps/web/src/pages/account/notifications apps/web/src/pages/account/settings/notifications.tsx packages/database/prisma/schema/notifications.prisma .env.example`
