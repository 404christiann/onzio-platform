-- RC-HERO-VIDEO-COMPLETION: one pending hero upload per club.
--
-- The browser upload used to finish only while the admin tab kept asking. This row is how GET
-- can say "preparing" after the person leaves, and how the Bunny webhook and the daily cron
-- find the video to finish or sweep. It is not published content: presentation_config is untouched
-- until swap_hero_video runs.
--
--   record_hero_video_pending(club, guid, collection, phase)
--       phase 'uploading' replaces this club's row. phase 'preparing' only advances that same guid.
--   read_hero_video_pending(club)     the row for GET, or no row.
--   lookup_hero_video_pending(guid)   the row for a webhook, or no row.
--   list_hero_video_pending()         uploading and preparing rows for the daily cron.
--   settle_hero_video_pending(...)    'live' keeps any revisions already stored when the new ones
--                                     are null (a retry), 'failed' records a code, 'clear' deletes.
--
-- Service role only. Rollback: drop the five onzio wrappers, the five onzio_private functions,
-- and onzio_private.hero_video_pending. No existing column changes.

create table onzio_private.hero_video_pending (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  video_guid text not null,
  collection_id text not null,
  phase text not null check (phase in ('uploading', 'preparing', 'live', 'failed')),
  failure_code text,
  revision_before text,
  revision_after text,
  updated_at timestamptz not null default now(),
  constraint hero_video_pending_guid_format check (
    video_guid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint hero_video_pending_failure check (
    (phase = 'failed' and failure_code is not null) or (phase <> 'failed' and failure_code is null)
  )
);

create unique index hero_video_pending_guid on onzio_private.hero_video_pending (video_guid);

alter table onzio_private.hero_video_pending enable row level security;
revoke all on onzio_private.hero_video_pending from public, anon, authenticated;

create function onzio_private.record_hero_video_pending_core(
  p_club_id uuid, p_video_guid text, p_collection_id text, p_phase text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if p_phase is null or p_phase not in ('uploading', 'preparing') then
    raise exception 'INVALID_HERO_VIDEO_PHASE' using errcode = '22023';
  end if;
  if p_video_guid is null or p_video_guid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_HERO_VIDEO_GUID' using errcode = '22023';
  end if;

  if p_phase = 'preparing' then
    update onzio_private.hero_video_pending
       set phase = 'preparing', failure_code = null, updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid and phase = 'uploading';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      -- Already preparing or live is a retry, not a missing upload.
      if exists (
        select 1 from onzio_private.hero_video_pending
         where club_id = p_club_id and video_guid = p_video_guid and phase in ('preparing', 'live')
      ) then
        return 'ok';
      end if;
      return 'missing';
    end if;
    return 'ok';
  end if;

  if p_collection_id is null or p_collection_id = '' or char_length(p_collection_id) > 80 then
    raise exception 'INVALID_HERO_VIDEO_COLLECTION' using errcode = '22023';
  end if;

  insert into onzio_private.hero_video_pending as p (club_id, video_guid, collection_id, phase)
  values (p_club_id, p_video_guid, p_collection_id, 'uploading')
  on conflict (club_id) do update
    set video_guid = excluded.video_guid,
        collection_id = excluded.collection_id,
        phase = 'uploading',
        failure_code = null,
        revision_before = null,
        revision_after = null,
        updated_at = pg_catalog.now();
  return 'ok';
end $$;

create function onzio_private.read_hero_video_pending_core(p_club_id uuid)
returns table(video_guid text, collection_id text, phase text, failure_code text, revision_before text, revision_after text)
language sql stable security definer set search_path = '' as $$
  select p.video_guid, p.collection_id, p.phase, p.failure_code, p.revision_before, p.revision_after
    from onzio_private.hero_video_pending p
   where p.club_id = p_club_id;
$$;

create function onzio_private.lookup_hero_video_pending_core(p_video_guid text)
returns table(club_id uuid, collection_id text, phase text)
language sql stable security definer set search_path = '' as $$
  select p.club_id, p.collection_id, p.phase
    from onzio_private.hero_video_pending p
   where p.video_guid = p_video_guid;
$$;

create function onzio_private.list_hero_video_pending_core()
returns table(club_id uuid, video_guid text, collection_id text, phase text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.club_id, p.video_guid, p.collection_id, p.phase, p.updated_at
    from onzio_private.hero_video_pending p
   where p.phase in ('uploading', 'preparing')
   order by p.updated_at;
$$;

create function onzio_private.settle_hero_video_pending_core(
  p_club_id uuid, p_video_guid text, p_phase text, p_failure_code text, p_revision_before text, p_revision_after text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if p_phase is null or p_phase not in ('live', 'failed', 'clear') then
    raise exception 'INVALID_HERO_VIDEO_PHASE' using errcode = '22023';
  end if;
  if p_video_guid is null or p_video_guid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_HERO_VIDEO_GUID' using errcode = '22023';
  end if;

  if p_phase = 'clear' then
    delete from onzio_private.hero_video_pending
     where club_id = p_club_id and video_guid = p_video_guid;
    return 'ok';
  end if;

  if p_phase = 'failed' then
    if p_failure_code is null or p_failure_code = '' or char_length(p_failure_code) > 80 then
      raise exception 'INVALID_HERO_VIDEO_FAILURE' using errcode = '22023';
    end if;
    update onzio_private.hero_video_pending
       set phase = 'failed', failure_code = p_failure_code, revision_before = null, revision_after = null,
           updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    get diagnostics v_n = row_count;
    return case when v_n = 0 then 'missing' else 'ok' end;
  end if;

  update onzio_private.hero_video_pending
     set phase = 'live',
         failure_code = null,
         revision_before = coalesce(p_revision_before, revision_before),
         revision_after = coalesce(p_revision_after, revision_after),
         updated_at = pg_catalog.now()
   where club_id = p_club_id and video_guid = p_video_guid;
  get diagnostics v_n = row_count;
  return case when v_n = 0 then 'missing' else 'ok' end;
end $$;

revoke all on function onzio_private.record_hero_video_pending_core(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function onzio_private.read_hero_video_pending_core(uuid) from public, anon, authenticated, service_role;
revoke all on function onzio_private.lookup_hero_video_pending_core(text) from public, anon, authenticated, service_role;
revoke all on function onzio_private.list_hero_video_pending_core() from public, anon, authenticated, service_role;
revoke all on function onzio_private.settle_hero_video_pending_core(uuid, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function onzio_private.record_hero_video_pending_core(uuid, text, text, text) to service_role;
grant execute on function onzio_private.read_hero_video_pending_core(uuid) to service_role;
grant execute on function onzio_private.lookup_hero_video_pending_core(text) to service_role;
grant execute on function onzio_private.list_hero_video_pending_core() to service_role;
grant execute on function onzio_private.settle_hero_video_pending_core(uuid, text, text, text, text, text) to service_role;

create function onzio.record_hero_video_pending(p_club_id uuid, p_video_guid text, p_collection_id text, p_phase text)
returns text
language sql security invoker set search_path = '' as $$
  select onzio_private.record_hero_video_pending_core(p_club_id, p_video_guid, p_collection_id, p_phase);
$$;

create function onzio.read_hero_video_pending(p_club_id uuid)
returns table(video_guid text, collection_id text, phase text, failure_code text, revision_before text, revision_after text)
language sql stable security invoker set search_path = '' as $$
  select * from onzio_private.read_hero_video_pending_core(p_club_id);
$$;

create function onzio.lookup_hero_video_pending(p_video_guid text)
returns table(club_id uuid, collection_id text, phase text)
language sql stable security invoker set search_path = '' as $$
  select * from onzio_private.lookup_hero_video_pending_core(p_video_guid);
$$;

create function onzio.list_hero_video_pending()
returns table(club_id uuid, video_guid text, collection_id text, phase text, updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from onzio_private.list_hero_video_pending_core();
$$;

create function onzio.settle_hero_video_pending(
  p_club_id uuid, p_video_guid text, p_phase text, p_failure_code text, p_revision_before text, p_revision_after text
) returns text
language sql security invoker set search_path = '' as $$
  select onzio_private.settle_hero_video_pending_core(
    p_club_id, p_video_guid, p_phase, p_failure_code, p_revision_before, p_revision_after
  );
$$;

revoke all on function onzio.record_hero_video_pending(uuid, text, text, text) from public, anon, authenticated;
revoke all on function onzio.read_hero_video_pending(uuid) from public, anon, authenticated;
revoke all on function onzio.lookup_hero_video_pending(text) from public, anon, authenticated;
revoke all on function onzio.list_hero_video_pending() from public, anon, authenticated;
revoke all on function onzio.settle_hero_video_pending(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function onzio.record_hero_video_pending(uuid, text, text, text) to service_role;
grant execute on function onzio.read_hero_video_pending(uuid) to service_role;
grant execute on function onzio.lookup_hero_video_pending(text) to service_role;
grant execute on function onzio.list_hero_video_pending() to service_role;
grant execute on function onzio.settle_hero_video_pending(uuid, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
