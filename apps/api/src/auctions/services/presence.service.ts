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
 * 
 * CONSTRAINTS & RECOVERY:
 * - In-memory presence is volatile: data loss occurs on service restart
 * - For high-availability deployments, consider persisting to Redis
 * - Recovery on startup attempts to restore from AuctionParticipantConnection
 *   but may have incomplete role/teamId data (not stored in that table)
 * - Rate limiting in ChatGateway is also in-memory only and resets on restart
 * - For distributed deployments, implement Redis-backed rate limiting
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
   * Attempts to restore in-memory state from AuctionParticipantConnection records
   * 
   * LIMITATION: role and teamId must be fetched from RoomMember table, as
   * AuctionParticipantConnection does not store these fields. This is a TODO
   * for future optimization.
   */
  async recoverRoomPresence(roomId: string): Promise<void> {
    try {
      const connections = await this.prisma.auctionParticipantConnection.findMany({
        where: {
          roomId,
          disconnectedAt: null,
        },
        include: {
          user: true,
        },
      });

      if (!this.roomParticipants.has(roomId)) {
        this.roomParticipants.set(roomId, new Map());
      }

      const roomMap = this.roomParticipants.get(roomId)!;

      // Restore participants from database
      for (const conn of connections) {
        // Attempt to fetch role and teamId from RoomMember
        const member = await this.prisma.roomMember.findUnique({
          where: {
            roomId_userId: {
              roomId,
              userId: conn.userId,
            },
          },
        });

        const participant: Participant = {
          userId: conn.userId,
          roomId,
          role: (member?.role as any) || 'SPECTATOR', // Fallback to SPECTATOR if not found
          teamId: member?.teamId || undefined,
          joinedAt: conn.connectedAt,
          connectionState: 'connected',
        };

        roomMap.set(conn.userId, participant);
      }
    } catch (error) {
      console.error(`Error recovering presence for room ${roomId}:`, error);
      // Continue without recovery rather than failing startup
    }
  }
}
