-- One transaction per public Shop page, including every changed kit variant.
-- Legacy table writers advance the same page revision before a new editor saves.
create table onzio_private.shop_page_revisions (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  surface text not null check (surface in ('home','shop')),
  revision bigint not null default 0,
  primary key (club_id,surface)
);
create table onzio_private.shop_page_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('home','shop')),
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id,actor_id,operation_id)
);
alter table onzio_private.shop_page_revisions enable row level security;
alter table onzio_private.shop_page_receipts enable row level security;
grant select on onzio_private.shop_page_revisions to authenticated;
grant select,insert on onzio_private.shop_page_receipts to authenticated;
create policy shop_page_revision_read on onzio_private.shop_page_revisions for select to authenticated
  using (onzio_private.is_club_session_fresh() and onzio_private.is_club_member(club_id));
create policy shop_page_receipt_read on onzio_private.shop_page_receipts for select to authenticated
  using (actor_id=auth.uid() and onzio_private.can_mutate_content(club_id));
create policy shop_page_receipt_insert on onzio_private.shop_page_receipts for insert to authenticated
  with check (actor_id=auth.uid() and onzio_private.can_mutate_content(club_id));

create function onzio_private.serialize_shop_page_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(734901283);
  return null;
end $$;
revoke all on function onzio_private.serialize_shop_page_write() from public,anon;
grant execute on function onzio_private.serialize_shop_page_write() to authenticated,service_role;

create function onzio_private.advance_shop_page_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare page text;
begin
  if tg_table_name in ('shop_kit_section','shop_kit_photos') then
    page:=case when tg_op='DELETE' then old.surface else new.surface end;
  else
    page:='shop';
  end if;
  insert into onzio_private.shop_page_revisions(club_id,surface,revision)
    values(case when tg_op='DELETE' then old.club_id else new.club_id end,page,1)
    on conflict(club_id,surface) do update set revision=onzio_private.shop_page_revisions.revision+1;
  if tg_op='UPDATE' and tg_table_name in ('shop_kit_section','shop_kit_photos') then
    if old.surface<>new.surface then
      insert into onzio_private.shop_page_revisions(club_id,surface,revision)
        values(old.club_id,old.surface,1)
        on conflict(club_id,surface) do update set revision=onzio_private.shop_page_revisions.revision+1;
    end if;
  end if;
  return null;
end $$;
revoke all on function onzio_private.advance_shop_page_revision() from public,anon,authenticated,service_role;

do $$ declare t text; begin
  foreach t in array array['shop_kit_section','shop_kit_photos','shop_carousel_photos','shop_purchase_details'] loop
    execute format('create trigger serialize_shop_page_write before insert or update or delete on onzio.%I for each statement execute function onzio_private.serialize_shop_page_write()',t);
    execute format('create trigger advance_shop_page_revision after insert or update or delete on onzio.%I for each row execute function onzio_private.advance_shop_page_revision()',t);
  end loop;
end $$;

create function onzio_private.check_shop_object(v jsonb, keys text[], required text[] default '{}') returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(v) k where not k=any(keys))
    or not v ?& required then
    raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
  end if;
end $$;
revoke all on function onzio_private.check_shop_object(jsonb,text[],text[]) from public,anon;
grant execute on function onzio_private.check_shop_object(jsonb,text[],text[]) to authenticated;

