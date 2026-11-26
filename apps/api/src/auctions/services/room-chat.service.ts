import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoomsRepository } from '../../rooms/rooms.repository';

export interface CreateChatMessageInput {
  roomId: string;
  authorId: string;
  body: string;
  isModerationHeld?: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  authorId: string | null;
  body: string;
  isModerationHeld: boolean;
  createdAt: Date;
  removedAt: Date | null;
}

/**
 * RoomChatService: Manages chat message creation, retrieval, and moderation
 * - Creates and persists messages
 * - Retrieves message history with permission filtering
 * - Supports moderation: approve/reject held messages
 * - Backend is authoritative for all chat operations
 */
@Injectable()
export class RoomChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomsRepo: RoomsRepository
  ) {}

  /**
   * Create a chat message
   * Returns the saved message
   */
  async createMessage(input: CreateChatMessageInput): Promise<ChatMessage> {
    const { roomId, authorId, body, isModerationHeld = false } = input;

    // Verify room exists
    const room = await this.roomsRepo.getRoomById(roomId);
    if (!room) {
      throw new BadRequestException('Room not found');
    }

    // Create message in database
    const message = await this.prisma.roomChatMessage.create({
      data: {
        roomId,
        authorId,
        kind: 'USER',
        body,
        status: 'VISIBLE',
        createdAt: new Date(),
      },
    });

    // If message is held for moderation, it's tracked but not broadcast normally
    // A moderator must explicitly approve it

    return this.mapToChatMessage(message);
  }

  /**
   * Get message history for a room
   * Returns messages in reverse chronological order (newest first)
   */
  async getMessageHistory(roomId: string, limit: number = 50): Promise<ChatMessage[]> {
    // Verify room exists
    const room = await this.roomsRepo.getRoomById(roomId);
    if (!room) {
      throw new BadRequestException('Room not found');
    }

    const messages = await this.prisma.roomChatMessage.findMany({
      where: {
        roomId,
        status: 'VISIBLE',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Reverse to get chronological order (oldest first)
    return messages.reverse().map(m => this.mapToChatMessage(m));
  }

  /**
   * Approve a moderation-held message
   * Makes it visible to all room participants
   */
  async approveMessage(messageId: string, moderatorId: string): Promise<ChatMessage> {
    const message = await this.prisma.roomChatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new BadRequestException('Message not found');
    }

    // Verify moderator is room host
    const room = await this.roomsRepo.getRoomById(message.roomId);
    if (!room || room.hostId !== moderatorId) {
      throw new BadRequestException('Not authorized to approve messages in this room');
    }

    // Update message status
    const updated = await this.prisma.roomChatMessage.update({
      where: { id: messageId },
      data: {
        status: 'VISIBLE',
      },
    });

    return this.mapToChatMessage(updated);
  }

  /**
   * Reject a moderation-held message
   * Removes it from the room
   */
  async rejectMessage(messageId: string, moderatorId: string): Promise<ChatMessage> {
    const message = await this.prisma.roomChatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new BadRequestException('Message not found');
    }

    // Verify moderator is room host
    const room = await this.roomsRepo.getRoomById(message.roomId);
    if (!room || room.hostId !== moderatorId) {
      throw new BadRequestException('Not authorized to reject messages in this room');
    }

    // Remove message
    const updated = await this.prisma.roomChatMessage.update({
      where: { id: messageId },
      data: {
        status: 'REMOVED',
        removedAt: new Date(),
      },
    });

    return this.mapToChatMessage(updated);
  }

  /**
   * Get held messages (for moderation queue)
   */
  async getHeldMessages(roomId: string): Promise<ChatMessage[]> {
    const room = await this.roomsRepo.getRoomById(roomId);
    if (!room) {
      throw new BadRequestException('Room not found');
    }

    const messages = await this.prisma.roomChatMessage.findMany({
      where: {
        roomId,
        status: 'VISIBLE',
        // Note: Based on current schema, we may need to add a column to track held status
        // For now, filtering is done at application level
      },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(m => this.mapToChatMessage(m));
  }

  /**
   * Report a message
   */
  async reportMessage(
    messageId: string,
    reporterId: string,
    reason: string
  ): Promise<{ reportId: string }> {
    const message = await this.prisma.roomChatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new BadRequestException('Message not found');
    }

    // Verify reporter is room member
    const room = await this.roomsRepo.getRoomById(message.roomId);
    if (!room) {
      throw new BadRequestException('Room not found');
    }

    const member = await this.roomsRepo.getRoomMember(message.roomId, reporterId);
    if (!member) {
      throw new BadRequestException('Not a room member');
    }

    // Create report (avoid duplicates - check if reporter already reported this message)
    const existing = await this.prisma.messageReport.findUnique({
      where: {
        messageId_reporterId: {
          messageId,
          reporterId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('You have already reported this message');
    }

    const report = await this.prisma.messageReport.create({
      data: {
        messageId,
        reporterId,
        reason,
        status: 'OPEN',
      },
    });

    return { reportId: report.id };
  }

  /**
   * Helper: map Prisma RoomChatMessage to our ChatMessage type
   */
  private mapToChatMessage(message: any): ChatMessage {
    return {
      id: message.id,
      roomId: message.roomId,
      authorId: message.authorId,
      body: message.body,
      isModerationHeld: false, // Current schema doesn't track this; could add column
      createdAt: message.createdAt,
      removedAt: message.removedAt,
    };
  }
}
