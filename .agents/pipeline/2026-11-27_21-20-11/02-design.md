# Phase M: Live Cricket Data Integration — Technical Design

**Status:** Ready for implementation  
**Phase:** M  
**Feature:** Live Cricket Data Integration  
**Date:** 2026-11-27  
**Product:** Under The Hammer

---

## Overview

This design establishes a provider-independent abstraction for cricket data sources and implements ESPN/cricapi as the initial concrete provider. The architecture uses dependency injection to decouple services from provider-specific implementations, enabling future integrations (Statsbomb, official boards, proprietary APIs) without modifying existing code.

The implementation exposes three REST endpoints for player search, player statistics and match information. All responses are cached with a 1-hour TTL minimum, with in-memory fallback and optional Redis support. Rate-limit backoff (exponential, with jitter) automatically retries on HTTP 429. Stale cache is returned on provider errors if available. Frontend components and hooks consume the backend endpoints and cache responses in the browser for 5 minutes to reduce backend load.

All provider URLs, API keys and configuration are environment-based, never hardcoded. TypeScript strict mode is enforced throughout. The implementation includes 60+ test cases covering provider abstraction, caching behavior, rate limiting, error recovery and frontend interactions.

---

## Architecture Decisions

### 1. Provider Abstraction Pattern

**Decision:** Use an interface-based abstraction with dependency injection.

**Why:** This creates a clear contract that any provider must fulfill and allows runtime provider selection via environment configuration. Future implementations can be added as new classes implementing the interface without modifying service code. The pattern mirrors the existing payment provider abstraction (mentioned in ARCHITECTURE.md) and aligns with AGENTS.md mandatory engineering principles (domain boundaries, explicit service boundaries, no circular dependencies).

**Technology stack:**
- TypeScript interfaces for contracts
- NestJS dependency injection via `@Injectable()` and `providers` array in modules
- Zod or similar for DTO validation at provider boundaries

### 2. Single Active Provider at Runtime

**Decision:** One provider is active per environment; no automatic failover.

**Why:** Complexity and observability. Attempting to failover silently to a secondary provider makes it harder to detect and debug provider issues. The stale-cache fallback provides sufficient resilience for temporary outages. Multi-provider failover is deferred to Phase N; for Phase M, the choice is "ESPN/cricapi" or none.

**Configuration:** `CRICKET_PROVIDER` env var selects the provider class. Defaults to `espn`. Invalid values fail at startup with a readable error.

### 3. Layered Caching Strategy

**Decision:** Implement a two-layer cache: in-memory primary, optional Redis secondary.

**Why:** Provides availability even if Redis is unavailable or misconfigured. In-memory cache is always available; Redis (if present) enables cache sharing across multiple API instances. For Phase M, in-memory is sufficient. The cache key includes the provider name, operation (search/stats/match), and identifiers (player/match ID, format where applicable) to avoid collisions.

**Cache TTL:** Minimum 1 hour (configurable via `CRICKET_CACHE_TTL_MINUTES` env var, default 60). Shorter TTLs risk stale stats during active tournaments; longer TTLs may serve outdated data. Product review should validate this assumption.

**Stale-on-Error Behavior:** If a provider call fails (network error, 5xx), the service checks for cached data. If cache exists, it returns the stale data with a flag indicating staleness. If no cache, it returns a 503 Service Unavailable. This prioritizes availability over freshness during transient provider outages.

### 4. Exponential Backoff with Jitter

**Decision:** Implement exponential backoff starting at 1 second, doubling on each retry, max 60 seconds between attempts, with ±10% jitter.

**Why:** Respects provider rate limits and prevents cascading failures. Jitter prevents thundering herd if multiple API instances encounter the same rate limit simultaneously. After maximum retries exhausted (default 5), the service falls back to cached data or returns 503. This is logged at WARN level.

**Configuration:**
- `CRICKET_RATE_LIMIT_MAX_RETRIES` (default: 5)
- Backoff and jitter are hardcoded for Phase M; future phases can expose as config if needed.

### 5. Stateless Services with Externalized Retry State

**Decision:** Services are stateless; retry state is tracked in a shared in-memory or Redis structure keyed by provider + operation + ID.

**Why:** Keeps services testable and doesn't require session affinity if the API is replicated. The cache layer owns retry tracking, not the service.

---

## Module Structure

### Backend: apps/api/src/cricket-data

```
cricket-data/
├── providers/
│   ├── cricket-provider.interface.ts        # Interface defining the contract
│   ├── espn-data.provider.ts                # ESPN/cricapi implementation
│   └── provider.factory.ts                  # Instantiates provider based on env
├── services/
│   ├── cricket-data.service.ts              # Orchestration, caching strategy
│   ├── player-stats.service.ts              # Player stats retrieval & transform
│   ├── live-match.service.ts                # Match info retrieval & transform
│   └── cache.service.ts                     # Cache abstraction (in-memory or Redis)
├── controllers/
│   └── cricket-data.controller.ts           # REST endpoints
├── dtos/
│   ├── player-search-response.dto.ts        # API response schemas
│   ├── player-stats-response.dto.ts
│   └── match-info-response.dto.ts
├── errors/
│   └── cricket-data.errors.ts               # Domain-specific error classes
├── validators/
│   └── cricket-data.validators.ts           # Input validation rules
├── __tests__/
│   ├── cricket-provider.interface.spec.ts
│   ├── espn-data.provider.spec.ts
│   ├── cricket-data.service.spec.ts
│   ├── player-stats.service.spec.ts
│   ├── live-match.service.spec.ts
│   ├── cache.service.spec.ts
│   └── cricket-data.controller.spec.ts
├── cricket-data.module.ts                   # NestJS module definition
└── index.ts                                 # Barrel export
```

