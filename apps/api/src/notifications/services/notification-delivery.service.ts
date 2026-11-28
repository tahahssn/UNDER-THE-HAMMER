import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryStatus } from '../dto/notification-delivery.dto';
import { NotificationDeliveryDto } from '../dto/notification-delivery.dto';

export interface NotificationChannel {
  IN_APP: 'IN_APP';
  EMAIL: 'EMAIL';
  SMS: 'SMS';
}

/**
 * Service for creating and updating NotificationDelivery tracking records.
 * These records persist delivery status and enable retry logic.
 */
@Injectable()
export class NotificationDeliveryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create delivery tracking records for each enabled channel.
   */
  async createDeliveryRecords(
    notificationId: string,
    channels: string[],
  ): Promise<NotificationDeliveryDto[]> {
    const records = await Promise.all(
      channels.map((channel) =>
        this.prisma.notificationDelivery.create({
          data: {
            notificationId,
            channel,
            status: 'PENDING',
            attempts: 0,
          },
        }),
      ),
    );

    return records.map((r: any) => NotificationDeliveryDto.fromPrisma(r));
  }

  /**
   * Update delivery status and optional sentAt, error fields.
   */
  async updateDeliveryStatus(
    deliveryRecordId: string,
    status: DeliveryStatus,
    error?: string,
    sentAt?: Date,
  ): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryRecordId },
      data: {
        status,
        error: error || null,
        sentAt: sentAt || null,
      },
    });
  }

  /**
   * Increment attempts counter for a delivery record.
   */
  async incrementAttempts(deliveryRecordId: string): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryRecordId },
      data: {
        attempts: { increment: 1 },
      },
    });
  }

  /**
   * Get pending delivery records older than specified minutes (for retry jobs).
   */
  async getPendingDeliveries(olderThanMinutes: number): Promise<
    Array<
      NotificationDeliveryDto & { notification: { title: string; body?: string } }
    >
  > {
    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const records = await this.prisma.notificationDelivery.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoffTime },
      },
      include: {
        notification: {
          select: { title: true, body: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((r: any) => ({
      ...NotificationDeliveryDto.fromPrisma(r),
      notification: r.notification,
    }));
  }

  /**
   * Get delivery record by ID with notification details.
   */
  async getDeliveryRecord(deliveryRecordId: string) {
    return this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryRecordId },
      include: { notification: true },
    });
  }
}
