import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { RoomAllocationService } from './room-allocation.service';

/**
 * Tests for RoomAllocationService
 * Focus: Race condition prevention in team allocation
 */
describe('RoomAllocationService', () => {
  let service: RoomAllocationService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RoomAllocationService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            auctionRoom: { findUnique: jest.fn() },
            auctionTeam: { findFirst: jest.fn(), create: jest.fn() },
            teamOwner: { findFirst: jest.fn(), create: jest.fn() },
            teamPurseTransaction: { create: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<RoomAllocationService>(RoomAllocationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('allocateTeamUserSelected', () => {
    it('should allocate team to user with USER_SELECTED method', async () => {
      const input = {
        roomId: 'room-1',
        userId: 'user-1',
        teamId: 'team-1',
        slotIndex: 0,
        purseInitialMinor: 1000000n,
      };

      // Mock transaction success
      (prisma.$transaction as any).mockResolvedValueOnce({
        id: 'auction-team-1',
      });

      const result = await service.allocateTeamUserSelected(input);

      expect(result.success).toBe(true);
      expect(result.auctionTeamId).toBe('auction-team-1');
    });

    it('should return error when slot is already allocated', async () => {
      const input = {
        roomId: 'room-1',
        userId: 'user-1',
        teamId: 'team-1',
        slotIndex: 0,
        purseInitialMinor: 1000000n,
      };

      // Mock unique constraint violation
      const error: any = new Error('Unique constraint failed');
      error.code = 'P2002';
      error.meta = { target: ['auctionId_slotIndex'] };

      (prisma.$transaction as any).mockRejectedValueOnce(error);

      const result = await service.allocateTeamUserSelected(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already allocated');
    });
  });

  describe('allocateTeamRandom', () => {
    it('should allocate team to user with RANDOM method', async () => {
      const input = {
        roomId: 'room-1',
        userId: 'user-1',
        teamId: 'team-1',
        purseInitialMinor: 1000000n,
      };

      (prisma.$transaction as any).mockResolvedValueOnce({
        auctionTeam: { id: 'auction-team-1' },
        slotIndex: 0,
      });

      const result = await service.allocateTeamRandom(input);

      expect(result.success).toBe(true);
      expect(result.auctionTeamId).toBe('auction-team-1');
      expect(result.slotIndex).toBe(0);
    });
  });

  describe('race condition prevention', () => {
    it('should use Serializable isolation level for transactions', async () => {
      const input = {
        roomId: 'room-1',
        userId: 'user-1',
        teamId: 'team-1',
        slotIndex: 0,
        purseInitialMinor: 1000000n,
      };

      (prisma.$transaction as any).mockResolvedValueOnce({ id: 'auction-team-1' });

      await service.allocateTeamUserSelected(input);

      // Verify transaction was called with Serializable isolation level
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: 'Serializable',
        }),
      );
    });
  });
});
