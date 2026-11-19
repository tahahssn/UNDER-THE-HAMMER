# Under The Hammer — One-Go End-to-End Implementation Plan

**Document type:** Master execution plan for the coding agent  
**Status:** Execution instruction  
**Version:** 1.0  
**Date:** 2026-11-13

> **Purpose:** Build the complete Under The Hammer application from repository foundation through backend, database, authentication, public frontend, real-time auctions, payments, cricket information, administration, testing and deployment. This is the single execution plan. It does not replace the six approved product documents.

---

# 0. Non-negotiable instruction to the coding agent

Before writing or changing code, read all six files in full:

1. `PRD.md`
2. `IMPLEMENTATION.md`
3. `DESIGN.md`
4. `AGENTS.md`
5. `README.md`
6. `ARCHITECTURE.md`

These six documents are the project's approved source of truth. **Follow them. Do not reinterpret, simplify, override, silently amend, or contradict them.**

This master plan tells you how to execute the work. The six documents tell you what the product is, what it must do, how it should behave, and which engineering rules apply.

## 0.1 Authority and conflict rules

- Treat the six files as a required reading set, not optional background.
- Follow every locked product decision recorded in them.
- `AGENTS.md` governs coding-agent behavior and engineering constraints.
- `PRD.md` governs product scope, user journeys, capabilities and unresolved product decisions.
- `ARCHITECTURE.md` governs system boundaries, data ownership, realtime behavior, integrations and security.
- `DESIGN.md` governs visual and interaction direction.
- `IMPLEMENTATION.md` governs the implementation phases, acceptance criteria and test expectations.
- `README.md` provides the project overview and repository entry point.
- This master plan sequences and operationalizes those requirements. Where a detail here conflicts with an approved source document, the approved source document wins.
- Never invent an answer for an open decision. Record it in a decision log and implement the surrounding capability in a configurable way where possible.
- Never make a product-scope change because it is easier to code.
- If the repository already contains working code, inspect it first and preserve useful behavior. Do not blindly replace the repository or delete existing work.

## 0.2 Execution mode: one complete delivery, built in verified phases

Work through the phases below in order and continue through the full application. Do not stop after creating a monorepo, a landing page, database models, mock auction UI or a Socket.IO demo.

A phase is complete only when its backend, frontend (where applicable), migrations, permissions, error states, tests, documentation and acceptance checks are complete.

Do not ask for approval after every routine implementation phase. Continue through decisions that are already defined. Stop only for a genuinely blocking external dependency or a product decision that the six source files explicitly leave unresolved and that cannot safely be represented as configuration.

When blocked:
1. Complete all independent work.
2. Do not fabricate credentials, provider responses, legal permissions, prices or rules.
3. Implement a provider interface, configuration field, disabled state or documented integration boundary where appropriate.
4. Record the blocker, its impact and the exact information needed.
5. Continue with all other work.

Do not claim a feature is production-ready merely because a page or endpoint exists.

---

# 1. Product outcome

Build Under The Hammer as a year-round cricket platform with a configurable multiplayer cricket auction product as its signature feature.

The complete product experience includes:

- Public Home and About pages.
- Public cricket News.
- Public Live matches and scores.
- Player directory and player profiles/statistics.
- Auction marketing page.
- Email/password and Google authentication through AWS Cognito.
- Signed-in auction workspace without an unnecessary generic dashboard.
- User-created teams, custom identity and uploaded logos.
- Subscription-gated auction hosting.
- Public and private auction rooms.
- Manual or automatic player selection.
- Human-host-controlled and system-automatic auctions.
- Live countdown and turn-based bidding.
- Configurable team allocation and squad rules.
- Real-time bidding, room-specific chat, breaks and spectator experience.
- Team purse, squads, requirements and downloadable squad graphics.
- Account settings, billing, notifications and user history.
- Dedicated admin operations for users, support, moderation, rooms, auctions, payments, content, notifications, staff permissions and system status.
- A designed extension path for Spaces, international payments, APIs and additional cricket capabilities.

**Do not restrict the product to official PSL teams or to eight teams.** Users and organizers create teams and upload logos they have permission to use. The platform supports a PSL-style preset, while keeping team count, squad rules, purse, player categories and auction rules configurable.

---

# 2. Required technical direction

Follow the selected architecture in the six source documents. The implementation baseline is:

| Area | Direction |
|---|---|
| Web frontend | Next.js, React and TypeScript |
| UI styling | Tailwind CSS and shared design tokens |
| Motion | GSAP for orchestrated auction sequences; Framer Motion for component transitions |
| Backend | NestJS and TypeScript |
| ORM | Prisma |
| Database | PostgreSQL hosted on Neon |
| Authentication | AWS Cognito |
| Social login | Google federation through Cognito |
| Realtime | Socket.IO / WebSocket |
| Realtime coordination | Redis when needed for adapter, coordination and rate limiting |
| Object storage | AWS S3 |
| Initial payment provider | Safepay behind a provider-independent adapter |
| Background work | Dedicated worker/queue process |
| Existing valuation logic | Preserve Python logic as a separate component or service where useful |
| Monorepo | pnpm + Turborepo |
| Testing | Unit, integration, end-to-end and concurrency/load tests |

Do not add unnecessary microservices. Begin with a modular NestJS backend and separate worker process. Keep boundaries clear so a component can be extracted later when scale or deployment requirements justify it.

Do not use two competing frontend frameworks, ORMs, authentication systems or database sources of truth.

---

# 3. Repository and delivery structure

Create or normalize the repository into a maintainable monorepo. Adapt paths only when the existing repository already has an approved structure; document any deliberate deviation.

```text
under-the-hammer/
├── apps/
│   ├── web/                    # Public website + signed-in user experience
│   ├── admin/                  # Staff operations UI
│   ├── api/                    # NestJS modular API + Socket.IO gateway
│   └── worker/                 # Background jobs and ingestion
├── services/
│   └── valuation/              # Existing Python valuation component, if retained
├── packages/
│   ├── database/               # Prisma schema, migrations and seed tooling
│   ├── contracts/              # Shared REST and realtime contracts
│   ├── validation/             # Shared input schemas where appropriate
│   ├── ui/                     # Shared frontend components
│   ├── config/                 # Shared tooling configuration
│   └── types/                  # Shared domain types
├── infrastructure/
│   ├── docker/
│   ├── aws/
│   ├── deployment/
│   └── monitoring/
├── docs/
│   ├── decisions/
│   ├── runbooks/
│   └── api/
├── PRD.md
├── IMPLEMENTATION.md
├── DESIGN.md
├── AGENTS.md
├── README.md
├── ARCHITECTURE.md
└── ONE_GO_IMPLEMENTATION_PLAN.md
```

The six source files must remain at the repository root unless the project owner explicitly changes that convention. Do not rename them, remove them, or move their content into this plan.

## 3.1 Initial repository tasks

