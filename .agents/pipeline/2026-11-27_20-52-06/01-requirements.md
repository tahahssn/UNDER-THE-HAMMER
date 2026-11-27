# Phase L: Subscriptions & Payments (SafePay)

**Status:** Requirements for design and implementation  
**Version:** 1.0  
**Date:** 2026-11-27  
**Provider:** SafePay (Pakistan market, provider-independent adapter for future international scaling)

---

## Summary

Implement host subscription entitlements and payment processing using SafePay checkout sessions and webhooks. Create immutable financial audit trail through PaymentLedger. Enable users to view, manage and cancel subscriptions; implement subscription gating for room hosting; handle payment success/failure and refund workflows with idempotency and webhook reliability.

Backend: 8 files (SafepayService, SafepayService spec, SubscriptionService enhancements + spec, 2 controllers, 1 DTO, 1 migration).  
Frontend: 7 files (PricingPage, CheckoutPage, BillingPage, SubscriptionStatus component, 2 custom hooks, integration tests).  
Database: PaymentLedger table (append-only), Payment/Refund/Invoice schema expansion.  
Tests: 60+ covering checkout flow, webhook idempotency, refund paths, authorization boundaries.  
Currency: PKR (paisa minor unit, integers only).  
Stack: TypeScript strict, NestJS, Prisma, Next.js React, no hardcoded SafePay credentials.

---

## Functional Requirements

### 1. Subscription Plans and Pricing

| Requirement | Details |
|---|---|
| **List plans** | GET `/v1/subscriptions/plans` returns active subscription plans with pricing in PKR minor units (paisa). Public, no auth required. Plans include: id, key, name, priceMinor, currency, period (MONTH/YEAR), entitlements (hostingEnabled, maxActiveRooms, maxTeamsPerRoom, maxSpectatorsPerRoom). |
| **Plan entitlements** | Entitlements are stored in SubscriptionEntitlement (planId, key, intValue, boolValue). At minimum: `hostingEnabled=true`, `maxActiveRooms=integer`, `maxTeamsPerRoom=integer`, `maxSpectatorsPerRoom=integer`. Extensible for future limits (maxRoomDurationMinutes, etc.). |
| **Admin plan management** | (Deferred to admin phase) Staff can create, update and activate/deactivate plans through admin API. Plans must include clear pricing in PKR and human-readable descriptions. |

### 2. Checkout Session Creation

| Requirement | Details |
|---|---|
| **Initiate checkout** | POST `/v1/subscriptions/checkout/:planId` accepts authenticated user, creates checkout session through SafePay adapter, returns `checkoutUrl` and `sessionId` for client redirect. |
| **Idempotency** | Client provides `idempotencyKey` (UUID) in request body. Duplicate keys within 24 hours return cached response without creating duplicate Payment records. Backend generates if client does not provide. |
| **Session data** | SafepayService creates Payment record with status=PENDING, amountMinor=planPrice, currency=PKR, purpose=HOST_SUBSCRIPTION, subscriptionId=null initially, idempotencyKey=unique. Stores provisionalSessionId from SafePay response. Payment is immutable; updates flow through new records (refunds, webhooks). |
| **Error handling** | Invalid/inactive planId: 400 Bad Request. User already has active subscription: 409 Conflict (optional, may allow upgrade/downgrade workflow later). SafePay API unavailable: 503 Service Unavailable with retry hint. |
| **Link generation** | SafepayService calls SafePay SDK to create checkout session with: amount (paisa), currency (PKR), userEmail, orderRef=Payment.idempotencyKey, returnUrl=`web:checkout-callback/:planId/:sessionId`, metadata={planId, userId}. |

### 3. Payment Webhook Handling

