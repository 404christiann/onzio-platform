-- RC2027-ROBINSON-EDITOR: owner-edited Robinson Stadium page (/stadium) for cinematic@2.
-- One row per club, its own revision, actor receipts and Save RPCs, like the Foothill Transit
-- (cinematic_stadium_content) record it replaces as the /stadium source. Mirrors
-- lib/cinematic-robinson-content.ts. Nine image identities live in tenant FK columns guarded by
-- guard_media_reference; the JSON keeps only their descriptions. Reference-safe retirement finds the
-- new FK columns through the catalog. Advisory lock 734901330 is new (Policies 734901320, Partners 734901315).

create table onzio.cinematic_robinson_content (
 club_id uuid primary key references onzio.clubs(id) on delete cascade,
 content jsonb not null, revision bigint not null default 1,
 seating_media_asset_id uuid, lockers_media_asset_id uuid, meal_pass_media_asset_id uuid,
 step_1_media_asset_id uuid, step_2_media_asset_id uuid, step_3_media_asset_id uuid,
 bus_media_asset_id uuid, route_map_media_asset_id uuid, partner_media_asset_id uuid,
 updated_at timestamptz not null default now(),
 foreign key(club_id,seating_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,lockers_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,meal_pass_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,step_1_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,step_2_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,step_3_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,bus_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,route_map_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,partner_media_asset_id) references onzio.media_assets(club_id,id)
);
alter table onzio.cinematic_robinson_content enable row level security;
revoke all on onzio.cinematic_robinson_content from anon,authenticated;
grant select on onzio.cinematic_robinson_content to anon,authenticated;
grant insert(club_id,content,seating_media_asset_id,lockers_media_asset_id,meal_pass_media_asset_id,step_1_media_asset_id,step_2_media_asset_id,step_3_media_asset_id,bus_media_asset_id,route_map_media_asset_id,partner_media_asset_id),
 update(content,seating_media_asset_id,lockers_media_asset_id,meal_pass_media_asset_id,step_1_media_asset_id,step_2_media_asset_id,step_3_media_asset_id,bus_media_asset_id,route_map_media_asset_id,partner_media_asset_id)
 on onzio.cinematic_robinson_content to authenticated;
grant all on onzio.cinematic_robinson_content to service_role;
create policy robinson_read on onzio.cinematic_robinson_content for select to anon,authenticated using(onzio_private.can_read_feature(club_id,'homepage'));
create policy robinson_insert on onzio.cinematic_robinson_content for insert to authenticated
 with check(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2');
create policy robinson_update on onzio.cinematic_robinson_content for update to authenticated
 using(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2')
 with check(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2');

create function onzio_private.serialize_robinson_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901330);return null;end $$;
create function onzio_private.advance_robinson_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=case when tg_op='INSERT' then 1 else old.revision+1 end;new.updated_at:=now();return new;end $$;
revoke all on function onzio_private.serialize_robinson_write(),onzio_private.advance_robinson_revision() from public,anon;
grant execute on function onzio_private.serialize_robinson_write(),onzio_private.advance_robinson_revision() to authenticated,service_role;
create trigger serialize_robinson before insert or update or delete on onzio.cinematic_robinson_content for each statement execute function onzio_private.serialize_robinson_write();
create trigger advance_robinson before insert or update on onzio.cinematic_robinson_content for each row execute function onzio_private.advance_robinson_revision();
create trigger audit_robinson after insert or update or delete on onzio.cinematic_robinson_content for each row execute function onzio_private.audit_content_mutation();
create trigger guard_seating_media_asset_id before insert or update of seating_media_asset_id on onzio.cinematic_robinson_content for each row execute function onzio_private.guard_media_reference('seating_media_asset_id','asset');
create trigger guard_lockers_media_asset_id before insert or update of lockers_media_asset_id on onzio.cinematic_robinson_content for each row execute function onzio_private.guard_media_reference('lockers_media_asset_id','asset');
create trigger guard_meal_pass_media_asset_id before insert or update of meal_pass_media_asset_id on onzio.cinematic_robinson_content for each row execute function onzio_private.guard_media_reference('meal_pass_media_asset_id','asset');
create trigger guard_step_1_media_asset_id before insert or update of step_1_media_asset_id on onzio.cinematic_robinson_content for each row execute function onzio_private.guard_media_reference('step_1_media_asset_id','asset');
create trigger guard_step_2_media_asset_id before insert or update of step_2_media_asset_id on onzio.cinematic_robinson_content for each row execute function onzio_private.guard_media_reference('step_2_media_asset_id','asset');
create trigger guard_step_3_media_asset_id before insert or update of step_3_media_asset_id on onzio.cinematic_robinson_content for each row execute function onzio_private.guard_media_reference('step_3_media_asset_id','asset');
create trigger guard_bus_media_asset_id before insert or update of bus_media_asset_id on onzio.cinematic_robinson_content for each row execute function onzio_private.guard_media_reference('bus_media_asset_id','asset');
create trigger guard_route_map_media_asset_id before insert or update of route_map_media_asset_id on onzio.cinematic_robinson_content for each row execute function onzio_private.guard_media_reference('route_map_media_asset_id','asset');
create trigger guard_partner_media_asset_id before insert or update of partner_media_asset_id on onzio.cinematic_robinson_content for each row execute function onzio_private.guard_media_reference('partner_media_asset_id','asset');

create table onzio_private.robinson_save_receipts (
 club_id uuid not null references onzio.clubs(id) on delete cascade, actor_id uuid not null references auth.users(id),
 operation_id uuid not null,request_hash text not null,response jsonb not null,
 created_at timestamptz not null default now(),primary key(club_id,actor_id,operation_id)
);
alter table onzio_private.robinson_save_receipts enable row level security;
grant select,insert on onzio_private.robinson_save_receipts to authenticated;
create policy robinson_receipt_read on onzio_private.robinson_save_receipts for select to authenticated
 using(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));
create policy robinson_receipt_insert on onzio_private.robinson_save_receipts for insert to authenticated
 with check(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));

