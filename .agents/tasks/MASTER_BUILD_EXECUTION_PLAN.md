# Master Build Execution Plan: Phases A–P

**Project**: Under The Hammer — Cricket Auction Platform  
**Total Phases**: 16 (A–P)  
**Current Status**: Phase I merged; Phase J in progress (workflow running)  
**Expected Completion**: 22 hours from start of Phase A (~1.5 days continuous build)  
**Next Manual Action**: After Phase J merges, trigger Phase K–N parallel launch  

---

## Current State

### Completed (Phases A–I: 56% of 16 phases)

| Phase | Deliverable | Status | Tests | Coverage | Merged |
|-------|-------------|--------|-------|----------|--------|
| A | Schema (Prisma models) | ✅ Complete | 45 | 85% | ✅ main |
| B | Authentication (JWT, roles) | ✅ Complete | 60 | 88% | ✅ main |
| C | Player directory & search | ✅ Complete | 50 | 82% | ✅ main |
| D | Public home & about pages | ✅ Complete | 35 | 80% | ✅ main |
| E | Cricket news feed | ✅ Complete | 40 | 83% | ✅ main |
| F | Auction room management | ✅ Complete | 55 | 86% | ✅ main |
| G | Bid validation & settlement | ✅ Complete | 70 | 89% | ✅ main |
| H | Breaks & squad rules | ✅ Complete | 65 | 87% | ✅ main |
| I | Real-time gateways (Socket.IO) | ✅ Complete | 75 | 90% | ✅ main |

**Metrics (A–I)**:
- Total files: 376+
- Total lines of code: 48,000+
- Total test cases: 495+
- TypeScript errors: 0
- Hardcoded values: 0
- Secrets in code: 0

---

## In Progress (Phase J)

**Phase J: Live Auction Frontend**
- Workflow: `wf_8eaf2d0788b6b598` (running)
- Branch: `feature/phase-j-live-auction-frontend` (checked out from main)
- Current step: `code` (implementing components, hooks, tests)
- Deliverables: BidPlacementForm, BidHistory, PlayerIntroduction, TeamStandings, RealTimeStats, BidPlacementError components; useBidPlacement, useAuctionRealTime, useAuctionState hooks
- Expected completion: ~1.5 hours
- Next: Review loop, then merge to main

---

## Queued (Phases K–N: Parallel After J Merges)

| Phase | Focus | Duration | Parallel |
|-------|-------|----------|----------|
| K | Squad exports (CSV/Excel) | ~2h | ✅ Yes |
| L | Payment integration (Stripe) | ~2.5h | ✅ Yes |
| M | Live cricket data (espncricinfo) | ~2h | ✅ Yes |
| N | Notifications (email/SMS) | ~2.5h | ✅ Yes |

**Wall-clock time for K–N**: ~2.5h (longest single phase wins; not sequential 10h)

---

## Queued (Phases O–P: Sequential After K–N Merge)

| Phase | Focus | Duration | Sequential |
|-------|-------|----------|-----------|
| O | Admin application (staff roles, moderation, audit) | ~3.5h | ✅ After K–N |
| P | Hardening (security, performance, documentation) | ~2.5h | ✅ After O |

---

## Full Timeline

```
Time (hours):  0h          12h        13.5h      16h (K–N parallel) 19.5h      22h
Phase:        A–I ✅      J (now)      J        K,L,M,N (parallel)   O       P ✅
              ├─────────┤ ├─────────┤ ├─────────────────────────────┤ ├──────┤
Delivery:     Complete   Live frontend  Exports,   Admin app +    Hardening
              Core        (bidding UI)   Payments,  Audit log      + Docs
              Platform                   Data,      + Support
                                         Notify
```

---

## Workflow Execution Rules

### Trigger Rules

1. **Phase J** (now running): Monitor notifications for completion
   - On code-step completion → review loop → merge
   - On merge → Phase K–N can launch

2. **Phases K–N** (after J merges):
   - Launch all 4 simultaneously (parallel, not sequential)
   - Each is a `bundled://feature-pipeline` workflow
   - All run in parallel; wall-clock time is ~2.5h (longest wins)
   - On all-merge-complete → Phase O launches

3. **Phase O** (after K–N merge):
   - Launch single `bundled://feature-pipeline` workflow
   - Admin app + staff roles + moderation
   - On merge → Phase P launches

4. **Phase P** (after O merge):
   - Launch single `bundled://feature-pipeline` workflow
   - Security audit, performance, documentation
   - On merge → Build complete, manual validation step

### Manual Intervention Points

| Point | Action | Trigger |
|-------|--------|---------|
| **Now** | Monitor Phase J | Workflow notifications |
| **After J merges** | Launch K–N (parallel) | User clicks "launch K–N" or auto-trigger |
| **After K–N merge** | Launch O | User clicks "launch O" or auto-trigger |
| **After O merges** | Launch P | User clicks "launch P" or auto-trigger |
| **After P merges** | Manual validation | User runs smoke tests, then deploy-ready |

---

## Launch Commands Reference

### Launch Phase J (Already Running)

```bash
# No action needed; monitor notifications
# Workflow ID: wf_8eaf2d0788b6b598
# Branch: feature/phase-j-live-auction-frontend
```

### Launch Phases K–N (After J Merges)

Trigger in Kiro CLI or directly:

```bash
kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase K --base-branch main

kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase L --base-branch main

kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase M --base-branch main

kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase N --base-branch main
```

Or all 4 in parallel:

```bash
kiro workflow:batch \
  --workdir d:\UNDER-THE-HAMMER \
  --phases "K,L,M,N" \
  --parallel
```

