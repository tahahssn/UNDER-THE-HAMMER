import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionsRepository } from '../auctions.repository';
import { AUCTION_ERRORS } from '../constants/auction-errors';

@Injectable()
export class AuctionConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AuctionsRepository
  ) {}

  /**
   * Get configuration snapshot for a live auction
   */
  async getConfigurationSnapshot(auctionId: string) {
    return this.prisma.auctionConfigurationSnapshot.findUnique({
      where: { auctionId },
    });
  }

  /**
   * Get bid increment brackets for the auction
   */
  async getIncrementBrackets(auctionId: string) {
    return this.prisma.auctionIncrementBracket.findMany({
      where: { auctionId },
      orderBy: { minAmountMinor: 'asc' },
    });
  }

  /**
   * Get category prices for the auction
   */
  async getCategoryPrices(auctionId: string) {
    return this.prisma.auctionCategoryPrice.findMany({
      where: { auctionId },
    });
  }

  /**
   * Verify configuration is not locked (auction must not be LIVE/SETTLEMENT/CONCLUDED)
   */
  async verifyConfigurationNotLocked(auctionId: string) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    const lockedPhases = ['LIVE', 'SETTLEMENT', 'CONCLUDED', 'PAUSED'];

    if (lockedPhases.includes(auction.phase)) {
      throw new BadRequestException(AUCTION_ERRORS.CONFIGURATION_FROZEN);
    }
  }

  /**
   * Get all configuration for display/validation
   */
  async getFullConfiguration(auctionId: string) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    // If auction is live or concluded, use snapshot
    if (['LIVE', 'SETTLEMENT', 'CONCLUDED', 'PAUSED'].includes(auction.phase)) {
      const snapshot = await this.getConfigurationSnapshot(auctionId);
      return {
        ...snapshot,
        brackets: await this.getIncrementBrackets(auctionId),
        categoryPrices: await this.getCategoryPrices(auctionId),
      };
    }

    // Otherwise, use room settings
    const room = await this.prisma.auctionRoom.findUnique({
      where: { id: auction.roomId! },
    });

    return {
      teamCount: room?.teamCount ?? 8,
      teamPurseMinor: room?.initialPurseMinor ?? 20_000_000_00n,
      format: room?.format ?? 'COUNTDOWN',
      controlMode: room?.controlMode ?? 'HOST_CONTROLLED',
      playerSelection: room?.playerSelection ?? 'MANUAL',
      allowHostParticipation: room?.allowHostParticipation ?? true,
      breakEveryNBids: room?.breakEveryNBids ?? 5,
      breakDurationSeconds: room?.breakDurationSeconds ?? 60,
      countdownDurationSeconds: room?.countdownDurationSeconds ?? 30,
      turnDurationSeconds: room?.turnDurationSeconds ?? 45,
      spectatorPermission: room?.spectatorPermission ?? 'PUBLIC',
      brackets: await this.getIncrementBrackets(auctionId),
      categoryPrices: await this.getCategoryPrices(auctionId),
    };
  }
}
