-- RC-ADMIN-10d: orphan-media sweep (dry-run first). Needs the production migration gate before merge.
--
-- Today about 60% of Diverse City FC's and 76% of Rose City's published media assets are not
-- referenced by any content row, and the files stay in the public bucket forever (they count
-- toward the RC-ADMIN-10b quota). A daily cron (/api/cron/media-orphan-sweep) now finds them.
-- It runs in dry-run by default: it only keeps a clock and writes a report. Retiring files needs
-- MEDIA_ORPHAN_SWEEP_MODE=enforce, which Christian sets by hand after reading the reports.
--
-- This migration adds:
--   * onzio.media_assets.unreferenced_since. A scan sets it (when null) on a published asset that
--     nothing references, and clears it when something references the asset again. An asset can be
--     retired only when BOTH this clock and published_at are older than the grace (24 hours by
--     default). Two scans a day apart are therefore needed before a file is ever a candidate.
--   * onzio_private.media_pins: paths that code, not the database, depends on (Rose City's 14
--     hard-coded flag and affiliation-logo files). A pinned path counts as referenced, so the
--     sweep and every other retirement path (retire_unreferenced_media_asset) leave it alone.
--     tests/contracts/media-pins-hardcoded.test.ts fails when app code hard-codes an onzio-media
--     file that is not seeded here.
--   * onzio_private.media_reference_columns: a registry of text/json columns that hold media paths
--     inside larger values. onzio_private.media_asset_has_references (same signature) now loops it
--     instead of hard-coding club_logo_page_content and site_social_links.icon. The foreign-key and
--     url/_url/_path catalog loops are unchanged. tests/database/media-orphan-sweep.test.ts fails
--     when a new json/jsonb column on a club table is neither registered nor explicitly classified.
--   * onzio.media_orphan_sweep_scan (service role only): one pass that updates the clock and
--     returns, per club, the pinned, waiting and candidate assets for the report.
--   * the private bucket onzio-media-trash. Enforce copies a file there before it removes it from
--     onzio-media; the cron deletes trash older than 30 days. No storage policies: service role only.
--
-- Existing behaviour is unchanged: the guard triggers, retire core and queue are not touched.
-- Rollback: docs/phase-11/diverse-city/RC-ADMIN-10D-ROLLBACK.sql. Set the cron mode to off first.

alter table onzio.media_assets add column unreferenced_since timestamptz;

comment on column onzio.media_assets.unreferenced_since is
  'Set by the orphan-media sweep when nothing references this published asset; cleared when something does. A retire candidate needs this and published_at older than the grace.';

-- Paths that application code depends on directly.
create table onzio_private.media_pins (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  object_path text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (club_id, object_path),
  check (pg_catalog.starts_with(object_path, club_id::text || '/'))
);

alter table onzio_private.media_pins enable row level security;
revoke all on onzio_private.media_pins from public, anon, authenticated;
grant all on onzio_private.media_pins to service_role;

comment on table onzio_private.media_pins is
  'Published media that code (not a content row) depends on. A pinned path counts as referenced and is never swept or retired.';

-- Rose City: 6 flag files in lib/flags.ts (ROSE_CITY_MIGRATED_FLAG_FILES) and 8 affiliation logos
-- in components/Nav.tsx (affiliationLogos). A no-op where the club does not exist (local and test).
insert into onzio_private.media_pins (club_id, object_path, reason)
select c.id, '32ceba0b-4e25-52c2-bb6b-d82fb87637a7/' || p.path, p.reason
from onzio.clubs c
cross join (values
  ('flags/def61117-0b21-5ffb-b25b-05158cf77a9a.webp', 'hard-coded in lib/flags.ts (USA flag)'),
  ('flags/8cd36b7e-a878-5f53-8818-286991b8d83c.webp', 'hard-coded in lib/flags.ts (Cameroon flag)'),
  ('flags/cffa4357-582a-5206-abf0-ace078d16ada.webp', 'hard-coded in lib/flags.ts (Guatemala flag)'),
  ('flags/548fc64c-c361-5507-9e8a-11dd641816f6.webp', 'hard-coded in lib/flags.ts (Japan flag)'),
  ('flags/951f521a-1f0f-5006-9ffc-44de3815c5db.webp', 'hard-coded in lib/flags.ts (Mexico flag)'),
  ('flags/7907e084-bc07-5298-bfb8-bf091caad992.webp', 'hard-coded in lib/flags.ts (El Salvador flag)'),
  ('branding/e6567f14-dd84-5bc2-9ad5-feba2bb7ebcd.webp', 'hard-coded in components/Nav.tsx (US Soccer color logo)'),
  ('branding/9e07acc2-58e7-57e9-8cb3-6e3e6c6f62ab.webp', 'hard-coded in components/Nav.tsx (US Soccer white logo)'),
  ('branding/156cf559-3506-54d2-b76d-fe1467a38ecb.webp', 'hard-coded in components/Nav.tsx (FIFA color logo)'),
  ('branding/372c1717-8e41-523c-9e77-10619c84510a.webp', 'hard-coded in components/Nav.tsx (FIFA white logo)'),
  ('branding/ac5777e3-e529-5c35-a661-e215bc56fc17.webp', 'hard-coded in components/Nav.tsx (Lamar Hunt U.S. Open Cup color logo)'),
  ('branding/56f60999-1821-566e-8769-f2b472d652e4.webp', 'hard-coded in components/Nav.tsx (Lamar Hunt U.S. Open Cup white logo)'),
  ('branding/84a9350a-be9e-50ae-bc78-f197288c2bfb.webp', 'hard-coded in components/Nav.tsx (UPSL color logo)'),
  ('branding/39d5d7ca-17f1-54a7-8310-645128d401ce.webp', 'hard-coded in components/Nav.tsx (UPSL white logo)')
) as p(path, reason)
where c.id = '32ceba0b-4e25-52c2-bb6b-d82fb87637a7'
on conflict do nothing;

