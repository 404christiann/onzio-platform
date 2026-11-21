-- RC-HERO-VIDEO-COMPLETION: one pending hero upload per club, one event function.
--
-- This file was never applied. The row is not published content. presentation_config
-- changes only when ready calls swap_hero_video_core in the same transaction.
--
--   hero_video_event(club, guid, event, expected, ...)
--       compare-and-swap. Every transition updates where video_guid matches and
--       phase = any(expected). Zero rows returns outcome 'stale' and deletes nothing.
--       start takes the club advisory lock, refuses a prepare that is still inside
--       its deadline, checks today's count without incrementing it, and supersedes.
--   read / lookup / list     read-only. updated_at is display only.
--
-- Service role only. Rollback: drop the onzio wrappers, the onzio_private functions,
-- and onzio_private.hero_video_pending.

create table onzio_private.hero_video_pending (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  video_guid text not null,
  collection_id text not null,
  phase text not null check (phase in ('uploading', 'preparing', 'live', 'failed', 'abandoned')),
  failure_code text,
  revision_before text,
  revision_after text,
  started_at timestamptz not null default pg_catalog.now(),
  landed_at timestamptz,
  deadline_at timestamptz,
  replace_counted boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hero_video_pending_guid_format check (
    video_guid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint hero_video_pending_failure check (
    (phase = 'failed' and failure_code is not null) or (phase <> 'failed' and failure_code is null)
  ),
  constraint hero_video_pending_deadline check (
    (phase in ('live', 'failed', 'abandoned') and deadline_at is null)
    or (phase in ('uploading', 'preparing') and deadline_at is not null)
  )
);

create unique index hero_video_pending_guid on onzio_private.hero_video_pending (video_guid);

alter table onzio_private.hero_video_pending enable row level security;
revoke all on onzio_private.hero_video_pending from public, anon, authenticated;

create function onzio_private.hero_video_event_core(
  p_club_id uuid,
  p_video_guid text,
  p_event text,
  p_expected text[],
  p_collection_id text,
  p_failure_code text,
  p_library_id text,
  p_expected_live text,
  p_cap integer,
  p_deadline_ms bigint
) returns table(
  outcome text,
  delete_guid text,
  phase text,
  replace_counted boolean,
  revision_before text,
  revision_after text,
  used integer,
  collection_id text
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_row onzio_private.hero_video_pending%rowtype;
  v_used integer;
  v_day date := (pg_catalog.now() at time zone 'utc')::date;
  v_delete text;
  v_expected_live text;
  v_swap record;
  v_guid_ok boolean;
begin
  v_guid_ok := p_video_guid is not null and p_video_guid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if p_event is null or p_event not in ('start', 'land', 'ready', 'reject', 'abandon', 'expire') then
    raise exception 'INVALID_HERO_VIDEO_EVENT' using errcode = '22023';
  end if;
  if not v_guid_ok then
    raise exception 'INVALID_HERO_VIDEO_GUID' using errcode = '22023';
  end if;
  if p_expected is null then
    p_expected := array[]::text[];
  end if;

  if p_event = 'start' then
    if p_cap is null or p_cap < 1 or p_cap > 50 then
      raise exception 'INVALID_HERO_VIDEO_CAP' using errcode = '22023';
    end if;
    if p_collection_id is null or p_collection_id = '' or char_length(p_collection_id) > 80 then
      raise exception 'INVALID_HERO_VIDEO_COLLECTION' using errcode = '22023';
    end if;
    if p_deadline_ms is null or p_deadline_ms < 1 then
      raise exception 'INVALID_HERO_VIDEO_DEADLINE' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(734901502, pg_catalog.hashtext(p_club_id::text));
    select coalesce(
      (select c.used from onzio_private.hero_video_replace_counters c
        where c.club_id = p_club_id and c.day = v_day),
      0) into v_used;
    select * into v_row from onzio_private.hero_video_pending where club_id = p_club_id for update;
    if found and v_row.phase = 'preparing' and v_row.deadline_at > pg_catalog.now() then
      return query select 'preparing'::text, p_video_guid, v_row.phase, v_row.replace_counted, null::text, null::text, v_used, p_collection_id;
      return;
    end if;
    if v_used >= p_cap then
      return query select 'at_cap'::text, p_video_guid, null::text, false, null::text, null::text, v_used, p_collection_id;
      return;
    end if;
    if v_row.phase in ('uploading', 'preparing') then
      v_delete := v_row.video_guid;
    end if;
    insert into onzio_private.hero_video_pending as p (
      club_id, video_guid, collection_id, phase, failure_code, revision_before, revision_after,
      started_at, landed_at, deadline_at, replace_counted, updated_at
    ) values (
      p_club_id, p_video_guid, p_collection_id, 'uploading', null, null, null,
      pg_catalog.now(), null, pg_catalog.now() + make_interval(secs => p_deadline_ms / 1000.0), false, pg_catalog.now()
    )
    on conflict (club_id) do update
      set video_guid = excluded.video_guid,
          collection_id = excluded.collection_id,
          phase = 'uploading',
          failure_code = null,
          revision_before = null,
          revision_after = null,
          started_at = excluded.started_at,
          landed_at = null,
          deadline_at = excluded.deadline_at,
          replace_counted = false,
          updated_at = pg_catalog.now();
    return query select 'ok'::text, v_delete, 'uploading'::text, false, null::text, null::text, v_used, coalesce(v_row.collection_id, p_collection_id);
    return;
  end if;

  select * into v_row from onzio_private.hero_video_pending
   where club_id = p_club_id and video_guid = p_video_guid and phase = any(p_expected)
   for update;
  if not found then
    return query select 'stale'::text, null::text, null::text, false, null::text, null::text, null::integer, null::text;
    return;
  end if;

  if p_event = 'expire' and not (v_row.deadline_at <= pg_catalog.now()) then
    return query select 'stale'::text, null::text, v_row.phase, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id;
    return;
  end if;

  if p_event = 'land' then
    if not v_row.replace_counted then
      insert into onzio_private.hero_video_replace_counters as c (club_id, day, used)
      values (p_club_id, v_day, 1)
      on conflict (club_id, day) do update set used = c.used + 1, updated_at = pg_catalog.now();
    end if;
    update onzio_private.hero_video_pending
       set phase = 'preparing',
           failure_code = null,
           landed_at = coalesce(landed_at, pg_catalog.now()),
           deadline_at = pg_catalog.now() + make_interval(secs => p_deadline_ms / 1000.0),
           replace_counted = true,
           updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    return query select 'ok'::text, null::text, 'preparing'::text, true, null::text, null::text, null::integer, v_row.collection_id;
    return;
  end if;

  if p_event = 'abandon' then
    update onzio_private.hero_video_pending
       set phase = 'abandoned', failure_code = null, deadline_at = null, updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    return query select 'abandoned'::text, p_video_guid, 'abandoned'::text, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id;
    return;
  end if;

  if p_event = 'expire' then
    if v_row.phase = 'uploading' then
      update onzio_private.hero_video_pending
         set phase = 'abandoned', failure_code = null, deadline_at = null, updated_at = pg_catalog.now()
       where club_id = p_club_id and video_guid = p_video_guid;
      return query select 'abandoned'::text, p_video_guid, 'abandoned'::text, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id;
      return;
    end if;
    update onzio_private.hero_video_pending
       set phase = 'failed', failure_code = 'PREPARE_TIMEOUT', deadline_at = null, updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    return query select 'failed'::text, p_video_guid, 'failed'::text, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id;
    return;
  end if;

  if p_event = 'reject' then
    if p_failure_code is null or p_failure_code = '' or char_length(p_failure_code) > 80 then
      raise exception 'INVALID_HERO_VIDEO_FAILURE' using errcode = '22023';
    end if;
    if not v_row.replace_counted then
      insert into onzio_private.hero_video_replace_counters as c (club_id, day, used)
      values (p_club_id, v_day, 1)
      on conflict (club_id, day) do update set used = c.used + 1, updated_at = pg_catalog.now();
    end if;
    update onzio_private.hero_video_pending
       set phase = 'failed', failure_code = p_failure_code, revision_before = null, revision_after = null,
           deadline_at = null, replace_counted = true, updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    return query select 'failed'::text, p_video_guid, 'failed'::text, true, null::text, null::text, null::integer, v_row.collection_id;
    return;
  end if;

  -- ready
  if p_library_id is null or p_library_id !~ '^[0-9]{1,12}$' then
    raise exception 'INVALID_HERO_VIDEO_LIBRARY' using errcode = '22023';
  end if;
  if p_expected_live is null then
    select coalesce(r.presentation_config->>'heroVideoGuid', '') into v_expected_live
      from onzio.homepage_revamp_content r where r.club_id = p_club_id;
    v_expected_live := coalesce(v_expected_live, '');
  else
    v_expected_live := p_expected_live;
  end if;
  select s.outcome, s.live_guid, s.previous_guid, s.deletable_guid, s.revision_before, s.revision_after
    into v_swap
    from onzio_private.swap_hero_video_core(p_club_id, p_video_guid, p_library_id, v_expected_live) s;
  if v_swap.outcome is null or v_swap.outcome not in ('swapped', 'already_live') then
    return query select coalesce(v_swap.outcome, 'missing_row')::text, null::text, v_row.phase, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id;
    return;
  end if;
  if not v_row.replace_counted then
    insert into onzio_private.hero_video_replace_counters as c (club_id, day, used)
    values (p_club_id, v_day, 1)
    on conflict (club_id, day) do update set used = c.used + 1, updated_at = pg_catalog.now();
  end if;
  update onzio_private.hero_video_pending
     set phase = 'live',
         failure_code = null,
         landed_at = coalesce(landed_at, pg_catalog.now()),
         deadline_at = null,
         replace_counted = true,
         revision_before = coalesce(v_swap.revision_before, revision_before),
         revision_after = coalesce(v_swap.revision_after, revision_after),
         updated_at = pg_catalog.now()
   where club_id = p_club_id and video_guid = p_video_guid;
  return query select v_swap.outcome::text, v_swap.deletable_guid, 'live'::text, true, v_swap.revision_before, v_swap.revision_after, null::integer, v_row.collection_id;
end $$;

create function onzio_private.read_hero_video_pending_core(p_club_id uuid)
returns table(
  video_guid text, collection_id text, phase text, failure_code text,
  revision_before text, revision_after text, started_at timestamptz, landed_at timestamptz,
  deadline_at timestamptz, replace_counted boolean, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.video_guid, p.collection_id, p.phase, p.failure_code, p.revision_before, p.revision_after,
         p.started_at, p.landed_at, p.deadline_at, p.replace_counted, p.updated_at
    from onzio_private.hero_video_pending p
   where p.club_id = p_club_id;
$$;

create function onzio_private.lookup_hero_video_pending_core(p_video_guid text)
returns table(
  club_id uuid, collection_id text, phase text, failure_code text,
  started_at timestamptz, landed_at timestamptz, deadline_at timestamptz, replace_counted boolean
)
language sql stable security definer set search_path = '' as $$
  select p.club_id, p.collection_id, p.phase, p.failure_code, p.started_at, p.landed_at, p.deadline_at, p.replace_counted
    from onzio_private.hero_video_pending p
   where p.video_guid = p_video_guid;
$$;

create function onzio_private.list_hero_video_pending_core()
returns table(
  club_id uuid, video_guid text, collection_id text, phase text,
  started_at timestamptz, landed_at timestamptz, deadline_at timestamptz, replace_counted boolean
)
language sql stable security definer set search_path = '' as $$
  select p.club_id, p.video_guid, p.collection_id, p.phase, p.started_at, p.landed_at, p.deadline_at, p.replace_counted
    from onzio_private.hero_video_pending p
   where p.phase in ('uploading', 'preparing')
   order by p.started_at;
$$;

revoke all on function onzio_private.hero_video_event_core(uuid, text, text, text[], text, text, text, text, integer, bigint) from public, anon, authenticated, service_role;
revoke all on function onzio_private.read_hero_video_pending_core(uuid) from public, anon, authenticated, service_role;
revoke all on function onzio_private.lookup_hero_video_pending_core(text) from public, anon, authenticated, service_role;
revoke all on function onzio_private.list_hero_video_pending_core() from public, anon, authenticated, service_role;
grant execute on function onzio_private.hero_video_event_core(uuid, text, text, text[], text, text, text, text, integer, bigint) to service_role;
grant execute on function onzio_private.read_hero_video_pending_core(uuid) to service_role;
grant execute on function onzio_private.lookup_hero_video_pending_core(text) to service_role;
grant execute on function onzio_private.list_hero_video_pending_core() to service_role;

create function onzio.hero_video_event(
  p_club_id uuid, p_video_guid text, p_event text, p_expected text[], p_collection_id text,
  p_failure_code text, p_library_id text, p_expected_live text, p_cap integer, p_deadline_ms bigint
) returns table(
  outcome text, delete_guid text, phase text, replace_counted boolean,
  revision_before text, revision_after text, used integer, collection_id text
)
language sql security invoker set search_path = '' as $$
  select * from onzio_private.hero_video_event_core(
    p_club_id, p_video_guid, p_event, p_expected, p_collection_id,
    p_failure_code, p_library_id, p_expected_live, p_cap, p_deadline_ms
  );
$$;

create function onzio.read_hero_video_pending(p_club_id uuid)
returns table(
  video_guid text, collection_id text, phase text, failure_code text,
  revision_before text, revision_after text, started_at timestamptz, landed_at timestamptz,
  deadline_at timestamptz, replace_counted boolean, updated_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select * from onzio_private.read_hero_video_pending_core(p_club_id);
$$;

create function onzio.lookup_hero_video_pending(p_video_guid text)
returns table(
  club_id uuid, collection_id text, phase text, failure_code text,
  started_at timestamptz, landed_at timestamptz, deadline_at timestamptz, replace_counted boolean
)
language sql stable security invoker set search_path = '' as $$
  select * from onzio_private.lookup_hero_video_pending_core(p_video_guid);
$$;

create function onzio.list_hero_video_pending()
returns table(
  club_id uuid, video_guid text, collection_id text, phase text,
  started_at timestamptz, landed_at timestamptz, deadline_at timestamptz, replace_counted boolean
)
language sql stable security invoker set search_path = '' as $$
  select * from onzio_private.list_hero_video_pending_core();
$$;

revoke all on function onzio.hero_video_event(uuid, text, text, text[], text, text, text, text, integer, bigint) from public, anon, authenticated;
revoke all on function onzio.read_hero_video_pending(uuid) from public, anon, authenticated;
revoke all on function onzio.lookup_hero_video_pending(text) from public, anon, authenticated;
revoke all on function onzio.list_hero_video_pending() from public, anon, authenticated;
grant execute on function onzio.hero_video_event(uuid, text, text, text[], text, text, text, text, integer, bigint) to service_role;
grant execute on function onzio.read_hero_video_pending(uuid) to service_role;
grant execute on function onzio.lookup_hero_video_pending(text) to service_role;
grant execute on function onzio.list_hero_video_pending() to service_role;

notify pgrst, 'reload schema';