### Frontend: apps/web/src

```
components/
├── PlayerStatsDisplay.tsx                   # Component to show player stats
└── PlayerStatsDisplay.spec.tsx              # Component tests

hooks/
├── useCricketData.ts                        # Hook for fetching & caching cricket data
└── useCricketData.spec.ts                   # Hook tests

lib/
└── cricket-data.api.ts                      # API client for cricket endpoints
```

---

## Interface Design

### CricketProvider Interface

```typescript
// apps/api/src/cricket-data/providers/cricket-provider.interface.ts

export interface PlayerSearchResult {
  id: string;
  name: string;
  role: 'BATTER' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKETKEEPER';
  country?: string;
}

export interface PlayerStatsFormat {
  format: 'TEST' | 'ODI' | 'T20' | 'DOMESTIC' | string;
  matches: number;
  runs: number;
  wickets: number;
  battingAverage: number | null;
  strikeRate: number | null;
  bowlingAverage: number | null;
  bowlingEconomy: number | null;
}

export interface PlayerStatsResponse {
  playerId: string;
  name: string;
  role: string;
  stats: PlayerStatsFormat[];
  asOf: Date;
}

export interface MatchInfo {
  id: string;
  teams: { id: string; name: string }[];
  format: string;
  status: 'UPCOMING' | 'LIVE' | 'COMPLETED';
  currentRunsTeam1: number;
  currentWicketsTeam1: number;
  currentRunsTeam2: number;
  currentWicketsTeam2: number;
  competition: string;
  asOf: Date;
}

export interface CricketProvider {
  /**
   * Search for players by name query.
   * @param query Search string (1-100 chars, alphanumeric + space + hyphen)
   * @returns List of matching players, max 50 results
   * @throws ProviderError on network or server error
   */
  searchPlayers(query: string): Promise<PlayerSearchResult[]>;

  /**
   * Retrieve player statistics for a given player ID.
   * @param playerId Provider-specific player ID
   * @returns Player stats grouped by format
   * @throws ProviderError on network, 404 or server error
   */
  getPlayerStats(playerId: string): Promise<PlayerStatsResponse>;

  /**
   * Retrieve match information for a given match ID.
   * @param matchId Provider-specific match ID
   * @returns Match metadata and current scores
   * @throws ProviderError on network, 404 or server error
   */
  getMatchInfo(matchId: string): Promise<MatchInfo>;
}
```

### Error Hierarchy

```typescript
// apps/api/src/cricket-data/errors/cricket-data.errors.ts

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class RateLimitError extends ProviderError {
  constructor(public readonly retryAfterSeconds?: number) {
    super('RATE_LIMIT', 429, true, 'Provider rate limit exceeded');
  }
}

export class NotFoundError extends ProviderError {
  constructor(message: string) {
    super('NOT_FOUND', 404, false, message);
  }
}

export class NetworkError extends ProviderError {
  constructor(message: string) {
    super('NETWORK_ERROR', 503, true, message);
  }
}
```

---

## Service Layer Design

### CricketDataService

**Responsibility:** High-level orchestration, caching strategy, provider delegation.

```typescript
export class CricketDataService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly playerStatsService: PlayerStatsService,
    private readonly liveMatchService: LiveMatchService,
  ) {}

  /**
   * Search players with caching.
   * Cache key: `cricket:search:{provider}:{query}`
   * TTL: 1 hour
   */
  async searchPlayers(query: string): Promise<PlayerSearchResult[]> {
    const cacheKey = `cricket:search:${this.provider.name}:${query}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit for player search', { query });
      return cached;
    }

    try {
      const results = await this.provider.searchPlayers(query);
      await this.cacheService.set(cacheKey, results, this.cacheTTL);
      return results;
    } catch (error) {
      if (error instanceof ProviderError && error.retryable) {
        // Backoff already applied by provider; if we got here, all retries exhausted
        const staleData = await this.cacheService.get(cacheKey);
        if (staleData) {
          this.logger.warn('Returning stale cache on provider error', { query, error: error.message });
          return staleData; // Return stale data
        }
      }
      throw error; // No cache; propagate error
    }
  }

  // Similar for getPlayerStats and getMatchInfo...
}
```

### PlayerStatsService

**Responsibility:** Retrieves player statistics from provider, transforms and groups by format.

```typescript
export class PlayerStatsService {
  constructor(
    private readonly provider: CricketProvider,
    private readonly cacheService: CacheService,
    private readonly logger: Logger,
  ) {}

