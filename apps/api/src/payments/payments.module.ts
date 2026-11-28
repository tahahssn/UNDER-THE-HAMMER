import { Module } from '@nestjs/common';
import { SafepayService } from './safepay.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [PrismaModule, SubscriptionsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsRepository,
    SafepayService,
    {
      provide: 'SAFEPAY_API_KEY',
      useValue: process.env.SAFEPAY_API_KEY || '',
    },
    {
      provide: 'SAFEPAY_WEBHOOK_SECRET',
      useValue: process.env.SAFEPAY_WEBHOOK_SECRET || '',
    },
  ],
  exports: [SafepayService, PaymentsRepository],
})
export class PaymentsModule {}
