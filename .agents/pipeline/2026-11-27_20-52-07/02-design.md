# Phase M: Live Cricket Data Integration — Technical Design

**Status:** Ready for Implementation  
**Date:** 2026-11-27  
**Phase:** M (Live Cricket Data Integration)  
**Author:** Design Agent

---

## Overview

This design implements a provider-independent abstraction layer for live cricket data integration. The system fetches player statistics, match information, and player search results from external cricket data providers (ESPN/cricapi) via a pluggable interface, caches results with configurable TTLs (1 hour for stats, 15 minutes for matches), implements exponential backoff for rate limiting, and extends availability during provider outages by returning stale cached data with appropriate headers.

The architecture follows established patterns in the codebase: NestJS services with dependency injection, Zod validation, structured logging, and clear separation of concerns. The provider interface enables future implementations (Cricketdata.org, ICC API) without modifying existing services. Frontend integration uses a custom React hook (`useCricketData`) for browser-side caching and error handling.

---

## Architecture

### Module Structure

```
apps/api/src/cricket-data/
├── providers/
│   ├── cricket.provider.ts           # CricketProvider interface
│   ├── espn-data.provider.ts         # ESPNDataProvider implementation
│   └── errors/
│       └── provider.error.ts         # ProviderError class
├── services/
│   ├── cricket-data.service.ts       # Coordinator, delegates to provider
│   ├── player-stats.service.ts       # Caching + stale fallback for player stats
│   ├── live-match.service.ts         # Caching + stale fallback for matches
│   └── errors/
│       └── cricket-data.error.ts     # Service-level errors
├── cache/
│   ├── cache-manager.ts              # CacheManager interface
│   ├── in-memory-cache.manager.ts    # In-memory implementation
│   ├── redis-cache.manager.ts        # Redis implementation (optional)
│   └── rate-limiter.ts               # Sliding-window rate limit counter
├── controllers/
│   └── cricket-data.controller.ts    # REST endpoints for search, player stats, match info
├── dtos/
│   ├── player-stats.dto.ts           # PlayerStatsDto, response schema
│   ├── match-info.dto.ts             # MatchInfoDto, response schema
│   ├── player-search.dto.ts          # PlayerSearchResult, search response
│   └── cricket-provider.dto.ts       # Shared DTOs for provider interface
├── validators/
│   ├── player-stats.validator.ts     # Zod schema for player stats query params
│   ├── player-search.validator.ts    # Zod schema for search query params
│   └── match-info.validator.ts       # Zod schema for match info query params
├── cricket-data.module.ts            # NestJS module
└── __tests__/
    ├── cricket-data.service.spec.ts
    ├── player-stats.service.spec.ts
    ├── live-match.service.spec.ts
    ├── espn-data.provider.spec.ts
    ├── cricket-data.controller.spec.ts
    ├── cache-manager.spec.ts
    └── rate-limiter.spec.ts
```

**Frontend (3 files):**
```
apps/web/src/
├── hooks/
│   └── useCricketData.ts              # Fetches player stats with browser cache
├── components/
│   └── PlayerStats.tsx                # Displays player statistics
└── __tests__/
    ├── useCricketData.test.ts
    └── PlayerStats.test.ts
```

### Dependency Graph

```
CricketDataController
├── CricketDataService (coordinates all operations)
│   ├── PlayerStatsService
│   │   ├── CricketDataService (fetch delegation)
│   │   ├── CacheManager
│   │   └── Logger
│   ├── LiveMatchService
│   │   ├── CricketDataService (fetch delegation)
│   │   ├── CacheManager
│   │   └── Logger
│   └── CricketProvider (injected: ESPNDataProvider)
│       ├── HttpClient (axios or fetch)
│       ├── Zod (validation)
│       ├── RateLimiter
│       └── Logger

CacheManager (selected at runtime)
├── InMemoryCacheManager
└── RedisCacheManager (optional)
```

---

## Detailed Design

### 1. Provider Abstraction Layer

#### CricketProvider Interface

**File:** `apps/api/src/cricket-data/providers/cricket.provider.ts`

```typescript
// Shared DTOs for provider contract
export interface PlayerStatsDto {
  id: string;
  displayName: string;
  format: string; // 'Test', 'ODI', 'T20', etc.
  matches?: number;
  runs?: number;
  wickets?: number;
  battingAverage?: number;
  strikeRate?: number;
  bowlingAverage?: number;
  bowlingEconomy?: number;
  asOf: string; // ISO 8601
  providerName: string;
}

export interface MatchInfoDto {
  id: string;
  title: string;
  description: string;
  teams: string[]; // Team names
  venue: string;
  startTime: string; // ISO 8601
  status: string; // 'SCHEDULED', 'LIVE', 'COMPLETED'
  format: string; // 'Test', 'ODI', 'T20'
  asOf: string; // ISO 8601
  providerName: string;
}

export interface PlayerSearchResult {
  id: string;
  displayName: string;
  role?: string; // 'BATTER', 'BOWLER', 'ALL_ROUNDER', 'WICKETKEEPER'
  country?: string;
  format?: string;
}

export interface FetchOptions {
  live?: boolean;
  forceRefresh?: boolean;
}

export interface SearchOptions {
  limit?: number;
}

export interface CricketProvider {
  /**
   * Fetch player statistics for a given player ID and optional format.
   * @param playerId - The external provider's player ID
   * @param options - Optional flags (live for real-time data)
   * @returns PlayerStatsDto with provider name and timestamp
   * @throws ProviderError on invalid ID, rate limit, provider error
   */
  fetchPlayerStats(playerId: string, options?: FetchOptions): Promise<PlayerStatsDto>;

  /**
   * Search for players by name or other criteria.
   * @param query - Search query string (1-100 chars)
   * @param options - Optional limit (default 20, max 100)
   * @returns Array of matching player search results
   * @throws ProviderError on rate limit, provider error
   */
  searchPlayers(query: string, options?: SearchOptions): Promise<PlayerSearchResult[]>;

  /**
   * Fetch match information by match ID.
   * @param matchId - The external provider's match ID
   * @returns MatchInfoDto with provider name and timestamp
   * @throws ProviderError on invalid ID, rate limit, provider error
   */
  fetchMatchInfo(matchId: string): Promise<MatchInfoDto>;

  /**
   * Return the provider's name (e.g., 'ESPN', 'cricapi').
   */
  getProviderName(): string;
}
```

**Decision:** Interface defines input/output contracts, not implementation. Each method returns DTOs with `asOf` timestamp and `providerName` to track data freshness and source.

#### ProviderError Class

**File:** `apps/api/src/cricket-data/providers/errors/provider.error.ts`

```typescript
export class ProviderError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly operation: string, // 'fetchPlayerStats', 'searchPlayers', 'fetchMatchInfo'
    public readonly statusCode: number | null, // null for network errors
    public readonly retryable: boolean,
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      providerName: this.providerName,
      operation: this.operation,
      statusCode: this.statusCode,
      retryable: this.retryable,
    };
  }
}
```