- Inspect the current repository, installed dependencies and existing functionality.
- Identify reusable code, especially player data, valuation calculations and current player search.
- Preserve useful existing logic and document migrations from old code.
- Set up pnpm workspace and Turborepo task pipeline.
- Configure TypeScript strict mode, ESLint, formatting and consistent path aliases.
- Add `.env.example` with variable names and descriptions only.
- Add `.gitignore` for secrets, build output, local databases and generated files.
- Add local development orchestration for PostgreSQL-compatible development, Redis and required services.
- Add CI checks for install, lint, typecheck, tests, Prisma validation and production builds.
- Ensure all six approved documents are in the repository and readable by the coding agent.

Never put real credentials in source control or documentation.

---

# 4. Phase A — decisions register and repository audit

Before implementation, create `docs/decisions/DECISIONS.md`.

Copy the unresolved items from `PRD.md` into the register without pretending they are resolved. At minimum, track:

- Host subscription plans, limits, prices and billing period.
- Whether tournament entry fees are part of the first payment release.
- Verified rules for any PSL season preset.
- Exact bid increment bracket boundary behavior, including PKR 4 crore.
- Whether the five-bid break counter is per player or across the auction.
- Turn-based bid/pass/re-entry and close rules.
- Late team-owner joining policy.
- Host/team-owner participation conditions.
- Spectator chat default.
- Room/team/spectator capacity by plan.
- Cricket news and live-data providers, rights and attribution.
- Safepay checkout, webhook, settlement and refund capabilities.
- Logo upload limits, retention and moderation policy.
- Live-room snapshot sharing policy.

For each decision, record:
- ID
- Question
- Why it affects implementation
- Current status
- Owner
- Decision date
- Approved answer or explicit deferral

The agent must not choose legal, financial or competition rules by guessing.

## 4.1 Repository audit output

Create `docs/REPOSITORY_AUDIT.md` with:
- Existing files and apps.
- Reusable components.
- Existing data sources and formats.
- Current dependency and runtime versions.
- Existing tests.
- Secrets/configuration gaps.
- Proposed migrations from the existing implementation.
- Any deviations from the expected monorepo structure.

Do not delete existing source files until their purpose and replacement have been verified.

**Gate A:** The repository builds in its current state or known existing failures are documented; the six source files are present; the decision register exists; the target structure is agreed.

---

# 5. Phase B — backend foundation and database first

Build the backend foundation before implementing auction UI behavior.

## 5.1 NestJS application foundation

Implement:
- Global configuration module with validated environment variables.
- Prisma module and database lifecycle handling.
- Health and readiness endpoints.
- Request validation and serialization.
- Standard response/error conventions.
- Structured logging with request/correlation IDs.
- Global exception handling.
- Rate-limiting foundation.
- API versioning.
- CORS and security headers.
- OpenAPI/Swagger documentation for internal development.
- Readiness checks for database, Redis and critical providers.
- Background-worker integration boundary.

Keep controllers thin. Put business rules in domain/application services, not controllers, Socket.IO listeners or React components.

## 5.2 Normalized database implementation

Use Prisma with PostgreSQL. Build normalized relational entities with primary keys, foreign keys, unique constraints, indexes and explicit delete/update policies.

The data model must cover these domains:

### Identity and users
- User
- UserIdentity
- UserProfile / user settings
- UserSession metadata only where needed by the chosen Cognito flow
- UserNotificationPreference

Cognito subject is stored as a stable external identity. Internal `User.id` is the platform primary key. Email is not the primary key.

### Staff and permissions
- StaffRole
- Permission
- StaffRolePermission
- StaffUserRole
- StaffActionApproval where required

Global staff roles are distinct from auction-room roles.

### Teams and assets
- Team
- TeamMember or creator relationship where the product requires it
- TeamAsset
- FileAsset
- AssetModerationCase

A global reusable team identity must be separate from an auction-specific team instance. Logo files are stored in S3; database records store object keys and metadata, not arbitrary user-provided remote URLs.

### Players and cricket data
- Player
- PlayerAlias
- PlayerSourceIdentifier
- PlayerNationality / relevant normalized reference entities
- PlayerRole
- PlayerCategory
- PlayerStatistic
- PlayerTeamHistory
- Competition
- Match
- MatchTeam / innings / scorecard entities as supported by the chosen data provider
- DataProvider
- DataSyncRun / data freshness metadata

Use stable internal IDs and store provider-specific identifiers separately. Do not assume every provider has the same schema.

### News
- NewsSource
- NewsArticle
- NewsCategory
- NewsTag
- EditorialStatus / moderation metadata

Store permitted metadata, excerpts and canonical source links. Do not store or redistribute full article text or protected imagery unless rights permit it.

### Tournaments and rooms
- Tournament
- TournamentMember
- AuctionRoom
- RoomMember
- RoomInvitation
- RoomAccessPolicy
- RoomSettings / versioned configuration
- RoomBan / moderation state as needed

Room visibility and spectator access are separate concepts.

### Auction
- Auction
- AuctionConfigurationSnapshot
- AuctionPlayer
- AuctionPhase / state representation
- AuctionEvent
- Bid
- PlayerAcquisition
- AuctionHostAction
- AuctionTurn / turn action for turn-based format
- AuctionBreak
- AuctionParticipantConnection or presence data where appropriate

Preserve event ordering and settled history. Do not use an unbounded JSON field as the only record of bids, acquisitions or state transitions.

### Teams within auctions and squads
- AuctionTeam
- TeamOwner
- TeamPurseTransaction
- TeamSquad / acquisition relationship
- SquadRule
- SquadRequirementProgress

An `AuctionTeam` represents a team participating in a particular auction. It owns its auction-specific purse and squad state; it is not the reusable global `Team` record.

### Chat and external links
- RoomChatMessage
- ChatModerationAction
- RoomExternalLink
- MessageReport

Chat is room-scoped. External meeting links must be stored only when room policy enables them and the provider is allowlisted.

### Subscriptions and payments
- SubscriptionPlan
- Subscription
- SubscriptionEntitlement
- PaymentProviderAccount/config metadata (never store provider secrets here)
- Payment
- ProviderWebhookEvent
- Refund
- Invoice/receipt reference
- FinancialLedgerEntry

Host subscription and any future tournament-entry payment must remain separate commercial records.

### Notifications and support
- Notification
- NotificationDelivery
- SupportCase
- SupportCaseMessage
- UserReport
- Appeal
- Announcement
- MaintenanceNotice

### Administration and audit
- AuditLog
- AdminAction
- AdminActionApproval
- FeatureFlag
- SystemSetting
- ProviderStatus / operational incident record

Do not over-normalize transient UI state. Do normalize users, identities, teams, team ownership, auction instances, bids, acquisitions, payment records and all financial ledgers.

## 5.3 Database constraints and integrity

Implement:
- Unique Cognito subject per identity provider.
- Unique usernames/handles according to product policy.
- Unique team allocation per auction where required.
- One active owner assignment per auction team unless a documented mode permits multiple owners.
- Referential integrity for bids and acquisitions.
- One winning acquisition per auction player.
- Idempotency uniqueness for bid commands and payment events.
- No negative purse balance.
- No duplicate squad acquisition.
- Valid auction phase/version transitions.
- Foreign keys for all durable relationships.
- Indexes for room discovery, membership, player search, auction event sequence, user history and payment lookup.

