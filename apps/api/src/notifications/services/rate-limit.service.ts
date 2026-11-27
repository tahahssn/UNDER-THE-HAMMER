import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Redis from 'ioredis';

/**
 * Rate limiting service for SMS dispatch.
 * Enforces per-user SMS rate limit: max N SMS per M minutes (configurable).
 * Uses Redis for distributed rate limiting.
 */
@Injectable()
export class RateLimitService {
  private redis: Redis.Redis;
  private readonly windowMinutes: number;
  private readonly maxPerWindow: number;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    this.redis = new Redis(redisUrl);
    this.windowMinutes = this.configService.get<number>(
      'SMS_RATE_LIMIT_WINDOW_MINUTES',
      5,
    );
    this.maxPerWindow = this.configService.get<number>(
      'SMS_RATE_LIMIT_MAX_PER_WINDOW',
      1,
    );
  }

  /**
   * Check and increment rate limit counter for a user.
   * Returns whether the limit has been exceeded.
   * If not exceeded, increments the counter atomically.
   */
  async checkAndIncrementRateLimit(userId: string): Promise<{
    isLimited: boolean;
    attemptsInWindow: number;
  }> {
    const key = `sms:rate-limit:${userId}`;
    const ttlSeconds = this.windowMinutes * 60;

    // Atomic increment with TTL
    const pipeline = this.redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, ttlSeconds);
    const results = await pipeline.exec();

    if (!results) {
      throw new Error('Redis pipeline failed');
    }

    const attempts = (results[0][1] as number) || 1;
    const isLimited = attempts > this.maxPerWindow;

    return {
      isLimited,
      attemptsInWindow: attempts,
    };
  }

  /**
   * Reset rate limit counter for a user (for testing or manual override).
   */
  async resetRateLimit(userId: string): Promise<void> {
    const key = `sms:rate-limit:${userId}`;
    await this.redis.del(key);
  }

  /**
   * Get current rate limit status for a user.
   */
  async getRateLimitStatus(userId: string): Promise<{
    attemptsInWindow: number;
    isLimited: boolean;
    timeUntilResetSeconds?: number;
  }> {
    const key = `sms:rate-limit:${userId}`;
    const attempts = await this.redis.get(key);
    const ttl = await this.redis.ttl(key);

    const attemptsInWindow = attempts ? parseInt(attempts, 10) : 0;
    return {
      attemptsInWindow,
      isLimited: attemptsInWindow > this.maxPerWindow,
      timeUntilResetSeconds: ttl > 0 ? ttl : undefined,
    };
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
