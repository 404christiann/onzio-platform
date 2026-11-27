-- One rule for every admin-editable link destination, in the database.
--
-- onzio_private.normalize_link_destination is the SQL copy of normalizeLinkDestination in
-- lib/link-destination.ts: same branches, same regexes, same output for every input
-- (tests/database/link-destination-parity.test.ts compares the two). Change them together.
--
-- Every save function and CHECK constraint below stores only a value that is already in
-- normalized form: normalize_link_destination(v, allow) is not distinct from v.
-- The application normalizes before it saves.

-- Returns '' for blank, the normalized link, or NULL when the value is not an allowed link.
-- p_allow: any of 'https' (web link), 'path' (page on the club's site), 'email'.
-- No backslash appears in any pattern, so the result does not depend on standard_conforming_strings;
-- letter case is folded under the "C" collation, so it does not depend on the database locale.
create function onzio_private.normalize_link_destination(
  p_value text,
  p_allow text[] default array['https', 'path', 'email']
) returns text
  language plpgsql immutable parallel safe security invoker set search_path = '' as $fn$
declare
  allow text[] := coalesce(p_allow, array['https', 'path', 'email']);
  -- EDGE_SPACE: space, tab, line feed, carriage return, form feed, vertical tab.
  v text := btrim(p_value, ' ' || chr(9) || chr(10) || chr(13) || chr(12) || chr(11));
  parts text[];
  kind text;
  rest text;
  at_index integer;
  query_index integer;
  address text;
  query text;
  host text;
  -- LABEL, then HOST: dot-separated labels ending in a letter-led label.
  host_pattern constant text := '^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?[.])+[A-Za-z]([A-Za-z0-9-]*[A-Za-z0-9])?$';
  private_host constant text := '(^|[.])(localhost|local|internal)$';
begin
  if p_value is null then return null; end if;
  if v = '' then return ''; end if;
  -- ALLOWED_CHARS (printable ASCII, 0x21-0x7e) and FORBIDDEN_CHARS (\ < > " ` { } | ^).
  if v !~ '^[!-~]+$' or strpos(v, chr(92)) > 0 or v ~ '[<>"`{}|^]' then return null; end if;

  if left(v, 1) = '/' then
    -- PATH
    if 'path' = any (allow) and v ~ '^/[-A-Za-z0-9._~!$&''()*+,;=:@%/?#]*$' and left(v, 2) <> '//' then return v; end if;
    return null;
  end if;

  -- SCHEME
  parts := regexp_match(v, '^([A-Za-z][A-Za-z0-9+-]*):(.*)$');
  if parts is not null then
    kind := lower(parts[1] collate "C");
    rest := parts[2];
    if kind = 'mailto' then
      kind := 'email';
    elsif kind in ('https', 'http') and left(rest, 2) = '//' then
      kind := 'https';
      rest := substr(rest, 3);
    else
      return null;
    end if;
  else
    at_index := strpos(v, '@');
    kind := case when at_index > 1 and left(v, at_index - 1) !~ '[/?#:]' then 'email' else 'https' end;
    rest := v;
  end if;
  if not kind = any (allow) then return null; end if;

  if kind = 'email' then
    query_index := strpos(rest, '?');
    address := case when query_index = 0 then rest else left(rest, query_index - 1) end;
    query := case when query_index = 0 then '' else substr(rest, query_index) end;
    at_index := strpos(address, '@');
    if at_index < 2 or strpos(substr(address, at_index + 1), '@') > 0 then return null; end if;
    host := substr(address, at_index + 1);
    -- EMAIL_LOCAL, public host, MAIL_QUERY
    if left(address, at_index - 1) !~ '^[A-Za-z0-9.!$%&''*+=_~-]+$'
      or length(host) > 253 or host !~ host_pattern or lower(host collate "C") ~ private_host
      or query !~ '^([?][-A-Za-z0-9._~!$&''()*+,;=:@%/?]*)?$' then return null; end if;
    return 'mailto:' || address || query;
  end if;

  -- WEB, then AUTHORITY
  parts := regexp_match(rest, '^([^/?#]+)([/?#][-A-Za-z0-9._~!$&''()*+,;=:@%/?#]*)?$');
  if parts is null then return null; end if;
  parts := regexp_match(parts[1], '^([^:]+)(:[0-9]{1,5})?$');
  if parts is null then return null; end if;
  host := parts[1];
  if length(host) > 253 or host !~ host_pattern or lower(host collate "C") ~ private_host then return null; end if;
  if parts[2] is not null and substr(parts[2], 2)::integer > 65535 then return null; end if;
  return 'https://' || rest;
end
$fn$;

comment on function onzio_private.normalize_link_destination(text, text[]) is
  'SQL copy of normalizeLinkDestination in lib/link-destination.ts. Returns '''' for blank, the normalized link, or NULL when rejected. A stored link is valid when the result is not distinct from the input.';

-- CHECK constraints and the security-invoker save functions run as the writing role, so the two
-- roles that write club content need execute. Same grant as the other constraint helpers
-- (match_summary_is_valid, is_public_page_visibility).
revoke all on function onzio_private.normalize_link_destination(text, text[]) from public, anon;
grant execute on function onzio_private.normalize_link_destination(text, text[]) to authenticated, service_role;

-- onzio_private.check_cinematic_contact_content(jsonb): body copied from 20261112080000_cinematic_contact_page.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.check_cinematic_contact_content(c jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare action_id text; row jsonb; href text;
begin
  perform onzio_private.check_homepage_object(c, array['title','subtitle','rows','informationHref'], array['title','subtitle','rows','informationHref']);
  perform onzio_private.check_cinematic_text(c->'title', 120);
  perform onzio_private.check_cinematic_text(c->'subtitle', 120);
  if btrim(c->>'title') = '' or btrim(c->>'subtitle') = '' then raise exception 'INVALID_CINEMATIC_CONTACT_PAYLOAD' using errcode='22023'; end if;
  perform onzio_private.check_homepage_object(c->'rows', array['media','tryouts','tickets','information','partnerships'], array['media','tryouts','tickets','information','partnerships']);
  foreach action_id in array array['media','tryouts','tickets','information','partnerships'] loop
    row := c->'rows'->action_id;
    perform onzio_private.check_homepage_object(row, array['prompt','action'], array['prompt','action']);
    perform onzio_private.check_cinematic_text(row->'prompt', 120);
    perform onzio_private.check_cinematic_text(row->'action', 60);
    if btrim(row->>'prompt') = '' or btrim(row->>'action') = '' then raise exception 'INVALID_CINEMATIC_CONTACT_PAYLOAD' using errcode='22023'; end if;
  end loop;
  perform onzio_private.check_cinematic_text(c->'informationHref', 2000);
  href := c->>'informationHref';
  if onzio_private.normalize_link_destination(href) is distinct from href
    then raise exception 'INVALID_CINEMATIC_CONTACT_PAYLOAD' using errcode='22023';
  end if;
exception when others then
  raise exception 'INVALID_CINEMATIC_CONTACT_PAYLOAD' using errcode='22023';
end $function$;

-- onzio_private.check_ticket_page_link(jsonb): body copied from 20261112200000_cinematic_ticket_pages.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.check_ticket_page_link(v jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare href text;begin
 perform onzio_private.check_cinematic_text(v,2000);href:=v#>>'{}';
 if onzio_private.normalize_link_destination(href) is distinct from href then raise exception 'INVALID_VISITOR_PAYLOAD' using errcode='22023';end if;
end $function$;

-- onzio_private.check_cinematic_partners_pages(jsonb): body copied from 20261112170000_cinematic_partners.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.check_cinematic_partners_pages(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare page text; copy jsonb; href text;
begin
  perform onzio_private.check_homepage_object(p, array['partners','opportunities'], array['partners','opportunities']);
  foreach page in array array['partners','opportunities'] loop
    copy := p->page;
    if page = 'partners' then
      perform onzio_private.check_homepage_object(copy, array['title','subtitle','intro','ctaPrompt','ctaLabel'], array['title','subtitle','intro','ctaPrompt','ctaLabel']);
    else
      perform onzio_private.check_homepage_object(copy, array['title','subtitle','intro','ctaPrompt','ctaLabel','ctaHref'], array['title','subtitle','intro','ctaPrompt','ctaLabel','ctaHref']);
      perform onzio_private.check_cinematic_text(copy->'ctaHref', 2000);
    end if;
    perform onzio_private.check_cinematic_text(copy->'title', 80);
    perform onzio_private.check_cinematic_text(copy->'subtitle', 120);
    perform onzio_private.check_cinematic_text(copy->'intro', 1200);
    perform onzio_private.check_cinematic_text(copy->'ctaPrompt', 160);
    perform onzio_private.check_cinematic_text(copy->'ctaLabel', 40);
    if btrim(copy->>'title') = '' then raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023'; end if;
  end loop;
  -- Same destinations as the Contact Information link: HTTPS, mailto or a site path.
  href := p->'opportunities'->>'ctaHref';
  if onzio_private.normalize_link_destination(href) is distinct from href
    then raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
  end if;
exception when others then
  raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
end $function$;

-- onzio_private.check_cinematic_news_content(jsonb): body copied from 20261112150000_cinematic_news.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.check_cinematic_news_content(c jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  keys text[] := array['category','cardHeading','title','subtitle','coverAlt','paragraphs','actionLabel','actionHref'];
  paragraph jsonb;
  href text;
begin
  perform onzio_private.check_homepage_object(c, keys, keys);
  if jsonb_typeof(c->'category') is distinct from 'string'
    or c->>'category' not in ('sponsor-partner','partner','community','new-player','news') then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  perform onzio_private.check_cinematic_text(c->'cardHeading', 40);
  perform onzio_private.check_cinematic_text(c->'title', 140);
  perform onzio_private.check_cinematic_text(c->'subtitle', 200);
  perform onzio_private.check_cinematic_text(c->'coverAlt', 200);
  perform onzio_private.check_cinematic_text(c->'actionLabel', 40);
  perform onzio_private.check_cinematic_text(c->'actionHref', 2000);
  if btrim(c->>'cardHeading') = '' or btrim(c->>'title') = '' then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  if jsonb_typeof(c->'paragraphs') is distinct from 'array' then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  if jsonb_array_length(c->'paragraphs') not between 1 and 40 then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  for paragraph in select value from jsonb_array_elements(c->'paragraphs') loop
    perform onzio_private.check_cinematic_text(paragraph, 4000);
    if btrim(paragraph #>> '{}') = '' then raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023'; end if;
  end loop;
  href := c->>'actionHref';
  if (btrim(c->>'actionLabel') = '') <> (href = '') then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  if onzio_private.normalize_link_destination(href) is distinct from href then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
exception when others then
  raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
end $function$;

-- onzio_private.check_tickets_content(jsonb): body copied from 20261118010000_cinematic_ticket_visibility_flags.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.check_tickets_content(c jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 declare k text; a jsonb; v jsonb; asset uuid;
 begin
 perform onzio_private.check_homepage_object(c,array['title','subtitle','perksHeading','includesHeading','benefitsNote','transitHeading','transitSubtitle','directionsHeading','directionsBody','parkingHeading','parkingBody','parkingNote','purchaseUrl','missingPurchaseLabel','perkLabels','benefits','bannerHeightFraction','artwork','perksVisible','includesVisible','transitVisible','directionsVisible','purchaseVisible'],array['title','subtitle','perksHeading','includesHeading','benefitsNote','transitHeading','transitSubtitle','directionsHeading','directionsBody','parkingHeading','parkingBody','parkingNote','purchaseUrl','missingPurchaseLabel','perkLabels','benefits','bannerHeightFraction','artwork']);
 foreach k in array array['perksVisible','includesVisible','transitVisible','directionsVisible','purchaseVisible'] loop
 if c ? k and jsonb_typeof(c->k) is distinct from 'boolean' then raise exception 'INVALID_TICKETS_PAYLOAD' using errcode='22023';end if;
 end loop;
 foreach k in array array['title','subtitle','perksHeading','includesHeading','benefitsNote','transitHeading','transitSubtitle','directionsHeading','directionsBody','parkingHeading','parkingBody','parkingNote','purchaseUrl','missingPurchaseLabel'] loop
 perform onzio_private.check_cinematic_text(c->k,case when k='purchaseUrl' then 2000 when k in('benefitsNote','directionsBody','parkingBody','parkingNote') then 4000 else 120 end);
 end loop;
 if onzio_private.normalize_link_destination(c->>'purchaseUrl') is distinct from (c->>'purchaseUrl')
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
 end $function$;

-- onzio_private.check_cinematic_homepage(jsonb): body copied from 20261123120000_sam_visibility_controls.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.check_cinematic_homepage(v jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
 if (v#>>'{match,buttonHref}')='' or onzio_private.normalize_link_destination(v#>>'{match,buttonHref}',array['path']) is distinct from (v#>>'{match,buttonHref}') then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
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
   if onzio_private.normalize_link_destination(r#>>'{}') is distinct from (r#>>'{}') then
    raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023';
   end if;
  end loop;
 end if;
 perform onzio_private.check_homepage_object(v#>'{navigation,labels}',array['home','club','about','roster','club-crest','partners','tryouts','shop','stadium-group','stadium','stadium-parking','stadium-guidelines','chick-fil-a','know-before-you','fan-code','foothill-transit','media-credentials','tickets','tickets-page','season-membership','schedule','news','injury-report','news-page','community','partnership','national-anthem','contact']);
 for k,r in select * from jsonb_each(v#>'{navigation,labels}') loop
  perform onzio_private.check_cinematic_text(r,60);
  if btrim(r#>>'{}')='' or btrim(r#>>'{}') is distinct from r#>>'{}' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 end loop;
end $function$;

-- onzio.save_homepage(uuid,jsonb): body copied from 20261123120000_sam_visibility_controls.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio.save_homepage(p_club_id uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
        if section='hero' and k in ('primary_cta_href','secondary_cta_href') and onzio_private.normalize_link_destination(v#>>'{}',array['path']) is distinct from (v#>>'{}') then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
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
end $function$;

-- onzio_private.validate_shop_section(jsonb): body copied from 20261105120000_shop_buy_link_email.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.validate_shop_section(p_section jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare key text; value jsonb; bullet jsonb;
begin
  perform onzio_private.check_shop_object(p_section,array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link'],
    array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link']);
  for key,value in select * from jsonb_each(p_section) loop
    if key='bullet_points' then
      if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>8 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      for bullet in select * from jsonb_array_elements(value) loop
        if jsonb_typeof(bullet)<>'string' or char_length(bullet#>>'{}')>80 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      end loop;
    elsif jsonb_typeof(value)<>'string' or char_length(value#>>'{}') > (case key when 'description' then 3000 when 'cta_link' then 2048 when 'store_note' then 180 when 'title' then 240 else 160 end) then
      raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
    end if;
  end loop;
  if onzio_private.normalize_link_destination(p_section->>'cta_link') is distinct from (p_section->>'cta_link') then
    raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
  end if;
end $function$;

-- onzio_private.validate_shop_section(jsonb,boolean): body copied from 20261112120000_shop_kit_ten_bullets.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.validate_shop_section(p_section jsonb, p_editorial boolean)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare key text; value jsonb; bullet jsonb;
begin
  perform onzio_private.check_shop_object(p_section,array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link'],
    array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link']);
  for key,value in select * from jsonb_each(p_section) loop
    if key='bullet_points' then
      if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>10 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      for bullet in select * from jsonb_array_elements(value) loop
        if jsonb_typeof(bullet)<>'string' or char_length(bullet#>>'{}')>80 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      end loop;
      if not p_editorial and jsonb_array_length(value)=0 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
    elsif jsonb_typeof(value)<>'string' or char_length(value#>>'{}') > (case key when 'description' then 3000 when 'cta_link' then 2048 when 'store_note' then 180 when 'title' then 240 else 160 end) then
      raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
    end if;
  end loop;
  if onzio_private.normalize_link_destination(p_section->>'cta_link') is distinct from (p_section->>'cta_link') then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
end $function$;

-- onzio.save_shop_page(uuid,jsonb): body copied from 20261117010000_cinematic_shop_jersey_options.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio.save_shop_page(p_club_id uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    if onzio_private.normalize_link_destination(purchase->>'cta_link') is distinct from (purchase->>'cta_link') then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
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
end $function$;

-- onzio_private.validate_cinematic_shop_content(uuid,jsonb): body copied from 20261123120000_sam_visibility_controls.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.validate_cinematic_shop_content(p_club_id uuid, p_content jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
        or onzio_private.normalize_link_destination(item->>'link') is distinct from (item->>'link') then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;
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
end $function$;

-- onzio.save_program_page(uuid,jsonb): body copied from 20261030170000_programs_content_policy.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio.save_program_page(p_club_id uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  op uuid; v_program_id uuid; previous onzio.programs; row_value onzio.programs;
  saved_hash text; request_hash text; receipt jsonb; result jsonb;
  expected jsonb; payload jsonb; gallery jsonb; item jsonb; old_item onzio.program_media;
  gallery_id uuid; asset_id uuid; stored_url text; kept_ids uuid[]:='{}'; seen_assets uuid[]:='{}'; i integer:=0;
  current_count integer; old_assets uuid[]; new_assets uuid[]; retired_assets uuid[]:='{}';
  seen_expected uuid[]:='{}';
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901284);
  if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  perform onzio_private.check_program_page_object(p_request,array['operationId','programId','expected','program','gallery'],array['operationId','programId','expected','program','gallery']);
  perform onzio_private.check_program_page_object(p_request->'expected',array['programUpdatedAt','gallery'],array['programUpdatedAt','gallery']);
  payload:=p_request->'program'; gallery:=p_request->'gallery'; expected:=p_request->'expected';
  perform onzio_private.check_program_page_object(payload,array['slug','nav_label','display_title','kicker','summary','body','highlights','layout_variant','hero_media_asset_id','detail_media_asset_id','external_cta_label','external_cta_href','registration_form_id','registration_enabled','registration_eyebrow','registration_headline','registration_body','registration_pending_body','registration_pending_label','status','sort_order'],array['slug','nav_label','display_title','kicker','summary','body','highlights','layout_variant','hero_media_asset_id','detail_media_asset_id','external_cta_label','external_cta_href','registration_form_id','registration_enabled','registration_eyebrow','registration_headline','registration_body','registration_pending_body','registration_pending_label','status','sort_order']);
  if jsonb_typeof(gallery) is distinct from 'array' or jsonb_array_length(gallery)>12
    or jsonb_typeof(expected->'gallery') is distinct from 'array'
    or jsonb_typeof(p_request->'operationId')<>'string' then
    raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023';
  end if;
  begin
    op:=(p_request->>'operationId')::uuid;
    v_program_id:=(p_request->>'programId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end;
  if op is null then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end if;
  request_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select r.request_hash,r.response into saved_hash,receipt from onzio_private.program_page_receipts r
    where r.club_id=p_club_id and r.actor_id=auth.uid() and r.operation_id=op;
  if found then
    if saved_hash<>request_hash then raise exception 'OPERATION_REUSED' using errcode='PT409'; end if;
    return receipt;
  end if;
  if v_program_id is null then
    if expected->'programUpdatedAt'<>'null'::jsonb or expected->'gallery'<>'[]'::jsonb then
      raise exception 'CONTENT_CHANGED' using errcode='PT409';
    end if;
  else
    select * into previous from onzio.programs where club_id=p_club_id and id=v_program_id for update;
    if not found or jsonb_typeof(expected->'programUpdatedAt')<>'string'
      or previous.updated_at is distinct from (expected->>'programUpdatedAt')::timestamptz then
      raise exception 'CONTENT_CHANGED' using errcode='PT409';
    end if;
    perform 1 from onzio.program_media where club_id=p_club_id and program_id=v_program_id for update;
    select count(*) into current_count from onzio.program_media where club_id=p_club_id and program_id=v_program_id;
    if current_count<>jsonb_array_length(expected->'gallery') then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
    for item in select * from jsonb_array_elements(expected->'gallery') loop
      perform onzio_private.check_program_page_object(item,array['id','updatedAt'],array['id','updatedAt']);
      if (item->>'id')::uuid=any(seen_expected) then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
      if not exists(select 1 from onzio.program_media m where m.club_id=p_club_id and m.program_id=v_program_id
        and m.id=(item->>'id')::uuid and m.updated_at=(item->>'updatedAt')::timestamptz) then
        raise exception 'CONTENT_CHANGED' using errcode='PT409';
      end if;
      seen_expected:=array_append(seen_expected,(item->>'id')::uuid);
    end loop;
  end if;
  -- Explicit columns exclude client-controlled tenant identity and metadata.
  begin row_value:=jsonb_populate_record(null::onzio.programs,payload);
  exception when others then raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023'; end;
  if row_value.slug is null or row_value.display_title is null or row_value.status not in ('active','hidden')
    or row_value.layout_variant not in ('statement_band','detail_focus')
    or jsonb_typeof(payload->'highlights')<>'array' or jsonb_array_length(payload->'highlights')>200
    or exists(select 1 from jsonb_array_elements(payload->'highlights') v where jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>320)
    or onzio_private.normalize_link_destination(row_value.external_cta_href) is distinct from row_value.external_cta_href then
    raise exception 'INVALID_PROGRAM_PAGE_PAYLOAD' using errcode='22023';
  end if;
  -- Existing public URLs stay stable; order and visibility belong to Manage.
  if v_program_id is not null and (row_value.slug is distinct from previous.slug
    or row_value.status is distinct from previous.status
    or row_value.sort_order is distinct from previous.sort_order) then
    raise exception 'FIELD_UNAVAILABLE' using errcode='22023';
  end if;
  if row_value.hero_media_asset_id is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=row_value.hero_media_asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='programs') then
    raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023';
  end if;
  if row_value.detail_media_asset_id is not null and not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=row_value.detail_media_asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='programs') then
    raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023';
  end if;
  if v_program_id is null then
    insert into onzio.programs(club_id,slug,nav_label,display_title,kicker,summary,body,highlights,layout_variant,hero_media_asset_id,detail_media_asset_id,external_cta_label,external_cta_href,registration_form_id,registration_enabled,registration_eyebrow,registration_headline,registration_body,registration_pending_body,registration_pending_label,status,sort_order)
      values(p_club_id,row_value.slug,row_value.nav_label,row_value.display_title,row_value.kicker,row_value.summary,row_value.body,row_value.highlights,row_value.layout_variant,row_value.hero_media_asset_id,row_value.detail_media_asset_id,row_value.external_cta_label,row_value.external_cta_href,row_value.registration_form_id,row_value.registration_enabled,row_value.registration_eyebrow,row_value.registration_headline,row_value.registration_body,row_value.registration_pending_body,row_value.registration_pending_label,row_value.status,row_value.sort_order)
      returning id into v_program_id;
  else
    update onzio.programs set slug=row_value.slug,nav_label=row_value.nav_label,display_title=row_value.display_title,kicker=row_value.kicker,summary=row_value.summary,body=row_value.body,highlights=row_value.highlights,layout_variant=row_value.layout_variant,hero_media_asset_id=row_value.hero_media_asset_id,detail_media_asset_id=row_value.detail_media_asset_id,external_cta_label=row_value.external_cta_label,external_cta_href=row_value.external_cta_href,registration_form_id=row_value.registration_form_id,registration_enabled=row_value.registration_enabled,registration_eyebrow=row_value.registration_eyebrow,registration_headline=row_value.registration_headline,registration_body=row_value.registration_body,registration_pending_body=row_value.registration_pending_body,registration_pending_label=row_value.registration_pending_label,status=row_value.status,sort_order=row_value.sort_order
      where club_id=p_club_id and id=v_program_id;
  end if;
  select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into old_assets from onzio.program_media where club_id=p_club_id and program_id=v_program_id;
  old_assets:=old_assets||array_remove(array[previous.hero_media_asset_id,previous.detail_media_asset_id],null);
  for item in select * from jsonb_array_elements(gallery) loop
    perform onzio_private.check_program_page_object(item,array['id','mediaAssetId','alt','sortOrder'],array['id','mediaAssetId','alt','sortOrder']);
    if jsonb_typeof(item->'sortOrder')<>'number' or (item->>'sortOrder')::numeric<>i or jsonb_typeof(item->'alt')<>'string' or char_length(item->>'alt')>200 then
      raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023';
    end if;
    begin gallery_id:=(item->>'id')::uuid; asset_id:=(item->>'mediaAssetId')::uuid;
    exception when invalid_text_representation then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end;
    if gallery_id=any(kept_ids) or (asset_id is not null and asset_id=any(seen_assets)) then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
    if gallery_id is not null then
      select * into old_item from onzio.program_media where club_id=p_club_id and program_id=v_program_id and id=gallery_id;
      if not found then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
      if asset_id is null and old_item.media_asset_id is not null then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
    elsif asset_id is null then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
    if asset_id is not null then
      select '/'||storage_path into stored_url from onzio.media_assets where club_id=p_club_id and id=asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='programs';
      if not found then raise exception 'INVALID_PROGRAM_MEDIA' using errcode='22023'; end if;
    else stored_url:=old_item.url; end if;
    gallery_id:=coalesce(gallery_id,gen_random_uuid());
    insert into onzio.program_media(id,club_id,program_id,url,media_asset_id,alt,sort_order)
      values(gallery_id,p_club_id,v_program_id,stored_url,asset_id,item->>'alt',i)
      on conflict(id) do update set url=excluded.url,media_asset_id=excluded.media_asset_id,alt=excluded.alt,sort_order=excluded.sort_order;
    kept_ids:=array_append(kept_ids,gallery_id); seen_assets:=array_append(seen_assets,asset_id); i:=i+1;
  end loop;
  delete from onzio.program_media where club_id=p_club_id and program_id=v_program_id and not(id=any(kept_ids));
  select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into new_assets from onzio.program_media where club_id=p_club_id and program_id=v_program_id;
  new_assets:=new_assets||array_remove(array[row_value.hero_media_asset_id,row_value.detail_media_asset_id],null);
  select coalesce(array_agg(x),'{}') into retired_assets from unnest(old_assets) x where not(x=any(new_assets));
  result:=onzio_private.program_page_snapshot(p_club_id,v_program_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired_assets));
  insert into onzio_private.program_page_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $function$;

-- onzio.save_tryouts_page(uuid,jsonb): body copied from 20261022223212_tryouts_content_policy.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio.save_tryouts_page(p_club_id uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  current_page jsonb; result jsonb; intro jsonb; item jsonb; deleted jsonb;
  op uuid; request_hash text; saved_hash text; receipt jsonb;
  row_data onzio.tryouts; event_id uuid; ids uuid[]:='{}'; deleted_ids uuid[]:='{}'; index_number integer:=0;
  old_media_ids uuid[]:='{}'; retired_media_ids uuid[]:='{}';
  expected_count integer; actual_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901282);
  if not onzio_private.can_mutate_feature(p_club_id,'tryouts') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if jsonb_typeof(p_request) is distinct from 'object'
    or not p_request ?& array['operationId','expectedRevision','page','events','deletedIds']
    or exists(select 1 from jsonb_object_keys(p_request) k where k<>all(array['operationId','expectedRevision','page','events','deletedIds']))
    or jsonb_typeof(p_request->'page') not in ('object','null')
    or jsonb_typeof(p_request->'events') is distinct from 'array'
    or jsonb_typeof(p_request->'deletedIds') is distinct from 'array'
    or jsonb_array_length(p_request->'events')>500
    or jsonb_array_length(p_request->'deletedIds')>500
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
    or (p_request->>'expectedRevision')!~'^[0-9]+$'
    or char_length(p_request->>'expectedRevision')>20 then
    raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023';
  end if;
  begin op:=(p_request->>'operationId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023'; end;
  if op is null then raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023'; end if;
  request_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select r.request_hash,r.response into saved_hash,receipt from onzio_private.tryouts_page_save_receipts r
    where club_id=p_club_id and actor_id=auth.uid() and operation_id=op;
  if found then
    if saved_hash<>request_hash then raise exception 'OPERATION_REUSED' using errcode='22023'; end if;
    return receipt;
  end if;
  current_page:=onzio_private.tryouts_page_snapshot(p_club_id);
  if (current_page->>'revision') is distinct from (p_request->>'expectedRevision') then
    raise exception 'TRYOUTS_CHANGED' using errcode='PT409';
  end if;
  intro:=p_request->'page';
  if jsonb_typeof(intro)='object' and (not intro ?& array['intro_with_tryouts','intro_no_tryouts']
    or exists(select 1 from jsonb_object_keys(intro) k where k<>all(array['intro_with_tryouts','intro_no_tryouts']))
    or jsonb_typeof(intro->'intro_with_tryouts')<>'string'
    or jsonb_typeof(intro->'intro_no_tryouts')<>'string'
    or char_length(intro->>'intro_with_tryouts')>320
    or char_length(intro->>'intro_no_tryouts')>320) then
    raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023';
  end if;

  -- Every existing row must be represented exactly once in events or
  -- deletedIds. This prevents an incomplete client read from losing events.
  for item in select * from jsonb_array_elements(p_request->'events') loop
    if jsonb_typeof(item) is distinct from 'object' or not item ?& array[
      'id','program_id','status','eyebrow','headline','intro','hero_media_asset_id',
      'eligibility_copy','what_to_expect_copy','preparation_copy','event_date',
      'location','cost_text','cta_label','registration_href','registration_form_id',
      'closed_message','sort_order']
      or exists(select 1 from jsonb_object_keys(item) k where k<>all(array[
        'id','program_id','status','eyebrow','headline','intro','hero_media_asset_id',
        'eligibility_copy','what_to_expect_copy','preparation_copy','event_date',
        'location','cost_text','cta_label','registration_href','registration_form_id',
        'closed_message','sort_order'])) then
      raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023';
    end if;
    begin row_data:=jsonb_populate_record(null::onzio.tryouts,item);
    exception when others then raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023'; end;
    if row_data.sort_order is distinct from index_number or row_data.status not in ('upcoming','open','closed')
      or row_data.headline is null or row_data.location is null or row_data.cost_text is null
      or row_data.registration_href is null then raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023'; end if;
    if onzio_private.normalize_link_destination(row_data.registration_href) is distinct from row_data.registration_href then raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023'; end if;
    if row_data.id is not null then
      if row_data.id=any(ids) or not exists(select 1 from onzio.tryouts where club_id=p_club_id and id=row_data.id)
        then raise exception 'INVALID_TRYOUTS_EVENT' using errcode='22023'; end if;
      ids:=array_append(ids,row_data.id);
    end if;
    if row_data.hero_media_asset_id is not null and not exists(
      select 1 from onzio.media_assets m where m.club_id=p_club_id and m.id=row_data.hero_media_asset_id
        and m.surface='tryouts' and m.status='published' and m.deleted_at is null) then
      raise exception 'INVALID_TRYOUTS_EVENT' using errcode='22023';
    end if;
    index_number:=index_number+1;
  end loop;
  for deleted in select * from jsonb_array_elements(p_request->'deletedIds') loop
    begin event_id:=(deleted#>>'{}')::uuid;
    exception when others then raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023'; end;
    if event_id is null or event_id=any(ids) or event_id=any(deleted_ids)
      or not exists(select 1 from onzio.tryouts where club_id=p_club_id and id=event_id)
      then raise exception 'INVALID_TRYOUTS_EVENT' using errcode='22023'; end if;
    deleted_ids:=array_append(deleted_ids,event_id);
  end loop;
  select count(*) into actual_count from onzio.tryouts where club_id=p_club_id;
  expected_count:=coalesce(array_length(ids,1),0)+coalesce(array_length(deleted_ids,1),0);
  if actual_count<>expected_count then raise exception 'TRYOUTS_CHANGED' using errcode='PT409'; end if;

  select coalesce(array_agg(distinct hero_media_asset_id),'{}'::uuid[]) into old_media_ids
    from onzio.tryouts where club_id=p_club_id and hero_media_asset_id is not null;

  if jsonb_typeof(intro)='object' then
    insert into onzio.tryouts_page_content(club_id,intro_with_tryouts,intro_no_tryouts)
      values(p_club_id,btrim(intro->>'intro_with_tryouts'),btrim(intro->>'intro_no_tryouts'))
      on conflict(club_id) do update set intro_with_tryouts=excluded.intro_with_tryouts,
        intro_no_tryouts=excluded.intro_no_tryouts;
  end if;
  for item in select * from jsonb_array_elements(p_request->'events') loop
    row_data:=jsonb_populate_record(null::onzio.tryouts,item);
    insert into onzio.tryouts(id,club_id,program_id,status,eyebrow,headline,intro,hero_media_asset_id,
      eligibility_copy,what_to_expect_copy,preparation_copy,event_date,location,cost_text,cta_label,
      registration_href,registration_form_id,closed_message,sort_order)
    values(coalesce(row_data.id,gen_random_uuid()),p_club_id,row_data.program_id,row_data.status,
      row_data.eyebrow,row_data.headline,row_data.intro,row_data.hero_media_asset_id,
      row_data.eligibility_copy,row_data.what_to_expect_copy,row_data.preparation_copy,
      row_data.event_date,row_data.location,row_data.cost_text,row_data.cta_label,
      row_data.registration_href,row_data.registration_form_id,row_data.closed_message,row_data.sort_order)
    on conflict(id) do update set program_id=excluded.program_id,status=excluded.status,
      eyebrow=excluded.eyebrow,headline=excluded.headline,intro=excluded.intro,
      hero_media_asset_id=excluded.hero_media_asset_id,eligibility_copy=excluded.eligibility_copy,
      what_to_expect_copy=excluded.what_to_expect_copy,preparation_copy=excluded.preparation_copy,
      event_date=excluded.event_date,location=excluded.location,cost_text=excluded.cost_text,
      cta_label=excluded.cta_label,registration_href=excluded.registration_href,
      registration_form_id=excluded.registration_form_id,closed_message=excluded.closed_message,
      sort_order=excluded.sort_order;
  end loop;
  -- Deleting an event never deletes its linked form or registration records.
  delete from onzio.tryouts where club_id=p_club_id and id=any(deleted_ids);
  select coalesce(array_agg(old_id),'{}'::uuid[]) into retired_media_ids
    from unnest(old_media_ids) old_id
    where not exists(select 1 from onzio.tryouts current_event
      where current_event.club_id=p_club_id and current_event.hero_media_asset_id=old_id);
  result:=onzio_private.tryouts_page_snapshot(p_club_id)||jsonb_build_object(
    'operationId',op,'retiredMediaAssetIds',to_jsonb(retired_media_ids));
  insert into onzio_private.tryouts_page_save_receipts(club_id,actor_id,operation_id,request_hash,response)
    values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $function$;

-- onzio_private.is_sign_up_link(text): body copied from 20261110180000_programs_tryouts_sign_up_state.sql; only the link check changed.
CREATE OR REPLACE FUNCTION onzio_private.is_sign_up_link(p_href text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_href = '' or coalesce(onzio_private.normalize_link_destination(p_href) = p_href, false)
$function$;

-- Table constraints. Each one re-checks the rows already stored, so a row saved under an older,
-- looser rule stops this migration instead of staying behind.

-- Homepage hero buttons open a page on the club's own site. The old pattern let //host through.
alter table onzio.homepage_hero_content
  drop constraint homepage_hero_content_primary_cta_href_check,
  drop constraint homepage_hero_content_secondary_cta_href_check,
  add constraint homepage_hero_content_primary_cta_href_check
    check (onzio_private.normalize_link_destination(primary_cta_href, array['path']) is not distinct from primary_cta_href),
  add constraint homepage_hero_content_secondary_cta_href_check
    check (onzio_private.normalize_link_destination(secondary_cta_href, array['path']) is not distinct from secondary_cta_href);

alter table onzio.programs
  drop constraint programs_external_cta_href_check1,
  add constraint programs_external_cta_href_check1
    check (onzio_private.normalize_link_destination(external_cta_href) is not distinct from external_cta_href);

alter table onzio.tryouts
  drop constraint tryouts_registration_href_check1,
  add constraint tryouts_registration_href_check1
    check (onzio_private.normalize_link_destination(registration_href) is not distinct from registration_href);

-- A sponsor link stays NULL or a non-empty link of at most 2048 characters.
alter table onzio.site_sponsor_logos
  drop constraint site_sponsor_logos_website_url_shape,
  add constraint site_sponsor_logos_website_url_shape check (
    website_url is null
    or (char_length(website_url) <= 2048 and website_url <> ''
      and onzio_private.normalize_link_destination(website_url) is not distinct from website_url)
  );

-- New: social profile links are web links only.
alter table onzio.site_social_links
  add constraint site_social_links_href_link
    check (onzio_private.normalize_link_destination(href, array['https']) is not distinct from href);

-- New: a match sponsor link is NULL or a link.
alter table onzio.matches
  add constraint matches_sponsor_link_link
    check (sponsor_link is null or onzio_private.normalize_link_destination(sponsor_link) is not distinct from sponsor_link);
