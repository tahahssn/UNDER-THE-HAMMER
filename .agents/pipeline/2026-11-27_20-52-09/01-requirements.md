# Requirements: Notifications System (Phase N)

**Status:** Requirements  
**Date:** 2026-11-27  
**Scope:** Email, SMS, In-App notifications with multi-channel orchestration  

---

## Summary

Implement a notifications system enabling the platform to reach users across three channels: email (SendGrid), SMS (Twilio), and in-app (database). The backend provides a NotificationService that orchestrates adapters for each channel, enforces user preferences, applies rate limiting, and triggers notifications from key auction and subscription events. The frontend displays an in-app notification bell with unread badge, a dropdown showing recent notifications, and full history/preferences management pages in account settings.

**Key architectural decision:** Adapters are independent, rate limiting and channel selection is enforced server-side, and all external notification state (delivery status, failure reason) is logged durably in the database.

---

## Functional Requirements

### Backend: Notification Delivery

1. **NotificationService** (orchestrator)
   - Accept a notification intent (userId, type, title, body, metadata)
   - Resolve user's preferences for the notification type (enabled channels, opt-out status)
   - Create a durable Notification record in the database (marked unread, stored for in-app retrieval)
   - Dispatch to each enabled channel (email, SMS, in-app)
   - Handle delivery failures gracefully (log error, do not throw into caller)

2. **Email Adapter (SendGrid)**
   - Accept title, body, userId
   - Resolve user's email from the User profile
   - Construct and send email via SendGrid API
   - Log delivery status (success, failure reason) to NotificationLog table (not modeled here but assumed)
   - On failure: log error, do not retry within the request (async retry via background job or webhook assumed)

3. **SMS Adapter (Twilio)**
   - Accept title, body, userId
   - Resolve user's phone number from UserProfile
   - Enforce rate limit: 1 SMS per user per 5 minutes (checked via Redis)
   - Construct and send SMS via Twilio API
   - Log delivery status (success, failure reason) to NotificationLog table
   - On rate limit: skip SMS, log as rate-limited
   - On failure: log error, do not retry within the request

4. **In-App Adapter**
   - Create Notification record (already created by NotificationService)
   - Mark as read/unread based on delivery timing
   - No external API call; purely database-based

### Backend: User Preferences

5. **NotificationPreference model and defaults**
   - Per-user, per-notification-type (category), per-channel (email, SMS, in-app) opt-in/opt-out
   - Each preference has an enabled boolean and optional consentedAt timestamp (for GDPR/marketing consent)
   - If a preference does not exist, default to: in-app enabled, email/SMS enabled
   - GET `/v1/notifications/preferences` returns all preferences for the authenticated user

6. **Update preferences endpoint**
   - POST `/v1/notifications/preferences/:type` with request body `{ email: boolean, sms: boolean, inApp: boolean }`
   - Update or create preference records for the given type and user
   - If enabling EMAIL or SMS for a notification type marked MARKETING, require consentedAt timestamp
   - Return updated preferences

### Backend: Notification History and State

7. **Notification retrieval (paginated)**
   - GET `/v1/notifications?page=1&limit=20&type=BID_WON,BREAK_STARTED` (type filter optional)
   - Return paginated list of Notification records for the user, most recent first
   - Include: id, type, title, body, read, createdAt, metadata (JSON)
   - Enforce pagination to prevent unbounded queries

8. **Mark notification as read**
   - POST `/v1/notifications/:id/mark-read` with userId in JWT
   - Update Notification.read = true for the given id
   - Idempotent: if already read, no error

9. **Mark all notifications as read**
   - POST `/v1/notifications/mark-all-read`
   - Update all unread Notification records for the user to read = true

10. **Delete notification**
    - DELETE `/v1/notifications/:id`
    - Soft-delete or hard-delete Notification record (assume soft-delete via isDeleted or hard-delete per engineering preference)
    - Only the notification owner can delete

### Backend: Triggers and Events

11. **Auction triggers**
    - On successful bid accepted (AuctionEvent.BID_ACCEPTED): notify bidder with `BID_WON` type, notify all other participants with `BID_PLACED` type
    - On break started (AuctionEvent.BREAK_STARTED): notify all room participants with `BREAK_STARTED` type
    - On break ended (AuctionEvent.BREAK_ENDED): notify all room participants with `BREAK_ENDED` type
    - On auction ended (AuctionEvent.AUCTION_ENDED): notify all team owners with `AUCTION_ENDED` type

12. **Subscription triggers**
    - On subscription expiry detected (via scheduled job or subscription state check): notify host with `SUBSCRIPTION_EXPIRING` type (sent e.g. 7 days before expiry)

