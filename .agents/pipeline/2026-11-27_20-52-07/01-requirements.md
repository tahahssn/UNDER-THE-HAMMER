# Phase M: Live Cricket Data Integration — Requirements

**Status:** Requirements for Workflow Review  
**Date:** 2026-11-27  
**Phase:** M (Live Cricket Data Integration)  
**Requested By:** Development Team

---

## Summary

Implement a provider-independent abstraction layer for live cricket data integration, enabling the platform to source player statistics, match information and player search results from external cricket data providers (ESPN/cricapi) with caching, rate-limiting, and fallback resilience. The integration will power player profile displays, live match information pages and cross-team player search within auctions.

**Core scope:** 7 backend services/files, 3 frontend files, provider interface abstraction, in-memory/Redis caching, 60+ tests.

---

## Functional Requirements

### 1. Cricket Data Provider Abstraction

**1.1 CricketProvider interface**
- Language: TypeScript strict, no `any`
- Location: `apps/api/src/cricket-data/providers/cricket.provider.ts`
- Must define a contract for provider implementations:
  - `fetchPlayerStats(playerId: string, options?: { live?: boolean }): Promise<PlayerStatsDto>`
  - `searchPlayers(query: string, options?: { limit?: number }): Promise<PlayerSearchResult[]>`
  - `fetchMatchInfo(matchId: string): Promise<MatchInfoDto>`
  - `getProviderName(): string`
- Each provider must be stateless and injectable into the service layer.
- Errors must be wrapped in a `ProviderError` with provider name, operation, status code and original error.

