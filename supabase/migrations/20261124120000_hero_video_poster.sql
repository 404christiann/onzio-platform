-- RC-HERO-POSTER-02: the hero poster follows the hero video.
--
-- Today a hero video swap never touches the poster, so after a swap the page still shows the old video's still before
-- playback. The poster is the FK column onzio.homepage_revamp_content.hero_poster_media_asset_id (alt text lives in
-- presentation_config.artworkAlt.heroPoster), so every reader keeps working if the swap and revert move asset ids between
-- that column and one new "previous poster" column. This migration changes the database only. The app stays as it is and
-- still works against it: old code calls the same functions and simply gets poster = 'kept'.
--
--   homepage_revamp_content.previous_hero_poster_media_asset_id   FK to media_assets, so retirement and the orphan
--                                                                 sweep treat the previous poster as referenced and a
--                                                                 revert never restores a deleted file. Authenticated
--                                                                 gets no write grant on it (column grants only).
--   presentation_config.previousHeroPosterAlt                     top-level key, so jsonb merges keep it.
--   hero_video_pending.poster_due_at, poster_attempts             when a live video still needs its poster, and how many
--                                                                 tries the daily job has used (stops at 5).
--
--   swap_hero_video_core(..., p_poster_asset_id default null)     one UPDATE for video and poster: the old live poster and
--                                                                 alt move to the previous slot, the new asset goes live
--                                                                 with a blank alt. A poster that is missing, unpublished,
--                                                                 another club's or the wrong kind is ignored: the swap
--                                                                 returns poster = 'kept' and never raises.
--   revert_hero_video_core(...)                                   exchanges live and previous posters and alts with the
--                                                                 videos; keeps the live poster when there is no usable
--                                                                 previous one.
--   hero_video_event_core(..., p_poster_asset_id default null)    passes the poster to the swap on ready, sets or clears
--                                                                 poster_due_at, and start resets it.
--   attach_hero_video_poster_core(club, guid, asset)              repair path: puts a poster on the live (or previous)
--                                                                 slot holding that video. A null or unusable asset
--                                                                 counts one attempt. Idempotent.
--   list_hero_video_poster_due_core()                             live rows whose poster is due and under 5 attempts.
--
-- Lock order. swap, revert, ready and attach take the homepage advisory lock 734901281 before any row lock, the same order
-- as save_homepage. Before this migration swap and revert took the row lock first and the statement trigger took the
-- advisory lock second, the opposite order, a deadlock path against a concurrent save.
--
-- FK index. Like the seven media FKs already on this table there is no index on the new column: the table holds one row per
-- club, and a scan of it is cheaper than maintaining an index.
--
-- Service role only. Rollback: roll the app back first, then run docs/phase-11/diverse-city/RC-HERO-POSTER-02-ROLLBACK.sql,
-- which restores the previous function definitions and drops the three columns.

alter table onzio.homepage_revamp_content add column previous_hero_poster_media_asset_id uuid;
alter table onzio.homepage_revamp_content
  add constraint homepage_revamp_previous_hero_poster_fk
  foreign key (club_id, previous_hero_poster_media_asset_id) references onzio.media_assets (club_id, id);
create trigger guard_previous_hero_poster_media_reference
  before insert or update of previous_hero_poster_media_asset_id on onzio.homepage_revamp_content
  for each row execute function onzio_private.guard_media_reference('previous_hero_poster_media_asset_id', 'asset');

alter table onzio_private.hero_video_pending
  add column poster_due_at timestamptz,
  add column poster_attempts smallint not null default 0,
  add constraint hero_video_pending_poster_attempts check (poster_attempts between 0 and 5);

-- Same names as before: drop the old signatures so the new ones (a defaulted last parameter and one more result
-- column) are the only ones. The onzio wrappers go first because they call the private functions.
drop function onzio.swap_hero_video(uuid, text, text, text);
drop function onzio.hero_video_event(uuid, text, text, text[], text, text, text, text, integer, bigint);
drop function onzio_private.hero_video_event_core(uuid, text, text, text[], text, text, text, text, integer, bigint);
drop function onzio_private.swap_hero_video_core(uuid, text, text, text);

