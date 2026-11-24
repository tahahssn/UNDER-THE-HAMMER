import { Module } from '@nestjs/common';
import { RoomInvitationsController } from './room-invitations.controller';
import { RoomInvitationsService } from './room-invitations.service';
import { RoomInvitationsRepository } from './room-invitations.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [PrismaModule, RoomsModule],
  controllers: [RoomInvitationsController],
  providers: [RoomInvitationsService, RoomInvitationsRepository],
  exports: [RoomInvitationsService, RoomInvitationsRepository],
})
export class RoomInvitationsModule {}
