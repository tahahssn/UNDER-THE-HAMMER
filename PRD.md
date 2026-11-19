# Under The Hammer — Product Requirements Document

**Status:** Product direction baseline  
**Version:** 1.0  
**Date:** 2026-11-03  
**Product:** Under The Hammer  
**Initial market:** Pakistan, with an international product architecture

---

## 1. Product vision

Under The Hammer is a cricket platform built around three connected experiences:

1. **Cricket information throughout the year:** player profiles, career statistics, cricket news, live matches and scores.
2. **Multiplayer cricket auctions:** users create and participate in configurable public or private auctions, build teams, bid against other team owners and share their final squads.
3. **Community features:** spaces where cricket fans can gather and communicate. Spaces are a planned later release, not part of the first launch.

The auction is the product's signature experience, but the platform must remain useful outside auction seasons. The long-term direction is international cricket coverage rather than a product restricted to PSL teams or a single tournament.

### Product principles

- Users are not restricted to official PSL franchises. They can create their own teams and upload their own logos, subject to platform rules and applicable rights.
- The platform provides auction tools; it does not claim affiliation with a cricket league, franchise, governing body or player unless an agreement exists.
- Anyone can browse public marketing, cricket news and live-score pages without an account.
- Authentication is required to join, host, bid in or spectate an auction where the room requires an account.
- Hosting an auction requires an active eligible subscription. Joining and participating in an auction can be free, subject to room capacity and access rules.
- Auction state, bids, timers, purse balances and results are authoritative on the server.
- Room settings are configurable. The product must not hard-code every auction to eight teams or one league's rules.
- The admin panel is a first-class operational product. Routine support, moderation, payment and user-management work should not require a code change.

---

## 2. Product scope and release boundaries

### 2.1 Public website — first release

Public routes:

- Home
- About
- Cricket news
- Live cricket
- Auction landing/marketing page
- Player directory and player profiles, as data coverage permits
- Sign in and sign up
- Legal pages: terms, privacy, acceptable use, copyright/takedown and subscription terms

The **Auction** navigation item opens an auction marketing page for signed-out visitors. It explains the product, auction formats, how hosting and participation work, subscription requirements and calls to action. It must not unexpectedly drop a visitor into a live room.

### 2.2 Signed-in auction entry experience — first release

Do not create an unnecessary, generic dashboard just to display one auction feature. After sign-in, the auction landing/entry experience becomes an authenticated auction workspace.

It should offer:

- Host an auction (subscription eligibility required)
- Join a public auction
- Join a private auction using a code or invitation
- Spectate a public auction
- Enter a private spectator room using its code/invitation
- View the user's active and past auctions
- View account, billing and settings from the profile menu

When the user clicks their profile avatar at the top-right, show a polished dropdown with relevant navigation, including Auction, account settings, billing/subscription and sign out. Future product areas can be added to the same navigation without redesigning the whole information architecture.

### 2.3 Auction system — first release

Support the following configurable options:

| Dimension | Supported options |
|---|---|
| Room visibility | Public and private |
| Auction control | Human host and system automatic |
| Auction format | Live countdown and turn-based |
| Team allocation | User-selected, random and organizer-defined custom teams |
| Platform access | Free participation and paid private tournaments |
| Spectator access | Public and code/invitation restricted |
| Team count | Configurable; eight is the initial common preset, not a platform limit |
| Team identity | User-created team name, logo, colors and optional short name |
| Player selection | Host manually selects a player or system draws from an eligible player pool |
| Host participation | Host may also own a team and bid, if enabled in room settings |

A room's visibility and its spectator policy are separate. For example, a public room may be listed publicly but restrict spectator entry to approved users. A private room is not discoverable and requires an invitation/code.

### 2.4 Cricket content — staged release

The product direction includes:

- Global player directory and player profiles
- Career and format-specific statistics
- Teams, competitions and match records
- Cricket news and editorial feeds
- Live match listings, scores and match states
- Later: richer scorecards, ball-by-ball data, APIs and other data products

The first release should not promise worldwide completeness unless the chosen licensed data sources provide it. Coverage, update frequency, attribution and permitted display must be explicit.

### 2.5 Spaces — later release