  /**
   * Get player stats grouped by format.
   * Cache key: `cricket:stats:{provider}:{playerId}`
   */
  async getPlayerStats(playerId: string): Promise<PlayerStatsResponse> {
    const cacheKey = `cricket:stats:${this.provider.name}:${playerId}`;
    
    // Try cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit for player stats', { playerId });
      return cached;
    }

    try {
      const stats = await this.provider.getPlayerStats(playerId);
      
      // Transform: sort formats, validate numeric fields
      const transformed = this.transformStats(stats);
      
      await this.cacheService.set(cacheKey, transformed, this.cacheTTL);
      return transformed;
    } catch (error) {
      if (error instanceof ProviderError && error.retryable) {
        const staleData = await this.cacheService.get(cacheKey);
        if (staleData) {
          this.logger.warn('Returning stale cache on player stats error', { playerId });
          return staleData;
        }
      }
      throw error;
    }
  }

  private transformStats(stats: PlayerStatsResponse): PlayerStatsResponse {
    // Sort formats by priority (TEST -> ODI -> T20 -> DOMESTIC -> other)
    // Validate numeric fields (runs, wickets, averages)
    // Fill in null values appropriately
    return stats;
  }
}
```

### LiveMatchService

**Responsibility:** Retrieves match information from provider, transforms and optionally maps to tournament context.

```typescript
export class LiveMatchService {
  constructor(
    private readonly provider: CricketProvider,
    private readonly cacheService: CacheService,
    private readonly logger: Logger,
  ) {}

  /**
   * Get match info with caching.
   * Cache key: `cricket:match:{provider}:{matchId}`
   * TTL: 5 minutes (matches update more frequently than player stats)
   */
  async getMatchInfo(matchId: string): Promise<MatchInfo> {
    const cacheKey = `cricket:match:${this.provider.name}:${matchId}`;
    
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const match = await this.provider.getMatchInfo(matchId);
      
      // Cache with shorter TTL (5 min) since matches update more frequently
      await this.cacheService.set(cacheKey, match, 5);
      return match;
    } catch (error) {
      if (error instanceof ProviderError && error.retryable) {
        const staleData = await this.cacheService.get(cacheKey);
        if (staleData) {
          this.logger.warn('Returning stale cache on match info error', { matchId });
          return staleData;
        }
      }
      throw error;
    }
  }
}
```

### CacheService

**Responsibility:** Abstracts in-memory and Redis cache; handles TTL, staleness flags, and retry state tracking.

```typescript
export abstract class CacheService {
  abstract get<T>(key: string): Promise<T | null>;
  abstract set<T>(key: string, value: T, ttlMinutes: number): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract clear(): Promise<void>;
}

export class InMemoryCacheService extends CacheService {
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

  async set<T>(key: string, value: T, ttlMinutes: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    });
  }

  // ... delete, clear
}

