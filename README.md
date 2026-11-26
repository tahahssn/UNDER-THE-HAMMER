# Under The Hammer

A cricket information and multiplayer auction platform.

Under The Hammer combines year-round cricket information with a configurable, real-time multiplayer player auction experience. Users can create their own teams, upload team logos, host auctions through a subscription, join eligible auctions and spectate public or private rooms.

The initial market focus is Pakistan and PSL-style auctions. The platform is designed to expand to other competitions and international cricket.

---

## Product areas

### Public website
- Home
- About
- Cricket news
- Live cricket scores and matches
- Player directory and player profiles
- Auction marketing page
- Sign in and sign up

Public cricket information and marketing pages are accessible without an account.

### Auction platform
- Public and private rooms
- Human-host-controlled and system-automatic auctions
- Live countdown and turn-based formats
- User-selected, random and custom team allocation
- User-created teams and uploaded logos
- Configurable team purses and squad requirements
- Manual player selection or automatic player draw
- Real-time bidding and room-specific chat
- Team and spectator experiences
- Breaks, squad comparisons and downloadable squad graphics

Hosting an auction requires an active host subscription. Joining and participating can be free, subject to room configuration and capacity.

### Future areas
- Community Spaces with group text chat
- Additional cricket data products and APIs
- International payment providers
- Further cricket coverage and statistics
- Additional integrations, subject to rights and product approval

---

## Locked auction configuration

| Setting | Supported options |
|---|---|
| Visibility | Public / Private |
| Control | Human host / Automatic system |
| Format | Live countdown / Turn-based |
| Team allocation | User-selected / Random / Custom |
| Access model | Free / Paid private tournament |
| Spectators | Public / Restricted by code or invitation |
| Player selection | Manual / Automatic draw |
| Team count | Configurable |

These dimensions are independent and can be combined in one room.

## Technology direction

- React + TypeScript, with Next.js recommended for public SEO-friendly routes
- GSAP and Framer Motion
- NestJS backend
- PostgreSQL hosted on Neon
- Prisma ORM
- AWS Cognito for authentication and email verification
- Google sign-in through Cognito federation
- Socket.IO for real-time auction and chat
- Redis for coordination, caching and Socket.IO scaling
- AWS S3 for team logos and generated assets
- Safepay as the initial Pakistan payment-provider candidate, behind a provider-independent integration
- Python valuation component for the existing player valuation logic, if retained

The backend is authoritative for auction state, bids, timers, purse balances, squad state, permissions and payment entitlements.

## Repository structure

```text
under-the-hammer/
├── apps/
│   ├── web/
│   ├── admin/
│   ├── api/
│   └── worker/
├── services/
│   └── valuation/
├── packages/
│   ├── contracts/
│   ├── database/
│   ├── validation/
│   ├── ui/
│   ├── config/
│   └── types/
├── infrastructure/
├── docs/
└── README.md
```

## Socket.IO Real-Time Architecture

### Gateways

The backend provides three WebSocket gateways under the `/auctions` namespace for real-time room updates:

#### BreakGateway
Manages break state transitions with server-authoritative validation.

**Commands** (host-only):
- `break:start` — Start a break with duration in seconds
- `break:adjust` — Extend/reduce break duration
- `break:resume` — Resume auction after break

**Events** (read-only broadcast):
- `break:started` — Break has begun
- `break:updated` — Break duration adjusted
- `break:ended` — Break concluded

#### ChatGateway
Manages real-time room chat with moderation and rate limiting.

**Commands**:
- `chat:send` — Send a message (10 messages per 60 seconds)
- `chat:request-history` — Get message history (limit: 50 most recent)

**Events**:
- `chat:message` — Incoming message broadcast
- `chat:history` — History response with moderation status

**Moderation** (host-only):
- `chat:mute-user` — Mute a user in the room
- `chat:unmute-user` — Unmute a user

#### PresenceGateway
Tracks and broadcasts room participant presence.

**Commands**:
- `room:join` — Participant joins room
- `room:leave` — Participant leaves room
- `room:request-presence` — Get current participant list

**Events**:
- `room:presence` — Current participant list (on join or reconnect)
- `room:presence:update` — Individual participant connection state change

### Room Isolation

All Socket.IO channels are **room-scoped** and **server-determined**:
- Break events use `auction:{auctionId}` channel
- Chat messages broadcast to `room:{roomId}` channel
- Presence updates broadcast to `room:{roomId}` channel
- Clients cannot select arbitrary channels; membership is validated server-side

### Authentication

All socket connections require JWT Bearer token in handshake:
```javascript
const socket = io(url, {
  auth: {
    token: jwtToken // Required; connection refused without valid token
  }
});
```

Invalid tokens disconnect immediately. The server extracts the authenticated user ID from the JWT `sub` claim.

### Error Handling

Standard error response format:
```typescript
{
  code: 'ERROR_CODE',
  message?: 'Human-readable error message'
}
```

Common codes: `UNAUTHORIZED`, `NOT_ROOM_MEMBER`, `RATE_LIMITED`, `USER_MUTED`, `INVALID_AUCTION_CONFIG`

### Testing

Integration tests are provided in `apps/api/src/auctions/gateways/__tests__/`:
- `break.gateway.spec.ts` — Break command authorization and event broadcasting
- `chat.gateway.spec.ts` — Chat message persistence, rate limiting, moderation
- `presence.gateway.spec.ts` — Presence tracking, room isolation

Frontend hook tests in `apps/web/src/hooks/__tests__/`:
- `useRoomSocket.spec.ts` — Socket join/leave lifecycle, reconnection recovery
- `useRoomChat.spec.ts` — Message sending, optimistic UI, deduplication
- `usePresence.spec.ts` — Presence updates, active bidder tracking

Run tests: `npm run test` in `apps/api/` or `apps/web/`

---

## Documentation

| File | Purpose |
|---|---|
| `PRD.md` | Product vision, features, user journeys, scope and unresolved decisions |
| `ARCHITECTURE.md` | System boundaries, data model, auction engine, real-time, integrations and security |
| `IMPLEMENTATION.md` | Phased build plan, acceptance criteria and testing |
| `DESIGN.md` | Visual direction, navigation, auction room UX, responsive behavior and components |
| `AGENTS.md` | Mandatory instructions for coding agents and contributors |

## Local development

Exact commands and environment variables should be added after the repository is initialized and dependency versions are selected.

Expected local dependencies:
- Node.js LTS version compatible with the selected Next.js/NestJS versions
- pnpm
- PostgreSQL or a development Neon branch
- Redis
- AWS Cognito development app client
- S3 development bucket or compatible local object-storage setup
- Safepay sandbox credentials when payment work begins

Never commit `.env` files, AWS credentials, Cognito secrets, payment keys or production data.

## Product and engineering rules

1. Do not restrict users to official PSL teams.
2. Do not assume every auction has eight teams.
3. Hosting is subscription-gated; joining is not automatically paid.
4. Do not treat host subscription and tournament entry fee as the same payment.
5. Do not trust the browser to decide a bid, timer, winner or purse.
6. Use relational entities and foreign keys for core data.
7. Preserve auction and financial history.
8. Use licensed or otherwise permitted cricket/news data sources.
9. Do not stream matches without distribution rights.
10. Build admin operations for routine support, moderation and billing tasks.
11. Spaces are a later release, not an initial launch blocker.

## Current status

This repository specification establishes the product and technical direction. It does not claim that the application, integrations, database schema or deployment have already been implemented.

Before implementation, resolve the open decisions listed in `PRD.md`, then build in the sequence defined in `IMPLEMENTATION.md`.
