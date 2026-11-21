-- RC-HERO-VIDEO-SWAP: replace Rose City's homepage hero video from the admin, with a daily cap and one-step revert.
--
-- The hero video lives in onzio.homepage_revamp_content.presentation_config (operator-owned jsonb:
-- heroVideoGuid, heroVideoLibraryId, sponsorTreatments, artworkAlt). Authenticated has no write grant on that
-- column and this migration keeps it that way. Only the service role reaches the four RPCs below, after the app
-- has checked the editor's session, role and entitlement.
--
--   consume_hero_video_replace(club, cap)   counts one replacement for today (UTC) unless the club is at the cap.
--   hero_video_replaces_today(club)         read-only count for the admin screen.
--   swap_hero_video(club, guid, lib, exp)   under the row lock, makes guid live and moves the old live video to
--                                           previousHeroVideoGuid. Merges the jsonb, so sponsorTreatments,
--                                           artworkAlt and any other key survive. Returns the video that fell out
--                                           of the two-slot history so the caller can delete it from Bunny.
--   revert_hero_video(club, exp, target)    swaps live and previous. Deletes nothing.
--
-- Both writers compare against what the caller believes is live, so a stale tab or a retried request cannot
-- overwrite a newer change: a retry of a finished swap returns 'already_live' with nothing to delete.
-- The counter table is in onzio_private: RLS on, no policies, no rights for anon or authenticated, and cascade
-- delete with the club.
--
-- Rollback: roll the app back first, then drop the four onzio wrappers, the four onzio_private functions and the
-- counter table. No existing data is changed; previousHeroVideoGuid is an extra jsonb key the old code ignores.

create table onzio_private.hero_video_replace_counters (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  day date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (club_id, day)
);

alter table onzio_private.hero_video_replace_counters enable row level security;
revoke all on onzio_private.hero_video_replace_counters from public, anon, authenticated;

create function onzio_private.consume_hero_video_replace_core(p_club_id uuid, p_cap integer)
returns table(allowed boolean, used integer, cap integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_day date := (pg_catalog.now() at time zone 'utc')::date;
  v_used integer;
begin
  if p_cap is null or p_cap < 1 or p_cap > 50 then
    raise exception 'INVALID_HERO_VIDEO_CAP' using errcode = '22023';
  end if;
  -- One writer per club at a time, so parallel requests cannot both take the last slot.
  perform pg_catalog.pg_advisory_xact_lock(734901502, pg_catalog.hashtext(p_club_id::text));

  select c.used into v_used from onzio_private.hero_video_replace_counters c
   where c.club_id = p_club_id and c.day = v_day;
  v_used := coalesce(v_used, 0);

  if v_used >= p_cap then
    return query select false, v_used, p_cap;
    return;
  end if;

  insert into onzio_private.hero_video_replace_counters as c (club_id, day, used)
  values (p_club_id, v_day, 1)
  on conflict (club_id, day) do update set used = c.used + 1, updated_at = pg_catalog.now();
  return query select true, v_used + 1, p_cap;
end $$;

create function onzio_private.hero_video_replaces_today_core(p_club_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.used from onzio_private.hero_video_replace_counters c
      where c.club_id = p_club_id and c.day = (pg_catalog.now() at time zone 'utc')::date),
    0);
$$;

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

create function onzio_private.revert_hero_video_core(
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

revoke all on function onzio_private.consume_hero_video_replace_core(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function onzio_private.hero_video_replaces_today_core(uuid) from public, anon, authenticated, service_role;
revoke all on function onzio_private.swap_hero_video_core(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function onzio_private.revert_hero_video_core(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function onzio_private.consume_hero_video_replace_core(uuid, integer) to service_role;
grant execute on function onzio_private.hero_video_replaces_today_core(uuid) to service_role;
grant execute on function onzio_private.swap_hero_video_core(uuid, text, text, text) to service_role;
grant execute on function onzio_private.revert_hero_video_core(uuid, text, text) to service_role;

create function onzio.consume_hero_video_replace(p_club_id uuid, p_cap integer default 5)
returns table(allowed boolean, used integer, cap integer)
language sql security invoker set search_path = '' as $$
  select * from onzio_private.consume_hero_video_replace_core(p_club_id, p_cap);
$$;

create function onzio.hero_video_replaces_today(p_club_id uuid) returns integer
language sql stable security invoker set search_path = '' as $$
  select onzio_private.hero_video_replaces_today_core(p_club_id);
$$;

create function onzio.swap_hero_video(p_club_id uuid, p_new_guid text, p_library_id text, p_expected_live text)
returns table(outcome text, live_guid text, previous_guid text, deletable_guid text, revision_before text, revision_after text)
language sql security invoker set search_path = '' as $$
  select * from onzio_private.swap_hero_video_core(p_club_id, p_new_guid, p_library_id, p_expected_live);
$$;

create function onzio.revert_hero_video(p_club_id uuid, p_expected_live text, p_target_guid text)
returns table(outcome text, live_guid text, previous_guid text, revision_before text, revision_after text)
language sql security invoker set search_path = '' as $$
  select * from onzio_private.revert_hero_video_core(p_club_id, p_expected_live, p_target_guid);
$$;

revoke all on function onzio.consume_hero_video_replace(uuid, integer) from public, anon, authenticated;
revoke all on function onzio.hero_video_replaces_today(uuid) from public, anon, authenticated;
revoke all on function onzio.swap_hero_video(uuid, text, text, text) from public, anon, authenticated;
revoke all on function onzio.revert_hero_video(uuid, text, text) from public, anon, authenticated;
grant execute on function onzio.consume_hero_video_replace(uuid, integer) to service_role;
grant execute on function onzio.hero_video_replaces_today(uuid) to service_role;
grant execute on function onzio.swap_hero_video(uuid, text, text, text) to service_role;
grant execute on function onzio.revert_hero_video(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