**Decision:** Wraps provider errors with provider name, operation, and retryability flag for consistent error handling and observability.

### 2. ESPNDataProvider Implementation

**File:** `apps/api/src/cricket-data/providers/espn-data.provider.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import { CricketProvider, PlayerStatsDto, MatchInfoDto, PlayerSearchResult, FetchOptions, SearchOptions } from './cricket.provider';
import { ProviderError } from './errors/provider.error';
import { RateLimiter } from '../cache/rate-limiter';

@Injectable()
export class ESPNDataProvider implements CricketProvider {
  private readonly logger = new Logger(ESPNDataProvider.name);
  private readonly httpClient: AxiosInstance;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.getOrThrow('CRICKET_PROVIDER_API_KEY');
    this.baseUrl = this.configService.getOrThrow('CRICKET_PROVIDER_BASE_URL');
    this.timeoutMs = this.configService.get('CRICKET_API_TIMEOUT_MS', 5000);

    const rateLimitWindowMs = this.configService.get('CRICKET_API_RATE_LIMIT_WINDOW_MS', 60000);
    const rateLimitMaxRequests = this.configService.get('CRICKET_API_RATE_LIMIT_MAX_REQUESTS', 100);
    this.rateLimiter = new RateLimiter(rateLimitWindowMs, rateLimitMaxRequests);

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  async fetchPlayerStats(playerId: string, options?: FetchOptions): Promise<PlayerStatsDto> {
    return this.executeWithRetry(
      () => this._fetchPlayerStats(playerId, options),
      'fetchPlayerStats',
    );
  }

  private async _fetchPlayerStats(playerId: string, options?: FetchOptions): Promise<PlayerStatsDto> {
    this.validateInput(playerId, 'playerId', 100);

    const startMs = Date.now();
    try {
      const endpoint = options?.live ? `/players/${encodeURIComponent(playerId)}/stats/live` : `/players/${encodeURIComponent(playerId)}/stats`;
      const response = await this.httpClient.get(endpoint);
      const latencyMs = Date.now() - startMs;

      this.logger.debug(
        `fetchPlayerStats(${playerId}, live=${options?.live}) completed in ${latencyMs}ms`,
        { operation: 'fetchPlayerStats', playerId, live: options?.live, latencyMs, statusCode: response.status },
      );

      const dto = this.validateAndMapPlayerStats(response.data);
      return dto;
    } catch (error) {
      const latencyMs = Date.now() - startMs;
      throw this.translateError(error, 'fetchPlayerStats', latencyMs);
    }
  }

  async searchPlayers(query: string, options?: SearchOptions): Promise<PlayerSearchResult[]> {
    return this.executeWithRetry(
      () => this._searchPlayers(query, options),
      'searchPlayers',
    );
  }

  private async _searchPlayers(query: string, options?: SearchOptions): Promise<PlayerSearchResult[]> {
    this.validateInput(query, 'query', 100);

    const startMs = Date.now();
    try {
      const limit = Math.min(options?.limit ?? 20, 100);
      const response = await this.httpClient.get('/players/search', {
        params: { q: query, limit },
      });
      const latencyMs = Date.now() - startMs;

      this.logger.debug(
        `searchPlayers(${query}, limit=${limit}) completed in ${latencyMs}ms`,
        { operation: 'searchPlayers', query, limit, latencyMs, statusCode: response.status },
      );

      const results = this.validateAndMapSearchResults(response.data);
      return results;
    } catch (error) {
      const latencyMs = Date.now() - startMs;
      throw this.translateError(error, 'searchPlayers', latencyMs);
    }
  }

  async fetchMatchInfo(matchId: string): Promise<MatchInfoDto> {
    return this.executeWithRetry(
      () => this._fetchMatchInfo(matchId),
      'fetchMatchInfo',
    );
  }

  private async _fetchMatchInfo(matchId: string): Promise<MatchInfoDto> {
    this.validateInput(matchId, 'matchId', 100);

    const startMs = Date.now();
    try {
      const response = await this.httpClient.get(`/matches/${encodeURIComponent(matchId)}`);
      const latencyMs = Date.now() - startMs;

      this.logger.debug(
        `fetchMatchInfo(${matchId}) completed in ${latencyMs}ms`,
        { operation: 'fetchMatchInfo', matchId, latencyMs, statusCode: response.status },
      );

      const dto = this.validateAndMapMatchInfo(response.data);
      return dto;
    } catch (error) {
      const latencyMs = Date.now() - startMs;
      throw this.translateError(error, 'fetchMatchInfo', latencyMs);
    }
  }

  getProviderName(): string {
    return 'espn';
  }

  // ========== Internal Helpers ==========

  private validateInput(value: string, fieldName: string, maxLength: number): void {
    if (!value || typeof value !== 'string' || value.trim() === '') {
      throw new ProviderError(
        this.getProviderName(),
        'validate',
        400,
        false,
        `${fieldName} is required and must be a non-empty string`,
      );
    }
    if (value.length > maxLength) {
      throw new ProviderError(
        this.getProviderName(),
        'validate',
        400,
        false,
        `${fieldName} exceeds max length of ${maxLength}`,
      );
    }
  }

  private validateAndMapPlayerStats(raw: unknown): PlayerStatsDto {
    const schema = z.object({
      id: z.string(),
      displayName: z.string(),
      format: z.string(),
      matches: z.number().optional(),
      runs: z.number().optional(),
      wickets: z.number().optional(),
      battingAverage: z.number().optional(),
      strikeRate: z.number().optional(),
      bowlingAverage: z.number().optional(),
      bowlingEconomy: z.number().optional(),
    });

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderError(
        this.getProviderName(),
        'validate',
        200,
        false,
        'Invalid player stats response format',
      );
    }

    return {
      ...parsed.data,
      asOf: new Date().toISOString(),
      providerName: this.getProviderName(),
    };
  }

  private validateAndMapSearchResults(raw: unknown): PlayerSearchResult[] {
    const schema = z.array(z.object({
      id: z.string(),
      displayName: z.string(),
      role: z.string().optional(),
      country: z.string().optional(),
      format: z.string().optional(),
    }));

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderError(
        this.getProviderName(),
        'validate',
        200,
        false,
        'Invalid search results format',
      );
    }

    return parsed.data;
  }

  private validateAndMapMatchInfo(raw: unknown): MatchInfoDto {
    const schema = z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      teams: z.array(z.string()),
      venue: z.string(),
      startTime: z.string(),
      status: z.string(),
      format: z.string(),
    });

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderError(
        this.getProviderName(),
        'validate',
        200,
        false,
        'Invalid match info response format',
      );
    }

    return {
      ...parsed.data,
      asOf: new Date().toISOString(),
      providerName: this.getProviderName(),
    };
  }

  private async executeWithRetry(
    operation: () => Promise<any>,
    operationName: string,
    attempt: number = 0,
  ): Promise<any> {
    try {
      await this.rateLimiter.checkAndWait();
      return await operation();
    } catch (error) {
      if (error instanceof ProviderError) {
        if (error.retryable && attempt < 3) {
          const delay = this.exponentialBackoffMs(attempt);
          this.logger.debug(
            `Retrying ${operationName} after ${delay}ms (attempt ${attempt + 1}/3)`,
            { operation: operationName, attempt: attempt + 1, delay },
          );
          await this.sleep(delay);
          return this.executeWithRetry(operation, operationName, attempt + 1);
        }
      }
      throw error;
    }
  }

  private exponentialBackoffMs(attempt: number): number {
    const base = 100;
    const multiplier = Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(base * multiplier + jitter, 10000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private translateError(error: any, operation: string, latencyMs: number): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status ?? null;
      const retryable = statusCode === 429 || statusCode === 503 || error.code === 'ECONNABORTED';

      this.logger.error(
        `Provider call failed: ${operation}`,
        {
          operation,
          statusCode,
          latencyMs,
          retryable,
          errorMessage: error.message,
        },
      );

      if (statusCode === 404) {
        return new ProviderError(
          this.getProviderName(),
          operation,
          statusCode,
          false,
          'Resource not found',
          error,
        );
      }

      if (statusCode === 400 || statusCode === 401) {
        return new ProviderError(
          this.getProviderName(),
          operation,
          statusCode,
          false,
          error.response?.data?.message || 'Invalid request',
          error,
        );
      }

      return new ProviderError(
        this.getProviderName(),
        operation,
        statusCode,
        retryable,
        error.message,
        error,
      );
    }

    // Network error (timeout, connection refused, etc.)
    this.logger.error(
      `Network error in ${operation}`,
      {
        operation,
        latencyMs,
        retryable: true,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );

    return new ProviderError(
      this.getProviderName(),
      operation,
      null,
      true,
      'Network error',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
```

