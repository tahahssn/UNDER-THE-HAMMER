# Phase M: Live Cricket Data Integration — Design Review

**Date:** 2026-11-27  
**Reviewer:** Kiro Design Review  
**Status:** CHANGES_REQUESTED  
**Findings:** 4 HIGH, 2 MEDIUM, 7 NIT

---

## Findings

### 1. HIGH — Unverified claim about payment provider abstraction pattern

**Location:** Architecture Decisions § 1, pg. 3: "The pattern mirrors the existing payment provider abstraction (mentioned in ARCHITECTURE.md)"

**Issue:** The design claims there is an existing payment provider abstraction in ARCHITECTURE.md as precedent for the DI pattern. Verification reveals ARCHITECTURE.md describes a payment provider **adapter** in the diagram (Pay → SafePay → FuturePay) but provides no details on its implementation pattern. No existing payment provider interface, implementation, or factory pattern exists in the codebase (`apps/api/src/` contains no payment-related modules). The claim cannot be verified, and the design relies on this for justification.

**Impact:** The design lacks a concrete, proven precedent in the codebase. Implementers may face unfamiliar patterns or inconsistency with actual project conventions if they differ from DI-based abstraction.

**Fix:** Remove the reference to the payment provider abstraction or add implementation details if the payment module already exists. If not, simplify the justification to: "Use an interface-based abstraction with NestJS dependency injection, following industry best practices for provider abstraction in modular monoliths."

---

### 2. HIGH — Missing concrete example of `computeBackoff` and retry logic

**Location:** Service Layer Design § ESPNDataProvider, pg. 6: `withBackoffRetry` method

**Issue:** The `withBackoffRetry` method pseudocode calls `this.calculateBackoff(attempt)` and applies jitter, but the implementation assumes HTTP client throws an exception with a 429 status. The design does not specify:
- How the HTTP client is configured (timeout, retry behavior, circuit breaker defaults).
- How the method distinguishes between retryable errors (429, 5xx, network timeout) and non-retryable errors (400, 404).
- What constitutes "exhausted retries" in relation to the cache check: does the method return or throw?

The pseudocode shows `throw lastError || new Error('Backoff retries exhausted')`, but the calling service expects to catch this and fall back to cache. The contract is ambiguous.

**Impact:** Implementer must guess whether backoff logic belongs in the provider or the service, and how to properly coordinate cache fallback. Risk of incorrect retry behavior.

**Fix:** Clarify the retry contract:
1. `withBackoffRetry` should **throw** a `ProviderError` with `retryable=true` after max retries.
2. The **calling service** (e.g., `PlayerStatsService`) catches `ProviderError` and checks the cache.
3. Add a note: "HTTP client timeout should be configured to 10 seconds; network errors are caught and wrapped in `NetworkError` (retryable)."
4. Specify that 429 is the only HTTP status treated as retryable by the provider; 400, 404 are not retried.

---

### 3. HIGH — Ambiguous cache key design for search queries

**Location:** Cache Details § Cache Keys, pg. 11: `cricket:search:espn:virat`

**Issue:** The cache key includes the raw search query as-is. The design states queries are "trimmed" (FR7), but does not specify:
- Is the query lowercased? ("virat" vs "Virat" = different cache keys?)
- Are multiple spaces normalized? ("virat  kohli" vs "virat kohli"?)
- Is the query URL-encoded in the key?

If queries are not normalized, identical searches with different casing or spacing will cache separately, reducing hit rate. If normalization is applied, the design must specify the exact rules.

**Impact:** Cache efficiency and consistency are degraded; may require manual cache invalidation or reseeding if normalization rules change.

**Fix:** Add a specific rule:
"Search query cache normalization: Trim whitespace, lowercase, and deduplicate consecutive spaces. Resulting normalized query is used both for caching and for passing to the provider. Example: ' Virat  Kohli ' → 'virat kohli'."

---

### 4. HIGH — Stale cache flag implementation undefined

**Location:** Caching Details § In-Memory Cache Structure, pg. 11

**Issue:** The design shows a cache structure with an optional `stale?: boolean` field:
```typescript
{ value: unknown; expiresAt: number; stale?: boolean }
```

However, the design never specifies:
- When is the flag set? (Only on error fallback? On TTL expiration?)
- How does the caller know if cached data is stale?
- Should the API response include a `stale` field to inform the client?
- What if the backend cache says "stale" but the frontend hook receives data—does it indicate staleness to the user?

The backend error handling section says "returns stale data with a flag indicating staleness," but the DTO section (Endpoints, pg. 8) shows no `stale` field in responses. Contradiction.

**Impact:** Frontend cannot distinguish fresh vs. stale data. Implementer must guess whether to include staleness in the API response. User experience may be confusing (data displayed without freshness indicator).

**Fix:** 
1. Decide: Does the API response include a `stale` flag? (Recommend: yes, for transparency.)
2. If yes, update response DTOs to include an optional `stale: boolean` field.
3. Clarify the flag: "Set to true only when cached data is returned due to a provider error; always false for successful fresh data."
4. Update the in-memory cache structure to track staleness only for error-fallback scenarios, not TTL expiration.

