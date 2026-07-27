-- Rose City FC admin-editable shop purchase details
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor before editing Purchase Details in
-- /admin/shop. Safe to rerun. Seeds the current public copy for a no-reset
-- rollout.

CREATE TABLE IF NOT EXISTS public.shop_purchase_details (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  heading     text NOT NULL DEFAULT 'Purchase Details',
  cards       jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta_eyebrow text NOT NULL DEFAULT 'Ready To Order',
  cta_text    text NOT NULL DEFAULT '',
  cta_label   text NOT NULL DEFAULT '',
  cta_link    text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shop_purchase_details TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shop_purchase_details TO authenticated;

ALTER TABLE public.shop_purchase_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read shop purchase details"
ON public.shop_purchase_details;

CREATE POLICY "Public can read shop purchase details"
ON public.shop_purchase_details
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert shop purchase details"
ON public.shop_purchase_details;

CREATE POLICY "Authenticated users can insert shop purchase details"
ON public.shop_purchase_details
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update shop purchase details"
ON public.shop_purchase_details;

CREATE POLICY "Authenticated users can update shop purchase details"
ON public.shop_purchase_details
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete shop purchase details"
ON public.shop_purchase_details;

CREATE POLICY "Authenticated users can delete shop purchase details"
ON public.shop_purchase_details
FOR DELETE
TO authenticated
USING (true);

INSERT INTO public.shop_purchase_details (
  id,
  heading,
  cards,
  cta_eyebrow,
  cta_text,
  cta_label,
  cta_link
)
VALUES (
  1,
  'Purchase Details',
  '[
    {
      "label": "What''s Included",
      "title": "Match jersey package",
      "body": "Authentic home jersey, any name and number, league patch, sponsor badges, and raffle ticket entry."
    },
    {
      "label": "Customization",
      "title": "Personalize the shirt",
      "body": "Add your preferred player name and number at checkout. Custom name service is available as an add-on."
    },
    {
      "label": "Available At",
      "title": "Niky''s Sports Pasadena",
      "body": "33 E Colorado Blvd, Pasadena, CA"
    },
    {
      "label": "Purchase Options",
      "title": "Online or in-store",
      "body": "Order through Niky''s online product page or visit the Pasadena shop for in-person pickup and sizing."
    }
  ]'::jsonb,
  'Ready To Order',
  'Buy online now or stop by Niky''s Sports in Pasadena.',
  'Buy Now →',
  'https://www.nikys-sports.com/products/nike-rose-city-fc-home-mens-dri-fit-soccer-jersey'
)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

SELECT id, heading, cards, cta_eyebrow, cta_text, cta_label, cta_link
FROM public.shop_purchase_details;
