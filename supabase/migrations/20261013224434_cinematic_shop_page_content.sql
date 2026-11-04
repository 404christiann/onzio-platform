-- Shop-only presentation content joins the existing atomic page/revision/receipt.
-- No Home, Tickets, sponsor-logo or other template content is duplicated.
create table onzio.cinematic_shop_content (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  content jsonb not null check (jsonb_typeof(content)='object'),
  map_media_asset_id uuid,
  updated_at timestamptz not null default now(),
  foreign key (club_id,map_media_asset_id) references onzio.media_assets(club_id,id)
);
alter table onzio.cinematic_shop_content enable row level security;
grant select on onzio.cinematic_shop_content to anon,authenticated;
grant insert(club_id,content,map_media_asset_id),update(content,map_media_asset_id,updated_at) on onzio.cinematic_shop_content to authenticated;
grant all on onzio.cinematic_shop_content to service_role;
create policy cinematic_shop_read on onzio.cinematic_shop_content for select to anon,authenticated
  using (onzio_private.can_read_feature(club_id,'shop'));
create policy cinematic_shop_insert on onzio.cinematic_shop_content for insert to authenticated
  with check (onzio_private.can_mutate_feature(club_id,'shop'));
create policy cinematic_shop_update on onzio.cinematic_shop_content for update to authenticated
  using (onzio_private.can_mutate_feature(club_id,'shop'))
  with check (onzio_private.can_mutate_feature(club_id,'shop'));
create trigger serialize_shop_page_write before insert or update or delete on onzio.cinematic_shop_content
  for each statement execute function onzio_private.serialize_shop_page_write();
create trigger advance_shop_page_revision after insert or update or delete on onzio.cinematic_shop_content
  for each row execute function onzio_private.advance_shop_page_revision();
create trigger audit_cinematic_shop after insert or update or delete on onzio.cinematic_shop_content
  for each row execute function onzio_private.audit_content_mutation();
create trigger guard_map_media_reference before insert or update of map_media_asset_id on onzio.cinematic_shop_content
  for each row execute function onzio_private.guard_media_reference('map_media_asset_id','asset');

create function onzio_private.validate_cinematic_shop_content(p_club_id uuid,p_content jsonb) returns void
language plpgsql stable security invoker set search_path='' as $$
declare
  keys text[]:=array['mapAssetId','mapAlt','mapVisible','mapCrop','sponsorsHeading','sponsorsVisible','homeLabel','awayLabel','galleryLabel','emptyMessage','leadScale','leadTop'];
  key text; value jsonb; a uuid; crop jsonb; x numeric; y numeric; w numeric; h numeric;
begin
  perform onzio_private.check_shop_object(p_content,keys,keys);
  for key,value in select * from jsonb_each(p_content) loop
    if key in ('mapVisible','sponsorsVisible') then
      if jsonb_typeof(value) is distinct from 'boolean' then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
    elsif key in ('leadScale','leadTop') then
      if jsonb_typeof(value) is distinct from 'number' then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
      if (key='leadScale' and (value#>>'{}')::numeric not between 30 and 100)
        or (key='leadTop' and (value#>>'{}')::numeric not between 0 and 30) then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
    elsif key not in ('mapAssetId','mapCrop') then
      if jsonb_typeof(value) is distinct from 'string' or length(value#>>'{}')>(case key when 'mapAlt' then 600 when 'emptyMessage' then 600 when 'homeLabel' then 80 when 'awayLabel' then 80 else 160 end) then
        raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023';
      end if;
    end if;
  end loop;
  if jsonb_typeof(p_content->'mapAssetId') not in ('string','null') then raise exception 'INVALID_SHOP_PHOTO' using errcode='22023'; end if;
  begin a:=(p_content->>'mapAssetId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_SHOP_PHOTO' using errcode='22023'; end;
  if a is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=a and surface='shop'
    and media_kind='graphic' and storage_bucket='onzio-media' and status='published' and deleted_at is null) then
    raise exception 'INVALID_SHOP_PHOTO' using errcode='22023';
  end if;
  crop:=p_content->'mapCrop';
  if jsonb_typeof(crop) is distinct from 'null' then
    perform onzio_private.check_shop_object(crop,array['x','y','width','height'],array['x','y','width','height']);
    if exists(select 1 from jsonb_each(crop) as coordinate where jsonb_typeof(coordinate.value) is distinct from 'number') then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
    x:=(crop->>'x')::numeric; y:=(crop->>'y')::numeric; w:=(crop->>'width')::numeric; h:=(crop->>'height')::numeric;
    if x<0 or y<0 or w<=0 or h<=0 or x+w>100.000001 or y+h>100.000001 then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
  end if;
end $$;
revoke all on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) from public,anon;
grant execute on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) to authenticated,service_role;

-- Direct authorized table writers must obey the same shape/media constraints.
create function onzio_private.validate_cinematic_shop_row() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform onzio_private.validate_cinematic_shop_content(new.club_id,new.content||jsonb_build_object('mapAssetId',new.map_media_asset_id));
  return new;
end $$;
revoke all on function onzio_private.validate_cinematic_shop_row() from public,anon;
grant execute on function onzio_private.validate_cinematic_shop_row() to authenticated,service_role;
create trigger validate_cinematic_shop_row before insert or update on onzio.cinematic_shop_content
  for each row execute function onzio_private.validate_cinematic_shop_row();

create or replace function onzio_private.shop_page_snapshot(p_club_id uuid,p_surface text) returns jsonb
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
    'presentation',case when p_surface='shop' then (select c.content||jsonb_build_object('mapAssetId',c.map_media_asset_id) from onzio.cinematic_shop_content c where c.club_id=p_club_id) else null end,
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'storage_bucket',m.storage_bucket,'storage_path',m.storage_path,'width',m.width,'height',m.height))
      from onzio.media_assets m where m.club_id=p_club_id and m.status='published' and m.deleted_at is null and m.storage_bucket='onzio-media' and (
        exists(select 1 from onzio.shop_kit_photos p where p.club_id=p_club_id and p.surface=p_surface and p.media_asset_id=m.id)
        or (p_surface='shop' and exists(select 1 from onzio.shop_carousel_photos p where p.club_id=p_club_id and p.media_asset_id=m.id))
        or (p_surface='shop' and exists(select 1 from onzio.cinematic_shop_content c where c.club_id=p_club_id and c.map_media_asset_id=m.id))
      )),'[]'::jsonb)
  );
