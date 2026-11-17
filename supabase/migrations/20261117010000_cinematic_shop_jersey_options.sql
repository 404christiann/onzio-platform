-- Rose City shop and homepage, reconciled with main (6b9a7d07, after PR 149).
-- Dated after main's newest migration (20261111080000), so these definitions are the final ones whatever order the
-- branch and main migrations are applied in. Each function starts from its newest definition on main and adds only what
-- the Rose City branch still needs:
--   onzio_private.validate_cinematic_shop_section NEW: up to 10 bullets for cinematic@2 kits (Shop page and homepage jersey); every
--                                                  other rule is main's validate_shop_section(jsonb), which is not changed,
--                                                  so every other club and template keeps its limit of 8.
--   onzio_private.validate_cinematic_shop_content  not on main: branch 20261104040000 plus the optional editionsHeading
--                                                  (max 80) and up to 3 jersey options (was 2).
--   onzio.save_shop_page                          main 20261022193528 (content policy: no template rules on the Shop page,
--                                                  so third kits and third photo rows are already allowed) plus the branch's
--                                                  cinematic presentation save from 20261104040000, unchanged, and the
--                                                  cinematic@2 kits on both surfaces checked by validate_cinematic_shop_section.
--   onzio_private.homepage_binding_identity       main 20261021181721 plus templateKey cinematic@2, and slideshowVariant
--                                                  'cinematic' only for cinematic@2 (every other template still rejects it).
--   onzio_private.homepage_snapshot               main 20261021181721 plus the cinematic homepage content and its artwork
--                                                  media, as in branch 20261104020000.
--   onzio.save_homepage                           main 20261022183955 (content policy) plus the cinematic homepage section
--                                                  (raffle, ticket, trophy and footer-logo artwork and words) and the 7-photo
--                                                  slideshow, both for cinematic@2 only, as in branch 20261104020000.
-- Additive only: create or replace with the same names and argument lists; grants re-applied as first granted.
-- No drops, renames, table or column changes, or data writes. The 2-argument validate_shop_section(jsonb,boolean), which
-- main dropped and branch 20261104030000 recreates, is left in place and no longer called.

create or replace function onzio_private.validate_cinematic_shop_section(p_section jsonb) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare bullets jsonb:=p_section->'bullet_points';
begin
  if jsonb_typeof(bullets)='array' and jsonb_array_length(bullets)>8 then
    if jsonb_array_length(bullets)>10 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
    perform onzio_private.validate_shop_section(jsonb_set(p_section,'{bullet_points}',
      (select jsonb_agg(b.value order by b.position) from jsonb_array_elements(bullets) with ordinality as b(value,position) where b.position<=8)));
    perform onzio_private.validate_shop_section(jsonb_set(p_section,'{bullet_points}',
      (select jsonb_agg(b.value order by b.position) from jsonb_array_elements(bullets) with ordinality as b(value,position) where b.position>8)));
  else
    perform onzio_private.validate_shop_section(p_section);
  end if;
end $$;
revoke all on function onzio_private.validate_cinematic_shop_section(jsonb) from public,anon;
grant execute on function onzio_private.validate_cinematic_shop_section(jsonb) to authenticated;

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
  page_surface text; op uuid; hash text; saved_hash text; receipt jsonb; initial jsonb; result jsonb;
  variants jsonb; photo_rows jsonb; purchase jsonb; variant text; product jsonb; section jsonb; photos jsonb; item jsonb;
  retired uuid[]:='{}'; removed uuid[]; key text; value jsonb;
  template text; presentation jsonb; old_map uuid; old_details uuid[]:='{}'; new_details uuid[]; kept uuid[]; old_asset uuid;
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
  initial:=onzio_private.shop_page_snapshot(p_club_id,page_surface); template:=initial->>'templateKey';
  if (initial->>'designRevision') is distinct from (p_request->>'designRevision') then raise exception 'DESIGN_CHANGED' using errcode='PT409'; end if;
  if (initial->>'revision') is distinct from (p_request->>'expectedRevision') then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
  variants:=p_request->'variants'; photo_rows:=p_request->'photoRows'; purchase:=p_request->'purchase'; presentation:=p_request->'presentation';
  perform onzio_private.check_shop_object(variants,array['home','third','away']);
  if variants='{}'::jsonb and photo_rows is null and purchase is null and presentation is null then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
  if page_surface='home' and (variants ? 'third' or variants ? 'away') then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
  if page_surface='home' and (photo_rows is not null or purchase is not null) then
    raise exception 'SECTION_UNAVAILABLE' using errcode='22023';
  end if;
  if presentation is not null then
    if page_surface<>'shop' or template is distinct from 'cinematic@2' then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
    perform onzio_private.validate_cinematic_shop_content(p_club_id,presentation);
  end if;
  for variant,product in select * from jsonb_each(variants) loop
    perform onzio_private.check_shop_object(product,array['section','photos'],array['section','photos']);
    section:=product->'section'; photos:=product->'photos';
    if template='cinematic@2' then perform onzio_private.validate_cinematic_shop_section(section);
    else perform onzio_private.validate_shop_section(section); end if;
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

