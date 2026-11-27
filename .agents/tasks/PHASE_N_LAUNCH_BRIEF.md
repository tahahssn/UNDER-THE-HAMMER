# Phase N: Notifications (Email, SMS, In-App)

**Status**: Ready to launch (Phase J merged to main)  
**Workflow**: `bundled://feature-pipeline`  
**Base branch**: main (at cc5c32a)  
**Feature branch**: `feature/phase-n-notifications`  
**Expected duration**: ~2.5 hours  
**Blockers**: None (all phases complete; email/SMS providers available via env keys)

---

## Deliverables

### Backend

**Notification Types** (enum, `apps/api/src/notifications/constants/notification-types.ts`)
```typescript
enum NotificationType {
  BID_PLACED = 'bid_placed',           // notify other team owners
  BID_WON = 'bid_won',                 // notify winning team
  BREAK_STARTED = 'break_started',     // notify all users
  BREAK_ENDED = 'break_ended',         // notify all users
  AUCTION_ENDED = 'auction_ended',     // notify host + all bidders
  SUBSCRIPTION_EXPIRING = 'subscription_expiring', // notify host
  PLAYER_UNSOLD = 'player_unsold',     // notify all users
}
```

**Notification Channel Adapters** (`apps/api/src/notifications/adapters/`)
- `INotificationAdapter` interface: `send(to, subject, body, metadata): Promise<void>`
- **Email Adapter** (`email.adapter.ts`):
  - Provider: SendGrid (via `@sendgrid/mail` SDK)
  - Template: pre-designed or dynamic HTML
  - From: noreply@underthhammer.app (or configurable)
  - Retry: exponential backoff (3 retries, max 1h)
  - Error handling: log and continue (non-blocking)
- **SMS Adapter** (`sms.adapter.ts`):
  - Provider: Twilio (via `twilio` SDK)
  - To: user phone number (from User model, Phase B)
  - Retry: exponential backoff
  - Rate limit: max 1 SMS per user per 5 minutes (configurable)
  - Error handling: log and continue
- **In-App Adapter** (`in-app.adapter.ts`):
  - Stores notification in `Notification` DB table
  - Optionally broadcasts via Socket.IO if user connected
  - Non-blocking

**Notification Service** (`apps/api/src/notifications/services/notification.service.ts`)
- Orchestrates adapters based on user preferences
- Methods:
  - `sendNotification(userId, type, data)` → queues all enabled channels
  - `sendBulk(userIds[], type, data)` → batch notify (optional async job)
- Preference logic: `getUserNotificationPrefs(userId)` → returns enabled channels per type
- Example: user has email+SMS for `BID_WON`, only email for `BREAK_STARTED`, none for `PLAYER_UNSOLD`

**Notification Ledger Schema** (Prisma migration)
```prisma
model Notification {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        String   // NotificationType enum value
  title       String
  body        String
  data        Json?    // contextual data: auctionId, playerId, teamName, etc.
  read        Boolean  @default(false)
  createdAt   DateTime @default(now())
  
  @@index([userId, createdAt])
  @@index([userId, read])
}

model NotificationPreference {
  id      String  @id @default(cuid())
  userId  String
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  type    String  // NotificationType enum value
  email   Boolean @default(true)
  sms     Boolean @default(false)
  inApp   Boolean @default(true)
  
  @@unique([userId, type])
}
```

**Notification Endpoints** (`apps/api/src/notifications/controllers/notifications.controller.ts`)
- GET `/v1/notifications` (authenticated)
  - Returns paginated list of user's notifications (most recent first)
  - Query: `?limit=20&offset=0&unreadOnly=false`
- POST `/v1/notifications/:id/mark-read` (authenticated)
  - Marks single notification as read
- POST `/v1/notifications/mark-all-read` (authenticated)
  - Marks all as read
