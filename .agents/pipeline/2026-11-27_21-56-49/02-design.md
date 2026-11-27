# Phase M: Live Cricket Data Integration — Technical Design

**Status:** Design  
**Version:** 1.0  
**Date:** 2026-11-27  
**Phase:** M  

---

## 1. Overview

Phase M introduces a provider-independent cricket data integration layer to fetch live and historical player statistics, match information, and player search results. The backend abstracts data sources through a `CricketProvider` interface and implements `ESPNDataProvider` as the initial concrete implementation. A new `cricket-data` module orchestrates provider calls with caching (Redis or in-memory fallback, 1-hour TTL), rate-limit backoff with exponential retry, and stale-cache fallback for resilience. Frontend components consume this data through a `useCricketData` hook with 5-minute browser cache. All provider configuration—URLs, API keys, TTL settings—flows through environment variables validated at startup. No hardcoded URLs or credentials exist in the codebase.

---

## 2. Technology Stack & Dependencies

### Backend
- **Framework:** NestJS (existing)
- **ORM:** Prisma (existing)
- **HTTP Client:** `axios` or Node.js built-in `fetch` (no breaking additions)
- **Cache Backends:**
  - Primary: Redis (via `ioredis` or `redis` npm package, if not already present)
  - Fallback: In-memory Map
- **Logging:** Pino (existing via `nestjs-pino`)
- **Configuration:** Zod + environment variables (existing pattern)
- **Testing:** Vitest (existing)

### Frontend
- **Framework:** React + TypeScript (existing)
- **Cache:** localStorage + in-memory Map (browser APIs, no new dependencies)
- **HTTP Client:** Existing fetch or axios (unchanged)
- **Testing:** Vitest (existing)

---

## 3. Backend Architecture

### 3.1 Module Structure

Create a new `cricket-data` module in `apps/api/src/cricket-data/` with the following file layout:

```
cricket-data/
├── providers/
│   ├── cricket.provider.ts                (interface)
│   ├── espn-data.provider.ts             (ESPN implementation)
│   └── cricket-provider.factory.ts       (factory for provider instantiation)
├── services/
│   ├── cricket-data.service.ts           (orchestration, caching, failover)
│   ├── player-stats.service.ts           (player stats enrichment)
│   └── live-match.service.ts             (match data retrieval)
├── cache/
│   ├── cache.service.ts                  (interface)
│   ├── redis-cache.service.ts            (Redis implementation)
│   └── memory-cache.service.ts           (in-memory fallback)
├── dtos/
│   ├── player-stats.dto.ts
│   ├── live-match.dto.ts
│   └── search.dto.ts
├── controllers/
│   └── cricket-data.controller.ts        (API endpoints)
├── __tests__/
│   ├── cricket-data.service.spec.ts
│   ├── player-stats.service.spec.ts
│   ├── live-match.service.spec.ts
│   ├── espn-data.provider.spec.ts
│   ├── cache.service.spec.ts
│   └── cricket-data.controller.spec.ts
├── types/
│   └── cricket-data.types.ts
├── validators/
│   └── cricket-data.validators.ts
├── constants/
│   └── cricket-data.constants.ts
└── cricket-data.module.ts
```

### 3.2 Provider Abstraction

#### CricketProvider Interface

**File:** `providers/cricket.provider.ts`

```typescript
export interface PlayerStatsResponse {
  playerId: string;
  displayName: string;
  role: 'BATTER' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKETKEEPER';
  country?: string;
  statistics: Array<{
    format: 'T20' | 'ODI' | 'TEST' | 'DOMESTIC_T20' | 'OTHER';
    matches: number;
    runs?: number;
    battingAverage?: number;
    strikeRate?: number;
    wickets?: number;
    bowlingAverage?: number;
    bowlingEconomy?: number;
  }>;
  asOf: Date;
  source: string; // e.g., "ESPN", "Cricket.com"
}

export interface LiveMatchResponse {
  matchId: string;
  teams: Array<{ name: string; code: string }>;
  format: 'T20' | 'ODI' | 'TEST';
  venue?: string;
  startTime: Date;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED';
  currentScore?: {
    team: string;
    runs: number;
    wickets: number;
    overs?: number;
  };
  result?: string;
  asOf: Date;
  source: string;
}

export interface PlayerSearchResponse {
  results: Array<{
    id: string;
    displayName: string;
    role: 'BATTER' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKETKEEPER';
    country?: string;
  }>;
  total: number;
  hasMore: boolean;
}

export interface CricketProvider {
  /**
   * Fetch player statistics by provider-specific player ID.
   * Throws CricketDataError if unavailable.
   */
  getPlayerStats(playerId: string): Promise<PlayerStatsResponse>;

  /**
   * Fetch live or scheduled match by provider-specific match ID.
   * Throws CricketDataError if unavailable.
   */
  getLiveMatch(matchId: string): Promise<LiveMatchResponse>;

  /**
   * Search players by name, with pagination.
   * Throws CricketDataError if unavailable.
   */
  searchPlayers(query: string, limit: number, offset: number): Promise<PlayerSearchResponse>;

  /**
   * Check if provider is healthy / available.
   * Returns true if provider is reachable; false otherwise.
   */
  isHealthy(): Promise<boolean>;
}
```

**Design Rationale:** The interface is provider-agnostic; each implementation translates provider-specific schemas to these unified DTOs. No business logic lives in the provider; it only fetches and transforms.

#### ESPNDataProvider Implementation

**File:** `providers/espn-data.provider.ts`

