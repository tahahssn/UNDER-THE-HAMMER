import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionsRepository } from '../auctions.repository';

@Injectable()
export class BreakManagerService {
  private bidCounters: Map<string, number> = new Map();

  constructor(
    private readonly repo: AuctionsRepository,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Schedule break based on bid count
   */
  async scheduleBreakOnBidCount(auctionId: string, bidsPerBreak: number, counterScope: 'PLAYER' | 'AUCTION' = 'AUCTION') {
    const key = `${auctionId}:${counterScope}`;

    const count = (this.bidCounters.get(key) ?? 0) + 1;
    this.bidCounters.set(key, count);

    if (count >= bidsPerBreak) {
      this.bidCounters.set(key, 0);
      return true; // Break should be scheduled
    }

    return false;
  }

  /**
   * Start a break
   */
  async startBreak(auctionId: string, durationSeconds: number, reason?: string) {
    const deadline = new Date(new Date().getTime() + durationSeconds * 1000);

    return this.repo.recordBreak({
      auctionId,
      durationSeconds,
      reason,
      startedAt: new Date(),
      scheduledEndAt: deadline,
    });
  }

  /**
   * Update break duration
   */
  async updateBreakDuration(auctionId: string, adjustmentSeconds: number, maxAdjustmentSeconds: number = 300) {
    if (Math.abs(adjustmentSeconds) > maxAdjustmentSeconds) {
      throw new BadRequestException(`Adjustment must be within ±${maxAdjustmentSeconds} seconds`);
    }

    // Fetch current break
    const breakRecord = await this.prisma.auctionBreak.findFirst({
      where: { auctionId, endedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!breakRecord) {
      throw new BadRequestException('No active break found');
    }

    const newEndTime = new Date(breakRecord.scheduledEndAt!.getTime() + adjustmentSeconds * 1000);

    return this.prisma.auctionBreak.update({
      where: { id: breakRecord.id },
      data: {
        scheduledEndAt: newEndTime,
      },
    });
  }

  /**
   * End break
   */
  async endBreak(auctionId: string) {
    const breakRecord = await this.prisma.auctionBreak.findFirst({
      where: { auctionId, endedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!breakRecord) {
      throw new BadRequestException('No active break found');
    }

    return this.prisma.auctionBreak.update({
      where: { id: breakRecord.id },
      data: { endedAt: new Date() },
    });
  }

  /**
   * Get current break info
   */
  async getBreakInfo(auctionId: string) {
    const breakRecord = await this.prisma.auctionBreak.findFirst({
      where: { auctionId, endedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!breakRecord) {
      return null;
    }

    const now = new Date();
    const timeRemaining = Math.max(0, Math.ceil((breakRecord.scheduledEndAt!.getTime() - now.getTime()) / 1000));

    return {
      id: breakRecord.id,
      startedAt: breakRecord.startedAt,
      scheduledEndAt: breakRecord.scheduledEndAt,
      secondsRemaining: timeRemaining,
      durationSeconds: breakRecord.durationSeconds,
      reason: breakRecord.reason,
    };
  }

  /**
   * Reset bid counter for a player
   */
  resetBidCounter(auctionId: string, scope: 'PLAYER' | 'AUCTION' = 'AUCTION') {
    const key = `${auctionId}:${scope}`;
    this.bidCounters.delete(key);
  }
}