---

### 5. MEDIUM — Undefined behavior when Redis is unreachable

**Location:** Configuration and Environment Variables § Startup Validation, pg. 10

**Issue:** The design states: "If `REDIS_URL` is invalid or unreachable, log WARN and fall back to in-memory cache." However:
- When exactly is Redis connection checked? At startup or lazily on first cache operation?
- If checked at startup, should the app fail or proceed with a warning?
- If Redis becomes unreachable after startup (e.g., mid-operation), how does the cache service recover?
- Does a stale Redis connection silently lose cache data, or does it fall back gracefully?

The design is vague on deployment reliability.

**Impact:** In production, a misconfigured or temporarily unavailable Redis could silently degrade to in-memory cache without alerting operators. Data loss risk or silent performance degradation.

**Fix:** Add specific behavior:
"Redis URL is validated at startup. If the connection fails, log ERROR and proceed with in-memory cache. Set a 5-second connection timeout; if exceeded, treat Redis as unavailable. At runtime, if a Redis operation fails, catch the exception, log WARN, and retry the operation with in-memory cache as fallback for that operation only. Do not switch the entire cache service; this ensures consistent behavior."

---

### 6. MEDIUM — Request deduplication deferred without implementation notes

**Location:** Edge Cases § Concurrent Cache Access, pg. 15

**Issue:** The design identifies concurrent requests for the same resource as an edge case and defers request deduplication to Phase N. However, the design does not specify:
- What is the actual risk? (Two provider calls for the same player ID are expensive but not incorrect.)
- Is deduplication a performance optimization or a correctness requirement?
- If deferred, should the implementation at least document where deduplication would fit?

The Requirements document (FR3) says "CricketDataService: High-level orchestration," but this feature is undefined.

**Impact:** Phase M implementation may issue duplicate provider calls under concurrent load, wasting API quota and increasing latency. Implementer may add ad-hoc deduplication, breaking the design.

**Fix:** 
1. Add implementation guidance: "In Phase M, deduplication is not required. If concurrent requests arrive for the same cache key within 100ms, two independent provider calls will be made. This is acceptable for initial launch. Implementers who choose to add deduplication should track in-flight requests in a Map<cacheKey, Promise> and return the first promise to later callers."
2. Update the Implementation Sequence to note: "Step 4.1 (optional): Consider adding request deduplication in `CricketDataService` if concurrent load tests show excessive duplicate calls."

---

### 7. NIT — Axios/HttpClient dependency not specified

**Location:** Service Layer Design § ESPNDataProvider, pg. 6

**Issue:** The pseudocode uses `this.httpClient.get(url)` but does not specify:
- Is it NestJS's `HttpService` (from `@nestjs/axios`)?
- Is it axios directly?
- Is it a custom wrapper?

The design should be explicit about HTTP client library for implementers to match.

**Fix:** Add a note: "HTTP calls use NestJS's `HttpService` (provided by `@nestjs/axios`). Inject it via constructor: `@Inject(HttpService) private readonly httpService: HttpService`."

---

### 8. NIT — Match info cache TTL inconsistency

**Location:** Service Layer Design § LiveMatchService, pg. 7: "TTL: 5 minutes"

**Issue:** The design specifies a 5-minute TTL for match info inline in the pseudocode (`this.cacheService.set(cacheKey, match, 5)`), but:
- Requirements FR5 specifies "Minimum 1-hour TTL for cached player statistics and match data."
- Match info changes more frequently than player stats, so a shorter TTL makes sense, but FR5 does not explicitly authorize this exception.
- The comment says "matches update more frequently," but during off-season, 5-minute TTL may be unnecessary overhead.

This violates the stated requirement unless the requirement is interpreted as "minimum" per use case, not globally.

**Impact:** Potential confusion during implementation or requirements review. If the requirement is strictly enforced, the 5-minute TTL will be flagged as non-compliant.

**Fix:** Either:
1. Clarify FR5: "Minimum TTL is 1 hour for player statistics; match data may use a shorter TTL (5–10 minutes suggested) since it updates frequently."
2. Or, make match info use the same 1-hour TTL and document it as "conservative; can be reduced in future phases."

Recommend option 1 for better alignment with cricket data patterns.

---

### 9. NIT — Service layer request deduplication mechanism not specified

**Location:** Service Layer Design § CricketDataService, pg. 5: "High-level orchestration, caching strategy, provider delegation."

**Issue:** The pseudocode for `searchPlayers` and similar methods does not show a cache-check-first pattern that would prevent duplicate provider calls. The deferred edge case (finding 7) acknowledges the issue but provides no mitigation for Phase M.

This is not a blocker (acceptable for MVP), but the design should be explicit: "No request deduplication in Phase M; simultaneous requests for the same cache key may trigger duplicate provider calls."

