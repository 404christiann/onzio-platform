-- The detail page's row and gallery are one RLS-enforced transaction. Existing
-- table writers use the same lock, so a snapshot cannot race a legacy save.
create table onzio_private.program_page_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id,actor_id,operation_id)
);
create table onzio_private.program_directory_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id,actor_id,operation_id)
);
alter table onzio_private.program_page_receipts enable row level security;
alter table onzio_private.program_directory_receipts enable row level security;
grant select,insert on onzio_private.program_page_receipts to authenticated;
grant select,insert on onzio_private.program_directory_receipts to authenticated;
create policy program_page_receipt_read on onzio_private.program_page_receipts for select to authenticated
  using (actor_id=auth.uid() and onzio_private.can_mutate_content(club_id));
create policy program_page_receipt_insert on onzio_private.program_page_receipts for insert to authenticated
  with check (actor_id=auth.uid() and onzio_private.can_mutate_content(club_id));
create policy program_directory_receipt_read on onzio_private.program_directory_receipts for select to authenticated
  using (actor_id=auth.uid() and onzio_private.can_mutate_content(club_id));
create policy program_directory_receipt_insert on onzio_private.program_directory_receipts for insert to authenticated
  with check (actor_id=auth.uid() and onzio_private.can_mutate_content(club_id));

create function onzio_private.serialize_program_page_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(734901284);
  return null;
end $$;
revoke all on function onzio_private.serialize_program_page_write() from public,anon;
grant execute on function onzio_private.serialize_program_page_write() to authenticated,service_role;
create trigger serialize_program_page_row before insert or update or delete on onzio.programs
  for each statement execute function onzio_private.serialize_program_page_write();
create trigger serialize_program_page_media before insert or update or delete on onzio.program_media
  for each statement execute function onzio_private.serialize_program_page_write();

-- The legacy set_updated_at trigger uses now(), which is fixed for the whole
-- transaction. Give every Programs write a strictly newer baseline even when
-- an admin saves twice within one transaction or two writes share a clock tick.
create function onzio_private.advance_program_page_updated_at() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.updated_at := greatest(pg_catalog.clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;
revoke all on function onzio_private.advance_program_page_updated_at() from public,anon;
grant execute on function onzio_private.advance_program_page_updated_at() to authenticated,service_role;
create trigger zz_advance_program_updated_at before update on onzio.programs
  for each row execute function onzio_private.advance_program_page_updated_at();
create trigger zz_advance_program_media_updated_at before update on onzio.program_media
  for each row execute function onzio_private.advance_program_page_updated_at();

create function onzio_private.check_program_page_object(v jsonb, keys text[], required text[] default '{}') returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(v) k where not k=any(keys))
    or not v ?& required then
    raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023';
  end if;
end $$;
revoke all on function onzio_private.check_program_page_object(jsonb,text[],text[]) from public,anon;
grant execute on function onzio_private.check_program_page_object(jsonb,text[],text[]) to authenticated;

create function onzio_private.program_page_snapshot(p_club_id uuid,p_program_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'program', (select to_jsonb(p)-'club_id' from onzio.programs p where p.club_id=p_club_id and p.id=p_program_id),
    'gallery',coalesce((select jsonb_agg(to_jsonb(m)-'club_id' order by m.sort_order,m.id)
      from onzio.program_media m where m.club_id=p_club_id and m.program_id=p_program_id),'[]'::jsonb)
  );
$$;
revoke all on function onzio_private.program_page_snapshot(uuid,uuid) from public,anon;
grant execute on function onzio_private.program_page_snapshot(uuid,uuid) to authenticated;

create function onzio.load_program_page(p_club_id uuid,p_program_id uuid default null,p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901284);
  if not onzio_private.is_club_session_fresh() or not onzio_private.is_club_member(p_club_id)
    or not exists(select 1 from onzio.clubs where id=p_club_id and lifecycle in ('active','onboarding')) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  if (onzio_private.homepage_design(p_club_id)->>'templateKey') is distinct from 'academy@1' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  result:=onzio_private.program_page_snapshot(p_club_id,p_program_id);
  if p_operation_id is not null then
    if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
    select response into receipt from onzio_private.program_page_receipts
      where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
    result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);
  end if;
  return result;
end $$;
revoke all on function onzio.load_program_page(uuid,uuid,uuid) from public,anon;
grant execute on function onzio.load_program_page(uuid,uuid,uuid) to authenticated;

