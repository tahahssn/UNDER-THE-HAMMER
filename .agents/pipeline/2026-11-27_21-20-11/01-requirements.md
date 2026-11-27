# Phase M: Live Cricket Data Integration — Requirements Document

**Status:** Requirements for design review  
**Phase:** M  
**Feature:** Live Cricket Data Integration  
**Date:** 2026-11-27  
**Product:** Under The Hammer

---

## Summary

Implement a provider-independent abstraction layer for external cricket data sources (player statistics, live matches, player search). The initial implementation supports ESPN/cricapi as a concrete provider. Services expose cricket data through REST endpoints with optional caching (1-hour TTL minimum), rate-limit backoff, and stale-cache fallback on provider errors. Frontend components display live player statistics within player profiles. All provider URLs and credentials are environment-based, not hardcoded. The implementation uses TypeScript strict mode without `any`, normalized data models, and comprehensive test coverage including provider abstraction, caching behavior, rate limiting and error recovery.

---

## Functional Requirements

### FR1: Provider-Independent Abstraction
- Implement `CricketProvider` interface that defines the contract all cricket data sources must fulfill
- Support multiple provider implementations via dependency injection
- Interface must abstract provider-specific API details (endpoints, authentication, response formats, rate limits)
- No provider-specific logic leaks into services or controllers
- Support future provider additions (Statsbomb, official cricket boards, proprietary APIs) without modifying existing code

### FR2: ESPN/cricapi Provider Implementation
- Implement `ESPNDataProvider` as the initial concrete provider
- Support player statistics retrieval (matches played, runs, wickets, batting average, strike rate by format)
- Support live match information retrieval (match ID, teams, current status, runs/wickets, format)
- Support player search/discovery (name-based search, return matched players with IDs)
- Use provider-supplied player IDs internally; map to Under The Hammer player IDs where applicable
- Handle provider-specific authentication (API key in headers/query params as configured)
- Implement exponential backoff with jitter for rate-limit recovery (HTTP 429)

### FR3: Backend Services
- **CricketDataService:** High-level orchestration; delegates provider operations; handles caching strategy
- **PlayerStatsService:** Retrieves and transforms player statistics; exposes stats by format; supports cache invalidation
- **LiveMatchService:** Retrieves and transforms match data; maps to tournament/room context if applicable; handles polling metadata
- All services owned by `cricket-data` module; expose application services; no direct database writes outside their scope

### FR4: REST Endpoints
- `GET /v1/cricket/players/search?q=name` — Search players by name; returns matched player IDs, names, roles, countries
- `GET /v1/players/:id/stats?live=true` — Get player statistics with live flag; response includes per-format stats (matches, runs, wickets, avg, SR); uses cache if available
- `GET /v1/cricket/matches/:id` — Get match information; returns match status, teams, scores, format, competition context

### FR5: Caching Strategy
- Minimum 1-hour TTL for cached player statistics and match data
- In-memory cache as primary fallback; Redis optional for multi-instance deployment
- Cache key includes provider name, player/match ID and format where applicable
- Stale-cache-on-error: if provider fails (network error, 5xx), return cached data if available rather than propagating error (unless cache is empty)
- Cache invalidation: manual via admin operation; automatic on successful provider update (simple TTL expiration)
- Never cache error responses; always retry on next request

### FR6: Rate-Limit Handling
- Detect HTTP 429 from provider
- Implement exponential backoff: start at 1 second, double on each retry, max 60 seconds between attempts
- Add jitter (+/- 10%) to prevent thundering herd
- Track per-provider retry state (attempt count, next-retry timestamp)
- Log backoff events at WARN level with provider, endpoint and retry count
- After maximum retries exhausted (suggested: 5 attempts), return cached data if available; otherwise return 503 Service Unavailable

