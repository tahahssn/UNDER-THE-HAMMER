# Phases K–N: Parallel Launch Plan

**Status**: Ready for parallel execution after Phase J merges to main  
**Independence**: All 4 phases are independent (no cross-dependencies)  
**Timing**: Launch all 4 simultaneously after J merge completes  
**Expected duration**: 1.5–3 hours per phase (6–12 hours total parallel wall-clock time)  
**Success criterion**: All 4 phases implement, test (>80% coverage), review-loop, and merge to main

---

## Parallelization Strategy

After Phase J merges to main (aa0d86f → phase-j-merge):

```
Main Branch: aa0d86f (Phase I merged)
                ↓
         Phase J completes & merges
                ↓ (new HEAD: phase-j-merge-sha)
   ┌────────────┬─────────────┬──────────────┬────────────┐
   ↓            ↓             ↓              ↓            ↓
Phase K    Phase L       Phase M         Phase N         (N/A)
(Exports)  (Payments)    (Cricket Data)  (Notifications) (Phase O queued)
   ↓            ↓             ↓              ↓            
   └────────────┴─────────────┴──────────────┴────────────┘
                           ↓
                   All merge to main (new HEAD)
                           ↓
                   Phase O (Admin App) launches
                           ↓
                   Phase P (Hardening) launches
```

---

## Phase K: Squad Exports

**Workflow**: `bundled://feature-pipeline`  
**Branch**: `feature/phase-k-squad-exports` (from main post-J)  
**Duration**: ~2h  
**Deliverables**:
- CSV export endpoint: GET /auctions/:id/squads/export (CSV format)
- Excel export endpoint: GET /auctions/:id/squads/export?format=xlsx (XLSX format)
- Export service: `SquadExportService` (backend)
- Download component: `SquadExportDownload.tsx` (frontend)
- Tests: 60+ tests (unit, integration, E2E with both formats)

**Files changed**: ~12 (1 backend service, 2 endpoints, 1 frontend component, tests, migrations if needed)

---

## Phase L: Payment Integration

**Workflow**: `bundled://feature-pipeline`  
**Branch**: `feature/phase-l-payment-integration` (from main post-J)  
**Duration**: ~2.5h  
**Deliverables**:
- Stripe integration: checkout session creation, webhook handling, idempotent processing
- Payment service: `StripePaymentService` with provider abstraction
- Subscription checkout: host subscription purchase flow
- Tournament entry payments: team entry fee collection
- Payment ledger: immutable record of all transactions
- Tests: 80+ tests (Stripe mocking, idempotency, webhook retry, permission boundaries)

**Files changed**: ~20 (payment service, webhooks, DTOs, frontend checkout, tests, schema migration)

**Decision point**: Stripe or alternative provider — assume Stripe; if different, update decision table.

---

## Phase M: Live Cricket Data Integration

**Workflow**: `bundled://feature-pipeline`  
**Branch**: `feature/phase-m-cricket-data` (from main post-J)  
**Duration**: ~2h  
**Deliverables**:
- Cricket data provider abstraction: `ICricketDataProvider` interface
- Initial provider: ESPN/cricapi (configurable, not hardcoded)
- Data refresh service: polling or webhook-based live stats
- Player stats endpoint: GET /players/:id/stats (live data + historical)
- Match info endpoint: GET /matches/:id (live scores, commentary)
- Cache layer: Redis (optional, for performance)
- Tests: 70+ tests (provider mocking, rate limits, data freshness, error recovery)

**Files changed**: ~15 (provider interface, implementation, services, endpoints, caching, tests)

**Decision point**: Which data provider? Default to espncricinfo or cricapi; user confirms.

---

## Phase N: Notifications

**Workflow**: `bundled://feature-pipeline`  
**Branch**: `feature/phase-n-notifications` (from main post-J)  
**Duration**: ~2.5h  
**Deliverables**:
- Notification types: BidPlaced, BidWon, BreakStarted, BreakEnded, AuctionEnded, SubscriptionExpiring
- Channels: Email, SMS (Twilio), In-app toast + persisted list
- Notification service: `NotificationService` with per-channel adapters
- User notification preferences: opt-in/opt-out per channel and type
- In-app notification list page: apps/web/src/app/account/notifications
- Tests: 85+ tests (all channels, delivery retry, rate limits, preference logic, E2E)

