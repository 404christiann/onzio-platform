-- Rose City FC editable shop bullet points and store information
-- Date: 2026-07
--
-- Additive follow-up for environments where 2026-07-shop-kit-section.sql has
-- already been run. Safe to run once in the Supabase SQL editor.

ALTER TABLE public.shop_kit_section
ADD COLUMN IF NOT EXISTS bullet_points text[] NOT NULL DEFAULT ARRAY[
  'Authentic match jersey',
  'Any name & number',
  'League patch',
  'Team sponsor badges',
  'Raffle ticket included',
  'Custom name + $10'
]::text[];

ALTER TABLE public.shop_kit_section
ADD COLUMN IF NOT EXISTS store_note text NOT NULL DEFAULT
  E'Sold exclusively at Niky''s Sports\n33 E Colorado Blvd, Pasadena, CA';

NOTIFY pgrst, 'reload schema';

SELECT id, bullet_points, store_note
FROM public.shop_kit_section;