Use integer minor units or exact decimal representation for money. Never use JavaScript floating-point arithmetic as the financial source of truth.

## 5.4 Migrations and seed data

- Create versioned Prisma migrations.
- Never use `db push` as the production migration strategy.
- Provide development-only seed scripts for local testing.
- Clearly label all demo records as development data.
- Do not seed fictional production users, fake payment success, fake match scores or fake news into production.
- Keep player imports repeatable and idempotent.
- Provide rollback/restore procedures appropriate to the database migration.

**Gate B:** Database migrations apply cleanly; schema is validated; constraints and relations are tested; app can start and connect; no production business logic relies on unstructured JSON as its only state.

---

# 6. Phase C — Cognito authentication and authorization

Implement authentication before protected product features.

## 6.1 Cognito

Implement:
- Email/password registration.
- Email verification.
- Sign-in.
- Forgot password and reset.
- Google sign-in/sign-up through Cognito federation.
- Token refresh/session lifecycle.
- Sign-out.
- Verification resend flow.
- Clear handling for unverified and disabled accounts.

The backend must verify Cognito JWT signature, issuer, audience/client, token use and expiry. Never accept user identity from a frontend-supplied ID or email.

Choose one coherent browser token/session strategy. Prefer secure HTTP-only cookies when supported by the flow, with CSRF protection for state-changing operations. Do not store long-lived tokens in localStorage.

## 6.2 Application identity

On successful identity callback:
- Find or create internal User.
- Link the Cognito subject in UserIdentity.
- Synchronize only approved profile attributes.
- Do not create duplicate users when email changes.
- Handle Google/email identity linking safely.

## 6.3 Authorization

Implement:
- Global user account states.
- Staff RBAC with granular permissions.
- Tournament membership roles.
- Auction room roles: host, team owner, spectator and any explicitly approved role.
- Resource-scoped authorization for every protected operation.
- Server-side entitlement checks.

A person can have different roles in different rooms. A spectator cannot bid. A team owner cannot perform host actions. A host cannot automatically bid unless the host-participation setting grants a separate team-owner assignment.

## 6.4 Frontend authentication

Build:
- Sign up.
- Sign in.
- Verify email.
- Resend verification.
- Forgot/reset password.
- Google sign-in.
- Session loading and expiry states.
- Unauthorized/forbidden screens.
- Account dropdown and sign out.

**Gate C:** Email and Google authentication work in configured development/staging Cognito; protected API operations reject invalid tokens; identity linking cannot create duplicates; room and staff role checks are tested.

---

# 7. Phase D — public website and product navigation

Build the public product before the live auction UI. Follow `DESIGN.md`; do not substitute a generic template.

## 7.1 Global shell

Implement:
- Responsive header/navigation.
- Brand identity.
- Footer.
- Search entry points as product scope allows.
- Sign-in/sign-up actions for signed-out visitors.
- User avatar dropdown for signed-in users.
- Responsive mobile navigation.
- Loading, empty, error and offline states.

Navigation destinations:
- Home
- About
- News
- Live
- Auction

The Auction nav item opens the Auction marketing page, not a live auction room.

## 7.2 Home page

Build complete responsive sections:
- Brand/product introduction.
- Cricket information preview.
- Live match preview.
- Latest news.
- Player discovery preview.
- Auction feature explanation and CTA.
- Footer/legal/support links.

Do not invent claims such as official partnerships, licensed coverage or guaranteed global data completeness.

## 7.3 About page

Explain:
- Product mission.
- Cricket platform direction.
- Auction product.
- Team/user-created team concept.
- Future direction.
- Non-affiliation / rights language where appropriate.

## 7.4 Auction marketing page

Explain:
- What an auction room is.
- How users host, join and spectate.
- Host subscription requirement.
- Free participation model and room restrictions.
- Public/private rooms.
- User-created teams and logos.
- Manual/automatic player selection.
- Host-controlled/automatic control.
- Countdown/turn-based formats.
- Bidding, purse, squads, breaks and final results.
- CTA behavior for signed-in and signed-out visitors.

## 7.5 Signed-in auction workspace

Do not create an unrelated generic dashboard simply because the user has logged in.

The authenticated Auction experience should become the user's auction workspace with:
- Host an auction.
- Join public auction.
- Join private auction with code/invitation.
- Spectate public auction.
- Join restricted spectator room.
- Active auctions.
- Past auctions/history.

The user avatar dropdown should include:
- Profile/account settings.
- Auction.
- Billing/subscription.
- Notifications.
- Sign out.

## 7.6 About, marketing and legal content

Build editable content where appropriate. Do not hard-code policy or legal text into components in a way that requires a deployment for every minor correction. Admin-managed content should be permission-controlled and versioned.

**Gate D:** Every public route works signed out; Auction landing is distinct from live rooms; signed-in navigation works; design is responsive and accessible; no fake product claims are present.

---

# 8. Phase E — player database, statistics, team creation and S3 files

## 8.1 Player domain

Implement:
- Player directory.
- Search and filters.
- Player detail pages.
- Player profile identity.
- Aliases and source identifiers.
- Role and nationality.
- Format-specific and career statistics.
- Player history where data is available.
- Data source and last-updated time.
- Admin player import and correction.

The product owner will supply/import a large player dataset. Build robust import tooling instead of placing a massive dataset into frontend code or a single seed file.

Import workflow:
1. Upload or register a dataset using an authorized admin workflow.
2. Validate schema and file size.
3. Preview row counts, errors and duplicates.
4. Normalize player names/aliases and provider IDs.
5. Apply idempotent upserts.
6. Record import batch and results.
7. Allow correction/retry and audit the operator.

Do not invent player statistics. Where a field is unknown, show unavailable rather than fabricate values.

## 8.2 Existing valuation component

Inspect and preserve the current Python valuation logic where useful. Move it behind a stable integration boundary.

The valuation output is an estimate/recommendation. It is not the live bid, winning price or auction settlement value. An unavailable valuation service must not stop an auction from running with its configured base price.

## 8.3 User-created teams

Build:
- Create team.
- Edit name, abbreviation, description and colors.
- Upload/replace logo.
- Preview identity in the room.
- Select/reuse team in an auction.
- Team ownership/creator management according to permissions.
- Delete/archive behavior that does not damage historical auctions.

Users can upload real team logos if they have rights to use them. Under The Hammer must not claim a license or official relationship merely because an image was uploaded.

## 8.4 S3 file pipeline

Implement secure file handling:
1. Authenticated upload intent.
2. Permission and quota check.
3. File category/size/type validation.
4. Short-lived presigned upload or controlled upload.
5. Server-side verification of actual object content.
6. Dimension and file-signature validation.
7. Image re-encoding/scanning where appropriate.
8. Asset status transition to ready.
9. S3 object key and metadata persisted.
10. Controlled file delivery.
11. Admin disable/remove/takedown capability.

Never trust MIME type or file extension supplied by the browser. Never accept arbitrary remote URLs as team logos. Do not expose AWS credentials to the client.

