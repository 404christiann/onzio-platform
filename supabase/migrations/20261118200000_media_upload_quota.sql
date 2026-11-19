-- RC-ADMIN-10b: per-club media quota, upload rate limit and one-time upload reservations.
-- Approved by Christian on 2026-11-18. Needs the production migration gate before merge.
--
-- Before this, /api/admin/media/authorize signed a staging upload for any club editor with no
-- limit on bytes, files or speed, and getMediaUsageByClub was never called. Now authorize asks
-- onzio.reserve_media_upload first. Under a per-club lock it counts the club's published media
-- plus its open reservations, checks the limits, and records a reservation that expires in five
-- minutes (the same as the signed authorization token). Finalize consumes the reservation once,
-- through onzio.consume_media_upload_reservation, and refuses staged bytes larger than the size
-- claimed at authorize. RC-ADMIN-10c will make the staging INSERT policy require a reservation.
--
-- Defaults (one place, onzio_private.media_limits): 2 GiB, 2,000 files, 60 uploads per rolling
-- hour, 300 per rolling day, 40 open reservations. A row in onzio_private.club_media_limits
-- overrides any of them for one club; a null column keeps the default. Bytes count published
-- (normalized) sizes plus the claimed size of open reservations. Rate counts every reservation
-- issued in the window, used or not. A club's reservations older than 48 hours are deleted when
-- it next reserves, so the table never needs a cleanup job.
--
-- Both tables live in onzio_private: not exposed by PostgREST, RLS on with no policies, and no
-- rights for anon or authenticated. Only the service role reaches them, through the three RPCs.
-- They reference onzio.clubs on delete cascade, so the archived-club purge removes them with the
-- club (it counts onzio_private tables and does not need to list them).
--
-- Rollback: roll the app back first (the old code never calls these RPCs), then drop the three
-- onzio wrappers, the onzio_private functions and the two tables. No existing data is changed.

create table onzio_private.club_media_limits (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  max_bytes bigint check (max_bytes > 0),
  max_assets integer check (max_assets > 0),
  max_uploads_per_hour integer check (max_uploads_per_hour > 0),
  max_uploads_per_day integer check (max_uploads_per_day > 0),
  max_open_reservations integer check (max_open_reservations > 0),
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now()
);

create table onzio_private.media_upload_reservations (
  id uuid primary key,
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null,
  surface text not null check (surface ~ '^[a-z][a-z0-9-]{0,63}$'),
  kind text not null check (kind in ('photo', 'graphic')),
  staging_path text not null unique,
  claimed_size bigint not null check (claimed_size > 0 and claimed_size <= 15728640),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  outcome text check (outcome in ('consumed', 'rejected', 'expired')),
  check (kind = 'photo' or claimed_size <= 5242880),
  check (staging_path ~ ('^' || club_id::text || '/' || surface || '/' || id::text || '\.(jpg|jpeg|png|webp)$')),
  check (expires_at > issued_at),
  check ((consumed_at is null) = (outcome is null))
);

create index media_upload_reservations_club_issued_idx
  on onzio_private.media_upload_reservations (club_id, issued_at);

alter table onzio_private.club_media_limits enable row level security;
alter table onzio_private.media_upload_reservations enable row level security;
revoke all on onzio_private.club_media_limits from public, anon, authenticated;
revoke all on onzio_private.media_upload_reservations from public, anon, authenticated;

create function onzio_private.media_limits(p_club_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'maxBytes', coalesce(l.max_bytes, 2147483648),
    'maxAssets', coalesce(l.max_assets, 2000),
    'maxUploadsPerHour', coalesce(l.max_uploads_per_hour, 60),
    'maxUploadsPerDay', coalesce(l.max_uploads_per_day, 300),
    'maxOpenReservations', coalesce(l.max_open_reservations, 40)
  )
  from (select 1) one
  left join onzio_private.club_media_limits l on l.club_id = p_club_id;
$$;

