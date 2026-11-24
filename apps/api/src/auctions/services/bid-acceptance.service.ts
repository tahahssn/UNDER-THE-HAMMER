import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionsRepository } from '../auctions.repository';
import { BidValidationService } from './bid-validation.service';
import { BID_ERRORS } from '../constants/auction-errors';

@Injectable()
export class BidAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AuctionsRepository,
    private readonly bidValidation: BidValidationService
  ) {}

  /**
   * Accept a bid atomically: validate, reserve purse, update high bid and event sequence
   */
  async acceptBid(
    auctionId: string,
    auctionPlayerId: string,
    auctionTeamId: string,
    amountMinor: bigint,
    userId: string,
    idempotencyKey: string,
    stateVersion: number
  ) {
    // Check for duplicate bid (idempotency)
    const existingBid = await this.repo.getBidByIdempotencyKey(auctionId, idempotencyKey);

    if (existingBid) {
      if (existingBid.status === 'ACCEPTED') {
        // Already accepted - return idempotent result
        return {
          id: existingBid.id,
          accepted: true,
          reason: null,
          sequence: existingBid.sequence ?? 0,
          stateVersion: 0,
        };
      } else {
        // Duplicate but not accepted yet - reject
        throw new BadRequestException(BID_ERRORS.DUPLICATE_BID);
      }
    }

    // Perform full validation
    const validation = await this.bidValidation.validateBidPlacement(
      auctionId,
      auctionTeamId,
      amountMinor,
      stateVersion,
      idempotencyKey
    );

    if (!validation.valid) {
      // Record rejected bid for audit trail
      const bid = await this.repo.recordBid({
        auctionId,
        auctionPlayerId,
        auctionTeamId,
        amountMinor,
        userId,
        idempotencyKey,
        status: 'REJECTED',
        rejectionCode: validation.reason,
        sequence: 0, // Will be set by trigger or separate service
      });

      return {
        id: bid.id,
        accepted: false,
        reason: validation.reason,
        sequence: 0,
        stateVersion,
      };
    }

    // Atomically accept bid and update high bid
    return this.repo.withTransaction(async (prisma) => {
      // Create bid record
      const bid = await prisma.bid.create({
        data: {
          auctionId,
          auctionPlayerId,
          auctionTeamId,
          amountMinor,
          placedById: userId,
          idempotencyKey,
          status: 'ACCEPTED',
          sequence: 0, // Incremented by trigger
          stateVersion,
        },
      });

      // Get current auction state
      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
      });

      if (!auction) {
        throw new BadRequestException('Auction not found');
      }

      // Update high bid on AuctionPlayer
      const auctionPlayer = await prisma.auctionPlayer.update({
        where: { id: auctionPlayerId },
        data: {
          currentBidMinor: amountMinor,
          leadingAuctionTeamId: auctionTeamId,
        },
      });

      return {
        id: bid.id,
        accepted: true,
        reason: null,
        sequence: bid.sequence ?? 0,
        stateVersion: (auction.stateVersion || 0) + 1,
      };
    });
  }

  /**
   * Reject a bid that was previously accepted (admin/host action)
   */
  async rejectAcceptedBid(bidId: string, reason: string) {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
    });

    if (!bid) {
      throw new BadRequestException('Bid not found');
    }

    if (bid.status !== 'ACCEPTED') {
      throw new BadRequestException('Bid was not accepted');
    }

    // Update bid status
    return this.prisma.bid.update({
      where: { id: bidId },
      data: {
        status: 'REJECTED',
        rejectionCode: reason,
      },
    });
  }
}
