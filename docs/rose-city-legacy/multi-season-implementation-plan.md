# Multi-Season Support Implementation Plan

This plan records the completed multi-season rollout and its safety contract.
The database gate and Phases 1-7 are implemented. Keep the ordering below as a
reference for future environments; do not rerun destructive migration steps in
the current project by default.

Primary SQL runbook:

- `db/migrations/2026-07-multi-season.sql`

## Current Status (2026-07-15) - Implemented

Gate 0 and the application phases are complete:

- `matches.season_id` exists.
- Current matches are backfilled to active season `2025–26`.
- `player_season_stats` has no null `season_id` rows.
- `goalkeeper_season_stats` has no null `season_id` rows.
- `matches` has no null `season_id` rows.
- `player_season_stats` primary key is now `(player_id, season_id)`.
- `goalkeeper_season_stats` primary key is now `(player_id, season_id)`.
- Active season is `e3e7e955-4e7d-4887-821b-06ccc23c2cf3` (`2025–26`).
- Shared season helpers and the dedicated `/admin/seasons` page are live.
- Admin season stats, schedule, and match picker are season-scoped.
- Dashboard and public schedule use active-season labels and matches.
- New players receive active-season seed rows, season deletion is guarded, and
  player activation/deactivation preserves the expected current/historical
  roster behavior.
- Latest verification passed: 129 Vitest tests, TypeScript, and production
  build.

Phase 8 production mutations remain an optional manual verification step and
must use safe test data or explicit approval.

## Gate 0: Run Supabase Diagnostics And Migration - Complete

1. Run the read-only diagnostics from the SQL runbook.
2. Confirm there is exactly one active season.
3. Confirm there are no duplicate `(player_id, season_id)` stats rows.
4. Drop any old `UNIQUE(player_id)` season-stats constraint if present.
5. Replace old `PRIMARY KEY(player_id)` constraints with
   `PRIMARY KEY(player_id, season_id)`.
6. Create `seasons_single_active_unique` and `matches_season_id_idx`.
7. Backfill every `matches.season_id IS NULL` row.
8. Do not continue until:
   - duplicate stats diagnostics return no rows
   - active season query returns one row
   - null-season match count returns `0`

## Phase 1: Shared Season Helpers - Complete

Add `fetchActiveSeason()` in `lib/queries.ts`.

Add `lib/use-seasons.ts`:

- client hook using `createClient()` from `@/lib/supabase-browser`
- returns `seasons`, `activeSeasonId`, `selectedSeasonId`,
  `setSelectedSeasonId`, and `loading`
- defaults selected season to the active season, falling back to newest row

Add `components/admin/SeasonSelect.tsx`:

- shared dark admin `<select>`
- labels active row as `(Active)`
- supports optional `label`

## Phase 2: Fix `/admin/season-stats` - Complete

File:

- `app/admin/(protected)/season-stats/page.tsx`

Changes:

- Add shared season selector in header.
- Load stats scoped to `selectedSeasonId`.
- Change player cohort:
  - historical seasons show players with stats rows in that season
  - active season also includes active players missing rows, with zero defaults
- Include `season_id` in upsert payloads.
- Change upsert conflicts from `player_id` to `player_id,season_id`.
- Disable save until a season is selected.

This fixes the current all-season mixing bug and must happen only after the SQL
unique indexes exist.

## Phase 3: Update `/admin/schedule` - Complete

File:

- `app/admin/(protected)/schedule/page.tsx`

Changes:

- Add `season_id` to local match/form types.
- Load `season_id` from `matches`.
- Default new matches to active season.
- Add required Season field to add/edit forms.
- Filter list by selected season.
- Exit edit mode when season filter changes.
- Empty state should reference selected season.

This fixes the current bug where new matches insert with `season_id: null`.

## Phase 4: Update `/admin/stats` - Complete

File:

- `app/admin/(protected)/stats/page.tsx`

Changes:

- Add `season_id` to local match type/query.
- Add season selector above match picker.
- Filter match picker by selected season.
- Clear selected match when switching to a season that does not contain it.
- No stat save-path changes expected.

## Phase 5: Active Season Labels And Counts - Complete

Dashboard:

- `app/admin/(protected)/page.tsx`

Changes:

- Replace calendar heuristic with active season label from DB.
- Count matches for the active season only.
- Find next match from active-season matches only.

Public schedule:

- `app/(public)/schedule/page.tsx`

Changes:

- Replace hardcoded `2025 - 2026 Season` copy with active season label.
- Filter public fixtures to active-season matches only.
- This avoids mixed-season public schedule output once future seasons exist.

Public roster and player modal:

- No season switcher.
- Keep current prop-driven behavior from `fetchRoster()` active-season
  resolution.

## Phase 6: Roster Admin Season Workflows - Complete

File:

- `app/admin/(protected)/roster/page.tsx`

New player seeding:

- After adding a player, fetch active season.
- Insert a zero row into the appropriate stats table:
  - `player_season_stats` for field players
  - `goalkeeper_season_stats` for goalkeepers
- Use the same zero shapes as `handleCreateNextSeason`.
- Seeding errors are non-blocking but should surface to the admin.

Season delete guard:

- A season is deletable only when it has:
  - zero matches
  - zero non-zero field season stats
  - zero non-zero goalkeeper season stats
- Disable delete with explanatory title when not deletable.
- Re-check in `handleDelete`.
- For permitted deletes, explicitly delete seeded zero rows from both stats
  tables before deleting the season row.

Set active:

- Keep existing order: deactivate all seasons, then activate selected season.
- Add a short comment noting this order is required by the partial unique index.

Player activation lifecycle added during regression hardening:

- active-season public roster excludes inactive players.
- historical season rosters continue to use season-row membership.
- activation creates a missing active-season zero row with
  `ignoreDuplicates: true` before setting the player active.
- deactivation preserves historical and current stats.

## Phase 7: Tests - Complete

Run:

```bash
npm test
npx tsc --noEmit --pretty false
```

Add query tests:

- `fetchActiveSeason()` returns active row
- returns `null` when no active row exists
- throws on Supabase error

Add one integration scenario for `fetchActiveSeason()`.

The current suite has 129 passing tests across six files, including player
season and activation lifecycle coverage. There is no browser component-test
harness for the admin pages, so UI behavior still benefits from bounded manual
verification.

## Phase 8: Manual Verification - Bounded / Non-Destructive Checks Complete

1. `/admin/season-stats`
   - switch seasons
   - save active season stats
   - confirm only the selected `(player_id, season_id)` row changes
2. `/admin/schedule`
   - add match
   - confirm `season_id` is set
   - edit match into another season and confirm it moves filters
3. `/admin/stats`
   - default shows active-season matches only
   - season switch clears stale selected match
4. `/admin/roster`
   - add field player and goalkeeper
   - confirm one zero stats row lands in the active season for each
5. Seasons tab
   - delete disabled for seasons with matches or non-zero stats
   - deleting a fresh mistake season removes seeded zero rows
6. Dashboard and public schedule
   - both show active season label
   - both use active-season matches only
7. Public roster and player modal
   - verify behavior is unchanged

TypeScript, the full test suite, the production build, and unauthenticated route
smoke checks passed. Do not perform the destructive portions of this list
against production data without safe test records or explicit approval.

## Risk Notes

- SQL gate order matters. Do not deploy `onConflict: "player_id,season_id"`
  before unique indexes exist.
- Do not ship season-filtered schedule/stats UI while any match has
  `season_id = null`.
- Historical season-stats intentionally show only players with season rows.
  Do not backfill zero rows for old seasons unless that is an explicit content
  decision.
- Concurrent active-season changes are now guarded by the database. If two
  admins race, one write may fail, which is safer than two active seasons.