**Gate E:** Player search/detail and dataset import work; custom teams can be created; S3 uploads are validated; asset moderation exists; no user-provided team is forced to be one of the official franchises.

---

# 9. Phase F — tournaments, rooms, subscriptions and team allocation

## 9.1 Host entitlement

Hosting requires an active subscription entitlement.

Implement an entitlement service that can answer:
- Is this user allowed to create a room?
- Which room limits apply?
- Which host capabilities are enabled?
- Is the subscription active, expired, cancelled or in grace?
- What happens to existing hosted auctions after expiry?

The backend must enforce this. Hiding the host button is not sufficient.

The exact plan names, prices and limits remain a product decision. Build configurable plans and entitlement rules. Do not invent final prices or hard-code them across the UI.

## 9.2 Room visibility and admission

Public rooms:
- Discoverable only when listing is enabled.
- Expose only public room details.
- Support configured first-come-first-served or other approved admission rules.
- Team-owner capacity and spectator capacity are separate.

Private rooms:
- Not listed in public discovery.
- Entered through code/invitation.
- Codes are random, secure, revocable and optionally expiring.
- Store only safe representations of secrets/codes where possible.
- Check role and room capacity on every join.

## 9.3 Team allocation

Implement all three modes:
- User-selected available team.
- Random team allocation by the server.
- Organizer-defined custom teams and owner assignment.

Allocation must be transactional. Two simultaneous users cannot reserve the same exclusive team-owner slot. Record random assignments in the event/audit history.

## 9.4 Tournament and room setup wizard

Build a multi-step frontend wizard with:
1. Room/tournament identity.
2. Public/private visibility.
3. Player/team owner and spectator access.
4. Auction control mode.
5. Auction format.
6. Player selection mode.
7. Team count and team creation/selection.
8. Team allocation method.
9. Purse per team.
10. Player categories and category base prices.
11. Bid increment brackets.
12. Countdown/turn settings.
13. Squad rules and requirements.
14. Break policy and duration.
15. Chat and external meeting-link permissions.
16. Preview and validation.
17. Create/publish.

Show warnings for conflicting settings. Save drafts. Validate all settings again on the backend before a room becomes ready.

## 9.5 Host participation

Represent host participation as its own explicit setting. If enabled, the host receives a separate team-owner assignment and uses the ordinary bidding rules. Do not grant the host the ability to bypass their purse, increment or bid validation.

**Gate F:** Room creation and joining work across visibility types; subscription entitlement gates hosting; public team slots reserve atomically; all allocation modes work; configuration is stored and versioned.

---

# 10. Phase G — authoritative auction engine

This is the highest-risk domain. Build and test it before detailed auction-room animations.

## 10.1 Independent configuration dimensions

Do not collapse these into a single auction mode:

- Control: `HOST_CONTROLLED` or `SYSTEM_AUTOMATIC`.
- Format: `LIVE_COUNTDOWN` or `TURN_BASED`.
- Player selection: `MANUAL` or `AUTOMATIC_DRAW`.
- Host participates: enabled or disabled.

All combinations permitted by the PRD must be supported. A host-controlled auction can still use automatic player selection; a system-automatic auction can use a countdown or turn-based format.

## 10.2 Auction state machine

Implement server-side state transitions for:
- Draft.
- Registration.
- Ready.
- Live.
- Player introduction.
- Bidding / turn-taking.
- Break.
- Settlement.
- Paused where permitted.
- Completed.
- Cancelled under explicit policy.

State transitions must be validated and persisted. Each transition creates an ordered auction event with actor, reason, timestamp, version and relevant configuration context.

## 10.3 Player queue and selection

Manual mode:
- Host selects a player from the eligible dataset.
- Validate the player is eligible and not already sold/queued according to room rules.
- Record the selection and actor.

Automatic draw:
- System selects from the configured eligible pool.
- Use a fair, auditable selection process.
- Prevent repeat selection unless the auction rules explicitly allow it.
- Record the draw result and relevant eligible-pool snapshot/version.
- Do not use client-side randomness.

The host can choose either mode during room setup. The behavior at runtime must match that setting.

## 10.4 Player categories and base prices

The host can configure base prices by category for the auction. Do not require editing every player's base price individually.

- Categories should be configurable.
- Players have their assigned category from the player dataset or an approved room override.
- The room's category-price mapping determines the player's auction base price.
- Snapshot the mapping at auction start so later global edits cannot silently change an active auction.
- Do not hard-code only Marquee/Platinum/Diamond/Gold/Emerging.

## 10.5 Bid increment engine

Implement bracket-based increment calculation in a dedicated domain service.

The product-provided example bracket values are:
- Below PKR 1 crore: next increment PKR 10 lakh.
- PKR 1 crore to below PKR 2.2 crore: next increment PKR 15 lakh.
- PKR 2.2 crore to PKR 4 crore: next increment PKR 20 lakh.
- Above PKR 4 crore: next increment PKR 25 lakh.

The exact boundary at PKR 4 crore is unresolved. Store brackets as configuration and do not hard-code a guessed inclusive/exclusive behavior. Do not label these as official PSL rules without verified rules for the relevant season.

The host may configure the brackets. Validate that brackets are ordered, non-overlapping, exhaustive for the configured price range, use valid positive increments, and have an explicit currency/unit.

## 10.6 Countdown bidding

- Server stores phase start and deadline.
- Client displays countdown based on server deadline.
- Each bid is validated against server time and state version.
- Apply the configured extension/reset rule.
- Close bidding according to the server deadline.
- Clients cannot extend, pause or close the timer locally.
- Handle bids arriving at the deadline deterministically.

## 10.7 Turn-based bidding

Implement a separate turn model with:
- Eligible team order.
- Current turn owner.
- Turn deadline.
- Raise/pass actions.
- Active/inactive bidder state.
- Re-entry policy only if explicitly enabled.
- Completion condition.

Do not treat turn-based mode as countdown mode with a different frontend. If rules such as pass re-entry are not decided, implement the turn engine behind explicit configurable policy and keep the unresolved rule documented. Do not guess its behavior.

## 10.8 Bid command validation

Every bid is validated on the backend:
1. Authenticated active user.
2. Correct room and auction.
3. Team-owner permission.
4. User controls the specified auction team.
5. Auction phase accepts bids.
6. Correct player is active.
7. Server deadline/turn is valid.
8. Bid amount equals or exceeds the computed minimum and conforms to the configured increment.
9. Team has enough available purse.
10. Squad constraints permit the acquisition where those constraints are enforced at bid time.
11. Bid idempotency key has not been processed.
12. Expected state version is current.

Use a database transaction and row locking or a carefully designed optimistic concurrency mechanism. The winning bid must be determined by the authoritative commit/ordering mechanism, not browser clocks.

## 10.9 Settlement and purse ledger

When an auction player is sold, the backend must atomically:
- Confirm the winner.
- Mark the auction player sold.
- Persist the winning bid.
- Create the acquisition record.
- Debit the team's purse ledger.
- Update the squad.
- Update requirement progress.
- Advance auction state/queue.
- Record the settlement event.