| Requirement | Details |
|---|---|
| **Webhook endpoint** | POST `/v1/payments/webhook/safepay` accepts SafePay signed webhook. No auth required (signature verification is auth). |
| **Signature verification** | Extract `x-safepay-signature` header. Reconstruct payload body. Compute HMAC-SHA256(body, SAFEPAY_WEBHOOK_SECRET). Compare in constant time. Reject if signature invalid (401). |
| **Event processing** | SafePay sends `payment_success` and `payment_failed` events. `payment_success` event contains providerPaymentId, amountMinor, orderRef (matches Payment.idempotencyKey). |
| **Idempotency** | Store each webhook in ProviderWebhookEvent (providerConfigId, providerEventId, eventType, payload, processedAt). Unique constraint on (providerConfigId, providerEventId). Process event once; replay detection prevents double settlement. Webhook processing is transactional: update Payment status, create FinancialLedgerEntry, activate Subscription, update Subscription.paidAt in single transaction. |
| **Success flow** | On `payment_success`: Payment.status=PAID, Payment.paidAt=now(). Create Subscription record (status=ACTIVE, currentPeriodStart=now(), currentPeriodEnd=now() + period). Create Invoice record. Create FinancialLedgerEntry (PAYMENT_RECEIVED). Emit AuctionEvent or internal event for push/email notification. |
| **Failure flow** | On `payment_failed`: Payment.status=FAILED. Create FinancialLedgerEntry (PAYMENT_FAILED). Do NOT activate Subscription. Send failure notification. |
| **Retry behavior** | If webhook processing throws (e.g., database transient error), store error in ProviderWebhookEvent.processingError and return 202 Accepted. SafePay will retry webhook. Subsequent identical webhook (same providerEventId) is a no-op due to idempotency. |

### 4. Subscription Status and Management

| Requirement | Details |
|---|---|
| **Get current subscription** | GET `/v1/subscriptions/current` (authenticated). Returns user's most recent active Subscription with plan details, currentPeriodStart/End, cancelAtPeriodEnd flag. Returns null if no active subscription. |
| **Get subscription entitlements** | GET `/v1/subscriptions/entitlements` (authenticated). Returns user's active subscription entitlements (hostingEnabled, maxActiveRooms, etc.) or restrictive defaults if no active subscription. Used by room-creation endpoint to validate user eligibility. |
| **Cancel subscription** | POST `/v1/subscriptions/:id/cancel` (authenticated, user must own subscription). Sets Subscription.cancelAtPeriodEnd=true (soft cancel, not immediate). Cancellation takes effect at next renewal. Create FinancialLedgerEntry (SUBSCRIPTION_CANCEL_REQUESTED). Return updated Subscription. Cancel endpoint returns 204 No Content after success. |
| **List invoices** | GET `/v1/subscriptions/invoices` (authenticated). Paginates user's Invoice records (linked via Payment → Subscription). Returns invoice summary: amount, date, status, downloadUrl (future: S3 signed URL for PDF). |
| **Authorization** | All endpoints enforce ownership: `/subscriptions/:id` requires user.sub === Subscription.userId, else 403 Forbidden. Use @CurrentUser() decorator + guard. |

### 5. Payment Ledger (Audit Trail)

| Requirement | Details |
|---|---|
| **Immutable records** | FinancialLedgerEntry table: id, paymentId, entryType (PAYMENT_RECEIVED, PAYMENT_FAILED, REFUND_REQUESTED, REFUND_SUCCEEDED, SUBSCRIPTION_CANCEL_REQUESTED), amountMinor, reason, createdAt. No updates after creation (audit-only). |
| **Entry creation** | Every financial operation creates one or more ledger entries: payment success, payment failure, refund request, refund success, subscription cancellation. Never modify or delete entries. |
| **Admin audit access** | Admin can query ledger entries filtered by user, date range, entry type. Used for reconciliation, support investigation and compliance reporting. (Implementation deferred to admin phase.) |

### 6. Refund Workflow

