-- Rose City FC independent homepage and shop-page kit presentations
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor before deploying the matching app
-- changes. This migration is safe to rerun. It copies the current shared kit
-- content and photos to the shop surface for a zero-visual-change rollout.

-- ---------------------------------------------------------------------------
-- 1. Add a surface to the kit-section records
-- ---------------------------------------------------------------------------

-- The original singleton table restricted id to 1. The two-surface editor
-- uses stable ids 1 (home) and 2 (shop).
ALTER TABLE public.shop_kit_section
  DROP CONSTRAINT IF EXISTS shop_kit_section_id_check;

ALTER TABLE public.shop_kit_section
  ADD COLUMN IF NOT EXISTS surface text;

UPDATE public.shop_kit_section
SET surface = 'home'
WHERE surface IS NULL;

ALTER TABLE public.shop_kit_section
  ALTER COLUMN surface SET DEFAULT 'home',
  ALTER COLUMN surface SET NOT NULL;

ALTER TABLE public.shop_kit_section
  DROP CONSTRAINT IF EXISTS shop_kit_section_surface_check;

ALTER TABLE public.shop_kit_section
  ADD CONSTRAINT shop_kit_section_surface_check
  CHECK (surface IN ('home', 'shop'));

CREATE UNIQUE INDEX IF NOT EXISTS shop_kit_section_surface_key
ON public.shop_kit_section (surface);

INSERT INTO public.shop_kit_section (
  id,
  surface,
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
  2,
  'shop',
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
ORDER BY id
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Add a surface to ordered kit photos
-- ---------------------------------------------------------------------------

ALTER TABLE public.shop_kit_photos
  ADD COLUMN IF NOT EXISTS surface text;

UPDATE public.shop_kit_photos
SET surface = 'home'
WHERE surface IS NULL;

-- Only seed the shop set when it does not already have photos. This prevents
-- duplicates if the migration is rerun after the admin has edited either set.
INSERT INTO public.shop_kit_photos (surface, url, sort_order)
SELECT 'shop', home_photo.url, home_photo.sort_order
FROM public.shop_kit_photos AS home_photo
WHERE home_photo.surface = 'home'
  AND NOT EXISTS (
    SELECT 1
    FROM public.shop_kit_photos AS shop_photo
    WHERE shop_photo.surface = 'shop'
  );

ALTER TABLE public.shop_kit_photos
  ALTER COLUMN surface SET DEFAULT 'home',
  ALTER COLUMN surface SET NOT NULL;

ALTER TABLE public.shop_kit_photos
  DROP CONSTRAINT IF EXISTS shop_kit_photos_surface_check;

ALTER TABLE public.shop_kit_photos
  ADD CONSTRAINT shop_kit_photos_surface_check
  CHECK (surface IN ('home', 'shop'));

CREATE INDEX IF NOT EXISTS shop_kit_photos_surface_sort_order_idx
ON public.shop_kit_photos (surface, sort_order);

-- ---------------------------------------------------------------------------
-- 3. Verification
-- ---------------------------------------------------------------------------

SELECT id, surface, title, cta_link
FROM public.shop_kit_section
ORDER BY id;

SELECT surface, count(*) AS photo_count
FROM public.shop_kit_photos
GROUP BY surface
ORDER BY surface;
