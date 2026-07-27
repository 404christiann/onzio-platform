-- Rose City FC shared club logo setting
-- Date: 2026-07
--
-- Creates one public branding record and allows authenticated admins to upload
-- replacement crest files inside logos_v2/club-branding.

CREATE TABLE IF NOT EXISTS public.site_branding (
  id             integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  club_logo_path text NOT NULL DEFAULT 'Rose City FC Patch Color.png',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_branding (id, club_logo_path)
VALUES (1, 'Rose City FC Patch Color.png')
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.site_branding TO anon, authenticated;
GRANT ALL ON public.site_branding TO authenticated;

ALTER TABLE public.site_branding ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'site_branding'
      AND policyname = 'Public can read site branding'
  ) THEN
    CREATE POLICY "Public can read site branding"
    ON public.site_branding FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'site_branding'
      AND policyname = 'Signed-in users can update site branding'
  ) THEN
    CREATE POLICY "Signed-in users can update site branding"
    ON public.site_branding FOR UPDATE TO public
    USING (id = 1 AND auth.uid() IS NOT NULL)
    WITH CHECK (id = 1 AND auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Signed-in users can upload shared club logos'
  ) THEN
    CREATE POLICY "Signed-in users can upload shared club logos"
    ON storage.objects FOR INSERT TO public
    WITH CHECK (
      bucket_id = 'logos_v2'
      AND (storage.foldername(name))[1] = 'club-branding'
      AND auth.uid() IS NOT NULL
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Signed-in users can read shared club logo metadata'
  ) THEN
    CREATE POLICY "Signed-in users can read shared club logo metadata"
    ON storage.objects FOR SELECT TO public
    USING (
      bucket_id = 'logos_v2'
      AND (storage.foldername(name))[1] = 'club-branding'
      AND auth.uid() IS NOT NULL
    );
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

SELECT id, club_logo_path, updated_at
FROM public.site_branding;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename = 'site_branding')
   OR (
     schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname IN (
       'Signed-in users can upload shared club logos',
       'Signed-in users can read shared club logo metadata'
     )
   )
ORDER BY schemaname, tablename, policyname;
