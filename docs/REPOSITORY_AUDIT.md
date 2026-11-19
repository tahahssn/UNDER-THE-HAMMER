# Repository Audit

Audit date: 2026-11-19. Branch `main` at `cfc6bfa`.

## Existing contents

| Path | Size | Notes |
|---|---|---|
| `app.py` | 3.2 MB, 395 lines | Streamlit "PSL Auction Engine". One line is about 3.25 MB: an inline base64 MP3 (`AUDIO_B64`). Hard-codes 8 PSL teams. Loads `auction_model.pkl` and `model_columns.pkl` with joblib. Uses `players_db.search_player`. |
| `app_v1.py` | 0 bytes | Empty file. |
| `players_db.py` | 42 KB, 668 lines | `PLAYER_DB` dict, about 96 players. Fields: nationality, player_type, category, base_price (crore), batting/bowling stats, recent_form, finisher. Source and freshness of the stats are not recorded. Contains mojibake in comments (encoding damage). |
| `auction_model.pkl`, `model_columns.pkl` | 1.5 KB, 0.5 KB | Small joblib artifacts for the valuation model. Pickle loading must stay in a trusted, isolated service. |
| `HBL_PSL11_2026_Auction_Data.xlsx` | 24 KB | Auction dataset. Contents not yet inspected. Provenance and licence unknown. |
| `HBL PSL Mashup 2023.mp3` | 2.4 MB | Third-party audio, likely copyrighted (HBL PSL branding). Rights unverified. Do not ship in product. |
| `requirements.txt` | - | streamlit, pandas, joblib, numpy (unpinned). |
| `.gitignore` | 0 bytes | Empty. Needs rules for secrets, build output, `.env`, `__pycache__`. |
| `__pycache__/` | - | Committed or present on disk. Should be ignored. |

Git: 17 tracked files. Untracked: the six source documents and the master plan. `README.md` is modified.

## Environment

Node v24.19.0, pnpm 12.14.0, Python 3.13.14. No Docker/Redis/Postgres check done yet.

## Existing tests

None.

## Reusable pieces

- Valuation model (`auction_model.pkl`, `model_columns.pkl`) and its feature logic in `app.py`. Reuse as `services/valuation` after extracting the feature code from the Streamlit UI.
- Player fields in `players_db.py` as seed input for the player import tool (needs category, role and nationality normalization).
- Dark and amber visual direction (`#0A0A0A`, `#FF6B00`) matches `DESIGN.md` loosely. Reuse as an input to tokens, not as final brand colors.

## Problems that block reuse as-is

1. Eight fixed PSL teams and the "PSL" framing contradict the locked decisions.
2. Money is stored as float crore values. The platform requires integer minor units.
3. Auction logic runs inside Streamlit session state. There is no authoritative server.
4. The base64 audio blob makes `app.py` unreadable and tool-hostile.
5. The MP3 and PSL team names raise rights questions (see `AGENTS.md` data-rights section).
6. No secrets found in the files sampled. A full secret scan has not been run.

## Proposed migration

1. Create the monorepo skeleton alongside the legacy files. Do not delete anything yet.
2. Extract valuation feature code into `services/valuation` with a small HTTP interface and tests against current outputs.
3. Build an idempotent player importer; load `players_db.py` and the xlsx through it after inspection.
4. Once the new web app covers the legacy behavior, move `app.py`, `app_v1.py`, `players_db.py` into `legacy/` (after the product owner approves, see D-18).
5. Remove the MP3 from the repo unless rights are confirmed.

## Deviations from the expected structure

None yet. The six source documents stay at the repository root as the plan requires, even though `IMPLEMENTATION.md` shows them under `docs/`. The plan and `README.md` take precedence.