Spaces are planned as free-to-create cricket communities with group-style real-time text chat. They are intentionally deferred until the auction and core cricket information experience are stable.

Future scope may include:
- Create and discover spaces
- Join/leave and membership roles
- Group chat and moderation
- Notifications and mentions
- Space rules, ownership transfer and reporting

Voice chat is not in the initial scope. Users may share approved external meeting links in room chat only when the room configuration allows it and the link provider is on the platform's allowlist.

### 2.6 Explicitly out of scope for initial release

- Native mobile applications
- Voice/video calling
- Match live-streaming or rebroadcasting without the required rights
- Paid betting, gambling, wagering or cash-prize mechanics
- Unlicensed distribution of official league or franchise assets
- Public user-created API key service
- Full community Spaces release
- Microservices architecture before scale requires it

---

## 3. Audiences and user journeys

### 3.1 Visitor

1. Opens the marketing website.
2. Reads About, News, Live and Auction pages without signing in.
3. Browses available player and match information.
4. Chooses sign in/sign up when they want to participate in an auction.

### 3.2 Auction participant / team owner

1. Signs in.
2. Opens Auction.
3. Joins a public room, enters a private code, or accepts an invitation.
4. Selects an available team, receives a random assignment, or accepts an organizer's custom assignment.
5. Enters the live room.
6. Reviews player details, current bid, purse and squad.
7. Places valid bids in real time.
8. Follows breaks, chat, squad requirements and final settlement.
9. Downloads a squad graphic or shares an allowed public result.

### 3.3 Auction host

1. Signs in and selects Host an Auction.
2. The system checks the host's subscription entitlement.
3. Creates a room and configures its visibility, format, control mode, teams, players, rules, purse and break behavior.
4. Uploads team logos or creates teams.
5. Selects whether the host will participate as a team owner.
6. Publishes a public room or distributes private invitations/codes.
7. Starts and manages the auction, or lets the automatic system operate.
8. Reviews results and exports the final auction record.

### 3.4 Spectator

1. Signs in.
2. Finds a public auction or uses a private invitation/code.
3. Joins in read-only mode.
4. Watches synchronized player, bid, timer, team and result updates.
5. Uses chat only if spectator chat is enabled for that room.

### 3.5 Administrator and support staff

1. Signs into the separate administrative application.
2. Sees notifications, operational health and assigned cases.
3. Searches users, rooms, auctions, payments and reports.
4. Performs only the actions allowed by their staff role.
5. Every sensitive action is reason-coded and audited.

---

## 4. Account and identity requirements

### 4.1 Authentication

Initial authentication methods:

- Email and password
- Google sign-in/sign-up
- AWS Cognito for identity management and email verification

Email verification is required before sensitive actions such as hosting, bidding, payment and account-security changes. Exact verification and recovery policies must be configured in Cognito and reflected in the application.

### 4.2 User profile

Store a platform user profile linked to the Cognito subject identifier. Do not use email as the primary database key.

Profile fields may include:
- Display name
- Unique username/handle
- Avatar
- Locale and timezone
- Country, if voluntarily provided
- Account status
- Created and updated timestamps

Account settings and billing are available from the profile dropdown.

---

## 5. Team creation and uploaded logos

Users and organizers can create custom auction teams. The platform does not force use of official PSL franchise teams.

Team creation fields:
- Team name
- Short name / abbreviation
- Logo
- Primary and secondary colors
- Optional country/region
- Optional description

Logo requirements:
- Upload through a controlled S3-backed file workflow.
- Validate MIME type, file signature, dimensions and size.
- Re-encode images where appropriate; do not trust filename extensions.
- Store the object key and metadata, not a public arbitrary URL, in PostgreSQL.
- Use controlled delivery URLs/CDN policy.
- Support deletion/replacement and moderation.
- Require the uploader to confirm they have permission to use the asset.
- Provide a copyright/trademark complaint and takedown workflow.

The platform must not imply that user-uploaded official logos are licensed by Under The Hammer. Users remain responsible for the rights to assets they upload, subject to the platform's terms and applicable law. Admins need the ability to disable an asset or team when a valid complaint or policy issue arises.

---

## 6. Auction host subscription

Hosting is a subscription-gated capability.

