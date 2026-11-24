-- Rose City: flag the live hero video for its poster and keep the original pairing for a revert (RC-HERO-POSTER-05).
-- Club 32ceba0b-4e25-52c2-bb6b-d82fb87637a7 (rose-city). Ends in COMMIT. Run the rehearsal file first.
-- Same statements as the rehearsal. See it for what this does and when to run it.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $operator$
declare
  v_club_id constant uuid := '32ceba0b-4e25-52c2-bb6b-d82fb87637a7';
  -- The first hero video Rose City went live with. Its hand-set poster is the one in the live slot today.
  v_original_video constant text := 'd17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91';
  v_club onzio.clubs;
  v_row onzio.homepage_revamp_content;
  v_pending onzio_private.hero_video_pending;
  v_live text;
  v_prev text;
  v_count integer;
  v_changes text[] := array[]::text[];
begin
  if not exists (
       select 1 from information_schema.columns
        where table_schema = 'onzio' and table_name = 'homepage_revamp_content'
          and column_name = 'previous_hero_poster_media_asset_id')
     or not exists (
       select 1 from information_schema.columns
        where table_schema = 'onzio_private' and table_name = 'hero_video_pending' and column_name = 'poster_due_at') then
    raise exception 'MIGRATION_MISSING: apply 20261124120000_hero_video_poster first';
  end if;

  -- Same lock order as the hero video functions and save_homepage: homepage lock, then rows.
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  select * into v_club from onzio.clubs where id = v_club_id for update;
  if not found or v_club.slug <> 'rose-city' then
    raise exception 'ROSE_CITY_NOT_FOUND: club % is missing or is not rose-city', v_club_id;
  end if;
  if v_club.lifecycle = 'archived' then raise exception 'ROSE_CITY_ARCHIVED'; end if;

  select * into v_row from onzio.homepage_revamp_content where club_id = v_club_id for update;
  if not found then raise exception 'HOMEPAGE_ROW_MISSING'; end if;
  v_live := coalesce(v_row.presentation_config->>'heroVideoGuid', '');
  v_prev := coalesce(v_row.presentation_config->>'previousHeroVideoGuid', '');

  -- Only a live row for the video that is live now. Anything else (no row, a video still preparing, a revert since)
  -- is reported and nothing is written.
  select * into v_pending from onzio_private.hero_video_pending
   where club_id = v_club_id and video_guid = v_live and phase = 'live' for update;
  if v_live = '' or not found then
    perform set_config('onzio_operator.result', 'no-op: the pending row is not live for the current video', true);
    return;
  end if;

  -- The live poster was already made from a video by the hero poster flow: nothing to backfill.
  if v_row.hero_poster_media_asset_id is not null and exists (
       select 1 from onzio.audit_events a
        where a.club_id = v_club_id and a.operation = 'media.publish'
          and a.resource_id = v_row.hero_poster_media_asset_id::text
          and a.payload->>'source' = 'hero-video-poster') then
    perform set_config('onzio_operator.result', 'no-op: the live poster was already made from the video', true);
    return;
  end if;

  -- A revert to the original video should show the original pairing: copy the hand-set poster and its alt into the
  -- previous slot, once, and only while that slot is empty.
  if v_prev = v_original_video and v_row.previous_hero_poster_media_asset_id is null and v_row.hero_poster_media_asset_id is not null then
    update onzio.homepage_revamp_content
       set previous_hero_poster_media_asset_id = hero_poster_media_asset_id,
           presentation_config = presentation_config
             || jsonb_build_object('previousHeroPosterAlt', coalesce(presentation_config#>>'{artworkAlt,heroPoster}', ''))
     where club_id = v_club_id and previous_hero_poster_media_asset_id is null;
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception 'EXPECTED_ONE_ROW: homepage row updated %', v_count; end if;
    v_changes := array_append(v_changes, 'previous poster set');
  end if;

  -- Flag the live video so the daily job makes its poster. A flag already waiting is left alone.
  if v_pending.poster_due_at is null then
    update onzio_private.hero_video_pending
       set poster_due_at = pg_catalog.now(), poster_attempts = 0, updated_at = pg_catalog.now()
     where club_id = v_club_id and video_guid = v_live and phase = 'live' and poster_due_at is null;
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception 'EXPECTED_ONE_ROW: pending row updated %', v_count; end if;
    v_changes := array_append(v_changes, 'poster flagged for the daily job');
  end if;

  if array_length(v_changes, 1) is null then
    perform set_config('onzio_operator.result', 'no-op: already flagged', true);
    return;
  end if;

  insert into onzio.audit_events (club_id, actor_type, operation, resource_type, resource_id, payload)
  values (v_club_id, 'migration', 'manual.hero_poster_backfill', 'homepage_revamp_content', v_club_id::text, jsonb_build_object(
    'changes', to_jsonb(v_changes),
    'video_guid', v_live,
    'reason', 'RC-HERO-POSTER-05: the live hero poster is the old video''s; the daily job makes one from the live video'));
  perform set_config('onzio_operator.result', 'changed: ' || array_to_string(v_changes, ', '), true);
end
$operator$;

-- Read-back.
select current_setting('onzio_operator.result', true) as result,
  c.slug as club_slug,
  r.presentation_config->>'heroVideoGuid' as live_video,
  r.presentation_config->>'previousHeroVideoGuid' as previous_video,
  r.hero_poster_media_asset_id as live_poster,
  r.previous_hero_poster_media_asset_id as previous_poster,
  p.phase as pending_phase,
  p.poster_due_at is not null as poster_flagged,
  p.poster_attempts,
  (select a.id from onzio.audit_events a where a.club_id = c.id and a.operation = 'manual.hero_poster_backfill'
   order by a.created_at desc, a.id desc limit 1) as latest_audit_event_id,
  (c.slug = 'rose-city' and r.presentation_config->>'heroVideoGuid' = p.video_guid and p.phase = 'live') as all_ok
from onzio.clubs c
join onzio.homepage_revamp_content r on r.club_id = c.id
left join onzio_private.hero_video_pending p on p.club_id = c.id
where c.id = '32ceba0b-4e25-52c2-bb6b-d82fb87637a7';

commit;
