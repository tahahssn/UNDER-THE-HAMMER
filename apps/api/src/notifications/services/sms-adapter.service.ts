import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { RateLimitService } from './rate-limit.service';
import { DeliveryStatus } from '../dto/notification-delivery.dto';

/**
 * SMS delivery adapter using Twilio.
 * Resolves user phone, enforces rate limit, constructs SMS, sends via Twilio API.
 */
@Injectable()
export class SmsAdapterService {
  private logger = new Logger(SmsAdapterService.name);
  private twilioClient: ReturnType<typeof twilio> | null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private deliveryService: NotificationDeliveryService,
    private rateLimitService: RateLimitService,
  ) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID', '');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN', '');

    if (accountSid && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
    } else {
      this.twilioClient = null;
    }
  }

  /**
   * Send SMS notification.
   * Never throws; all errors are logged and delivery status is updated.
   */
  async sendSms(
    userId: string,
    notificationId: string,
    deliveryRecordId: string,
    title: string,
    body?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      if (!this.twilioClient) {
        this.logger.warn('Twilio credentials not configured; skipping SMS send');
        await this.deliveryService.updateDeliveryStatus(
          deliveryRecordId,
          DeliveryStatus.FAILED,
          'TWILIO_NOT_CONFIGURED',
        );
        return;
      }

      // Query user phone number
      const userProfile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { phoneNumber: true },
      });

      if (!userProfile?.phoneNumber) {
        this.logger.error(`User phone number not found for user ${userId}`);
        await this.deliveryService.updateDeliveryStatus(
          deliveryRecordId,
          DeliveryStatus.FAILED,
          'NOTIFICATION_SMS_PHONE_NOT_FOUND',
        );
        return;
      }

      // Validate E.164 format
      const e164Regex = /^\+[1-9]\d{1,14}$/;
      if (!e164Regex.test(userProfile.phoneNumber)) {
        this.logger.error(
          `Invalid phone format for user ${userId}: ${userProfile.phoneNumber}`,
        );
        await this.deliveryService.updateDeliveryStatus(
          deliveryRecordId,
          DeliveryStatus.FAILED,
          'NOTIFICATION_SMS_PHONE_INVALID',
        );
        return;
      }

      // Check rate limit
      const rateLimitStatus = await this.rateLimitService.checkAndIncrementRateLimit(userId);
      if (rateLimitStatus.isLimited) {
        this.logger.warn(
          `SMS rate limit exceeded for user ${userId}: ${rateLimitStatus.attemptsInWindow} attempts in window`,
        );
        await this.deliveryService.updateDeliveryStatus(
          deliveryRecordId,
          DeliveryStatus.PENDING, // Not FAILED; will retry later
          'RATE_LIMITED',
        );
        return;
      }

      // Construct SMS body
      const messageBody = body ? `${title}: ${body}` : title;
      const truncatedBody = messageBody.substring(0, 160);

      // Send via Twilio
      const fromPhone = this.configService.get<string>(
        'TWILIO_PHONE_NUMBER',
        '+1234567890',
      );

      const message = await this.twilioClient.messages.create({
        body: truncatedBody,
        from: fromPhone,
        to: userProfile.phoneNumber,
      });

      this.logger.debug(
        `SMS sent to ${userProfile.phoneNumber} for notification ${notificationId}`,
      );
      await this.deliveryService.updateDeliveryStatus(
        deliveryRecordId,
        DeliveryStatus.SENT,
        undefined,
        new Date(),
      );
    } catch (error) {
      this.logger.error(`SMS delivery failed: ${error instanceof Error ? error.message : String(error)}`, error);
      const errorMessage = error instanceof Error ? error.message : 'SMS_SEND_FAILED';
      try {
        await this.deliveryService.updateDeliveryStatus(
          deliveryRecordId,
          DeliveryStatus.FAILED,
          errorMessage,
        );
      } catch (updateError) {
        this.logger.error(`Failed to update delivery status: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
      }
    }
  }
}
