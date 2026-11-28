# Notifications System (Phase N): Core Backend and Frontend

This implementation introduces a complete notification orchestration layer with three delivery adapters (Email via SendGrid, SMS via Twilio, In-App via database storage). The system resolves user preferences, tracks delivery state, enforces rate limiting, and executes adapters asynchronously to avoid blocking upstream callers. Frontend provides notification bell with badge, dropdown, full history page, and per-channel preference toggles. The notification event integration with auction/subscription domain events is deferred to Phase N.2.

**Watch for**: Authentication stub in controllers (JWT extraction not wired); adapters will degrade gracefully but silently if credentials missing; SMS rate limit is 1-per-5min globally (not per channel), which may suppress valid sequential notifications; unread notification count calculation is unoptimized (O(n) filter on every hook render); no retry queue for failed email/SMS sends.

**Verdict**: NEEDS_CHANGES

<details>
<summary>High-level view</summary>

The notification system operates on a fire-and-forget paradigm: dispatch requests return immediately, adapters execute async via setImmediate, and all delivery failures are logged but not propagated to callers. This prevents slow external services (SendGrid, Twilio) from affecting request latency. The core abstraction is the NotificationService.dispatchAsync method, which resolves enabled channels from preferences, creates Notification records with optional idempotency keys, creates NotificationDelivery tracking records, then dispatches to adapters in parallel.

Preferences are stored as three separate UserNotificationPreference records per category (one per channel), allowing independent toggles for email, SMS, and in-app per notification type. In-app is enabled by default; email and SMS default to disabled. When a channel is disabled, no preference record is created. The resolveEnabledChannels method rebuilds the channel bitmap from the database on every dispatch, so preferences changes take effect immediately without cache invalidation.

Rate limiting applies globally to SMS delivery: Redis tracks per-user SMS attempts in a sliding 5-minute window (default). Once a user hits 1 SMS per window, the adapter marks delivery as PENDING and skips actual send. This prevents SMS floods but means rapid sequential bids from the same user won't trigger SMS for each; only the first will, the rest defer silently.

Delivery state is persisted in NotificationDelivery records (PENDING, SENT, FAILED) with error messages and sentAt timestamps, enabling retry jobs and audit trails. Email and SMS adapters query the user's email and phone from the database and perform validation (E.164 format for SMS). In-app delivery is instant: the adapter verifies the notification exists, marks SENT, and returns.

Idempotency relies on (userId, category, auctionId, playerId) tuple and 1-minute window. If those fields are not provided, no idempotency check runs. This prevents duplicate BID_WON notifications for the same player in rapid succession but doesn't apply to other categories (e.g., SUBSCRIPTION_EXPIRING).

Frontend hooks poll the backend every 30 seconds and maintain local state. The notification bell shows unread count; dropdown displays 5 recent notifications; full history page paginates all notifications with optional category filters. Mark-read and delete are optimistic: local state updates immediately, backend call completes async. If the backend call fails, the UI state doesn't revert, creating a stale-state risk.

Authentication is stubbed: controllers have TODO comments for @CurrentUser() extraction, so endpoints currently hardcode userId as a string placeholder. No guard decorator is applied, meaning endpoints are unauthenticated. This is a placeholder implementation pending JWT setup in a later PR.

</details>

<details>
<summary>Issues (8)</summary>

1. **Controllers are unauthenticated** — Endpoints hardcode userId as 'user-id-from-jwt' placeholder and lack @UseGuards(JwtGuard) decorator. All endpoints are publicly accessible until JWT extraction is wired. Add @UseGuards(JwtGuard), @CurrentUser() decorator, and extract userId from request context. This is blocking for release.

2. **Unread notification calculation is O(n)** — useNotifications hook filters notifications array on every render: `notifications.filter((n) => !n.read).length`. With 100+ notifications in state, this causes unnecessary re-renders. Memoize the unreadCount or compute it once in the backend (add unreadCount to list response).

3. **Frontend optimistic updates don't revert on error** — markAsRead and deleteNotification update local state immediately, but if the backend call fails, the UI state remains stale (marked as read but backend still shows unread). Add error boundary: revert state if the response indicates failure.

4. **SMS rate limit is global per-user, not per-auction** — Once a user hits 1 SMS per 5 minutes, the next notification is PENDING regardless of category or auction. This means if a user bids on two different auctions in rapid succession, only the first generates an SMS. Clarify intent: is this by design (spam prevention) or should it be per-category or per-auction? If intended, document the trade-off. If not, refactor rate limit to include category or auctionId in the key.