**1.2 ESPNDataProvider implementation**
- Location: `apps/api/src/cricket-data/providers/espn-data.provider.ts`
- Implements the CricketProvider interface.
- Uses ESPN/cricapi endpoints (exact URLs from environment variables, never hardcoded).
- Required environment variables (defined in `.env` and `.env.example`):
  - `CRICKET_PROVIDER` (default: "espn")
  - `CRICKET_PROVIDER_API_KEY` (Safepay is not related; this is for cricket data)
  - `CRICKET_PROVIDER_BASE_URL` (e.g., https://api.cricapi.com)
  - `CRICKET_API_TIMEOUT_MS` (default: 5000)
  - `CRICKET_API_RATE_LIMIT_WINDOW_MS` (default: 60000)
  - `CRICKET_API_RATE_LIMIT_MAX_REQUESTS` (default: 100)
- Request/response validation using Zod to ensure data shape matches expected DTOs.
- Implements exponential backoff for rate-limit errors (429 status) with jitter; maximum 3 retries.
- Logs provider calls at debug level (operation, latency, response size).
- Sanitizes PII before logging (do not log auth tokens, full API responses with sensitive data).

**1.3 Provider selection and injection**
- CricketDataService accepts a provider instance via constructor injection.
- Future provider implementations (Cricketdata.org, ICC API, etc.) must implement the same interface without modifying existing code.

### 2. Backend Services

**2.1 CricketDataService**
- Location: `apps/api/src/cricket-data/services/cricket-data.service.ts`
- Coordinates all provider calls and delegates to CricketProvider implementation.
- Methods:
  - `searchPlayers(query: string, options?: SearchOptions): Promise<PlayerSearchResult[]>`
  - `fetchPlayerStats(playerId: string, options?: FetchOptions): Promise<PlayerStatsDto>`
  - `fetchMatchInfo(matchId: string): Promise<MatchInfoDto>`
- Responsibility: provider delegation, error translation, timeout enforcement.
- Must NOT cache results (caching is handled by PlayerStatsService and LiveMatchService).

**2.2 PlayerStatsService**
- Location: `apps/api/src/cricket-data/services/player-stats.service.ts`
- Fetches and caches player statistics from CricketDataService.
- Methods:
  - `getPlayerStats(playerId: string, options?: { live?: boolean; forceRefresh?: boolean }): Promise<PlayerStatsDto>`
  - `invalidateCache(playerId: string): Promise<void>`
  - `getStaleData(playerId: string): Promise<PlayerStatsDto | null>` (returns last cached value on error)
- Cache key: `cricket:player-stats:{playerId}` with 1-hour TTL minimum.
- **Stale cache on error:** If provider fetch fails, return the last successful cached value if available; log the stale return as a warning and increment metrics.
- **Options validation:**
  - `playerId`: required, non-empty string, max 100 chars (matches provider constraints).
  - `live`: optional boolean; only requested from provider if true; display flag in response.
  - `forceRefresh`: optional boolean; if true, bypass cache and fetch fresh data, then update cache.

**2.3 LiveMatchService**
- Location: `apps/api/src/cricket-data/services/live-match.service.ts`
- Fetches and caches match information and live scores.
- Methods:
  - `getMatchInfo(matchId: string, options?: { forceRefresh?: boolean }): Promise<MatchInfoDto>`
  - `invalidateCache(matchId: string): Promise<void>`
- Cache key: `cricket:match-info:{matchId}` with 15-minute TTL (shorter than player stats for live data freshness).
- Same stale-cache-on-error pattern as PlayerStatsService.
- **Options validation:**
  - `matchId`: required, non-empty string, max 100 chars.

### 3. API Endpoints

**3.1 GET /v1/cricket/players/search**
- Query parameters (all optional except `q`):
  - `q` (required): search query string, 1–100 characters, URL-encoded.
  - `limit` (optional): max results, default 20, max 100, integer.
  - `forceRefresh` (optional): boolean, if true bypass cache.
- Response: `{ items: PlayerSearchResult[], total: number }`
- HTTP 200 on success.
- HTTP 400 if `q` is missing or invalid format.
- HTTP 429 if provider rate limit reached (do not retry client-side; include `Retry-After` header).
- HTTP 503 if provider unavailable and no stale cache (include fallback message).
- Caching: results cached for 1 hour per query string, invalidated by admin API if needed.

**3.2 GET /v1/cricket/players/:id/stats**
- Path parameters:
  - `:id` (required): player ID, 1–100 characters.
- Query parameters (all optional):
  - `live` (optional): boolean, default false; if true, fetch live statistics.
  - `forceRefresh` (optional): boolean, default false; if true bypass cache.
- Response: `PlayerStatsDto` with fields: id, displayName, format, matches, runs, wickets, battingAverage, strikeRate, bowlingAverage, bowlingEconomy, asOf (ISO 8601), providerName, live (boolean).
- HTTP 200 on success.
- HTTP 400 if `:id` is invalid format.
- HTTP 404 if player not found in provider.
- HTTP 429 if provider rate limit reached.
- HTTP 503 if provider unavailable and no stale cache; include last-fetched timestamp in response.

**3.3 GET /v1/cricket/matches/:id**
- Path parameters:
  - `:id` (required): match ID, 1–100 characters.
- Query parameters (all optional):
  - `forceRefresh` (optional): boolean, default false; if true bypass cache.
- Response: `MatchInfoDto` with fields: id, title, description, teams (array of team names), venue, startTime (ISO 8601), status, format, asOf (ISO 8601), providerName.
- HTTP 200 on success.
- HTTP 400 if `:id` is invalid format.
- HTTP 404 if match not found in provider.
- HTTP 429 if provider rate limit reached.
- HTTP 503 if provider unavailable and no stale cache.

### 4. Caching Strategy

**4.1 Cache abstraction**
- Location: `apps/api/src/cricket-data/cache/cache-manager.ts`
- Interface: `CacheManager { set(key, value, ttlMs), get(key), del(key), clear() }`
- Two implementations (selected via environment):
  - `InMemoryCacheManager`: Node.js Map-based, ephemeral, suitable for single-instance dev/test.
  - `RedisCacheManager`: Redis client wrapper (optional production use; falls back to in-memory if Redis unavailable).
- TTLs:
  - Player stats: 1 hour minimum (3600000 ms).
  - Match info: 15 minutes (900000 ms).
  - Search results: 1 hour (3600000 ms).
- Cache invalidation strategies:
  - Manual: admin endpoint `DELETE /v1/admin/cricket-data/cache/{cacheType}/:key`.
  - TTL-based: automatic expiration.
- Stale cache: on provider error, check for stale value before returning error; log stale return at warning level.

**4.2 Metrics and observability**
- Track: cache hit rate, cache miss rate, provider latency, error rate by provider and operation.
- Emit metrics to structured logs (JSON format with operation, duration, provider, status, cacheHit boolean).

### 5. Error Handling

**5.1 Provider errors**
- Provider call fails → wrap in `ProviderError` with operation, provider name, status code, retryable flag, original message.
- Retryable errors (429, 503, timeout): trigger exponential backoff and 3 retries internally (do NOT retry client-side).
- Non-retryable errors (400, 401, 404, validation failure): return immediately with HTTP 400 or 404.
- All errors logged at appropriate level (error for unexpected failures, debug for expected rate limits).

**5.2 Service-level error handling**
- PlayerStatsService.getPlayerStats fails:
  - If stale cache exists and forceRefresh is false: return stale data with `fromCache: "stale"` flag in response header `X-Data-Source: stale-cache`.
  - If no stale cache: propagate error to controller; controller returns HTTP 503.
- Same pattern for LiveMatchService and search.

**5.3 Controller error handling**
- Bad request (validation failure): HTTP 400 with error message.
- Not found (player/match ID not in provider): HTTP 404.
- Provider rate limit (429 from provider): HTTP 429 with `Retry-After` header (from provider if available, else default 60 seconds).
- Provider unavailable (503, timeout, connection error) + no stale cache: HTTP 503 with message "Cricket data temporarily unavailable; try again shortly."
- Internal error (unexpected): HTTP 500 with generic message; log full details.

### 6. Rate Limiting and Backoff

**6.1 Client-side rate limiting**
- CricketDataService applies provider's rate limit windows (default: 100 requests per 60 seconds).
- Tracks request count per time window using a simple sliding-window counter (in-memory or Redis depending on cache mode).
- When limit approached: wait until next window to issue request (do NOT throw immediately).
- If limit is reached during a request: add exponential backoff (base 100ms, multiplier 2, max 10 seconds, 3 retries).

**6.2 Backoff implementation**
- Each retry waits: `min(100 * 2^attempt + random jitter (0–1000ms), 10000ms)`
- After 3 failed retries, return error (non-retryable) or stale cache (if available).
- Log each retry at debug level with attempt number and wait duration.

---

## Non-Functional Requirements

### 1. Performance
- Player stats fetch should complete within 2 seconds (p99) under normal load.
- Cache hit should return within 50ms (p99).
- Search should return within 3 seconds (p99).
- No N+1 database queries; each service method must be O(1) or O(log n).

### 2. Reliability
- Provider failures must not crash the application; errors must be caught and logged.
- Stale cache must extend availability during provider outages.
- Rate limit backoff must not block the event loop; use async/await.

### 3. Maintainability
- Provider interface must be testable in isolation (mock implementations for tests).
- Each service must have clear responsibility; avoid cross-service coupling.
- Configuration must be externalized (environment variables, never hardcoded URLs or API keys).

### 4. Security
- No API keys or secrets logged or cached as plaintext.
- Input validation must reject malformed IDs and query strings.
- Provider URLs must come from environment only; no dynamic URL construction from user input.
- Requests to external providers must set timeouts; no infinite hangs.

### 5. Observability
- All provider calls logged with operation, latency, response status.
- Cache operations tracked (hit/miss/stale).
- Errors logged with provider name, operation, status code, and original error message.
- Metrics exposed for monitoring (rate limit backoff occurrences, error rate by provider).

### 6. Code Quality
- TypeScript strict mode; no `any`.
- 100% coverage for critical paths: provider interface, service error handling, rate limit logic.
- All DTOs validated with Zod.
- No circular dependencies between modules.

---

## Acceptance Criteria

### Backend Services (6 criteria)

1. **CricketProvider interface and ESPNDataProvider implementation work correctly**
   - ESPNDataProvider implements CricketProvider contract.
   - Fetches player stats from ESPN/cricapi using provided API key and base URL.
   - Validates responses with Zod; rejects malformed data with clear error.
   - Logs operations at debug level without exposing secrets.
   - Unit tests: 100% coverage of provider interface, happy path and error scenarios.

2. **PlayerStatsService caches and refreshes correctly**
   - getPlayerStats(playerId, { live: false }) returns cached value if available (< 1 hour old).
   - getPlayerStats(playerId, { live: true }) requests fresh data from provider, updates cache.
   - getPlayerStats(playerId, { forceRefresh: true }) bypasses cache, fetches and updates.
   - Cache TTL is enforced; expired entries are refetched on next access.
   - On provider error, returns stale cache if available with X-Data-Source: stale-cache header; otherwise propagates error.

3. **LiveMatchService caches and refreshes correctly**
   - getMatchInfo(matchId) returns cached value if available (< 15 minutes old).
   - Cache TTL is 15 minutes; on expiry, next access triggers fresh fetch.
   - On provider error with stale cache available, returns stale value.

4. **Rate limiting and exponential backoff work as specified**
   - Requests to provider respect rate limit window (100 per 60 seconds default).
   - On 429 response, service waits and retries up to 3 times.
   - Backoff delay: 100 * 2^attempt + jitter, max 10 seconds.
   - After 3 failed retries, returns stale cache or error; does not retry further.
   - Integration test: simulate rate limit response and verify retry behavior.

5. **API endpoints validate input and return correct HTTP status codes**
   - GET /v1/cricket/players/search?q=virat (valid) → 200 with results.
   - GET /v1/cricket/players/search (missing q) → 400 with error message.
   - GET /v1/cricket/players/search?q=x&limit=1000 (limit > 100) → 400 with error message.
   - GET /v1/cricket/players/:id/stats with invalid :id → 400.
   - GET /v1/cricket/players/:id/stats with unknown player → 404.
   - GET /v1/cricket/players/:id/stats during provider outage with stale cache → 200 with stale data and X-Data-Source header.
   - GET /v1/cricket/players/:id/stats during provider outage with no cache → 503 with appropriate message.
   - Integration tests for all 3 endpoints.

6. **In-memory and Redis cache managers are interchangeable**
   - CricketDataService works with InMemoryCacheManager in development.
   - CricketDataService works with RedisCacheManager in production (if Redis available).
   - Cache key format is consistent across both implementations.
   - TTLs are honored by both implementations.
   - If Redis is unavailable, in-memory cache is used as fallback.

### Frontend Component Integration (3 criteria)

7. **PlayerStats component displays live data correctly**
   - Component renders in player profile/introduction context.
   - Displays: matches, runs, wickets, avg, SR for available formats (Test, ODI, T20).
   - Calls useCricketData hook to fetch player stats.
   - Shows loading state while fetching; error state if fetch fails; empty state if no data.
   - Displays X-Data-Source header info (live or stale-cache) if applicable; visually indicates stale data.

8. **useCricketData hook fetches and caches in browser**
   - Hook calls GET /v1/cricket/players/:id/stats endpoint.
   - Caches response for 5 minutes in browser (using sessionStorage or in-memory Map).
   - forceRefresh option bypasses browser cache.
   - Returns { data, loading, error, isStale } object.
   - Handles 404 and 503 gracefully; returns error state; does not throw uncaught errors.

9. **Search integration works in player selection workflow**
   - Existing player search component (or new integration point) calls GET /v1/cricket/players/search.
   - Displays search results with player names, roles, countries.
   - Handles no-results state gracefully.
   - Displays stale data indicator if applicable.

### Testing (3 criteria)

10. **Unit tests cover provider abstraction and service logic (40+ tests)**
    - CricketProvider interface: 8 tests (happy path per method, error handling).
    - ESPNDataProvider: 12 tests (fetch success, validation, error, rate limit, timeout).
    - PlayerStatsService: 10 tests (cache hit/miss, refresh, stale cache, error).
    - LiveMatchService: 8 tests (cache behavior, error handling).
    - CacheManager implementations: 8 tests (set/get/delete, TTL expiry).

11. **Integration tests cover end-to-end flows (15+ tests)**
    - API endpoint: search players → 200 with results.
    - API endpoint: get player stats → 200 with cached data.
    - API endpoint: provider rate limit → retry and succeed or return stale cache.
    - API endpoint: provider 404 → endpoint returns 404.
    - Cache invalidation: manual admin delete clears cache.
    - Reconnect after outage: provider recovers, fresh data is fetched.

12. **E2E tests cover user journeys (5+ tests)**
    - User views player profile → stats load and display (live or cached).
    - User searches players during auction → results display correctly.
    - User refreshes player stats → fresh data fetched and displayed.
    - System handles provider outage gracefully → stale data shown with indicator.

---

## Out of Scope

1. **Admin panel UI** for cricket data cache management (admin API endpoints defined, UI implementation deferred).
2. **Multiple provider implementations** beyond ESPNDataProvider (interface designed for future providers; implementation is ESPNDataProvider only).
3. **Player statistics update ingestion** from multiple sources in real-time (data is fetched on-demand, not pushed).
4. **Historical trend analysis or visualization** (stats are displayed as single snapshots, not time series).
5. **Offline mode** (data is fetched on-demand; no persistent sync to device storage).
6. **Live broadcast streaming integration** (data only; no video or audio).
7. **Custom data transformations per tournament or auction** (player stats are provider-sourced, not auction-specific).
8. **Batch player import/sync workflows** (admin will manage individual imports; bulk sync is future).
9. **WebSocket updates for live stats** (HTTP polling only; real-time WebSocket updates deferred to Phase N).

---

## Assumptions and Notes

1. **ESPN/cricapi availability:** Assumes the chosen provider (ESPN/cricapi) is available, documented and stable. If the provider changes, only ESPNDataProvider implementation changes; CricketProvider interface remains.

2. **Environment variable management:** Assumes `.env` and `.env.example` are updated by deployment/DevOps; agent will not manage Safepay env vars in this phase (Safepay is unrelated to cricket data).

3. **Redis optional:** Redis is optional; in-memory cache is sufficient for single-instance dev/test. Production deployments may add Redis; the abstraction supports both transparently.

4. **Stale cache precedence:** If a provider fetch fails and stale data exists, returning stale data is acceptable. This extends availability during outages. The response includes a header (`X-Data-Source: stale-cache`) to signal this to the frontend.

5. **Rate limit backoff is internal:** Rate limit backoff happens inside CricketDataService; clients do not retry. If retries are exhausted, the client receives an error or stale cache.

6. **Search results not persisted:** Search results are cached temporarily; they are not stored in the database as a denormalized table. All results come through the provider on each search.

7. **Frontend cache duration:** Browser-side cache (5 minutes) is shorter than server-side cache (1 hour) to balance freshness and load; both use same cache-busting strategy.

8. **Existing player database:** This integration does not replace the existing player database (apps/api/src/players). It supplements player-detail pages with live stats from an external provider. The player search endpoint in this phase is new and uses the cricket provider; existing player search may coexist.

9. **TypeScript strict mode:** All code uses `tsconfig.json` with `"strict": true`. No `any` type without explicit justification and suppression comment.

10. **Testing framework:** Backend uses Jest or Vitest (project standard); frontend uses Jest or Vitest; both support mocking and integration tests without requiring a real cricket data API in test mode.

---

## Related Documents

- **ARCHITECTURE.md**: System architecture and module boundaries.
- **AGENTS.md**: Mandatory engineering principles (backend authority, real-time correctness, data rights).
- **IMPLEMENTATION.md**: Stack and coding standards.
- **PRD.md**: Product vision and scope (live cricket and player information as a core feature).

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-27 | Agent | Initial requirements document |
