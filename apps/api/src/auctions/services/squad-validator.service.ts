import { Injectable } from '@nestjs/common';
import { AuctionsRepository } from '../auctions.repository';
import { PrismaService } from '../../prisma/prisma.service';

export interface SquadRule {
  id: string;
  rule: string;
  currentCount: number;
  required: number;
  satisfied: boolean;
}

@Injectable()
export class SquadValidatorService {
  constructor(
    private readonly repo: AuctionsRepository,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Validate squad requirements for a team
   */
  async validateSquadRequirements(auctionId: string, auctionTeamId: string): Promise<{ valid: boolean; violations: SquadRule[] }> {
    const requirements = await this.getSquadProgress(auctionId, auctionTeamId);

    const violations = requirements.filter((r) => !r.satisfied);

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Get squad progress against requirements
   */
  async getSquadProgress(auctionId: string, auctionTeamId: string): Promise<SquadRule[]> {
    const team = await this.repo.getAuctionTeamById(auctionTeamId);

    if (!team) {
      return [];
    }

    const acquisitions = await this.repo.getAcquisitionsByAuctionTeam(auctionTeamId);

    // Build progress against typical PSL rules
    const rules: SquadRule[] = [];

    // Squad size rule
    const squadSize = acquisitions.length;
    rules.push({
      id: 'squad_size',
      rule: 'Squad Size (Min 11)',
      currentCount: squadSize,
      required: 11,
      satisfied: squadSize >= 11,
    });

    // Role distribution (example: wicketkeeper, batsmen, bowlers)
    const wicketkeepers = acquisitions.filter((a: any) => a.player?.role === 'WICKETKEEPER').length;
    rules.push({
      id: 'wicketkeepers',
      rule: 'Wicketkeepers (Min 1)',
      currentCount: wicketkeepers,
      required: 1,
      satisfied: wicketkeepers >= 1,
    });

    const batsmen = acquisitions.filter((a: any) => a.player?.role === 'BATSMAN').length;
    rules.push({
      id: 'batsmen',
      rule: 'Batsmen (Min 3)',
      currentCount: batsmen,
      required: 3,
      satisfied: batsmen >= 3,
    });

    const bowlers = acquisitions.filter((a: any) => a.player?.role === 'BOWLER').length;
    rules.push({
      id: 'bowlers',
      rule: 'Bowlers (Min 3)',
      currentCount: bowlers,
      required: 3,
      satisfied: bowlers >= 3,
    });

    // Domestic/Overseas balance (PSL rule: max 2 overseas)
    const overseas = acquisitions.filter((a: any) => a.player?.nationality !== 'PAKISTAN').length;
    rules.push({
      id: 'overseas',
      rule: 'Overseas Players (Max 2)',
      currentCount: overseas,
      required: 2,
      satisfied: overseas <= 2,
    });

    return rules;
  }

  /**
   * Update progress on new acquisition
   */
  async updateProgressOnAcquisition(
    auctionId: string,
    auctionTeamId: string,
    playerId: string,
    role: string,
    domestic: boolean
  ): Promise<SquadRule[]> {
    // Recalculate and return progress
    return this.getSquadProgress(auctionId, auctionTeamId);
  }
}