```typescript
export class ESPNDataProvider implements CricketProvider {
  private baseUrl: string;
  private apiKey?: string;
  private httpClient: HttpClient; // axios or fetch wrapper
  private retryConfig = { maxRetries: 3, initialDelayMs: 100 };

  constructor(
    baseUrl: string,
    apiKey?: string,
    private logger: Logger,
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async getPlayerStats(playerId: string): Promise<PlayerStatsResponse> {
    // Calls ESPN /players/{id}/stats endpoint
    // Maps ESPN schema to PlayerStatsResponse
    // Handles ESPN-specific error formats and quirks
    // Respects X-RateLimit-* headers
  }

  async getLiveMatch(matchId: string): Promise<LiveMatchResponse> {
    // Calls ESPN /matches/{id} endpoint
    // Maps ESPN match schema to LiveMatchResponse
  }

  async searchPlayers(
    query: string,
    limit: number,
    offset: number,
  ): Promise<PlayerSearchResponse> {
    // Calls ESPN /search?q=query&limit=limit&offset=offset endpoint
    // Paginates results
  }

  async isHealthy(): Promise<boolean> {
    // Lightweight health check; e.g., GET /status or HEAD request
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    // Implements exponential backoff on 429
    // Logs rate-limit events
    // Retries up to 3 times
  }

  private mapEspnStats(espnResponse: unknown): PlayerStatsResponse {
    // Normalize ESPN data to unified schema
  }
}
```

**Design Rationale:**
- Each provider is a self-contained class; no shared state between instances.
- Rate-limit detection (HTTP 429, X-RateLimit-* headers) is provider-specific because headers vary.
- Retry logic is internal to the provider; orchestrator does not need to know about retries.
- Provider is instantiated via factory (see below) and injected into services.

#### Provider Factory

**File:** `providers/cricket-provider.factory.ts`

```typescript
export class CricketProviderFactory {
  static create(
    providerName: string,
    config: CricketDataConfig,
    logger: Logger,
  ): CricketProvider {
    switch (providerName) {
      case 'espn':
        return new ESPNDataProvider(
          config.espnBaseUrl,
          config.espnApiKey,
          logger,
        );
      // Future: case 'cricket-com': ...
      default:
        throw new Error(`Unknown cricket provider: ${providerName}`);
    }
  }
}
```

---

### 3.3 Cache Abstraction

#### CacheService Interface

**File:** `cache/cache.service.ts`

```typescript
export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getWithFallback<T>(key: string): Promise<T | null>; // Returns expired data for stale fallback
}
```

**Design Rationale:** Abstraction allows swapping Redis for in-memory without touching business logic. `getWithFallback` enables stale-cache fallback: return expired but cached data if fresh fetch fails.

#### Redis Implementation

**File:** `cache/redis-cache.service.ts`

```typescript
export class RedisCacheService implements CacheService {
  private redis: RedisClient;

  constructor(redisUrl: string, logger: Logger) {
    this.redis = createClient({ url: redisUrl });
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.setEx(key, ttlSeconds, JSON.stringify(value));
  }

  async getWithFallback<T>(key: string): Promise<T | null> {
    // GET without expiration check; Redis returns expired data if TTL > 0
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
}
```

**Design Rationale:** Wraps Redis operations with JSON serialization. If Redis is unavailable at startup, falls back to in-memory cache (see module initialization).

#### In-Memory Fallback

**File:** `cache/memory-cache.service.ts`

```typescript
export class MemoryCacheService implements CacheService {
  private cache = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async getWithFallback<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    return entry ? (entry.value as T) : null; // Return even if expired
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}
```

**Design Rationale:** Simple Map-based cache with explicit TTL tracking. Used when Redis is unavailable or in development. Lacks cross-instance sharing, so unsuitable for clustered production, but acceptable for fallback.

---

### 3.4 CricketDataService (Orchestration)

**File:** `services/cricket-data.service.ts`

The orchestration layer handles provider selection, failover, caching, rate-limit backoff, and stale-cache fallback.