create function onzio_private.shop_page_snapshot(p_club_id uuid,p_surface text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'revision',coalesce((select revision::text from onzio_private.shop_page_revisions where club_id=p_club_id and surface=p_surface),'0'),
    'designRevision',onzio_private.homepage_design(p_club_id)->>'designRevision',
    'templateKey',onzio_private.homepage_design(p_club_id)->>'templateKey',
    'surface',p_surface,
    'sections',coalesce((select jsonb_agg(to_jsonb(s)-'club_id'-'surface'-'updated_at' order by s.kit_variant)
      from onzio.shop_kit_section s where s.club_id=p_club_id and s.surface=p_surface),'[]'::jsonb),
    'photos',coalesce((select jsonb_agg(jsonb_build_object('rowId',p.id,'assetId',p.media_asset_id,'url',p.url,'order',p.sort_order,'kit_variant',p.kit_variant) order by p.kit_variant,p.sort_order,p.id)
      from onzio.shop_kit_photos p where p.club_id=p_club_id and p.surface=p_surface),'[]'::jsonb),
    'photoRows',case when p_surface='shop' then coalesce((select jsonb_agg(jsonb_build_object('rowId',p.id,'assetId',p.media_asset_id,'url',p.url,'order',p.sort_order,'kit_variant',p.kit_variant) order by p.kit_variant,p.sort_order,p.id)
      from onzio.shop_carousel_photos p where p.club_id=p_club_id),'[]'::jsonb) else '[]'::jsonb end,
    'purchase',case when p_surface='shop' then (select to_jsonb(d)-'club_id'-'updated_at' from onzio.shop_purchase_details d where d.club_id=p_club_id) else null end,
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'storage_bucket',m.storage_bucket,'storage_path',m.storage_path))
      from onzio.media_assets m where m.club_id=p_club_id and m.status='published' and m.deleted_at is null and m.storage_bucket='onzio-media' and (
        exists(select 1 from onzio.shop_kit_photos p where p.club_id=p_club_id and p.surface=p_surface and p.media_asset_id=m.id)
        or (p_surface='shop' and exists(select 1 from onzio.shop_carousel_photos p where p.club_id=p_club_id and p.media_asset_id=m.id))
      )),'[]'::jsonb)
  );
$$;
revoke all on function onzio_private.shop_page_snapshot(uuid,text) from public,anon;
grant execute on function onzio_private.shop_page_snapshot(uuid,text) to authenticated;

create function onzio.load_shop_page(p_club_id uuid,p_surface text,p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901283);
  if p_surface not in ('home','shop') or not onzio_private.is_club_session_fresh() or not onzio_private.is_club_member(p_club_id)
    or not exists(select 1 from onzio.clubs where id=p_club_id and lifecycle in ('active','onboarding')) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  if onzio_private.homepage_design(p_club_id)->>'templateKey'='editorial@1'
    and not coalesce((select store_enabled from onzio.clubs where id=p_club_id),false) then
    raise exception 'PAGE_UNAVAILABLE' using errcode='22023';
  end if;
  result:=onzio_private.shop_page_snapshot(p_club_id,p_surface);
  if p_operation_id is not null then
    if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
    select response into receipt from onzio_private.shop_page_receipts where club_id=p_club_id and actor_id=auth.uid() and surface=p_surface and operation_id=p_operation_id;
    result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);
  end if;
  return result;
end $$;
revoke all on function onzio.load_shop_page(uuid,text,uuid) from public,anon;
grant execute on function onzio.load_shop_page(uuid,text,uuid) to authenticated;

create function onzio_private.validate_shop_photos(p_club_id uuid,p_surface text,p_variant text,p_photos jsonb,p_strip boolean default false) returns void
language plpgsql stable security invoker set search_path='' as $$
declare item jsonb; i integer:=0; row_id uuid; asset_id uuid; old_asset uuid; seen_ids uuid[]:='{}'; seen_assets uuid[]:='{}';
begin
  if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos)>6
    or (not p_strip and jsonb_array_length(p_photos)=0) then raise exception 'INVALID_SHOP_PHOTO' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(p_photos) loop
    perform onzio_private.check_shop_object(item,array['rowId','assetId','order'],array['rowId','assetId','order']);
    if jsonb_typeof(item->'order')<>'number' or (item->>'order')::numeric<>i then raise exception 'INVALID_SHOP_PHOTO' using errcode='22023'; end if;
    begin row_id:=(item->>'rowId')::uuid; asset_id:=(item->>'assetId')::uuid;
    exception when invalid_text_representation then raise exception 'INVALID_SHOP_PHOTO' using errcode='22023'; end;
    if (row_id is null and asset_id is null) or row_id=any(seen_ids) or (asset_id is not null and asset_id=any(seen_assets)) then
      raise exception 'INVALID_SHOP_PHOTO' using errcode='22023';
    end if;
    if row_id is not null then
      if p_strip then
        select media_asset_id into old_asset from onzio.shop_carousel_photos where club_id=p_club_id and kit_variant=p_variant and id=row_id;
      else
        select media_asset_id into old_asset from onzio.shop_kit_photos where club_id=p_club_id and surface=p_surface and kit_variant=p_variant and id=row_id;
      end if;
      if not found or (old_asset is not null and asset_id is distinct from old_asset) then raise exception 'INVALID_SHOP_PHOTO' using errcode='22023'; end if;
    end if;
    if asset_id is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='shop') then
      raise exception 'INVALID_SHOP_PHOTO' using errcode='22023';
    end if;
    seen_ids:=array_append(seen_ids,row_id); seen_assets:=array_append(seen_assets,asset_id); i:=i+1;
  end loop;