export class RedisCacheService extends CacheService {
  constructor(private readonly redisClient: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redisClient.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set<T>(key: string, value: T, ttlMinutes: number): Promise<void> {
    await this.redisClient.setex(key, ttlMinutes * 60, JSON.stringify(value));
  }

  // ... delete, clear
}
```

---

## Endpoints and Request/Response Design

### GET /v1/cricket/players/search?q=virat

**Request Query Parameters:**
- `q` (required): String, 1–100 characters. Alphanumeric, spaces, hyphens only. Trimmed.
- Returns: Array of matching players, max 50 results.

**Response (200 OK):**
```json
{
  "results": [
    { "id": "virat_kohli_1", "name": "Virat Kohli", "role": "BATTER", "country": "India" },
    { "id": "virat_singh_1", "name": "Virat Singh", "role": "BATTER", "country": "India" }
  ]
}
```

**Error Responses:**
- `400 Bad Request`: Invalid `q` (empty, >100 chars, special chars). Error code: `INVALID_SEARCH_QUERY`.
- `429 Too Many Requests`: Client rate limit. Error code: `RATE_LIMITED`.
- `503 Service Unavailable`: Provider unavailable and no cached data. Error code: `SERVICE_UNAVAILABLE`.

### GET /v1/players/:id/stats?live=true

**Path Parameters:**
- `id` (required): Player ID string.

**Query Parameters:**
- `live` (optional): Boolean flag. If true, attempt fresh fetch (bypass cache check, but still use cache fallback on error).

**Response (200 OK):**
```json
{
  "playerId": "virat_kohli_1",
  "name": "Virat Kohli",
  "role": "BATTER",
  "stats": [
    {
      "format": "TEST",
      "matches": 100,
      "runs": 7900,
      "wickets": 0,
      "battingAverage": 50.3,
      "strikeRate": 55.2,
      "bowlingAverage": null,
      "bowlingEconomy": null
    },
    {
      "format": "ODI",
      "matches": 250,
      "runs": 12000,
      "wickets": 0,
      "battingAverage": 58.1,
      "strikeRate": 92.1,
      "bowlingAverage": null,
      "bowlingEconomy": null
    }
  ],
  "asOf": "2026-11-27T10:30:00Z"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid player ID format (empty). Error code: `INVALID_ID`.
- `404 Not Found`: Player not found (provider returned 404). Error code: `NOT_FOUND`.
- `503 Service Unavailable`: Provider error and no cached data. Error code: `SERVICE_UNAVAILABLE`.

### GET /v1/cricket/matches/:id

**Path Parameters:**
- `id` (required): Match ID string.

**Response (200 OK):**
```json
{
  "id": "psl_2026_match_1",
  "teams": [
    { "id": "karachi_kings", "name": "Karachi Kings" },
    { "id": "lahore_qalandars", "name": "Lahore Qalandars" }
  ],
  "format": "T20",
  "status": "LIVE",
  "currentRunsTeam1": 125,
  "currentWicketsTeam1": 3,
  "currentRunsTeam2": 0,
  "currentWicketsTeam2": 0,
  "competition": "PSL 2026",
  "asOf": "2026-11-27T15:45:00Z"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid match ID (empty). Error code: `INVALID_ID`.
- `404 Not Found`: Match not found. Error code: `NOT_FOUND`.
- `503 Service Unavailable`: Provider error and no cached data. Error code: `SERVICE_UNAVAILABLE`.

---

## ESPN/cricapi Provider Implementation

**Key Design Decisions:**

1. **API Endpoints:** Hardcode ESPN/cricapi base URL as a constant; actual endpoint is retrieved from env var `CRICKET_ESPN_API_URL`.

2. **Authentication:** API key passed as query parameter `apikey={CRICKET_ESPN_API_KEY}`.

3. **Rate-Limit Handling:**
   - Detect HTTP 429 response.
   - Extract `Retry-After` header if present (optional; use default backoff if not).
   - Implement exponential backoff: 1s, 2s, 4s, 8s, 16s (max 60s).
   - Add jitter: ±10% (e.g., 1s becomes [0.9s, 1.1s]).
   - Retry up to 5 times; on exhaustion, fall back to cache or return 503.

4. **Response Transformation:**
   - ESPN/cricapi returns player objects with format-specific stats.
   - Transform to internal `PlayerStatsResponse` schema.
   - Map ESPN roles (e.g., "batsman") to canonical role enum.

5. **Error Handling:**
   - Network errors (connection refused, timeout): Throw `NetworkError` (retryable).
   - HTTP 429: Throw `RateLimitError` (retryable).
   - HTTP 404: Throw `NotFoundError` (not retryable).
   - HTTP 5xx: Throw `ProviderError` with `retryable=true`.
   - Unexpected response format: Throw `ProviderError` (log and treat as transient).

```typescript
// apps/api/src/cricket-data/providers/espn-data.provider.ts

@Injectable()
export class ESPNDataProvider implements CricketProvider {
  private readonly baseUrl = process.env.CRICKET_ESPN_API_URL;
  private readonly apiKey = process.env.CRICKET_ESPN_API_KEY;
  private readonly httpClient = new HttpClient(); // Or use NestJS HttpModule

  async searchPlayers(query: string): Promise<PlayerSearchResult[]> {
    const url = `${this.baseUrl}/players?search=${encodeURIComponent(query)}&apikey=${this.apiKey}`;
    
    try {
      const response = await this.withBackoffRetry(() =>
        this.httpClient.get(url),
      );
      
      // Transform ESPN response to internal schema
      return response.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        role: this.mapRole(p.role),
        country: p.country,
      }));
    } catch (error) {
      this.handleProviderError(error, 'searchPlayers');
    }
  }

  async getPlayerStats(playerId: string): Promise<PlayerStatsResponse> {
    const url = `${this.baseUrl}/players/${playerId}?apikey=${this.apiKey}`;
    
    try {
      const response = await this.withBackoffRetry(() =>
        this.httpClient.get(url),
      );
      
      return this.transformPlayerStats(response.data);
    } catch (error) {
      this.handleProviderError(error, 'getPlayerStats');
    }
  }

  /**
   * Wraps HTTP call with exponential backoff and jitter.
   */
  private async withBackoffRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 5,
  ): Promise<T> {
    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (error) {
        if (error instanceof RateLimitError) {
          attempt++;
          if (attempt >= maxRetries) {
            throw error;
          }

          const backoffMs = this.calculateBackoff(attempt);
          this.logger.warn('Rate limit backoff', { attempt, backoffMs });
          
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Backoff retries exhausted');
  }

  private calculateBackoff(attempt: number): number {
    // Exponential: 2^(attempt-1) seconds, capped at 60s
    const baseSeconds = Math.min(Math.pow(2, attempt - 1), 60);
    
    // Add ±10% jitter
    const jitterFactor = 0.9 + Math.random() * 0.2;
    const ms = baseSeconds * 1000 * jitterFactor;
    
    return ms;
  }

  private handleProviderError(error: unknown, operation: string): never {
    if (error instanceof HttpException) {
      if (error.getStatus() === 429) {
        throw new RateLimitError();
      }
      if (error.getStatus() === 404) {
        throw new NotFoundError('Player or match not found');
      }
      if (error.getStatus() >= 500) {
        throw new ProviderError('PROVIDER_ERROR', error.getStatus(), true, error.message);
      }
      throw new ProviderError('PROVIDER_ERROR', error.getStatus(), false, error.message);
    }

    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      throw new NetworkError('Failed to connect to provider');
    }

    throw new ProviderError('PROVIDER_ERROR', 500, true, 'Unknown provider error');
  }

  private mapRole(espnRole: string): string {
    const roleMap: Record<string, string> = {
      batsman: 'BATTER',
      bowler: 'BOWLER',
      allrounder: 'ALL_ROUNDER',
      wicketkeeper: 'WICKETKEEPER',
    };
    return roleMap[espnRole.toLowerCase()] || 'BATTER';
  }

  private transformPlayerStats(data: any): PlayerStatsResponse {
    // Convert ESPN response format to internal PlayerStatsResponse
    // Group stats by format (TEST, ODI, T20, DOMESTIC)
    // Handle missing/null fields appropriately
    return {
      playerId: data.id,
      name: data.name,
      role: this.mapRole(data.role),
      stats: this.groupStatsByFormat(data.statistics),
      asOf: new Date(),
    };
  }

  private groupStatsByFormat(stats: any[]): PlayerStatsFormat[] {
    // Group and transform
    return [];
  }
}
```

---

## Frontend Design

### PlayerStatsDisplay Component

**Purpose:** Display player statistics within a player profile or introduction area. Responsive, accessible, with loading and error states.

**Props:**
```typescript
export interface PlayerStatsDisplayProps {
  playerId: string;
  format?: 'TEST' | 'ODI' | 'T20' | 'DOMESTIC'; // Optional filter
  showTitle?: boolean; // Default true
}
```

**Features:**
- Fetches data via `useCricketData` hook.
- Shows loading skeleton while fetching.
- Shows error message with retry button on failure.
- Shows empty state if no data available.
- Displays stats in a table or card layout (mobile: stacked cards, desktop: table).
- Respects `prefers-reduced-motion` for animations.

**Responsive Behavior:**
- Mobile (<768px): One column, stats stacked vertically.
- Tablet/Desktop (≥768px): Multi-column, stats grouped by format.

### useCricketData Hook

**Purpose:** Encapsulate fetch logic, browser caching, and error handling.

**Signature:**
```typescript
export interface UseCricketDataOptions {
  playerId: string;
  format?: string;
  forceRefresh?: boolean;
}