### FR7: Input Validation and Error Handling
- Validate player search query: required, 1–100 characters, alphanumeric + spaces + hyphens only
- Validate player ID format: required, non-empty, normalized (trimmed, lowercased for storage/lookup)
- Validate match ID format: required, non-empty string
- On invalid input: return 400 Bad Request with explicit error code (e.g., INVALID_SEARCH_QUERY)
- On provider failure (network, 5xx after backoff): log error; return 503 Service Unavailable or cached data
- On resource not found (404 from provider, no cache): return 404 Not Found
- Document error codes in API spec; ensure consistent error response shape

### FR8: Frontend Player Stats Component
- Component `PlayerStatsDisplay` shows player statistics within player introduction/profile area
- Displays: matches played, runs scored, wickets taken, batting average, strike rate
- Grouped by format (Test, ODI, T20, domestic where applicable)
- Loading state while fetching; error state with retry button; empty state if no data
- Fetches data via `useCricketData` hook; respects browser cache (5-minute TTL)
- Respects `prefers-reduced-motion`; avoids unnecessary animations
- Responsive: stacks on mobile, side-by-side on desktop

### FR9: Frontend Hook — useCricketData
- Custom React hook that wraps fetch logic and browser caching
- Arguments: player ID, optional format filter, optional force-refresh flag
- Returns: `{ data, loading, error, refetch }`
- Caches successful responses in memory for 5 minutes (browser session)
- Force-refresh bypasses cache and fetches from backend
- Handles network errors gracefully; does not crash component
- Uses AbortController to cancel in-flight requests on unmount

### FR10: Environment Configuration
- Cricket provider selection via `CRICKET_PROVIDER` env var (default: `espn`)
- ESPN/cricapi API endpoint: `CRICKET_ESPN_API_URL`
- ESPN/cricapi API key: `CRICKET_ESPN_API_KEY`
- Cache TTL: `CRICKET_CACHE_TTL_MINUTES` (default: 60)
- Redis URL: `REDIS_URL` (optional; fall back to in-memory cache)
- Rate-limit max retries: `CRICKET_RATE_LIMIT_MAX_RETRIES` (default: 5)
- All env vars validated at startup; fail fast with readable errors

### FR11: No Hardcoded Dependencies
- No hardcoded provider URLs, API keys or endpoints in source code
- No hardcoded "eight teams" assumption in cricket data (applies to future team-drafting logic)
- No hardcoded official PSL team list; support user-created teams with uploaded logos
- Configuration always environment-based or database-driven

---

## Non-Functional Requirements

### NFR1: Type Safety
- All code in TypeScript strict mode; no `any` type except in exceptional cases with inline explanation
- Explicit DTOs for all API responses and service interfaces
- Shared contracts between services; use existing `contracts` package if applicable

### NFR2: Performance
- Player search response within 500ms (cached) or 2 seconds (fresh from provider, typical case)
- Player stats endpoint response within 500ms (cached) or 2 seconds (fresh)
- Match info endpoint response within 500ms (cached) or 2 seconds (fresh)
- Pagination or result limits on search to prevent large payloads (e.g., max 50 results per search)

### NFR3: Reliability
- Stale cache fallback ensures graceful degradation when provider is temporarily unavailable
- Exponential backoff prevents cascading failures and respects provider rate limits
- Clear logging of cache hits, misses, provider calls and errors for observability
- Circuit-breaker pattern considered for future (not required for Phase M initial implementation)

### NFR4: Testing
- Unit tests for `CricketProvider` interface contract and `ESPNDataProvider` implementation
- Unit tests for `CricketDataService`, `PlayerStatsService`, `LiveMatchService` service logic
- Unit tests for cache layer: hits, misses, TTL expiration, stale-on-error behavior
- Unit tests for rate-limit backoff logic: exponential backoff, jitter, max-retries exhaustion
- Integration tests for each endpoint: success path, cached path, error path, 404 path
- Integration tests for authorization (implicit; public endpoints, but verify no auth leaks)
- E2E tests for frontend component and hook: data loading, error state, retry, cache behavior
- Minimum 60+ test cases covering all scenarios listed above

