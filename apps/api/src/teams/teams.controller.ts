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
  Request,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtGuard } from '../auth/jwt.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { TeamsService } from './teams.service';

const teamCreateSchema = z.object({
  name: z.string().min(1).max(100),
  shortName: z.string().min(1).max(20),
  description: z.string().max(500).optional(),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  countryCode: z.string().length(2).optional(),
});

const teamUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  shortName: z.string().min(1).max(20).optional(),
  description: z.string().max(500).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i).nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
});

type TeamCreateDto = z.infer<typeof teamCreateSchema>;
type TeamUpdateDto = z.infer<typeof teamUpdateSchema>;

@ApiTags('teams')
@Controller({ path: 'teams', version: VERSION_NEUTRAL })
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  /**
   * Create a new team (authenticated)
   * POST /api/teams
   */
  @Post()
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async createTeam(
    @Body(new ZodValidationPipe(teamCreateSchema)) dto: TeamCreateDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.teamsService.createTeam(dto, req.user.sub);
  }

  /**
   * Get team by ID (public)
   * GET /api/teams/:id
   */
  @Get(':id')
  async getTeamDetail(@Param('id') id: string) {
    return this.teamsService.getTeamDetail(id);
  }

  /**
   * Update team (owner/member only)
   * PATCH /api/teams/:id
   */
  @Patch(':id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  async updateTeam(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(teamUpdateSchema)) dto: TeamUpdateDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.teamsService.updateTeam(id, dto, req.user.sub);
  }

  /**
   * Archive team (owner only)
   * DELETE /api/teams/:id
   */
  @Delete(':id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  async archiveTeam(@Param('id') id: string, @Request() req: { user: JwtPayload }) {
    await this.teamsService.archiveTeam(id, req.user.sub);
  }

  /**
   * List teams (optional filters)
   * GET /api/teams?createdBy=&skip=0&take=20
   */
  @Get()
  async listTeams(
    @Query('createdBy') createdBy?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const skipNum = parseInt(skip ?? '0', 10);
    const takeNum = parseInt(take ?? '20', 10);

    if (createdBy) {
      return this.teamsService.listTeamsByCreator(createdBy, skipNum, takeNum);
    }

    return this.teamsService.listAllTeams(skipNum, takeNum);
  }
}