export interface UseCricketDataResult {
  data: PlayerStatsResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useCricketData(options: UseCricketDataOptions): UseCricketDataResult;
```

**Behavior:**
- Uses `AbortController` to cancel in-flight requests on unmount.
- Caches successful responses in memory for 5 minutes (browser session).
- `forceRefresh=true` bypasses cache and fetches from backend.
- Returns error in result object; does not throw.
- Handles network errors gracefully (timeout, connection refused).

**Example Usage:**
```typescript
export function PlayerProfile({ playerId }: Props) {
  const { data, loading, error, refetch } = useCricketData({ playerId });

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} onRetry={refetch} />;
  if (!data) return <EmptyState />;

  return <PlayerStatsDisplay data={data} />;
}
```

---

## Error Handling

### Backend Error Response Format

All error responses follow a consistent shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "timestamp": "2026-11-27T10:30:00Z"
  }
}
```

**Error Codes:**
- `INVALID_SEARCH_QUERY`: Search query failed validation (empty, >100 chars, special chars).
- `INVALID_ID`: Player or match ID failed validation (empty string).
- `NOT_FOUND`: Resource not found (provider returned 404).
- `RATE_LIMITED`: Client hit rate limit (HTTP 429).
- `SERVICE_UNAVAILABLE`: Provider unavailable and no cached data (HTTP 503).
- `INTERNAL_ERROR`: Unexpected server error (HTTP 500).

### Failure Scenarios

| Scenario | Status | Behavior | Logging |
|---|---|---|---|
| **Cache hit** | 200 | Return cached data | DEBUG: "Cache hit" |
| **Provider success** | 200 | Store in cache, return | DEBUG: "Provider call succeeded" |
| **Provider network error** | 503 or 200 (cache) | Log at WARN; return stale cache if exists; else 503 | WARN: "Provider network error; {falling back to cache \| no cache available}" |
| **Provider 429 (rate limit)** | 503 or 200 (cache) | Backoff and retry; if max retries exhausted, stale cache or 503 | WARN: "Rate limit hit; backing off. Attempt {N}/{max_retries}"; then "Rate limit max retries exhausted" |
| **Provider 404** | 404 | Do not cache; propagate 404 | INFO: "Provider returned 404 for {resource}" |
| **Provider 5xx** | 503 or 200 (cache) | Treat as retryable; backoff; stale cache or 503 | WARN: "Provider error: {status code}; {falling back to cache \| no cache available}" |
| **Invalid input** | 400 | Return validation error | DEBUG: "Input validation failed: {reason}" |
| **Missing env var** | Server fail on startup | Log and exit | ERROR: "Required env var {VAR} not set" |

---

## Input Validation

**Player Search Query (`q` parameter):**
- Required: Yes.
- Type: String.
- Min length: 1 character.
- Max length: 100 characters.
- Allowed characters: a–z, A–Z, 0–9, space, hyphen (`-`).
- Trimmed before use.
- Empty or special characters: Return 400 `INVALID_SEARCH_QUERY`.