-- Columns that hold media paths inside larger values (JSON or free text). Add a row here when a
-- new such column ships; the catalog test enforces it for json/jsonb columns.
create table onzio_private.media_reference_columns (
  table_name text not null,
  column_name text not null,
  note text not null,
  primary key (table_name, column_name)
);

alter table onzio_private.media_reference_columns enable row level security;
revoke all on onzio_private.media_reference_columns from public, anon, authenticated;
grant all on onzio_private.media_reference_columns to service_role;

insert into onzio_private.media_reference_columns (table_name, column_name, note) values
  ('onzio.club_logo_page_content', 'color_cards', 'Club Logo page: color_cards[].image_url'),
  ('onzio.club_logo_page_content', 'features', 'Club Logo page: features[].patch and icon_url'),
  ('onzio.site_social_links', 'icon', 'Social icons are image sources despite the generic column name');

-- Same signature and contract as 20260924154404; pins and the registry are the only additions.
create or replace function onzio_private.media_asset_has_references(p_club_id uuid, p_asset_id uuid, p_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  is_linked boolean;
begin
  -- Code (not a content row) depends on this file.
  select exists (
    select 1 from onzio_private.media_pins pin
    where pin.club_id = p_club_id and pin.object_path = p_path
  ) into is_linked;
  if is_linked then return true; end if;
  for r in
    select distinct c.conrelid::regclass as table_id, child.attname as column_name
    from pg_catalog.pg_constraint c
    cross join lateral pg_catalog.generate_subscripts(c.confkey, 1) as n(i)
    join pg_catalog.pg_attribute parent on parent.attrelid = c.confrelid and parent.attnum = c.confkey[n.i]
    join pg_catalog.pg_attribute child on child.attrelid = c.conrelid and child.attnum = c.conkey[n.i]
    where c.contype = 'f' and c.confrelid = 'onzio.media_assets'::regclass and parent.attname = 'id'
  loop
    execute pg_catalog.format('select exists(select 1 from %s where club_id = $1 and %I = $2)', r.table_id, r.column_name)
      into is_linked using p_club_id, p_asset_id;
    if is_linked then return true; end if;
  end loop;
  for r in
    select cls.oid::regclass as table_id, attr.attname as column_name
    from pg_catalog.pg_class cls
    join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
    join pg_catalog.pg_attribute attr on attr.attrelid = cls.oid
    where ns.nspname = 'onzio' and cls.relkind in ('r', 'p')
      and attr.attnum > 0 and not attr.attisdropped
      and attr.atttypid in ('text'::regtype, 'varchar'::regtype)
      and (attr.attname = 'url' or attr.attname like '%\_url' escape '\' or attr.attname like '%\_path' escape '\')
      and exists (select 1 from pg_catalog.pg_attribute club where club.attrelid = cls.oid and club.attname = 'club_id' and not club.attisdropped)
      and cls.relname not in ('media_assets', 'media_cleanup_queue')
  loop
    execute pg_catalog.format('select exists(select 1 from %s where club_id = $1 and pg_catalog.strpos(%I, $2) > 0)', r.table_id, r.column_name)
      into is_linked using p_club_id, p_path;
    if is_linked then return true; end if;
  end loop;
  -- Registered columns that embed media paths in JSON or text.
  for r in
    select reg.table_name::regclass as table_id, reg.column_name
    from onzio_private.media_reference_columns reg
    order by reg.table_name, reg.column_name
  loop
    execute pg_catalog.format('select exists(select 1 from %s where club_id = $1 and pg_catalog.strpos(%I::text, $2) > 0)', r.table_id, r.column_name)
      into is_linked using p_club_id, p_path;
    if is_linked then return true; end if;
  end loop;
  return false;
end $$;
revoke all on function onzio_private.media_asset_has_references(uuid, uuid, text) from public, anon, authenticated, service_role;

-- One pass over every published asset of every non-archived club. Updates the clock and returns
-- the report. Archived clubs belong to the purge, not the sweep. The scan changes only
-- unreferenced_since; retirement is a separate call per asset (retire_unreferenced_media_asset),
-- which re-checks references under its own lock.
create function onzio_private.media_orphan_sweep_scan_core(p_grace interval) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_club record;
  a record;
  v_clubs jsonb := '[]'::jsonb;
  v_pinned jsonb;
  v_waiting jsonb;
  v_candidates jsonb;
  v_published integer;
  v_referenced integer;
  v_since timestamptz;
  v_stray bigint;
begin
  if p_grace is null or p_grace < interval '0' then
    raise exception 'INVALID_GRACE' using errcode = '22023';
  end if;
  for v_club in
    select cl.id, cl.slug from onzio.clubs cl
    where cl.lifecycle <> 'archived'
      and exists (
        select 1 from onzio.media_assets m
        where m.club_id = cl.id and m.status = 'published' and m.deleted_at is null
          and m.storage_bucket = 'onzio-media')
    order by cl.id
  loop
    v_pinned := '[]'::jsonb; v_waiting := '[]'::jsonb; v_candidates := '[]'::jsonb;
    v_published := 0; v_referenced := 0;
    for a in
      select m.id, m.storage_path, m.surface, m.published_at, m.unreferenced_since
      from onzio.media_assets m
      where m.club_id = v_club.id and m.status = 'published' and m.deleted_at is null
        and m.storage_bucket = 'onzio-media'
      order by m.published_at, m.id
    loop
      v_published := v_published + 1;
      if exists (select 1 from onzio_private.media_pins pin
                 where pin.club_id = v_club.id and pin.object_path = a.storage_path) then
        v_pinned := v_pinned || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('assetId', a.id, 'path', a.storage_path));
        if a.unreferenced_since is not null then
          update onzio.media_assets set unreferenced_since = null where id = a.id;
        end if;
      elsif onzio_private.media_asset_has_references(v_club.id, a.id, a.storage_path) then
        v_referenced := v_referenced + 1;
        if a.unreferenced_since is not null then
          update onzio.media_assets set unreferenced_since = null where id = a.id;
        end if;
      else
        v_since := a.unreferenced_since;
        if v_since is null then
          v_since := v_now;
          update onzio.media_assets set unreferenced_since = v_now where id = a.id;
        end if;
        if v_since <= v_now - p_grace and a.published_at <= v_now - p_grace then
          v_candidates := v_candidates || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'assetId', a.id, 'path', a.storage_path, 'surface', a.surface,
            'publishedAt', a.published_at, 'unreferencedSince', v_since));
        else
          v_waiting := v_waiting || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'assetId', a.id, 'path', a.storage_path, 'surface', a.surface,
            'unreferencedSince', v_since));
        end if;
      end if;
    end loop;
    v_clubs := v_clubs || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'clubId', v_club.id, 'slug', v_club.slug,
      'published', v_published, 'referencedCount', v_referenced,
      'pinned', v_pinned, 'waiting', v_waiting, 'candidates', v_candidates));
  end loop;

  -- Report-only: onzio-media objects that have no media_assets row at all. The sweep never
  -- touches these. Null when Storage is not readable from here.
  begin
    select count(*) into v_stray from storage.objects o
    where o.bucket_id = 'onzio-media'
      and not exists (select 1 from onzio.media_assets m
                      where m.storage_bucket = 'onzio-media' and m.storage_path = o.name);
  exception when others then
    v_stray := null;
  end;

  return pg_catalog.jsonb_build_object(
    'graceSeconds', extract(epoch from p_grace)::bigint,
    'scannedAt', v_now,
    'clubs', v_clubs,
    'strayObjects', v_stray);
end $$;
revoke all on function onzio_private.media_orphan_sweep_scan_core(interval) from public, anon, authenticated, service_role;
grant execute on function onzio_private.media_orphan_sweep_scan_core(interval) to service_role;

create function onzio.media_orphan_sweep_scan(p_grace interval default interval '24 hours') returns jsonb
language sql security invoker set search_path = '' as $$
  select onzio_private.media_orphan_sweep_scan_core(p_grace);
$$;
revoke all on function onzio.media_orphan_sweep_scan(interval) from public, anon, authenticated;
grant execute on function onzio.media_orphan_sweep_scan(interval) to service_role;

-- Private trash for retired published files. Same limits as onzio-media. No storage policies, so
-- only the service role (which bypasses RLS) can read or write it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onzio-media-trash', 'onzio-media-trash', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