| Requirement | Details |
|---|---|
| **Refund request** | (Initial design scope: manual staff refund only. Automated customer refund requests deferred.) Admin initiates refund through staff API (future). Creates Refund record (status=REQUESTED, amountMinor, reason, requestedById). |
| **Refund submission** | Staff approves refund (status=APPROVED). Backend submits refund to SafePay API (Refund.status=SUBMITTED). SafePay returns refundId. Store in Refund.providerRefundId. |
| **Webhook on refund success** | SafePay sends `refund_success` webhook. Payment.status=PARTIALLY_REFUNDED or REFUNDED (depending on amount). Create Refund ledger entry. Update original Payment's refundStatus. |
| **Error handling** | Refund submission fails (network, SafePay API error): Refund.status=FAILED, store error message. Retry manually later. No automatic retries in Phase L. |

### 7. Authorization and Subscription Gating

| Requirement | Details |
|---|---|
| **Room hosting eligibility** | POST `/v1/rooms` (create room) calls SubscriptionsService.canUserHost(userId). Returns false if user has no active subscription or hostingEnabled=false. Reject room creation with 403 Forbidden, reason: "Active subscription required to host a room". |
| **Team count validation** | POST `/v1/rooms` calls SubscriptionsService.checkEntitlements(userId) to fetch maxTeamsPerRoom. Backend enforces: if room.teamCount > entitlements.maxTeamsPerRoom, reject with 400 Bad Request. |
| **Role-based access** | All staff payment operations (approve refunds, view ledger, adjust invoices) require `payments.refund` permission. Use @Permission() decorator. Audit all staff actions. |

### 8. Frontend: Pricing and Checkout

| Requirement | Details |
|---|---|
| **PricingPage** | GET `/pricing` or `/subscriptions`. Displays active plans from API in a card grid: plan name, price in PKR, period (month/year), entitlements as bullet list, CTA button "Subscribe Now" or "Manage Subscription" (if already subscribed). Responsive layout (1 col mobile, 2-3 cols desktop). Include testimonials or trust indicators (optional design). |
| **CheckoutPage** | Renders SafePay checkout iframe/redirect. Handles redirects from SafePay callback (success/failure). On success: redirect to `/billing` with toast "Subscription activated". On failure: show error, offer retry with client-side button. Stores sessionId in component state. |
| **BillingPage** | GET `/billing`. Shows user's current subscription (if active) with renewal date, plan name, price, cancel button. Shows invoice history table (last 12 months): date, amount, status, link to download/view. If no active subscription, shows "No active subscription" and link to `/pricing`. |
| **SubscriptionStatus component** | Used in profile dropdown and room-creation workflows. Shows subscription status (ACTIVE, GRACE, CANCELLED, EXPIRED). Used to disable "Host Room" button if ineligible. |

### 9. Frontend: Custom Hooks

| Requirement | Details |
|---|---|
| **useSubscription()** | Hook returns current subscription data: { subscription, isLoading, error, refetch }. Calls GET `/v1/subscriptions/current` on mount and manual refetch. |
| **useCheckout(planId)** | Hook manages checkout flow: { initiateCheckout, isLoading, checkoutUrl, error }. Calls POST `/v1/subscriptions/checkout/:planId` with idempotencyKey (auto-generated UUID). Handles network errors and duplicate-key caching (user sees same URL on retry). |

### 10. Environment Variables

| Variable | Purpose | Example | Sensitive |
|---|---|---|---|
| `SAFEPAY_API_KEY` | SafePay API authentication | `sk_live_...` | Yes, server-only |
| `SAFEPAY_WEBHOOK_SECRET` | HMAC key for webhook signature verification | `whsec_...` | Yes, server-only |
| `SAFEPAY_MERCHANT_ID` | SafePay merchant identifier | `merchant_12345` | No |
| `SAFEPAY_MODE` | Sandbox or Live | `sandbox` or `live` | No |
| `DATABASE_URL` | Neon PostgreSQL connection (pooled) | `postgresql://user:pass@host/db` | Yes |
| `DIRECT_URL` | Neon PostgreSQL direct connection (migrations) | `postgresql://user:pass@host/db` | Yes |

---

## Non-Functional Requirements

### Performance and Scalability

