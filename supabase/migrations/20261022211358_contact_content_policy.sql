create or replace function onzio.load_contact_editor(
  p_club_id uuid,p_operation_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901289);
  if not onzio_private.can_mutate_feature(p_club_id,'contact') then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  result:=onzio_private.contact_editor_snapshot(p_club_id);
  if p_operation_id is not null then
    select response into receipt from onzio_private.contact_editor_receipts
      where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
    result:=result||jsonb_build_object('operation',case when receipt is null
      then jsonb_build_object('status','not-committed')
      else jsonb_build_object('status','committed','receipt',receipt) end);
  end if;
  return result;
end $$;
revoke all on function onzio.load_contact_editor(uuid,uuid) from public,anon;
grant execute on function onzio.load_contact_editor(uuid,uuid) to authenticated;

create or replace function onzio.save_contact_editor(p_club_id uuid,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  profile jsonb; page jsonb; result jsonb; current_page jsonb;
  op uuid; media_id uuid; old_media_id uuid;
  request_hash text; saved_hash text; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901289);
  if not onzio_private.can_mutate_feature(p_club_id,'contact') then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object'
    or not p_request ?& array['operationId','expectedRevision','profile','page']
    or exists(select 1 from jsonb_object_keys(p_request) k
      where k<>all(array['operationId','expectedRevision','profile','page']))
    or jsonb_typeof(p_request->'profile') is distinct from 'object'
    or jsonb_typeof(p_request->'page') is distinct from 'object'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
    or (p_request->>'expectedRevision')!~'^[0-9]+$'
    or char_length(p_request->>'expectedRevision')>20 then
    raise exception 'INVALID_CONTACT_PAYLOAD' using errcode='22023';
  end if;
  profile:=p_request->'profile'; page:=p_request->'page';
  if not profile ?& array['public_email','public_phone','service_area','hours']
    or exists(select 1 from jsonb_object_keys(profile) k
      where k<>all(array['public_email','public_phone','service_area','hours']))
    or not page ?& array['eyebrow','headline','intro','hero_media_asset_id']
    or exists(select 1 from jsonb_object_keys(page) k
      where k<>all(array['eyebrow','headline','intro','hero_media_asset_id']))
    or jsonb_typeof(profile->'public_email')<>'string'
    or jsonb_typeof(profile->'public_phone')<>'string'
    or jsonb_typeof(profile->'service_area')<>'string'
    or jsonb_typeof(profile->'hours')<>'string'
    or jsonb_typeof(page->'eyebrow')<>'string'
    or jsonb_typeof(page->'headline')<>'string'
    or jsonb_typeof(page->'intro')<>'string'
    or jsonb_typeof(page->'hero_media_asset_id') not in ('string','null')
    or char_length(profile->>'public_email')>254
    or char_length(profile->>'public_phone')>40
    or char_length(profile->>'service_area')>120
    or char_length(profile->>'hours')>200
    or char_length(page->>'eyebrow')>80
    or char_length(page->>'headline')>80
    or char_length(page->>'intro')>320 then
    raise exception 'INVALID_CONTACT_PAYLOAD' using errcode='22023';
  end if;
  begin
    op:=(p_request->>'operationId')::uuid;
    media_id:=(page->>'hero_media_asset_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'INVALID_CONTACT_PAYLOAD' using errcode='22023';
  end;
  if op is null then raise exception 'INVALID_CONTACT_PAYLOAD' using errcode='22023'; end if;
  request_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select r.request_hash,r.response into saved_hash,receipt
    from onzio_private.contact_editor_receipts r
    where r.club_id=p_club_id and r.actor_id=auth.uid() and r.operation_id=op;
  if found then
    if saved_hash<>request_hash then raise exception 'OPERATION_REUSED' using errcode='22023'; end if;
    return receipt;
  end if;
  current_page:=onzio_private.contact_editor_snapshot(p_club_id);
  if (current_page->>'revision') is distinct from (p_request->>'expectedRevision') then
    raise exception 'CONTACT_CHANGED' using errcode='PT409';
  end if;
  if media_id is not null and not exists(
    select 1 from onzio.media_assets m where m.club_id=p_club_id and m.id=media_id
      and m.surface='contact' and m.status='published' and m.deleted_at is null
  ) then raise exception 'INVALID_CONTACT_MEDIA' using errcode='22023'; end if;
  select hero_media_asset_id into old_media_id from onzio.contact_page_content
    where club_id=p_club_id;
  insert into onzio.contact_profile(club_id,public_email,public_phone,service_area,hours)
    values(p_club_id,btrim(profile->>'public_email'),btrim(profile->>'public_phone'),
      btrim(profile->>'service_area'),btrim(profile->>'hours'))
    on conflict(club_id) do update set public_email=excluded.public_email,
      public_phone=excluded.public_phone,service_area=excluded.service_area,hours=excluded.hours;
  insert into onzio.contact_page_content(
    club_id,eyebrow,headline,intro,hero_media_asset_id
  ) values(p_club_id,btrim(page->>'eyebrow'),btrim(page->>'headline'),
    btrim(page->>'intro'),media_id)
    on conflict(club_id) do update set eyebrow=excluded.eyebrow,
      headline=excluded.headline,intro=excluded.intro,
      hero_media_asset_id=excluded.hero_media_asset_id;
  result:=onzio_private.contact_editor_snapshot(p_club_id)||jsonb_build_object(
    'operationId',op,'retiredMediaAssetIds',case
      when old_media_id is not null and old_media_id is distinct from media_id
      then jsonb_build_array(old_media_id) else '[]'::jsonb end);
  insert into onzio_private.contact_editor_receipts(
    club_id,actor_id,operation_id,request_hash,response
  ) values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $$;
revoke all on function onzio.save_contact_editor(uuid,jsonb) from public,anon;
grant execute on function onzio.save_contact_editor(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
