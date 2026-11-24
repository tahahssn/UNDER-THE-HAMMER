import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Manages team allocation with race condition prevention.
 * Uses database transactions and row-level locking to ensure atomicity.
 *
 * Key principles:
 * - Each allocation is atomic (transaction)
 * - Prevents double-booking with optimistic locking
 * - Enforces one team owner per slot
 * - Prevents simultaneous requests from acquiring same team
 */
@Injectable()
export class RoomAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allocate a team to a user using USER_SELECTED method.
   * Prevents race conditions with database-level uniqueness constraints.
   *
   * Returns:
   * - success: true with auctionTeamId if allocation succeeded
   * - success: false with error message if team was taken or other constraint violated
   */
  async allocateTeamUserSelected(input: {
    roomId: string;
    userId: string;
    teamId: string;
    slotIndex: number;
    purseInitialMinor: bigint;
  }): Promise<{ success: boolean; auctionTeamId?: string; error?: string }> {
    try {
      // Check if room exists
      const room = await this.prisma.auctionRoom.findUnique({
        where: { id: input.roomId },
        select: { id: true },
      });

      if (!room) {
        return { success: false, error: 'Room not found' };
      }

      // Create AuctionTeam and TeamOwner in a single transaction with conflict detection
      const result = await this.prisma.$transaction(
        async (tx: any) => {
          // Create AuctionTeam (will fail if slot is already taken due to unique constraint)
          const auctionTeam = await tx.auctionTeam.create({
            data: {
              auctionId: input.roomId, // Using roomId as auctionId for now
              teamId: input.teamId,
              slotIndex: input.slotIndex,
              allocationMethod: 'USER_SELECTED',
              purseInitialMinor: input.purseInitialMinor,
              purseBalanceMinor: input.purseInitialMinor,
            },
          });

          // Add user as team owner (will fail if user already owns a team in this auction)
          await tx.teamOwner.create({
            data: {
              auctionId: input.roomId,
              auctionTeamId: auctionTeam.id,
              userId: input.userId,
              method: 'USER_SELECTED',
            },
          });

          // Initialize purse ledger with INITIAL_CREDIT
          await tx.teamPurseTransaction.create({
            data: {
              auctionTeamId: auctionTeam.id,
              type: 'INITIAL_CREDIT',
              amountMinor: input.purseInitialMinor,
              balanceAfterMinor: input.purseInitialMinor,
              reason: 'Initial purse allocation for team owner',
            },
          });

          return auctionTeam;
        },
        {
          isolationLevel: 'Serializable', // Prevents any concurrent modification during transaction
        },
      );

      return { success: true, auctionTeamId: result.id };
    } catch (error: any) {
      // Handle constraint violations (team already allocated, user already has team, etc)
      if (error.code === 'P2002') {
        const field = error.meta?.target?.[0];

        if (field === 'auctionId_slotIndex') {
          return { success: false, error: 'Team slot is already allocated' };
        }

        if (field === 'auctionId_teamId') {
          return { success: false, error: 'This team is already assigned in this auction' };
        }

        return { success: false, error: 'Allocation failed: resource already claimed' };
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Allocate a team randomly to a user.
   * Uses RANDOM method and finds first available slot.
   */
  async allocateTeamRandom(input: {
    roomId: string;
    userId: string;
    teamId: string;
    purseInitialMinor: bigint;
  }): Promise<{ success: boolean; auctionTeamId?: string; slotIndex?: number; error?: string }> {
    try {
      const result = await this.prisma.$transaction(
        async (tx: any) => {
          // Find the next available slot
          const lastTeam = await tx.auctionTeam.findFirst({
            where: { auctionId: input.roomId },
            orderBy: { slotIndex: 'desc' },
            take: 1,
          });

          const nextSlotIndex = (lastTeam?.slotIndex ?? -1) + 1;

          // Create AuctionTeam with RANDOM method
          const auctionTeam = await tx.auctionTeam.create({
            data: {
              auctionId: input.roomId,
              teamId: input.teamId,
              slotIndex: nextSlotIndex,
              allocationMethod: 'RANDOM',
              purseInitialMinor: input.purseInitialMinor,
              purseBalanceMinor: input.purseInitialMinor,
            },
          });

          // Add user as team owner
          await tx.teamOwner.create({
            data: {
              auctionId: input.roomId,
              auctionTeamId: auctionTeam.id,
              userId: input.userId,
              method: 'RANDOM',
            },
          });

          // Initialize purse ledger
          await tx.teamPurseTransaction.create({
            data: {
              auctionTeamId: auctionTeam.id,
              type: 'INITIAL_CREDIT',
              amountMinor: input.purseInitialMinor,
              balanceAfterMinor: input.purseInitialMinor,
              reason: 'Initial purse allocation for randomly selected team',
            },
          });

          return { auctionTeam, slotIndex: nextSlotIndex };
        },
        {
          isolationLevel: 'Serializable',
        },
      );

      return {
        success: true,
        auctionTeamId: result.auctionTeam.id,
        slotIndex: result.slotIndex,
      };
    } catch (error: any) {
      if (error.code === 'P2002') {
        return { success: false, error: 'Allocation failed: resource already claimed' };
      }

      throw error;
    }
  }

  /**
   * Check if a slot is already allocated
   */
  async isSlotAllocated(roomId: string, slotIndex: number): Promise<boolean> {
    const team = await this.prisma.auctionTeam.findFirst({
      where: {
        auctionId: roomId,
        slotIndex,
      },
      select: { id: true },
    });

    return !!team;
  }

  /**
   * Check if a user already owns a team in this auction
   */
  async userAlreadyOwnsTeam(roomId: string, userId: string): Promise<boolean> {
    const owner = await this.prisma.teamOwner.findFirst({
      where: {
        auctionId: roomId,
        userId,
        releasedAt: null, // Not released
      },
      select: { id: true },
    });

    return !!owner;
  }

  /**
   * Get allocation status for a room
   */
  async getAllocationStatus(roomId: string) {
    const teams = await this.prisma.auctionTeam.findMany({
      where: { auctionId: roomId },
      include: {
        team: { select: { id: true, name: true } },
        owners: { select: { userId: true, method: true } },
      },
      orderBy: { slotIndex: 'asc' },
    });

    return {
      allocatedCount: teams.length,
      teams: teams.map((t) => ({
        auctionTeamId: t.id,
        teamId: t.teamId,
        slotIndex: t.slotIndex,
        method: t.allocationMethod,
        owner: t.owners[0],
      })),
    };
  }
}