```typescript
export class CricketDataService {
  private primaryProvider: CricketProvider;
  private fallbackProvider?: CricketProvider;
  private cache: CacheService;
  private rateLimitState = new Map<string, RateLimitInfo>();

  constructor(
    private config: CricketDataConfig,
    private cache: CacheService,
    private logger: Logger,
  ) {
    this.primaryProvider = CricketProviderFactory.create(
      config.primaryProvider,
      config,
      logger,
    );
    if (config.fallbackProvider) {
      this.fallbackProvider = CricketProviderFactory.create(
        config.fallbackProvider,
        config,
        logger,
      );
    }
  }

  async getPlayerStats(
    playerId: string,
    forceRefresh: boolean = false,
  ): Promise<{ data: PlayerStatsResponse; isCached: boolean }> {
    const cacheKey = this.buildCacheKey('player-stats', playerId);

    // Check cache first unless forceRefresh
    if (!forceRefresh) {
      const cached = await this.cache.get<PlayerStatsResponse>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for player stats: ${playerId}`);
        return { data: cached, isCached: true };
      }
    }

    // Try primary provider
    try {
      const data = await this.primaryProvider.getPlayerStats(playerId);
      await this.cache.set(
        cacheKey,
        data,
        this.config.cacheTtlSeconds,
      );
      return { data, isCached: false };
    } catch (error) {
      this.logger.warn(`Primary provider failed for player stats: ${error.message}`);

      // Try fallback provider
      if (this.fallbackProvider) {
        try {
          const data = await this.fallbackProvider.getPlayerStats(playerId);
          await this.cache.set(cacheKey, data, this.config.cacheTtlSeconds);
          return { data, isCached: false };
        } catch (fallbackError) {
          this.logger.warn(`Fallback provider also failed: ${fallbackError.message}`);
        }
      }

      // Both providers failed; return stale cache if available
      const staleCached = await this.cache.getWithFallback<PlayerStatsResponse>(
        cacheKey,
      );
      if (staleCached) {
        this.logger.info(
          `Both providers failed; returning stale cache for player stats: ${playerId}`,
        );
        return { data: staleCached, isCached: true };
      }

      // No cache; throw error
      throw new CricketDataError(
        `Failed to fetch player stats for ${playerId}: all providers exhausted`,
        'PROVIDER_UNAVAILABLE',
        { playerId },
      );
    }
  }

  async getLiveMatch(
    matchId: string,
    forceRefresh: boolean = false,
  ): Promise<{ data: LiveMatchResponse; isCached: boolean }> {
    // Similar pattern to getPlayerStats, but with shorter TTL if match is live
    const cacheKey = this.buildCacheKey('match', matchId);

    if (!forceRefresh) {
      const cached = await this.cache.get<LiveMatchResponse>(cacheKey);
      if (cached) {
        return { data: cached, isCached: true };
      }
    }

    try {
      const data = await this.primaryProvider.getLiveMatch(matchId);
      const ttl =
        data.status === 'LIVE'
          ? this.config.liveMatchCacheTtlSeconds
          : this.config.cacheTtlSeconds;
      await this.cache.set(cacheKey, data, ttl);
      return { data, isCached: false };
    } catch (error) {
      if (this.fallbackProvider) {
        try {
          const data = await this.fallbackProvider.getLiveMatch(matchId);
          const ttl =
            data.status === 'LIVE'
              ? this.config.liveMatchCacheTtlSeconds
              : this.config.cacheTtlSeconds;
          await this.cache.set(cacheKey, data, ttl);
          return { data, isCached: false };
        } catch (fallbackError) {
          // Fall through to stale cache
        }
      }

      const staleCached = await this.cache.getWithFallback<LiveMatchResponse>(
        cacheKey,
      );
      if (staleCached) {
        return { data: staleCached, isCached: true };
      }

      throw new CricketDataError(
        `Failed to fetch match ${matchId}: all providers exhausted`,
        'PROVIDER_UNAVAILABLE',
        { matchId },
      );
    }
  }

  async searchPlayers(
    query: string,
    limit: number = 10,
    offset: number = 0,
    forceRefresh: boolean = false,
  ): Promise<{ data: PlayerSearchResponse; isCached: boolean }> {
    const cacheKey = this.buildCacheKey('search', `${query}:${limit}:${offset}`);

    if (!forceRefresh) {
      const cached = await this.cache.get<PlayerSearchResponse>(cacheKey);
      if (cached) {
        return { data: cached, isCached: true };
      }
    }

    try {
      const data = await this.primaryProvider.searchPlayers(
        query,
        limit,
        offset,
      );
      await this.cache.set(cacheKey, data, this.config.cacheTtlSeconds);
      return { data, isCached: false };
    } catch (error) {
      if (this.fallbackProvider) {
        try {
          const data = await this.fallbackProvider.searchPlayers(
            query,
            limit,
            offset,
          );
          await this.cache.set(cacheKey, data, this.config.cacheTtlSeconds);
          return { data, isCached: false };
        } catch (fallbackError) {
          // Fall through
        }
      }

      const staleCached = await this.cache.getWithFallback<PlayerSearchResponse>(
        cacheKey,
      );
      if (staleCached) {
        return { data: staleCached, isCached: true };
      }

      throw new CricketDataError(
        `Failed to search players: all providers exhausted`,
        'PROVIDER_UNAVAILABLE',
        { query, limit, offset },
      );
    }
  }

  private buildCacheKey(prefix: string, suffix: string): string {
    // Format: cricket:{provider}:{prefix}:{hash(suffix)}
    // Hash suffix to keep key length reasonable
    const hash = crypto
      .createHash('sha256')
      .update(suffix)
      .digest('hex')
      .substring(0, 16);
    return `cricket:${this.config.primaryProvider}:${prefix}:${hash}`;
  }
}
```

**Design Rationale:**
- Failover is automatic: if primary fails, fallback is attempted without caller intervention.
- Stale-cache fallback provides resilience; if both providers fail, return expired cache data with `isCached: true` flag so caller knows data is stale.
- Cache key includes provider name so different providers' data is not mixed.
- Rate-limit backoff is handled inside each provider; orchestrator does not duplicate retry logic.
- Explicit `forceRefresh` parameter allows caller to bypass cache when needed (e.g., user clicks "Refresh").

---

### 3.5 PlayerStatsService & LiveMatchService

**File:** `services/player-stats.service.ts`

```typescript
export class PlayerStatsService {
  constructor(
    private cricketData: CricketDataService,
    private playerRepo: PlayerRepository,
    private logger: Logger,
  ) {}

  async getPlayerStats(
    playerId: string,
    live: boolean = false,
  ): Promise<EnrichedPlayerStats> {
    // Fetch database player first to validate existence and get metadata
    const dbPlayer = await this.playerRepo.findById(playerId);
    if (!dbPlayer) {
      throw new NotFoundException(`Player ${playerId} not found`);
    }

    // Fetch provider stats (use cache unless live=true)
    const { data: providerStats, isCached } =
      await this.cricketData.getPlayerStats(playerId, live);

    // Merge database metadata with provider statistics
    return {
      id: dbPlayer.id,
      fullName: dbPlayer.fullName,
      displayName: dbPlayer.displayName,
      role: dbPlayer.role,
      country: dbPlayer.country,
      statistics: providerStats.statistics,
      cacheMetadata: {
        isCached,
        timestamp: new Date(),
        source: providerStats.source,
        provider: this.config.primaryProvider,
      },
    };
  }
}
```

**Design Rationale:**
- PlayerStatsService validates that the player exists in the database before fetching provider data.
- It enriches provider data with database metadata (full name, role, country).
- It returns `cacheMetadata` so controller can communicate cache status to client.
- Error handling: if player not in database, throw 404; if provider fails, let CricketDataService handle failover and stale cache.

**File:** `services/live-match.service.ts`

```typescript
export class LiveMatchService {
  constructor(
    private cricketData: CricketDataService,
    private logger: Logger,
  ) {}

