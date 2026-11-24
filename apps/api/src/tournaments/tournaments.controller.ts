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
import { TournamentsService } from './tournaments.service';
import type { JwtPayload } from '../auth/jwt.strategy';

const createTournamentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  entryFeeEnabled: z.boolean().optional().default(false),
  entryFeeMinor: z.bigint().positive().optional(),
  entryFeeCurrency: z.string().length(3).optional(),
});

const updateTournamentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  entryFeeEnabled: z.boolean().optional(),
  entryFeeMinor: z.bigint().positive().optional(),
  entryFeeCurrency: z.string().length(3).optional(),
});

type CreateTournamentDto = z.infer<typeof createTournamentSchema>;
type UpdateTournamentDto = z.infer<typeof updateTournamentSchema>;

@ApiTags('tournaments')
@Controller({ path: 'tournaments', version: VERSION_NEUTRAL })
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  /**
   * Create a tournament (authenticated)
   * POST /api/tournaments
   */
  @Post()
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async createTournament(
    @Body(new ZodValidationPipe(createTournamentSchema)) dto: CreateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.createTournament({
      organizerId: user.sub,
      name: dto.name,
      description: dto.description,
      entryFeeEnabled: dto.entryFeeEnabled,
      entryFeeMinor: dto.entryFeeMinor ? BigInt(dto.entryFeeMinor) : undefined,
      entryFeeCurrency: dto.entryFeeCurrency,
    });
  }

  /**
   * Get tournament detail (public)
   * GET /api/tournaments/:id
   */
  @Get(':id')
  async getTournamentDetail(@Param('id') id: string) {
    return this.tournamentsService.getTournamentDetail(id);
  }

  /**
   * List user's tournaments (authenticated)
   * GET /api/tournaments/my-tournaments
   */
  @Get('my/list')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getUserTournaments(
    @CurrentUser() user: JwtPayload,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const skipNum = parseInt(skip ?? '0', 10);
    const takeNum = parseInt(take ?? '20', 10);

    return this.tournamentsService.getUserTournaments(user.sub, skipNum, takeNum);
  }

  /**
   * List all tournaments (public)
   * GET /api/tournaments
   */
  @Get()
  async listAllTournaments(@Query('skip') skip?: string, @Query('take') take?: string) {
    const skipNum = parseInt(skip ?? '0', 10);
    const takeNum = parseInt(take ?? '20', 10);

    return this.tournamentsService.listAllTournaments(skipNum, takeNum);
  }

  /**
   * Update tournament (organizer only)
   * PATCH /api/tournaments/:id
   */
  @Patch(':id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  async updateTournament(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTournamentSchema)) dto: UpdateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateTournament(id, user.sub, {
      name: dto.name,
      description: dto.description,
      entryFeeEnabled: dto.entryFeeEnabled,
      entryFeeMinor: dto.entryFeeMinor ? BigInt(dto.entryFeeMinor) : undefined,
      entryFeeCurrency: dto.entryFeeCurrency,
    });
  }

  /**
   * Delete tournament (organizer only)
   * DELETE /api/tournaments/:id
   */
  @Delete(':id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  async deleteTournament(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    await this.tournamentsService.deleteTournament(id, user.sub);
  }
}
