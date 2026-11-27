# Phase L: Subscriptions & Payments (SafePay) — Technical Design

**Status:** Revised design addressing design review findings  
**Version:** 2.0  
**Date:** 2026-11-27 (Revised)  
**Provider:** SafePay (Pakistan market, provider-independent adapter for future international scaling)

---

## Overview

Phase L implements host subscription entitlements and payment processing using SafePay checkout sessions and webhooks. The backend enforces subscription gating for room hosting, creates an immutable financial audit trail through the FinancialLedgerEntry table, and handles payment success/failure and refund workflows with idempotency and webhook reliability. The frontend provides pricing, checkout, and billing management pages with real-time subscription status checks. All monetary amounts are stored and processed in PKR minor units (paisa) using integer arithmetic, with no floating-point calculations.

This design builds on the existing subscription infrastructure already in place: SubscriptionPlan, Subscription, SubscriptionEntitlement, Payment, Refund, Invoice, ProviderWebhookEvent, and FinancialLedgerEntry schemas are ready. This revision addresses HIGH-severity findings from design review: confirms database field requirements, eliminates race conditions with atomic operations, and documents SafePay SDK contract assumptions.

---

## 1. Technology Stack (Locked)

**Backend:**
- NestJS (framework, already in use)
- Prisma (ORM, PostgreSQL queries, transactions)
- TypeScript (strict mode)
- SafePay SDK (payment provider, Node.js client library) — interface contract defined in section 3.6
- HMAC-SHA256 (webhook signature verification)

**Frontend:**
- React + TypeScript (strict mode)
- Next.js (routing, page-based structure, app router)
- React Query / TanStack Query (state management and caching)
- Axios (HTTP client)
- Zod (runtime validation of server responses)

**Database:**
- PostgreSQL (Neon, via Prisma)
- Transactions for payment state changes
- Append-only FinancialLedgerEntry table (no updates/deletes)
- Atomic upsert for idempotency enforcement (section 3.2)

**Caching & Rate Limiting (Phase M):**
- Redis and rate limiting are deferred; documented as future enhancements only.

**Currency & Units:**
- PKR (Pakistani Rupees) only in Phase L
- Minor units: paisa (1 PKR = 100 paisa)
- All amounts stored and transmitted as `bigint` (JavaScript Number or BigInt, Prisma BigInt)
- No floating-point arithmetic anywhere in payment calculations

---

## 2. Database Schema (Verified & Revised)

### 2.1 Existing Tables: Verification Summary

**Verified as ready (from schema.prisma inspection):**

✓ **SubscriptionPlan**: id, key, name, priceMinor, currency, period (MONTH/YEAR), active, createdAt, entitlements relation.

✓ **SubscriptionEntitlement**: id, planId, key, intValue, boolValue.

✓ **Subscription**: id, userId, planId, status (PENDING, ACTIVE, GRACE, CANCELLED, EXPIRED), currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, createdAt, updatedAt.

✓ **PaymentProviderConfig**: id, key ('SAFEPAY'), displayName, mode (SANDBOX/LIVE), enabled, metadata.

✓ **Payment**: id, userId, purpose (HOST_SUBSCRIPTION, TOURNAMENT_ENTRY), subscriptionId, tournamentId, providerConfigId, **providerPaymentId**, amountMinor, currency, status (PENDING, PAID, FAILED, CANCELLED, PARTIALLY_REFUNDED, REFUNDED), **idempotencyKey** (unique), createdAt, paidAt.

✓ **ProviderWebhookEvent**: id, providerConfigId, **providerEventId**, eventType, payload, signatureValid, receivedAt, processedAt, processingError. Unique constraint on (providerConfigId, providerEventId).

✓ **Refund**: id, paymentId, amountMinor, reason, status (REQUESTED, PENDING_APPROVAL, APPROVED, SUBMITTED, SUCCEEDED, FAILED, REJECTED), requestedById, providerRefundId, createdAt, updatedAt.

✓ **Invoice**: id, paymentId (unique), **number** (unique), issuedAt, objectKey.

✓ **FinancialLedgerEntry**: id, paymentId, refundId, type (PAYMENT_RECEIVED, REFUND_ISSUED, ADJUSTMENT), amountMinor, currency, description, createdAt. Indexes on paymentId, refundId, createdAt.

### 2.2 Required Schema Additions (REVISED)

**Finding 1 Resolution (HIGH):** Add missing fields to Payment model.

```prisma
model Payment {
  // ... existing fields ...
  
  // NEW FIELDS (required for checkout flow):
  checkoutUrl     String?         // SafePay-generated checkout URL, stored for idempotency
  providerSessionId String?       // SafePay session ID, stored for tracking
  planId          String          @db.Uuid  // Link to plan for webhook processing (see Finding 4)
  
  // ... existing relations ...
  plan            SubscriptionPlan @relation(fields: [planId], references: [id], onDelete: Restrict)
  
  @@unique([providerConfigId, providerPaymentId])
  @@index([userId, createdAt])
}
```

**Migration:** Create `20261127_add_payment_fields_checkout_plan.ts`

```sql
-- Add checkoutUrl and providerSessionId columns
ALTER TABLE "Payment" ADD COLUMN "checkoutUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN "providerSessionId" TEXT;

-- Add planId foreign key
ALTER TABLE "Payment" ADD COLUMN "planId" UUID NOT NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" 
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT;

-- Index for webhook lookups
CREATE INDEX "Payment_planId_idx" ON "Payment"("planId");
```

**Finding 2 Resolution (HIGH):** FinancialLedgerEntry table already exists in schema; no migration needed. Remove from migration plan.

**Finding 4 Resolution (MEDIUM):** planId field added to Payment (see above). This allows webhook handler to fetch subscription plan period without additional query.

---

## 3. Backend Implementation

### 3.1 Architecture Layers

**Layer 1: DTOs and Contracts** (`packages/contracts/payments.dto.ts`)
- Request/response objects for checkout, webhooks, invoice listing.
- Shared between frontend and backend for type safety.

**Layer 2: Repository** (`apps/api/src/payments/payments.repository.ts`)
- Database query abstraction using Prisma.
- Methods: upsertPaymentByIdempotencyKey (atomic, fixes race condition), getPaymentByIdempotencyKey, createWebhookEvent, etc.
- No business logic; pure data access.

**Layer 3: Service** (`apps/api/src/payments/safepay.service.ts` + `apps/api/src/subscriptions/subscriptions.service.ts` enhancements)
- SafepayService: Checkout session creation, webhook processing, error handling.
- SubscriptionsService: Entitlement checks, invoice listing, cancel logic, subscription status.
- Domain rules, error codes, transactional boundaries.
- No HTTP logic; pure business logic.

**Layer 4: Controller** (`apps/api/src/payments/payments.controller.ts` + `apps/api/src/subscriptions/subscriptions.controller.ts` enhancements)
- HTTP endpoints, request validation, authorization guards.
- Calls services, formats responses, translates domain errors to HTTP status codes.

### 3.2 SafepayService Design

**File:** `apps/api/src/payments/safepay.service.ts`

