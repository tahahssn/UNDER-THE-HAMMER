# Phase M: Live Cricket Data Integration — Design Review

**Review Date:** 2026-11-28  
**Reviewer:** Design Review Subagent  
**Design Document:** `02-design.md`  
**Requirements Document:** `01-requirements.md`  
**Status:** CHANGES_REQUESTED (3 HIGH findings)

---

## Executive Summary

The design document is comprehensive and well-structured, with clear abstractions and a sound failover strategy. However, there are three significant issues that must be resolved before implementation:

1. **HIGH:** The design claims `ioredis` or `redis` npm packages are not currently present, but proposes adding them without verification. No package manager pin version strategy is documented.
2. **HIGH:** The design references a `CricketDataConfig` type that is never defined anywhere (service constructors, module factory, env validation). Configuration flow is ambiguous.
3. **HIGH:** The design specifies that PlayerStatsService "enrich[es] returned statistics" with database player metadata but does not account for player ID mismatch between database and provider. The assumption that provider IDs map 1:1 to database IDs is stated only in Assumptions but creates silent runtime failures if violated.

Additionally, three MEDIUM issues and several NITs should be addressed to improve clarity and prevent implementation pitfalls.

---

## Findings

### 1. HIGH: Missing Dependency Version Strategy and Package Availability

**Location:** Section 2 (Technology Stack & Dependencies), Section 3.3 (Cache Implementation)

**Problem:**
The design states:
> "Primary: Redis (via `ioredis` or `redis` npm package, if not already present)"

Verification against actual codebase:
- Checked `apps/api/package.json`: Neither `ioredis` nor `redis` npm packages are currently installed.
- No version pinning strategy is documented for these critical dependencies.
- The design does not specify which library to use (ioredis vs. redis) or justify the choice.
- The module factory attempts Redis connection without documenting how connection pooling or retry backoff for Redis connects itself.

**Impact:**
Implementer must guess whether to use ioredis (older, actively maintained) or redis (official, newer). No clear dependency resolution strategy means the codebase could diverge from intent or introduce transitive dependency conflicts.

**Concrete Fix:**
Update Section 2 to explicitly state:
```
Cache Backends:
  - Primary: Redis via `ioredis@^5.3.0` (official maintainer, TypeScript support, connection pooling)
  - Fallback: In-memory Map (no external dependency)

Rationale: ioredis is production-proven in NestJS/Node.js contexts, with native retry and cluster support. Version constraint: ^5.3.0 allows patch updates but not major version changes.
```

Then add to `apps/api/package.json` before implementation.

---

### 2. HIGH: Undefined `CricketDataConfig` Type and Configuration Flow

**Location:** Section 3.1 (Module Structure, services), Section 3.4 (CricketDataService constructor), Section 3.7 (Module Registration)

**Problem:**
The design references `CricketDataConfig` in multiple locations:
```typescript
// Section 3.2
constructor(
  baseUrl: string,
  apiKey?: string,
  private logger: Logger,
) { ... }
```

```typescript
// Section 3.4 (contradicts 3.2)
constructor(
  private config: CricketDataConfig,
  private cache: CacheService,
  private logger: Logger,
) { ... }
```

```typescript
// Section 3.7 Module factory
useFactory: async (config: CricketDataConfig): Promise<CacheService> => { ... }
```

However, **`CricketDataConfig` is never defined anywhere in the design.** No type definition, no interface, no relation to env schema.

Verification against Section 3.8 (Environment Variables):
- Environment variables are added to `envSchema` but not wrapped in a `CricketDataConfig` interface.
- The design does not specify whether CricketDataConfig should be:
  - A mapped/derived type from the env schema?
  - A separate injectable token?
  - A class with Zod validation?

**Impact:**
Implementer cannot construct this type. DI resolution will fail at runtime. Services and providers receive undefined or incompatible config objects.