create function onzio.save_program_page(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  op uuid; v_program_id uuid; previous onzio.programs; row_value onzio.programs;
  saved_hash text; request_hash text; receipt jsonb; result jsonb;
  expected jsonb; payload jsonb; gallery jsonb; item jsonb; old_item onzio.program_media;
  gallery_id uuid; asset_id uuid; stored_url text; kept_ids uuid[]:='{}'; seen_assets uuid[]:='{}'; i integer:=0;
  current_count integer; old_assets uuid[]; new_assets uuid[]; retired_assets uuid[]:='{}';
  seen_expected uuid[]:='{}';
begin
  perform pg_catalog.pg_advisory_xact_lock(734901284);
  if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if (onzio_private.homepage_design(p_club_id)->>'templateKey') is distinct from 'academy@1' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  perform onzio_private.check_program_page_object(p_request,array['operationId','programId','expected','program','gallery'],array['operationId','programId','expected','program','gallery']);
  perform onzio_private.check_program_page_object(p_request->'expected',array['programUpdatedAt','gallery'],array['programUpdatedAt','gallery']);
  payload:=p_request->'program'; gallery:=p_request->'gallery'; expected:=p_request->'expected';
  perform onzio_private.check_program_page_object(payload,array['slug','nav_label','display_title','kicker','summary','body','highlights','layout_variant','hero_media_asset_id','detail_media_asset_id','external_cta_label','external_cta_href','registration_form_id','registration_enabled','registration_eyebrow','registration_headline','registration_body','registration_pending_body','registration_pending_label','status','sort_order'],array['slug','nav_label','display_title','kicker','summary','body','highlights','layout_variant','hero_media_asset_id','detail_media_asset_id','external_cta_label','external_cta_href','registration_form_id','registration_enabled','registration_eyebrow','registration_headline','registration_body','registration_pending_body','registration_pending_label','status','sort_order']);
  if jsonb_typeof(gallery) is distinct from 'array' or jsonb_array_length(gallery)>12
    or jsonb_typeof(expected->'gallery') is distinct from 'array'
    or jsonb_typeof(p_request->'operationId')<>'string' then
    raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023';
  end if;
  begin
    op:=(p_request->>'operationId')::uuid;
    v_program_id:=(p_request->>'programId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end;
  if op is null then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end if;
  request_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select r.request_hash,r.response into saved_hash,receipt from onzio_private.program_page_receipts r
    where r.club_id=p_club_id and r.actor_id=auth.uid() and r.operation_id=op;
  if found then
    if saved_hash<>request_hash then raise exception 'OPERATION_REUSED' using errcode='PT409'; end if;
    return receipt;
  end if;
  if v_program_id is null then
    if expected->'programUpdatedAt'<>'null'::jsonb or expected->'gallery'<>'[]'::jsonb then
      raise exception 'CONTENT_CHANGED' using errcode='PT409';
    end if;
  else
    select * into previous from onzio.programs where club_id=p_club_id and id=v_program_id for update;
    if not found or jsonb_typeof(expected->'programUpdatedAt')<>'string'
      or previous.updated_at is distinct from (expected->>'programUpdatedAt')::timestamptz then
      raise exception 'CONTENT_CHANGED' using errcode='PT409';
    end if;
    perform 1 from onzio.program_media where club_id=p_club_id and program_id=v_program_id for update;
    select count(*) into current_count from onzio.program_media where club_id=p_club_id and program_id=v_program_id;
    if current_count<>jsonb_array_length(expected->'gallery') then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
    for item in select * from jsonb_array_elements(expected->'gallery') loop
      perform onzio_private.check_program_page_object(item,array['id','updatedAt'],array['id','updatedAt']);
      if (item->>'id')::uuid=any(seen_expected) then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
      if not exists(select 1 from onzio.program_media m where m.club_id=p_club_id and m.program_id=v_program_id
        and m.id=(item->>'id')::uuid and m.updated_at=(item->>'updatedAt')::timestamptz) then
        raise exception 'CONTENT_CHANGED' using errcode='PT409';
      end if;
      seen_expected:=array_append(seen_expected,(item->>'id')::uuid);
    end loop;
  end if;
  -- Explicit columns exclude client-controlled tenant identity and metadata.
  begin row_value:=jsonb_populate_record(null::onzio.programs,payload);
  exception when others then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end;
  if row_value.slug is null or row_value.display_title is null or row_value.status not in ('active','hidden')
    or row_value.layout_variant not in ('statement_band','detail_focus')
    or jsonb_typeof(payload->'highlights')<>'array' or jsonb_array_length(payload->'highlights')>200
    or exists(select 1 from jsonb_array_elements(payload->'highlights') v where jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>320)
    or (row_value.external_cta_href not in ('','/') and row_value.external_cta_href!~*'^(https?://[^[:space:]]+|mailto:[^[:space:]]+|/[^/].*)$') then
    raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023';
  end if;
  -- Existing public URLs stay stable; order and visibility belong to Manage.
  if v_program_id is not null and (row_value.slug is distinct from previous.slug
    or row_value.status is distinct from previous.status
    or row_value.sort_order is distinct from previous.sort_order) then
    raise exception 'FIELD_UNAVAILABLE' using errcode='22023';
  end if;
  if row_value.hero_media_asset_id is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=row_value.hero_media_asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='programs') then
    raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023';
  end if;
  if row_value.detail_media_asset_id is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=row_value.detail_media_asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='programs') then
    raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023';
  end if;
  if v_program_id is null then
    insert into onzio.programs(club_id,slug,nav_label,display_title,kicker,summary,body,highlights,layout_variant,hero_media_asset_id,detail_media_asset_id,external_cta_label,external_cta_href,registration_form_id,registration_enabled,registration_eyebrow,registration_headline,registration_body,registration_pending_body,registration_pending_label,status,sort_order)
      values(p_club_id,row_value.slug,row_value.nav_label,row_value.display_title,row_value.kicker,row_value.summary,row_value.body,row_value.highlights,row_value.layout_variant,row_value.hero_media_asset_id,row_value.detail_media_asset_id,row_value.external_cta_label,row_value.external_cta_href,row_value.registration_form_id,row_value.registration_enabled,row_value.registration_eyebrow,row_value.registration_headline,row_value.registration_body,row_value.registration_pending_body,row_value.registration_pending_label,row_value.status,row_value.sort_order)
      returning id into v_program_id;
  else
    update onzio.programs set slug=row_value.slug,nav_label=row_value.nav_label,display_title=row_value.display_title,kicker=row_value.kicker,summary=row_value.summary,body=row_value.body,highlights=row_value.highlights,layout_variant=row_value.layout_variant,hero_media_asset_id=row_value.hero_media_asset_id,detail_media_asset_id=row_value.detail_media_asset_id,external_cta_label=row_value.external_cta_label,external_cta_href=row_value.external_cta_href,registration_form_id=row_value.registration_form_id,registration_enabled=row_value.registration_enabled,registration_eyebrow=row_value.registration_eyebrow,registration_headline=row_value.registration_headline,registration_body=row_value.registration_body,registration_pending_body=row_value.registration_pending_body,registration_pending_label=row_value.registration_pending_label,status=row_value.status,sort_order=row_value.sort_order
      where club_id=p_club_id and id=v_program_id;
  end if;
  select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into old_assets from onzio.program_media where club_id=p_club_id and program_id=v_program_id;
  old_assets:=old_assets||array_remove(array[previous.hero_media_asset_id,previous.detail_media_asset_id],null);
  for item in select * from jsonb_array_elements(gallery) loop
    perform onzio_private.check_program_page_object(item,array['id','mediaAssetId','alt','sortOrder'],array['id','mediaAssetId','alt','sortOrder']);
    if jsonb_typeof(item->'sortOrder')<>'number' or (item->>'sortOrder')::numeric<>i or jsonb_typeof(item->'alt')<>'string' or char_length(item->>'alt')>200 then
      raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023';
    end if;
    begin gallery_id:=(item->>'id')::uuid; asset_id:=(item->>'mediaAssetId')::uuid;
    exception when invalid_text_representation then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end;
    if gallery_id=any(kept_ids) or (asset_id is not null and asset_id=any(seen_assets)) then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
    if gallery_id is not null then
      select * into old_item from onzio.program_media where club_id=p_club_id and program_id=v_program_id and id=gallery_id;
      if not found then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
      if asset_id is null and old_item.media_asset_id is not null then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
    elsif asset_id is null then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
    if asset_id is not null then
      select '/'||storage_path into stored_url from onzio.media_assets where club_id=p_club_id and id=asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='programs';
      if not found then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
    else stored_url:=old_item.url; end if;
    gallery_id:=coalesce(gallery_id,gen_random_uuid());
    insert into onzio.program_media(id,club_id,program_id,url,media_asset_id,alt,sort_order)
      values(gallery_id,p_club_id,v_program_id,stored_url,asset_id,item->>'alt',i)
      on conflict(id) do update set url=excluded.url,media_asset_id=excluded.media_asset_id,alt=excluded.alt,sort_order=excluded.sort_order;
    kept_ids:=array_append(kept_ids,gallery_id); seen_assets:=array_append(seen_assets,asset_id); i:=i+1;
  end loop;
  delete from onzio.program_media where club_id=p_club_id and program_id=v_program_id and not(id=any(kept_ids));
  select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into new_assets from onzio.program_media where club_id=p_club_id and program_id=v_program_id;
  new_assets:=new_assets||array_remove(array[row_value.hero_media_asset_id,row_value.detail_media_asset_id],null);
  select coalesce(array_agg(x),'{}') into retired_assets from unnest(old_assets) x where not(x=any(new_assets));
  result:=onzio_private.program_page_snapshot(p_club_id,v_program_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired_assets));
  insert into onzio_private.program_page_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $$;