  async getLiveMatch(
    matchId: string,
    live: boolean = false,
  ): Promise<EnrichedLiveMatch> {
    const { data: matchData, isCached } = await this.cricketData.getLiveMatch(
      matchId,
      live,
    );

    return {
      ...matchData,
      cacheMetadata: {
        isCached,
        timestamp: new Date(),
        source: matchData.source,
      },
    };
  }
}
```

**Design Rationale:**
- Simpler than PlayerStatsService because matches don't need database enrichment (they come directly from provider).
- Still returns cache metadata for transparency.

---

### 3.6 API Controller & Endpoints

**File:** `controllers/cricket-data.controller.ts`

```typescript
@Controller({ path: 'cricket', version: '1' })
@ApiTags('cricket')
export class CricketDataController {
  constructor(
    private playerStatsService: PlayerStatsService,
    private liveMatchService: LiveMatchService,
  ) {}

  /**
   * GET /v1/players/:id/stats?live=true
   * Fetch enriched player statistics from provider + database.
   */
  @Get('players/:id/stats')
  async getPlayerStats(
    @Param('id') playerId: string,
    @Query('live') live: boolean = false,
  ) {
    return this.playerStatsService.getPlayerStats(playerId, live);
  }

  /**
   * GET /v1/cricket/matches/:id
   * Fetch live or scheduled match data.
   */
  @Get('matches/:id')
  async getMatch(
    @Param('id') matchId: string,
    @Query('live') live: boolean = false,
  ) {
    return this.liveMatchService.getLiveMatch(matchId, live);
  }

  /**
   * GET /v1/cricket/search?q=name&limit=10&offset=0
   * Search players by name with pagination.
   */
  @Get('search')
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, default: 10 })
  @ApiQuery({ name: 'offset', required: false, type: Number, default: 0 })
  async searchPlayers(
    @Query(new ZodValidationPipe(cricketSearchSchema))
    query: { q: string; limit: number; offset: number },
  ) {
    if (!query.q || query.q.trim().length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Search query (q) is required and cannot be empty',
      });
    }

    if (query.limit > 50) {
      query.limit = 50; // Cap at 50
    }

    const result = await this.cricketDataService.searchPlayers(
      query.q,
      query.limit,
      query.offset,
    );

    return result;
  }
}
```

**Design Rationale:**
- Endpoints map directly to service methods; no business logic in controller.
- Query parameters are validated using Zod (existing pattern).
- Errors bubble up from services; global exception filter (existing) handles serialization.

---

### 3.7 Module Registration

**File:** `cricket-data.module.ts`

```typescript
@Module({
  imports: [ConfigModule],
  controllers: [CricketDataController],
  providers: [
    CricketDataService,
    PlayerStatsService,
    LiveMatchService,
    CricketProviderFactory,
    {
      provide: CacheService,
      useFactory: async (config: CricketDataConfig): Promise<CacheService> => {
        if (config.cacheBackend === 'redis' && config.redisUrl) {
          try {
            const redis = new RedisCacheService(config.redisUrl, logger);
            await redis.isHealthy(); // Test connection
            return redis;
          } catch (error) {
            logger.warn(`Redis cache unavailable, falling back to memory: ${error.message}`);
            return new MemoryCacheService();
          }
        }
        return new MemoryCacheService();
      },
      inject: [CricketDataConfig],
    },
  ],
  exports: [CricketDataService, PlayerStatsService, LiveMatchService],
})
export class CricketDataModule {}
```

**Design Rationale:**
- Module is self-contained; all dependencies (services, cache, providers) are defined here.
- Cache backend selection is a factory function; if Redis fails, in-memory is used as fallback.
- Services are exported so other modules can depend on them (e.g., auction room to display player stats).

---

### 3.8 Configuration & Environment Variables

**Update:** `apps/api/src/config/env.ts`

Add to envSchema:

```typescript
export const envSchema = z.object({
  // ... existing fields ...

  // Cricket data provider configuration
  CRICKET_PRIMARY_PROVIDER: z.enum(['espn']).default('espn'),
  CRICKET_FALLBACK_PROVIDER: z.enum(['espn']).optional(),
  CRICKET_ESPN_BASE_URL: z.string().url().default('https://www.espn.com/cricket/api'),
  CRICKET_ESPN_API_KEY: z.string().optional(),
  CRICKET_CACHE_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
  CRICKET_LIVE_MATCH_CACHE_TTL_SECONDS: z.coerce.number().int().min(60).default(600),
  CRICKET_CACHE_BACKEND: z.enum(['redis', 'memory']).default('redis'),

  // Redis is reused from REDIS_URL (already in schema)
});
```

**Design Rationale:**
- All provider URLs and keys are environment variables; no hardcoded values in code.
- TTL settings are configurable for different environments (shorter in development, longer in production).
- Validation happens at startup; if critical vars are missing, app fails fast with a clear message.

---

### 3.9 Error Handling

**File:** `types/cricket-data.types.ts`

```typescript
export enum CricketDataErrorCode {
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_PLAYER = 'INVALID_PLAYER',
  INVALID_MATCH = 'INVALID_MATCH',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
}

export class CricketDataError extends Error {
  constructor(
    message: string,
    public code: CricketDataErrorCode,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'CricketDataError';
  }
}
```

**Error Handling in Services:**
- **Provider fails, fallback succeeds:** Return fallback data; `isCached: false`.
- **Both providers fail, stale cache exists:** Return stale cache; `isCached: true`. Frontend displays "Stale data" warning.
- **Both providers fail, no cache:** Throw `CricketDataError` with code `PROVIDER_UNAVAILABLE`. Controller returns 503 Service Unavailable with error code and message.
- **Rate-limited (429):** Provider internally retries with backoff; if all retries exhaust, error is propagated up. Controller returns 429 (or 503 if stale cache is returned).

**Design Rationale:**
- Errors are machine-readable (`code` field) and human-readable (`message` field).
- Stale-cache fallback is transparent: same error code, but `isCached: true` signals to client that data may be old.
- Rate-limit errors are logged at warn level for monitoring.

---

## 4. Frontend Architecture

### 4.1 useCricketData Hook

**File:** `apps/web/src/hooks/useCricketData.ts`

```typescript
export interface UseCricketDataOptions {
  cacheDurationMs?: number; // Default: 5 minutes
  skipCache?: boolean; // Force fresh fetch
  onError?: (error: Error) => void; // Custom error handler
}

