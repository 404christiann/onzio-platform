-- Rose City FC match result fields for admin schedule and public fixtures
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor. Do not run this file through the
-- application.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS rose_city_score integer,
  ADD COLUMN IF NOT EXISTS opponent_score integer;

-- ---------------------------------------------------------------------------
-- 2. Constraints
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_rose_city_score_nonnegative'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_rose_city_score_nonnegative
      CHECK (rose_city_score IS NULL OR rose_city_score >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_opponent_score_nonnegative'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_opponent_score_nonnegative
      CHECK (opponent_score IS NULL OR opponent_score >= 0);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Data API grants
-- ---------------------------------------------------------------------------

-- matches already has public/admin grants from earlier migrations;
-- re-issuing is harmless and keeps this file runnable standalone.
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matches'
  AND column_name IN ('rose_city_score', 'opponent_score')
ORDER BY column_name;