### NFR5: Logging and Observability
- Log provider calls at DEBUG level (endpoint, player/match ID, cached=yes/no)
- Log cache operations at DEBUG level (hit, miss, store, invalidate)
- Log rate-limit events at WARN level (attempt count, backoff duration, next retry time)
- Log errors at ERROR level (provider failure reason, final fallback action taken)
- Include structured fields: provider name, operation (search/stats/match), player/match ID, timestamp

### NFR6: Security
- No credentials exposed in logs, error messages or public responses
- API key validation happens at provider module boundary only
- No PII leakage in cricket data (player names and stats are public data; no filtering required)
- Cross-origin requests (if applicable) validated via CORS
- Rate-limit backoff applied fairly; no preference given to specific consumers

---

## Acceptance Criteria

1. **AC1: Provider Interface Defined**
   - `CricketProvider` interface exists in `apps/api/src/cricket-data/providers/cricket-provider.interface.ts`
   - Defines three methods: `searchPlayers(query)`, `getPlayerStats(playerId)`, `getMatchInfo(matchId)`
   - Each method signature specifies return types (DTOs) and throws documented exceptions
   - Interface is provider-agnostic; no ESPN-specific details leak through

2. **AC2: ESPN Provider Implemented**
   - `ESPNDataProvider` class exists and implements `CricketProvider`
   - Authenticates with ESPN/cricapi using API key from env
   - Successfully retrieves player stats for a known test player ID (e.g., canned test data)
   - Successfully retrieves match info for a known test match ID
   - Successfully searches players by name and returns at least one matched player
   - Handles rate-limit response (HTTP 429) with backoff; retries automatically

3. **AC3: Backend Services Layer**
   - `CricketDataService` exists; depends on `CricketProvider` interface via injection
   - `PlayerStatsService` exists; retrieves and transforms player stats; groups by format
   - `LiveMatchService` exists; retrieves and transforms match data
   - All three services have unit tests with mocked provider
   - Services do not contain hardcoded provider URLs or credentials

4. **AC4: Endpoints Implemented and Responding**
   - GET `/v1/cricket/players/search?q=virat` returns HTTP 200 with player list (or empty if no match)
   - GET `/v1/players/{id}/stats?live=true` returns HTTP 200 with per-format stats or 404 if player not found
   - GET `/v1/cricket/matches/{id}` returns HTTP 200 with match info or 404 if match not found
   - Invalid inputs (missing query, bad format) return HTTP 400 with explicit error code
   - Each endpoint documented in Swagger/OpenAPI spec

5. **AC5: Caching Layer Functional**
   - Player stats cached with 1-hour TTL minimum
   - Cache hits verified in test; second request within TTL returns cached data
   - Cache misses trigger provider call
   - Stale cache returned on provider error (network, 5xx) if cache exists
   - On error with no cache, 503 Service Unavailable returned
   - Cache invalidation endpoint exists (admin-only, documented but not required for Phase M delivery if deferred)

6. **AC6: Rate-Limit Backoff Working**
   - Mock provider returns HTTP 429; service automatically backs off and retries
   - Exponential backoff confirmed in test: first retry at ~1s, second at ~2s, etc.
   - Jitter (+/- 10%) verified to prevent synchronized retries
   - After 5 failed attempts, cached data returned (or 503 if no cache)
   - Log messages at WARN level confirm backoff attempts

7. **AC7: Error Handling Comprehensive**
   - Invalid search query (empty, >100 chars, special chars) returns 400 with INVALID_SEARCH_QUERY code
   - Invalid player/match ID (empty string) returns 400 with INVALID_ID code
   - Provider network error logged; cached data returned or 503 if no cache
   - Provider returns 404; endpoint returns 404 (not cached)
   - Provider returns 5xx; treated as transient error; backoff and retry; cache fallback on max retries
   - All error responses have consistent shape: `{ errorCode, message, timestamp }`

