# Phase M: Live Cricket Data Integration — Requirements

**Status:** Requirements definition  
**Version:** 1.0  
**Date:** 2026-11-27  
**Phase:** M  
**Complexity:** Major feature (backend 7 files, frontend 3 files, 60+ tests)

---

## Summary

Phase M establishes a provider-independent cricket data integration layer that fetches live and historical player statistics, match information, and player search results. The backend abstracts data sources through a `CricketProvider` interface, with an initial `ESPNDataProvider` implementation. Backend services orchestrate cricket data retrieval, caching (1-hour TTL with Redis or in-memory fallback), rate-limit backoff, and stale-cache fallback. Frontend components consume cached data through a `useCricketData` hook with 5-minute browser cache. All provider URLs, API keys and credentials are environment variables. No hardcoded URLs or credentials exist in the codebase.

---

## Functional Requirements

### Backend Functional Requirements

#### 1. Provider-Independent Abstraction Layer
- **1.1** Implement `CricketProvider` interface that defines methods for:
  - `getPlayerStats(playerId: string, options?: QueryOptions): Promise<PlayerStatsResponse>`
  - `getLiveMatch(matchId: string): Promise<LiveMatchResponse>`
  - `searchPlayers(query: string, options?: PaginationOptions): Promise<PlayerSearchResponse>`
  - Each provider implementation is provider-specific but conforms to these contracts
- **1.2** Create `ESPNDataProvider` implementation of `CricketProvider` interface
  - Maps ESPN API responses to unified response DTOs
  - Handles ESPN-specific error responses and data format quirks
  - Respects ESPN API rate limits (track X-RateLimit-* headers)
- **1.3** Provider interface must be extensible for future implementations (e.g., `CricketcomDataProvider`, `ESPNcricinfo`)

#### 2. CricketDataService
- **2.1** Orchestrates provider calls with failover behavior:
  - If configured provider is unavailable, attempt fallback provider (if configured)
  - If all providers fail, return stale cached data if available
- **2.2** Implement cache layer:
  - Use Redis (preferred) or in-memory Map fallback if Redis is unavailable
  - Cache TTL: 1 hour for player stats, live match data (shorter TTL = more freshness)
  - Cache key pattern: `cricket:{provider}:{endpoint}:{id|query}:{hash}`
- **2.3** Implement rate-limit backoff:
  - Detect rate-limit headers (HTTP 429, X-RateLimit-Reset)
  - Backoff exponentially: 1s, 2s, 4s, 8s, up to max (e.g., 60s)
  - Retry up to 3 times on rate-limit
  - Log rate-limit events for monitoring
- **2.4** Stale-cache fallback:
  - If live fetch fails and cache exists (even if expired), return cached data with `isCached: true` flag
  - Frontend must handle `isCached` flag and display stale-data warning if needed

#### 3. PlayerStatsService
- **3.1** Fetch live and historical player statistics through CricketDataService
  - Accept `playerId` and optional `live: boolean` query parameter
  - If `live=true`, attempt fresh fetch; otherwise use cache
- **3.2** Enrich returned statistics:
  - Merge database player record with provider stats
  - Return unified `EnrichedPlayerStats` DTO containing:
    - Database player metadata (ID, display name, role, country)
    - Provider statistics (matches, runs, average, strike rate, etc.)
    - Cache metadata (timestamp, TTL, source, isCached)
- **3.3** Validation and normalization:
  - Normalize numeric fields (e.g., batting average as decimal, not string)
  - Handle missing or null values gracefully
  - Validate format (T20, ODI, Test, etc.) against allowed enum

#### 4. LiveMatchService
- **4.1** Fetch and cache live and scheduled match data
  - Accept `matchId` and optional `live: boolean` parameter
  - If `live=true`, use shorter cache TTL (5-10 minutes)
- **4.2** Return unified `LiveMatchDto`:
  - Match metadata (ID, teams, format, venue, start time)
  - Current state (status: "scheduled" | "live" | "completed", current score, overs, wickets)
  - Live scoreboard information if available
  - Cache metadata (timestamp, TTL, source, isCached)

