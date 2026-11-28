import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationIntent, NotificationCategory } from '../dto/notification.dto';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { EmailAdapterService } from './email-adapter.service';
import { SmsAdapterService } from './sms-adapter.service';
import { InAppAdapterService } from './in-app-adapter.service';

/**
 * Core orchestrator service for notification dispatch.
 * - Accepts notification intents
 * - Resolves user preferences
 * - Creates Notification records
 * - Creates NotificationDelivery tracking records
 * - Dispatches to channel adapters asynchronously (fire-and-forget)
 *
 * Never throws exceptions into caller; all errors are logged.
 */
@Injectable()
export class NotificationService {
  private logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private preferencesService: NotificationPreferencesService,
    private deliveryService: NotificationDeliveryService,
    private emailAdapter: EmailAdapterService,
    private smsAdapter: SmsAdapterService,
    private inAppAdapter: InAppAdapterService,
  ) {}

  /**
   * Dispatch notification to user.
   * Fire-and-forget: never blocks, never throws.
   *
   * Workflow:
   * 1. Check idempotency: return existing notification if one exists with same (userId, category, auctionId, playerId) created within 1 minute
   * 2. Resolve enabled channels from user preferences
   * 3. Create Notification record
   * 4. Create NotificationDelivery tracking records
   * 5. Dispatch to each adapter asynchronously
   */
  async dispatchNotification(intent: NotificationIntent): Promise<void> {
    // Fire-and-forget: use setImmediate to dequeue from caller's execution context
    setImmediate(() => {
      this.dispatchAsync(intent).catch((error) => {
        this.logger.error(`Notification dispatch failed: ${error.message}`, error);
      });
    });
  }

  private async dispatchAsync(intent: NotificationIntent): Promise<void> {
    try {
      // 1. Check idempotency
      const existingNotification = await this.checkIdempotency(intent);
      if (existingNotification) {
        this.logger.debug(
          `Skipping duplicate notification: ${existingNotification.id}`,
        );
        return;
      }

      // 2. Resolve enabled channels
      const enabledChannels = await this.preferencesService.resolveEnabledChannels(
        intent.userId,
        intent.category,
      );

      const channelsList: string[] = [];
      if (enabledChannels.inApp) channelsList.push('IN_APP');
      if (enabledChannels.email) channelsList.push('EMAIL');
      if (enabledChannels.sms) channelsList.push('SMS');

      if (channelsList.length === 0) {
        this.logger.debug(
          `No enabled channels for user ${intent.userId} category ${intent.category}; skipping`,
        );
        return;
      }

      // 3. Create Notification record
      const notification = await this.prisma.notification.create({
        data: {
          userId: intent.userId,
          category: intent.category,
          title: intent.title,
          body: intent.body,
          data: intent.data as any,
          readAt: null, // Unread by default
        },
      });

      // 4. Create NotificationDelivery tracking records
      const deliveryRecords = await this.deliveryService.createDeliveryRecords(
        notification.id,
        channelsList,
      );

      // 5. Dispatch to adapters asynchronously (fire-and-forget)
      this.dispatchToChannelsAsync(
        notification,
        deliveryRecords,
        intent.userId,
      ).catch((error) => {
        this.logger.error(
          `Error dispatching to channels: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      });
    } catch (error) {
      this.logger.error(
        `Failed to dispatch notification for user ${intent.userId}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * Check if a notification with the same (userId, category, auctionId, playerId)
   * was created within the last 1 minute. If so, return the existing notification.
   */
  private async checkIdempotency(intent: NotificationIntent) {
    if (!intent.auctionId || !intent.playerId) {
      return null; // No idempotency key
    }

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    return this.prisma.notification.findFirst({
      where: {
        userId: intent.userId,
        category: intent.category,
        createdAt: { gte: oneMinuteAgo },
        data: {
          path: ['auctionId'],
          equals: intent.auctionId,
        },
      },
    });
  }

  /**
   * Dispatch to all enabled adapters asynchronously.
   * Each adapter updates delivery status independently.
   */
  private async dispatchToChannelsAsync(
    notification: any,
    deliveryRecords: any[],
    userId: string,
  ): Promise<void> {
    const dispatchPromises: Promise<void>[] = [];

    for (const record of deliveryRecords) {
      if (record.channel === 'IN_APP') {
        dispatchPromises.push(
          this.inAppAdapter.sendInApp(userId, notification.id, record.id),
        );
      } else if (record.channel === 'EMAIL') {
        dispatchPromises.push(
          this.emailAdapter.sendEmail(
            userId,
            notification.id,
            record.id,
            notification.title,
            notification.body,
            notification.data,
          ),
        );
      } else if (record.channel === 'SMS') {
        dispatchPromises.push(
          this.smsAdapter.sendSms(
            userId,
            notification.id,
            record.id,
            notification.title,
            notification.body,
            notification.data,
          ),
        );
      }
    }

    // Fire-and-forget: do not await
    Promise.all(dispatchPromises).catch((error) => {
      this.logger.error(`Channel dispatch error: ${error.message}`, error);
    });
  }

  /**
   * Mark a notification as read.
   */
  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error('Notification not found or access denied');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  /**
   * Mark all unread notifications as read for a user.
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return result.count;
  }

  /**
   * Delete a notification.
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error('Notification not found or access denied');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  /**
   * Get paginated notifications for a user.
   */
  async getNotifications(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return {
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get notifications filtered by category.
   */
  async getNotificationsByCategory(
    userId: string,
    category: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, category },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, category } }),
    ]);

    return {
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}