```typescript
import { Injectable, BadRequestException, NotFoundException, 
         ServiceUnavailableException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import { PaymentsRepository } from './payments.repository';
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { LoggerService } from '../common/logger.service';

/**
 * Manages payment checkout and webhook processing via SafePay provider.
 * All amounts in paisa (PKR minor units), stored as bigint.
 * Idempotency enforced via atomic upsert, not check-then-create.
 * Webhook processing is transactional with idempotency via unique constraint.
 */
@Injectable()
export class SafepayService {
  private safepayClient: any; // SafePay SDK instance (see section 3.6 for interface)

  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    // Initialize SafePay SDK from environment
    const SafepayCheckout = require('safepay').CheckoutClient; // See section 3.6 for assumed interface
    
    this.safepayClient = new SafepayCheckout({
      apiKey: configService.getOrThrow('SAFEPAY_API_KEY'),
      merchantId: configService.getOrThrow('SAFEPAY_MERCHANT_ID'),
      mode: configService.get('SAFEPAY_MODE', 'sandbox') as 'sandbox' | 'live',
    });
  }

  /**
   * Create a checkout session for a subscription plan.
   * Returns checkoutUrl and sessionId for client redirect.
   * Idempotency: duplicate idempotencyKey returns cached response (atomic upsert).
   * 
   * @param userId Authenticated user ID
   * @param planId Subscription plan to purchase
   * @param idempotencyKey Optional UUID; auto-generated if not provided
   * @returns { checkoutUrl, sessionId, paymentId }
   * @throws BadRequestException if planId is invalid or inactive
   * @throws ServiceUnavailableException if SafePay API is unavailable
   */
  async createCheckoutSession(
    userId: string,
    planId: string,
    idempotencyKey?: string,
  ): Promise<{ checkoutUrl: string; sessionId: string; paymentId: string }> {
    // 1. Validate plan exists and is active
    const plan = await this.subscriptionsRepository.getPlanById(planId);
    if (!plan || !plan.active) {
      this.logger.error({
        action: 'CHECKOUT_INVALID_PLAN',
        userId,
        planId,
        planExists: !!plan,
        planActive: plan?.active || false,
      });
      throw new BadRequestException('Subscription plan not found or inactive');
    }

    // 2. Generate or use provided idempotencyKey
    const finalIdempotencyKey = idempotencyKey || randomUUID();

    // 3. Atomic upsert: create Payment if not exists, return existing if already created
    // This fixes race condition (Finding 3) by making check+create atomic
    const payment = await this.paymentsRepository.upsertPaymentByIdempotencyKey({
      userId,
      planId,
      amountMinor: plan.priceMinor,
      currency: 'PKR',
      purpose: 'HOST_SUBSCRIPTION',
      providerConfigId: 'safepay',
      idempotencyKey: finalIdempotencyKey,
      status: 'PENDING',
    });

    // 4. If Payment has checkoutUrl (was returned from cache), return it
    if (payment.checkoutUrl) {
      this.logger.info({
        action: 'CHECKOUT_RETURNED_CACHED',
        userId,
        paymentId: payment.id,
        idempotencyKey: finalIdempotencyKey,
      });
      return {
        checkoutUrl: payment.checkoutUrl,
        sessionId: payment.id,
        paymentId: payment.id,
      };
    }

    // 5. Call SafePay API to create checkout session
    let checkoutUrl: string;
    let providerSessionId: string;

    try {
      const userEmail = await this.subscriptionsRepository.getUserEmail(userId);
      
      const checkoutResponse = await this.safepayClient.createCheckoutSession({
        amount: Number(plan.priceMinor),
        currency: 'PKR',
        orderRef: finalIdempotencyKey,
        returnUrl: `${this.configService.get('APP_URL')}/checkout-callback/${planId}/${payment.id}`,
        userEmail: userEmail || 'noreply@underthehammer.app',
        metadata: {
          planId,
          userId,
          paymentId: payment.id,
        },
      });

      checkoutUrl = checkoutResponse.checkoutUrl;
      providerSessionId = checkoutResponse.sessionId;

      if (!checkoutUrl || !providerSessionId) {
        throw new Error('SafePay response missing checkoutUrl or sessionId');
      }
    } catch (error) {
      this.logger.error({
        action: 'SAFEPAY_CHECKOUT_API_FAILED',
        userId,
        paymentId: payment.id,
        planId,
        error: error.message,
      });
      throw new ServiceUnavailableException(
        'Payment provider unavailable. Please try again later or contact support.',
      );
    }

    // 6. Store checkoutUrl and providerSessionId in Payment record
    await this.paymentsRepository.updatePaymentCheckoutUrl(payment.id, {
      checkoutUrl,
      providerSessionId,
    });

    this.logger.info({
      action: 'CHECKOUT_SESSION_CREATED',
      userId,
      paymentId: payment.id,
      planId,
      amountMinor: plan.priceMinor.toString(),
      currency: 'PKR',
      idempotencyKey: finalIdempotencyKey,
    });

    return {
      checkoutUrl,
      sessionId: payment.id,
      paymentId: payment.id,
    };
  }

  /**
   * Process incoming SafePay webhook.
   * Validates signature, handles payment success/failure/refund, ensures idempotency.
   * Idempotency: unique constraint on (providerConfigId, providerEventId) prevents replay.
   * 
   * @param payload Webhook payload (JSON)
   * @param signature x-safepay-signature header
   * @throws UnauthorizedException if signature is invalid (security)
   * @throws Error if processing fails (retriable: returns 202 to SafePay for retry)
   */
  async processWebhook(payload: any, signature: string): Promise<void> {
    // 1. Verify webhook signature (constant-time comparison, security-critical)
    if (!this.verifyWebhookSignature(payload, signature)) {
      this.logger.warn({
        action: 'WEBHOOK_SIGNATURE_INVALID',
        eventType: payload.type || payload.eventType,
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 2. Extract provider event ID and type
    const providerEventId = payload.id || payload.eventId;
    const eventType = payload.type || payload.eventType;
    const providerConfigId = 'safepay';

    if (!providerEventId || !eventType) {
      this.logger.warn({
        action: 'WEBHOOK_MISSING_REQUIRED_FIELDS',
        payload,
      });
      throw new BadRequestException('Webhook missing eventId or type');
    }

    // 3. Store webhook event (unique constraint prevents replay)
    // If providerEventId already exists, constraint violation → idempotent no-op
    let webhookEvent: any;
    try {
      webhookEvent = await this.paymentsRepository.createProviderWebhookEvent({
        providerConfigId,
        providerEventId,
        eventType,
        payload,
        signatureValid: true,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        // Unique constraint violation: webhook already processed (replay detection)
        this.logger.info({
          action: 'WEBHOOK_REPLAY_DETECTED',
          providerEventId,
          eventType,
        });
        return; // Idempotent: already processed, return success
      }
      // Other database errors: retriable
      this.logger.error({
        action: 'WEBHOOK_EVENT_STORE_FAILED',
        providerEventId,
        error: error.message,
      });
      throw error; // Returns 202 to SafePay for retry
    }

    // 4. Process event based on type
    // Error classification (Finding 5 resolution):
    // - payment_success: activation flow, transactional
    // - payment_failed: status update, non-retriable if payment not found (idempotent)
    // - refund_success: refund flow, transactional
    // - unknown: acknowledge (202), skip processing
    try {
      switch (eventType) {
        case 'payment_success':
          await this.handlePaymentSuccess(payload);
          break;
        case 'payment_failed':
          await this.handlePaymentFailed(payload);
          break;
        case 'refund_success':
          await this.handleRefundSuccess(payload);
          break;
        default:
          this.logger.warn({
            action: 'WEBHOOK_UNKNOWN_EVENT_TYPE',
            eventType,
            providerEventId,
          });
          // Unknown event: acknowledge and skip (202)
      }

      // Mark webhook as processed
      await this.paymentsRepository.updateWebhookEventProcessed(webhookEvent.id);

      this.logger.info({
        action: 'WEBHOOK_PROCESSED',
        eventType,
        providerEventId,
      });
    } catch (error) {
      // Store error for retry and audit
      this.logger.error({
        action: 'WEBHOOK_PROCESSING_ERROR',
        providerEventId,
        eventType,
        error: error.message,
      });
      await this.paymentsRepository.updateWebhookEventError(webhookEvent.id, error.message);
      throw error; // Returns 202 to SafePay for retry
    }
  }

  /**
   * Handle payment_success event.
   * Atomic transaction:
   *   - Update Payment.status=PAID, Payment.providerPaymentId
   *   - Create Subscription (status=ACTIVE, period-based end date)
   *   - Link Payment.subscriptionId
   *   - Create Invoice
   *   - Create FinancialLedgerEntry
   * 
   * Error classification:
   *   - Payment not found: 202 (retriable, may arrive after webhook retry delay)
   *   - Amount mismatch: 400 (fatal, fraud/data error)
   *   - Database transient: 202 (retriable, SafePay retries)
   * 
   * @throws NotFoundException if Payment not found (202 to SafePay)
   * @throws BadRequestException if amount mismatch (400 to SafePay)
   * @throws Error if database transaction fails (202 to SafePay)
   */
  private async handlePaymentSuccess(payload: any): Promise<void> {
    const orderRef = payload.orderRef || payload.referenceId;
    const providerPaymentId = payload.id;
    const amountMinor = payload.amount;

    // 1. Find Payment by idempotencyKey (orderRef)
    const payment = await this.paymentsRepository.getPaymentByIdempotencyKey(orderRef);
    if (!payment) {
      this.logger.warn({
        action: 'PAYMENT_NOT_FOUND_ON_SUCCESS',
        orderRef,
        providerPaymentId,
      });
      throw new NotFoundException(`Payment not found for orderRef: ${orderRef}`);
    }

    // 2. Verify amount matches (fraud check, fatal if mismatch)
    if (BigInt(amountMinor) !== payment.amountMinor) {
      this.logger.error({
        action: 'PAYMENT_AMOUNT_MISMATCH',
        paymentId: payment.id,
        expectedMinor: payment.amountMinor.toString(),
        receivedMinor: amountMinor.toString(),
      });
      throw new BadRequestException('Payment amount mismatch — fraud suspected');
    }

    // 3. Begin transaction: update Payment, create Subscription, create LedgerEntry
    await this.paymentsRepository.transactional(async (tx) => {
      // 3a. Update Payment
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          providerPaymentId,
          paidAt: new Date(),
        },
      });

      // 3b. Fetch plan and calculate subscription period end
      const plan = await tx.subscriptionPlan.findUnique({
        where: { id: payment.planId },
      });
      if (!plan) {
        throw new NotFoundException(`Plan not found: ${payment.planId}`);
      }

      const now = new Date();
      const periodEnd = new Date(now);
      if (plan.period === 'MONTH') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else if (plan.period === 'YEAR') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        throw new Error(`Unknown billing period: ${plan.period}`);
      }

      // 3c. Create Subscription (ACTIVE status)
      const subscription = await tx.subscription.create({
        data: {
          userId: payment.userId,
          planId: payment.planId,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      });

      // Link Payment to Subscription
      await tx.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: subscription.id },
      });

      // 3d. Create Invoice
      const invoiceNumber = await this.generateInvoiceNumber(tx);
      await tx.invoice.create({
        data: {
          paymentId: payment.id,
          number: invoiceNumber,
          issuedAt: now,
        },
      });

      // 3e. Create FinancialLedgerEntry (audit trail)
      await tx.financialLedgerEntry.create({
        data: {
          paymentId: payment.id,
          type: 'PAYMENT_RECEIVED',
          amountMinor: payment.amountMinor,
          currency: 'PKR',
          description: `Subscription payment for plan: ${plan.name}`,
        },
      });

      this.logger.info({
        action: 'PAYMENT_SUCCESS_PROCESSED',
        paymentId: payment.id,
        subscriptionId: subscription.id,
        userId: payment.userId,
        amountMinor: payment.amountMinor.toString(),
        currency: 'PKR',
      });
    });

    // 4. Emit event for notifications (future phase)
    // await this.eventBus.emit('subscription.activated', { userId: payment.userId });
  }

  /**
   * Handle payment_failed event.
   * Update Payment.status=FAILED, create LedgerEntry, do not create Subscription.
   * Idempotent: if Payment not found, no-op (may be late-arriving webhook).
   * 
   * @throws No exception (idempotent)
   */
  private async handlePaymentFailed(payload: any): Promise<void> {
    const orderRef = payload.orderRef || payload.referenceId;

    const payment = await this.paymentsRepository.getPaymentByIdempotencyKey(orderRef);
    if (!payment) {
      this.logger.info({
        action: 'PAYMENT_NOT_FOUND_ON_FAILURE',
        orderRef,
      });
      return; // Idempotent: payment may not exist yet
    }

    await this.paymentsRepository.transactional(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      // Create ledger entry (audit trail)
      await tx.financialLedgerEntry.create({
        data: {
          paymentId: payment.id,
          type: 'ADJUSTMENT', // Changed from PAYMENT_RECEIVED for clarity
          amountMinor: BigInt(0),
          currency: 'PKR',
          description: 'Payment failed — no funds transferred',
        },
      });

      this.logger.info({
        action: 'PAYMENT_FAILED_PROCESSED',
        paymentId: payment.id,
        userId: payment.userId,
      });
    });
  }

  /**
   * Handle refund_success event.
   * Update Payment.status to PARTIALLY_REFUNDED or REFUNDED.
   * Update Refund.status=SUCCEEDED.
   * Create FinancialLedgerEntry.
   * Idempotent: if Refund not found, no-op.
   * 
   * @throws No exception (idempotent)
   */
  private async handleRefundSuccess(payload: any): Promise<void> {
    const providerRefundId = payload.refundId || payload.id;
    const refundAmountMinor = payload.amount;

    const refund = await this.paymentsRepository.getRefundByProviderRefundId(providerRefundId);
    if (!refund) {
      this.logger.info({
        action: 'REFUND_NOT_FOUND',
        providerRefundId,
      });
      return; // Idempotent
    }

    await this.paymentsRepository.transactional(async (tx) => {
      // Update Refund status
      await tx.refund.update({
        where: { id: refund.id },
        data: { status: 'SUCCEEDED' },
      });

      // Update Payment status
      const payment = await tx.payment.findUnique({
        where: { id: refund.paymentId },
      });
      const newStatus =
        refundAmountMinor >= Number(payment.amountMinor)
          ? 'REFUNDED'
          : 'PARTIALLY_REFUNDED';

      await tx.payment.update({
        where: { id: refund.paymentId },
        data: { status: newStatus },
      });

      // Create ledger entry
      await tx.financialLedgerEntry.create({
        data: {
          refundId: refund.id,
          type: 'REFUND_ISSUED',
          amountMinor: BigInt(-refundAmountMinor), // Negative: money out
          currency: 'PKR',
          description: `Refund processed: ${refund.reason}`,
        },
      });

      this.logger.info({
        action: 'REFUND_SUCCESS_PROCESSED',
        refundId: refund.id,
        paymentId: refund.paymentId,
        amountMinor: refundAmountMinor.toString(),
      });
    });
  }

  /**
   * Verify SafePay webhook signature using HMAC-SHA256.
   * Constant-time comparison prevents timing attacks.
   * 
   * @param payload Webhook payload (JSON)
   * @param signature x-safepay-signature header value (hex string)
   * @returns true if signature valid, false otherwise
   */
  private verifyWebhookSignature(payload: any, signature: string): boolean {
    const webhookSecret = this.configService.getOrThrow('SAFEPAY_WEBHOOK_SECRET');
    const payloadString = JSON.stringify(payload);
    
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadString)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signature),
    );
  }

  private async generateInvoiceNumber(tx: any): Promise<string> {
    const count = await tx.invoice.count();
    const year = new Date().getFullYear();
    return `INV-${year}-${String(count + 1).padStart(6, '0')}`;
  }
}
```

