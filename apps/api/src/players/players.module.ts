import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { PlayerRepository } from './repositories/player.repository';

@Module({
  controllers: [PlayersController],
  providers: [PlayersService, PlayerRepository],
  exports: [PlayersService, PlayerRepository],
})
export class PlayersModule {}
