import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamRepository } from './repositories/team.repository';

export interface TeamCreateInput {
  name: string;
  shortName: string;
  description?: string;
  primaryColor: string;
  secondaryColor?: string;
  countryCode?: string;
}

export interface TeamUpdateInput {
  name?: string;
  shortName?: string;
  description?: string | null;
  primaryColor?: string;
  secondaryColor?: string | null;
  countryCode?: string | null;
}

@Injectable()
export class TeamsService {
  constructor(private readonly teamRepo: TeamRepository) {}

  /**
   * Create a new team
   */
  async createTeam(input: TeamCreateInput, userId: string) {
    // Basic validation
    if (!input.name || input.name.length < 1 || input.name.length > 100) {
      throw new BadRequestException('Team name must be 1-100 characters');
    }

    if (!input.shortName || input.shortName.length < 1 || input.shortName.length > 20) {
      throw new BadRequestException('Team shortName must be 1-20 characters');
    }

    // Validate hex colors
    const hexRegex = /^#[0-9A-F]{6}$/i;
    if (!hexRegex.test(input.primaryColor)) {
      throw new BadRequestException('primaryColor must be valid hex (e.g., #FF5733)');
    }

    if (input.secondaryColor && !hexRegex.test(input.secondaryColor)) {
      throw new BadRequestException('secondaryColor must be valid hex');
    }

    const team = await this.teamRepo.create({
      createdById: userId,
      ...input,
    });

    return this.formatTeamDetail(team);
  }

  /**
   * Get team by ID
   */
  async getTeamDetail(id: string) {
    const team = await this.teamRepo.findById(id);

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return this.formatTeamDetail(team);
  }

  /**
   * Update team (owner or MANAGER member only)
   */
  async updateTeam(id: string, input: TeamUpdateInput, userId: string) {
    const team = await this.teamRepo.findById(id);

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Check authorization: creator or MANAGER role member
    if (team.createdById !== userId) {
      // Check if user is a team member with MANAGER role
      const isManager = await this.teamRepo.isMemberWithRole(id, userId, 'MANAGER');
      if (!isManager) {
        throw new ForbiddenException('You do not have permission to update this team');
      }
    }

    // Validate fields if provided
    if (input.name && (input.name.length < 1 || input.name.length > 100)) {
      throw new BadRequestException('Team name must be 1-100 characters');
    }

    if (input.shortName && (input.shortName.length < 1 || input.shortName.length > 20)) {
      throw new BadRequestException('Team shortName must be 1-20 characters');
    }

    const hexRegex = /^#[0-9A-F]{6}$/i;
    if (input.primaryColor && !hexRegex.test(input.primaryColor)) {
      throw new BadRequestException('primaryColor must be valid hex');
    }

    if (input.secondaryColor && input.secondaryColor !== null && !hexRegex.test(input.secondaryColor)) {
      throw new BadRequestException('secondaryColor must be valid hex');
    }

    const updated = await this.teamRepo.update(id, input);

    return this.formatTeamDetail(updated);
  }

  /**
   * Archive/soft-delete team (owner only)
   */
  async archiveTeam(id: string, userId: string) {
    const team = await this.teamRepo.findById(id);

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Only creator can archive
    if (team.createdById !== userId) {
      throw new ForbiddenException('Only the team creator can archive this team');
    }

    await this.teamRepo.archive(id);
  }

  /**
   * List teams by creator
   */
  async listTeamsByCreator(userId: string, skip: number, take: number) {
    const { items, total } = await this.teamRepo.findByCreator(userId, skip, take);

    return {
      teams: items.map((t: any) => this.formatTeamListItem(t)),
      total,
      hasMore: skip + take < total,
    };
  }

  /**
   * List all teams
   */
  async listAllTeams(skip: number, take: number) {
    const { items, total } = await this.teamRepo.findAll(skip, take);

    return {
      teams: items.map((t: any) => this.formatTeamListItem(t)),
      total,
      hasMore: skip + take < total,
    };
  }

  /**
   * Set team current logo
   */
  async setCurrentLogo(teamId: string, assetId: string | null, userId: string) {
    const team = await this.teamRepo.findById(teamId);

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (team.createdById !== userId) {
      throw new ForbiddenException('You do not have permission to update this team');
    }

    return this.teamRepo.setCurrentLogo(teamId, assetId);
  }

  /**
   * Format team for detail response
   */
  private formatTeamDetail(team: any) {
    return {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      description: team.description,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      countryCode: team.countryCode,
      status: team.status,
      currentLogo: team.currentLogo
        ? {
            id: team.currentLogo.id,
            kind: team.currentLogo.kind,
            status: team.currentLogo.status,
            objectKey: team.currentLogo.objectKey,
            bucket: team.currentLogo.bucket,
            contentType: team.currentLogo.contentType,
            width: team.currentLogo.width,
            height: team.currentLogo.height,
            createdAt: team.currentLogo.createdAt.toISOString(),
          }
        : null,
      createdBy: {
        id: team.createdBy.id,
        displayName: team.createdBy.profile?.displayName || team.createdBy.email,
      },
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };
  }

  /**
   * Format team for list response
   */
  private formatTeamListItem(team: any) {
    return {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      currentLogoAssetId: team.currentLogoAssetId,
      createdBy: {
        displayName: team.createdBy.profile?.displayName || team.createdBy.email,
      },
    };
  }
}
