# Email, SMS, and in-app notification orchestration

Phase N adds a central orchestrator, per-category preferences, persisted delivery records, SendGrid and Twilio adapters, authenticated REST endpoints, and notification account UI. The follow-up added `JwtGuard` and switched the adapters to the API's Prisma service, closing two earlier integration gaps. The feature still has no production trigger path (**confirmed**), its Prisma changes are excluded from schema composition (**confirmed**), and guarded requests still pass the wrong identity into UUID-scoped queries (**confirmed**). Delivery retry, complete history, accessible mobile behavior, and the claimed test coverage also remain absent (**confirmed**).

Watch for: missing domain-event integration (**confirmed**); generated-schema and migration drift (**confirmed**); unusable caller identity and browser authentication contracts (**confirmed**); non-durable delivery with no retry worker (**confirmed**); and a placeholder test suite with API typecheck failures (**confirmed**).

**Verdict**: NEEDS_CHANGES

## High-level view

The service boundary separates preference resolution, a notification envelope, per-channel delivery rows, and three adapters. No auction, break, auction-conclusion, or subscription-expiry producer emits an event or calls `dispatchNotification`, so none of the requested notification types can be produced in normal operation (**confirmed**).

The new `notifications.prisma` duplicates notification models already owned by the identity and support domains, but `build-schema.mjs` does not include it. The generated schema therefore lacks the new SMS, phone, preference-timestamp, and retry-timestamp contract while the migration implements only part of that contract (**confirmed**).

The controllers now use `JwtGuard`, but `@CurrentUser('sub')` returns the entire JWT payload, and a Cognito subject would still need mapping to the internal `User.id` (**confirmed**). The browser hooks call relative `/api/v1` URLs with cookies, while the API accepts bearer tokens and Next has no proxy for those routes (**confirmed**).

All notification persistence starts in `setImmediate`; no worker consumes pending deliveries, attempts are never incremented, and transient provider failures are terminal (**confirmed**). Preferences also do not control feed visibility: an email-only notification still appears in in-app history after the user disables in-app delivery (**confirmed**).

The history filters only the first 20 fetched records, the badge counts only the latest five, the Pages Router screens do not inherit the App Router shell, and interactive rows and switches lack keyboard semantics (**confirmed**).

Provider secrets come from server environment variables. Dynamic email content is inserted into HTML without escaping (**likely** when text contains user-managed names), recipient email addresses and phone numbers are logged (**confirmed**), and Twilio falls back to a dummy sender when no sender is configured (**confirmed**).

<details>
<summary>Issues (12)</summary>

1. **Domain triggers are absent** (**confirmed**) — no requested auction, break, conclusion, or subscription event invokes `NotificationService`. Emit post-commit events, resolve recipients from authoritative state, and add a scheduled subscription-expiry producer.
2. **Prisma composition and migration drift** (**confirmed**) — the generator ignores the duplicate Phase N schema, while the migration implements only SMS, phone, and delivery timestamps. Update the existing identity/support sources, create a matching migration, regenerate the client, and validate the actual pre-migration path.
3. **Authenticated identity is still invalid** (**confirmed**) — `@CurrentUser('sub')` returns a JWT object, and Cognito `sub` is not the internal user UUID. Resolve `User.id` through `UserIdentity` before every notification or preference query.
4. **Browser route and auth contracts do not match Nest** (**confirmed**) — hooks send cookies to an unproxied relative path, the guard expects a bearer token, and URI versioning prefixes controllers that already contain `v1`. Declare one route version and use the shared authenticated API client or a documented proxy.
5. **Preference semantics are inconsistent** (**confirmed**) — disabling in-app does not remove a notification from the feed, omitted update fields reset other channels, writes can partially apply, and consent timestamps are manufactured without validated evidence. Preserve omitted values, write atomically, and make feed visibility and consent follow the stored choice.
6. **Delivery is neither durable nor retried** (**confirmed**) — persistence is deferred in-process, pending rows have no consumer, attempts stay zero, and transient failures become terminal. Use a transactional outbox or durable queue with claimed jobs, backoff, and retryable versus terminal states.
7. **Idempotency compares the wrong key** (**confirmed**) — it ignores `playerId`, depends on IDs that may not be in `data`, skips non-player events, and races without a unique constraint. Persist a stable source-event key and enforce uniqueness atomically.
8. **History and unread counts cover only the first slice** (**confirmed**) — the page filters 20 local rows and the badge counts five. Add server-driven pagination/category state and return an authoritative unread count.
9. **Account UI misses shell, mobile, and keyboard behavior** (**confirmed**) — Pages Router screens bypass the App Router shell, while rows, switches, dropdown focus, motion, and fixed columns do not meet the stated accessibility and 375px behavior. Move the routes into the shell and add semantic responsive states and tests.
10. **Provider output leaks PII and does not fail closed** (**confirmed**; HTML injection is **likely**) — logs contain full recipient identifiers, Twilio has a dummy sender fallback, and dynamic email HTML is unescaped. Redact logs, require complete provider configuration, and escape template substitutions.
11. **Test and build claims are unsupported** (**confirmed**) — Phase N has one `expect(true).toBe(true)` backend test, no frontend notification tests, and notification-specific API type errors. Add the promised behavioral suites and require API/web typecheck plus measured coverage in CI.
12. **Phase N is bundled with unrelated phases** (**confirmed**) — payment, squad-export, contract, planning, generated, and temporary files share the commits and branch range. Split or restack the notification change so it can be reviewed, deployed, and reverted independently.