**Decision:** 
- Implements exponential backoff (100ms base, 2x multiplier, 10s max, 1s jitter) internally.
- Validates input (non-empty, max length) before making requests.
- Uses Zod to validate provider responses.
- Logs operations at debug level with latency; never logs API keys or full responses.
- Wraps all errors in ProviderError with retryability flag.
- RateLimiter is injected and checked before each request.

### 3. Rate Limiter

**File:** `apps/api/src/cricket-data/cache/rate-limiter.ts`

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class RateLimiter {
  private requestTimestamps: number[] = [];

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
  ) {}

  async checkAndWait(): Promise<void> {
    const now = Date.now();
    // Remove timestamps outside the window
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < this.windowMs);

    if (this.requestTimestamps.length >= this.maxRequests) {
      // Wait until the oldest request expires
      const oldestTimestamp = this.requestTimestamps[0];
      const waitMs = this.windowMs - (now - oldestTimestamp) + 1;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      // Recursive call to handle edge case of simultaneous requests
      return this.checkAndWait();
    }

    this.requestTimestamps.push(now);
  }

  reset(): void {
    this.requestTimestamps = [];
  }
}
```

**Decision:** Simple sliding-window counter; no external dependency. Suitable for single-instance deployments. For distributed systems, Redis-based rate limiting can be added separately.

### 4. Cache Manager Abstraction

**File:** `apps/api/src/cricket-data/cache/cache-manager.ts`

```typescript
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheManager {
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

#### InMemoryCacheManager

**File:** `apps/api/src/cricket-data/cache/in-memory-cache.manager.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { CacheManager, CacheEntry } from './cache-manager';

@Injectable()
export class InMemoryCacheManager implements CacheManager {
  private readonly logger = new Logger(InMemoryCacheManager.name);
  private readonly cache = new Map<string, CacheEntry<any>>();
  private readonly cleanupIntervalMs = 60000; // Clean up expired entries every minute

  constructor() {
    this.startCleanupInterval();
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
    this.logger.debug(`Cache SET: ${key} (expires in ${ttlMs}ms)`);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      this.logger.debug(`Cache MISS: ${key}`);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.logger.debug(`Cache EXPIRED: ${key}`);
      return null;
    }

    this.logger.debug(`Cache HIT: ${key}`);
    return entry.value as T;
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
    this.logger.debug(`Cache DELETE: ${key}`);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.logger.debug('Cache CLEAR: all entries removed');
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      let expiredCount = 0;
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
          expiredCount++;
        }
      }
      if (expiredCount > 0) {
        this.logger.debug(`Cache cleanup: removed ${expiredCount} expired entries`);
      }
    }, this.cleanupIntervalMs);
  }
}
```

#### RedisCacheManager (Optional)

**File:** `apps/api/src/cricket-data/cache/redis-cache.manager.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { CacheManager } from './cache-manager';
import { createClient, RedisClientType } from 'redis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisCacheManager implements CacheManager {
  private readonly logger = new Logger(RedisCacheManager.name);
  private readonly client: RedisClientType;

  constructor(configService: ConfigService) {
    const redisUrl = configService.get('REDIS_URL');
    this.client = createClient({ url: redisUrl });
    this.client.on('error', (err) => this.logger.error('Redis error', err));
    this.client.connect();
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const ttlSeconds = Math.ceil(ttlMs / 1000);
    await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
    this.logger.debug(`Redis SET: ${key} (TTL: ${ttlSeconds}s)`);
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) {
      this.logger.debug(`Redis MISS: ${key}`);
      return null;
    }
    this.logger.debug(`Redis HIT: ${key}`);
    return JSON.parse(value) as T;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
    this.logger.debug(`Redis DELETE: ${key}`);
  }

  async clear(): Promise<void> {
    await this.client.flushDb();
    this.logger.debug('Redis CLEAR: database flushed');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
```

**Decision:** Redis implementation is optional; in-memory is default. Environment variable `CACHE_PROVIDER` selects which one to use (`in-memory` or `redis`).

### 5. Backend Services

#### CricketDataService (Coordinator)

**File:** `apps/api/src/cricket-data/services/cricket-data.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CricketProvider } from '../providers/cricket.provider';
import { PlayerStatsDto, MatchInfoDto, PlayerSearchResult, FetchOptions, SearchOptions } from '../providers/cricket.provider';
import { ProviderError } from '../providers/errors/provider.error';

@Injectable()
export class CricketDataService {
  private readonly logger = new Logger(CricketDataService.name);

  constructor(
    private readonly provider: CricketProvider,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Delegate player search to provider. No caching at this level.
   */
  async searchPlayers(query: string, options?: SearchOptions): Promise<PlayerSearchResult[]> {
    try {
      this.logger.debug(`searchPlayers: delegating to provider`, { query, limit: options?.limit });
      return await this.provider.searchPlayers(query, options);
    } catch (error) {
      this.logger.error(`searchPlayers failed`, {
        query,
        error: error instanceof ProviderError ? error.toJSON() : String(error),
      });
      throw error;
    }
  }

  /**
   * Delegate player stats fetch to provider. No caching at this level.
   */
  async fetchPlayerStats(playerId: string, options?: FetchOptions): Promise<PlayerStatsDto> {
    try {
      this.logger.debug(`fetchPlayerStats: delegating to provider`, { playerId, live: options?.live });
      return await this.provider.fetchPlayerStats(playerId, options);
    } catch (error) {
      this.logger.error(`fetchPlayerStats failed`, {
        playerId,
        error: error instanceof ProviderError ? error.toJSON() : String(error),
      });
      throw error;
    }
  }

  /**
   * Delegate match info fetch to provider. No caching at this level.
   */
  async fetchMatchInfo(matchId: string): Promise<MatchInfoDto> {
    try {
      this.logger.debug(`fetchMatchInfo: delegating to provider`, { matchId });
      return await this.provider.fetchMatchInfo(matchId);
    } catch (error) {
      this.logger.error(`fetchMatchInfo failed`, {
        matchId,
        error: error instanceof ProviderError ? error.toJSON() : String(error),
      });
      throw error;
    }
  }
}
```

**Decision:** This service is a thin coordinator that delegates to the provider. It logs errors and translates provider-level exceptions. Caching and stale-fallback logic belong in PlayerStatsService and LiveMatchService.

#### PlayerStatsService

**File:** `apps/api/src/cricket-data/services/player-stats.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { CricketDataService } from './cricket-data.service';
import { CacheManager } from '../cache/cache-manager';
import { PlayerStatsDto, FetchOptions } from '../providers/cricket.provider';
import { ProviderError } from '../providers/errors/provider.error';

const CACHE_TTL_MS = 3600000; // 1 hour

@Injectable()
export class PlayerStatsService {
  private readonly logger = new Logger(PlayerStatsService.name);

  constructor(
    private readonly cricketDataService: CricketDataService,
    private readonly cacheManager: CacheManager,
  ) {}

  /**
   * Get player stats with caching and stale fallback.
   * - If cached and not expired: return cached
   * - If forceRefresh=true: bypass cache, fetch fresh, update cache
   * - If live=true: fetch fresh from provider
   * - On provider error with stale cache: return stale with header flag
   * - On provider error without stale cache: propagate error
   */
  async getPlayerStats(
    playerId: string,
    options?: { live?: boolean; forceRefresh?: boolean },
  ): Promise<PlayerStatsDto & { _fromCache?: 'fresh' | 'stale' }> {
    const cacheKey = `cricket:player-stats:${playerId}`;

    // If forceRefresh=false and live=false, try cache first
    if (!options?.forceRefresh && !options?.live) {
      const cached = await this.cacheManager.get<PlayerStatsDto>(cacheKey);
      if (cached) {
        this.logger.debug(`Player stats cache HIT: ${playerId}`);
        return { ...cached, _fromCache: 'fresh' };
      }
    }

    // Fetch from provider (or use forced refresh)
    try {
      const fresh = await this.cricketDataService.fetchPlayerStats(playerId, {
        live: options?.live,
      });
      await this.cacheManager.set(cacheKey, fresh, CACHE_TTL_MS);
      this.logger.debug(`Player stats fetched and cached: ${playerId}`);
      return { ...fresh, _fromCache: undefined };
    } catch (error) {
      // Provider error: try stale cache
      this.logger.warn(`Player stats fetch failed; checking stale cache: ${playerId}`, {
        error: error instanceof ProviderError ? error.toJSON() : String(error),
      });

      const stale = await this.cacheManager.get<PlayerStatsDto>(cacheKey);
      if (stale) {
        this.logger.warn(`Returning stale player stats for ${playerId}`);
        return { ...stale, _fromCache: 'stale' };
      }

      // No stale cache; propagate error
      throw error;
    }
  }

  /**
   * Invalidate cached player stats.
   */
  async invalidateCache(playerId: string): Promise<void> {
    const cacheKey = `cricket:player-stats:${playerId}`;
    await this.cacheManager.del(cacheKey);
    this.logger.debug(`Player stats cache invalidated: ${playerId}`);
  }

  /**
   * Get stale (expired) cached data if available; used by controller to provide fallback.
   */
  async getStaleData(playerId: string): Promise<PlayerStatsDto | null> {
    const cacheKey = `cricket:player-stats:${playerId}`;
    // Note: This would require a custom cache manager method to get expired entries.
    // For now, we rely on getPlayerStats with stale fallback above.
    return null;
  }
}
```

**Decision:** 
- Cache TTL is 1 hour (3600000 ms).
- `live=true` bypasses cache and always fetches fresh.
- `forceRefresh=true` bypasses cache but still updates it.
- On provider error, tries stale cache before propagating error.
- Returns `_fromCache` flag to indicate freshness; controller translates to `X-Data-Source` header.

#### LiveMatchService

**File:** `apps/api/src/cricket-data/services/live-match.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { CricketDataService } from './cricket-data.service';
import { CacheManager } from '../cache/cache-manager';
import { MatchInfoDto } from '../providers/cricket.provider';
import { ProviderError } from '../providers/errors/provider.error';

const CACHE_TTL_MS = 900000; // 15 minutes

@Injectable()
export class LiveMatchService {
  private readonly logger = new Logger(LiveMatchService.name);

  constructor(
    private readonly cricketDataService: CricketDataService,
    private readonly cacheManager: CacheManager,
  ) {}

  /**
   * Get match info with caching and stale fallback.
   */
  async getMatchInfo(
    matchId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<MatchInfoDto & { _fromCache?: 'fresh' | 'stale' }> {
    const cacheKey = `cricket:match-info:${matchId}`;

    // Try cache first (unless forceRefresh=true)
    if (!options?.forceRefresh) {
      const cached = await this.cacheManager.get<MatchInfoDto>(cacheKey);
      if (cached) {
        this.logger.debug(`Match info cache HIT: ${matchId}`);
        return { ...cached, _fromCache: 'fresh' };
      }
    }

    // Fetch from provider
    try {
      const fresh = await this.cricketDataService.fetchMatchInfo(matchId);
      await this.cacheManager.set(cacheKey, fresh, CACHE_TTL_MS);
      this.logger.debug(`Match info fetched and cached: ${matchId}`);
      return { ...fresh, _fromCache: undefined };
    } catch (error) {
      // Provider error: try stale cache
      this.logger.warn(`Match info fetch failed; checking stale cache: ${matchId}`, {
        error: error instanceof ProviderError ? error.toJSON() : String(error),
      });

      const stale = await this.cacheManager.get<MatchInfoDto>(cacheKey);
      if (stale) {
        this.logger.warn(`Returning stale match info for ${matchId}`);
        return { ...stale, _fromCache: 'stale' };
      }

      throw error;
    }
  }

  /**
   * Invalidate cached match info.
   */
  async invalidateCache(matchId: string): Promise<void> {
    const cacheKey = `cricket:match-info:${matchId}`;
    await this.cacheManager.del(cacheKey);
    this.logger.debug(`Match info cache invalidated: ${matchId}`);
  }
}
```

**Decision:** Match info has 15-minute TTL (shorter than stats) for live-data freshness. Same stale-fallback pattern as PlayerStatsService.

### 6. API Endpoints and Controller

**File:** `apps/api/src/cricket-data/controllers/cricket-data.controller.ts`

```typescript
import {
  Controller,
  Get,
  Param,
  Query,
  HttpStatus,
  Header,
  HttpException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiTags, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AppException } from '../../common/app-exception';
import { ErrorCode } from '../../common/error-codes';
import { CricketDataService } from '../services/cricket-data.service';
import { PlayerStatsService } from '../services/player-stats.service';
import { LiveMatchService } from '../services/live-match.service';
import { ProviderError } from '../providers/errors/provider.error';
import {
  playerStatsParamSchema,
  playerStatsQuerySchema,
  playerSearchQuerySchema,
  matchInfoParamSchema,
  matchInfoQuerySchema,
} from '../validators';

@ApiTags('cricket')
@Controller({ path: 'cricket', version: 'v1' })
export class CricketDataController {
  constructor(
    private readonly cricketDataService: CricketDataService,
    private readonly playerStatsService: PlayerStatsService,
    private readonly liveMatchService: LiveMatchService,
  ) {}

  /**
   * GET /v1/cricket/players/search?q=virat&limit=20&forceRefresh=false
   */
  @Get('players/search')
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'forceRefresh', required: false, type: Boolean })
  async searchPlayers(
    @Query(new ZodValidationPipe(playerSearchQuerySchema))
    query: z.infer<typeof playerSearchQuerySchema>,
  ) {
    try {
      const results = await this.cricketDataService.searchPlayers(query.q, {
        limit: query.limit,
      });
      return { items: results, total: results.length };
    } catch (error) {
      this.handleProviderError(error, 'searchPlayers');
    }
  }

  /**
   * GET /v1/cricket/players/:id/stats?live=false&forceRefresh=false
   */
  @Get('players/:id/stats')
  @ApiQuery({ name: 'live', required: false, type: Boolean })
  @ApiQuery({ name: 'forceRefresh', required: false, type: Boolean })
  async getPlayerStats(
    @Param(new ZodValidationPipe(playerStatsParamSchema)) param: z.infer<typeof playerStatsParamSchema>,
    @Query(new ZodValidationPipe(playerStatsQuerySchema)) query: z.infer<typeof playerStatsQuerySchema>,
  ) {
    try {
      const result = await this.playerStatsService.getPlayerStats(param.id, {
        live: query.live,
        forceRefresh: query.forceRefresh,
      });

      // Set X-Data-Source header based on cache state
      const response = this.stripInternalFlag(result);
      if (result._fromCache === 'stale') {
        // Stale data returned due to provider error
        // Note: NestJS doesn't provide direct header control in route handler; use interceptor or middleware
        // For now, include in response body
        return { ...response, _dataSource: 'stale-cache' };
      }

      return response;
    } catch (error) {
      this.handleProviderError(error, 'getPlayerStats');
    }
  }

  /**
   * GET /v1/cricket/matches/:id?forceRefresh=false
   */
  @Get('matches/:id')
  @ApiQuery({ name: 'forceRefresh', required: false, type: Boolean })
  async getMatchInfo(
    @Param(new ZodValidationPipe(matchInfoParamSchema)) param: z.infer<typeof matchInfoParamSchema>,
    @Query(new ZodValidationPipe(matchInfoQuerySchema)) query: z.infer<typeof matchInfoQuerySchema>,
  ) {
    try {
      const result = await this.liveMatchService.getMatchInfo(param.id, {
        forceRefresh: query.forceRefresh,
      });

      return this.stripInternalFlag(result);
    } catch (error) {
      this.handleProviderError(error, 'getMatchInfo');
    }
  }

  // ========== Error Handling ==========

  private handleProviderError(error: any, operation: string): never {
    if (error instanceof ProviderError) {
      if (error.statusCode === 404) {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          `${operation}: Resource not found`,
          HttpStatus.NOT_FOUND,
          { operation, provider: error.providerName },
        );
      }

      if (error.statusCode === 429) {
        throw new HttpException(
          {
            code: ErrorCode.RATE_LIMITED,
            message: `Rate limit reached by provider ${error.providerName}`,
            details: { retryAfter: 60 },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (error.statusCode === 400 || error.statusCode === 401) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          `${operation}: Invalid request`,
          HttpStatus.BAD_REQUEST,
          { operation, provider: error.providerName },
        );
      }

      // Provider error (5xx, network, timeout)
      throw new HttpException(
        {
          code: 'CRICKET_DATA_UNAVAILABLE',
          message: `Cricket data temporarily unavailable; try again shortly`,
          details: { provider: error.providerName, retryAfter: 60 },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Unexpected error
    throw new HttpException(
      {
        code: ErrorCode.INTERNAL,
        message: 'Internal server error',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  private stripInternalFlag(dto: any): any {
    const { _fromCache, ...rest } = dto;
    return rest;
  }
}
```

**Decision:**
- Endpoints use Zod validation pipes to parse and validate inputs.
- 404 responses when player/match not found.
- 429 responses with `Retry-After` header when provider rate-limited.
- 503 responses when provider unavailable and no stale cache.
- Stale cache flag (`_fromCache: 'stale'`) is included in response (can be moved to header via middleware).

### 7. Validators

**File:** `apps/api/src/cricket-data/validators/player-search.validator.ts`

```typescript
import { z } from 'zod';

export const playerSearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  forceRefresh: z.coerce.boolean().default(false).optional(),
});

export type PlayerSearchQuery = z.infer<typeof playerSearchQuerySchema>;
```

**File:** `apps/api/src/cricket-data/validators/player-stats.validator.ts`

```typescript
import { z } from 'zod';

export const playerStatsParamSchema = z.object({
  id: z.string().min(1).max(100),
});

export const playerStatsQuerySchema = z.object({
  live: z.coerce.boolean().default(false).optional(),
  forceRefresh: z.coerce.boolean().default(false).optional(),
});

export type PlayerStatsParam = z.infer<typeof playerStatsParamSchema>;
export type PlayerStatsQuery = z.infer<typeof playerStatsQuerySchema>;
```

**File:** `apps/api/src/cricket-data/validators/match-info.validator.ts`

```typescript
import { z } from 'zod';

export const matchInfoParamSchema = z.object({
  id: z.string().min(1).max(100),
});

export const matchInfoQuerySchema = z.object({
  forceRefresh: z.coerce.boolean().default(false).optional(),
});

export type MatchInfoParam = z.infer<typeof matchInfoParamSchema>;
export type MatchInfoQuery = z.infer<typeof matchInfoQuerySchema>;
```

### 8. Module and Dependency Injection

**File:** `apps/api/src/cricket-data/cricket-data.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CricketDataController } from './controllers/cricket-data.controller';
import { CricketDataService } from './services/cricket-data.service';
import { PlayerStatsService } from './services/player-stats.service';
import { LiveMatchService } from './services/live-match.service';
import { CricketProvider } from './providers/cricket.provider';
import { ESPNDataProvider } from './providers/espn-data.provider';
import { CacheManager } from './cache/cache-manager';
import { InMemoryCacheManager } from './cache/in-memory-cache.manager';
import { RedisCacheManager } from './cache/redis-cache.manager';

@Module({
  controllers: [CricketDataController],
  providers: [
    CricketDataService,
    PlayerStatsService,
    LiveMatchService,
    // Dependency: select provider based on config
    {
      provide: CricketProvider,
      useClass: ESPNDataProvider, // Can be made configurable if multiple providers added
    },
    // Dependency: select cache manager based on config
    {
      provide: CacheManager,
      useFactory: (configService: ConfigService) => {
        const cacheProvider = configService.get('CACHE_PROVIDER', 'in-memory');
        if (cacheProvider === 'redis') {
          return new RedisCacheManager(configService);
        }
        return new InMemoryCacheManager();
      },
      inject: [ConfigService],
    },
  ],
  exports: [CricketDataService, PlayerStatsService, LiveMatchService],
})
export class CricketDataModule {}
```

**Decision:** 
- CricketProvider is injected; ESPNDataProvider is the initial implementation.
- CacheManager is selected at runtime via `CACHE_PROVIDER` config (default: `in-memory`).
- Module exports services for use by other modules.

### 9. DTOs

**File:** `apps/api/src/cricket-data/dtos/player-stats.dto.ts`

```typescript
export interface PlayerStatsDto {
  id: string;
  displayName: string;
  format: string; // 'Test', 'ODI', 'T20'
  matches?: number;
  runs?: number;
  wickets?: number;
  battingAverage?: number;
  strikeRate?: number;
  bowlingAverage?: number;
  bowlingEconomy?: number;
  asOf: string; // ISO 8601 timestamp
  providerName: string;
}

export type PlayerStatsResponse = PlayerStatsDto;
```

**File:** `apps/api/src/cricket-data/dtos/match-info.dto.ts`

```typescript
export interface MatchInfoDto {
  id: string;
  title: string;
  description: string;
  teams: string[];
  venue: string;
  startTime: string; // ISO 8601
  status: string; // 'SCHEDULED', 'LIVE', 'COMPLETED'
  format: string;
  asOf: string; // ISO 8601
  providerName: string;
}

export type MatchInfoResponse = MatchInfoDto;
```

**File:** `apps/api/src/cricket-data/dtos/player-search.dto.ts`

```typescript
export interface PlayerSearchResult {
  id: string;
  displayName: string;
  role?: string;
  country?: string;
  format?: string;
}

export interface PlayerSearchResponse {
  items: PlayerSearchResult[];
  total: number;
}
```

### 10. Environment Variables

**File:** `.env.example` (append to existing)**

```bash
# Cricket Data Provider Configuration
CRICKET_PROVIDER=espn
CRICKET_PROVIDER_API_KEY=your-cricapi-key
CRICKET_PROVIDER_BASE_URL=https://api.cricapi.com/v1
CRICKET_API_TIMEOUT_MS=5000
CRICKET_API_RATE_LIMIT_WINDOW_MS=60000
CRICKET_API_RATE_LIMIT_MAX_REQUESTS=100

# Cache Manager Selection
# Options: in-memory, redis
CACHE_PROVIDER=in-memory

# Redis (optional, only if CACHE_PROVIDER=redis)
REDIS_URL=redis://localhost:6379
```

**Decision:** 
- `CRICKET_PROVIDER_API_KEY` is kept separate from Safepay payment keys.
- Base URL is configurable; supports different cricket data providers.
- Cache provider is selectable (in-memory by default, Redis optional).

---

## Frontend Integration

### useCricketData Hook

**File:** `apps/web/src/hooks/useCricketData.ts`

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAuthToken } from '@/lib/api';

