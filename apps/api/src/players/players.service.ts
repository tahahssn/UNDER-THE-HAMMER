import { Injectable, NotFoundException } from '@nestjs/common';
import { PlayerRepository, PlayerSearchQuery } from './repositories/player.repository';
import type { PlayerListItem, PlayerDetailDto, PlayerStatisticDto } from './dtos/player-detail.dto';

@Injectable()
export class PlayersService {
  constructor(private readonly playerRepo: PlayerRepository) {}

  /**
   * Search and paginate players
   */
  async searchPlayers(
    query: PlayerSearchQuery,
    skip: number,
    take: number,
  ): Promise<{ items: PlayerListItem[]; total: number; hasMore: boolean }> {
    const { items, total } = await this.playerRepo.search(query, skip, take);

    const players: PlayerListItem[] = items.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      role: p.role,
      category: p.category ? { id: p.category.id, key: p.category.key, name: p.category.name, sortOrder: p.category.sortOrder } : undefined,
      country: p.country ? { code: p.country.code, name: p.country.name } : undefined,
      categoryId: p.categoryId,
    }));

    return {
      items: players,
      total,
      hasMore: skip + take < total,
    };
  }

  /**
   * Get player detail with statistics and aliases
   */
  async getPlayerDetail(id: string): Promise<PlayerDetailDto> {
    const player = await this.playerRepo.findById(id);

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    const stats = await this.playerRepo.getStatistics(id);

    // Group statistics by format, then convert Map to Record for JSON serialization
    const statisticsByFormat = new Map<string, PlayerStatisticDto[]>();
    for (const stat of stats) {
      const format = stat.format;
      if (!statisticsByFormat.has(format)) {
        statisticsByFormat.set(format, []);
      }

      statisticsByFormat.get(format)!.push({
        format: stat.format,
        matches: stat.matches ?? undefined,
        runs: stat.runs ?? undefined,
        battingAverage: stat.battingAverage ? Number(stat.battingAverage) : undefined,
        strikeRate: stat.strikeRate ? Number(stat.strikeRate) : undefined,
        wickets: stat.wickets ?? undefined,
        bowlingAverage: stat.bowlingAverage ? Number(stat.bowlingAverage) : undefined,
        bowlingEconomy: stat.bowlingEconomy ? Number(stat.bowlingEconomy) : undefined,
        asOf: stat.asOf.toISOString(),
        provider: stat.provider ? { name: stat.provider.name, licenseNotes: stat.provider.licenseNotes ?? undefined } : undefined,
      });
    }

    // Convert Map to Record for JSON serialization
    const statisticsRecord: Record<string, PlayerStatisticDto[]> = {};
    for (const [format, formatStats] of statisticsByFormat) {
      statisticsRecord[format] = formatStats;
    }

    const aliases = player.aliases.map((a) => a.alias);

    return {
      id: player.id,
      fullName: player.fullName,
      displayName: player.displayName,
      role: player.role,
      battingStyle: player.battingStyle ?? undefined,
      bowlingStyle: player.bowlingStyle ?? undefined,
      dateOfBirth: player.dateOfBirth ? player.dateOfBirth.toISOString() : undefined,
      country: player.country ? { code: player.country.code, name: player.country.name } : undefined,
      category: player.category
        ? { id: player.category.id, key: player.category.key, name: player.category.name }
        : undefined,
      categoryId: player.categoryId,
      aliases,
      statistics: statisticsRecord,
      isActive: player.isActive,
      createdAt: player.createdAt.toISOString(),
      updatedAt: player.updatedAt.toISOString(),
    };
  }

  /**
   * Get players by category with pagination
   */
  async getPlayersByCategory(categoryId: string, skip: number, take: number) {
    return this.playerRepo.findByCategory(categoryId, skip, take);
  }

  /**
   * Get player statistics grouped by format
   */
  async getPlayerStatistics(playerId: string) {
    const stats = await this.playerRepo.getStatistics(playerId);

    const grouped = new Map<string, any[]>();
    for (const stat of stats) {
      const format = stat.format;
      if (!grouped.has(format)) {
        grouped.set(format, []);
      }
      grouped.get(format)!.push(stat);
    }

    return grouped;
  }
}
