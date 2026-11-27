# Phase L: Subscriptions & Payments (SafePay) — Implementation Plan

**Version:** 1.0  
**Date:** 2026-11-27  
**Status:** Ready for implementation  
**Provider:** SafePay (Pakistan market)

---

## Overview

This plan implements host subscription entitlements and payment processing using SafePay checkout sessions and webhooks. Work is organized into 4 phases: Database Migrations, Backend Service Layer, Backend API Controllers, and Frontend Integration. Each item is a small, independently verifiable unit.

**Key Constraints:**
- All monetary amounts in PKR paisa (integer minor units, no floating-point)
- Webhook idempotency via unique constraint on (providerConfigId, providerEventId)
- Atomic transactions for payment state changes (Payment → Subscription → LedgerEntry)
- SafePay SDK interface must be verified against actual documentation before checkout implementation
- Authorization: ownership checks on user subscriptions, staff permissions for refunds/admin operations

---

## Phase 1: Database Migrations

- [ ] 1. Create migration to add missing Payment fields (planId, checkoutUrl, providerSessionId).
      Add planId foreign key to SubscriptionPlan, add checkoutUrl and providerSessionId text fields for idempotency caching and session tracking.
      Files: `packages/database/prisma/migrations/[timestamp]_add_payment_fields.sql`
      Verify: `npm run db:migrate -- --name add_payment_fields` succeeds, schema.prisma updates reflect new columns, typecheck passes.

- [ ] 2. Update Payment model in schema.prisma to reflect new fields.
      Add planId (required, FK to SubscriptionPlan), checkoutUrl (optional), providerSessionId (optional) fields. Update Payment → SubscriptionPlan relation. Regenerate Prisma client.
      Files: `packages/database/prisma/schema.prisma` (subscriptions.prisma section)
      Verify: `npm run db:build` succeeds, Prisma client types generated, no typecheck errors.

- [ ] 3. Update SubscriptionPlan model with reverse Payment relation (optional but recommended for query convenience).
      Add payments relation to SubscriptionPlan for future reporting. Update existing Payment relation.
      Files: `packages/database/prisma/schema.prisma` (subscriptions.prisma section)
      Verify: `npm run db:build` succeeds, no typecheck errors.

---

## Phase 2: Backend Service Layer — SafePay Integration

- [ ] 4. Create SafePay types contract file defining SDK interface (before actual implementation).
      File defines SafePay method signatures, webhook field names, and error types. Document assumptions and verification status.
      Files: `apps/api/src/payments/safepay.types.ts`
      Verify: Typecheck passes, file exports TypeScript interfaces.