create or replace function onzio_private.homepage_binding_identity(p_design jsonb) returns jsonb
language plpgsql immutable security definer set search_path='' as $$
declare k text:=p_design->>'templateKey'; profile text; hero text; caption text;
begin
  if (k is not null and k not in ('academy@1','editorial@1','clubhouse@1','cinematic@1','heritage@1','cinematic@2'))
    or (p_design->>'heroVariant') is null or (p_design->>'heroVariant') not in ('editable','legacy-fixed')
    or (p_design->>'slideshowVariant') is null or (p_design->>'slideshowVariant') not in ('none','editorial','matchday','legacy','cinematic')
    or ((p_design->>'slideshowVariant')='cinematic' and k is distinct from 'cinematic@2') then
    raise exception 'INVALID_HOMEPAGE_BINDING' using errcode='22023';
  end if;
  profile:=case when k='academy@1' then 'legacy/homepage-story/home-kit'
    when k in ('editorial@1','clubhouse@1') then 'legacy/about-story/shop-kits' else 'legacy/video/home-kit' end;
  hero:=case when p_design->>'heroVariant'='legacy-fixed' then 'fixed-hero'
    when k in ('editorial@1','clubhouse@1') then 'compact-hero' else 'full-hero' end;
  caption:=case when coalesce(k,'') not in ('academy@1','editorial@1') and p_design->>'slideshowVariant'='legacy'
    then 'caption' else 'no-caption' end;
  return jsonb_build_object('key',profile||'/'||hero||'/'||caption,'revision',1);
end $$;
revoke all on function onzio_private.homepage_binding_identity(jsonb) from public,anon,authenticated,service_role;

create or replace function onzio_private.homepage_snapshot(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'revision', coalesce((select revision::text from onzio_private.homepage_revisions where club_id=p_club_id),'0'),
    'designRevision', onzio_private.homepage_save_design(p_club_id)->>'designRevision',
    'design', onzio_private.homepage_save_design(p_club_id),
    'content', jsonb_build_object(
      'hero', coalesce((select to_jsonb(h)-'club_id'-'updated_at' from onzio.homepage_hero_content h where club_id=p_club_id),
        '{"eyebrow":"","headline_line_one":"","headline_line_two":"","intro":"","primary_cta_label":"","primary_cta_href":"","secondary_cta_label":"","secondary_cta_href":""}'::jsonb),
      'story', coalesce((select jsonb_build_object('visible',visible,'heading',heading,'bodyPrimary',body_primary,'bodySecondary',body_secondary,'ctaLabel',cta_label) from onzio.homepage_story_section where club_id=p_club_id),
        '{"visible":true,"heading":"","bodyPrimary":"","bodySecondary":"","ctaLabel":""}'::jsonb),
      'video', coalesce((select to_jsonb(v)-'club_id'-'updated_at'-'video_url' from onzio.behind_the_rose_section v where club_id=p_club_id),
        '{"visible":false,"eyebrow":"","title":"","description":"","video_title":"","caption":""}'::jsonb),
      'photos', jsonb_build_object('seasonLabel',coalesce((select season_label from onzio.homepage_slideshow_settings where club_id=p_club_id),''),
        'items',coalesce((select jsonb_agg(jsonb_build_object('clientId','photo-'||p.id,'rowId',p.id,'assetId',p.media_asset_id,'url',p.url,'alt',p.alt,'order',p.sort_order,'upload','ready') order by p.sort_order,p.id)
          from onzio.homepage_slideshow_photos p where p.club_id=p_club_id),'[]'::jsonb))) || case when onzio_private.cinematic_homepage_json(p_club_id) is null then '{}'::jsonb else jsonb_build_object('revamp',onzio_private.cinematic_homepage_json(p_club_id)) end,
    'videoSource',coalesce((select video_url from onzio.behind_the_rose_section where club_id=p_club_id),''),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'storage_bucket',m.storage_bucket,'storage_path',m.storage_path))
      from onzio.media_assets m where m.club_id=p_club_id and m.status='published' and m.deleted_at is null and m.storage_bucket='onzio-media'
      and (exists(select 1 from onzio.homepage_slideshow_photos p where p.club_id=p_club_id and p.media_asset_id=m.id)
        or exists(select 1 from onzio.homepage_revamp_content r where r.club_id=p_club_id and m.id=any(array[r.raffle_media_asset_id,r.ticket_media_asset_id,r.trophy_media_asset_id,r.header_partner_media_asset_id,r.hero_poster_media_asset_id,r.seats_background_media_asset_id,r.episode_poster_media_asset_id,r.footer_logo_media_asset_id])))),'[]'::jsonb)
  );