1. **Checkout session creation** must respond in <1 second (excluding SafePay API latency). Idempotency cache prevents redundant SafePay calls.
2. **Webhook processing** must complete within 5 seconds for database operations; SafePay timeout is typically 30 seconds. Return 202 Accepted immediately if processing is queued.
3. **Financial ledger queries** (admin reporting) must support indexed filters (paymentId, entryType, createdAt). Queries must return results in <500ms for single user's data.
4. **Plan list endpoint** is public and cached for 5 minutes (Redis). Invalidate on plan update.

### Security

1. **Never hardcode SafePay credentials** in code. Load from environment only. No credentials in logs or error messages.
2. **Webhook signature validation** is mandatory. Reject unsigned or invalid-signature webhooks.
3. **Idempotency enforcement** prevents replay attacks and ensures exactly-once payment processing.
4. **Authorization checks** are server-side only. Clients must not be trusted to report subscription status.
5. **PII handling** in webhooks: store minimal data (amountMinor, status, timestamp). Never store raw request bodies containing sensitive provider data longer than necessary for immediate processing.
6. **SQL injection prevention** via Prisma parameterization.
7. **CSRF protection** on form submissions (NextAuth/CSRF tokens).
8. **Rate limiting** on checkout and webhook endpoints: 10 req/min per user for checkout, 100 req/min per IP for webhooks.

### Reliability

1. **Webhook idempotency** prevents duplicate subscription activations from replayed webhooks.
2. **Graceful degradation**: if SafePay API is down, return 503 to user; offer manual support path.
3. **Financial audit trail** is append-only and immutable. No deletions or corrections, only compensating entries.
4. **Database transactions** for all payment state changes: Payment.status update, Subscription creation, LedgerEntry creation must all succeed or all fail.
5. **Monitoring**: log all financial operations (payment creation, webhook receipt, status updates) with structured logging (timestamp, userId, paymentId, action, result).

### Compliance

1. **Currency invariant** enforced: all amounts are integers (paisa). No floating-point arithmetic. All monetary comparisons and displays convert from minor units.
2. **Audit trail availability** for support and compliance review: staff can query payments, refunds and ledger entries by user and date range.
3. **Refund documentation** (future): store reason and staff approval chain for transparency.
4. **Invoice generation** (future): stored invoices link to Payment records for reconciliation.

---

## Acceptance Criteria

### Backend: SafepayService

1. **A1**: POST `/v1/subscriptions/checkout/:planId` creates Payment record with PENDING status and unique idempotencyKey. Returns `{ checkoutUrl, sessionId }`. Invalid planId returns 400. ✓
2. **A2**: SafepayService calls SafePay SDK with correct currency (PKR), amount (plan.priceMinor), and orderRef (idempotencyKey). ✓
3. **A3**: Duplicate checkout requests with same idempotencyKey return cached checkoutUrl without creating new Payment. ✓
4. **A4**: POST `/v1/payments/webhook/safepay` validates SafePay signature using SAFEPAY_WEBHOOK_SECRET. Invalid signature returns 401. ✓
5. **A5**: Valid `payment_success` webhook creates/updates Subscription (status=ACTIVE, currentPeriodStart=now(), currentPeriodEnd=now() + period), Payment.status=PAID, creates Invoice, creates FinancialLedgerEntry. ✓
6. **A6**: Replayed webhook (duplicate providerEventId) is a no-op; no duplicate Subscription created. ✓
7. **A7**: SafePay API errors during checkout return 503 with retry guidance. ✓
8. **A8**: SafePay API errors during webhook processing are logged; webhook returns 202 and stores error for retry. ✓

### Backend: SubscriptionService Enhancements