- A user can browse and join eligible free auctions without buying a host subscription.
- A user must have an active subscription entitlement to create/host an auction.
- The backend checks entitlement at room creation and at relevant host-management actions.
- Subscription status must not be trusted from client state.
- Existing rooms should have an explicit policy for what happens if a host subscription expires mid-auction. Recommended default: do not interrupt an already-started auction; prevent creation of new rooms and handle renewals at the next lifecycle boundary.
- Subscription plans, limits and prices are admin-configurable.
- Payment provider integration is abstracted so Safepay can be used initially in Pakistan and international providers can be added later.

Paid private tournament entry fees are a separate commercial concept from the host subscription. They must not be conflated in the data model or billing UI.

---

## 7. Auction room configuration

A room configuration should capture:

### Access and visibility
- Public or private
- Public listing enabled/disabled
- Join policy: first-come-first-served, approval, invitation or code
- Spectator policy: public or restricted
- Team-owner capacity
- Spectator capacity
- Room code/invitation expiry and revocation

For a public room using first-come-first-served, the backend atomically reserves available team-owner slots. A full room cannot accept another team owner. Spectator capacity is managed separately.

### Auction operation
- Human-host-controlled or system-automatic
- Countdown or turn-based format
- Player selection mode: manual or automatic draw
- Host participates as a team owner: yes/no
- Pause/resume permissions
- Player queue and eligible player pool
- Rules profile and custom overrides

### Teams and squad rules
- Number of teams
- Team owners and assignments
- User-selected, random or custom allocation
- Starting purse per team, configurable by host
- Minimum/maximum squad size
- Minimum/maximum domestic players
- Minimum/maximum overseas players
- Role requirements (batters, bowlers, all-rounders, wicketkeepers)
- Optional category requirements
- Any other tournament-specific squad constraints

All constraints must be configurable and validated by the server. Do not hard-code eight teams, PSL squad rules or a single nationality policy into the engine.

### Player categories and prices
The host can configure a base price for each category for that auction, rather than editing every player's base price individually. A player may have a category assignment from the player dataset; the auction uses the room's category-price mapping.

Example categories can include Marquee, Platinum, Diamond, Gold, Silver and Emerging. The category list itself should be configurable.

### Bid increments
Host can configure bid increments using price brackets. Proposed initial example from the product owner:

| Current price bracket | Next bid increment |
|---|---:|
| Below PKR 1 crore | PKR 10 lakh |
| PKR 1 crore to below PKR 2.2 crore | PKR 15 lakh |
| PKR 2.2 crore to PKR 4 crore | PKR 20 lakh |
| Above PKR 4 crore | PKR 25 lakh |

The exact boundary behavior at PKR 4 crore and the initial base-price behavior must be finalized in the auction rules. These values are product-provided examples, not a claim about current official PSL regulations. A named “PSL preset” must be verified against the applicable season's published rules before release. Hosts can override the preset.

### Breaks
- Default behavior: after every five accepted bids, trigger a short break.
- Break duration: configurable by host, with a suggested initial range of 1–3 minutes.
- Host may extend or shorten a break within configured limits and permissions.
- Break countdown is server-authoritative.
- During breaks, show team purse, acquired squads, remaining slots and squad requirement progress.
- Breaks and their durations are recorded in the event history.

Clarify in implementation whether “five bids” means five accepted bids on the current player or five accepted bids across the auction. Recommended initial behavior: five accepted bids on the current player, with a room-level setting to change it.

### Chat and external meeting links
- Each room has its own isolated real-time text chat.
- Team owners and spectators have separate permissions.
- Chat is available during bidding and breaks, subject to moderation and room settings.
- No native voice chat initially.
- External meeting links are disabled by default.
- If enabled, only allowlisted providers (initial examples: Google Meet and Discord) may be shared.
- Validate URLs server-side, display a safe preview, and do not embed arbitrary third-party pages.
- WhatsApp group invite links should not be accepted unless explicitly added to the allowlist after security review.

---

## 8. Live auction room experience

### 8.1 Layout

The auction room is a synchronized shared environment.

