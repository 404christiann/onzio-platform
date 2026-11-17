-- Rose City jersey options: three whole-kit options (Home, Away, Third) on the cinematic@2 Shop page,
-- with an editable "Select your jersey" heading. Mirrors lib/cinematic-shop-content.ts.
-- Both functions below are exact copies of their definitions in 20261104040000_cinematic_shop_update.sql
-- (the newest ones), with only these replacements:
--   onzio_private.validate_cinematic_shop_content
--     1. added keys: 'editionsHeading' appended to the optional key list.
--     2. string limits: "when 'editionsHeading' then 80" added beside detailsHeading/mapHeading.
--     3. comment above the editions check: Authentic / Replica, up to two -> Jersey options (Home, Away, Third kits), up to three.
--     4. editions cap: jsonb_array_length(p_content->'editions')>2 -> >3.
--   onzio.save_shop_page
--     5. variant 'third': also allowed when template is cinematic@2 on the shop surface
--        (and not (coalesce(template,'')='cinematic@2' and page_surface='shop')).
--     6. photoRows 'third': rejected unless template is cinematic@2 on the shop surface (same condition).
-- Additive only: no drops, renames, table or column changes, signature changes or data writes. Both functions keep
-- their names, argument lists, security invoker and search_path; their revoke/grant lines are re-applied exactly as
-- first granted (validate_cinematic_shop_content in 20261013224434, save_shop_page in 20261104040000).
-- Behaviour changes only for template cinematic@2 on the shop surface, and only when a third option, the heading or
-- the Third kit is used: a save with up to two options, no heading and only Home/Away kits passes exactly as before.
-- The homepage surface, academy@1 and every other template keep their existing rejections.
-- shop_page_snapshot, validate_shop_photos, replace_shop_photos and the media retirement in save_shop_page are
-- already variant-generic, so they are not redefined.

create or replace function onzio_private.validate_cinematic_shop_content(p_club_id uuid,p_content jsonb) returns void
language plpgsql stable security invoker set search_path='' as $$
declare
  legacy text[]:=array['mapAssetId','mapAlt','mapVisible','mapCrop','sponsorsHeading','sponsorsVisible','homeLabel','awayLabel','galleryLabel','emptyMessage','leadScale','leadTop'];
  added text[]:=array['editions','detailsHeading','details','cardIcons','attributes','sizeChart','mapHeading','editionsHeading'];
  key text; value jsonb; item jsonb; a uuid; crop jsonb; x numeric; y numeric; w numeric; h numeric; chart jsonb; columns int;
