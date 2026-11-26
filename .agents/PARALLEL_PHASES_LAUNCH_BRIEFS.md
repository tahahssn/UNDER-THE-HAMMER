# Phases K–N Parallel Launch Briefs

**Launch Timing**: After Phase J merges to main  
**Launch Strategy**: All 4 phases simultaneously (independent, no blockers)  
**Workflow IDs**: To be generated at launch time

---

## Phase K: Team Exports & Graphics

**Branch**: feature/phase-k-exports (from main after J merge)  
**Timeline**: 1.5–2 hours  
**Type**: Backend services + frontend UI + graphics generation

### Deliverables

**Backend (3 services)**:
- `SquadExportService`: Generate PDF squad lists, CSV exports
- `PurseExportService`: Export purse ledger as CSV, JSON
- `GraphicsService`: Generate team lineup graphics (PNG/SVG), squad card images

**API Endpoints (6 new)**:
```
GET  /v1/auctions/:auctionId/exports/squad/pdf
GET  /v1/auctions/:auctionId/exports/squad/csv
GET  /v1/auctions/:auctionId/exports/purse/csv
GET  /v1/auctions/:auctionId/exports/purse/json
GET  /v1/auctions/:auctionId/exports/lineup/graphic
GET  /v1/auctions/:auctionId/exports/squad/card
```

**Frontend**:
- `ExportMenu` component (button + dropdown)
- `ShareSquadCard` component (modal, share buttons)
- `useSquadExport` hook (download state, error handling)

**Tests**: >80% coverage (export formats, authorization, caching)

**Specification**: `.agents/tasks/phase-k-exports-spec.md`

---

## Phase L: Subscriptions & Payments

**Branch**: feature/phase-l-payments (from main after J merge)  
**Timeline**: 2–2.5 hours  
**Type**: Backend service + payment provider integration + frontend UI

### Deliverables

**Backend Services**:
- `SubscriptionService`: Plan management, entitlement checks, enforcement
- `SafepayService`: Checkout session creation, webhook verification
- `PaymentController`: Checkout endpoint, webhook handler, refund logic

**Database Models**:
- `Subscription`: User subscription with status, billing dates
- `Invoice`: Payment records with status
- `PaymentTransaction`: All transactions (audit trail)

**API Endpoints**:
```
POST   /v1/subscriptions/checkout/:plan
POST   /v1/subscriptions/:id/cancel
GET    /v1/subscriptions/current
GET    /v1/subscriptions/invoices
POST   /webhooks/safepay
```

**Frontend**:
- `PricingPage`: Plan cards, pricing, CTA
- `CheckoutPage`: Safepay payment form
- `BillingPage`: Invoice history, subscription management
- `SubscriptionBadge`: Status indicator

**Tests**: >80% coverage (checkout flow, webhook handling, idempotency, refunds)

**Specification**: `.agents/tasks/phase-l-payments-spec.md`

---

## Phase M: Cricket News & Live Data

**Branch**: feature/phase-m-cricket-data (from main after J merge)  
**Timeline**: 2.5–3 hours  
**Type**: Data provider integration + background jobs + frontend pages

### Deliverables

**Backend Services**:
- `DataProviderAdapter` interface (abstract)
- `ESPNDataProvider` implementation (ESPN API)
- `NewsIngestionService`: Fetch, dedupe, store articles
- `LiveMatchService`: Live score sync
- `PlayerStatsService`: Player statistics tracking

**Background Jobs**:
- Cricket news ingestion (every 6 hours)
- Live match updates (every hour)
- Player stats bulk sync (daily)

**API Endpoints**:
```
GET  /v1/cricket/news
GET  /v1/cricket/news/trending
GET  /v1/cricket/matches/live
GET  /v1/cricket/players/:id/stats/:season
GET  /v1/cricket/players/top-batsmen/:season
GET  /v1/cricket/players/top-bowlers/:season
```

**Frontend Pages**:
- `/cricket/news`: News feed, filtering, article details
- `/cricket/matches`: Live and upcoming matches
- `/cricket/stats`: Player statistics and comparisons

**Tests**: >80% coverage (provider abstraction, ingestion, caching, attribution)

**Specification**: `.agents/tasks/phase-m-cricket-data-spec.md`

---

## Phase N: Notifications & User Account

**Branch**: feature/phase-n-notifications (from main after J merge)  
**Timeline**: 1.5–2 hours  
**Type**: Email/push notifications + account management

### Deliverables

**Backend Services**:
- `NotificationService`: Create, send, manage notifications
- `UserAccountService`: Profile, preferences, account deletion
- Email provider integration (SendGrid or similar)
- Push notification setup (Firebase Cloud Messaging)

**Database Models**:
- `UserNotificationPreference`: Notification channel preferences
- `UserNotification`: Notification inbox
- `PushSubscription`: Web push subscription tokens

**API Endpoints**:
```
GET    /v1/users/notifications
POST   /v1/users/notifications/:id/read
GET    /v1/users/me/profile
PATCH  /v1/users/me/preferences
POST   /v1/users/me/delete-account
```

**Frontend**:
- `NotificationCenter` component (dropdown, unread count)
- `/account/notifications`: Notification history
- `/account/settings`: Profile, preferences, 2FA
- Email templates (subscription, auction, notifications)

**Tests**: >80% coverage (notification dispatch, preferences, account deletion)

**Specification**: `.agents/tasks/phase-n-notifications-spec.md`

---

## Launch Strategy

### Timing

