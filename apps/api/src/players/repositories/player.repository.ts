import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PlayerSearchQuery {
  search?: string;
  category?: string;
  role?: string;
  country?: string;
}

@Injectable()
export class PlayerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.player.findUnique({
      where: { id },
      include: {
        country: true,
        category: true,
        aliases: true,
        sourceIds: { include: { provider: true } },
        statistics: { include: { provider: true } },
        teamHistory: { include: { competition: true } },
      },
    });
  }

  async search(query: PlayerSearchQuery, skip: number, take: number) {
    const where: any = { isActive: true };

    if (query.search) {
      where.OR = [
        { displayName: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { aliases: { some: { alias: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    if (query.category) {
      where.categoryId = query.category;
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.country) {
      where.countryCode = query.country;
    }

    const [items, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        include: {
          country: true,
          category: true,
        },
        orderBy: { displayName: 'asc' },
        skip,
        take,
      }),
      this.prisma.player.count({ where }),
    ]);

    return { items, total };
  }

  async findByCategory(categoryId: string, skip: number, take: number) {
    return this.prisma.player.findMany({
      where: { categoryId, isActive: true },
      include: { country: true, category: true },
      orderBy: { displayName: 'asc' },
      skip,
      take,
    });
  }

  async findByCountry(countryCode: string) {
    return this.prisma.player.findMany({
      where: { countryCode, isActive: true },
      include: { country: true, category: true },
    });
  }

  async findByDisplayName(name: string) {
    return this.prisma.player.findMany({
      where: { displayName: { contains: name, mode: 'insensitive' }, isActive: true },
      include: { country: true, category: true },
    });
  }

  async getStatistics(playerId: string) {
    return this.prisma.playerStatistic.findMany({
      where: { playerId },
      include: { provider: true },
      orderBy: { asOf: 'desc' },
    });
  }
}
