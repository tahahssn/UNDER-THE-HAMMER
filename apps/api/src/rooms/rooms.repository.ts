import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RoomSettingsConfigDto } from '../../contracts/src/rooms.contract';

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new room with initial settings.
   * Uses a transaction to ensure atomicity: room + settings + access policy are created together.
   */
  async createRoomWithSettings(input: {
    hostId: string;
    tournamentId?: string;
    name: string;
    visibility: 'PUBLIC' | 'PRIVATE';
    listed: boolean;
    config: RoomSettingsConfigDto;
    accessPolicy: {
      joinPolicy: string;
      spectatorPolicy: string;
      teamOwnerCapacity: number;
      spectatorCapacity: number;
      lateJoinPolicy: string;
      spectatorChatEnabled: boolean;
      externalLinksEnabled: boolean;
    };
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Create room
      const room = await tx.auctionRoom.create({
        data: {
          hostId: input.hostId,
          tournamentId: input.tournamentId,
          name: input.name,
          visibility: input.visibility,
          listed: input.listed,
          currentSettingsVersion: 1,
        },
      });

      // Create initial settings (version 1)
      const settings = await tx.roomSettings.create({
        data: {
          roomId: room.id,
          version: 1,
          config: input.config,
        },
      });

      // Create access policy
      const accessPolicy = await tx.roomAccessPolicy.create({
        data: {
          roomId: room.id,
          ...input.accessPolicy,
        },
      });

      // Add host as HOST member
      const hostMember = await tx.roomMember.create({
        data: {
          roomId: room.id,
          userId: input.hostId,
          role: 'HOST',
          status: 'ACTIVE',
        },
      });

      return {
        room,
        settings,
        accessPolicy,
        hostMember,
      };
    });
  }

  /**
   * Find room by ID with optional relations
   */
  async getRoomWithDetails(roomId: string) {
    return this.prisma.auctionRoom.findUnique({
      where: { id: roomId },
      include: {
        host: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        tournament: true,
        accessPolicy: true,
        settings: {
          where: { version: { equals: -1 } }, // Current version placeholder
          take: 1,
          orderBy: { version: 'desc' },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: { select: { displayName: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find room by ID (simple query)
   */
  async getRoomById(roomId: string) {
    return this.prisma.auctionRoom.findUnique({
      where: { id: roomId },
    });
  }

  /**
   * Find rooms by visibility and status (public discovery)
   */
  async listPublicRooms(filters: { visibility: string; status?: string; skip: number; take: number }) {
    const [items, total] = await Promise.all([
      this.prisma.auctionRoom.findMany({
        where: {
          visibility: filters.visibility,
          status: filters.status ? filters.status : undefined,
          listed: true,
        },
        include: {
          host: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: filters.skip,
        take: filters.take,
      }),
      this.prisma.auctionRoom.count({
        where: {
          visibility: filters.visibility,
          status: filters.status ? filters.status : undefined,
          listed: true,
        },
      }),
    ]);

    return { items, total };
  }

  /**
   * Find rooms where user is a member or host
   */
  async getUserRooms(userId: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.auctionRoom.findMany({
        where: {
          OR: [
            { hostId: userId },
            {
              members: {
                some: {
                  userId,
                  status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
                },
              },
            },
          ],
        },
        include: {
          host: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } },
            },
          },
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auctionRoom.count({
        where: {
          OR: [
            { hostId: userId },
            {
              members: {
                some: {
                  userId,
                  status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
                },
              },
            },
          ],
        },
      }),
    ]);

    return { items, total };
  }

  /**
   * Check if a user is the host of a room
   */
  async isRoomHost(roomId: string, userId: string): Promise<boolean> {
    const room = await this.prisma.auctionRoom.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });

    return room?.hostId === userId;
  }

  /**
   * Check if a user is a member of a room with a specific role
   */
  async getRoomMember(roomId: string, userId: string) {
    return this.prisma.roomMember.findUnique({
      where: {
        roomId_userId_role: {
          roomId,
          userId,
          role: 'TEAM_OWNER', // For now, check team owner role
        },
      },
    });
  }

  /**
   * Get all members of a room
   */
  async getRoomMembers(roomId: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.roomMember.findMany({
        where: { roomId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } },
            },
          },
        },
        skip,
        take,
      }),
      this.prisma.roomMember.count({ where: { roomId } }),
    ]);

    return { items, total };
  }

  /**
   * Add a member to a room (transaction-safe)
   */
  async addRoomMember(input: {
    roomId: string;
    userId: string;
    role: string;
    status?: string;
  }) {
    return this.prisma.roomMember.create({
      data: {
        roomId: input.roomId,
        userId: input.userId,
        role: input.role,
        status: input.status || 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
  }

  /**
   * Update room settings
   */
  async updateRoomSettings(roomId: string, newConfig: RoomSettingsConfigDto) {
    return this.prisma.$transaction(async (tx) => {
      // Get current room to increment version
      const room = await tx.auctionRoom.findUnique({
        where: { id: roomId },
        select: { currentSettingsVersion: true },
      });

      if (!room) return null;

      const nextVersion = room.currentSettingsVersion + 1;

      // Create new settings version
      const newSettings = await tx.roomSettings.create({
        data: {
          roomId,
          version: nextVersion,
          config: newConfig,
        },
      });

      // Update room's currentSettingsVersion
      await tx.auctionRoom.update({
        where: { id: roomId },
        data: { currentSettingsVersion: nextVersion },
      });

      return newSettings;
    });
  }

  /**
   * Get current settings for a room
   */
  async getCurrentSettings(roomId: string) {
    return this.prisma.roomSettings.findFirst({
      where: { roomId },
      orderBy: { version: 'desc' },
      take: 1,
    });
  }

  /**
   * Check if a user is banned from a room
   */
  async isUserBanned(roomId: string, userId: string): Promise<boolean> {
    const ban = await this.prisma.roomBan.findFirst({
      where: {
        roomId,
        userId,
        liftedAt: null,
      },
    });

    return !!ban;
  }

  /**
   * Get access policy for a room
   */
  async getAccessPolicy(roomId: string) {
    return this.prisma.roomAccessPolicy.findUnique({
      where: { roomId },
    });
  }

  /**
   * Delete room (cascade deletes related data)
   */
  async deleteRoom(roomId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Soft delete by marking as CANCELLED
      return tx.auctionRoom.update({
        where: { id: roomId },
        data: { status: 'CANCELLED' },
      });
    });
  }
}
