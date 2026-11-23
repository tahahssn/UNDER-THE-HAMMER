import { Controller, Get, Param, Query, VERSION_NEUTRAL, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PlayersService } from './players.service';
import { playerSearchSchema } from './validators/player-search.validator';

@ApiTags('players')
@Controller({ path: 'players', version: VERSION_NEUTRAL })
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  /**
   * Search players with optional filters and pagination
   * GET /api/players?search=&category=&role=&country=&skip=0&take=20
   */
  @Get()
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, enum: ['BATTER', 'BOWLER', 'ALL_ROUNDER', 'WICKETKEEPER'] })
  @ApiQuery({ name: 'country', required: false, type: String })
  @ApiQuery({ name: 'skip', required: false, type: Number, default: 0 })
  @ApiQuery({ name: 'take', required: false, type: Number, default: 20 })
  async searchPlayers(
    @Query(new ZodValidationPipe(playerSearchSchema))
    query: z.infer<typeof playerSearchSchema>,
  ) {
    return this.playersService.searchPlayers(
      {
        search: query.search,
        category: query.category,
        role: query.role,
        country: query.country,
      },
      query.skip,
      query.take,
    );
  }

  /**
   * Get player detail by ID
   * GET /api/players/:id
   */
  @Get(':id')
  async getPlayerDetail(@Param('id') id: string) {
    try {
      return await this.playersService.getPlayerDetail(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw error;
    }
  }
}
