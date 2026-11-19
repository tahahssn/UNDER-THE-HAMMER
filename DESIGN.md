# Under The Hammer — Design System and Experience Direction

**Status:** Design baseline  
**Version:** 1.0  
**Date:** 2026-11-03

---

## 1. Product design objective

Under The Hammer should feel like a serious cricket platform with a premium, high-energy auction experience. It should not look like a generic admin dashboard, a betting site or a template marketplace.

The public site must communicate cricket coverage and product credibility. The auction experience should feel like a live event: focused, spatial, competitive and easy to understand under time pressure.

The design system must serve:
- Public visitors
- Cricket readers
- Team owners
- Auction hosts
- Spectators
- Support and administrative staff

Do not use one visual treatment for every page. The marketing website, live auction stage and admin workspace have different jobs, while sharing typography, spacing, colors and component foundations.

## 2. Brand direction

Working brand: **Under The Hammer**

The name should be treated as the product identity. Do not use PSL branding as the platform's own identity.

### Visual character
- Dark, confident, editorial and sports-focused.
- Strong typography and clear information hierarchy.
- Restrained accent colors.
- Team identity colors are dynamic and user-controlled.
- Avoid excessive gradients, glassmorphism, neon borders and decorative noise.
- Use motion to communicate state changes, not to decorate every element.

### Color tokens

Use semantic tokens so themes can evolve without rewriting components.

| Token | Intended use |
|---|---|
| `--color-bg` | Main application background |
| `--color-surface` | Cards and panels |
| `--color-surface-raised` | Elevated panels and overlays |
| `--color-border` | Subtle separators |
| `--color-text` | Primary text |
| `--color-text-muted` | Secondary metadata |
| `--color-accent` | Primary brand action |
| `--color-success` | Accepted bid / sold state |
| `--color-warning` | Timer warning / pending |
| `--color-danger` | Rejected action / error |
| `--color-info` | Neutral informational state |

Initial direction may use a deep charcoal base with a warm metallic or amber accent, but final brand colors and logo should be approved before polishing. Team colors must never be hard-coded into the global brand palette.

### Team color treatment
- Every team has primary and optional secondary colors.
- Use team colors for logo backplates, table highlights, small accent rails and team-specific cards.
- Maintain contrast for text and controls.
- Do not recolor the entire application to match one team.
- In the auction room, the current user's team can receive a stronger outline and larger panel.

## 3. Typography

Use a modern, highly legible sans-serif family for UI and data. Use a distinctive display face only for major marketing headlines or auction-stage moments.

Requirements:
- Clear numeral design for bids, purse and countdown.
- Tabular numerals for changing prices and timers.
- Avoid ultra-light text for essential information.
- Keep small metadata readable on mobile.
- Use consistent weights and line heights.

## 4. Motion principles

Use Framer Motion for component and route-level transitions. Use GSAP for orchestrated auction sequences where precise timelines are needed.

Motion should:
- Confirm a bid was accepted.
- Highlight the leading team.
- Transition between player introduction, bidding, break and settlement.
- Animate sold/unsold moments.
- Reveal a player card's back.
- Update purse and roster values without confusing the user.

Motion must not:
- Delay a bid action.
- Hide important data behind long animation.
- Make the timer inaccurate.
- Imply an unconfirmed bid is accepted.
- Cause layout shifts that move the bid control unexpectedly.

Respect `prefers-reduced-motion`. Provide a reduced-motion version of major sequences.

## 5. Global navigation and information architecture

### Public navigation

Primary navigation:
- Home
- About
- News
- Live
- Auction

Account actions:
- Sign in
- Sign up

The Auction item opens the auction marketing page. It does not automatically enter a room.

### Signed-in profile dropdown

Top-right avatar opens a menu with:
- Profile summary
- Auction
- Account settings
- Billing / subscription
- Notifications
- Sign out

As more product areas ship, additional destinations can be added without creating an unrelated dashboard solely for navigation.

### Authenticated auction entry page

The signed-in auction page provides:
- Host an auction
- Join public auction
- Join private auction
- Spectate public auction
- Enter private spectator room
- Active auctions
- Recent/past auctions

Host action displays subscription eligibility and plan information. Do not hide the reason a user cannot host.

## 6. Public page design

### Home
- Clear brand statement.
- Cricket information preview.
- Live match preview.
- Latest news.
- Player discovery preview.
- Auction feature explanation and CTA.
- Footer with legal, contact and social links.

### About
- Product mission.
- Cricket coverage direction.
- Auction platform explanation.
- Team and product credibility.
- Clear non-affiliation/licensing language where appropriate.

### News
- Editorial grid/list with category, source, publication time and image.
- Article pages with attribution and link to the original publisher.
- Search and filters when content volume justifies them.

### Live
- Match cards grouped by live/upcoming/completed.
- Clear match status.
- Score and innings hierarchy.
- Provider/source and last-updated timestamp.
- Stale/unavailable state.

### Auction marketing
- Explain how auctions work.
- Explain host subscription requirement.
- Explain free participation.
- Compare public/private rooms.
- Explain team creation and custom logos.
- Explain countdown and turn-based formats.
- Explain host-controlled and automatic auctions.
- Explain spectator access.
- CTA changes based on authentication state.

## 7. Auction room composition

The auction room is a dedicated full-screen or near-full-screen environment.

### Desktop layout

Recommended structure:
1. Top status bar: room name, auction status, connection state, room actions.
2. Team table ring: current user's team visually prominent; other teams arranged around the stage.
3. Central player stage: player identity, category, current bid, leading team and timer.
4. Bid action area: next valid bid and prominent Bid button.
5. Lower/side information: event log, chat, player queue and room participants.
6. Break overlay: timer, squad comparisons, requirements and purse information.

