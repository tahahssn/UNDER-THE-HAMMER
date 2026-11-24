import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { RoomsRepository } from './rooms.repository';
import { RoomAllocationService } from './services/room-allocation.service';
import { RoomAccessService } from './services/room-access.service';
import { RoomConfigurationService } from './services/room-configuration.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { RoomSettingsConfigDto, RoomDetailDto } from '../../contracts/src/rooms.contract';

/**
 * Manages room lifecycle and member management.
 * Backend authority: room state, member permissions, settings.
 */
@Injectable()
export class RoomsService {
  constructor(
    private readonly repo: RoomsRepository,
    private readonly allocationService: RoomAllocationService,
    private readonly accessService: RoomAccessService,
    private readonly configService: RoomConfigurationService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Create a new room with initial configuration.
   * - Verifies user has active subscription
   * - Validates configuration
   * - Creates room, settings, and access policy atomically
   */
  async createRoom(input: {
    hostId: string;
    tournamentId?: string;
    name: string;
    visibility: 'PUBLIC' | 'PRIVATE';
    listed: boolean;
    config: RoomSettingsConfigDto;
  }): Promise<RoomDetailDto> {
    // Check subscription entitlement
    const canHost = await this.subscriptionsService.canUserHost(input.hostId);
    if (!canHost) {
      throw new ForbiddenException('User must have active subscription to host a room');
    }

    // Check room limits
    const limits = await this.subscriptionsService.getRoomLimits(input.hostId);
    const activeRoomCount = await this.repo.listPublicRooms({
      visibility: 'PUBLIC', // Count all rooms for now
      skip: 0,
      take: 1000, // High number to get count
    });

    if (activeRoomCount.total >= limits.maxActiveRooms) {
      throw new BadRequestException(
        `You have reached the maximum number of active rooms (${limits.maxActiveRooms})`,
      );
    }

    // Validate configuration
    this.configService.validateConfiguration(input.config);

    // Check team count is within subscription limit
    if (input.config.teamCount > limits.maxTeamsPerRoom) {
      throw new BadRequestException(
        `Your subscription allows maximum ${limits.maxTeamsPerRoom} teams per room`,
      );
    }

    // Create snapshot of configuration
    const configSnapshot = this.configService.createConfigSnapshot(input.config);

    // Create room with defaults
    const result = await this.repo.createRoomWithSettings({
      hostId: input.hostId,
      tournamentId: input.tournamentId,
      name: input.name,
      visibility: input.visibility,
      listed: input.listed && input.visibility === 'PUBLIC', // Can only list PUBLIC rooms
      config: configSnapshot,
      accessPolicy: {
        joinPolicy: 'FIRST_COME_FIRST_SERVED',
        spectatorPolicy: 'PUBLIC',
        teamOwnerCapacity: input.config.teamCount,
        spectatorCapacity: limits.maxSpectatorsPerRoom,
        lateJoinPolicy: 'DISALLOWED',
        spectatorChatEnabled: false,
        externalLinksEnabled: false,
      },
    });

    return this.formatRoomDetail(result.room);
  }

  /**
   * Get room detail (with access check)
   */
  async getRoomDetail(roomId: string, userId?: string): Promise<RoomDetailDto> {
    // Check if user can view this room
    if (userId && !(await this.accessService.canUserViewRoom(userId, roomId))) {
      throw new ForbiddenException('You do not have permission to view this room');
    }

    const room = await this.repo.getRoomWithDetails(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return this.formatRoomDetailFull(room);
  }

  /**
   * List public rooms (discovery)
   */
  async listPublicRooms(filters: {
    visibility?: string;
    status?: string;
    skip: number;
    take: number;
  }) {
    const { items, total } = await this.repo.listPublicRooms({
      visibility: filters.visibility || 'PUBLIC',
      status: filters.status,
      skip: filters.skip,
      take: filters.take,
    });

    return {
      rooms: items.map((r: any) => this.formatRoom(r)),
      total,
      hasMore: filters.skip + filters.take < total,
    };
  }

  /**
   * List user's rooms (created or joined)
   */
  async getUserRooms(userId: string, skip: number, take: number) {
    const { items, total } = await this.repo.getUserRooms(userId, skip, take);

    return {
      rooms: items.map((r: any) => this.formatRoom(r)),
      total,
      hasMore: skip + take < total,
    };
  }

  /**
   * Update room settings (host only, before LIVE status)
   */
  async updateRoomSettings(roomId: string, userId: string, newConfig: RoomSettingsConfigDto) {
    // Check authorization
    const isHost = await this.repo.isRoomHost(roomId, userId);
    if (!isHost) {
      throw new ForbiddenException('Only the room host can update settings');
    }

    // Check room status
    const room = await this.repo.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (!this.configService.canModifyConfiguration(room.status)) {
      throw new BadRequestException(`Cannot modify settings for room in ${room.status} status`);
    }

    // Validate new configuration
    this.configService.validateConfiguration(newConfig);

    // Update settings (creates new version)
    const updated = await this.repo.updateRoomSettings(roomId, newConfig);
    if (!updated) {
      throw new NotFoundException('Room not found');
    }

    return {
      version: updated.version,
      config: updated.config,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Delete room (host only)
   */
  async deleteRoom(roomId: string, userId: string): Promise<void> {
    // Check authorization
    const isHost = await this.repo.isRoomHost(roomId, userId);
    if (!isHost) {
      throw new ForbiddenException('Only the room host can delete this room');
    }

    // Check status
    const room = await this.repo.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.status === 'LIVE' || room.status === 'COMPLETED') {
      throw new BadRequestException(`Cannot delete room in ${room.status} status`);
    }

    await this.repo.deleteRoom(roomId);
  }

  /**
   * Format room for list response
   */
  private formatRoom(room: any) {
    return {
      id: room.id,
      tournamentId: room.tournamentId || null,
      hostId: room.hostId,
      name: room.name,
      status: room.status,
      visibility: room.visibility,
      listed: room.listed,
      currentSettingsVersion: room.currentSettingsVersion,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      host: room.host
        ? {
            id: room.host.id,
            email: room.host.email,
            displayName: room.host.profile?.displayName || room.host.email,
          }
        : undefined,
      memberCount: room._count?.members || 0,
    };
  }

  /**
   * Format room for detail response (simple version)
   */
  private formatRoomDetail(room: any) {
    return {
      id: room.id,
      tournamentId: room.tournamentId || null,
      hostId: room.hostId,
      name: room.name,
      status: room.status,
      visibility: room.visibility,
      listed: room.listed,
      currentSettingsVersion: room.currentSettingsVersion,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    };
  }

  /**
   * Format room for detail response (full version)
   */
  private formatRoomDetailFull(room: any) {
    return {
      id: room.id,
      tournamentId: room.tournamentId || null,
      hostId: room.hostId,
      name: room.name,
      status: room.status,
      visibility: room.visibility,
      listed: room.listed,
      currentSettingsVersion: room.currentSettingsVersion,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      host: room.host
        ? {
            id: room.host.id,
            email: room.host.email,
            displayName: room.host.profile?.displayName || room.host.email,
          }
        : undefined,
      accessPolicy: room.accessPolicy,
      settings: room.settings?.[0],
      members: room.members?.map((m: any) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt.toISOString(),
        leftAt: m.leftAt?.toISOString() || null,
        user: m.user
          ? {
              id: m.user.id,
              email: m.user.email,
              displayName: m.user.profile?.displayName || m.user.email,
            }
          : undefined,
      })),
    };
  }
}