- The current user's team table is visually prominent and larger.
- Other participating teams are arranged around the main stage in a circular or spatial layout.
- Other teams' tables are smaller but still legible.
- Each team panel shows logo, name, owner, remaining purse and squad count.
- The central stage shows the current player card and auction state.
- The player's card can flip to reveal additional details.
- A bid action is prominent and available only to an eligible team owner.
- Spectators see the same auction state without bidding controls.

The layout must adapt to different team counts and screen sizes. Eight teams is an important preset, not a fixed layout assumption.

### 8.2 Player card

Front:
- Player name
- Generated initials or approved player image
- Nationality
- Role
- Category
- Auction base price/current price

Back:
- Career and format-specific statistics
- Recent form / recent performance where sourced
- Historical record
- Batting and bowling details where applicable
- Data source and last-updated timestamp

The card flip is a presentation interaction only. It must not affect auction state.

### 8.3 Bid control

- Display current highest bid and leading team.
- Display the next valid bid amount based on the configured increment bracket.
- One clear Bid action.
- Show accepted/rejected confirmation.
- Disable bidding when the user is not an eligible owner, the room is paused, the auction is not accepting bids, or the team cannot afford the bid.
- Backend revalidates every bid regardless of client-side button state.

### 8.4 Team panels and break view

Each team panel shows:
- Team logo and name
- Remaining purse
- Players acquired
- Squad size
- Domestic/overseas count
- Role distribution and remaining requirements

During breaks, show a more detailed squad comparison:
- Completed requirements
- Missing requirements
- Remaining purse
- Available squad slots
- Acquired player list

Player list indicators:
- Batter, bowler, all-rounder or wicketkeeper role icon
- Nationality flag/icon where reliable data is available
- Airplane/overseas indicator for players classified as overseas under that auction's rules
- Do not infer overseas status solely from a flag; use the tournament's configured eligibility rule.

### 8.5 Squad sharing

Users can export a polished squad graphic:
- Team name, logo and colors
- Acquired player names and roles
- Nationality indicators
- Total spend and remaining purse, if the room allows publication
- Auction/tournament name
- Generated timestamp

The export must be generated from a server-confirmed or versioned roster snapshot. Users can download PNG and share it on social platforms. Provide separate layouts for a single team and a multi-team auction summary.

---

## 9. Cricket news, live and player data

### News
- Publicly accessible cricket news feed.
- Article detail pages with title, summary, image, source attribution, publication time and canonical source link.
- Use licensed feeds, publisher partnerships or permitted APIs.
- Do not scrape or republish full copyrighted articles without permission.
- Admin editorial tools for moderation, corrections and source management.

### Live cricket
- Public match listing for currently live matches.
- Match detail page with score, innings, status, teams and available scorecard data.
- Show source and last-updated time.
- Handle stale feeds and provider outages visibly.
- Do not provide live video or audio streams without distribution rights.

### Player database
- Global player records with stable internal IDs.
- Names and aliases.
- Country/nationality.
- Roles and batting/bowling styles where sourced.
- Career statistics by format.
- Team and competition history.
- Source attribution and data freshness.
- Player search and deduplication tools.

The data model must separate player identity from source-specific identifiers. Coverage and completeness depend on licensed/approved data providers and data ingestion work.

---

## 10. Admin and operations platform

A dedicated admin application is required. It is not acceptable to rely on developers manually editing production data for routine operational tasks.

### Staff roles (initial proposal)

- **Super Administrator:** full platform configuration and staff management.
- **Administrator:** broad operational access, excluding selected security-critical actions.
- **Support Agent:** user support, account lookup, case management and permitted account actions.
- **Moderator:** reports, chat moderation, room moderation, content and asset takedowns.
- **Finance/Billing Operator:** payment lookup, subscription status, refunds and reconciliation within limits.
- **Content Editor:** news and player-content corrections within assigned permissions.
- **Read-only Auditor:** view audit and financial records without changing them.

Use granular permissions in addition to named roles. A staff member can have multiple permission grants where appropriate. High-risk actions may require a second approver.

### Admin modules

