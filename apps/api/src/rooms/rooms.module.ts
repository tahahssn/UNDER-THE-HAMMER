import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsRepository } from './rooms.repository';
import { RoomAllocationService } from './services/room-allocation.service';
import { RoomAccessService } from './services/room-access.service';
import { RoomConfigurationService } from './services/room-configuration.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [PrismaModule, SubscriptionsModule],
  controllers: [RoomsController],
  providers: [
    RoomsService,
    RoomsRepository,
    RoomAllocationService,
    RoomAccessService,
    RoomConfigurationService,
  ],
  exports: [RoomsService, RoomAllocationService, RoomAccessService],
})
export class RoomsModule {}
