import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuctionsService } from '../auctions.service';
import { AuctionSnapshotService } from '../services/auction-snapshot.service';
import { AuctionEventBroadcasterService } from '../services/auction-event-broadcaster.service';
import { AuctionsRepository } from '../auctions.repository';

@WebSocketGateway({
  namespace: '/auctions',
  cors: { origin: process.env.WEB_URL || 'http://localhost:3000' },
})
@Injectable()
export class AuctionRoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly auctionsService: AuctionsService,
    private readonly snapshotService: AuctionSnapshotService,
    private readonly broadcaster: AuctionEventBroadcasterService,
    private readonly repo: AuctionsRepository
  ) {
    // Allow broadcaster to call gateway methods
    this.broadcaster.setGateway(this);
  }

  /**
   * Handle socket connection with JWT authentication
   */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;

      console.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch (error) {
      client.disconnect();
    }
  }

  /**
   * Handle socket disconnection
   */
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Join auction room
   */
  @SubscribeMessage('room:join')
  async handleRoomJoin(client: Socket, data: { auctionId: string; role?: string }) {
    try {
      const userId = client.data.userId;
      const { auctionId } = data;

      // Verify auction exists
      const auction = await this.repo.getAuctionById(auctionId);
      if (!auction) {
        client.emit('room:join:error', { error: 'AUCTION_NOT_FOUND' });
        return;
      }

      // Join Socket.IO room
      client.join(`auction:${auctionId}`);

      // Record connection
      await this.repo.recordConnection({
        auctionId,
        userId,
        connectedAt: new Date(),
      });

      // Send snapshot
      const snapshot = await this.snapshotService.generateSnapshotForRole(
        auctionId,
        userId,
        data.role as any ?? 'PARTICIPANT'
      );

      client.emit('room:snapshot', snapshot);
      client.emit('room:joined', { auctionId });

      console.log(`User ${userId} joined auction ${auctionId}`);
    } catch (error) {
      client.emit('room:join:error', { error: (error as any).message });
    }
  }

  /**
   * Leave room
   */
  @SubscribeMessage('room:leave')
  handleRoomLeave(client: Socket, data: { auctionId: string }) {
    client.leave(`auction:${data.auctionId}`);
    client.emit('room:left', { auctionId: data.auctionId });
  }

  /**
   * Submit bid
   */
  @SubscribeMessage('bid:submit')
  async handleBidSubmit(
    client: Socket,
    data: {
      auctionId: string;
      auctionPlayerId: string;
      auctionTeamId: string;
      amountMinor: string;
      idempotencyKey: string;
      stateVersion: number;
    }
  ) {
    try {
      const userId = client.data.userId;

      const result = await this.auctionsService.submitBid(
        data.auctionId,
        data.auctionPlayerId,
        data.auctionTeamId,
        BigInt(data.amountMinor),
        userId,
        data.idempotencyKey,
        data.stateVersion
      );

      // Only broadcast after the service (including transaction) completes successfully.
      // The submitter's idempotency key is echoed back on the broadcast so the
      // originating client can reconcile its optimistic entry by key.
      if (result.accepted) {
        this.broadcaster.broadcastBidAccepted(data.auctionId, {
          bidId: result.id,
          teamId: data.auctionTeamId,
          auctionPlayerId: data.auctionPlayerId,
          amountMinor: data.amountMinor,
          sequence: result.sequence,
          stateVersion: result.stateVersion,
          idempotencyKey: data.idempotencyKey,
        });
      } else {
        this.broadcaster.broadcastBidRejected(data.auctionId, {
          bidId: result.id,
          reason: result.reason,
          idempotencyKey: data.idempotencyKey,
        });

        client.emit('bid:rejected', {
          bidId: result.id,
          reason: result.reason,
          idempotencyKey: data.idempotencyKey,
        });
      }
    } catch (error) {
      client.emit('bid:error', {
        error: (error as any).message,
        idempotencyKey: data.idempotencyKey,
      });
    }
  }

  /**
   * Request fresh snapshot
   */
  @SubscribeMessage('auction:request-snapshot')
  async handleSnapshotRequest(client: Socket, data: { auctionId: string }) {
    try {
      const userId = client.data.userId;

      const snapshot = await this.snapshotService.generateSnapshotForRole(
        data.auctionId,
        userId,
        'PARTICIPANT'
      );

      client.emit('room:snapshot', snapshot);
    } catch (error) {
      client.emit('snapshot:error', { error: (error as any).message });
    }
  }

  /**
   * Broadcast event to room (called from services)
   */
  broadcastToRoom(auctionId: string, eventName: string, payload: any) {
    this.server.to(`auction:${auctionId}`).emit(eventName, payload);
  }

  /**
   * Broadcast to all users in an auction
   */
  broadcastPlayerSold(auctionId: string, event: any) {
    this.server.to(`auction:${auctionId}`).emit('player:sold', event);
  }

  /**
   * Broadcast that a new player has been introduced (set active). Clients
   * reconcile the active player by requesting a fresh snapshot, so the next
   * player advances live during the auction instead of only on reconnect.
   */
  broadcastPlayerIntroduced(auctionId: string, event: any) {
    this.server.to(`auction:${auctionId}`).emit('player:introduced', event);
  }

  /**
   * Broadcast break started
   */
  broadcastBreakStarted(auctionId: string, durationSeconds: number) {
    this.server.to(`auction:${auctionId}`).emit('break:started', { durationSeconds });
  }

  /**
   * Broadcast break ended
   */
  broadcastBreakEnded(auctionId: string) {
    this.server.to(`auction:${auctionId}`).emit('break:ended', {});
  }

  /**
   * Broadcast countdown update
   */
  broadcastCountdownUpdate(auctionId: string, secondsRemaining: number) {
    this.server.to(`auction:${auctionId}`).emit('countdown:update', { secondsRemaining });
  }
}
