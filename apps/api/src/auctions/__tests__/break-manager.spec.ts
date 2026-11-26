import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BreakManagerService } from '../services/break-manager.service';
import { AuctionsRepository } from '../auctions.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('BreakManagerService', () => {
  let service: BreakManagerService;
  let mockRepository: jest.Mocked<AuctionsRepository>;

  const mockAuctionId = 'auction-123';
  const mockPlayerId = 'player-1';
  const mockBreakId = 'break-1';

  beforeEach(async () => {
    mockRepository = {
      recordBreak: jest.fn(),
      getActiveBreak: jest.fn(),
      updateBreak: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakManagerService,
        {
          provide: AuctionsRepository,
          useValue: mockRepository,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<BreakManagerService>(BreakManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('shouldScheduleBreak', () => {
    it('should return false when bid count is below threshold (PER_PLAYER)', async () => {
      const result1 = await service.shouldScheduleBreak(
        mockAuctionId,
        5,
        'PER_PLAYER',
        mockPlayerId
      );
      expect(result1).toBe(false);

      const result2 = await service.shouldScheduleBreak(
        mockAuctionId,
        5,
        'PER_PLAYER',
        mockPlayerId
      );
      expect(result2).toBe(false);

      const result3 = await service.shouldScheduleBreak(
        mockAuctionId,
        5,
        'PER_PLAYER',
        mockPlayerId
      );
      expect(result3).toBe(false);

      const result4 = await service.shouldScheduleBreak(
        mockAuctionId,
        5,
        'PER_PLAYER',
        mockPlayerId
      );
      expect(result4).toBe(false);
    });

    it('should return true when bid count reaches threshold (PER_PLAYER)', async () => {
      for (let i = 0; i < 4; i++) {
        await service.shouldScheduleBreak(mockAuctionId, 5, 'PER_PLAYER', mockPlayerId);
      }

      const result = await service.shouldScheduleBreak(
        mockAuctionId,
        5,
        'PER_PLAYER',
        mockPlayerId
      );
      expect(result).toBe(true);
    });

    it('should track counters separately per player (PER_PLAYER scope)', async () => {
      const player1 = 'player-1';
      const player2 = 'player-2';

      for (let i = 0; i < 4; i++) {
        await service.shouldScheduleBreak(mockAuctionId, 5, 'PER_PLAYER', player1);
      }

      const result1 = await service.shouldScheduleBreak(
        mockAuctionId,
        5,
        'PER_PLAYER',
        player2
      );
      expect(result1).toBe(false);

      const result2 = await service.shouldScheduleBreak(
        mockAuctionId,
        5,
        'PER_PLAYER',
        player2
      );
      expect(result2).toBe(false);
    });

    it('should track bids across all players (ACROSS_AUCTION scope)', async () => {
      const player1 = 'player-1';
      const player2 = 'player-2';

      for (let i = 0; i < 3; i++) {
        await service.shouldScheduleBreak(mockAuctionId, 5, 'ACROSS_AUCTION', player1);
      }

      for (let i = 0; i < 1; i++) {
        await service.shouldScheduleBreak(mockAuctionId, 5, 'ACROSS_AUCTION', player2);
      }

      const result = await service.shouldScheduleBreak(
        mockAuctionId,
        5,
        'ACROSS_AUCTION',
        player2
      );
      expect(result).toBe(true);
    });

    it('should track counters separately per auction', async () => {
      const auction1 = 'auction-1';
      const auction2 = 'auction-2';

      for (let i = 0; i < 4; i++) {
        await service.shouldScheduleBreak(auction1, 5, 'ACROSS_AUCTION');
      }

      const result1 = await service.shouldScheduleBreak(
        auction1,
        5,
        'ACROSS_AUCTION'
      );
      expect(result1).toBe(true);

      const result2 = await service.shouldScheduleBreak(
        auction2,
        5,
        'ACROSS_AUCTION'
      );
      expect(result2).toBe(false);
    });
  });

  describe('incrementBidCounter', () => {
    it('should increment counter and return current count', () => {
      const count1 = service.incrementBidCounter(mockAuctionId, 'ACROSS_AUCTION');
      expect(count1).toBe(1);

      const count2 = service.incrementBidCounter(mockAuctionId, 'ACROSS_AUCTION');
      expect(count2).toBe(2);

      const count3 = service.incrementBidCounter(mockAuctionId, 'ACROSS_AUCTION');
      expect(count3).toBe(3);
    });

    it('should track per-player counters independently', () => {
      const player1 = 'player-1';
      const player2 = 'player-2';

      const count1 = service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player1);
      expect(count1).toBe(1);

      const count2 = service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player2);
      expect(count2).toBe(1);

      const count3 = service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player1);
      expect(count3).toBe(2);
    });
  });

  describe('startBreak', () => {
    it('should record break with server-driven deadline', async () => {
      const durationSeconds = 120;
      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        startedAt: new Date(),
        deadline: new Date(Date.now() + durationSeconds * 1000),
        originalDurationSeconds: durationSeconds,
        reason: 'After 5 bids',
        triggerBidCount: 5,
      };

      mockRepository.recordBreak.mockResolvedValue(mockBreakRecord);

      const result = await service.startBreak(
        mockAuctionId,
        durationSeconds,
        'After 5 bids',
        5
      );

      expect(mockRepository.recordBreak).toHaveBeenCalledWith(
        expect.objectContaining({
          auctionId: mockAuctionId,
          originalDurationSeconds: durationSeconds,
          reason: 'After 5 bids',
          triggerBidCount: 5,
        })
      );

      expect(result).toEqual(mockBreakRecord);
    });

    it('should calculate deadline correctly', async () => {
      const durationSeconds = 60;

      mockRepository.recordBreak.mockImplementation((data) => ({
        ...data,
        id: mockBreakId,
      }));

      await service.startBreak(mockAuctionId, durationSeconds);

      const callArgs = mockRepository.recordBreak.mock.calls[0][0];
      const deadlineTime = callArgs.deadline.getTime();
      const expectedDeadlineTime = Date.now() + durationSeconds * 1000;

      // Allow 1 second tolerance
      expect(deadlineTime).toBeGreaterThanOrEqual(expectedDeadlineTime - 1000);
      expect(deadlineTime).toBeLessThanOrEqual(expectedDeadlineTime + 1000);
    });
  });

  describe('extendBreak', () => {
    it('should extend break deadline when within limits', async () => {
      const currentDeadline = new Date(Date.now() + 60000);
      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        deadline: currentDeadline,
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);
      mockRepository.updateBreak.mockResolvedValue({
        ...mockBreakRecord,
        deadline: new Date(currentDeadline.getTime() + 30000),
      });

      const result = await service.extendBreak(mockAuctionId, 30, 300);

      expect(mockRepository.updateBreak).toHaveBeenCalledWith(
        mockBreakId,
        expect.objectContaining({
          deadline: new Date(currentDeadline.getTime() + 30000),
        })
      );

      expect(result.deadline.getTime()).toBe(
        currentDeadline.getTime() + 30000
      );
    });

    it('should respect maximum extension limit', async () => {
      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        deadline: new Date(),
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);

      await expect(
        service.extendBreak(mockAuctionId, 400, 300)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.extendBreak(mockAuctionId, 0, 300)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if no active break found', async () => {
      mockRepository.getActiveBreak.mockResolvedValue(null);

      await expect(
        service.extendBreak(mockAuctionId, 30)
      ).rejects.toThrow('No active break found');
    });
  });

  describe('reduceBreak', () => {
    it('should reduce break deadline when within limits', async () => {
      const currentDeadline = new Date(Date.now() + 120000);
      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        deadline: currentDeadline,
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);
      mockRepository.updateBreak.mockResolvedValue({
        ...mockBreakRecord,
        deadline: new Date(currentDeadline.getTime() - 30000),
      });

      const result = await service.reduceBreak(mockAuctionId, 30, 300);

      expect(mockRepository.updateBreak).toHaveBeenCalledWith(
        mockBreakId,
        expect.objectContaining({
          deadline: expect.any(Date),
        })
      );

      const newDeadlineTime = mockRepository.updateBreak.mock.results[0].value.deadline.getTime();
      expect(newDeadlineTime).toBeLessThan(currentDeadline.getTime());
    });

    it('should maintain minimum 1 second remaining', async () => {
      const now = Date.now();
      const currentDeadline = new Date(now + 50000);

      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        deadline: currentDeadline,
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);
      mockRepository.updateBreak.mockImplementation((id, data) => ({
        ...mockBreakRecord,
        ...data,
      }));

      await service.reduceBreak(mockAuctionId, 60, 300);

      const callArgs = mockRepository.updateBreak.mock.calls[0][1];
      const newDeadline = callArgs.deadline;

      expect(newDeadline.getTime()).toBeGreaterThan(now);
    });

    it('should respect maximum reduction limit', async () => {
      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        deadline: new Date(),
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);

      await expect(
        service.reduceBreak(mockAuctionId, 400, 300)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.reduceBreak(mockAuctionId, 0, 300)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if no active break found', async () => {
      mockRepository.getActiveBreak.mockResolvedValue(null);

      await expect(
        service.reduceBreak(mockAuctionId, 30)
      ).rejects.toThrow('No active break found');
    });
  });

  describe('endBreak', () => {
    it('should record break end time', async () => {
      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        deadline: new Date(),
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);
      mockRepository.updateBreak.mockResolvedValue({
        ...mockBreakRecord,
        endedAt: new Date(),
      });

      const result = await service.endBreak(mockAuctionId);

      expect(mockRepository.updateBreak).toHaveBeenCalledWith(
        mockBreakId,
        expect.objectContaining({
          endedAt: expect.any(Date),
        })
      );

      expect(result.endedAt).toBeDefined();
    });

    it('should throw error if no active break found', async () => {
      mockRepository.getActiveBreak.mockResolvedValue(null);

      await expect(
        service.endBreak(mockAuctionId)
      ).rejects.toThrow('No active break found');
    });
  });

  describe('getBreakStatus', () => {
    it('should return null when no active break', async () => {
      mockRepository.getActiveBreak.mockResolvedValue(null);

      const result = await service.getBreakStatus(mockAuctionId);

      expect(result).toBeNull();
    });

    it('should calculate time remaining correctly', async () => {
      const secondsRemaining = 45;
      const deadline = new Date(Date.now() + secondsRemaining * 1000);

      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        startedAt: new Date(),
        deadline,
        originalDurationSeconds: 120,
        reason: 'After 5 bids',
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);

      const result = await service.getBreakStatus(mockAuctionId);

      expect(result).toBeDefined();
      expect(result.secondsRemaining).toBeLessThanOrEqual(secondsRemaining);
      expect(result.secondsRemaining).toBeGreaterThanOrEqual(secondsRemaining - 1);
      expect(result.isExpired).toBe(false);
    });

    it('should mark as expired when deadline passed', async () => {
      const deadline = new Date(Date.now() - 1000);

      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        startedAt: new Date(),
        deadline,
        originalDurationSeconds: 120,
        reason: 'After 5 bids',
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);

      const result = await service.getBreakStatus(mockAuctionId);

      expect(result.secondsRemaining).toBe(0);
      expect(result.isExpired).toBe(true);
    });

    it('should include all status fields', async () => {
      const startTime = new Date();
      const deadline = new Date(Date.now() + 60000);

      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        startedAt: startTime,
        deadline,
        originalDurationSeconds: 120,
        reason: 'After 5 bids',
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);

      const result = await service.getBreakStatus(mockAuctionId);

      expect(result).toHaveProperty('id', mockBreakId);
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('deadline');
      expect(result).toHaveProperty('secondsRemaining');
      expect(result).toHaveProperty('originalDurationSeconds', 120);
      expect(result).toHaveProperty('reason', 'After 5 bids');
      expect(result).toHaveProperty('isExpired');
    });
  });

  describe('resetBidCounterForNewPlayer', () => {
    it('should reset counter when player changes (PER_PLAYER)', () => {
      const player1 = 'player-1';
      const player2 = 'player-2';

      service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player1);
      service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player1);
      service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player1);

      service.resetBidCounterForNewPlayer(mockAuctionId, player2);

      const count = service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player2);
      expect(count).toBe(1);
    });
  });

  describe('resetAllBidCounters', () => {
    it('should reset all counters for auction', () => {
      const player1 = 'player-1';
      const player2 = 'player-2';

      service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player1);
      service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player1);
      service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player2);

      service.resetAllBidCounters(mockAuctionId);

      const count1 = service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player1);
      const count2 = service.incrementBidCounter(mockAuctionId, 'PER_PLAYER', player2);

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it('should not affect other auctions', () => {
      const auction1 = 'auction-1';
      const auction2 = 'auction-2';

      service.incrementBidCounter(auction1, 'ACROSS_AUCTION');
      service.incrementBidCounter(auction1, 'ACROSS_AUCTION');
      service.incrementBidCounter(auction2, 'ACROSS_AUCTION');

      service.resetAllBidCounters(auction1);

      const count1 = service.incrementBidCounter(auction1, 'ACROSS_AUCTION');
      const count2 = service.incrementBidCounter(auction2, 'ACROSS_AUCTION');

      expect(count1).toBe(1);
      expect(count2).toBe(2);
    });
  });

  describe('Break state machine transitions', () => {
    it('should transition LIVE → BREAK on shouldScheduleBreak', async () => {
      for (let i = 0; i < 4; i++) {
        await service.shouldScheduleBreak(mockAuctionId, 5, 'ACROSS_AUCTION');
      }

      const shouldBreak = await service.shouldScheduleBreak(
        mockAuctionId,
        5,
        'ACROSS_AUCTION'
      );

      expect(shouldBreak).toBe(true);
    });

    it('should not schedule nested breaks', async () => {
      const mockBreakRecord = {
        id: mockBreakId,
        auctionId: mockAuctionId,
        deadline: new Date(Date.now() + 60000),
      };

      mockRepository.getActiveBreak.mockResolvedValue(mockBreakRecord);

      const result = await service.extendBreak(mockAuctionId, 30);

      expect(result).toBeDefined();
      expect(mockRepository.updateBreak).toHaveBeenCalledTimes(1);
    });
  });
});
