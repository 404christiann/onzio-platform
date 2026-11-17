-- Only the registered cinematic revision opts into version 2.
alter table onzio.presentation_documents drop constraint presentation_documents_template_version_check;
alter table onzio.presentation_documents add constraint presentation_documents_template_version_check
  check (template_version=1 or (template_id='cinematic' and template_version=2));

grant execute on function onzio_private.check_homepage_object(jsonb,text[],text[]) to service_role;

-- cinematic@2: tenant-owned content, normalized asset identities, and the
-- existing one-transaction homepage editor. No hosted data is seeded here.
create table onzio.homepage_revamp_content (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  content jsonb not null,
  raffle_media_asset_id uuid,
  ticket_media_asset_id uuid,
  trophy_media_asset_id uuid,
  header_partner_media_asset_id uuid,
  hero_poster_media_asset_id uuid,
  seats_background_media_asset_id uuid,
  episode_poster_media_asset_id uuid,
  presentation_config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  foreign key (club_id,raffle_media_asset_id) references onzio.media_assets(club_id,id),
  foreign key (club_id,ticket_media_asset_id) references onzio.media_assets(club_id,id),
  foreign key (club_id,trophy_media_asset_id) references onzio.media_assets(club_id,id),
  foreign key (club_id,header_partner_media_asset_id) references onzio.media_assets(club_id,id),
  foreign key (club_id,hero_poster_media_asset_id) references onzio.media_assets(club_id,id),
  foreign key (club_id,seats_background_media_asset_id) references onzio.media_assets(club_id,id),
  foreign key (club_id,episode_poster_media_asset_id) references onzio.media_assets(club_id,id)
);
alter table onzio.homepage_revamp_content enable row level security;
revoke all on onzio.homepage_revamp_content from anon,authenticated;
grant select on onzio.homepage_revamp_content to anon,authenticated;
-- Club editors cannot change operator-owned presentation inputs via the table.
grant insert(club_id,content,raffle_media_asset_id,ticket_media_asset_id,trophy_media_asset_id),
  update(content,raffle_media_asset_id,ticket_media_asset_id,trophy_media_asset_id)
  on onzio.homepage_revamp_content to authenticated;
grant all on onzio.homepage_revamp_content to service_role;
create policy homepage_revamp_read on onzio.homepage_revamp_content for select to anon,authenticated
  using (onzio_private.can_read_feature(club_id,'homepage'));
create policy homepage_revamp_insert on onzio.homepage_revamp_content for insert to authenticated
  with check (onzio_private.can_mutate_feature(club_id,'homepage'));
create policy homepage_revamp_update on onzio.homepage_revamp_content for update to authenticated
  using (onzio_private.can_mutate_feature(club_id,'homepage')) with check (onzio_private.can_mutate_feature(club_id,'homepage'));
create trigger serialize_homepage_write before insert or update or delete on onzio.homepage_revamp_content
  for each statement execute function onzio_private.serialize_homepage_write();
create trigger advance_homepage_revision after insert or update or delete on onzio.homepage_revamp_content
  for each row execute function onzio_private.advance_homepage_revision();
create trigger audit_homepage_revamp_content after insert or update or delete on onzio.homepage_revamp_content
  for each row execute function onzio_private.audit_content_mutation();
create trigger set_homepage_revamp_updated_at before update on onzio.homepage_revamp_content
  for each row execute function onzio_private.set_updated_at();
