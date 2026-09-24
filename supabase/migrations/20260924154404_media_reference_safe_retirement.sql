-- Published media can be shared by multiple club pages, including URL-only
-- content. Serialize every new reference with retirement on the asset row.
-- The catalog-driven setup covers every current composite media FK and tenant
-- URL/path column; explicit guards cover the logo page's JSON media arrays
-- and the social icon image source. Future media fields need the same guard.

create function onzio_private.guard_media_reference() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  value text;
  a onzio.media_assets;
begin
  value := pg_catalog.to_jsonb(new)->>tg_argv[0];
  if tg_op = 'UPDATE' and (pg_catalog.to_jsonb(old)->>tg_argv[0]) is not distinct from value then
    return new;
  end if;
  if value is null or value = '' then return new; end if;
  if tg_argv[1] = 'asset' then
    select * into a from onzio.media_assets
      where club_id = new.club_id and id = value::uuid for share;
    if not found or a.status <> 'published' or a.deleted_at is not null then
      raise exception 'MEDIA_NOT_PUBLISHED' using errcode = '23514';
    end if;
  else
    -- URL fields and JSON media collections may contain either a bare
    -- versioned path or the complete public Storage URL. Lock any matching
    -- asset before accepting the link.
    for a in select * from onzio.media_assets
      where club_id = new.club_id and storage_bucket = 'onzio-media'
        and pg_catalog.strpos(value, storage_path) > 0
      for share
    loop
      if a.status <> 'published' or a.deleted_at is not null then
        raise exception 'MEDIA_NOT_PUBLISHED' using errcode = '23514';
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function onzio_private.guard_media_reference() from public, anon, authenticated, service_role;

do $$
declare
  r record;
begin
  -- For each FK, find the child column corresponding to media_assets.id.
  for r in
    select distinct c.conrelid::regclass as table_id, child.attname as column_name
    from pg_catalog.pg_constraint c
    cross join lateral pg_catalog.generate_subscripts(c.confkey, 1) as n(i)
    join pg_catalog.pg_attribute parent on parent.attrelid = c.confrelid and parent.attnum = c.confkey[n.i]
    join pg_catalog.pg_attribute child on child.attrelid = c.conrelid and child.attnum = c.conkey[n.i]
    where c.contype = 'f' and c.confrelid = 'onzio.media_assets'::regclass and parent.attname = 'id'
  loop
    execute pg_catalog.format('create trigger guard_%I_media_reference before insert or update of %I on %s for each row execute function onzio_private.guard_media_reference(%L, %L)',
      r.column_name, r.column_name, r.table_id, r.column_name, 'asset');
  end loop;

  -- URL-only references use the same row lock. Include direct paths such as
  -- site_branding.club_logo_path, and exclude internal Storage ledger paths.
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
    execute pg_catalog.format('create trigger guard_%I_media_url before insert or update of %I on %s for each row execute function onzio_private.guard_media_reference(%L, %L)',
      r.column_name, r.column_name, r.table_id, r.column_name, 'url');
  end loop;

  -- The Club Logo page stores rendered images inside JSONB arrays rather
  -- than URL columns: color_cards[].image_url and features[].patch/icon_url.
  execute 'create trigger guard_color_cards_media_json before insert or update of color_cards on onzio.club_logo_page_content for each row execute function onzio_private.guard_media_reference(''color_cards'', ''json'')';
  execute 'create trigger guard_features_media_json before insert or update of features on onzio.club_logo_page_content for each row execute function onzio_private.guard_media_reference(''features'', ''json'')';
  -- Social icons are rendered image sources despite the generic column name.
  execute 'create trigger guard_icon_media_url before insert or update of icon on onzio.site_social_links for each row execute function onzio_private.guard_media_reference(''icon'', ''url'')';
end $$;

create function onzio_private.media_asset_has_references(p_club_id uuid, p_asset_id uuid, p_path text) returns boolean
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

create function onzio_private.retire_unreferenced_media_asset_core(
  p_club_id uuid, p_asset_id uuid, p_actor_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  asset onzio.media_assets;
begin
  -- Homepage save takes this lock before writing photos. Direct content writes
  -- take the conflicting media row lock in the guards above.
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  select * into asset from onzio.media_assets
    where id = p_asset_id and club_id = p_club_id for update;
  if not found then return pg_catalog.jsonb_build_object('status', 'not-found'); end if;
  if onzio_private.media_asset_has_references(p_club_id, p_asset_id, asset.storage_path) then
    return pg_catalog.jsonb_build_object('status', 'referenced');
  end if;
  if asset.status = 'orphaned' and asset.deleted_at is not null then
    return pg_catalog.jsonb_build_object('status', 'retired', 'storagePath', asset.storage_path, 'idempotent', true);
  end if;
  if asset.status <> 'published' or asset.deleted_at is not null or asset.storage_bucket <> 'onzio-media' then
    return pg_catalog.jsonb_build_object('status', 'not-published');
  end if;
  update onzio.media_assets set status = 'orphaned', deleted_at = pg_catalog.now()
    where id = p_asset_id and club_id = p_club_id;
  insert into onzio.audit_events (club_id, actor_user_id, actor_type, operation, resource_type, resource_id, payload)
    values (p_club_id, p_actor_id, 'media_processor', 'media.retire', 'media_asset', p_asset_id::text,
      '{"reason":"unreferenced-media"}'::jsonb);
  return pg_catalog.jsonb_build_object('status', 'retired', 'storagePath', asset.storage_path, 'idempotent', false);
end $$;
revoke all on function onzio_private.retire_unreferenced_media_asset_core(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function onzio_private.retire_unreferenced_media_asset_core(uuid, uuid, uuid) to service_role;

create function onzio.retire_unreferenced_media_asset(
  p_club_id uuid, p_asset_id uuid, p_actor_id uuid
) returns jsonb
language sql security invoker set search_path = '' as $$
  select onzio_private.retire_unreferenced_media_asset_core(p_club_id, p_asset_id, p_actor_id);
$$;
revoke all on function onzio.retire_unreferenced_media_asset(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function onzio.retire_unreferenced_media_asset(uuid, uuid, uuid) to service_role;

create or replace function onzio_private.retire_unreferenced_homepage_upload(
  p_club_id uuid, p_asset_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  asset onzio.media_assets;
begin
  if not onzio_private.can_mutate_content(p_club_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into asset from onzio.media_assets
    where id = p_asset_id and club_id = p_club_id
      and created_by = auth.uid() and surface = 'homepage' and storage_bucket = 'onzio-media';
  if not found then return pg_catalog.jsonb_build_object('status', 'not-owned'); end if;
  -- Keep the browser RPC's established response shape; idempotence is only
  -- needed by the privileged generic cleanup helper.
  return onzio_private.retire_unreferenced_media_asset_core(p_club_id, p_asset_id, auth.uid()) - 'idempotent';
end $$;

alter table onzio.media_cleanup_queue drop constraint media_cleanup_queue_reason_check;
alter table onzio.media_cleanup_queue add constraint media_cleanup_queue_reason_check
  check (reason in ('post-finalization-staging-delete', 'published-object-retirement',
    'abandoned-staging-object', 'unsaved-homepage-upload'));

notify pgrst, 'reload schema';
