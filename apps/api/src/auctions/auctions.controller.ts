import { Controller, Post, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuctionsService } from './auctions.service';
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
  constructor(private readonly auctionsService: AuctionsService) {}

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
}
