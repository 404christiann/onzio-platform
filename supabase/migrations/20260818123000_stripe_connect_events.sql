-- CV United C1: replay ledger for Stripe **Connect** webhook deliveries.
--
-- Deliberately a separate table from onzio.stripe_events, which is the ledger
-- for Onzio's own subscription billing (20260726000100_phase2_foundation.sql).
-- The two event streams come from different Stripe endpoints, are signed with
-- different secrets, and describe different money: stripe_events records
-- charges Onzio makes against a club on the platform account, while this table
-- records charges a CLUB makes against a family on the club's own connected
-- account, where Onzio takes no fee and never touches the funds. Sharing one
-- table would let a bug or a replay in one stream mark the other processed,
-- and would make "which events touched club money?" unanswerable.
--
-- Idempotency: `id` is Stripe's event id and the primary key. The webhook
-- inserts before it does any work, so a redelivery loses the insert race with a
-- unique-violation and is answered as a duplicate instead of being applied a
-- second time.

create table onzio.stripe_connect_events (
  -- Stripe event id (evt_...). Primary key, so a replay cannot be inserted.
  id text primary key,
  club_id uuid references onzio.clubs(id) on delete restrict,
  -- The connected account the event was delivered for. Connect deliveries
  -- carry this on the event envelope; a platform event has none, and this
  -- endpoint refuses those.
  connected_account_id text not null
    check (connected_account_id ~ '^acct_[A-Za-z0-9]+$'),
  -- Stripe's own livemode flag, recorded verbatim. In the current phase every
  -- row must be false; keeping the raw value means a live delivery that ever
  -- reached this endpoint is visible in the ledger rather than inferred.
  livemode boolean not null,
  event_type text not null,
  stripe_created_at timestamptz not null,
  outcome text not null default 'received'
    check (outcome in ('received', 'applied', 'ignored', 'rejected')),
  rejection_code text,
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index stripe_connect_events_club_created_idx
  on onzio.stripe_connect_events (club_id, stripe_created_at desc);

alter table onzio.stripe_connect_events enable row level security;

-- No grant to anon or authenticated, and no policy. This table is written and
-- read only by the service-role webhook boundary. Unlike onzio.stripe_events,
-- which kept a SELECT grant so RLS could return an empty result without
-- leaking existence, nothing in the product ever reads Connect deliveries from
-- a client, so the grant is withheld outright. Written explicitly rather than
-- relied on as a default, following onzio.email_delivery_events (20260804024349).
revoke all on onzio.stripe_connect_events from public, anon, authenticated;
grant all on onzio.stripe_connect_events to service_role;

comment on table onzio.stripe_connect_events is
  'Replay ledger for Stripe Connect webhook deliveries about club registration payments (direct charges on connected accounts). Separate from onzio.stripe_events, which covers Onzio''s own subscription billing; the two share no keys, secrets, or rows.';

notify pgrst, 'reload schema';
