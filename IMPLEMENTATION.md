# Under The Hammer — Implementation Plan

**Status:** Execution baseline  
**Version:** 1.0  
**Date:** 2026-11-03

This document turns the PRD and architecture into an implementation sequence. It is not permission to skip product decisions or replace server-side rules with frontend behavior.

---

## 1. Recommended stack

| Layer | Technology |
|---|---|
| Web | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Motion | GSAP and Framer Motion |
| API | NestJS, TypeScript |
| ORM | Prisma |
| Database | PostgreSQL on Neon |
| Identity | AWS Cognito, Google federation |
| Real-time | Socket.IO |
| Coordination/cache | Redis |
| Object storage | AWS S3 |
| Initial payments | Safepay, behind provider adapter |
| Validation | Zod on frontend/shared boundaries; class-validator or Zod consistently in NestJS |
| Monorepo | pnpm + Turborepo |
| Testing | Vitest/Jest, Playwright, API integration tests |
| Observability | Structured logs, error tracking and metrics |

Do not mix multiple ORM layers or duplicate business validation across unrelated packages. The backend is authoritative.

## 2. Repository setup

```text
under-the-hammer/
├── apps/
│   ├── web/                       # Public site + authenticated auction UI
│   ├── admin/                     # Staff operations application
│   ├── api/                       # NestJS modular backend
│   └── worker/                    # Background jobs
├── services/
│   └── valuation/                 # Existing Python valuation logic, if retained
├── packages/
│   ├── contracts/                 # API and Socket.IO contracts
│   ├── database/                  # Prisma schema, migrations, seed tooling
│   ├── validation/                # Shared schemas
│   ├── ui/                        # Shared UI components
│   ├── config/                    # Shared lint/TS/build config
│   └── types/                     # Shared domain types
├── infrastructure/
│   ├── docker/
│   ├── aws/
│   └── deployment/
├── docs/
│   ├── PRD.md
│   ├── IMPLEMENTATION.md
│   ├── DESIGN.md
│   ├── AGENTS.md
│   ├── ARCHITECTURE.md
│   └── README.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

The admin app may initially be a protected route group within the web application if that reduces operational overhead, but keep its code, navigation and authorization boundaries distinct. A separate deployment can be introduced later.

## 3. Phase 0 — decisions and technical spikes

Before feature implementation, resolve or explicitly defer:
- Host subscription plans and entitlements.
- Exact paid tournament-entry scope.
- PSL preset rules for the target season.
- Bid increment boundary behavior.
- Five-bid break counter scope.
- Turn-based auction rules.
- Team-owner/spectator capacity and join cutoffs.
- Safepay checkout/webhook/refund capabilities.
- Cricket data/news providers and licensing.
- S3 upload quotas and logo moderation policy.

Technical spikes:
1. Cognito email/password + Google federation in local/staging.
2. Socket.IO deployment on the intended hosting platform.
3. Neon connection and migration strategy.
4. Safepay sandbox flow and webhook verification.
5. S3 presigned upload and server-side image validation.
6. Data provider coverage, terms and update cadence.

Deliverable: approved architecture decisions record (ADR) for each major choice.

## 4. Phase 1 — foundations

### Backend
- Initialize NestJS modules.
- Configure Prisma and Neon PostgreSQL.
- Add migrations and seed strategy.
- Integrate Cognito JWT verification.
- Create internal User and UserIdentity mapping.
- Add role/permission foundation.
- Add request validation, structured logging and global error handling.
- Add rate-limiting foundation.
- Add health/readiness endpoints.

### Frontend
- Initialize Next.js + TypeScript.
- Configure Tailwind, typography and design tokens.
- Build responsive global shell and navigation.
- Build Home, About, News, Live and Auction marketing routes.
- Build sign-in/sign-up/verification/recovery screens.
- Build profile dropdown with account, billing and sign-out entries.
- Build loading, error, empty and unauthorized states.

### Acceptance criteria
- A user can register with email/password.
- A user can verify email through Cognito.
- A user can sign in with Google.
- The API maps the identity to one internal user.
- Public pages work without authentication.
- Protected routes and API endpoints reject unauthenticated users.
- Navigation works at desktop, tablet and mobile sizes.

## 5. Phase 2 — player and team foundations

### Player domain
- Player entity and stable internal ID.
- Aliases and provider identifiers.
- Roles, nationality and category metadata.
- Player search and detail API.
- Statistics model with source and freshness metadata.
- Admin import/update tools.

### Team domain
- User-created team records.
- Team logo upload workflow through S3.
- Team color and identity settings.
- Team ownership and reuse rules.
- Asset moderation and takedown controls.

### Acceptance criteria
- A user can create a custom team.
- A user can upload and replace a permitted logo.
- Invalid file types and oversized files are rejected.
- Team records are normalized and linked to their creator.
- A team can be reused in multiple auctions without sharing auction purse state.

## 6. Phase 3 — room and tournament management

Implement:
- Tournament creation.
- Room creation.
- Public/private visibility.
- Room code and invitation lifecycle.
- Public discovery.
- Room capacity.
- Team-owner registration.
- Spectator registration.
- User-selected team allocation.
- Random team allocation.
- Custom team allocation.
- Host subscription entitlement check.
- Host participation setting.

### Acceptance criteria
- Public rooms appear in discovery only when configured as listed.
- Private rooms do not appear in public discovery.
- Valid private codes allow authorized entry.
- Invalid, expired or revoked codes fail safely.
- Public first-come-first-served team slots are reserved atomically.
- Spectator slots do not consume team-owner slots.
- Team assignment conflicts cannot occur.
- A user without host entitlement cannot create a hosted auction.

## 7. Phase 4 — auction engine before visual polish

Implement the domain engine as deterministic backend logic with unit and integration tests.

### Required capabilities
- Auction configuration snapshot.
- Player queue.
- Manual player selection.
- Automatic player draw.
- Host-controlled mode.
- System-automatic mode.
- Countdown format.
- Turn-based format.
- Bid increment brackets.
- Server-side deadline management.
- Break scheduling and adjustment.
- Pause/resume policy.
- Sold/unsold settlement.
- Purse ledger.
- Squad constraints.
- Event history and state versioning.

### Bid transaction requirements
- Validate user/team/room membership.
- Validate auction phase and deadline.
- Compute minimum bid on server.
- Lock relevant state or enforce optimistic version checks.
- Check purse and squad constraints.
- Persist bid and update high bid atomically.
- Persist ordered event.
- Broadcast only after commit.
- Return deterministic rejection codes.

### Settlement requirements
- Idempotent settlement.
- Atomic acquisition and purse debit.
- No partial roster/balance updates.
- Complete audit history.
- Recovery behavior after process restart.

### Acceptance criteria
- Concurrent bid tests cannot produce two winners.
- A client cannot bid after server deadline.
- A client cannot submit a below-minimum bid.
- A client cannot bid for another team's purse.
- A team cannot spend more than its available purse.
- Duplicate request retries do not create duplicate bids.
- Repeated settlement does not debit twice.
- Restart/reconnect restores the correct auction state.

## 8. Phase 5 — real-time room

Implement Socket.IO authentication and room authorization.

### Events
Client commands:
- `room:join`
- `room:leave`
- `bid:submit`
- `auction:host-action`
- `chat:send`
- `auction:request-snapshot`

Server events:
- `room:joined`
- `auction:state`
- `player:introduced`
- `bid:accepted`
- `bid:rejected`
- `auction:timer`
- `auction:break-started`
- `auction:break-updated`
- `player:sold`
- `player:unsold`
- `auction:paused`
- `auction:resumed`
- `auction:completed`
- `chat:message`
- `room:participant-updated`

Use shared TypeScript contracts. Every command must be validated and authorized by the server.

### Acceptance criteria
- All authorized users receive the same ordered auction events.
- Unrelated rooms cannot receive the events.
- Spectators cannot invoke bidding commands.
- Host-only actions are rejected for team owners.
- Reconnecting clients receive a fresh snapshot.
- Missing event sequences trigger resynchronization.
- Multiple API instances can broadcast through the configured Socket.IO adapter.

## 9. Phase 6 — auction frontend

Build the actual auction room, not just a static mockup.

### Components
- Auction stage
- Player card front/back
- Team table/panel
- Current user's highlighted team panel
- Other team panels
- Purse indicator
- Bid button and next-bid display
- Countdown
- Turn indicator
- Break overlay and break timer
- Squad requirement summary
- Room chat
- Host control panel
- Spectator mode
- Sold/unsold animation
- Acquisition ticket
- Reconnection and connection-quality indicator

### UI behavior
- Animate only confirmed server events.
- Show pending bid state while awaiting server confirmation.
- Do not optimistically display an unconfirmed bid as accepted.
- Respect reduced-motion settings.
- Keep bid controls usable on small screens.
- Provide clear error feedback for rejected bids.

### Acceptance criteria
- Team-owner view highlights their team.
- Spectator view is read-only.
- The same auction state is represented consistently across clients.
- Player card details are sourced from backend data.
- A bid button sends a command and waits for server confirmation.
- Sold card and squad update happen only after confirmed settlement.

## 10. Phase 7 — chat and breaks

Implement:
- Room-scoped text chat.
- Team-owner and spectator permissions.
- Message rate limits.
- Message moderation/reporting.
- Host mute/remove controls.
- Break countdown.
- Squad comparison during breaks.
- Configurable break duration and authorized live adjustment.
- Allowlisted external meeting links only if enabled.

Do not implement voice chat in this phase.

## 11. Phase 8 — subscription and payment

Implement provider-neutral payment interfaces first, then Safepay.

- Host subscription plans and entitlement service.
- Checkout creation.
- Webhook verification.
- Payment state machine.
- Subscription activation/expiry.
- Receipts and billing history.
- Admin payment lookup.
- Refund workflow.
- Reconciliation job.

Do not activate a subscription from a client redirect. Only verified provider events or server-side provider confirmation can activate it.

Paid tournament entry fees should be implemented only after product/legal decisions are approved and kept separate from host subscription billing.

## 12. Phase 9 — cricket information platform

Implement data-provider adapters and ingestion workers:
- Match schedule and live match state.
- Live score updates.
- Scorecards and statistics.
- Player profiles and career stats.
- News feed ingestion or editorial publishing.
- Source attribution and timestamps.
- Stale data indicators.
- Admin correction and moderation.

Do not publish a provider's data or publisher content until usage rights and attribution requirements are confirmed.

## 13. Phase 10 — admin application

Build admin functionality alongside the operational domains, not as an afterthought.

Minimum initial modules:
- User lookup and account status.
- Room and tournament lookup.
- Auction event inspection.
- Payment/subscription lookup.
- Support case queue.
- Moderation/report queue.
- Team/logo asset moderation.
- Notifications/announcements.
- Staff roles and granular permissions.
- Audit log viewer.
- Maintenance mode and feature flags.

Every mutation endpoint must enforce permissions and write an audit record. High-risk actions require confirmation and, where configured, a second approver.

## 14. Phase 11 — exports and sharing

- Server-confirmed roster snapshot.
- Team squad PNG.
- Multi-team auction summary PNG.
- Responsive export layouts.
- Shareable public result pages with privacy controls.
- Avoid exposing private room information in public images/URLs.

## 15. Testing strategy

### Unit tests
- Bid increment calculation.
- Purse calculations.
- Squad rule validation.
- Team allocation.
- Auction state transitions.
- Turn order.
- Break scheduling.
- Subscription entitlement.

### Integration tests
- Cognito token validation.
- Room access and invitation checks.
- Bid transaction concurrency.
- Settlement idempotency.
- Payment webhook processing.
- S3 upload validation.
- Admin permission enforcement.

### End-to-end tests
- Register, verify and sign in.
- Create custom team and upload logo.
- Host subscription check.
- Create public auction.
- Join as team owner.
- Join as spectator.
- Run countdown auction.
- Run turn-based auction.
- Run host-controlled auction.
- Run automatic auction.
- Reconnect during bidding.
- Complete auction and export squad.
- Admin handles a support/moderation/payment case.

### Load tests
- Multiple rooms active concurrently.
- Multiple spectators per room.
- Bid bursts near timer expiry.
- Socket reconnect bursts.
- Match-data ingestion under load.

## 16. Definition of done

A feature is not done merely because its page renders.

A feature is done when:
- Requirements are documented.
- Server-side authorization exists.
- Database constraints and migrations exist.
- Error and loading states exist.
- Unit/integration tests cover domain rules.
- Realtime events are permission-scoped where relevant.
- Admin/support operation exists where needed.
- Auditability exists for sensitive changes.
- Responsive and accessibility checks pass.
- Documentation is updated.

## 17. Recommended implementation order

1. Repository and infrastructure foundation.
2. Cognito identity and user profile.
3. Public marketing shell and navigation.
4. Player/team database and team-logo upload.
5. Tournament, room and membership.
6. Auction engine and financial invariants.
7. Real-time transport and reconnect.
8. Auction room frontend.
9. Chat, breaks and squad views.
10. Host subscription and Safepay.
11. Admin operations.
12. Cricket news/live/player-data integrations.
13. Exports and social sharing.
14. Spaces in a later release.

The auction engine and public website can be developed in parallel after the contracts and data model are agreed. Do not begin detailed auction-room animation before the server state and event contracts are stable.
