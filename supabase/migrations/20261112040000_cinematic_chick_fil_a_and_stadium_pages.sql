-- Approved cinematic@2 visitor pages: independent atomic saves; isolated rollout only.
-- cinematic@2 Tickets: independent content/revision, actor receipts, tenant media.
create table onzio.cinematic_chick_fil_a_content (
 club_id uuid primary key references onzio.clubs(id) on delete cascade,
 content jsonb not null, revision bigint not null default 1,
 meal_pass_media_asset_id uuid, drive_thru_media_asset_id uuid, free_ticket_media_asset_id uuid, enjoy_game_media_asset_id uuid, map_media_asset_id uuid, restaurant_media_asset_id uuid, partner_media_asset_id uuid, background_media_asset_id uuid, updated_at timestamptz not null default now(),
 foreign key(club_id,meal_pass_media_asset_id) references onzio.media_assets(club_id,id), foreign key(club_id,drive_thru_media_asset_id) references onzio.media_assets(club_id,id), foreign key(club_id,free_ticket_media_asset_id) references onzio.media_assets(club_id,id), foreign key(club_id,enjoy_game_media_asset_id) references onzio.media_assets(club_id,id), foreign key(club_id,map_media_asset_id) references onzio.media_assets(club_id,id), foreign key(club_id,restaurant_media_asset_id) references onzio.media_assets(club_id,id), foreign key(club_id,partner_media_asset_id) references onzio.media_assets(club_id,id), foreign key(club_id,background_media_asset_id) references onzio.media_assets(club_id,id)
);
alter table onzio.cinematic_chick_fil_a_content enable row level security;
revoke all on onzio.cinematic_chick_fil_a_content from anon,authenticated;
grant select on onzio.cinematic_chick_fil_a_content to anon,authenticated;
grant insert(club_id,content,meal_pass_media_asset_id,drive_thru_media_asset_id,free_ticket_media_asset_id,enjoy_game_media_asset_id,map_media_asset_id,restaurant_media_asset_id,partner_media_asset_id,background_media_asset_id),update(content,meal_pass_media_asset_id,drive_thru_media_asset_id,free_ticket_media_asset_id,enjoy_game_media_asset_id,map_media_asset_id,restaurant_media_asset_id,partner_media_asset_id,background_media_asset_id) on onzio.cinematic_chick_fil_a_content to authenticated;
grant all on onzio.cinematic_chick_fil_a_content to service_role;
create policy chick_fil_a_read on onzio.cinematic_chick_fil_a_content for select to anon,authenticated using(onzio_private.can_read_feature(club_id,'homepage'));
create policy chick_fil_a_insert on onzio.cinematic_chick_fil_a_content for insert to authenticated with check(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2');
create policy chick_fil_a_update on onzio.cinematic_chick_fil_a_content for update to authenticated using(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2') with check(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2');
create function onzio_private.serialize_chick_fil_a_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901296);return null;end $$;
create function onzio_private.advance_chick_fil_a_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=case when tg_op='INSERT' then 1 else old.revision+1 end;new.updated_at:=now();return new;end $$;
revoke all on function onzio_private.serialize_chick_fil_a_write(),onzio_private.advance_chick_fil_a_revision() from public,anon;
grant execute on function onzio_private.serialize_chick_fil_a_write(),onzio_private.advance_chick_fil_a_revision() to authenticated,service_role;
create trigger serialize_chick_fil_a before insert or update or delete on onzio.cinematic_chick_fil_a_content for each statement execute function onzio_private.serialize_chick_fil_a_write();
create trigger advance_chick_fil_a before insert or update on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.advance_chick_fil_a_revision();
create trigger audit_chick_fil_a after insert or update or delete on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.audit_content_mutation();
create trigger guard_meal_pass_media_asset_id before insert or update of meal_pass_media_asset_id on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.guard_media_reference('meal_pass_media_asset_id','asset');
create trigger guard_drive_thru_media_asset_id before insert or update of drive_thru_media_asset_id on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.guard_media_reference('drive_thru_media_asset_id','asset');
create trigger guard_free_ticket_media_asset_id before insert or update of free_ticket_media_asset_id on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.guard_media_reference('free_ticket_media_asset_id','asset');
create trigger guard_enjoy_game_media_asset_id before insert or update of enjoy_game_media_asset_id on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.guard_media_reference('enjoy_game_media_asset_id','asset');
create trigger guard_map_media_asset_id before insert or update of map_media_asset_id on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.guard_media_reference('map_media_asset_id','asset');
create trigger guard_restaurant_media_asset_id before insert or update of restaurant_media_asset_id on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.guard_media_reference('restaurant_media_asset_id','asset');
create trigger guard_partner_media_asset_id before insert or update of partner_media_asset_id on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.guard_media_reference('partner_media_asset_id','asset');
create trigger guard_background_media_asset_id before insert or update of background_media_asset_id on onzio.cinematic_chick_fil_a_content for each row execute function onzio_private.guard_media_reference('background_media_asset_id','asset');
create table onzio_private.chick_fil_a_save_receipts (
 club_id uuid not null references onzio.clubs(id) on delete cascade, actor_id uuid not null references auth.users(id),
 operation_id uuid not null,request_hash text not null,response jsonb not null,
 created_at timestamptz not null default now(),primary key(club_id,actor_id,operation_id)
);
alter table onzio_private.chick_fil_a_save_receipts enable row level security;
grant select,insert on onzio_private.chick_fil_a_save_receipts to authenticated;
create policy chick_fil_a_receipt_read on onzio_private.chick_fil_a_save_receipts for select to authenticated
 using(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));
