import { Injectable, BadRequestException } from '@nestjs/common';
import { AuctionsRepository } from '../auctions.repository';
import { BidValidationService } from './bid-validation.service';

@Injectable()
export class TurnBasedEngineService {
  constructor(
    private readonly repo: AuctionsRepository,
    private readonly bidValidation: BidValidationService
  ) {}

  /**
   * Initialize turns for all teams (create turn records)
   */
  async initiateTurns(auctionId: string, auctionPlayerId: string) {
    const teams = await this.repo.getAuctionTeams(auctionId);

    if (teams.length === 0) {
      throw new BadRequestException('No teams in auction');
    }

    // Create turn for each team in order
    const turns = await Promise.all(
      teams.map((team: any, index: number) =>
        this.repo.recordTurn({
          auctionId,
          auctionPlayerId,
          auctionTeamId: team.id,
          turnOrder: index,
          action: null,
          bidAmount: null,
        })
      )
    );

    return turns;
  }

  /**
   * Get current turn for a player
   */
  async getCurrentTurn(auctionId: string, auctionPlayerId: string) {
    return this.repo.getCurrentTurn(auctionId, auctionPlayerId);
  }

  /**
   * Submit turn action (RAISE or PASS)
   */
  async submitTurnAction(
    auctionId: string,
    auctionPlayerId: string,
    auctionTeamId: string,
    action: 'RAISE' | 'PASS',
    bidAmountMinor?: bigint,
    stateVersion?: number
  ) {
    const currentTurn = await this.getCurrentTurn(auctionId, auctionPlayerId);

    if (!currentTurn) {
      throw new BadRequestException('No active turn found');
    }

    if (currentTurn.auctionTeamId !== auctionTeamId) {
      throw new BadRequestException('Not this team\'s turn');
    }

    if (action === 'RAISE' && !bidAmountMinor) {
      throw new BadRequestException('Bid amount required for RAISE action');
    }

    // Record action
    return this.repo.prisma.auctionTurn.update({
      where: { id: currentTurn.id },
      data: {
        action,
        bidAmount: bidAmountMinor ?? null,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Advance to next team's turn
   */
  async advanceTurn(auctionId: string, auctionPlayerId: string) {
    const currentTurn = await this.getCurrentTurn(auctionId, auctionPlayerId);

    if (!currentTurn) {
      throw new BadRequestException('No active turn found');
    }

    // Get next turn in order
    const nextTurn = await this.repo.prisma.auctionTurn.findFirst({
      where: {
        auctionId,
        auctionPlayerId,
        turnOrder: { gt: currentTurn.turnOrder },
        completedAt: null,
      },
      orderBy: { turnOrder: 'asc' },
    });

    if (!nextTurn) {
      // No more teams
      return null;
    }

    return nextTurn;
  }

  /**
   * Determine winner (last team remaining or highest bidder)
   */
  async determineTurnWinner(auctionId: string, auctionPlayerId: string) {
    const turns = await this.repo.prisma.auctionTurn.findMany({
      where: { auctionId, auctionPlayerId },
      orderBy: { turnOrder: 'asc' },
    });

    if (turns.length === 0) {
      return null;
    }

    // Find last team that raised (didn't pass)
    const raisers = turns.filter((t: any) => t.action === 'RAISE');

    if (raisers.length === 0) {
      return null;
    }

    // Winner is the last raiser (highest bidder in turn-based)
    const winner = raisers[raisers.length - 1];

    return {
      teamId: winner.auctionTeamId,
      bidAmount: winner.bidAmount,
    };
  }

  /**
   * Check if only one team remains (all others passed)
   */
  async isOnlyOneTeamRemaining(auctionId: string, auctionPlayerId: string): Promise<boolean> {
    const activeTurns = await this.repo.prisma.auctionTurn.findMany({
      where: {
        auctionId,
        auctionPlayerId,
        action: null,
      },
    });

    // Only one team left without an action
    return activeTurns.length === 1;
  }
}
