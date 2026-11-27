import { Controller, Post, Get, Put, Param, Body, UseGuards, Query, Res, BadRequestException, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuctionsService } from './auctions.service';
import { SquadExportService } from './services/squad-export.service';
import { ExportFormat } from '@uth/contracts';
import { Response } from 'express';
import {
  CreateAuctionDtoSchema,
  StartAuctionDtoSchema,
  PauseAuctionDtoSchema,
  ResumeAuctionDtoSchema,
  ConcludeAuctionDtoSchema,
  SelectPlayerManualDtoSchema,
  DrawPlayerAutomaticDtoSchema,
} from './dto';

@Controller('v1/auctions')
@UseGuards(JwtGuard)
export class AuctionsController {
  constructor(
    private readonly auctionsService: AuctionsService,
    private readonly exportService: SquadExportService
  ) {}

  @Post()
  async createAuction(
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    const data = CreateAuctionDtoSchema.parse(body);
    return this.auctionsService.createAuction(data.roomId, userId);
  }

  @Get(':auctionId')
  async getAuctionDetail(
    @Param('auctionId') auctionId: string
  ) {
    return this.auctionsService.getAuctionDetail(auctionId);
  }

  @Put(':auctionId/start')
  async startAuction(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    const data = StartAuctionDtoSchema.parse({ ...body, auctionId, userId });
    return this.auctionsService.startAuction(auctionId, userId, body.stateVersion ?? 0);
  }

  @Put(':auctionId/pause')
  async pauseAuction(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    const data = PauseAuctionDtoSchema.parse({ ...body, auctionId, userId });
    return this.auctionsService.pauseAuction(auctionId, userId, body.reason);
  }

  @Put(':auctionId/resume')
  async resumeAuction(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    const data = ResumeAuctionDtoSchema.parse({ ...body, auctionId, userId });
    return this.auctionsService.resumeAuction(auctionId, userId);
  }

  @Put(':auctionId/conclude')
  async concludeAuction(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    const data = ConcludeAuctionDtoSchema.parse({ ...body, auctionId, userId });
    return this.auctionsService.concludeAuction(auctionId, userId);
  }

  @Get(':auctionId/events')
  async getAuctionEvents(
    @Param('auctionId') auctionId: string,
    @Body() body: any
  ) {
    return this.auctionsService.getAuctionEvents(auctionId, body.fromSequence, body.limit ?? 100);
  }

  @Get(':auctionId/teams')
  async getTeams(
    @Param('auctionId') auctionId: string
  ) {
    return this.auctionsService.getTeams(auctionId);
  }

  @Post(':auctionId/select-player')
  async selectPlayerManual(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    const data = SelectPlayerManualDtoSchema.parse({ ...body, auctionId, userId });
    return this.auctionsService.selectPlayerManual(auctionId, body.playerId, userId);
  }

  @Post(':auctionId/draw-player')
  async drawPlayerAutomatic(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    const data = DrawPlayerAutomaticDtoSchema.parse({ ...body, auctionId, userId });
    return this.auctionsService.drawPlayerAutomatic(auctionId, userId);
  }

  // ===== Break Management =====

  @Get(':auctionId/break/status')
  async getBreakStatus(
    @Param('auctionId') auctionId: string
  ) {
    return this.auctionsService.getBreakStatus(auctionId);
  }

  @Post(':auctionId/break/begin')
  async beginBreak(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    return this.auctionsService.beginBreak(auctionId, body.durationSeconds, userId, body.reason);
  }

  @Post(':auctionId/break/extend')
  async extendBreak(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    return this.auctionsService.extendBreak(auctionId, body.extensionSeconds, userId);
  }

  @Post(':auctionId/break/reduce')
  async reduceBreak(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    return this.auctionsService.reduceBreak(auctionId, body.reductionSeconds, userId);
  }

  @Post(':auctionId/break/end')
  async endBreak(
    @Param('auctionId') auctionId: string,
    @Body() body: any,
    @CurrentUser('sub') userId: string
  ) {
    return this.auctionsService.endBreak(auctionId, userId);
  }

  // ===== Squad Management =====

  @Get(':auctionId/squads/rules')
  async getSquadRules(
    @Param('auctionId') auctionId: string
  ) {
    return this.auctionsService.getSquadRules(auctionId);
  }

  @Get(':auctionId/squads/:auctionTeamId/progress')
  async getSquadProgress(
    @Param('auctionId') auctionId: string,
    @Param('auctionTeamId') auctionTeamId: string
  ) {
    return this.auctionsService.getSquadProgress(auctionId, auctionTeamId);
  }

  @Get(':auctionId/squads/:auctionTeamId/validation')
  async getLatestSquadValidation(
    @Param('auctionId') auctionId: string,
    @Param('auctionTeamId') auctionTeamId: string
  ) {
    return this.auctionsService.getLatestSquadValidation(auctionId, auctionTeamId);
  }

  @Post(':auctionId/squads/:auctionTeamId/validate')
  async validateSquadRequirements(
    @Param('auctionId') auctionId: string,
    @Param('auctionTeamId') auctionTeamId: string
  ) {
    return this.auctionsService.validateSquadRequirements(auctionId, auctionTeamId);
  }

  // ===== Squad Exports =====

  @Get(':auctionId/export')
  async exportSquad(
    @Param('auctionId') auctionId: string,
    @Query('format') format: string | undefined,
    @CurrentUser('sub') userId: string,
    @Res() res: Response
  ) {
    // Validate format parameter
    if (!format) {
      throw new BadRequestException('format query parameter is required (csv or xlsx)');
    }

    const normalizedFormat = format.toLowerCase();
    if (!Object.values(ExportFormat).includes(normalizedFormat as ExportFormat)) {
      throw new BadRequestException(`Invalid format. Allowed values: ${Object.values(ExportFormat).join(', ')}`);
    }

    const exportFormat = normalizedFormat as ExportFormat;

    try {
      if (exportFormat === ExportFormat.CSV) {
        const csvContent = await this.exportService.exportSquadCsv(auctionId, userId);
        const filename = this.exportService.generateFilename(auctionId, exportFormat);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
      } else if (exportFormat === ExportFormat.XLSX) {
        const xlsxBuffer = await this.exportService.exportSquadXlsx(auctionId, userId);
        const filename = this.exportService.generateFilename(auctionId, exportFormat);

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(xlsxBuffer);
      }
    } catch (error) {
      if (error instanceof BadRequestException || 
          error instanceof ForbiddenException || 
          error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to generate export');
    }
  }
}