create trigger guard_raffle_media_reference before insert or update of raffle_media_asset_id on onzio.homepage_revamp_content for each row execute function onzio_private.guard_media_reference('raffle_media_asset_id','asset');
create trigger guard_ticket_media_reference before insert or update of ticket_media_asset_id on onzio.homepage_revamp_content for each row execute function onzio_private.guard_media_reference('ticket_media_asset_id','asset');
create trigger guard_trophy_media_reference before insert or update of trophy_media_asset_id on onzio.homepage_revamp_content for each row execute function onzio_private.guard_media_reference('trophy_media_asset_id','asset');
create trigger guard_header_partner_media_reference before insert or update of header_partner_media_asset_id on onzio.homepage_revamp_content for each row execute function onzio_private.guard_media_reference('header_partner_media_asset_id','asset');
create trigger guard_hero_poster_media_reference before insert or update of hero_poster_media_asset_id on onzio.homepage_revamp_content for each row execute function onzio_private.guard_media_reference('hero_poster_media_asset_id','asset');
create trigger guard_seats_background_media_reference before insert or update of seats_background_media_asset_id on onzio.homepage_revamp_content for each row execute function onzio_private.guard_media_reference('seats_background_media_asset_id','asset');
create trigger guard_episode_poster_media_reference before insert or update of episode_poster_media_asset_id on onzio.homepage_revamp_content for each row execute function onzio_private.guard_media_reference('episode_poster_media_asset_id','asset');

