-- Onzio Platform Phase 2: security foundation
-- Creates the tenant, billing, media, and audit primitives in the exposed
-- onzio schema. Authorization helpers remain private and are never exposed
-- through PostgREST.

create schema if not exists onzio;
create schema if not exists onzio_private;

revoke all on schema onzio_private from public;
revoke all on schema onzio_private from anon, authenticated;
grant usage on schema onzio to anon, authenticated, service_role;
grant usage on schema onzio_private to service_role;

create table onzio.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  lifecycle text not null default 'onboarding'
    check (lifecycle in ('onboarding', 'active', 'archived')),
  public_access text not null default 'preview'
    check (public_access in ('preview', 'live', 'grace', 'suspended')),
  tier text not null default 'starter'
    check (tier in ('starter', 'pro')),
  primary_color text
    check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text
    check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (
    (lifecycle = 'archived' and public_access = 'suspended')
    or lifecycle <> 'archived'
  )
);

create table onzio.club_domains (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  hostname text not null
    check (
      hostname = lower(hostname)
      and hostname !~ '[/:[:space:]]'
      and hostname !~ '\.$'
    ),
  is_primary boolean not null default false,
  verified_at timestamptz,
  environment text not null
    check (environment in ('staging', 'production')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, hostname),
  unique (club_id, id)
);

create unique index club_domains_one_active_primary_per_environment
  on onzio.club_domains (club_id, environment)
  where is_primary and active;

create index club_domains_resolution_idx
  on onzio.club_domains (environment, hostname)
  where active and verified_at is not null;