8. **AC8: Environment Configuration Honored**
   - `CRICKET_PROVIDER` selects between implementations (starting with `espn`)
   - `CRICKET_ESPN_API_URL` and `CRICKET_ESPN_API_KEY` read from env, not hardcoded
   - `CRICKET_CACHE_TTL_MINUTES` controls cache duration
   - `REDIS_URL` checked; if present, Redis cache used; if absent, in-memory cache used
   - Startup validation logs readable error if required env vars missing; server fails to start

9. **AC9: Frontend PlayerStatsDisplay Component**
   - Component located at `apps/web/src/components/PlayerStatsDisplay.tsx`
   - Accepts `playerId` and optional `format` props
   - Displays stats in table or list: matches, runs, wickets, avg, SR (or N/A if not applicable)
   - Shows loading skeleton while fetching
   - Shows error message with retry button on failure
   - Shows empty message if provider returns no data
   - Responsive layout (stacks on mobile, side-by-side on desktop)
   - Respects `prefers-reduced-motion`

10. **AC10: useCricketData Hook Functional**
    - Hook exported from `apps/web/src/hooks/useCricketData.ts`
    - Accepts `{ playerId, format?, forceRefresh? }` options
    - Returns `{ data, loading, error, refetch }`
    - Caches successful responses for 5 minutes in browser session
    - Fetches from `/v1/players/{id}/stats?live=true` endpoint
    - Handles network errors; does not throw; returns error in result
    - Cleans up abort controller on unmount
    - Tested with mocked fetch API

11. **AC11: Minimum 60+ Test Cases**
    - 20+ unit tests for service layer (mocked provider, caching, rate limit)
    - 15+ unit tests for provider interface and ESPN implementation
    - 10+ unit tests for cache layer behavior
    - 8+ integration tests for each endpoint (success, cached, error, 404)
    - 7+ E2E/component tests for frontend (load, error, retry, cache)
    - All tests use descriptive names; pass consistently
    - Test coverage for critical paths at minimum 80%

12. **AC12: Documentation Complete**
    - API endpoints documented in Swagger; include example requests/responses
    - Environment variables documented in `apps/api/.env.example`
    - Service interfaces documented with JSDoc comments
    - Error codes enumerated in a constant and referenced in docs
    - README or design doc explaining provider abstraction pattern for future implementers
    - Frontend hook usage documented with examples

13. **AC13: No Hardcoded Values**
    - Zero hardcoded provider URLs in source; all via env
    - Zero hardcoded API keys in source; all via env
    - Zero hardcoded "eight teams" or PSL assumptions in cricket data module
    - Zero hardcoded player lists or official team assumptions
    - Scan passes for accidental credential commits (use `git-secrets` or similar if available)

14. **AC14: TypeScript Strict Mode**
    - `tsconfig.json` has `"strict": true` enabled (verify existing config)
    - All cricket-data module files pass `tsc --strict --noEmit` without errors
    - No `any` types in cricket-data, cricket-data tests, or frontend cricket components (unless inline explanation present)
    - Explicit types on all function parameters and return values

15. **AC15: Module Structure Follows Pattern**
    - Backend cricket-data module at `apps/api/src/cricket-data/`
    - Subdirectories: `providers/`, `services/`, `controllers/`, `dtos/`, `repositories/` (if applicable)
    - Frontend components at `apps/web/src/components/`
    - Frontend hooks at `apps/web/src/hooks/`
    - Tests colocated with source or in `__tests__/` sibling
    - Module exported through barrel exports (`index.ts`)

---

## Out of Scope

