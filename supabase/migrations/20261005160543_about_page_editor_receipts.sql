-- PPE-01: independent About/Logo revisions and durable actor-scoped save receipts.
create table onzio_private.about_editor_revisions (
 club_id uuid not null references onzio.clubs(id) on delete cascade, page text not null check(page in ('about','logo')),
 revision bigint not null default 0, primary key(club_id,page)
);
create table onzio_private.about_editor_receipts (
 club_id uuid not null references onzio.clubs(id) on delete cascade, actor_id uuid not null references auth.users(id),
 operation_id uuid not null, request_hash text not null, response jsonb not null,
 created_at timestamptz not null default now(), primary key(club_id,actor_id,operation_id)
);
alter table onzio_private.about_editor_revisions enable row level security;
alter table onzio_private.about_editor_receipts enable row level security;
grant select on onzio_private.about_editor_revisions to authenticated;
grant select,insert on onzio_private.about_editor_receipts to authenticated;
create policy about_editor_revision_read on onzio_private.about_editor_revisions for select to authenticated
 using(onzio_private.can_mutate_feature(club_id,'about'));
create policy about_editor_receipt_read on onzio_private.about_editor_receipts for select to authenticated
 using(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'about'));
create policy about_editor_receipt_insert on onzio_private.about_editor_receipts for insert to authenticated
 with check(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'about'));
create function onzio_private.serialize_about_editor_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin perform pg_catalog.pg_advisory_xact_lock(734901281); perform pg_catalog.pg_advisory_xact_lock(734901290); return null; end $$;
create function onzio_private.advance_about_editor_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into onzio_private.about_editor_revisions(club_id,page,revision)
 values(case when tg_op='DELETE' then old.club_id else new.club_id end,tg_argv[0],1)
 on conflict(club_id,page) do update set revision=onzio_private.about_editor_revisions.revision+1;
 return null;
end $$;
revoke all on function onzio_private.serialize_about_editor_write() from public,anon;
grant execute on function onzio_private.serialize_about_editor_write() to authenticated,service_role;
revoke all on function onzio_private.advance_about_editor_revision() from public,anon,authenticated,service_role;
create trigger serialize_about_editor before insert or update or delete on onzio.about_page_content
 for each statement execute function onzio_private.serialize_about_editor_write();
create trigger advance_about_editor after insert or update or delete on onzio.about_page_content
 for each row execute function onzio_private.advance_about_editor_revision('about');
create trigger serialize_logo_editor before insert or update or delete on onzio.club_logo_page_content
 for each statement execute function onzio_private.serialize_about_editor_write();
create trigger advance_logo_editor after insert or update or delete on onzio.club_logo_page_content
 for each row execute function onzio_private.advance_about_editor_revision('logo');
