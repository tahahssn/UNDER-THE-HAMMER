import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RoomInvitationsService } from './room-invitations.service';
import { RoomsRepository } from '../rooms/rooms.repository';
import type { JwtPayload } from '../auth/jwt.strategy';

const generateInvitationSchema = z.object({
  role: z.enum(['TEAM_OWNER', 'SPECTATOR']),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
});

const joinWithCodeSchema = z.object({
  code: z.string(),
  role: z.enum(['TEAM_OWNER', 'SPECTATOR']),
});

type GenerateInvitationDto = z.infer<typeof generateInvitationSchema>;
type JoinWithCodeDto = z.infer<typeof joinWithCodeSchema>;

@ApiTags('room-invitations')
@Controller({ path: 'rooms', version: VERSION_NEUTRAL })
export class RoomInvitationsController {
  constructor(
    private readonly invitationsService: RoomInvitationsService,
    private readonly roomsRepo: RoomsRepository,
  ) {}

  /**
   * Generate an invitation code for a room (host only)
   * POST /api/rooms/:roomId/invitation
   */
  @Post(':roomId/invitation')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async generateInvitation(
    @Param('roomId') roomId: string,
    @Body(new ZodValidationPipe(generateInvitationSchema)) dto: GenerateInvitationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invitationsService.generateCode({
      roomId,
      createdById: user.sub,
      role: dto.role,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      maxUses: dto.maxUses,
    });
  }

  /**
   * Join a room using an invitation code (authenticated)
   * POST /api/rooms/join-with-code
   */
  @Post('join-with-code')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async joinWithCode(
    @Body(new ZodValidationPipe(joinWithCodeSchema)) dto: JoinWithCodeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // Validate code and get room
    const result = await this.invitationsService.validateAndUseCode(dto.code, user.sub);

    // Add user to room as requested role
    const member = await this.roomsRepo.addRoomMember({
      roomId: result.roomId,
      userId: user.sub,
      role: dto.role,
      status: 'ACTIVE',
    });

    return {
      success: true,
      room: result.room,
      member: {
        id: member.id,
        userId: member.userId,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt.toISOString(),
      },
    };
  }
}
