# Phase J: Live Auction Frontend — Implementation Specification

**Phase**: J (13/20 phases)  
**Dependency**: Phase I (Real-time Gateway and Room Chat) must be complete  
**Type**: Frontend implementation with real-time integration  
**Scope**: Complete live auction bidding UI, team bidding experience, squad progress, mobile responsive  

---

## Overview

Phase J completes the live auction room experience. Users join an auction room, see live player introductions, place bids in real-time, track team purse and squad requirements, and handle breaks. This phase integrates Phase H (breaks/squads) and Phase I (real-time events) into a cohesive bidding interface.

---

## User Journeys

### Journey 1: Host Starts Auction
1. Host navigates to room (from Phase F)
2. Host clicks "Start Auction" button
3. Phase transitions from READY → LIVE
4. First player is introduced: "Now Bidding: Player Name (Role, Base Price)"
5. Bidding form appears for all bidders
6. Timer countdown begins (Phase I broadcasts timer state)
7. All team owners see bid updates in real-time
8. When highest bid is accepted, acquisition happens
9. Next player is introduced automatically
10. Break triggers after N bids (Phase H)

### Journey 2: Bidder Places Bid
1. Bidder sees current player info and highest bid
2. Bidder enters bid amount in input field
3. Bid amount is validated against purse balance and increment rules (Phase G)
4. Bidder clicks "Place Bid" or presses Enter
5. Backend validates bid (12-step pipeline from Phase G)
6. If accepted: highlight updates, timer restarts
7. If rejected: error message shows reason (insufficient purse, invalid increment, etc.)
8. All users see bid updates in real-time (Phase I broadcasts)

### Journey 3: Break Occurs
1. After 5 bids (configurable, Phase H), break is triggered
2. Phase transitions to BREAK
3. Full-screen BreakScreen overlay appears (from Phase H)
4. Squad progress, requirements, host controls all visible
5. Chat remains accessible
6. Host can extend/reduce break
7. When break ends, phase returns to LIVE
8. Next player bidding resumes

### Journey 4: Spectator Watches
1. Spectator joins room (read-only access)
2. Spectator sees all players, bids, team standings
3. Spectator cannot bid or access team-specific info
4. Spectator can read chat (or restricted by room policy)
5. Spectator sees break timer and squad progress

### Journey 5: Mobile Bidder
1. Bidder opens room on mobile (375px viewport)
2. Layout stacks vertically: player info, bid form, team standings
3. Chat is in a collapsible drawer or tab
4. Squad progress hidden or in expandable section
5. All interactions work at reduced viewport

---

## Component Architecture

### Page Structure

```
AuctionRoomPage
├── AuctionRoomLayout (Phase I integrates here)
│   ├── PlayerIntroduction (top)
│   │   ├── PlayerName, Role, Category
│   │   ├── BasePrice, Status
│   │   └── LeadingTeam display
│   │
│   ├── BiddingPanel (center/main)
│   │   ├── BidPlacementForm
│   │   │   ├── AmountInput (with increment suggestions)
│   │   │   ├── PlaceBidButton
│   │   │   └── ValidationErrors (insufficient purse, increment, etc.)
│   │   │
│   │   ├── BidHistory (recent 5–10 bids scrollable)
│   │   │   └── BidRow × N (team, amount, time, status)
│   │   │
│   │   └── RealTimeStats
│   │       ├── BidsPlaced (counter)
│   │       ├── TimeSinceLastBid
│   │       └── NextBreakIn (N bids remaining)
│   │
│   ├── TeamStandings (sidebar or below)
│   │   ├── TeamCard × N
│   │   │   ├── TeamName, Logo
│   │   │   ├── PurseDisplay (remaining balance)
│   │   │   ├── SquadProgressCompact (1 line: 11/11 | 3/4)
│   │   │   ├── LeadingIndicator (if leading on current player)
│   │   │   └── OwnerPresence (online/offline indicator)
│   │   │
│   │   └── SortBy (purse remaining, acquisitions, etc.)
│   │
│   ├── BreakScreen (Phase H overlay, shown when phase=BREAK)
│   │
│   ├── ChatPanel (Phase I, right sidebar or bottom drawer on mobile)
│   │
│   └── ErrorState / LoadingState / ReconnectingState
```

### New Components (Phase J Specific)

#### 1. BidPlacementForm
**Props**:
```typescript
interface BidPlacementFormProps {
  currentPlayerId: string;
  currentPrice: BigInt; // in minor units
  teamPurse: BigInt;
  incrementBrackets: AuctionIncrementBracket[];
  currency: string;
  disabled: boolean; // during break, waiting for response, etc.
  onSubmit: (amountMinor: BigInt) => Promise<void>;
  error?: string;
  isSubmitting?: boolean;
}
```

**Behavior**:
- Read-only input showing current highest bid (formatted currency)
- Editable input for new bid amount
- Shows next valid increment suggestion below input
- "Place Bid" button, disabled during submission
- Shows validation errors inline (insufficient purse, invalid increment)
- Keyboard: Enter to submit, Escape to clear