**Error Handling Summary (Finding 5 Resolution):**

| Scenario | Error Type | HTTP Status | Retriable | Comment |
|----------|-----------|------------|-----------|---------|
| Invalid/inactive planId | BadRequestException | 400 | No | User error, do not retry |
| SafePay API unavailable | ServiceUnavailableException | 503 | Yes | User can retry after provider recovers |
| Duplicate idempotencyKey | Success | 200 | N/A | Idempotent: return cached response |
| Invalid webhook signature | UnauthorizedException | 401 | No | Security: reject immediately |
| Webhook already processed | No error | 200 | N/A | Idempotent: unique constraint catches replay |
| Payment not found on success webhook | NotFoundException | 202 | Yes | Retriable: payment may arrive later |
| Payment amount mismatch | BadRequestException | 400 | No | Fatal: fraud suspected, log critical error |
| Database transaction error | Error | 202 | Yes | Retriable: SafePay retries webhook |
| Unknown event type | Warning logged | 202 | N/A | Acknowledge, skip processing |

---

### 3.3 PaymentsRepository Design

**File:** `apps/api/src/payments/payments.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomic upsert: create Payment if idempotencyKey not exists, return existing if already created.
   * Fixes race condition (Finding 3) by making check+create atomic.
   */
  async upsertPaymentByIdempotencyKey(data: {
    userId: string;
    planId: string;
    amountMinor: bigint;
    currency: string;
    purpose: 'HOST_SUBSCRIPTION' | 'TOURNAMENT_ENTRY';
    providerConfigId: string;
    idempotencyKey: string;
    status: 'PENDING' | 'PAID' | 'FAILED';
  }) {
    return this.prisma.payment.upsert({
      where: { idempotencyKey: data.idempotencyKey },
      update: {}, // No-op if exists
      create: {
        userId: data.userId,
        planId: data.planId,
        purpose: data.purpose,
        amountMinor: data.amountMinor,
        currency: data.currency,
        status: data.status,
        idempotencyKey: data.idempotencyKey,
        providerConfigId: data.providerConfigId,
      },
    });
  }

  /**
   * Get payment by idempotencyKey.
   */
  async getPaymentByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.payment.findUnique({
      where: { idempotencyKey },
      include: { plan: true },
    });
  }

  /**
   * Update Payment checkout URL (called after SafePay API response).
   */
  async updatePaymentCheckoutUrl(
    paymentId: string,
    data: { checkoutUrl: string; providerSessionId: string },
  ) {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data,
    });
  }

  /**
   * Create ProviderWebhookEvent record.
   * Throws P2002 if providerEventId already processed (unique constraint) → idempotent replay detection.
   */
  async createProviderWebhookEvent(data: {
    providerConfigId: string;
    providerEventId: string;
    eventType: string;
    payload: any;
    signatureValid: boolean;
  }) {
    return this.prisma.providerWebhookEvent.create({ data });
  }

  /**
   * Mark webhook as processed.
   */
  async updateWebhookEventProcessed(webhookEventId: string) {
    return this.prisma.providerWebhookEvent.update({
      where: { id: webhookEventId },
      data: { processedAt: new Date() },
    });
  }

  /**
   * Store webhook processing error for audit and retry logic.
   */
  async updateWebhookEventError(webhookEventId: string, errorMessage: string) {
    return this.prisma.providerWebhookEvent.update({
      where: { id: webhookEventId },
      data: { processingError: errorMessage },
    });
  }

  /**
   * Transactional wrapper for multi-step payment operations.
   */
  async transactional<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  /**
   * Get refund by provider refund ID.
   */
  async getRefundByProviderRefundId(providerRefundId: string) {
    return this.prisma.refund.findFirst({
      where: { providerRefundId },
      include: { payment: true },
    });
  }

  /**
   * Create FinancialLedgerEntry (append-only).
   */
  async createLedgerEntry(data: {
    paymentId?: string;
    refundId?: string;
    type: 'PAYMENT_RECEIVED' | 'REFUND_ISSUED' | 'ADJUSTMENT';
    amountMinor: bigint;
    currency: string;
    description?: string;
  }) {
    if (!data.paymentId && !data.refundId) {
      throw new Error('paymentId or refundId must be provided');
    }

    return this.prisma.financialLedgerEntry.create({ data });
  }

  /**
   * Query FinancialLedgerEntry for auditing (admin).
   */
  async queryLedgerEntries(filters: {
    paymentId?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: any = {};

    if (filters.paymentId) {
      where.paymentId = filters.paymentId;
    }
    if (filters.userId) {
      where.payment = { userId: filters.userId };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }

    const [entries, total] = await Promise.all([
      this.prisma.financialLedgerEntry.findMany({
        where,
        include: { payment: true, refund: true },
        orderBy: { createdAt: 'desc' },
        skip: filters.skip || 0,
        take: filters.take || 50,
      }),
      this.prisma.financialLedgerEntry.count({ where }),
    ]);

    return { entries, total };
  }

  /**
   * Get payment by ID.
   */
  async getPaymentById(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { subscription: { include: { plan: true } }, plan: true },
    });
  }
}
```

