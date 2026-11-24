import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TournamentsRepository } from './tournaments.repository';

/**
 * Manages tournaments and their associated rooms.
 */
@Injectable()
export class TournamentsService {
  constructor(private readonly repo: TournamentsRepository) {}

  /**
   * Create a tournament
   */
  async createTournament(input: {
    organizerId: string;
    name: string;
    description?: string;
    entryFeeEnabled?: boolean;
    entryFeeMinor?: bigint;
    entryFeeCurrency?: string;
  }) {
    // Validate input
    if (!input.name || input.name.length < 1 || input.name.length > 200) {
      throw new BadRequestException('Tournament name must be 1-200 characters');
    }

    if (input.entryFeeEnabled && (!input.entryFeeMinor || !input.entryFeeCurrency)) {
      throw new BadRequestException('Entry fee and currency required when entry fee is enabled');
    }

    if (input.entryFeeMinor && input.entryFeeMinor <= 0n) {
      throw new BadRequestException('Entry fee must be greater than 0');
    }

    const tournament = await this.repo.createTournament(input);
    return this.formatTournament(tournament);
  }

  /**
   * Get tournament detail
   */
  async getTournamentDetail(id: string) {
    const tournament = await this.repo.getTournamentById(id);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    return this.formatTournament(tournament);
  }

  /**
   * List user's tournaments (organizer)
   */
  async getUserTournaments(userId: string, skip: number, take: number) {
    const { items, total } = await this.repo.listByOrganizer(userId, skip, take);

    return {
      tournaments: items.map((t: any) => this.formatTournament(t)),
      total,
      hasMore: skip + take < total,
    };
  }

  /**
   * List all tournaments (public)
   */
  async listAllTournaments(skip: number, take: number) {
    const { items, total } = await this.repo.listAll(skip, take);

    return {
      tournaments: items.map((t: any) => this.formatTournament(t)),
      total,
      hasMore: skip + take < total,
    };
  }

  /**
   * Update tournament (organizer only)
   */
  async updateTournament(
    id: string,
    userId: string,
    input: {
      name?: string;
      description?: string;
      entryFeeEnabled?: boolean;
      entryFeeMinor?: bigint;
      entryFeeCurrency?: string;
    },
  ) {
    const tournament = await this.repo.getTournamentById(id);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.organizerId !== userId) {
      throw new ForbiddenException('Only the organizer can update this tournament');
    }

    // Validate new entry fee if changed
    if (input.entryFeeEnabled !== undefined && input.entryFeeEnabled) {
      if (!input.entryFeeMinor || !input.entryFeeCurrency) {
        throw new BadRequestException('Entry fee and currency required');
      }

      if (input.entryFeeMinor <= 0n) {
        throw new BadRequestException('Entry fee must be greater than 0');
      }
    }

    const updated = await this.repo.updateTournament(id, input);
    return this.formatTournament(updated);
  }

  /**
   * Delete tournament (organizer only)
   */
  async deleteTournament(id: string, userId: string): Promise<void> {
    const tournament = await this.repo.getTournamentById(id);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.organizerId !== userId) {
      throw new ForbiddenException('Only the organizer can delete this tournament');
    }

    // Check if tournament has rooms
    if (tournament._count.rooms > 0) {
      throw new BadRequestException('Cannot delete tournament with active rooms');
    }

    await this.repo.deleteTournament(id);
  }

  /**
   * Format tournament for API response
   */
  private formatTournament(tournament: any) {
    return {
      id: tournament.id,
      organizerId: tournament.organizerId,
      name: tournament.name,
      description: tournament.description,
      entryFeeEnabled: tournament.entryFeeEnabled,
      entryFeeMinor: tournament.entryFeeMinor,
      entryFeeCurrency: tournament.entryFeeCurrency,
      createdAt: tournament.createdAt.toISOString(),
      updatedAt: tournament.updatedAt.toISOString(),
      organizer: tournament.organizer
        ? {
            id: tournament.organizer.id,
            email: tournament.organizer.email,
            displayName: tournament.organizer.profile?.displayName || tournament.organizer.email,
          }
        : undefined,
      memberCount: tournament._count?.members || 0,
      roomCount: tournament._count?.rooms || 0,
    };
  }
}