begin
  perform onzio_private.check_shop_object(p_content,legacy||added,legacy);
  for key,value in select * from jsonb_each(p_content) loop
    if key in ('mapVisible','sponsorsVisible') then
      if jsonb_typeof(value) is distinct from 'boolean' then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
    elsif key in ('leadScale','leadTop') then
      if jsonb_typeof(value) is distinct from 'number' then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
      if (key='leadScale' and (value#>>'{}')::numeric not between 30 and 100)
        or (key='leadTop' and (value#>>'{}')::numeric not between 0 and 30) then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
    elsif key in ('editions','details','cardIcons','attributes','sizeChart') then
      null; -- checked below
    elsif key not in ('mapAssetId','mapCrop') then
      if jsonb_typeof(value) is distinct from 'string' or length(value#>>'{}')>(case key when 'mapAlt' then 600 when 'emptyMessage' then 600 when 'homeLabel' then 80 when 'awayLabel' then 80
        when 'detailsHeading' then 120 when 'mapHeading' then 120 when 'editionsHeading' then 80 else 160 end) then
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

  -- Jersey options (Home, Away, Third kits): up to three, each with a label, price, line and optional http(s) purchase link.
  if p_content ? 'editions' then
    if jsonb_typeof(p_content->'editions') is distinct from 'array' or jsonb_array_length(p_content->'editions')>3 then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(p_content->'editions') loop
      if not onzio_private.shop_exact_strings(item,array['label','price','line','link'],array[80,40,160,2048])
        or ((item->>'link')<>'' and (item->>'link')!~*'^https?://[^[:space:]]+$') then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
    end loop;
  end if;
  -- Jersey Details: up to six tiles. Photos must be this club's published Shop images.
  if p_content ? 'details' then
    if jsonb_typeof(p_content->'details') is distinct from 'array' or jsonb_array_length(p_content->'details')>6 then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(p_content->'details') loop
      if not onzio_private.shop_exact_strings(item-'assetId',array['alt','title','body'],array[600,80,600])
        or not item ? 'assetId' or jsonb_typeof(item->'assetId') not in ('string','null') then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
    end loop;
    for item in select * from jsonb_array_elements(p_content->'details') loop
      begin a:=(item->>'assetId')::uuid;
      exception when invalid_text_representation then raise exception 'INVALID_SHOP_PHOTO' using errcode='22023'; end;
      if a is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=a and surface='shop'
        and media_kind in ('photograph','graphic') and storage_bucket='onzio-media' and status='published' and deleted_at is null) then
        raise exception 'INVALID_SHOP_PHOTO' using errcode='22023';
      end if;
    end loop;
  end if;
  if p_content ? 'cardIcons' and (jsonb_typeof(p_content->'cardIcons') is distinct from 'array' or jsonb_array_length(p_content->'cardIcons')>4
    or exists(select 1 from jsonb_array_elements(p_content->'cardIcons') i where jsonb_typeof(i) is distinct from 'string'
      or i#>>'{}' not in ('','video','jersey','shipping-box','no-access'))) then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
  if p_content ? 'attributes' and (jsonb_typeof(p_content->'attributes') is distinct from 'array' or jsonb_array_length(p_content->'attributes')>8
    or exists(select 1 from jsonb_array_elements(p_content->'attributes') i where jsonb_typeof(i) is distinct from 'string' or length(i#>>'{}')>60)) then
    raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023';
  end if;
  -- Size chart: up to eight sizes and eight measurements; every row has one value per size.
  if p_content ? 'sizeChart' then
    chart:=p_content->'sizeChart';
    if jsonb_typeof(chart) is distinct from 'object' or exists(select 1 from jsonb_object_keys(chart) k where k not in ('heading','columns','rows','note'))
      or not chart ?& array['heading','columns','rows','note']
      or jsonb_typeof(chart->'heading') is distinct from 'string' or length(chart->>'heading')>80
      or jsonb_typeof(chart->'note') is distinct from 'string' or length(chart->>'note')>80
      or jsonb_typeof(chart->'columns') is distinct from 'array' or jsonb_array_length(chart->'columns')>8
      or exists(select 1 from jsonb_array_elements(chart->'columns') c where jsonb_typeof(c) is distinct from 'string' or length(c#>>'{}')>20)
      or jsonb_typeof(chart->'rows') is distinct from 'array' or jsonb_array_length(chart->'rows')>8 then
      raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023';
    end if;
    columns:=jsonb_array_length(chart->'columns');
    for item in select * from jsonb_array_elements(chart->'rows') loop
      if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('label','values'))
        or jsonb_typeof(item->'label') is distinct from 'string' or length(item->>'label')>40
        or jsonb_typeof(item->'values') is distinct from 'array' or jsonb_array_length(item->'values')<>columns
        or exists(select 1 from jsonb_array_elements(item->'values') v where jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>30) then
        raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023';
      end if;
    end loop;
  end if;
end $$;
revoke all on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) from public,anon;
grant execute on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) to authenticated,service_role;

create or replace function onzio.save_shop_page(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  page_surface text; op uuid; hash text; saved_hash text; receipt jsonb; initial jsonb; result jsonb; template text;
  variants jsonb; photo_rows jsonb; purchase jsonb; variant text; product jsonb; section jsonb; photos jsonb; item jsonb;
  presentation jsonb; old_map uuid; old_details uuid[]:='{}'; new_details uuid[]; kept uuid[]; old_asset uuid;
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
  if coalesce(template,'') not in ('clubhouse@1','editorial@1') and not (coalesce(template,'')='cinematic@2' and page_surface='shop') and variants ? 'third' then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
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
    if photo_rows ? 'third' and not (coalesce(template,'')='cinematic@2' and page_surface='shop') then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
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
    select c.map_media_asset_id,onzio_private.cinematic_shop_detail_assets(c) into old_map,old_details
      from onzio.cinematic_shop_content c where c.club_id=p_club_id;
    -- Detail photo identities live in their own tenant FK columns; the JSON keeps only the words.
    new_details:=array(select (presentation#>>array['details',i::text,'assetId'])::uuid from generate_series(0,5) i);
    insert into onzio.cinematic_shop_content(club_id,content,map_media_asset_id,
        detail_1_media_asset_id,detail_2_media_asset_id,detail_3_media_asset_id,detail_4_media_asset_id,detail_5_media_asset_id,detail_6_media_asset_id)
      values(p_club_id,onzio_private.cinematic_shop_stored_content(presentation),(presentation->>'mapAssetId')::uuid,
        new_details[1],new_details[2],new_details[3],new_details[4],new_details[5],new_details[6])
      on conflict(club_id) do update set content=excluded.content,map_media_asset_id=excluded.map_media_asset_id,
        detail_1_media_asset_id=excluded.detail_1_media_asset_id,detail_2_media_asset_id=excluded.detail_2_media_asset_id,
        detail_3_media_asset_id=excluded.detail_3_media_asset_id,detail_4_media_asset_id=excluded.detail_4_media_asset_id,
        detail_5_media_asset_id=excluded.detail_5_media_asset_id,detail_6_media_asset_id=excluded.detail_6_media_asset_id,updated_at=now();
    kept:=array_append(new_details,(presentation->>'mapAssetId')::uuid);
    foreach old_asset in array array_append(coalesce(old_details,'{}'),old_map) loop
      if old_asset is not null and not old_asset=any(array_remove(kept,null)) and not old_asset=any(retired) then retired:=array_append(retired,old_asset); end if;
    end loop;
  end if;
  result:=onzio_private.shop_page_snapshot(p_club_id,page_surface)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired));
  insert into onzio_private.shop_page_receipts(club_id,actor_id,surface,operation_id,request_hash,response)
    values(p_club_id,auth.uid(),page_surface,op,hash,result);
  return result;
end $$;
revoke all on function onzio.save_shop_page(uuid,jsonb) from public,anon;
grant execute on function onzio.save_shop_page(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
