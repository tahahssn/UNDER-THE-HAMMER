import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentPurpose, PaymentStatus, RefundStatus } from '@prisma/client';

/**
 * PaymentsRepository
 *
 * Data access layer for payment-related operations.
 * Handles atomic upserts for idempotency, webhook event tracking, and financial ledger entries.
 *
 * No business logic in this layer. All domain operations are in SafepayService.
 */
@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically upsert a payment by idempotencyKey.
   * Prevents race condition: two concurrent checkout requests with the same idempotencyKey
   * will result in only one SafePay API call and both receiving the same checkout URL.
   *
   * Returns the payment record with the checkout URL if already created.
   * If this is the first creation, it returns a payment in PENDING status.
   */
  async upsertPaymentByIdempotencyKey(data: {
    idempotencyKey: string;
    userId: string;
    purpose: PaymentPurpose;
    subscriptionId?: string;
    tournamentId?: string;
    planId?: string;
    providerConfigId: string;
    amountMinor: bigint;
    currency: string;
  }) {
    return this.prisma.payment.upsert({
      where: { idempotencyKey: data.idempotencyKey },
      update: {},
      create: {
        idempotencyKey: data.idempotencyKey,
        userId: data.userId,
        purpose: data.purpose,
        subscriptionId: data.subscriptionId,
        tournamentId: data.tournamentId,
        planId: data.planId,
        providerConfigId: data.providerConfigId,
        amountMinor: data.amountMinor,
        currency: data.currency,
        status: PaymentStatus.PENDING,
      },
    });
  }

  /**
   * Get payment by idempotencyKey
   */
  async getPaymentByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        plan: true,
        subscription: true,
        user: true,
      },
    });
  }

  /**
   * Update payment checkout URL and provider session ID
   */
  async updatePaymentCheckoutUrl(paymentId: string, data: {
    checkoutUrl: string;
    providerSessionId: string;
  }) {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        checkoutUrl: data.checkoutUrl,
        providerSessionId: data.providerSessionId,
      },
    });
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(paymentId: string, status: PaymentStatus) {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        paidAt: status === PaymentStatus.PAID ? new Date() : undefined,
      },
    });
  }

  /**
   * Update payment provider payment ID
   */
  async updatePaymentProviderId(paymentId: string, providerPaymentId: string) {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { providerPaymentId },
    });
  }

  /**
   * Get payment by provider session ID
   */
  async getPaymentByProviderSessionId(
    providerConfigId: string,
    providerSessionId: string,
  ) {
    return this.prisma.payment.findFirst({
      where: {
        providerConfigId,
        providerSessionId,
      },
    });
  }

  /**
   * Create a provider webhook event (replay detection via unique constraint)
   * Returns the event if newly created, or existing event if already recorded.
   */
  async createProviderWebhookEvent(data: {
    providerConfigId: string;
    providerEventId: string;
    eventType: string;
    payload: Record<string, any>;
    signatureValid: boolean;
  }) {
    return this.prisma.providerWebhookEvent.upsert({
      where: {
        providerConfigId_providerEventId: {
          providerConfigId: data.providerConfigId,
          providerEventId: data.providerEventId,
        },
      },
      update: {},
      create: {
        providerConfigId: data.providerConfigId,
        providerEventId: data.providerEventId,
        eventType: data.eventType,
        payload: data.payload,
        signatureValid: data.signatureValid,
      },
    });
  }

  /**
   * Check if a webhook event has already been processed
   */
  async isWebhookEventProcessed(
    providerConfigId: string,
    providerEventId: string,
  ): Promise<boolean> {
    const event = await this.prisma.providerWebhookEvent.findUnique({
      where: {
        providerConfigId_providerEventId: {
          providerConfigId,
          providerEventId,
        },
      },
      select: { processedAt: true },
    });
    return event?.processedAt != null;
  }

  /**
   * Mark webhook event as processed
   */
  async updateWebhookEventProcessed(webhookEventId: string) {
    return this.prisma.providerWebhookEvent.update({
      where: { id: webhookEventId },
      data: { processedAt: new Date() },
    });
  }

  /**
   * Mark webhook event as errored
   */
  async updateWebhookEventError(webhookEventId: string, error: string) {
    return this.prisma.providerWebhookEvent.update({
      where: { id: webhookEventId },
      data: { processingError: error },
    });
  }

  /**
   * Get refund by provider refund ID
   */
  async getRefundByProviderRefundId(providerRefundId: string) {
    return this.prisma.refund.findFirst({
      where: { providerRefundId },
    });
  }

  /**
   * Create financial ledger entry
   * Append-only. Corrections are compensating entries.
   */
  async createLedgerEntry(data: {
    paymentId?: string;
    refundId?: string;
    type: 'PAYMENT_RECEIVED' | 'REFUND_ISSUED' | 'ADJUSTMENT';
    amountMinor: bigint;
    currency: string;
    description?: string;
  }) {
    return this.prisma.financialLedgerEntry.create({
      data: {
        paymentId: data.paymentId,
        refundId: data.refundId,
        type: data.type,
        amountMinor: data.amountMinor,
        currency: data.currency,
        description: data.description,
      },
    });
  }

  /**
   * Query financial ledger entries with pagination
   */
  async queryLedgerEntries(filters: {
    paymentId?: string;
    refundId?: string;
    skip?: number;
    take?: number;
  }) {
    const [items, total] = await Promise.all([
      this.prisma.financialLedgerEntry.findMany({
        where: {
          paymentId: filters.paymentId,
          refundId: filters.refundId,
        },
        orderBy: { createdAt: 'desc' },
        skip: filters.skip,
        take: filters.take,
      }),
      this.prisma.financialLedgerEntry.count({
        where: {
          paymentId: filters.paymentId,
          refundId: filters.refundId,
        },
      }),
    ]);
    return { items, total };
  }

  /**
   * Create refund record
   */
  async createRefund(data: {
    paymentId: string;
    amountMinor: bigint;
    reason: string;
    requestedById: string;
  }) {
    return this.prisma.refund.create({
      data: {
        paymentId: data.paymentId,
        amountMinor: data.amountMinor,
        reason: data.reason,
        requestedById: data.requestedById,
        status: RefundStatus.REQUESTED,
      },
    });
  }

  /**
   * Update refund status
   */
  async updateRefundStatus(refundId: string, status: RefundStatus, providerRefundId?: string) {
    return this.prisma.refund.update({
      where: { id: refundId },
      data: {
        status,
        providerRefundId,
      },
    });
  }

  /**
   * Transactional wrapper: execute callback within a transaction
   * All changes are atomically committed or rolled back together.
   */
  async transaction<T>(callback: (prisma: PrismaService) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      return callback(tx as PrismaService);
    });
  }

  /**
   * Create a subscription record (used in webhook success handler)
   */
  async createSubscription(data: {
    userId: string;
    planId: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }) {
    return this.prisma.subscription.create({
      data: {
        userId: data.userId,
        planId: data.planId,
        status: 'ACTIVE',
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
      },
    });
  }

  /**
   * Create invoice record
   */
  async createInvoice(paymentId: string, invoiceNumber: string) {
    return this.prisma.invoice.create({
      data: {
        paymentId,
        number: invoiceNumber,
        issuedAt: new Date(),
      },
    });
  }
}