create function onzio_private.swap_hero_video_core(
  p_club_id uuid, p_new_guid text, p_library_id text, p_expected_live text, p_poster_asset_id uuid default null
) returns table(outcome text, live_guid text, previous_guid text, deletable_guid text, revision_before text, revision_after text, poster text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_cfg jsonb;
  v_live text;
  v_prev text;
  v_next jsonb;
  v_deletable text;
  v_after text;
  v_live_poster uuid;
  v_new_poster uuid;
  v_prev_poster uuid;
  v_alt text;
  v_poster text := 'kept';
begin
  if p_new_guid is null or p_new_guid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_HERO_VIDEO_GUID' using errcode = '22023';
  end if;
  if p_library_id is null or p_library_id !~ '^[0-9]{1,12}$' then
    raise exception 'INVALID_HERO_VIDEO_LIBRARY' using errcode = '22023';
  end if;

  -- Homepage lock first, as save_homepage does, then the row.
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  select r.presentation_config, r.hero_poster_media_asset_id into v_cfg, v_live_poster
    from onzio.homepage_revamp_content r where r.club_id = p_club_id for update;
  if not found then
    return query select 'missing_row'::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  v_live := coalesce(v_cfg->>'heroVideoGuid', '');
  v_prev := coalesce(v_cfg->>'previousHeroVideoGuid', '');

  if v_live = p_new_guid then
    return query select 'already_live'::text, v_live, nullif(v_prev, ''), null::text, null::text, null::text, null::text;
    return;
  end if;
  if v_live <> coalesce(p_expected_live, '') then
    return query select 'conflict'::text, nullif(v_live, ''), nullif(v_prev, ''), null::text, null::text, null::text, null::text;
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

  -- A poster problem never blocks or fails the video: only a usable asset of this club is applied.
  if p_poster_asset_id is not null then
    select a.id into v_new_poster from onzio.media_assets a
     where a.club_id = p_club_id and a.id = p_poster_asset_id and a.status = 'published' and a.deleted_at is null
       and a.storage_bucket = 'onzio-media' and a.surface = 'homepage' and a.media_kind = 'photograph';
  end if;
  -- The previous slot takes the old live poster and alt, so a revert shows the old pairing. A poster that is no
  -- longer published is not moved, because the guard trigger would refuse it.
  if v_live <> '' and v_live_poster is not null then
    select a.id into v_prev_poster from onzio.media_assets a
     where a.club_id = p_club_id and a.id = v_live_poster and a.status = 'published' and a.deleted_at is null;
  end if;
  v_alt := coalesce(v_cfg#>>'{artworkAlt,heroPoster}', '');
  if v_prev_poster is not null then
    v_next := v_next || pg_catalog.jsonb_build_object('previousHeroPosterAlt', v_alt);
  else
    v_next := v_next - 'previousHeroPosterAlt';
  end if;
  if v_new_poster is not null then
    -- The automatic frame has no authored description, and the video's own label covers it.
    v_next := pg_catalog.jsonb_set(v_next, '{artworkAlt}',
      coalesce(v_cfg->'artworkAlt', '{}'::jsonb) || pg_catalog.jsonb_build_object('heroPoster', ''), true);
    v_poster := 'set';
  end if;

  update onzio.homepage_revamp_content r
     set presentation_config = v_next,
         previous_hero_poster_media_asset_id = v_prev_poster,
         hero_poster_media_asset_id = coalesce(v_new_poster, r.hero_poster_media_asset_id)
   where r.club_id = p_club_id;
  -- The update fires advance_homepage_revision once for this one row, and serialize_homepage_write holds the club's
  -- write lock until commit, so the revision before is exactly one less. The app uses these two numbers to move the
  -- editor's base revision only when nothing else changed the homepage.
  select h.revision::text into v_after from onzio_private.homepage_revisions h where h.club_id = p_club_id;
  return query select 'swapped'::text, p_new_guid, nullif(v_live, ''), v_deletable, ((v_after::bigint) - 1)::text, v_after, v_poster;
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
  v_live_poster uuid;
  v_prev_poster uuid;
  v_live_ok boolean := false;
  v_prev_ok boolean := false;
begin
  if p_target_guid is null or p_target_guid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_HERO_VIDEO_GUID' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(734901281);
  select r.presentation_config, r.hero_poster_media_asset_id, r.previous_hero_poster_media_asset_id
    into v_cfg, v_live_poster, v_prev_poster
    from onzio.homepage_revamp_content r where r.club_id = p_club_id for update;
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

  -- Posters follow the videos when both are usable. With no usable previous poster, the live poster and both alts stay.
  select exists (select 1 from onzio.media_assets a where a.club_id = p_club_id and a.id = v_live_poster
                  and a.status = 'published' and a.deleted_at is null) into v_live_ok;
  select exists (select 1 from onzio.media_assets a where a.club_id = p_club_id and a.id = v_prev_poster
                  and a.status = 'published' and a.deleted_at is null) into v_prev_ok;
  if v_prev_ok and (v_live_ok or v_live_poster is null) then
    v_next := pg_catalog.jsonb_set(v_next, '{artworkAlt}',
      coalesce(v_cfg->'artworkAlt', '{}'::jsonb)
        || pg_catalog.jsonb_build_object('heroPoster', coalesce(v_cfg->>'previousHeroPosterAlt', '')), true);
    v_next := v_next || pg_catalog.jsonb_build_object('previousHeroPosterAlt', coalesce(v_cfg#>>'{artworkAlt,heroPoster}', ''));
    update onzio.homepage_revamp_content r
       set presentation_config = v_next,
           hero_poster_media_asset_id = v_prev_poster,
           previous_hero_poster_media_asset_id = case when v_live_ok then v_live_poster else null end
     where r.club_id = p_club_id;
  else
    update onzio.homepage_revamp_content r set presentation_config = v_next where r.club_id = p_club_id;
  end if;
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
  p_deadline_ms bigint,
  p_poster_asset_id uuid default null
) returns table(
  outcome text,
  delete_guid text,
  phase text,
  replace_counted boolean,
  revision_before text,
  revision_after text,
  used integer,
  collection_id text,
  poster text
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
      return query select 'preparing'::text, p_video_guid, v_row.phase, v_row.replace_counted, null::text, null::text, v_used, p_collection_id, null::text;
      return;
    end if;
    if v_used >= p_cap then
      return query select 'at_cap'::text, p_video_guid, null::text, false, null::text, null::text, v_used, p_collection_id, null::text;
      return;
    end if;
    if v_row.phase in ('uploading', 'preparing') then
      v_delete := v_row.video_guid;
    end if;
    insert into onzio_private.hero_video_pending as p (
      club_id, video_guid, collection_id, phase, failure_code, revision_before, revision_after,
      started_at, landed_at, deadline_at, replace_counted, updated_at, poster_due_at, poster_attempts
    ) values (
      p_club_id, p_video_guid, p_collection_id, 'uploading', null, null, null,
      pg_catalog.now(), null, pg_catalog.now() + make_interval(secs => p_deadline_ms / 1000.0), false, pg_catalog.now(), null, 0
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
          poster_due_at = null,
          poster_attempts = 0,
          updated_at = pg_catalog.now();
    return query select 'ok'::text, v_delete, 'uploading'::text, false, null::text, null::text, v_used, coalesce(v_row.collection_id, p_collection_id), null::text;
    return;
  end if;

  if p_event = 'ready' then
    -- Same order as save_homepage, swap, revert and attach: homepage lock, then rows.
    perform pg_catalog.pg_advisory_xact_lock(734901281);
  end if;
  select * into v_row from onzio_private.hero_video_pending
   where club_id = p_club_id and video_guid = p_video_guid and phase = any(p_expected)
   for update;
  if not found then
    return query select 'stale'::text, null::text, null::text, false, null::text, null::text, null::integer, null::text, null::text;
    return;
  end if;

  if p_event = 'expire' and not (v_row.deadline_at <= pg_catalog.now()) then
    return query select 'stale'::text, null::text, v_row.phase, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id, null::text;
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
    return query select 'ok'::text, null::text, 'preparing'::text, true, null::text, null::text, null::integer, v_row.collection_id, null::text;
    return;
  end if;

  if p_event = 'abandon' then
    update onzio_private.hero_video_pending
       set phase = 'abandoned', failure_code = null, deadline_at = null, updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    return query select 'abandoned'::text, p_video_guid, 'abandoned'::text, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id, null::text;
    return;
  end if;

  if p_event = 'expire' then
    if v_row.phase = 'uploading' then
      update onzio_private.hero_video_pending
         set phase = 'abandoned', failure_code = null, deadline_at = null, updated_at = pg_catalog.now()
       where club_id = p_club_id and video_guid = p_video_guid;
      return query select 'abandoned'::text, p_video_guid, 'abandoned'::text, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id, null::text;
      return;
    end if;
    update onzio_private.hero_video_pending
       set phase = 'failed', failure_code = 'PREPARE_TIMEOUT', deadline_at = null, updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    return query select 'failed'::text, p_video_guid, 'failed'::text, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id, null::text;
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
    return query select 'failed'::text, p_video_guid, 'failed'::text, true, null::text, null::text, null::integer, v_row.collection_id, null::text;
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
  select s.outcome, s.live_guid, s.previous_guid, s.deletable_guid, s.revision_before, s.revision_after, s.poster
    into v_swap
    from onzio_private.swap_hero_video_core(p_club_id, p_video_guid, p_library_id, v_expected_live, p_poster_asset_id) s;
  if v_swap.outcome is null or v_swap.outcome not in ('swapped', 'already_live') then
    return query select coalesce(v_swap.outcome, 'missing_row')::text, null::text, v_row.phase, v_row.replace_counted, null::text, null::text, null::integer, v_row.collection_id, null::text;
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
         poster_due_at = case when v_swap.poster = 'set' then null when v_swap.poster = 'kept' then pg_catalog.now() else poster_due_at end,
         poster_attempts = case when v_swap.poster in ('set', 'kept') then 0 else poster_attempts end,
         updated_at = pg_catalog.now()
   where club_id = p_club_id and video_guid = p_video_guid;
  return query select v_swap.outcome::text, v_swap.deletable_guid, 'live'::text, true, v_swap.revision_before, v_swap.revision_after, null::integer, v_row.collection_id, v_swap.poster;
end $$;

create function onzio_private.attach_hero_video_poster_core(p_club_id uuid, p_video_guid text, p_poster_asset_id uuid)
returns table(outcome text, poster_attempts integer, revision_before text, revision_after text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_pending onzio_private.hero_video_pending%rowtype;
  v_cfg jsonb;
  v_live_poster uuid;
  v_prev_poster uuid;
  v_asset uuid;
  v_slot text;
  v_attempts integer;
  v_after text;
begin
  if p_video_guid is null or p_video_guid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_HERO_VIDEO_GUID' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(734901281);
  select * into v_pending from onzio_private.hero_video_pending
   where club_id = p_club_id and video_guid = p_video_guid and phase = 'live' for update;
  if not found then
    return query select 'stale'::text, null::integer, null::text, null::text;
    return;
  end if;
  if v_pending.poster_due_at is null then
    return query select 'not_due'::text, v_pending.poster_attempts::integer, null::text, null::text;
    return;
  end if;

  select r.presentation_config, r.hero_poster_media_asset_id, r.previous_hero_poster_media_asset_id
    into v_cfg, v_live_poster, v_prev_poster
    from onzio.homepage_revamp_content r where r.club_id = p_club_id for update;
  if not found or (coalesce(v_cfg->>'heroVideoGuid', '') <> p_video_guid and coalesce(v_cfg->>'previousHeroVideoGuid', '') <> p_video_guid) then
    -- The video left both slots: nothing to attach, stop asking.
    update onzio_private.hero_video_pending set poster_due_at = null, updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    return query select 'stale'::text, v_pending.poster_attempts::integer, null::text, null::text;
    return;
  end if;
  v_slot := case when coalesce(v_cfg->>'heroVideoGuid', '') = p_video_guid then 'live' else 'previous' end;

  if p_poster_asset_id is not null then
    select a.id into v_asset from onzio.media_assets a
     where a.club_id = p_club_id and a.id = p_poster_asset_id and a.status = 'published' and a.deleted_at is null
       and a.storage_bucket = 'onzio-media' and a.surface = 'homepage' and a.media_kind = 'photograph';
  end if;
  if v_asset is null then
    v_attempts := least(v_pending.poster_attempts + 1, 5);
    update onzio_private.hero_video_pending
       set poster_attempts = v_attempts,
           poster_due_at = case when v_attempts >= 5 then null else poster_due_at end,
           updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    return query select case when v_attempts >= 5 then 'gave_up' else 'failed' end::text, v_attempts, null::text, null::text;
    return;
  end if;

  if (v_slot = 'live' and v_live_poster is not distinct from v_asset)
     or (v_slot = 'previous' and v_prev_poster is not distinct from v_asset) then
    update onzio_private.hero_video_pending set poster_due_at = null, updated_at = pg_catalog.now()
     where club_id = p_club_id and video_guid = p_video_guid;
    return query select 'already_attached'::text, v_pending.poster_attempts::integer, null::text, null::text;
    return;
  end if;

  if v_slot = 'live' then
    update onzio.homepage_revamp_content r
       set hero_poster_media_asset_id = v_asset,
           presentation_config = pg_catalog.jsonb_set(r.presentation_config, '{artworkAlt}',
             coalesce(r.presentation_config->'artworkAlt', '{}'::jsonb) || pg_catalog.jsonb_build_object('heroPoster', ''), true)
     where r.club_id = p_club_id;
  else
    update onzio.homepage_revamp_content r
       set previous_hero_poster_media_asset_id = v_asset,
           presentation_config = r.presentation_config || pg_catalog.jsonb_build_object('previousHeroPosterAlt', '')
     where r.club_id = p_club_id;
  end if;
  update onzio_private.hero_video_pending set poster_due_at = null, updated_at = pg_catalog.now()
   where club_id = p_club_id and video_guid = p_video_guid;
  select h.revision::text into v_after from onzio_private.homepage_revisions h where h.club_id = p_club_id;
  return query select 'attached'::text, v_pending.poster_attempts::integer, ((v_after::bigint) - 1)::text, v_after;
end $$;

create function onzio_private.list_hero_video_poster_due_core()
returns table(club_id uuid, video_guid text, poster_attempts integer)
language sql stable security definer set search_path = '' as $$
  select p.club_id, p.video_guid, p.poster_attempts::integer
    from onzio_private.hero_video_pending p
   where p.phase = 'live' and p.poster_due_at is not null and p.poster_due_at <= pg_catalog.now() and p.poster_attempts < 5
   order by p.poster_due_at;
$$;

revoke all on function onzio_private.swap_hero_video_core(uuid, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function onzio_private.revert_hero_video_core(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function onzio_private.hero_video_event_core(uuid, text, text, text[], text, text, text, text, integer, bigint, uuid) from public, anon, authenticated, service_role;
revoke all on function onzio_private.attach_hero_video_poster_core(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function onzio_private.list_hero_video_poster_due_core() from public, anon, authenticated, service_role;
grant execute on function onzio_private.swap_hero_video_core(uuid, text, text, text, uuid) to service_role;
grant execute on function onzio_private.revert_hero_video_core(uuid, text, text) to service_role;
grant execute on function onzio_private.hero_video_event_core(uuid, text, text, text[], text, text, text, text, integer, bigint, uuid) to service_role;
grant execute on function onzio_private.attach_hero_video_poster_core(uuid, text, uuid) to service_role;
grant execute on function onzio_private.list_hero_video_poster_due_core() to service_role;

create function onzio.swap_hero_video(p_club_id uuid, p_new_guid text, p_library_id text, p_expected_live text, p_poster_asset_id uuid default null)
returns table(outcome text, live_guid text, previous_guid text, deletable_guid text, revision_before text, revision_after text, poster text)
language sql security invoker set search_path = '' as $$
  select * from onzio_private.swap_hero_video_core(p_club_id, p_new_guid, p_library_id, p_expected_live, p_poster_asset_id);
$$;

create function onzio.hero_video_event(
  p_club_id uuid, p_video_guid text, p_event text, p_expected text[], p_collection_id text,
  p_failure_code text, p_library_id text, p_expected_live text, p_cap integer, p_deadline_ms bigint,
  p_poster_asset_id uuid default null
) returns table(
  outcome text, delete_guid text, phase text, replace_counted boolean,
  revision_before text, revision_after text, used integer, collection_id text, poster text
)
language sql security invoker set search_path = '' as $$
  select * from onzio_private.hero_video_event_core(
    p_club_id, p_video_guid, p_event, p_expected, p_collection_id,
    p_failure_code, p_library_id, p_expected_live, p_cap, p_deadline_ms, p_poster_asset_id
  );
$$;

create function onzio.attach_hero_video_poster(p_club_id uuid, p_video_guid text, p_poster_asset_id uuid)
returns table(outcome text, poster_attempts integer, revision_before text, revision_after text)
language sql security invoker set search_path = '' as $$
  select * from onzio_private.attach_hero_video_poster_core(p_club_id, p_video_guid, p_poster_asset_id);
$$;

create function onzio.list_hero_video_poster_due()
returns table(club_id uuid, video_guid text, poster_attempts integer)
language sql stable security invoker set search_path = '' as $$
  select * from onzio_private.list_hero_video_poster_due_core();
$$;

revoke all on function onzio.swap_hero_video(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function onzio.hero_video_event(uuid, text, text, text[], text, text, text, text, integer, bigint, uuid) from public, anon, authenticated;
revoke all on function onzio.attach_hero_video_poster(uuid, text, uuid) from public, anon, authenticated;
revoke all on function onzio.list_hero_video_poster_due() from public, anon, authenticated;
grant execute on function onzio.swap_hero_video(uuid, text, text, text, uuid) to service_role;
grant execute on function onzio.hero_video_event(uuid, text, text, text[], text, text, text, text, integer, bigint, uuid) to service_role;
grant execute on function onzio.attach_hero_video_poster(uuid, text, uuid) to service_role;
grant execute on function onzio.list_hero_video_poster_due() to service_role;

notify pgrst, 'reload schema';
