import { Test } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';

/**
 * Tests for SubscriptionsService
 * Focus: Entitlement checks and hosting eligibility
 */
describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let repo: SubscriptionsRepository;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: SubscriptionsRepository,
          useValue: {
            getUserActiveSubscription: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    repo = module.get<SubscriptionsRepository>(SubscriptionsRepository);
  });

  describe('canUserHost', () => {
    it('should return false for user with no subscription', async () => {
      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.canUserHost('user-1');

      expect(result).toBe(false);
    });

    it('should check hostingEnabled entitlement', async () => {
      const subscription = {
        id: 'sub-1',
        userId: 'user-1',
        plan: {
          id: 'plan-1',
          entitlements: [
            { key: 'hostingEnabled', boolValue: true },
          ],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const result = await service.canUserHost('user-1');

      expect(result).toBe(true);
    });

    it('should return false when hostingEnabled is false', async () => {
      const subscription = {
        id: 'sub-1',
        userId: 'user-1',
        plan: {
          id: 'plan-1',
          entitlements: [
            { key: 'hostingEnabled', boolValue: false },
          ],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const result = await service.canUserHost('user-1');

      expect(result).toBe(false);
    });
  });

  describe('getRoomLimits', () => {
    it('should return zeros for user with no subscription', async () => {
      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(null);

      const limits = await service.getRoomLimits('user-1');

      expect(limits.maxActiveRooms).toBe(0);
      expect(limits.maxTeamsPerRoom).toBe(0);
      expect(limits.maxSpectatorsPerRoom).toBe(0);
    });

    it('should return entitlements from active subscription', async () => {
      const subscription = {
        id: 'sub-1',
        userId: 'user-1',
        plan: {
          id: 'plan-1',
          entitlements: [
            { key: 'maxActiveRooms', intValue: 5 },
            { key: 'maxTeamsPerRoom', intValue: 8 },
            { key: 'maxSpectatorsPerRoom', intValue: 100 },
          ],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const limits = await service.getRoomLimits('user-1');

      expect(limits.maxActiveRooms).toBe(5);
      expect(limits.maxTeamsPerRoom).toBe(8);
      expect(limits.maxSpectatorsPerRoom).toBe(100);
    });
  });

  describe('checkEntitlements', () => {
    it('should return all entitlements with defaults', async () => {
      const subscription = {
        id: 'sub-1',
        userId: 'user-1',
        plan: {
          id: 'plan-1',
          entitlements: [
            { key: 'hostingEnabled', boolValue: true },
            { key: 'maxActiveRooms', intValue: 3 },
          ],
        },
      };

      (repo.getUserActiveSubscription as jest.Mock).mockResolvedValueOnce(subscription);

      const entitlements = await service.checkEntitlements('user-1');

      expect(entitlements.hostCanCreate).toBe(true);
      expect(entitlements.maxActiveRooms).toBe(3);
      expect(entitlements.maxTeamsPerRoom).toBe(16); // default
      expect(entitlements.maxSpectatorsPerRoom).toBe(100); // default
    });
  });
});
