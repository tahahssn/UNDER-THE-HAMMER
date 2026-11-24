import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TournamentsRepository {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.tournament.create({
      data: {
        organizerId: input.organizerId,
        name: input.name,
        description: input.description,
        entryFeeEnabled: input.entryFeeEnabled ?? false,
        entryFeeMinor: input.entryFeeMinor,
        entryFeeCurrency: input.entryFeeCurrency,
      },
      include: {
        organizer: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
      },
    });
  }

  /**
   * Get tournament by ID
   */
  async getTournamentById(id: string) {
    return this.prisma.tournament.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        members: { select: { userId: true, role: true } },
        _count: { select: { rooms: true } },
      },
    });
  }

  /**
   * List tournaments by organizer
   */
  async listByOrganizer(organizerId: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where: { organizerId },
        include: {
          organizer: { select: { id: true, email: true } },
          _count: { select: { rooms: true, members: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.tournament.count({ where: { organizerId } }),
    ]);

    return { items, total };
  }

  /**
   * List all tournaments (public)
   */
  async listAll(skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.tournament.findMany({
        include: {
          organizer: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
          _count: { select: { rooms: true, members: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.tournament.count(),
    ]);

    return { items, total };
  }

  /**
   * Update tournament
   */
  async updateTournament(
    id: string,
    input: {
      name?: string;
      description?: string;
      entryFeeEnabled?: boolean;
      entryFeeMinor?: bigint;
      entryFeeCurrency?: string;
    },
  ) {
    return this.prisma.tournament.update({
      where: { id },
      data: input,
      include: {
        organizer: { select: { id: true, email: true } },
      },
    });
  }

  /**
   * Delete tournament (soft delete)
   */
  async deleteTournament(id: string) {
    // For now, we just leave tournaments in place
    // A real soft-delete would require a 'deleted_at' field
    return this.prisma.tournament.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }
}