**Concrete Fix:**
Define `CricketDataConfig` in `apps/api/src/cricket-data/types/cricket-data.types.ts`:
```typescript
import { Env } from '../../config/env';

export interface CricketDataConfig {
  primaryProvider: string;        // from CRICKET_PRIMARY_PROVIDER
  fallbackProvider?: string;      // from CRICKET_FALLBACK_PROVIDER
  espnBaseUrl: string;            // from CRICKET_ESPN_BASE_URL
  espnApiKey?: string;            // from CRICKET_ESPN_API_KEY
  cacheTtlSeconds: number;        // from CRICKET_CACHE_TTL_SECONDS
  liveMatchCacheTtlSeconds: number; // from CRICKET_LIVE_MATCH_CACHE_TTL_SECONDS
  cacheBackend: 'redis' | 'memory'; // from CRICKET_CACHE_BACKEND
  redisUrl?: string;              // from REDIS_URL
}

export function toCricketDataConfig(env: Env): CricketDataConfig {
  return {
    primaryProvider: env.CRICKET_PRIMARY_PROVIDER ?? 'espn',
    fallbackProvider: env.CRICKET_FALLBACK_PROVIDER,
    espnBaseUrl: env.CRICKET_ESPN_BASE_URL ?? 'https://www.espn.com/cricket/api',
    espnApiKey: env.CRICKET_ESPN_API_KEY,
    cacheTtlSeconds: env.CRICKET_CACHE_TTL_SECONDS ?? 3600,
    liveMatchCacheTtlSeconds: env.CRICKET_LIVE_MATCH_CACHE_TTL_SECONDS ?? 600,
    cacheBackend: (env.CRICKET_CACHE_BACKEND as 'redis' | 'memory') ?? 'redis',
    redisUrl: env.REDIS_URL,
  };
}
```

Then inject as a provider in `cricket-data.module.ts`:
```typescript
{
  provide: CricketDataConfig,
  useFactory: (env: Env) => toCricketDataConfig(env),
  inject: [/* ConfigService or env token */],
}
```

---

### 3. HIGH: Unvalidated Assumption: Player ID 1:1 Mapping Without Error Handling

