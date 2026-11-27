# Design Review: Phase L Subscriptions & Payments (SafePay)

**Reviewer:** Kiro  
**Review Date:** 2026-11-27  
**Design Version:** 2.0  
**Status:** CHANGES_REQUESTED  
**Total Findings:** 8 (4 HIGH, 2 MEDIUM, 2 NIT)

---

## Verified Assumptions

✓ **Database Schema Foundation:** SubscriptionPlan, Subscription, SubscriptionEntitlement, Payment, Refund, Invoice, ProviderWebhookEvent, FinancialLedgerEntry tables all exist in schema.prisma and are ready for use.

✓ **Payment Core Fields:** Payment model correctly includes idempotencyKey (unique), status, amountMinor (BigInt), currency, paidAt, providerPaymentId (nullable), and proper relations to User, Subscription, ProviderConfig.

✓ **ProviderWebhookEvent Idempotency:** Unique constraint on (providerConfigId, providerEventId) is correctly defined in schema, enabling replay detection.

✓ **FinancialLedgerEntry Immutability:** Table structure supports append-only design with paymentId and refundId relations, indexes on createdAt for audit queries.

✓ **Subscription Guard Already Implemented:** SubscriptionGuard exists in codebase, is used on room creation endpoint, and correctly checks canUserHost() before allowing room creation.

✓ **SubscriptionsService Entitlement Methods Exist:** canUserHost(), getRoomLimits(), and checkEntitlements() methods already implemented in SubscriptionsService for room eligibility validation.

✓ **SafePay Environment Variables:** .env.example already includes SAFEPAY_API_KEY and SAFEPAY_WEBHOOK_SECRET placeholders, confirming SafePay (not Stripe/PayPal) is chosen for Pakistan market.

✓ **Subscription Status Enum:** SubscriptionStatus enum correctly defined with PENDING, ACTIVE, GRACE, CANCELLED, EXPIRED states matching requirements.

✓ **BillingPeriod Enum Exists:** Period enum supports MONTH and YEAR billing cycles as required.

✓ **User Relations:** Payment and Subscription properly linked to User with onDelete: Restrict to maintain audit trail.

---

## Unverified/Wrong Assumptions

**❌ ASSUMPTION 1 (HIGH):** Design claims "Payment.planId field added for webhook processing" (Section 2.2) but schema inspection shows Payment model **does NOT have a planId field**. Payment.subscriptionId is nullable and exists, but no direct planId link to SubscriptionPlan.

**Impact:** The design assumes webhook handler can query the subscription plan period from Payment.planId, but Payment has no such field. Webhook handler must fetch SubscriptionPlan via Payment.subscription → Subscription.planId → SubscriptionPlan. This adds an extra query unless planId is denormalized into Payment.

**Current Schema:**
```prisma
model Payment {
  subscriptionId String? @db.Uuid  // Link to Subscription (created AFTER payment success)
  // NO planId field currently
}
```

**❌ ASSUMPTION 2 (MEDIUM):** Design claims SafePay SDK is used as `const SafepayCheckout = require('safepay').CheckoutClient` (Section 3.2, SafepayService constructor) but no SafePay npm package is verified in package.json.

**Impact:** SafePay SDK installation, method signatures, error types, and webhook event field names are assumed but not validated against actual SDK. Interface contract in Section 3.6 is documented as a template to verify, not confirmed.

**❌ ASSUMPTION 3 (MEDIUM):** Design assumes Payment model can store both planId and subscriptionId simultaneously, but webhook success flow (Section 3.2, handlePaymentSuccess) updates Payment.subscriptionId AFTER Payment.status = PAID. This creates a chicken-egg scenario: at checkout, subscriptionId is null (not yet created); at webhook success, planId must be known to calculate period, but planId was never stored.

**Impact:** Webhook handler cannot calculate subscription period (currentPeriodEnd) without either:
1. Storing planId at checkout time, OR
2. Fetching planId from checkout request metadata or Order Reference, OR
3. Adding an extra round-trip query to find the payment's related plan

---

## Findings

