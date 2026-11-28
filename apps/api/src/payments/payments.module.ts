import { Module } from '@nestjs/common';
import { SafepayService } from './safepay.service';
import { PaymentsRepository } from './payments.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
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
