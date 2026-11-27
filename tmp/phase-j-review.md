# Phase J — Live Auction Frontend Spec: Design Review

**Verdict: CHANGES_REQUESTED**
**Reviewer:** Design review subagent (fresh context)
**Date:** 2026-11-26
**Target under review:** `d:\UNDER-THE-HAMMER\.agents\tasks\phase-j-live-auction-frontend-spec.md`

---

## Blocking problem: the specification does not exist

The document I was asked to review is not present at the named path, and no equivalent exists anywhere in the repository.

### What I checked

1. Exact path `d:\UNDER-THE-HAMMER\.agents\tasks\phase-j-live-auction-frontend-spec.md` — `Test-Path` returns `False`.
2. Full file listing of `.agents\` and `.agents\tasks\` — no file matching `phase-j*`, `phase_j*`, or `live-auction*`. The `tasks\` folder holds only `phase-d` through `phase-i` artifacts.
3. Repository-wide name search for `phase.?j` / `live.?auction` files — no matches.
4. The only Phase J document that exists, `.agents\PHASE_I_COMPLETION_AND_PHASE_J_LAUNCH.md`, is a launch/summary brief. It explicitly records Phase J status as **"Planning phase"** and lists the components/hooks to be *designed*, confirming the spec had not yet been authored.

### Why this blocks

A design review cannot proceed without a design document. The ten review dimensions requested (component APIs, hook contracts, real-time event coverage, error-code mapping, breakpoints, accessibility, test scope, hardcoded-value audit, data-integrity/reconciliation, and Phase H/I integration) each require concrete written content to evaluate. None of it can be assessed against an absent file. Per the review mandate — "if the design doesn't stand on its own, it's not ready for implementation" — a nonexistent design is the strongest possible form of not-ready.

### Concrete fix

1. Author the specification and save it at the expected path `d:\UNDER-THE-HAMMER\.agents\tasks\phase-j-live-auction-frontend-spec.md` (or correct the review step's input path to point at the real location if it was written elsewhere).
2. The spec must cover, at minimum, the items the launch brief enumerates so this review can evaluate them:
   - **Component APIs** — full prop type tables and state-transition descriptions for `BidPlacementForm`, `BidHistory`, `PlayerIntroduction`, `TeamStandings`, `RealTimeStats`, `BidPlacementError`.
   - **Hook contracts** — input/return signatures for `useBidPlacement`, `useAuctionRealTime`, `useAuctionState`, with each subscribed event named and bound to the concrete Phase I gateway event (verify against the Phase I realtime contracts in `.agents\tasks\phase-i-realtime\`).
   - **Real-time event handling** — explicit handling for `BID_ACCEPTED`, `BID_REJECTED`, `PLAYER_INTRODUCED`, `PLAYER_SOLD`, `BREAK_STARTED`, `BREAK_ENDED`, `SQUAD_UPDATED`, `PRESENCE_UPDATE`.
   - **Error mapping** — each Phase G bid rejection code (`INSUFFICIENT_PURSE`, `INVALID_INCREMENT`, `UNAUTHORIZED_TEAM`, and the remaining codes from the 12-step validation pipeline) mapped to a user-facing message and recovery suggestion.
   - **Layout/responsiveness** — defined behavior at 375px, 768px, 1024px, 1440px.
   - **Accessibility** — keyboard flows (Tab, Enter, Esc), focus-state rules, semantic HTML, and WCAG AA contrast targets.
   - **Testing** — the >80% unit coverage target plus E2E bid-flow and responsive tests, scoped to concrete files.
   - **Hardcoded-value prohibition** — statement that team count, purse, categories, increments, durations all come from room/auction state (per AGENTS.md locked decisions).
   - **Data integrity** — optimistic-update reconciliation, idempotency-key generation/reuse, and reconnect state-fetch behavior.
   - **Integration points** — how the layout consumes the Phase H break overlay and Phase I `useRoomChat`, `usePresence`, `useBreakSocket` hooks.
3. Re-run this review step against the authored spec.

---

## Findings

See `findings` in the companion verdict JSON. There is a single HIGH finding (missing spec) that blocks; no other dimension can be assessed until the document exists.

## Verified Assumptions

- Phase I is merged and provides the real-time gateways/hooks Phase J must integrate with (confirmed via `.agents\PHASE_I_COMPLETION_AND_PHASE_J_LAUNCH.md` and the `.agents\tasks\phase-i-realtime\` review artifacts).

## Unverified / Wrong Assumptions

- **Wrong:** The review task assumes a spec exists at `.agents\tasks\phase-j-live-auction-frontend-spec.md`. It does not. Either the planning step did not write it, or it was written to a different location not discoverable by name search. This must be resolved before any content review is possible.
