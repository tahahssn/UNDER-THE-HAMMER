# Phase L: Subscriptions & Payments (SafePay)

**Status**: Ready to launch (Phase J merged to main)  
**Workflow**: `bundled://feature-pipeline`  
**Base branch**: main (at cc5c32a)  
**Feature branch**: `feature/phase-l-payments`  
**Expected duration**: ~2–2.5 hours  
**Blockers**: None (all phases up to J complete; SafePay sandbox account available)

---

## Deliverables

### Backend

**Subscription Service** (`apps/api/src/payments/services/subscription.service.ts`)
- Subscription plan management (reading from config, Phase F already has SubscriptionPlan model)
- Entitlement checks: `isHostSubscriptionActive(userId)` → boolean
- Subscription enforcement: used by room creation to gate host eligibility
- Methods:
  - `getUserSubscription(userId)` → returns active subscription or null
  - `enforceHostSubscription(userId)` → throws 403 if not subscribed
  - `getSubscriptionPlans()` → list of available plans
  - `checkSubscriptionStatus(userId)` → { status, expiresAt, plan }

**SafePay Service** (`apps/api/src/payments/services/safepay.service.ts`)
- Initialize SafePay client from `SAFEPAY_API_KEY` environment variable
- Create checkout session: `createCheckoutSession(planId, userId, metadata)`
  - Input: plan ID, user ID, optional metadata
  - Output: `{ sessionId: string, redirectUrl: string }`
  - Idempotency: use combination of (userId, planId, timestamp) as idempotency key
- Webhook handler: `handleWebhookEvent(rawBody, signature)`
  - Verify signature with SafePay signature verification
  - Handle: checkout success, payment confirmed, refund initiated
  - For success: create/update Subscription record, record transaction in ledger
  - For refund: log and alert (handle refunds as edge case per AGENTS.md)
- Retrieve session: `getCheckoutSession(sessionId)` for status checks
- Refund handler: `processRefund(transactionId, reason)` → marks subscription as REFUNDED

**Payment Ledger Service** (`apps/api/src/payments/services/payment-ledger.service.ts`)
- Immutable record of all transactions (audit trail)
- Methods:
  - `recordPayment(userId, planId, provider, externalId, status, metadata)` → returns ledger entry
  - `recordRefund(paymentId, reason)` → marks as REFUNDED
  - `getPaymentsForUser(userId)` → all ledger entries
  - `getPaymentByExternalId(externalId)` → lookup by SafePay transaction ID

**Payment Ledger Schema** (Prisma migration)
```prisma
model PaymentLedger {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  subscriptionId    String?
  subscription      Subscription? @relation(fields: [subscriptionId], references: [id])
  planId            String   // SubscriptionPlan id
  plan              SubscriptionPlan @relation(fields: [planId], references: [id])
  amountMinor       BigInt   // amount in paisa (Pakistani rupee minor unit)
  status            String   // 'pending', 'completed', 'failed', 'refunded'
  provider          String   // 'safepay'
  externalId        String   // SafePay transaction ID
  metadata          Json?    // extra context
  createdAt         DateTime @default(now())
  
  @@index([userId])
  @@index([externalId])
  @@unique([provider, externalId])
}
```

**Webhook Controller** (`apps/api/src/payments/controllers/webhook.controller.ts`)
- POST `/v1/payments/webhook/safepay` → receives SafePay webhook event
- No auth required (SafePay signature verification is the auth)
- Idempotent: `@@unique([provider, externalId])` prevents double-processing
- Returns 200 immediately (webhook acknowledgment); processing happens
- Logs all events for audit trail

**Subscription Endpoints** (`apps/api/src/payments/controllers/subscriptions.controller.ts`)
- POST `/v1/subscriptions/checkout/:planId` (authenticated)
  - Input: `{ planId: string, metadata?: {} }`
  - Output: `{ sessionId, redirectUrl }`
  - Redirect user to SafePay-hosted form
- GET `/v1/subscriptions/current` (authenticated)
  - Returns active subscription with plan details, renewal date
  - Response: `{ id, planId, status, expiresAt, plan: { name, priceMinor, features } }`
- POST `/v1/subscriptions/:id/cancel` (authenticated)
  - Marks subscription as CANCELLED
  - Future: check if refund request needed
- GET `/v1/subscriptions/invoices` (authenticated)
  - Returns payment ledger for user (invoice history)

**Tests** (`apps/api/src/payments/services/*.spec.ts`, controllers)
- Subscription service: active check, expired check, enforcement
- SafePay service: session creation, webhook signature verification, idempotency
- Ledger: record payment, record refund, query payments, unique constraint on external ID
- Controller: authorized POST to /checkout, unauthorized requests 401, webhook signature failure 401
- Webhook: checkout success creates subscription, duplicate events ignored, malformed signature rejected
- Edge cases: missing SAFEPAY_API_KEY, invalid planId, conflicting idempotency keys, expired subscription
- 60+ tests, >90% coverage

### Frontend

**Pricing Page** (`apps/web/src/app/pricing/page.tsx`)
- Display subscription plans with features, pricing (in PKR)
- CTA button: "Subscribe Now"
- Responsive card grid (1 col mobile, 3 cols desktop)
- Highlight current plan if already subscribed
- Comparison table (optional)

**Checkout Page** (`apps/web/src/app/checkout/page.tsx`)
- Receive planId from URL param or redirect
- Display plan summary
- SafePay payment form (redirects to SafePay-hosted checkout)
- Loading state during redirect
- Success/error handling after return from SafePay

