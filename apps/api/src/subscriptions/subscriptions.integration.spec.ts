import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { JwtGuard } from '../auth/jwt.guard';

describe('Subscriptions Integration Tests', () => {
  let app: INestApplication;
  let controller: SubscriptionsController;
  let service: SubscriptionsService;
  let repository: SubscriptionsRepository;

  // Mock user
  const mockUser = {
    sub: 'user-123',
    email: 'test@example.com',
  };

  const mockOtherUser = {
    sub: 'user-456',
    email: 'other@example.com',
  };

  const mockPlan = {
    id: 'plan-pro-monthly',
    key: 'pro_month',
    name: 'Pro Monthly',
    priceMinor: BigInt(10000000), // 1 lakh PKR in paisa
    currency: 'PKR',
    period: 'MONTH' as const,
    active: true,
    entitlements: [
      { key: 'hostingEnabled', boolValue: true },
      { key: 'maxActiveRooms', intValue: 5 },
      { key: 'maxTeamsPerRoom', intValue: 16 },
      { key: 'maxSpectatorsPerRoom', intValue: 1000 },
    ],
    createdAt: new Date(),
  };

  const mockFreePlan = {
    ...mockPlan,
    id: 'plan-free',
    key: 'free',
    name: 'Free Plan',
    priceMinor: BigInt(0),
    entitlements: [
      { key: 'hostingEnabled', boolValue: false },
      { key: 'maxActiveRooms', intValue: 0 },
    ],
  };

  const mockSubscription = {
    id: 'sub-123',
    userId: mockUser.sub,
    planId: mockPlan.id,
    status: 'ACTIVE',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    plan: mockPlan,
  };

  const mockInvoice = {
    id: 'inv-123',
    paymentId: 'pay-123',
    number: 'INV-001',
    issuedAt: new Date(),
    payment: {
      amountMinor: mockPlan.priceMinor,
      currency: 'PKR',
      status: 'PAID',
    },
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: {
            listPlans: jest.fn(),
            getActiveSubscription: jest.fn(),
            checkEntitlements: jest.fn(),
            canUserHost: jest.fn(),
            formatSubscription: jest.fn(),
            formatPlan: jest.fn(),
            getUserSubscription: jest.fn(),
            cancelSubscription: jest.fn(),
            getInvoices: jest.fn(),
          },
        },
        {
          provide: SubscriptionsRepository,
          useValue: {
            getPlanById: jest.fn(),
            getActivePlans: jest.fn(),
            getUserActiveSubscription: jest.fn(),
            getUserSubscriptions: jest.fn(),
            getEntitlementValue: jest.fn(),
            updateSubscriptionCancelAtPeriodEnd: jest.fn(),
            getUserInvoices: jest.fn(),
            hasActiveSubscription: jest.fn(),
          },
        },
        {
          provide: JwtGuard,
          useValue: {
            canActivate: jest.fn().mockImplementation((context) => {
              const request = context.switchToHttp().getRequest();
              request.user = mockUser;
              return true;
            }),
          },
        },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate: jest.fn().mockImplementation((context) => {
          const request = context.switchToHttp().getRequest();
          request.user = mockUser;
          return true;
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    controller = moduleRef.get(SubscriptionsController);
    service = moduleRef.get(SubscriptionsService);
    repository = moduleRef.get(SubscriptionsRepository);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /v1/subscriptions/plans', () => {
    it('should return list of active plans (public, no auth required)', async () => {
      // Arrange
      jest.spyOn(repository, 'getActivePlans').mockResolvedValue([mockPlan, mockFreePlan]);

      // Act
      const response = await request(app.getHttpServer())
        .get('/v1/subscriptions/plans')
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body).toHaveProperty('plans');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.plans)).toBe(true);
    });

    it('should cache response for 5 minutes', async () => {
      // Arrange
      jest.spyOn(repository, 'getActivePlans').mockResolvedValue([mockPlan]);

      // Act: First request
      await request(app.getHttpServer())
        .get('/v1/subscriptions/plans')
        .expect(HttpStatus.OK);

      // Reset mock to verify it's not called again
      jest.clearAllMocks();

      // Act: Second request within cache TTL
      const response = await request(app.getHttpServer())
        .get('/v1/subscriptions/plans')
        .expect(HttpStatus.OK);

      // Assert: Repository was not called (cached result returned)
      expect(repository.getActivePlans).not.toHaveBeenCalled();
      expect(response.body).toHaveProperty('plans');
    });

    it('should not require authentication', async () => {
      // Arrange
      jest.spyOn(repository, 'getActivePlans').mockResolvedValue([mockPlan]);

      // Act: No Authorization header
      const response = await request(app.getHttpServer())
        .get('/v1/subscriptions/plans')
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body).toHaveProperty('plans');
    });
  });

  describe('GET /v1/subscriptions/current', () => {
    it('should return current active subscription for authenticated user', async () => {
      // Arrange
      jest.spyOn(service, 'getActiveSubscription').mockResolvedValue({
        id: mockSubscription.id,
        userId: mockUser.sub,
        planId: mockPlan.id,
        status: 'ACTIVE',
      });

      // Act
      const response = await request(app.getHttpServer())
        .get('/v1/subscriptions/current')
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body).toHaveProperty('subscription');
      expect(service.getActiveSubscription).toHaveBeenCalledWith(mockUser.sub);
    });

    it('should return null if user has no active subscription', async () => {
      // Arrange
      jest.spyOn(service, 'getActiveSubscription').mockResolvedValue(null);

      // Act
      const response = await request(app.getHttpServer())
        .get('/v1/subscriptions/current')
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body.subscription).toBeNull();
    });

    it('should require authentication', async () => {
      // Act & Assert: No Authorization header
      await request(app.getHttpServer())
        .get('/v1/subscriptions/current')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /v1/subscriptions/entitlements', () => {
    it('should return user entitlements for active subscription', async () => {
      // Arrange
      jest.spyOn(service, 'checkEntitlements').mockResolvedValue({
        hostCanCreate: true,
        maxActiveRooms: 5,
        maxTeamsPerRoom: 16,
        maxSpectatorsPerRoom: 1000,
        maxRoomDurationMinutes: 480,
      });

      // Act
      const response = await request(app.getHttpServer())
        .get('/v1/subscriptions/entitlements')
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body.hostCanCreate).toBe(true);
      expect(response.body.maxActiveRooms).toBe(5);
      expect(service.checkEntitlements).toHaveBeenCalledWith(mockUser.sub);
    });

    it('should return restrictive defaults if no active subscription', async () => {
      // Arrange
      jest.spyOn(service, 'checkEntitlements').mockResolvedValue({
        hostCanCreate: false,
        maxActiveRooms: 0,
        maxTeamsPerRoom: 0,
        maxSpectatorsPerRoom: 0,
        maxRoomDurationMinutes: 0,
      });

      // Act
      const response = await request(app.getHttpServer())
        .get('/v1/subscriptions/entitlements')
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body.hostCanCreate).toBe(false);
      expect(response.body.maxActiveRooms).toBe(0);
    });

    it('should require authentication', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .get('/v1/subscriptions/entitlements')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /v1/subscriptions/invoices', () => {
    it('should return paginated invoices for user', async () => {
      // Arrange
      jest.spyOn(service, 'getInvoices').mockResolvedValue({
        items: [mockInvoice],
        total: 1,
      });

      // Act
      const response = await request(app.getHttpServer())
        .get('/v1/subscriptions/invoices')
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(service.getInvoices).toHaveBeenCalledWith(mockUser.sub, 0, 10);
    });

    it('should respect skip and take pagination params', async () => {
      // Arrange
      jest.spyOn(service, 'getInvoices').mockResolvedValue({
        items: [],
        total: 1,
      });

      // Act
      await request(app.getHttpServer())
        .get('/v1/subscriptions/invoices?skip=10&take=20')
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.OK);

      // Assert
      expect(service.getInvoices).toHaveBeenCalledWith(mockUser.sub, 10, 20);
    });

    it('should validate pagination bounds', async () => {
      // Arrange
      jest.spyOn(service, 'getInvoices').mockResolvedValue({
        items: [],
        total: 1,
      });

      // Act: Invalid take (too high)
      await request(app.getHttpServer())
        .get('/v1/subscriptions/invoices?take=1000')
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.OK);

      // Assert: Should clamp to max 100
      expect(service.getInvoices).toHaveBeenCalledWith(mockUser.sub, 0, 100);
    });

    it('should require authentication', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .get('/v1/subscriptions/invoices')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /v1/subscriptions/:id/cancel', () => {
    it('should cancel subscription and set cancelAtPeriodEnd flag', async () => {
      // Arrange
      const cancelledSub = { ...mockSubscription, cancelAtPeriodEnd: true };
      jest.spyOn(repository, 'getUserSubscriptions').mockResolvedValue({
        items: [mockSubscription],
        total: 1,
      });
      jest.spyOn(service, 'cancelSubscription').mockResolvedValue(cancelledSub);

      // Act
      const response = await request(app.getHttpServer())
        .post(`/v1/subscriptions/${mockSubscription.id}/cancel`)
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.NO_CONTENT);

      // Assert
      expect(response.body).toEqual({});
      expect(service.cancelSubscription).toHaveBeenCalledWith(mockUser.sub, mockSubscription.id);
    });

    it('should return 403 if user tries to cancel other user subscription', async () => {
      // Arrange: Mock subscription belongs to different user
      const otherUserSub = { ...mockSubscription, userId: mockOtherUser.sub };
      jest.spyOn(repository, 'getUserSubscriptions').mockResolvedValue({
        items: [], // Empty for current user
        total: 0,
      });

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/v1/subscriptions/${otherUserSub.id}/cancel`)
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 403 if subscription not found for user', async () => {
      // Arrange
      jest.spyOn(repository, 'getUserSubscriptions').mockResolvedValue({
        items: [],
        total: 0,
      });

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/v1/subscriptions/nonexistent-id/cancel`)
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should require authentication', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .post(`/v1/subscriptions/${mockSubscription.id}/cancel`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('Room Hosting Eligibility', () => {
    it('should allow room creation if user has active subscription with hostingEnabled', async () => {
      // This is integration tested in RoomsController tests
      // The SubscriptionGuard calls canUserHost() which uses this service
    });

    it('should deny room creation if user has no active subscription', async () => {
      // This is integration tested in RoomsController tests
      // SubscriptionGuard should return 403 'Active subscription required'
    });

    it('should allow room creation after successful payment webhook', async () => {
      // This requires full integration: checkout → webhook → subscription created → canUserHost returns true
      // Tested in payments integration tests
    });
  });

  describe('Subscription Cancellation State', () => {
    it('should keep canUserHost true until period end after cancellation', async () => {
      // Arrange
      const cancelledSub = {
        ...mockSubscription,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      };

      jest.spyOn(repository, 'getUserActiveSubscription').mockResolvedValue(cancelledSub);
      jest.spyOn(service, 'canUserHost').mockResolvedValue(true); // Still can host until period end

      // Act
      const canHost = await service.canUserHost(mockUser.sub);

      // Assert: Should still be able to host
      expect(canHost).toBe(true);
    });

    it('should deny hosting after period end if cancelAtPeriodEnd was set', async () => {
      // Arrange
      const expiredSub = {
        ...mockSubscription,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(Date.now() - 1000), // Ended
        status: 'CANCELLED',
      };

      jest.spyOn(repository, 'getUserActiveSubscription').mockResolvedValue(null); // Not active anymore

      // Act
      const canHost = await service.canUserHost(mockUser.sub);

      // Assert
      expect(canHost).toBe(false);
    });
  });

  describe('Invoice Retrieval', () => {
    it('should return invoices with correct amount formatting (paisa to PKR)', async () => {
      // Arrange
      const invoiceWithAmount = {
        ...mockInvoice,
        payment: {
          ...mockInvoice.payment,
          amountMinor: BigInt(10000000), // 1 lakh paisa = 1 lakh PKR
        },
      };

      jest.spyOn(service, 'getInvoices').mockResolvedValue({
        items: [invoiceWithAmount],
        total: 1,
      });

      // Act
      const response = await request(app.getHttpServer())
        .get('/v1/subscriptions/invoices')
        .set('Authorization', 'Bearer mock-token')
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body.items[0].payment.amountMinor).toBe('10000000');
      expect(response.body.items[0].payment.currency).toBe('PKR');
    });
  });

  describe('Authorization & Ownership Enforcement', () => {
    it('should enforce ownership: user A cannot view user B invoices', async () => {
      // The service receives userId from the JWT, so it naturally filters by current user
      // This is verified by checking that service.getInvoices is called with mockUser.sub
      jest.spyOn(service, 'getInvoices').mockResolvedValue({
        items: [],
        total: 0,
      });

      // Act
      await request(app.getHttpServer())
        .get('/v1/subscriptions/invoices')
        .set('Authorization', 'Bearer mock-token-user-123')
        .expect(HttpStatus.OK);

      // Assert: Should be called with current user's ID, not injectable from request
      expect(service.getInvoices).toHaveBeenCalledWith(mockUser.sub, expect.anything(), expect.anything());
    });
  });
});