9. **A9**: GET `/v1/subscriptions/current` returns user's active Subscription with full plan details. Returns null if no active subscription. ✓
10. **A10**: GET `/v1/subscriptions/entitlements` returns active subscription's entitlements or safe defaults (hostingEnabled=false, maxActiveRooms=0) if no subscription. ✓
11. **A11**: SubscriptionsService.canUserHost(userId) returns false if user has no active subscription or hostingEnabled=false. ✓
12. **A12**: POST `/v1/subscriptions/:id/cancel` sets cancelAtPeriodEnd=true, creates LedgerEntry, returns 204. User must own subscription (403 if not). ✓
13. **A13**: GET `/v1/subscriptions/invoices` returns paginated Invoice records for user (via Payment → Subscription). ✓

### Backend: Authorization and Financial Auditing

14. **A14**: POST `/v1/rooms` calls canUserHost; rejects with 403 if user has no active subscription. ✓
15. **A15**: POST `/v1/rooms` validates maxTeamsPerRoom against entitlements; rejects with 400 if exceeded. ✓
16. **A16**: FinancialLedgerEntry table has no UPDATE or DELETE operations; all entries are append-only. ✓
17. **A17**: All payment state changes (Payment.status, Subscription creation, Refund status) are transactional; no partial updates. ✓

### Frontend: UI and User Flows

18. **A18**: PricingPage displays active plans from `/v1/subscriptions/plans` with correct PKR pricing (paisa displayed as rupees). ✓
19. **A19**: "Subscribe Now" button on PricingPage redirects to CheckoutPage with planId in URL. ✓
20. **A20**: CheckoutPage renders SafePay checkout and handles success redirect to `/billing?success=true`. ✓
21. **A21**: CheckoutPage shows error message if SafePay checkout fails; offers retry. ✓
22. **A22**: BillingPage shows current subscription (plan, renewal date, cancel button) if active, or "No subscription" message if none. ✓
23. **A23**: BillingPage displays paginated invoice history (last 12 months) with date, amount, status. ✓
24. **A24**: SubscriptionStatus component shows "Active", "Cancelled", or "Expired" status. ✓
25. **A25**: useSubscription() hook fetches current subscription on mount and provides refetch. ✓
26. **A26**: useCheckout(planId) hook initiates checkout and returns checkoutUrl for navigation. ✓

### Testing

27. **A27**: Checkout endpoint creates Payment with correct idempotencyKey and amount. ✓
28. **A28**: Duplicate checkout requests return same checkoutUrl (idempotency verified). ✓
29. **A29**: Webhook with valid signature and `payment_success` activates Subscription. ✓
30. **A30**: Webhook with invalid signature is rejected (401). ✓
31. **A31**: Replayed webhook (duplicate providerEventId) does not create duplicate Subscription. ✓
32. **A32**: User without subscription cannot host a room (403). ✓
33. **A33**: User with subscription and appropriate entitlements can host a room. ✓
34. **A34**: Webhook processing errors are logged and stored; retry succeeds on retry webhook. ✓
35. **A35**: Cancel subscription sets flag; does not activate immediate cancellation. ✓
36. **A36**: FinancialLedgerEntry records all payment events immutably. ✓
37. **A37**: Refund request creates Refund record with REQUESTED status. ✓
38. **A38**: Refund submission calls SafePay API and sets Refund.status=SUBMITTED. ✓
39. **A39**: Refund success webhook updates Payment.status and creates ledger entry. ✓
40. **A40**: All payment operations use PKR minor units (integers); no floating-point arithmetic. ✓

---

## Out of Scope (Phase L)

1. **Automated customer-initiated refunds**: Phase L assumes refunds are staff-initiated only. Customer self-service refund requests are deferred.
2. **Subscription upgrades/downgrades**: Planned for Phase M. Phase L supports one active subscription per user.
3. **Free trial periods**: Subscription free trials are deferred. All subscriptions require payment.
4. **Invoice PDF generation**: Invoices are stored in Invoice table. PDF generation and S3 storage are deferred to Phase M.
5. **Admin staff workflows for plan management**: Staff can create/edit plans via admin API in Phase L (future design), but admin UI is out of scope.
6. **Multi-currency support**: Phase L is PKR only. International payment providers and currency switching are deferred.
7. **Dunning workflows**: Subscription renewal failures and retry loops are deferred.
8. **Tax and compliance**: GST/VAT calculation and reporting are deferred.
9. **Webhook replay tools**: Manual webhook replay for support is deferred to admin tooling phase.
10. **Payment analytics dashboard**: Staff analytics and reporting are deferred.

