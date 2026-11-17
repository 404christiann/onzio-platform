create function onzio_private.about_editor_destination(p_href text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(p_href=any(array['/','/roster','/schedule','/club/about','/club/logo','/shop','/sponsors',
 '/staff','/standings','/stats','/tryouts','/programs','/contact']),false);
$$;
revoke all on function onzio_private.about_editor_destination(text) from public,anon;
grant execute on function onzio_private.about_editor_destination(text) to authenticated;
create or replace function onzio.load_about_editor(p_club_id uuid,p_page text,p_operation_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; receipt jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(734901281); perform pg_catalog.pg_advisory_xact_lock(734901290);
 if not onzio_private.can_mutate_feature(p_club_id,'about') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if p_page is null or p_page not in ('about','logo') then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 result:=onzio_private.about_editor_snapshot(p_club_id,p_page);
 if p_operation_id is not null then
 select response into receipt from onzio_private.about_editor_receipts where club_id=p_club_id and actor_id=auth.uid()
 and operation_id=p_operation_id and response->>'page'=p_page;
 result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed')
 else jsonb_build_object('status','committed','receipt',receipt) end);
 end if;
 return result;
end $$;
create or replace function onzio.save_about_editor(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 p text; c jsonb; old_content jsonb; snapshot jsonb; result jsonb; item jsonb; op uuid;
 hash text; previous_hash text; receipt jsonb; k text; keys text[]; url text;
 first_asset uuid; second_asset uuid; retired jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(734901281); perform pg_catalog.pg_advisory_xact_lock(734901290);
 if not onzio_private.can_mutate_feature(p_club_id,'about') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if jsonb_typeof(p_request) is distinct from 'object' or not p_request ?& array['operationId','page','expectedRevision','designRevision','content']
 or exists(select 1 from jsonb_object_keys(p_request) x where x<>all(array['operationId','page','expectedRevision','designRevision','content','retiredMediaUrls']))
 or jsonb_typeof(p_request->'operationId') is distinct from 'string'
 or jsonb_typeof(p_request->'page') is distinct from 'string' or (p_request->>'page') not in ('about','logo')
 or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string' or (p_request->>'expectedRevision')!~'^[0-9]+$'
 or length(p_request->>'expectedRevision')>20 or jsonb_typeof(p_request->'designRevision') is distinct from 'string'
 or length(p_request->>'designRevision') not between 1 and 100 or jsonb_typeof(p_request->'content') is distinct from 'object'
 then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 begin op:=(p_request->>'operationId')::uuid; exception when invalid_text_representation then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end;
 if op is null then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 p:=p_request->>'page'; c:=p_request->'content';
 keys:=case when p='about' then array['hero_title','story_paragraphs','feature_image_url','values_heading','values','closing_text','closing_cta_label','closing_cta_href']
 else array['annotated_image_url','map_image_url','features','color_cards'] end;
 if not c ?& keys or exists(select 1 from jsonb_object_keys(c) x where x<>all(keys)) then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 foreach k in array keys loop
 if k in ('story_paragraphs','values','features','color_cards') then
 if jsonb_typeof(c->k) is distinct from 'array' then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 if jsonb_array_length(c->k)>(case k when 'story_paragraphs' then 100 when 'color_cards' then 6 else 24 end) then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 for item in select * from jsonb_array_elements(c->k) loop
 if k='story_paragraphs' then
 if jsonb_typeof(item) is distinct from 'string' or length(item#>>'{}')>10000 then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 else
 if jsonb_typeof(item) is distinct from 'object' then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 keys:=case k when 'values' then array['title','description'] when 'features' then array['title','description','patch_url','icon_url','icon_size','icon_scale'] else array['label','image_url'] end;
 if not item ?& keys or exists(select 1 from jsonb_object_keys(item) x where x<>all(keys)) then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each(item) e where e.key not in ('icon_size','icon_scale') and
 (jsonb_typeof(e.value) is distinct from 'string' or length(e.value#>>'{}')>(case when e.key='description' then 10000 when e.key like '%url' then 2048 else 500 end))) then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 if k='features' then
 if jsonb_typeof(item->'icon_size') is distinct from 'number' or jsonb_typeof(item->'icon_scale') is distinct from 'number' then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 if (item->>'icon_size')::numeric not between 24 and 140 or (item->>'icon_scale')::numeric not between 0.5 and 4 then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 end if;
 end if;
 end loop;
 else
 if jsonb_typeof(c->k) is distinct from 'string' or length(c->>k)>(case when k='closing_text' then 10000 when k like '%url' then 2048 when k='closing_cta_label' then 200 else 500 end) then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 end if;
 end loop;
 if p_request ? 'retiredMediaUrls' then
 if jsonb_typeof(p_request->'retiredMediaUrls') is distinct from 'array' then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 if jsonb_array_length(p_request->'retiredMediaUrls')>100 or exists(select 1 from jsonb_array_elements(p_request->'retiredMediaUrls') u where jsonb_typeof(u) is distinct from 'string' or length(u#>>'{}')>2048) then raise exception 'INVALID_ABOUT_PAYLOAD' using errcode='22023'; end if;
 end if;
 hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 select request_hash,response into previous_hash,receipt from onzio_private.about_editor_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=op;
 if found then
 if hash<>previous_hash then raise exception 'OPERATION_REUSED' using errcode='PT409'; end if;
 return receipt;
 end if;
 snapshot:=onzio_private.about_editor_snapshot(p_club_id,p);
 if (snapshot->>'revision') is distinct from (p_request->>'expectedRevision') then raise exception 'ABOUT_CHANGED' using errcode='PT409'; end if;
 if (snapshot->>'designRevision') is distinct from (p_request->>'designRevision') then raise exception 'DESIGN_CHANGED' using errcode='PT409'; end if;
 old_content:=snapshot->'content';
 for url in select * from onzio_private.about_editor_urls(c,p) loop
 if url<>'' and onzio_private.about_editor_asset(p_club_id,url) is null and not exists(select 1 from onzio_private.about_editor_urls(old_content,p) old_url where old_url=url) then raise exception 'INVALID_ABOUT_MEDIA' using errcode='22023'; end if;
 end loop;
 -- Drop caller-controlled origins for every resolved published asset, including
 -- Logo JSON images that public pages render directly.
 for k,url in select e.key,e.value#>>'{}' from jsonb_each(c) e where e.key in ('feature_image_url','annotated_image_url','map_image_url') loop
 if onzio_private.about_editor_asset(p_club_id,url) is not null then
 c:=jsonb_set(c,array[k],to_jsonb('/storage/v1/object/public/onzio-media/'||split_part(split_part(url,'/storage/v1/object/public/onzio-media/',2),'?',1)));
 end if;
 end loop;
 if p='logo' then
 select coalesce(jsonb_agg(f||jsonb_build_object(
 'patch_url',case when onzio_private.about_editor_asset(p_club_id,f->>'patch_url') is null then f->>'patch_url' else '/storage/v1/object/public/onzio-media/'||split_part(split_part(f->>'patch_url','/storage/v1/object/public/onzio-media/',2),'?',1) end,
 'icon_url',case when onzio_private.about_editor_asset(p_club_id,f->>'icon_url') is null then f->>'icon_url' else '/storage/v1/object/public/onzio-media/'||split_part(split_part(f->>'icon_url','/storage/v1/object/public/onzio-media/',2),'?',1) end)),'[]') into item from jsonb_array_elements(c->'features') f;
 c:=jsonb_set(c,'{features}',item);
 select coalesce(jsonb_agg(f||jsonb_build_object('image_url',case when onzio_private.about_editor_asset(p_club_id,f->>'image_url') is null then f->>'image_url' else '/storage/v1/object/public/onzio-media/'||split_part(split_part(f->>'image_url','/storage/v1/object/public/onzio-media/',2),'?',1) end)),'[]') into item from jsonb_array_elements(c->'color_cards') f;
 c:=jsonb_set(c,'{color_cards}',item);
 end if;
 if p='about' then
 if not onzio_private.about_editor_destination(c->>'closing_cta_href') then raise exception 'INVALID_ABOUT_DESTINATION' using errcode='22023'; end if;
 first_asset:=onzio_private.about_editor_asset(p_club_id,c->>'feature_image_url');
 if c->>'feature_image_url'<>'' and first_asset is null and c->>'feature_image_url'=old_content->>'feature_image_url' then first_asset:=(old_content->>'feature_image_asset_id')::uuid; end if;
 insert into onzio.about_page_content(club_id,hero_title,story_paragraphs,feature_image_url,feature_image_asset_id,values_heading,values,closing_text,closing_cta_label,closing_cta_href,updated_at)
 values(p_club_id,c->>'hero_title',c->'story_paragraphs',c->>'feature_image_url',first_asset,c->>'values_heading',c->'values',c->>'closing_text',c->>'closing_cta_label',c->>'closing_cta_href',now())
 on conflict(club_id) do update set hero_title=excluded.hero_title,story_paragraphs=excluded.story_paragraphs,feature_image_url=excluded.feature_image_url,feature_image_asset_id=excluded.feature_image_asset_id,values_heading=excluded.values_heading,values=excluded.values,closing_text=excluded.closing_text,closing_cta_label=excluded.closing_cta_label,closing_cta_href=excluded.closing_cta_href,updated_at=excluded.updated_at;
 else
 first_asset:=onzio_private.about_editor_asset(p_club_id,c->>'annotated_image_url'); second_asset:=onzio_private.about_editor_asset(p_club_id,c->>'map_image_url');
 if c->>'annotated_image_url'<>'' and first_asset is null and c->>'annotated_image_url'=old_content->>'annotated_image_url' then first_asset:=(old_content->>'annotated_image_asset_id')::uuid; end if;
 if c->>'map_image_url'<>'' and second_asset is null and c->>'map_image_url'=old_content->>'map_image_url' then second_asset:=(old_content->>'map_image_asset_id')::uuid; end if;
 insert into onzio.club_logo_page_content(club_id,annotated_image_url,annotated_image_asset_id,map_image_url,map_image_asset_id,features,color_cards,updated_at)
 values(p_club_id,c->>'annotated_image_url',first_asset,c->>'map_image_url',second_asset,c->'features',c->'color_cards',now())
 on conflict(club_id) do update set annotated_image_url=excluded.annotated_image_url,annotated_image_asset_id=excluded.annotated_image_asset_id,map_image_url=excluded.map_image_url,map_image_asset_id=excluded.map_image_asset_id,features=excluded.features,color_cards=excluded.color_cards,updated_at=excluded.updated_at;
 end if;
 select coalesce(jsonb_agg(distinct m.id),'[]') into retired from onzio.media_assets m
 where m.club_id=p_club_id and m.surface='about' and m.status='published' and m.deleted_at is null
 and (exists(select 1 from onzio_private.about_editor_urls(old_content,p) u where onzio_private.about_editor_asset(p_club_id,u)=m.id)
 or m.id::text in (old_content->>'feature_image_asset_id',old_content->>'annotated_image_asset_id',old_content->>'map_image_asset_id')
 or (m.created_by=auth.uid() and exists(select 1 from jsonb_array_elements_text(coalesce(p_request->'retiredMediaUrls','[]')) u where onzio_private.about_editor_asset(p_club_id,u)=m.id)))
 and not exists(select 1 from onzio_private.about_editor_urls(c,p) u where onzio_private.about_editor_asset(p_club_id,u)=m.id)
 and m.id is distinct from first_asset and m.id is distinct from second_asset;
 result:=onzio_private.about_editor_snapshot(p_club_id,p)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',retired);
 insert into onzio_private.about_editor_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,hash,result);
 return result;
end $$;
drop function onzio_private.about_editor_destination(uuid,text);
notify pgrst,'reload schema';