</details>

<details>
<summary>Details</summary>

### Domain event contracts stop at interface declarations

**Confirmed.** `events/notification.events.ts` defines payloads, but the only production occurrence of `dispatchNotification(` is its declaration. There is no `@OnEvent` listener, `EventEmitter2.emit`, or direct call from accepted bids, player settlement, break transitions, auction conclusion, or subscription processing. `EventEmitterModule.forRoot()` registers a bus that has no publishers or subscribers.

Post-commit auction handlers need recipient resolution from authoritative room and team state. Subscription expiry also needs a scheduled producer. Each handler should enqueue a stable intent only after the source transaction commits.

### The composed Prisma schema excludes Phase N

**Confirmed.** `packages/database/prisma/schema/notifications.prisma` redeclares `NotificationChannel`, `Notification`, `UserNotificationPreference`, `DeliveryStatus`, and `NotificationDelivery`, but `build-schema.mjs:15-29` never includes a `notifications` domain. The composed identity schema still has only `IN_APP` and `EMAIL` and no profile phone, while the support schema has no delivery timestamps.

The SQL migration adds SMS, `phoneNumber`, and delivery timestamps, but it does not add the preference timestamps declared in the new file. Adding that file to the generator would instead create duplicate declarations. Update or deliberately relocate the existing identity/support models, create a matching migration, and regenerate the client. Database validation currently passes only because the composed schema omits the Phase N file (**confirmed**).

### Guarded controllers still cannot resolve the owning user

**Confirmed.** Both controllers now apply `JwtGuard`, but their methods use `@CurrentUser('sub') userId: string` while `current-user.decorator.ts:15` always returns `request.user`. Prisma receives a JWT object where the services expect a UUID string.

Returning `sub` alone would still be insufficient. The identity schema uses an internal UUID for `User.id`, and `UsersService.getUserByCognitoSubject` performs the required `UserIdentity` lookup. Resolve that internal ID at the request boundary before list, read, delete, and preference operations.

### Browser hooks bypass route and bearer-token contracts

**Confirmed.** Both hooks call relative `/api/v1/notifications` URLs with `credentials: 'include'`. The shared Axios client holds the token and adds `Authorization: Bearer ...`; `JwtStrategy` accepts only that bearer header, and Next has no matching API route or rewrite.

Nest also enables URI versioning with default version `1`, while these controllers embed `v1` without `VERSION_NEUTRAL` (**confirmed**). Existing manually versioned controllers declare neutrality. Define the version once and route the hooks through the authenticated client or an explicit proxy.

### Preference choices do not control channel behavior

**Confirmed.** The orchestrator creates a `Notification` whenever any channel is enabled, and history selects every envelope by `userId` without requiring an `IN_APP` delivery. Email- or SMS-only notifications therefore remain visible in the bell and history.

The update DTO makes every channel optional, but omitted values become `inApp: true`, `email: false`, and `sms: false`; three sequential upserts can also leave partial state (**confirmed**). Preserve existing omitted values and use a transaction. The `SUBSCRIPTION_EXPIRING` branch performs no consent validation yet sets `consentedAt` for every enabled channel (**confirmed**); record consent only from a defined disclosure and user action.

### Pending delivery rows have no worker or durable handoff

**Confirmed.** `dispatchNotification` defers the idempotency check and all writes through `setImmediate`. A process exit can lose the intent, and notification plus channel rows are not created in one transaction.

`getPendingDeliveries` and `incrementAttempts` have no callers (**confirmed**). Rate-limited SMS stays `PENDING` forever; provider exceptions become `FAILED`, outside the pending query; and attempts remain zero. Use a transactional outbox or durable queue with bounded backoff and explicit retryable states.

### One-minute idempotency merges the wrong events

**Confirmed.** The check runs only when both `auctionId` and `playerId` exist, but compares only user, category, time, and `data.auctionId`. Different players can suppress one another, while break, auction-end, and subscription events skip deduplication.

The top-level IDs are not merged into persisted `data`, and the read-before-create sequence has no unique constraint (**confirmed**). Persist a source-event key and insert under a database uniqueness constraint.

### History and badge represent only the first slice

**Confirmed.** `useNotifications` hardcodes `page=1`, discards pagination metadata, and exposes no page or category input. The account page filters its first 20 rows locally and renders no pagination controls.

The bell derives `unreadCount` from at most five rows (**confirmed**). Older unread records disappear, and its `9+` state is unreachable. Return an authoritative unread total and use server-driven history state.

### Account screens miss shell and accessible mobile behavior

**Confirmed.** The screens live under `src/pages`, while the header, footer, global styles, and `AuthProvider` live in `src/app/layout.tsx`; there is no Pages Router `_app.tsx`. They do not inherit the signed-in shell.

