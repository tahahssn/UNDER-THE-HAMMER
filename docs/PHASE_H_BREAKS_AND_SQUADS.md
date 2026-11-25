# Phase H: Breaks and Squad Rules

## Overview

Phase H implements break management and squad requirement validation for auction auctions. Breaks pause bidding after a configured number of bids, allowing hosts to adjust timing and teams to review requirements. Squad rules validate team composition (size, roles, domestic/overseas balance) and are recorded as audit trail at settlement.

## Architecture

### Backend (NestJS)

#### Breaks Service (`BreakManagerService`)
- **Responsibilities**: Break scheduling, timing, extension/reduction
- **Key Methods**:
  - `shouldScheduleBreak()`: Check if break should trigger based on bid count
  - `incrementBidCounter()`: Track bids per player or across auction
  - `startBreak()`: Begin a break with server-driven deadline
  - `extendBreak()`: Host extends break by up to 300 seconds
  - `reduceBreak()`: Host reduces break duration
  - `endBreak()`: Host or system ends break early
  - `getBreakStatus()`: Return current break state with time remaining

**Bid Counter Scope**:
- `PER_PLAYER`: 5 bids on current player triggers break, counter resets on player change
- `ACROSS_AUCTION`: 5 bids total (default, configured via room settings)

#### Squads Service (`SquadsService`)
- **Responsibilities**: Squad tracking, validation, violation recording
- **Key Methods**:
  - `getSquadRules()`: Fetch auction's squad rules (size, roles, domestic/overseas, categories)
  - `getSquadProgress()`: Calculate current progress for a team
  - `validateSquadRequirements()`: Check compliance, record violations
  - `getLatestValidation()`: Fetch validation record and violations

**Validation Timing**: Settlement only (not enforcement during auction)
**Violations**: Audit trail for support/admin review, not error handling

#### Settlement Service Integration (`SettlementService`)
- Calls `SquadsService.validateSquadRequirements()` at player settlement
- Records validation record and violations in database
- Violations do not prevent bid acceptance or settlement

#### Event Types
- `break:started`: { breakId, durationSeconds, reason }
- `break:extended`: { breakId, extensionSeconds, newDeadline }
- `break:reduced`: { breakId, reductionSeconds, newDeadline }
- `break:ended`: { breakId }
- `squad:requirement-updated`: { auctionTeamId, currentCount }
- `squad:validation-complete`: { auctionTeamId, valid, violationCount }

#### Endpoints
**Breaks**:
- `GET /auctions/:auctionId/break/status` → BreakStatusDto
- `POST /auctions/:auctionId/break/begin` → { durationSeconds, reason? }
- `POST /auctions/:auctionId/break/extend` → { extensionSeconds }
- `POST /auctions/:auctionId/break/reduce` → { reductionSeconds }
- `POST /auctions/:auctionId/break/end` → BreakRecord

**Squads**:
- `GET /auctions/:auctionId/squads/rules` → SquadRule[]
- `GET /auctions/:auctionId/squads/:auctionTeamId/progress` → SquadRuleProgress[]
- `GET /auctions/:auctionId/squads/:auctionTeamId/validation` → SquadValidation | null
- `POST /auctions/:auctionId/squads/:auctionTeamId/validate` → SquadValidationResult

#### Authorization
- **Host only**: Extend, reduce, end break
- **Any participant**: Read break status, squad progress, validation
- **Backend authority**: All timers, bid counting, validation logic

### Frontend (React/Next.js)

#### Components

**BreakTimer**
- Server-driven countdown display
- Circular progress indicator
- Color-coded: green (healthy), yellow (<30s), red (<10s)
- Triggers `onExpired` callback when time reaches 0

**SquadTable**
- Displays squad composition by team
- Dynamic columns per team (not hard-coded to 8)
- Shows player name, role, country, category
- Responsive: stacked on mobile, grid on desktop

**RequirementProgress**
- Visual progress bars for each squad rule
- Displays current count vs. required range
- Color-coded satisfaction status
- Compact mode for break overlay, full mode for reference

**BreakControls**
- Host-only extend/reduce/end buttons
- Visible only to host role
- Disabled when action not permitted (e.g., no time left to reduce)
- 300-second limits on adjustment

**BreakScreen**
- Full-screen modal overlay during breaks
- Sticky header with break reason
- Center: BreakTimer
- Left column: RequirementProgress
- Right column: BreakControls + summary
- Bottom: SquadTable by team
- Note: Chat remains available

#### Hooks

**useBreakSocket**
- Subscribe to `break:started`, `break:extended`, `break:reduced`, `break:ended` events
- Provide `breakStatus` and `isBreakActive` state
- Expose `extendBreak()`, `reduceBreak()`, `endBreak()` methods
- Reconnection syncs state with server

**useSquadProgress**
- Fetch squad progress for a team
- Subscribe to `squad:requirement-updated`, `squad:validation-complete` events
- Track validation record and violations
- Handle loading and error states