If any operation fails, all related writes roll back. Settlement is idempotent and safe to retry. Do not overwrite a purse balance without a ledger entry. Do not silently rewrite settled bids or acquisitions.

## 10.10 Unsold and exceptional paths

Implement:
- Unsold player.
- Retry/re-auction only according to room configuration.
- Paused auction.
- Host disconnection.
- Team owner disconnection.
- Server restart/recovery.
- Room cancellation under a defined policy.
- Player withdrawal/invalid player correction through audited host/admin workflows.
- Settlement recovery and reconciliation.

**Gate G:** Unit/integration/concurrency tests prove there is one authoritative winner, no duplicate settlement, no negative purse, no unauthorized bid, no bid after deadline, and correct recovery after reconnect/restart.

---

# 11. Phase H — breaks, squad rules and calculations

## 11.1 Break automation

Implement configurable break behavior:
- Trigger after the configured count of accepted bids.
- Default proposal: every five accepted bids.
- Duration configurable, suggested starting range 1–3 minutes.
- Host can extend or shorten within room policy and permitted bounds.
- Server stores and broadcasts the new deadline.
- Every change is audited.

The PRD leaves the break counter scope open (per player or full auction). Do not hard-code either assumption. Keep the scope as an explicit configuration and mark the default as pending product approval.

## 11.2 Squad rule engine

The host configures:
- Minimum/maximum squad size.
- Domestic/national player requirements.
- Overseas limits.
- Role requirements: batter, bowler, all-rounder, wicketkeeper.
- Optional category or other constraints.

Rules must be stored per auction and evaluated by the backend. The engine must support custom definitions instead of hard-coded PSL-only requirements.

Use one shared server-side rule evaluator for:
- Pre-bid affordability/eligibility checks where appropriate.
- Acquisition settlement.
- Break squad progress.
- Final roster validation.

Do not trust UI-only calculations.

## 11.3 Squad display indicators

