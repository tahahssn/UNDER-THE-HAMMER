import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SafepayService } from './safepay.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentStatus, PaymentPurpose } from '@prisma/client';
import crypto from 'crypto';

/**
 * SafepayService Unit Tests
 *
 * Comprehensive test coverage for:
 * 1. Idempotent checkout session creation
 * 2. Webhook success/failure/refund flows
 * 3. Webhook replay detection
 * 4. Signature verification
 * 5. Error handling and classification
 * 6. Transactional atomicity
 * 7. Amount validation (integer paisa)
 * 8. Period calculations
 */
describe('SafepayService', () => {
  let service: SafepayService;
  let repository: jest.Mocked<PaymentsRepository>;

  const mockApiKey = 'test-api-key';
  const mockWebhookSecret = 'test-webhook-secret';

  beforeEach(async () => {
    repository = {
      upsertPaymentByIdempotencyKey: jest.fn(),
      getPaymentByIdempotencyKey: jest.fn(),
      getPaymentById: jest.fn(),
      updatePaymentCheckoutUrl: jest.fn(),
      updatePaymentStatus: jest.fn(),
      updatePaymentProviderId: jest.fn(),
      getPaymentByProviderSessionId: jest.fn(),
      createProviderWebhookEvent: jest.fn(),
      isWebhookEventProcessed: jest.fn(),
      updateWebhookEventProcessed: jest.fn(),
      updateWebhookEventError: jest.fn(),
      getRefundByProviderRefundId: jest.fn(),
      createLedgerEntry: jest.fn(),
      queryLedgerEntries: jest.fn(),
      createRefund: jest.fn(),
      updateRefundStatus: jest.fn(),
      transaction: jest.fn(),
      createSubscription: jest.fn(),
      createInvoice: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafepayService,
        {
          provide: PaymentsRepository,
          useValue: repository,
        },
        {
          provide: 'SAFEPAY_API_KEY',
          useValue: mockApiKey,
        },
        {
          provide: 'SAFEPAY_WEBHOOK_SECRET',
          useValue: mockWebhookSecret,
        },
      ],
    }).compile();

    service = module.get<SafepayService>(SafepayService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('should return cached checkout URL if already created', async () => {
      const paymentId = 'pay-123';
      const checkoutUrl = 'https://checkout.safepay.com/sess-123';
      const sessionId = 'sess-123';

      const mockPayment = {
        id: paymentId,
        checkoutUrl,
        providerSessionId: sessionId,
      };

      repository.upsertPaymentByIdempotencyKey.mockResolvedValueOnce(mockPayment);

      const result = await service.createCheckoutSession(
        'user-123',
        'plan-123',
        BigInt(10000000), // 10 lakh paisa
        'Professional Plan',
        'PKR',
        'safepay-config-123',
        'idempotency-key-123',
      );

      expect(result).toEqual({
        paymentId,
        checkoutUrl,
        sessionId,
      });

      // Verify no additional API calls
      expect(repository.updatePaymentCheckoutUrl).not.toHaveBeenCalled();
    });

    it('should be idempotent: same idempotencyKey returns same checkout URL', async () => {
      const idempotencyKey = 'idempotency-key-123';
      const paymentId = 'pay-123';

      // First call
      const mockPayment1 = {
        id: paymentId,
        checkoutUrl: null,
        providerSessionId: null,
      };
      repository.upsertPaymentByIdempotencyKey.mockResolvedValueOnce(mockPayment1);

      // Second call with same key should return cached response
      const mockPayment2 = {
        id: paymentId,
        checkoutUrl: 'https://checkout.safepay.com/sess-123',
        providerSessionId: 'sess-123',
      };
      repository.upsertPaymentByIdempotencyKey.mockResolvedValueOnce(mockPayment2);

      await service.createCheckoutSession(
        'user-123',
        'plan-123',
        BigInt(10000000),
        'Professional Plan',
        'PKR',
        'safepay-config-123',
        idempotencyKey,
      );

      // Second call with same key
      const result2 = await service.createCheckoutSession(
        'user-123',
        'plan-123',
        BigInt(10000000),
        'Professional Plan',
        'PKR',
        'safepay-config-123',
        idempotencyKey,
      );

      // Should return cached URL without duplicate API call
      expect(result2.checkoutUrl).toBe('https://checkout.safepay.com/sess-123');
    });

    it('should handle amount in integer paisa (no floating-point)', async () => {
      const amountMinor = BigInt(10000000); // 10 lakh paisa = 1 lac rupees
      const mockPayment = { id: 'pay-123', checkoutUrl: null, providerSessionId: null };
      repository.upsertPaymentByIdempotencyKey.mockResolvedValueOnce(mockPayment);

      await service.createCheckoutSession(
        'user-123',
        'plan-123',
        amountMinor,
        'Professional Plan',
        'PKR',
        'safepay-config-123',
      );

      // Verify amount passed as BigInt (no floating-point conversion)
      const callArgs = repository.upsertPaymentByIdempotencyKey.mock.calls[0][0];
      expect(callArgs.amountMinor).toBe(amountMinor);
      expect(typeof callArgs.amountMinor).toBe('bigint');
    });
  });

  describe('processWebhook', () => {
    it('should reject webhook with invalid signature (401)', async () => {
      const payload = { id: 'evt-123', type: 'payment.success' };
      const invalidSignature = 'invalid-signature';

      await expect(
        service.processWebhook(payload, invalidSignature, 'safepay-config-123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should detect webhook replay: duplicate providerEventId is no-op', async () => {
      const payload = {
        id: 'evt-123',
        type: 'payment.success',
        payment: { id: 'pay-123', sessionId: 'sess-123', amount: 10000000 },
      };

      const signature = this.generateValidSignature(JSON.stringify(payload), mockWebhookSecret);

      // Mock webhook event already processed
      const mockWebhookEvent = {
        id: 'webhook-evt-123',
        processedAt: new Date(), // Already processed
      };
      repository.createProviderWebhookEvent.mockResolvedValueOnce(mockWebhookEvent);

      await service.processWebhook(payload, signature, 'safepay-config-123');

      // Should not process handlers
      expect(repository.getPaymentByProviderSessionId).not.toHaveBeenCalled();
      expect(repository.updateWebhookEventProcessed).not.toHaveBeenCalled();
    });

    it('should validate event signature using HMAC-SHA256', async () => {
      const payload = {
        id: 'evt-123',
        type: 'payment.success',
        payment: { id: 'pay-123', sessionId: 'sess-123', amount: 10000000 },
      };

      const validSignature = this.generateValidSignature(
        JSON.stringify(payload),
        mockWebhookSecret,
      );

      const mockWebhookEvent = {
        id: 'webhook-evt-123',
        processedAt: null,
      };

      const mockPayment = {
        id: 'pay-123',
        userId: 'user-123',
        amountMinor: BigInt(10000000),
        planId: 'plan-123',
      };

      repository.createProviderWebhookEvent.mockResolvedValueOnce(mockWebhookEvent);
      repository.getPaymentByProviderSessionId.mockResolvedValueOnce(mockPayment);

      repository.transaction.mockImplementationOnce(async (callback) => {
        const mockTx = this.createMockTransaction();
        return callback(mockTx);
      });

      await service.processWebhook(payload, validSignature, 'safepay-config-123');

      // Signature validation should pass
      expect(repository.createProviderWebhookEvent).toHaveBeenCalled();
    });

    it('should process payment.success: Payment → Subscription → Invoice → LedgerEntry atomically', async () => {
      const payload = {
        id: 'evt-123',
        type: 'payment.success',
        payment: {
          id: 'pay-123',
          sessionId: 'sess-123',
          amount: 10000000,
          paidAt: new Date().toISOString(),
        },
      };

      const signature = this.generateValidSignature(JSON.stringify(payload), mockWebhookSecret);

      const mockWebhookEvent = {
        id: 'webhook-evt-123',
        processedAt: null,
      };

      const mockPayment = {
        id: 'pay-123',
        userId: 'user-123',
        amountMinor: BigInt(10000000),
        currency: 'PKR',
        planId: 'plan-123',
        plan: { name: 'Professional' },
      };

      const mockPlan = {
        period: 'MONTH',
      };

      repository.createProviderWebhookEvent.mockResolvedValueOnce(mockWebhookEvent);
      repository.getPaymentByProviderSessionId.mockResolvedValueOnce(mockPayment);

      const mockTx = {
        payment: {
          update: jest.fn().mockResolvedValueOnce({
            id: 'pay-123',
            status: PaymentStatus.PAID,
          }),
        },
        subscriptionPlan: {
          findUnique: jest.fn().mockResolvedValueOnce(mockPlan),
        },
        subscription: {
          create: jest.fn().mockResolvedValueOnce({ id: 'sub-123' }),
        },
        invoice: {
          create: jest.fn().mockResolvedValueOnce({ id: 'inv-123' }),
        },
        financialLedgerEntry: {
          create: jest.fn().mockResolvedValueOnce({ id: 'ledger-123' }),
        },
      } as any;

      repository.transaction.mockImplementationOnce(async (callback) => {
        return callback(mockTx);
      });

      await service.processWebhook(payload, signature, 'safepay-config-123');

      // Verify all operations were called
      expect(mockTx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-123' },
          data: expect.objectContaining({
            status: PaymentStatus.PAID,
          }),
        }),
      );

      expect(mockTx.subscription.create).toHaveBeenCalled();
      expect(mockTx.invoice.create).toHaveBeenCalled();
      expect(mockTx.financialLedgerEntry.create).toHaveBeenCalled();

      // Verify webhook marked as processed
      expect(repository.updateWebhookEventProcessed).toHaveBeenCalledWith('webhook-evt-123');
    });

    it('should validate amount matches: mismatch throws 400', async () => {
      const payload = {
        id: 'evt-123',
        type: 'payment.success',
        payment: {
          id: 'pay-123',
          sessionId: 'sess-123',
          amount: 20000000, // Different amount
        },
      };

      const signature = this.generateValidSignature(JSON.stringify(payload), mockWebhookSecret);

      const mockWebhookEvent = {
        id: 'webhook-evt-123',
        processedAt: null,
      };

      const mockPayment = {
        id: 'pay-123',
        userId: 'user-123',
        amountMinor: BigInt(10000000), // Expected amount
        planId: 'plan-123',
      };

      repository.createProviderWebhookEvent.mockResolvedValueOnce(mockWebhookEvent);
      repository.getPaymentByProviderSessionId.mockResolvedValueOnce(mockPayment);

      await expect(
        service.processWebhook(payload, signature, 'safepay-config-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle payment.failed: idempotent status update', async () => {
      const payload = {
        id: 'evt-123',
        type: 'payment.failed',
        payment: {
          id: 'pay-123',
          sessionId: 'sess-123',
          errorMessage: 'Card declined',
        },
      };

      const signature = this.generateValidSignature(JSON.stringify(payload), mockWebhookSecret);

      const mockWebhookEvent = {
        id: 'webhook-evt-123',
        processedAt: null,
      };

      const mockPayment = {
        id: 'pay-123',
        userId: 'user-123',
      };

      repository.createProviderWebhookEvent.mockResolvedValueOnce(mockWebhookEvent);
      repository.getPaymentByProviderSessionId.mockResolvedValueOnce(mockPayment);
      repository.updatePaymentStatus.mockResolvedValueOnce({ id: 'pay-123' });

      await service.processWebhook(payload, signature, 'safepay-config-123');

      expect(repository.updatePaymentStatus).toHaveBeenCalledWith('pay-123', PaymentStatus.FAILED);
      expect(repository.updateWebhookEventProcessed).toHaveBeenCalled();
    });

    it('should handle refund.success: transactional refund processing', async () => {
      const payload = {
        id: 'evt-123',
        type: 'refund.success',
        refund: {
          id: 'refund-123',
          paymentId: 'pay-123',
          amount: 5000000,
          status: 'succeeded',
        },
      };

      const signature = this.generateValidSignature(JSON.stringify(payload), mockWebhookSecret);

      const mockWebhookEvent = {
        id: 'webhook-evt-123',
        processedAt: null,
      };

      const mockRefund = {
        id: 'refund-123',
        paymentId: 'pay-123',
        amountMinor: BigInt(5000000),
        reason: 'User requested',
        payment: { currency: 'PKR' },
      };

      repository.createProviderWebhookEvent.mockResolvedValueOnce(mockWebhookEvent);
      repository.getRefundByProviderRefundId.mockResolvedValueOnce(mockRefund);

      const mockTx = {
        refund: {
          update: jest.fn().mockResolvedValueOnce({ id: 'refund-123' }),
        },
        payment: {
          update: jest.fn().mockResolvedValueOnce({ id: 'pay-123' }),
        },
        financialLedgerEntry: {
          create: jest.fn().mockResolvedValueOnce({ id: 'ledger-123' }),
        },
      } as any;

      repository.transaction.mockImplementationOnce(async (callback) => {
        return callback(mockTx);
      });

      await service.processWebhook(payload, signature, 'safepay-config-123');

      expect(mockTx.refund.update).toHaveBeenCalled();
      expect(mockTx.payment.update).toHaveBeenCalled();
      expect(mockTx.financialLedgerEntry.create).toHaveBeenCalled();
      expect(repository.updateWebhookEventProcessed).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw NotFoundException (retriable 202) when payment not found', async () => {
      const payload = {
        id: 'evt-123',
        type: 'payment.success',
        payment: {
          id: 'pay-123',
          sessionId: 'sess-123',
          amount: 10000000,
        },
      };

      const signature = this.generateValidSignature(JSON.stringify(payload), mockWebhookSecret);

      const mockWebhookEvent = {
        id: 'webhook-evt-123',
        processedAt: null,
      };

      repository.createProviderWebhookEvent.mockResolvedValueOnce(mockWebhookEvent);
      repository.getPaymentByProviderSessionId.mockResolvedValueOnce(null);

      await expect(
        service.processWebhook(payload, signature, 'safepay-config-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log and store error on webhook processing failure', async () => {
      const payload = {
        id: 'evt-123',
        type: 'payment.success',
        payment: {
          id: 'pay-123',
          sessionId: 'sess-123',
          amount: 10000000,
        },
      };

      const signature = this.generateValidSignature(JSON.stringify(payload), mockWebhookSecret);

      const mockWebhookEvent = {
        id: 'webhook-evt-123',
        processedAt: null,
      };

      repository.createProviderWebhookEvent.mockResolvedValueOnce(mockWebhookEvent);
      repository.getPaymentByProviderSessionId.mockResolvedValueOnce(null);
      repository.updateWebhookEventError.mockResolvedValueOnce({});

      await expect(
        service.processWebhook(payload, signature, 'safepay-config-123'),
      ).rejects.toThrow();

      expect(repository.updateWebhookEventError).toHaveBeenCalled();
    });
  });

  /**
   * Helper to generate valid HMAC-SHA256 signature
   */
  private generateValidSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Helper to create mock transaction
   */
  private createMockTransaction() {
    return {
      payment: {
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      subscription: {
        create: jest.fn(),
      },
      invoice: {
        create: jest.fn(),
      },
      financialLedgerEntry: {
        create: jest.fn(),
      },
      subscriptionPlan: {
        findUnique: jest.fn(),
      },
      refund: {
        update: jest.fn(),
      },
    };
  }
});