```
Phase J: Merge to main
   ↓ (all 4 launch simultaneously)
Phase K: Exports
Phase L: Payments  
Phase M: Cricket Data
Phase N: Notifications
   ↓ (all independent, no cross-phase dependencies)
Parallel execution: 1.5–3 hours each
   ↓ (all merge to main in sequence)
Phase O: Admin (after all K–N merge)
```

### Independence Verification

**Phase K** (Exports):
- ✅ No dependency on L, M, N
- ✅ Uses Phase J (live auction) UI context only
- ✅ Can merge independently

**Phase L** (Payments):
- ✅ No dependency on K, M, N
- ✅ Blocks room creation (enforces subscription)
- ✅ Can merge independently

**Phase M** (Cricket Data):
- ✅ No dependency on K, L, N
- ✅ Standalone data ingestion service
- ✅ Can merge independently

**Phase N** (Notifications):
- ✅ No dependency on K, L, M
- ✅ User account features only
- ✅ Can merge independently

### Merge Order (After All Complete)

Suggested merge order (no blockers):
1. Phase K (exports) → main
2. Phase L (payments) → main
3. Phase M (cricket data) → main
4. Phase N (notifications) → main
5. Phase O waits for all 4 to merge

---

## Workflow Launch Commands

**Phase K**:
```bash
kiro launch-workflow \
  --template bundled://feature-pipeline \
  --runLabel "phase-k-exports" \
  --workdir d:\UNDER-THE-HAMMER \
  --input task="Phase K: Team Exports & Graphics. Implement SquadExportService (PDF, CSV), PurseExportService (CSV, JSON), GraphicsService (lineup graphics). Create 6 export endpoints. Frontend: ExportMenu, ShareSquadCard components, useSquadExport hook. Files: 3 services, 1 controller, 2 components, 1 hook, 3 tests. No hardcoded values. Caching strategy for exports. See .agents/tasks/phase-k-exports-spec.md"
```

**Phase L**:
```bash
kiro launch-workflow \
  --template bundled://feature-pipeline \
  --runLabel "phase-l-payments" \
  --workdir d:\UNDER-THE-HAMMER \
  --input task="Phase L: Subscriptions & Payments. Implement SafepayService, SubscriptionService, subscription enforcement. Create subscription database models. Implement 7 subscription endpoints, webhook handler. Frontend: PricingPage, CheckoutPage, BillingPage. Files: 3 services, 2 controllers, 3 frontend pages, 2 hooks, 3 tests. Webhook idempotency and retry logic. Environment vars for Safepay credentials. See .agents/tasks/phase-l-payments-spec.md"
```

**Phase M**:
```bash
kiro launch-workflow \
  --template bundled://feature-pipeline \
  --runLabel "phase-m-cricket-data" \
  --workdir d:\UNDER-THE-HAMMER \
  --input task="Phase M: Cricket News & Live Data. Implement abstract DataProvider interface and ESPN implementation. Create NewsIngestionService, LiveMatchService, PlayerStatsService. Background jobs for data sync. Frontend: News page, Matches page, Stats page. Files: 3 services, 1 provider interface, 1 ESPN impl, 3 worker jobs, 3 frontend pages, 3 tests. Data attribution required. Caching strategy. See .agents/tasks/phase-m-cricket-data-spec.md"
```

**Phase N**:
```bash
kiro launch-workflow \
  --template bundled://feature-pipeline \
  --runLabel "phase-n-notifications" \
  --workdir d:\UNDER-THE-HAMMER \
  --input task="Phase N: Notifications & User Account. Implement NotificationService, UserAccountService. Email and push notification integrations. Create notification preference models. Frontend: NotificationCenter, NotificationPage, AccountSettings pages. Email templates. Files: 2 services, 2 controllers, 3 frontend pages, 2 hooks, 3 tests. GDPR compliance (export, delete). Notification templates. See .agents/tasks/phase-n-notifications-spec.md"
```

---

## Monitoring

**Watch for notifications** from each workflow:
- Phase K: Planning → Implementation → Review → Merge
- Phase L: Planning → Implementation → Review → Merge
- Phase M: Planning → Implementation → Review → Merge
- Phase N: Planning → Implementation → Review → Merge

**All 4 run independently**. No need to wait for one to complete before others finish.

---

## Post-Merge

After all 4 phases merge to main:
- ✅ Exports working (team squad PDFs, purse CSVs, graphics)
- ✅ Payments integrated (Safepay, subscription gating)
- ✅ Cricket data flowing (news, live scores, player stats)
- ✅ Notifications sending (email, push)

**Next**: Phase O (Admin Application) launches
**Timeline**: 3–4 hours
**Start**: After all K–N merged

---

## Status Tracking

| Phase | Status | Timeline | Branch | Merge Gate |
|-------|--------|----------|--------|-----------|
| K | READY | 1.5–2h | feature/phase-k-exports | TypeScript strict, tests >80%, no secrets |
| L | READY | 2–2.5h | feature/phase-l-payments | TypeScript strict, tests >80%, no secrets |
| M | READY | 2.5–3h | feature/phase-m-cricket-data | TypeScript strict, tests >80%, no secrets |
| N | READY | 1.5–2h | feature/phase-n-notifications | TypeScript strict, tests >80%, no secrets |

---

## Notes

- **Phase H Setup**: User still needs to run `.agents/phase-h-database-setup.sh` locally before production deployment
- **Credentials**: Each phase may need new env vars (Safepay, SendGrid, ESPN API key)
- **Worktrees**: Each phase creates separate worktree for isolation
- **Branches**: Each phase gets own feature branch from main
- **Testing**: All phases include comprehensive test coverage

---

**Ready to launch all 4 phases immediately after Phase J merges to main.** ✅