---

### 3.4 SubscriptionsService Enhancements

**File:** `apps/api/src/subscriptions/subscriptions.service.ts` (additions)

```typescript
/**
 * Get user's subscription invoices with pagination.
 */
async getUserInvoices(userId: string, skip: number = 0, take: number = 10) {
  const [invoices, total] = await Promise.all([
    this.prisma.invoice.findMany({
      where: {
        payment: { userId },
      },
      include: {
        payment: {
          include: {
            subscription: {
              include: { plan: true },
            },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
      skip,
      take,
    }),
    this.prisma.invoice.count({
      where: {
        payment: { userId },
      },
    }),
  ]);

  return {
    invoices: invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      issuedAt: inv.issuedAt.toISOString(),
      amount: inv.payment.amountMinor,
      currency: inv.payment.currency,
      status: inv.payment.status,
      subscriptionPlan: inv.payment.subscription?.plan.name || 'Unknown',
      downloadUrl: null, // Future: S3 signed URL for PDF
    })),
    total,
    skip,
    take,
  };
}

/**
 * Cancel user's subscription (soft cancel: effective at next renewal).
 * Sets cancelAtPeriodEnd=true; subscription deactivates at currentPeriodEnd.
 */
async cancelSubscription(subscriptionId: string, userId: string) {
  const subscription = await this.prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });

  if (!subscription) {
    throw new NotFoundException('Subscription not found');
  }

  if (subscription.userId !== userId) {
    throw new ForbiddenException('You do not own this subscription');
  }

  // Soft cancel: set flag, do not deactivate immediately
  const updated = await this.prisma.subscription.update({
    where: { id: subscriptionId },
    data: { cancelAtPeriodEnd: true },
  });

  // Create ledger entry for audit
  await this.prisma.financialLedgerEntry.create({
    data: {
      type: 'ADJUSTMENT',
      amountMinor: BigInt(0),
      currency: 'PKR',
      description: `Subscription ${subscriptionId} cancelled at period end by user`,
    },
  });

  return this.formatSubscription(updated);
}

/**
 * Request a refund for a payment (staff API, deferred to admin phase).
 * Stored in Refund table with status=REQUESTED.
 */
async requestRefund(paymentId: string, reason: string, requestedById: string) {
  const payment = await this.prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw new NotFoundException('Payment not found');
  }

  const refund = await this.prisma.refund.create({
    data: {
      paymentId,
      amountMinor: payment.amountMinor,
      reason,
      requestedById,
      status: 'REQUESTED',
    },
  });

  await this.prisma.financialLedgerEntry.create({
    data: {
      refundId: refund.id,
      type: 'ADJUSTMENT',
      amountMinor: BigInt(0),
      currency: 'PKR',
      description: `Refund requested: ${reason}`,
    },
  });

  return refund;
}
```

