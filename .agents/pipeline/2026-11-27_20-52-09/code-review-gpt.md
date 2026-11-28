# Multi-channel notification center and delivery adapters

Phase N introduces a `NotificationService` that resolves per-category preferences, persists notification and delivery records, and delegates to in-app, SendGrid, and Twilio adapters. It also adds notification and preference endpoints, a polled bell/dropdown, history and settings screens, and an SMS migration. **Confirmed**, the feature has no auction or subscription trigger integration, its endpoints use a literal placeholder identity without authentication, its Prisma schema and migration disagree, and both API and web typechecks report errors in the new code. **Confirmed**, delivery has no durable handoff or retry worker, so the advertised retry behavior is absent.

Watch for: **confirmed** unauthenticated endpoints with a shared placeholder user, **confirmed** missing domain-trigger wiring, **confirmed** build and Prisma-client failures, **confirmed** non-durable delivery without retries, and **confirmed** frontend routes that neither send the platform's bearer token nor expose full-history pagination.

**Verdict**: NEEDS_CHANGES

## High-level view

The central design separates preference resolution, delivery tracking, and provider calls. **Confirmed**, no production path calls the orchestrator: the event file only declares interfaces, `NotificationService` has no handlers, and auction, break, auction-end, and subscription-expiry producers do not emit or dispatch notification intents.

The REST surface is meant to scope operations to the authenticated user. **Confirmed**, both controllers omit `JwtGuard` and `CurrentUser`, substitute `user-id-from-jwt`, and cannot enforce tenant isolation. **Confirmed**, the frontend bypasses the bearer-token client and targets a route absent from the checked-in Next and Nest route configuration.

The delivery records could support independent retries. **Confirmed**, persistence starts only after the caller returns, notification and delivery rows are not committed atomically, transient failures become terminal, and no worker consumes pending deliveries or increments attempts.

The SQL migration extends notification storage for SMS, but **confirmed** the modular Prisma schema remains unchanged. Regenerating `schema.prisma` removes `SMS`, `phoneNumber`, and delivery timestamps from the client model even though the migration adds them to the database.

The web UI supplies the requested bell, dropdown, history view, and toggles. **Confirmed**, history and filters cover only the first 20 rows, the badge counts only five fetched rows, the account pages sit outside the App Router layout, and the fixed multi-column layouts and unlabelled controls do not meet the stated 375px and keyboard requirements.

The claimed validation level is absent. **Confirmed**, the notification suite contains one `expect(true).toBe(true)` test and no frontend notification tests; targeted typechecks fail in the new files. **Confirmed**, the feature commit also contains payment, squad-export, planning, and temporary workflow artifacts, making Phase N hard to validate or revert independently.

<details>
<summary>Issues (14)</summary>