#### 2. BidHistory
**Props**:
```typescript
interface BidHistoryProps {
  bids: Bid[]; // Last 10–15 bids for current player
  teams: Map<string, AuctionTeam>; // For team lookup
  currency: string;
}
```

**Behavior**:
- Scrollable list of recent bids (most recent first)
- Each row: Team name, bid amount, time, status (ACCEPTED/REJECTED)
- Rejected bids shown with reason (gray/muted)
- Accepted bids highlighted
- Max height with scroll

#### 3. PlayerIntroduction
**Props**:
```typescript
interface PlayerIntroductionProps {
  player: AuctionPlayer;
  basePrice: BigInt;
  currentBid?: BigInt;
  leadingTeam?: AuctionTeam;
  status: AuctionPlayerStatus; // ACTIVE, SOLD, UNSOLD
  currency: string;
}
```

**Behavior**:
- Large, clear display of player name, role badge, category
- Base price in prominent position
- Current highest bid (or "No bids yet")
- Leading team name (if exists)
- Status indicator (ACTIVE = green, SOLD = gold, UNSOLD = gray)
- Player image if available

#### 4. TeamStandings
**Props**:
```typescript
interface TeamStandingsProps {
  teams: AuctionTeam[];
  currentPlayerId: string; // For highlighting leading team
  view: 'full' | 'compact'; // Full for desktop, compact for mobile
}
```

**Behavior**:
- Grid or list of team cards
- Each card: logo, name, purse remaining, squad progress, leading indicator
- Color coding: leading team has highlight (glow or border)
- On desktop: 2–4 columns, full details
- On mobile: stacked, compact view
- Sortable: by purse, acquisitions, etc.

#### 5. RealTimeStats
**Props**:
```typescript
interface RealTimeStatsProps {
  bidsPlaced: number;
  timeSinceLastBid: number; // seconds
  nextBreakIn: number; // bids remaining
  breakAfterNBids: number;
}
```

**Behavior**:
- Shows bid counter, time since last bid, next break countdown
- Updates in real-time from Phase I events
- Color change when break is approaching (5 → yellow, 2 → red)

#### 6. BidPlacementError
**Props**:
```typescript
interface BidPlacementErrorProps {
  code: string; // INSUFFICIENT_PURSE, INVALID_INCREMENT, etc.
  currentBid: BigInt;
  requiredIncrement: BigInt;
  minimumBid: BigInt;
  purseBalance: BigInt;
  currency: string;
}
```

**Behavior**:
- Clear, specific error message
- Shows suggested valid bid if applicable
- Auto-clear on input change

---

## Real-Time Integration (Phase I)

### Events Received
- `BID_ACCEPTED`: Update bid history, leading team, player current price
- `BID_REJECTED`: Show error, don't clear input (user can retry)
- `PLAYER_INTRODUCED`: Update player display, clear bid history, reset form
- `PLAYER_SOLD`: Mark status, show leading team, disable bidding
- `PLAYER_UNSOLD`: Mark status, disable bidding
- `BREAK_STARTED`: Show break screen overlay, disable bidding form
- `BREAK_ENDED`: Hide break screen, enable bidding form
- `SQUAD_UPDATED`: Update team card squad progress
- `PRESENCE_UPDATE`: Update "Online" indicators on team cards
- `BID_TIMER_UPDATE`: (Optional) if Phase I broadcasts timer updates
- `ERROR`: Show error state, offer reconnect

### Events Sent
- `PLACE_BID`: { auctionId, auctionTeamId, auctionPlayerId, amount, idempotencyKey }
- (Chat messages sent via Phase I ChatGateway)

### Reconnection Flow
1. User disconnects/reconnects (detected by Phase I)
2. Frontend fetches current auction state: `/v1/auctions/:id/state`
3. Response includes: current player, highest bid, break status, team standings
4. Frontend updates UI with fetched state
5. Frontend subscribes to real-time events again
6. No duplicate bids (idempotency key on client side)

---

## Styling and Responsive Design

### Desktop (1024px+)
- Bidding form centered/prominent
- Player info in large card at top
- Team standings in right sidebar (280px)
- Chat panel overlaid right edge or tab
- Bid history scrollable below form
- Full squad progress cards

### Tablet (768px–1023px)
- Stacked layout: Player info, Bid form, Team standings
- Chat in expandable drawer
- Team standings in grid (2 columns)
- Bid history below form

### Mobile (375px–767px)
- Full-height bidding form
- Player info in collapsible header
- Team standings in horizontal scrollable list or tabs
- Chat in bottom drawer or tab
- Squad progress hidden (tab access)

### Accessibility
- High contrast for bid amounts and buttons
- Focus states on all interactive elements
- Keyboard navigation: Tab through form, Enter to submit
- Color not the only indicator (use text + badges + icons)
- Respects `prefers-reduced-motion`

---

## Error Handling

