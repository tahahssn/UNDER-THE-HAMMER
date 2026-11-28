import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { DeliveryStatus } from '../dto/notification-delivery.dto';

/**
 * Email delivery adapter using SendGrid.
 * Resolves user email, constructs plain-text email, sends via SendGrid API.
 */
@Injectable()
export class EmailAdapterService {
  private logger = new Logger(EmailAdapterService.name);
  private sendgridApiKey: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private deliveryService: NotificationDeliveryService,
  ) {
    this.sendgridApiKey = this.configService.get<string>('SENDGRID_API_KEY', '');
    if (this.sendgridApiKey) {
      sgMail.setApiKey(this.sendgridApiKey);
    }
  }

  /**
   * Send email notification.
   * Never throws; all errors are logged and delivery status is updated.
   */
  async sendEmail(
    userId: string,
    notificationId: string,
    deliveryRecordId: string,
    title: string,
    body?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      if (!this.sendgridApiKey) {
        this.logger.warn('SENDGRID_API_KEY not configured; skipping email send');
        await this.deliveryService.updateDeliveryStatus(
          deliveryRecordId,
          DeliveryStatus.FAILED,
          'SENDGRID_NOT_CONFIGURED',
        );
        return;
      }

      // Query user email
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!user?.email) {
        this.logger.error(`User email not found for user ${userId}`);
        await this.deliveryService.updateDeliveryStatus(
          deliveryRecordId,
          DeliveryStatus.FAILED,
          'NOTIFICATION_EMAIL_NOT_FOUND',
        );
        return;
      }

      // Construct email
      const emailSubject = title;
      const emailBody = body || title;
      const fromEmail = this.configService.get<string>(
        'SENDGRID_FROM_EMAIL',
        'noreply@underthehammer.dev',
      );

      const msg = {
        to: user.email,
        from: fromEmail,
        subject: emailSubject,
        text: emailBody,
        html: `<p>${emailBody}</p>`,
        replyTo: 'support@underthehammer.dev',
        trackingSettings: {
          clickTracking: { enable: false },
          openTracking: { enable: false },
        },
      };

      // Send via SendGrid
      await sgMail.send(msg);

      this.logger.debug(`Email sent to ${user.email} for notification ${notificationId}`);
      await this.deliveryService.updateDeliveryStatus(
        deliveryRecordId,
        DeliveryStatus.SENT,
        undefined,
        new Date(),
      );
    } catch (error) {
      this.logger.error(`Email delivery failed: ${error instanceof Error ? error.message : String(error)}`, error);
      const errorMessage = error instanceof Error && 'response' in error 
        ? (error as any).response?.body?.errors?.[0]?.message || error.message
        : String(error);
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