-- Editor shape of a stored row's images: identities from the tenant FK columns, descriptions from the JSON.
create function onzio_private.robinson_images(r jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$ select jsonb_build_object(
 'seating',jsonb_build_object('assetId',r->'seating_media_asset_id','alt',coalesce(r#>'{content,images,seating,alt}','""'::jsonb)),
 'lockers',jsonb_build_object('assetId',r->'lockers_media_asset_id','alt',coalesce(r#>'{content,images,lockers,alt}','""'::jsonb)),
 'mealPass',jsonb_build_object('assetId',r->'meal_pass_media_asset_id','alt',coalesce(r#>'{content,images,mealPass,alt}','""'::jsonb)),
 'step1',jsonb_build_object('assetId',r->'step_1_media_asset_id','alt',coalesce(r#>'{content,images,step1,alt}','""'::jsonb)),
 'step2',jsonb_build_object('assetId',r->'step_2_media_asset_id','alt',coalesce(r#>'{content,images,step2,alt}','""'::jsonb)),
 'step3',jsonb_build_object('assetId',r->'step_3_media_asset_id','alt',coalesce(r#>'{content,images,step3,alt}','""'::jsonb)),
 'bus',jsonb_build_object('assetId',r->'bus_media_asset_id','alt',coalesce(r#>'{content,images,bus,alt}','""'::jsonb)),
 'routeMap',jsonb_build_object('assetId',r->'route_map_media_asset_id','alt',coalesce(r#>'{content,images,routeMap,alt}','""'::jsonb)),
 'partner',jsonb_build_object('assetId',r->'partner_media_asset_id','alt',coalesce(r#>'{content,images,partner,alt}','""'::jsonb)));$$;
create function onzio_private.robinson_snapshot(p_club_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('revision',coalesce(r->>'revision','0'),
 'designRevision',onzio_private.homepage_design(p_club_id)->>'designRevision',
 'content',case when r is null then null else (r->'content')||jsonb_build_object('images',onzio_private.robinson_images(r)) end,
 'media',coalesce((select jsonb_agg(jsonb_build_object('id',id,'storage_bucket',storage_bucket,'storage_path',storage_path,'width',width,'height',height) order by id)
 from onzio.media_assets where club_id=p_club_id and status='published' and deleted_at is null
 and id in(select (value->>'assetId')::uuid from jsonb_each(onzio_private.robinson_images(r)))),'[]'::jsonb))
 from (select (select to_jsonb(t) from onzio.cinematic_robinson_content t where club_id=p_club_id) as r) s;
$$;

-- Array of strings: type first, then length, then each item.
create function onzio_private.check_robinson_texts(v jsonb,max_items integer,max_length integer) returns void language plpgsql immutable security invoker set search_path='' as $$
declare t jsonb;begin
 if jsonb_typeof(v) is distinct from 'array' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 if jsonb_array_length(v)>max_items then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 for t in select value from jsonb_array_elements(v) loop perform onzio_private.check_cinematic_text(t,max_length);end loop;
end $$;
create function onzio_private.check_robinson_visible(v jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$
begin if jsonb_typeof(v->'visible') is distinct from 'boolean' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;end $$;

create function onzio_private.check_robinson_content(c jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$
declare v jsonb;b jsonb;slot text;slots text[]:=array['seating','lockers','mealPass','step1','step2','step3','bus','routeMap','partner'];begin
 perform onzio_private.check_homepage_object(c,array['heading','seating','story','info','match','lockers','food','route','directions','images'],array['heading','seating','story','info','match','lockers','food','route','directions','images']);
 v:=c->'heading';perform onzio_private.check_homepage_object(v,array['visible','title','subtitle'],array['visible','title','subtitle']);
 perform onzio_private.check_robinson_visible(v);perform onzio_private.check_cinematic_text(v->'title',120);perform onzio_private.check_cinematic_text(v->'subtitle',120);
 v:=c->'seating';perform onzio_private.check_homepage_object(v,array['visible','caption','expandLabel'],array['visible','caption','expandLabel']);
 perform onzio_private.check_robinson_visible(v);perform onzio_private.check_cinematic_text(v->'caption',120);perform onzio_private.check_cinematic_text(v->'expandLabel',120);
 v:=c->'story';perform onzio_private.check_homepage_object(v,array['visible','paragraphs','quote','attribution'],array['visible','paragraphs','quote','attribution']);
 perform onzio_private.check_robinson_visible(v);perform onzio_private.check_robinson_texts(v->'paragraphs',8,4000);
 perform onzio_private.check_cinematic_text(v->'quote',4000);perform onzio_private.check_cinematic_text(v->'attribution',120);
 v:=c->'info';perform onzio_private.check_homepage_object(v,array['visible','heading','note','rows'],array['visible','heading','note','rows']);
 perform onzio_private.check_robinson_visible(v);perform onzio_private.check_cinematic_text(v->'heading',120);perform onzio_private.check_cinematic_text(v->'note',120);
 if jsonb_typeof(v->'rows') is distinct from 'array' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 if jsonb_array_length(v->'rows')>12 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 for b in select value from jsonb_array_elements(v->'rows') loop
  perform onzio_private.check_homepage_object(b,array['label','available'],array['label','available']);
  perform onzio_private.check_cinematic_text(b->'label',120);
  if jsonb_typeof(b->'available') is distinct from 'boolean' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 end loop;
 foreach slot in array array['match','lockers'] loop
  perform onzio_private.check_homepage_object(c->slot,array['visible'],array['visible']);perform onzio_private.check_robinson_visible(c->slot);
 end loop;
 v:=c->'food';perform onzio_private.check_homepage_object(v,array['visible','heading','body','steps'],array['visible','heading','body','steps']);
 perform onzio_private.check_robinson_visible(v);perform onzio_private.check_cinematic_text(v->'heading',120);perform onzio_private.check_cinematic_text(v->'body',4000);
 if jsonb_typeof(v->'steps') is distinct from 'array' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 if jsonb_array_length(v->'steps')<>3 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 for b in select value from jsonb_array_elements(v->'steps') loop
  perform onzio_private.check_homepage_object(b,array['label'],array['label']);perform onzio_private.check_cinematic_text(b->'label',120);
 end loop;
 v:=c->'route';perform onzio_private.check_homepage_object(v,array['visible','heading','subheading'],array['visible','heading','subheading']);
 perform onzio_private.check_robinson_visible(v);perform onzio_private.check_cinematic_text(v->'heading',120);perform onzio_private.check_cinematic_text(v->'subheading',120);
 v:=c->'directions';perform onzio_private.check_homepage_object(v,array['visible','blocks'],array['visible','blocks']);perform onzio_private.check_robinson_visible(v);
 if jsonb_typeof(v->'blocks') is distinct from 'array' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 if jsonb_array_length(v->'blocks')>12 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 for b in select value from jsonb_array_elements(v->'blocks') loop
  perform onzio_private.check_homepage_object(b,array['id','heading','paragraphs','note','bullets','closing'],array['id','heading','paragraphs','note','bullets','closing']);
  perform onzio_private.check_cinematic_text(b->'id',60);
  if b->>'id'!~'^[a-z0-9-]{1,60}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
  perform onzio_private.check_cinematic_text(b->'heading',120);perform onzio_private.check_robinson_texts(b->'paragraphs',8,4000);
  perform onzio_private.check_cinematic_text(b->'note',4000);perform onzio_private.check_robinson_texts(b->'bullets',20,4000);perform onzio_private.check_cinematic_text(b->'closing',4000);
 end loop;
 if (select count(*) from jsonb_array_elements(v->'blocks'))<>(select count(distinct value->>'id') from jsonb_array_elements(v->'blocks')) then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 perform onzio_private.check_homepage_object(c->'images',slots,slots);
 foreach slot in array slots loop
  v:=c#>array['images',slot];
  perform onzio_private.check_homepage_object(v,array['assetId','alt'],array['assetId','alt']);
  if jsonb_typeof(v->'assetId') not in ('string','null') then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
  if jsonb_typeof(v->'assetId')='string' and (v->>'assetId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
  perform onzio_private.check_cinematic_text(v->'alt',1000);
 end loop;
exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end $$;

-- Every image must be this club's published homepage graphic.
create function onzio_private.check_robinson_media(p_club_id uuid,images jsonb) returns void language plpgsql stable security invoker set search_path='' as $$
declare item record;asset uuid;begin
 for item in select key,value from jsonb_each(images) loop
  asset:=(item.value->>'assetId')::uuid;
  if asset is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=asset and status='published' and deleted_at is null
   and storage_bucket='onzio-media' and surface='homepage' and media_kind='graphic') then raise exception 'INVALID_VISITOR_MEDIA' using errcode='22023';end if;
 end loop;
end $$;

-- Direct writes obey the same shape and media rules as the Save RPC.
create function onzio_private.validate_robinson_row() returns trigger language plpgsql security invoker set search_path='' as $$
declare slot text;slots text[]:=array['seating','lockers','mealPass','step1','step2','step3','bus','routeMap','partner'];begin
 begin
  perform onzio_private.check_homepage_object(new.content,array['heading','seating','story','info','match','lockers','food','route','directions','images'],array['images']);
  perform onzio_private.check_homepage_object(new.content->'images',slots,slots);
  foreach slot in array slots loop perform onzio_private.check_homepage_object(new.content#>array['images',slot],array['alt'],array['alt']);end loop;
 exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 perform onzio_private.check_robinson_content(new.content||jsonb_build_object('images',onzio_private.robinson_images(to_jsonb(new))));
 perform onzio_private.check_robinson_media(new.club_id,onzio_private.robinson_images(to_jsonb(new)));
 return new;end $$;
revoke all on function onzio_private.validate_robinson_row() from public,anon;
grant execute on function onzio_private.validate_robinson_row() to authenticated,service_role;
create trigger validate_robinson before insert or update on onzio.cinematic_robinson_content
 for each row execute function onzio_private.validate_robinson_row();

create function onzio.load_robinson_editor(p_club_id uuid,p_operation_id uuid default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare result jsonb;receipt jsonb;
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901330);
 if not onzio_private.can_mutate_feature(p_club_id,'homepage') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select response into receipt from onzio_private.robinson_save_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
 if receipt is null and onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 result:=onzio_private.robinson_snapshot(p_club_id);
 if p_operation_id is not null then result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);end if;
 return result;end $$;

create function onzio.save_robinson_editor(p_club_id uuid,p_request jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare c jsonb;s jsonb;result jsonb;op uuid;hash text;previous_hash text;receipt jsonb;k text;asset uuid;old_ids uuid[];new_ids uuid[];retired uuid[];stored jsonb;slot text;
 slots text[]:=array['seating','lockers','mealPass','step1','step2','step3','bus','routeMap','partner'];
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901330);
 if not onzio_private.can_mutate_feature(p_club_id,'homepage') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 begin perform onzio_private.check_homepage_object(p_request,array['operationId','expectedRevision','designRevision','content','retiredMediaAssetIds'],array['operationId','expectedRevision','designRevision','content']);
 exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 if jsonb_typeof(p_request->'operationId') is distinct from 'string' or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 if p_request->>'expectedRevision'!~'^[0-9]+$' or length(p_request->>'expectedRevision')>20 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 begin perform onzio_private.check_cinematic_text(p_request->'designRevision',100);
 exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 if p_request->>'designRevision'='' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 begin op:=(p_request->>'operationId')::uuid;exception when invalid_text_representation then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 if op is null then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 c:=p_request->'content';perform onzio_private.check_robinson_content(c);
 if p_request ? 'retiredMediaAssetIds' then
 if jsonb_typeof(p_request->'retiredMediaAssetIds') is distinct from 'array' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 if jsonb_array_length(p_request->'retiredMediaAssetIds')>100 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 for k in select jsonb_array_elements_text(p_request->'retiredMediaAssetIds') loop
 if k is null or k!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 end loop;end if;
 hash:=md5(p_request::text);
 select request_hash,response into previous_hash,receipt from onzio_private.robinson_save_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=op;
 if found then if hash<>previous_hash then raise exception 'OPERATION_REUSED' using errcode='22023';end if;return receipt;end if;
 if onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 s:=onzio_private.robinson_snapshot(p_club_id);
 if s->>'designRevision' is distinct from p_request->>'designRevision' then raise exception 'DESIGN_CHANGED' using errcode='22023';end if;
 if s->>'revision' is distinct from p_request->>'expectedRevision' then raise exception 'VISITOR_PAGE_CHANGED' using errcode='22023';end if;
 perform onzio_private.check_robinson_media(p_club_id,c->'images');
 select array_agg((value->>'assetId')::uuid) into old_ids from jsonb_each(coalesce(s#>'{content,images}','{}'));
 select array_agg((value->>'assetId')::uuid) into new_ids from jsonb_each(c->'images');
 stored:=c;
 foreach slot in array slots loop stored:=stored#-array['images',slot,'assetId'];end loop;
 insert into onzio.cinematic_robinson_content(club_id,content,seating_media_asset_id,lockers_media_asset_id,meal_pass_media_asset_id,step_1_media_asset_id,step_2_media_asset_id,step_3_media_asset_id,bus_media_asset_id,route_map_media_asset_id,partner_media_asset_id)
 values(p_club_id,stored,(c#>>'{images,seating,assetId}')::uuid,(c#>>'{images,lockers,assetId}')::uuid,(c#>>'{images,mealPass,assetId}')::uuid,
  (c#>>'{images,step1,assetId}')::uuid,(c#>>'{images,step2,assetId}')::uuid,(c#>>'{images,step3,assetId}')::uuid,
  (c#>>'{images,bus,assetId}')::uuid,(c#>>'{images,routeMap,assetId}')::uuid,(c#>>'{images,partner,assetId}')::uuid)
 on conflict(club_id) do update set content=excluded.content,seating_media_asset_id=excluded.seating_media_asset_id,lockers_media_asset_id=excluded.lockers_media_asset_id,
  meal_pass_media_asset_id=excluded.meal_pass_media_asset_id,step_1_media_asset_id=excluded.step_1_media_asset_id,step_2_media_asset_id=excluded.step_2_media_asset_id,
  step_3_media_asset_id=excluded.step_3_media_asset_id,bus_media_asset_id=excluded.bus_media_asset_id,route_map_media_asset_id=excluded.route_map_media_asset_id,
  partner_media_asset_id=excluded.partner_media_asset_id;
 select coalesce(array_agg(distinct m.id),'{}') into retired from onzio.media_assets m
 where m.club_id=p_club_id and m.surface='homepage' and m.status='published' and m.deleted_at is null
 and (m.id=any(coalesce(old_ids,'{}')) or (m.created_by=auth.uid() and m.id::text in(select jsonb_array_elements_text(coalesce(p_request->'retiredMediaAssetIds','[]')))))
 and not (m.id=any(array_remove(coalesce(new_ids,'{}'),null)));
 result:=onzio_private.robinson_snapshot(p_club_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired));
 insert into onzio_private.robinson_save_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,hash,result);
 return result;end $$;

revoke all on function onzio_private.robinson_images(jsonb),onzio_private.robinson_snapshot(uuid),
 onzio_private.check_robinson_texts(jsonb,integer,integer),onzio_private.check_robinson_visible(jsonb),onzio_private.check_robinson_content(jsonb),
 onzio_private.check_robinson_media(uuid,jsonb) from public,anon;
grant execute on function onzio_private.robinson_images(jsonb),onzio_private.robinson_snapshot(uuid),
 onzio_private.check_robinson_texts(jsonb,integer,integer),onzio_private.check_robinson_visible(jsonb),onzio_private.check_robinson_content(jsonb),
 onzio_private.check_robinson_media(uuid,jsonb) to authenticated,service_role;
revoke all on function onzio.load_robinson_editor(uuid,uuid),onzio.save_robinson_editor(uuid,jsonb) from public,anon;
grant execute on function onzio.load_robinson_editor(uuid,uuid),onzio.save_robinson_editor(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
