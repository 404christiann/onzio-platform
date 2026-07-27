-- Rose City FC admin-editable homepage content
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor. This is additive and seeds the
-- current public homepage slideshow and Behind the Rose content so the page
-- does not go blank when the admin editor is introduced.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.homepage_slideshow_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url        text NOT NULL,
  alt        text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.homepage_slideshow_settings (
  id           integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  season_label text NOT NULL DEFAULT '2025 – 2026 Season',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.behind_the_rose_section (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  visible     boolean NOT NULL DEFAULT true,
  eyebrow     text NOT NULL DEFAULT '',
  title       text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  video_url   text NOT NULL DEFAULT '',
  video_title text NOT NULL DEFAULT '',
  caption     text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Seed current live homepage content
-- ---------------------------------------------------------------------------

INSERT INTO public.homepage_slideshow_photos (url, alt, sort_order)
SELECT seed.url, seed.alt, seed.sort_order
FROM (
  VALUES
    ('/images/home/homepageSlideShowPic1.jpeg', 'Rose City FC Match Action', 0),
    ('/images/home/homepageSlideShowPic2.jpeg', 'Rose City FC Players', 1),
    ('/images/home/homepageSlideShowPic3.jpeg', 'Rose City FC Team', 2)
) AS seed(url, alt, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.homepage_slideshow_photos);

INSERT INTO public.homepage_slideshow_settings (id, season_label)
VALUES (1, '2025 – 2026 Season')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.behind_the_rose_section (
  id,
  visible,
  eyebrow,
  title,
  description,
  video_url,
  video_title,
  caption
) VALUES (
  1,
  true,
  'Behind the Rose · Season 1 · Episode 1',
  'Behind the Rose',
  'Go behind the scenes with Pasadena''s Rose City FC as they battle during the 2024 UPSL Final. A cinematic view brings you even closer to the City of Roses.',
  'https://www.youtube.com/embed/fJf_A4LdKDw?rel=0&modestbranding=1&color=white',
  'Rose City FC — Behind the Rose S1 E1',
  'Rose City FC · 2024 UPSL Final'
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Data API grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.homepage_slideshow_photos TO anon, authenticated;
GRANT ALL ON public.homepage_slideshow_photos TO authenticated;
GRANT SELECT ON public.homepage_slideshow_settings TO anon, authenticated;
GRANT ALL ON public.homepage_slideshow_settings TO authenticated;
GRANT SELECT ON public.behind_the_rose_section TO anon, authenticated;
GRANT ALL ON public.behind_the_rose_section TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.homepage_slideshow_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_slideshow_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behind_the_rose_section ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'homepage_slideshow_photos'
      AND policyname = 'Public can read homepage slideshow photos'
  ) THEN
    CREATE POLICY "Public can read homepage slideshow photos"
    ON public.homepage_slideshow_photos
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'homepage_slideshow_photos'
      AND policyname = 'Authenticated users can insert homepage slideshow photos'
  ) THEN
    CREATE POLICY "Authenticated users can insert homepage slideshow photos"
    ON public.homepage_slideshow_photos
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'homepage_slideshow_photos'
      AND policyname = 'Authenticated users can update homepage slideshow photos'
  ) THEN
    CREATE POLICY "Authenticated users can update homepage slideshow photos"
    ON public.homepage_slideshow_photos
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'homepage_slideshow_photos'
      AND policyname = 'Authenticated users can delete homepage slideshow photos'
  ) THEN
    CREATE POLICY "Authenticated users can delete homepage slideshow photos"
    ON public.homepage_slideshow_photos
    FOR DELETE
    TO authenticated
    USING (true);
  END IF;

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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'behind_the_rose_section'
      AND policyname = 'Public can read Behind the Rose section'
  ) THEN
    CREATE POLICY "Public can read Behind the Rose section"
    ON public.behind_the_rose_section
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'behind_the_rose_section'
      AND policyname = 'Authenticated users can update Behind the Rose section'
  ) THEN
    CREATE POLICY "Authenticated users can update Behind the Rose section"
    ON public.behind_the_rose_section
    FOR UPDATE
    TO authenticated
    USING (id = 1)
    WITH CHECK (id = 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'behind_the_rose_section'
      AND policyname = 'Authenticated users can insert Behind the Rose section'
  ) THEN
    CREATE POLICY "Authenticated users can insert Behind the Rose section"
    ON public.behind_the_rose_section
    FOR INSERT
    TO authenticated
    WITH CHECK (id = 1);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Storage bucket and policies
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('homepage', 'homepage', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload homepage images'
  ) THEN
    CREATE POLICY "Authenticated users can upload homepage images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'homepage');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can read homepage image metadata'
  ) THEN
    CREATE POLICY "Authenticated users can read homepage image metadata"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'homepage');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete homepage images'
  ) THEN
    CREATE POLICY "Authenticated users can delete homepage images"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'homepage');
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 6. Verification
-- ---------------------------------------------------------------------------

SELECT id, url, alt, sort_order
FROM public.homepage_slideshow_photos
ORDER BY sort_order;

SELECT *
FROM public.homepage_slideshow_settings
WHERE id = 1;

SELECT *
FROM public.behind_the_rose_section
WHERE id = 1;
