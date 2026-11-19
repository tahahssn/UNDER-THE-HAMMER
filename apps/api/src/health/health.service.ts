import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CheckState = 'up' | 'down' | 'not_configured';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<Record<string, CheckState>> {
    return {
      database: await this.checkDatabase(),
      // Redis and provider checks are added when those integrations land.
      redis: 'not_configured',
    };
  }

  private async checkDatabase(): Promise<CheckState> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