revoke all on function onzio.save_program_page(uuid,jsonb) from public,anon;
grant execute on function onzio.save_program_page(uuid,jsonb) to authenticated;

create function onzio_private.program_directory_snapshot(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('programs',coalesce((select jsonb_agg(to_jsonb(p)-'club_id' order by p.sort_order,p.id)
    from onzio.programs p where p.club_id=p_club_id),'[]'::jsonb));
$$;
revoke all on function onzio_private.program_directory_snapshot(uuid) from public,anon;
grant execute on function onzio_private.program_directory_snapshot(uuid) to authenticated;

create function onzio.load_program_directory(p_club_id uuid,p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901284);
  if not onzio_private.is_club_session_fresh() or not onzio_private.is_club_member(p_club_id)
    or not exists(select 1 from onzio.clubs where id=p_club_id and lifecycle in ('active','onboarding')) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  if (onzio_private.homepage_design(p_club_id)->>'templateKey') is distinct from 'academy@1' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  result:=onzio_private.program_directory_snapshot(p_club_id);
  if p_operation_id is not null then
    if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
    select response into receipt from onzio_private.program_directory_receipts
      where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
    result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);
  end if;
  return result;
end $$;
revoke all on function onzio.load_program_directory(uuid,uuid) from public,anon;
grant execute on function onzio.load_program_directory(uuid,uuid) to authenticated;

