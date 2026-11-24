import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionsRepository } from '../auctions.repository';
import { AUCTION_ERRORS } from '../constants/auction-errors';

export type AuctionPhase = 'DRAFT' | 'REGISTRATION' | 'READY' | 'LIVE' | 'SETTLEMENT' | 'CONCLUDED' | 'PAUSED';

const VALID_TRANSITIONS: Record<AuctionPhase, AuctionPhase[]> = {
  DRAFT: ['REGISTRATION'],
  REGISTRATION: ['READY', 'DRAFT'],
  READY: ['LIVE', 'REGISTRATION'],
  LIVE: ['SETTLEMENT', 'PAUSED'],
  SETTLEMENT: ['CONCLUDED'],
  CONCLUDED: [],
  PAUSED: ['LIVE', 'SETTLEMENT'],
};

@Injectable()
export class AuctionStateMachineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AuctionsRepository
  ) {}

  /**
   * Validate if a transition from currentPhase to targetPhase is allowed
   */
  isValidTransition(currentPhase: string, targetPhase: string): boolean {
    const allowed = VALID_TRANSITIONS[currentPhase as AuctionPhase];
    return allowed?.includes(targetPhase as AuctionPhase) ?? false;
  }

  /**
   * Transition auction to a new phase with validation and stateVersion increment
   */
  async transitionTo(auctionId: string, targetPhase: AuctionPhase, currentStateVersion: number) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    if (auction.stateVersion !== currentStateVersion) {
      throw new BadRequestException(AUCTION_ERRORS.STATE_VERSION_MISMATCH);
    }

    const currentPhase = auction.phase as AuctionPhase;

    if (!this.isValidTransition(currentPhase, targetPhase)) {
      throw new BadRequestException(
        `${AUCTION_ERRORS.INVALID_STATE_TRANSITION}: ${currentPhase} → ${targetPhase}`
      );
    }

    // Handle phase-specific logic
    if (targetPhase === 'LIVE') {
      await this.freezeConfigurationSnapshot(auctionId);
    }

    return this.repo.updateAuctionPhase(auctionId, targetPhase, currentStateVersion);
  }

  /**
   * Capture auction configuration at LIVE transition (immutable for duration of auction)
   */
  private async freezeConfigurationSnapshot(auctionId: string) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction || !auction.roomId) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    // Check if snapshot already exists
    const existing = await this.prisma.auctionConfigurationSnapshot.findUnique({
      where: { auctionId },
    });

    if (existing) {
      return;
    }

    // Create snapshot from room settings
    const room = await this.prisma.auctionRoom.findUnique({
      where: { id: auction.roomId },
    });

    if (!room) {
      throw new BadRequestException(AUCTION_ERRORS.ROOM_NOT_FOUND);
    }

    await this.prisma.auctionConfigurationSnapshot.create({
      data: {
        auctionId,
        teamCount: room.teamCount ?? 8,
        teamPurseMinor: room.initialPurseMinor ?? 20_000_000_00n,
        format: room.format ?? 'COUNTDOWN',
        controlMode: room.controlMode ?? 'HOST_CONTROLLED',
        playerSelection: room.playerSelection ?? 'MANUAL',
        allowHostParticipation: room.allowHostParticipation ?? true,
        breakEveryNBids: room.breakEveryNBids ?? 5,
        breakDurationSeconds: room.breakDurationSeconds ?? 60,
        countdownDurationSeconds: room.countdownDurationSeconds ?? 30,
        turnDurationSeconds: room.turnDurationSeconds ?? 45,
        spectatorPermission: room.spectatorPermission ?? 'PUBLIC',
      },
    });
  }

  /**
   * Get current phase and state version
   */
  async getCurrentPhase(auctionId: string): Promise<{ phase: AuctionPhase; stateVersion: number }> {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new BadRequestException(AUCTION_ERRORS.AUCTION_NOT_FOUND);
    }

    return {
      phase: auction.phase as AuctionPhase,
      stateVersion: auction.stateVersion,
    };
  }

  /**
   * Check if auction is in a locked phase (cannot modify settings)
   */
  isConfigurationLocked(phase: AuctionPhase): boolean {
    return ['LIVE', 'SETTLEMENT', 'CONCLUDED', 'PAUSED'].includes(phase);
  }
}