### Finding 1 (HIGH): Missing planId Field in Payment Model

**Problem:** Design (Section 2.2) specifies a migration to add `planId` field to Payment table with foreign key to SubscriptionPlan. However, schema.prisma inspection shows Payment model does NOT currently have this field. The design assumes it will exist for webhook processing.

**Location:** 
- Design Section 2.2: "Add planId foreign key (required for webhook)"
- Design Section 3.2, handlePaymentSuccess: Fetches plan via `await tx.subscriptionPlan.findUnique({ where: { id: payment.planId } })`
- Schema reality: Payment model has no planId field

**Concrete Fix:**
Add planId field to Payment model in schema.prisma BEFORE or AS PART OF Phase L migration:

```prisma
model Payment {
  id                String         @id @default(uuid()) @db.Uuid
  userId            String         @db.Uuid
  purpose           PaymentPurpose
  subscriptionId    String?        @db.Uuid
  tournamentId      String?        @db.Uuid
  providerConfigId  String         @db.Uuid
  planId            String         @db.Uuid  // NEW: Link to plan for checkout and webhook
  providerPaymentId String?
  amountMinor       BigInt
  currency          String         @db.Char(3)
  status            PaymentStatus  @default(PENDING)
  idempotencyKey    String         @unique
  createdAt         DateTime       @default(now())
  paidAt            DateTime?

  user         User                  @relation(fields: [userId], references: [id], onDelete: Restrict)
  plan         SubscriptionPlan      @relation(fields: [planId], references: [id], onDelete: Restrict)
  subscription Subscription?         @relation(fields: [subscriptionId], references: [id], onDelete: Restrict)
  tournament   Tournament?           @relation(fields: [tournamentId], references: [id], onDelete: Restrict)
  provider     PaymentProviderConfig @relation(fields: [providerConfigId], references: [id], onDelete: Restrict)
  
  refunds      Refund[]
  invoice      Invoice?
  ledger       FinancialLedgerEntry[]
  
  @@unique([providerConfigId, providerPaymentId])
  @@index([userId, createdAt])
  @@index([planId])  // For webhook lookups by plan
}
```

**Migration SQL:**
```sql
ALTER TABLE "Payment" ADD COLUMN "planId" UUID NOT NULL DEFAULT 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid;
ALTER TABLE "Payment" ALTER COLUMN "planId" DROP DEFAULT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" 
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT;
CREATE INDEX "Payment_planId_idx" ON "Payment"("planId");
```

**Rationale:** At checkout creation, planId is known (passed as param to createCheckoutSession). Store it in Payment.planId to avoid lookup complexity in webhook handler. Webhook handler then has immediate access to the subscription period calculation without extra queries.

---

### Finding 2 (HIGH): Missing checkoutUrl and providerSessionId Fields in Payment

**Problem:** Design (Section 2.2) specifies adding `checkoutUrl` and `providerSessionId` fields to Payment table for idempotency caching. Schema.prisma inspection shows these fields do NOT exist.

**Location:**
- Design Section 2.2: Migration specifies these fields
- Design Section 3.2, createCheckoutSession: Returns `payment.checkoutUrl` from cache on idempotent request
- Schema reality: Payment model has no checkoutUrl or providerSessionId

**Concrete Fix:**
Add both fields to Payment model and migration:

```prisma
model Payment {
  // ... existing fields ...
  checkoutUrl       String?        // SafePay-generated URL, cached for idempotency
  providerSessionId String?        // SafePay session ID for reference
  // ... rest of model
}
```

**Migration SQL:**
```sql
ALTER TABLE "Payment" ADD COLUMN "checkoutUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN "providerSessionId" TEXT;
```

**Rationale:** Idempotency design relies on retrieving cached checkoutUrl on duplicate checkout requests. Without storing these fields, duplicate requests would trigger new SafePay API calls, violating idempotency guarantees and wasting SafePay quota.

---

### Finding 3 (HIGH): SafePay SDK Interface Not Verified Against Actual Implementation