**Files changed**: ~18 (notification service, adapters, schema, preferences, frontend page, tests)

**Decision point**: Email provider (SendGrid/AWS SES) and SMS provider (Twilio)? Default to SendGrid + Twilio.

---

## Launch Commands (Post–Phase J Merge)

After Phase J workflow completes and merges, execute these commands in parallel:

```bash
# Terminal 1: Phase K
cd d:\UNDER-THE-HAMMER
pnpm run workflow:launch -- phase-k-squad-exports

# Terminal 2: Phase L
cd d:\UNDER-THE-HAMMER
pnpm run workflow:launch -- phase-l-payments

# Terminal 3: Phase M
cd d:\UNDER-THE-HAMMER
pnpm run workflow:launch -- phase-m-cricket-data

# Terminal 4: Phase N
cd d:\UNDER-THE-HAMMER
pnpm run workflow:launch -- phase-n-notifications
```

Or use Kiro CLI batch launch (if available):

```bash
kiro workflow:batch-launch \
  feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phases "K,L,M,N" \
  --base-branch main \
  --parallel
```

---

## Merge & Next Phase Trigger

**After all K–N complete and merge to main**:

1. Verify all 4 merges to main
2. Main HEAD = new sha after N merge
3. Launch Phase O (Admin App) workflow from new main HEAD
   - Workflow: `bundled://feature-pipeline`
   - Branch: `feature/phase-o-admin-app`
   - Duration: ~3–4h
   - Deliverables: Admin dashboard, staff roles, permission system, audit logging

4. After Phase O merges, launch Phase P (Hardening)
   - Workflow: `bundled://feature-pipeline`
   - Branch: `feature/phase-p-hardening`
   - Duration: ~2–3h
   - Deliverables: Security audit, performance profiling, load testing, deployment guides

---

## Success Criteria

Each phase (K–N) is complete when:
- [ ] Branch exists: `feature/phase-{k/l/m/n}-*`
- [ ] Implementation complete: all deliverables implemented
- [ ] Tests pass: >80% coverage, all scenarios passing
- [ ] TypeScript strict: 0 errors, 0 `any` types (except justified + documented)
- [ ] Design review: APPROVED (or issues fixed in loop)
- [ ] Code review: APPROVED (all findings resolved)
- [ ] Merged to main: PR merged, branch deleted
- [ ] No secrets: 0 credentials in code

---

## Decision Table (K–N)

| Phase | Decision | Choice | Rationale |
|-------|----------|--------|-----------|
| L | Payment provider | Stripe | Industry standard, webhook support, PCI compliance |
| L | Webhook retry | Exponential backoff + DLQ | Idempotency guaranteed, failures recoverable |
| M | Cricket data provider | espncricinfo API + fallback | Free tier, reliable, cricket-specific data |
| M | Data refresh | 10-min polling + webhook on match events | Balances freshness and API rate limits |
| N | Email provider | SendGrid | Transactional reliability, templates, analytics |
| N | SMS provider | Twilio | Global coverage, testing sandbox, event webhooks |

---

## Timeline (Wall-Clock)

| Phase | Parallel Duration | Sequential Cumulative | 
|-------|-------------------|-----------------------|
| K | 2h | — |
| L | 2.5h | — |
| M | 2h | — |
| N | 2.5h | — |
| **K–N together** | **~2.5h** (longest wins) | **2.5h** |
| O (Admin, after K–N merge) | 3.5h | 6h |
| P (Hardening, after O merge) | 2.5h | 8.5h |
| **Total (phases A–P)** | — | **~8.5h from start of K** |

---

## Notes

- Each workflow is `bundled://feature-pipeline`, which includes design → plan → implement-loop → merge → PR
- No manual worktrees: each workflow creates its own (feature/phase-* branch)
- Parallel execution means wall-clock time is ~2.5h (longest single phase), not 10h (sequential)
- After all K–N merge, main is ready for O and P
- After P merges, platform is feature-complete (16/16 phases done)