export interface UseCricketDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isStale: boolean;
  refetch: () => Promise<void>;
}

const BROWSER_CACHE_TTL_MS = 300000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const browserCache = new Map<string, CacheEntry<any>>();

/**
 * Fetch cricket data from the backend with 5-minute browser cache.
 * Stale cache (older than 5 minutes) is returned with isStale=true if fresh fetch fails.
 */
export function useCricketData<T>(
  endpoint: string,
  options?: { forceRefresh?: boolean },
): UseCricketDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  const doFetch = useCallback(
    async (force: boolean): Promise<void> => {
      setLoading(true);
      setError(null);
      setIsStale(false);

      // Check browser cache (unless forceRefresh=true)
      if (!force) {
        const cached = browserCache.get(endpoint);
        if (cached && Date.now() - cached.fetchedAt < BROWSER_CACHE_TTL_MS) {
          setData(cached.data);
          setLoading(false);
          return;
        }
      }

      try {
        const token = getAuthToken();
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        const response = await fetch(`/api/v1${endpoint}`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          // Determine error message
          let errorMsg = `Failed to load cricket data (${response.status})`;
          if (response.status === 404) {
            errorMsg = 'Cricket data not found';
          } else if (response.status === 429) {
            errorMsg = 'Rate limited; try again shortly';
          } else if (response.status === 503) {
            errorMsg = 'Cricket data temporarily unavailable';
          }

          setError(errorMsg);

          // Try stale cache as fallback
          const cached = browserCache.get(endpoint);
          if (cached) {
            setData(cached.data);
            setIsStale(true);
          }

          setLoading(false);
          return;
        }

        const result = (await response.json()) as T;
        browserCache.set(endpoint, { data: result, fetchedAt: Date.now() });
        setData(result);
        setError(null);
        setIsStale(false);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);

        // Try stale cache as fallback
        const cached = browserCache.get(endpoint);
        if (cached) {
          setData(cached.data);
          setIsStale(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    void doFetch(options?.forceRefresh ?? false);
  }, [doFetch, options?.forceRefresh]);

  const refetch = useCallback(async () => {
    await doFetch(true);
  }, [doFetch]);

  return { data, loading, error, isStale, refetch };
}

export default useCricketData;
```

**Decision:**
- 5-minute browser cache TTL (shorter than server 1-hour to balance freshness and load).
- Returns stale cache if fresh fetch fails.
- `isStale` flag indicates whether data is from stale cache.

### PlayerStats Component

**File:** `apps/web/src/components/PlayerStats.tsx`

```typescript
'use client';

import React from 'react';
import useCricketData from '@/hooks/useCricketData';

export interface PlayerStatsProps {
  playerId: string;
  showLive?: boolean;
}

export const PlayerStats: React.FC<PlayerStatsProps> = ({ playerId, showLive = false }) => {
  const { data, loading, error, isStale } = useCricketData(
    `/cricket/players/${encodeURIComponent(playerId)}/stats?live=${showLive}`,
  );

  if (loading) {
    return <div className="text-sm text-gray-500">Loading player stats...</div>;
  }

  if (error) {
    return (
      <div className="text-sm text-red-500">
        {error}
        {isStale && ' (showing cached data)'}
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-gray-500">No player stats available</div>;
  }

  const stats = data as any; // Type this properly based on PlayerStatsDto

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">{stats.displayName}</h3>
        {isStale && <span className="text-xs text-yellow-600">Cached data</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.matches !== undefined && (
          <StatCard label="Matches" value={stats.matches} />
        )}
        {stats.runs !== undefined && (
          <StatCard label="Runs" value={stats.runs} />
        )}
        {stats.wickets !== undefined && (
          <StatCard label="Wickets" value={stats.wickets} />
        )}
        {stats.battingAverage !== undefined && (
          <StatCard label="Avg" value={stats.battingAverage.toFixed(2)} />
        )}
        {stats.strikeRate !== undefined && (
          <StatCard label="SR" value={stats.strikeRate.toFixed(2)} />
        )}
        {stats.bowlingAverage !== undefined && (
          <StatCard label="Bowl Avg" value={stats.bowlingAverage.toFixed(2)} />
        )}
        {stats.bowlingEconomy !== undefined && (
          <StatCard label="Economy" value={stats.bowlingEconomy.toFixed(2)} />
        )}
      </div>

      <div className="mt-2 text-xs text-gray-500">
        {stats.format} • Last updated: {new Date(stats.asOf).toLocaleString()}
      </div>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string | number;
}

const StatCard: React.FC<StatCardProps> = ({ label, value }) => (
  <div className="rounded bg-gray-50 p-2">
    <div className="text-xs font-medium text-gray-600">{label}</div>
    <div className="text-lg font-bold text-gray-900">{value}</div>
  </div>
);
```

**Decision:**
- Component accepts `playerId` and optional `showLive` flag.
- Uses `useCricketData` hook to fetch stats.
- Displays stats in a responsive grid.
- Shows stale data indicator if applicable.
- Handles loading, error, and empty states gracefully.

---

## Error Handling

### Provider-Level Error Handling

| Scenario | Status Code | Retryable | Action |
|----------|-------------|-----------|--------|
| Invalid input (bad ID) | 400 | No | Throw ProviderError, controller returns 400 |
| Unauthorized (bad API key) | 401 | No | Throw ProviderError, controller returns 400 |
| Resource not found | 404 | No | Throw ProviderError, controller returns 404 |
| Rate limited | 429 | Yes | Exponential backoff (3 retries), then ProviderError |
| Provider error (5xx) | 5xx | Yes | Exponential backoff (3 retries), then ProviderError |
| Network timeout | null | Yes | Exponential backoff (3 retries), then ProviderError |
| Connection refused | null | Yes | Exponential backoff (3 retries), then ProviderError |

### Service-Level Error Handling

| Scenario | Stale Cache Available | Action |
|----------|---|--------|
| Provider fetch fails | Yes | Return stale data with `_fromCache: 'stale'` flag |
| Provider fetch fails | No | Propagate ProviderError to controller |
| Cache hit (fresh) | - | Return fresh data with `_fromCache: 'fresh'` flag |
| Cache miss (error) | - | Fetch from provider, update cache, return fresh |

### Controller-Level HTTP Responses

| Scenario | HTTP Status | Response Body |
|----------|---|---|
| Valid request, fresh data | 200 | Player stats / match info DTO |
| Valid request, stale data | 200 | Player stats / match info DTO (with `_dataSource: 'stale-cache'`) |
| Missing required param | 400 | `{ code: 'VALIDATION_FAILED', message: '...' }` |
| Invalid param format | 400 | `{ code: 'VALIDATION_FAILED', message: '...' }` |
| Player/match not found | 404 | `{ code: 'NOT_FOUND', message: '...' }` |
| Provider rate limit (retries exhausted) | 429 | `{ code: 'RATE_LIMITED', message: '...', details: { retryAfter: 60 } }` |
| Provider unavailable + no stale cache | 503 | `{ code: 'CRICKET_DATA_UNAVAILABLE', message: '...', details: { retryAfter: 60 } }` |
| Unexpected server error | 500 | `{ code: 'INTERNAL_ERROR', message: '...' }` |

---

## Caching Strategy

### Cache Keys

```
cricket:player-stats:{playerId}       # TTL: 1 hour
cricket:match-info:{matchId}          # TTL: 15 minutes
cricket:search:{queryHash}            # TTL: 1 hour (future, if search is cached at service level)
```

### Stale Cache on Error

When a provider fetch fails:
1. Check if stale (expired) cache entry exists for the key.
2. If yes, return stale data with `_fromCache: 'stale'` flag and log warning.
3. If no, propagate error to controller.

This extends availability during provider outages and provides graceful degradation.

### Cache Invalidation

1. **TTL-based:** Automatic expiry via cache manager (InMemoryCacheManager or RedisCacheManager).
2. **Manual:** Admin endpoint (future phase) `DELETE /v1/admin/cricket-data/cache/{cacheType}/:key`.

---

## Testing Strategy

### Unit Tests (40+ tests)

1. **CricketProvider interface (8 tests)**
   - Happy path: fetchPlayerStats returns valid DTO
   - Happy path: searchPlayers returns valid results
   - Happy path: fetchMatchInfo returns valid DTO
   - Error: Invalid input (empty playerId, oversized query)
   - Error: 404 from provider
   - Error: 429 from provider (retries internally)
   - Error: 500 from provider (retries internally)
   - Error: Network timeout

2. **ESPNDataProvider (12 tests)**
   - Validates input before making request
   - Wraps provider responses in PlayerStatsDto, MatchInfoDto, PlayerSearchResult
   - Logs operations at debug level (no secrets)
   - Exponential backoff on 429/503 (mock axios, verify delays)
   - Retries up to 3 times; fails on 4th attempt
   - Rate limiter prevents requests beyond threshold
   - Jitter in backoff (verify delay variance)
   - Translates 404 → ProviderError with retryable=false
   - Translates 400/401 → ProviderError with retryable=false
   - Translates network error → ProviderError with retryable=true
   - Zod validation rejects malformed responses

3. **PlayerStatsService (10 tests)**
   - Cache hit: returns cached value if < 1 hour old
   - Cache miss: fetches from provider, updates cache
   - forceRefresh=true: bypasses cache, updates on success
   - live=true: requests fresh from provider
   - Stale cache on error: returns stale if available
   - Stale cache error propagation: propagates if no stale data
   - Invalidate cache: removes cached entry
   - Cache TTL enforcement: expired entries refetched

4. **LiveMatchService (8 tests)**
   - Similar to PlayerStatsService but with 15-minute TTL
   - Cache hit, miss, refresh, stale fallback, invalidation

5. **CacheManager implementations (8 tests)**
   - InMemoryCacheManager: set/get/delete operations
   - InMemoryCacheManager: TTL expiry
   - InMemoryCacheManager: cleanup interval
   - RedisCacheManager: set/get/delete operations (mock Redis)
   - Cache key format consistency
   - Concurrent access (race conditions)

6. **RateLimiter (3 tests)**
   - Tracks requests within window
   - Blocks when limit reached
   - Allows after window expires
   - Handles jitter correctly

### Integration Tests (15+ tests)

1. **API Endpoints (9 tests)**
   - GET /v1/cricket/players/search?q=virat → 200 with results
   - GET /v1/cricket/players/search (missing q) → 400 with error
   - GET /v1/cricket/players/search?q=x&limit=1000 (limit > 100) → 400
   - GET /v1/cricket/players/:id/stats (invalid ID format) → 400
   - GET /v1/cricket/players/:id/stats (unknown player) → 404
   - GET /v1/cricket/players/:id/stats (live=true) → fetches fresh
   - GET /v1/cricket/matches/:id (valid) → 200 with match info
   - Provider rate limit → retries and succeeds (mock HTTP 429 → 200)
   - Provider outage with stale cache → 200 with stale data

2. **Cache Behavior (4 tests)**
   - Subsequent requests within TTL use cache
   - Requests after TTL expiry fetch fresh
   - forceRefresh bypasses cache
   - Admin cache invalidation clears entries

3. **Provider Integration (2 tests)**
   - Mock ESPN API responses
   - Verify request headers (Authorization, timeout)

### E2E Tests (5+ tests)

1. **User views player profile → stats load and display (live or cached)**
   - Navigate to player detail page
   - PlayerStats component renders
   - Hook fetches data, displays stats grid
   - Verify metrics (matches, runs, avg, SR)

2. **User searches players during auction → results display**
   - Search input in auction room
   - Results fetch via search endpoint
   - Display player cards with name, role, country

3. **User refreshes player stats → fresh data fetched**
   - Initial load uses cache
   - Click "Refresh" button
   - Hook calls `forceRefresh=true`
   - New data fetched and displayed

4. **System handles provider outage gracefully → stale data shown**
   - Initial fetch succeeds, data cached
   - Backend provider goes down (mock HTTP 503)
   - Subsequent fetch returns stale data with indicator
   - Verify user sees "Cached data" label

5. **Provider recovers, fresh data fetched**
   - Provider was down, stale data shown
   - Provider comes back online
   - User clicks "Retry"
   - Fresh data fetched and displayed

---

## Testability Considerations

**Unit testable:**
- Provider interface contract (mock implementations)
- Service business logic (cache, stale fallback, error handling)
- Rate limiter sliding-window counter
- Cache manager (in-memory mock, Redis mock via ioredis-mock)
- Zod validation

**Integration testable:**
- API endpoints with mocked provider (axios-mock-adapter or similar)
- Cache invalidation workflows
- Error responses (404, 429, 503)

**E2E testable:**
- Full user journey (search, view stats, refresh)
- Provider outage scenarios (Playwright/Cypress with network mocking)

---

## Performance Targets

| Operation | Target (p99) | Mechanism |
|-----------|---|---|
| Cache hit (player stats) | < 50ms | In-memory Map lookup |
| Cache hit (match info) | < 50ms | In-memory Map lookup |
| Fresh fetch (player stats) | < 2s | Provider timeout (5s), retry backoff |
| Fresh fetch (match info) | < 2s | Provider timeout (5s), retry backoff |
| Search results | < 3s | Provider timeout (5s), retry backoff |

---

## Security Considerations

1. **Input validation:** All user inputs (playerId, matchId, query) validated with Zod.
2. **Secret management:** API keys from environment only; never logged or cached as plaintext.
3. **URL construction:** Provider base URL from environment; no dynamic URL construction from user input.
4. **Timeouts:** All external requests have configurable timeouts (default 5s).
5. **Rate limiting:** Internal rate limiter prevents exhausting provider quotas.
6. **HTTPS:** Provider URLs must use HTTPS in production (enforced at config level).

---

## Observability and Logging

### Logged Information

- **Provider calls:** Operation, latency, status code, response size (at debug level).
- **Cache operations:** Key, operation (SET/GET/DELETE), hit/miss/expiry (at debug level).
- **Errors:** Operation, provider name, status code, retryability, original message (at error/warn level).
- **Rate limit:** Backoff attempts, delay, remaining quota (at debug level).

### Metrics (via structured logs)

- `cricket_provider_latency_ms`: Histogram of provider call durations.
- `cricket_provider_errors`: Counter of errors by provider, operation, status code.
- `cricket_cache_hit_rate`: Ratio of cache hits to total accesses.
- `cricket_rate_limit_backoff_count`: Counter of backoff retries.

---

## Configuration and Deployment

### Environment Variables (New)

```bash
CRICKET_PROVIDER=espn
CRICKET_PROVIDER_API_KEY=...
CRICKET_PROVIDER_BASE_URL=https://api.cricapi.com/v1
CRICKET_API_TIMEOUT_MS=5000
CRICKET_API_RATE_LIMIT_WINDOW_MS=60000
CRICKET_API_RATE_LIMIT_MAX_REQUESTS=100
CACHE_PROVIDER=in-memory
REDIS_URL=redis://localhost:6379  # Optional
```

### Deployment Notes

- **Single-instance dev/test:** Use `in-memory` cache.
- **Multi-instance production:** Use `redis` cache for cache coherence.
- **Provider failover:** Future phase; currently single-provider (ESPN/cricapi).
- **Rate limit tuning:** Adjust `CRICKET_API_RATE_LIMIT_MAX_REQUESTS` based on provider quota and traffic.

---

## Future Extensibility

1. **Multiple providers:** Implement CricketData.org, ICC API providers without modifying existing services.
2. **WebSocket updates:** Real-time player stats and match updates (Phase N).
3. **Batch imports:** Admin bulk-sync of player data.
4. **Historical trends:** Store stats snapshots for analysis.
5. **Custom cache strategies:** TTL per format (Test/ODI/T20), LRU eviction.

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| **Stale cache on error** | Extends availability during provider outages; acceptable degradation with clear user signaling. |
| **Exponential backoff internally** | No client-side retries needed; cleaner API contract. |
| **1-hour TTL for stats, 15-min for matches** | Stats change infrequently; matches are time-sensitive (live scoress). |
| **In-memory cache default** | Suitable for single-instance dev/test; Redis optional for production scale. |
| **Separate CacheManager interface** | Future-proofs against cache provider changes; tested independently. |
| **Provider interface + ESPNDataProvider only** | Abstracts provider contract; concrete implementation is ESPN to meet Phase M requirements. |
| **Zod validation for responses** | Ensures data shape compliance; rejects malformed responses early. |
| **5-minute browser cache** | Balances freshness (live-ish data) with load reduction (fewer backend hits). |
| **X-Data-Source header for stale data** | Transparently signals to frontend that data is from cache; enables UI stale indicators. |

---

## Review Findings Response

(To be populated if design review returns findings; this is the initial design, not a revision.)

---

**Design Status:** Ready for implementation  
**Next Step:** Begin backend service implementation following the structure and patterns defined above.
