-- RC-HERO-POSTER-02 reviewed rollback path.
-- Apply only when intentionally rolling back 20261124120000_hero_video_poster.sql, and only after the app has been
-- rolled back to a deployment from before RC-HERO-POSTER-04 (code that calls swap_hero_video with a poster argument or
-- reads the poster columns would fail). It restores swap_hero_video, revert_hero_video and hero_video_event exactly as
-- 20261120230000 and 20261121183000 defined them, drops the two repair functions and their wrappers, and drops the
-- previous-poster column, its guard and the two retry columns. The live hero_poster_media_asset_id is not touched, so
-- the site keeps whatever poster is live. Posters made by this feature stay in onzio-media as ordinary files.
-- Run it in one transaction, then add a matching migration so the ledger and the repo agree.

begin;

drop function onzio.list_hero_video_poster_due();
drop function onzio.attach_hero_video_poster(uuid, text, uuid);
drop function onzio_private.list_hero_video_poster_due_core();
drop function onzio_private.attach_hero_video_poster_core(uuid, text, uuid);
drop function onzio.hero_video_event(uuid, text, text, text[], text, text, text, text, integer, bigint, uuid);
drop function onzio.swap_hero_video(uuid, text, text, text, uuid);
drop function onzio_private.hero_video_event_core(uuid, text, text, text[], text, text, text, text, integer, bigint, uuid);
drop function onzio_private.swap_hero_video_core(uuid, text, text, text, uuid);

