-- Rose City FC homepage "Next Match" card + opponent logo uploads
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor, sections in order.
-- Before running section 3, create a public Storage bucket named
-- "opponent-logos" via the Supabase dashboard (Storage → New bucket → Public).
-- Do not run this file through the application.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS opponent_logo_url text,
  ADD COLUMN IF NOT EXISTS competition text;

-- ---------------------------------------------------------------------------
-- 2. Data API grants
-- ---------------------------------------------------------------------------

-- matches already has public/admin grants from the multi-season migration;
-- re-issuing is harmless and keeps this file runnable standalone.
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Storage policies for authenticated admin uploads
-- ---------------------------------------------------------------------------

-- Requires the public "opponent-logos" bucket to already exist (see header).
DROP POLICY IF EXISTS "Authenticated users can upload opponent logos"
ON storage.objects;

CREATE POLICY "Authenticated users can upload opponent logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'opponent-logos');

DROP POLICY IF EXISTS "Authenticated users can read opponent logo metadata"
ON storage.objects;

CREATE POLICY "Authenticated users can read opponent logo metadata"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'opponent-logos');

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matches'
  AND column_name IN ('opponent_logo_url', 'competition');
