-- CV United C1: club-published registration forms and the family submissions
-- made against them.
--
-- Two tables with deliberately different exposure, because they hold
-- deliberately different things:
--
--   * onzio.registration_forms is marketing-adjacent club content -- "the
--     2026 academy intake is open, it costs $X, here is the waiver text".
--     A public /join page has to be able to read it anonymously, so it
--     follows the established content convention: `grant select ... to anon,
--     authenticated` plus an explicit read policy, writes restricted to
--     authenticated club members (the admin UI) and service_role.
--     The anonymous read is narrower than the usual content tables': only
--     `status = 'live'` rows are visible, so a draft or closed form is not
--     discoverable before or after the club intends it to be.
--
--   * onzio.registration_responses holds real families' PII -- player name,
--     date of birth, parent/guardian contact, waiver acceptance, and later
--     payment state. It gets NO anon grant at all, not even select. This is
--     stricter than the read-only convention every public content table since
--     20260726000300_phase2_security.sql uses, and it is deliberate: the
--     reason that migration left anon with SELECT on stripe_events and
--     audit_events was so RLS could return an empty result without leaking
--     existence. Here there is no public surface that ever needs to read a
--     submission, so the grant is removed outright rather than left to RLS.
--
-- No anonymous INSERT policy exists on either table, and none should be added.
-- This repository has never granted anon a write on any table; every
-- public-originated write is funnelled through a privileged server-only
-- boundary (AGENTS.md: "Server-mediated admin mutations with user-scoped RLS
-- enforcement... Service role limited to privileged server-only boundaries").
-- Submissions from the public /join form are therefore written by a Next.js
-- API route running the service-role client, which owns validation, rate
-- limiting, and tenant resolution from the verified domain -- never by a
-- client-side anon Supabase call, which could not be trusted with club_id,
-- price, or payment status.

-- ---------------------------------------------------------------------------
-- Registration forms
-- ---------------------------------------------------------------------------
-- One row per form a club offers. Multi-row per club: a club may run a
-- general-interest capture and one or more paid academy intakes at once, each
-- with its own status, price, and waiver version.
create table onzio.registration_forms (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,

  form_type text not null
    check (form_type in ('general_interest', 'academy_registration')),

  title text not null,
  description text,

  status text not null default 'draft'
    check (status in ('draft', 'live', 'closed')),

  requires_payment boolean not null default false,
  price_cents integer,
  currency text,

  waiver_text text,
  waiver_version integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Platform invariant (docs/onzio-platform-plan.md, AGENTS.md): every
  -- tenant-owned table exposes (club_id, id) so a child row can carry club_id
  -- into its foreign key and a cross-club association fails at the database
  -- boundary rather than in application code.
  unique (club_id, id),

  check (char_length(title) between 1 and 120),
  check (description is null or char_length(description) <= 2000),
  check (waiver_text is null or char_length(waiver_text) <= 20000),
  check (price_cents is null or price_cents > 0),
  check (waiver_version is null or waiver_version > 0),
  -- Stripe reports currencies as lowercase ISO 4217.
  check (currency is null or currency ~ '^[a-z]{3}$'),

  -- A form that charges must say what it charges. Enforced unconditionally
  -- because there is no draft state in which "requires payment, amount
  -- unknown" is a coherent record.
  constraint registration_forms_payment_amount_present
    check (
      requires_payment = false
      or (price_cents is not null and currency is not null)
    ),

  -- A *live* academy registration must carry the waiver a parent is being
  -- asked to accept; onzio.registration_responses enforces the matching
  -- acceptance at submit time. Gated on `status = 'live'` rather than on
  -- form_type alone so an admin can still save a half-written draft.
  constraint registration_forms_live_academy_waiver_present
    check (
      status <> 'live'
      or form_type <> 'academy_registration'
      or (waiver_text is not null and waiver_version is not null)
    )
);

create index registration_forms_club_status_idx
  on onzio.registration_forms (club_id, status, form_type);

alter table onzio.registration_forms enable row level security;

grant select on onzio.registration_forms to anon, authenticated;
grant insert, update, delete on onzio.registration_forms to authenticated;
grant all on onzio.registration_forms to service_role;

-- Public /join surface: live forms only, and only for a club whose site is
-- actually publicly readable. Modelled on media_assets_public_read, which
-- likewise pairs a row-level status filter with is_publicly_accessible.
create policy registration_forms_public_read
on onzio.registration_forms
for select
to anon, authenticated
using (
  status = 'live'
  and onzio_private.is_publicly_accessible(club_id)
);

-- Admin surface: a signed-in member of the club sees its drafts and closed
-- forms too. Same shape as media_assets_member_read after PLAT-101.
create policy registration_forms_member_read
on onzio.registration_forms
for select
to authenticated
using (
  onzio_private.is_club_session_fresh()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1
    from onzio.clubs club
    where club.id = registration_forms.club_id
      and club.lifecycle <> 'archived'
  )
);

create policy registration_forms_tenant_insert
on onzio.registration_forms
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'registration'));

create policy registration_forms_tenant_update
on onzio.registration_forms
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'registration'))
with check (onzio_private.can_mutate_feature(club_id, 'registration'));

create policy registration_forms_tenant_delete
on onzio.registration_forms
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'registration'));

create trigger audit_registration_forms
after insert or update or delete on onzio.registration_forms
for each row execute function onzio_private.audit_content_mutation();

