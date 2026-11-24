import { Injectable, Inject } from '@nestjs/common';

/**
 * Service for broadcasting auction events to room participants via WebSocket
 * Actual Socket.IO emission happens through injected gateway reference
 */
@Injectable()
export class AuctionEventBroadcasterService {
  private gateway: any; // Will be injected by gateway after initialization

  setGateway(gateway: any) {
    this.gateway = gateway;
  }

  /**
   * Broadcast bid accepted event to room
   */
  broadcastBidAccepted(auctionId: string, payload: any) {
    if (this.gateway) {
      this.gateway.broadcastToRoom(auctionId, 'bid:accepted', payload);
    }
  }

  /**
   * Broadcast bid rejected event to room
   */
  broadcastBidRejected(auctionId: string, payload: any) {
    if (this.gateway) {
      this.gateway.broadcastToRoom(auctionId, 'bid:rejected', payload);
    }
  }

  /**
   * Broadcast player sold event
   */
  broadcastPlayerSold(auctionId: string, event: any) {
    if (this.gateway) {
      this.gateway.broadcastPlayerSold(auctionId, event);
    }
  }

  /**
   * Broadcast phase changed event
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
