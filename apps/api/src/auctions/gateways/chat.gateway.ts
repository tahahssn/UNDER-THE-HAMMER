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
import { PrismaService } from '../../prisma/prisma.service';
import { RoomsRepository } from '../../rooms/rooms.repository';
import { RoomChatService } from '../services/room-chat.service';
import { AuctionEventBroadcasterService } from '../services/auction-event-broadcaster.service';
import { CreateChatMessageDtoSchema } from '../dto/realtime.dto';

/**
 * Chat Gateway: Manages real-time room chat with moderation support.
 * - Accepts chat:send messages from authenticated room members
 * - Validates: user authentication, room membership, rate limits, message length
 * - Broadcasts chat:message events to room (all participants can see)
 * - Supports moderation: host can mute/unmute users
 * - Messages can be held for moderation review (visible only to moderators and sender)
 * - No client-selected channels; room determined server-side from JWT + membership
 * 
 * CONSTRAINTS & RECOVERY:
 * - Rate limiting (10 messages/min per user/room) is in-memory only
 * - On service restart, all rate limit windows are discarded
 * - For high-availability deployments, use Redis-backed rate limiting
 * - In-memory rate limit Map: messageRateLimits
 */
@WebSocketGateway({
  namespace: '/auctions',
  cors: { origin: process.env.WEB_URL || 'http://localhost:3000' },
})
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Rate limiting: track messages per user per room (userId:roomId -> { count, resetTime })
  private messageRateLimits = new Map<string, { count: number; resetTime: number }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly roomsRepo: RoomsRepository,
    private readonly chatService: RoomChatService,
    private readonly prisma: PrismaService,
    private readonly broadcaster: AuctionEventBroadcasterService
  ) {
    this.broadcaster.setChatGateway(this);
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
   * User sends a chat message to room
   * Message is validated, persisted, and broadcast to all room members
   */
  @SubscribeMessage('chat:send')
  async handleChatSend(
    client: Socket,
    data: any
  ) {
    try {
      const userId = client.data.userId;

      // === ZOD VALIDATION ===
      const validationResult = CreateChatMessageDtoSchema.safeParse(data);
      if (!validationResult.success) {
        client.emit('chat:send:error', { code: 'INVALID_REQUEST', details: validationResult.error.errors });
        return;
      }

      const { roomId, message } = validationResult.data;

      // === AUTHORIZATION ===

      // 1. Verify user is authenticated
      if (!userId) {
        client.emit('chat:send:error', { code: 'UNAUTHORIZED' });
        return;
      }

      // 2. Verify room exists and user is member
      const room = await this.roomsRepo.getRoomById(roomId);
      if (!room) {
        client.emit('chat:send:error', { code: 'ROOM_NOT_FOUND' });
        return;
      }

      const member = await this.roomsRepo.getRoomMember(roomId, userId);
      if (!member || member.status !== 'ACTIVE') {
        client.emit('chat:send:error', { code: 'NOT_ROOM_MEMBER' });
        return;
      }

      // 3. Check if user is muted
      const muteAction = await this.prisma.chatModerationAction.findFirst({
        where: {
          roomId,
          targetUserId: userId,
          type: 'MUTE',
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (muteAction) {
        client.emit('chat:send:error', { code: 'USER_MUTED' });
        return;
      }

      // 4. Rate limit: 10 messages/min per user per room
      const rateLimitKey = `${userId}:${roomId}`;
      const now = Date.now();
      const limit = this.messageRateLimits.get(rateLimitKey);

      if (limit) {
        if (now < limit.resetTime) {
          if (limit.count >= 10) {
            client.emit('chat:send:error', { code: 'RATE_LIMITED' });
            return;
          }
          limit.count++;
        } else {
          this.messageRateLimits.set(rateLimitKey, { count: 1, resetTime: now + 60000 });
        }
      } else {
        this.messageRateLimits.set(rateLimitKey, { count: 1, resetTime: now + 60000 });
      }

      // === SAVE MESSAGE ===
      const savedMessage = await this.chatService.createMessage({
        roomId,
        authorId: userId,
        body: message,
      });

      // === BROADCAST ===
      this.broadcastChatMessage(roomId, {
        messageId: savedMessage.id,
        from: userId,
        message: message,
        timestamp: savedMessage.createdAt,
        // Map status to isModerationHeld: only show as held if status indicates it
        isModerationHeld: savedMessage.status === 'HELD',
        // Include author display info for UI
        authorRole: member.role,
      });
    } catch (error) {
      client.emit('chat:send:error', {
        code: 'INTERNAL_ERROR',
        message: (error as any).message,
      });
    }
  }

  /**
   * Host mutes a user in the room
   * Prevents user from sending messages for specified duration
   */
  @SubscribeMessage('chat:mute-user')
  async handleMuteUser(
    client: Socket,
    data: {
      roomId: string;
      targetUserId: string;
      durationSeconds?: number;
      reason?: string;
    }
  ) {
    try {
      const userId = client.data.userId;
      const { roomId, targetUserId, durationSeconds = 300, reason } = data;

      // Authorize: only room host can mute
      const room = await this.roomsRepo.getRoomById(roomId);
      if (!room || room.hostId !== userId) {
        client.emit('chat:mute-user:error', { code: 'UNAUTHORIZED' });
        return;
      }

      // Verify target is room member
      const targetMember = await this.roomsRepo.getRoomMember(roomId, targetUserId);
      if (!targetMember) {
        client.emit('chat:mute-user:error', { code: 'TARGET_NOT_MEMBER' });
        return;
      }

      // Create mute action
      const expiresAt = new Date(Date.now() + durationSeconds * 1000);
      await this.prisma.chatModerationAction.create({
        data: {
          roomId,
          actorId: userId,
          type: 'MUTE',
          targetUserId,
          reason,
          expiresAt,
        },
      });

      // Broadcast mute event
      this.broadcastMuteEvent(roomId, {
        targetUserId,
        expiresAt,
        reason,
      });

      client.emit('chat:mute-user:ok', { targetUserId, expiresAt });
    } catch (error) {
      client.emit('chat:mute-user:error', {
        code: 'INTERNAL_ERROR',
        message: (error as any).message,
      });
    }
  }

  /**
   * Host unmutes a user
   */
  @SubscribeMessage('chat:unmute-user')
  async handleUnmuteUser(
    client: Socket,
    data: {
      roomId: string;
      targetUserId: string;
    }
  ) {
    try {
      const userId = client.data.userId;
      const { roomId, targetUserId } = data;

      // Authorize: only room host
      const room = await this.roomsRepo.getRoomById(roomId);
      if (!room || room.hostId !== userId) {
        client.emit('chat:unmute-user:error', { code: 'UNAUTHORIZED' });
        return;
      }

      // Remove active mute
      await this.prisma.chatModerationAction.updateMany({
        where: {
          roomId,
          targetUserId,
          type: 'MUTE',
          expiresAt: { gt: new Date() },
        },
        data: {
          expiresAt: new Date(), // Expire immediately
        },
      });

      // Broadcast unmute event
      this.broadcastUnmuteEvent(roomId, { targetUserId });

      client.emit('chat:unmute-user:ok', { targetUserId });
    } catch (error) {
      client.emit('chat:unmute-user:error', {
        code: 'INTERNAL_ERROR',
        message: (error as any).message,
      });
    }
  }

  /**
   * Client requests recent message history
   * Returns last N messages that user has permission to see
   */
  @SubscribeMessage('chat:request-history')
  async handleChatHistoryRequest(
    client: Socket,
    data: any
  ) {
    try {
      const userId = client.data.userId;

      // === ZOD VALIDATION ===
      const { ChatHistoryRequestSchema } = await import('../dto/realtime.dto');
      const validationResult = ChatHistoryRequestSchema.safeParse(data);
      if (!validationResult.success) {
        client.emit('chat:history:error', { code: 'INVALID_REQUEST' });
        return;
      }

      const { roomId, limit = 50 } = validationResult.data;

      // Verify room membership
      const member = await this.roomsRepo.getRoomMember(roomId, userId);
      if (!member) {
        client.emit('chat:history:error', { code: 'NOT_ROOM_MEMBER' });
        return;
      }

      // Fetch message history
      const messages = await this.chatService.getMessageHistory(
        roomId,
        Math.min(limit, 100) // Cap at 100 for efficiency
      );

      // Filter moderation-held messages (only visible to moderators and sender)
      const isHost = await this.roomsRepo.getRoomById(roomId).then(r => r?.hostId === userId);
      const filteredMessages = messages
        .filter(msg => {
          if (msg.status === 'HELD' && !isHost && msg.authorId !== userId) {
            return false; // Hide from non-moderators and non-authors
          }
          return true;
        })
        .map(msg => ({
          messageId: msg.id,
          from: msg.authorId,
          message: msg.body,
          timestamp: msg.createdAt,
          isModerationHeld: msg.status === 'HELD',
        }));

      client.emit('chat:history', { messages: filteredMessages });
    } catch (error) {
      client.emit('chat:history:error', {
        code: 'INTERNAL_ERROR',
        message: (error as any).message,
      });
    }
  }

  /**
   * Broadcast chat message to all room members
   * Called after message is persisted to database
   */
  broadcastChatMessage(roomId: string, payload: any) {
    this.server.to(`room:${roomId}`).emit('chat:message', {
      ...payload,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast mute event
   */
  broadcastMuteEvent(roomId: string, payload: any) {
    this.server.to(`room:${roomId}`).emit('chat:user-muted', {
      ...payload,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast unmute event
   */
  broadcastUnmuteEvent(roomId: string, payload: any) {
    this.server.to(`room:${roomId}`).emit('chat:user-unmuted', {
      ...payload,
      timestamp: new Date(),
    });
  }
}
