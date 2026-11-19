import { Controller, Get, HttpCode, ServiceUnavailableException, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@ApiTags('health')
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up. Does not touch dependencies. */
  @Get('live')
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: critical dependencies respond. */
  @Get('ready')
  async ready(): Promise<{ status: 'ready'; checks: Record<string, string> }> {
    const checks = await this.health.check();
    const failed = Object.entries(checks).filter(([, v]) => v === 'down');
    if (failed.length > 0) {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: `Dependencies down: ${failed.map(([k]) => k).join(', ')}`,
        details: checks,
      });
    }
    return { status: 'ready', checks };
  }
}