---

## Assumptions and Open Decisions

### Assumptions

1. **SafePay capabilities**: Assumed SafePay provides checkout session API returning checkoutUrl, webhook callbacks on payment success/failure, and refund submission API. Actual API review needed in design phase.
2. **Subscription period renewal**: Assumed subscriptions auto-renew at currentPeriodEnd. Payment collection at renewal is deferred (Phase M: recurring billing).
3. **Initial plan pricing**: Assumed plans are pre-created (Basic, Pro, Enterprise) with entitlements. Pricing currency is PKR minor units (paisa). Actual plan pricing is deferred to Product decision.
4. **Invoice linking**: Assumed Invoice records link Payment → Subscription, enabling user-facing invoice history. Invoice PDF generation is deferred.
5. **Audit logging scope**: Assumed admin role with `payments.refund` permission can view ledger and approve refunds. Exact role definitions are deferred to admin phase.

### Open Decisions for Design Review

1. **Subscription downgrade behavior**: Can user downgrade mid-period? Pro-rata refund or forfeited? Deferred to Phase M or Product clarification.
2. **Grace period after cancellation**: Should user retain hostingEnabled briefly after soft cancel? Or immediate loss of privilege at cancelAtPeriodEnd=true? Recommend immediate loss for clarity; clarify in design.
3. **Refund approval workflow**: Can any staff with `payments.refund` permission approve refunds, or is two-approval required for large amounts? Recommend one approval in Phase L; two-approval deferred.
4. **SafePay webhook retries**: Does SafePay retry failed webhooks? For how long? Recommend confirming with SafePay documentation in design phase.
5. **Webhook timeout**: Should 202 Accepted response include queue position or retry hint? Recommend simple "queued, check status later" in Phase L.
6. **Payment failure notifications**: Should failed payment trigger email/SMS or in-app notification only? Recommend in-app + email opt-in preference in Phase L.
7. **Plan change timing**: If user purchases Plan B while Plan A is active, does Plan B activate immediately or at Plan A's renewal? Recommend immediate activation (soft cancel Plan A, activate Plan B) in Phase M; note assumption here.

---

## Implementation Notes

### Backend Structure

**Files to create/modify:**
1. `apps/api/src/payments/safepay.service.ts` — Checkout session creation, SafePay SDK integration.
2. `apps/api/src/payments/safepay.service.spec.ts` — SafepayService unit tests.
3. `apps/api/src/subscriptions/subscriptions.service.ts` — Enhancements to existing SubscriptionsService (canUserHost, checkEntitlements already exist; add invoice listing, cancel logic).
4. `apps/api/src/subscriptions/subscriptions.service.spec.ts` — Enhanced SubscriptionsService tests.
5. `apps/api/src/payments/payments.controller.ts` — Webhook endpoint and payment status checks.
6. `apps/api/src/subscriptions/subscriptions.controller.ts` — Enhancements: cancel, invoices, entitlements (already partially exists).
7. `apps/api/src/payments/create-payment-ledger.migration.ts` — Prisma migration to add FinancialLedgerEntry table.
8. `packages/contracts/payments.dto.ts` — DTO for checkout request/response, webhook payload, refund request.

**Integration points:**
- `/v1/subscriptions/checkout/:planId` → SafepayService → SafePay SDK → Payment record creation.
- `/v1/payments/webhook/safepay` → Signature verification → Webhook processing → Subscription activation / failure handling.
- `/v1/subscriptions/current`, `/subscriptions/entitlements` → SubscriptionsService (mostly existing, enhanced).
- Room creation (`/v1/rooms`) → SubscriptionsService.canUserHost() check (guard already exists, enhance it).

