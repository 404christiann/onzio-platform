-- Rose City FC shop kit authenticated-write policy repair
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor. This migration is safe to rerun.
-- It restores the policy set required by the /admin/shop upsert and ordered
-- kit-photo writes without changing public read access.

-- ---------------------------------------------------------------------------
-- 1. Grants and RLS
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.shop_kit_section TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shop_kit_section TO authenticated;

GRANT SELECT ON public.shop_kit_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shop_kit_photos TO authenticated;

ALTER TABLE public.shop_kit_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_kit_photos ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Shop section policies
-- ---------------------------------------------------------------------------

-- Remove the legacy equivalents first so the policy list stays unambiguous.
DROP POLICY IF EXISTS "Read shop kit section"
ON public.shop_kit_section;

DROP POLICY IF EXISTS "Create shop kit section"
ON public.shop_kit_section;

DROP POLICY IF EXISTS "Update shop kit section"
ON public.shop_kit_section;

DROP POLICY IF EXISTS "Delete shop kit section"
ON public.shop_kit_section;

DROP POLICY IF EXISTS "Public can read shop kit section"
ON public.shop_kit_section;

CREATE POLICY "Public can read shop kit section"
ON public.shop_kit_section
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert shop kit section"
ON public.shop_kit_section;

CREATE POLICY "Authenticated users can insert shop kit section"
ON public.shop_kit_section
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update shop kit section"
ON public.shop_kit_section;

CREATE POLICY "Authenticated users can update shop kit section"
ON public.shop_kit_section
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete shop kit section"
ON public.shop_kit_section;

CREATE POLICY "Authenticated users can delete shop kit section"
ON public.shop_kit_section
FOR DELETE
TO authenticated
USING (true);

-- ---------------------------------------------------------------------------
-- 3. Kit photo policies
-- ---------------------------------------------------------------------------

-- Remove the legacy equivalents first so the policy list stays unambiguous.
DROP POLICY IF EXISTS "Read shop kit photos"
ON public.shop_kit_photos;

DROP POLICY IF EXISTS "Create shop kit photos"
ON public.shop_kit_photos;

DROP POLICY IF EXISTS "Update shop kit photos"
ON public.shop_kit_photos;

DROP POLICY IF EXISTS "Delete shop kit photos"
ON public.shop_kit_photos;

DROP POLICY IF EXISTS "Public can read shop kit photos"
ON public.shop_kit_photos;

CREATE POLICY "Public can read shop kit photos"
ON public.shop_kit_photos
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert shop kit photos"
ON public.shop_kit_photos;

CREATE POLICY "Authenticated users can insert shop kit photos"
ON public.shop_kit_photos
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update shop kit photos"
ON public.shop_kit_photos;

CREATE POLICY "Authenticated users can update shop kit photos"
ON public.shop_kit_photos
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete shop kit photos"
ON public.shop_kit_photos;

CREATE POLICY "Authenticated users can delete shop kit photos"
ON public.shop_kit_photos
FOR DELETE
TO authenticated
USING (true);

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------

SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('shop_kit_section', 'shop_kit_photos')
ORDER BY tablename, cmd, policyname;
