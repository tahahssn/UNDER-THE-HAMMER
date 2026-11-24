import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionsRepository } from '../auctions.repository';
import { LEDGER_ERRORS } from '../constants/auction-errors';

@Injectable()
export class PurseLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AuctionsRepository
  ) {}

  /**
   * Credit initial purse to a team
   */
  async creditInitialPurse(auctionTeamId: string, purseMinor: bigint, currency: string = 'PKR') {
    const team = await this.repo.getAuctionTeamById(auctionTeamId);

    if (!team) {
      throw new BadRequestException('Team not found');
    }

    return this.repo.recordPurseTransaction({
      auctionTeamId,
      type: 'CREDIT_INITIAL',
      amountChangeMinor: purseMinor,
      balanceAfterMinor: purseMinor,
      currency,
    });
  }

  /**
   * Debit acquisition from team's purse (append-only entry)
   */
  async debitAcquisition(auctionTeamId: string, acquisitionId: string, priceMinor: bigint) {
    const currentBalance = await this.getBalance(auctionTeamId);

    if (currentBalance < priceMinor) {
      throw new BadRequestException(LEDGER_ERRORS.INSUFFICIENT_BALANCE);
    }

    const newBalance = currentBalance - priceMinor;

    return this.repo.recordPurseTransaction({
      auctionTeamId,
      type: 'DEBIT_ACQUISITION',
      amountChangeMinor: -priceMinor,
      balanceAfterMinor: newBalance,
      currency: 'PKR',
      relatedAcquisitionId: acquisitionId,
    });
  }

  /**
   * Reverse a previous debit with compensating entry
   */
  async reversePreviousDebit(auctionTeamId: string, acquisitionId: string, reverseAmountMinor: bigint) {
    const currentBalance = await this.getBalance(auctionTeamId);
    const newBalance = currentBalance + reverseAmountMinor;

    return this.repo.recordPurseTransaction({
      auctionTeamId,
      type: 'REVERSAL',
      amountChangeMinor: reverseAmountMinor,
      balanceAfterMinor: newBalance,
      currency: 'PKR',
      relatedAcquisitionId: acquisitionId,
    });
  }

  /**
   * Get current balance for a team (sum of all ledger entries)
   */
  async getBalance(auctionTeamId: string): Promise<bigint> {
    return this.repo.getTeamPurseBalance(auctionTeamId);
  }

  /**
   * Get full ledger history for a team
   */
  async getLedgerHistory(auctionTeamId: string) {
    return this.prisma.teamPurseTransaction.findMany({
      where: { auctionTeamId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Validate balance does not go negative (enforced by database CHECK constraint)
   */
  async validateBalance(auctionTeamId: string): Promise<boolean> {
    const balance = await this.getBalance(auctionTeamId);
    return balance >= 0n;
  }
}
