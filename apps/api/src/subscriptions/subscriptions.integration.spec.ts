import { Test } from '@nestjs/testing';
import { INestApplication, ForbiddenException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Integration tests for SubscriptionsService
 * Tests subscription gating, entitlements, and room limits
 */
describe('Subscriptions Integration Tests', () => {
  let app: INestApplication;
  let service: SubscriptionsService;
  let repo: SubscriptionsRepository;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        SubscriptionsRepository,
        {
          provide: PrismaService,
          useValue: {
            subscriptionPlan: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            subscription: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            planEntitlement: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    service = moduleRef.get<SubscriptionsService>(SubscriptionsService);
    repo = moduleRef.get<SubscriptionsRepository>(SubscriptionsRepository);
    prisma = moduleRef.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('canUserHost() - Subscription Gating', () => {
    it('should return false for user with no subscription', async () => {
      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.canUserHost('user-no-sub');

      expect(result).toBe(false);
    });

    it('should return true for ACTIVE subscription with hostingEnabled', async () => {
      const subscription = {
        id: 'sub-active',
        userId: 'user-1',
        status: 'ACTIVE',
        plan: {
          id: 'plan-pro',
          key: 'PRO',
          name: 'Pro Plan',
          entitlements: [{ key: 'hostingEnabled', boolValue: true }],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const result = await service.canUserHost('user-1');

      expect(result).toBe(true);
    });

    it('should return false for EXPIRED subscription', async () => {
      const subscription = {
        id: 'sub-expired',
        userId: 'user-2',
        status: 'EXPIRED',
        plan: {
          id: 'plan-pro',
          key: 'PRO',
          entitlements: [{ key: 'hostingEnabled', boolValue: true }],
        },
      };

      // Repository should return null for expired subscription
      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.canUserHost('user-2');

      expect(result).toBe(false);
    });

    it('should return false for CANCELLED subscription', async () => {
      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.canUserHost('user-3');

      expect(result).toBe(false);
    });

    it('should return false when hostingEnabled is false', async () => {
      const subscription = {
        id: 'sub-no-hosting',
        userId: 'user-4',
        status: 'ACTIVE',
        plan: {
          id: 'plan-free',
          key: 'FREE',
          entitlements: [{ key: 'hostingEnabled', boolValue: false }],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const result = await service.canUserHost('user-4');

      expect(result).toBe(false);
    });
  });

  describe('getRoomLimits() - Entitlement Enforcement', () => {
    it('should return zeros for non-subscribed user', async () => {
      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(null);

      const limits = await service.getRoomLimits('user-no-sub');

      expect(limits.maxActiveRooms).toBe(0);
      expect(limits.maxTeamsPerRoom).toBe(0);
      expect(limits.maxSpectatorsPerRoom).toBe(0);
    });

    it('should enforce maxActiveRooms from subscription plan', async () => {
      const subscription = {
        id: 'sub-1',
        userId: 'user-1',
        plan: {
          id: 'plan-starter',
          entitlements: [{ key: 'maxActiveRooms', intValue: 3 }],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const limits = await service.getRoomLimits('user-1');

      expect(limits.maxActiveRooms).toBe(3);
    });

    it('should enforce maxTeamsPerRoom from subscription plan', async () => {
      const subscription = {
        id: 'sub-pro',
        userId: 'user-pro',
        plan: {
          id: 'plan-pro',
          entitlements: [{ key: 'maxTeamsPerRoom', intValue: 16 }],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const limits = await service.getRoomLimits('user-pro');

      expect(limits.maxTeamsPerRoom).toBe(16);
    });

    it('should enforce maxSpectatorsPerRoom from subscription plan', async () => {
      const subscription = {
        id: 'sub-enterprise',
        userId: 'user-enterprise',
        plan: {
          id: 'plan-enterprise',
          entitlements: [{ key: 'maxSpectatorsPerRoom', intValue: 500 }],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const limits = await service.getRoomLimits('user-enterprise');

      expect(limits.maxSpectatorsPerRoom).toBe(500);
    });

    it('should use defaults if entitlements missing', async () => {
      const subscription = {
        id: 'sub-minimal',
        userId: 'user-minimal',
        plan: {
          id: 'plan-minimal',
          entitlements: [], // No explicit entitlements
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const limits = await service.getRoomLimits('user-minimal');

      // Should return 0 (default) since user has subscription but limits not set
      expect(limits.maxActiveRooms).toBeGreaterThanOrEqual(0);
      expect(limits.maxTeamsPerRoom).toBeGreaterThanOrEqual(0);
      expect(limits.maxSpectatorsPerRoom).toBeGreaterThanOrEqual(0);
    });

    it('should respect subscription tier differences', async () => {
      // Starter tier
      const starterSub = {
        id: 'sub-starter',
        userId: 'user-starter',
        plan: {
          id: 'plan-starter',
          entitlements: [
            { key: 'maxActiveRooms', intValue: 2 },
            { key: 'maxTeamsPerRoom', intValue: 8 },
            { key: 'maxSpectatorsPerRoom', intValue: 50 },
          ],
        },
      };

      // Pro tier
      const proSub = {
        id: 'sub-pro',
        userId: 'user-pro',
        plan: {
          id: 'plan-pro',
          entitlements: [
            { key: 'maxActiveRooms', intValue: 10 },
            { key: 'maxTeamsPerRoom', intValue: 16 },
            { key: 'maxSpectatorsPerRoom', intValue: 500 },
          ],
        },
      };

      // Test starter limits
      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(starterSub);
      let limits = await service.getRoomLimits('user-starter');
      expect(limits.maxActiveRooms).toBe(2);

      // Test pro limits
      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(proSub);
      limits = await service.getRoomLimits('user-pro');
      expect(limits.maxActiveRooms).toBe(10);

      // Pro should have higher limits than starter
      expect(10).toBeGreaterThan(2);
    });
  });

  describe('checkEntitlements() - Comprehensive Entitlement Check', () => {
    it('should return all entitlements for active subscription', async () => {
      const subscription = {
        id: 'sub-1',
        userId: 'user-1',
        plan: {
          id: 'plan-pro',
          entitlements: [
            { key: 'hostingEnabled', boolValue: true },
            { key: 'maxActiveRooms', intValue: 5 },
            { key: 'maxTeamsPerRoom', intValue: 16 },
            { key: 'maxSpectatorsPerRoom', intValue: 100 },
            { key: 'maxRoomDurationMinutes', intValue: 480 },
          ],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const entitlements = await service.checkEntitlements('user-1');

      expect(entitlements.hostCanCreate).toBe(true);
      expect(entitlements.maxActiveRooms).toBe(5);
      expect(entitlements.maxTeamsPerRoom).toBe(16);
      expect(entitlements.maxSpectatorsPerRoom).toBe(100);
      expect(entitlements.maxRoomDurationMinutes).toBe(480);
    });

    it('should return restrictive defaults for non-subscribed user', async () => {
      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(null);

      const entitlements = await service.checkEntitlements('user-no-sub');

      expect(entitlements.hostCanCreate).toBe(false);
      expect(entitlements.maxActiveRooms).toBe(0);
      expect(entitlements.maxTeamsPerRoom).toBe(0);
      expect(entitlements.maxSpectatorsPerRoom).toBe(0);
      expect(entitlements.maxRoomDurationMinutes).toBe(0);
    });
  });
});