$$;

create or replace function onzio.save_homepage(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  initial jsonb; result jsonb; sections jsonb; section text; fields jsonb; k text; v jsonb;
  op uuid; saved_hash text; request_hash text; receipt jsonb; maximum integer; template text;
  h jsonb; s jsonb; video jsonb; p jsonb; a onzio.media_assets; old_photo onzio.homepage_slideshow_photos;
  photo_id uuid; asset_id uuid; ids uuid[]:='{}'; clients text[]:='{}'; assets uuid[]:='{}'; idx integer:=0; photo_url text;
  old_asset_ids uuid[]; new_asset_ids uuid[]; retired_asset_ids uuid[]:='{}';
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  perform onzio_private.check_homepage_object(p_request,array['operationId','expectedRevision','designRevision','sections'],array['operationId','expectedRevision','designRevision','sections']);
  if jsonb_typeof(p_request->'operationId')<>'string' or jsonb_typeof(p_request->'expectedRevision')<>'string'
    or jsonb_typeof(p_request->'designRevision')<>'string' or length(p_request->>'expectedRevision') not between 1 and 200
    or length(p_request->>'designRevision') not between 1 and 200 then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  begin op:=(p_request->>'operationId')::uuid; exception when invalid_text_representation then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end;
  if op is null then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  request_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select r.request_hash,r.response into saved_hash,receipt from onzio_private.homepage_save_receipts r
    where club_id=p_club_id and actor_id=auth.uid() and operation_id=op;
  if found then
    if saved_hash<>request_hash then raise exception 'OPERATION_REUSED' using errcode='22023'; end if;
    return receipt;
  end if;
  initial:=onzio_private.homepage_snapshot(p_club_id); template:=initial#>>'{design,templateKey}';
  if initial->>'designRevision'<>p_request->>'designRevision' then raise exception 'DESIGN_CHANGED' using errcode='PT409'; end if;
  if initial->>'revision'<>p_request->>'expectedRevision' then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
  sections:=p_request->'sections';
  perform onzio_private.check_homepage_object(sections,array['hero','photos','story','video','revamp']);
  if sections='{}'::jsonb then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  for section,fields in select * from jsonb_each(sections) loop
    if section='revamp' and coalesce(template,'')<>'cinematic@2' then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;
    if section='revamp' then
      perform onzio_private.check_cinematic_homepage(fields);
      continue;
    elsif section='hero' then
      perform onzio_private.check_homepage_object(fields,array['eyebrow','headline_line_one','headline_line_two','intro','primary_cta_label','primary_cta_href','secondary_cta_label','secondary_cta_href']);
      if fields='{}'::jsonb then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
    elsif section='story' then
      perform onzio_private.check_homepage_object(fields,array['visible','heading','bodyPrimary','bodySecondary','ctaLabel'],array['visible','heading','bodyPrimary','bodySecondary','ctaLabel']);
    elsif section='video' then
      perform onzio_private.check_homepage_object(fields,array['visible','eyebrow','title','description','video_title','caption'],array['visible','eyebrow','title','description','video_title','caption']);
    else
      perform onzio_private.check_homepage_object(fields,array['items','seasonLabel'],array['items']);
    end if;
    for k,v in select * from jsonb_each(fields) loop
      if k='items' then continue; end if;
      if k='visible' then
        if jsonb_typeof(v)<>'boolean' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
      else
        maximum:=case when section='hero' and k in ('headline_line_one','headline_line_two') then 80 when section='hero' and k='intro' then 320
          when section='story' and k='heading' then 120 when section='story' and k in ('bodyPrimary','bodySecondary') then 1200 when section='story' and k='ctaLabel' then 40 else 20000 end;
        if jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>maximum then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
        if section='hero' and k in ('primary_cta_href','secondary_cta_href') and (v#>>'{}')<>'' and (v#>>'{}')!~'^/[-A-Za-z0-9_/?#=&%.]*$' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
      end if;
    end loop;
  end loop;

  if sections ? 'hero' then
    h:=(initial#>'{content,hero}')||(sections->'hero');
    insert into onzio.homepage_hero_content(club_id,eyebrow,headline_line_one,headline_line_two,intro,primary_cta_label,primary_cta_href,secondary_cta_label,secondary_cta_href)
      values(p_club_id,h->>'eyebrow',h->>'headline_line_one',h->>'headline_line_two',h->>'intro',h->>'primary_cta_label',h->>'primary_cta_href',h->>'secondary_cta_label',h->>'secondary_cta_href')
      on conflict(club_id) do update set eyebrow=excluded.eyebrow,headline_line_one=excluded.headline_line_one,headline_line_two=excluded.headline_line_two,intro=excluded.intro,primary_cta_label=excluded.primary_cta_label,primary_cta_href=excluded.primary_cta_href,secondary_cta_label=excluded.secondary_cta_label,secondary_cta_href=excluded.secondary_cta_href;
  end if;
  if sections ? 'photos' then
    if jsonb_typeof(sections#>'{photos,items}') is distinct from 'array' or jsonb_array_length(sections#>'{photos,items}')>(case when template='cinematic@2' then 7 else 6 end) then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
    select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into old_asset_ids
      from onzio.homepage_slideshow_photos where club_id=p_club_id;
    for p in select * from jsonb_array_elements(sections#>'{photos,items}') loop
      perform onzio_private.check_homepage_object(p,array['clientId','rowId','assetId','alt','order'],array['clientId','rowId','assetId','alt','order']);
      if jsonb_typeof(p->'clientId')<>'string' or length(p->>'clientId') not between 1 and 200 or (p->>'clientId')=any(clients)
        or jsonb_typeof(p->'alt')<>'string' or length(p->>'alt')>20000 or jsonb_typeof(p->'order')<>'number' or (p->>'order')::numeric<>idx then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
      begin photo_id:=(p->>'rowId')::uuid; asset_id:=(p->>'assetId')::uuid;
      exception when invalid_text_representation then raise exception 'INVALID_PHOTO' using errcode='22023'; end;
      if photo_id=any(ids) or asset_id=any(assets) or (photo_id is null and asset_id is null) then raise exception 'INVALID_PHOTO' using errcode='22023'; end if;
      if photo_id is not null then
        select * into old_photo from onzio.homepage_slideshow_photos where club_id=p_club_id and id=photo_id;
        if not found then raise exception 'INVALID_PHOTO' using errcode='22023'; end if;
        if asset_id is null and old_photo.media_asset_id is not null then raise exception 'INVALID_PHOTO' using errcode='22023'; end if;
      end if;
      if asset_id is not null then
        select * into a from onzio.media_assets where club_id=p_club_id and id=asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage';
        if not found then raise exception 'INVALID_PHOTO' using errcode='22023'; end if;
      end if;
      clients:=array_append(clients,p->>'clientId'); ids:=array_append(ids,photo_id); assets:=array_append(assets,asset_id); idx:=idx+1;
    end loop;
    idx:=0; ids:='{}';
    for p in select * from jsonb_array_elements(sections#>'{photos,items}') loop
      photo_id:=coalesce((p->>'rowId')::uuid,gen_random_uuid()); asset_id:=(p->>'assetId')::uuid;
      if asset_id is not null then select storage_path into photo_url from onzio.media_assets where club_id=p_club_id and id=asset_id;
      else select url into photo_url from onzio.homepage_slideshow_photos where club_id=p_club_id and id=photo_id; end if;
      insert into onzio.homepage_slideshow_photos(id,club_id,media_asset_id,url,alt,sort_order)
        values(photo_id,p_club_id,asset_id,photo_url,coalesce(nullif(btrim(p->>'alt'),''),'Club photo '||(idx+1)),idx)
        on conflict(id) do update set media_asset_id=excluded.media_asset_id,url=excluded.url,alt=excluded.alt,sort_order=excluded.sort_order;
      ids:=array_append(ids,photo_id); idx:=idx+1;
    end loop;
    delete from onzio.homepage_slideshow_photos where club_id=p_club_id and not(id=any(ids));
    if sections->'photos' ? 'seasonLabel' then
      insert into onzio.homepage_slideshow_settings(club_id,season_label) values(p_club_id,sections#>>'{photos,seasonLabel}')
        on conflict(club_id) do update set season_label=excluded.season_label;
    end if;
    select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into new_asset_ids
      from onzio.homepage_slideshow_photos where club_id=p_club_id;
    select coalesce(array_agg(x),'{}') into retired_asset_ids from unnest(old_asset_ids) x where not(x=any(new_asset_ids));
  end if;
  if sections ? 'story' then
    s:=sections->'story';
    insert into onzio.homepage_story_section(club_id,visible,heading,body_primary,body_secondary,cta_label)
      values(p_club_id,(s->>'visible')::boolean,s->>'heading',s->>'bodyPrimary',s->>'bodySecondary',s->>'ctaLabel')
      on conflict(club_id) do update set visible=excluded.visible,heading=excluded.heading,body_primary=excluded.body_primary,body_secondary=excluded.body_secondary,cta_label=excluded.cta_label;
  end if;
  if sections ? 'video' then
    video:=sections->'video';
    if (video->>'visible')::boolean and coalesce(initial->>'videoSource','')='' then raise exception 'VIDEO_SOURCE_REQUIRED' using errcode='22023'; end if;
    insert into onzio.behind_the_rose_section(club_id,visible,eyebrow,title,description,video_title,caption)
      values(p_club_id,(video->>'visible')::boolean,video->>'eyebrow',video->>'title',video->>'description',video->>'video_title',video->>'caption')
      on conflict(club_id) do update set visible=excluded.visible,eyebrow=excluded.eyebrow,title=excluded.title,description=excluded.description,video_title=excluded.video_title,caption=excluded.caption;
  end if;
  if sections ? 'revamp' then
    s:=sections->'revamp';
    for asset_id in select x from unnest(array[(s#>>'{raffle,assetId}')::uuid,(s#>>'{ticket,assetId}')::uuid,(s#>>'{championship,trophy,assetId}')::uuid,(s#>>'{footerLogo,assetId}')::uuid]) x where x is not null loop
      if not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage') then
        raise exception 'INVALID_PHOTO' using errcode='22023';
      end if;
    end loop;
    select array_remove(array[raffle_media_asset_id,ticket_media_asset_id,trophy_media_asset_id,footer_logo_media_asset_id],null) into old_asset_ids from onzio.homepage_revamp_content where club_id=p_club_id;
    new_asset_ids:=array_remove(array[(s#>>'{raffle,assetId}')::uuid,(s#>>'{ticket,assetId}')::uuid,(s#>>'{championship,trophy,assetId}')::uuid,(s#>>'{footerLogo,assetId}')::uuid],null);
    insert into onzio.homepage_revamp_content(club_id,content,raffle_media_asset_id,ticket_media_asset_id,trophy_media_asset_id,footer_logo_media_asset_id)
      values(p_club_id,s#-'{raffle,assetId}'#-'{ticket,assetId}'#-'{championship,trophy,assetId}'#-'{footerLogo,assetId}',(s#>>'{raffle,assetId}')::uuid,(s#>>'{ticket,assetId}')::uuid,(s#>>'{championship,trophy,assetId}')::uuid,(s#>>'{footerLogo,assetId}')::uuid)
      on conflict(club_id) do update set content=excluded.content,raffle_media_asset_id=excluded.raffle_media_asset_id,ticket_media_asset_id=excluded.ticket_media_asset_id,trophy_media_asset_id=excluded.trophy_media_asset_id,footer_logo_media_asset_id=excluded.footer_logo_media_asset_id;
    select retired_asset_ids||coalesce(array_agg(x),'{}') into retired_asset_ids from unnest(old_asset_ids) x where not(x=any(new_asset_ids));
  end if;
  result:=onzio_private.homepage_snapshot(p_club_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired_asset_ids));
  insert into onzio_private.homepage_save_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $$;
revoke all on function onzio.save_homepage(uuid,jsonb) from public,anon;
grant execute on function onzio.save_homepage(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
