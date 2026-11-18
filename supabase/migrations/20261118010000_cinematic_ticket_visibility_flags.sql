-- RC-ADMIN-07: optional show/hide flags (absent = shown) for the cinematic@2 Tickets page and Season Membership.
-- Additive and idempotent: only validator functions are replaced (create or replace keeps owner and grants);
-- no table, column, RPC signature or stored row changes, and existing saved content validates exactly as before.
-- Tickets: top-level perksVisible, includesVisible, transitVisible, directionsVisible, purchaseVisible.
-- Season Membership: heading.visible, intro.visible, button.visible. Unknown keys are still rejected.
create or replace function onzio_private.check_ticket_page_optional_visible(v jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$
begin if v ? 'visible' and jsonb_typeof(v->'visible') is distinct from 'boolean' then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;end $$;
revoke all on function onzio_private.check_ticket_page_optional_visible(jsonb) from public,anon;
grant execute on function onzio_private.check_ticket_page_optional_visible(jsonb) to authenticated,service_role;

create or replace function onzio_private.check_tickets_content(c jsonb) returns void
 language plpgsql immutable security invoker set search_path='' as $$
 declare k text; a jsonb; v jsonb; asset uuid;
 begin
 perform onzio_private.check_homepage_object(c,array['title','subtitle','perksHeading','includesHeading','benefitsNote','transitHeading','transitSubtitle','directionsHeading','directionsBody','parkingHeading','parkingBody','parkingNote','purchaseUrl','missingPurchaseLabel','perkLabels','benefits','bannerHeightFraction','artwork','perksVisible','includesVisible','transitVisible','directionsVisible','purchaseVisible'],array['title','subtitle','perksHeading','includesHeading','benefitsNote','transitHeading','transitSubtitle','directionsHeading','directionsBody','parkingHeading','parkingBody','parkingNote','purchaseUrl','missingPurchaseLabel','perkLabels','benefits','bannerHeightFraction','artwork']);
 foreach k in array array['perksVisible','includesVisible','transitVisible','directionsVisible','purchaseVisible'] loop
 if c ? k and jsonb_typeof(c->k) is distinct from 'boolean' then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 end loop;
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

create or replace function onzio_private.check_ticket_page_content(p_page text, c jsonb) returns void
 language plpgsql immutable security invoker set search_path='' as $$
declare v jsonb;item jsonb;slot text;expected text[];actual text[];begin
 if p_page='season-membership' then
  perform onzio_private.check_homepage_object(c,array['heading','intro','pricing','button','benefits','closing','images'],array['heading','intro','pricing','button','benefits','closing','images']);
  v:=c->'intro';perform onzio_private.check_homepage_object(v,array['visible','text','highlights','includesHeading','includes'],array['text','highlights','includesHeading','includes']);
  perform onzio_private.check_ticket_page_optional_visible(v);
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
  v:=c->'button';perform onzio_private.check_homepage_object(v,array['visible','label','href'],array['label','href']);
  perform onzio_private.check_ticket_page_optional_visible(v);
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
 v:=c->'heading';perform onzio_private.check_homepage_object(v,case when p_page='season-membership' then array['visible','title','subtitle'] else array['title','subtitle'] end,array['title','subtitle']);
 if p_page='season-membership' then perform onzio_private.check_ticket_page_optional_visible(v);end if;
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

revoke all on function onzio_private.check_tickets_content(jsonb),onzio_private.check_ticket_page_content(text,jsonb) from public,anon;
grant execute on function onzio_private.check_tickets_content(jsonb),onzio_private.check_ticket_page_content(text,jsonb) to authenticated,service_role;

notify pgrst,'reload schema';