create table onzio.club_members (
  user_id uuid not null references auth.users(id) on delete restrict,
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  role text not null check (role in ('owner', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (user_id, club_id),
  unique (club_id, user_id),
  check (
    (status = 'removed' and removed_at is not null)
    or (status = 'active' and removed_at is null)
  )
);

create index club_members_active_user_idx
  on onzio.club_members (user_id, club_id)
  where status = 'active';

create table onzio.club_subscriptions (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  price_id text,
  tier text check (tier is null or tier in ('starter', 'pro')),
  status text,
  cancel_at_period_end boolean not null default false,
  paid_through timestamptz,
  grace_ends_at timestamptz,
  last_applied_stripe_event_id text,
  last_applied_stripe_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    stripe_subscription_id is null
    or (stripe_customer_id is not null and price_id is not null)
  )
);

create table onzio.stripe_events (
  id text primary key,
  club_id uuid references onzio.clubs(id) on delete restrict,
  environment text not null
    check (environment in ('test', 'production')),
  event_type text not null,
  stripe_created_at timestamptz not null,
  applied_at timestamptz,
  outcome text not null default 'received'
    check (outcome in ('received', 'applied', 'ignored', 'rejected')),
  rejection_code text,
  payload_digest text not null,
  created_at timestamptz not null default now()
);

create index stripe_events_club_created_idx
  on onzio.stripe_events (club_id, stripe_created_at desc);

create table onzio.media_assets (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  storage_bucket text not null
    check (storage_bucket in ('onzio-upload-staging', 'onzio-media')),
  storage_path text not null,
  surface text not null
    check (surface ~ '^[a-z][a-z0-9-]{0,63}$'),
  media_kind text not null
    check (media_kind in ('photograph', 'graphic')),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 15728640),
  width integer not null check (width > 0 and width <= 6000),
  height integer not null check (height > 0 and height <= 6000),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'staged'
    check (status in ('staged', 'published', 'rejected', 'orphaned')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  unique (storage_bucket, storage_path),
  unique (club_id, id),
  check (
    storage_path ~ ('^' || club_id::text || '/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
  ),
  check (
    (status = 'published' and storage_bucket = 'onzio-media' and published_at is not null)
    or status <> 'published'
  )
);

create index media_assets_club_surface_idx
  on onzio.media_assets (club_id, surface, created_at desc);

create table onzio.audit_events (
  id bigint generated always as identity primary key,
  club_id uuid references onzio.clubs(id) on delete restrict,
  actor_user_id uuid,
  actor_type text not null default 'user'
    check (actor_type in ('user', 'operator', 'webhook', 'media_processor', 'migration', 'system')),
  operation text not null,
  resource_type text not null,
  resource_id text,
  request_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_club_created_idx
  on onzio.audit_events (club_id, created_at desc);

create index audit_events_resource_idx
  on onzio.audit_events (resource_type, resource_id, created_at desc);

comment on table onzio.audit_events is
  'Append-only audit log. Payloads must exclude credentials and complete sensitive records.';

create or replace function onzio_private.is_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

create or replace function onzio_private.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from onzio.club_members member
    where member.club_id = p_club_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  );
$$;

create or replace function onzio_private.has_club_role(
  p_club_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from onzio.club_members member
    where member.club_id = p_club_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role = any (p_roles)
  );
$$;

create or replace function onzio_private.is_publicly_accessible(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from onzio.clubs club
    where club.id = p_club_id
      and club.lifecycle = 'active'
      and club.public_access in ('live', 'grace')
  );
$$;

create or replace function onzio_private.can_read_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.is_publicly_accessible(p_club_id)
    or (
      onzio_private.is_aal2()
      and onzio_private.is_club_member(p_club_id)
      and exists (
        select 1
        from onzio.clubs club
        where club.id = p_club_id
          and club.lifecycle <> 'archived'
      )
    );
$$;

create or replace function onzio_private.can_mutate_content(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.is_aal2()
    and onzio_private.is_club_member(p_club_id)
    and exists (
      select 1
      from onzio.clubs club
      where club.id = p_club_id
        and club.lifecycle = 'active'
    );
$$;

create or replace function onzio_private.club_has_feature(
  p_club_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from onzio.clubs club
    where club.id = p_club_id
      and (
        club.tier = 'pro'
        or p_feature in ('branding', 'roster', 'schedule', 'homepage', 'about')
      )
  );
$$;

create or replace function onzio_private.can_read_feature(
  p_club_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.can_read_club(p_club_id)
    and onzio_private.club_has_feature(p_club_id, p_feature);
$$;

create or replace function onzio_private.can_mutate_feature(
  p_club_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.can_mutate_content(p_club_id)
    and onzio_private.club_has_feature(p_club_id, p_feature);
$$;

revoke execute on function onzio_private.is_aal2() from public;
revoke execute on function onzio_private.is_club_member(uuid) from public;
revoke execute on function onzio_private.has_club_role(uuid, text[]) from public;
revoke execute on function onzio_private.is_publicly_accessible(uuid) from public;
revoke execute on function onzio_private.can_read_club(uuid) from public;
revoke execute on function onzio_private.can_mutate_content(uuid) from public;
revoke execute on function onzio_private.club_has_feature(uuid, text) from public;
revoke execute on function onzio_private.can_read_feature(uuid, text) from public;
revoke execute on function onzio_private.can_mutate_feature(uuid, text) from public;

grant execute on function onzio_private.is_aal2() to authenticated, service_role;
grant execute on function onzio_private.is_club_member(uuid) to authenticated, service_role;
grant execute on function onzio_private.has_club_role(uuid, text[]) to authenticated, service_role;
grant execute on function onzio_private.is_publicly_accessible(uuid) to anon, authenticated, service_role;
grant execute on function onzio_private.can_read_club(uuid) to anon, authenticated, service_role;
grant execute on function onzio_private.can_mutate_content(uuid) to authenticated, service_role;
grant execute on function onzio_private.club_has_feature(uuid, text) to anon, authenticated, service_role;
grant execute on function onzio_private.can_read_feature(uuid, text) to anon, authenticated, service_role;
grant execute on function onzio_private.can_mutate_feature(uuid, text) to authenticated, service_role;
