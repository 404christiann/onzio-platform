-- Normal media publication stores photo uploads as photograph, preserving the existing media contract.
create or replace function onzio_private.validate_chick_fil_a_row() returns trigger language plpgsql security invoker set search_path='' as $$ declare slot text;item record;asset uuid;begin
 foreach slot in array array['mealPass','driveThru','freeTicket','enjoyGame','map','restaurant','partner','background'] loop
 begin perform onzio_private.check_homepage_object(new.content#>array['artwork',slot],array['alt'],array['alt']); exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 end loop;
 perform onzio_private.check_chick_fil_a_content(new.content||jsonb_build_object('artwork',onzio_private.chick_fil_a_artwork(to_jsonb(new))));
 for item in select key,value from jsonb_each(onzio_private.chick_fil_a_artwork(to_jsonb(new))) loop
 asset:=(item.value->>'assetId')::uuid;
 if asset is not null and not exists(select 1 from onzio.media_assets where club_id=new.club_id and id=asset and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage' and media_kind=case when item.key='restaurant' then 'photograph' else 'graphic' end) then raise exception 'INVALID_VISITOR_MEDIA' using errcode='22023';end if;
 end loop;return new;end $$;

create or replace function onzio.save_chick_fil_a_editor(p_club_id uuid,p_request jsonb) returns jsonb
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
 if asset is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=asset and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage' and media_kind=case when item.key='restaurant' then 'photograph' else 'graphic' end) then raise exception 'INVALID_VISITOR_MEDIA' using errcode='22023';end if;
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
notify pgrst,'reload schema';
