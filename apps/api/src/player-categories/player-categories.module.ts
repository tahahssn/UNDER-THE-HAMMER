import { Module } from '@nestjs/common';
import { PlayerCategoriesController } from './player-categories.controller';
import { PlayerCategoriesService } from './player-categories.service';
import { PlayerCategoriesRepository } from './repositories/player-categories.repository';

@Module({
  controllers: [PlayerCategoriesController],
  providers: [PlayerCategoriesService, PlayerCategoriesRepository],
  exports: [PlayerCategoriesService, PlayerCategoriesRepository],
})
export class PlayerCategoriesModule {}