#### Integration

```tsx
// In AuctionRoom component
const { breakStatus, isBreakActive, extendBreak, reduceBreak, endBreak } = useBreakSocket(auctionId);
const { progress, validation } = useSquadProgress(auctionId, selectedTeamId);

return (
  <>
    {isBreakActive && (
      <BreakScreen
        auctionId={auctionId}
        userId={userId}
        isHost={isHost}
        breakStatus={breakStatus}
        teams={teams}
        squadRequirements={progress}
        onBreakEnded={handleBreakEnded}
        onExtendBreak={extendBreak}
        onReduceBreak={reduceBreak}
        onEndBreak={endBreak}
      />
    )}
  </>
);
```

#### Optional: SquadProgressSidebar

Collapsible sidebar shown in LIVE phase (not break overlay).
- Shows squad progress for current team owner
- Read-only information display
- Not intrusive (collapsible)

## Database Schema

### AuctionBreak
- `id` (UUID, PK)
- `auctionId` (FK → Auction)
- `startedAt` (DateTime)
- `deadline` (DateTime, server-authoritative)
- `originalDurationSeconds` (Int)
- `reason` (String, optional)
- `triggerBidCount` (Int, optional)
- `endedAt` (DateTime, nullable)

### SquadRule
- `id` (UUID, PK)
- `auctionId` (FK → Auction)
- `type` (Enum: SQUAD_SIZE, ROLE_COUNT, DOMESTIC_COUNT, OVERSEAS_COUNT, CATEGORY_COUNT)
- `role` (Enum: BATTER, BOWLER, ALL_ROUNDER, WICKETKEEPER, nullable)
- `categoryId` (FK → PlayerCategory, nullable)
- `minCount` (Int, nullable)
- `maxCount` (Int, nullable)

### SquadValidation
- `id` (UUID, PK)
- `auctionId` (FK → Auction)
- `auctionTeamId` (FK → AuctionTeam)
- `valid` (Boolean)
- `validatedAt` (DateTime)

### SquadViolation
- `id` (UUID, PK)
- `squadValidationId` (FK → SquadValidation)
- `auctionTeamId` (FK → AuctionTeam)
- `squadRuleId` (FK → SquadRule)
- `violationType` (Enum: BELOW_MIN, ABOVE_MAX, MISSING_REQUIREMENT)
- `currentCount` (Int)
- `requiredMinCount` (Int, nullable)
- `requiredMaxCount` (Int, nullable)
- `createdAt` (DateTime)

## Configuration

### Room Settings (RoomSettings.config.json)

```json
{
  "breakAfterNBids": 5,
  "breakDurationSeconds": 120,
  "breakCounterScope": "ACROSS_AUCTION",
  "maxBreakExtensionSeconds": 300,
  "maxBreakReductions": 3,
  "maxBreakExtensions": 3,
  "breakReasonDefault": "Break for strategy discussion",
  "squadRules": {
    "squadSizeMin": 15,
    "squadSizeMax": 18,
    "rolesRequired": {
      "WICKETKEEPER": { "min": 1 },
      "BATTER": { "min": 4 },
      "BOWLER": { "min": 3 },
      "ALL_ROUNDER": { "min": 1 }
    },
    "domesticMax": 5,
    "overseasMax": 8,
    "marqueeMax": 2
  }
}
```

## Testing

### Unit Tests
- Bid counter increment/reset logic
- Break duration calculations
- Squad rule validation (all types)
- Violation detection and recording

### Integration Tests
- Break starts after N bids
- Counter resets on player change (PER_PLAYER scope)
- Host can extend/reduce within limits
- Squad validation at settlement (doesn't block)
- State survives reconnection

### E2E Tests
- Full break flow: bid triggers break, timer displays, host extends
- Squad display during break
- Multiple teams with different compositions
- Validation violations recorded correctly

## Known Limitations & Future Work

1. **Break UI**: Currently minimalist; can add animations, sound, or notifications
2. **Squad Display**: Initial implementation shows basic table; could add comparison view across teams
3. **Violations**: Currently audit trail only; future phase may implement soft enforcement (warning UI)
4. **Break Interruption**: Can only end or extend; no pause/resume within a single break
5. **Custom Rules**: Squad rules are preset per tournament; future work to allow host customization

## Migration & Deployment

### Prisma Migration Required
After pulling Phase H code, run in a local/dev environment:
```bash
pnpm install
pnpm prisma generate
npm run build
```

See `.agents/phase-h-prisma-generation.sh` for automated setup.

### Database Initialization
Migrations are created but not applied; DevOps should:
1. Run `npx prisma migrate deploy` to apply schema changes
2. Seed initial squad rules per tournament if needed

## References

- AGENTS.md: Section 7 (Auction Rules) for bid bracket and break proposal
- DESIGN.md: Break UI mockups
- PRD.md: Break and squad requirements (sections 4.3, 4.4)
- ARCHITECTURE.md: Backend authority principle (section 2)
