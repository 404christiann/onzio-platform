create function onzio_private.validate_shop_section(p_section jsonb) returns void
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
    elsif jsonb_typeof(value)<>'string' or char_length(value#>>'{}') > (case key when 'description' then 3000 when 'cta_link' then 2048 when 'store_note' then 180 when 'title' then 240 else 160 end) then
      raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
    end if;
  end loop;
  if (p_section->>'cta_link')<>'' and (p_section->>'cta_link')!~*'^https?://[^[:space:]]+$'
    and (p_section->>'cta_link')!~'^/[-A-Za-z0-9_/?#=&%.]*$' then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
end $$;
revoke all on function onzio_private.validate_shop_section(jsonb) from public,anon;
grant execute on function onzio_private.validate_shop_section(jsonb) to authenticated;

create or replace function onzio.load_shop_page(p_club_id uuid,p_surface text,p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901283);
  if p_surface is null or p_surface not in ('home','shop') or not onzio_private.is_club_session_fresh() or not onzio_private.is_club_member(p_club_id)
    or not exists(select 1 from onzio.clubs where id=p_club_id and lifecycle in ('active','onboarding')) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  if p_operation_id is not null then
    if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
    select response into receipt from onzio_private.shop_page_receipts where club_id=p_club_id and actor_id=auth.uid() and surface=p_surface and operation_id=p_operation_id;
  end if;
  result:=onzio_private.shop_page_snapshot(p_club_id,p_surface);
  if p_operation_id is not null then
    result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);
  end if;
  return result;
end $$;
revoke all on function onzio.load_shop_page(uuid,text,uuid) from public,anon;
grant execute on function onzio.load_shop_page(uuid,text,uuid) to authenticated;

create or replace function onzio.save_shop_page(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  page_surface text; op uuid; hash text; saved_hash text; receipt jsonb; initial jsonb; result jsonb;
  variants jsonb; photo_rows jsonb; purchase jsonb; variant text; product jsonb; section jsonb; photos jsonb; item jsonb;
  retired uuid[]:='{}'; removed uuid[]; key text; value jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901283);
  if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  perform onzio_private.check_shop_object(p_request,array['operationId','surface','expectedRevision','designRevision','variants','photoRows','purchase'],
    array['operationId','surface','expectedRevision','designRevision','variants']);
  if jsonb_typeof(p_request->'operationId') is distinct from 'string' or jsonb_typeof(p_request->'surface') is distinct from 'string'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string' or jsonb_typeof(p_request->'designRevision') is distinct from 'string'
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
  initial:=onzio_private.shop_page_snapshot(p_club_id,page_surface);
  if (initial->>'designRevision') is distinct from (p_request->>'designRevision') then raise exception 'DESIGN_CHANGED' using errcode='PT409'; end if;
  if (initial->>'revision') is distinct from (p_request->>'expectedRevision') then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
  variants:=p_request->'variants'; photo_rows:=p_request->'photoRows'; purchase:=p_request->'purchase';
  perform onzio_private.check_shop_object(variants,array['home','third','away']);
  if variants='{}'::jsonb and photo_rows is null and purchase is null then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
  if page_surface='home' and (variants ? 'third' or variants ? 'away') then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
  if page_surface='home' and (photo_rows is not null or purchase is not null) then
    raise exception 'SECTION_UNAVAILABLE' using errcode='22023';
  end if;
  for variant,product in select * from jsonb_each(variants) loop
    perform onzio_private.check_shop_object(product,array['section','photos'],array['section','photos']);
    section:=product->'section'; photos:=product->'photos';
    perform onzio_private.validate_shop_section(section);
    perform onzio_private.validate_shop_photos(p_club_id,page_surface,variant,photos,false);
  end loop;
  if photo_rows is not null then
    perform onzio_private.check_shop_object(photo_rows,array['home','third','away']);
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

drop function onzio_private.validate_shop_section(jsonb,boolean);
notify pgrst,'reload schema';
