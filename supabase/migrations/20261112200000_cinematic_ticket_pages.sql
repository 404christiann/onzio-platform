-- RC2027-TICKET-PAGES: owner-edited Season Ticket Membership (/tickets/season-membership) and
-- Know Before You Go (/tickets/know-before-you-go) for cinematic@2, both in the Tickets menu.
-- One row per club and page with its own revision, actor receipts and Save RPCs, like Robinson Stadium.
-- Mirrors lib/cinematic-ticket-pages-content.ts. The JSON `images` object has one entry per fixed slot and
-- per list item (benefit, price row, match-day tile), keyed by the item's ID, and keeps only descriptions;
-- image identities live in onzio.cinematic_ticket_page_images (tenant FK, guard_media_reference), so the
-- reference-safe retirement finds them through the catalog. Advisory lock 734901340 is new
-- (Robinson and Injury Report 734901330, Policies 734901320, Partners 734901315).

create table onzio.cinematic_ticket_pages (
 club_id uuid not null references onzio.clubs(id) on delete cascade,
 page text not null check (page in ('season-membership','know-before-you-go')),
 content jsonb not null, revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 primary key (club_id, page)
);
create table onzio.cinematic_ticket_page_images (
 club_id uuid not null, page text not null,
 slot text not null check (slot ~ '^[a-z0-9-]{1,60}$'),
 media_asset_id uuid not null,
 primary key (club_id, page, slot),
 foreign key (club_id, page) references onzio.cinematic_ticket_pages(club_id, page) on delete cascade,
 foreign key (club_id, media_asset_id) references onzio.media_assets(club_id, id)
);
create index cinematic_ticket_page_images_media_idx on onzio.cinematic_ticket_page_images(club_id, media_asset_id);

create function onzio_private.can_edit_ticket_pages(p_club_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
 select case when onzio_private.can_mutate_feature(p_club_id,'homepage')
  then onzio_private.homepage_design(p_club_id)->>'templateKey' = 'cinematic@2' else false end;
$$;
revoke all on function onzio_private.can_edit_ticket_pages(uuid) from public, anon;
grant execute on function onzio_private.can_edit_ticket_pages(uuid) to authenticated, service_role;

alter table onzio.cinematic_ticket_pages enable row level security;
alter table onzio.cinematic_ticket_page_images enable row level security;
revoke all on onzio.cinematic_ticket_pages, onzio.cinematic_ticket_page_images from anon, authenticated;
grant select on onzio.cinematic_ticket_pages, onzio.cinematic_ticket_page_images to anon, authenticated;
grant insert(club_id,page,content), update(content) on onzio.cinematic_ticket_pages to authenticated;
grant insert, delete on onzio.cinematic_ticket_page_images to authenticated;
grant all on onzio.cinematic_ticket_pages, onzio.cinematic_ticket_page_images to service_role;
create policy ticket_pages_read on onzio.cinematic_ticket_pages for select to anon, authenticated using (onzio_private.can_read_feature(club_id,'homepage'));
create policy ticket_pages_insert on onzio.cinematic_ticket_pages for insert to authenticated with check (onzio_private.can_edit_ticket_pages(club_id));
create policy ticket_pages_update on onzio.cinematic_ticket_pages for update to authenticated
 using (onzio_private.can_edit_ticket_pages(club_id)) with check (onzio_private.can_edit_ticket_pages(club_id));
create policy ticket_page_images_read on onzio.cinematic_ticket_page_images for select to anon, authenticated using (onzio_private.can_read_feature(club_id,'homepage'));
create policy ticket_page_images_insert on onzio.cinematic_ticket_page_images for insert to authenticated with check (onzio_private.can_edit_ticket_pages(club_id));
create policy ticket_page_images_delete on onzio.cinematic_ticket_page_images for delete to authenticated using (onzio_private.can_edit_ticket_pages(club_id));

create function onzio_private.serialize_ticket_page_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901340);return null;end $$;
create function onzio_private.advance_ticket_page_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=case when tg_op='INSERT' then 1 else old.revision+1 end;new.updated_at:=now();return new;end $$;
revoke all on function onzio_private.serialize_ticket_page_write(),onzio_private.advance_ticket_page_revision() from public,anon;
grant execute on function onzio_private.serialize_ticket_page_write(),onzio_private.advance_ticket_page_revision() to authenticated,service_role;
create trigger serialize_ticket_pages before insert or update or delete on onzio.cinematic_ticket_pages for each statement execute function onzio_private.serialize_ticket_page_write();
create trigger serialize_ticket_page_images before insert or update or delete on onzio.cinematic_ticket_page_images for each statement execute function onzio_private.serialize_ticket_page_write();
create trigger advance_ticket_pages before insert or update on onzio.cinematic_ticket_pages for each row execute function onzio_private.advance_ticket_page_revision();
create trigger audit_ticket_pages after insert or update or delete on onzio.cinematic_ticket_pages for each row execute function onzio_private.audit_content_mutation();
create trigger guard_ticket_page_media before insert or update of media_asset_id on onzio.cinematic_ticket_page_images for each row execute function onzio_private.guard_media_reference('media_asset_id','asset');

