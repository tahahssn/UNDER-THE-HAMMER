import { z } from 'zod';

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

/**
 * User preference for a specific notification category across all channels.
 */
export class UserPreferenceDto {
  userId: string;
  category: string;
  channels: {
    inApp: { enabled: boolean; consentedAt?: Date };
    email: { enabled: boolean; consentedAt?: Date };
    sms: { enabled: boolean; consentedAt?: Date };
  };

  static fromPrisma(preferences: any[]): UserPreferenceDto {
    // Preferences come as array of { category, channel, enabled, consentedAt }
    // Group by category and build channel structure
    const categories = new Map<string, any>();

    for (const pref of preferences) {
      if (!categories.has(pref.category)) {
        categories.set(pref.category, {
          inApp: { enabled: false },
          email: { enabled: false },
          sms: { enabled: false },
        });
      }
      const cat = categories.get(pref.category);
      const channelKey = pref.channel.toLowerCase();
      if (cat.hasOwnProperty(channelKey)) {
        cat[channelKey] = {
          enabled: pref.enabled,
          ...(pref.consentedAt && { consentedAt: pref.consentedAt }),
        };
      }
    }

    // Return first category's structure as example
    // In practice, controller will return an array of these per category
    return {
      userId: preferences[0]?.userId,
      category: preferences[0]?.category,
      channels: categories.get(preferences[0]?.category),
    };
  }
}

/**
 * Request payload for updating preferences for a category.
 */
export const UpdatePreferenceRequestSchema = z.object({
  channels: z.object({
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
  }),
});

export type UpdatePreferenceRequest = z.infer<typeof UpdatePreferenceRequestSchema>;

/**
 * Resolved enabled channels for a user and notification category.
 */
export interface EnabledChannels {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}
