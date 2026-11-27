# Phase M: Live Cricket Data Integration

**Status**: Ready to launch (Phase J merged to main)  
**Workflow**: `bundled://feature-pipeline`  
**Base branch**: main (at cc5c32a)  
**Feature branch**: `feature/phase-m-cricket-data`  
**Expected duration**: ~2 hours  
**Blockers**: None (Phase C player directory complete; no backend schema changes needed)

---

## Deliverables

### Backend

**Cricket Data Provider Interface** (`apps/api/src/cricket/services/cricket-provider.interface.ts`)
```typescript
export interface ICricketProvider {
  getPlayerStats(playerId: string): Promise<PlayerStatsDto>;
  getMatchInfo(matchId: string): Promise<MatchInfoDto>;
  searchPlayer(name: string): Promise<PlayerSearchResult[]>;
}
```

**ESPN/Cricinfo Provider** (`apps/api/src/cricket/services/espncricinfo-provider.service.ts`)
- Wrapper around espncricinfo API (or cricapi.com as fallback)
- Methods:
  - `getPlayerStats(playerId)` → `{ name, role, stats: { matches, runs, wickets, avg, sr }, lastUpdated }`
  - `getMatchInfo(matchId)` → `{ name, teams, status, score, liveUrl }`
  - `searchPlayer(name)` → array of matching players with IDs
- Error handling: 404 (player not found), rate-limit backoff, timeout recovery
- Caching: 1-hour TTL for player stats (use Redis if available, in-memory fallback)
- API key from `CRICKET_API_KEY` environment variable

**Cricket Data Service** (`apps/api/src/cricket/services/cricket-data.service.ts`)
- Higher-level service wrapping the provider
- Methods:
  - `enrichPlayerWithLiveStats(playerId)` → fetches and caches stats
  - `getMatchLiveScore(matchId)` → fetches match info
  - `updatePlayerStatsCache()` (optional background job)
- Error recovery: stale cache on provider failure

**Cricket Data Endpoints** (`apps/api/src/cricket/controllers/cricket.controller.ts`)
- GET `/v1/players/:id/stats?live=true` → player stats (live if available, historical fallback)
  - Response: `{ id, name, role, stats: { matches, runs, wickets }, lastUpdated, source: 'espncricinfo' }`
- GET `/v1/matches/:id` → match info
  - Response: `{ id, name, teams, status, liveUrl }`
- GET `/v1/cricket/search?q=player-name` → search results
  - Response: `[{ id, name, role, team }]`

**Data Sync Service** (optional background job, `apps/api/src/cricket/services/cricket-sync.service.ts`)
- Scheduled task: every 30 minutes, refresh stats for active-auction players
- Or webhook-triggered on new match events
- Non-blocking: runs in background, doesn't impact request path

**Tests** (`apps/api/src/cricket/services/*.spec.ts`)
- Provider: mock HTTP responses, test stats parsing, rate-limit handling
- Service: cache hits/misses, stale cache on error, error propagation
- Controller: endpoints return 200, 404 on missing player, search results
- Integration: end-to-end with mocked provider
- Edge cases: missing player, API timeout, malformed response, rate-limit
- 40+ tests, >90% coverage

### Frontend

**Player Stats Component** (`apps/web/src/components/cricket/PlayerStats.tsx`)
- Shows in player introduction / profile:
  - Name, role, team
  - Career stats: matches, runs, wickets, average, strike rate
  - Last updated timestamp
  - "Loading..." spinner while fetching
  - "Stats unavailable" fallback
- Responsive: stats grid 1/2 cols at mobile/desktop
- No hardcoded values (all from API)

**Live Match Component** (optional, `apps/web/src/components/cricket/LiveMatch.tsx`)
- Shows during auction if a live match is happening:
  - Teams, current score, overs, wickets
  - "Watch live" link to external URL
  - Updates every 30s or on socket broadcast (if Phase I enhancement)

**Hook** (`apps/web/src/hooks/useCricketData.ts`)
- `useCricketData(playerId)` → `{ stats, loading, error }`
- Fetches `/api/v1/players/:id/stats?live=true`
- 5-min cache (browser storage) to avoid repeated fetches
- Retry on error