create function onzio_private.media_usage_snapshot(p_club_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'publishedAssets', published.n,
    'publishedBytes', published.bytes,
    'openReservations', open.n,
    'openBytes', open.bytes,
    'uploadsLastHour', recent.hour,
    'uploadsLastDay', recent.day,
    'limits', onzio_private.media_limits(p_club_id)
  )
  from
    (select count(*) as n, coalesce(sum(m.byte_size), 0) as bytes
       from onzio.media_assets m
      where m.club_id = p_club_id and m.status = 'published') published,
    (select count(*) as n, coalesce(sum(r.claimed_size), 0) as bytes
       from onzio_private.media_upload_reservations r
      where r.club_id = p_club_id and r.consumed_at is null and r.expires_at > pg_catalog.now()) open,
    (select count(*) filter (where r.issued_at > pg_catalog.now() - interval '1 hour') as hour,
            count(*) as day
       from onzio_private.media_upload_reservations r
      where r.club_id = p_club_id and r.issued_at > pg_catalog.now() - interval '24 hours') recent;
$$;

create function onzio_private.reserve_media_upload_core(
  p_club_id uuid, p_actor_id uuid, p_upload_id uuid, p_surface text, p_kind text,
  p_staging_path text, p_claimed_size bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  usage jsonb;
  lim jsonb;
  oldest timestamptz;
  expires timestamptz;
begin
  -- One writer per club at a time, so parallel uploads cannot all pass the same count.
  perform pg_catalog.pg_advisory_xact_lock(734901501, pg_catalog.hashtext(p_club_id::text));

  delete from onzio_private.media_upload_reservations
   where club_id = p_club_id and issued_at < pg_catalog.now() - interval '48 hours';

  usage := onzio_private.media_usage_snapshot(p_club_id);
  lim := usage->'limits';

  -- The quota comes first: a club that is full should not be told to wait.
  if (usage->>'publishedBytes')::bigint + (usage->>'openBytes')::bigint + p_claimed_size > (lim->>'maxBytes')::bigint then
    return pg_catalog.jsonb_build_object('status', 'bytes');
  end if;
  if (usage->>'publishedAssets')::bigint + (usage->>'openReservations')::bigint + 1 > (lim->>'maxAssets')::bigint then
    return pg_catalog.jsonb_build_object('status', 'files');
  end if;
  if (usage->>'openReservations')::bigint + 1 > (lim->>'maxOpenReservations')::bigint then
    select min(r.expires_at) into oldest from onzio_private.media_upload_reservations r
     where r.club_id = p_club_id and r.consumed_at is null and r.expires_at > pg_catalog.now();
    return pg_catalog.jsonb_build_object('status', 'rate', 'limit', 'open',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from oldest - pg_catalog.now())))::int);
  end if;
  if (usage->>'uploadsLastHour')::bigint + 1 > (lim->>'maxUploadsPerHour')::bigint then
    select min(r.issued_at) into oldest from onzio_private.media_upload_reservations r
     where r.club_id = p_club_id and r.issued_at > pg_catalog.now() - interval '1 hour';
    return pg_catalog.jsonb_build_object('status', 'rate', 'limit', 'hour',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from oldest + interval '1 hour' - pg_catalog.now())))::int);
  end if;
  if (usage->>'uploadsLastDay')::bigint + 1 > (lim->>'maxUploadsPerDay')::bigint then
    select min(r.issued_at) into oldest from onzio_private.media_upload_reservations r
     where r.club_id = p_club_id and r.issued_at > pg_catalog.now() - interval '24 hours';
    return pg_catalog.jsonb_build_object('status', 'rate', 'limit', 'day',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from oldest + interval '24 hours' - pg_catalog.now())))::int);
  end if;

  expires := pg_catalog.now() + interval '5 minutes';
  insert into onzio_private.media_upload_reservations
    (id, club_id, actor_id, surface, kind, staging_path, claimed_size, issued_at, expires_at)
  values
    (p_upload_id, p_club_id, p_actor_id, p_surface, p_kind, p_staging_path, p_claimed_size, pg_catalog.now(), expires);

  return pg_catalog.jsonb_build_object(
    'status', 'reserved',
    'expiresAt', floor(extract(epoch from expires) * 1000)::bigint
  );
end $$;

