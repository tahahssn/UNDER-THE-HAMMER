import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { RoomInvitationsRepository } from './room-invitations.repository';
import { RoomsRepository } from '../rooms/rooms.repository';

/**
 * Manages room invitation codes.
 * - Generate codes for joining rooms
 * - Validate and use codes
 * - Track usage and expiry
 */
@Injectable()
export class RoomInvitationsService {
  constructor(
    private readonly repo: RoomInvitationsRepository,
    private readonly roomsRepo: RoomsRepository,
  ) {}

  /**
   * Generate an invitation code for a room
   */
  async generateCode(input: {
    roomId: string;
    createdById: string;
    role: string;
    expiresAt?: Date;
    maxUses?: number;
  }): Promise<{ code: string; expiresAt?: string; maxUses?: number }> {
    // Verify room exists
    const room = await this.roomsRepo.getRoomById(input.roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Verify creator is the host
    if (room.hostId !== input.createdById) {
      throw new ConflictException('Only the room host can generate invitation codes');
    }

    // Generate and hash code
    const plainCode = this.repo.generateCode();
    const codeHash = this.repo.hashCode(plainCode);

    // Create invitation
    const invitation = await this.repo.createInvitation({
      roomId: input.roomId,
      createdById: input.createdById,
      role: input.role,
      codeHash,
      expiresAt: input.expiresAt,
      maxUses: input.maxUses,
    });

    return {
      code: plainCode, // Show plain code once at creation
      expiresAt: invitation.expiresAt?.toISOString(),
      maxUses: invitation.maxUses ?? undefined,
    };
  }

  /**
   * Validate and use an invitation code
   * Returns room details if valid
   */
  async validateAndUseCode(code: string, userId: string) {
    // Hash the code
    const codeHash = this.repo.hashCode(code);

    // Find invitation
    const invitation = await this.repo.findByCodeHash(codeHash);
    if (!invitation) {
      throw new BadRequestException('Invalid invitation code');
    }

    // Check validity
    if (!this.repo.isInvitationValid(invitation)) {
      throw new BadRequestException('Invitation code has expired or reached max uses');
    }

    // Increment use count (atomic update)
    await this.repo.incrementUseCount(invitation.id);

    return {
      roomId: invitation.roomId,
      role: invitation.role,
      room: {
        id: invitation.room.id,
        name: invitation.room.name,
        visibility: invitation.room.visibility,
      },
    };
  }

  /**
   * Format invitation for API response
   */
  formatInvitation(inv: any) {
    return {
      id: inv.id,
      roomId: inv.roomId,
      createdById: inv.createdById,
      inviteeUserId: inv.inviteeUserId,
      role: inv.role,
      expiresAt: inv.expiresAt?.toISOString() || null,
      revokedAt: inv.revokedAt?.toISOString() || null,
      maxUses: inv.maxUses,
      useCount: inv.useCount,
      createdAt: inv.createdAt.toISOString(),
      creator: inv.creator
        ? {
            id: inv.creator.id,
            email: inv.creator.email,
          }
        : undefined,
      invitee: inv.invitee
        ? {
            id: inv.invitee.id,
            email: inv.invitee.email,
          }
        : undefined,
    };
  }
}