create function onzio_private.swap_hero_video_core(
  p_club_id uuid, p_new_guid text, p_library_id text, p_expected_live text
) returns table(outcome text, live_guid text, previous_guid text, deletable_guid text, revision_before text, revision_after text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_cfg jsonb;
  v_live text;
  v_prev text;
  v_next jsonb;
  v_deletable text;
  v_after text;
begin
  if p_new_guid is null or p_new_guid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_HERO_VIDEO_GUID' using errcode = '22023';
  end if;
  if p_library_id is null or p_library_id !~ '^[0-9]{1,12}$' then
    raise exception 'INVALID_HERO_VIDEO_LIBRARY' using errcode = '22023';
  end if;

  select r.presentation_config into v_cfg from onzio.homepage_revamp_content r
   where r.club_id = p_club_id for update;
  if not found then
    return query select 'missing_row'::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  v_live := coalesce(v_cfg->>'heroVideoGuid', '');
  v_prev := coalesce(v_cfg->>'previousHeroVideoGuid', '');

  if v_live = p_new_guid then
    return query select 'already_live'::text, v_live, nullif(v_prev, ''), null::text, null::text, null::text;
    return;
  end if;
  if v_live <> coalesce(p_expected_live, '') then
    return query select 'conflict'::text, nullif(v_live, ''), nullif(v_prev, ''), null::text, null::text, null::text;
    return;
  end if;

  v_next := v_cfg || pg_catalog.jsonb_build_object('heroVideoGuid', p_new_guid, 'heroVideoLibraryId', p_library_id);
  if v_live <> '' then
    v_next := v_next || pg_catalog.jsonb_build_object('previousHeroVideoGuid', v_live);
  else
    v_next := v_next - 'previousHeroVideoGuid';
  end if;
  -- The old previous video falls out of the two-slot history unless it is one of the two now in use.
  if v_prev <> '' and v_prev <> p_new_guid and v_prev <> v_live then
    v_deletable := v_prev;
  end if;

  update onzio.homepage_revamp_content r set presentation_config = v_next where r.club_id = p_club_id;
  -- The update fires advance_homepage_revision once for this one row, and serialize_homepage_write holds the club's
  -- write lock until commit, so the revision before is exactly one less. The app uses these two numbers to move the
  -- editor's base revision only when nothing else changed the homepage.
  select h.revision::text into v_after from onzio_private.homepage_revisions h where h.club_id = p_club_id;
  return query select 'swapped'::text, p_new_guid, nullif(v_live, ''), v_deletable, ((v_after::bigint) - 1)::text, v_after;
end $$;

create or replace function onzio_private.revert_hero_video_core(
  p_club_id uuid, p_expected_live text, p_target_guid text
) returns table(outcome text, live_guid text, previous_guid text, revision_before text, revision_after text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_cfg jsonb;
  v_live text;
  v_prev text;
  v_next jsonb;
  v_after text;
begin
  if p_target_guid is null or p_target_guid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_HERO_VIDEO_GUID' using errcode = '22023';
  end if;

  select r.presentation_config into v_cfg from onzio.homepage_revamp_content r
   where r.club_id = p_club_id for update;
  if not found then
    return query select 'missing_row'::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  v_live := coalesce(v_cfg->>'heroVideoGuid', '');
  v_prev := coalesce(v_cfg->>'previousHeroVideoGuid', '');

  if v_live = p_target_guid then
    return query select 'already_live'::text, v_live, nullif(v_prev, ''), null::text, null::text;
    return;
  end if;
  if v_prev = '' or v_prev <> p_target_guid then
    return query select 'no_previous'::text, nullif(v_live, ''), nullif(v_prev, ''), null::text, null::text;
    return;
  end if;
  if v_live <> coalesce(p_expected_live, '') then
    return query select 'conflict'::text, nullif(v_live, ''), v_prev, null::text, null::text;
    return;
  end if;

  v_next := v_cfg || pg_catalog.jsonb_build_object('heroVideoGuid', v_prev);
  if v_live <> '' then
    v_next := v_next || pg_catalog.jsonb_build_object('previousHeroVideoGuid', v_live);
  else
    v_next := v_next - 'previousHeroVideoGuid';
  end if;

  update onzio.homepage_revamp_content r set presentation_config = v_next where r.club_id = p_club_id;
  -- The update fires advance_homepage_revision once for this one row, and serialize_homepage_write holds the club's
  -- write lock until commit, so the revision before is exactly one less. The app uses these two numbers to move the
  -- editor's base revision only when nothing else changed the homepage.
  select h.revision::text into v_after from onzio_private.homepage_revisions h where h.club_id = p_club_id;
  return query select 'reverted'::text, v_prev, nullif(v_live, ''), ((v_after::bigint) - 1)::text, v_after;
end $$;

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

revoke all on function onzio_private.swap_hero_video_core(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function onzio_private.revert_hero_video_core(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function onzio_private.hero_video_event_core(uuid, text, text, text[], text, text, text, text, integer, bigint) from public, anon, authenticated, service_role;
grant execute on function onzio_private.swap_hero_video_core(uuid, text, text, text) to service_role;
grant execute on function onzio_private.revert_hero_video_core(uuid, text, text) to service_role;
grant execute on function onzio_private.hero_video_event_core(uuid, text, text, text[], text, text, text, text, integer, bigint) to service_role;

create function onzio.swap_hero_video(p_club_id uuid, p_new_guid text, p_library_id text, p_expected_live text)
returns table(outcome text, live_guid text, previous_guid text, deletable_guid text, revision_before text, revision_after text)
language sql security invoker set search_path = '' as $$
  select * from onzio_private.swap_hero_video_core(p_club_id, p_new_guid, p_library_id, p_expected_live);
$$;

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

revoke all on function onzio.swap_hero_video(uuid, text, text, text) from public, anon, authenticated;
revoke all on function onzio.hero_video_event(uuid, text, text, text[], text, text, text, text, integer, bigint) from public, anon, authenticated;
grant execute on function onzio.swap_hero_video(uuid, text, text, text) to service_role;
grant execute on function onzio.hero_video_event(uuid, text, text, text[], text, text, text, text, integer, bigint) to service_role;

drop trigger guard_previous_hero_poster_media_reference on onzio.homepage_revamp_content;
alter table onzio.homepage_revamp_content drop constraint homepage_revamp_previous_hero_poster_fk;
alter table onzio.homepage_revamp_content drop column previous_hero_poster_media_asset_id;
update onzio.homepage_revamp_content set presentation_config = presentation_config - 'previousHeroPosterAlt'
  where presentation_config ? 'previousHeroPosterAlt';
alter table onzio_private.hero_video_pending drop constraint hero_video_pending_poster_attempts;
alter table onzio_private.hero_video_pending drop column poster_due_at, drop column poster_attempts;

notify pgrst, 'reload schema';

commit;