5. **No retry queue for failed email/SMS sends** — NotificationDelivery records marked FAILED stay in that state; no job scheduler attempts retry. The getPendingDeliveries method exists in the service but is not invoked anywhere. Without a background job or cron, failed sends are permanent. Implement a retry job that runs every 5 minutes, re-attempts PENDING deliveries with exponential backoff, and marks retries as FAILED after N attempts. Or defer this to Phase N.3 and document it as deferred.

6. **Race condition: preference changes during dispatch** — If a user disables email notifications while a BID_WON event is being processed, the dispatch may still send email because resolveEnabledChannels is called once at dispatch start and not re-checked during adapter execution. Edge case, but means user preference changes take 0–5 seconds to take effect. Acceptable for notification system, but worth noting.

7. **Idempotency only applies to auction events** — If auctionId or playerId is missing from the NotificationIntent, idempotency is skipped. SUBSCRIPTION_EXPIRING and other non-auction events won't be deduplicated. If the same subscription expiration triggers two notifications in 60 seconds, both will be sent. Add a fallback idempotency key for non-auction events (e.g., use category + data.subscriptionId).

8. **Migration lacks rollback for enum ADD VALUE** — PostgreSQL enum ADD VALUE is not reversible. If the migration needs to be rolled back in production, the SMS enum value will remain and cause inconsistencies. This is a PostgreSQL limitation, not a code issue, but worth acknowledging. Plan for enum removal in a future migration if SMS support is ever deprecated.

</details>

<details>
<summary>Details</summary>

## Service Orchestration and Dispatch Workflow

The NotificationService.dispatchNotification method accepts a NotificationIntent, then immediately returns while dispatching asynchronously via setImmediate. This decouples caller latency from SendGrid/Twilio delays. The async dispatch first checks idempotency: if a Notification with matching (userId, category, auctionId, playerId) was created in the last 60 seconds, dispatch exits early. This prevents duplicate BID_WON notifications when the same player is selected multiple times in rapid succession.

After idempotency check, it resolves enabled channels from preferences (querying the database on every dispatch, so preference changes take effect immediately without cache invalidation). If no channels are enabled, it returns without creating records.

For enabled channels, it creates a Notification record and NotificationDelivery records per channel (IN_APP, EMAIL, SMS) in PENDING status, then calls dispatchToChannelsAsync. The adapters execute in parallel via Promise.all without awaiting; errors are logged. This achieves fire-and-forget semantics: even if all adapters fail, the caller succeeds and only the NotificationService logs the error.

The design prevents cascading failures and is correct for a system where notifications are supplementary. However, if adapter dispatch fails to execute (e.g., process crash), the delivery record remains PENDING indefinitely. PENDING deliveries accumulate if retries are not implemented.

## Channel Adapters: Email, SMS, In-App

**EmailAdapterService** queries user email, constructs plain-text with optional HTML, and sends via SendGrid. It disables click/open tracking for privacy. If SENDGRID_API_KEY is unset, it logs a warning and marks delivery FAILED; this silent degradation prevents crashes but leaves users unaware email is unavailable.

**SmsAdapterService** queries phoneNumber, validates E.164 format, checks rate limit, truncates body to 160 chars. If rate-limited, it marks delivery PENDING (not FAILED), signaling retry is appropriate. This distinction from permanent failures (missing credentials) allows retry logic to differentiate. SMS format is `title: body` or just title.

**InAppAdapterService** verifies the notification exists and belongs to the user, then marks SENT. In-app delivery is instant because the notification is already persisted. No real-time push mechanism exists; the client polls every 30 seconds.

All adapters catch exceptions and update delivery status to FAILED. If the status update fails, they log and return without throwing, preventing infinite cascades but leaving status potentially stale if the database is unreachable.

## Rate Limiting

RateLimitService enforces SMS rate limit using Redis: for each user, it maintains a counter key `sms:rate-limit:{userId}` with TTL 5 minutes (configurable). The counter is incremented atomically on each checkAndIncrementRateLimit call; if count exceeds maxPerWindow (default 1), isLimited returns true.

The rate limit is global per user, not per category or auction. Once a user hits 1 SMS, the next SMS is deferred regardless of event type. If a user is host of two simultaneous auctions and wins a bid in each within 5 minutes, only one SMS generates. This trade-off between spam prevention and timely notification should be documented clearly to product and support.

