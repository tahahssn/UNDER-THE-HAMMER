import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuctionsRepository } from '../auctions.repository';
import { BreakManagerService } from '../services/break-manager.service';
import { AuctionEventBroadcasterService } from '../services/auction-event-broadcaster.service';
import { RoomsRepository } from '../../rooms/rooms.repository';

/**
 * Break Gateway: Manages break state transitions and broadcasts break events to room participants.
 * - Authenticates and authorizes break commands (host-only)
 * - Broadcasts break:started, break:updated, break:ended events (read-only for all participants)
 * - On reconnect, returns atomic break snapshot
 * - No server-side echo; broadcast only after durable commit
 */
@WebSocketGateway({
  namespace: '/auctions',
  cors: { origin: process.env.WEB_URL || 'http://localhost:3000' },
})
@Injectable()
export class BreakGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly auctionsRepo: AuctionsRepository,
    private readonly roomsRepo: RoomsRepository,
    private readonly breakManager: BreakManagerService,
    private readonly broadcaster: AuctionEventBroadcasterService
  ) {
    this.broadcaster.setBreakGateway(this);
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      
      // === VALIDATION: JWT sub claim must exist and be non-empty ===
      if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim() === '') {
        client.disconnect();
        return;
      }
      
      client.data.userId = payload.sub;
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Connection tracking already handled by AuctionRoomGateway
  }

  /**
   * Host starts a break
   * Validates room membership and host eligibility before persisting
   */
  @SubscribeMessage('break:start')
  async handleBreakStart(
    client: Socket,
    data: {
      auctionId: string;
      durationSeconds: number;
      reason?: string;
    }
  ) {
    try {
      const userId = client.data.userId;
      const { auctionId, durationSeconds, reason } = data;

      // Fetch auction and room
      const auction = await this.auctionsRepo.getAuctionById(auctionId);
      if (!auction) {
        client.emit('break:start:error', { code: 'AUCTION_NOT_FOUND' });
        return;
      }

      const room = await this.roomsRepo.getRoomById(auction.roomId);
      if (!room) {
        client.emit('break:start:error', { code: 'ROOM_NOT_FOUND' });
        return;
      }

      // Authorize: only host can start breaks
      if (room.hostId !== userId) {
        client.emit('break:start:error', { code: 'UNAUTHORIZED' });
        return;
      }

      // Validate break parameters
      const config = auction.configSnapshot;
      
      // === VALIDATION: Config must exist and be properly initialized ===
      if (!config) {
        client.emit('break:start:error', { 
          code: 'INVALID_AUCTION_CONFIG',
          message: 'Auction configuration not initialized'
        });
        return;
      }

      const minSeconds = config.breakMinSeconds ?? 60;
      const maxSeconds = config.breakMaxSeconds ?? 300;

      if (durationSeconds < minSeconds) {
        client.emit('break:start:error', { code: 'DURATION_TOO_SHORT' });
        return;
      }
      if (durationSeconds > maxSeconds) {
        client.emit('break:start:error', { code: 'DURATION_TOO_LONG' });
        return;
      }

      // Persist break to database
      const breakRecord = await this.breakManager.startBreak(
        auctionId,
        durationSeconds,
        reason
      );

      // Broadcast break:started event (read-only for all)
      this.broadcastBreakStarted(auction.roomId, auctionId, {
        breakId: breakRecord.id,
        startedAt: breakRecord.startedAt,
        deadline: breakRecord.deadline,
        durationSeconds,
        reason,
      });
    } catch (error) {
      client.emit('break:start:error', { code: 'INTERNAL_ERROR', message: (error as any).message });
    }
  }

  /**
   * Host adjusts break duration (extend/reduce)
   * Validates adjustments are within configured limits
   */
  @SubscribeMessage('break:adjust')
  async handleBreakAdjust(
    client: Socket,
    data: {
      auctionId: string;
      adjustmentSeconds: number; // positive for extend, negative for reduce
    }
  ) {
    try {
      const userId = client.data.userId;
      const { auctionId, adjustmentSeconds } = data;

      // Fetch auction and room
      const auction = await this.auctionsRepo.getAuctionById(auctionId);
      if (!auction) {
        client.emit('break:adjust:error', { code: 'AUCTION_NOT_FOUND' });
        return;
      }

      const room = await this.roomsRepo.getRoomById(auction.roomId);
      if (!room) {
        client.emit('break:adjust:error', { code: 'ROOM_NOT_FOUND' });
        return;
      }

      // Authorize: only host can adjust breaks
      if (room.hostId !== userId) {
        client.emit('break:adjust:error', { code: 'UNAUTHORIZED' });
        return;
      }

      // Validate active break exists
      const activeBreak = await this.auctionsRepo.getActiveBreak(auctionId);
      if (!activeBreak) {
        client.emit('break:adjust:error', { code: 'NO_ACTIVE_BREAK' });
        return;
      }

      // Apply adjustment with server-side validation
      const config = auction.configSnapshot;
      
      // === VALIDATION: Config must exist ===
      if (!config) {
        client.emit('break:adjust:error', { 
          code: 'INVALID_AUCTION_CONFIG',
          message: 'Auction configuration not initialized'
        });
        return;
      }

      const maxAdjustment = config.breakMaxSeconds ?? 300;

      let updatedBreak;
      if (adjustmentSeconds > 0) {
        // Extend
        if (adjustmentSeconds > maxAdjustment) {
          client.emit('break:adjust:error', { code: 'ADJUSTMENT_EXCEEDS_LIMIT' });
          return;
        }
        updatedBreak = await this.breakManager.extendBreak(auctionId, adjustmentSeconds);
      } else {
        // Reduce
        if (Math.abs(adjustmentSeconds) > maxAdjustment) {
          client.emit('break:adjust:error', { code: 'ADJUSTMENT_EXCEEDS_LIMIT' });
          return;
        }
        updatedBreak = await this.breakManager.reduceBreak(auctionId, Math.abs(adjustmentSeconds));
      }

      // Broadcast break:updated event
      this.broadcastBreakUpdated(auction.roomId, auctionId, {
        breakId: updatedBreak.id,
        newDeadline: updatedBreak.deadline,
        adjustmentSeconds,
      });
    } catch (error) {
      client.emit('break:adjust:error', { code: 'INTERNAL_ERROR', message: (error as any).message });
    }
  }

  /**
   * Host resumes auction after break
   */
  @SubscribeMessage('break:resume')
  async handleBreakResume(
    client: Socket,
    data: { auctionId: string }
  ) {
    try {
      const userId = client.data.userId;
      const { auctionId } = data;

      // Fetch auction and room
      const auction = await this.auctionsRepo.getAuctionById(auctionId);
      if (!auction) {
        client.emit('break:resume:error', { code: 'AUCTION_NOT_FOUND' });
        return;
      }

      const room = await this.roomsRepo.getRoomById(auction.roomId);
      if (!room) {
        client.emit('break:resume:error', { code: 'ROOM_NOT_FOUND' });
        return;
      }

      // Authorize: only host can resume
      if (room.hostId !== userId) {
        client.emit('break:resume:error', { code: 'UNAUTHORIZED' });
        return;
      }

      // End the active break
      const activeBreak = await this.auctionsRepo.getActiveBreak(auctionId);
      if (!activeBreak) {
        client.emit('break:resume:error', { code: 'NO_ACTIVE_BREAK' });
        return;
      }

      await this.auctionsRepo.updateBreak(activeBreak.id, {
        endedAt: new Date(),
      });

      // Broadcast break:ended event
      this.broadcastBreakEnded(auction.roomId, auctionId, {
        breakId: activeBreak.id,
        endedAt: new Date(),
      });
    } catch (error) {
      client.emit('break:resume:error', { code: 'INTERNAL_ERROR', message: (error as any).message });
    }
  }

  /**
   * Client requests current break state
   * Returns atomic snapshot for reconnect scenarios
   */
  @SubscribeMessage('break:request-state')
  async handleBreakStateRequest(
    client: Socket,
    data: { auctionId: string }
  ) {
    try {
      const userId = client.data.userId;
      const { auctionId } = data;

      // Fetch auction
      const auction = await this.auctionsRepo.getAuctionById(auctionId);
      if (!auction) {
        client.emit('break:state:error', { code: 'AUCTION_NOT_FOUND' });
        return;
      }

      // Verify room membership
      const room = await this.roomsRepo.getRoomById(auction.roomId);
      if (!room) {
        client.emit('break:state:error', { code: 'ROOM_NOT_FOUND' });
        return;
      }

      const member = await this.roomsRepo.getRoomMember(room.id, userId);
      if (!member) {
        client.emit('break:state:error', { code: 'NOT_ROOM_MEMBER' });
        return;
      }

      // Get active break if any
      const activeBreak = await this.auctionsRepo.getActiveBreak(auctionId);

      if (activeBreak) {
        const secondsRemaining = Math.max(
          0,
          Math.round((activeBreak.deadline.getTime() - Date.now()) / 1000)
        );

        client.emit('break:state', {
          breakId: activeBreak.id,
          startedAt: activeBreak.startedAt,
          deadline: activeBreak.deadline,
          originalDurationSeconds: activeBreak.originalDurationSeconds,
          secondsRemaining,
          reason: activeBreak.reason,
          isActive: true,
        });
      } else {
        client.emit('break:state', { isActive: false });
      }
    } catch (error) {
      client.emit('break:state:error', { code: 'INTERNAL_ERROR', message: (error as any).message });
    }
  }

  /**
   * Broadcast break started to room (called by BreakManagerService)
   */
  broadcastBreakStarted(
    roomId: string,
    auctionId: string,
    payload: any
  ) {
    this.server.to(`auction:${auctionId}`).emit('break:started', {
      auctionId,
      ...payload,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast break updated to room
   */
  broadcastBreakUpdated(
    roomId: string,
    auctionId: string,
    payload: any
  ) {
    this.server.to(`auction:${auctionId}`).emit('break:updated', {
      auctionId,
      ...payload,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast break ended to room
   */
  broadcastBreakEnded(
    roomId: string,
    auctionId: string,
    payload: any
  ) {
    this.server.to(`auction:${auctionId}`).emit('break:ended', {
      auctionId,
      ...payload,
      timestamp: new Date(),
    });
  }
}