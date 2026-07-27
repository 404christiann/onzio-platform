-- Rose City FC per-match homepage sponsor support
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor before deploying the matching app
-- changes. Existing matches remain unsponsored; the admin can add sponsor
-- details from the Schedule editor.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS sponsor_name text,
  ADD COLUMN IF NOT EXISTS sponsor_logo_url text,
  ADD COLUMN IF NOT EXISTS sponsor_link text;

-- The footer already reads from this public bucket. This keeps the migration
-- reproducible in environments where the bucket has not been created yet.
INSERT INTO storage.buckets (id, name, public)
VALUES ('sponsors', 'sponsors', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload match sponsor images'
  ) THEN
    CREATE POLICY "Authenticated users can upload match sponsor images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'sponsors');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can read match sponsor metadata'
  ) THEN
    CREATE POLICY "Authenticated users can read match sponsor metadata"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'sponsors');
  END IF;
END $$;

SELECT id, date, opponent, sponsor_name, sponsor_logo_url, sponsor_link
FROM public.matches
ORDER BY date, time;