create policy chick_fil_a_receipt_insert on onzio_private.chick_fil_a_save_receipts for insert to authenticated
 with check(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));
create function onzio_private.chick_fil_a_artwork(r jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$ select jsonb_build_object('mealPass',jsonb_build_object('assetId',r->'meal_pass_media_asset_id','alt',coalesce(r#>'{content,artwork,mealPass,alt}','""'::jsonb)),'driveThru',jsonb_build_object('assetId',r->'drive_thru_media_asset_id','alt',coalesce(r#>'{content,artwork,driveThru,alt}','""'::jsonb)),'freeTicket',jsonb_build_object('assetId',r->'free_ticket_media_asset_id','alt',coalesce(r#>'{content,artwork,freeTicket,alt}','""'::jsonb)),'enjoyGame',jsonb_build_object('assetId',r->'enjoy_game_media_asset_id','alt',coalesce(r#>'{content,artwork,enjoyGame,alt}','""'::jsonb)),'map',jsonb_build_object('assetId',r->'map_media_asset_id','alt',coalesce(r#>'{content,artwork,map,alt}','""'::jsonb)),'restaurant',jsonb_build_object('assetId',r->'restaurant_media_asset_id','alt',coalesce(r#>'{content,artwork,restaurant,alt}','""'::jsonb)),'partner',jsonb_build_object('assetId',r->'partner_media_asset_id','alt',coalesce(r#>'{content,artwork,partner,alt}','""'::jsonb)),'background',jsonb_build_object('assetId',r->'background_media_asset_id','alt',coalesce(r#>'{content,artwork,background,alt}','""'::jsonb)));$$;
create function onzio_private.chick_fil_a_snapshot(p_club_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('revision',coalesce(r->>'revision','0'),
 'designRevision',onzio_private.homepage_design(p_club_id)->>'designRevision',
 'content',case when r is null then null else (r->'content')||jsonb_build_object('artwork',onzio_private.chick_fil_a_artwork(r)) end,
 'media',coalesce((select jsonb_agg(jsonb_build_object('id',id,'storage_bucket',storage_bucket,'storage_path',storage_path,'width',width,'height',height))
 from onzio.media_assets where club_id=p_club_id and status='published' and deleted_at is null
 and id in(select (value->>'assetId')::uuid from jsonb_each(onzio_private.chick_fil_a_artwork(r)))),'[]'::jsonb))
 from (select (select to_jsonb(t) from onzio.cinematic_chick_fil_a_content t where club_id=p_club_id) as r) s;
$$;
create function onzio_private.check_chick_fil_a_content(c jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$ declare k text;a jsonb;v jsonb;asset uuid;begin
perform onzio_private.check_homepage_object(c,array['title','subtitle','detailsHeading','detailsBody','stepLabels','stepNumbers','sections','artwork'],array['title','subtitle','detailsHeading','detailsBody','stepLabels','stepNumbers','sections','artwork']);
perform onzio_private.check_cinematic_text(c->'title',120);
perform onzio_private.check_cinematic_text(c->'subtitle',120);
perform onzio_private.check_cinematic_text(c->'detailsHeading',120);
perform onzio_private.check_cinematic_text(c->'detailsBody',4000);
if jsonb_typeof(c->'stepLabels') is distinct from 'array' or jsonb_array_length(c->'stepLabels')<>3 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;for v in select * from jsonb_array_elements(c->'stepLabels') loop perform onzio_private.check_cinematic_text(v,120); end loop;
if jsonb_typeof(c->'stepNumbers') is distinct from 'array' or jsonb_array_length(c->'stepNumbers')<>3 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;for v in select * from jsonb_array_elements(c->'stepNumbers') loop perform onzio_private.check_cinematic_text(v,12); end loop;
perform onzio_private.check_homepage_object(c->'sections',array['heading','details','steps','map','match','restaurant'],array['heading','details','steps','map','match','restaurant']);
foreach k in array array['heading','details','steps','map','match','restaurant'] loop if jsonb_typeof((c->'sections')->k) is distinct from 'boolean' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;end loop;
perform onzio_private.check_homepage_object(c->'artwork',array['mealPass','driveThru','freeTicket','enjoyGame','map','restaurant','partner','background'],array['mealPass','driveThru','freeTicket','enjoyGame','map','restaurant','partner','background']);
 for a in select value from jsonb_each(c->'artwork') loop
 perform onzio_private.check_homepage_object(a,array['assetId','alt'],array['assetId','alt']);
 if jsonb_typeof(a->'assetId') not in ('string','null') then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 if jsonb_typeof(a->'assetId')='string' and (a->>'assetId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 asset:=(a->>'assetId')::uuid;perform onzio_private.check_cinematic_text(a->'alt',1000);
 end loop;
exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end $$;
-- Direct/legacy writes obey the same shape and media rules as the Save RPC.
create function onzio_private.validate_chick_fil_a_row() returns trigger language plpgsql security invoker set search_path='' as $$ declare slot text;item record;asset uuid;begin
 foreach slot in array array['mealPass','driveThru','freeTicket','enjoyGame','map','restaurant','partner','background'] loop
 begin perform onzio_private.check_homepage_object(new.content#>array['artwork',slot],array['alt'],array['alt']); exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 end loop;
 perform onzio_private.check_chick_fil_a_content(new.content||jsonb_build_object('artwork',onzio_private.chick_fil_a_artwork(to_jsonb(new))));
 for item in select key,value from jsonb_each(onzio_private.chick_fil_a_artwork(to_jsonb(new))) loop
 asset:=(item.value->>'assetId')::uuid;
 if asset is not null and not exists(select 1 from onzio.media_assets where club_id=new.club_id and id=asset and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage' and media_kind=case when item.key='restaurant' then 'photo' else 'graphic' end) then raise exception 'INVALID_VISITOR_MEDIA' using errcode='22023';end if;
 end loop;return new;end $$;
revoke all on function onzio_private.validate_chick_fil_a_row() from public,anon;
grant execute on function onzio_private.validate_chick_fil_a_row() to authenticated,service_role;
create trigger validate_chick_fil_a before insert or update on onzio.cinematic_chick_fil_a_content
 for each row execute function onzio_private.validate_chick_fil_a_row();


create function onzio.load_chick_fil_a_editor(p_club_id uuid,p_operation_id uuid default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare result jsonb;receipt jsonb;
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901296);
 if not onzio_private.can_mutate_feature(p_club_id,'homepage') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select response into receipt from onzio_private.chick_fil_a_save_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
 if receipt is null and onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 result:=onzio_private.chick_fil_a_snapshot(p_club_id);
 if p_operation_id is not null then result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);end if;
 return result;end $$;
create function onzio.save_chick_fil_a_editor(p_club_id uuid,p_request jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare c jsonb;s jsonb;result jsonb;op uuid;hash text;previous_hash text;receipt jsonb;k text;asset uuid;old_ids uuid[];new_ids uuid[];retired uuid[];stored jsonb;item record;
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901296);
 if not onzio_private.can_mutate_feature(p_club_id,'homepage') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 perform onzio_private.check_homepage_object(p_request,array['operationId','expectedRevision','designRevision','content','retiredMediaAssetIds'],array['operationId','expectedRevision','designRevision','content']);
 if jsonb_typeof(p_request->'operationId') is distinct from 'string' or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
 or p_request->>'expectedRevision'!~'^[0-9]+$' or length(p_request->>'expectedRevision')>20 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 perform onzio_private.check_cinematic_text(p_request->'designRevision',100);if p_request->>'designRevision'='' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 begin op:=(p_request->>'operationId')::uuid;exception when invalid_text_representation then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 if op is null then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 c:=p_request->'content';perform onzio_private.check_chick_fil_a_content(c);
 if p_request ? 'retiredMediaAssetIds' then
 if jsonb_typeof(p_request->'retiredMediaAssetIds') is distinct from 'array' or jsonb_array_length(p_request->'retiredMediaAssetIds')>100 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 for k in select jsonb_array_elements_text(p_request->'retiredMediaAssetIds') loop
 if k is null or k!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 begin asset:=k::uuid;exception when invalid_text_representation then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 end loop;end if;
 hash:=md5(p_request::text);
 select request_hash,response into previous_hash,receipt from onzio_private.chick_fil_a_save_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=op;
 if found then if hash<>previous_hash then raise exception 'OPERATION_REUSED' using errcode='22023';end if;return receipt;end if;
 if onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 s:=onzio_private.chick_fil_a_snapshot(p_club_id);
 if s->>'designRevision' is distinct from p_request->>'designRevision' then raise exception 'DESIGN_CHANGED' using errcode='22023';end if;
 if s->>'revision' is distinct from p_request->>'expectedRevision' then raise exception 'VISITOR_PAGE_CHANGED' using errcode='22023';end if;
 select array_agg((value->>'assetId')::uuid) into old_ids from jsonb_each(coalesce(s#>'{content,artwork}','{}'));
 select array_agg((value->>'assetId')::uuid) into new_ids from jsonb_each(c->'artwork');
 for item in select key,value from jsonb_each(c->'artwork') loop
 asset:=(item.value->>'assetId')::uuid;
 if asset is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=asset and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage' and media_kind=case when item.key='restaurant' then 'photo' else 'graphic' end) then raise exception 'INVALID_VISITOR_MEDIA' using errcode='22023';end if;
 end loop;
 stored:=c;
 stored:=stored#-'{artwork,mealPass,assetId}';
 stored:=stored#-'{artwork,driveThru,assetId}';
 stored:=stored#-'{artwork,freeTicket,assetId}';
 stored:=stored#-'{artwork,enjoyGame,assetId}';
 stored:=stored#-'{artwork,map,assetId}';
 stored:=stored#-'{artwork,restaurant,assetId}';
 stored:=stored#-'{artwork,partner,assetId}';
 stored:=stored#-'{artwork,background,assetId}';
 insert into onzio.cinematic_chick_fil_a_content(club_id,content,meal_pass_media_asset_id,drive_thru_media_asset_id,free_ticket_media_asset_id,enjoy_game_media_asset_id,map_media_asset_id,restaurant_media_asset_id,partner_media_asset_id,background_media_asset_id) values(p_club_id,stored,(c#>>'{artwork,mealPass,assetId}')::uuid,(c#>>'{artwork,driveThru,assetId}')::uuid,(c#>>'{artwork,freeTicket,assetId}')::uuid,(c#>>'{artwork,enjoyGame,assetId}')::uuid,(c#>>'{artwork,map,assetId}')::uuid,(c#>>'{artwork,restaurant,assetId}')::uuid,(c#>>'{artwork,partner,assetId}')::uuid,(c#>>'{artwork,background,assetId}')::uuid) on conflict(club_id) do update set content=excluded.content,meal_pass_media_asset_id=excluded.meal_pass_media_asset_id,drive_thru_media_asset_id=excluded.drive_thru_media_asset_id,free_ticket_media_asset_id=excluded.free_ticket_media_asset_id,enjoy_game_media_asset_id=excluded.enjoy_game_media_asset_id,map_media_asset_id=excluded.map_media_asset_id,restaurant_media_asset_id=excluded.restaurant_media_asset_id,partner_media_asset_id=excluded.partner_media_asset_id,background_media_asset_id=excluded.background_media_asset_id;
 select coalesce(array_agg(distinct m.id),'{}') into retired from onzio.media_assets m
 where m.club_id=p_club_id and m.surface='homepage' and m.status='published' and m.deleted_at is null
 and (m.id=any(coalesce(old_ids,'{}')) or (m.created_by=auth.uid() and m.id::text in(select jsonb_array_elements_text(coalesce(p_request->'retiredMediaAssetIds','[]')))))
 and not (m.id=any(array_remove(coalesce(new_ids,'{}'),null)));
 result:=onzio_private.chick_fil_a_snapshot(p_club_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired));
 insert into onzio_private.chick_fil_a_save_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,hash,result);
 return result;end $$;
revoke all on function onzio_private.chick_fil_a_artwork(jsonb),onzio_private.chick_fil_a_snapshot(uuid),onzio_private.check_chick_fil_a_content(jsonb) from public,anon;
grant execute on function onzio_private.chick_fil_a_artwork(jsonb),onzio_private.chick_fil_a_snapshot(uuid),onzio_private.check_chick_fil_a_content(jsonb) to authenticated,service_role;
revoke all on function onzio.load_chick_fil_a_editor(uuid,uuid),onzio.save_chick_fil_a_editor(uuid,jsonb) from public,anon;
grant execute on function onzio.load_chick_fil_a_editor(uuid,uuid),onzio.save_chick_fil_a_editor(uuid,jsonb) to authenticated;



-- cinematic@2 Tickets: independent content/revision, actor receipts, tenant media.
create table onzio.cinematic_stadium_content (
 club_id uuid primary key references onzio.clubs(id) on delete cascade,
 content jsonb not null, revision bigint not null default 1,
 bus_media_asset_id uuid, map_media_asset_id uuid, partner_media_asset_id uuid, updated_at timestamptz not null default now(),
 foreign key(club_id,bus_media_asset_id) references onzio.media_assets(club_id,id), foreign key(club_id,map_media_asset_id) references onzio.media_assets(club_id,id), foreign key(club_id,partner_media_asset_id) references onzio.media_assets(club_id,id)
);
alter table onzio.cinematic_stadium_content enable row level security;
revoke all on onzio.cinematic_stadium_content from anon,authenticated;
grant select on onzio.cinematic_stadium_content to anon,authenticated;
grant insert(club_id,content,bus_media_asset_id,map_media_asset_id,partner_media_asset_id),update(content,bus_media_asset_id,map_media_asset_id,partner_media_asset_id) on onzio.cinematic_stadium_content to authenticated;
grant all on onzio.cinematic_stadium_content to service_role;
create policy stadium_read on onzio.cinematic_stadium_content for select to anon,authenticated using(onzio_private.can_read_feature(club_id,'homepage'));
create policy stadium_insert on onzio.cinematic_stadium_content for insert to authenticated with check(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2');
create policy stadium_update on onzio.cinematic_stadium_content for update to authenticated using(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2') with check(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2');
create function onzio_private.serialize_stadium_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901297);return null;end $$;
create function onzio_private.advance_stadium_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=case when tg_op='INSERT' then 1 else old.revision+1 end;new.updated_at:=now();return new;end $$;
revoke all on function onzio_private.serialize_stadium_write(),onzio_private.advance_stadium_revision() from public,anon;
grant execute on function onzio_private.serialize_stadium_write(),onzio_private.advance_stadium_revision() to authenticated,service_role;
create trigger serialize_stadium before insert or update or delete on onzio.cinematic_stadium_content for each statement execute function onzio_private.serialize_stadium_write();
create trigger advance_stadium before insert or update on onzio.cinematic_stadium_content for each row execute function onzio_private.advance_stadium_revision();
create trigger audit_stadium after insert or update or delete on onzio.cinematic_stadium_content for each row execute function onzio_private.audit_content_mutation();
create trigger guard_bus_media_asset_id before insert or update of bus_media_asset_id on onzio.cinematic_stadium_content for each row execute function onzio_private.guard_media_reference('bus_media_asset_id','asset');
create trigger guard_map_media_asset_id before insert or update of map_media_asset_id on onzio.cinematic_stadium_content for each row execute function onzio_private.guard_media_reference('map_media_asset_id','asset');
create trigger guard_partner_media_asset_id before insert or update of partner_media_asset_id on onzio.cinematic_stadium_content for each row execute function onzio_private.guard_media_reference('partner_media_asset_id','asset');
create table onzio_private.stadium_save_receipts (
 club_id uuid not null references onzio.clubs(id) on delete cascade, actor_id uuid not null references auth.users(id),
 operation_id uuid not null,request_hash text not null,response jsonb not null,
 created_at timestamptz not null default now(),primary key(club_id,actor_id,operation_id)
);
alter table onzio_private.stadium_save_receipts enable row level security;
grant select,insert on onzio_private.stadium_save_receipts to authenticated;
create policy stadium_receipt_read on onzio_private.stadium_save_receipts for select to authenticated
 using(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));
create policy stadium_receipt_insert on onzio_private.stadium_save_receipts for insert to authenticated
 with check(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));
create function onzio_private.stadium_artwork(r jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$ select jsonb_build_object('bus',jsonb_build_object('assetId',r->'bus_media_asset_id','alt',coalesce(r#>'{content,artwork,bus,alt}','""'::jsonb)),'map',jsonb_build_object('assetId',r->'map_media_asset_id','alt',coalesce(r#>'{content,artwork,map,alt}','""'::jsonb)),'partner',jsonb_build_object('assetId',r->'partner_media_asset_id','alt',coalesce(r#>'{content,artwork,partner,alt}','""'::jsonb)));$$;
create function onzio_private.stadium_snapshot(p_club_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('revision',coalesce(r->>'revision','0'),
 'designRevision',onzio_private.homepage_design(p_club_id)->>'designRevision',
 'content',case when r is null then null else (r->'content')||jsonb_build_object('artwork',onzio_private.stadium_artwork(r)) end,
 'media',coalesce((select jsonb_agg(jsonb_build_object('id',id,'storage_bucket',storage_bucket,'storage_path',storage_path,'width',width,'height',height))
 from onzio.media_assets where club_id=p_club_id and status='published' and deleted_at is null
 and id in(select (value->>'assetId')::uuid from jsonb_each(onzio_private.stadium_artwork(r)))),'[]'::jsonb))
 from (select (select to_jsonb(t) from onzio.cinematic_stadium_content t where club_id=p_club_id) as r) s;
$$;
create function onzio_private.check_stadium_content(c jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$ declare k text;a jsonb;v jsonb;asset uuid;begin
perform onzio_private.check_homepage_object(c,array['title','subtitle','showHeading','showMap','showSections','showMatch','showBenefits','includesHeading','benefits','benefitsNote','sections','phoneMapLayout','phoneCardCrop','phoneMapCrop','artwork'],array['title','subtitle','showHeading','showMap','showSections','showMatch','showBenefits','includesHeading','benefits','benefitsNote','sections','phoneMapLayout','phoneCardCrop','phoneMapCrop','artwork']);
perform onzio_private.check_cinematic_text(c->'title',120);
perform onzio_private.check_cinematic_text(c->'subtitle',120);
perform onzio_private.check_cinematic_text(c->'includesHeading',120);
perform onzio_private.check_cinematic_text(c->'benefitsNote',4000);
foreach k in array array['showHeading','showMap','showSections','showMatch','showBenefits'] loop if jsonb_typeof(c->k) is distinct from 'boolean' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;end loop;
if jsonb_typeof(c->'phoneMapLayout') is distinct from 'string' or c->>'phoneMapLayout' not in('full','split') then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
perform onzio_private.check_homepage_object(c->'phoneCardCrop',array['x','y','width','height'],array['x','y','width','height']);
for v in select value from jsonb_each(c->'phoneCardCrop') loop if jsonb_typeof(v) is distinct from 'number' or v::text::numeric not between 0 and 1 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;end loop;
if (c#>>'{phoneCardCrop,width}')::numeric<=0 or (c#>>'{phoneCardCrop,height}')::numeric<=0 or (c#>>'{phoneCardCrop,x}')::numeric+(c#>>'{phoneCardCrop,width}')::numeric>1.0000000001 or (c#>>'{phoneCardCrop,y}')::numeric+(c#>>'{phoneCardCrop,height}')::numeric>1.0000000001 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
perform onzio_private.check_homepage_object(c->'phoneMapCrop',array['x','y','width','height'],array['x','y','width','height']);
for v in select value from jsonb_each(c->'phoneMapCrop') loop if jsonb_typeof(v) is distinct from 'number' or v::text::numeric not between 0 and 1 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;end loop;
if (c#>>'{phoneMapCrop,width}')::numeric<=0 or (c#>>'{phoneMapCrop,height}')::numeric<=0 or (c#>>'{phoneMapCrop,x}')::numeric+(c#>>'{phoneMapCrop,width}')::numeric>1.0000000001 or (c#>>'{phoneMapCrop,y}')::numeric+(c#>>'{phoneMapCrop,height}')::numeric>1.0000000001 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
if jsonb_typeof(c->'benefits') is distinct from 'array' or jsonb_array_length(c->'benefits')>10 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;for v in select * from jsonb_array_elements(c->'benefits') loop
perform onzio_private.check_homepage_object(v,array['title','detail'],array['title','detail']);perform onzio_private.check_cinematic_text(v->'title',120);perform onzio_private.check_cinematic_text(v->'detail',4000);end loop;
if jsonb_typeof(c->'sections') is distinct from 'array' or jsonb_array_length(c->'sections')>12 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
if (select count(*) from jsonb_array_elements(c->'sections'))<>(select count(distinct value->>'id') from jsonb_array_elements(c->'sections')) then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
for v in select * from jsonb_array_elements(c->'sections') loop
perform onzio_private.check_homepage_object(v,array['id','heading','body','note','bullets','visible'],array['id','heading','body','note','bullets','visible']);perform onzio_private.check_cinematic_text(v->'id',60);if v->>'id'!~'^[a-z0-9-]{1,60}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;perform onzio_private.check_cinematic_text(v->'heading',120);perform onzio_private.check_cinematic_text(v->'body',4000);perform onzio_private.check_cinematic_text(v->'note',4000);if jsonb_typeof(v->'visible') is distinct from 'boolean' or jsonb_typeof(v->'bullets') is distinct from 'array' or jsonb_array_length(v->'bullets')>20 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;for a in select * from jsonb_array_elements(v->'bullets') loop perform onzio_private.check_cinematic_text(a,4000);end loop;end loop;

perform onzio_private.check_homepage_object(c->'artwork',array['bus','map','partner'],array['bus','map','partner']);
 for a in select value from jsonb_each(c->'artwork') loop
 perform onzio_private.check_homepage_object(a,array['assetId','alt'],array['assetId','alt']);
 if jsonb_typeof(a->'assetId') not in ('string','null') then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 if jsonb_typeof(a->'assetId')='string' and (a->>'assetId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 asset:=(a->>'assetId')::uuid;perform onzio_private.check_cinematic_text(a->'alt',1000);
 end loop;
exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end $$;
-- Direct/legacy writes obey the same shape and media rules as the Save RPC.
create function onzio_private.validate_stadium_row() returns trigger language plpgsql security invoker set search_path='' as $$ declare slot text;item record;asset uuid;begin
 foreach slot in array array['bus','map','partner'] loop
 begin perform onzio_private.check_homepage_object(new.content#>array['artwork',slot],array['alt'],array['alt']); exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 end loop;
 perform onzio_private.check_stadium_content(new.content||jsonb_build_object('artwork',onzio_private.stadium_artwork(to_jsonb(new))));
 for item in select key,value from jsonb_each(onzio_private.stadium_artwork(to_jsonb(new))) loop
 asset:=(item.value->>'assetId')::uuid;
 if asset is not null and not exists(select 1 from onzio.media_assets where club_id=new.club_id and id=asset and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage' and media_kind='graphic') then raise exception 'INVALID_VISITOR_MEDIA' using errcode='22023';end if;
 end loop;return new;end $$;
revoke all on function onzio_private.validate_stadium_row() from public,anon;
grant execute on function onzio_private.validate_stadium_row() to authenticated,service_role;
create trigger validate_stadium before insert or update on onzio.cinematic_stadium_content
 for each row execute function onzio_private.validate_stadium_row();


create function onzio.load_stadium_editor(p_club_id uuid,p_operation_id uuid default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare result jsonb;receipt jsonb;
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901297);
 if not onzio_private.can_mutate_feature(p_club_id,'homepage') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select response into receipt from onzio_private.stadium_save_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
 if receipt is null and onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 result:=onzio_private.stadium_snapshot(p_club_id);
 if p_operation_id is not null then result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);end if;
 return result;end $$;
create function onzio.save_stadium_editor(p_club_id uuid,p_request jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare c jsonb;s jsonb;result jsonb;op uuid;hash text;previous_hash text;receipt jsonb;k text;asset uuid;old_ids uuid[];new_ids uuid[];retired uuid[];stored jsonb;item record;
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901297);
 if not onzio_private.can_mutate_feature(p_club_id,'homepage') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 perform onzio_private.check_homepage_object(p_request,array['operationId','expectedRevision','designRevision','content','retiredMediaAssetIds'],array['operationId','expectedRevision','designRevision','content']);
 if jsonb_typeof(p_request->'operationId') is distinct from 'string' or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
 or p_request->>'expectedRevision'!~'^[0-9]+$' or length(p_request->>'expectedRevision')>20 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 perform onzio_private.check_cinematic_text(p_request->'designRevision',100);if p_request->>'designRevision'='' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 begin op:=(p_request->>'operationId')::uuid;exception when invalid_text_representation then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 if op is null then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 c:=p_request->'content';perform onzio_private.check_stadium_content(c);
 if p_request ? 'retiredMediaAssetIds' then
 if jsonb_typeof(p_request->'retiredMediaAssetIds') is distinct from 'array' or jsonb_array_length(p_request->'retiredMediaAssetIds')>100 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 for k in select jsonb_array_elements_text(p_request->'retiredMediaAssetIds') loop
 if k is null or k!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 begin asset:=k::uuid;exception when invalid_text_representation then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 end loop;end if;
 hash:=md5(p_request::text);
 select request_hash,response into previous_hash,receipt from onzio_private.stadium_save_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=op;
 if found then if hash<>previous_hash then raise exception 'OPERATION_REUSED' using errcode='22023';end if;return receipt;end if;
 if onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 s:=onzio_private.stadium_snapshot(p_club_id);
 if s->>'designRevision' is distinct from p_request->>'designRevision' then raise exception 'DESIGN_CHANGED' using errcode='22023';end if;
 if s->>'revision' is distinct from p_request->>'expectedRevision' then raise exception 'VISITOR_PAGE_CHANGED' using errcode='22023';end if;
 select array_agg((value->>'assetId')::uuid) into old_ids from jsonb_each(coalesce(s#>'{content,artwork}','{}'));
 select array_agg((value->>'assetId')::uuid) into new_ids from jsonb_each(c->'artwork');
 for item in select key,value from jsonb_each(c->'artwork') loop
 asset:=(item.value->>'assetId')::uuid;
 if asset is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=asset and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage' and media_kind='graphic') then raise exception 'INVALID_VISITOR_MEDIA' using errcode='22023';end if;
 end loop;
 stored:=c;
 stored:=stored#-'{artwork,bus,assetId}';
 stored:=stored#-'{artwork,map,assetId}';
 stored:=stored#-'{artwork,partner,assetId}';
 insert into onzio.cinematic_stadium_content(club_id,content,bus_media_asset_id,map_media_asset_id,partner_media_asset_id) values(p_club_id,stored,(c#>>'{artwork,bus,assetId}')::uuid,(c#>>'{artwork,map,assetId}')::uuid,(c#>>'{artwork,partner,assetId}')::uuid) on conflict(club_id) do update set content=excluded.content,bus_media_asset_id=excluded.bus_media_asset_id,map_media_asset_id=excluded.map_media_asset_id,partner_media_asset_id=excluded.partner_media_asset_id;
 select coalesce(array_agg(distinct m.id),'{}') into retired from onzio.media_assets m
 where m.club_id=p_club_id and m.surface='homepage' and m.status='published' and m.deleted_at is null
 and (m.id=any(coalesce(old_ids,'{}')) or (m.created_by=auth.uid() and m.id::text in(select jsonb_array_elements_text(coalesce(p_request->'retiredMediaAssetIds','[]')))))
 and not (m.id=any(array_remove(coalesce(new_ids,'{}'),null)));
 result:=onzio_private.stadium_snapshot(p_club_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired));
 insert into onzio_private.stadium_save_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,hash,result);
 return result;end $$;
revoke all on function onzio_private.stadium_artwork(jsonb),onzio_private.stadium_snapshot(uuid),onzio_private.check_stadium_content(jsonb) from public,anon;
grant execute on function onzio_private.stadium_artwork(jsonb),onzio_private.stadium_snapshot(uuid),onzio_private.check_stadium_content(jsonb) to authenticated,service_role;
revoke all on function onzio.load_stadium_editor(uuid,uuid),onzio.save_stadium_editor(uuid,jsonb) from public,anon;
grant execute on function onzio.load_stadium_editor(uuid,uuid),onzio.save_stadium_editor(uuid,jsonb) to authenticated;



notify pgrst,'reload schema';
