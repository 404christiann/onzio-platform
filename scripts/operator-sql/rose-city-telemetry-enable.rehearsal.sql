-- Rose City: turn on the paid telemetry add-on (TELEMETRY-01).
-- Grants onzio_private.club_addons (rose-city, telemetry) and records one audit event.
-- Club 32ceba0b-4e25-52c2-bb6b-d82fb87637a7 (rose-city). Ends in ROLLBACK (rehearsal). The commit file ends in COMMIT.
-- Run in the Supabase SQL editor (as postgres) only after migration 20261121060000_page_telemetry is applied
-- and TELEMETRY_INGEST_SECRET is set in Vercel Production (the beacon drops every event without it).
-- Rerunning is safe: if the add-on is already on, nothing is written and the read-back says no-op.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $operator$
declare
  v_club_id constant uuid := '32ceba0b-4e25-52c2-bb6b-d82fb87637a7';
  v_club onzio.clubs;
  v_count integer;
begin
  if to_regclass('onzio_private.club_addons') is null
     or to_regclass('onzio_private.telemetry_ingest_keys') is null then
    raise exception 'MIGRATION_MISSING: apply 20261121060000_page_telemetry first';
  end if;
  -- Signed beacon writes need the ingest key row; without it every event would be rejected.
  if not exists (select 1 from onzio_private.telemetry_ingest_keys) then
    raise exception 'MIGRATION_MISSING: onzio_private.telemetry_ingest_keys has no key row';
  end if;

  select * into v_club from onzio.clubs where id = v_club_id for update;
  if not found or v_club.slug <> 'rose-city' then
    raise exception 'ROSE_CITY_NOT_FOUND: club % is missing or is not rose-city', v_club_id;
  end if;
  if v_club.lifecycle = 'archived' then raise exception 'ROSE_CITY_ARCHIVED'; end if;

  if onzio_private.club_has_addon(v_club_id, 'telemetry') then
    perform set_config('onzio_operator.result', 'no-op', true);
    return;
  end if;

  insert into onzio_private.club_addons (club_id, addon)
  values (v_club_id, 'telemetry')
  on conflict (club_id, addon) do nothing;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'EXPECTED_ONE_ROW: inserted %', v_count; end if;

  insert into onzio.audit_events (club_id, actor_type, operation, resource_type, resource_id, payload)
  values (v_club_id, 'migration', 'manual.club_addon_grant', 'club_addon', 'telemetry', jsonb_build_object(
    'addon', 'telemetry',
    'previous_value', jsonb_build_object('enabled', false),
    'new_value', jsonb_build_object('enabled', true),
    'reason', 'TELEMETRY-01: Rose City bought the sponsor analytics (telemetry) add-on'));

  if not onzio_private.club_has_addon(v_club_id, 'telemetry') then
    raise exception 'POST_CHECK_FAILED: telemetry is not on';
  end if;
  perform set_config('onzio_operator.result', 'changed: telemetry off -> on', true);
end
$operator$;

-- Read-back.
select current_setting('onzio_operator.result', true) as result,
  c.slug as club_slug,
  onzio_private.club_has_addon(c.id, 'telemetry') as telemetry_enabled,
  (select f.granted_at from onzio_private.club_addons f where f.club_id = c.id and f.addon = 'telemetry') as granted_at,
  (select count(*) from onzio_private.club_addons f where f.addon = 'telemetry') as clubs_with_telemetry,
  (select a.id from onzio.audit_events a where a.club_id = c.id and a.operation = 'manual.club_addon_grant'
   order by a.created_at desc, a.id desc limit 1) as latest_audit_event_id,
  (c.slug = 'rose-city' and onzio_private.club_has_addon(c.id, 'telemetry')
   and exists (select 1 from onzio.audit_events a where a.club_id = c.id and a.operation = 'manual.club_addon_grant')) as all_ok
from onzio.clubs c
where c.id = '32ceba0b-4e25-52c2-bb6b-d82fb87637a7';

rollback;