### Bid Rejection Codes (from Phase G)
- `INSUFFICIENT_PURSE`: "Your team doesn't have enough purse left"
- `INVALID_INCREMENT`: "Bid must be at least $X more than current bid"
- `PLAYER_NOT_ACTIVE`: "This player is no longer active"
- `AUCTION_PHASE_NOT_BIDDING`: "Bidding is paused (break in progress)"
- `BID_AFTER_DEADLINE`: "Time expired; bid not accepted"
- `DUPLICATE_BID`: "You've already placed this bid"
- `TEAM_NOT_IN_ROOM`: "Your team is not in this auction"

### UI Error States
- Inline error message in red below bid input
- Error auto-clears when user edits input
- Toast notification for critical errors (network, auth)
- Reconnection banner if socket disconnects

### Loading States
- "Placing bid..." on button during submission
- Spinner on form during reconnection
- "Loading auction..." on initial page load

---

## State Management

### Local (React hooks)
- Bid input value, error message
- Bid history (last 10 bids)
- Form submission state

### Global (Phase I context or Redux, if chosen)
- Current player info
- Current auction state (phase, teams, purse, etc.)
- Presence info (who is online)
- Break status

### Persistence
- None; all state fetched from server on reconnect

---

## Testing

### Unit Tests
- BidPlacementForm: validation, submission, error display
- PlayerIntroduction: formatting, edge cases (no leading team, etc.)
- TeamStandings: sorting, display, responsive
- RealTimeStats: countdown display, color changes

### Integration Tests
- Place bid flow: form → API call → event received → UI update
- Bid rejection flow: validation → error display
- Reconnection: state fetch → event subscription
- Break transition: phase change → screen overlay

### E2E Tests (if feasible)
- User places bid, sees acceptance in real-time
- Break triggers, user sees break screen
- Spectator joins, sees read-only UI
- Mobile responsive layout

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

---

## Performance Considerations

- Bid history: virtual scroll if >50 bids
- Team standings: memoized to avoid re-renders on every event
- Bid form: debounce input validation, avoid re-fetching on keystroke
- Real-time updates: batch events if >5/second

---

## Acceptance Criteria

- [ ] BidPlacementForm works with valid and invalid bids
- [ ] Player introduction displays correctly
- [ ] Team standings update in real-time
- [ ] Bid history scrolls and displays recent bids
- [ ] Break transition hides bidding form, shows break screen
- [ ] Reconnection fetches state and resumes events
- [ ] Mobile layout is responsive and functional
- [ ] All errors display clearly with suggestions
- [ ] Keyboard navigation works (Tab, Enter)
- [ ] No `any` types in TypeScript
- [ ] Tests passing: >80% coverage on new components
- [ ] Accessibility: WCAG AA compliant

---

## Files to Create/Modify

### New Components
- `apps/web/src/components/auction/BidPlacementForm.tsx`
- `apps/web/src/components/auction/BidHistory.tsx`
- `apps/web/src/components/auction/PlayerIntroduction.tsx`
- `apps/web/src/components/auction/TeamStandings.tsx`
- `apps/web/src/components/auction/RealTimeStats.tsx`
- `apps/web/src/components/auction/BidPlacementError.tsx`

### New Hooks
- `apps/web/src/hooks/useBidPlacement.ts` (form state + API)
- `apps/web/src/hooks/useAuctionRealTime.ts` (Phase I integration)
- `apps/web/src/hooks/useAuctionState.ts` (global state fetch + cache)

### Modify
- `apps/web/src/app/auctions/[id]/page.tsx` (main auction room page)
- Phase I context/provider to export room state

### Tests
- `apps/web/src/components/auction/__tests__/BidPlacementForm.spec.tsx`
- `apps/web/src/components/auction/__tests__/PlayerIntroduction.spec.tsx`
- `apps/web/src/components/auction/__tests__/TeamStandings.spec.tsx`
- `apps/web/src/hooks/__tests__/useBidPlacement.spec.ts`

---

## Dependencies

- Phase I: Real-time events (break, squad, presence)
- Phase H: Break state machine (BREAK phase)
- Phase G: Bid validation and acceptance
- Phase F: Room structure and team allocation
- Tailwind CSS (styling)
- React hooks (state management)
- Socket.IO client (Phase I integration)

---

## Success Criteria

A user can:
1. Join a live auction room
2. See players introduced one by one
3. Place valid bids in real-time
4. See bid rejections and error messages
5. Watch team purse and squad progress update in real-time
6. Experience breaks with full squad/progress overlay
7. Reconnect and resume bidding without duplicate bids
8. Use the interface on mobile, tablet, and desktop
9. Navigate via keyboard and read all text clearly

---

## Notes

- **No Fake Data**: All UI reflects real auction state from Phase I events
- **Backend Authority**: All bid validation happens on server (Phase G); client only displays result
- **Idempotency**: Client-side idempotency keys prevent duplicate bids on reconnect
- **Responsive First**: Design mobile-first, then enhance for larger screens
- **Accessibility**: WCAG AA compliance required (color + text, keyboard nav, focus states)