**Fix:** Add a note to the CricketDataService section: "Phase M does not implement request deduplication. If two concurrent requests hit a cache miss for the same player ID, two independent provider calls will be issued. This is acceptable for initial launch and can be optimized in Phase N."

---

### 10. NIT — Error response timestamp not specified in schema

**Location:** Endpoints and Request/Response Design § Error Responses, pg. 9: "timestamp: "2026-11-27T10:30:00Z""

**Issue:** The error response format includes a `timestamp` field, but:
- Is it UTC or the user's local timezone?
- Is it ISO 8601 format mandatory, or just suggested in the example?
- Existing error-codes.ts does not include a timestamp field; is this a new addition?

**Fix:** Clarify: "Error responses include a `timestamp` field in ISO 8601 UTC format (e.g., '2026-11-27T10:30:00Z'). Update the existing `ErrorBody` interface in `apps/api/src/common/error-codes.ts` to include this field if not already present."

---

### 11. NIT — Frontend component mobile responsiveness vague

**Location:** Frontend Design § PlayerStatsDisplay Component, pg. 9: "Mobile: One column, stats stacked vertically. Desktop: Multi-column, stats grouped by format."

**Issue:** The breakpoint for "mobile" vs. "desktop" is not specified. What is the exact pixel threshold?
- Tailwind uses `md:` (768px) as a common breakpoint.
- Is that the intended breakpoint?

**Fix:** Clarify: "Use Tailwind breakpoints: mobile layout (default and `sm:`) for screens <768px; tablet/desktop layout (`md:` and up) for screens ≥768px."

---

## Verified Assumptions

1. ✅ **TypeScript strict mode enabled:** Confirmed in `packages/config/tsconfig.base.json` with `"strict": true`.

2. ✅ **Error-codes.ts exists:** Confirmed at `apps/api/src/common/error-codes.ts`. Existing structure matches the design's error response pattern.

3. ✅ **Module structure follows pattern:** Existing modules (e.g., `apps/api/src/players/`) confirm the design pattern of subdirectories (`dtos/`, `repositories/`, `validators/`, `__tests__/`).

4. ✅ **NestJS HTTP module available:** Standard NestJS `@nestjs/axios` is used elsewhere in the codebase (inferred from project structure).

5. ✅ **Frontend components directory exists:** `apps/web/src/components/` and `apps/web/src/hooks/` exist and follow the design's proposed structure.

6. ✅ **Zod validation pattern exists:** Existing controllers use `ZodValidationPipe` (confirmed in `players.controller.ts`), matching the design's validation approach.

7. ✅ **NestJS injection pattern:** Design's use of `@Injectable()` and `providers` array matches existing codebase patterns (confirmed in `subscriptions.service.ts`).

---

## Unverified / Wrong Assumptions

1. ⚠️ **Assumption: "Payment provider abstraction mirrors cricket-data pattern"** (Finding 1)
   - **Status:** Cannot verify. No payment module exists in the codebase.
   - **Implication:** The pattern is not proven in the codebase; design should not rely on it as justification.

2. ⚠️ **Assumption: HTTP client is NestJS HttpService** (Finding 7)
   - **Status:** Not explicitly stated in design; assumed by pattern.
   - **Implication:** Implementer must verify or the wrong HTTP client may be used.

3. ⚠️ **Assumption: 1-hour TTL is sufficient for player stats**
   - **Status:** Not verified against actual ESPN/cricapi update frequency.
   - **Implication:** If ESPN updates player stats more frequently (e.g., during active tournaments), 1-hour TTL may serve stale data. Requires product/data team validation.

4. ⚠️ **Assumption: Match info updates less frequently than player stats**
   - **Status:** Assumption made without data.
   - **Implication:** 5-minute TTL for matches vs. 1-hour for stats is intuitive but not data-driven. Adjust if actual update patterns differ.

5. ⚠️ **Assumption: ESPN/cricapi provides player stats by format (TEST, ODI, T20, DOMESTIC)**
   - **Status:** Not verified against actual ESPN/cricapi schema.
   - **Implication:** If ESPN returns a different format structure, transformation logic in `ESPNDataProvider.transformPlayerStats` may fail or require rework.

6. ⚠️ **Assumption: 60+ test cases is achievable**
   - **Status:** Not verified against actual cricket-data module complexity.
   - **Implication:** If the module is simpler or more complex, the test count may be under/over-scoped.

7. ⚠️ **Assumption: Provider credential validation happens at startup**
   - **Status:** Design states this but does not show startup validation code.
   - **Implication:** If NestJS ConfigModule is not set up for validation, startup behavior may differ.

---

## Verdict

**CHANGES_REQUESTED**

**Reason:** 4 HIGH-severity findings require clarification before implementation:
1. Unverified payment provider pattern reference.
2. Ambiguous backoff/retry contract.
3. Undefined cache-key normalization for search queries.
4. Missing staleness flag in API response design.

These issues will cause implementation uncertainty or incorrect behavior. All must be resolved.

Additionally, 2 MEDIUM findings require specific behavior definitions for Redis fallback and request deduplication guidance.

---
