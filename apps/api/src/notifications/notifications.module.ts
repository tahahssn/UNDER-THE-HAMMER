import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsController } from './notifications.controller';
import { NotificationPreferencesController } from './notifications-preferences.controller';
import { NotificationService } from './services/notification.service';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { RateLimitService } from './services/rate-limit.service';
import { EmailAdapterService } from './services/email-adapter.service';
import { SmsAdapterService } from './services/sms-adapter.service';
import { InAppAdapterService } from './services/in-app-adapter.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [
    NotificationService,
    NotificationPreferencesService,
    NotificationDeliveryService,
    RateLimitService,
    EmailAdapterService,
    SmsAdapterService,
    InAppAdapterService,
  ],
  exports: [NotificationService, NotificationPreferencesService],
})
export class NotificationsModule {}
