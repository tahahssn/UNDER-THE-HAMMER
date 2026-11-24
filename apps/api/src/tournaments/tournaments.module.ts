import { Module } from '@nestjs/common';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { TournamentsRepository } from './tournaments.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TournamentsController],
  providers: [TournamentsService, TournamentsRepository],
  exports: [TournamentsService, TournamentsRepository],
})
export class TournamentsModule {}
