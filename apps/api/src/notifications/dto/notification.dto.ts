import { z } from 'zod';

export enum NotificationCategory {
  BID_WON = 'BID_WON',
  BID_PLACED = 'BID_PLACED',
  BREAK_STARTED = 'BREAK_STARTED',
  BREAK_ENDED = 'BREAK_ENDED',
  AUCTION_ENDED = 'AUCTION_ENDED',
  SUBSCRIPTION_EXPIRING = 'SUBSCRIPTION_EXPIRING',
}

export class NotificationDto {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  data?: Record<string, any>;
  read: boolean; // Derived from readAt !== null
  createdAt: Date;

  /**
   * Transform from Prisma Notification model to DTO.
   * Derives 'read' boolean from readAt timestamp.
   */
  static fromPrisma(notification: any): NotificationDto {
    return {
      id: notification.id,
      userId: notification.userId,
      category: notification.category,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      read: notification.readAt !== null,
      createdAt: notification.createdAt,
    };
  }
}

/**
 * Request payload for marking a notification as read.
 */
export const MarkReadRequestSchema = z.object({
  id: z.string().uuid('Invalid notification ID'),
});

export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>;

/**
 * Notification intent - passed to NotificationService.dispatchNotification().
 * Service resolves preferences, creates records, dispatches to adapters.
 */
export interface NotificationIntent {
  userId: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  data?: Record<string, any>;
  /**
   * For idempotency: if another notification with the same (userId, category, auctionId, playerId)
   * was created within 1 minute, return existing notification instead of creating duplicate.
   */
  auctionId?: string;
  playerId?: string;
}
