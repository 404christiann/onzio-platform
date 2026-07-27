-- Rose City FC admin-editable shop kit section
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor, sections in order.
-- Before running: replace <PROJECT_URL> in section 4 with the value of
-- NEXT_PUBLIC_SUPABASE_URL. Do not run this file through the application.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shop_kit_section (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  eyebrow     text NOT NULL DEFAULT '',
  title       text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  bullet_points text[] NOT NULL DEFAULT ARRAY[
    'Authentic match jersey',
    'Any name & number',
    'League patch',
    'Team sponsor badges',
    'Raffle ticket included',
    'Custom name + $10'
  ]::text[],
  store_note  text NOT NULL DEFAULT E'Sold exclusively at Niky''s Sports\n33 E Colorado Blvd, Pasadena, CA',
  cta_label   text NOT NULL DEFAULT '',
  cta_link    text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_kit_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url        text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Data API grants
-- ---------------------------------------------------------------------------

-- Supabase stops auto-exposing new public-schema tables after 2026-10-30.
-- Public pages need read access; authenticated admins need full table access.
GRANT SELECT ON public.shop_kit_section TO anon, authenticated;
GRANT ALL ON public.shop_kit_section TO authenticated;
GRANT SELECT ON public.shop_kit_photos TO anon, authenticated;
GRANT ALL ON public.shop_kit_photos TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.shop_kit_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_kit_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read shop kit section"
ON public.shop_kit_section
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated users can insert shop kit section"
ON public.shop_kit_section
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update shop kit section"
ON public.shop_kit_section
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete shop kit section"
ON public.shop_kit_section
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Public can read shop kit photos"
ON public.shop_kit_photos
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated users can insert shop kit photos"
ON public.shop_kit_photos
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update shop kit photos"
ON public.shop_kit_photos
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete shop kit photos"
ON public.shop_kit_photos
FOR DELETE
TO authenticated
USING (true);

-- ---------------------------------------------------------------------------
-- 4. Seed current live content for a zero-visual-change rollout
-- ---------------------------------------------------------------------------

INSERT INTO public.shop_kit_section (
  id,
  eyebrow,
  title,
  description,
  bullet_points,
  store_note,
  cta_label,
  cta_link
) VALUES (
  1,
  '2026 Kit · Available Now',
  E'Thorn\nEdition\n2026',
  'The official 2026 match home jersey. Nike Dri-FIT technology, authentic match construction, featuring the Rose City crest, league patch, and team sponsors.',
  ARRAY[
    'Authentic match jersey',
    'Any name & number',
    'League patch',
    'Team sponsor badges',
    'Raffle ticket included',
    'Custom name + $10'
  ]::text[],
  E'Sold exclusively at Niky''s Sports\n33 E Colorado Blvd, Pasadena, CA',
  'Buy Now →',
  'https://www.nikys-sports.com/products/nike-rose-city-fc-home-mens-dri-fit-soccer-jersey'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.shop_kit_photos (url, sort_order)
SELECT seed.url, seed.sort_order
FROM (
  VALUES
    (
      '<PROJECT_URL>/storage/v1/object/public/shop/Robert%20Mejia%20Rose%20City%20FC%20Thorn%20jersey%20front%20crop.png',
      0
    ),
    (
      '<PROJECT_URL>/storage/v1/object/public/shop/Robert%20Mejia%20Rose%20City%20FC%20Thorn%20jersey%20back%20white.png',
      1
    )
) AS seed(url, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.shop_kit_photos);

-- ---------------------------------------------------------------------------
-- 5. Storage policies for authenticated admin uploads
-- ---------------------------------------------------------------------------

-- Storage uploads insert an object row and return its metadata. The INSERT
-- policy permits new files in the public "shop" bucket, while the matching
-- SELECT policy permits the Storage API to return the newly created row.
DROP POLICY IF EXISTS "Authenticated users can upload shop images"
ON storage.objects;

CREATE POLICY "Authenticated users can upload shop images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shop');

DROP POLICY IF EXISTS "Authenticated users can read shop image metadata"
ON storage.objects;

CREATE POLICY "Authenticated users can read shop image metadata"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'shop');

-- ---------------------------------------------------------------------------
-- 6. Verification
-- ---------------------------------------------------------------------------

SELECT *
FROM public.shop_kit_section;

SELECT id, url, sort_order
FROM public.shop_kit_photos
ORDER BY sort_order;