Clickable notification `div`s have no keyboard behavior, switches have no accessible names or checked state, the dropdown does not manage focus, and badge motion ignores reduced-motion settings (**confirmed**). Fixed multi-column layouts also have no 375px alternative. Move the routes into the shell and add semantic controls, focus handling, reduced motion, responsive layouts, and viewport tests.

### Provider output needs encoding and PII-safe logging

**Likely.** Email HTML interpolates `emailBody` without encoding. Notification text is expected to contain player, team, room, or host-managed names, so markup can enter email unless every producer sanitizes it. Escape substitutions or send plain text.

**Confirmed.** Success and invalid-recipient logs include full email addresses or phone numbers. Redact those identifiers. Twilio also defaults the sender to `+1234567890`; require a validated sender whenever credentials are enabled so configuration fails closed (**confirmed**).

### Validation is a placeholder and package checks fail

**Confirmed.** The backend suite contains only `placeholder.spec.ts` with `expect(true).toBe(true)`; the focused run executes one assertion, and no frontend notification test exists. The stated 85+ tests and greater-than-85% coverage are absent.

API typechecking reports notification-specific Prisma delegate/field errors, so the checked-in schema and generated client do not support the implementation (**confirmed**). Web typechecking passes after the worktree added and locked the missing `date-fns` dependency.

### Phase N is bundled with unrelated changes

**Confirmed.** The Phase N commits include payments, squad exports, contracts, subscription changes, generated artifacts, planning documents, and temporary review output. The branch range also contains earlier Phase J, K, and L work. Split or restack the feature around its own migration, dependencies, runtime integration, and tests.

</details>

<details>
<summary>File map</summary>

- `.env.example` — SendGrid, Twilio, retention, and SMS rate-limit settings.
- `apps/api/package.json`, `pnpm-lock.yaml` — provider, event-emitter, Redis, and workspace dependencies.
- `apps/api/src/app.module.ts` — notification module registration.
- `apps/api/src/config/env.ts` — notification environment validation and defaults.
- `apps/api/src/notifications/notifications.module.ts` — controller, service, adapter, delivery, preference, limiter, and event-bus registration.
- `apps/api/src/notifications/notifications.controller.ts` — list, read, read-all, and delete endpoints.
- `apps/api/src/notifications/notifications-preferences.controller.ts` — preference read and per-category update endpoints.
- `apps/api/src/notifications/dto/*.ts` — category, intent, preference, and delivery contracts.
- `apps/api/src/notifications/events/notification.events.ts` — intended domain-event payloads.
- `apps/api/src/notifications/services/notification.service.ts` — orchestration, persistence, fan-out, history, and mutations.
- `apps/api/src/notifications/services/notification-preferences.service.ts` — channel defaults and preference writes.
- `apps/api/src/notifications/services/notification-delivery.service.ts` — delivery state, attempts, and pending queries.
- `apps/api/src/notifications/services/email-adapter.service.ts` — SendGrid delivery.
- `apps/api/src/notifications/services/sms-adapter.service.ts` — Twilio delivery and SMS limiting.
- `apps/api/src/notifications/services/in-app-adapter.service.ts` — in-app acknowledgement.
- `apps/api/src/notifications/services/rate-limit.service.ts` — Redis per-user SMS counters.
- `apps/api/src/notifications/__tests__/placeholder.spec.ts` — one placeholder assertion.
- `packages/database/prisma/schema/notifications.prisma` — duplicate notification schema excluded from composition.
- `packages/database/prisma/migrations/20261128_notifications_sms_phone_timestamps/migration.sql` — SMS, profile phone, delivery timestamps, and retry index.
- `apps/web/src/components/Header.tsx` — bell integration.
- `apps/web/src/components/notifications/*.tsx` — bell, dropdown, recent item, unread badge, read, and delete UI.
- `apps/web/src/hooks/useNotifications.ts` — polling, mutations, and local unread count.
- `apps/web/src/hooks/useNotificationPreferences.ts` — preference fetch and updates.
- `apps/web/src/pages/account/notifications/index.tsx` — first-page history, local filters, selection, read, and delete.
- `apps/web/src/pages/account/settings/notifications.tsx` — per-category channel switches.
- `apps/web/package.json`, `pnpm-lock.yaml` — worktree `date-fns` dependency fix for relative-time rendering.

Full branch plus worktree diff: `git diff origin/main`. Focused Phase N diff: `git diff origin/main -- .env.example apps/api/package.json apps/api/src/app.module.ts apps/api/src/config/env.ts apps/api/src/notifications apps/web/src/components/Header.tsx apps/web/src/components/notifications apps/web/src/hooks/useNotifications.ts apps/web/src/hooks/useNotificationPreferences.ts apps/web/src/pages/account/notifications apps/web/src/pages/account/settings/notifications.tsx packages/database/prisma/schema/notifications.prisma packages/database/prisma/migrations/20261128_notifications_sms_phone_timestamps/migration.sql pnpm-lock.yaml`.

</details>
