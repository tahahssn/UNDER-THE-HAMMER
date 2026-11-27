# Phase K: Squad Exports

**Status**: Ready to launch (Phase J merged to main)  
**Workflow**: `bundled://feature-pipeline`  
**Base branch**: main (at cc5c32a)  
**Feature branch**: `feature/phase-k-squad-exports`  
**Expected duration**: ~2 hours  
**Blockers**: None (Phase F auction rooms complete; Phase G bid validation complete)

---

## Deliverables

### Backend

**Export Service** (`apps/api/src/auctions/services/squad-export.service.ts`)
- CSV format: team name, player count, purse remaining, players (CSV rows)
- XLSX format: same data with formatting, one sheet per team (optional second sheet: summary)
- Idempotency: export filename includes timestamp + hash of filter params
- Authorization: host or team owner only (checked by GET handler)
- Error handling: 404 if auction not found, 403 if not authorized, 400 if invalid format

**Export Endpoints** (`apps/api/src/auctions/controllers/auctions.controller.ts`)
- GET `/v1/auctions/:id/export?format=csv` → CSV attachment (text/csv)
- GET `/v1/auctions/:id/export?format=xlsx` → XLSX attachment (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
- Default format: CSV
- Query params: `?format=csv|xlsx`

**DTO** (`apps/api/src/auctions/dtos/squad-export.dto.ts`)
```typescript
export class SquadExportDto {
  teamName: string;
  purseRemainingMinor: string; // BigInt as string (paisa)
  playerCount: number;
  players: { name: string; role: string; pricePaidMinor: string }[];
}
```

**Tests** (`apps/api/src/auctions/services/squad-export.service.spec.ts`)
- CSV format: correct columns, correct escaping (commas in names)
- XLSX format: worksheets created, headers + data present
- Authorization: host allowed, team owner allowed, spectator 403, non-member 404
- Edge cases: empty squad, special characters in names, BigInt formatting
- 25+ tests, >90% coverage

### Frontend

**Export Component** (`apps/web/src/components/auction/SquadExport.tsx`)
- Button: "Download Squad" in the auction room header or sidebar
- Dropdown: CSV or XLSX format selector
- Loading state: button disabled, spinner
- Error state: error toast with retry button
- Success: file downloads, toast confirms "Squad exported as CSV"
- Responsive: button on desktop, mobile-compatible

**Export Hook** (`apps/web/src/hooks/useSquadExport.ts`)
- `useSquadExport(auctionId)` → `{ export: (format: 'csv' | 'xlsx') => Promise<void>, loading, error }`
- Fetches `GET /api/v1/auctions/:id/export?format=:format`
- Triggers download via `fetch` → blob → `URL.createObjectURL` → `<a>` click
- Error handling: HTTP errors surface via the hook's `error` state

**Tests** (`apps/web/src/hooks/useSquadExport.spec.ts`, `apps/web/src/components/auction/SquadExport.spec.tsx`)
- Hook: success fetch, error handling, loading states
- Component: button renders, dropdown shows, loading spinner on click, error toast on failure
- Downloads: blob-to-file download verified (mocked fetch)
- Responsive: rendered on mobile viewport
- 20+ tests, >90% coverage

---

## Integration Points

- **Phase F** (auction rooms): export available on the room page, only to host/team owners
- **Phase G** (bid settlement): purse remaining must reflect all accepted bids
- **Phase B** (auth): permission check: `isMember(auctionId, userId, 'HOST' | 'TEAM_OWNER')`
- **No new migrations** (uses existing squads, teams, auctions tables)

---

## Success Criteria

- [ ] CSV export endpoint functional (GET `/v1/auctions/:id/export?format=csv`)
- [ ] XLSX export endpoint functional (GET `/v1/auctions/:id/export?format=xlsx`)
- [ ] Authorization enforced (host/owner only)
- [ ] File downloads correctly (blob → attachment)
- [ ] Component renders in room (button + format selector)
- [ ] TypeScript strict (0 errors, no `any`)
- [ ] Tests passing (45+ tests, >85% coverage)
- [ ] No hardcoded values (BigInt as strings, format configurable)
- [ ] No secrets in code
- [ ] Responsive (mobile 375px, desktop 1440px)

---

## Files to Create/Modify

**Backend**:
- `apps/api/src/auctions/services/squad-export.service.ts` (new)
- `apps/api/src/auctions/services/squad-export.service.spec.ts` (new)
- `apps/api/src/auctions/dtos/squad-export.dto.ts` (new)
- `apps/api/src/auctions/controllers/auctions.controller.ts` (modify: add GET /export)

**Frontend**:
- `apps/web/src/hooks/useSquadExport.ts` (new)
- `apps/web/src/hooks/useSquadExport.spec.ts` (new)
- `apps/web/src/components/auction/SquadExport.tsx` (new)
- `apps/web/src/components/auction/SquadExport.spec.tsx` (new)
- `apps/web/src/app/auctions/[id]/page.tsx` or `live/page.tsx` (modify: add SquadExport button)

**Tests**: 45+ total (25 backend, 20 frontend)

---

## Decisions Already Made

| Item | Decision | Why |
|------|----------|-----|
| Format | CSV + XLSX | CSV for quick sharing, XLSX for Excel integration |
| Auth | Host + team owner only | Privacy: spectators should not export team compositions |
| BigInt handling | String format in CSV/XLSX | No scientific notation in spreadsheet apps |
| Download mechanism | Fetch blob → createObjectURL | No server temporary files needed |
| Error handling | Toast + retry | Non-blocking, user can recover |

---

## Notes

- This phase has no backend blockers (all prior phases complete)
- Export is read-only (no modifications to squad/bid data)
- Large auctions (1000+ players) should stream; for now assume reasonable size (assume <500 players per squad)
- Future enhancement: batch export (multiple auctions at once)

