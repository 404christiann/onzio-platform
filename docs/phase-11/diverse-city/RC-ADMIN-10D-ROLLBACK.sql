-- RC-ADMIN-10d reviewed rollback path.
-- Apply only when intentionally rolling back 20261119120000_media_orphan_sweep.sql. Set
-- MEDIA_ORPHAN_SWEEP_MODE=off (or remove the cron) first. It restores media_asset_has_references
-- exactly as 20260924154404 defined it, then drops the scan RPC, the registry, the pins and the
-- unreferenced_since column. Files already moved to onzio-media-trash by an enforce run stay there;
-- empty and delete that bucket from the dashboard only if nothing in it is needed.
-- Run it in one transaction, then add a matching migration so the ledger and the repo agree.

begin;

create or replace function onzio_private.media_asset_has_references(p_club_id uuid, p_asset_id uuid, p_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  is_linked boolean;
begin
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
  select exists (
    select 1 from onzio.club_logo_page_content logo
    where logo.club_id = p_club_id
      and (pg_catalog.strpos(logo.color_cards::text, p_path) > 0
        or pg_catalog.strpos(logo.features::text, p_path) > 0)
  ) into is_linked;
  if is_linked then return true; end if;
  select exists (
    select 1 from onzio.site_social_links social
    where social.club_id = p_club_id and pg_catalog.strpos(social.icon, p_path) > 0
  ) into is_linked;
  if is_linked then return true; end if;
  return false;
end $$;
revoke all on function onzio_private.media_asset_has_references(uuid, uuid, text) from public, anon, authenticated, service_role;

drop function if exists onzio.media_orphan_sweep_scan(interval);
drop function if exists onzio_private.media_orphan_sweep_scan_core(interval);
drop table if exists onzio_private.media_reference_columns;
drop table if exists onzio_private.media_pins;
alter table onzio.media_assets drop column if exists unreferenced_since;

commit;