1. Overview dashboard and operational alerts.
2. User search, profiles, verification and account status.
3. Room and tournament search and management.
4. Auction inspection, event timeline and dispute review.
5. Team and logo asset moderation.
6. Player database and data-source management.
7. News/content moderation and corrections.
8. Payment, subscription, refund and reconciliation management.
9. Support tickets and user complaints.
10. Reports, bans, warnings, suspensions and appeals.
11. Notifications and announcements.
12. Feature flags and maintenance mode.
13. Staff accounts, roles and permissions.
14. Audit logs and security events.
15. System health and provider status.

### One-click operations — with safeguards

The admin UI should make routine tasks efficient, but “one click” must not mean unreviewed destructive actions.

Examples:
- Resend verification email.
- Suspend or reinstate an account.
- Warn a user.
- Remove a reported chat message.
- Mute a user in a room.
- Disable a reported logo.
- Retry a failed provider synchronization.
- Mark a support case resolved.
- Retry a payment reconciliation check.
- Issue an eligible refund.

Sensitive actions require confirmation, reason, permission checks and an audit record. Refunds, permanent bans, staff-role changes and financial adjustments may require approval or additional verification. Never allow admins to silently rewrite a settled auction result or financial ledger; use a compensating adjustment with an audit trail.

### Notifications and announcements

- In-app notification center.
- Real-time notification delivery.
- Maintenance announcements.
- Release/update notices.
- Billing and subscription notices.
- Auction invitations and reminders.
- Support case updates.
- Moderation and appeal updates.

Users can see notification history and mark items read. Marketing notifications require appropriate consent and preference controls.

---

## 11. Non-functional requirements

### Reliability
- Recover live room state after reconnect.
- Persist auction events and financial changes.
- Handle server restarts without losing settled bids or purse balances.
- Gracefully handle data-provider outages.

### Performance
- Fast public page loads.
- Paginated news, player and room listings.
- Efficient player search.
- Low-latency bid broadcasts.
- Avoid broadcasting private data to spectators or unrelated rooms.

### Security
- Cognito-backed authentication.
- Server-side authorization for every protected operation.
- Short-lived access tokens and secure refresh/session handling.
- Rate limiting and abuse detection.
- Input validation and safe file processing.
- Webhook signature verification.
- Audit logs for privileged actions.
- Room isolation and tenant-aware access checks.

### Accessibility and responsive design
- Keyboard-accessible navigation and bidding controls.
- Visible focus states and sufficient contrast.
- Reduced-motion support.
- Responsive desktop/tablet/mobile layouts.
- Do not rely on color alone to communicate bid or team state.

### Observability
- Structured logs.
- Error tracking.
- Metrics for room connections, bid acceptance/rejection, auction settlement, provider latency and payment callbacks.
- Alerts for failed settlements, inconsistent purse ledgers and repeated socket disconnections.

---

## 12. Success criteria

Initial product success should be measured through:
- Successful sign-up and verified-account completion.
- Host subscription conversion.
- Auction room creation completion.
- Team-owner join completion.
- Spectator join completion.
- Bid acceptance latency and rejection reasons.
- Auction completion rate.
- Reconnection recovery rate.
- Payment success and reconciliation rate.
- Player/news/live data freshness.
- Support case resolution time.
- Moderation response time.

Do not optimize only for page views. Auction completion, trust, fairness and repeat usage are central.

---

## 13. Open decisions to resolve before implementation

These are deliberately recorded as unresolved instead of silently guessed:

1. Exact host subscription plans, limits, prices and billing period.
2. Whether private tournament entry fees are charged in the first release or only host subscriptions.
3. Exact PSL preset rules for the target season, including squad and overseas limits.
4. Exact bid increment bracket boundary behavior, including the PKR 4 crore boundary.
5. Whether the five-bid break counter applies per player or across the entire auction.
6. Whether a team owner can join after the auction starts, and under what conditions.
7. Whether the host can participate as a team owner in both manual and automatic player-selection modes.
8. Whether chat is enabled for spectators by default.
9. Exact maximum room/team/spectator limits per subscription tier.
10. First cricket data provider(s), licensing, attribution and coverage.
11. Safepay product/API choice and refund capabilities; future international provider(s).
12. Exact file limits and moderation/retention policy for team logos.
13. Whether users can export or publicly share room snapshots while an auction is still live.
14. The precise team-owner and spectator capacity behavior for public first-come-first-served rooms.

These should become explicit configuration or approved product decisions before the relevant feature is released.
