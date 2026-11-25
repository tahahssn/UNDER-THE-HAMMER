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

  // ===== Break Management =====

  /**
   * Get current break status
   */
  async getBreakStatus(auctionId: string) {
    // Injected via gateway/context in real implementation
    // For now, return break status
    return this.getBreakStatusInternal(auctionId);
  }

  async getBreakStatusInternal(auctionId: string) {
    const breakRecord = await this.repo.getActiveBreak(auctionId);
    if (!breakRecord) {
      return null;
    }

    const now = new Date();
    const timeRemaining = Math.max(0, Math.floor((breakRecord.deadline.getTime() - now.getTime()) / 1000));

    return {
      id: breakRecord.id,
      startedAt: breakRecord.startedAt,
      deadline: breakRecord.deadline,
      secondsRemaining: timeRemaining,
      originalDurationSeconds: breakRecord.originalDurationSeconds,
      reason: breakRecord.reason,
      isExpired: timeRemaining === 0,
    };
  }

  /**
   * Begin a break (host action)
   */
  async beginBreak(auctionId: string, durationSeconds: number, userId: string, reason?: string) {
    const auction = await this.repo.getAuctionById(auctionId);
    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.room?.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    // Break can be manually triggered or automatic
    const breakRecord = await this.repo.recordBreak({
      auctionId,
      startedAt: new Date(),
      deadline: new Date(new Date().getTime() + durationSeconds * 1000),
      originalDurationSeconds: durationSeconds,
      reason,
    });

    await this.eventStore.recordEvent(auctionId, 'break:started', {
      breakId: breakRecord.id,
      durationSeconds,
      reason,
    });

    return breakRecord;
  }

  /**
   * Extend break (host action)
   */
  async extendBreak(auctionId: string, extensionSeconds: number, userId: string) {
    const auction = await this.repo.getAuctionById(auctionId);
    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.room?.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    const breakRecord = await this.repo.getActiveBreak(auctionId);
    if (!breakRecord) {
      throw new BadRequestException('No active break found');
    }

    if (extensionSeconds <= 0 || extensionSeconds > 300) {
      throw new BadRequestException('Extension must be between 1 and 300 seconds');
    }

    const updated = await this.repo.updateBreak(breakRecord.id, {
      deadline: new Date(breakRecord.deadline.getTime() + extensionSeconds * 1000),
    });

    await this.eventStore.recordEvent(auctionId, 'break:extended', {
      breakId: breakRecord.id,
      extensionSeconds,
      newDeadline: updated.deadline,
    });

    return updated;
  }

  /**
   * Reduce break (host action)
   */
  async reduceBreak(auctionId: string, reductionSeconds: number, userId: string) {
    const auction = await this.repo.getAuctionById(auctionId);
    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.room?.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    const breakRecord = await this.repo.getActiveBreak(auctionId);
    if (!breakRecord) {
      throw new BadRequestException('No active break found');
    }

    if (reductionSeconds <= 0 || reductionSeconds > 300) {
      throw new BadRequestException('Reduction must be between 1 and 300 seconds');
    }

    const newDeadline = new Date(
      Math.max(
        new Date().getTime() + 1000, // At least 1 second remains
        breakRecord.deadline.getTime() - reductionSeconds * 1000
      )
    );

    const updated = await this.repo.updateBreak(breakRecord.id, {
      deadline: newDeadline,
    });

    await this.eventStore.recordEvent(auctionId, 'break:reduced', {
      breakId: breakRecord.id,
      reductionSeconds,
      newDeadline: updated.deadline,
    });

    return updated;
  }

  /**
   * End break (host action)
   */
  async endBreak(auctionId: string, userId: string) {
    const auction = await this.repo.getAuctionById(auctionId);
    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.room?.hostUserId !== userId) {
      throw new ForbiddenException(AUCTION_ERRORS.NOT_HOST);
    }

    const breakRecord = await this.repo.getActiveBreak(auctionId);
    if (!breakRecord) {
      throw new BadRequestException('No active break found');
    }

    const updated = await this.repo.updateBreak(breakRecord.id, {
      endedAt: new Date(),
    });

    await this.eventStore.recordEvent(auctionId, 'break:ended', {
      breakId: breakRecord.id,
    });

    return updated;
  }

  // ===== Squad Management =====

  /**
   * Get squad rules for an auction
   */
  async getSquadRules(auctionId: string) {
    return this.prisma.squadRule.findMany({
      where: { auctionId },
      include: { category: true },
      orderBy: { type: 'asc' },
    });
  }

  /**
   * Get squad progress for a team
   */
  async getSquadProgress(auctionId: string, auctionTeamId: string) {
    // This would be injected in the actual implementation
    return this.getSquadProgressInternal(auctionId, auctionTeamId);
  }

  async getSquadProgressInternal(auctionId: string, auctionTeamId: string) {
    const acquisitions = await this.repo.getAcquisitionsByAuctionTeam(auctionTeamId);
    const rules = await this.getSquadRules(auctionId);
    const progress: any[] = [];

    for (const rule of rules) {
      let currentCount = 0;
      let description = '';
      let satisfied = false;

      switch (rule.type) {
        case 'SQUAD_SIZE':
          currentCount = acquisitions.length;
          description = `Squad Size (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          satisfied =
            (!rule.minCount || currentCount >= rule.minCount) &&
            (!rule.maxCount || currentCount <= rule.maxCount);
          break;
        case 'ROLE_COUNT':
          currentCount = acquisitions.filter((a: any) => a.player?.role === rule.role).length;
          description = `${rule.role}s (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          satisfied =
            (!rule.minCount || currentCount >= rule.minCount) &&
            (!rule.maxCount || currentCount <= rule.maxCount);
          break;
        case 'DOMESTIC_COUNT':
          currentCount = acquisitions.filter((a: any) => a.player?.countryCode === 'PK').length;
          description = `Domestic Players (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          satisfied =
            (!rule.minCount || currentCount >= rule.minCount) &&
            (!rule.maxCount || currentCount <= rule.maxCount);
          break;
        case 'OVERSEAS_COUNT':
          currentCount = acquisitions.filter((a: any) => a.player?.countryCode !== 'PK').length;
          description = `Overseas Players (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          satisfied =
            (!rule.minCount || currentCount >= rule.minCount) &&
            (!rule.maxCount || currentCount <= rule.maxCount);
          break;
        case 'CATEGORY_COUNT':
          currentCount = acquisitions.filter((a: any) => a.player?.categoryId === rule.categoryId).length;
          description = `${rule.category?.name} Players (Min: ${rule.minCount}, Max: ${rule.maxCount})`;
          satisfied =
            (!rule.minCount || currentCount >= rule.minCount) &&
            (!rule.maxCount || currentCount <= rule.maxCount);
          break;
      }

      progress.push({
        id: rule.id,
        type: rule.type,
        description,
        currentCount,
        minCount: rule.minCount ?? undefined,
        maxCount: rule.maxCount ?? undefined,
        satisfied,
      });
    }

    return progress;
  }

  /**
   * Get latest squad validation record
   */
  async getLatestSquadValidation(auctionId: string, auctionTeamId: string) {
    return this.repo.getLatestSquadValidation(auctionId, auctionTeamId);
  }

  /**
   * Validate squad requirements (called at settlement)
   */
  async validateSquadRequirements(auctionId: string, auctionTeamId: string) {
    const progress = await this.getSquadProgressInternal(auctionId, auctionTeamId);
    const violations: any[] = [];

    for (const rule of progress) {
      if (!rule.satisfied) {
        const violationType =
          rule.minCount && rule.currentCount < rule.minCount
            ? 'BELOW_MIN'
            : rule.maxCount && rule.currentCount > rule.maxCount
            ? 'ABOVE_MAX'
            : 'MISSING_REQUIREMENT';

        violations.push({
          ruleId: rule.id,
          type: rule.type,
          violationType,
          currentCount: rule.currentCount,
          requiredMinCount: rule.minCount,
          requiredMaxCount: rule.maxCount,
        });
      }
    }

    const valid = violations.length === 0;

    // Record validation and violations in audit trail
    const validation = await this.repo.recordSquadValidation({
      auctionId,
      auctionTeamId,
      valid,
    });

    // Record each violation
    const rules = await this.getSquadRules(auctionId);
    for (const violation of violations) {
      const rule = rules.find((r) => r.id === violation.ruleId);
      if (rule) {
        await this.repo.recordSquadViolation({
          squadValidationId: validation.id,
          auctionTeamId,
          squadRuleId: rule.id,
          violationType: violation.violationType,
          currentCount: violation.currentCount,
          requiredMinCount: violation.requiredMinCount,
          requiredMaxCount: violation.requiredMaxCount,
        });
      }
    }

    await this.eventStore.recordEvent(auctionId, 'squad:validation-complete', {
      auctionTeamId,
      valid,
      violationCount: violations.length,
    });

    return {
      valid,
      progress,
      violations,
    };
  }
}