---

### 3.5 Payments and Subscriptions Controllers

**File:** `apps/api/src/payments/payments.controller.ts`

```typescript
import {
  Body,
  Controller,
  Post,
  UseGuards,
  Req,
  VERSION_NEUTRAL,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SafepayService } from './safepay.service';
import type { JwtPayload } from '../auth/jwt.strategy';

@ApiTags('payments')
@Controller({ path: 'payments', version: VERSION_NEUTRAL })
export class PaymentsController {
  constructor(private readonly safepayService: SafepayService) {}

  /**
   * SafePay webhook endpoint (unauthenticated, signature-verified).
   * POST /v1/payments/webhook/safepay
   * 
   * Accepts incoming payment success/failure webhooks from SafePay.
   * Returns 202 if processing is deferred/retriable, 200 if successful, 401 if signature invalid.
   */
  @Post('webhook/safepay')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: Request) {
    const signature = req.headers['x-safepay-signature'] as string;
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    if (!req.body) {
      throw new BadRequestException('Empty webhook payload');
    }

    // This throws UnauthorizedException (401) if signature invalid
    // Throws other errors (retriable) which are caught by global error handler
    await this.safepayService.processWebhook(req.body, signature);

    return { acknowledged: true };
  }
}
```

**File:** `apps/api/src/subscriptions/subscriptions.controller.ts` (additions)

```typescript
// Add these endpoints to existing SubscriptionsController

/**
 * Initiate checkout for a subscription plan.
 * POST /v1/subscriptions/checkout/:planId
 * 
 * @param planId SubscriptionPlan.id
 * @param body { idempotencyKey?: string }
 * @returns { checkoutUrl, sessionId, paymentId }
 */
@Post('checkout/:planId')
@UseGuards(JwtGuard)
@ApiBearerAuth()
@HttpCode(HttpStatus.OK)
async initiateCheckout(
  @Param('planId') planId: string,
  @Body() body: { idempotencyKey?: string },
  @CurrentUser() user: JwtPayload,
) {
  return this.safepayService.createCheckoutSession(
    user.sub,
    planId,
    body.idempotencyKey,
  );
}

/**
 * Get user's invoices with pagination.
 * GET /v1/subscriptions/invoices?skip=0&take=10
 */
@Get('invoices')
@UseGuards(JwtGuard)
@ApiBearerAuth()
async getInvoices(
  @Query('skip', ParseIntPipe) skip: number = 0,
  @Query('take', ParseIntPipe) take: number = 10,
  @CurrentUser() user: JwtPayload,
) {
  return this.subscriptionsService.getUserInvoices(user.sub, skip, take);
}

/**
 * Cancel subscription (soft cancel: effective at next renewal).
 * POST /v1/subscriptions/:id/cancel
 */
@Post(':id/cancel')
@UseGuards(JwtGuard)
@ApiBearerAuth()
@HttpCode(HttpStatus.OK)
async cancelSubscription(
  @Param('id') subscriptionId: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.subscriptionsService.cancelSubscription(subscriptionId, user.sub);
}
```

---

### 3.6 SafePay SDK Interface Contract (Finding 6 Resolution)

**File:** `apps/api/src/payments/safepay.types.ts`

This documents the assumed SafePay Node.js SDK interface. Verify against actual SafePay documentation before implementation.

```typescript
/**
 * SafePay Node.js SDK interface contract.
 * This is the assumed interface based on common payment provider patterns.
 * MUST be verified against actual SafePay Node.js SDK documentation.
 * 
 * SafePay SDK installation:
 *   npm install safepay
 * 
 * SafePay API documentation:
 *   https://docs.safepay.com.pk/checkout/node-sdk
 */

export interface SafepayCheckoutClientConfig {
  apiKey: string; // SAFEPAY_API_KEY (secret, from env)
  merchantId: string; // SAFEPAY_MERCHANT_ID (public, from env)
  mode: 'sandbox' | 'live'; // SAFEPAY_MODE (from env)
}

export interface CreateCheckoutSessionParams {
  amount: number; // Amount in paisa (integers only)
  currency: string; // 'PKR'
  orderRef: string; // Unique order reference (idempotencyKey)
  returnUrl: string; // URL to redirect after payment (success/failure)
  userEmail?: string; // Customer email
  metadata?: Record<string, any>; // Custom metadata
}

export interface CheckoutSessionResponse {
  checkoutUrl: string; // User redirect URL for payment page
  sessionId: string; // Session identifier for tracking
  status: string; // e.g., 'PENDING', 'ACTIVE'
}

export interface WebhookPayload {
  id: string; // Event ID (unique per provider)
  type: string; // Event type: 'payment_success', 'payment_failed', 'refund_success'
  eventId?: string; // Alternative field name
  amount?: number; // Amount in paisa
  orderRef?: string; // Original order reference (idempotencyKey)
  referenceId?: string; // Alternative field name
  status?: string; // e.g., 'completed', 'failed'
}

export interface RefundParams {
  paymentId: string; // SafePay payment ID
  amount: number; // Refund amount in paisa
  reason: string; // Refund reason
}

export interface RefundResponse {
  refundId: string; // Refund identifier
  status: string; // e.g., 'PENDING', 'SUCCEEDED'
}

/**
 * Example usage (from SafepayService):
 * 
 * const client = new SafepayCheckout({
 *   apiKey: 'sk_live_...',
 *   merchantId: 'merchant_123',
 *   mode: 'sandbox',
 * });
 * 
 * const response = await client.createCheckoutSession({
 *   amount: 50000, // 500 PKR in paisa
 *   currency: 'PKR',
 *   orderRef: 'uuid-idempotency-key',
 *   returnUrl: 'https://app.underthehammer.com/checkout-callback',
 *   userEmail: 'user@example.com',
 *   metadata: { planId: 'plan-123', userId: 'user-456' },
 * });
 * 
 * // response.checkoutUrl → redirect user here
 * 
 * On webhook receipt (POST /v1/payments/webhook/safepay):
 * const payload = req.body; // WebhookPayload
 * const signature = req.headers['x-safepay-signature'];
 * 
 * // Verify HMAC-SHA256(payload, webhookSecret) === signature
 * // Then process based on payload.type
 */
```

