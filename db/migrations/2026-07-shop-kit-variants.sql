-- Rose City FC home and away shop kit presentations
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor before deploying the matching app
-- changes. This migration is safe to rerun. It keeps the existing home-kit
-- content/photos and copies them into away-kit records for a zero-reset rollout.

-- ---------------------------------------------------------------------------
-- 1. Add kit variants to section records
-- ---------------------------------------------------------------------------

ALTER TABLE public.shop_kit_section
  ADD COLUMN IF NOT EXISTS kit_variant text;

UPDATE public.shop_kit_section
SET kit_variant = 'home'
WHERE kit_variant IS NULL;

ALTER TABLE public.shop_kit_section
  ALTER COLUMN kit_variant SET DEFAULT 'home',
  ALTER COLUMN kit_variant SET NOT NULL;

ALTER TABLE public.shop_kit_section
  DROP CONSTRAINT IF EXISTS shop_kit_section_kit_variant_check;

ALTER TABLE public.shop_kit_section
  ADD CONSTRAINT shop_kit_section_kit_variant_check
  CHECK (kit_variant IN ('home', 'away'));

ALTER TABLE public.shop_kit_section
  DROP CONSTRAINT IF EXISTS shop_kit_section_surface_unique;

DROP INDEX IF EXISTS public.shop_kit_section_surface_key;
DROP INDEX IF EXISTS public.shop_kit_section_surface_unique;

CREATE UNIQUE INDEX IF NOT EXISTS shop_kit_section_surface_variant_key
ON public.shop_kit_section (surface, kit_variant);

INSERT INTO public.shop_kit_section (
  id,
  surface,
  kit_variant,
  eyebrow,
  title,
  description,
  bullet_points,
  store_note,
  cta_label,
  cta_link,
  updated_at
)
SELECT
  3,
  'home',
  'away',
  eyebrow,
  title,
  description,
  bullet_points,
  store_note,
  cta_label,
  cta_link,
  updated_at
FROM public.shop_kit_section
WHERE surface = 'home'
  AND kit_variant = 'home'
  AND NOT EXISTS (
    SELECT 1
    FROM public.shop_kit_section
    WHERE surface = 'home'
      AND kit_variant = 'away'
  )
ORDER BY id
LIMIT 1;

INSERT INTO public.shop_kit_section (
  id,
  surface,
  kit_variant,
  eyebrow,
  title,
  description,
  bullet_points,
  store_note,
  cta_label,
  cta_link,
  updated_at
)
SELECT
  4,
  'shop',
  'away',
  eyebrow,
  title,
  description,
  bullet_points,
  store_note,
  cta_label,
  cta_link,
  updated_at
FROM public.shop_kit_section
WHERE surface = 'shop'
  AND kit_variant = 'home'
  AND NOT EXISTS (
    SELECT 1
    FROM public.shop_kit_section
    WHERE surface = 'shop'
      AND kit_variant = 'away'
  )
ORDER BY id
LIMIT 1;

-- ---------------------------------------------------------------------------
-- 2. Add kit variants to ordered kit photos
-- ---------------------------------------------------------------------------

ALTER TABLE public.shop_kit_photos
  ADD COLUMN IF NOT EXISTS kit_variant text;

UPDATE public.shop_kit_photos
SET kit_variant = 'home'
WHERE kit_variant IS NULL;

INSERT INTO public.shop_kit_photos (surface, kit_variant, url, sort_order)
SELECT 'home', 'away', home_photo.url, home_photo.sort_order
FROM public.shop_kit_photos AS home_photo
WHERE home_photo.surface = 'home'
  AND home_photo.kit_variant = 'home'
  AND NOT EXISTS (
    SELECT 1
    FROM public.shop_kit_photos AS away_photo
    WHERE away_photo.surface = 'home'
      AND away_photo.kit_variant = 'away'
  );

INSERT INTO public.shop_kit_photos (surface, kit_variant, url, sort_order)
SELECT 'shop', 'away', shop_photo.url, shop_photo.sort_order
FROM public.shop_kit_photos AS shop_photo
WHERE shop_photo.surface = 'shop'
  AND shop_photo.kit_variant = 'home'
  AND NOT EXISTS (
    SELECT 1
    FROM public.shop_kit_photos AS away_photo
    WHERE away_photo.surface = 'shop'
      AND away_photo.kit_variant = 'away'
  );

ALTER TABLE public.shop_kit_photos
  ALTER COLUMN kit_variant SET DEFAULT 'home',
  ALTER COLUMN kit_variant SET NOT NULL;

ALTER TABLE public.shop_kit_photos
  DROP CONSTRAINT IF EXISTS shop_kit_photos_kit_variant_check;

ALTER TABLE public.shop_kit_photos
  ADD CONSTRAINT shop_kit_photos_kit_variant_check
  CHECK (kit_variant IN ('home', 'away'));

CREATE INDEX IF NOT EXISTS shop_kit_photos_surface_variant_sort_order_idx
ON public.shop_kit_photos (surface, kit_variant, sort_order);

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 3. Verification
-- ---------------------------------------------------------------------------

SELECT id, surface, kit_variant, title, cta_link
FROM public.shop_kit_section
ORDER BY surface, kit_variant;

SELECT surface, kit_variant, count(*) AS photo_count
FROM public.shop_kit_photos
GROUP BY surface, kit_variant
ORDER BY surface, kit_variant;
