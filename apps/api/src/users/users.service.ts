import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UpdateProfileInput {
  displayName?: string;
  locale?: string;
  timezone?: string;
  countryCode?: string;
}

/**
 * User profile and account management.
 * Handles reading and updating user information after authentication.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get user by internal ID with profile.
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, identities: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Get user by Cognito subject (from JWT claims).
   */
  async getUserByCognitoSubject(cognitoSubject: string) {
    const identity = await this.prisma.userIdentity.findUnique({
      where: {
        provider_subject: {
          provider: 'COGNITO_PASSWORD',
          subject: cognitoSubject,
        },
      },
      include: {
        user: {
          include: { profile: true, identities: true },
        },
      },
    });

    if (!identity) {
      throw new NotFoundException('User identity not found');
    }

    return identity.user;
  }

  /**
   * Create or update user profile.
   */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create profile if it doesn't exist
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        displayName: input.displayName,
        locale: input.locale,
        timezone: input.timezone,
        countryCode: input.countryCode,
      },
      create: {
        userId,
        displayName: input.displayName ?? user.email?.split('@')[0] ?? 'User',
        locale: input.locale,
        timezone: input.timezone,
        countryCode: input.countryCode,
      },
    });

    return profile;
  }

  /**
   * Get user profile.
   */
  async getProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  /**
   * Check if username is available.
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });

    return !existing;
  }

  /**
   * Set/update username for a user.
   */
  async setUsername(userId: string, username: string): Promise<{ username: string }> {
    // Validate username format
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      throw new BadRequestException(
        'Username must be 3-20 characters, alphanumeric and underscores only',
      );
    }

    // Check availability
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existing && existing.id !== userId) {
      throw new BadRequestException('Username already taken');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { username },
    });

    return { username: user.username ?? undefined };
  }

  /**
   * List user's identities (email, Google, etc.).
   */
  async getIdentities(userId: string) {
    const identities = await this.prisma.userIdentity.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        subject: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    return identities;
  }
}