- **Team Allocation and Auction Logic:** Cricket data module provides player/stats only; does not influence team drafting or bidding.
- **Live Streaming or Rebroadcasting:** Live match data is metadata only; no streaming rights acquisition or broadcast redelivery.
- **Admin Cache Invalidation UI:** Cache invalidation exists as a backend operation (optional for Phase M); frontend admin dashboard is a later phase.
- **Spaces Integration:** Cricket data is independent of community spaces; spaces are planned for a later release.
- **Multi-Provider Failover:** Initial implementation supports one active provider at a time; automatic failover to secondary provider deferred to Phase N or later.
- **Ball-by-Ball Data and Detailed Scorecards:** Phase M covers player stats and match summaries only; granular scorecard data is future scope.
- **Player Injury/Availability Status:** Cricket data provides stats only; injury tracking and player availability is application logic, not provider scope.
- **Official League Data Licensing:** This requirement assumes ESPN/cricapi provides freely available or platform-licensed data; rights negotiation and exclusive data deals are out of scope.
- **Real-Time Notifications:** Alerts when match status changes or player stats update are deferred; Phase M is pull-based only.
- **Analytics and Reporting:** Cricket data module does not include analytics dashboards; usage metrics are future scope.

---

## Assumptions

1. **ESPN/cricapi Availability:** ESPN or cricapi provides a free or platform-licensed API with player stats, match info and search functionality. If this is unavailable or requires commercial licensing, the provider implementation will be deferred.

2. **Player ID Mapping:** Under The Hammer and ESPN/cricapi may use different internal player IDs. The assumption is that player records will be keyed primarily by ESPNDataProvider ID, with optional future mapping tables to sync with other sources.

3. **Stateless Services:** Cricket data services are stateless; all state (cache, retry backoff) is managed externally by the cache layer or in-memory tracking, not in the service instances themselves.

4. **Cache Layer Availability:** Redis is optional; in-memory cache is always available as a fallback. No request is rejected due to missing cache infrastructure.

5. **Rate-Limit Handling:** The provider returns HTTP 429 with optional `Retry-After` header. The implementation uses a fixed backoff strategy (not header-based) for simplicity; header-based logic can be added in a future phase.

6. **Provider Credentials in Environment:** All provider credentials (API keys, endpoints) are environment variables; never embedded in code or configuration files. This is enforced by design and checked in code review.

7. **Player Data is Public:** Cricket player statistics and match information are public data; no special access control required beyond the standard authentication for the platform (if any). The `/cricket/players/search` endpoint is public; `/players/:id/stats?live=true` is public.

8. **Frontend Deployment:** Frontend components and hooks are built as part of the web app bundle; no separate deployment required.

9. **Existing Auth Patterns:** Backend endpoints do not require authentication for phase M (cricket data is public). If auth is added later, the endpoints will inherit the application's auth middleware.

10. **Test Data:** For testing the ESPN provider, we assume the ability to use real ESPN/cricapi IDs (e.g., "virat_kohli") or canned test responses with mocked HTTP calls. No production database seeds are required.

---

## Notes for Design Review

- **Provider Abstraction Pattern:** This feature establishes a template for future integrations (Statsbomb, official boards, proprietary APIs). The design should make it trivial to add a new provider implementation without modifying existing code.

- **Caching Philosophy:** The stale-on-error strategy is intentional: temporary provider outages should not break the user experience when cached data is available. This is a business decision favoring availability over freshness; it should be validated with the product owner if not already approved.

- **Rate-Limit Backoff:** The exponential backoff strategy is a defensive measure to respect provider rate limits and prevent cascading failures. The implementation should log these events clearly for future troubleshooting and analytics.

- **Frontend Caching:** The 5-minute browser cache for the frontend hook balances freshness with reducing backend load. This can be made configurable if product requirements change.

- **Error Codes:** A centralized error code system is recommended for consistent API responses. This may already exist in the codebase; check `apps/api/src/common/error-codes.ts`.

- **Performance Expectations:** The 2-second SLA for fresh provider calls assumes typical network latency. This should be validated against actual ESPN/cricapi response times during design or prototype phase.

- **Testing Strategy:** The 60+ test count is a target; the actual distribution should prioritize critical paths (provider failure, cache recovery, rate-limit handling) over happy-path coverage.

---
