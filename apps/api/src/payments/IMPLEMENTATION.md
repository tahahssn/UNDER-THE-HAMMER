# Payment Service Implementation - FEAT-001

## Overview

This implementation adds SafePay integration for the Under-The-Hammer subscription payment system. All amounts are stored as integer minor units (paisa) to avoid floating-point precision issues.

## Files Created/Modified

### Database Schema (Step 1-2)
- **Migration**: `packages/database/prisma/migrations/20261127_add_payment_fields/migration.sql`
  - Adds `planId` (UUID FK to SubscriptionPlan)
  - Adds `checkoutUrl` (TEXT)
  - Adds `providerSessionId` (TEXT)
  - Creates indexes for performance
  - Creates unique constraint for idempotency

- **Schema Update**: `packages/database/prisma/schema.prisma`
  - Updated `Payment` model with new fields
  - Added FK relation to `SubscriptionPlan`
  - Updated `SubscriptionPlan` model with reverse `payments` relation

### Type Contracts (Step 3-4)
- **SafePay Types**: `apps/api/src/payments/safepay.types.ts`
  - Defines `CheckoutClient` interface (SDK abstraction)
  - Defines `CreateCheckoutSessionRequest` and `CreateCheckoutSessionResponse`
  - Defines `SafePayWebhookPayload` structure
  - Documents assumptions about SDK field naming (pending verification)

### Data Access Layer (Step 5)
- **Payments Repository**: `apps/api/src/payments/payments.repository.ts`
  - `upsertPaymentByIdempotencyKey()` - Atomic upsert prevents race conditions
  - `getPaymentById()`, `getPaymentByIdempotencyKey()`, `getPaymentByProviderSessionId()`
  - `updatePaymentCheckoutUrl()`, `updatePaymentStatus()`, `updatePaymentProviderId()`
  - Webhook event handling:
    - `createProviderWebhookEvent()` - Replay detection via unique constraint
    - `isWebhookEventProcessed()`, `updateWebhookEventProcessed()`, `updateWebhookEventError()`
  - Financial ledger:
    - `createLedgerEntry()`, `queryLedgerEntries()` - Append-only audit trail
  - Refund handling:
    - `getRefundByProviderRefundId()`, `createRefund()`, `updateRefundStatus()`
  - Subscription creation:
    - `createSubscription()`, `createInvoice()`
  - `transaction()` - Wrapper for Prisma transactions

### Business Logic (Step 6)
- **SafepayService**: `apps/api/src/payments/safepay.service.ts`
  - `createCheckoutSession()` - Idempotent checkout with atomic upsert
  - `processWebhook()` - Entry point for all webhook events
  - `handlePaymentSuccess()` - Transactional: Payment → Subscription → Invoice → LedgerEntry
  - `handlePaymentFailed()` - Idempotent status update
  - `handleRefundSuccess()` - Transactional refund processing
  - Webhook signature verification (HMAC-SHA256)
  - Error classification:
    - 401 (UnauthorizedException) for invalid signatures
    - 202 (retriable) for missing payments and other transient errors
    - 400 (BadRequestException) for amount mismatches (fatal)

### Shared Contracts (Step 7)
- **Payment DTOs**: `packages/contracts/payments.dto.ts`
  - `CreateCheckoutRequest` / `CheckoutResponse`
  - `SubscriptionPlan`, `Subscription` schemas with Zod validation
  - `GetCurrentSubscriptionResponse`, `GetInvoicesResponse` (paginated)
  - `ListPlansResponse`, `CancelSubscriptionRequest`, `CheckEntitlementsResponse`
  - All amounts defined as `z.number().int()` (no floats)

### Service Enhancements (Step 8)
- **Subscriptions Service**: `apps/api/src/subscriptions/subscriptions.service.ts`
  - `getActiveSubscription()` - Fetch user's active subscription
  - `cancelSubscription()` - Set `cancelAtPeriodEnd` flag
  - `getInvoices()` - Paginated invoice retrieval

- **Subscriptions Repository**: `apps/api/src/subscriptions/subscriptions.repository.ts`
  - `updateSubscriptionCancelAtPeriodEnd()` - Update cancel flag
  - `getUserInvoices()` - Paginated query with payment details

### Module Setup
- **Payments Module**: `apps/api/src/payments/payments.module.ts`
  - Provides `PaymentsRepository` and `SafepayService`
  - Injects environment variables: `SAFEPAY_API_KEY`, `SAFEPAY_WEBHOOK_SECRET`