**Location:** Section 3.5 (PlayerStatsService), Assumptions (Section 3, Assumption #3)

**Problem:**
The design states in PlayerStatsService:
```typescript
// Fetch database player first to validate existence and get metadata
const dbPlayer = await this.playerRepo.findById(playerId);
if (!dbPlayer) {
  throw new NotFoundException(`Player ${playerId} not found`);
}

// Fetch provider stats (use cache unless live=true)
const { data: providerStats, isCached } =
  await this.cricketData.getPlayerStats(playerId, live);
```

The design **assumes** that `playerId` (a string from the request) can be used directly with both the database and the provider API. However:
1. The Requirements document (Assumptions #3) explicitly states this is an assumption, not a validated fact.
2. Database player IDs (UUID, internal) may not match ESPN provider IDs (ESPN's internal numeric or string ID).
3. The design provides **no error handling** if the player exists in the database but the provider throws `INVALID_PLAYER` or `NOT_FOUND`.
4. If mapping divergence is discovered during implementation, a runtime error will occur with no graceful fallback.

Verification against actual codebase:
- Checked `players.service.ts`: Players are looked up by `id` but no cross-provider ID mapping table exists.
- No `ProviderPlayerMapping` table is designed or implemented.
- The codebase assumes player.id is the canonical identifier.

**Impact:**
If a player exists in the database with ID "player-uuid-123" but ESPN has ID "espn-player-456", the endpoint will:
1. Find the player in the database ✓
2. Try to fetch stats from ESPN using "player-uuid-123" ✗
3. ESPN returns 404 or INVALID_PLAYER
4. CricketDataService falls back to stale cache or returns error
5. User sees "Provider unavailable" instead of a meaningful "Player not found on ESPN"

This violates the design's stated goal of **graceful fallback** and **transparency** to the client.

**Concrete Fix:**
Add to the design a validation and error handling section:
```typescript
// In PlayerStatsService
async getPlayerStats(
  playerId: string,
  live: boolean = false,
): Promise<EnrichedPlayerStats> {
  // Fetch database player first
  const dbPlayer = await this.playerRepo.findById(playerId);
  if (!dbPlayer) {
    throw new NotFoundException(`Player ${playerId} not found in database`);
  }

  // Check for provider ID mapping (future: consult ProviderPlayerMapping table)
  // For now, assume 1:1 mapping; if provider returns INVALID_PLAYER, 
  // return database stats only (graceful degradation)
  
  try {
    const { data: providerStats, isCached } =
      await this.cricketData.getPlayerStats(playerId, live);
    
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
  } catch (error) {
    // If provider fails but player exists in DB, 
    // return database stats with provider metadata indicating unavailability
    if (error instanceof CricketDataError && error.code === 'INVALID_PLAYER') {
      this.logger.warn(
        `Provider does not have stats for player ${playerId}; ` +
        `returning database metadata only`,
      );
      return {
        id: dbPlayer.id,
        fullName: dbPlayer.fullName,
        displayName: dbPlayer.displayName,
        role: dbPlayer.role,
        country: dbPlayer.country,
        statistics: {}, // Empty; no provider stats
        cacheMetadata: {
          isCached: false,
          timestamp: new Date(),
          source: 'database',
          provider: null, // Indicate provider data not available
        },
      };
    }
    throw;
  }
}
```

---

### 4. MEDIUM: Ambiguous Rate-Limit Backoff Coordination in Clustered Deployments

**Location:** Section 3.4 (CricketDataService), Section 8 (Edge Cases), Requirements Note

**Problem:**
The design states in Section 3.4:
```typescript
private rateLimitState = new Map<string, RateLimitInfo>();
```

This in-memory Map is not shared across multiple API instances. The design acknowledges this in Requirements > Notes:
> "If multiple backend instances are running, rate-limit state must be shared (requires Redis or distributed cache); in-memory tracking will not work in clustered deployments."

However, the design provides **no mechanism** to implement shared rate-limit state. The CricketDataService constructor does not accept a distributed cache for rate-limit coordination, and the module factory does not provision it.

**Impact:**
- In development (single instance) or staging, the design works as intended.
- In production with multiple instances, each instance independently detects rate-limits, leading to 3x retry storms and potential provider blocking.

**Concrete Fix:**
Add to the design:
```typescript
// In cricket-data.service.ts, use the same cache backend for rate-limit coordination
private rateLimitCache: CacheService; // Reuse shared Redis or memory cache

async getPlayerStats(...): Promise<{ data: PlayerStatsResponse; isCached: boolean }> {
  // Before calling provider, check if rate-limited globally
  const rateLimitKey = this.buildRateLimitKey('player-stats');
  const isRateLimited = await this.rateLimitCache.exists(rateLimitKey);
  if (isRateLimited) {
    this.logger.warn(`Provider is globally rate-limited; waiting before retry`);
    // Throw error or trigger stale cache fallback
    throw new CricketDataError('Provider rate-limited', 'RATE_LIMITED', {});
  }
  
  // On 429 from provider, store rate-limit signal in shared cache
  // so other instances can detect it too
}
```

Document that rate-limit backoff is **per-instance** in the current design, and add a TODO for distributed coordination.

---

### 5. MEDIUM: Stale Cache Data Age Is Never Communicated to Frontend

**Location:** Section 4.1 (useCricketData Hook), Section 4.2 (PlayerStats Component)

**Problem:**
The backend returns `isCached: true` to indicate stale data, but does not return **how stale** the data is. The design does not specify a `staleAge` or `cacheAge` field that tells the client how long ago the data was fetched.

Requirements Section 8.3 states:
> "Show badge "Live" if data is fresh; Show badge "Cached" with timestamp if `isCached: true`"

The PlayerStats component in Section 4.2 shows:
```typescript
{isCached ? (
  <span className="badge badge-cached">
    Cached • {formatRelativeTime(timestamp)}
  </span>
) : (
  <span className="badge badge-live">Live</span>
)}
```

However, `timestamp` could be from either a fresh backend fetch (a few seconds old) or stale cache (1+ hours old). **The component has no way to distinguish between recent cache and very stale cache.**

**Impact:**
User sees "Cached • 2 hours ago" and thinks it is recent when it may be from yesterday's auction. No alarm is raised for genuinely stale data (> 24 hours old).

**Concrete Fix:**
Update `EnrichedPlayerStats` and `LiveMatchDto` DTOs to include cache age:
```typescript
export interface CacheMetadata {
  isCached: boolean;
  timestamp: Date;
  source: string;
  provider: string;
  ageSeconds?: number; // Time in seconds since data was fetched
  isStale?: boolean;   // True if cache was expired when returned (stale fallback)
}
```

Backend CricketDataService populates `ageSeconds` and `isStale` when returning stale cache:
```typescript
// In stale cache fallback
const ageSeconds = Math.floor((Date.now() - cachedData.timestamp) / 1000);
return {
  data: staleCached,
  isCached: true,
  cacheMetadata: {
    isStale: true,          // Flag to indicate expired cache
    ageSeconds,             // How long ago was it fetched
    timestamp: staleCached.timestamp,
  },
};
```

Frontend uses this to show appropriate warning:
```typescript
{isCached && cacheMetadata?.isStale && cacheMetadata.ageSeconds > 1800 ? (
  <span className="badge badge-stale">Warning: Data is {formatDuration(cacheMetadata.ageSeconds)} old</span>
) : isCached ? (
  <span className="badge badge-cached">Cached • {formatRelativeTime(timestamp)}</span>
) : (
  <span className="badge badge-live">Live</span>
)}
```

---

### 6. MEDIUM: No Error Recovery for Malformed Provider Responses

**Location:** Section 3.2 (ESPNDataProvider), Section 3.9 (Error Handling)

**Problem:**
The design maps ESPN API responses to `PlayerStatsResponse` but provides no validation or schema enforcement on the provider data before passing it to cache and frontend.

The design shows:
```typescript
private mapEspnStats(espnResponse: unknown): PlayerStatsResponse {
  // Normalize ESPN data to unified schema
}
```

But does not specify:
1. What happens if `espnResponse` is malformed (missing required fields)?
2. Whether Zod is used to validate the ESPN response?
3. Whether partial responses (e.g., missing batting average) are accepted?
4. Whether a malformed response is treated as an error or cached anyway?

**Impact:**
If ESPN returns a response missing the `playerId` field, the mapping function silently produces an invalid `PlayerStatsResponse`, which is cached and served to the frontend, causing rendering errors or data corruption.

**Concrete Fix:**
Add to the design a validation schema for ESPN responses:

```typescript
// In cricket-data.types.ts or espn-data.provider.ts
const espnPlayerStatsSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  stats: z.array(
    z.object({
      format: z.enum(['T20', 'ODI', 'TEST', 'DOMESTIC_T20', 'OTHER']),
      matches: z.number().int().nonnegative().optional(),
      runs: z.number().int().nonnegative().optional(),
      battingAverage: z.number().nonnegative().optional(),
      strikeRate: z.number().nonnegative().optional(),
      wickets: z.number().int().nonnegative().optional(),
      bowlingAverage: z.number().nonnegative().optional(),
      bowlingEconomy: z.number().nonnegative().optional(),
    })
  ).optional().default([]),
});

// In ESPNDataProvider
async getPlayerStats(playerId: string): Promise<PlayerStatsResponse> {
  try {
    const espnResponse = await this.httpClient.get(`${this.baseUrl}/players/${playerId}`);
    const validated = espnPlayerStatsSchema.parse(espnResponse.data);
    return this.mapEspnStats(validated); // Now guaranteed to match schema
  } catch (error) {
    if (error instanceof z.ZodError) {
      this.logger.error(`ESPN response validation failed: ${error.message}`, { playerId, errors: error.errors });
      throw new CricketDataError(
        `Invalid ESPN response for player ${playerId}`,
        'PROVIDER_ERROR',
        { validationErrors: error.errors }
      );
    }
    throw;
  }
}
```

---

### 7. MEDIUM: Module Factory Does Not Validate CricketDataConfig at Startup

**Location:** Section 3.7 (Module Registration)

**Problem:**
The design shows:
```typescript
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
}
```

However:
1. `CricketDataConfig` is not injected via ConfigService or env parsing; it assumes the token is already available (contradicts Finding #2).
2. No validation checks if `espnBaseUrl` is a valid URL or if `primaryProvider` is a known provider.
3. Invalid configuration is not caught at application startup; it fails lazily when the endpoint is called.

**Impact:**
If `CRICKET_ESPN_BASE_URL=invalid-url`, the app starts successfully but fails on first request to fetch cricket data.

**Concrete Fix:**
Add a configuration validation method in the module:
```typescript
// In cricket-data.module.ts
async function validateCricketConfig(config: CricketDataConfig): Promise<void> {
  // Validate provider name
  if (!['espn'].includes(config.primaryProvider)) {
    throw new Error(
      `Invalid CRICKET_PRIMARY_PROVIDER: "${config.primaryProvider}". ` +
      `Allowed values: espn`
    );
  }

  // Validate ESPN base URL is a valid URL
  try {
    new URL(config.espnBaseUrl);
  } catch {
    throw new Error(
      `Invalid CRICKET_ESPN_BASE_URL: "${config.espnBaseUrl}". ` +
      `Must be a valid URL.`
    );
  }

  // Validate cache TTL is reasonable
  if (config.cacheTtlSeconds < 60) {
    throw new Error(
      `Invalid CRICKET_CACHE_TTL_SECONDS: ${config.cacheTtlSeconds}. ` +
      `Must be at least 60 seconds.`
    );
  }
}

@Module({
  // ...
  providers: [
    {
      provide: 'CRICKET_CONFIG_VALIDATOR',
      useFactory: (config: CricketDataConfig) => {
        validateCricketConfig(config);
        return config;
      },
      inject: [CricketDataConfig],
    },
    // ... rest of providers
  ],
})
```

Call this validator in the module's `onModuleInit()` lifecycle hook to fail fast.

---

### 8. NIT: `RateLimitInfo` Type Is Never Defined

**Location:** Section 3.4 (CricketDataService)

**Problem:**
The code snippet references:
```typescript
private rateLimitState = new Map<string, RateLimitInfo>();
```

But `RateLimitInfo` is not defined in the design.

**Concrete Fix:**
Define in `cricket-data.types.ts`:
```typescript
export interface RateLimitInfo {
  retryCount: number;
  nextRetryAt: Date;
  resetAt?: Date; // From X-RateLimit-Reset header
  endpointUrl: string;
}
```

---

### 9. NIT: `PlayerRepository.findById()` Method Not Verified

**Location:** Section 3.5 (PlayerStatsService)

**Problem:**
The design calls `this.playerRepo.findById(playerId)` but does not verify this method exists in the actual `PlayerRepository`.

Verification:
- Checked `players.service.ts`: `playerRepo.findById(id)` is called in existing code ✓
- Method exists and returns player or null ✓

**Status:** No change needed; assumption verified.

---

### 10. NIT: ESPNDataProvider Missing `isHealthy()` Implementation Details

**Location:** Section 3.2 (ESPNDataProvider)

**Problem:**
The interface requires:
```typescript
isHealthy(): Promise<boolean>;
```

But the design does not specify what constitutes a "healthy" provider. Should it:
- Hit a `/status` endpoint?
- Attempt a lightweight HEAD request?
- Check API key validity?

**Concrete Fix:**
Add to the design:
```typescript
async isHealthy(): Promise<boolean> {
  try {
    // Attempt a lightweight health check: GET /status or HEAD /
    const response = await this.httpClient.head(`${this.baseUrl}/status`, {
      timeout: 5000,
    });
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    this.logger.warn(`Provider health check failed: ${error.message}`);
    return false;
  }
}
```

If ESPN does not expose a `/status` endpoint, use a more expensive check (e.g., search for a known player).

---

### 11. NIT: SearchPlayers Pagination Offset Parameter Not Documented

**Location:** Requirements 5.3, Design Section 4.3

**Problem:**
The CricketSearch component increments `offset` by 10 (the default limit):
```typescript
const handleLoadMore = () => {
  setOffset((prev) => prev + 10);
};
```

But if the user changes the `limit` parameter, pagination will be incorrect. The design does not specify whether `limit` is fixed at 10 or user-configurable.

**Concrete Fix:**
Clarify in the design:
```
Pagination is controlled by offset and limit parameters:
- limit: fixed at 10 for the initial CricketSearch component (future: make configurable)
- offset: incremented by limit on "Load more" click
- Results include hasMore flag to disable "Load more" when at end
```

---

## Verified Assumptions

The following design claims were verified against the actual codebase:

| Assumption | Verification | Status |
|-----------|--------------|--------|
| NestJS and Prisma are already in use | Checked `app.module.ts` and existing services | ✓ Confirmed |
| Pino logging is integrated | Checked `app.module.ts` LoggerModule setup | ✓ Confirmed |
| Zod is used for validation | Checked existing validators in `config/env.ts` | ✓ Confirmed |
| PostgreSQL is the data store | Checked `prisma` module and schema references | ✓ Confirmed |
| Players module exists with repository pattern | Checked `players/` directory and `PlayerRepository` | ✓ Confirmed |
| Redis is optional (in-memory fallback mentioned) | Checked `app.module.ts`; not currently configured | ✓ Confirmed as optional |
| Throttler/rate-limiting is integrated at API level | Checked `ThrottlerModule` in `app.module.ts` | ✓ Confirmed |
| AWS S3 and Cognito are configured | Checked `@aws-sdk` in package.json | ✓ Confirmed |

---

## Unverified / Wrong Assumptions

| Assumption | Verification | Status |
|-----------|--------------|--------|
| `ioredis` or `redis` npm package is available | Checked `apps/api/package.json`; neither is installed | ✗ Not present; must be added |
| `CricketDataConfig` is a known type in the codebase | Searched codebase; no such type exists | ✗ Must be defined |
| ESPN API endpoint structure matches design examples | Design assumes ESPN has `/players/{id}/stats`, `/matches/{id}`, `/search` endpoints | ⚠ Not verified; ESPN API documentation required |
| Player IDs in database match ESPN player IDs | Assumed 1:1 mapping; no mapping table exists | ⚠ Assumption; potential risk (see Finding #3) |
| Redis connection pooling is handled by ioredis automatically | Design does not document connection pool configuration | ⚠ Needs clarification |

---

## Summary Table

| Finding | Severity | Status | Requires Implementation Change |
|---------|----------|--------|-------------------------------|
| 1. Missing dependency pin strategy for Redis | HIGH | MUST FIX | Yes — add to package.json with version |
| 2. Undefined CricketDataConfig type | HIGH | MUST FIX | Yes — define type and injection |
| 3. Unvalidated player ID mismatch assumption | HIGH | MUST FIX | Yes — add error handling and mapping strategy |
| 4. Rate-limit backoff not shared in clustered deployments | MEDIUM | SHOULD FIX | Yes — document and implement shared state |
| 5. Stale cache age not communicated to frontend | MEDIUM | SHOULD FIX | Yes — add `ageSeconds` and `isStale` fields |
| 6. No validation of provider responses | MEDIUM | SHOULD FIX | Yes — add Zod validation schema |
| 7. Module factory does not validate config at startup | MEDIUM | SHOULD FIX | Yes — add validation hook |
| 8. RateLimitInfo type not defined | NIT | NICE TO FIX | Yes — define type |
| 9. PlayerRepository.findById verified | NIT | OK | No — assumption confirmed |
| 10. isHealthy() implementation details missing | NIT | NICE TO FIX | Yes — add example implementation |
| 11. Pagination documentation incomplete | NIT | NICE TO FIX | Yes — clarify limit/offset behavior |

---

## Conclusion

The design demonstrates strong architectural thinking and covers most of the required functionality. The main gaps are configuration wiring (`CricketDataConfig`), dependency management (Redis package selection), and error handling for edge cases (player ID mismatch, stale cache visibility, response validation).

**Verdict: CHANGES_REQUESTED**

All three HIGH findings must be resolved before implementation begins. The MEDIUM findings are important for resilience and observability but could be addressed during implementation with minor adjustments. NIT findings improve clarity and robustness.

Recommended next steps:
1. Define `CricketDataConfig` interface and injection strategy.
2. Update `envSchema` with cricket variables and document mapping to `CricketDataConfig`.
3. Add `ioredis@^5.3.0` to `apps/api/package.json`.
4. Add player ID validation and graceful fallback when provider data is unavailable.
5. Add `isStale` and `ageSeconds` to cache metadata DTOs.
6. Implement Zod validation for ESPN responses.
7. Add module-level config validation and fail-fast startup checks.

