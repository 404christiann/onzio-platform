-- cinematic@2 Tickets: independent content/revision, actor receipts, tenant media.
create table onzio.cinematic_tickets_content (
 club_id uuid primary key references onzio.clubs(id) on delete cascade,
 content jsonb not null, revision bigint not null default 1,
 banner_media_asset_id uuid,
 seat_media_asset_id uuid,
 card_media_asset_id uuid,
 raffle_media_asset_id uuid,
 bus_media_asset_id uuid,
 map_media_asset_id uuid,
 partner_media_asset_id uuid,
 updated_at timestamptz not null default now(),
 foreign key(club_id,banner_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,seat_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,card_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,raffle_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,bus_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,map_media_asset_id) references onzio.media_assets(club_id,id),
 foreign key(club_id,partner_media_asset_id) references onzio.media_assets(club_id,id)
);
alter table onzio.cinematic_tickets_content enable row level security;
revoke all on onzio.cinematic_tickets_content from anon,authenticated;
grant select on onzio.cinematic_tickets_content to anon,authenticated;
grant insert(club_id,content,banner_media_asset_id,seat_media_asset_id,card_media_asset_id,raffle_media_asset_id,bus_media_asset_id,map_media_asset_id,partner_media_asset_id),update(content,banner_media_asset_id,seat_media_asset_id,card_media_asset_id,raffle_media_asset_id,bus_media_asset_id,map_media_asset_id,partner_media_asset_id) on onzio.cinematic_tickets_content to authenticated;
grant all on onzio.cinematic_tickets_content to service_role;
create policy tickets_read on onzio.cinematic_tickets_content for select to anon,authenticated
 using(onzio_private.can_read_feature(club_id,'homepage'));
create policy tickets_insert on onzio.cinematic_tickets_content for insert to authenticated
 with check(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2');
create policy tickets_update on onzio.cinematic_tickets_content for update to authenticated
 using(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2')
 with check(onzio_private.can_mutate_feature(club_id,'homepage') and onzio_private.homepage_design(club_id)->>'templateKey'='cinematic@2');
create function onzio_private.serialize_tickets_write() returns trigger
 language plpgsql security invoker set search_path='' as $$
 begin perform pg_catalog.pg_advisory_xact_lock(734901281); perform pg_catalog.pg_advisory_xact_lock(734901294); return null; end $$;
create function onzio_private.advance_tickets_revision() returns trigger
 language plpgsql security invoker set search_path='' as $$
 begin new.revision:=case when tg_op='INSERT' then 1 else old.revision+1 end; new.updated_at:=now();return new;end $$;
revoke all on function onzio_private.serialize_tickets_write() from public,anon;
revoke all on function onzio_private.advance_tickets_revision() from public,anon;
grant execute on function onzio_private.serialize_tickets_write(),onzio_private.advance_tickets_revision() to authenticated,service_role;
create trigger serialize_tickets before insert or update or delete on onzio.cinematic_tickets_content
 for each statement execute function onzio_private.serialize_tickets_write();
create trigger advance_tickets before insert or update on onzio.cinematic_tickets_content
 for each row execute function onzio_private.advance_tickets_revision();
create trigger audit_tickets after insert or update or delete on onzio.cinematic_tickets_content
 for each row execute function onzio_private.audit_content_mutation();
create trigger guard_banner_media_asset_id before insert or update of banner_media_asset_id on onzio.cinematic_tickets_content for each row execute function onzio_private.guard_media_reference('banner_media_asset_id','asset');
create trigger guard_seat_media_asset_id before insert or update of seat_media_asset_id on onzio.cinematic_tickets_content for each row execute function onzio_private.guard_media_reference('seat_media_asset_id','asset');
create trigger guard_card_media_asset_id before insert or update of card_media_asset_id on onzio.cinematic_tickets_content for each row execute function onzio_private.guard_media_reference('card_media_asset_id','asset');
create trigger guard_raffle_media_asset_id before insert or update of raffle_media_asset_id on onzio.cinematic_tickets_content for each row execute function onzio_private.guard_media_reference('raffle_media_asset_id','asset');
create trigger guard_bus_media_asset_id before insert or update of bus_media_asset_id on onzio.cinematic_tickets_content for each row execute function onzio_private.guard_media_reference('bus_media_asset_id','asset');
create trigger guard_map_media_asset_id before insert or update of map_media_asset_id on onzio.cinematic_tickets_content for each row execute function onzio_private.guard_media_reference('map_media_asset_id','asset');
create trigger guard_partner_media_asset_id before insert or update of partner_media_asset_id on onzio.cinematic_tickets_content for each row execute function onzio_private.guard_media_reference('partner_media_asset_id','asset');
create table onzio_private.tickets_save_receipts (
 club_id uuid not null references onzio.clubs(id) on delete cascade, actor_id uuid not null references auth.users(id),
 operation_id uuid not null,request_hash text not null,response jsonb not null,
 created_at timestamptz not null default now(),primary key(club_id,actor_id,operation_id)
);
alter table onzio_private.tickets_save_receipts enable row level security;
grant select,insert on onzio_private.tickets_save_receipts to authenticated;
create policy tickets_receipt_read on onzio_private.tickets_save_receipts for select to authenticated
 using(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));
create policy tickets_receipt_insert on onzio_private.tickets_save_receipts for insert to authenticated
 with check(actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));
