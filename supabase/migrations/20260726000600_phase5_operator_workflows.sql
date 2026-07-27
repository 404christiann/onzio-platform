-- Onzio Platform Phase 5: operator workflow records and purge-safe ledgers.
--
-- Operator mutations remain in the server-only lib/operator boundary. This
-- table records the verified export prerequisite for a hard purge. Browser
-- roles receive no access and no RLS policy.

create table onzio.club_exports (
  id text primary key
    check (char_length(id) between 1 and 200),
  club_id uuid not null,
  club_slug text not null
    check (club_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'verified'
    check (status in ('verified', 'purged')),
  checksum_sha256 text not null
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  object_count integer not null check (object_count >= 0),
  row_count integer not null check (row_count >= 0),
  storage_reference text not null
    check (char_length(storage_reference) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  purged_at timestamptz,
  check (
    (status = 'purged' and purged_at is not null)
    or (status = 'verified' and purged_at is null)
  )
);

create index club_exports_club_created_idx
  on onzio.club_exports (club_id, created_at desc);

alter table onzio.club_exports enable row level security;
revoke all on onzio.club_exports from public, anon, authenticated;
grant select, insert, update on onzio.club_exports to service_role;

comment on table onzio.club_exports is
  'Privileged export verification ledger required before hard purge. It intentionally survives tenant deletion.';

-- Immutable audit and Stripe ledgers survive a hard purge. Removing a club
-- detaches their tenant foreign key instead of granting broad delete/update
-- rights to the service role.
alter table onzio.audit_events
  drop constraint audit_events_club_id_fkey,
  add constraint audit_events_club_id_fkey
    foreign key (club_id) references onzio.clubs(id) on delete set null;

alter table onzio.stripe_events
  drop constraint stripe_events_club_id_fkey,
  add constraint stripe_events_club_id_fkey
    foreign key (club_id) references onzio.clubs(id) on delete set null;

notify pgrst, 'reload schema';