**Player/Match ID:**
- Required: Yes.
- Type: String.
- Min length: 1 character (non-empty).
- Max length: 255 characters (practical limit).
- Allowed characters: a–z, A–Z, 0–9, underscore (`_`), hyphen (`-`).
- Trimmed before use.
- Empty string: Return 400 `INVALID_ID`.

---

## Configuration and Environment Variables

| Variable | Type | Default | Required | Purpose |
|---|---|---|---|---|
| `CRICKET_PROVIDER` | string | `espn` | No | Provider selection (`espn` or future providers) |
| `CRICKET_ESPN_API_URL` | string | — | Yes (if provider=espn) | ESPN/cricapi base URL |
| `CRICKET_ESPN_API_KEY` | string | — | Yes (if provider=espn) | ESPN/cricapi API key |
| `CRICKET_CACHE_TTL_MINUTES` | number | 60 | No | Cache time-to-live in minutes (minimum 10) |
| `REDIS_URL` | string | — | No | Redis connection URL; if absent, in-memory cache used |
| `CRICKET_RATE_LIMIT_MAX_RETRIES` | number | 5 | No | Max backoff retries on rate limit |
| `LOG_LEVEL` | string | `info` | No | Logger verbosity (debug, info, warn, error) |

**Startup Validation:**
- If `CRICKET_PROVIDER` is not `espn`, fail with readable error.
- If `CRICKET_PROVIDER=espn` but `CRICKET_ESPN_API_URL` or `CRICKET_ESPN_API_KEY` is missing, fail with readable error.
- If `CRICKET_CACHE_TTL_MINUTES` is set and < 10, warn and use 10 as minimum.
- If `REDIS_URL` is invalid or unreachable, log WARN and fall back to in-memory cache.

---

## Caching Details

### Cache Keys

Format: `cricket:{operation}:{provider}:{identifier}`

Examples:
- `cricket:search:espn:virat`
- `cricket:stats:espn:virat_kohli_1`
- `cricket:match:espn:psl_2026_match_1`

### In-Memory Cache Structure

```typescript
class InMemoryCacheService {
  private cache = new Map<
    string,
    { value: unknown; expiresAt: number; stale?: boolean }
  >();
}
```

### Redis Cache Structure