1. **Domain triggers are absent** (**confirmed**) — none of the six requested events invokes `NotificationService`. Emit post-commit events, add handlers and recipient resolution, and schedule subscription-expiry production.
2. **Notification API has no authenticated identity** (**confirmed**) — both controllers use `user-id-from-jwt` without `JwtGuard`. Apply the established guard/decorator pattern and pass the authenticated internal user ID to every operation.
3. **Client route and auth contracts do not match the API** (**confirmed**) — the hooks call an unproxied `/api/v1` path with cookies while the app uses bearer tokens, and Nest's version configuration prefixes controllers that already contain `v1`. Declare one route version and use the shared authenticated client or a documented proxy.
4. **Delivery is neither durable nor retried** (**confirmed**) — persistence is deferred with `setImmediate`, writes are non-atomic, pending records have no worker, and transient failures become terminal. Use a transactional outbox or durable queue with claimed jobs, attempts, backoff, and retryable/terminal states.
5. **Retention setting is inert** (**confirmed**) — `NOTIFICATION_RETENTION_DAYS` is configured but never consumed. Implement scheduled retention or remove the unsupported setting.
6. **Migration and Prisma schema drift** (**confirmed**) — SQL adds SMS, phone, and delivery timestamp fields that the schema generator omits. Update the modular schema sources and validate migration plus generated client together.
7. **Phase N does not compile** (**confirmed**) — the new backend files contain invalid imports, missing dependencies, enum/type errors, and strict-mode errors; the web package omits `date-fns`. Fix the errors and require targeted API/web typechecks before merge.
8. **Idempotency key is incomplete and racy** (**confirmed**) — the query ignores `playerId`, searches JSON fields that are not guaranteed to be persisted, and has no unique constraint. Persist a stable event key and enforce uniqueness atomically.
9. **Provider boundaries do not fail closed** (**confirmed**) — Twilio falls back to a dummy sender number and SendGrid receives unescaped dynamic HTML. Require complete provider configuration and encode template substitutions.
10. **Preference updates clobber omitted channels and assume consent** (**confirmed**) — optional fields reset to defaults, upserts are non-transactional, and enabling a channel manufactures `consentedAt`. Preserve omitted values, update atomically, and record validated consent evidence.
11. **History and unread counts cover only the first slice** (**confirmed**) — the page filters only 20 local records and the badge counts only five. Add server-driven page/category state and return an authoritative unread count.
12. **Account UI bypasses the app shell and lacks responsive/accessibility states** (**confirmed**) — Pages Router screens do not inherit the App Router layout, and their fixed columns and unlabelled controls do not support 375px or keyboard use. Move them into the app route tree and add responsive, semantic controls and focus behavior.
13. **Test and coverage claims are unsupported** (**confirmed**) — only one placeholder backend assertion exists and no notification frontend tests exist. Add authorization, trigger, provider, retry, rate-limit, pagination, and UI tests, then measure coverage.
14. **Unrelated phases are bundled with Phase N** (**confirmed**) — payment, squad-export, contracts, planning, and temporary artifacts share the commit/range. Split the notification feature into a focused change.

</details>

<details>
<summary>Details</summary>

### Declared domain events never trigger a notification

**Confirmed** — `events/notification.events.ts` defines payload interfaces, but `dispatchNotification` appears only at its declaration and there is no `@OnEvent` handler, `EventEmitter2.emit`, or direct dispatch call. Auction bids, breaks, auction end, and subscription expiry therefore never create `BID_WON`, `BID_PLACED`, `BREAK_STARTED`, `BREAK_ENDED`, `AUCTION_ENDED`, or `SUBSCRIPTION_EXPIRING` notifications.

Connect post-commit domain events to handlers that derive recipients from authoritative state. Subscription expiry also needs a scheduled producer because no user action emits it.

### Placeholder identity leaves the notification API outside the trust boundary

**Confirmed** — both controllers claim to require `JwtGuard`, but neither applies it. Every read, mutation, delete, and preference update uses `const userId = 'user-id-from-jwt'`. PostgreSQL will normally reject that value for a UUID column, but this is accidental failure rather than authentication or ownership enforcement.

Apply `JwtGuard` and `CurrentUser`, then pass the authenticated internal user ID through every operation. The service ownership filters become useful only after the controller supplies a real identity.

### Browser and API disagree on route and authentication contracts

**Confirmed** — the hooks call relative `/api/v1/notifications` URLs with only `credentials: 'include'`. Next has no API route or rewrite for that prefix, while the web app stores a bearer token and adds it through its shared Axios interceptor. Guarded endpoints would receive no token.

**Confirmed** — Nest enables URI versioning with default version `1`, while the controllers embed `v1` in their paths without `VERSION_NEUTRAL`. This combines a version prefix with an already-versioned path instead of exposing the requested `/v1/notifications`. Declare the version once and use the authenticated API client or a documented proxy.

### Delivery records have no durable handoff or retry loop

**Confirmed** — `dispatchNotification` defers all persistence with `setImmediate`. A process exit before that callback loses the notification, and separate notification/delivery writes allow partial state if delivery-row creation fails.

**Confirmed** — `getPendingDeliveries` and `incrementAttempts` are unused. Rate-limited SMS stays `PENDING` forever; SendGrid and Twilio exceptions become `FAILED`, which the pending query would not select. Attempts remain zero and transient provider failures are not retried. Commit an outbox with the domain operation and let a worker claim records, apply bounded backoff, increment attempts, and classify terminal failures.

