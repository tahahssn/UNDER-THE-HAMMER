export enum DeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

/**
 * Delivery tracking record for a notification sent to a specific channel.
 */
export class NotificationDeliveryDto {
  id: string;
  notificationId: string;
  channel: string;
  status: DeliveryStatus;
  attempts: number;
  sentAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;

  static fromPrisma(record: any): NotificationDeliveryDto {
    return {
      id: record.id,
      notificationId: record.notificationId,
      channel: record.channel,
      status: record.status,
      attempts: record.attempts,
      sentAt: record.sentAt,
      error: record.error,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