$$;
revoke all on function onzio_private.shop_page_snapshot(uuid,text) from public,anon;
grant execute on function onzio_private.shop_page_snapshot(uuid,text) to authenticated;


create or replace function onzio.save_shop_page(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  page_surface text; op uuid; hash text; saved_hash text; receipt jsonb; initial jsonb; result jsonb; template text;
  variants jsonb; photo_rows jsonb; purchase jsonb; variant text; product jsonb; section jsonb; photos jsonb; item jsonb;
  presentation jsonb; old_map uuid;
  retired uuid[]:='{}'; removed uuid[]; key text; value jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901283);
  if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  perform onzio_private.check_shop_object(p_request,array['operationId','surface','expectedRevision','designRevision','variants','photoRows','purchase','presentation'],
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
  if onzio_private.homepage_design(p_club_id)->>'templateKey'='editorial@1'
    and not coalesce((select store_enabled from onzio.clubs where id=p_club_id),false) then
    raise exception 'PAGE_UNAVAILABLE' using errcode='22023';
  end if;
  initial:=onzio_private.shop_page_snapshot(p_club_id,page_surface); template:=initial->>'templateKey';
  if page_surface='home' and template in ('clubhouse@1','editorial@1') then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  if (initial->>'designRevision') is distinct from (p_request->>'designRevision') then raise exception 'DESIGN_CHANGED' using errcode='PT409'; end if;
  if (initial->>'revision') is distinct from (p_request->>'expectedRevision') then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
  variants:=p_request->'variants'; photo_rows:=p_request->'photoRows'; purchase:=p_request->'purchase'; presentation:=p_request->'presentation';
  perform onzio_private.check_shop_object(variants,array['home','third','away']);
  if variants='{}'::jsonb and photo_rows is null and purchase is null and presentation is null then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
  if (page_surface='home' or template='academy@1') and (variants ? 'third' or variants ? 'away') then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
  if coalesce(template,'') not in ('clubhouse@1','editorial@1') and variants ? 'third' then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
  if (page_surface='home' or template in ('academy@1','clubhouse@1','editorial@1')) and (photo_rows is not null or purchase is not null) then
    raise exception 'SECTION_UNAVAILABLE' using errcode='22023';
  end if;
  if presentation is not null then
    if page_surface<>'shop' or template is distinct from 'cinematic@2' then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
    perform onzio_private.validate_cinematic_shop_content(p_club_id,presentation);
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
  if presentation is not null then
    select map_media_asset_id into old_map from onzio.cinematic_shop_content where club_id=p_club_id;
    insert into onzio.cinematic_shop_content(club_id,content,map_media_asset_id)
      values(p_club_id,presentation-'mapAssetId',(presentation->>'mapAssetId')::uuid)
      on conflict(club_id) do update set content=excluded.content,map_media_asset_id=excluded.map_media_asset_id,updated_at=now();
    if old_map is not null and old_map is distinct from (presentation->>'mapAssetId')::uuid then retired:=array_append(retired,old_map); end if;
  end if;
  result:=onzio_private.shop_page_snapshot(p_club_id,page_surface)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired));
  insert into onzio_private.shop_page_receipts(club_id,actor_id,surface,operation_id,request_hash,response)
    values(p_club_id,auth.uid(),page_surface,op,hash,result);
  return result;
end $$;
revoke all on function onzio.save_shop_page(uuid,jsonb) from public,anon;
grant execute on function onzio.save_shop_page(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
