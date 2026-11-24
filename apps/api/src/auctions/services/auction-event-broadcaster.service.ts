import { Injectable } from '@nestjs/common';

/**
 * Service for broadcasting auction events to room participants via WebSocket
 * Actual Socket.IO emission happens in the gateway
 */
@Injectable()
export class AuctionEventBroadcasterService {
  /**
   * Compose bid accepted event
   */
  bidAccepted(auctionId: string, bidId: string, teamId: string, amountMinor: bigint, sequence: number) {
    return {
      type: 'BID_ACCEPTED',
      auctionId,
      bidId,
      teamId,
      amountMinor,
      sequence,
      timestamp: new Date(),
    };
  }

  /**
   * Compose bid rejected event
   */
  bidRejected(auctionId: string, bidId: string, reason: string, sequence: number) {
    return {
      type: 'BID_REJECTED',
      auctionId,
      bidId,
      reason,
      sequence,
      timestamp: new Date(),
    };
  }

  /**
   * Compose player sold event
   */
  playerSold(auctionId: string, playerId: string, teamId: string, priceMinor: bigint, sequence: number) {
    return {
      type: 'PLAYER_SOLD',
      auctionId,
      playerId,
      teamId,
      priceMinor,
      sequence,
      timestamp: new Date(),
    };
  }

  /**
   * Compose player unsold event
   */
  playerUnsold(auctionId: string, playerId: string, sequence: number) {
    return {
      type: 'PLAYER_UNSOLD',
      auctionId,
      playerId,
      sequence,
      timestamp: new Date(),
    };
  }

  /**
   * Compose phase changed event
   */
  phaseChanged(auctionId: string, phase: string, stateVersion: number) {
    return {
      type: 'PHASE_CHANGED',
      auctionId,
      phase,
      stateVersion,
      timestamp: new Date(),
    };
  }

  /**
   * Compose countdown update
   */
  countdownUpdate(auctionId: string, secondsRemaining: number) {
    return {
      type: 'COUNTDOWN_UPDATED',
      auctionId,
      secondsRemaining,
      timestamp: new Date(),
    };
  }

  /**
   * Compose break started event
   */
  breakStarted(auctionId: string, durationSeconds: number, sequence: number) {
    return {
      type: 'BREAK_STARTED',
      auctionId,
      durationSeconds,
      sequence,
      timestamp: new Date(),
    };
  }

  /**
   * Compose break ended event
   */
  breakEnded(auctionId: string, sequence: number) {
    return {
      type: 'BREAK_ENDED',
      auctionId,
      sequence,
      timestamp: new Date(),
    };
  }

  /**
   * Compose player introduced event (player becomes active)
   */
  playerIntroduced(auctionId: string, playerId: string, sequence: number) {
    return {
      type: 'PLAYER_INTRODUCED',
      auctionId,
      playerId,
      sequence,
      timestamp: new Date(),
    };
  }

  /**
   * Compose auction paused event
   */
  auctionPaused(auctionId: string, reason?: string) {
    return {
      type: 'AUCTION_PAUSED',
      auctionId,
      reason,
      timestamp: new Date(),
    };
  }

  /**
   * Compose auction resumed event
   */
  auctionResumed(auctionId: string) {
    return {
      type: 'AUCTION_RESUMED',
      auctionId,
      timestamp: new Date(),
    };
  }

  /**
   * Compose auction concluded event
   */
  auctionConcluded(auctionId: string) {
    return {
      type: 'AUCTION_CONCLUDED',
      auctionId,
      timestamp: new Date(),
    };
  }
}