create function onzio_private.tickets_artwork(r jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('banner',jsonb_build_object('assetId',r->'banner_media_asset_id','alt',coalesce(r#>'{content,artwork,banner,alt}','""'::jsonb)),
 'seat',jsonb_build_object('assetId',r->'seat_media_asset_id','alt',coalesce(r#>'{content,artwork,seat,alt}','""'::jsonb)),
 'card',jsonb_build_object('assetId',r->'card_media_asset_id','alt',coalesce(r#>'{content,artwork,card,alt}','""'::jsonb)),
 'raffle',jsonb_build_object('assetId',r->'raffle_media_asset_id','alt',coalesce(r#>'{content,artwork,raffle,alt}','""'::jsonb)),
 'bus',jsonb_build_object('assetId',r->'bus_media_asset_id','alt',coalesce(r#>'{content,artwork,bus,alt}','""'::jsonb)),
 'map',jsonb_build_object('assetId',r->'map_media_asset_id','alt',coalesce(r#>'{content,artwork,map,alt}','""'::jsonb)),
 'partner',jsonb_build_object('assetId',r->'partner_media_asset_id','alt',coalesce(r#>'{content,artwork,partner,alt}','""'::jsonb)));
$$;
create function onzio_private.tickets_snapshot(p_club_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('revision',coalesce(r->>'revision','0'),
 'designRevision',onzio_private.homepage_design(p_club_id)->>'designRevision',
 'content',case when r is null then null else (r->'content')||jsonb_build_object('artwork',onzio_private.tickets_artwork(r)) end,
 'media',coalesce((select jsonb_agg(jsonb_build_object('id',id,'storage_bucket',storage_bucket,'storage_path',storage_path,'width',width,'height',height))
 from onzio.media_assets where club_id=p_club_id and status='published' and deleted_at is null
 and id in(select (value->>'assetId')::uuid from jsonb_each(onzio_private.tickets_artwork(r)))),'[]'::jsonb))
 from (select (select to_jsonb(t) from onzio.cinematic_tickets_content t where club_id=p_club_id) as r) s;
$$;
create function onzio_private.check_tickets_content(c jsonb) returns void
 language plpgsql immutable security invoker set search_path='' as $$
 declare k text; a jsonb; v jsonb; asset uuid;
 begin
 perform onzio_private.check_homepage_object(c,array['title','subtitle','perksHeading','includesHeading','benefitsNote','transitHeading','transitSubtitle','directionsHeading','directionsBody','parkingHeading','parkingBody','parkingNote','purchaseUrl','missingPurchaseLabel','perkLabels','benefits','bannerHeightFraction','artwork'],array['title','subtitle','perksHeading','includesHeading','benefitsNote','transitHeading','transitSubtitle','directionsHeading','directionsBody','parkingHeading','parkingBody','parkingNote','purchaseUrl','missingPurchaseLabel','perkLabels','benefits','bannerHeightFraction','artwork']);
 foreach k in array array['title','subtitle','perksHeading','includesHeading','benefitsNote','transitHeading','transitSubtitle','directionsHeading','directionsBody','parkingHeading','parkingBody','parkingNote','purchaseUrl','missingPurchaseLabel'] loop
 perform onzio_private.check_cinematic_text(c->k,case when k='purchaseUrl' then 2000 when k in('benefitsNote','directionsBody','parkingBody','parkingNote') then 4000 else 120 end);
 end loop;
 if c->>'purchaseUrl'<>'' and ((c->>'purchaseUrl')!~'^https://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z0-9-]+(:[0-9]+)?([/?#][^[:space:]\\]*)?$'
 or (c->>'purchaseUrl')~*'^https://(localhost|127[.]|0[.]|[^/]*[.]localhost([:/]|$))')
 then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 if jsonb_typeof(c->'bannerHeightFraction') is distinct from 'number' or (c->>'bannerHeightFraction')::numeric not between 0.5 and 1 then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 if jsonb_typeof(c->'perkLabels') is distinct from 'array' or jsonb_array_length(c->'perkLabels')<>3 then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 for v in select * from jsonb_array_elements(c->'perkLabels') loop perform onzio_private.check_cinematic_text(v,120);end loop;
 if jsonb_typeof(c->'benefits') is distinct from 'array' or jsonb_array_length(c->'benefits')>10 then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 for v in select * from jsonb_array_elements(c->'benefits') loop
 perform onzio_private.check_homepage_object(v,array['title','detail'],array['title','detail']);
 perform onzio_private.check_cinematic_text(v->'title',120);perform onzio_private.check_cinematic_text(v->'detail',4000);end loop;
 perform onzio_private.check_homepage_object(c->'artwork',array['banner','seat','card','raffle','bus','map','partner'],array['banner','seat','card','raffle','bus','map','partner']);
 for a in select value from jsonb_each(c->'artwork') loop
 perform onzio_private.check_homepage_object(a,array['assetId','alt'],array['assetId','alt']);
 if jsonb_typeof(a->'assetId') not in ('string','null') then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 begin asset:=(a->>'assetId')::uuid;exception when invalid_text_representation then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end;
 perform onzio_private.check_cinematic_text(a->'alt',1000);
 end loop;
 end $$;
-- Direct/legacy writes obey the same shape and media rules as the Save RPC.
create function onzio_private.validate_tickets_row() returns trigger
 language plpgsql security invoker set search_path='' as $$
 declare slot text; item jsonb; asset uuid;
 begin
 foreach slot in array array['banner','seat','card','raffle','bus','map','partner'] loop
 perform onzio_private.check_homepage_object(new.content#>array['artwork',slot],array['alt'],array['alt']);
 end loop;
 perform onzio_private.check_tickets_content(new.content||jsonb_build_object('artwork',onzio_private.tickets_artwork(to_jsonb(new))));
 for item in select value from jsonb_each(onzio_private.tickets_artwork(to_jsonb(new))) loop
 asset:=(item->>'assetId')::uuid;
 if asset is not null and not exists(select 1 from onzio.media_assets where club_id=new.club_id and id=asset and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage' and media_kind='graphic') then raise exception 'INVALID_TICKETS_MEDIA' using errcode='22023';end if;
 end loop;
 return new;end $$;
revoke all on function onzio_private.validate_tickets_row() from public,anon;
grant execute on function onzio_private.validate_tickets_row() to authenticated,service_role;
create trigger validate_tickets before insert or update on onzio.cinematic_tickets_content
 for each row execute function onzio_private.validate_tickets_row();


create function onzio.load_tickets_editor(p_club_id uuid,p_operation_id uuid default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare result jsonb;receipt jsonb;
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901294);
 if not onzio_private.can_mutate_feature(p_club_id,'homepage') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select response into receipt from onzio_private.tickets_save_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
 if receipt is null and onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 result:=onzio_private.tickets_snapshot(p_club_id);
 if p_operation_id is not null then result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);end if;
 return result;end $$;
create function onzio.save_tickets_editor(p_club_id uuid,p_request jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare c jsonb;s jsonb;result jsonb;op uuid;hash text;previous_hash text;receipt jsonb;k text;asset uuid;old_ids uuid[];new_ids uuid[];retired uuid[];stored jsonb;
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901294);
 if not onzio_private.can_mutate_feature(p_club_id,'homepage') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 perform onzio_private.check_homepage_object(p_request,array['operationId','expectedRevision','designRevision','content','retiredMediaAssetIds'],array['operationId','expectedRevision','designRevision','content']);
 if jsonb_typeof(p_request->'operationId') is distinct from 'string' or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
 or p_request->>'expectedRevision'!~'^[0-9]+$' or length(p_request->>'expectedRevision')>20 then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 perform onzio_private.check_cinematic_text(p_request->'designRevision',100);
 begin op:=(p_request->>'operationId')::uuid;exception when invalid_text_representation then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end;
 if op is null then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 c:=p_request->'content';perform onzio_private.check_tickets_content(c);
 if p_request ? 'retiredMediaAssetIds' then
 if jsonb_typeof(p_request->'retiredMediaAssetIds') is distinct from 'array' or jsonb_array_length(p_request->'retiredMediaAssetIds')>100 then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 for k in select jsonb_array_elements_text(p_request->'retiredMediaAssetIds') loop
 begin asset:=k::uuid;exception when invalid_text_representation then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end;
 end loop;end if;
 hash:=md5(p_request::text);
 select request_hash,response into previous_hash,receipt from onzio_private.tickets_save_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=op;
 if found then if hash<>previous_hash then raise exception 'OPERATION_REUSED' using errcode='22023';end if;return receipt;end if;
 if onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 s:=onzio_private.tickets_snapshot(p_club_id);
 if s->>'designRevision' is distinct from p_request->>'designRevision' then raise exception 'DESIGN_CHANGED' using errcode='22023';end if;
 if s->>'revision' is distinct from p_request->>'expectedRevision' then raise exception 'TICKETS_CHANGED' using errcode='22023';end if;
 select array_agg((value->>'assetId')::uuid) into old_ids from jsonb_each(coalesce(s#>'{content,artwork}','{}'));
 select array_agg((value->>'assetId')::uuid) into new_ids from jsonb_each(c->'artwork');
 for asset in select x from unnest(new_ids) x where x is not null loop
 if not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=asset and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage' and media_kind='graphic') then raise exception 'INVALID_TICKETS_MEDIA' using errcode='22023';end if;
 end loop;
 stored:=c;
 stored:=stored#-'{artwork,banner,assetId}';
 stored:=stored#-'{artwork,seat,assetId}';
 stored:=stored#-'{artwork,card,assetId}';
 stored:=stored#-'{artwork,raffle,assetId}';
 stored:=stored#-'{artwork,bus,assetId}';
 stored:=stored#-'{artwork,map,assetId}';
 stored:=stored#-'{artwork,partner,assetId}';
 insert into onzio.cinematic_tickets_content(club_id,content,banner_media_asset_id,seat_media_asset_id,card_media_asset_id,raffle_media_asset_id,bus_media_asset_id,map_media_asset_id,partner_media_asset_id)
 values(p_club_id,stored,(c#>>'{artwork,banner,assetId}')::uuid,(c#>>'{artwork,seat,assetId}')::uuid,(c#>>'{artwork,card,assetId}')::uuid,(c#>>'{artwork,raffle,assetId}')::uuid,(c#>>'{artwork,bus,assetId}')::uuid,(c#>>'{artwork,map,assetId}')::uuid,(c#>>'{artwork,partner,assetId}')::uuid)
 on conflict(club_id) do update set content=excluded.content,banner_media_asset_id=excluded.banner_media_asset_id,seat_media_asset_id=excluded.seat_media_asset_id,card_media_asset_id=excluded.card_media_asset_id,raffle_media_asset_id=excluded.raffle_media_asset_id,bus_media_asset_id=excluded.bus_media_asset_id,map_media_asset_id=excluded.map_media_asset_id,partner_media_asset_id=excluded.partner_media_asset_id;
 select coalesce(array_agg(distinct m.id),'{}') into retired from onzio.media_assets m
 where m.club_id=p_club_id and m.surface='homepage' and m.status='published' and m.deleted_at is null
 and (m.id=any(coalesce(old_ids,'{}')) or (m.created_by=auth.uid() and m.id::text in(select jsonb_array_elements_text(coalesce(p_request->'retiredMediaAssetIds','[]')))))
 and not (m.id=any(array_remove(coalesce(new_ids,'{}'),null)));
 result:=onzio_private.tickets_snapshot(p_club_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired));
 insert into onzio_private.tickets_save_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,hash,result);
 return result;end $$;
revoke all on function onzio_private.tickets_artwork(jsonb),onzio_private.tickets_snapshot(uuid),onzio_private.check_tickets_content(jsonb) from public,anon;
grant execute on function onzio_private.tickets_artwork(jsonb),onzio_private.tickets_snapshot(uuid),onzio_private.check_tickets_content(jsonb) to authenticated,service_role;
revoke all on function onzio.load_tickets_editor(uuid,uuid),onzio.save_tickets_editor(uuid,jsonb) from public,anon;
grant execute on function onzio.load_tickets_editor(uuid,uuid),onzio.save_tickets_editor(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';