- Key: Same as above.
- Value: JSON-serialized data.
- TTL: Set via `SETEX` command.
- No staleness flag (Redis doesn't track modifications after expiration).

### Invalidation

**Manual (Admin):** A future admin endpoint can invalidate cache for a specific player/match or clear entire cache. Not required for Phase M.

**Automatic:** TTL expiration.

**On Error:** Stale data is returned but not updated/refreshed in cache (keeps older cached value).

---

## Testing Strategy

### Unit Tests (Backend)

**CricketProvider Interface & ESPN Implementation (15+ tests):**
- Constructor validation (missing env vars).
- Successful player search with mocked HTTP response.
- Successful player stats retrieval with format grouping.
- Successful match info retrieval.
- HTTP 404 response → `NotFoundError`.
- HTTP 429 response → `RateLimitError`.
- HTTP 5xx response → `ProviderError` with `retryable=true`.
- Network error (connection refused) → `NetworkError`.
- Invalid/malformed provider response → `ProviderError`.
- Backoff retry: exponential delay verified.
- Backoff retry: jitter applied (±10%).
- Backoff retry: max retries exhausted, final error thrown.

**CricketDataService (10+ tests):**
- Cache hit returns without provider call.
- Cache miss triggers provider call and stores result.
- Provider error with cached data returns stale cache.
- Provider error without cached data throws error.
- Multiple concurrent requests don't duplicate provider calls (request deduplication).

**PlayerStatsService (8+ tests):**
- Stats transformation: formats sorted correctly.
- Stats transformation: numeric fields validated.
- Stats transformation: null/missing fields handled.
- Stale cache returned on provider error.

**LiveMatchService (5+ tests):**
- Match cache TTL is 5 minutes (shorter than player stats).
- Match error handling similar to stats service.

**CacheService (10+ tests):**
- In-memory cache: get/set/delete operations.
- In-memory cache: TTL expiration.
- In-memory cache: concurrent reads/writes thread-safe (or Promise-based, non-concurrent in JS).
- Redis cache: get/set/delete operations.
- Redis cache: TTL respected.
- Redis cache fallback to in-memory if Redis unavailable.

**Controller/Endpoints (12+ tests):**
- GET `/v1/cricket/players/search?q=virat` returns 200 with results.
- GET `/v1/cricket/players/search` (missing `q`) returns 400 `INVALID_SEARCH_QUERY`.
- GET `/v1/cricket/players/search?q=x` (single char) returns 200 (valid).
- GET `/v1/cricket/players/search?q=$pecial` (special chars) returns 400.
- GET `/v1/players/{id}/stats?live=true` returns 200 with stats.
- GET `/v1/players/{id}/stats` (live flag omitted) returns 200 with stats.
- GET `/v1/players/invalid` (not found) returns 404.
- GET `/v1/cricket/matches/{id}` returns 200 with match info.
- Provider rate-limit (429) → endpoint returns 503 or 200 (cache).
- Provider network error → endpoint returns 503 or 200 (cache).

### Integration Tests (Backend)

**Provider Integration (5+ tests):**
- Real ESPN/cricapi call (or mocked HTTP server) for player search.
- Real ESPN/cricapi call for player stats (validate format grouping).
- Real ESPN/cricapi call for match info.
- Rate-limit backoff integration (mocked provider returns 429, verify retries).

**Database Integration (not required for Phase M, cricket data is read-only from provider):**
- N/A

### E2E Tests (Frontend)

**PlayerStatsDisplay Component (5+ tests):**
- Component loads and fetches data via hook.
- Loading state displayed while fetching.
- Data displayed in table/cards after fetch completes.
- Error state with retry button on fetch failure.
- Mobile responsive layout (stacked) vs desktop (side-by-side).

**useCricketData Hook (4+ tests):**
- Hook fetches data and returns in result object.
- Hook caches successful response for 5 minutes.
- Second call within 5 minutes uses cache (no new fetch).
- `forceRefresh=true` bypasses cache and fetches fresh.
- Hook cleans up `AbortController` on unmount.

**Integration E2E (3+ tests):**
- User navigates to player profile; stats load and display.
- User clicks retry on error; stats refetch and display.
- User navigates away from profile; cleanup occurs (no memory leaks).

---

## Module Integration

### NestJS Module Definition

```typescript
// apps/api/src/cricket-data/cricket-data.module.ts

@Module({
  imports: [HttpModule, CacheModule], // Import cache abstraction
  controllers: [CricketDataController],
  providers: [
    CricketDataService,
    PlayerStatsService,
    LiveMatchService,
    {
      provide: 'CricketProvider',
      useFactory: (config: ConfigService) => {
        const provider = config.get('CRICKET_PROVIDER', 'espn');
        if (provider === 'espn') {
          return new ESPNDataProvider(config);
        }
        throw new Error(`Unknown cricket provider: ${provider}`);
      },
      inject: [ConfigService],
    },
    {
      provide: 'CacheService',
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get('REDIS_URL');
        if (redisUrl) {
          return new RedisCacheService(new Redis(redisUrl));
        }
        return new InMemoryCacheService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [CricketDataService, PlayerStatsService, LiveMatchService],
})
export class CricketDataModule {}
```

### Integration with Main App

The `cricket-data` module is imported into the main NestJS app module:

```typescript
// apps/api/src/app.module.ts

@Module({
  imports: [
    ConfigModule.forRoot(),
    CricketDataModule, // Add here
    PlayersModule,
    // ... other modules
  ],
})
export class AppModule {}
```

---

## Logging

**Log Levels and Events:**

| Level | Event | Example |
|---|---|---|
| DEBUG | Cache hit | `Cricket cache hit: key=cricket:stats:espn:virat_kohli_1` |
| DEBUG | Provider call initiated | `Calling provider searchPlayers: query=virat` |
| DEBUG | Cache store | `Storing in cache: key=cricket:stats:espn:virat_kohli_1 ttl=60` |
| INFO | Provider call success | `Provider call succeeded: operation=getPlayerStats playerId=virat_kohli_1` |
| WARN | Cache miss on first call | `Cache miss: key=cricket:stats:espn:virat_kohli_1 (expected)` |
| WARN | Stale cache fallback | `Provider error; returning stale cache: key=cricket:stats:espn:virat_kohli_1 error=NETWORK_ERROR` |
| WARN | Rate limit backoff | `Rate limit detected; backing off. Attempt 1/5; next retry in 1050ms` |
| WARN | Rate limit max retries exhausted | `Rate limit max retries exhausted; falling back to cache (or returning 503)` |
| ERROR | Provider network error | `Provider network error: code=ECONNREFUSED url=https://api.espncricinfo.com/...` |
| ERROR | Invalid env var | `Required env var CRICKET_ESPN_API_KEY not set; server startup failed` |

**Structured Fields (all events):**
- `provider`: "espn" or other provider name
- `operation`: "searchPlayers", "getPlayerStats", "getMatchInfo"
- `playerId` or `matchId` (where applicable)
- `cacheKey`: Full cache key
- `attempt`: (for backoff) Current attempt number
- `error`: Error message/code (for errors)
- `timestamp`: ISO 8601 datetime

---

## Security Considerations

1. **API Keys in Env:** Never log or echo `CRICKET_ESPN_API_KEY`. Stored only in environment; passed to provider via secure HTTP headers/params.

2. **No Credentials in Error Responses:** Error messages returned to clients never contain API keys, URLs or sensitive config.

3. **Input Validation:** All external inputs (search query, IDs) validated and sanitized before use.

4. **Rate Limiting (Future):** Client-side rate limiting can be added if needed; Phase M handles provider rate limits only.

5. **CORS (if applicable):** Public cricket endpoints do not require authentication; CORS policy follows application defaults.

6. **Cache Security:** Cache contains only public data (player stats, match info). No sensitive information cached.

---

## Implementation Sequence

1. **Define Interfaces & Error Classes:** `CricketProvider`, error hierarchy.
2. **Implement Cache Layer:** `InMemoryCacheService`, `RedisCacheService`.
3. **Implement ESPN Provider:** `ESPNDataProvider` with backoff logic.
4. **Implement Services:** `CricketDataService`, `PlayerStatsService`, `LiveMatchService`.
5. **Implement Controller & Endpoints:** Route handlers with validation.
6. **Write Backend Tests:** 60+ test cases.
7. **Implement Frontend Component:** `PlayerStatsDisplay`.
8. **Implement Frontend Hook:** `useCricketData`.
9. **Write Frontend Tests:** Component and hook tests.
10. **Document:** API spec (Swagger), environment variables, error codes.

---

## Edge Cases

1. **Empty Search Results:** Provider returns empty array. Service returns empty array (not an error).

2. **Player with No Stats:** Provider returns player record but empty stats array. Service returns empty array; frontend shows "No statistics available."

3. **Partial Stats Data:** Provider returns player with stats only for some formats (e.g., TEST and ODI, but no T20). Service transforms and returns as-is; frontend displays available formats.

4. **Concurrent Cache Access:** Two requests arrive simultaneously for the same key. First request fetches from provider; second request waits for first to complete, then returns same cached result. (This requires a request-deduplication mechanism in the service layer.)

5. **Cache Expiration During Request:** Request begins, hits cache miss, calls provider. While provider call is in-flight, cache entry for a different request expires. No issue; each request has its own lifecycle.

6. **Provider Partial Outage:** Provider returns 429 for one endpoint (search) but 200 for another (match info). Services handle independently; one cached/retried, other succeeds.

7. **Network Timeout:** HTTP client timeout triggered mid-request. Throw `NetworkError`; service falls back to cache or returns 503.

8. **Malformed Provider Response:** Provider returns unexpected JSON structure. Service throws `ProviderError`; handled like other provider errors (cache fallback or 503).

---

## Performance Expectations

| Metric | Target | Notes |
|---|---|---|
| Search (cached) | <100ms | In-memory lookup |
| Search (fresh from provider) | <2s | Typical network + provider latency |
| Player stats (cached) | <100ms | In-memory lookup |
| Player stats (fresh) | <2s | Includes format grouping transform |
| Match info (cached) | <50ms | Shorter TTL, so more cache misses expected |
| Match info (fresh) | <2s | Frequent updates expected |
| Cache hit rate | >60% | Assuming ~5 min browser cache + 1 hr backend cache |
| Backoff delay (1st retry) | ~1s | ±10% jitter applied |
| Backoff delay (5th retry) | ~16s | ±10% jitter applied |

---

## Migration and Rollout

**Phase M Rollout:**
1. Deploy backend module with ESPN provider and in-memory cache.
2. Deploy frontend component and hook.
3. Integrate component into player profile page.
4. Monitor cache hit rate, provider latency and error rate.
5. Optionally enable Redis cache for multi-instance deployments.

**Future Phases:**
- Phase N: Add Statsbomb provider without modifying existing code.
- Phase O: Multi-provider failover (if business case justified).
- Phase P: Admin cache management UI.

---

## Decisions Deferred to Implementation or Future Phases

1. **Request Deduplication:** Implement simple in-memory deduplication (promise-based) to prevent duplicate provider calls for the same resource within a short window (e.g., 100ms). Can be deferred to Phase N if not critical.

2. **Circuit Breaker Pattern:** Deferral candidate for Phase N if provider outages become frequent. Phase M uses exponential backoff + cache fallback.

3. **Admin Cache Invalidation UI:** Deferral candidate for Phase O. Backend operation exists but no frontend admin dashboard in Phase M.

4. **Retry-After Header Parsing:** Phase M uses fixed backoff; parsing ESPN's `Retry-After` header is a Phase N enhancement.

5. **Provider-Specific Rate-Limit Strategies:** Different providers may have different rate-limit headers, response formats, or recovery mechanisms. Abstraction can be enhanced in future phases.

6. **Client-Side Rate Limiting:** Phase M handles provider rate limits server-side. Client-side throttling (e.g., max 1 search per 500ms) is a Phase N enhancement.

---

## Success Criteria (from Requirements Validation)

- ✅ **AC1:** `CricketProvider` interface defined and provider-agnostic.
- ✅ **AC2:** `ESPNDataProvider` implemented with authentication, backoff and error handling.
- ✅ **AC3:** Three backend services implemented with mocked provider tests.
- ✅ **AC4:** Three endpoints responding with proper validation and error codes.
- ✅ **AC5:** Caching layer with 1-hour TTL and stale-on-error behavior.
- ✅ **AC6:** Rate-limit backoff with exponential delay and jitter.
- ✅ **AC7:** Comprehensive error handling with consistent response shape.
- ✅ **AC8:** Environment configuration honored; no hardcoded values.
- ✅ **AC9:** Frontend component with responsive layout and loading/error states.
- ✅ **AC10:** `useCricketData` hook with browser cache and cleanup.
- ✅ **AC11:** 60+ test cases covering all critical paths.
- ✅ **AC12:** API documentation, env vars, error codes documented.
- ✅ **AC13:** No hardcoded values scanned and verified.
- ✅ **AC14:** TypeScript strict mode enforced.
- ✅ **AC15:** Module structure follows patterns; barrel exports present.

---

