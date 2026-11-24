import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class RoomInvitationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hash an invitation code for storage
   */
  hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Generate a random code
   */
  generateCode(): string {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
  }

  /**
   * Create an invitation
   */
  async createInvitation(input: {
    roomId: string;
    createdById: string;
    inviteeUserId?: string;
    role: string;
    codeHash: string;
    expiresAt?: Date;
    maxUses?: number;
  }) {
    return this.prisma.roomInvitation.create({
      data: {
        roomId: input.roomId,
        createdById: input.createdById,
        inviteeUserId: input.inviteeUserId,
        role: input.role,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses,
        useCount: 0,
      },
    });
  }

  /**
   * Find invitation by code hash
   */
  async findByCodeHash(codeHash: string) {
    return this.prisma.roomInvitation.findUnique({
      where: { codeHash },
      include: {
        room: true,
        creator: { select: { id: true, email: true } },
      },
    });
  }

  /**
   * Check if invitation is still valid
   */
  isInvitationValid(invitation: any): boolean {
    // Check if revoked
    if (invitation.revokedAt) {
      return false;
    }

    // Check if expired
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      return false;
    }

    // Check max uses
    if (invitation.maxUses && invitation.useCount >= invitation.maxUses) {
      return false;
    }

    return true;
  }

  /**
   * Increment invitation use count
   */
  async incrementUseCount(invitationId: string) {
    return this.prisma.roomInvitation.update({
      where: { id: invitationId },
      data: {
        useCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * List invitations for a room
   */
  async listRoomInvitations(roomId: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.roomInvitation.findMany({
        where: { roomId },
        include: {
          creator: { select: { id: true, email: true } },
          invitee: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.roomInvitation.count({ where: { roomId } }),
    ]);

    return { items, total };
  }

  /**
   * Revoke an invitation
   */
  async revokeInvitation(invitationId: string) {
    return this.prisma.roomInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });
  }
}