#### 5. API Endpoints
- **5.1** `GET /v1/players/:id/stats?live=true`
  - Path parameter: `id` (string, required) — player ID from database
  - Query parameter: `live` (boolean, optional, default false) — force fresh fetch vs. use cache
  - Response: `EnrichedPlayerStats` DTO or 404 if player not found
  - Error: 500 if all providers fail and no cache; 503 if provider is rate-limited
- **5.2** `GET /v1/cricket/matches/:id`
  - Path parameter: `id` (string, required) — match ID
  - Query parameter: `live` (boolean, optional, default false) — shorter cache TTL if true
  - Response: `LiveMatchDto` or 404 if match not found
  - Error: 500 if all providers fail and no cache; 503 if provider is rate-limited
- **5.3** `GET /v1/cricket/search?q=name`
  - Query parameter: `q` (string, required) — player name search query
  - Query parameter: `limit` (number, optional, default 10, max 50)
  - Query parameter: `offset` (number, optional, default 0)
  - Response: `PlayerSearchResponse` containing paginated results, each with player metadata and cache info
  - Error: 400 if `q` is empty or missing; 500 if all providers fail and no cache

#### 6. Environment Configuration
- **6.1** No hardcoded provider URLs; require environment variables:
  - `CRICKET_PRIMARY_PROVIDER` (string) — "espn" or other identifier
  - `CRICKET_FALLBACK_PROVIDER` (string, optional)
  - `CRICKET_ESPN_BASE_URL` (string, example: `https://www.espn.com/cricket/api`)
  - `CRICKET_ESPN_API_KEY` (string, if ESPN requires API key)
  - `CRICKET_CACHE_TTL_SECONDS` (number, default 3600)
  - `CRICKET_CACHE_BACKEND` (string, "redis" | "memory", default "redis")
  - `REDIS_URL` (string, only if cache backend is "redis")
- **6.2** Validate required environment variables on application startup
- **6.3** Fail gracefully if optional providers are unconfigured

### Frontend Functional Requirements

#### 7. useCricketData Hook
- **7.1** Custom React hook for consuming cricket data with client-side caching
  - Signature: `useCricketData<T>(endpoint: string, params?: Record<string, any>, options?: CacheOptions): UseCricketDataReturn<T>`
  - Returns: `{ data, loading, error, isCached, timestamp, refetch }`
- **7.2** Implement 5-minute browser cache using localStorage
  - Cache key: `cricket:{endpoint}:{hash(params)}`
  - Return cached data immediately if fresh; refetch in background if stale
  - Display loading state only on first load, not on background refetch
- **7.3** Error handling:
  - If error occurs on first load, show error UI
  - If error occurs on background refetch (cache hit), ignore and return cached data
  - Retry logic: exponential backoff if rate-limited (503)
- **7.4** Provide explicit `refetch()` method to bypass cache

#### 8. PlayerStats Component
- **8.1** Display player name, role, country, and format-specific statistics
  - Accept `playerId: string` prop
  - Use `useCricketData` hook to fetch `/v1/players/:id/stats`
- **8.2** Render statistics grouped by format (T20, ODI, Test, etc.)
  - Each format shows: matches, runs, batting average, strike rate, wickets, bowling average, economy
  - Format data as human-readable numbers (e.g., batting average as "43.5")
- **8.3** Display cache indicator:
  - Show badge "Live" if data is fresh
  - Show badge "Cached" with timestamp if `isCached: true`
  - Show update time (e.g., "Updated 2 hours ago")
- **8.4** Loading, empty and error states:
  - Loading: skeleton or spinner
  - Empty: "No statistics available for this player"
  - Error: "Failed to load player statistics. [Retry]"

#### 9. Cricket Search Component
- **9.1** Accept search query string from user input
  - Debounce search input (300ms)
  - Only fetch after user stops typing for 300ms