create function onzio_private.check_cinematic_text(v jsonb, maximum integer) returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'string' or char_length(v#>>'{}')>maximum then
  raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023';
 end if;
end $$;
revoke all on function onzio_private.check_cinematic_text(jsonb,integer) from public,anon;
grant execute on function onzio_private.check_cinematic_text(jsonb,integer) to authenticated,service_role;

create function onzio_private.check_cinematic_homepage(v jsonb) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare k text; r jsonb; a jsonb; ids text[]:='{}'; asset uuid;
begin
 perform onzio_private.check_homepage_object(v,array['raffle','ticket','match','prices','championship','navigation','sponsors'],array['raffle','ticket','match','prices','championship','navigation','sponsors']);
 for a in select value from jsonb_each(jsonb_build_object('raffle',v->'raffle','ticket',v->'ticket','trophy',v#>'{championship,trophy}')) loop
  perform onzio_private.check_homepage_object(a,array['assetId','alt','visible'],array['assetId','alt']);
  if jsonb_typeof(a->'assetId') not in ('string','null') then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  begin asset:=(a->>'assetId')::uuid; exception when invalid_text_representation then raise exception 'INVALID_PHOTO' using errcode='22023'; end;
  perform onzio_private.check_cinematic_text(a->'alt',1000);
 end loop;
 perform onzio_private.check_homepage_object(v->'raffle',array['assetId','alt'],array['assetId','alt']);
 perform onzio_private.check_homepage_object(v#>'{championship,trophy}',array['assetId','alt'],array['assetId','alt']);
 perform onzio_private.check_homepage_object(v->'ticket',array['assetId','alt','visible'],array['assetId','alt','visible']);
 if jsonb_typeof(v#>'{ticket,visible}') is distinct from 'boolean' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 perform onzio_private.check_homepage_object(v->'sponsors',array['heading'],array['heading']);
 perform onzio_private.check_cinematic_text(v#>'{sponsors,heading}',120);
 perform onzio_private.check_homepage_object(v->'match',array['heading','buttonLabel','buttonHref','emptyMessage'],array['heading','buttonLabel','buttonHref','emptyMessage']);
 perform onzio_private.check_cinematic_text(v#>'{match,heading}',120);
 perform onzio_private.check_cinematic_text(v#>'{match,buttonLabel}',60);
 perform onzio_private.check_cinematic_text(v#>'{match,buttonHref}',2000);
 perform onzio_private.check_cinematic_text(v#>'{match,emptyMessage}',1200);
 if (v#>>'{match,buttonHref}')!~'^/[-A-Za-z0-9_/?#=&%.]*$' or left(v#>>'{match,buttonHref}',2)='//' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 perform onzio_private.check_homepage_object(v->'prices',array['heading','rows','footnote'],array['heading','rows','footnote']);
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
 perform onzio_private.check_homepage_object(v->'navigation',array['labels'],array['labels']);
 perform onzio_private.check_homepage_object(v#>'{navigation,labels}',array['home','club','about','roster','club-crest','partners','tryouts','shop','stadium-group','stadium','stadium-parking','stadium-guidelines','chick-fil-a','know-before-you','fan-code','foothill-transit','media-credentials','tickets','schedule','news','injury-report','news-page','community','partnership','national-anthem','contact']);
 for k,r in select * from jsonb_each(v#>'{navigation,labels}') loop
  perform onzio_private.check_cinematic_text(r,60);
  if btrim(r#>>'{}')='' or btrim(r#>>'{}') is distinct from r#>>'{}' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 end loop;
end $$;
revoke all on function onzio_private.check_cinematic_homepage(jsonb) from public,anon;
grant execute on function onzio_private.check_cinematic_homepage(jsonb) to authenticated,service_role;

create function onzio_private.cinematic_homepage_json(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select content
  ||jsonb_build_object('raffle',(content->'raffle')||jsonb_build_object('assetId',raffle_media_asset_id,'url',null),
    'ticket',(content->'ticket')||jsonb_build_object('assetId',ticket_media_asset_id,'url',null),
    'championship',(content->'championship')||jsonb_build_object('trophy',(content#>'{championship,trophy}')||jsonb_build_object('assetId',trophy_media_asset_id,'url',null)),
    'presentation',jsonb_build_object(
      'headerPartner',jsonb_build_object('assetId',header_partner_media_asset_id,'url',null,'alt',coalesce(presentation_config#>>'{artworkAlt,headerPartner}','')),
      'heroPoster',jsonb_build_object('assetId',hero_poster_media_asset_id,'url',null,'alt',coalesce(presentation_config#>>'{artworkAlt,heroPoster}','')),
      'seatsBackground',jsonb_build_object('assetId',seats_background_media_asset_id,'url',null,'alt',coalesce(presentation_config#>>'{artworkAlt,seatsBackground}','')),
      'episodePoster',jsonb_build_object('assetId',episode_poster_media_asset_id,'url',null,'alt',coalesce(presentation_config#>>'{artworkAlt,episodePoster}','')),
      'heroVideoGuid',coalesce(presentation_config->>'heroVideoGuid',''),
      'heroVideoLibraryId',coalesce(presentation_config->>'heroVideoLibraryId',''),
      'sponsorTreatments',coalesce(presentation_config->'sponsorTreatments','{}'::jsonb)))
 from onzio.homepage_revamp_content where club_id=p_club_id;
$$;
revoke all on function onzio_private.cinematic_homepage_json(uuid) from public,anon;
grant execute on function onzio_private.cinematic_homepage_json(uuid) to authenticated;

create function onzio_private.validate_cinematic_homepage_row() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v jsonb;
begin
 v:=new.content||jsonb_build_object('raffle',(new.content->'raffle')||jsonb_build_object('assetId',new.raffle_media_asset_id),
  'ticket',(new.content->'ticket')||jsonb_build_object('assetId',new.ticket_media_asset_id),
  'championship',(new.content->'championship')||jsonb_build_object('trophy',(new.content#>'{championship,trophy}')||jsonb_build_object('assetId',new.trophy_media_asset_id)));
 perform onzio_private.check_cinematic_homepage(v);
 -- Keeping identities only in FK columns prevents JSON references bypassing
 -- tenant FKs, media guards and reference-aware asset retirement.
 if new.content#>'{raffle,assetId}' is not null or new.content#>'{ticket,assetId}' is not null or new.content#>'{championship,trophy,assetId}' is not null then
  raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023';
 end if;
 if current_user not in ('postgres','service_role','supabase_admin') then
  if (onzio_private.homepage_design(new.club_id)->>'templateKey') is distinct from 'cinematic@2' then
   raise exception 'SECTION_UNAVAILABLE' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
revoke all on function onzio_private.validate_cinematic_homepage_row() from public,anon;
grant execute on function onzio_private.validate_cinematic_homepage_row() to authenticated,service_role;
create trigger validate_cinematic_homepage_row before insert or update on onzio.homepage_revamp_content for each row execute function onzio_private.validate_cinematic_homepage_row();

create or replace function onzio_private.homepage_design(p_club_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d onzio.presentation_documents; c onzio.clubs; pointer uuid; k text;
begin
  if not onzio_private.is_club_session_fresh() or not onzio_private.is_club_member(p_club_id) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  select * into strict c from onzio.clubs where id=p_club_id;
  select published_document_id into pointer from onzio.presentation_state where club_id=p_club_id;
  if pointer is not null then select * into strict d from onzio.presentation_documents where club_id=p_club_id and id=pointer;
  else select * into d from onzio.presentation_documents where club_id=p_club_id order by version desc limit 1; end if;
  k:=case when d.id is null then null else d.template_id||'@'||d.template_version end;
  if d.id is not null and (k not in ('academy@1','editorial@1','clubhouse@1','cinematic@1','heritage@1','cinematic@2')
    or (d.configuration#>>'{template,id}') is distinct from d.template_id
    or (d.configuration#>>'{template,version}') is distinct from d.template_version::text) then
    raise exception 'INVALID_HOMEPAGE_DESIGN' using errcode='22023';
  end if;
  return jsonb_build_object('templateKey',k,'slug',c.slug,'designRevision',
    md5(jsonb_build_array(c.slug,d.id,d.configuration)::text),
    'slideshowVariant',case when k='cinematic@2' then 'cinematic' when k='academy@1' then 'none' when k='editorial@1' then 'editorial' when c.slug='rose-city' then 'legacy' else 'matchday' end,
    'heroVariant',case when c.slug='rose-city' and coalesce(k,'') not in ('academy@1','editorial@1','clubhouse@1','cinematic@2') then 'legacy-fixed' else 'editable' end);
end $$;

create or replace function onzio_private.homepage_snapshot(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'revision', coalesce((select revision::text from onzio_private.homepage_revisions where club_id=p_club_id),'0'),
    'designRevision', onzio_private.homepage_design(p_club_id)->>'designRevision',
    'design', onzio_private.homepage_design(p_club_id),
    'content', jsonb_build_object(
      'hero', coalesce((select to_jsonb(h)-'club_id'-'updated_at' from onzio.homepage_hero_content h where club_id=p_club_id),
        '{"eyebrow":"","headline_line_one":"","headline_line_two":"","intro":"","primary_cta_label":"","primary_cta_href":"","secondary_cta_label":"","secondary_cta_href":""}'::jsonb),
      'story', coalesce((select jsonb_build_object('visible',visible,'heading',heading,'bodyPrimary',body_primary,'bodySecondary',body_secondary,'ctaLabel',cta_label) from onzio.homepage_story_section where club_id=p_club_id),
        '{"visible":true,"heading":"","bodyPrimary":"","bodySecondary":"","ctaLabel":""}'::jsonb),
      'video', coalesce((select to_jsonb(v)-'club_id'-'updated_at'-'video_url' from onzio.behind_the_rose_section v where club_id=p_club_id),
        '{"visible":false,"eyebrow":"","title":"","description":"","video_title":"","caption":""}'::jsonb),
      'photos', jsonb_build_object('seasonLabel',coalesce((select season_label from onzio.homepage_slideshow_settings where club_id=p_club_id),''),
        'items',coalesce((select jsonb_agg(jsonb_build_object('clientId','photo-'||p.id,'rowId',p.id,'assetId',p.media_asset_id,'url',p.url,'alt',p.alt,'order',p.sort_order,'upload','ready') order by p.sort_order,p.id)
          from onzio.homepage_slideshow_photos p where p.club_id=p_club_id),'[]'::jsonb))) || case when onzio_private.cinematic_homepage_json(p_club_id) is null then '{}'::jsonb else jsonb_build_object('revamp',onzio_private.cinematic_homepage_json(p_club_id)) end,
    'videoSource',coalesce((select video_url from onzio.behind_the_rose_section where club_id=p_club_id),''),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'storage_bucket',m.storage_bucket,'storage_path',m.storage_path))
      from onzio.media_assets m where m.club_id=p_club_id and m.status='published' and m.deleted_at is null and m.storage_bucket='onzio-media'
      and (exists(select 1 from onzio.homepage_slideshow_photos p where p.club_id=p_club_id and p.media_asset_id=m.id)
        or exists(select 1 from onzio.homepage_revamp_content r where r.club_id=p_club_id and m.id=any(array[r.raffle_media_asset_id,r.ticket_media_asset_id,r.trophy_media_asset_id,r.header_partner_media_asset_id,r.hero_poster_media_asset_id,r.seats_background_media_asset_id,r.episode_poster_media_asset_id])))),'[]'::jsonb)
  );
$$;

create or replace function onzio.save_homepage(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  initial jsonb; result jsonb; d jsonb; sections jsonb; section text; fields jsonb; k text; v jsonb;
  op uuid; saved_hash text; request_hash text; receipt jsonb; template text; maximum integer;
  h jsonb; s jsonb; video jsonb; p jsonb; a onzio.media_assets; old_photo onzio.homepage_slideshow_photos;
  photo_id uuid; asset_id uuid; ids uuid[]:='{}'; clients text[]:='{}'; assets uuid[]:='{}'; idx integer:=0; photo_url text;
  old_asset_ids uuid[]; new_asset_ids uuid[]; retired_asset_ids uuid[]:='{}';
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
  initial:=onzio_private.homepage_snapshot(p_club_id); d:=initial->'design'; template:=d->>'templateKey';
  if initial->>'designRevision'<>p_request->>'designRevision' then raise exception 'DESIGN_CHANGED' using errcode='PT409'; end if;
  if initial->>'revision'<>p_request->>'expectedRevision' then raise exception 'CONTENT_CHANGED' using errcode='PT409'; end if;
  sections:=p_request->'sections';
  perform onzio_private.check_homepage_object(sections,array['hero','photos','story','video','revamp']);
  if sections='{}'::jsonb then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  for section,fields in select * from jsonb_each(sections) loop
    if (section='revamp' and coalesce(template,'')<>'cinematic@2') or (section='hero' and d->>'heroVariant'='legacy-fixed') or (section='story' and coalesce(template,'')<>'academy@1')
      or (section='photos' and template='academy@1') or (section='video' and template in ('academy@1','editorial@1','clubhouse@1')) then
      raise exception 'SECTION_UNAVAILABLE' using errcode='22023';
    end if;
    if section='revamp' then
      perform onzio_private.check_cinematic_homepage(fields);
      continue;
    elsif section='hero' then
      perform onzio_private.check_homepage_object(fields,array['eyebrow','headline_line_one','headline_line_two','intro','primary_cta_label','primary_cta_href','secondary_cta_label','secondary_cta_href']);
      if fields='{}'::jsonb then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
      if fields ? 'eyebrow' and template in ('editorial@1','clubhouse@1') then raise exception 'FIELD_UNAVAILABLE' using errcode='22023'; end if;
    elsif section='story' then
      perform onzio_private.check_homepage_object(fields,array['visible','heading','bodyPrimary','bodySecondary','ctaLabel'],array['visible','heading','bodyPrimary','bodySecondary','ctaLabel']);
    elsif section='video' then
      perform onzio_private.check_homepage_object(fields,array['visible','eyebrow','title','description','video_title','caption'],array['visible','eyebrow','title','description','video_title','caption']);
    else
      perform onzio_private.check_homepage_object(fields,array['items','seasonLabel'],array['items']);
      if fields ? 'seasonLabel' and d->>'slideshowVariant'<>'legacy' then raise exception 'FIELD_UNAVAILABLE' using errcode='22023'; end if;
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

  -- Section shape validation precedes writes; photo identity validation occurs
  -- inside the same transaction. Later failures roll back all writes and audits.
  if sections ? 'hero' then
    h:=(initial#>'{content,hero}')||(sections->'hero');
    insert into onzio.homepage_hero_content(club_id,eyebrow,headline_line_one,headline_line_two,intro,primary_cta_label,primary_cta_href,secondary_cta_label,secondary_cta_href)
      values(p_club_id,h->>'eyebrow',h->>'headline_line_one',h->>'headline_line_two',h->>'intro',h->>'primary_cta_label',h->>'primary_cta_href',h->>'secondary_cta_label',h->>'secondary_cta_href')
      on conflict(club_id) do update set eyebrow=excluded.eyebrow,headline_line_one=excluded.headline_line_one,headline_line_two=excluded.headline_line_two,intro=excluded.intro,primary_cta_label=excluded.primary_cta_label,primary_cta_href=excluded.primary_cta_href,secondary_cta_label=excluded.secondary_cta_label,secondary_cta_href=excluded.secondary_cta_href;
  end if;
  if sections ? 'photos' then
    if jsonb_typeof(sections#>'{photos,items}') is distinct from 'array' or jsonb_array_length(sections#>'{photos,items}')>(case when template='cinematic@2' then 7 else 6 end) then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
    -- Snapshot referenced assets before this section's writes so any asset that
    -- stops being referenced (a removed photo, or a kept row's asset swapped)
    -- can be retired by the caller after this transaction actually commits.
    select coalesce(array_agg(media_asset_id) filter (where media_asset_id is not null),'{}') into old_asset_ids
      from onzio.homepage_slideshow_photos where club_id=p_club_id;
    -- Validate identity, order and assets before the first photo write.
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
    for asset_id in select x from unnest(array[(s#>>'{raffle,assetId}')::uuid,(s#>>'{ticket,assetId}')::uuid,(s#>>'{championship,trophy,assetId}')::uuid]) x where x is not null loop
      if not exists(select 1 from onzio.media_assets where club_id=p_club_id and id=asset_id and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage') then
        raise exception 'INVALID_PHOTO' using errcode='22023';
      end if;
    end loop;
    select array_remove(array[raffle_media_asset_id,ticket_media_asset_id,trophy_media_asset_id],null) into old_asset_ids from onzio.homepage_revamp_content where club_id=p_club_id;
    new_asset_ids:=array_remove(array[(s#>>'{raffle,assetId}')::uuid,(s#>>'{ticket,assetId}')::uuid,(s#>>'{championship,trophy,assetId}')::uuid],null);
    insert into onzio.homepage_revamp_content(club_id,content,raffle_media_asset_id,ticket_media_asset_id,trophy_media_asset_id)
      values(p_club_id,s#-'{raffle,assetId}'#-'{ticket,assetId}'#-'{championship,trophy,assetId}',(s#>>'{raffle,assetId}')::uuid,(s#>>'{ticket,assetId}')::uuid,(s#>>'{championship,trophy,assetId}')::uuid)
      on conflict(club_id) do update set content=excluded.content,raffle_media_asset_id=excluded.raffle_media_asset_id,ticket_media_asset_id=excluded.ticket_media_asset_id,trophy_media_asset_id=excluded.trophy_media_asset_id;
    select retired_asset_ids||coalesce(array_agg(x),'{}') into retired_asset_ids from unnest(old_asset_ids) x where not(x=any(new_asset_ids));
  end if;
  result:=onzio_private.homepage_snapshot(p_club_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired_asset_ids));
  insert into onzio_private.homepage_save_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $$;

notify pgrst,'reload schema';
