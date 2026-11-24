import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SubscriptionGuard } from '../subscriptions/subscription.guard';
import { RoomsService } from './rooms.service';
import type { JwtPayload } from '../auth/jwt.strategy';

// DTOs
const bidIncrementBracketSchema = z.object({
  fromMinor: z.bigint(),
  toMinor: z.bigint(),
  incrementMinor: z.bigint(),
});

const squadRuleSchema = z.object({
  type: z.string(),
  role: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  minCount: z.number().int().optional(),
  maxCount: z.number().int().optional(),
});

const roomSettingsConfigSchema = z.object({
  teamCount: z.number().int().min(2).max(16),
  teamPurseMinor: z.bigint().positive(),
  currency: z.string().length(3),
  format: z.enum(['LIVE_COUNTDOWN', 'TURN_BASED']),
  controlMode: z.enum(['HOST_CONTROLLED', 'SYSTEM_AUTOMATIC']),
  playerSelectionMode: z.enum(['MANUAL', 'AUTOMATIC_DRAW']),
  hostParticipates: z.boolean(),
  countdownDurationSeconds: z.number().int().positive(),
  turnDurationSeconds: z.number().int().positive(),
  breakAfterBidCount: z.number().int().nonnegative(),
  breakDurationSeconds: z.number().int().nonnegative(),
  maxBreakAdjustments: z.number().int().nonnegative(),
  bidIncrementBrackets: z.array(bidIncrementBracketSchema),
  squadSizeMin: z.number().int().min(11),
  squadSizeMax: z.number().int().max(50),
  squadRules: z.array(squadRuleSchema),
});

const createRoomSchema = z.object({
  name: z.string().min(1).max(200),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
  listed: z.boolean().optional().default(false),
  tournamentId: z.string().uuid().optional(),
  config: roomSettingsConfigSchema,
});

const updateRoomSettingsSchema = z.object({
  config: roomSettingsConfigSchema,
});

type CreateRoomDto = z.infer<typeof createRoomSchema>;
type UpdateRoomSettingsDto = z.infer<typeof updateRoomSettingsSchema>;

@ApiTags('rooms')
@Controller({ path: 'rooms', version: VERSION_NEUTRAL })
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  /**
   * Create a new room (authenticated + subscription required)
   * POST /api/rooms
   */
  @Post()
  @UseGuards(JwtGuard, SubscriptionGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async createRoom(
    @Body(new ZodValidationPipe(createRoomSchema)) dto: CreateRoomDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.roomsService.createRoom({
      hostId: user.sub,
      name: dto.name,
      visibility: dto.visibility,
      listed: dto.listed ?? false,
      tournamentId: dto.tournamentId,
      config: {
        teamCount: dto.config.teamCount,
        teamPurseMinor: BigInt(dto.config.teamPurseMinor),
        currency: dto.config.currency,
        format: dto.config.format,
        controlMode: dto.config.controlMode,
        playerSelectionMode: dto.config.playerSelectionMode,
        hostParticipates: dto.config.hostParticipates,
        countdownDurationSeconds: dto.config.countdownDurationSeconds,
        turnDurationSeconds: dto.config.turnDurationSeconds,
        breakAfterBidCount: dto.config.breakAfterBidCount,
        breakDurationSeconds: dto.config.breakDurationSeconds,
        maxBreakAdjustments: dto.config.maxBreakAdjustments,
        bidIncrementBrackets: dto.config.bidIncrementBrackets.map((b) => ({
          fromMinor: BigInt(b.fromMinor),
          toMinor: BigInt(b.toMinor),
          incrementMinor: BigInt(b.incrementMinor),
        })),
        squadSizeMin: dto.config.squadSizeMin,
        squadSizeMax: dto.config.squadSizeMax,
        squadRules: dto.config.squadRules,
      },
    });
  }

  /**
   * List public rooms (discovery, unauthenticated)
   * GET /api/rooms?visibility=PUBLIC&status=REGISTRATION&skip=0&take=20
   */
  @Get()
  async listPublicRooms(
    @Query('visibility') visibility?: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const skipNum = parseInt(skip ?? '0', 10);
    const takeNum = parseInt(take ?? '20', 10);

    return this.roomsService.listPublicRooms({
      visibility: visibility || 'PUBLIC',
      status,
      skip: skipNum,
      take: takeNum,
    });
  }

  /**
   * Get room detail (public rooms visible, private rooms require membership)
   * GET /api/rooms/:id
   */
  @Get(':id')
  async getRoomDetail(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.roomsService.getRoomDetail(id, user?.sub);
  }

  /**
   * Get current user's rooms (authenticated)
   * GET /api/rooms/my-rooms
   */
  @Get('my/list')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getUserRooms(
    @CurrentUser() user: JwtPayload,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const skipNum = parseInt(skip ?? '0', 10);
    const takeNum = parseInt(take ?? '20', 10);

    return this.roomsService.getUserRooms(user.sub, skipNum, takeNum);
  }

  /**
   * Update room settings (host only)
   * PATCH /api/rooms/:id/settings
   */
  @Patch(':id/settings')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  async updateRoomSettings(
    @Param('id') roomId: string,
    @Body(new ZodValidationPipe(updateRoomSettingsSchema)) dto: UpdateRoomSettingsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.roomsService.updateRoomSettings(roomId, user.sub, {
      teamCount: dto.config.teamCount,
      teamPurseMinor: BigInt(dto.config.teamPurseMinor),
      currency: dto.config.currency,
      format: dto.config.format,
      controlMode: dto.config.controlMode,
      playerSelectionMode: dto.config.playerSelectionMode,
      hostParticipates: dto.config.hostParticipates,
      countdownDurationSeconds: dto.config.countdownDurationSeconds,
      turnDurationSeconds: dto.config.turnDurationSeconds,
      breakAfterBidCount: dto.config.breakAfterBidCount,
      breakDurationSeconds: dto.config.breakDurationSeconds,
      maxBreakAdjustments: dto.config.maxBreakAdjustments,
      bidIncrementBrackets: dto.config.bidIncrementBrackets.map((b) => ({
        fromMinor: BigInt(b.fromMinor),
        toMinor: BigInt(b.toMinor),
        incrementMinor: BigInt(b.incrementMinor),
      })),
      squadSizeMin: dto.config.squadSizeMin,
      squadSizeMax: dto.config.squadSizeMax,
      squadRules: dto.config.squadRules,
    });
  }

  /**
   * Delete room (host only)
   * DELETE /api/rooms/:id
   */
  @Delete(':id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  async deleteRoom(@Param('id') roomId: string, @CurrentUser() user: JwtPayload): Promise<void> {
    await this.roomsService.deleteRoom(roomId, user.sub);
  }
}