**Tests** (`apps/web/src/components/cricket/*.spec.tsx`, hooks)
- Component: renders stats, shows loading/error states
- Hook: fetch success, 404 handling, cache behavior
- Responsive: mobile/desktop layouts
- 20+ tests, >90% coverage

---

## Integration Points

- **Phase C** (player directory): player profile page shows live stats
- **Phase J** (live auction): player introduction shows stats card
- **Phase F** (rooms): match info displayed in room header (optional)
- **No new migrations** (cricket data is external, not stored in our DB for real-time stats)
- **Future**: match-scoped filtering (only PSL players during PSL, etc.)

---

## Success Criteria

- [ ] GET `/v1/players/:id/stats` returns live player stats
- [ ] GET `/v1/cricket/search?q=:name` returns player search results
- [ ] Stats cached (1 hour TTL minimum)
- [ ] Provider handles rate limits (exponential backoff)
- [ ] Component shows stats + loading/error states
- [ ] TypeScript strict (0 errors, no `any`)
- [ ] Tests passing (60+ tests, >85% coverage)
- [ ] No hardcoded provider URLs (use env var)
- [ ] No secrets in code
- [ ] Responsive (mobile 375px, desktop 1440px)
- [ ] Graceful degradation: auction works without live stats

---

## Files to Create/Modify

**Backend**:
- `apps/api/src/cricket/services/cricket-provider.interface.ts` (new)
- `apps/api/src/cricket/services/espncricinfo-provider.service.ts` (new)
- `apps/api/src/cricket/services/cricket-data.service.ts` (new)
- `apps/api/src/cricket/services/cricket-data.service.spec.ts` (new)
- `apps/api/src/cricket/controllers/cricket.controller.ts` (new)
- `apps/api/src/cricket/controllers/cricket.controller.spec.ts` (new)
- `apps/api/src/cricket/dtos/player-stats.dto.ts` (new)
- `apps/api/src/cricket/services/cricket-sync.service.ts` (optional, for background jobs)

**Frontend**:
- `apps/web/src/hooks/useCricketData.ts` (new)
- `apps/web/src/hooks/useCricketData.spec.ts` (new)
- `apps/web/src/components/cricket/PlayerStats.tsx` (new)
- `apps/web/src/components/cricket/PlayerStats.spec.tsx` (new)
- `apps/web/src/components/cricket/LiveMatch.tsx` (optional)

**Environment**:
- `.env.local` (add `CRICKET_API_KEY`, `CRICKET_PROVIDER` = 'espncricinfo' | 'cricapi')
- `.env.example` (document CRICKET_* variables)

**Tests**: 60+ total (40 backend, 20 frontend)

---

## Decisions Already Made

| Item | Decision | Why |
|------|----------|-----|
| Provider | Espncricinfo API + cricapi fallback | Free tier available, cricket-specific, reliable |
| Caching | 1-hour TTL | Balances freshness (live during auction) and rate limits |
| Cache store | Redis (optional) or in-memory | In-memory OK for MVP; Redis for scale |
| Refresh | On-demand + optional 30-min background job | Don't overload external API; real-time only during auction |
| Stale cache | Use on provider error | Auction survives API outage |
| Stats storage | External only (no DB) | Avoid DB bloat; source of truth is external API |

---

## Environment Variables Required

```bash
CRICKET_API_KEY=... (from espncricinfo or cricapi)
CRICKET_PROVIDER=espncricinfo # or cricapi
CRICKET_CACHE_TTL=3600 # seconds
```

---

## Notes

- Espncricinfo has no official API; using unofficial endpoints or cricapi.com recommended
- Cricket data is PSL-focused initially; can be generalized to any league
- Player ID mapping: internal DB player ID → external cricket provider ID (stored in Player model, Phase C)
- Rate limits: typically 1000-5000 requests/day for free tier; cache heavily
- Future: live match commentary, ball-by-ball updates, historical trends

