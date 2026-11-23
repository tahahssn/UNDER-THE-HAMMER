import { Injectable } from '@nestjs/common';
import { PlayerCategoriesRepository } from './repositories/player-categories.repository';

@Injectable()
export class PlayerCategoriesService {
  constructor(private readonly repo: PlayerCategoriesRepository) {}

  /**
   * Get all player categories, sorted by sortOrder
   */
  async getAllCategories() {
    return this.repo.findAll();
  }

  /**
   * Get category by ID
   */
  async getCategoryById(id: string) {
    return this.repo.findById(id);
  }
}
