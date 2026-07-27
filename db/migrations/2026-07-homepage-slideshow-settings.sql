-- Rose City FC homepage slideshow editable label
-- Date: 2026-07
--
-- Run this after db/migrations/2026-07-homepage-content.sql in environments
-- where the first homepage migration has already been applied.

CREATE TABLE IF NOT EXISTS public.homepage_slideshow_settings (
  id           integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  season_label text NOT NULL DEFAULT '2025 – 2026 Season',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.homepage_slideshow_settings (id, season_label)
VALUES (1, '2025 – 2026 Season')
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.homepage_slideshow_settings TO anon, authenticated;
GRANT ALL ON public.homepage_slideshow_settings TO authenticated;

ALTER TABLE public.homepage_slideshow_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'homepage_slideshow_settings'
      AND policyname = 'Public can read homepage slideshow settings'
  ) THEN
    CREATE POLICY "Public can read homepage slideshow settings"
    ON public.homepage_slideshow_settings
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'homepage_slideshow_settings'
      AND policyname = 'Authenticated users can insert homepage slideshow settings'
  ) THEN
    CREATE POLICY "Authenticated users can insert homepage slideshow settings"
    ON public.homepage_slideshow_settings
    FOR INSERT
    TO authenticated
    WITH CHECK (id = 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'homepage_slideshow_settings'
      AND policyname = 'Authenticated users can update homepage slideshow settings'
  ) THEN
    CREATE POLICY "Authenticated users can update homepage slideshow settings"
    ON public.homepage_slideshow_settings
    FOR UPDATE
    TO authenticated
    USING (id = 1)
    WITH CHECK (id = 1);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

SELECT *
FROM public.homepage_slideshow_settings
WHERE id = 1;