Display:
- Role icon before player name.
- Nationality flag/icon where reliable data exists.
- Overseas marker (the product's proposed airplane indicator) for players classified overseas under that auction's rules.
- Accessibility label/tooltip so the indicator is not color/icon-only.

Do not infer overseas eligibility solely from nationality display. Use the configured tournament rule.

## 11.4 Break interface data

For every team, expose:
- Remaining purse.
- Squad list.
- Squad size and remaining slots.
- Player roles.
- Domestic/overseas counts under room rules.
- Completed requirements.
- Missing requirements.
- Total spend and remaining budget.

**Gate H:** Squad calculations match backend fixtures and database state; the break timer is server-authoritative; host adjustments are authorized and audited.

---

# 12. Phase I — realtime gateway and room chat

## 12.1 Socket authentication and room authorization

- Authenticate every socket connection.
- Validate token/session and account status.
- Authorize room join on the server.
- Never allow arbitrary client-selected socket channels.
- Re-check permissions for sensitive commands.
- Separate public, owner, host and staff event audiences.
- Never broadcast payment, moderation or private account data to the general room.

## 12.2 Event envelope

Use shared contracts. A server event should carry:
- Event ID.
- Room ID.
- Auction ID if applicable.
- Ordered sequence number.
- State version.
- Server timestamp.
- Event type.
- Typed payload.

On reconnect:
- Authenticate.
- Reauthorize room membership.
- Receive authoritative snapshot.
- Resume event processing.
- Detect sequence gaps and resync.
- Never replay an uncommitted bid as accepted.

## 12.3 Core realtime events

Client commands:
- Join/leave room.
- Submit bid.
- Host action.
- Chat message.
- Request snapshot/resync.
- Any turn-based action.

Server events:
- Room joined/left.
- Auction state snapshot.
- Player introduced.
- Bid accepted/rejected.
- Timer update.
- Break started/updated/ended.
- Player sold/unsold.
- Auction paused/resumed/completed.
- Squad and purse changed.
- Chat message/moderation result.
- Participant presence update.
- Reconnect/resync result.

The exact typed event contract belongs in `packages/contracts`. Keep event names and schemas documented.

## 12.4 Redis and multi-instance operation

Use Redis for the Socket.IO adapter and short-lived coordination when multiple backend instances are running. PostgreSQL remains the source of truth for bids, settled acquisitions, purse ledgers, auction events and durable state.

Redis loss must not erase auctions or financial records.

## 12.5 Room-specific chat

Implement:
- Separate chat stream per room.
- Owner/spectator chat permissions.
- Message pagination/history.
- Rate limiting and spam protection.
- Safe content rendering and stored-XSS protection.
- Reports and moderation actions.
- Host mute/remove permission where allowed.
- System messages for auction events and break announcements.

External links:
- Disabled by default.
- If enabled, allow only approved providers such as Google Meet and Discord after URL validation.
- Do not embed arbitrary third-party pages.
- Do not accept WhatsApp links unless explicitly approved and allowlisted.
- Show safe link cards with a clear external destination.

No native voice/video chat in the initial scope.

**Gate I:** Multiple users in one room see the same ordered state; events cannot leak across rooms; spectators cannot bid; host commands are protected; reconnect restores state; chat is room-isolated and moderated.

---

# 13. Phase J — live auction frontend

Build the auction room only after the backend state machine and event contracts are stable.

## 13.1 Entry and role-aware views

After room admission, resolve the user's role:
- Team owner.
- Host.
- Spectator.

The interface must reflect server-confirmed permissions. Do not infer a role from URL parameters or locally selected team IDs.

## 13.2 Auction room layout

Follow `DESIGN.md`:
- Room status/header bar.
- Central player stage.
- Team tables around the stage.
- Current user's team panel larger and visually prominent.
- Other team panels smaller and arranged around the central stage.
- Current price and leading team.
- Timer or turn state.
- Bid control.
- Player queue/auction event history.
- Room-specific chat.
- Break/squad detail mode.
- Host controls only when authorized.

The team layout must adapt to two or more teams. Eight-team circular layout is an important preset, not a fixed DOM structure.

## 13.3 Team cards

Each team panel should show:
- Team logo.
- Team name/short name.
- Owner identity.
- Remaining purse.
- Number of acquired players.
- Compact squad preview.
- Leading bidder state where relevant.

Use dynamic team colors as accents, preserving text and control contrast.

## 13.4 Player card and details flip

Front:
- Name.
- Generated initials or approved player photo.
- Nationality.
- Role.
- Category.
- Base/current bid.

Back:
- Career statistics.
- Format-specific statistics.
- Recent form/performance if sourced.
- Player history where available.
- Data source and last updated time.

The flip is a UI interaction only; it never changes auction state. Generated initials are the fallback and initial default where player imagery is not provided.

## 13.5 Bid action

Show:
- Current highest bid.
- Current leading team.
- Next valid bid amount.
- Timer or current turn.
- One prominent Bid control.

The frontend may calculate a display preview, but the server recomputes and validates the amount. Show pending state until confirmed. Never optimistically render an unconfirmed bid as accepted.

Rejected bid messages must be clear, with safe reasons such as:
- Auction not accepting bids.
- Out of turn.
- Bid below minimum.
- Insufficient purse.
- Team not authorized.
- Bid deadline passed.
- State changed; refresh required.

## 13.6 Dramatic auction sequence

Build controlled event-driven sequences:
1. Player introduction.
2. Player stage enters.
3. Bidding becomes active.
4. Live bid activity.
5. Closing countdown.
6. Sold/unsold state.
7. Hammer/confirmation animation.
8. Winning team acquisition presentation/ticket.
9. Team purse/squad updates.
10. Next player or break.

Use GSAP for orchestrated timelines and Framer Motion for component transitions. Audio cues are optional UI enhancements, with mute control and reduced-motion/accessibility considerations. Animation must never delay bid submission or misrepresent the server state.

## 13.7 Spectator view

Spectators receive:
- Current player.
- Live bids and leading team.
- Timer/turn state.
- Team panels and permitted public data.
- Sold/unsold results.
- Chat only when room policy allows.

Spectators never see bid controls and cannot invoke bid operations.

## 13.8 Host control panel

Host controls must be separate from team-owner controls and shown only when authorized:
- Start/advance player.
- Manual player selection where configured.
- Pause/resume where allowed.
- Mark unsold where rules permit.
- Break extension/reduction within limits.
- Manage eligible participants according to room policy.
- View audit/event log.
- Trigger a system draw only where configured.

A host who is also a team owner uses a separate team-owner bid panel and must obey the same bid rules as everyone else.

**Gate J:** All role views work; live state is driven by server events; mobile layout remains usable; player detail flips correctly; animations do not block bidding; spectator permissions are enforced in both UI and API.

---

# 14. Phase K — team, purse, squad, ticket and share exports

Implement:
- Team roster page/panel.
- Purse and spending breakdown.
- Player acquisition history.
- Role/category/nationality breakdown.
- Squad requirements progress.
- Final squad validation.
- Player ticket/auction acquisition card.
- Team squad PNG export.
- Multi-team auction snapshot/export.

Export rules:
- Generate from a server-confirmed or versioned roster snapshot.
- Respect room visibility and sharing permissions.
- Include team identity, logo, colors, player names and roles.
- Include nationality indicators where reliable.
- Include auction name/date and relevant totals only when permitted.
- Avoid leaking private room data.
- Use approved assets only.
- Support download and share-ready dimensions.

The acquisition ticket should use the visual direction in `PRD.md` and `DESIGN.md`: predominantly white with restrained use of the winning team's color, player identity/initials, country, role/category, winning team, price and auction/player identifier.

**Gate K:** Export values match durable backend records; private data is not exposed; PNG rendering works in supported browsers.

---

# 15. Phase L — subscriptions and payments

## 15.1 Provider-independent design

Create an internal payment provider interface. Do not make Safepay-specific logic leak across subscription, tournament and UI modules.

Safepay is the initial Pakistan provider candidate. Before integration, verify current official documentation for:
- Checkout/session flow.
- Supported payment methods and currencies.
- Merchant eligibility.
- Webhook signing and verification.
- Refund capabilities.
- Settlement and reconciliation behavior.
- Sandbox/production differences.

Do not assume provider capabilities.

## 15.2 Host subscription lifecycle

Implement:
- Plan definitions and configurable entitlements.
- Checkout initiation.
- Pending/paid/failed/cancelled/refunded states as relevant.
- Verified webhook handling.
- Subscription activation/renewal/expiry.
- Grace/cancellation policy when approved.
- Billing history and receipts.
- Admin lookup and support workflow.
- Entitlement evaluation in backend.

A browser redirect is not proof of payment. Only verified webhook or server-side provider confirmation may activate an entitlement.

## 15.3 Paid private tournaments

Keep tournament entry fees separate from host subscriptions. The product decision about including entry fees in the first release remains open. Build the data model and provider adapter so this capability can be added without confusing the two payments, but do not enable or charge entry fees before the product owner approves rules, refunds and legal/commercial handling.

## 15.4 Refunds and corrections

- Verify staff permission.
- Record reason.
- Verify provider capability.
- Require extra approval where configured.
- Persist provider refund ID and status.
- Use compensating ledger records.
- Never silently delete a payment or ledger row.

**Gate L:** Sandbox checkout and webhook processing are verified where credentials are provided; entitlement activation is server-side; duplicate webhooks are idempotent; admin can inspect payment states; no fabricated successful payment path exists.

---

# 16. Phase M — cricket news, live matches and player data

The public cricket platform must work throughout the year. Auction is not the only product surface.

## 16.1 Provider strategy

Before implementing a real provider:
- Research current official provider documentation.
- Confirm rights/terms and coverage.
- Confirm allowed caching, retention, redistribution and attribution.
- Confirm update frequency, rate limits and pricing.
- Record decisions in `docs/decisions/`.
- Build a provider adapter, not provider-specific code in React components.

If no provider credentials or legal permission are available, complete the provider interface, admin source configuration, stale/unavailable states and local integration tests. Do not fabricate production match scores or current news.

## 16.2 Live page

Implement:
- Live match listing.
- Match status and teams.
- Current score/innings where supplied.
- Match detail/scorecard where data supports it.
- Last-updated timestamp.
- Source attribution.
- Stale/unavailable state.
- Provider outage handling.

Do not stream or rebroadcast match video/audio without distribution rights.

## 16.3 News page

Implement:
- News list.
- Categories/tags.
- Article detail/summary page.
- Source/publisher attribution.
- Publication timestamp.
- Canonical source link.
- Editorial review/publish controls.
- Moderation/correction/takedown workflow.

Do not scrape or republish full copyrighted articles or protected imagery without permission. Do not present third-party reporting as original Under The Hammer journalism.

## 16.4 Player profiles

Implement:
- Global player search.
- Player bio fields where sourced.
- Role and nationality.
- Career and format statistics.
- Recent form if data provider supports it.
- Team/competition history where sourced.
- Data source and freshness.
- Admin correction and source conflict handling.

**Gate M:** Public News, Live and Player areas function with verified provider data or explicitly unavailable provider status; attribution is present; data freshness is visible; no fabricated score/news content is shipped.

---

# 17. Phase N — notifications and user account/billing

Implement:
- In-app notification center.
- Notification history.
- Mark read/unread.
- User notification preferences.
- Auction invitations.
- Auction reminders.
- Host subscription lifecycle notices.
- Payment result notices.
- Support case updates.
- Moderation/appeal updates.
- Maintenance and release announcements.

Notifications must be persisted. Realtime delivery is a convenience; it must not be the only copy.

Account settings:
- Profile details.
- Username/avatar.
- Email/verification status.
- Security/session options appropriate to Cognito.
- Preferences.
- Notification settings.
- Billing/subscription.
- Sign out.

Build privacy controls and notification consent where required.

**Gate N:** Notifications survive reconnect; unread state persists; account and billing screens reflect server data; users cannot access another user's notification history.

---

# 18. Phase O — dedicated admin application

The admin platform is required for launch operations. The owner must not need to modify production code or directly edit production database rows for normal support issues.

## 18.1 Staff role model

Implement roles and granular permissions for:
- Super Administrator.
- Administrator.
- Support Agent.
- Moderator.
- Finance/Billing Operator.
- Content Editor.
- Read-only Auditor.

A user may hold multiple permission grants only according to policy. Do not assume role names alone are sufficient authorization; check granular permissions server-side.

## 18.2 Admin modules

### Overview
- Operational dashboard.
- Active auctions/rooms.
- Queue of unresolved support/moderation/payment cases.
- Provider/system health.
- Important notifications and incidents.

### User management
- Search user.
- View profile, status and verification.
- View support history.
- Warn, suspend, reinstate or ban according to permissions.
- Review ban/appeal requests.
- Resend verification or trigger approved account workflows.
- Record reason and audit every sensitive action.

### Room and auction operations
- Search rooms/tournaments/auctions.
- Inspect room configuration.
- View participant roles.
- Inspect ordered auction event timeline.
- Review accepted/rejected bids.
- Identify settlement/purse inconsistencies.
- Pause or intervene only under explicit permission and policy.
- Do not silently rewrite a settled result.

### Team and asset moderation
- Search user-created teams.
- Inspect uploaded logos.
- Disable/remove assets.
- Process takedown requests.
- Record complaint, action and outcome.

### Player and cricket content
- Import/preview player datasets.
- Resolve duplicate players/source IDs.
- Correct metadata under audit.
- Inspect news sources and content.
- Correct, unpublish or remove content.
- Inspect live-data provider sync status.

### Support
- Support case inbox.
- Assign staff.
- Conversation/history.
- Status, priority and category.
- Internal notes.
- User response.
- Resolution reason.
- Audit trail.

### Moderation
- Chat reports.
- User reports.
- Room incidents.
- Warnings/mutes/suspensions/bans.
- Appeals.
- Evidence retention and access controls.

### Billing and finance
- Payment lookup.
- Subscription lookup.
- Entitlement inspection.
- Refund workflow.
- Reconciliation jobs.
- Provider event/webhook history.
- Receipt/invoice references.
- Financial audit trail.

### Notifications and announcements
- Compose in-app announcements.
- Schedule maintenance notices.
- Publish release/update notes.
- Target users/segments only where approved.
- Record audience, author and publication time.
- Show delivery/read status where available.

### Platform operations
- Feature flags.
- Maintenance mode.
- Provider health.
- Data ingestion job status.
- Background worker status.
- Error/incident overview.
- Operational runbooks.

### Staff and audit
- Staff user management.
- Role/permission editor.
- Approval queue.
- Audit log search and export.
- Read-only audit access.

## 18.3 Safe one-click actions

Make routine operations efficient, but never allow destructive or financial actions without safeguards.

Examples:
- Resend verification email.
- Remove reported chat message.
- Mute a user in a room.
- Warn/suspend/reinstate under permission.
- Disable a reported team logo.
- Retry a failed data sync.
- Assign/resolve a support case.
- Retry reconciliation.
- Issue a provider-supported refund with required approval.

High-risk actions need confirmation, reason, authorization and sometimes a second approver. Financial and auction history must remain auditable. Never silently rewrite settled bids, acquisitions or ledger history.

## 18.4 Admin frontend

Build a dedicated staff shell with:
- Permission-aware navigation.
- Search-first user/room/payment lookup.
- Data tables with filters and pagination.
- Case queues.
- Detail drawers/pages.
- Audit timeline beside sensitive objects.
- Confirmation dialogs.
- Toasts and actionable errors.
- Live notifications.
- Clear role/permission indicators.

Do not expose the admin frontend as a public link without authentication and backend authorization.

**Gate O:** Every staff operation has server-side permission enforcement; sensitive actions are audited; support, moderation and payment workflows can be completed in the UI without direct production database edits.

---

# 19. Phase P — production hardening, deployment and operations

## 19.1 Environments

Provide separate:
- Local development.
- Shared staging.
- Production.

Use separate Cognito app clients/pools where appropriate, databases/branches, S3 buckets, payment credentials and data-provider credentials.

## 19.2 Deployment

Containerize:
- Web.
- API/realtime gateway.
- Worker.
- Admin.

Choose hosting based on:
- WebSocket support and connection duration.
- Background worker support.
- Region/latency.
- Network/database connection limits.
- Deployment rollback.
- Logs/metrics.
- Cost and operational reliability.

Do not assume a generic serverless HTTP runtime will support long-lived WebSocket connections or persistent workers without confirmation.

## 19.3 Secrets and security

- Store secrets in managed secret storage.
- Never commit `.env` files.
- Apply least-privilege AWS IAM.
- Use private S3 buckets.
- Use scoped presigned URLs.
- Verify Cognito tokens server-side.
- Verify payment webhook signatures.
- Rate-limit sign-in, bid, chat, invitation and upload operations.
- Sanitize user-generated content.
- Protect against XSS, CSRF where relevant, injection and IDOR.
- Enforce room isolation in REST and Socket.IO.
- Keep sensitive data out of logs.
- Define backup and restore procedures.
- Define data retention and deletion policy.

## 19.4 Observability

Implement:
- Structured logs.
- Correlation IDs.
- Error tracking.
- Metrics for API latency and failure.
- Socket connection and reconnection metrics.
- Bid accepted/rejected rates and reasons.
- Auction settlement failures.
- Purse reconciliation alerts.
- Payment webhook failures.
- Data ingestion freshness.
- Worker queue health.
- Admin action audit search.

Critical alerts include:
- Failed or inconsistent settlement.
- Purse ledger mismatch.
- Duplicate or repeated payment events.
- Provider webhook signature failures.
- Sustained socket disconnects.
- Stale live-score feeds.
- Database connectivity failures.

## 19.5 Backups and recovery

- Scheduled database backups.
- Verify restore procedure, not merely backup creation.
- Preserve audit and financial records according to policy.
- Define recovery behavior after an auction server restart.
- Restore auction state from PostgreSQL event/state records.
- Redis is not the only place any critical state lives.

**Gate P:** Staging deployment works; WebSocket behavior is verified in the target environment; backups restore; secrets are managed; logs/metrics/alerts exist; production runbooks are documented.

---

# 20. Phase Q — Spaces (deferred product release)

Spaces are part of the longer-term product vision but are explicitly deferred by the approved product scope. Do not allow Spaces to delay the first complete auction and cricket platform release.

When the product owner approves the Spaces release, implement:
- Create/discover spaces.
- Join/leave.
- Owner/admin/moderator/member roles.
- Group real-time text chat.
- Membership rules and invite links.
- Reports, mute, block and moderation.
- Notifications and mentions.
- Message history and retention.
- Search and discovery policy.
- Rate limiting and abuse prevention.

No native voice/video feature is included unless separately approved.

---

# 21. Cross-cutting testing plan

Tests are part of implementation, not a final optional task.

## 21.1 Unit tests

Cover:
- Bid increment bracket calculations.
- Price/currency conversion helpers.
- Purse arithmetic.
- Squad rule evaluation.
- Team allocation.
- Auction state transitions.
- Countdown deadline handling.
- Turn order and turn actions.
- Break scheduling.
- Subscription entitlement.
- Permission evaluation.
- Import normalization.
- Notification preferences.

## 21.2 Database/integration tests

Cover:
- Migrations from an empty database.
- Foreign key and unique constraints.
- User identity linking.
- Room join capacity races.
- Team allocation races.
- Concurrent bids.
- Settlement rollback.
- Settlement idempotency.
- Purse ledger.
- Squad acquisition uniqueness.
- Payment webhook replay/idempotency.
- S3 asset validation status.
- Admin action audit.
- Staff permission denial.

## 21.3 Auction adversarial tests

Mandatory cases:
- Two bids arrive simultaneously.
- Bid arrives exactly at or after deadline.
- Bid has invalid increment.
- Bid is below minimum.
- Team lacks purse.
- User bids for a different team.
- Spectator attempts to bid.
- User has left/banned from room.
- Client replays the same bid command.
- Client sends stale state version.
- Host attempts a forbidden action.
- Host's subscription expires during an active auction.
- Server crashes during settlement.
- Client disconnects and reconnects.
- Two rooms are active simultaneously.
- One room's event is never delivered to another room.
- Break timer is extended/shortened by unauthorized user.
- A settled player is submitted for settlement again.

## 21.4 End-to-end user journeys

Verify complete journeys:
1. Visitor browses public site.
2. User signs up with email and verifies.
3. User signs in using Google.
4. User creates a custom team and uploads logo.
5. Host without entitlement is prevented from creating a room.
6. Host with entitlement creates a public room.
7. Host creates a private room and shares code.
8. Team owners join public first-come-first-served room.
9. Team owners join private room with code.
10. Spectator joins public room.
11. Restricted spectator enters with invitation/code.
12. Users choose, randomly receive or are assigned custom teams.
13. Host manually selects a player.
14. System automatically draws a player.
15. Countdown auction runs to settlement.
16. Turn-based auction runs to settlement.
17. Host-controlled auction runs.
18. System-automatic auction runs.
19. Break starts after configured bid count.
20. Host changes break duration within permitted bounds.
21. Teams review squad requirements and purse.
22. Room chat works and moderation works.
23. Host/team owner reconnects during auction.
24. Final squad export matches server records.
25. User views billing and subscription.
26. Verified Safepay sandbox webhook updates entitlement.
27. Admin handles support, moderation and payment cases.
28. Admin publishes a maintenance/release notification.
29. Public News/Live/Player pages handle provider data and provider outage correctly.

## 21.5 Frontend quality checks

- Responsive desktop/tablet/mobile layouts.
- Keyboard navigation.
- Visible focus.
- Color contrast.
- Reduced-motion support.
- Accessible icon labels.
- No layout shift during bid updates.
- No unconfirmed optimistic bid.
- Clear loading, empty, error, offline and reconnect states.
- No team-color contrast failures.

## 21.6 Load and resilience

Test:
- Multiple active auction rooms.
- Many spectators per room.
- Simultaneous bid bursts.
- Timer boundary bursts.
- Reconnect storms.
- Multiple background data jobs.
- Payment webhook retry bursts.
- Redis interruption.
- Worker restart.
- API restart during active auction.

---

# 22. Definition of complete delivery

The application is not complete when the frontend looks finished. The following must exist and work together.

## Public product
- Home.
- About.
- News.
- Live.
- Player directory and profile.
- Auction marketing.
- Sign in/up and recovery.
- Responsive global navigation.

## User account
- Cognito email/password.
- Email verification.
- Google sign-in.
- Account settings.
- User profile dropdown.
- Billing/subscription.
- Notifications.
- Sign out.

## Teams and files
- Team creation and editing.
- Dynamic team identity.
- S3 logo upload and validation.
- Asset moderation.

## Auction hosting and participation
- Subscription-gated hosting.
- Free and private room capability as approved.
- Public/private rooms.
- Room invitations/codes.
- Team owner and spectator admission.
- All team allocation modes.
- Host participation option.
- Configurable purse, categories, prices, bid increments and squad rules.
- Manual and automatic player selection.
- Human-host and automatic control.
- Countdown and turn-based formats.

## Live auction
- Authoritative bidding.
- Server timers.
- Settlement/purse ledger.
- Real-time team tables.
- Player card/details.
- Breaks and break controls.
- Squad requirements.
- Room chat.
- Spectator mode.
- Reconnect/recovery.
- Sold/unsold outcomes.
- Squad and ticket PNG exports.

## Administration
- Staff authentication and RBAC.
- User management.
- Support queue.
- Moderation and appeals.
- Room/auction inspection.
- Asset moderation.
- Billing/payment operations.
- Notifications/announcements.
- Maintenance mode/feature flags.
- Audit logs.
- Provider/data operations.

## Operations
- Automated tests.
- CI.
- Staging deployment.
- Production deployment configuration.
- Monitoring and alerts.
- Backup/restore runbook.
- Security review.
- Documentation.

Spaces remain a later release as specified in `PRD.md`.

---

# 23. Execution protocol for the coding agent

Follow this exact working loop:

1. Read all six authoritative files and this plan.
2. Inspect the current repository and existing code.
3. Update the decision register and repository audit.
4. Identify the next incomplete phase and its dependencies.
5. Implement backend contracts, data model and domain rules first for stateful features.
6. Add migrations and tests with the feature.
7. Implement the frontend using real API/event contracts.
8. Add authorization, audit, loading, empty, error, offline and reconnect states.
9. Run lint, typecheck, unit tests, integration tests and relevant end-to-end tests.
10. Fix failures before claiming the phase is complete.
11. Update docs and the phase checklist.
12. Continue to the next phase until the whole approved launch scope is complete.

Maintain `docs/IMPLEMENTATION_STATUS.md` with:
- Phase and task.
- Status: not started / in progress / blocked / complete.
- Files/modules changed.
- Migrations added.
- Tests run and results.
- External dependencies.
- Open decisions.
- Evidence of acceptance criteria.

Do not mark a phase complete with a failing test, missing migration, unimplemented permission, fake backend response or frontend-only mock.

## 23.1 Required final report from the agent

At the end of the implementation, report:
- What was built.
- Which phases are complete.
- Which features are intentionally deferred.
- Which external credentials/providers remain unconfigured.
- Which product decisions remain unresolved.
- Database migrations and seed commands.
- Local setup and run commands.
- Test results.
- Deployment instructions.
- Security/operational limitations.
- Any deviations from the six approved files, with the reason and explicit approval reference.

## 23.2 Final instruction

**Build the product described by the six approved files. This plan is an execution sequence, not permission to shrink the product.**

Do not stop at a mockup. Do not replace real multiplayer bidding with random winners. Do not restrict users to official PSL teams. Do not hard-code eight teams. Do not make the browser authoritative. Do not fake payment success, live scores, news or player statistics. Do not bypass the admin panel with manual production database edits.

If an external provider or unresolved commercial/legal rule blocks one capability, isolate that dependency and continue implementing everything else that is already specified.