- **9.2** Fetch results from `/v1/cricket/search?q={query}&limit=10`
  - Use `useCricketData` hook with custom cache key including query
- **9.3** Render paginated results:
  - Display player name, role, country, category
  - Show "Load more" button to fetch next page
  - Pagination handled through `offset` parameter
- **9.4** State management:
  - Show spinner while fetching
  - Show "No results found" if search returns empty
  - Show error message if fetch fails
  - Cache individual search results separately

#### 10. Integration with Existing Player Profiles
- **10.1** On existing player profile page, integrate PlayerStats component below current database stats
- **10.2** Add "Show live stats" toggle to switch between cached database stats and live provider stats
- **10.3** If live stats fail, gracefully fall back to database stats without breaking the page

---

## Non-Functional Requirements

### Reliability & Availability
- **NF.1** System must remain functional if primary provider is unavailable (failover to fallback provider, then stale cache)
- **NF.2** Rate-limit backoff must not cause cascading failures; failed requests are retried, not dropped
- **NF.3** Cache must not hold stale data beyond 1 hour without expiration
- **NF.4** Connection pooling for HTTP client must respect provider rate limits and avoid connection exhaustion

### Performance
- **NF.5** Player stats endpoint must respond within 500ms (cached) or 2s (fresh fetch with rate-limit retry)
- **NF.6** Search endpoint must return results within 1s for cached results, 3s for fresh fetch
- **NF.7** Frontend PlayerStats component must render within 200ms of data arrival (not including network latency)
- **NF.8** Browser cache must not exceed 5MB total; evict oldest entries if limit approached

### Security
- **NF.9** No API keys, credentials, or provider URLs must appear in client-side code or logs
- **NF.10** Provider API calls must only be made from backend; frontend communicates only with backend API
- **NF.11** Rate-limit backoff logic must not expose provider-specific rate-limit header values to frontend
- **NF.12** Environment variable validation must reject invalid or missing critical values on startup

### Code Quality & Maintainability
- **NF.13** All TypeScript code must be strict mode; no use of `any` type except with explicit justification and comment
- **NF.14** Provider interface must be testable in isolation; all business logic must be in services, not providers
- **NF.15** Each service (CricketDataService, PlayerStatsService, LiveMatchService) must have <30% cyclomatic complexity per method

### Testing
- **NF.16** Minimum 60+ unit and integration tests covering:
  - Provider abstraction and implementation
  - Cache hit/miss behavior
  - Rate-limit backoff logic and retries
  - Stale-cache fallback
  - Error handling (provider failures, timeouts)
  - Frontend hook behavior and cache expiration
  - API endpoint authorization and validation

---

## Acceptance Criteria

### Backend Acceptance Criteria

1. **Provider abstraction is extensible**
   - `CricketProvider` interface exists with methods: `getPlayerStats`, `getLiveMatch`, `searchPlayers`
   - `ESPNDataProvider` implements `CricketProvider`
   - Provider can be swapped by changing environment variable without code changes
   - Test: Create a mock provider and verify it works as a drop-in replacement

2. **CricketDataService orchestrates failover and caching**
   - Accepts primary and optional fallback provider configurations
   - On primary provider failure, attempts fallback provider automatically
   - On all provider failures, returns stale cached data if available (with `isCached: true`)
   - Caches all responses with 1-hour TTL
   - Test: Mock two providers, fail the first, verify fallback is called; fail both, verify stale cache is returned

3. **Rate-limit backoff works correctly**
   - Detects HTTP 429 responses and X-RateLimit-* headers
   - Retries up to 3 times with exponential backoff (1s, 2s, 4s)
   - Logs rate-limit events (at least timestamp, retry count, endpoint)
   - Test: Mock provider returning 429, verify 3 retries occur; verify backoff timing

4. **PlayerStatsService merges database and provider data**
   - Accepts `playerId` and optional `live` parameter
   - Returns `EnrichedPlayerStats` containing database metadata + provider stats
   - Handles missing provider data gracefully (returns database stats only)
   - Test: Fetch stats for existing player with and without live flag; verify merged response

