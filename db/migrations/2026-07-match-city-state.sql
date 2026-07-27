-- Rose City FC match city/state fields for the homepage Next Match card
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor. Do not run this file through the
-- application.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text;

-- ---------------------------------------------------------------------------
-- 2. Data API grants
-- ---------------------------------------------------------------------------

-- matches already has public/admin grants from earlier migrations;
-- re-issuing is harmless and keeps this file runnable standalone.
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Verification
-- ---------------------------------------------------------------------------

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matches'
  AND column_name IN ('city', 'state');
