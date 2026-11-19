# Under The Hammer — Agent and Contributor Instructions

This file defines mandatory working rules for coding agents and human contributors working in this repository.

---

## 1. Product context

Under The Hammer is a cricket information and multiplayer auction platform.

Core product areas:
- Public Home and About pages
- Cricket News
- Live cricket scores and match information
- Player directory and player profiles/statistics
- Auction marketing and authenticated auction workspace
- Public/private multiplayer auctions
- User-created teams and uploaded logos
- Host subscriptions
- Room-scoped real-time bidding and chat
- Squad management and exports
- Admin/support/moderation/billing operations
- Later: community Spaces

Do not reduce the product to a PSL-only application. PSL is an initial market and preset, not a restriction on teams, players, competitions or tournament configuration.

## 2. Locked product decisions

These decisions are approved and must not be silently changed:

| Area | Decision |
|---|---|
| Room visibility | Public and private |
| Auction control | Human-host-controlled and system-automatic |
| Auction format | Live countdown and turn-based |
| Team allocation | User-selected, random and custom |
| Platform access | Free and paid private tournaments |
| Spectator access | Public and code/invitation restricted |
| Team identity | Users/organizers can create teams and upload logos |
| Host eligibility | Hosting requires an active subscription |
| Participation | Joining and participating can be free, subject to room configuration |
| Host participation | Host may also participate as a team owner if enabled |
| Player selection | Host can select manually or system can draw automatically |
| Team count | Configurable; eight is a common initial preset, not a hard limit |
| Chat | Real-time room-specific text chat; no native voice chat initially |
| Spaces | Planned later; do not include in initial release scope |

Do not reintroduce mandatory official PSL teams. Do not make every room eight teams by assumption.

## 3. Source-of-truth documents

Before changing product behavior, read:
- `README.md`
- `PRD.md`
- `ARCHITECTURE.md`
- `IMPLEMENTATION.md`
- `DESIGN.md`

If requirements conflict:
1. Locked decisions in `AGENTS.md` and approved PRD decisions take precedence over old implementation assumptions.
2. Architecture must implement the PRD, not redefine it.
3. Implementation details must not silently change product behavior.
4. If a genuine conflict exists, stop and document it as an open decision rather than guessing.

Update relevant documents when approved scope changes.

## 4. Mandatory engineering principles

### Backend authority
The backend is authoritative for:
- Auction state
- Bid validity and ordering
- Timer deadlines
- Winning bids
- Player settlement
- Purse balances
- Squad membership
- Team allocation
- Host subscription entitlements
- Room access and permissions
- Payment status

Never trust client-supplied values for these decisions.

### Relational database
Use PostgreSQL and Prisma with:
- Primary keys
- Foreign keys
- Unique constraints
- Appropriate indexes
- Transactions for financial and auction operations

Do not put the whole product into one table or one unstructured JSON field. Use JSON/JSONB only for genuinely flexible configuration or provider payloads.

### Domain boundaries
Keep modules separate:
- Identity/users
- Teams/files
- Players/statistics
- News/live cricket
- Tournaments/rooms
- Auction/bidding/events
- Squads/purse ledger
- Chat
- Subscriptions/payments
- Notifications
- Support/moderation/admin
- Audit

Avoid circular module dependencies and direct writes into another module's tables without an explicit service boundary.

### Real-time correctness
- Authenticate sockets.
- Authorize room joins on the server.
- Never allow arbitrary client-selected socket channels.
- Broadcast accepted events only after durable commit.
- Use event sequence/state version.
- Recover state after reconnect.
- Isolate room and role-specific events.
- Spectators are read-only unless a room explicitly grants a separate permission.

### Financial correctness
- Never use floating-point for money.
- Use a consistent integer minor-unit or exact decimal strategy.
- Keep a purse ledger.
- Keep subscription and tournament-entry payments separate.
- Verify payment webhooks.
- Make callbacks and settlement idempotent.
- Use compensating adjustments instead of rewriting financial history.

### File safety
- Do not accept arbitrary remote logo URLs.
- Validate file signature, MIME, dimensions and size.
- Use S3 with least-privilege permissions.
- Do not expose AWS credentials to clients.
- Store object keys and metadata in the database.
- Include moderation/takedown capability.

### Data rights
- Do not scrape or republish copyrighted news or live sports data without permission.
- Record data provider and freshness.
- Show attribution where required.
- Do not add live streaming or rebroadcasting without distribution rights.
- Do not imply official league/franchise affiliation without authorization.

## 5. Coding standards