create table onzio_private.ticket_page_save_receipts (
 club_id uuid not null references onzio.clubs(id) on delete cascade, page text not null, actor_id uuid not null references auth.users(id),
 operation_id uuid not null, request_hash text not null, response jsonb not null,
 created_at timestamptz not null default now(), primary key (club_id, page, actor_id, operation_id)
);
alter table onzio_private.ticket_page_save_receipts enable row level security;
grant select, insert on onzio_private.ticket_page_save_receipts to authenticated;
create policy ticket_page_receipt_read on onzio_private.ticket_page_save_receipts for select to authenticated
 using (actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));
create policy ticket_page_receipt_insert on onzio_private.ticket_page_save_receipts for insert to authenticated
 with check (actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'homepage'));

-- Editor shape of a stored page's images: descriptions from the JSON, identities from the image rows.
create function onzio_private.ticket_page_images(p_club_id uuid, p_page text, stored jsonb) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(s.key, jsonb_build_object('assetId', to_jsonb(i.media_asset_id), 'alt', coalesce(s.value->'alt','""'::jsonb))), '{}'::jsonb)
 from jsonb_each(case when jsonb_typeof(stored)='object' then stored else '{}'::jsonb end) s
 left join onzio.cinematic_ticket_page_images i on i.club_id=p_club_id and i.page=p_page and i.slot=s.key;
$$;
create function onzio_private.ticket_page_snapshot(p_club_id uuid, p_page text) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('revision', coalesce(t.revision::text,'0'),
  'designRevision', onzio_private.homepage_design(p_club_id)->>'designRevision',
  'content', case when t.club_id is null then null else t.content||jsonb_build_object('images',onzio_private.ticket_page_images(p_club_id,p_page,t.content->'images')) end,
  'media', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'storage_bucket',m.storage_bucket,'storage_path',m.storage_path,'width',m.width,'height',m.height) order by m.id)
   from onzio.media_assets m where m.club_id=p_club_id and m.status='published' and m.deleted_at is null
   and m.id in (select (value->>'assetId')::uuid from jsonb_each(onzio_private.ticket_page_images(p_club_id,p_page,t.content->'images')) where value->>'assetId' is not null)), '[]'::jsonb))
 from (select 1) one left join onzio.cinematic_ticket_pages t on t.club_id=p_club_id and t.page=p_page;
$$;

create function onzio_private.check_ticket_page_texts(v jsonb, max_items integer, max_length integer, exact boolean default false) returns void
 language plpgsql immutable security invoker set search_path='' as $$
