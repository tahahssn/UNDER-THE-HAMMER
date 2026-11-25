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
   * Check if break should be scheduled based on bid count.
   * Scope: PER_PLAYER (5 bids on current player) or ACROSS_AUCTION (5 bids total)
   */
  async shouldScheduleBreak(
    auctionId: string,
    bidsPerBreak: number,
    counterScope: 'PER_PLAYER' | 'ACROSS_AUCTION' = 'PER_PLAYER',
    currentAuctionPlayerId?: string
  ): Promise<boolean> {
    const key = counterScope === 'PER_PLAYER' && currentAuctionPlayerId 
      ? `${auctionId}:player:${currentAuctionPlayerId}` 
      : `${auctionId}:auction`;

    const count = (this.bidCounters.get(key) ?? 0) + 1;
    this.bidCounters.set(key, count);

    return count >= bidsPerBreak;
  }

  /**
   * Increment bid counter after a bid is accepted
   */
  incrementBidCounter(
    auctionId: string,
    counterScope: 'PER_PLAYER' | 'ACROSS_AUCTION' = 'PER_PLAYER',
    currentAuctionPlayerId?: string
  ): number {
    const key = counterScope === 'PER_PLAYER' && currentAuctionPlayerId 
      ? `${auctionId}:player:${currentAuctionPlayerId}` 
      : `${auctionId}:auction`;

    const count = (this.bidCounters.get(key) ?? 0) + 1;
    this.bidCounters.set(key, count);
    return count;
  }

  /**
   * Start a break
   */
  async startBreak(
    auctionId: string,
    durationSeconds: number,
    reason?: string,
    triggerBidCount?: number
  ) {
    const deadline = new Date(new Date().getTime() + durationSeconds * 1000);

    return this.repo.recordBreak({
      auctionId,
      startedAt: new Date(),
      deadline,
      originalDurationSeconds: durationSeconds,
      reason,
      triggerBidCount,
    });
  }

  /**
   * Extend break (host action)
   */
  async extendBreak(
    auctionId: string,
    extensionSeconds: number,
    maxExtensionSeconds: number = 300
  ) {
    if (extensionSeconds <= 0 || extensionSeconds > maxExtensionSeconds) {
      throw new BadRequestException(
        `Extension must be between 1 and ${maxExtensionSeconds} seconds`
      );
    }

    const breakRecord = await this.repo.getActiveBreak(auctionId);
    if (!breakRecord) {
      throw new BadRequestException('No active break found');
    }

    const newDeadline = new Date(breakRecord.deadline.getTime() + extensionSeconds * 1000);

    return this.repo.updateBreak(breakRecord.id, {
      deadline: newDeadline,
    });
  }

  /**
   * Reduce break (host action)
   */
  async reduceBreak(
    auctionId: string,
    reductionSeconds: number,
    maxReductionSeconds: number = 300
  ) {
    if (reductionSeconds <= 0 || reductionSeconds > maxReductionSeconds) {
      throw new BadRequestException(
        `Reduction must be between 1 and ${maxReductionSeconds} seconds`
      );
    }

    const breakRecord = await this.repo.getActiveBreak(auctionId);
    if (!breakRecord) {
      throw new BadRequestException('No active break found');
    }

    const newDeadline = new Date(
      Math.max(
        new Date().getTime() + 1000, // At least 1 second remains
        breakRecord.deadline.getTime() - reductionSeconds * 1000
      )
    );

    return this.repo.updateBreak(breakRecord.id, {
      deadline: newDeadline,
    });
  }

  /**
   * End break
   */
  async endBreak(auctionId: string) {
    const breakRecord = await this.repo.getActiveBreak(auctionId);
    if (!breakRecord) {
      throw new BadRequestException('No active break found');
    }

    return this.repo.updateBreak(breakRecord.id, {
      endedAt: new Date(),
    });
  }

  /**
   * Get current break status
   */
  async getBreakStatus(auctionId: string) {
    const breakRecord = await this.repo.getActiveBreak(auctionId);

    if (!breakRecord) {
      return null;
    }

    const now = new Date();
    const timeRemaining = Math.max(0, Math.floor((breakRecord.deadline.getTime() - now.getTime()) / 1000));
    const isExpired = timeRemaining === 0;

    return {
      id: breakRecord.id,
      startedAt: breakRecord.startedAt,
      deadline: breakRecord.deadline,
      secondsRemaining: timeRemaining,
      originalDurationSeconds: breakRecord.originalDurationSeconds,
      reason: breakRecord.reason,
      isExpired,
    };
  }

  /**
   * Reset bid counter when player changes (PER_PLAYER scope)
   */
  resetBidCounterForNewPlayer(auctionId: string, newAuctionPlayerId: string) {
    const key = `${auctionId}:player:${newAuctionPlayerId}`;
    this.bidCounters.set(key, 0);
  }

  /**
   * Reset all bid counters for auction (at conclusion)
   */
  resetAllBidCounters(auctionId: string) {
    for (const key of this.bidCounters.keys()) {
      if (key.startsWith(auctionId)) {
        this.bidCounters.delete(key);
      }
    }
  }
}