**Problem:** Design (Section 3.6) documents assumed SafePay Node.js SDK interface contract as a template ("MUST be verified against actual SafePay Node.js SDK documentation"). The SafepayService code uses this unverified interface:
- Method name: `createCheckoutSession()`
- Return fields: `checkoutUrl`, `sessionId`, `status`
- Webhook field names: `id`, `type`, `amount`, `orderRef`, `refundId`
- Error handling: assumes SDK throws specific error types

No confirmation that actual SafePay SDK matches these assumptions.

**Location:**
- Design Section 3.6: "MUST be verified against actual SafePay Node.js SDK documentation"
- Design Section 3.2: SafepayService constructor and methods assume specific method names and return types

**Concrete Fix:**
Before starting implementation:

1. **Install SafePay SDK:** `npm install safepay` in apps/api package.json
2. **Read SafePay docs:** https://docs.safepay.com.pk/checkout/node-sdk (or current documentation URL)
3. **Verify interface match:**
   - Confirm CheckoutClient class and createCheckoutSession() method exist
   - Confirm return object has checkoutUrl and sessionId fields
   - Confirm webhook payload field names (id vs eventId, type vs eventType, amount field name, orderRef vs referenceId)
   - Confirm error types thrown (e.g., does it throw or return error objects?)
   - Confirm HMAC-SHA256 webhook signature verification requirements

4. **Update interface contract** in `apps/api/src/payments/safepay.types.ts` if actual SDK differs from Section 3.6 assumptions

5. **Document discrepancies** in design addendum if actual API differs significantly

**Rationale:** This is security-critical (webhook signature verification) and core-critical (checkout flow). Unverified assumptions lead to runtime failures and potential payment processing bugs.

---

### Finding 4 (HIGH): Webhook Payload Field Mapping Ambiguity

**Problem:** Design (Section 3.2, processWebhook) handles webhook by extracting fields like `payload.id`, `payload.type`, `payload.amount`, `payload.orderRef`. Section 3.6 documents alternative field names (e.g., `eventId` vs `id`, `referenceId` vs `orderRef`). No clarity on whether SafePay uses field set A or set B, and no handling for missing/alternate fields.

**Location:**
- Design Section 3.2: `const providerEventId = payload.id || payload.eventId;` (defensive but unclear which is correct)
- Design Section 3.2, handlePaymentSuccess: `const orderRef = payload.orderRef || payload.referenceId;`
- Design Section 3.6: Documents both field name variants as uncertainties

**Concrete Fix:**
After verifying actual SafePay SDK/documentation:

**Option A: If SafePay uses standard field names:**
```typescript
// processWebhook
const providerEventId = payload.id;
const eventType = payload.type;

// handlePaymentSuccess
const orderRef = payload.orderRef;
const providerPaymentId = payload.id;
const amountMinor = payload.amount;
```
Fail fast with BadRequestException if fields are missing (don't silently fall back).

**Option B: If SafePay uses alternate field names:**
Update design to use correct names and remove fallbacks.

**Rationale:** Defensive fallback code (||) masks bugs. If SafePay always uses `payload.id`, code that accepts `payload.eventId` will silently accept malformed webhooks. Webhook signature verification is authoritative; use exact field names per SafePay spec, not guesses.

---

### Finding 5 (MEDIUM): Error Classification in handlePaymentSuccess Contradicts HTTP Status Codes

**Problem:** Design (Section 3.2, error handling table) classifies "Payment not found on success webhook" as returning 202 (Accepted/retriable). However, the code throws `NotFoundException` which typically maps to 404, not 202.

**Location:**
- Design Section 3.2, Error Handling Summary table: "Payment not found on success webhook | NotFoundException | 202 | Yes"
- Design Section 3.2, handlePaymentSuccess: `throw new NotFoundException(...)`
- NestJS convention: NotFoundException → 404 HTTP status

**Concrete Fix:**
Clarify error handling strategy in webhook controller:

```typescript
@Post('webhook/safepay')
@HttpCode(HttpStatus.OK)
async handleWebhook(@Req() req: Request) {
  const signature = req.headers['x-safepay-signature'] as string;
  if (!signature) {
    throw new UnauthorizedException('Missing webhook signature'); // 401
  }

  try {
    await this.safepayService.processWebhook(req.body, signature);
    return { acknowledged: true }; // 200
  } catch (error) {
    // Map domain errors to HTTP status codes:
    // - UnauthorizedException (signature invalid) → 401 immediately
    // - NotFoundException (payment not found) → 202 (retriable, SafePay will retry)
    // - Database errors → 202 (retriable)
    // - BadRequestException (amount mismatch) → 202 (don't block SafePay, store for audit)
    
    if (error instanceof UnauthorizedException) {
      throw error; // 401 — security-critical, fail fast
    }
    
    // All other errors should return 202 for SafePay retry
    throw new AcceptedResult(error.message); // or use HttpException with 202 status
  }
}
```

**Update error table** to clarify:
- 401: Signature invalid (security, non-retriable)
- 202: All retriable conditions (not found, transient DB errors)
- 400: Never (don't send 400 for payload errors; SafePay will never fix them and will retry indefinitely)

**Rationale:** HTTP semantics matter to SafePay's retry logic. 401 signals "don't retry"; 202 signals "retry later". NotFoundException mapping to 404 would cause SafePay to stop retrying.

---

### Finding 6 (MEDIUM): SafePay API Error Handling in Checkout Not Specified

**Problem:** Design (Section 3.2, createCheckoutSession) catches generic `error` and throws ServiceUnavailableException(503). No distinction between:
- Temporary network outage (should return 503, user can retry)
- Invalid API key / authentication failure (should return 500 or 503, signal ops team)
- Invalid request format sent to SafePay (should return 400, signal implementation bug)

All are caught and converted to 503, losing diagnostic information.

**Location:**
- Design Section 3.2: `catch (error) { ... throw new ServiceUnavailableException(...) }`

**Concrete Fix:**
Distinguish SafePay API errors:

```typescript
try {
  const checkoutResponse = await this.safepayClient.createCheckoutSession({
    // ... params ...
  });
} catch (error) {
  // SafePay error classification
  if (error.response?.status === 401 || error.response?.status === 403) {
    // Authentication/authorization failure (API key invalid or permission denied)
    this.logger.error({
      action: 'SAFEPAY_AUTH_FAILED',
      userId,
      paymentId: payment.id,
      status: error.response?.status,
      error: error.message,
    });
    // This is an operational error, not a user-recoverable error
    throw new ServiceUnavailableException('Payment service temporarily unavailable');
  }
  
  if (error.response?.status === 400 || error.response?.status === 422) {
    // Client error in request (implementation bug)
    this.logger.error({
      action: 'SAFEPAY_CHECKOUT_INVALID_REQUEST',
      userId,
      paymentId: payment.id,
      requestBody: { /* sanitized */ },
      error: error.message,
    });
    throw new InternalServerErrorException('Payment service error (contact support)');
  }
  
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    // Network error
    this.logger.warn({
      action: 'SAFEPAY_CHECKOUT_NETWORK_ERROR',
      userId,
      paymentId: payment.id,
      error: error.code,
    });
    throw new ServiceUnavailableException('Payment provider unavailable. Please try again.');
  }
  
  // Unknown error
  throw new ServiceUnavailableException('Payment service error. Please try again.');
}
```

**Rationale:** Proper error classification enables:
- Ops monitoring to alert on auth failures (requires action)
- User experience improvement (distinguish temporary vs permanent failures)
- Implementation debugging (catch bugs in request formatting before hitting SafePay)

---

### Finding 7 (NIT): Ambiguity in Invoice.number Generation

**Problem:** Design (Section 3.2, generateInvoiceNumber) generates invoice number as `INV-{year}-{count}` format. Unclear if `count` is:
- Global count of all invoices (would reuse numbers across years if implemented in multiple years)
- Count per year (invoice #1 each year, resetting at year boundary)

The code shows `const count = await tx.invoice.count();` which is global, not per-year. This means 2026 and 2027 invoice numbers would be sequential (INV-2026-000001, INV-2026-000002, ..., INV-2027-000050) instead of resetting (INV-2026-000001, INV-2027-000001).

**Location:**
- Design Section 3.2, generateInvoiceNumber: `const invoiceNumber = \`INV-${year}-${String(count + 1).padStart(6, '0')}\`;`

**Concrete Fix:**
Clarify intended behavior and implement accordingly:

**Option A: Per-year numbering (recommended for accounting):**
```typescript
private async generateInvoiceNumber(tx: any): Promise<string> {
  const year = new Date().getFullYear();
  const count = await tx.invoice.count({
    where: {
      issuedAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
  });
  return `INV-${year}-${String(count + 1).padStart(6, '0')}`;
}
```

**Option B: Globally sequential (simpler, less accounting-friendly):**
Keep current implementation but clarify in design that numbers don't reset per year.

**Rationale:** Accounting and compliance expect invoice numbers to reset or follow a clear pattern per fiscal/calendar year. Ambiguous numbering can cause reconciliation confusion.

---

### Finding 8 (NIT): Frontend CheckoutPage Callback URL Not Specified

**Problem:** Design (Section 3.2, link generation) specifies SafePay returnUrl as `{APP_URL}/checkout-callback/{planId}/{sessionId}`, but frontend CheckoutPage (Section 4.2) does not implement this callback endpoint. The page redirects to SafePay but has no logic to handle the return redirect.

**Location:**
- Design Section 3.2: `returnUrl: \`${this.configService.get('APP_URL')}/checkout-callback/${planId}/${payment.id}\``
- Frontend Section 4.2 (CheckoutPage): No callback handler; only pre-checkout and error states

**Concrete Fix:**
Add callback handler page and document the expected SafePay redirect flow:

```typescript
// apps/web/src/app/checkout-callback/[planId]/[sessionId]/page.tsx
'use client';

export default function CheckoutCallbackPage({
  params,
  searchParams,
}: {
  params: { planId: string; sessionId: string };
  searchParams: Record<string, string>;
}) {
  // SafePay redirects here with status and optional error/transactionId in query params
  const status = searchParams.status; // e.g., 'success', 'failed', 'cancelled'
  const error = searchParams.error;
  
  if (status === 'success') {
    return <div>Payment successful! Redirecting...</div>;
    // Redirect to /billing after a moment
  }
  
  if (status === 'failed' || status === 'cancelled') {
    return <div>Payment {status}. <a href="/checkout?planId={planId}">Try again</a></div>;
  }
  
  return <div>Processing payment...</div>;
}
```

**Update design** Section 4.2 to document:
- Expected SafePay redirect URL format with query params
- When webhook fires vs. when callback redirect happens (may be async)
- Whether to trust callback redirect status or poll API

**Rationale:** Callback handling is part of the checkout flow and must be specified to avoid user confusion and ensure correct state transitions.

---

## Summary

**Verdict:** CHANGES_REQUESTED

**HIGH findings:** 4
- Missing planId field in Payment model (required for webhook period calculation)
- Missing checkoutUrl and providerSessionId fields (required for idempotent caching)
- SafePay SDK interface unverified (critical before implementation starts)
- Webhook payload field mapping ambiguity (security-relevant)

**MEDIUM findings:** 2
- Error classification contradicts HTTP status codes (affects SafePay retry logic)
- SafePay API error handling undifferentiated (loses diagnostic value)

**NIT findings:** 2
- Invoice number generation ambiguity (year-wise vs. global reset)
- Frontend callback endpoint not specified (incomplete flow)

**All findings must be resolved** before implementation begins. HIGH findings are blocking; MEDIUM findings require clarification; NIT findings are recommendations but should be addressed for completeness.

**Recommended next steps:**
1. Verify SafePay SDK interface against actual documentation
2. Confirm invoice numbering strategy with accounting/product
3. Add missing database fields (planId, checkoutUrl, providerSessionId) to Payment model
4. Clarify webhook field mapping after SDK verification
5. Implement callback endpoint on frontend
6. Update error handling in SafepayService to match HTTP semantics