5. **LiveMatchService returns unified match data**
   - Accepts `matchId` and optional `live` parameter
   - Returns `LiveMatchDto` with unified schema regardless of provider
   - Shorter cache TTL (5-10 min) when `live=true`
   - Test: Fetch live match data; verify schema matches contract; verify TTL is applied

6. **API endpoints are implemented and validated**
   - `GET /v1/players/:id/stats?live=true` returns 200 with EnrichedPlayerStats or 404
   - `GET /v1/cricket/matches/:id` returns 200 with LiveMatchDto or 404
   - `GET /v1/cricket/search?q=name` returns 200 with paginated PlayerSearchResponse or 400 if query is missing
   - Query parameters (`live`, `limit`, `offset`) are parsed and validated
   - Test: HTTP integration tests for each endpoint with valid/invalid inputs

7. **Environment variables are required and validated**
   - Application fails to start if `CRICKET_PRIMARY_PROVIDER` or `CRICKET_ESPN_BASE_URL` are missing
   - Application logs clear error message indicating which variable is missing
   - Test: Start app without required env vars; verify startup fails with specific error

8. **Redis or in-memory cache backend is functional**
   - If `CRICKET_CACHE_BACKEND=redis` and Redis is available, cache uses Redis
   - If `CRICKET_CACHE_BACKEND=memory`, in-memory Map is used
   - If Redis is unavailable and backend is Redis, gracefully fall back to memory
   - Test: Start with Redis available; verify cache reads/writes use Redis; disconnect Redis, verify fallback to memory

### Frontend Acceptance Criteria

9. **useCricketData hook implements browser caching**
   - Hook accepts endpoint, params, and options
   - Returns `{ data, loading, error, isCached, timestamp, refetch }`
   - Caches data for 5 minutes; fresh cache is returned immediately
   - Stale cache triggers background refetch without blocking render
   - Test: Call hook twice within 5 minutes; verify second call returns cached data immediately; verify timestamp shows first fetch time

10. **PlayerStats component displays live stats correctly**
    - Accepts `playerId` prop
    - Fetches stats from `/v1/players/:id/stats`
    - Renders statistics grouped by format (T20, ODI, Test)
    - Shows "Live" or "Cached" badge based on cache status
    - Test: Render component with valid player ID; verify stats are displayed; verify badges match cache status

11. **Cricket search component filters and paginates results**
    - Debounces search input (300ms delay before fetch)
    - Fetches results from `/v1/cricket/search?q={query}`
    - Displays paginated results with "Load more" button
    - Handles empty results and errors gracefully
    - Test: Type in search box; verify fetch only occurs after 300ms of inactivity; click "Load more", verify next page loads

12. **Player profile integration is seamless**
    - PlayerStats component can be inserted into existing player profile page
    - Toggle switches between database stats and live provider stats
    - If live stats fail, profile does not break; falls back to database stats
    - Test: Render profile page with toggle; switch between modes; break provider, verify fallback works

13. **No credentials or URLs are exposed to client**
    - Browser developer console and network tab show no API keys or provider URLs
    - Frontend only calls backend API (e.g., `/v1/players/:id/stats`), never ESPN API directly
    - Test: Inspect network requests and localStorage; verify no credentials appear

### Shared Acceptance Criteria

14. **TypeScript strict mode and no `any` type**
    - All new `.ts` files have `"strict": true` in tsconfig
    - No use of `any` type in new code except with explicit `// @ts-ignore` and inline comment explaining why
    - Type checker passes with zero errors
    - Test: Run `npm run typecheck` or equivalent; verify zero errors

15. **60+ tests cover critical paths**
    - Unit tests for CricketProvider interface and ESPNDataProvider implementation
    - Integration tests for CricketDataService, PlayerStatsService, LiveMatchService
    - Cache behavior tests (hit, miss, stale fallback, TTL expiration)
    - Rate-limit backoff tests (exponential delay, retry count, logging)
    - Frontend hook tests (cache expiration, refetch, error handling)
    - API endpoint tests (parameter validation, authorization, error responses)
    - Test: Run `npm test` and report test count; verify all critical paths have coverage

