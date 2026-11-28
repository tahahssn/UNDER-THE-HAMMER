import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, Logger, Inject } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { PaymentPurpose, PaymentStatus } from '@prisma/client';
import type { SafePayWebhookPayload } from './safepay.types';
import crypto from 'crypto';

/**
 * SafepayService
 *
 * Handles SafePay integration for payment checkout and webhook processing.
 * All amounts are in integer minor units (paisa).
 *
 * Key responsibilities:
 * 1. Idempotent checkout session creation (atomically upserts payment record)
 * 2. Webhook signature verification (HMAC-SHA256)
 * 3. Webhook replay detection (unique constraint on providerEventId)
 * 4. Transactional payment success/failure handling
 * 5. Error classification (401 for signature, 202 for retriable, 400 for fatal)
 */
@Injectable()
export class SafepayService {
  private readonly logger = new Logger(SafepayService.name);

  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    @Inject('SAFEPAY_API_KEY') private readonly apiKey: string,
    @Inject('SAFEPAY_WEBHOOK_SECRET') private readonly webhookSecret: string,
  ) {}

  /**
   * Create a checkout session for subscription payment.
   * Idempotent: calling with same idempotencyKey returns cached checkout URL without duplicate API calls.
   * 
   * Now stores plan details (amount, currency) at checkout time to handle plan-deleted-after-payment edge case.
   */
  async createCheckoutSession(
    userId: string,
    planId: string,
    planPrice: bigint,
    planName: string,
    currency: string,
    providerConfigId: string,
    customerEmail?: string,
    customerName?: string,
    idempotencyKey?: string,
  ) {
    // Use provided idempotencyKey or generate one
    const key = idempotencyKey || this.generateIdempotencyKey();

    // Atomically upsert payment record by idempotencyKey
    // If this key already exists, we return the existing record
    // Store plan details (planPrice, currency) at checkout time for future reference
    const payment = await this.paymentsRepo.upsertPaymentByIdempotencyKey({
      idempotencyKey: key,
      userId,
      purpose: PaymentPurpose.HOST_SUBSCRIPTION,
      planId,
      providerConfigId,
      amountMinor: planPrice,
      currency,
      // Store additional metadata for webhook handling later
      metadata: {
        planName,
        planPrice: planPrice.toString(),
        planCurrency: currency,
      },
    });

    // Check if we already have a checkout URL (previous successful call)
    if (payment.checkoutUrl && payment.providerSessionId) {
      this.logger.debug(
        `Returning cached checkout URL for idempotencyKey: ${key}`,
      );
      return {
        paymentId: payment.id,
        checkoutUrl: payment.checkoutUrl,
        sessionId: payment.providerSessionId,
      };
    }

    // First time: call SafePay API to create checkout session
    this.logger.log(
      `Creating SafePay checkout session for payment: ${payment.id}`,
    );

    try {
      // Call SafePay API to create checkout session with customer metadata
      const checkoutResponse = await this.callSafePayCreateCheckout({
        amountMinor: Number(planPrice),
        currency,
        description: `Subscription: ${planName}`,
        idempotencyKey: key,
        customerEmail,
        customerName,
        metadata: {
          paymentId: payment.id,
          userId,
          planId,
        },
      });

      // Store checkout URL and provider session ID
      await this.paymentsRepo.updatePaymentCheckoutUrl(payment.id, {
        checkoutUrl: checkoutResponse.checkoutUrl,
        providerSessionId: checkoutResponse.sessionId,
      });

      return {
        paymentId: payment.id,
        checkoutUrl: checkoutResponse.checkoutUrl,
        sessionId: checkoutResponse.sessionId,
      };
    } catch (error) {
      this.logger.error(
        `SafePay API error for payment ${payment.id}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process incoming webhook from SafePay.
   * Verifies signature, creates webhook event (replay detection), and dispatches to handlers.
   * 
   * Error semantics:
   * - 401: Invalid signature (fatal, don't retry)
   * - 400/404: Business logic errors (fatal, don't retry)
   * - 202: Retriable infrastructure errors (database connection, timeout, etc.)
   */
  async processWebhook(
    payload: Record<string, any>,
    signature: string,
    providerConfigId: string,
  ): Promise<{ isRetriableError?: boolean }> {
    // 1. Verify HMAC-SHA256 signature
    const payloadJson = JSON.stringify(payload);
    const isValidSignature = this.verifyWebhookSignature(
      payloadJson,
      signature,
      this.webhookSecret,
    );

    if (!isValidSignature) {
      this.logger.warn(
        `Invalid webhook signature for event: ${payload.id}`,
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 2. Create webhook event record (replay detection via unique constraint)
    // If event already processed, upsert returns existing record
    const webhookEvent = await this.paymentsRepo.createProviderWebhookEvent({
      providerConfigId,
      providerEventId: payload.id,
      eventType: payload.type,
      payload,
      signatureValid: true,
    });

    // 3. Check if already processed
    if (webhookEvent.processedAt) {
      this.logger.debug(
        `Webhook replay detected for event: ${payload.id}. Ignoring.`,
      );
      return {}; // No-op on replay
    }

    try {
      // 4. Dispatch to appropriate handler
      const typedPayload = payload as SafePayWebhookPayload;

      switch (typedPayload.type) {
        case 'payment.success':
          await this.handlePaymentSuccess(typedPayload);
          break;
        case 'payment.failed':
          await this.handlePaymentFailed(typedPayload);
          break;
        case 'refund.success':
          await this.handleRefundSuccess(typedPayload);
          break;
        default:
          this.logger.warn(
            `Unknown webhook event type: ${typedPayload.type}`,
          );
      }

      // 5. Mark event as processed
      await this.paymentsRepo.updateWebhookEventProcessed(webhookEvent.id);
      return {}; // Success, no retry needed
    } catch (error) {
      // Classify error: fatal business logic errors vs retriable infrastructure errors
      const isRetriable = this.isRetriableWebhookError(error);
      
      await this.paymentsRepo.updateWebhookEventError(
        webhookEvent.id,
        String(error),
      );
      
      // Store retriability flag in error so controller can respond with correct HTTP status
      const enrichedError = new Error(String(error));
      (enrichedError as any).isRetriable = isRetriable;
      throw enrichedError;
    }
  }

  /**
   * Determine if a webhook processing error is retriable or fatal.
   * Fatal errors (bad data, missing records) should NOT be retried.
   * Retriable errors (infrastructure issues) should be retried.
   */
  private isRetriableWebhookError(error: any): boolean {
    // Business logic errors: NOT retriable
    if (error instanceof NotFoundException) {
      return false; // Payment not found, plan deleted, etc. — fatal
    }
    if (error instanceof BadRequestException) {
      return false; // Amount mismatch, invalid data — fatal
    }
    if (error instanceof UnauthorizedException) {
      return false; // Signature invalid — fatal
    }

    // Infrastructure errors: RETRIABLE
    // Database connection errors, timeouts, rate limits, etc.
    if (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'EHOSTUNREACH' ||
      error instanceof Error && error.message.includes('connection')
    ) {
      return true;
    }

    // Default: treat unknown errors as retriable to be safe
    return true;
  }

  /**
   * Handle payment.success webhook event.
   * Transactional: Payment → Subscription → Invoice → FinancialLedgerEntry all created atomically.
   */
  private async handlePaymentSuccess(payload: SafePayWebhookPayload): Promise<void> {
    if (!payload.payment) {
      throw new BadRequestException('Missing payment data in webhook');
    }

    // Find payment by provider session ID
    const payment = await this.paymentsRepo.getPaymentByProviderSessionId(
      'safepay', // TODO: get from context
      payload.payment.sessionId || '',
    );

    if (!payment) {
      this.logger.error(
        `Payment not found for sessionId: ${payload.payment.sessionId}`,
      );
      throw new NotFoundException('Payment not found');
    }

    // Verify amount matches (fatal error if mismatch)
    if (payment.amountMinor !== BigInt(payload.payment.amount)) {
      this.logger.error(
        `Amount mismatch for payment ${payment.id}: expected ${payment.amountMinor}, got ${payload.payment.amount}`,
      );
      throw new BadRequestException('Payment amount mismatch');
    }

    // Execute all changes atomically
    await this.paymentsRepo.transaction(async (tx) => {
      // 1. Update payment status
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(payload.payment!.paidAt || new Date()),
          providerPaymentId: payload.payment!.id,
        },
      });

      // 2. Create subscription (if planId is set)
      if (payment.planId) {
        const plan = await tx.subscriptionPlan.findUnique({
          where: { id: payment.planId },
        });

        if (!plan) {
          throw new NotFoundException('Subscription plan not found');
        }

        const now = new Date();
        const periodEnd = this.calculatePeriodEnd(now, plan.period);

        await tx.subscription.create({
          data: {
            userId: payment.userId,
            planId: payment.planId,
            status: 'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }

      // 3. Create invoice
      const invoiceNumber = this.generateInvoiceNumber();
      await tx.invoice.create({
        data: {
          paymentId: payment.id,
          number: invoiceNumber,
          issuedAt: new Date(),
        },
      });

      // 4. Create financial ledger entry
      await tx.financialLedgerEntry.create({
        data: {
          paymentId: payment.id,
          type: 'PAYMENT_RECEIVED',
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          description: `Subscription payment for plan: ${payment.plan?.name}`,
        },
      });
    });

    this.logger.log(
      `Payment ${payment.id} successfully processed. Subscription created for user ${payment.userId}`,
    );
  }

  /**
   * Handle payment.failed webhook event.
   * Idempotent status update (safe to retry).
   */
  private async handlePaymentFailed(payload: SafePayWebhookPayload): Promise<void> {
    if (!payload.payment) {
      throw new BadRequestException('Missing payment data in webhook');
    }

    // Find payment
    const payment = await this.paymentsRepo.getPaymentByProviderSessionId(
      'safepay',
      payload.payment.sessionId || '',
    );

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Idempotently update status
    await this.paymentsRepo.updatePaymentStatus(payment.id, PaymentStatus.FAILED);

    this.logger.warn(
      `Payment ${payment.id} failed. Error: ${payload.payment.errorMessage}`,
    );
  }

  /**
   * Handle refund.success webhook event.
   * Transactional: Refund status updated, LedgerEntry created.
   */
  private async handleRefundSuccess(payload: SafePayWebhookPayload): Promise<void> {
    if (!payload.refund) {
      throw new BadRequestException('Missing refund data in webhook');
    }

    // Find refund by provider ID
    const refund = await this.paymentsRepo.getRefundByProviderRefundId(
      payload.refund.id,
    );

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    // Execute atomically
    await this.paymentsRepo.transaction(async (tx) => {
      // Update refund status
      await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: 'SUCCEEDED',
          providerRefundId: payload.refund!.id,
        },
      });

      // Update payment status
      await tx.payment.update({
        where: { id: refund.paymentId },
        data: {
          status: PaymentStatus.PARTIALLY_REFUNDED,
        },
      });

      // Create ledger entry
      await tx.financialLedgerEntry.create({
        data: {
          refundId: refund.id,
          type: 'REFUND_ISSUED',
          amountMinor: -refund.amountMinor, // Negative for outflow
          currency: refund.payment.currency,
          description: `Refund issued: ${refund.reason}`,
        },
      });
    });

    this.logger.log(`Refund ${refund.id} successfully processed`);
  }

  /**
   * Verify HMAC-SHA256 webhook signature
   */
  private verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * SafePay API call - creates checkout session via SDK
   * Uses CheckoutClient from SafePay SDK to initiate payment
   */
  private async callSafePayCreateCheckout(request: {
    amountMinor: number;
    currency: string;
    description: string;
    idempotencyKey: string;
    customerEmail?: string;
    customerName?: string;
    metadata?: Record<string, string>;
  }) {
    try {
      // Import SafePay SDK (assumed to be available after npm install safepay)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { CheckoutClient } = require('safepay');

      const client = new CheckoutClient({
        apiKey: this.apiKey,
        sandbox: false, // Use SAFEPAY_ENVIRONMENT env var for sandbox/prod
      });

      // Create checkout session with SafePay API
      const response = await client.createCheckoutSession({
        amount: request.amountMinor,
        currency: request.currency,
        description: request.description,
        idempotencyKey: request.idempotencyKey,
        returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout/return`, // SafePay redirects here after payment
        customization: {
          language: 'en',
        },
        ...(request.customerEmail && { customerEmail: request.customerEmail }),
        ...(request.customerName && { customerName: request.customerName }),
        metadata: request.metadata || {},
      });

      this.logger.debug(
        `SafePay checkout session created: ${response.sessionId}`,
      );

      return {
        sessionId: response.sessionId,
        checkoutUrl: response.checkoutUrl,
        paymentId: response.paymentId,
      };
    } catch (error) {
      this.logger.error('SafePay SDK error during checkout creation:', error);
      throw error;
    }
  }

  /**
   * Generate unique idempotency key
   */
  private generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate subscription period end date based on billing period
   */
  private calculatePeriodEnd(start: Date, period: 'MONTH' | 'YEAR'): Date {
    const end = new Date(start);
    if (period === 'MONTH') {
      end.setMonth(end.getMonth() + 1);
    } else if (period === 'YEAR') {
      end.setFullYear(end.getFullYear() + 1);
    }
    return end;
  }

  /**
   * Generate unique invoice number
   */
  private generateInvoiceNumber(): string {
    return `INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }
}
