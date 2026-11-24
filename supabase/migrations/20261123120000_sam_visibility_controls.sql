-- SAM-VISIBILITY-AND-HEADER-SPONSOR: Sam's Rose City admin feedback (cinematic@2 only).
--
--   onzio_private.check_cinematic_homepage       20261112210000 definition plus: optional boolean `visible` on raffle,
--                                                match and prices (absent or true = shown), and an optional top-level
--                                                headerPartner {assetId, alt} in the homepage save payload.
--   onzio_private.set_cinematic_header_partner   NEW. Security definer, onzio_private only (not exposed). Writes the
--                                                header sponsor logo: header_partner_media_asset_id stays the single
--                                                source of truth and its description stays in
--                                                presentation_config.artworkAlt.headerPartner. Club editors still have no
--                                                grant on either column; this function re-checks can_mutate_content and
--                                                can_mutate_feature('homepage') and touches only those two values.
--   onzio.save_homepage                          20261117010000 definition plus: when revamp.headerPartner is present it
--                                                calls the helper above (absent = unchanged), keeps headerPartner out of
--                                                the content JSON, and retires a replaced or removed header logo like the
--                                                other artwork slots.
--   onzio_private.validate_cinematic_shop_content 20261117010000 definition plus an optional boolean `visible` on each
--                                                jersey option.
--   onzio_private.is_public_page_visibility      20261122120000 definition plus the keys 'tickets' and 'season-membership'.
--
-- Additive only: create or replace with the same names and argument lists (grants survive; re-applied for the new
-- function). No table, column, grant-widening or data change. Every existing row and every payload the current app
-- sends is still accepted: the app omits `visible` unless it is false and omits headerPartner unless the owner changed it.
-- Rollback: re-run the four prior definitions named above and drop onzio_private.set_cinematic_header_partner; first
-- clear any `visible:false` keys and the two new page keys, which the prior definitions reject.