16. **No hardcoded provider data exists**
    - All provider URLs, API keys, timeouts are environment variables
    - Code review finds zero hardcoded URLs like `https://espn.com/api`
    - Code review finds zero hardcoded API keys or credentials
    - Test: Grep codebase for hardcoded strings matching provider domains or typical API key patterns

---

## Out of Scope

- **Historical player statistics ingestion**: Phase M fetches live/current data only; bulk ingestion of historical cricket data is a separate effort
- **Real-time cricket data push/webhooks**: Phase M uses polling via HTTP; server-sent events or WebSocket push from providers is future scope
- **Multiple provider simultaneous queries**: Phase M queries primary provider first, then fallback; parallel multi-provider queries are future optimization
- **Admin provider management UI**: Phase M uses environment variables only; admin dashboard for switching providers dynamically is later scope
- **Data transformation and enrichment pipeline**: Phase M returns provider data with minimal transformation; complex calculations or derived metrics are future scope
- **Player statistics upload/import**: Phase M only fetches; manual admin-driven data import is out of scope
- **Cricket news integration**: News is handled by separate News module; this phase focuses on player stats and live matches only
- **Mobile app integration**: Phase M API is designed for web; native mobile app adoption is future work
- **Internationalization (i18n) for cricket data**: All returned data uses English; localization is a separate effort

---

## Assumptions

1. **ESPN API is the primary data source**: The feature request specifies ESPNDataProvider; ESPN's cricket API is assumed available and reliable. If not, Phase M will document required setup steps and credentials.

2. **Redis is available in deployment**: The design assumes Redis is running in production for caching. If unavailable, in-memory cache provides fallback but with limited TTL and no cross-instance sharing.

3. **Player IDs in database match provider IDs**: The system assumes database `Player.id` corresponds to provider-specific player IDs (e.g., ESPN player ID). If mapping is required, it will be added to a `ProviderPlayerMapping` table (not in this phase).

4. **Backend can make outbound HTTP calls**: The API server must be able to make HTTP requests to ESPN or other provider APIs. No firewall or network restrictions are assumed to block outbound traffic.

5. **1-hour cache TTL is acceptable for cricket stats**: The feature request specifies 1-hour cache; this assumes cricket statistics do not change more frequently than hourly. If live stats are updated minute-by-minute during matches, TTL should be shorter.

6. **Search results are limited to 10 players by default**: The feature request does not specify default pagination; assuming 10 results with "Load more" is a reasonable UX starting point.

7. **Browser localStorage is available and persistent**: Frontend caching assumes localStorage is not disabled by user; fallback to memory-only cache is acceptable if localStorage is unavailable.

---

## Notes for Design Review

- **Provider abstraction extensibility**: Design must ensure new providers (e.g., CricketcomDataProvider, official ICC API) can be added without modifying services or endpoints.
- **Cache invalidation strategy**: Design must clarify cache invalidation triggers (e.g., manual refresh endpoint, scheduled cache expiration, event-driven invalidation).
- **Rate-limit coordination**: If multiple backend instances are running, rate-limit state must be shared (requires Redis or distributed cache); in-memory tracking will not work in clustered deployments.
- **Player ID mapping**: Current assumption is direct player ID matching; if mapping is needed later, schema migration and mapping service are required.
- **Error logging and monitoring**: Design must specify log levels, metrics (cache hit/miss rate, provider latency, error rates) and alerting thresholds.
- **Testing infrastructure**: Design must clarify how provider HTTP calls are mocked in tests (e.g., using nock, msw, or provider test fixtures).

---

## References

- **PRD.md**: Cricket content is part of the product's long-term vision; this phase is an enabling feature.
- **ARCHITECTURE.md**: Cricket data providers are listed as a module boundary; this phase implements that module.
- **AGENTS.md**: Backend authority principle applies; all cricket data validation happens on backend before serving to client.