**Confirmed** — `NOTIFICATION_RETENTION_DAYS` is never read. Add scheduled cleanup with an explicit policy or remove the setting.

### Prisma migration and generated schema describe different databases

**Confirmed** — `20261128_notifications_sms_phone_timestamps/migration.sql` adds `SMS`, `UserProfile.phoneNumber`, and `NotificationDelivery.createdAt/updatedAt`. The modular sources consumed by `build-schema.mjs` still define only `IN_APP` and `EMAIL`, omit `phoneNumber`, and omit the delivery timestamps and retry index. Regeneration therefore produces a client that cannot support the new queries after migration.

Update the modular schema files in this change and validate the migration and generated client together. Adding Prisma as a database-package development dependency does not resolve model drift.

### New modules fail strict TypeScript compilation

**Confirmed** — targeted API typechecking reports Phase N errors. Services import `PrismaService` from `@uth/database`, which exports Prisma Client symbols but no injectable service; the app provides a different local token. The preference controller imports nonexistent `ZodValidationPipe` from `@nestjs/common`, `ioredis` is undeclared, the Twilio namespace is not callable, status strings do not satisfy the local `DeliveryStatus` enum, DTO fields violate strict initialization, and error handling leaves `unknown` and `any` failures.

**Confirmed** — targeted web typechecking cannot resolve `date-fns` from `NotificationItem.tsx` because `apps/web/package.json` does not declare it. Phase N should pass both package typechecks with direct dependencies before merge.

### Idempotency collapses distinct players and still races

**Confirmed** — `checkIdempotency` claims to compare `(userId, category, auctionId, playerId)` but queries only the user, category, time window, and `data.auctionId`; `playerId` is never compared. Distinct players in one auction can suppress one another.

**Confirmed** — the top-level intent IDs are not added to persisted `data`, so the JSON path may not exist. The read-before-create sequence also has no unique constraint, allowing concurrent duplicates. Persist a stable event key under a unique constraint and create atomically.

### Provider configuration and content do not fail closed

**Confirmed** — Twilio's sender number is optional and falls back to `+1234567890`. Valid credentials with no sender number therefore cause a real call with a dummy origin rather than a startup/configuration failure.

**Confirmed** — SendGrid HTML interpolates `emailBody` directly into `<p>${emailBody}</p>`. Room, player, team, or other externally managed names can inject markup. Require complete channel configuration and escape dynamic content or use an encoding template system.

### Preference writes reset omitted channels and manufacture consent

**Confirmed** — all request channels are optional, but omitted values become `inApp: true`, `email: false`, and `sms: false`. A one-channel update can reset other choices. Three sequential upserts can also expose partial state on failure.

**Confirmed** — the consent branch for `SUBSCRIPTION_EXPIRING` performs no validation, while every enabled channel gets a fresh `consentedAt`. Preserve omitted values, apply changes transactionally, and set consent metadata only from a validated disclosure and action.

### History and unread badge only represent the first slice

**Confirmed** — `useNotifications` hardcodes `page=1`, discards pagination metadata, and exposes no page or category parameter. The history screen filters its first 20 rows locally and has no navigation; it also ignores the backend category filter and mark-all endpoint.

**Confirmed** — the bell derives unread count from at most five rows, so older unread notifications disappear and the `9+` branch is unreachable. Return an authoritative unread count and add server-driven pagination and filtering.

### Account screens bypass the app shell and lack mobile and keyboard behavior

**Confirmed** — the screens live under `src/pages/account`, while the shell and `AuthProvider` live in `src/app/layout.tsx`; there is no `pages/_app.tsx`. These routes do not inherit the App Router header, footer, provider, or global stylesheet setup. Move them under `src/app/account/.../page.tsx`.