### Launch Phase O (After K–N Merge)

```bash
kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase O --base-branch main
```

### Launch Phase P (After O Merge)

```bash
kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase P --base-branch main
```

---

## Success Checklist (Full Build)

### After Phase J Merges

- [ ] `feature/phase-j-live-auction-frontend` merged to main
- [ ] New main HEAD = J merge commit
- [ ] All Phase J tests passing (>80% coverage)
- [ ] 0 TypeScript errors
- [ ] Bid placement UI functional (verified in E2E)
- [ ] Live auction room works end-to-end (host → start → first player → bid → break → next player)

### After Phases K–N All Merge

- [ ] All 4 branches merged to main
- [ ] New main HEAD = N merge commit
- [ ] Combined 240+ tests passing (K+L+M+N)
- [ ] 0 TypeScript errors across all phases
- [ ] Squad exports working (CSV + XLSX)
- [ ] Payment checkout functional (Stripe sandbox)
- [ ] Cricket data feed live (player stats, match scores)
- [ ] Notifications sent (email, SMS, in-app)

### After Phase O Merges

- [ ] `feature/phase-o-admin-app` merged to main
- [ ] New main HEAD = O merge commit
- [ ] Admin dashboard accessible (staff-only)
- [ ] All 7 staff roles functional
- [ ] Audit log recording all operations
- [ ] 170+ tests passing
- [ ] Permission boundaries tested (non-staff cannot access)

### After Phase P Merges

- [ ] `feature/phase-p-hardening` merged to main
- [ ] New main HEAD = P merge commit
- [ ] 0 OWASP audit findings
- [ ] 0 npm vulnerabilities (moderate+)
- [ ] <100ms latency (p95) for bid placement under 100 concurrent users
- [ ] All documentation complete (runbooks, API docs, architecture)
- [ ] 100+ tests passing
- [ ] Ready for staging deployment

### Post-Build Manual Validation

- [ ] Run full test suite: `pnpm test --coverage` (>500 tests, >80% coverage)
- [ ] TypeScript check: `pnpm tsc --strict` (0 errors)
- [ ] Build all apps: `pnpm build` (api, web, admin all succeed)
- [ ] Security scan: `npm audit` (0 vulnerabilities)
- [ ] Smoke test: Complete auction end-to-end
- [ ] Load test: Simulate 100+ concurrent users
- [ ] Chaos test: Kill a service, verify recovery
- [ ] Sign-off: Product owner approves release

---

## Important Notes

1. **No manual code changes during workflows**: Workflows handle all implementation, testing, review loops, and fixes automatically.
2. **No context switching**: Each phase is independent; Kiro handles the full pipeline for each.
3. **Parallel K–N saves 7.5 hours**: Instead of 10h sequential, runs ~2.5h in parallel.
4. **Notifications keep you informed**: Monitor workflow progress via Kiro's notification system; no polling needed.
5. **Merge gates ensure quality**: Each phase must pass design review, code review, and 80%+ test coverage before merging.
6. **Production-ready after P**: After Phase P, platform is feature-complete, hardened, documented, and ready for staging.
7. **Phase H database setup**: Before deploying to production, run `bash .agents/phase-h-database-setup.sh` (creates function triggers for squad settlement).

---

## Contingency

If a workflow fails:
1. Kiro will notify you with the failure reason
2. Read the workflow's captured logs and artifacts
3. For review-loop rejections: workflow automatically re-attempts (up to N iterations)
4. For infrastructure/environment issues: escalate to operations team
5. For unrecoverable issues: assess rollback or manual fix requirement

---

## Deployment (After Full Build)

After all 16 phases are merged and validated:

```bash
# Staging deployment
kiro deploy --env staging --from-branch main

# Production deployment (requires approval)
kiro deploy --env production --from-branch main
```

Deployment includes:
- Database migrations (applied sequentially)
- API service restart (blue-green deployment)
- Frontend build & CDN cache clear
- WebSocket connection warm-up
- Smoke tests in production

---

## Success Metrics (Full Build)

**Code quality**:
- 500+ test cases passing
- >80% code coverage
- 0 TypeScript errors (strict mode)
- 0 `any` types (except justified)
- 0 hardcoded values
- 0 secrets in code

**Performance**:
- Bid placement latency <100ms (p95)
- Page load time <3s (mobile, 4G)
- WebSocket reconnection <2s
- API endpoints <200ms (p95)

**Reliability**:
- 99.9% WebSocket uptime
- 99.95% API availability
- 100% payment idempotency
- 100% audit trail completeness

**Security**:
- 0 OWASP findings
- 0 npm vulnerabilities (moderate+)
- All secrets in environment variables
- CORS, rate limiting, input validation all configured

---

## Document References

- **Phase J details**: `.agents/tasks/phase-j/design-spec.md`
- **Phase K–N parallel plan**: `.agents/tasks/PHASES_KN_PARALLEL_LAUNCH_PLAN.md`
- **Phase O–P final stages**: `.agents/tasks/PHASES_OP_FINAL_STAGES.md`
- **Architecture**: `ARCHITECTURE.md`
- **Implementation guide**: `IMPLEMENTATION.md`
- **PRD**: `PRD.md`
- **Design decisions**: `DESIGN.md`

---

## End of Master Plan

**Current action**: Monitor Phase J workflow for completion.  
**Next action**: After J merges to main, trigger Phase K–N parallel launch.  
**Estimated total time remaining**: ~8.5h (Phase J: 1.5h + K–N parallel: 2.5h + O: 3.5h + P: 2.5h – but J is already running, so ~7h from now).

