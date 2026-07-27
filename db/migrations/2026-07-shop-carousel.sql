-- Rose City FC admin-managed shop photo carousel
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor, sections in order.
-- Do not run this file through the application.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shop_carousel_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_variant text NOT NULL DEFAULT 'home' CHECK (kit_variant IN ('home', 'away')),
  url        text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_carousel_photos
ADD COLUMN IF NOT EXISTS kit_variant text NOT NULL DEFAULT 'home'
CHECK (kit_variant IN ('home', 'away'));

CREATE INDEX IF NOT EXISTS shop_carousel_photos_kit_variant_sort_idx
ON public.shop_carousel_photos (kit_variant, sort_order);

-- ---------------------------------------------------------------------------
-- 2. Data API grants
-- ---------------------------------------------------------------------------

-- Supabase stops auto-exposing new public-schema tables after 2026-10-30.
-- The public /shop page needs read access; authenticated admins need full
-- table access.
GRANT SELECT ON public.shop_carousel_photos TO anon, authenticated;
GRANT ALL ON public.shop_carousel_photos TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.shop_carousel_photos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_carousel_photos'
      AND policyname = 'Public can read shop carousel photos'
  ) THEN
    CREATE POLICY "Public can read shop carousel photos"
    ON public.shop_carousel_photos
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_carousel_photos'
      AND policyname = 'Authenticated users can insert shop carousel photos'
  ) THEN
    CREATE POLICY "Authenticated users can insert shop carousel photos"
    ON public.shop_carousel_photos
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_carousel_photos'
      AND policyname = 'Authenticated users can update shop carousel photos'
  ) THEN
    CREATE POLICY "Authenticated users can update shop carousel photos"
    ON public.shop_carousel_photos
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_carousel_photos'
      AND policyname = 'Authenticated users can delete shop carousel photos'
  ) THEN
    CREATE POLICY "Authenticated users can delete shop carousel photos"
    ON public.shop_carousel_photos
    FOR DELETE
    TO authenticated
    USING (true);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Storage
-- ---------------------------------------------------------------------------

-- No new Storage policies are required. Carousel images upload to the same
-- public "shop" bucket, and the bucket-wide authenticated INSERT/SELECT
-- policies created by db/migrations/2026-07-shop-kit-section.sql (section 5)
-- already cover it. Public reads work because the bucket is public.

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5. Verification
-- ---------------------------------------------------------------------------

SELECT id, kit_variant, url, sort_order
FROM public.shop_carousel_photos
ORDER BY kit_variant, sort_order;