### Frontend: Notification Bell

13. **NotificationBell component**
    - Display bell icon (Heroicons or Lucide Icons, not emoji)
    - Show unread count badge (red, positioned top-right of bell)
    - On click, open dropdown showing 5 most recent notifications
    - Each notification item shows: title, truncated body (max 100 chars), createdAt (relative time, e.g. "5m ago"), read indicator (opacity or visual marker)
    - "View all" link at bottom of dropdown opens full history page

14. **Dropdown behavior**
    - Query GET `/v1/notifications?limit=5` on mount and on each dropdown open
    - Close dropdown on backdrop click or Escape key
    - Mark notification as read on click (optional: auto-mark on view)

### Frontend: Notifications History Page

15. **Full history page** (`/account/notifications`)
    - Paginated list (20 per page) of all notifications for the user
    - Columns/rows: type badge, title, body (full or truncated), createdAt, read status checkbox, delete button
    - **Filter bar:** dropdown to filter by type (BID_WON, BID_PLACED, BREAK_STARTED, BREAK_ENDED, AUCTION_ENDED, SUBSCRIPTION_EXPIRING)
    - **Mark as read:** checkbox to select multiple, then "Mark as read" button
    - **Delete:** delete icon on each row or bulk delete for selected
    - **Pagination:** standard page navigation or infinite scroll (product preference)

### Frontend: Preferences Page

16. **Settings page** (`/account/settings/notifications` or `/account/settings/preferences`)
    - Load user's preferences via GET `/v1/notifications/preferences`
    - Display a table or card grid showing each notification type (BID_WON, BID_PLACED, etc.) with toggles for email, SMS, in-app
    - On toggle change, POST to `/v1/notifications/preferences/:type`
    - Show loading state and success/error toast
    - Explain rate limiting: "SMS limited to 1 per user per 5 minutes"
    - If user disables a channel, confirm action (optional)

---

## Non-Functional Requirements

### Performance and Scalability
- Notification delivery must be non-blocking (fire-and-forget or async via queue; not synchronous RPC calls within critical auction paths)
- Database query for user preferences must use indexed lookups (userId, category, channel unique constraint)
- Paginated endpoints must include appropriate database indexes on (userId, createdAt) and (userId, type)
- In-app notification storage should not grow unbounded; consider a retention policy (e.g., keep 90 days or 1000 per user)

### Reliability and Correctness
- Rate limiting for SMS must be enforced server-side using Redis or in-memory store (not client-side)
- Notification dispatch must be idempotent: retrying the same notification intent should not create duplicate Notification records if already delivered
- External API failures (SendGrid, Twilio) must not block the auction or core user experience
- Delivery status and retry behavior must be logged durably for audit and debugging

### Environment Variables and Security
- SendGrid API key: `SENDGRID_API_KEY` (secret, never logged or exposed to client)
- Twilio Account SID: `TWILIO_ACCOUNT_SID` (secret)
- Twilio Auth Token: `TWILIO_AUTH_TOKEN` (secret)
- Twilio phone number for SMS: `TWILIO_PHONE_NUMBER` (can be configuration, not secret)
- Redis connection string: `REDIS_URL` (assumed shared with existing caching/coordination)
- No hardcoded API keys or provider configuration in source code

### Code Quality
- TypeScript strict mode throughout
- All external inputs validated (notification type, userId, preferences)
- Error codes must be consistent with existing ErrorCode enum (VALIDATION_FAILED, INTERNAL, RATE_LIMITED, etc.)
- No console.log; use structured logging (assumed existing logger)

---

## Acceptance Criteria

### Backend Implementation
1. **NotificationService** can be injected into other modules (e.g., auction event handler) and dispatch notifications without throwing into caller on external API failure
2. **SendGrid adapter** successfully sends email via SendGrid API and logs delivery status; test with mock/real SendGrid sandbox
3. **Twilio adapter** successfully sends SMS via Twilio API, enforces 1-per-5-min rate limit, and logs status
4. **In-app adapter** creates Notification records with correct title, body, userId, type, and read status
5. **User preferences** are stored, retrieved, and updated correctly; defaults are applied for missing preferences
6. **Notification retrieval** returns correct pagination, type filtering, and ordering (most recent first)
7. **Mark read** and **delete** endpoints update the database and are idempotent
8. **Rate limiting** prevents more than 1 SMS per user per 5-minute window; subsequent attempts within the window are logged as skipped