### Frontend Structure

**Files to create:**
1. `apps/web/src/pages/pricing.tsx` — PricingPage component.
2. `apps/web/src/pages/checkout.tsx` — CheckoutPage with SafePay iframe/redirect handling.
3. `apps/web/src/pages/billing.tsx` — BillingPage with subscription and invoice history.
4. `apps/web/src/components/SubscriptionStatus.tsx` — Badge component showing subscription status.
5. `apps/web/src/hooks/useSubscription.ts` — Custom hook for fetching current subscription.
6. `apps/web/src/hooks/useCheckout.ts` — Custom hook for initiating checkout.
7. `apps/web/src/__tests__/subscriptions.integration.test.ts` — Integration tests (60+ tests covering flows).

**Integration points:**
- GET `/v1/subscriptions/plans` → PricingPage plan list.
- POST `/v1/subscriptions/checkout/:planId` → CheckoutPage initiation.
- Callback redirect from SafePay → CheckoutPage success/error handling.
- GET `/v1/subscriptions/current` → BillingPage current subscription, SubscriptionStatus component.
- GET `/v1/subscriptions/invoices` → BillingPage invoice history.

### Database Schema

**New table: FinancialLedgerEntry**
```prisma
model FinancialLedgerEntry {
  id              String   @id @default(uuid()) @db.Uuid
  paymentId       String   @db.Uuid
  entryType       String   // PAYMENT_RECEIVED, PAYMENT_FAILED, REFUND_REQUESTED, REFUND_SUCCEEDED, SUBSCRIPTION_CANCEL_REQUESTED
  amountMinor     BigInt
  reason          String?
  createdAt       DateTime @default(now())

  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Restrict)

  @@index([paymentId])
  @@index([createdAt])
}
```

**Modified tables:**
- `Payment`: Add `ledger FinancialLedgerEntry[]` relation.
- `Refund`: Schema exists; ensure providerRefundId and status updates supported.
- `Invoice`: Schema exists; ensure linked to Payment correctly.

### Error Handling and Logging

**SafepayService errors:**
- SafePay API unavailable: Log error with paymentId, return 503, offer retry.
- Invalid plan: Log and return 400.
- Duplicate payment (idempotency): Return cached response (no error).

**Webhook errors:**
- Invalid signature: Log and return 401 immediately (security).
- Database transaction failure: Log error, store in ProviderWebhookEvent.processingError, return 202 for retry.
- Unknown event type: Log warning, return 202 (acknowledge but skip processing).

**Logging format:**
```
{
  "timestamp": "2026-11-27T...",
  "level": "info|error|warn",
  "action": "PAYMENT_CREATED|PAYMENT_WEBHOOK_RECEIVED|SUBSCRIPTION_ACTIVATED",
  "userId": "...",
  "paymentId": "...",
  "amountMinor": 10000,
  "currency": "PKR",
  "result": "success|failure",
  "errorMessage": "...",
  "details": { ... }
}
```

---

## Glossary

- **Minor unit**: Paisa in PKR. 1 PKR = 100 paisa. All amounts stored as integers (paisa).
- **Idempotency key**: Client-generated UUID to prevent duplicate payment creation. Unique per user.
- **CheckoutUrl**: SafePay-generated URL for user to complete payment.
- **ProviderEventId**: SafePay webhook event identifier (providerEventId). Unique per provider per event.
- **Webhook replay**: SafePay resending same webhook (same providerEventId) due to no ACK. Idempotency ensures no duplicate effects.
- **Soft cancel**: Setting cancelAtPeriodEnd=true without immediately deactivating subscription. Cancellation takes effect at renewal.
- **Entitlements**: Boolean and integer flags (hostingEnabled, maxActiveRooms, etc.) that define what a subscriber can do.
- **Financial ledger**: Immutable append-only table of all payment-related events for audit and compliance.
- **SafePay**: Initial payment provider for Pakistan market. Backend adapter allows future provider switching (Stripe, PayPal, etc.).