end $$;
revoke all on function onzio_private.validate_shop_photos(uuid,text,text,jsonb,boolean) from public,anon;
grant execute on function onzio_private.validate_shop_photos(uuid,text,text,jsonb,boolean) to authenticated;

create function onzio_private.validate_shop_section(p_section jsonb,p_editorial boolean) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare key text; value jsonb; bullet jsonb;
begin
  perform onzio_private.check_shop_object(p_section,array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link'],
    array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link']);
  for key,value in select * from jsonb_each(p_section) loop
    if key='bullet_points' then
      if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>8 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      for bullet in select * from jsonb_array_elements(value) loop
        if jsonb_typeof(bullet)<>'string' or char_length(bullet#>>'{}')>80 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      end loop;
      if not p_editorial and jsonb_array_length(value)=0 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
    elsif jsonb_typeof(value)<>'string' or char_length(value#>>'{}') > (case key when 'description' then 3000 when 'cta_link' then 2048 when 'store_note' then 180 when 'title' then 240 else 160 end) then
      raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
    end if;
  end loop;
  if (p_section->>'cta_link')<>'' and (p_section->>'cta_link')!~*'^https?://[^[:space:]]+$'
    and (p_section->>'cta_link')!~'^/[-A-Za-z0-9_/?#=&%.]*$' then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
end $$;
revoke all on function onzio_private.validate_shop_section(jsonb,boolean) from public,anon;
grant execute on function onzio_private.validate_shop_section(jsonb,boolean) to authenticated;

create function onzio_private.replace_shop_photos(p_club_id uuid,p_surface text,p_variant text,p_photos jsonb,p_strip boolean default false) returns uuid[]
language plpgsql security invoker set search_path='' as $$
declare item jsonb; row_id uuid; asset_id uuid; photo_url text; i integer:=0; kept uuid[]:='{}'; old_assets uuid[]; new_assets uuid[]; retired uuid[];
begin
  perform onzio_private.validate_shop_photos(p_club_id,p_surface,p_variant,p_photos,p_strip);
  if p_strip then
    select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into old_assets
      from onzio.shop_carousel_photos where club_id=p_club_id and kit_variant=p_variant;
  else
    select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into old_assets
      from onzio.shop_kit_photos where club_id=p_club_id and surface=p_surface and kit_variant=p_variant;
  end if;
  for item in select * from jsonb_array_elements(p_photos) loop
    row_id:=coalesce((item->>'rowId')::uuid,gen_random_uuid()); asset_id:=(item->>'assetId')::uuid;
    if asset_id is not null then
      select storage_path into photo_url from onzio.media_assets where club_id=p_club_id and id=asset_id;
    elsif p_strip then
      select url into photo_url from onzio.shop_carousel_photos where club_id=p_club_id and id=row_id;
    else
      select url into photo_url from onzio.shop_kit_photos where club_id=p_club_id and id=row_id;
    end if;
    if p_strip then
      insert into onzio.shop_carousel_photos(id,club_id,kit_variant,url,media_asset_id,sort_order)
        values(row_id,p_club_id,p_variant,photo_url,asset_id,i)
        on conflict(id) do update set url=excluded.url,media_asset_id=excluded.media_asset_id,sort_order=excluded.sort_order;
    else
      insert into onzio.shop_kit_photos(id,club_id,surface,kit_variant,url,media_asset_id,sort_order)
        values(row_id,p_club_id,p_surface,p_variant,photo_url,asset_id,i)
        on conflict(id) do update set url=excluded.url,media_asset_id=excluded.media_asset_id,sort_order=excluded.sort_order;
    end if;
    kept:=array_append(kept,row_id); i:=i+1;
  end loop;
  if p_strip then
    delete from onzio.shop_carousel_photos where club_id=p_club_id and kit_variant=p_variant and not(id=any(kept));
    select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into new_assets
      from onzio.shop_carousel_photos where club_id=p_club_id and kit_variant=p_variant;
  else
    delete from onzio.shop_kit_photos where club_id=p_club_id and surface=p_surface and kit_variant=p_variant and not(id=any(kept));
    select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into new_assets
      from onzio.shop_kit_photos where club_id=p_club_id and surface=p_surface and kit_variant=p_variant;
  end if;
  select coalesce(array_agg(x),'{}') into retired from unnest(old_assets) x where not(x=any(new_assets));
  return retired;
end $$;
revoke all on function onzio_private.replace_shop_photos(uuid,text,text,jsonb,boolean) from public,anon;
grant execute on function onzio_private.replace_shop_photos(uuid,text,text,jsonb,boolean) to authenticated;

create function onzio.save_shop_page(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  page_surface text; op uuid; hash text; saved_hash text; receipt jsonb; initial jsonb; result jsonb; template text;
  variants jsonb; photo_rows jsonb; purchase jsonb; variant text; product jsonb; section jsonb; photos jsonb; item jsonb;
  retired uuid[]:='{}'; removed uuid[]; key text; value jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901283);
  if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if onzio_private.homepage_design(p_club_id)->>'templateKey'='editorial@1'
    and not coalesce((select store_enabled from onzio.clubs where id=p_club_id),false) then
    raise exception 'PAGE_UNAVAILABLE' using errcode='22023';
  end if;
  perform onzio_private.check_shop_object(p_request,array['operationId','surface','expectedRevision','designRevision','variants','photoRows','purchase'],
    array['operationId','surface','expectedRevision','designRevision','variants']);
  if jsonb_typeof(p_request->'operationId')<>'string' or jsonb_typeof(p_request->'surface')<>'string'
    or jsonb_typeof(p_request->'expectedRevision')<>'string' or jsonb_typeof(p_request->'designRevision')<>'string'
    or (p_request->>'expectedRevision')!~'^[0-9]+$' or length(p_request->>'designRevision') not between 1 and 200 then
    raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
  end if;
  begin op:=(p_request->>'operationId')::uuid; exception when invalid_text_representation then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end;
  page_surface:=p_request->>'surface';
  if page_surface not in ('home','shop') then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
  hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select r.request_hash,r.response into saved_hash,receipt from onzio_private.shop_page_receipts r
    where club_id=p_club_id and actor_id=auth.uid() and operation_id=op;
  if found then
    if saved_hash<>hash then raise exception 'OPERATION_REUSED' using errcode='PT409'; end if;
    return receipt;
  end if;
  initial:=onzio_private.shop_page_snapshot(p_club_id,page_surface); template:=initial->>'templateKey';
  if initial->>'designRevision'<>p_request->>'designRevision' then raise exception 'DESIGN_CHANGED' using errcode='PT409'; end if;
  if initial->>'revision'<>p_request->>'expectedRevision' then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
  if page_surface='home' and template in ('clubhouse@1','editorial@1') then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  variants:=p_request->'variants'; photo_rows:=p_request->'photoRows'; purchase:=p_request->'purchase';
  perform onzio_private.check_shop_object(variants,array['home','third','away']);
  if variants='{}'::jsonb and photo_rows is null and purchase is null then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
  if (page_surface='home' or template='academy@1') and (variants ? 'third' or variants ? 'away') then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
  if coalesce(template,'') not in ('clubhouse@1','editorial@1') and variants ? 'third' then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
  if (page_surface='home' or template in ('academy@1','clubhouse@1','editorial@1')) and (photo_rows is not null or purchase is not null) then
    raise exception 'SECTION_UNAVAILABLE' using errcode='22023';
  end if;
  for variant,product in select * from jsonb_each(variants) loop
    perform onzio_private.check_shop_object(product,array['section','photos'],array['section','photos']);
    section:=product->'section'; photos:=product->'photos';
    perform onzio_private.validate_shop_section(section,template in ('editorial@1','clubhouse@1'));
    perform onzio_private.validate_shop_photos(p_club_id,page_surface,variant,photos,false);
  end loop;
  if photo_rows is not null then
    perform onzio_private.check_shop_object(photo_rows,array['home','third','away']);
    if photo_rows ? 'third' then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
    for variant,photos in select * from jsonb_each(photo_rows) loop
      perform onzio_private.validate_shop_photos(p_club_id,page_surface,variant,photos,true);
    end loop;
  end if;
  if purchase is not null then
    perform onzio_private.check_shop_object(purchase,array['heading','cards','cta_eyebrow','cta_text','cta_label','cta_link'],
      array['heading','cards','cta_eyebrow','cta_text','cta_label','cta_link']);
    for key,value in select * from jsonb_each(purchase) loop
      if key='cards' then
        if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>4 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
        for item in select * from jsonb_array_elements(value) loop
          perform onzio_private.check_shop_object(item,array['label','title','body'],array['label','title','body']);
          if jsonb_typeof(item->'label')<>'string' or length(item->>'label')>100
            or jsonb_typeof(item->'title')<>'string' or length(item->>'title')>160
            or jsonb_typeof(item->'body')<>'string' or length(item->>'body')>600 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
        end loop;
      elsif jsonb_typeof(value)<>'string' or length(value#>>'{}') > (case key when 'cta_link' then 2048 when 'cta_text' then 600 else 160 end) then
        raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
      end if;
    end loop;
    if (purchase->>'cta_link')<>'' and (purchase->>'cta_link')!~*'^https?://[^[:space:]]+$' then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
  end if;

  -- No application-level partial writes: any later failure rolls back every
  -- kit, photo row, purchase card, audit trigger, revision and receipt.
  for variant,product in select * from jsonb_each(variants) loop
    section:=product->'section';
    insert into onzio.shop_kit_section(club_id,surface,kit_variant,eyebrow,title,description,bullet_points,store_note,cta_label,cta_link)
      values(p_club_id,page_surface,variant,section->>'eyebrow',section->>'title',section->>'description',section->'bullet_points',section->>'store_note',section->>'cta_label',section->>'cta_link')
      on conflict(club_id,surface,kit_variant) do update set eyebrow=excluded.eyebrow,title=excluded.title,description=excluded.description,
        bullet_points=excluded.bullet_points,store_note=excluded.store_note,cta_label=excluded.cta_label,cta_link=excluded.cta_link,updated_at=now();
    removed:=onzio_private.replace_shop_photos(p_club_id,page_surface,variant,product->'photos',false);
    retired:=retired||removed;
  end loop;
  if photo_rows is not null then
    for variant,photos in select * from jsonb_each(photo_rows) loop
      removed:=onzio_private.replace_shop_photos(p_club_id,page_surface,variant,photos,true);
      retired:=retired||removed;
    end loop;
  end if;
  if purchase is not null then
    insert into onzio.shop_purchase_details(club_id,heading,cards,cta_eyebrow,cta_text,cta_label,cta_link)
      values(p_club_id,purchase->>'heading',purchase->'cards',purchase->>'cta_eyebrow',purchase->>'cta_text',purchase->>'cta_label',purchase->>'cta_link')
      on conflict(club_id) do update set heading=excluded.heading,cards=excluded.cards,cta_eyebrow=excluded.cta_eyebrow,
        cta_text=excluded.cta_text,cta_label=excluded.cta_label,cta_link=excluded.cta_link,updated_at=now();
  end if;
  result:=onzio_private.shop_page_snapshot(p_club_id,page_surface)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired));
  insert into onzio_private.shop_page_receipts(club_id,actor_id,surface,operation_id,request_hash,response)
    values(p_club_id,auth.uid(),page_surface,op,hash,result);
  return result;
end $$;
revoke all on function onzio.save_shop_page(uuid,jsonb) from public,anon;
grant execute on function onzio.save_shop_page(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