create function onzio_private.consume_media_upload_reservation_core(
  p_upload_id uuid, p_club_id uuid, p_actor_id uuid, p_staging_path text, p_actual_size bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r onzio_private.media_upload_reservations;
begin
  select * into r from onzio_private.media_upload_reservations where id = p_upload_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'missing');
  end if;
  if r.club_id <> p_club_id or r.actor_id <> p_actor_id or r.staging_path <> p_staging_path then
    return pg_catalog.jsonb_build_object('status', 'mismatch');
  end if;
  if r.consumed_at is not null then
    return pg_catalog.jsonb_build_object('status', 'used');
  end if;
  if r.expires_at <= pg_catalog.now() then
    update onzio_private.media_upload_reservations
       set consumed_at = pg_catalog.now(), outcome = 'expired' where id = p_upload_id;
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;
  if p_actual_size is null or p_actual_size > r.claimed_size then
    update onzio_private.media_upload_reservations
       set consumed_at = pg_catalog.now(), outcome = 'rejected' where id = p_upload_id;
    return pg_catalog.jsonb_build_object('status', 'too-large');
  end if;
  update onzio_private.media_upload_reservations
     set consumed_at = pg_catalog.now(), outcome = 'consumed' where id = p_upload_id;
  return pg_catalog.jsonb_build_object('status', 'consumed');
end $$;

revoke all on function onzio_private.media_limits(uuid) from public, anon, authenticated, service_role;
revoke all on function onzio_private.media_usage_snapshot(uuid) from public, anon, authenticated, service_role;
revoke all on function onzio_private.reserve_media_upload_core(uuid, uuid, uuid, text, text, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function onzio_private.consume_media_upload_reservation_core(uuid, uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function onzio_private.media_usage_snapshot(uuid) to service_role;
grant execute on function onzio_private.reserve_media_upload_core(uuid, uuid, uuid, text, text, text, bigint) to service_role;
grant execute on function onzio_private.consume_media_upload_reservation_core(uuid, uuid, uuid, text, bigint) to service_role;

create function onzio.reserve_media_upload(
  p_club_id uuid, p_actor_id uuid, p_upload_id uuid, p_surface text, p_kind text,
  p_staging_path text, p_claimed_size bigint
) returns jsonb
language sql security invoker set search_path = '' as $$
  select onzio_private.reserve_media_upload_core(
    p_club_id, p_actor_id, p_upload_id, p_surface, p_kind, p_staging_path, p_claimed_size);
$$;

create function onzio.consume_media_upload_reservation(
  p_upload_id uuid, p_club_id uuid, p_actor_id uuid, p_staging_path text, p_actual_size bigint
) returns jsonb
language sql security invoker set search_path = '' as $$
  select onzio_private.consume_media_upload_reservation_core(
    p_upload_id, p_club_id, p_actor_id, p_staging_path, p_actual_size);
$$;

create function onzio.media_usage(p_club_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select onzio_private.media_usage_snapshot(p_club_id);
$$;

revoke all on function onzio.reserve_media_upload(uuid, uuid, uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function onzio.consume_media_upload_reservation(uuid, uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function onzio.media_usage(uuid) from public, anon, authenticated;
grant execute on function onzio.reserve_media_upload(uuid, uuid, uuid, text, text, text, bigint) to service_role;
grant execute on function onzio.consume_media_upload_reservation(uuid, uuid, uuid, text, bigint) to service_role;
grant execute on function onzio.media_usage(uuid) to service_role;

-- No club may start over a default. Christian checks headroom (each club at most half of every
-- default) with the read-only B1-b query before the push and adds an override row if needed.
do $$
declare
  over text;
begin
  select pg_catalog.string_agg(c.slug, ', ' order by c.slug) into over
  from onzio.clubs c
  join lateral (
    select count(*) as n, coalesce(sum(m.byte_size), 0) as bytes
    from onzio.media_assets m where m.club_id = c.id and m.status = 'published'
  ) u on true
  left join onzio_private.club_media_limits l on l.club_id = c.id
  where u.bytes > coalesce(l.max_bytes, 2147483648) or u.n > coalesce(l.max_assets, 2000);
  if over is not null then
    raise exception 'RC-ADMIN-10b: club(s) already over a media default: %; add an override row first', over
      using errcode = '23514';
  end if;
end $$;

notify pgrst, 'reload schema';
