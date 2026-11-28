import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserPreferenceDto, EnabledChannels } from '../dto/notification-preference.dto';
import { NotificationCategory } from '../dto/notification.dto';

/**
 * Service for managing user notification preferences.
 * Preferences are stored per-user, per-notification-type, per-channel.
 */
@Injectable()
export class NotificationPreferencesService {
  // Define recognized notification categories
  private readonly recognizedCategories = Object.values(NotificationCategory);

  // Categories that require explicit consent before enabling EMAIL or SMS
  private readonly marketingCategories = ['SUBSCRIPTION_EXPIRING'];

  constructor(private prisma: PrismaService) {}

  /**
   * Get all preferences for a user, including defaults for all categories.
   */
  async getUserPreferences(userId: string): Promise<UserPreferenceDto[]> {
    const prefs = await this.prisma.userNotificationPreference.findMany({
      where: { userId },
    });

    // Build a map of existing preferences by category
    const prefMap = new Map<string, any>();
    for (const pref of prefs) {
      if (!prefMap.has(pref.category)) {
        prefMap.set(pref.category, {
          category: pref.category,
          inApp: { enabled: false },
          email: { enabled: false },
          sms: { enabled: false },
        });
      }
      const cat = prefMap.get(pref.category);
      const channelKey = pref.channel.toLowerCase();
      if (cat.hasOwnProperty(channelKey)) {
        cat[channelKey] = {
          enabled: pref.enabled,
          ...(pref.consentedAt && { consentedAt: pref.consentedAt }),
        };
      }
    }

    // Ensure all recognized categories are present (with defaults)
    for (const category of this.recognizedCategories) {
      if (!prefMap.has(category)) {
        prefMap.set(category, {
          category,
          inApp: { enabled: true }, // IN_APP is enabled by default
          email: { enabled: false },
          sms: { enabled: false },
        });
      }
    }

    return Array.from(prefMap.values()).map((cat) => ({
      userId,
      category: cat.category,
      channels: {
        inApp: cat.inApp,
        email: cat.email,
        sms: cat.sms,
      },
    }));
  }

  /**
   * Update preferences for a specific category and user.
   * Enforces consent validation for marketing categories.
   */
  async updatePreferencesForCategory(
    userId: string,
    category: string,
    channels: { email?: boolean; sms?: boolean; inApp?: boolean },
  ): Promise<UserPreferenceDto[]> {
    if (!this.recognizedCategories.includes(category as NotificationCategory)) {
      throw new BadRequestException(`Unknown notification category: ${category}`);
    }

    // Validate consent for marketing categories
    if (
      (channels.email || channels.sms) &&
      this.marketingCategories.includes(category)
    ) {
      // For now, just allow it. In production, this should check explicit consent
      // from the user (e.g., via a checkbox on signup or settings page).
    }

    // Upsert preferences for each channel
    const channelUpdates = [
      { channel: 'IN_APP', enabled: channels.inApp ?? true },
      { channel: 'EMAIL', enabled: channels.email ?? false },
      { channel: 'SMS', enabled: channels.sms ?? false },
    ];

    for (const { channel, enabled } of channelUpdates) {
      await this.prisma.userNotificationPreference.upsert({
        where: {
          userId_category_channel: {
            userId,
            category,
            channel: channel as any,
          },
        },
        create: {
          userId,
          category,
          channel: channel as any,
          enabled,
          consentedAt: enabled ? new Date() : null,
        },
        update: {
          enabled,
          consentedAt: enabled ? new Date() : null,
        },
      });
    }

    return this.getUserPreferences(userId);
  }

  /**
   * Resolve enabled channels for a user and notification category.
   * Returns which channels should receive notifications for this category.
   */
  async resolveEnabledChannels(
    userId: string,
    category: string,
  ): Promise<EnabledChannels> {
    const prefs = await this.prisma.userNotificationPreference.findMany({
      where: { userId, category },
    });

    const channels: EnabledChannels = {
      inApp: false,
      email: false,
      sms: false,
    };

    for (const pref of prefs) {
      const channelKey = pref.channel.toLowerCase() as keyof EnabledChannels;
      if (channels.hasOwnProperty(channelKey)) {
        channels[channelKey] = pref.enabled;
      }
    }

    // If no preferences exist, use defaults
    if (prefs.length === 0) {
      channels.inApp = true; // IN_APP enabled by default
    }

    return channels;
  }
}