The team layout must adapt to 2–N teams. Do not design a fixed eight-panel grid and assume it will scale.

### Current user's team
- Larger than other team panels.
- Stronger border/outline.
- Team logo and name.
- Remaining purse in prominent tabular numerals.
- Acquired player count.
- Compact roster preview.

### Other teams
- Smaller panels around the stage.
- Team logo/name.
- Remaining purse.
- Squad count.
- Current high-bid indicator when relevant.

### Player card
Front:
- Name and generated initials or approved image.
- Role and category.
- Nationality.
- Base/current price.
- Clear status.

Back:
- Statistics grouped by format.
- Career and recent performance.
- Source and freshness metadata.
- Clear close/flip affordance.

Do not overload the front with every statistic. The auction must remain readable at a glance.

### Bid control
- One primary action.
- Show exact next bid amount.
- Explain why bidding is disabled.
- Provide immediate accepted/rejected feedback.
- Use a confirmation state for high-risk host actions, not every normal bid.

### Countdown
- Large enough to read.
- Warning state as deadline approaches.
- Use server deadline; animation is visual only.
- Avoid flashing or strobing effects.

## 8. Break experience

Breaks are a deliberate information phase, not an empty waiting screen.

Show:
- Break timer and reason.
- Remaining purse for every team.
- Squad list for each team.
- Role distribution.
- Domestic/overseas progress under room rules.
- Remaining squad slots.
- Completed and missing requirements.
- Room chat.

Host controls to extend or shorten break time must be visible only to authorized hosts and show the resulting new deadline to all participants.

## 9. Squad and player indicators

- Role icon before player name: batter, bowler, all-rounder or wicketkeeper.
- Nationality flag/icon where the data source is reliable.
- Overseas marker for players considered overseas under the tournament's configured rules.
- Do not use an airplane symbol as the sole explanation; provide an accessible label or tooltip.
- Never determine overseas eligibility solely from nationality display; use the room's rules.

## 10. Chat design

- Room-scoped message stream.
- Clear author identity and team affiliation.
- Distinguish host/system notices from user messages.
- Show moderation state when a message is removed.
- Rate-limit feedback and muted-user state.
- Do not allow chat to cover the bid button or timer.
- External meeting links appear as safe, clearly labeled link cards only when enabled and allowlisted.

## 11. Team and squad exports

Provide:
- Team squad poster.
- Auction-wide team comparison poster.
- Optional player acquisition ticket.

Exports should:
- Use team identity colors.
- Keep text readable at social sharing sizes.
- Show the auction name and date.
- Include only data allowed by room visibility settings.
- Be generated from a confirmed roster snapshot.
- Support PNG download.
- Avoid using official marks unless the uploader has rights.

## 12. Admin design

Admin is a high-density operational interface, not a marketing site.

Design around:
- Search-first navigation.
- Queues and case status.
- Clear resource context.
- Permission-aware actions.
- Audit history beside sensitive changes.
- Strong distinction between reversible and irreversible actions.
- Confirmation and reason fields for bans, refunds and financial corrections.
- Real-time notifications and provider/system health.

Use table/list views for large datasets, with filters, pagination and saved views. Avoid decorative cards where a dense operational table is more effective.

## 13. Responsive behavior

### Desktop
- Full auction team ring and central stage.
- Persistent team and purse context.
- Chat and event log visible in side/lower panels.

### Tablet
- Reduce team panel size.
- Keep current user's team and central player prominent.
- Use tabs or drawers for chat and detailed squad comparison.

### Mobile
- Prioritize current player, current bid, next bid and Bid action.
- Present teams in a horizontally scrollable or compact list.
- Keep the user's team pinned or easy to access.
- Move chat and detailed squad views into tabs/drawers.
- Never require horizontal scrolling to place a bid.
- Ensure timer and bid action remain visible.

## 14. Accessibility

- Semantic HTML and landmarks.
- Keyboard-accessible menus, dialogs and bid controls.
- Visible focus.
- Adequate text and control contrast.
- Accessible names for icons.
- Announce bid acceptance and auction state changes without overwhelming screen readers.
- Reduced motion.
- Do not rely on color, sound or animation alone.
- Provide captions/text equivalents for audio cues.

## 15. Design component inventory

Shared:
- Button, icon button, input, select, dialog, dropdown, tabs, tooltip
- Toast/notification
- Avatar and user menu
- Badge/status pill
- Data table
- Empty/loading/error states
- Pagination and filters

Cricket:
- Player card
- Player statistic group
- Match card
- Live score strip
- News card
- Team identity card

Auction:
- Auction room header
- Team table
- Purse display
- Player stage
- Flip player card
- Bid control
- Countdown
- Turn indicator
- Break panel
- Squad requirement meter
- Chat panel
- Auction event log
- Sold/unsold overlay
- Acquisition ticket
- Squad export

Admin:
- Staff sidebar
- Case queue
- User detail panel
- Audit timeline
- Payment detail panel
- Moderation action dialog
- Permission editor
- Notification composer

## 16. Design acceptance criteria

- Visual hierarchy makes the next user action obvious.
- Live auction information remains readable under rapid updates.
- Current user's team is clearly identifiable.
- Spectator mode cannot be mistaken for bidding mode.
- Public pages are SEO-friendly and usable without authentication.
- Team colors do not break contrast.
- All major pages work at desktop, tablet and mobile sizes.
- Reduced-motion mode remains fully usable.
- No animation blocks auction interaction.