export interface UseCricketDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isCached: boolean;
  timestamp: Date | null;
  refetch: () => Promise<void>;
}

export function useCricketData<T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options?: UseCricketDataOptions,
): UseCricketDataReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [timestamp, setTimestamp] = useState<Date | null>(null);

  const cacheDurationMs = options?.cacheDurationMs ?? 5 * 60 * 1000;
  const skipCache = options?.skipCache ?? false;
  const cacheKey = buildCacheKey(endpoint, params);

  const fetchData = useCallback(async (bypassCache: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      // Check localStorage cache unless bypassCache
      let cachedData: CacheEntry<T> | null = null;
      if (!bypassCache && !skipCache) {
        cachedData = getCacheEntry<T>(cacheKey);
        if (cachedData && !isCacheExpired(cachedData, cacheDurationMs)) {
          setData(cachedData.data);
          setIsCached(true);
          setTimestamp(cachedData.timestamp);
          setLoading(false);
          return; // Use cache, no fetch
        }
      }

      // Fetch from backend
      const response = await fetch(
        `${buildQueryString(endpoint, params)}`,
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message ?? 'Failed to fetch cricket data');
      }

      const freshData = await response.json();
      setData(freshData);
      setIsCached(false);
      setTimestamp(new Date());

      // Store in localStorage
      setCacheEntry(cacheKey, freshData, new Date());
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // On error, try to return stale cache (even if expired)
      if (cachedData && !bypassCache) {
        setData(cachedData.data);
        setIsCached(true);
        setTimestamp(cachedData.timestamp);
        // Log error but don't set state to error (graceful fallback)
        console.warn(`Cricket data fetch failed; using stale cache: ${error.message}`);
      } else {
        setError(error);
        if (options?.onError) options.onError(error);
      }
    } finally {
      setLoading(false);
    }
  }, [cacheKey, cacheDurationMs, skipCache, endpoint, params]);

  // Fetch on mount or when dependencies change
  useEffect(() => {
    fetchData(false);
  }, [endpoint, params, skipCache]);

  // Refetch function that bypasses cache
  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  return { data, loading, error, isCached, timestamp, refetch };
}

function buildCacheKey(endpoint: string, params?: Record<string, unknown>): string {
  const hash = JSON.stringify(params ?? {});
  return `cricket:${endpoint}:${hash}`;
}

interface CacheEntry<T> {
  data: T;
  timestamp: Date;
}

function getCacheEntry<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null; // SSR safety
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return { ...parsed, timestamp: new Date(parsed.timestamp) };
  } catch {
    return null;
  }
}

function setCacheEntry<T>(key: string, data: T, timestamp: Date): void {
  if (typeof window === 'undefined') return; // SSR safety
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp }));
  } catch (err) {
    console.warn(`Failed to cache cricket data: ${err}`);
    // localStorage is full or disabled; silently fail
  }
}

function isCacheExpired(entry: CacheEntry<unknown>, maxAgeMsMs: number): boolean {
  const age = Date.now() - entry.timestamp.getTime();
  return age > maxAgeMsMs;
}
```

**Design Rationale:**
- 5-minute browser cache is independent of backend cache; reduces backend load for repeated client requests.
- Stale-cache fallback: if fetch fails and cache exists (even if expired), return cached data without throwing error. This prevents UI breakage on network issues.
- `refetch()` bypasses cache for manual refresh.
- `isCached` flag tells component whether data is fresh or stale.
- SSR-safe: checks for `window` before accessing `localStorage`.

### 4.2 PlayerStats Component

**File:** `apps/web/src/components/PlayerStats.tsx`

```typescript
export interface PlayerStatsProps {
  playerId: string;
  showLiveToggle?: boolean;
}

export const PlayerStats: React.FC<PlayerStatsProps> = ({
  playerId,
  showLiveToggle = true,
}) => {
  const [useLive, setUseLive] = useState(false);

  const { data, loading, error, isCached, timestamp, refetch } =
    useCricketData<EnrichedPlayerStats>(
      `/v1/players/${playerId}/stats`,
      { live: useLive },
      { skipCache: false },
    );

  if (loading && !data) {
    return <Skeleton />;
  }

  if (error && !data) {
    return (
      <ErrorState
        message="Failed to load player statistics"
        onRetry={refetch}
      />
    );
  }

  if (!data) {
    return <EmptyState message="No statistics available for this player" />;
  }

  return (
    <div className="player-stats">
      <div className="player-stats-header">
        <div className="player-info">
          <h2>{data.displayName}</h2>
          <p className="role">{data.role}</p>
          {data.country && <p className="country">{data.country.name}</p>}
        </div>

        <div className="cache-status">
          {isCached ? (
            <span className="badge badge-cached">
              Cached • {formatRelativeTime(timestamp)}
            </span>
          ) : (
            <span className="badge badge-live">Live</span>
          )}
        </div>
      </div>

      {showLiveToggle && (
        <div className="live-toggle">
          <label>
            <input
              type="checkbox"
              checked={useLive}
              onChange={(e) => setUseLive(e.target.checked)}
            />
            Show live stats
          </label>
        </div>
      )}

      <div className="statistics-tabs">
        {Object.entries(data.statistics).map(([format, stats]) => (
          <StatisticsTab key={format} format={format} stats={stats} />
        ))}
      </div>

      <div className="update-time">
        Updated {formatRelativeTime(data.cacheMetadata.timestamp)}
      </div>
    </div>
  );
};