- [ ] 5. Install and verify SafePay SDK; update types contract if actual SDK differs from assumptions.
      Install `safepay` npm package in apps/api. Read SafePay documentation (https://docs.safepay.com.pk). Verify: CheckoutClient class, createCheckoutSession() method signature, webhook event field names, HMAC-SHA256 verification. Update safepay.types.ts to match actual SDK.
      Files: `apps/api/package.json`, `apps/api/src/payments/safepay.types.ts`
      Verify: `npm install` succeeds in apps/api, `npm run typecheck` passes, SafePay SDK is usable in code.

- [ ] 6. Create PaymentsRepository with data access methods for Payment, Refund, ProviderWebhookEvent, FinancialLedgerEntry.
      Implement: upsertPaymentByIdempotencyKey (atomic, fixes race condition), getPaymentByIdempotencyKey, updatePaymentCheckoutUrl, createProviderWebhookEvent (with unique constraint idempotency), transactional wrapper, getRefundByProviderRefundId, createLedgerEntry, queryLedgerEntries. No business logic.
      Files: `apps/api/src/payments/payments.repository.ts`
      Verify: `npm run typecheck` passes, unit tests for atomic upsert pass (verify no race condition via concurrent requests).

- [ ] 7. Create SafepayService with checkout and webhook processing logic.
      Implement: createCheckoutSession (idempotent via atomic upsert, calls SafePay API), processWebhook (signature verification, event storage, replay detection), handlePaymentSuccess (transactional: Payment → Subscription → Invoice → LedgerEntry), handlePaymentFailed (idempotent status update), handleRefundSuccess (transactional). Error classification per design review Finding 5.
      Files: `apps/api/src/payments/safepay.service.ts`
      Verify: `npm run typecheck` passes, unit tests pass for: checkout idempotency (duplicate requests return cached response), webhook replay detection (duplicate providerEventId is no-op), payment success transaction (all 4 tables updated atomically), error handling.

- [ ] 8. Create PaymentsDTO file with request/response contracts (shared with frontend).
      Define DTOs: CreateCheckoutRequest (planId, idempotencyKey?), CheckoutResponse (checkoutUrl, sessionId, paymentId), WebhookPayload (platform-agnostic wrapper), GetInvoicesResponse (paginated). Use Zod for runtime validation.
      Files: `packages/contracts/payments.dto.ts`
      Verify: `npm run typecheck` passes for packages/contracts, DTOs are importable in both backend and frontend.

- [ ] 9. Enhance SubscriptionsService with entitlement and subscription management methods.
      Add/verify: getActiveSubscription (user), canUserHost (user), checkEntitlements (user, returns limits), cancelSubscription (user, subscription), getInvoices (user, paginated). Reuse existing canUserHost/checkEntitlements if already present. Verify room-creation guard calls canUserHost().
      Files: `apps/api/src/subscriptions/subscriptions.service.ts`
      Verify: `npm run typecheck` passes, existing subscription tests still pass, room-creation guard integration verified (subscription gating works).

- [ ] 10. Create spec/unit tests for SafepayService covering all flows.
      Tests: checkout idempotency (same idempotencyKey returns cached URL), webhook success flow (Payment → Subscription → Invoice → LedgerEntry all created, amounts correct, no floating-point errors), webhook failure flow (Payment.status=FAILED, no Subscription created), refund flow (Payment.status updated, Refund.status updated), error handling (NotFoundException on missing payment, 202 retriable), signature verification (invalid sig → 401).
      Files: `apps/api/src/payments/safepay.service.spec.ts`
      Verify: `npm run test -- payments.service.spec` passes, coverage >90% for SafepayService.

---

## Phase 3: Backend API Controllers & Endpoints

- [ ] 11. Create PaymentsController with checkout and webhook endpoints.
      Endpoints: POST `/v1/subscriptions/checkout/:planId` (authenticated, creates Payment and returns checkoutUrl), POST `/v1/payments/webhook/safepay` (no auth, signature verified). Error mapping per review Finding 5 (signature invalid→401, all others→202 for retriable). Rate limit: 10 req/min per user for checkout, 100 req/min per IP for webhook.
      Files: `apps/api/src/payments/payments.controller.ts`
      Verify: `npm run typecheck` passes, integration tests pass for: checkout endpoint returns 400 on invalid planId, 503 on SafePay unavailable; webhook returns 401 on invalid signature, 202 on processing error.

- [ ] 12. Enhance SubscriptionsController with subscription management endpoints.
      Endpoints: GET `/v1/subscriptions/plans` (public, cached 5 min), GET `/v1/subscriptions/current` (authenticated), GET `/v1/subscriptions/entitlements` (authenticated), GET `/v1/subscriptions/invoices` (authenticated, paginated), POST `/v1/subscriptions/:id/cancel` (authenticated, ownership check). All endpoints include authorization guards (@CurrentUser, @Permission for admin operations).
      Files: `apps/api/src/subscriptions/subscriptions.controller.ts` (enhancement)
      Verify: `npm run typecheck` passes, integration tests pass for: plan list caching, current subscription return format, invoice list pagination, cancel endpoint sets cancelAtPeriodEnd flag and returns 204, ownership checks enforced (403 on unauthorized user).

- [ ] 13. Create subscription and payment integration tests covering authorization and state transitions.
      Tests: (1) User A creates room without subscription → 403, (2) User A purchases subscription → Subscription.status=ACTIVE, canUserHost returns true, (3) User A creates room → succeeds, (4) User A cancels subscription → Subscription.cancelAtPeriodEnd=true, canUserHost still true until period end, (5) Webhook replay (same providerEventId) → no-op, payment not duplicated.
      Files: `apps/api/src/payments/payments.integration.spec.ts`, `apps/api/src/subscriptions/subscriptions.integration.spec.ts` (enhanced)
      Verify: `npm run test -- payments.integration.spec subscriptions.integration.spec` passes, all authorization boundaries verified.

---

## Phase 4: Frontend Integration & Pages

- [ ] 14. Create PricingPage component (GET `/pricing`).
      Displays active plans from API in responsive card grid (1 col mobile, 2-3 cols desktop). Each card shows: plan name, price formatted in PKR (paisa → PKR with comma separators), period (month/year), entitlements as bullet list, "Subscribe Now" button (or "Manage Subscription" if already subscribed). Load plans via useSubscription hook; show spinner while loading. Respects reduced motion. No hardcoded plans or prices.
      Files: `apps/web/app/pricing/page.tsx`, `apps/web/components/PricingCard.tsx`
      Verify: `npm run build -- --filter=web` succeeds, typecheck passes, visual regression test shows responsive layout at 375px/768px/1440px, no emoji icons used.

- [ ] 15. Create CheckoutPage component (GET `/checkout/:planId`).
      Page receives planId from URL, initiates checkout via useCheckout hook, renders SafePay checkout iframe/redirect. Handles redirects from SafePay callback (success → redirect to `/billing?success=true` with toast, failure → show error message with retry button). Stores sessionId in state. Shows loading state while checkout URL is being generated.
      Files: `apps/web/app/checkout/page.tsx`
      Verify: `npm run build -- --filter=web` succeeds, typecheck passes, manual test: navigate to `/checkout/:planId`, checkout URL loads, success/failure callbacks trigger expected routes and notifications.

- [ ] 16. Create BillingPage component (GET `/billing`).
      If user has active Subscription: show plan name, renewal date, current price, "Cancel Subscription" button. Show invoice history table (past 12 months): date, amount formatted in PKR, status, link to download/view (future: S3 signed URL for PDF). If no active subscription: show "No active subscription" message with link to `/pricing`. Load via useSubscription + invoice list API.
      Files: `apps/web/app/billing/page.tsx`, `apps/web/components/InvoiceTable.tsx`
      Verify: `npm run build -- --filter=web` succeeds, typecheck passes, manual test: active subscription shows details, no subscription shows CTA, invoice table pagination works.

- [ ] 17. Create SubscriptionStatus component for reuse in profile dropdown and room-creation workflows.
      Small component (2-3 lines) displaying subscription status (ACTIVE, GRACE, CANCELLED, EXPIRED) with color coding. Used in: (1) profile dropdown menu, (2) room-creation modal to disable "Host Room" button if ineligible. Props: subscription (Subscription | null), isLoading (bool).
      Files: `apps/web/components/SubscriptionStatus.tsx`
      Verify: `npm run typecheck` passes, renders correctly for each status, integrates into room-creation flow (button disables on no active subscription).

- [ ] 18. Create useSubscription hook for fetching current subscription.
      Hook returns { subscription, isLoading, error, refetch }. Fetches GET `/v1/subscriptions/current` on mount and manual refetch. Uses React Query for caching (5 min stale time). Memoized to prevent unnecessary re-renders.
      Files: `apps/web/hooks/useSubscription.ts`
      Verify: `npm run typecheck` passes, hook returns correct types, React Query caching works (verify via devtools), manual test: component re-fetches after 5 min or manual refetch call.

- [ ] 19. Create useCheckout hook for checkout flow.
      Hook accepts (planId, idempotencyKey?). Returns { initiateCheckout, isLoading, checkoutUrl, error }. Calls POST `/v1/subscriptions/checkout/:planId` with idempotencyKey (auto-generated UUID if not provided). On duplicate planId+idempotencyKey, returns cached response without new API call. Handles network errors with retry logic.
      Files: `apps/web/hooks/useCheckout.ts`
      Verify: `npm run typecheck` passes, duplicate calls with same idempotencyKey return cached URL (no duplicate API requests), error handling works, manual test: initiate checkout, duplicate call returns same URL.

- [ ] 20. Add environment variables configuration for frontend/backend payment setup.
      Add to .env.example (server-side only): SAFEPAY_API_KEY, SAFEPAY_WEBHOOK_SECRET, SAFEPAY_MERCHANT_ID (not sensitive), SAFEPAY_MODE (sandbox/live). Document which are server-only (never expose to client). No actual secrets in repo; documented as requiring manual setup in deployment docs.
      Files: `.env.example`, `docs/SETUP.md` (enhancement)
      Verify: `npm run build` succeeds with all env vars configured, no secrets leaked in bundle, documentation lists all required vars.

- [ ] 21. Create end-to-end test for complete checkout flow (optional, can be deferred if E2E framework not ready).
      Test: (1) User navigates to `/pricing`, (2) clicks "Subscribe", (3) checkout page loads, (4) mock SafePay webhook fires (payment_success), (5) redirect to `/billing?success=true`, (6) billing page shows active subscription. Use test database for payment records.
      Files: `apps/e2e/checkout.e2e.ts`
      Verify: `npm run e2e` passes, all steps succeed, payment record created in test DB, subscription status correct.

---

## Phase 4b: Admin & Moderation (Optional for Phase L, Deferred to Admin Phase)

The following are out-of-scope for Phase L implementation but should be planned:

- Refund request and approval workflow (Admin Phase)
- Financial ledger audit queries (Admin Phase)
- Invoice PDF generation and S3 upload (Admin Phase)
- Payment reconciliation reports (Admin Phase)
- Plan creation/update/activation via admin API (Admin Phase)

---

## Verification & Build Steps

**Before each phase:**
1. Typecheck: `npm run typecheck`
2. Lint: `npm run lint`
3. Build: `npm run build`

**Phase 1 (Migrations):**
```bash
npm run db:migrate -- --name add_payment_fields
npm run db:build
```

**Phase 2 (Service Layer):**
```bash
npm install safepay  # in apps/api
npm run typecheck
npm run test -- payments.service.spec
```

**Phase 3 (Controllers):**
```bash
npm run typecheck
npm run test -- payments.integration.spec subscriptions.integration.spec
```

**Phase 4 (Frontend):**
```bash
npm run build -- --filter=web
npm run typecheck
# Manual: test PricingPage, CheckoutPage, BillingPage in browser
```

**Full suite (before PR):**
```bash
npm run build
npm run typecheck
npm run lint
npm run test
npm run pr-check:quick  # if exists
```

---

## Key Decision Points & Assumptions

1. **SafePay SDK Actual Interface (Critical):** This plan assumes SafePay SDK interface as documented in design Section 3.6. If actual SDK differs (method names, return field names, error types), implementation must be adjusted before checkout endpoint goes live.

2. **Invoice PDF Generation Deferred:** Initial implementation stores invoice metadata (number, date, amountMinor) only. PDF generation and S3 upload deferred to Admin Phase per design.

3. **Refund Workflow Manual Only (Phase L):** Initial implementation supports webhook processing of refund_success events but refund request/approval deferred to Admin Phase. Staff can submit refunds via SafePay dashboard; webhook updates Payment status.

4. **No Redis/Rate Limiting (Phase L):** Rate limiting documented in requirements but deferred to Phase M (Scaling & Caching). Plan list GET endpoint uses memory-based caching (5 min TTL via React Query on frontend, via @Cacheable on backend).

5. **PKR Minor Units Mandatory:** All amounts are integers (paisa). No floating-point arithmetic. All displays convert from minor units (e.g., 50000 paisa → "PKR 500").

6. **Room Subscription Gating Already in Place:** SubscriptionGuard already checks canUserHost() on room creation. This plan verifies integration; no new gating logic needed.

---

## Files Touch Summary

### Database (3 files)
- `packages/database/prisma/migrations/[timestamp]_add_payment_fields.sql` (new)
- `packages/database/prisma/schema.prisma` (modified: Payment, SubscriptionPlan models)

### Backend Services (5 files)
- `apps/api/src/payments/safepay.types.ts` (new)
- `apps/api/src/payments/payments.repository.ts` (new)
- `apps/api/src/payments/safepay.service.ts` (new)
- `packages/contracts/payments.dto.ts` (new)
- `apps/api/src/subscriptions/subscriptions.service.ts` (enhanced)

### Backend Controllers (3 files)
- `apps/api/src/payments/payments.controller.ts` (new)
- `apps/api/src/subscriptions/subscriptions.controller.ts` (enhanced)
- `apps/api/src/payments/payments.module.ts` (new)

### Backend Tests (2 files)
- `apps/api/src/payments/safepay.service.spec.ts` (new)
- `apps/api/src/payments/payments.integration.spec.ts` (new)

### Frontend Components (4 files)
- `apps/web/app/pricing/page.tsx` (new)
- `apps/web/app/checkout/page.tsx` (new)
- `apps/web/app/billing/page.tsx` (new)
- `apps/web/components/SubscriptionStatus.tsx` (new)
- `apps/web/components/PricingCard.tsx` (new)
- `apps/web/components/InvoiceTable.tsx` (new)

### Frontend Hooks (2 files)
- `apps/web/hooks/useSubscription.ts` (new)
- `apps/web/hooks/useCheckout.ts` (new)

### Configuration (2 files)
- `.env.example` (modified: add SAFEPAY_* vars)
- `docs/SETUP.md` (new or enhanced)

### Optional E2E (1 file)
- `apps/e2e/checkout.e2e.ts` (new, optional)

---

## Implementation Order

Execute in order: Phase 1 → Phase 2 → Phase 3 → Phase 4. Within each phase, items are ordered by dependency:

**Phase 1 Sequence:** Migrations (1) → Schema Update (2-3)
**Phase 2 Sequence:** Types (4) → SDK Install & Verify (5) → Repository (6) → Service (7-8) → Subscription Enhancement (9) → Tests (10)
**Phase 3 Sequence:** Controllers (11-12) → Integration Tests (13)
**Phase 4 Sequence:** Hooks (18-19) → Pages (14-16) → Components (17) → Env Config (20) → E2E (21, optional)

Each item leaves the codebase buildable. Test as you go.
