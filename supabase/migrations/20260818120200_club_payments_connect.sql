-- CV United C1: per-club Stripe Connect identity and the operator-only switch
-- that decides whether a club may take live registration payments.

alter table onzio.clubs
  add column stripe_connect_account_id text
    check (
      stripe_connect_account_id is null
      or stripe_connect_account_id ~ '^acct_[A-Za-z0-9]+$'
    ),
  add column payments_live_enabled boolean not null default false;

comment on column onzio.clubs.stripe_connect_account_id is
  'Connected Stripe account that receives this club''s registration payments. Set by an operator after Connect onboarding; never written from club-facing surfaces.';

-- Same operator-only mechanism as onzio.clubs.store_enabled
-- (20260812120200_club_store_enabled.sql): the switch is a column on
-- onzio.clubs, and 20260726000300_phase2_security.sql revoked INSERT, UPDATE,
-- and DELETE on onzio.clubs from both anon and authenticated. No policy can
-- re-grant what the table grant withholds, so a club owner or admin cannot
-- flip this even with a valid session -- only the service role, used by an
-- operator script or a privileged server-only boundary, can. It is
-- deliberately not derived from tier, kind, or subscription state.
comment on column onzio.clubs.payments_live_enabled is
  'Operator-only switch for taking live registration payments. Not tier-derived, not club-self-service; onzio.clubs grants no UPDATE to anon or authenticated, so only the service role can set it.';

-- No backfill. Every existing club starts with payments off, which is the
-- honest state: none has completed Stripe Connect onboarding.

notify pgrst, 'reload schema';