function StatisticsTab({ format, stats }: { format: string; stats: PlayerStatisticDto[] }) {
  return (
    <div className="stats-tab">
      <h3>{format}</h3>
      {stats.map((stat, i) => (
        <div key={i} className="stat-row">
          <span className="stat-label">Matches</span>
          <span className="stat-value">{stat.matches}</span>

          {stat.runs !== undefined && (
            <>
              <span className="stat-label">Runs</span>
              <span className="stat-value">{stat.runs}</span>
            </>
          )}

          {stat.battingAverage !== undefined && (
            <>
              <span className="stat-label">Avg</span>
              <span className="stat-value">{stat.battingAverage.toFixed(2)}</span>
            </>
          )}

          {stat.strikeRate !== undefined && (
            <>
              <span className="stat-label">SR</span>
              <span className="stat-value">{stat.strikeRate.toFixed(2)}</span>
            </>
          )}

          {stat.wickets !== undefined && (
            <>
              <span className="stat-label">Wickets</span>
              <span className="stat-value">{stat.wickets}</span>
            </>
          )}

          {stat.bowlingAverage !== undefined && (
            <>
              <span className="stat-label">Bowl Avg</span>
              <span className="stat-value">{stat.bowlingAverage.toFixed(2)}</span>
            </>
          )}

          {stat.bowlingEconomy !== undefined && (
            <>
              <span className="stat-label">Economy</span>
              <span className="stat-value">{stat.bowlingEconomy.toFixed(2)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

**Design Rationale:**
- Accepts `playerId` as prop.
- Toggle switches `useLive` state, which re-fetches with `live=true`.
- Shows cache badge and update time.
- Groups statistics by format (T20, ODI, Test, etc.).
- Error and loading states are explicit.
- Gracefully handles missing statistics for a format.

### 4.3 Cricket Search Component

**File:** `apps/web/src/components/CricketSearch.tsx`

```typescript
export interface CricketSearchProps {
  onSelectPlayer?: (player: PlayerSearchResult) => void;
}

export const CricketSearch: React.FC<CricketSearchProps> = ({ onSelectPlayer }) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [offset, setOffset] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setOffset(0); // Reset pagination on new query
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, loading, error, refetch } = useCricketData<PlayerSearchResponse>(
    '/v1/cricket/search',
    { q: debouncedQuery, limit: 10, offset },
    { skipCache: false },
  );

  const handleLoadMore = () => {
    setOffset((prev) => prev + 10);
  };

  return (
    <div className="cricket-search">
      <input
        type="text"
        placeholder="Search players..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="search-input"
      />

      {loading && debouncedQuery && (
        <div className="loading">Searching...</div>
      )}

      {error && !data && debouncedQuery && (
        <div className="error">
          <p>Failed to search players</p>
          <button onClick={refetch}>Retry</button>
        </div>
      )}

      {data && data.results.length === 0 && debouncedQuery && (
        <div className="empty">No players found</div>
      )}

      {data && data.results.length > 0 && (
        <div className="results">
          {data.results.map((player) => (
            <div
              key={player.id}
              className="result-item"
              onClick={() => onSelectPlayer?.(player)}
            >
              <div className="player-name">{player.displayName}</div>
              <div className="player-role">{player.role}</div>
              {player.country && (
                <div className="player-country">{player.country}</div>
              )}
            </div>
          ))}

          {data.hasMore && (
            <button onClick={handleLoadMore} className="load-more">
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
};
```

**Design Rationale:**
- Debounces input (300ms) before fetching.
- Paginates through `offset`; "Load more" button increments offset.
- Resets pagination when query changes.
- Shows loading, error, and empty states.
- Calls `onSelectPlayer` callback if provided (e.g., to add player to squad).

---

## 5. Data Types & DTOs

**File:** `apps/api/src/cricket-data/dtos/player-stats.dto.ts`

```typescript
export interface PlayerStatisticDto {
  format: 'T20' | 'ODI' | 'TEST' | 'DOMESTIC_T20' | 'OTHER';
  matches: number;
  runs?: number;
  battingAverage?: number;
  strikeRate?: number;
  wickets?: number;
  bowlingAverage?: number;
  bowlingEconomy?: number;
}

export interface EnrichedPlayerStats {
  id: string;
  fullName: string;
  displayName: string;
  role: 'BATTER' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKETKEEPER';
  country?: { code: string; name: string };
  statistics: Record<string, PlayerStatisticDto[]>;
  cacheMetadata: {
    isCached: boolean;
    timestamp: Date;
    source: string;
    provider: string;
  };
}

export interface LiveMatchDto {
  matchId: string;
  teams: Array<{ name: string; code: string }>;
  format: 'T20' | 'ODI' | 'TEST';
  venue?: string;
  startTime: Date;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED';
  currentScore?: {
    team: string;
    runs: number;
    wickets: number;
    overs?: number;
  };
  result?: string;
  cacheMetadata: {
    isCached: boolean;
    timestamp: Date;
    source: string;
  };
}

export interface PlayerSearchResponse {
  results: Array<{
    id: string;
    displayName: string;
    role: 'BATTER' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKETKEEPER';
    country?: string;
  }>;
  total: number;
  hasMore: boolean;
}
```

---

## 6. Validation

**File:** `apps/api/src/cricket-data/validators/cricket-data.validators.ts`

```typescript
export const cricketSearchSchema = z.object({
  q: z
    .string()
    .min(1, 'Search query must not be empty')
    .max(100, 'Search query must not exceed 100 characters'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export const playerIdSchema = z.object({
  id: z.string().min(1).max(255),
});

export const matchIdSchema = z.object({
  id: z.string().min(1).max(255),
});

export const liveQuerySchema = z.object({
  live: z.coerce.boolean().default(false),
});
```

---

## 7. Testing Strategy

### 7.1 Test Scope (60+ tests)

Minimum coverage:

| Component | Test Count | Scenarios |
|-----------|-----------|-----------|
| CricketProvider interface | 5 | Interface contract validation |
| ESPNDataProvider | 12 | API mapping, error handling, rate-limit detection, retry backoff |
| CricketDataService | 15 | Cache hit/miss, failover, stale fallback, rate-limit coordination |
| PlayerStatsService | 8 | Player lookup, enrichment, error propagation |
| LiveMatchService | 5 | Match data retrieval, TTL switching |
| CacheService (Memory) | 8 | Get, set, delete, TTL, stale fallback |
| CacheService (Redis) | 8 | Get, set, delete, TTL, fallback when unavailable |
| API Controller | 10 | Endpoint validation, parameter handling, error responses |
| **useCricketData hook** | 10 | Cache expiration, refetch, error fallback, localStorage |
| **PlayerStats component** | 8 | Render, toggle, error states, cache badge |
| **CricketSearch component** | 8 | Debounce, pagination, error handling |
| **Total** | **97** | — |

### 7.2 Test Examples

**ESPNDataProvider Tests:**
```typescript
describe('ESPNDataProvider', () => {
  it('should fetch and map player stats correctly', async () => {
    // Mock ESPN API response
    // Call getPlayerStats()
    // Assert PlayerStatsResponse schema matches
  });

  it('should detect HTTP 429 and retry with backoff', async () => {
    // Mock ESPN API returning 429 three times, then 200
    // Call getPlayerStats()
    // Assert retry count and backoff delays
  });

  it('should normalize batting average to decimal', async () => {
    // ESPN may return "43.5" as string
    // Assert converted to number
  });

  it('should throw CricketDataError on provider failure', async () => {
    // Mock ESPN API returning 503
    // Call getPlayerStats()
    // Assert throws CricketDataError with PROVIDER_ERROR code
  });
});
```

**CricketDataService Tests:**
```typescript
describe('CricketDataService', () => {
  it('should return cached data on second call', async () => {
    // Call getPlayerStats(id1)
    // Call getPlayerStats(id1) again
    // Assert second call returns cached data with isCached=true
  });

  it('should failover to fallback provider if primary fails', async () => {
    // Mock primary provider to throw
    // Call getPlayerStats()
    // Assert fallback provider is called
    // Assert result is from fallback provider
  });

  it('should return stale cache if all providers fail', async () => {
    // Prime cache with old data
    // Mock both providers to throw
    // Call getPlayerStats()
    // Assert returns stale data with isCached=true
  });

  it('should use shorter TTL for live matches', async () => {
    // Call getLiveMatch(id) with status='LIVE'
    // Assert cache.set() called with liveMatchCacheTtlSeconds (not cacheTtlSeconds)
  });
});
```

**useCricketData Hook Tests:**
```typescript
describe('useCricketData', () => {
  it('should return cached data within 5 minutes', async () => {
    // Render component with hook
    // Call hook, assert fetched
    // Render again (within 5 min), assert cached
  });

  it('should return stale cache on fetch error', async () => {
    // Prime localStorage with data
    // Mock fetch to fail
    // Call hook
    // Assert returns cached data despite error
  });

  it('should bypass cache on refetch()', async () => {
    // Call hook, assert fetched
    // Call refetch()
    // Assert new fetch request (cache bypassed)
  });
});
```

**API Controller Tests:**
```typescript
describe('CricketDataController', () => {
  it('should return 400 if search query is empty', async () => {
    // Call GET /v1/cricket/search?q=
    // Assert response status 400 with VALIDATION_FAILED code
  });

  it('should cap limit to 50', async () => {
    // Call GET /v1/cricket/search?q=test&limit=100
    // Assert limit is capped to 50
  });

  it('should return 404 if player not found', async () => {
    // Call GET /v1/players/invalid-id/stats
    // Assert response status 404
  });

  it('should return 503 if all providers fail and no cache', async () => {
    // Mock all providers to fail
    // Clear cache
    // Call GET /v1/players/:id/stats
    // Assert response status 503 with PROVIDER_UNAVAILABLE code
  });
});
```

---

## 8. Edge Cases & Error Recovery

| Scenario | Handling | Log Level |
|----------|----------|-----------|
| Primary provider returns 429 | Backoff internally; retry up to 3x | warn |
| Primary provider times out | Mark as failed; try fallback provider | warn |
| Both providers fail, cache exists (fresh) | Return cached data; `isCached: false` | info |
| Both providers fail, cache exists (expired) | Return stale cache; `isCached: true` | info |
| Both providers fail, no cache | Throw error; return 503 to client | error |
| Redis unavailable | Fall back to in-memory cache on startup | warn |
| Rate-limit state diverges between instances | Each instance tracks independently; fallback to stale cache if needed | warn |
| Player ID in DB does not match provider ID | Throw 404; assumption is 1:1 mapping (mapping table is future work) | error |
| Match is live but provider data is 2+ hours stale | Return stale data with `isCached: true`; client displays warning | warn |
| Browser localStorage is full | Silently fail to cache; next fetch goes to backend | debug |
| Client attempts search with 1000+ char query | Truncate or reject with 400 | debug |

---

## 9. Files to Create & Modify

### Backend (7 files)
1. `apps/api/src/cricket-data/providers/cricket.provider.ts` — Interface
2. `apps/api/src/cricket-data/providers/espn-data.provider.ts` — ESPN implementation
3. `apps/api/src/cricket-data/services/cricket-data.service.ts` — Orchestration
4. `apps/api/src/cricket-data/services/player-stats.service.ts` — Player enrichment
5. `apps/api/src/cricket-data/services/live-match.service.ts` — Match retrieval
6. `apps/api/src/cricket-data/cache/cache.service.ts` + `redis-cache.service.ts` + `memory-cache.service.ts` — Cache abstraction & implementations
7. `apps/api/src/cricket-data/cricket-data.controller.ts` — API endpoints

### Additional Backend Support Files
- `apps/api/src/cricket-data/cricket-data.module.ts`
- `apps/api/src/cricket-data/dtos/*.ts` (player-stats.dto, live-match.dto, search.dto)
- `apps/api/src/cricket-data/types/cricket-data.types.ts` (error enums, interfaces)
- `apps/api/src/cricket-data/validators/cricket-data.validators.ts` (Zod schemas)
- `apps/api/src/cricket-data/constants/cricket-data.constants.ts` (timeout, retry limits)
- `apps/api/src/app.module.ts` (import CricketDataModule)
- `apps/api/src/config/env.ts` (extend with cricket vars)

### Frontend (3 files)
1. `apps/web/src/hooks/useCricketData.ts` — Hook
2. `apps/web/src/components/PlayerStats.tsx` — Component
3. `apps/web/src/components/CricketSearch.tsx` — Component

### Tests (60+ tests across)
- `apps/api/src/cricket-data/__tests__/*.spec.ts` (backend tests)
- `apps/web/src/hooks/__tests__/useCricketData.spec.ts` (hook tests)
- `apps/web/src/components/__tests__/PlayerStats.spec.tsx` (component tests)
- `apps/web/src/components/__tests__/CricketSearch.spec.tsx` (component tests)

---

## 10. Integration Points

### 10.1 Existing Modules
- **Players Module:** PlayerStatsService depends on PlayerRepository to validate player existence.
- **Rooms Module:** Cricket data can be surfaced in room UI (e.g., show player stats when player is queued for auction).
- **Teams Module:** Player stats may be used to display team composition and player values.

### 10.2 App Module Registration
Update `apps/api/src/app.module.ts`:

```typescript
imports: [
  // ... existing imports ...
  CricketDataModule,
]
```

### 10.3 Frontend Integration
- PlayerStats component can be inserted into existing player profile page.
- CricketSearch can be used in squad-building workflow.
- useCricketData hook is importable and usable in any component.

---

## 11. Environment Variables (Added)

```bash
# Primary cricket data provider
CRICKET_PRIMARY_PROVIDER=espn

# Fallback provider (optional)
CRICKET_FALLBACK_PROVIDER=

# ESPN API configuration
CRICKET_ESPN_BASE_URL=https://www.espn.com/cricket/api
CRICKET_ESPN_API_KEY=  # Optional; depends on ESPN API requirements

# Cache configuration
CRICKET_CACHE_BACKEND=redis  # 'redis' or 'memory'
CRICKET_CACHE_TTL_SECONDS=3600
CRICKET_LIVE_MATCH_CACHE_TTL_SECONDS=600

# Redis (reused from existing REDIS_URL)
# REDIS_URL=redis://localhost:6379
```

---

## 12. Performance & Security Considerations

### Performance
- **Cache hit path:** <100ms (localStorage lookup + return).
- **Cache miss + fresh fetch:** 500ms–2s (depending on provider latency and retry backoff).
- **Stale cache fallback:** <100ms (immediate return from cache).
- **Rate-limit backoff:** Up to 60s total (3 retries × 1s, 2s, 4s max).

### Security
- No API keys or provider URLs are present in frontend code or network requests.
- Provider API calls happen on backend only.
- Rate-limit headers are not exposed to frontend; only `isCached` flag is sent.
- Sensitive error details (provider-specific error codes) are sanitized before returning to frontend.
- Input validation (Zod) on all query parameters; no SQL injection risk (Prisma query builder used).

---

## 13. Future Extensibility

### Adding a New Provider
1. Create `NewProviderDataProvider implements CricketProvider` in `providers/`.
2. Implement three methods: `getPlayerStats()`, `getLiveMatch()`, `searchPlayers()`.
3. Add provider name to `CRICKET_PRIMARY_PROVIDER` enum in env schema.
4. Update `CricketProviderFactory.create()` to instantiate new provider.
5. No changes to services, controllers, or frontend required.

### Scaling Cache
- If multiple API instances are deployed, Redis cache is shared across instances.
- In-memory fallback allows graceful degradation if Redis becomes unavailable.
- Future: add cache warming / prefetch for popular players before auction season.

### Adding Player ID Mapping
- If provider player IDs diverge from database IDs, add `ProviderPlayerMapping` table.
- PlayerStatsService looks up mapping before calling provider.
- No changes to public API required.

---

## 14. Monitoring & Observability

### Logs to Emit
- **Info:** Cache hit, stale cache fallback, provider swap.
- **Warn:** Provider failure, rate-limit detected, Redis unavailable, Redis fallback activated.
- **Error:** All providers exhausted, stale cache empty, invalid configuration.

### Metrics to Track
- Provider response time (ms) per endpoint.
- Cache hit/miss ratio.
- Rate-limit detection count.
- Provider failover count.
- Stale cache fallback count.
- Error count by provider.

### Alerts
- Alert if provider success rate < 95% over 5 min.
- Alert if rate-limit backoff is triggered > 10 times in 1 hour.
- Alert if all instances fall back to in-memory cache (Redis down).

---

## 15. Summary of Design Decisions

| Decision | Rationale |
|----------|-----------|
| Provider abstraction via interface | Allows swapping providers without code changes; testable in isolation |
| CricketDataService orchestration layer | Single source of failover, caching, and rate-limit logic |
| Redis + in-memory fallback | Redis for production multi-instance sharing; memory fallback for resilience |
| 1-hour cache TTL | Balance between freshness and load; configurable per environment |
| 5-min browser cache | Reduces backend load; independent of server cache |
| Stale-cache fallback | Maximizes availability; client can warn user if data is stale |
| Environment-driven configuration | No hardcoded URLs or keys; suitable for multiple environments |
| Zod validation | Consistent with existing codebase patterns |
| NestJS module structure | Follows existing project structure; isolated, testable, exportable services |

---

## References & Dependencies

- Requirements: `01-requirements.md` (this workflow's input)
- Architecture: `d:\UNDER-THE-HAMMER\ARCHITECTURE.md`
- Existing patterns: Players module (`apps/api/src/players/`), Auth module, PrismaService
- Dependencies: Zod (validation), Pino (logging), NestJS (DI & module system), Vitest (testing)