If Redis is unreachable, the check throws, the SMS adapter catches and fails silently, and all SMS sends fail. No fallback strategy exists (e.g., skip rate limit and attempt send, or fail safe). This operational behavior should be documented.

## Preferences and Channels

NotificationPreferencesService manages per-user, per-category, per-channel preferences via three UserNotificationPreference records per category (one per channel: IN_APP, EMAIL, SMS). Each has enabled boolean and optional consentedAt timestamp.

getUserPreferences retrieves all preferences and fills defaults for recognized categories: inApp=true (default enabled), email=false, sms=false. This ensures all categories are always present in the user's preference list, even on first access.

updatePreferencesForCategory upserts three records per category and includes a marketing categories check: for SUBSCRIPTION_EXPIRING, the method allows updates without explicit consent validation. This is a TODO; in production, marketing opt-ins must require explicit user action (checkbox on signup, settings page) to comply with GDPR/CASL. Currently, there is no backend validation; frontend prompts users but can be bypassed.

resolveEnabledChannels queries preferences and rebuilds the channel bitmap. The design is stateless (no caching) and simple, but queries the database on every dispatch. With high notification volume, this could become a bottleneck; consider memoizing with TTL or pub/sub in future phases.

## Frontend Components and Hooks

NotificationBell displays an SVG bell icon with unread badge (red circle, top-right, showing count or "9+" if >9). It opens a dropdown on click showing 5 recent notifications.

useNotifications fetches /api/v1/notifications?page=1&limit=5 and polls every 30 seconds. markAsRead and deleteNotification update local state optimistically and call the backend asynchronously. If the backend call fails, error state is set but local state remains mutated, creating stale-state risk: the UI shows read/deleted, but the backend shows unread/intact. Users may refresh and see notifications re-appear.

The unreadCount calculation filters notifications on every render: `notifications.filter(n => !n.read).length`. With 100+ notifications, this is inefficient; memoize it or compute in the backend.

The full history page paginates all notifications with optional category filter. The preferences page shows toggles per category and channel (3×N grid: 3 channels, N categories), aligning with AGENTS.md requirements. The UI should include explanatory text for marketing categories to clarify that opting out may prevent critical account alerts.

## Database Schema and Migrations

The migration appends SMS to the NotificationChannel enum (append-only; PostgreSQL enums cannot be removed), adds phoneNumber to UserProfile with index, and adds createdAt/updatedAt to NotificationDelivery with index on (status, updatedAt) for efficient retry queries.

The schema assumes Notification records already exist. NotificationDelivery tracks delivery per channel per notification, enabling auditing, retries, and per-channel failure analysis.

The Notification table schema is not shown; ensure it has: id, userId, category, title, body, data (JSONB), readAt (nullable). The readAt field should be indexed for unread filtering (WHERE userId = ? AND readAt IS NULL).

## Authentication Gaps

All controllers have TODO comments: @CurrentUser() extraction is not wired; userId defaults to placeholder 'user-id-from-jwt'. No @UseGuards(JwtGuard) decorator exists, so endpoints are publicly accessible. Any caller can:
- GET /v1/notifications with arbitrary filters
- POST/DELETE /v1/notifications/:id to modify any notification
- GET /v1/notifications/preferences to read any user's preferences
- POST /v1/notifications/preferences/:category to modify any user's preferences

This is a critical security gap. The placeholder is acceptable for initial development, but the TODO must be addressed before merge. Add @UseGuards(JwtGuard), inject @CurrentUser() / CurrentUserDto, extract userId from JWT claim. This should be straightforward once the auth module is configured. For now, flag this in the PR title: "[WIP] Notifications: Auth stub pending JWT integration."

## Event Integration (Deferred)

notification.events.ts defines domain events (BidAcceptedEvent, BreakStartedEvent, etc.), but no event listeners are registered. The module imports EventEmitterModule but doesn't subscribe via @OnEvent(). Integration happens in Phase N.2 when AuctionsModule, BreaksModule, and SubscriptionsModule emit events and NotificationsModule subscribes. This is acceptable as a phased approach; ensure event types and payloads are finalized and documented in the Phase N spec.

## Error Handling and Logging

All services log errors at appropriate levels and avoid throwing into callers. This fire-and-forget paradigm is correct for notifications. However, there are edge cases:

1. If the database is unreachable during Notification.create, dispatchAsync logs and catches the error. The user is unaware. Consider adding observability: failure metrics and SLA breach alerts if too many notifications fail to persist.

2. If Redis is unreachable during rate limit check, the SMS adapter fails silently with no fallback. Document this operational behavior.