create function onzio_private.about_editor_snapshot(p_club_id uuid,p_page text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('page',p_page,'revision',coalesce((select revision::text
 from onzio_private.about_editor_revisions where club_id=p_club_id and page=p_page),'0'),
 'designRevision',md5(jsonb_build_array(onzio_private.homepage_design(p_club_id)->>'designRevision',
 (select store_enabled from onzio.clubs where id=p_club_id))::text),
 'content',case when p_page='about' then (select to_jsonb(c)-'club_id' from onzio.about_page_content c where club_id=p_club_id)
 else (select to_jsonb(c)-'club_id' from onzio.club_logo_page_content c where club_id=p_club_id) end);
$$;
create function onzio_private.about_editor_urls(p_content jsonb,p_page text) returns setof text
language sql immutable security invoker set search_path='' as $$
 select p_content->>'feature_image_url' where p_page='about'
 union all select p_content->>'annotated_image_url' where p_page='logo'
 union all select p_content->>'map_image_url' where p_page='logo'
 union all select f->>'patch_url' from jsonb_array_elements(case when jsonb_typeof(p_content->'features')='array' then p_content->'features' else '[]'::jsonb end) f where p_page='logo'
 union all select f->>'icon_url' from jsonb_array_elements(case when jsonb_typeof(p_content->'features')='array' then p_content->'features' else '[]'::jsonb end) f where p_page='logo'
 union all select f->>'image_url' from jsonb_array_elements(case when jsonb_typeof(p_content->'color_cards')='array' then p_content->'color_cards' else '[]'::jsonb end) f where p_page='logo';
$$;
-- Match only tenant-owned published About assets. URLs are canonicalized by the
-- server; legacy URLs may only be retained unchanged, never introduced here.
create function onzio_private.about_editor_asset(p_club_id uuid,p_url text) returns uuid
language sql stable security invoker set search_path='' as $$
 select id from onzio.media_assets where club_id=p_club_id and surface='about'
 and storage_bucket='onzio-media' and status='published' and deleted_at is null
 and split_part(split_part(p_url,'/storage/v1/object/public/onzio-media/',2),'?',1)=storage_path;
$$;
-- Mirror the route registry at the database boundary: a route must be both
-- supported by the current template and present in its published navigation.
create function onzio_private.about_editor_destination(p_club_id uuid,p_href text) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare template text; supported text[]; defaults text[]; route text; configuration jsonb; pointer uuid;
begin
 template:=coalesce(onzio_private.homepage_design(p_club_id)->>'templateKey','cinematic@1');
 if template='academy@1' then return p_href='/schedule'; end if;
 route:=case p_href when '/' then 'home' when '/roster' then 'roster' when '/schedule' then 'schedule'
 when '/club/about' then 'club' when '/club/logo' then 'club-logo' when '/shop' then 'store' when '/sponsors' then 'sponsors'
 when '/staff' then 'staff' when '/standings' then 'standings' when '/stats' then 'stats' when '/tryouts' then 'tryouts'
 when '/programs' then 'programs' when '/contact' then 'contact' else null end;
 if route is null then return false; end if;
 supported:=case template
 when 'heritage@1' then array['home','roster','schedule','club','sponsors','store','standings','stats']
 when 'clubhouse@1' then array['home','roster','schedule','club','store','sponsors','staff','stats']
 when 'editorial@1' then array['home','club','roster','schedule','tryouts','store','contact']
 else array['home','roster','schedule','club','club-logo','store','sponsors'] end;
 defaults:=case template
 when 'heritage@1' then array['home','roster','schedule','club','sponsors','store','standings','stats']
 when 'clubhouse@1' then array['home','roster','schedule','store']
 when 'editorial@1' then array['home','club','roster','schedule','tryouts','store','contact']
 else array['home','roster','schedule','club','club-logo','store'] end;
 if route<>all(supported) then return false; end if;
 if route='store' and not coalesce((select store_enabled from onzio.clubs where id=p_club_id),false) then return false; end if;
 select published_document_id into pointer from onzio.presentation_state where club_id=p_club_id;
 if pointer is null then return route=any(defaults); end if;
 select d.configuration into configuration from onzio.presentation_documents d where d.club_id=p_club_id and d.id=pointer;
 return exists(select 1 from jsonb_array_elements(coalesce(configuration#>'{navigation,groups}','[]')) g,
 jsonb_array_elements_text(coalesce(g->'routes','[]')) r where r=route);
end $$;
create function onzio.load_about_editor(p_club_id uuid,p_page text,p_operation_id uuid default null)
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
 if p_page='logo' and coalesce(onzio_private.homepage_design(p_club_id)->>'templateKey','') in ('academy@1','editorial@1') and receipt is null then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
 return result;
end $$;
create function onzio.save_about_editor(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 p text; c jsonb; old_content jsonb; snapshot jsonb; result jsonb; item jsonb; op uuid;
 hash text; previous_hash text; receipt jsonb; k text; keys text[]; url text;
 first_asset uuid; second_asset uuid; retired jsonb; template text;
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
 template:=coalesce(onzio_private.homepage_design(p_club_id)->>'templateKey','cinematic@1');
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
 if p='logo' and template in ('academy@1','editorial@1') then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
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
 if not onzio_private.about_editor_destination(p_club_id,c->>'closing_cta_href') then raise exception 'INVALID_ABOUT_DESTINATION' using errcode='22023'; end if;
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
revoke all on function onzio_private.about_editor_snapshot(uuid,text) from public,anon;
grant execute on function onzio_private.about_editor_snapshot(uuid,text) to authenticated;
revoke all on function onzio_private.about_editor_urls(jsonb,text) from public,anon;
grant execute on function onzio_private.about_editor_urls(jsonb,text) to authenticated;
revoke all on function onzio_private.about_editor_asset(uuid,text) from public,anon;
grant execute on function onzio_private.about_editor_asset(uuid,text) to authenticated;
revoke all on function onzio.load_about_editor(uuid,text,uuid) from public,anon;
grant execute on function onzio.load_about_editor(uuid,text,uuid) to authenticated;
revoke all on function onzio.save_about_editor(uuid,jsonb) from public,anon;
grant execute on function onzio.save_about_editor(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
revoke all on function onzio_private.about_editor_destination(uuid,text) from public,anon;
grant execute on function onzio_private.about_editor_destination(uuid,text) to authenticated;
