import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoomsRepository } from '../rooms.repository';

/**
 * Manages room access control.
 * Authorizes user access based on room visibility, membership, and bans.
 */
@Injectable()
export class RoomAccessService {
  constructor(
    private readonly repo: RoomsRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Check if a user can view a room.
   * Public rooms: anyone can view
   * Private rooms: only members or host can view
   */
  async canUserViewRoom(userId: string, roomId: string): Promise<boolean> {
    const room = await this.repo.getRoomById(roomId);

    if (!room) {
      return false;
    }

    // Public rooms are always viewable
    if (room.visibility === 'PUBLIC') {
      return true;
    }

    // Private rooms: check if user is host or member
    return room.hostId === userId || (await this.isUserMember(userId, roomId));
  }

  /**
   * Check if a user can join a room as a team owner
   */
  async canUserJoinAsTeamOwner(userId: string, roomId: string): Promise<boolean> {
    // Check if banned
    if (await this.isUserBanned(userId, roomId)) {
      return false;
    }

    // Check if already a member (team owner)
    const member = await this.repo.getRoomMember(roomId, userId);
    if (member && member.status === 'ACTIVE') {
      return false; // Already a team owner
    }

    return true;
  }

  /**
   * Check if a user can join a room as a spectator
   */
  async canUserJoinAsSpectator(userId: string, roomId: string): Promise<boolean> {
    // Check if banned
    if (await this.isUserBanned(userId, roomId)) {
      return false;
    }

    // Check if already a member
    const existing = await this.prisma?.roomMember.findFirst({
      where: { roomId, userId },
    });

    if (existing && existing.status === 'ACTIVE') {
      return false; // Already a member
    }

    return true;
  }

  /**
   * Check if a user is banned from a room
   */
  async isUserBanned(userId: string, roomId: string): Promise<boolean> {
    return this.repo.isUserBanned(roomId, userId);
  }

  /**
   * Check if a user is a member of a room (any role except BANNED)
   */
  private async isUserMember(userId: string, roomId: string): Promise<boolean> {
    const member = await this.repo.getRoomMember(roomId, userId);
    return !!member && member.status !== 'BANNED';
  }

  /**
   * Check if user is the host of a room
   */
  async isRoomHost(userId: string, roomId: string): Promise<boolean> {
    return this.repo.isRoomHost(roomId, userId);
  }
}