create trigger set_registration_forms_updated_at
before update on onzio.registration_forms
for each row execute function onzio_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Registration responses
-- ---------------------------------------------------------------------------
-- One row per submission. Every column below is family PII or payment state;
-- see the header comment for why anon receives no grant on this table.
create table onzio.registration_responses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  form_id uuid not null,

  player_first_name text not null,
  player_last_name text not null,
  player_dob date not null,
  parent_guardian_name text not null,
  parent_guardian_email text not null,
  parent_guardian_phone text not null,
  notes text,

  -- General-interest submissions only; an academy registration names the
  -- specific intake through form_id instead.
  interest_area text,

  waiver_accepted_at timestamptz,
  waiver_version_accepted integer,

  payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'pending', 'paid', 'failed')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  amount_paid_cents integer,
  paid_at timestamptz,

  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (club_id, id),

  -- Composite reference: a response may only point at a form owned by the
  -- same club, exactly as onzio.tryouts references onzio.programs. This makes
  -- a cross-tenant submission structurally impossible.
  foreign key (club_id, form_id)
    references onzio.registration_forms(club_id, id) on delete restrict,

  check (char_length(player_first_name) between 1 and 80),
  check (char_length(player_last_name) between 1 and 80),
  check (char_length(parent_guardian_name) between 1 and 160),
  check (char_length(parent_guardian_email) <= 254),
  check (parent_guardian_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  check (char_length(parent_guardian_phone) between 1 and 40),
  check (notes is null or char_length(notes) <= 2000),
  check (interest_area is null or char_length(interest_area) <= 120),
  check (waiver_version_accepted is null or waiver_version_accepted > 0),
  check (amount_paid_cents is null or amount_paid_cents > 0),
  -- A date of birth in the future is never a real player.
  check (player_dob <= current_date),

  -- Waiver acceptance is a pair or it is nothing: a timestamp with no version
  -- cannot be audited against the text the parent actually saw.
  constraint registration_responses_waiver_pair
    check (
      (waiver_accepted_at is null and waiver_version_accepted is null)
      or (waiver_accepted_at is not null and waiver_version_accepted is not null)
    ),

  -- Payment facts must match the status they are filed under.
  constraint registration_responses_paid_evidence
    check (
      payment_status <> 'paid'
      or (amount_paid_cents is not null and paid_at is not null)
    )
);

create index registration_responses_club_form_submitted_idx
  on onzio.registration_responses (club_id, form_id, submitted_at desc);

create index registration_responses_club_payment_status_idx
  on onzio.registration_responses (club_id, payment_status);

alter table onzio.registration_responses enable row level security;

-- No anon grant. Not select, not insert. Following the
-- onzio.email_delivery_events precedent (20260804024349), the revoke is
-- written explicitly rather than relied on as a Postgres default, so the
-- intent survives any future change to schema-level default privileges.
revoke all on onzio.registration_responses from public, anon, authenticated;
grant select on onzio.registration_responses to authenticated;
grant all on onzio.registration_responses to service_role;

comment on table onzio.registration_responses is
  'Family registration submissions (player PII, guardian contact, waiver acceptance, payment state). Anon holds no grant; every write is made by a service-role Next.js API route, never by a client-side anon call. Club members read only their own club''s rows.';

-- Club members and operators read their own club's submissions. Deliberately
-- the only policy on this table: with no insert/update/delete policy and no
-- write grant, `authenticated` cannot write here at all, and service_role --
-- which bypasses RLS -- is the sole writer.
create policy registration_responses_member_read
on onzio.registration_responses
for select
to authenticated
using (
  onzio_private.is_club_session_fresh()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1
    from onzio.clubs club
    where club.id = registration_responses.club_id
      and club.lifecycle <> 'archived'
  )
);

-- Academy registrations must carry an accepted waiver at submit time. A plain
-- CHECK constraint cannot express this: the deciding value
-- (registration_forms.form_type) lives in the parent row, and Postgres CHECK
-- constraints may only reference columns of the row being checked. Rather
-- than leave the rule to the API route alone, it is enforced here as a
-- BEFORE trigger, matching the guard-trigger precedent this repository
-- already uses for rules constraints cannot express
-- (onzio_private.prevent_presentation_document_mutation,
-- 20260729040045_phase9_presentation_system.sql) and AGENTS.md's rule that
-- "RLS and database constraints are the final authorization boundary". The
-- API route still validates the same rule so a family sees a usable error;
-- this is the backstop that makes bypassing it impossible.
create or replace function onzio_private.enforce_registration_response_waiver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_form_type text;
begin
  select form.form_type
  into parent_form_type
  from onzio.registration_forms form
  where form.club_id = new.club_id
    and form.id = new.form_id;

  if parent_form_type = 'academy_registration'
    and (
      new.waiver_accepted_at is null
      or new.waiver_version_accepted is null
    )
  then
    raise exception
      'academy registration responses require waiver_accepted_at and waiver_version_accepted'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function onzio_private.enforce_registration_response_waiver()
  from public;
grant execute on function onzio_private.enforce_registration_response_waiver()
  to service_role;

create trigger registration_responses_require_waiver
before insert or update on onzio.registration_responses
for each row execute function onzio_private.enforce_registration_response_waiver();

create trigger set_registration_responses_updated_at
before update on onzio.registration_responses
for each row execute function onzio_private.set_updated_at();

-- Deliberately no audit_content_mutation trigger here. That trigger exists to
-- record which fields a club admin changed on club *content*; a submission is
-- itself the record, it is written once by the server, and every one of its
-- columns is family PII. An audit row per submission would add no accountability
-- the row itself does not already carry.

notify pgrst, 'reload schema';