**Confirmed** — neither screen has responsive breakpoint behavior for its table-like layout. Five preference columns and fixed history columns remain at 375px. Notification rows are clickable `div`s without keyboard semantics; toggles lack accessible names and `aria-checked`; the dropdown lacks focus management and dialog/menu semantics; badge motion does not respect reduced motion. Add mobile layouts and semantic controls before claiming 375px support.

### Advertised test suite is one placeholder

**Confirmed** — `apps/api/src/notifications` contains only `placeholder.spec.ts` with `expect(true).toBe(true)`. `pnpm --filter @uth/api test -- --run src/notifications` runs that assertion, and no changed frontend notification file has a test. The stated 85+ tests and greater-than-85% coverage are not present.

Add tests for ownership, defaults and partial preferences, provider failures, durable retry and rate limiting, event recipients, idempotency races, pagination/unread counts, and keyboard/mobile behavior. Measure coverage rather than inferring it from a placeholder pass.

### Phase N is bundled with unrelated implementation and workflow artifacts

**Confirmed** — the Phase N commit also adds Safepay code, squad export behavior and tests, contracts, payment migrations, subscription methods, extensive planning files, and temporary Phase J artifacts; the branch range contains earlier Phase J commits. Split production behavior and workflow output so notification failures can be reviewed, deployed, and reverted independently.

</details>

<details>
<summary>File map</summary>

- `.env.example`, `apps/api/src/config/env.ts` — notification provider, retention, and SMS-limit settings.
- `apps/api/src/app.module.ts`, `apps/api/src/notifications/notifications.module.ts` — module, controller, service, adapter, delivery, preference, and limiter registration.
- `apps/api/src/notifications/notifications.controller.ts` — history, read, read-all, and delete endpoints.
- `apps/api/src/notifications/notifications-preferences.controller.ts` — per-category channel endpoints.
- `apps/api/src/notifications/dto/*.ts` — categories, preferences, intents, and delivery DTOs.
- `apps/api/src/notifications/events/notification.events.ts` — intended auction and subscription event payloads.
- `apps/api/src/notifications/services/notification.service.ts` — preference resolution, persistence, fan-out, and history mutations.
- `apps/api/src/notifications/services/notification-preferences.service.ts` — default materialization and channel choices.
- `apps/api/src/notifications/services/notification-delivery.service.ts` — delivery status, attempts, and pending queries.
- `apps/api/src/notifications/services/email-adapter.service.ts`, `sms-adapter.service.ts`, `in-app-adapter.service.ts` — SendGrid, Twilio, and stored in-app delivery.
- `apps/api/src/notifications/services/rate-limit.service.ts` — Redis SMS counters.
- `apps/api/src/notifications/__tests__/placeholder.spec.ts` — the single placeholder assertion.
- `packages/database/prisma/migrations/20261128_notifications_sms_phone_timestamps/migration.sql` — SMS enum, profile phone, delivery timestamps, and retry index.
- `apps/web/src/hooks/useNotifications.ts`, `useNotificationPreferences.ts` — notification state and preference mutations.
- `apps/web/src/components/notifications/*.tsx`, `apps/web/src/components/Header.tsx` — bell, dropdown, item, and header integration.
- `apps/web/src/pages/account/notifications/index.tsx` — history, local filter, selection, read, and delete actions.
- `apps/web/src/pages/account/settings/notifications.tsx` — per-category channel toggles.
- `apps/api/package.json`, `pnpm-lock.yaml` — event emitter, SendGrid, and Twilio packages; web `date-fns` and API `ioredis` remain undeclared.
- Unrelated `.agents/**`, payment, squad-export, contracts, subscription, and temporary files — bundled outside Phase N behavior.

Full branch diff: `git diff origin/main...HEAD`. Uncommitted changes: `git diff` and `git diff --cached`. Focused Phase N commit: `git diff HEAD^ HEAD -- apps/api/src/notifications apps/web/src/components/notifications apps/web/src/hooks/useNotifications.ts apps/web/src/hooks/useNotificationPreferences.ts apps/web/src/pages/account/notifications apps/web/src/pages/account/settings/notifications.tsx packages/database/prisma/migrations/20261128_notifications_sms_phone_timestamps/migration.sql`.

</details>