**Billing Page** (`apps/web/src/app/account/billing/page.tsx`)
- Current subscription status (plan, next renewal, cancel button)
- Invoice history (table: date, amount, status, download receipt)
- Upgrade/downgrade plan link (future enhancement)
- Empty state if no subscription

**Subscription Status Component** (`apps/web/src/components/account/SubscriptionStatus.tsx`)
- Shows active subscription (host only) or upsell to subscribe
- If active: plan type, renewal date, button to manage
- If inactive: "Subscribe to host auctions" + link to pricing page

**Hook** (`apps/web/src/hooks/useSubscription.ts`)
- `useSubscription()` → `{ subscription, loading, error }`
- Fetches `GET /api/v1/subscriptions/current`
- 5-min cache (browser storage)
- Refresh on mount + 60-min background refresh

**Tests** (`apps/web/src/app/pricing/page.spec.tsx`, etc.)
- Pricing page: renders all plans, pricing in PKR, CTA functional
- Checkout: displays summary, handles SafePay redirect
- Billing: shows invoices, cancel button, renewal date
- Hook: fetch success, 401/403 handling, cache behavior
- Responsive: mobile/desktop layouts
- 25+ tests, >90% coverage

---

## Integration Points

- **Phase B** (auth): subscription requires authenticated user (JWT)
- **Phase F** (rooms): host must have active subscription to create/manage rooms (gate already in place, Phase L enforces)
- **Existing subscription field**: User model already has subscription relations (Phase B schema)
- **Existing SubscriptionPlan**: Phase F has SubscriptionPlan model with pricing
- **Migration**: Add PaymentLedger table + relation to Subscription

---

## Success Criteria

- [ ] POST `/v1/subscriptions/checkout/:planId` creates SafePay session
- [ ] SafePay webhook handler (POST `/v1/payments/webhook/safepay`) processes events
- [ ] Payment ledger immutable + idempotent (no double-charges)
- [ ] SafePay signature verification (401 on invalid signature)
- [ ] GET `/v1/subscriptions/current` returns active subscription
- [ ] Subscription enforcement: room creation fails 403 if not subscribed
- [ ] TypeScript strict (0 errors, no `any`)
- [ ] Tests passing (60+ tests, >85% coverage)
- [ ] No hardcoded SafePay keys (use env vars)
- [ ] No secrets in code
- [ ] Responsive checkout button + pricing page (mobile + desktop)
- [ ] Pricing displayed in PKR (Pakistani Rupee)
- [ ] Error messages user-friendly (payment declined, etc.)

---

## Files to Create/Modify

**Backend**:
- `apps/api/src/payments/services/subscription.service.ts` (new)
- `apps/api/src/payments/services/subscription.service.spec.ts` (new)
- `apps/api/src/payments/services/safepay.service.ts` (new)
- `apps/api/src/payments/services/safepay.service.spec.ts` (new)
- `apps/api/src/payments/services/payment-ledger.service.ts` (new)
- `apps/api/src/payments/services/payment-ledger.service.spec.ts` (new)
- `apps/api/src/payments/controllers/subscriptions.controller.ts` (new)
- `apps/api/src/payments/controllers/webhook.controller.ts` (new)
- `apps/api/src/payments/dtos/*.dto.ts` (new: CheckoutDto, WebhookDto, SubscriptionDto)
- `prisma/schema.prisma` (modify: add PaymentLedger model, add relation to Subscription)
- `prisma/migrations/*/payment_ledger.sql` (migration file)

**Frontend**:
- `apps/web/src/app/pricing/page.tsx` (new)
- `apps/web/src/app/checkout/page.tsx` (new)
- `apps/web/src/app/account/billing/page.tsx` (new)
- `apps/web/src/hooks/useSubscription.ts` (new)
- `apps/web/src/hooks/useSubscription.spec.ts` (new)
- `apps/web/src/components/account/SubscriptionStatus.tsx` (new)
- Tests for pricing, checkout, billing pages (5+ test files)

**Environment**:
- `.env.local` (add `SAFEPAY_API_KEY`, `SAFEPAY_WEBHOOK_SECRET`)
- `.env.example` (already has placeholders, fill in description)

**Tests**: 60+ total (40 backend, 20 frontend)

---

## Decisions Already Made

| Item | Decision | Why |
|------|----------|-----|
| Provider | SafePay | Pakistan-first market; international expansion uses same interface |
| Idempotency | (userId, planId, timestamp) + provider/externalId unique constraint | Prevents double-charges, works across retries |
| Webhook ack | 200 immediately | Webhook reliability; processing can be async |
| Ledger immutability | append-only with refund records | Audit trail, no data mutation, compliance |
| Currency | PKR (Pakistani Rupee) | Pakistan market; minor unit = paisa |
| BigInt handling | As strings in JSON | No scientific notation |

---

## Environment Variables Required

```bash
SAFEPAY_API_KEY=... (from SafePay dashboard/sandbox)
SAFEPAY_WEBHOOK_SECRET=... (from SafePay dashboard > Webhooks)
```

---

## Notes

- SafePay test mode uses sandbox URLs (verify current SafePay docs for sandbox endpoint)
- Webhook URL: `https://<api-host>/api/v1/payments/webhook/safepay` (register in SafePay dashboard)
- Ledger entries are permanent; refunds create new entries with status REFUNDED
- Subscription status check: query ledger for most recent non-refunded entry of that user
- Future enhancements: recurring billing, usage-based pricing, proration, renewal reminders
- International expansion: create new provider implementation (Stripe, PayPal, etc.) implementing same interface

