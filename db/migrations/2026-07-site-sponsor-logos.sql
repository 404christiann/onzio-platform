-- Rose City FC site sponsor carousel and footer logos
-- Date: 2026-07
--
-- Adds admin-managed sponsor logos for two placements:
-- - carousel: homepage sponsor marquee, max 10 in the app
-- - footer: footer partner strip, max 6 in the app
--
-- The seed rows preserve the sponsor logos already used by the Rose City site.

CREATE TABLE IF NOT EXISTS public.site_sponsor_logos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement  text NOT NULL CHECK (placement IN ('carousel', 'footer')),
  name       text NOT NULL DEFAULT '',
  logo_url   text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_sponsor_logos_placement_sort_idx
ON public.site_sponsor_logos (placement, sort_order);

WITH seed(placement, name, logo_url, sort_order) AS (
  VALUES
    ('carousel', 'Chronic Tacos', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20Chronic%20Tacos%20Logo%20Website.png', 0),
    ('carousel', 'Modern Woodmen', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20Modern%20Woodmen%20Logo%20Website%20white.png', 1),
    ('carousel', 'Niky''s Sports', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20Niky%27s%20Sports%20Logo%20Website%20white%20%26%20blue.png', 2),
    ('carousel', 'Planted Beauty Rx', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20Planted%20Beauty%20Logo%20Website%20green.png', 3),
    ('carousel', 'Tepito Coffee', '/images/partners/tepitoSponsor.png', 4),
    ('carousel', 'The Pack Shot Agency', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20The%20Packshot%20Agency%20Logo%20Website%20white.png', 5),
    ('footer', 'Chronic Tacos', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20Chronic%20Tacos%20Logo%20Website.png', 0),
    ('footer', 'Modern Woodmen', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20Modern%20Woodmen%20Logo%20Website%20white.png', 1),
    ('footer', 'Niky''s Sports', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20Niky%27s%20Sports%20Logo%20Website%20white%20%26%20blue.png', 2),
    ('footer', 'Planted Beauty Rx', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20Planted%20Beauty%20Logo%20Website%20green.png', 3),
    ('footer', 'Tepito Coffee', '/images/partners/tepitoSponsor.png', 4),
    ('footer', 'The Pack Shot Agency', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/sponsors/Rose%20City%20FC%202027%20Official%20Sponsor%20The%20Packshot%20Agency%20Logo%20Website%20white.png', 5)
)
INSERT INTO public.site_sponsor_logos (placement, name, logo_url, sort_order)
SELECT placement, name, logo_url, sort_order
FROM seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.site_sponsor_logos
  WHERE site_sponsor_logos.placement = seed.placement
);

GRANT SELECT ON public.site_sponsor_logos TO anon, authenticated;
GRANT ALL ON public.site_sponsor_logos TO authenticated;

ALTER TABLE public.site_sponsor_logos ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('sponsors', 'sponsors', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'site_sponsor_logos'
      AND policyname = 'Public can read site sponsor logos'
  ) THEN
    CREATE POLICY "Public can read site sponsor logos"
    ON public.site_sponsor_logos
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'site_sponsor_logos'
      AND policyname = 'Authenticated users can insert site sponsor logos'
  ) THEN
    CREATE POLICY "Authenticated users can insert site sponsor logos"
    ON public.site_sponsor_logos
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'site_sponsor_logos'
      AND policyname = 'Authenticated users can update site sponsor logos'
  ) THEN
    CREATE POLICY "Authenticated users can update site sponsor logos"
    ON public.site_sponsor_logos
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'site_sponsor_logos'
      AND policyname = 'Authenticated users can delete site sponsor logos'
  ) THEN
    CREATE POLICY "Authenticated users can delete site sponsor logos"
    ON public.site_sponsor_logos
    FOR DELETE
    TO authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload site sponsor images'
  ) THEN
    CREATE POLICY "Authenticated users can upload site sponsor images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'sponsors'
      AND (storage.foldername(name))[1] = 'site-sponsors'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can read site sponsor image metadata'
  ) THEN
    CREATE POLICY "Authenticated users can read site sponsor image metadata"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'sponsors'
      AND (storage.foldername(name))[1] = 'site-sponsors'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete site sponsor images'
  ) THEN
    CREATE POLICY "Authenticated users can delete site sponsor images"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'sponsors'
      AND (storage.foldername(name))[1] = 'site-sponsors'
    );
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

SELECT placement, name, logo_url, sort_order
FROM public.site_sponsor_logos
ORDER BY placement, sort_order;
