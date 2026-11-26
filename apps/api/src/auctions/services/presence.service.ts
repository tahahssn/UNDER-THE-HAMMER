import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface Participant {
  userId: string;
  roomId: string;
  role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  teamId?: string | null;
  joinedAt: Date;
  connectionState: 'connected' | 'reconnecting';
}

export interface RecordPresenceInput {
  userId: string;
  roomId: string;
  role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  teamId?: string;
  connectionState: 'connected' | 'reconnecting';
}

/**
 * PresenceService: Tracks real-time presence of auction room participants
 * - Records when users connect/disconnect
 * - Maintains in-memory participant list per room
 * - Isolates room visibility: users only see participants from their room
 * - Used by PresenceGateway to broadcast updates
 */
@Injectable()
export class PresenceService {
  // In-memory store: roomId -> Map<userId, Participant>
  private roomParticipants = new Map<string, Map<string, Participant>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record user presence when connecting to room
   */
  async recordPresence(input: RecordPresenceInput): Promise<Participant> {
    const { userId, roomId, role, teamId, connectionState } = input;

    const participant: Participant = {
      userId,
      roomId,
      role,
      teamId,
      joinedAt: new Date(),
      connectionState,
    };

    // Update in-memory store
    if (!this.roomParticipants.has(roomId)) {
      this.roomParticipants.set(roomId, new Map());
    }

    const roomMap = this.roomParticipants.get(roomId)!;
    roomMap.set(userId, participant);

    // Persist to database for audit/analytics
    await this.prisma.auctionParticipantConnection.create({
      data: {
        roomId,
        userId,
        socketId: '', // Will be set by gateway if needed
        connectedAt: new Date(),
      },
    });

    return participant;
  }

  /**
   * Record user disconnect from room
   */
  async recordDisconnect(userId: string, roomId: string): Promise<void> {
    // Remove from in-memory store
    const roomMap = this.roomParticipants.get(roomId);
    if (roomMap) {
      roomMap.delete(userId);
      if (roomMap.size === 0) {
        this.roomParticipants.delete(roomId);
      }
    }

    // Update database record
    await this.prisma.auctionParticipantConnection.updateMany({
      where: {
        roomId,
        userId,
        disconnectedAt: null,
      },
      data: {
        disconnectedAt: new Date(),
      },
    });
  }

  /**
   * Get current presence list for a room
   * Returns all connected participants
   */
  async getPresence(roomId: string): Promise<Participant[]> {
    const roomMap = this.roomParticipants.get(roomId);
    if (!roomMap) {
      return [];
    }

    return Array.from(roomMap.values());
  }

  /**
   * Get specific participant
   */
  async getParticipant(userId: string, roomId: string): Promise<Participant | null> {
    const roomMap = this.roomParticipants.get(roomId);
    if (!roomMap) {
      return null;
    }

    return roomMap.get(userId) || null;
  }

  /**
   * Check if user is present in room
   */
  async isParticipantConnected(userId: string, roomId: string): Promise<boolean> {
    const participant = await this.getParticipant(userId, roomId);
    return participant !== null;
  }

  /**
   * Get participant count for a room
   */
  async getParticipantCount(roomId: string): Promise<number> {
    const roomMap = this.roomParticipants.get(roomId);
    return roomMap ? roomMap.size : 0;
  }

  /**
   * Get participants by role
   */
  async getParticipantsByRole(
    roomId: string,
    role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR'
  ): Promise<Participant[]> {
    const roomMap = this.roomParticipants.get(roomId);
    if (!roomMap) {
      return [];
    }

    return Array.from(roomMap.values()).filter(p => p.role === role);
  }

  /**
   * Get participants by team
   */
  async getParticipantsByTeam(roomId: string, teamId: string): Promise<Participant[]> {
    const roomMap = this.roomParticipants.get(roomId);
    if (!roomMap) {
      return [];
    }

    return Array.from(roomMap.values()).filter(p => p.teamId === teamId);
  }

  /**
   * Clear all presence for a room (e.g., when auction ends)
   */
  async clearRoomPresence(roomId: string): Promise<void> {
    this.roomParticipants.delete(roomId);

    // Record disconnects in database
    await this.prisma.auctionParticipantConnection.updateMany({
      where: {
        roomId,
        disconnectedAt: null,
      },
      data: {
        disconnectedAt: new Date(),
      },
    });
  }

  /**
   * Recover presence from database on service startup
   * Useful if service crashes and restarts
   */
  async recoverRoomPresence(roomId: string): Promise<void> {
    const connections = await this.prisma.auctionParticipantConnection.findMany({
      where: {
        roomId,
        disconnectedAt: null,
      },
    });

    if (!this.roomParticipants.has(roomId)) {
      this.roomParticipants.set(roomId, new Map());
    }

    // Note: We don't have role/teamId in AuctionParticipantConnection model
    // This would need to be fetched from RoomMember table instead
    // For now, this is a placeholder for the recovery mechanism
  }
}
