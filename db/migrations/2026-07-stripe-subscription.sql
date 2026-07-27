-- Rose City FC platform subscription mirror (Christian <-> Rose City FC, Pro tier)
-- Date: 2026-07
--
-- Singleton row (id = 1) kept in sync by the Stripe webhook handler at
-- app/api/stripe/webhook/route.ts. middleware.ts reads this row on every
-- /admin/* request instead of calling the Stripe API directly.

CREATE TABLE IF NOT EXISTS public.stripe_subscription (
  id                     integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  current_period_end     timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Deliberately NOT seeding an id=1 row here (unlike site_branding, which
-- seeds a default row). Before the first Checkout ever completes, no row
-- should exist at all, and middleware treats "no row" as fully unlocked.
-- The webhook's checkout.session.completed handler performs the first-ever
-- insert via upsert(id=1).

ALTER TABLE public.stripe_subscription ENABLE ROW LEVEL SECURITY;

-- Authenticated admins can read subscription status (middleware + the
-- Payments page). No grant to anon — the public site never reads billing
-- state.
GRANT SELECT ON public.stripe_subscription TO authenticated;

-- The webhook route writes using the Supabase service_role key. service_role
-- bypasses RLS policies, but table-level GRANTs are a separate mechanism and
-- still apply even to service_role — without this, every webhook write fails
-- with "permission denied for table stripe_subscription".
GRANT ALL ON public.stripe_subscription TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stripe_subscription'
      AND policyname = 'Authenticated can read subscription state'
  ) THEN
    CREATE POLICY "Authenticated can read subscription state"
    ON public.stripe_subscription FOR SELECT TO authenticated USING (true);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
