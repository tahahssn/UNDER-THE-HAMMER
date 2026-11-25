import { Injectable } from '@nestjs/common';
import { SquadsService } from './squads.service';
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
    private readonly squadsService: SquadsService,
    private readonly repo: AuctionsRepository,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Validate squad requirements for a team (delegates to SquadsService)
   */
  async validateSquadRequirements(auctionId: string, auctionTeamId: string) {
    return this.squadsService.validateSquadRequirements(auctionId, auctionTeamId);
  }

  /**
   * Get squad progress against requirements (delegates to SquadsService)
   */
  async getSquadProgress(auctionId: string, auctionTeamId: string) {
    return this.squadsService.getSquadProgress(auctionId, auctionTeamId);
  }

  /**
   * Update progress on new acquisition (delegates to SquadsService)
   */
  async updateProgressOnAcquisition(
    auctionId: string,
    auctionTeamId: string,
    playerId: string,
    role: string,
    domestic: boolean
  ) {
    // Recalculate and return progress
    return this.squadsService.getSquadProgress(auctionId, auctionTeamId);
  }
}
