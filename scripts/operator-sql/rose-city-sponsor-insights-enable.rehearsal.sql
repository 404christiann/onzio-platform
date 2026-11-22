-- Rose City: turn on the Sponsor Insights flag (TELEMETRY-FLAG).
-- Sets onzio.clubs.admin_flags.sponsor_insights = true for rose-city only and records one audit event.
-- Club 32ceba0b-4e25-52c2-bb6b-d82fb87637a7 (rose-city). Ends in ROLLBACK (rehearsal). The commit file ends in COMMIT.
-- The Insights tab (TELEMETRY-04) and monthly report (TELEMETRY-05) also need admin_portal = 'reimagined'
-- (lib/admin-tab-page.ts); this script does not touch admin_portal or any other flag.
-- Rerunning is safe: the update always writes the same value (row count 1, updated_at moves) and adds one more
-- audit row whose previous_value shows the flag was already on.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $operator$
declare
  v_club_id constant uuid := '32ceba0b-4e25-52c2-bb6b-d82fb87637a7';
  v_club onzio.clubs;
  v_matches integer;
  v_count integer;
  v_others_before text;
  v_others_after text;
  v_new_flags jsonb;
  v_audit_id bigint;
begin
  select count(*) into v_matches from onzio.clubs where slug = 'rose-city';
  if v_matches <> 1 then
    raise exception 'EXPECTED_ONE_TARGET_CLUB: % clubs have slug rose-city', v_matches;
  end if;

  select * into v_club from onzio.clubs where id = v_club_id for update;
  if not found or v_club.slug <> 'rose-city' then
    raise exception 'ROSE_CITY_NOT_FOUND: club % is missing or is not rose-city', v_club_id;
  end if;
  if v_club.lifecycle = 'archived' then raise exception 'ROSE_CITY_ARCHIVED'; end if;

  select coalesce(md5(string_agg(o::text, ',' order by o.id)), 'none') into v_others_before
  from onzio.clubs o where o.id <> v_club_id;

  update onzio.clubs
  set admin_flags = admin_flags || jsonb_build_object('sponsor_insights', true)
  where id = v_club_id
  returning admin_flags into v_new_flags;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'EXPECTED_ONE_ROW: updated %', v_count; end if;

  if v_new_flags - 'sponsor_insights' <> v_club.admin_flags - 'sponsor_insights' then
    raise exception 'OTHER_FLAGS_CHANGED: % -> %', v_club.admin_flags, v_new_flags;
  end if;
  if v_new_flags -> 'sponsor_insights' is distinct from 'true'::jsonb then
    raise exception 'POST_CHECK_FAILED: sponsor_insights is %', v_new_flags -> 'sponsor_insights';
  end if;

  select coalesce(md5(string_agg(o::text, ',' order by o.id)), 'none') into v_others_after
  from onzio.clubs o where o.id <> v_club_id;
  if v_others_after <> v_others_before then
    raise exception 'OTHER_CLUBS_CHANGED';
  end if;

  insert into onzio.audit_events (club_id, actor_type, operation, resource_type, resource_id, payload)
  values (v_club_id, 'migration', 'manual.club_admin_flag_set', 'club_admin_flag', 'sponsor_insights', jsonb_build_object(
    'flag', 'sponsor_insights',
    'previous_value', jsonb_build_object('admin_flags', v_club.admin_flags),
    'new_value', jsonb_build_object('admin_flags', v_new_flags),
    'reason', 'TELEMETRY-FLAG: Rose City bought the Sponsor Insights add-on'))
  returning id into v_audit_id;

  perform set_config('onzio_operator.before', coalesce(v_club.admin_flags -> 'sponsor_insights', 'null'::jsonb)::text, true);
  perform set_config('onzio_operator.row_count', v_count::text, true);
  perform set_config('onzio_operator.others_unchanged', (v_others_after = v_others_before)::text, true);
  perform set_config('onzio_operator.audit_event_id', v_audit_id::text, true);
end
$operator$;

-- Read-back.
select current_setting('onzio_operator.before', true) as sponsor_insights_before,
  c.admin_flags -> 'sponsor_insights' as sponsor_insights_after,
  c.admin_flags,
  c.admin_portal,
  current_setting('onzio_operator.row_count', true)::integer as row_count,
  current_setting('onzio_operator.others_unchanged', true)::boolean as others_unchanged,
  current_setting('onzio_operator.audit_event_id', true)::bigint as audit_event_id,
  (c.slug = 'rose-city'
   and c.admin_flags -> 'sponsor_insights' = 'true'::jsonb
   and current_setting('onzio_operator.row_count', true) = '1'
   and current_setting('onzio_operator.others_unchanged', true) = 'true'
   and exists (select 1 from onzio.audit_events a
               where a.id = current_setting('onzio_operator.audit_event_id', true)::bigint
                 and a.club_id = c.id and a.operation = 'manual.club_admin_flag_set')) as all_ok
from onzio.clubs c
where c.id = '32ceba0b-4e25-52c2-bb6b-d82fb87637a7';

rollback;