### Tests (Step 9)
- **SafepayService Tests**: `apps/api/src/payments/safepay.service.spec.ts`
  - Idempotency: same idempotencyKey returns cached URL without duplicate API calls
  - Webhook replay detection: duplicate providerEventId is no-op
  - Signature verification: invalid HMAC-SHA256 throws UnauthorizedException
  - Payment success flow: Payment → Subscription → Invoice → LedgerEntry atomically
  - Payment failure flow: Idempotent status update
  - Refund success flow: Transactional refund processing
  - Amount validation: Mismatch throws BadRequestException
  - Integer paisa: All amounts verified as BigInt (no floating-point)

## Environment Variables Required

Add these to `.env` (server-only, never expose to client):

```
SAFEPAY_API_KEY=sk_live_xxxxx_or_sk_test_xxxxx
SAFEPAY_WEBHOOK_SECRET=whsec_xxxxx
```

**Important**: These credentials should be:
- Stored in AWS Secrets Manager or similar (not git)
- Accessed via secure environment management
- Different for sandbox vs. production

## Key Design Decisions

### 1. Atomic Idempotency
The `upsertPaymentByIdempotencyKey()` method uses Prisma `upsert()` to atomically:
- Create a new payment record on first request with same idempotencyKey
- Return existing record on subsequent requests with same key
- Prevents duplicate SafePay API calls under concurrent requests

### 2. Webhook Replay Detection
The `createProviderWebhookEvent()` method uses unique constraint on `(providerConfigId, providerEventId)` to:
- Detect replayed webhooks automatically
- Return existing event if already received
- Skip processing on repeated invocation (no-op)

### 3. Integer Minor Units
All monetary values stored as `BigInt` in paisa (100 paisa = 1 PKR):
- No floating-point arithmetic or rounding errors
- Postgres supports `bigint` natively
- Safe for financial transactions
- Example: 100,000 paisa = 1,000 PKR

### 4. Transactional Atomicity
Payment success handler uses `Prisma.$transaction()` to ensure:
- All-or-nothing: Payment + Subscription + Invoice + LedgerEntry created together
- No partial state on failure
- Automatic rollback on any error

### 5. Error Classification
HTTP status codes align with retry strategy:
- **401 Unauthorized**: Signature invalid (never retry, security issue)
- **202 Accepted**: Retriable (payment not found, database transient error)
- **400 Bad Request**: Fatal (amount mismatch, never retry)

### 6. Append-Only Ledger
Financial ledger entries are immutable:
- Corrections via compensating entries (not overwrites)
- Full audit trail preserved
- Idempotent operations via ledger primary keys

## Verification Checklist

- [x] Migration SQL created with proper FK and unique constraints
- [x] Prisma schema updated and client regenerated
- [x] SafePay types contract defined (pending SDK verification)
- [x] PaymentsRepository with atomic upsert implemented
- [x] SafepayService with checkout, webhook processing, and error handling
- [x] Payment DTOs with Zod validation
- [x] Subscriptions service enhanced with cancel and invoice methods
- [x] Unit tests cover idempotency, replay detection, transactional atomicity
- [x] Environment variables documented

## TODO: Next Steps

1. **Verify SafePay SDK Interface**: Read https://docs.safepay.com.pk and confirm:
   - CheckoutClient class name and method signatures
   - Webhook event field names (id vs eventId, type vs eventType)
   - HMAC verification method signature
   - Update safepay.types.ts if differences found

2. **Install SafePay SDK**:
   ```bash
   npm install safepay --save
   ```

3. **Implement Safepay Controller**: Create POST `/payments/checkout` and POST `/webhooks/safepay` endpoints

4. **Add Migration Execution**: Run `npm run db:migrate -- --name add_payment_fields` to apply schema

5. **Configure Environment**: Set `SAFEPAY_API_KEY` and `SAFEPAY_WEBHOOK_SECRET` from SafePay dashboard

6. **Run Tests**: `npm run test -- payments.service.spec` to verify all functionality

## Amount Conversion Examples

| Display | Paisa | PKR | Notes |
|---------|-------|-----|-------|
| 100 | BigInt(100) | 1 | 1 rupee |
| 1,000 | BigInt(1000) | 10 | 10 rupees |
| 100,000 | BigInt(100000) | 1,000 | 1,000 rupees (1K) |
| 1,000,000 | BigInt(1000000) | 10,000 | 10K |
| 10,000,000 | BigInt(10000000) | 100,000 | 1 lac |

## References

- Prisma Transactions: https://www.prisma.io/docs/concepts/components/prisma-client/transactions
- Idempotency: https://stripe.com/docs/api/idempotent_requests
- Webhooks: https://en.wikipedia.org/wiki/Webhook#Reliability
