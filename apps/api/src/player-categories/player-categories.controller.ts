import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlayerCategoriesService } from './player-categories.service';

@ApiTags('player-categories')
@Controller({ path: 'player-categories', version: VERSION_NEUTRAL })
export class PlayerCategoriesController {
  constructor(private readonly service: PlayerCategoriesService) {}

  /**
   * Get all player categories
   * GET /api/player-categories
   */
  @Get()
  async getAllCategories() {
    const categories = await this.service.getAllCategories();
    return { categories };
  }
}