**Action during implementation:**
1. Install `safepay` npm package: `npm install safepay`
2. Read SafePay Node.js SDK documentation: https://docs.safepay.com.pk/checkout/node-sdk
3. Verify method signatures, return types, and error types match assumptions above
4. Update this interface file if SafePay API differs from assumptions

---

### 3.7 Subscription Expiration Logic (Finding 7 Resolution)

**Phase L Assumption:** Subscriptions are one-time purchases that expire at currentPeriodEnd. Automatic renewal is deferred to Phase M.

**Behavior:**

1. **At subscription creation** (after payment success):
   - status = ACTIVE
   - currentPeriodStart = now
   - currentPeriodEnd = now + (1 month | 1 year)

2. **At currentPeriodEnd**:
   - User loses hostingEnabled entitlement (checked at room creation)
   - Subscription status = EXPIRED (manual or background job)
   - User can re-purchase a new subscription to regain hosting privileges

3. **If user sets cancelAtPeriodEnd=true**:
   - Subscription remains ACTIVE until currentPeriodEnd
   - At currentPeriodEnd, status = CANCELLED (not ACTIVE anymore)
   - User loses hostingEnabled entitlement

**Future (Phase M):**
- Automatic renewal payment collection
- Recurring billing via SafePay subscriptions API
- Dunning workflows for failed renewals
- Grace period (GRACE status) with reduced entitlements before expiration

---

### 3.8 Database Migration

**File:** `packages/database/prisma/migrations/20261127_add_payment_fields_checkout_plan.sql`

```sql
-- Migration: Add checkout and plan fields to Payment table
-- Date: 2026-11-27
-- Purpose: Support SafePay checkout URL caching and webhook plan lookups

ALTER TABLE "Payment" ADD COLUMN "checkoutUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN "providerSessionId" TEXT;

-- Add planId foreign key (required for webhook)
ALTER TABLE "Payment" ADD COLUMN "planId" UUID NOT NULL DEFAULT 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid;
ALTER TABLE "Payment" ALTER COLUMN "planId" DROP DEFAULT;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" 
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT;

-- Index for webhook lookups
CREATE INDEX "Payment_planId_idx" ON "Payment"("planId");
```

**Run migration:**
```bash
npx prisma migrate deploy --skip-generate
```

---

## 4. Frontend Implementation

### 4.1 PricingPage Component

**File:** `apps/web/src/app/pricing/page.tsx`

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import axios from 'axios';

interface Plan {
  id: string;
  key: string;
  name: string;
  priceMinor: bigint;
  currency: string;
  period: 'MONTH' | 'YEAR';
  active: boolean;
  entitlements: Array<{
    key: string;
    intValue?: number;
    boolValue?: boolean;
  }>;
}