create function onzio.save_program_directory(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  op uuid; saved_hash text; request_hash text; receipt jsonb; result jsonb;
  expected jsonb; desired jsonb; item jsonb; v_id uuid; ids uuid[]:='{}'; expected_ids uuid[]:='{}'; i integer:=0; current_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901284);
  if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if (onzio_private.homepage_design(p_club_id)->>'templateKey') is distinct from 'academy@1' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  perform onzio_private.check_program_page_object(p_request,array['operationId','expected','programs'],array['operationId','expected','programs']);
  expected:=p_request->'expected'; desired:=p_request->'programs';
  if jsonb_typeof(expected) is distinct from 'array' or jsonb_typeof(desired) is distinct from 'array'
    or jsonb_array_length(expected)>200 or jsonb_array_length(desired)<>jsonb_array_length(expected)
    or jsonb_typeof(p_request->'operationId')<>'string' then
    raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023';
  end if;
  begin op:=(p_request->>'operationId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end;
  if op is null then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end if;
  request_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select r.request_hash,r.response into saved_hash,receipt from onzio_private.program_directory_receipts r
    where r.club_id=p_club_id and r.actor_id=auth.uid() and r.operation_id=op;
  if found then
    if saved_hash<>request_hash then raise exception 'OPERATION_REUSED' using errcode='PT409'; end if;
    return receipt;
  end if;
  perform 1 from onzio.programs where club_id=p_club_id for update;
  select count(*) into current_count from onzio.programs where club_id=p_club_id;
  if current_count<>jsonb_array_length(expected) then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
  for item in select * from jsonb_array_elements(expected) loop
    perform onzio_private.check_program_page_object(item,array['id','updatedAt'],array['id','updatedAt']);
    begin v_id:=(item->>'id')::uuid;
    exception when invalid_text_representation then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end;
    if v_id is null or v_id=any(expected_ids) then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end if;
    if not exists(select 1 from onzio.programs p where p.club_id=p_club_id and p.id=v_id and p.updated_at=(item->>'updatedAt')::timestamptz) then
      raise exception 'CONTENT_CHANGED' using errcode='PT409';
    end if;
    expected_ids:=array_append(expected_ids,v_id);
  end loop;
  for item in select * from jsonb_array_elements(desired) loop
    perform onzio_private.check_program_page_object(item,array['id','sortOrder','status'],array['id','sortOrder','status']);
    begin v_id:=(item->>'id')::uuid;
    exception when invalid_text_representation then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end;
    if v_id is null or v_id=any(ids) or not(v_id=any(expected_ids)) or jsonb_typeof(item->'sortOrder')<>'number'
      or (item->>'sortOrder')::numeric<>i or item->>'status' not in ('active','hidden') then
      raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023';
    end if;
    ids:=array_append(ids,v_id); i:=i+1;
  end loop;
  if pg_catalog.array_length(ids,1) is distinct from pg_catalog.array_length(expected_ids,1) then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(desired) loop
    update onzio.programs set sort_order=(item->>'sortOrder')::integer,status=item->>'status'
      where club_id=p_club_id and id=(item->>'id')::uuid;
  end loop;
  result:=onzio_private.program_directory_snapshot(p_club_id)||jsonb_build_object('operationId',op);
  insert into onzio_private.program_directory_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $$;
revoke all on function onzio.save_program_directory(uuid,jsonb) from public,anon;
grant execute on function onzio.save_program_directory(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
