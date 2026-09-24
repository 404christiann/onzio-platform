-- An editor may finalize a photo and then remove it before saving. Retire
-- only its own Homepage upload, under the same lock as save_homepage, so a
-- concurrent tab cannot link the asset between the reference check and update.
create function onzio_private.retire_unreferenced_homepage_upload(
  p_club_id uuid,
  p_asset_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset onzio.media_assets;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  if not onzio_private.can_mutate_content(p_club_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into asset
  from onzio.media_assets
  where id = p_asset_id and club_id = p_club_id
    and created_by = auth.uid()
    and surface = 'homepage' and storage_bucket = 'onzio-media';
  if not found then
    return jsonb_build_object('status', 'not-owned');
  end if;

  if exists (
    select 1 from onzio.homepage_slideshow_photos
    where club_id = p_club_id and media_asset_id = p_asset_id
  ) then
    return jsonb_build_object('status', 'referenced');
  end if;

  if asset.status = 'orphaned' then
    -- A previous request may have committed before its Storage response was
    -- lost. It is safe to retry object deletion for an unreferenced asset.
    return jsonb_build_object('status', 'retired', 'storagePath', asset.storage_path);
  end if;
  if asset.status <> 'published' or asset.deleted_at is not null then
    return jsonb_build_object('status', 'not-published');
  end if;

  update onzio.media_assets
  set status = 'orphaned', deleted_at = pg_catalog.now()
  where id = p_asset_id and club_id = p_club_id;

  insert into onzio.audit_events (
    club_id, actor_user_id, actor_type, operation,
    resource_type, resource_id, payload
  ) values (
    p_club_id, auth.uid(), 'media_processor', 'media.retire',
    'media_asset', p_asset_id::text,
    '{"reason":"unsaved-homepage-upload"}'::jsonb
  );
  return jsonb_build_object('status', 'retired', 'storagePath', asset.storage_path);
end $$;

revoke all on function onzio_private.retire_unreferenced_homepage_upload(uuid, uuid) from public, anon;
grant execute on function onzio_private.retire_unreferenced_homepage_upload(uuid, uuid) to authenticated;

create function onzio.retire_unreferenced_homepage_upload(
  p_club_id uuid,
  p_asset_id uuid
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select onzio_private.retire_unreferenced_homepage_upload(p_club_id, p_asset_id);
$$;
revoke all on function onzio.retire_unreferenced_homepage_upload(uuid, uuid) from public, anon;
grant execute on function onzio.retire_unreferenced_homepage_upload(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
