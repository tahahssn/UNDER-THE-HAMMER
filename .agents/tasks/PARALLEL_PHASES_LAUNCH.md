# Phases K–N: Parallel Launch (Ready Now)

**Status**: Ready to launch immediately (Phase J at cc5c32a merged to main)  
**Timing**: Launch all 4 workflows simultaneously  
**Wall-clock time**: ~2.5 hours (longest phase wins)  
**Base branch**: main (cc5c32a)  
**Workflows**: 4× `bundled://feature-pipeline` (independent, parallel)

---

## Launch Commands

Execute these in parallel (4 terminals, or one workflow-batch command):

### Terminal 1: Phase K (Squad Exports)
```bash
cd d:\UNDER-THE-HAMMER
pnpm run workflow:launch phase-k-squad-exports
# or
kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase K --base-branch main
```

### Terminal 2: Phase L (Payment Integration)
```bash
cd d:\UNDER-THE-HAMMER
pnpm run workflow:launch phase-l-payments
# or
kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase L --base-branch main
```

### Terminal 3: Phase M (Cricket Data)
```bash
cd d:\UNDER-THE-HAMMER
pnpm run workflow:launch phase-m-cricket-data
# or
kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase M --base-branch main
```

### Terminal 4: Phase N (Notifications)
```bash
cd d:\UNDER-THE-HAMMER
pnpm run workflow:launch phase-n-notifications
# or
kiro workflow:run bundled://feature-pipeline \
  --workdir d:\UNDER-THE-HAMMER \
  --phase N --base-branch main
```

### Or All at Once (Batch)
```bash
kiro workflow:batch \
  --workdir d:\UNDER-THE-HAMMER \
  --phases "K,L,M,N" \
  --parallel \
  --base-branch main
```

---

## What Each Phase Does

| Phase | Focus | Duration | Deliverables |
|-------|-------|----------|--------------|
| **K** | Squad exports (CSV/XLSX) | 2h | Service + 2 endpoints, frontend hook + component, 45+ tests |
| **L** | Stripe payments | 2.5h | Service + webhook, ledger table, frontend checkout, 70+ tests |
| **M** | Cricket data (espncricinfo) | 2h | Provider interface + impl, service, 2 endpoints, frontend stats, 60+ tests |
| **N** | Notifications (email/SMS/in-app) | 2.5h | 3 adapters, service, 2 endpoints + preferences, frontend bell + list + prefs, 90+ tests |

---

## Detailed Briefs

Each phase has a full specification:
- **PHASE_K_LAUNCH_BRIEF.md** — Squad exports specification
- **PHASE_L_LAUNCH_BRIEF.md** — Payment integration specification
- **PHASE_M_LAUNCH_BRIEF.md** — Cricket data specification
- **PHASE_N_LAUNCH_BRIEF.md** — Notifications specification

All briefs follow the same structure:
1. Backend deliverables (services, endpoints, schema migrations)
2. Frontend deliverables (components, hooks)
3. Tests (60+ per phase, >85% coverage)
4. Integration points (which prior phases they depend on)
5. Success criteria (what proves each phase is complete)
6. Files to create/modify
7. Environment variables needed
8. Decisions already made

---

## Independence Verification

All 4 phases are **independent** (no cross-dependencies):

| Phase | Depends On | Notes |
|-------|-----------|-------|
| **K** | F, G | Auction rooms (F) + bid settlement (G); no K→L/M/N deps |
| **L** | B, existing | Auth (B); future room-creation gate; independent of K/M/N |
| **M** | C | Player directory (C) for enrichment; independent of K/L/N |
| **N** | G, H, L (optional) | Bid/break events for triggers; L optional (subscription notify); independent of K/M |

**Parallelization is safe**: each has its own feature branch, schema migrations, tests, and no conflicts.

---

## Merge Order (After All Complete)

Expect each workflow to merge in sequence (not simultaneously):
1. First workflow completes & merges → new main HEAD
2. Next workflow starts, pulls latest main, commits to its branch
3. Repeat for all 4

This is automatic in `bundled://feature-pipeline` (each step rebases/fast-forwards).

**Final result**: main HEAD has all 4 merged; next phase (O, Admin App) can launch from new main.

---

## Success Criteria (All 4 Phases)

- [ ] All 4 feature branches created (`feature/phase-k/l/m/n-*`)
- [ ] All 4 implementations complete (services, endpoints, components)
- [ ] All 4 tests passing (260+ total tests, >85% coverage each)
- [ ] All 4 TypeScript strict (0 errors, no `any`)
- [ ] All 4 merged to main
- [ ] No hardcoded values (all configurable via env or config)
- [ ] No secrets in code
- [ ] No cross-phase conflicts

---

## Timeline

```
Parallel Launch (simultaneous):
├─ Phase K: estimate 2h ─────────────┐
├─ Phase L: estimate 2.5h ───────────┤
├─ Phase M: estimate 2h ─────────────┼─ Longest = ~2.5h (wall-clock time)
├─ Phase N: estimate 2.5h ───────────┤
└─ All complete & merge to main: ~2.5h ─┘

vs Sequential K→L→M→N: 2 + 2.5 + 2 + 2.5 = 9h
Parallelization saves: 9 - 2.5 = 6.5 hours ✓
```

---

## Post-Launch (After All Merge)

Once all 4 phases merge to main:

1. **Verify main**: `git log --oneline -5` should show 4 recent merge commits
2. **Run full test suite**: `pnpm test --coverage`
   - Expected: >500 tests passing, >80% coverage
3. **TypeScript check**: `pnpm tsc --strict`
   - Expected: 0 errors
4. **Launch Phase O** (Admin App)
   - Workflow: `bundled://feature-pipeline --phase O`
   - Base branch: main (new post-merge HEAD)

---

## Environment Setup (Before Launch)

Ensure these are in `.env.local` or CI secrets:

```bash
# Phase L (SafePay - Pakistan Payment Provider)
SAFEPAY_API_KEY=...
SAFEPAY_WEBHOOK_SECRET=...

# Phase M (Cricket Data - ESPN)
CRICKET_API_KEY=...
CRICKET_PROVIDER=espncricinfo

# Phase N (Notifications - SendGrid + Twilio)
SENDGRID_API_KEY=SG...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

---

## Notes

- **No manual intervention needed** between workflows; Kiro handles merge conflicts, schema migrations, test runs
- **Notifications**: each phase will send status updates (design → plan → implement-loop → merge)
- **Blockers**: if any workflow fails, its phase pauses and waits for your decision (extend loop, fix, or end)
- **Timing**: real wall-clock time is ~2.5h, not 10h; plan your schedule accordingly
- **Next**: After all 4 merge, Phase O (Admin App) is next (~3.5h), then Phase P (Hardening, ~2.5h)

---

## Document Reference

- **K**: `.agents/tasks/PHASE_K_LAUNCH_BRIEF.md`
- **L**: `.agents/tasks/PHASE_L_LAUNCH_BRIEF.md`
- **M**: `.agents/tasks/PHASE_M_LAUNCH_BRIEF.md`
- **N**: `.agents/tasks/PHASE_N_LAUNCH_BRIEF.md`
- **Master plan**: `.agents/tasks/MASTER_BUILD_EXECUTION_PLAN.md`
- **Full O–P plan**: `.agents/tasks/PHASES_OP_FINAL_STAGES.md`