create or replace function onzio_private.check_cinematic_homepage(v jsonb) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare k text; r jsonb; a jsonb; ids text[]:='{}'; asset uuid; part text;
begin
 perform onzio_private.check_homepage_object(v,array['raffle','ticket','footerLogo','headerPartner','match','prices','championship','navigation','sponsors'],array['raffle','ticket','match','prices','championship','navigation','sponsors']);
 for a in select value from jsonb_each(jsonb_build_object('raffle',v->'raffle','ticket',v->'ticket','trophy',v#>'{championship,trophy}')||case when v ? 'footerLogo' then jsonb_build_object('footerLogo',v->'footerLogo') else '{}'::jsonb end||case when v ? 'headerPartner' then jsonb_build_object('headerPartner',v->'headerPartner') else '{}'::jsonb end) loop
  perform onzio_private.check_homepage_object(a,array['assetId','alt','visible'],array['assetId','alt']);
  if jsonb_typeof(a->'assetId') not in ('string','null') then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  begin asset:=(a->>'assetId')::uuid; exception when invalid_text_representation then raise exception 'INVALID_PHOTO' using errcode='22023'; end;
  perform onzio_private.check_cinematic_text(a->'alt',1000);
 end loop;
 perform onzio_private.check_homepage_object(v->'raffle',array['assetId','alt','visible'],array['assetId','alt']);
 perform onzio_private.check_homepage_object(v#>'{championship,trophy}',array['assetId','alt'],array['assetId','alt']);
 if v ? 'footerLogo' then perform onzio_private.check_homepage_object(v->'footerLogo',array['assetId','alt'],array['assetId','alt']); end if;
 if v ? 'headerPartner' then perform onzio_private.check_homepage_object(v->'headerPartner',array['assetId','alt'],array['assetId','alt']); end if;
 perform onzio_private.check_homepage_object(v->'ticket',array['assetId','alt','visible'],array['assetId','alt','visible']);
 if jsonb_typeof(v#>'{ticket,visible}') is distinct from 'boolean' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 perform onzio_private.check_homepage_object(v->'sponsors',array['heading'],array['heading']);
 perform onzio_private.check_cinematic_text(v#>'{sponsors,heading}',120);
 perform onzio_private.check_homepage_object(v->'match',array['heading','buttonLabel','buttonHref','emptyMessage','visible'],array['heading','buttonLabel','buttonHref','emptyMessage']);
 perform onzio_private.check_cinematic_text(v#>'{match,heading}',120);
 perform onzio_private.check_cinematic_text(v#>'{match,buttonLabel}',60);
 perform onzio_private.check_cinematic_text(v#>'{match,buttonHref}',2000);
 perform onzio_private.check_cinematic_text(v#>'{match,emptyMessage}',1200);
 if (v#>>'{match,buttonHref}')!~'^/[-A-Za-z0-9_/?#=&%.]*$' or left(v#>>'{match,buttonHref}',2)='//' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 perform onzio_private.check_homepage_object(v->'prices',array['heading','rows','footnote','visible'],array['heading','rows','footnote']);
 foreach part in array array['raffle','match','prices'] loop
  if v->part ? 'visible' and jsonb_typeof(v#>array[part,'visible']) is distinct from 'boolean' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 end loop;
 perform onzio_private.check_cinematic_text(v#>'{prices,heading}',120);
 perform onzio_private.check_cinematic_text(v#>'{prices,footnote}',1200);
 if jsonb_typeof(v#>'{prices,rows}') is distinct from 'array' or jsonb_array_length(v#>'{prices,rows}')>10 then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 for r in select * from jsonb_array_elements(v#>'{prices,rows}') loop
  perform onzio_private.check_homepage_object(r,array['id','label','price','description','note','accent'],array['id','label','price','description','note','accent']);
  perform onzio_private.check_cinematic_text(r->'id',60);
  if length(r->>'id')=0 or (r->>'id')=any(ids) then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  ids:=array_append(ids,r->>'id');
  perform onzio_private.check_cinematic_text(r->'label',120);
  perform onzio_private.check_cinematic_text(r->'price',60);
  perform onzio_private.check_cinematic_text(r->'description',1200);
  perform onzio_private.check_cinematic_text(r->'note',1200);
  if jsonb_typeof(r->'accent') is distinct from 'string' or (r->>'accent') not in ('none','aqua','lime') then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 end loop;
 perform onzio_private.check_homepage_object(v->'championship',array['league','year','title','body','trophy'],array['league','year','title','body','trophy']);
 for k in select unnest(array['league','title']) loop perform onzio_private.check_cinematic_text(v#>array['championship',k],120); end loop;
 perform onzio_private.check_cinematic_text(v#>'{championship,year}',20);
 perform onzio_private.check_cinematic_text(v#>'{championship,body}',1200);
 perform onzio_private.check_homepage_object(v->'navigation',array['labels','destinations'],array['labels']);
 if v#>'{navigation,destinations}' is not null then
  perform onzio_private.check_homepage_object(v#>'{navigation,destinations}',array['tryouts','mediaCredentials','nationalAnthem'],array['tryouts','mediaCredentials']);
  for k,r in select * from jsonb_each(v#>'{navigation,destinations}') loop
   perform onzio_private.check_cinematic_text(r,2000);
   if r#>>'{}' <> '' and (r#>>'{}' !~ '^https://[^/[:space:]@?#]+([/?#][^[:space:]]*)?$' or btrim(r#>>'{}') is distinct from r#>>'{}') then
    raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023';
   end if;
  end loop;
 end if;
 perform onzio_private.check_homepage_object(v#>'{navigation,labels}',array['home','club','about','roster','club-crest','partners','tryouts','shop','stadium-group','stadium','stadium-parking','stadium-guidelines','chick-fil-a','know-before-you','fan-code','foothill-transit','media-credentials','tickets','tickets-page','season-membership','schedule','news','injury-report','news-page','community','partnership','national-anthem','contact']);
 for k,r in select * from jsonb_each(v#>'{navigation,labels}') loop
  perform onzio_private.check_cinematic_text(r,60);
  if btrim(r#>>'{}')='' or btrim(r#>>'{}') is distinct from r#>>'{}' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 end loop;
end $$;

create or replace function onzio_private.set_cinematic_header_partner(p_club_id uuid,p_asset_id uuid,p_alt text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare v_current uuid;
begin
  if auth.uid() is null or p_club_id is null or not onzio_private.can_mutate_content(p_club_id)
     or not onzio_private.can_mutate_feature(p_club_id,'homepage') then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  if p_alt is null or char_length(p_alt)>1000 then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  select header_partner_media_asset_id into v_current from onzio.homepage_revamp_content where club_id=p_club_id for update;
  if not found then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  -- A new logo must be this club's published homepage image; keeping the current one (even an operator import) is always allowed.
  if p_asset_id is not null and p_asset_id is distinct from v_current and not exists(select 1 from onzio.media_assets
    where club_id=p_club_id and id=p_asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage') then
    raise exception 'INVALID_PHOTO' using errcode='22023';
  end if;
  update onzio.homepage_revamp_content
    set header_partner_media_asset_id=p_asset_id,
        presentation_config=jsonb_set(presentation_config,'{artworkAlt}',coalesce(presentation_config->'artworkAlt','{}'::jsonb)||jsonb_build_object('headerPartner',p_alt),true)
    where club_id=p_club_id;
end $$;
revoke all on function onzio_private.set_cinematic_header_partner(uuid,uuid,text) from public,anon;
grant execute on function onzio_private.set_cinematic_header_partner(uuid,uuid,text) to authenticated;

create or replace function onzio.save_homepage(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  initial jsonb; result jsonb; sections jsonb; section text; fields jsonb; k text; v jsonb;
  op uuid; saved_hash text; request_hash text; receipt jsonb; maximum integer; template text;
  h jsonb; s jsonb; video jsonb; p jsonb; a onzio.media_assets; old_photo onzio.homepage_slideshow_photos;
  photo_id uuid; asset_id uuid; ids uuid[]:='{}'; clients text[]:='{}'; assets uuid[]:='{}'; idx integer:=0; photo_url text;
  old_asset_ids uuid[]; new_asset_ids uuid[]; retired_asset_ids uuid[]:='{}'; header_after uuid;
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
    select array_remove(array[raffle_media_asset_id,ticket_media_asset_id,trophy_media_asset_id,footer_logo_media_asset_id,header_partner_media_asset_id],null),header_partner_media_asset_id
      into old_asset_ids,header_after from onzio.homepage_revamp_content where club_id=p_club_id;
    -- Header sponsor logo: absent = unchanged, present = set (assetId null clears it). It lives in operator columns,
    -- so onzio_private.set_cinematic_header_partner writes it after the content row exists.
    if s ? 'headerPartner' then header_after:=(s#>>'{headerPartner,assetId}')::uuid; end if;
    new_asset_ids:=array_remove(array[(s#>>'{raffle,assetId}')::uuid,(s#>>'{ticket,assetId}')::uuid,(s#>>'{championship,trophy,assetId}')::uuid,(s#>>'{footerLogo,assetId}')::uuid,header_after],null);
    insert into onzio.homepage_revamp_content(club_id,content,raffle_media_asset_id,ticket_media_asset_id,trophy_media_asset_id,footer_logo_media_asset_id)
      values(p_club_id,(s-'headerPartner')#-'{raffle,assetId}'#-'{ticket,assetId}'#-'{championship,trophy,assetId}'#-'{footerLogo,assetId}',(s#>>'{raffle,assetId}')::uuid,(s#>>'{ticket,assetId}')::uuid,(s#>>'{championship,trophy,assetId}')::uuid,(s#>>'{footerLogo,assetId}')::uuid)
      on conflict(club_id) do update set content=excluded.content,raffle_media_asset_id=excluded.raffle_media_asset_id,ticket_media_asset_id=excluded.ticket_media_asset_id,trophy_media_asset_id=excluded.trophy_media_asset_id,footer_logo_media_asset_id=excluded.footer_logo_media_asset_id;
    if s ? 'headerPartner' then perform onzio_private.set_cinematic_header_partner(p_club_id,header_after,s#>>'{headerPartner,alt}'); end if;
    select retired_asset_ids||coalesce(array_agg(x),'{}') into retired_asset_ids from unnest(old_asset_ids) x where not(x=any(new_asset_ids));
  end if;
  result:=onzio_private.homepage_snapshot(p_club_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired_asset_ids));
  insert into onzio_private.homepage_save_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $$;
revoke all on function onzio.save_homepage(uuid,jsonb) from public,anon;
grant execute on function onzio.save_homepage(uuid,jsonb) to authenticated;

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
      -- Optional per-jersey switch: absent or true = shown, false = hidden.
      if (item ? 'visible' and jsonb_typeof(item->'visible') is distinct from 'boolean')
        or not onzio_private.shop_exact_strings(item-'visible',array['label','price','line','link'],array[80,40,160,2048])
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

create or replace function onzio_private.is_public_page_visibility(v jsonb) returns boolean
  language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    case when jsonb_typeof(v) = 'object' then not exists (
      select 1 from jsonb_each(v) as entry
      where entry.key <> all (array['stadium', 'chick-fil-a', 'foothill-transit', 'tickets', 'season-membership'])
         or jsonb_typeof(entry.value) is distinct from 'boolean'
    ) end,
    false
  );
$$;
