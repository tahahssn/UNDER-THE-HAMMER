import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionsRepository } from '../auctions.repository';
import { PurseLedgerService } from './purse-ledger.service';
import { LEDGER_ERRORS } from '../constants/auction-errors';

@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AuctionsRepository,
    private readonly purseLedger: PurseLedgerService
  ) {}

  /**
   * Settle a bid atomically: create acquisition and debit purse in a transaction
   */
  async settleBidAndAcquirePlayer(
    auctionId: string,
    auctionPlayerId: string,
    auctionTeamId: string,
    bidId: string,
    priceMinor: bigint
  ) {
    return this.repo.withTransaction(async (prisma) => {
      // Check if acquisition already exists (idempotency)
      const existing = await prisma.playerAcquisition.findFirst({
        where: { auctionId, auctionPlayerId, auctionTeamId },
      });

      if (existing) {
        return existing;
      }

      // Create acquisition
      const acquisition = await prisma.playerAcquisition.create({
        data: {
          auctionId,
          auctionPlayerId,
          auctionTeamId,
          priceMinor,
          bidId,
        },
      });

      // Debit purse
      await this.purseLedger.debitAcquisition(auctionTeamId, acquisition.id, priceMinor);

      return acquisition;
    });
  }

  /**
   * Idempotent settlement: check if player already settled before attempting
   */
  async idempotentSettle(auctionId: string, auctionPlayerId: string, auctionTeamId: string, bidId: string, priceMinor: bigint) {
    // Check for prior settlement
    const existing = await this.prisma.playerAcquisition.findFirst({
      where: { auctionId, auctionPlayerId },
    });

    if (existing) {
      return existing;
    }

    // Perform settlement
    return this.settleBidAndAcquirePlayer(auctionId, auctionPlayerId, auctionTeamId, bidId, priceMinor);
  }

  /**
   * Mark player as sold with confirmation
   */
  async markPlayerSold(auctionId: string, playerId: string, teamId: string, priceMinor: bigint) {
    // Update player status
    await this.prisma.auctionPlayer.update({
      where: { id: playerId },
      data: { status: 'SOLD', currentBidMinor: priceMinor },
    });

    // Update team purse balance cache (denormalized for fast access)
    const balance = await this.purseLedger.getBalance(teamId);
    await this.prisma.auctionTeam.update({
      where: { id: teamId },
      data: { purseBalanceMinor: balance },
    });
  }

  /**
   * Mark player as unsold (failed settlement or admin action)
   */
  async markPlayerUnsold(auctionId: string, playerId: string) {
    return this.prisma.auctionPlayer.update({
      where: { id: playerId },
      data: { status: 'UNSOLD', currentBidMinor: null },
    });
  }

  /**
   * Settle all remaining players as unsold at auction conclusion
   */
  async settleRemainingPlayers(auctionId: string) {
    const players = await this.repo.getAuctionPlayers(auctionId, 'ACTIVE');

    for (const player of players) {
      await this.markPlayerUnsold(auctionId, player.id);
    }

    return players.length;
  }
}
