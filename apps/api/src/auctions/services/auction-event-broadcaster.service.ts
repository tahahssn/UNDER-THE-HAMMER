import { Injectable, Inject } from '@nestjs/common';

/**
 * Service for broadcasting auction events to room participants via WebSocket
 * Actual Socket.IO emission happens through injected gateway references
 * Supports coordination with Break, Chat, and Presence gateways
 */
@Injectable()
export class AuctionEventBroadcasterService {
  private gateway: any; // AuctionRoomGateway - Will be injected by gateway after initialization
  private breakGateway: any; // BreakGateway
  private chatGateway: any; // ChatGateway
  private presenceGateway: any; // PresenceGateway

  setGateway(gateway: any) {
    this.gateway = gateway;
  }

  setBreakGateway(gateway: any) {
    this.breakGateway = gateway;
  }

  setChatGateway(gateway: any) {
    this.chatGateway = gateway;
  }

  setPresenceGateway(gateway: any) {
    this.presenceGateway = gateway;
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

  /**
   * Broadcast break event to room (called from BreakManagerService)
   * Respects room isolation
   */
  broadcastBreakEvent(roomId: string, auctionId: string, eventType: string, payload: any) {
    if (this.breakGateway) {
      if (eventType === 'BREAK_STARTED') {
        this.breakGateway.broadcastBreakStarted(roomId, auctionId, payload);
      } else if (eventType === 'BREAK_UPDATED') {
        this.breakGateway.broadcastBreakUpdated(roomId, auctionId, payload);
      } else if (eventType === 'BREAK_ENDED') {
        this.breakGateway.broadcastBreakEnded(roomId, auctionId, payload);
      }
    }
  }

  /**
   * Broadcast chat message (called from ChatGateway)
   */
  broadcastChatMessage(roomId: string, payload: any) {
    if (this.chatGateway) {
      this.chatGateway.broadcastChatMessage(roomId, payload);
    }
  }

  /**
   * Broadcast presence update (called from PresenceGateway)
   */
  broadcastPresenceUpdate(roomId: string) {
    if (this.presenceGateway) {
      this.presenceGateway.broadcastPresence(roomId);
    }
  }
}