declare t jsonb;begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>max_items or (exact and jsonb_array_length(v)<>max_items) then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 for t in select value from jsonb_array_elements(v) loop perform onzio_private.check_cinematic_text(t,max_length);end loop;
end $$;
create function onzio_private.check_ticket_page_visible(v jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$
begin if jsonb_typeof(v->'visible') is distinct from 'boolean' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;end $$;
-- Same rule as lib/cinematic-contact-content.ts isSafeContactInformationHref: empty, a site path, mailto or public HTTPS.
create function onzio_private.check_ticket_page_link(v jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$
declare href text;begin
 perform onzio_private.check_cinematic_text(v,2000);href:=v#>>'{}';
 if href='' then return;end if;
 if href ~ '[[:space:]\\]' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 if href ~ '^/[-A-Za-z0-9_?#=&%.][-A-Za-z0-9_/?#=&%.]*$' then return;end if;
 if href ~ '^mailto:[^@[:space:]?]+@[^@[:space:]?]+[.][^@[:space:]?]+$' then return;end if;
 if href ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z0-9-]+(:[0-9]+)?([/?#][^[:space:]]*)?$'
  and href !~* '^https://(localhost|127[.]|0[.]|[^/]*[.]localhost([:/?#]|$))' then return;end if;
 raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';
end $$;
-- A list of {id,...} items; returns their IDs. Text fields are checked by the caller's loop.
create function onzio_private.check_ticket_page_ids(items jsonb, prefix text, max_items integer) returns text[]
 language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb;ids text[]:='{}';begin
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>max_items then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string'
   or item->>'id' !~ ('^'||prefix||'-[a-z0-9-]{1,50}$') or (item->>'id')=any(ids) then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
  ids:=array_append(ids,item->>'id');
 end loop;
 return ids;
end $$;

create function onzio_private.check_ticket_page_content(p_page text, c jsonb) returns void
 language plpgsql immutable security invoker set search_path='' as $$
declare v jsonb;item jsonb;slot text;expected text[];actual text[];begin
 if p_page='season-membership' then
  perform onzio_private.check_homepage_object(c,array['heading','intro','pricing','button','benefits','closing','images'],array['heading','intro','pricing','button','benefits','closing','images']);
  v:=c->'intro';perform onzio_private.check_homepage_object(v,array['text','highlights','includesHeading','includes'],array['text','highlights','includesHeading','includes']);
  perform onzio_private.check_cinematic_text(v->'text',4000);perform onzio_private.check_ticket_page_texts(v->'highlights',12,4000);
  perform onzio_private.check_cinematic_text(v->'includesHeading',120);perform onzio_private.check_ticket_page_texts(v->'includes',30,4000);
  v:=c->'pricing';perform onzio_private.check_homepage_object(v,array['visible','sectionLabel','columns','rows','footnote'],array['visible','sectionLabel','columns','rows','footnote']);
  perform onzio_private.check_ticket_page_visible(v);perform onzio_private.check_cinematic_text(v->'sectionLabel',120);
  perform onzio_private.check_ticket_page_texts(v->'columns',3,120,true);perform onzio_private.check_cinematic_text(v->'footnote',4000);
  expected:=onzio_private.check_ticket_page_ids(v->'rows','seat',6);
  for item in select value from jsonb_array_elements(v->'rows') loop
   perform onzio_private.check_homepage_object(item,array['id','name','prices'],array['id','name','prices']);
   perform onzio_private.check_cinematic_text(item->'name',120);perform onzio_private.check_ticket_page_texts(item->'prices',3,40,true);
  end loop;
  v:=c->'button';perform onzio_private.check_homepage_object(v,array['label','href'],array['label','href']);
  perform onzio_private.check_cinematic_text(v->'label',60);perform onzio_private.check_ticket_page_link(v->'href');
  v:=c->'benefits';perform onzio_private.check_homepage_object(v,array['visible','heading','items'],array['visible','heading','items']);
  perform onzio_private.check_ticket_page_visible(v);perform onzio_private.check_cinematic_text(v->'heading',120);
  expected:=expected||onzio_private.check_ticket_page_ids(v->'items','benefit',12);
  for item in select value from jsonb_array_elements(v->'items') loop
   perform onzio_private.check_homepage_object(item,array['id','label'],array['id','label']);perform onzio_private.check_cinematic_text(item->'label',120);
  end loop;
  v:=c->'closing';perform onzio_private.check_homepage_object(v,array['visible','heading'],array['visible','heading']);
  perform onzio_private.check_ticket_page_visible(v);perform onzio_private.check_cinematic_text(v->'heading',120);
  expected:=array['ticket']||expected;
 elsif p_page='know-before-you-go' then
  perform onzio_private.check_homepage_object(c,array['heading','match','facts','raffle','donor','images'],array['heading','match','facts','raffle','donor','images']);
  v:=c->'match';perform onzio_private.check_homepage_object(v,array['visible','competition','watchLabel','watchHref'],array['visible','competition','watchLabel','watchHref']);
  perform onzio_private.check_ticket_page_visible(v);perform onzio_private.check_cinematic_text(v->'competition',120);
  perform onzio_private.check_cinematic_text(v->'watchLabel',120);perform onzio_private.check_ticket_page_link(v->'watchHref');
  v:=c->'facts';perform onzio_private.check_homepage_object(v,array['visible','tiles'],array['visible','tiles']);perform onzio_private.check_ticket_page_visible(v);
  expected:=onzio_private.check_ticket_page_ids(v->'tiles','tile',24);
  for item in select value from jsonb_array_elements(v->'tiles') loop
   perform onzio_private.check_homepage_object(item,array['id','label'],array['id','label']);perform onzio_private.check_cinematic_text(item->'label',120);
  end loop;
  v:=c->'raffle';perform onzio_private.check_homepage_object(v,array['visible','heading','subheading','body'],array['visible','heading','subheading','body']);
  perform onzio_private.check_ticket_page_visible(v);perform onzio_private.check_cinematic_text(v->'heading',120);
  perform onzio_private.check_cinematic_text(v->'subheading',120);perform onzio_private.check_cinematic_text(v->'body',2000);
  v:=c->'donor';perform onzio_private.check_homepage_object(v,array['visible','heading','name','body','buttonLabel','buttonHref'],array['visible','heading','name','body','buttonLabel','buttonHref']);
  perform onzio_private.check_ticket_page_visible(v);perform onzio_private.check_cinematic_text(v->'heading',120);perform onzio_private.check_cinematic_text(v->'name',120);
  perform onzio_private.check_cinematic_text(v->'body',4000);perform onzio_private.check_cinematic_text(v->'buttonLabel',60);perform onzio_private.check_ticket_page_link(v->'buttonHref');
  expected:=array['youtube','raffle','donor']||expected;
 else raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';
 end if;
 v:=c->'heading';perform onzio_private.check_homepage_object(v,array['title','subtitle'],array['title','subtitle']);
 perform onzio_private.check_cinematic_text(v->'title',120);perform onzio_private.check_cinematic_text(v->'subtitle',120);
 -- Exactly one image entry per fixed slot and list item.
 if jsonb_typeof(c->'images') is distinct from 'object' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 select coalesce(array_agg(key order by key),'{}') into actual from jsonb_object_keys(c->'images') key;
 if actual is distinct from (select coalesce(array_agg(e order by e),'{}') from unnest(expected) e) then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
 foreach slot in array actual loop
  v:=c->'images'->slot;
  perform onzio_private.check_homepage_object(v,array['assetId','alt'],array['assetId','alt']);
  if jsonb_typeof(v->'assetId') not in ('string','null') then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
  if jsonb_typeof(v->'assetId')='string' and (v->>'assetId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
  perform onzio_private.check_cinematic_text(v->'alt',1000);
 end loop;
exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end $$;

-- Every image must be this club's published homepage graphic.
create function onzio_private.check_ticket_page_media(p_club_id uuid, asset uuid) returns void language plpgsql stable security invoker set search_path='' as $$
begin
 if asset is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=asset and status='published' and deleted_at is null
  and storage_bucket='onzio-media' and surface='homepage' and media_kind='graphic') then raise exception 'INVALID_VISITOR_MEDIA' using errcode='22023';end if;
end $$;

-- Direct writes obey the same shape and media rules as the Save RPCs.
create function onzio_private.validate_ticket_page_row() returns trigger language plpgsql security invoker set search_path='' as $$
declare slot text;begin
 begin
  if jsonb_typeof(new.content->'images') is distinct from 'object' then raise exception 'INVALID_VISITOR_PAYLOAD';end if;
  for slot in select jsonb_object_keys(new.content->'images') loop
   perform onzio_private.check_homepage_object(new.content->'images'->slot,array['alt'],array['alt']);
  end loop;
 exception when others then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end;
 perform onzio_private.check_ticket_page_content(new.page,new.content||jsonb_build_object('images',onzio_private.ticket_page_images(new.club_id,new.page,new.content->'images')));
 return new;end $$;
create function onzio_private.validate_ticket_page_image_row() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform onzio_private.check_ticket_page_media(new.club_id,new.media_asset_id);return new;end $$;
revoke all on function onzio_private.validate_ticket_page_row(),onzio_private.validate_ticket_page_image_row() from public,anon;
grant execute on function onzio_private.validate_ticket_page_row(),onzio_private.validate_ticket_page_image_row() to authenticated,service_role;
create trigger validate_ticket_pages before insert or update on onzio.cinematic_ticket_pages for each row execute function onzio_private.validate_ticket_page_row();
create trigger validate_ticket_page_images before insert or update on onzio.cinematic_ticket_page_images for each row execute function onzio_private.validate_ticket_page_image_row();

create function onzio_private.load_ticket_page_editor(p_page text, p_club_id uuid, p_operation_id uuid) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare result jsonb;receipt jsonb;
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901340);
 if not onzio_private.can_mutate_feature(p_club_id,'homepage') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select response into receipt from onzio_private.ticket_page_save_receipts where club_id=p_club_id and page=p_page and actor_id=auth.uid() and operation_id=p_operation_id;
 if receipt is null and onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 result:=onzio_private.ticket_page_snapshot(p_club_id,p_page);
 if p_operation_id is not null then result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);end if;
 return result;end $$;

create function onzio_private.save_ticket_page_editor(p_page text, p_club_id uuid, p_request jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare c jsonb;s jsonb;result jsonb;op uuid;hash text;previous_hash text;receipt jsonb;k text;old_ids uuid[];new_ids uuid[];retired uuid[];stored jsonb;slot text;image jsonb;
 begin
 perform pg_catalog.pg_advisory_xact_lock(734901281);perform pg_catalog.pg_advisory_xact_lock(734901340);
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
 c:=p_request->'content';perform onzio_private.check_ticket_page_content(p_page,c);
 if p_request ? 'retiredMediaAssetIds' then
  if jsonb_typeof(p_request->'retiredMediaAssetIds') is distinct from 'array' or jsonb_array_length(p_request->'retiredMediaAssetIds')>100 then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
  for k in select jsonb_array_elements_text(p_request->'retiredMediaAssetIds') loop
   if k is null or k!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
  end loop;
 end if;
 hash:=md5(p_request::text);
 select request_hash,response into previous_hash,receipt from onzio_private.ticket_page_save_receipts where club_id=p_club_id and page=p_page and actor_id=auth.uid() and operation_id=op;
 if found then if hash<>previous_hash then raise exception 'OPERATION_REUSED' using errcode='22023';end if;return receipt;end if;
 if onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2' then raise exception 'PAGE_UNAVAILABLE' using errcode='22023';end if;
 s:=onzio_private.ticket_page_snapshot(p_club_id,p_page);
 if s->>'designRevision' is distinct from p_request->>'designRevision' then raise exception 'DESIGN_CHANGED' using errcode='22023';end if;
 if s->>'revision' is distinct from p_request->>'expectedRevision' then raise exception 'VISITOR_PAGE_CHANGED' using errcode='22023';end if;
 for slot,image in select key,value from jsonb_each(c->'images') loop perform onzio_private.check_ticket_page_media(p_club_id,(image->>'assetId')::uuid);end loop;
 select array_agg((value->>'assetId')::uuid) into old_ids from jsonb_each(coalesce(s#>'{content,images}','{}'));
 select array_agg((value->>'assetId')::uuid) into new_ids from jsonb_each(c->'images');
 stored:=c;
 for slot in select jsonb_object_keys(c->'images') loop stored:=stored#-array['images',slot,'assetId'];end loop;
 insert into onzio.cinematic_ticket_pages(club_id,page,content) values(p_club_id,p_page,stored)
  on conflict(club_id,page) do update set content=excluded.content;
 delete from onzio.cinematic_ticket_page_images where club_id=p_club_id and page=p_page;
 insert into onzio.cinematic_ticket_page_images(club_id,page,slot,media_asset_id)
  select p_club_id,p_page,key,(value->>'assetId')::uuid from jsonb_each(c->'images') where value->>'assetId' is not null;
 select coalesce(array_agg(distinct m.id),'{}') into retired from onzio.media_assets m
 where m.club_id=p_club_id and m.surface='homepage' and m.status='published' and m.deleted_at is null
 and (m.id=any(coalesce(old_ids,'{}')) or (m.created_by=auth.uid() and m.id::text in(select jsonb_array_elements_text(coalesce(p_request->'retiredMediaAssetIds','[]')))))
 and not (m.id=any(array_remove(coalesce(new_ids,'{}'),null)));
 result:=onzio_private.ticket_page_snapshot(p_club_id,p_page)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired));
 insert into onzio_private.ticket_page_save_receipts(club_id,page,actor_id,operation_id,request_hash,response) values(p_club_id,p_page,auth.uid(),op,hash,result);
 return result;end $$;

-- One load/save pair per page, the shape lib/visitor-page-route.ts calls.
create function onzio.load_season_membership_editor(p_club_id uuid,p_operation_id uuid default null) returns jsonb
 language sql security invoker set search_path='' as $$ select onzio_private.load_ticket_page_editor('season-membership',p_club_id,p_operation_id) $$;
create function onzio.save_season_membership_editor(p_club_id uuid,p_request jsonb) returns jsonb
 language sql security invoker set search_path='' as $$ select onzio_private.save_ticket_page_editor('season-membership',p_club_id,p_request) $$;
create function onzio.load_know_before_you_go_editor(p_club_id uuid,p_operation_id uuid default null) returns jsonb
 language sql security invoker set search_path='' as $$ select onzio_private.load_ticket_page_editor('know-before-you-go',p_club_id,p_operation_id) $$;
create function onzio.save_know_before_you_go_editor(p_club_id uuid,p_request jsonb) returns jsonb
 language sql security invoker set search_path='' as $$ select onzio_private.save_ticket_page_editor('know-before-you-go',p_club_id,p_request) $$;

revoke all on function onzio_private.ticket_page_images(uuid,text,jsonb),onzio_private.ticket_page_snapshot(uuid,text),
 onzio_private.check_ticket_page_texts(jsonb,integer,integer,boolean),onzio_private.check_ticket_page_visible(jsonb),onzio_private.check_ticket_page_link(jsonb),
 onzio_private.check_ticket_page_ids(jsonb,text,integer),onzio_private.check_ticket_page_content(text,jsonb),onzio_private.check_ticket_page_media(uuid,uuid),
 onzio_private.load_ticket_page_editor(text,uuid,uuid),onzio_private.save_ticket_page_editor(text,uuid,jsonb) from public,anon;
grant execute on function onzio_private.ticket_page_images(uuid,text,jsonb),onzio_private.ticket_page_snapshot(uuid,text),
 onzio_private.check_ticket_page_texts(jsonb,integer,integer,boolean),onzio_private.check_ticket_page_visible(jsonb),onzio_private.check_ticket_page_link(jsonb),
 onzio_private.check_ticket_page_ids(jsonb,text,integer),onzio_private.check_ticket_page_content(text,jsonb),onzio_private.check_ticket_page_media(uuid,uuid),
 onzio_private.load_ticket_page_editor(text,uuid,uuid),onzio_private.save_ticket_page_editor(text,uuid,jsonb) to authenticated,service_role;
revoke all on function onzio.load_season_membership_editor(uuid,uuid),onzio.save_season_membership_editor(uuid,jsonb),
 onzio.load_know_before_you_go_editor(uuid,uuid),onzio.save_know_before_you_go_editor(uuid,jsonb) from public,anon;
grant execute on function onzio.load_season_membership_editor(uuid,uuid),onzio.save_season_membership_editor(uuid,jsonb),
 onzio.load_know_before_you_go_editor(uuid,uuid),onzio.save_know_before_you_go_editor(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