- TypeScript strict mode.
- Avoid `any`; explain exceptional use.
- Validate all external input.
- Keep business logic out of React components and Socket.IO handlers.
- Use services/use cases for domain operations.
- Use explicit DTOs and shared contracts.
- Use consistent error codes for expected business rejections.
- Keep functions focused and modules cohesive.
- Avoid unnecessary abstraction and premature microservices.
- Do not duplicate calculations in frontend and backend as competing sources of truth.
- Frontend may calculate display previews, but backend revalidates all business rules.
- Keep secrets in environment/secret management, never source control.
- Do not commit real credentials, personal data or production dumps.

## 6. Frontend rules

- Use React + TypeScript; Next.js is the recommended SEO-capable application framework.
- Use GSAP and Framer Motion intentionally, not for every interaction.
- Keep public pages accessible without sign-in.
- Auction marketing page is distinct from a live auction room.
- Signed-in users should reach the auction workspace without an unnecessary generic dashboard.
- Profile dropdown contains account, billing, auction navigation and sign-out.
- Build responsive states for desktop, tablet and mobile.
- Respect reduced motion.
- Never display an unconfirmed bid as accepted.
- Do not hard-code eight team panels into the layout.
- User team logos and colors must be dynamic.

## 7. Auction rules

Represent these as separate settings:
- Control mode: host-controlled / system-automatic
- Format: live countdown / turn-based
- Player selection: manual / automatic draw
- Host participates: enabled / disabled

A room can combine these modes. Do not collapse them into one enum.

Host-configurable settings include:
- Team count and team assignment
- Team purse
- Player categories and category prices
- Bid increment brackets
- Countdown/turn durations
- Break duration and adjustment limits
- Squad size and composition requirements
- Player queue and draw pool
- Spectator permissions
- Chat and external meeting-link policy

The product-provided sample bid brackets are:
- Below PKR 1 crore: +PKR 10 lakh
- PKR 1 crore to below PKR 2.2 crore: +PKR 15 lakh
- PKR 2.2 crore to PKR 4 crore: +PKR 20 lakh
- Above PKR 4 crore: +PKR 25 lakh

The exact PKR 4 crore boundary must be finalized. Do not label this as an official PSL rule until verified for the relevant season.

Break proposal: after every five accepted bids, with configurable duration (suggested initial 1–3 minutes). The counter scope must be configurable or explicitly resolved; do not silently assume.

## 8. Admin requirements

Routine operational work must be possible through the admin application, not manual production database edits.

Build granular permissions and staff roles for:
- Super administrator
- Administrator
- Support
- Moderator
- Finance/billing
- Content editor
- Read-only auditor

Every sensitive action must:
- Check staff permission server-side.
- Validate target state.
- Require a reason where appropriate.
- Require confirmation or second approval when configured.
- Write an audit event.

Never silently edit settled bids, acquisition records or purse ledger history.

## 9. Testing requirements

For every feature:
- Unit test domain rules.
- Integration test database behavior and authorization.
- E2E test the user journey.
- Test failure and retry paths.
- Test permission boundaries.
- Test mobile/responsive behavior where relevant.

Auction-specific mandatory tests:
- Simultaneous bid race.
- Bid at/after deadline.
- Invalid increment.
- Insufficient purse.
- Unauthorized team bid.
- Duplicate idempotency key.
- Settlement retry.
- Server restart/reconnect.
- Spectator attempts to bid.
- Cross-room event isolation.
- Host subscription expired.
- Break adjustment permissions.

## 10. Agent workflow

Before implementation:
1. Read the relevant docs and existing code.
2. Identify exact files and modules affected.
3. State assumptions and unresolved requirements.
4. Propose the smallest coherent implementation plan.
5. Preserve existing working behavior unless change is requested.

During implementation:
1. Implement backend contracts and domain rules first for stateful features.
2. Add migrations and tests with the feature.
3. Implement frontend against real contracts.
4. Add loading, empty, error, permission and reconnect states.
5. Update documentation.

Before completion:
1. Run relevant tests, typecheck and lint.
2. Review authorization and data exposure.
3. Verify no secret or credential was added.
4. Summarize files changed and behavior implemented.
5. List unresolved items honestly.

## 11. Prohibited shortcuts

- No fake/demo/test data in production-facing features unless explicitly requested.
- No random winner selection in real multiplayer auctions.
- No client-authoritative auction timers or purse balances.
- No hard-coded official team requirement.
- No hard-coded eight-team assumption.
- No payment success inferred from a browser redirect.
- No direct admin database mutation as the normal support workflow.
- No unlicensed live streaming or article republishing.
- No arbitrary external meeting embeds.
- No ZIP/package delivery unless the product owner explicitly requests it.
- Do not replace the approved stack or architecture without documenting the reason and obtaining approval.