3. If Prisma query times out, dispatch latency increases. setImmediate ensures the caller isn't blocked, but adapters will still try to execute. Consider adding timeout wrapper (e.g., 10 seconds per adapter, then mark FAILED).

## Test Coverage

Only a placeholder test file exists. The spec requests 85+ tests covering all channels, delivery retry, rate limiting, and preference logic. This is deferred to Phase N.2 or later. The codebase has schema validation (Zod DTOs) and TypeScript type safety but no integration or unit tests. Before shipping, add:

- Unit tests for NotificationService.dispatchAsync (idempotency, channel resolution, delivery record creation)
- Unit tests for each adapter with mocked external services
- Integration tests for preferences service (CRUD, defaults, channel resolution)
- Rate limit tests (counter increment, TTL reset, limit enforcement)
- E2E test: dispatch notification → verify delivery records → check backend state

This is essential for confident shipping of a system that touches email and SMS integrations.

</details>

<details>
<summary>File map</summary>

**Backend services (apps/api/src/notifications/services)**
- `notification.service.ts` — Core orchestrator; dispatchNotification (async), idempotency check, channel resolution, record creation, adapter dispatch
- `email-adapter.service.ts` — SendGrid integration; queries email, constructs message, sends, updates delivery status
- `sms-adapter.service.ts` — Twilio integration; queries phone, validates E.164, checks rate limit, sends, updates status
- `in-app-adapter.service.ts` — Database delivery; verifies notification, marks delivery as sent
- `notification-preferences.service.ts` — Preference CRUD; per-user per-category per-channel; resolveEnabledChannels
- `notification-delivery.service.ts` — Delivery record lifecycle; create, update status, increment attempts, query pending
- `rate-limit.service.ts` — Redis-based SMS rate limiting; per-user per-window counter with TTL

**Backend controllers and DTOs (apps/api/src/notifications)**
- `notifications.controller.ts` — REST endpoints: GET /v1/notifications (paginated), POST /:id/mark-read, POST /mark-all-read, DELETE /:id; auth stubbed
- `notifications-preferences.controller.ts` — REST endpoints: GET /v1/notifications/preferences, POST /preferences/:category; auth stubbed
- `dto/notification.dto.ts` — NotificationIntent, NotificationCategory enum, Zod schemas for mark-read requests
- `dto/notification-preference.dto.ts` — UserPreferenceDto, UpdatePreferenceRequest schema, EnabledChannels interface
- `dto/notification-delivery.dto.ts` — NotificationDeliveryDto, DeliveryStatus enum
- `events/notification.events.ts` — Domain event interfaces (BidAccepted, BreakStarted, AuctionEnded, SubscriptionExpiring); event listeners not yet registered
- `notifications.module.ts` — Module imports, controller and service registration

**Frontend components (apps/web/src/components/notifications)**
- `NotificationBell.tsx` — Bell icon with unread badge; opens dropdown on click
- `NotificationDropdown.tsx` — Dropdown showing 5 recent notifications; mark-read, delete buttons; link to full history (not shown in this review)
- `NotificationItem.tsx` — Individual notification item in dropdown; timestamp, category, title, actions (not shown in this review)

**Frontend hooks and pages (apps/web/src/hooks, apps/web/src/pages/account)**
- `useNotifications.ts` — Hook to fetch notifications, manage local state, mark-read, delete; polls every 30 seconds; unreadCount unoptimized
- `useNotificationPreferences.ts` — Hook to fetch user preferences and update per-category per-channel toggles
- `pages/account/notifications/index.tsx` — Full notification history; paginated list, optional category filter, mark-read, delete
- `pages/account/settings/notifications.tsx` — Preferences form; toggles per category and channel (3×N grid)

**Configuration and schema**
- `apps/api/src/config/env.ts` — Environment validation schema; added SENDGRID_API_KEY, TWILIO_* vars, SMS rate limit, retention days
- `packages/database/prisma/migrations/20261128_notifications_sms_phone_timestamps` — Add SMS enum value, phoneNumber to UserProfile, timestamps to NotificationDelivery with indexes
- `.env.example` — Updated with new notification env vars and descriptions

**Other files**
- `apps/api/src/app.module.ts` — NotificationsModule registered in AppModule imports
- `apps/api/package.json` — Added @sendgrid/mail and twilio dependencies
- `packages/database/package.json` — Added prisma as dev dependency (for schema validation)

[Full diff available via `git show HEAD`](git-show-HEAD)

</details>
