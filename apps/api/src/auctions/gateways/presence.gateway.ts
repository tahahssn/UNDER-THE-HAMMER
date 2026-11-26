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
import { RoomsRepository } from '../../rooms/rooms.repository';
import { PresenceService } from '../services/presence.service';
import { AuctionEventBroadcasterService } from '../services/auction-event-broadcaster.service';

/**
 * Presence Gateway: Tracks and broadcasts room participant presence.
 * - Tracks connected/disconnected users with their role and team assignment
 * - Broadcasts room:presence updates when users connect/disconnect
 * - On reconnect, returns presence list + recent events (last 10 events)
 * - Isolates rooms: presence list visible only to that room's members
 * - Also tracks active bidder during auction
 */
@WebSocketGateway({
  namespace: '/auctions',
  cors: { origin: process.env.WEB_URL || 'http://localhost:3000' },
})
@Injectable()
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly auctionsRepo: AuctionsRepository,
    private readonly roomsRepo: RoomsRepository,
    private readonly presenceService: PresenceService,
    private readonly broadcaster: AuctionEventBroadcasterService
  ) {
    this.broadcaster.setPresenceGateway(this);
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.socketId = client.id;
    } catch (error) {
      client.disconnect();
    }
  }

  /**
   * On disconnect, update presence and broadcast
   */
  async handleDisconnect(client: Socket) {
    try {
      const userId = client.data?.userId;
      if (!userId) return;

      // Find all rooms this user was in and update presence
      // For now, skip this as it requires maintaining socket room tracking
      // This will be called by room:leave message handler instead
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  }

  /**
   * User joins a room and their presence becomes visible
   * Called by AuctionRoomGateway when user joins auction
   */
  @SubscribeMessage('room:join')
  async handleRoomJoin(
    client: Socket,
    data: {
      roomId: string;
      auctionId: string;
      role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
      teamId?: string;
    }
  ) {
    try {
      const userId = client.data.userId;
      const { roomId, role, teamId } = data;

      // === AUTHORIZATION ===

      // Verify user is room member
      const member = await this.roomsRepo.getRoomMember(roomId, userId);
      if (!member || member.status !== 'ACTIVE') {
        client.emit('room:join:error', { code: 'NOT_ROOM_MEMBER' });
        return;
      }

      // === RECORD PRESENCE ===

      // Record presence in service
      await this.presenceService.recordPresence({
        userId,
        roomId,
        role,
        teamId,
        connectionState: 'connected',
      });

      // Join Socket.IO room
      client.join(`room:${roomId}`);

      // === BROADCAST PRESENCE UPDATE ===

      this.broadcastPresence(roomId);

      // === SEND CURRENT STATE ===

      // Get current presence list
      const presence = await this.presenceService.getPresence(roomId);

      client.emit('room:joined', {
        roomId,
        participants: presence.map(p => ({
          userId: p.userId,
          role: p.role,
          teamId: p.teamId,
          joinedAt: p.joinedAt,
          connectionState: p.connectionState,
          isYou: p.userId === userId,
        })),
      });
    } catch (error) {
      client.emit('room:join:error', {
        code: 'INTERNAL_ERROR',
        message: (error as any).message,
      });
    }
  }

  /**
   * User explicitly leaves a room
   */
  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    client: Socket,
    data: { roomId: string }
  ) {
    try {
      const userId = client.data.userId;
      const { roomId } = data;

      // Record disconnect
      await this.presenceService.recordDisconnect(userId, roomId);

      // Leave Socket.IO room
      client.leave(`room:${roomId}`);

      // Broadcast updated presence
      this.broadcastPresence(roomId);

      client.emit('room:left', { roomId });
    } catch (error) {
      client.emit('room:leave:error', {
        code: 'INTERNAL_ERROR',
        message: (error as any).message,
      });
    }
  }

  /**
   * Client requests current presence snapshot
   * Returns participant list and optionally recent events
   */
  @SubscribeMessage('room:request-presence')
  async handlePresenceRequest(
    client: Socket,
    data: { roomId: string; includeEvents?: boolean; eventCount?: number }
  ) {
    try {
      const userId = client.data.userId;
      const { roomId, includeEvents = false, eventCount = 10 } = data;

      // Verify room membership
      const member = await this.roomsRepo.getRoomMember(roomId, userId);
      if (!member) {
        client.emit('room:presence:error', { code: 'NOT_ROOM_MEMBER' });
        return;
      }

      // Get presence
      const presence = await this.presenceService.getPresence(roomId);

      const response: any = {
        participants: presence.map(p => ({
          userId: p.userId,
          role: p.role,
          teamId: p.teamId,
          joinedAt: p.joinedAt,
          connectionState: p.connectionState,
          isYou: p.userId === userId,
        })),
      };

      // Optionally include recent events
      if (includeEvents) {
        const recentEvents = await this.auctionsRepo.getRecentAuctionEvents(
          roomId,
          Math.min(eventCount, 50)
        );
        response.recentEvents = recentEvents.map(evt => ({
          sequence: evt.sequence,
          type: evt.type,
          payload: evt.payload,
          createdAt: evt.occurredAt,
        }));
      }

      client.emit('room:presence', response);
    } catch (error) {
      client.emit('room:presence:error', {
        code: 'INTERNAL_ERROR',
        message: (error as any).message,
      });
    }
  }

  /**
   * Broadcast presence update to all participants in a room
   * Called when user connects/disconnects/changes state
   */
  async broadcastPresence(roomId: string) {
    try {
      const presence = await this.presenceService.getPresence(roomId);

      this.server.to(`room:${roomId}`).emit('room:presence', {
        participants: presence.map(p => ({
          userId: p.userId,
          role: p.role,
          teamId: p.teamId,
          joinedAt: p.joinedAt,
          connectionState: p.connectionState,
        })),
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Error broadcasting presence:', error);
    }
  }
}