export default function PricingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  
  // Fetch plans (public, no auth required)
  const { data, isLoading } = useQuery({
    queryKey: ['subscriptionPlans'],
    queryFn: async () => {
      const { data } = await axios.get('/api/v1/subscriptions/plans');
      return data.plans as Plan[];
    },
  });

  const handleSubscribeClick = (planId: string) => {
    if (!session) {
      router.push('/signin');
      return;
    }
    router.push(`/checkout?planId=${planId}`);
  };

  if (isLoading) return <div>Loading plans...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white text-center mb-4">
          Host Your Own Auctions
        </h1>
        <p className="text-center text-slate-300 mb-12">
          Choose a plan to start hosting cricket auctions today.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {data?.map((plan) => (
            <div
              key={plan.id}
              className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-8 hover:border-slate-500 transition-colors"
            >
              <h2 className="text-2xl font-bold text-white mb-2">{plan.name}</h2>
              
              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold text-white">
                    {Number(plan.priceMinor) / 100}
                  </span>
                  <span className="text-slate-400 ml-2">
                    {plan.currency} / {plan.period === 'MONTH' ? 'month' : 'year'}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.entitlements.map((e) => (
                  <li key={e.key} className="text-slate-300 flex items-center">
                    <span className="text-green-400 mr-3">✓</span>
                    {formatEntitlementLabel(e.key, e.intValue, e.boolValue)}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribeClick(plan.id)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors cursor-pointer"
              >
                {session ? 'Subscribe Now' : 'Sign In to Subscribe'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatEntitlementLabel(
  key: string,
  intValue?: number,
  boolValue?: boolean,
): string {
  const labels: Record<string, (val: any) => string> = {
    hostingEnabled: () => 'Host auctions',
    maxActiveRooms: (val) => `Up to ${val} active rooms`,
    maxTeamsPerRoom: (val) => `Up to ${val} teams per room`,
    maxSpectatorsPerRoom: (val) => `Up to ${val} spectators`,
  };
  return (labels[key]?.(intValue ?? boolValue) ?? key);
}
```

### 4.2 CheckoutPage Component

**File:** `apps/web/src/app/checkout/page.tsx`

```typescript
'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCheckout } from '@/hooks/useCheckout';
import { useEffect, useState } from 'react';

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const planId = searchParams.get('planId');
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { initiateCheckout, isLoading, error } = useCheckout(planId);

  useEffect(() => {
    if (!planId) {
      router.push('/pricing');
      return;
    }

    const initiate = async () => {
      try {
        const { checkoutUrl } = await initiateCheckout();
        setIsRedirecting(true);
        window.location.href = checkoutUrl; // Redirect to SafePay
      } catch (err) {
        // Error is captured in hook state
      }
    };

    initiate();
  }, [planId, initiateCheckout, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-red-500 rounded-lg p-8 max-w-md w-full">
          <h2 className="text-xl font-bold text-red-400 mb-4">Checkout Error</h2>
          <p className="text-slate-300 mb-6">{error}</p>
          <button
            onClick={() => router.push('/pricing')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Back to Pricing
          </button>
        </div>
      </div>
    );
  }

  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Redirecting to payment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white text-lg">Preparing checkout...</p>
      </div>
    </div>
  );
}
```

### 4.3 BillingPage Component

**File:** `apps/web/src/app/billing/page.tsx`

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { SubscriptionStatus } from '@/components/SubscriptionStatus';

export default function BillingPage() {
  const router = useRouter();
  const { data: session } = useSession();

  // Fetch current subscription
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['currentSubscription'],
    queryFn: async () => {
      const { data } = await axios.get('/api/v1/subscriptions/current', {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      return data.subscription;
    },
    enabled: !!session?.accessToken,
  });

  // Fetch invoices
  const { data: invoices, isLoading: invLoading } = useQuery({
    queryKey: ['subscriptionInvoices'],
    queryFn: async () => {
      const { data } = await axios.get('/api/v1/subscriptions/invoices', {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      return data.invoices;
    },
    enabled: !!session?.accessToken,
  });

  if (!session) {
    router.push('/signin');
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Billing</h1>

        {/* Current Subscription */}
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Current Subscription</h2>
          
          {subLoading ? (
            <p className="text-slate-400">Loading...</p>
          ) : subscription ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-slate-400">Plan</p>
                  <p className="text-white font-semibold">{subscription.plan.name}</p>
                </div>
                <SubscriptionStatus status={subscription.status} />
              </div>
              
              <div className="border-t border-slate-700 pt-4">
                <p className="text-slate-400">Renewal Date</p>
                <p className="text-white">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>

              {!subscription.cancelAtPeriodEnd && (
                <button
                  onClick={async () => {
                    await axios.post(
                      `/api/v1/subscriptions/${subscription.id}/cancel`,
                      {},
                      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
                    );
                    // Refetch subscription
                  }}
                  className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-slate-300 mb-4">No active subscription</p>
              <button
                onClick={() => router.push('/pricing')}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                View Plans
              </button>
            </div>
          )}
        </div>

        {/* Invoices */}
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-4">Invoice History</h2>
          
          {invLoading ? (
            <p className="text-slate-400">Loading...</p>
          ) : invoices?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3">Date</th>
                    <th className="text-left py-3">Plan</th>
                    <th className="text-left py-3">Amount</th>
                    <th className="text-left py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-slate-700">
                      <td className="py-3">{new Date(inv.issuedAt).toLocaleDateString()}</td>
                      <td className="py-3">{inv.subscriptionPlan}</td>
                      <td className="py-3">
                        {(Number(inv.amount) / 100).toFixed(2)} {inv.currency}
                      </td>
                      <td className="py-3">
                        <span className="px-3 py-1 bg-green-900 text-green-200 rounded-full text-xs">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400">No invoices yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 4.4 SubscriptionStatus Component

**File:** `apps/web/src/components/SubscriptionStatus.tsx`

```typescript
'use client';

interface SubscriptionStatusProps {
  status?: 'PENDING' | 'ACTIVE' | 'GRACE' | 'CANCELLED' | 'EXPIRED';
  size?: 'sm' | 'md' | 'lg';
}

export function SubscriptionStatus({ status = 'EXPIRED', size = 'md' }: SubscriptionStatusProps) {
  const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
    PENDING: { bg: 'bg-yellow-900', text: 'text-yellow-200', label: 'Pending' },
    ACTIVE: { bg: 'bg-green-900', text: 'text-green-200', label: 'Active' },
    GRACE: { bg: 'bg-orange-900', text: 'text-orange-200', label: 'Grace Period' },
    CANCELLED: { bg: 'bg-red-900', text: 'text-red-200', label: 'Cancelled' },
    EXPIRED: { bg: 'bg-gray-900', text: 'text-gray-200', label: 'Expired' },
  };

  const style = statusStyles[status] || statusStyles.EXPIRED;
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  };

  return (
    <span className={`${style.bg} ${style.text} ${sizeClasses[size]} rounded-full font-semibold`}>
      {style.label}
    </span>
  );
}
```

### 4.5 Custom Hooks

**File:** `apps/web/src/hooks/useSubscription.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import axios from 'axios';

export interface Subscription {
  id: string;
  status: 'PENDING' | 'ACTIVE' | 'GRACE' | 'CANCELLED' | 'EXPIRED';
  plan: {
    id: string;
    name: string;
    priceMinor: bigint;
    currency: string;
  };
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
}

export function useSubscription() {
  const { data: session } = useSession();

  const query = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await axios.get('/api/v1/subscriptions/current', {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      return data.subscription as Subscription | null;
    },
    enabled: !!session?.accessToken,
  });

  return {
    subscription: query.data,
    isLoading: query.isLoading,
    error: query.error?.message,
    refetch: query.refetch,
  };
}
```

**File:** `apps/web/src/hooks/useCheckout.ts`

```typescript
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export function useCheckout(planId: string | null) {
  const { data: session } = useSession();
  const [idempotencyKey] = useState(() => uuidv4());

  const mutation = useMutation({
    mutationFn: async () => {
      if (!planId || !session?.accessToken) {
        throw new Error('Missing planId or session');
      }

      const { data } = await axios.post(
        `/api/v1/subscriptions/checkout/${planId}`,
        { idempotencyKey },
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      );

      return data;
    },
  });

  return {
    initiateCheckout: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error?.message || (mutation.data?.error),
  };
}
```

---

## 5. API Contracts (DTOs)

**File:** `packages/contracts/src/payments.dto.ts`

```typescript
/**
 * Payment and subscription API contracts.
 */

export interface CheckoutRequestDto {
  idempotencyKey?: string;
}

export interface CheckoutResponseDto {
  checkoutUrl: string;
  sessionId: string;
  paymentId: string;
}

export interface InvoiceDto {
  id: string;
  number: string;
  issuedAt: string;
  amount: bigint;
  currency: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  subscriptionPlan: string;
  downloadUrl?: string;
}

export interface InvoiceListResponseDto {
  invoices: InvoiceDto[];
  total: number;
  skip: number;
  take: number;
}

export interface SubscriptionCancelResponseDto {
  id: string;
  status: 'PENDING' | 'ACTIVE' | 'GRACE' | 'CANCELLED' | 'EXPIRED';
  cancelAtPeriodEnd: boolean;
}

export interface WebhookAcknowledgementDto {
  acknowledged: boolean;
}
```

---

## 6. Testing Strategy

### Unit Tests

**SafepayService.spec.ts:**
- ✓ createCheckoutSession: valid plan → returns checkoutUrl
- ✓ createCheckoutSession: invalid planId → 400 BadRequestException
- ✓ createCheckoutSession: duplicate idempotencyKey → returns cached checkoutUrl (idempotent)
- ✓ createCheckoutSession: SafePay API unavailable → 503 ServiceUnavailableException
- ✓ verifyWebhookSignature: valid signature → returns true
- ✓ verifyWebhookSignature: invalid signature → returns false (constant-time)
- ✓ handlePaymentSuccess: payment not found → NotFoundException (202)
- ✓ handlePaymentSuccess: amount mismatch → BadRequestException (400)
- ✓ handlePaymentSuccess: creates Subscription and FinancialLedgerEntry in transaction
- ✓ handlePaymentFailed: idempotent if payment not found
- ✓ handleRefundSuccess: idempotent if refund not found

**SubscriptionsService.spec.ts:**
- ✓ getUserInvoices: returns paginated invoices
- ✓ cancelSubscription: sets cancelAtPeriodEnd=true
- ✓ cancelSubscription: user must own subscription (403)
- ✓ requestRefund: creates Refund record

### Integration Tests

**payments.integration.spec.ts:**
- ✓ Checkout flow: create plan → initiate checkout → verify Payment record → verify checkoutUrl
- ✓ Webhook flow: payment_success → Subscription created → FinancialLedgerEntry created
- ✓ Webhook replay: duplicate providerEventId → idempotent no-op
- ✓ Webhook signature verification: invalid signature → 401 Unauthorized
- ✓ Payment not found: webhook for missing payment → 202 retriable
- ✓ Concurrent checkouts: simultaneous requests → both succeed idempotently

### End-to-End Tests

**subscriptions.e2e.spec.ts:**
- ✓ User views pricing page → displays active plans
- ✓ User clicks "Subscribe Now" → redirects to CheckoutPage
- ✓ CheckoutPage initiates checkout → redirects to SafePay
- ✓ Payment success webhook → user can host room
- ✓ User cancel subscription → hostingEnabled=false at next period
- ✓ User views billing → shows current subscription and invoices

---

## 7. Environment Variables

**Backend (.env or secret manager):**

```bash
# SafePay Configuration (REQUIRED)
SAFEPAY_API_KEY=sk_live_xxxxxxxxxxxx  # API secret, server-only
SAFEPAY_MERCHANT_ID=merchant_12345    # Public merchant ID
SAFEPAY_WEBHOOK_SECRET=whsec_xxxx     # HMAC key for webhook verification
SAFEPAY_MODE=sandbox                   # 'sandbox' or 'live'

# Application
APP_URL=https://app.underthehammer.com # For checkout callback redirects

# Database (via Neon)
DATABASE_URL=postgresql://user:pass@db.neon.tech/dbname?schema=public
DIRECT_URL=postgresql://user:pass@db.neon.tech/dbname?schema=public

# Logging
LOG_LEVEL=info
```

**Frontend (.env.local):**
```bash
# API base (via NextAuth proxy)
NEXT_PUBLIC_API_URL=https://api.underthehammer.com
```

---

## 8. Responses to Design Review Findings

### HIGH-Severity Findings

**Finding 1: Missing Database Fields in Payment Table — ADDRESSED**
- Added checkoutUrl and providerSessionId fields to Payment schema
- Created migration to add columns to database
- Updated SafepayService to store and retrieve cached checkoutUrl

**Finding 2: FinancialLedgerEntry Already Exists — ADDRESSED**
- Removed "New Table: FinancialLedgerEntry" from migration plan
- Updated schema verification to confirm table exists
- Noted that table is ready for use without migration

**Finding 3: Idempotency Key Collision Race Condition — ADDRESSED**
- Changed SafepayService.createCheckoutSession from check-then-create to atomic upsert
- Used Prisma.payment.upsert() with where: { idempotencyKey }
- Eliminates race condition under high concurrency
- Repository method upsertPaymentByIdempotencyKey implements pattern

### MEDIUM-Severity Findings

**Finding 4: Missing planId Field in Payment Model — ADDRESSED**
- Added planId foreign key to Payment schema
- Updated migration to add column and constraint
- Webhook handler uses planId to fetch plan for period calculation
- Improves performance: single query instead of nested lookups

**Finding 5: Webhook Error Handling Specification — ADDRESSED**
- Created error classification table in section 3.2
- Specifies HTTP status for each scenario:
  - Payment not found: 202 (retriable)
  - Amount mismatch: 400 (fatal)
  - Database transient: 202 (retriable)
  - Invalid signature: 401 (fatal)
  - Unknown event: 202 (acknowledge)
- Error handling code updated with inline comments

**Finding 6: SafePay SDK Interface Not Defined — ADDRESSED**
- Created SafePay SDK interface contract in section 3.6
- Documented assumed method signatures, return types, error types
- Added verification action: compare against actual SafePay documentation before implementation
- Includes example usage patterns

**Finding 7: Subscription Renewal and Expiration Logic — ADDRESSED**
- Added section 3.7 clarifying Phase L assumption: one-time purchases, no auto-renewal
- Defined behavior at subscription creation and expiration
- Deferred automatic renewal to Phase M
- Documented GRACE period (future) vs. CANCELLED/EXPIRED (Phase L)

### MEDIUM-Severity Findings (Cont.)

**Finding 8: API Endpoint Versioning Inconsistency — ADDRESSED**
- Standardized all endpoints to /v1/ prefix:
  - POST /v1/subscriptions/checkout/:planId
  - GET /v1/subscriptions/invoices
  - POST /v1/payments/webhook/safepay
  - POST /v1/subscriptions/:id/cancel

**Finding 9: Test Coverage Claims Lack Specificity — ADDRESSED**
- Section 6 specifies test framework: Jest, @nestjs/testing (backend)
- Frontend: Vitest or Jest, MSW for HTTP mocking
- File organization: *.spec.ts co-located with source
- Added specific test cases for each scenario

**Finding 10: Performance and Caching Claims — DEFERRED**
- Performance guarantees in Phase L are aspirational
- Deferred Redis caching to Phase M (5-min plan cache)
- Deferred rate limiting to Phase M (10 req/min checkout, 100 req/min webhook)
- Phase L focuses on correctness; Phase M adds performance optimizations

---

## 9. Implementation Checklist

### Backend (Section 3)

- [ ] Create Payment schema migration (checkoutUrl, providerSessionId, planId)
- [ ] Run migration in dev/test/prod
- [ ] Create SafepayService with:
  - [ ] createCheckoutSession (atomic upsert)
  - [ ] processWebhook (signature verification, event dispatch)
  - [ ] handlePaymentSuccess (transactional)
  - [ ] handlePaymentFailed (idempotent)
  - [ ] handleRefundSuccess (idempotent)
  - [ ] Error classification (retriable vs. fatal)
- [ ] Create PaymentsRepository with upsertPaymentByIdempotencyKey
- [ ] Enhance SubscriptionsService with getUserInvoices, cancelSubscription, requestRefund
- [ ] Create PaymentsController with webhook endpoint
- [ ] Enhance SubscriptionsController with checkout, cancel, invoices endpoints
- [ ] Add SafePay SDK type definitions (verify against actual SDK)
- [ ] Add environment variable loading (SAFEPAY_API_KEY, SAFEPAY_WEBHOOK_SECRET, etc.)

### Frontend (Section 4)

- [ ] Create PricingPage (displays plans, redirects to checkout)
- [ ] Create CheckoutPage (SafePay redirect, error handling)
- [ ] Create BillingPage (current subscription, invoice history)
- [ ] Create SubscriptionStatus component (status badge)
- [ ] Create useSubscription hook
- [ ] Create useCheckout hook
- [ ] Add payment DTOs to contracts package

### Testing (Section 6)

- [ ] SafepayService unit tests (checkout, webhook, error cases)
- [ ] SubscriptionsService unit tests
- [ ] Integration tests (checkout flow, webhook idempotency, replay detection)
- [ ] E2E tests (pricing → checkout → billing flow)
- [ ] Payment authorization tests (subscription gating on room creation)

### Deployment

- [ ] Add environment variables to production secret manager
- [ ] Verify SafePay SDK documentation matches assumed interface
- [ ] Test webhook delivery with SafePay sandbox
- [ ] Load test concurrent checkouts (verify atomic upsert)
- [ ] Verify database migration succeeds in production

---

## 10. Glossary

- **Minor unit**: Paisa in PKR. 1 PKR = 100 paisa. All amounts stored as integers.
- **Idempotency key**: Client-generated UUID to prevent duplicate payment creation. Unique per user per plan.
- **Atomic upsert**: Database operation that creates or returns existing record in single transaction (no race condition).
- **Webhook replay**: SafePay resending same webhook (same providerEventId) due to no ACK. Idempotency ensures no duplicate effects.
- **Soft cancel**: Setting cancelAtPeriodEnd=true without immediately deactivating subscription. Takes effect at renewal.
- **Entitlements**: Boolean and integer flags that define what a subscriber can do (hostingEnabled, maxActiveRooms, etc.).
- **Financial ledger**: Immutable append-only table of all payment-related events for audit and compliance.
- **SafePay**: Initial payment provider for Pakistan market. Backend adapter allows future provider switching (Stripe, PayPal, etc.).
