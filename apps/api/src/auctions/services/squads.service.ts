import { Injectable, BadRequestException } from '@nestjs/common';
import { AuctionsRepository } from '../auctions.repository';
import { PrismaService } from '../../prisma/prisma.service';

export interface SquadRuleProgress {
  id: string;
  type: string;
  description: string;
  currentCount: number;
  minCount?: number;
  maxCount?: number;
  satisfied: boolean;
}

export interface SquadValidationResult {
  valid: boolean;
  progress: SquadRuleProgress[];
  violations: Array<{
    ruleId: string;
    type: string;
    violationType: 'BELOW_MIN' | 'ABOVE_MAX' | 'MISSING_REQUIREMENT';
    currentCount: number;
    requiredMinCount?: number;
    requiredMaxCount?: number;
  }>;
}

@Injectable()
export class SquadsService {
  constructor(
    private readonly repo: AuctionsRepository,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Get squad rules for an auction
   */
  async getSquadRules(auctionId: string) {
    return this.prisma.squadRule.findMany({
      where: { auctionId },
      include: { category: true },
      orderBy: { type: 'asc' },
    });
  }

  /**
   * Get squad progress for a team
   */
  async getSquadProgress(
    auctionId: string,
    auctionTeamId: string
  ): Promise<SquadRuleProgress[]> {
    const team = await this.repo.getAuctionTeamById(auctionTeamId);
    if (!team) {
      throw new BadRequestException('Auction team not found');
    }

    const acquisitions = await this.repo.getAcquisitionsByAuctionTeam(auctionTeamId);
    const rules = await this.getSquadRules(auctionId);
    const progress: SquadRuleProgress[] = [];

    for (const rule of rules) {
      let currentCount = 0;
      let description = '';

      switch (rule.type) {
        case 'SQUAD_SIZE': {
          currentCount = acquisitions.length;
          description = `Squad Size (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          const satisfied =
            (!rule.minCount || currentCount >= rule.minCount) &&
            (!rule.maxCount || currentCount <= rule.maxCount);
          progress.push({
            id: rule.id,
            type: 'SQUAD_SIZE',
            description,
            currentCount,
            minCount: rule.minCount ?? undefined,
            maxCount: rule.maxCount ?? undefined,
            satisfied,
          });
          break;
        }

        case 'ROLE_COUNT': {
          const roleCount = acquisitions.filter(
            (a: any) => a.player?.role === rule.role
          ).length;
          currentCount = roleCount;
          description = `${rule.role}s (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          const satisfied =
            (!rule.minCount || roleCount >= rule.minCount) &&
            (!rule.maxCount || roleCount <= rule.maxCount);
          progress.push({
            id: rule.id,
            type: 'ROLE_COUNT',
            description,
            currentCount,
            minCount: rule.minCount ?? undefined,
            maxCount: rule.maxCount ?? undefined,
            satisfied,
          });
          break;
        }

        case 'DOMESTIC_COUNT': {
          const domesticCount = acquisitions.filter((a: any) => {
            const playerCountry = a.player?.countryCode;
            // Assuming auction tournament country defines "domestic"
            return playerCountry === 'PK'; // PSL context
          }).length;
          currentCount = domesticCount;
          description = `Domestic Players (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          const satisfied =
            (!rule.minCount || domesticCount >= rule.minCount) &&
            (!rule.maxCount || domesticCount <= rule.maxCount);
          progress.push({
            id: rule.id,
            type: 'DOMESTIC_COUNT',
            description,
            currentCount,
            minCount: rule.minCount ?? undefined,
            maxCount: rule.maxCount ?? undefined,
            satisfied,
          });
          break;
        }

        case 'OVERSEAS_COUNT': {
          const overseasCount = acquisitions.filter((a: any) => {
            const playerCountry = a.player?.countryCode;
            return playerCountry !== 'PK'; // Non-domestic
          }).length;
          currentCount = overseasCount;
          description = `Overseas Players (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          const satisfied =
            (!rule.minCount || overseasCount >= rule.minCount) &&
            (!rule.maxCount || overseasCount <= rule.maxCount);
          progress.push({
            id: rule.id,
            type: 'OVERSEAS_COUNT',
            description,
            currentCount,
            minCount: rule.minCount ?? undefined,
            maxCount: rule.maxCount ?? undefined,
            satisfied,
          });
          break;
        }

        case 'CATEGORY_COUNT': {
          const categoryCount = acquisitions.filter(
            (a: any) => a.player?.categoryId === rule.categoryId
          ).length;
          currentCount = categoryCount;
          const categoryName = rule.category?.name || 'Unknown';
          description = `${categoryName} Players (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          const satisfied =
            (!rule.minCount || categoryCount >= rule.minCount) &&
            (!rule.maxCount || categoryCount <= rule.maxCount);
          progress.push({
            id: rule.id,
            type: 'CATEGORY_COUNT',
            description,
            currentCount,
            minCount: rule.minCount ?? undefined,
            maxCount: rule.maxCount ?? undefined,
            satisfied,
          });
          break;
        }
      }
    }

    return progress;
  }

  /**
   * Validate squad requirements (called at settlement)
   */
  async validateSquadRequirements(
    auctionId: string,
    auctionTeamId: string
  ): Promise<SquadValidationResult> {
    const progress = await this.getSquadProgress(auctionId, auctionTeamId);
    const violations: SquadValidationResult['violations'] = [];

    for (const rule of progress) {
      if (!rule.satisfied) {
        const violationType =
          rule.minCount && rule.currentCount < rule.minCount
            ? 'BELOW_MIN'
            : rule.maxCount && rule.currentCount > rule.maxCount
            ? 'ABOVE_MAX'
            : 'MISSING_REQUIREMENT';

        violations.push({
          ruleId: rule.id,
          type: rule.type,
          violationType,
          currentCount: rule.currentCount,
          requiredMinCount: rule.minCount,
          requiredMaxCount: rule.maxCount,
        });
      }
    }

    const valid = violations.length === 0;

    // Record validation and violations in audit trail
    const validation = await this.repo.recordSquadValidation({
      auctionId,
      auctionTeamId,
      valid,
    });

    // Record each violation
    const rules = await this.getSquadRules(auctionId);
    for (const violation of violations) {
      const rule = rules.find((r) => r.id === violation.ruleId);
      if (rule) {
        await this.repo.recordSquadViolation({
          squadValidationId: validation.id,
          auctionTeamId,
          squadRuleId: rule.id,
          violationType: violation.violationType,
          currentCount: violation.currentCount,
          requiredMinCount: violation.requiredMinCount,
          requiredMaxCount: violation.requiredMaxCount,
        });
      }
    }

    return {
      valid,
      progress,
      violations,
    };
  }

  /**
   * Update progress on new acquisition
   */
  async updateProgressOnAcquisition(
    auctionId: string,
    auctionTeamId: string
  ): Promise<SquadRuleProgress[]> {
    // Recalculate and return progress
    return this.getSquadProgress(auctionId, auctionTeamId);
  }

  /**
   * Get latest validation record for a team
   */
  async getLatestValidation(auctionId: string, auctionTeamId: string) {
    return this.repo.getLatestSquadValidation(auctionId, auctionTeamId);
  }

  /**
   * Get all violations for a team (audit trail)
   */
  async getViolations(auctionTeamId: string) {
    return this.repo.getSquadViolations(auctionTeamId);
  }
}
