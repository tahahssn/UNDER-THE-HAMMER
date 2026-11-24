import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionsRepository } from './auctions.repository';
import { AuctionStateMachineService, AuctionPhase } from './services/auction-state-machine.service';
import { BidAcceptanceService } from './services/bid-acceptance.service';
import { PlayerSelectionService } from './services/player-selection.service';
import { AuctionEventStoreService } from './services/auction-event-store.service';
import { CountdownService } from './services/countdown.service';
import { AUCTION_ERRORS } from './constants/auction-errors';

@Injectable()
export class AuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AuctionsRepository,
    private readonly stateMachine: AuctionStateMachineService,
    private readonly bidAcceptance: BidAcceptanceService,
    private readonly playerSelection: PlayerSelectionService,
    private readonly eventStore: AuctionEventStoreService,
    private readonly countdown: CountdownService
  ) {}

  /**
   * Create auction from room
   */
  async createAuction(roomId: string, userId: string) {
    const room = await this.prisma.auctionRoom.findUnique({
      where: { id: roomId },
      include: { members: true },
    });

    if (!room) {
      throw new BadRequestException(AUCTION_ERRORS.ROOM_NOT_FOUND);
    }

    // Verify user is host
    if (room.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    // Check if auction already exists for this room
    const existing = await this.repo.getAuctionByRoomId(roomId);
    if (existing) {
      return existing;
    }

    // Create auction
    const auction = await this.repo.createAuction({
      room: { connect: { id: roomId } },
      phase: 'DRAFT',
      stateVersion: 0,
    });

    // Create teams from room
    const teamCount = room.teamCount ?? 8;
    const purseMinor = room.initialPurseMinor ?? 20_000_000_00n;

    const teams = await Promise.all(
      Array.from({ length: teamCount }).map((_, i) =>
        this.prisma.auctionTeam.create({
          data: {
            auctionId: auction.id,
            teamIndex: i,
            purseInitialMinor: purseMinor,
            purseBalanceMinor: purseMinor,
          },
        })
      )
    );

    // Record event
    await this.eventStore.recordEvent(auction.id, 'AUCTION_CREATED', {
      roomId,
      teamCount,
      purseMinor: purseMinor.toString(),
    });

    return { auction, teams };
  }

  /**
   * Get auction detail
   */
  async getAuctionDetail(auctionId: string) {
    return this.repo.getAuctionById(auctionId);
  }

  /**
   * Start auction (transition DRAFT/REGISTRATION → READY → LIVE)
   */
  async startAuction(auctionId: string, userId: string, stateVersion: number) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.room?.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    // Transition to READY if in REGISTRATION
    if (auction.phase === 'REGISTRATION') {
      await this.stateMachine.transitionTo(auctionId, 'READY', auction.stateVersion);
    }

    // Transition to LIVE
    await this.stateMachine.transitionTo(auctionId, 'LIVE', (auction.stateVersion || 0) + 1);

    // Record event
    await this.eventStore.recordEvent(auctionId, 'AUCTION_STARTED', {
      startedBy: userId,
    });

    // Start countdown
    const durationSeconds = 30; // from config
    await this.countdown.startCountdown(auctionId, durationSeconds);

    return this.repo.getAuctionById(auctionId);
  }

  /**
   * Pause auction
   */
  async pauseAuction(auctionId: string, userId: string, reason?: string) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.room?.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    if (auction.phase !== 'LIVE') {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_LIVE);
    }

    await this.stateMachine.transitionTo(auctionId, 'PAUSED', auction.stateVersion);

    await this.eventStore.recordEvent(auctionId, 'AUCTION_PAUSED', {
      pausedBy: userId,
      reason,
    });

    return this.repo.getAuctionById(auctionId);
  }

  /**
   * Resume auction
   */
  async resumeAuction(auctionId: string, userId: string) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.room?.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    if (auction.phase !== 'PAUSED') {
      throw new BadRequestException('Auction is not paused');
    }

    await this.stateMachine.transitionTo(auctionId, 'LIVE', auction.stateVersion);

    await this.eventStore.recordEvent(auctionId, 'AUCTION_RESUMED', {
      resumedBy: userId,
    });

    return this.repo.getAuctionById(auctionId);
  }

  /**
   * Conclude auction
   */
  async concludeAuction(auctionId: string, userId: string) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.room?.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    // Transition to SETTLEMENT first
    if (auction.phase === 'LIVE' || auction.phase === 'PAUSED') {
      await this.stateMachine.transitionTo(auctionId, 'SETTLEMENT', auction.stateVersion);
    }

    // Then to CONCLUDED
    const updated = await this.repo.getAuctionById(auctionId);
    await this.stateMachine.transitionTo(auctionId, 'CONCLUDED', updated!.stateVersion);

    await this.eventStore.recordEvent(auctionId, 'AUCTION_CONCLUDED', {
      concludedBy: userId,
    });

    return this.repo.getAuctionById(auctionId);
  }

  /**
   * Submit bid (called from WebSocket gateway)
   */
  async submitBid(
    auctionId: string,
    auctionPlayerId: string,
    auctionTeamId: string,
    amountMinor: bigint,
    userId: string,
    idempotencyKey: string,
    stateVersion: number
  ) {
    return this.bidAcceptance.acceptBid(
      auctionId,
      auctionPlayerId,
      auctionTeamId,
      amountMinor,
      userId,
      idempotencyKey,
      stateVersion
    );
  }

  /**
   * Select player manually
   */
  async selectPlayerManual(auctionId: string, playerId: string, userId: string) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.room?.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    const player = await this.playerSelection.selectPlayerManual(auctionId, playerId);

    await this.eventStore.recordEvent(auctionId, 'PLAYER_INTRODUCED', {
      playerId,
      selectedBy: userId,
      selectionSource: 'MANUAL',
    });

    return player;
  }

  /**
   * Draw player automatically
   */
  async drawPlayerAutomatic(auctionId: string, userId: string) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    // Allow host or if automatic mode
    if (auction.room?.hostUserId !== userId && auction.room?.playerSelection !== 'AUTOMATIC') {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    const player = await this.playerSelection.drawPlayerAutomatic(auctionId);

    await this.eventStore.recordEvent(auctionId, 'PLAYER_INTRODUCED', {
      playerId: player.id,
      selectedBy: userId,
      selectionSource: 'AUTOMATIC',
    });

    return player;
  }

  /**
   * Get auction events
   */
  async getAuctionEvents(auctionId: string, fromSequence?: number, limit: number = 100) {
    const events = await this.eventStore.getEventsSince(auctionId, fromSequence);

    return {
      events: events.slice(0, limit),
      total: events.length,
      limit,
    };
  }

  /**
   * Get teams
   */
  async getTeams(auctionId: string) {
    return this.repo.getAuctionTeams(auctionId);
  }
}
