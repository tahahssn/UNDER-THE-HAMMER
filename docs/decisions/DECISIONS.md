# Decisions Register

Unresolved items copied from `PRD.md` section 13 and `ONE_GO_IMPLEMENTATION_PLAN.md` Phase A. None are resolved here. Implementation must expose each as configuration (or a disabled capability) until an approved answer is recorded.

Status values: `OPEN`, `DEFERRED`, `APPROVED`.

| ID | Question | Why it affects implementation | Status | Owner | Decision date | Approved answer / deferral | Interim engineering handling |
|---|---|---|---|---|---|---|---|
| D-01 | Host subscription plans, limits, prices, billing period | Entitlement service, billing UI, room limits | OPEN | Product owner | - | - | Plans, prices and limits stored as admin-editable `SubscriptionPlan` rows. No prices hard-coded. |
| D-02 | Are private-tournament entry fees in the first payment release? | Payment scope, refunds, legal handling | OPEN | Product owner | - | - | Data model and adapter support it. Feature flag `tournamentEntryFees` stays off. |
| D-03 | Verified PSL season preset (squad size, overseas limits, purse) | Preset content | OPEN | Product owner | - | - | No PSL preset is shipped as "official". A generic editable template only. |
| D-04 | Bid increment bracket boundary behavior (is PKR 4 crore in the 20 lakh or 25 lakh bracket? initial base-price behavior) | Increment engine | OPEN | Product owner | - | - | Brackets stored as data with explicit `inclusive` flag per bound. Sample brackets are labelled "example". |
| D-05 | Break counter scope: five accepted bids per player or across the auction | Break scheduler | OPEN | Product owner | - | PRD recommends per player, pending approval | Setting `breakCounterScope = PER_PLAYER \| PER_AUCTION`. Default marked pending approval. |
| D-06 | Turn-based rules: pass, re-entry, close condition, optional HOLD | Turn engine | OPEN | Product owner | - | - | Policy fields on the config snapshot. Engine refuses to start turn-based auctions until the policy is set. |
| D-07 | Can a team owner join after the auction starts, and when | Admission and allocation | OPEN | Product owner | - | - | `lateJoinPolicy` room setting, default `DISALLOWED`. |
| D-08 | Can the host also be a team owner in manual and automatic selection modes | Host participation | OPEN | Product owner | - | - | `hostParticipates` is a separate setting and requires a separate owner assignment. |
| D-09 | Is spectator chat on by default | Chat permissions | OPEN | Product owner | - | - | `spectatorChatEnabled` setting, default `false`. |
| D-10 | Room, team and spectator limits per subscription tier | Entitlements, capacity checks | OPEN | Product owner | - | - | Limits read from `SubscriptionEntitlement`. |
| D-11 | First cricket data and news provider(s), rights, attribution, coverage | Ingestion adapters, public pages | OPEN | Product owner | - | - | Provider interface and "unavailable" UI states only. No fabricated data. |
| D-12 | Safepay product/API choice, webhook signing, refund and settlement capabilities; international provider | Payment adapter | OPEN | Product owner | - | - | Provider-neutral interface. Safepay docs to be verified before integration. |
| D-13 | Logo upload limits, moderation, retention policy | File pipeline | OPEN | Product owner | - | - | Limits are config values. Defaults are proposals only. |
| D-14 | Can live-room snapshots be exported or shared publicly while the auction is live | Export permissions | OPEN | Product owner | - | - | Exports allowed only after completion until approved. |
| D-15 | Public first-come-first-served team-owner and spectator capacity behavior | Admission transactions | OPEN | Product owner | - | - | Separate capacity counters, atomic slot reservation. |
| D-16 | Currency and money unit (PKR minor units, other currencies) | Money handling everywhere | OPEN | Product owner | - | - | Integer minor units plus an explicit currency code on every money column. |
| D-17 | Hosting platform with confirmed WebSocket and worker support | Deployment | OPEN | Product owner | - | - | Containerized apps. Hosting chosen after a WebSocket spike. |
| D-18 | Legacy Streamlit app: retain, retire, or keep the valuation model only | Repository layout | OPEN | Product owner | - | Default proposal: keep the valuation logic as `services/valuation`, retire the UI | Nothing deleted yet. |
