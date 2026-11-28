import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { DeliveryStatus } from '../dto/notification-delivery.dto';

/**
 * In-app notification adapter.
 * In-app notifications are created as Notification records by NotificationService.
 * This adapter simply confirms delivery (which is instant for in-app).
 */
@Injectable()
export class InAppAdapterService {
  private logger = new Logger(InAppAdapterService.name);

  constructor(
    private prisma: PrismaService,
    private deliveryService: NotificationDeliveryService,
  ) {}

  /**
   * Send in-app notification.
   * Verifies notification exists and belongs to user, then marks delivery as SENT.
   */
  async sendInApp(
    userId: string,
    notificationId: string,
    deliveryRecordId: string,
  ): Promise<void> {
    try {
      // Verify notification exists and belongs to user
      const notification = await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
      });

      if (!notification) {
        this.logger.error(
          `Notification not found: ${notificationId} for user ${userId}`,
        );
        await this.deliveryService.updateDeliveryStatus(
          deliveryRecordId,
          DeliveryStatus.FAILED,
          'NOTIFICATION_NOT_FOUND',
        );
        return;
      }

      // Mark delivery as SENT
      await this.deliveryService.updateDeliveryStatus(
        deliveryRecordId,
        DeliveryStatus.SENT,
        undefined,
        new Date(),
      );

      this.logger.debug(`In-app notification delivered: ${notificationId}`);
    } catch (error) {
      this.logger.error(`In-app delivery failed: ${error instanceof Error ? error.message : String(error)}`, error);
      try {
        await this.deliveryService.updateDeliveryStatus(
          deliveryRecordId,
          DeliveryStatus.FAILED,
          error instanceof Error ? error.message : String(error),
        );
      } catch (updateError) {
        this.logger.error(`Failed to update delivery status: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
      }
    }
  }
}
