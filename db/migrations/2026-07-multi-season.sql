-- Rose City FC multi-season support runbook
-- Date: 2026-07
--
-- This project applies Supabase schema changes manually in the Supabase SQL
-- editor. Run sections in order. Do not deploy the dependent app changes until
-- all verification queries in this file pass.

-- ---------------------------------------------------------------------------
-- 0.0 Schema prep
-- ---------------------------------------------------------------------------

-- Older databases do not have this column yet. Add it before running any
-- diagnostics that inspect null match seasons or create the supporting index.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES seasons(id);

-- ---------------------------------------------------------------------------
-- 0.1 Diagnostics - read-only
-- ---------------------------------------------------------------------------

-- Existing constraints on season stats tables.
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (
  'player_season_stats'::regclass,
  'goalkeeper_season_stats'::regclass
)
ORDER BY conrelid::regclass::text, conname;

-- Existing indexes that may affect this change.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN (
  'player_season_stats',
  'goalkeeper_season_stats',
  'seasons',
  'matches'
)
ORDER BY tablename, indexname;

-- Duplicates that would block unique (player_id, season_id) indexes.
SELECT player_id, season_id, COUNT(*)
FROM player_season_stats
GROUP BY player_id, season_id
HAVING COUNT(*) > 1;

SELECT player_id, season_id, COUNT(*)
FROM goalkeeper_season_stats
GROUP BY player_id, season_id
HAVING COUNT(*) > 1;

-- There must be exactly one active season before adding the partial index.
SELECT id, label, start_year, end_year, active
FROM seasons
ORDER BY start_year DESC;

-- Matches that must be assigned before season-filtered admin screens ship.
SELECT id, date, opponent
FROM matches
WHERE season_id IS NULL
ORDER BY date, time;

-- FK delete behavior from stats/matches tables to seasons.
SELECT conrelid::regclass AS table_name, conname, confdeltype
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid = 'seasons'::regclass
ORDER BY conrelid::regclass::text, conname;

-- ---------------------------------------------------------------------------
-- 0.2 Cleanup helpers - run only if diagnostics show the relevant issue
-- ---------------------------------------------------------------------------

-- If a UNIQUE(player_id) constraint or index exists on either season stats
-- table, drop it before creating multi-season unique indexes. Replace names
-- with the exact diagnostic output before running.
--
-- ALTER TABLE player_season_stats DROP CONSTRAINT IF EXISTS old_constraint_name;
-- DROP INDEX IF EXISTS old_index_name;
-- ALTER TABLE goalkeeper_season_stats DROP CONSTRAINT IF EXISTS old_constraint_name;
-- DROP INDEX IF EXISTS old_index_name;

-- If duplicate (player_id, season_id) rows exist, review them manually first.
-- This conservative helper keeps the row with the greater minutes value. Do not
-- run unless the duplicate diagnostic returns rows and the choice is acceptable.
--
-- DELETE FROM player_season_stats a
-- USING player_season_stats b
-- WHERE a.player_id = b.player_id
--   AND a.season_id = b.season_id
--   AND a.ctid < b.ctid
--   AND COALESCE(a.mins, 0) <= COALESCE(b.mins, 0);
--
-- DELETE FROM goalkeeper_season_stats a
-- USING goalkeeper_season_stats b
-- WHERE a.player_id = b.player_id
--   AND a.season_id = b.season_id
--   AND a.ctid < b.ctid
--   AND COALESCE(a.mins, 0) <= COALESCE(b.mins, 0);

-- If multiple seasons are active, manually fix before continuing.
-- Replace the id with the season that should remain active.
--
-- UPDATE seasons SET active = false;
-- UPDATE seasons SET active = true WHERE id = '<active-season-uuid>';

-- ---------------------------------------------------------------------------
-- 0.3 Required constraints and indexes
-- ---------------------------------------------------------------------------

-- Supports season-aware upserts from /admin/season-stats and player detail
-- season stat editors. Current production was migrated from
-- PRIMARY KEY(player_id) to PRIMARY KEY(player_id, season_id).
DO $$
BEGIN
  IF (
    SELECT pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'player_season_stats'::regclass
      AND conname = 'player_season_stats_pkey'
  ) = 'PRIMARY KEY (player_id)' THEN
    ALTER TABLE player_season_stats DROP CONSTRAINT player_season_stats_pkey;
    ALTER TABLE player_season_stats
      ADD CONSTRAINT player_season_stats_pkey PRIMARY KEY (player_id, season_id);
  END IF;
END $$;

DO $$
BEGIN
  IF (
    SELECT pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'goalkeeper_season_stats'::regclass
      AND conname = 'goalkeeper_season_stats_pkey'
  ) = 'PRIMARY KEY (player_id)' THEN
    ALTER TABLE goalkeeper_season_stats DROP CONSTRAINT goalkeeper_season_stats_pkey;
    ALTER TABLE goalkeeper_season_stats
      ADD CONSTRAINT goalkeeper_season_stats_pkey PRIMARY KEY (player_id, season_id);
  END IF;
END $$;

-- Guarantees a single active season. The app deactivates all seasons before
-- activating the selected season, which is compatible with this partial index.
CREATE UNIQUE INDEX IF NOT EXISTS seasons_single_active_unique
  ON seasons (active)
  WHERE active = true;

-- Helpful for season-filtered schedule/stat screens.
CREATE INDEX IF NOT EXISTS matches_season_id_idx
  ON matches (season_id);

-- ---------------------------------------------------------------------------
-- 0.4 One-time match season backfill - required before filtered UI ships
-- ---------------------------------------------------------------------------

-- Review:
SELECT id, label, start_year, end_year
FROM seasons
ORDER BY start_year DESC;

SELECT id, date, time, opponent
FROM matches
WHERE season_id IS NULL
ORDER BY date, time;

-- Fill in real season ids and date boundaries before running. Add one UPDATE
-- per real season. Example:
--
-- UPDATE matches
-- SET season_id = '<season-uuid>'
-- WHERE season_id IS NULL
--   AND date >= '2025-01-01'
--   AND date <= '2025-12-31';

-- Gate: must return 0 before deploying season-filtered schedule/stats UI.
SELECT COUNT(*) AS null_season_match_count
FROM matches
WHERE season_id IS NULL;

-- ---------------------------------------------------------------------------
-- 0.5 Final verification
-- ---------------------------------------------------------------------------

-- Must return no duplicate rows.
SELECT player_id, season_id, COUNT(*)
FROM player_season_stats
GROUP BY player_id, season_id
HAVING COUNT(*) > 1;

SELECT player_id, season_id, COUNT(*)
FROM goalkeeper_season_stats
GROUP BY player_id, season_id
HAVING COUNT(*) > 1;

-- Must return exactly one row.
SELECT id, label, active
FROM seasons
WHERE active = true;

-- Must return 0 before app phases depending on match filters are deployed.
SELECT COUNT(*) AS null_season_match_count
FROM matches
WHERE season_id IS NULL;