- DELETE `/v1/notifications/:id` (authenticated)
  - Soft delete (or hard delete, keeper's choice)

**Notification Preference Endpoints** (`apps/api/src/notifications/controllers/preferences.controller.ts`)
- GET `/v1/notifications/preferences` (authenticated)
  - Returns user's preferences (defaults: email+inApp for most, SMS opt-in)
- POST `/v1/notifications/preferences/:type` (authenticated)
  - Input: `{ email: boolean, sms: boolean, inApp: boolean }`
  - Updates preference for one notification type

**Trigger Points** (integrations with existing phases)
- **On bid accepted** (Phase G): send `BID_WON` to winning team, `BID_PLACED` to other bidders
- **On break started/ended** (Phase H): send to all auction participants
- **On auction ended** (Phase G/J): send to all participants
- **On subscription expiring** (Phase L + background job): send 7-day warning to host

**Tests** (`apps/api/src/notifications/services/*.spec.ts`)
- Adapters: email send success/failure, SMS rate limiting, in-app storage
- Service: preference logic (which channels enabled), bulk notify, error recovery
- Endpoints: list, mark-read, preferences update
- Triggers: on-bid, on-break events fire notifications
- Idempotency: duplicate triggers don't double-notify (using event versioning)
- 60+ tests, >90% coverage

### Frontend

**Notification Bell Component** (`apps/web/src/components/notifications/NotificationBell.tsx`)
- Bell icon in header (top-right)
- Badge showing unread count
- On click: dropdown menu with 5 most recent notifications
- Each notification shows: type icon, title, time, read status
- "View All" link to full list page

**Notification List Page** (`apps/web/src/app/account/notifications/page.tsx`)
- Full history of notifications (paginated)
- Filters: all / unread only
- Actions: mark as read, delete
- Read notifications grayed out
- Responsive table on desktop, card list on mobile
- Empty state: "No notifications yet"

**Notification Preference Form** (`apps/web/src/components/account/NotificationPreferences.tsx`)
- Settings page under account
- Table: notification type × channel (email, SMS, in-app) with toggles
- Save button to POST preferences
- Success toast on save
- Responsive: 1 col on mobile, 3-col grid on desktop

**Hooks** (`apps/web/src/hooks/useNotifications.ts`, `useNotificationPrefs.ts`)
- `useNotifications(limit?, offset?)` → `{ notifications, loading, error, markRead, delete }`
- `useNotificationPrefs()` → `{ prefs, loading, updatePrefs }`
- Real-time: listen for `notification:new` on socket (if Phase I enhancement)

**Tests** (`apps/web/src/components/notifications/*.spec.tsx`)
- Bell: renders unread count, dropdown shows recent
- List: paginate, mark-read, delete, empty state
- Preferences: toggles work, save POST succeeds, error handling
- Hooks: fetch, cache, real-time updates
- 30+ tests, >90% coverage

---

## Integration Points

- **Phase G** (bid settlement): on bid accepted, trigger `BID_WON` + `BID_PLACED` notifications
- **Phase H** (breaks): on break event, trigger `BREAK_STARTED`/`BREAK_ENDED`
- **Phase I** (real-time): optional socket broadcast for real-time notification updates
- **Phase L** (payments): subscription expiring trigger (background job)
- **Phase B** (users): user phone number must be available (or optional, SMS skipped if no phone)
- **No new migrations** (only Notification + NotificationPreference tables)

---

## Success Criteria

- [ ] Email notifications sent via SendGrid (delivery verified)
- [ ] SMS notifications sent via Twilio (delivery verified)
- [ ] In-app notifications stored in DB
- [ ] Notification preferences honored (user can opt out per channel/type)
- [ ] Notification list page shows all notifications
- [ ] Bell icon shows unread count
- [ ] Mark-as-read working
- [ ] TypeScript strict (0 errors, no `any`)
- [ ] Tests passing (90+ tests, >85% coverage)
- [ ] No hardcoded email/SMS provider keys (use env vars)
- [ ] No secrets in code
- [ ] Responsive (mobile 375px, desktop 1440px)
- [ ] Rate limiting prevents SMS spam

---

## Files to Create/Modify

**Backend**:
- `apps/api/src/notifications/constants/notification-types.ts` (new)
- `apps/api/src/notifications/adapters/notification.adapter.interface.ts` (new)
- `apps/api/src/notifications/adapters/email.adapter.ts` (new)
- `apps/api/src/notifications/adapters/sms.adapter.ts` (new)
- `apps/api/src/notifications/adapters/in-app.adapter.ts` (new)
- `apps/api/src/notifications/services/notification.service.ts` (new)
- `apps/api/src/notifications/services/notification.service.spec.ts` (new)
- `apps/api/src/notifications/controllers/notifications.controller.ts` (new)
- `apps/api/src/notifications/controllers/preferences.controller.ts` (new)
- `apps/api/src/notifications/dtos/*.dto.ts` (new)
- `prisma/schema.prisma` (modify: add Notification + NotificationPreference)
- `prisma/migrations/*/notifications.sql` (migration)
- `apps/api/src/auctions/services/auction.service.ts` (modify: add trigger calls on bid/break events)

**Frontend**:
- `apps/web/src/hooks/useNotifications.ts` (new)
- `apps/web/src/hooks/useNotifications.spec.ts` (new)
- `apps/web/src/hooks/useNotificationPrefs.ts` (new)
- `apps/web/src/hooks/useNotificationPrefs.spec.ts` (new)
- `apps/web/src/components/notifications/NotificationBell.tsx` (new)
- `apps/web/src/components/notifications/NotificationBell.spec.tsx` (new)
- `apps/web/src/components/notifications/NotificationList.tsx` (new)
- `apps/web/src/components/notifications/NotificationList.spec.tsx` (new)
- `apps/web/src/components/account/NotificationPreferences.tsx` (new)
- `apps/web/src/components/account/NotificationPreferences.spec.tsx` (new)
- `apps/web/src/app/account/notifications/page.tsx` (new)
- `apps/web/src/app/account/settings/page.tsx` (modify: add notification prefs link)

**Environment**:
- `.env.local` (add `SENDGRID_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`)
- `.env.example` (document variables)

**Tests**: 90+ total (60 backend, 30 frontend)

---

## Decisions Already Made

| Item | Decision | Why |
|------|----------|-----|
| Email provider | SendGrid | Transactional reliability, templates, deliverability |
| SMS provider | Twilio | Global coverage, testing sandbox, event webhooks |
| In-app storage | DB table | Searchable, audit trail, async delivery |
| SMS rate limit | 1 per user per 5 min | Prevents notification spam, respects user preference |
| Preference model | Per-type per-channel | Fine-grained control (email ALL, SMS none, etc.) |
| Defaults | Email+InApp on, SMS off | Reasonable defaults; SMS opt-in|
| Idempotency | Event version tracking | Prevent double-notify on retried events |

---

## Environment Variables Required

```bash
SENDGRID_API_KEY=SG.... (from SendGrid dashboard)
TWILIO_ACCOUNT_SID=AC.... (from Twilio dashboard)
TWILIO_AUTH_TOKEN=........ (from Twilio dashboard)
SMS_RATE_LIMIT_PER_USER=1 # per 5 min
SMS_RATE_LIMIT_WINDOW_MS=300000
```

---

## Notes

- Email templates: use SendGrid dynamic templates or plain text + HTML fallback
- SMS: keep message <160 characters (auto-split if longer)
- Delivery failures: logged but don't block auction (non-critical)
- Future: push notifications, in-app toast on real-time events, notification center redesign
- GDPR: user can delete all notifications; preference overrides are logged