### Frontend Implementation
9. **NotificationBell** component renders bell icon with unread badge; badge updates on new notification or manual refresh
10. **Dropdown** displays 5 most recent notifications; "View all" navigates to full history page
11. **History page** loads and displays paginated list; filter by type works; pagination navigation is functional
12. **Mark as read** (single and bulk) updates UI and persists to backend
13. **Delete** (single and bulk) removes notification from list and persists to backend
14. **Preferences page** loads current preferences; toggles POST correctly and show success/error feedback
15. **Responsive design** works on 375px (mobile), 768px (tablet), 1024px (small desktop), 1440px (desktop)

### Integration and Events
16. **Auction events** (BID_ACCEPTED, BREAK_STARTED, BREAK_ENDED, AUCTION_ENDED) trigger correct notification types with correct recipients
17. **Subscription triggers** (SUBSCRIPTION_EXPIRING) fire 7 days before expiry
18. **End-to-end:** Create a room, place a bid, verify BID_WON notification for winning bidder and BID_PLACED for others via in-app, email and SMS (if enabled)

### Testing Coverage
19. **Unit tests** (>60% coverage): NotificationService preference resolution, adapter dispatch logic, rate-limit calculation
20. **Integration tests** (>20% coverage): Notification creation, preference CRUD, SMS rate limiting via Redis, audit logging
21. **E2E tests** (>5% coverage): Bid-to-notification flow, preferences toggle, history page pagination, mobile responsiveness
22. **Error paths**: Missing user phone, SendGrid API error, Twilio quota exceeded, invalid preference type
23. **Security tests**: Unauthorized user cannot delete/update another user's notification or preferences

### Documentation
24. **Code comments** explain rate-limit key structure, adapter failure handling, default preference logic
25. **README section** documents how to configure environment variables, run tests, and add new notification types
26. **API documentation** (OpenAPI or inline) covers all 7 endpoints with request/response examples

---

## Out of Scope

- **Push notifications** (native mobile app): Out of scope for initial release; frontend is web-only (React/Next.js)
- **Notification templates and i18n**: Notification title/body are hardcoded in English; localization deferred to later phase
- **SMS delivery confirmation (DLR)**: Log SMS sent status but do not implement webhook for delivery receipts from Twilio in this phase
- **Scheduled/batch notifications**: All notifications are sent synchronously or via async queue; no calendar-based scheduling
- **Notification read receipts or analytics**: Track whether notification was delivered, not whether user interacted with the specific message content
- **Websocket real-time notification updates**: Frontend polls or uses existing WebSocket; real-time push is deferred
- **A/B testing or notification frequency caps**: No per-user frequency limiting beyond SMS 5-min rate limit
- **Migration of legacy notification data**: Assume fresh system; no import of old notifications from other systems
- **Admin override of user preferences**: Support staff cannot force a notification to be sent; preferences are always enforced
- **Custom notification templates or theming**: Email and SMS content is generated by adapters; not user-customizable

---

## Assumptions and Notes

1. **Phone number storage:** UserProfile already includes a `phoneNumber` field or will be added; SMS adapter resolves phone from UserProfile.phoneNumber
2. **Redis availability:** Shared Redis instance is available for rate-limit key storage (NOTIFICATIONS:SMS:RATE_LIMIT:userId)
3. **Audit logging:** Existing audit framework logs sensitive actions (notification dispatch, preference changes)
4. **Background job system:** Async retry of failed external API calls is assumed to exist or will be implemented separately; this requirements document covers single-request delivery attempt only
5. **Event bus:** Auction event system (BID_ACCEPTED, BREAK_STARTED, etc.) already exists and will trigger NotificationService; event handler integration is covered in design, not requirements
6. **Email templates:** SendGrid templates or plain text emails are assumed; HTML rendering is out of scope
7. **Twilio vs regional SMS providers:** Twilio is locked per the feature request; future phases can add additional providers (SafeSMS, local providers) behind an adapter pattern
8. **Notification retention:** Assume 90-day retention or cleanup via scheduled job; exact retention period to be confirmed in design
9. **Testing infrastructure:** NestJS testing (Jest), React Testing Library, Cypress or Playwright for E2E; exact framework choice deferred to design
10. **TypeScript version:** Align with existing project (TypeScript 5.x assumed)

---

## Dependencies on Other Phases or Areas

- **Auction events system:** Requires that auction state changes emit durable events (BID_ACCEPTED, etc.)
- **User authentication:** Requires Cognito JWT validation and User.id extraction (already implemented)
- **SendGrid and Twilio SDKs:** npm packages `@sendgrid/mail`, `twilio`
- **Redis client:** npm package `ioredis` or `redis` (assumed shared with existing caching)
- **Frontend UI library:** Assumes Heroicons or Lucide Icons available; Tailwind CSS for styling

---

## Revision Notes

None (initial requirements, no prior design review).
