-- HP-02: one RLS-enforced homepage transaction and actor-scoped receipts.
-- Legacy writers participate in the same lock before acquiring row locks.
-- A single short advisory lock deliberately serializes homepage-related writes
-- at this small tenant scale, avoiding row/advisory lock inversion with the old
-- editor, missing singleton rows, publication changes and media retirement.

create table onzio_private.homepage_revisions (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  revision bigint not null default 0
);
create table onzio_private.homepage_save_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(club_id,actor_id,operation_id)
);
alter table onzio_private.homepage_revisions enable row level security;
alter table onzio_private.homepage_save_receipts enable row level security;
-- The schema remains unexposed by PostgREST. No generic SQL execution API is
-- granted. Public invoker RPCs need schema usage and narrowly scoped table
-- rights; RLS also protects direct SQL execution as authenticated.
grant usage on schema onzio_private to authenticated;
grant select on onzio_private.homepage_revisions to authenticated;
grant select,insert on onzio_private.homepage_save_receipts to authenticated;
create policy homepage_revision_read on onzio_private.homepage_revisions for select to authenticated
  using (onzio_private.is_club_session_fresh() and onzio_private.is_club_member(club_id));
create policy homepage_receipt_read on onzio_private.homepage_save_receipts for select to authenticated
  using (actor_id=auth.uid() and onzio_private.can_mutate_content(club_id));
create policy homepage_receipt_insert on onzio_private.homepage_save_receipts for insert to authenticated
  with check (actor_id=auth.uid() and onzio_private.can_mutate_content(club_id));

create function onzio_private.serialize_homepage_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  return null;
end $$;
revoke all on function onzio_private.serialize_homepage_write() from public, anon;
grant execute on function onzio_private.serialize_homepage_write() to authenticated,service_role;

create function onzio_private.advance_homepage_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into onzio_private.homepage_revisions(club_id,revision)
    values(coalesce(new.club_id,old.club_id),1)
    on conflict(club_id) do update set revision=onzio_private.homepage_revisions.revision+1;
  if tg_op='UPDATE' and old.club_id<>new.club_id then
    insert into onzio_private.homepage_revisions(club_id,revision) values(old.club_id,1)
      on conflict(club_id) do update set revision=onzio_private.homepage_revisions.revision+1;
  end if;
  return null;
end $$;
revoke all on function onzio_private.advance_homepage_revision() from public,anon,authenticated,service_role;

do $$ declare t text; begin
  foreach t in array array['homepage_hero_content','homepage_story_section','homepage_slideshow_photos','homepage_slideshow_settings','behind_the_rose_section','presentation_state','presentation_documents','clubs','club_members','media_assets'] loop
    execute format('create trigger serialize_homepage_write before insert or update or delete on onzio.%I for each statement execute function onzio_private.serialize_homepage_write()',t);
  end loop;
  foreach t in array array['homepage_hero_content','homepage_story_section','homepage_slideshow_photos','homepage_slideshow_settings','behind_the_rose_section'] loop
    execute format('create trigger advance_homepage_revision after insert or update or delete on onzio.%I for each row execute function onzio_private.advance_homepage_revision()',t);
  end loop;
end $$;

-- Metadata belongs to the operator-controlled immutable design document. Use
-- published pointer first, latest document only when no published pointer,
-- matching the current public ClubContext resolver. Never accept a client key.
create function onzio_private.homepage_design(p_club_id uuid) returns jsonb
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
  if d.id is not null and (k not in ('academy@1','editorial@1','clubhouse@1','cinematic@1','heritage@1')
    or (d.configuration#>>'{template,id}') is distinct from d.template_id
    or (d.configuration#>>'{template,version}') is distinct from d.template_version::text) then
    raise exception 'INVALID_HOMEPAGE_DESIGN' using errcode='22023';
  end if;
  return jsonb_build_object('templateKey',k,'slug',c.slug,'designRevision',
    md5(jsonb_build_array(c.slug,d.id,d.configuration)::text),
    'slideshowVariant',case when k='academy@1' then 'none' when k='editorial@1' then 'editorial' when c.slug='rose-city' then 'legacy' else 'matchday' end,
    'heroVariant',case when c.slug='rose-city' and coalesce(k,'') not in ('academy@1','editorial@1','clubhouse@1') then 'legacy-fixed' else 'editable' end);
end $$;
revoke all on function onzio_private.homepage_design(uuid) from public,anon;
grant execute on function onzio_private.homepage_design(uuid) to authenticated;

create function onzio_private.homepage_snapshot(p_club_id uuid) returns jsonb
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
          from onzio.homepage_slideshow_photos p where p.club_id=p_club_id),'[]'::jsonb))),
    'videoSource',coalesce((select video_url from onzio.behind_the_rose_section where club_id=p_club_id),''),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'storage_bucket',m.storage_bucket,'storage_path',m.storage_path))
      from onzio.media_assets m where m.club_id=p_club_id and m.status='published' and m.deleted_at is null and m.storage_bucket='onzio-media'
      and exists(select 1 from onzio.homepage_slideshow_photos p where p.club_id=p_club_id and p.media_asset_id=m.id)),'[]'::jsonb)
  );
$$;
revoke all on function onzio_private.homepage_snapshot(uuid) from public,anon;
grant execute on function onzio_private.homepage_snapshot(uuid) to authenticated;

create function onzio.load_homepage(p_club_id uuid, p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  if not onzio_private.is_club_session_fresh() or not onzio_private.is_club_member(p_club_id)
    or not exists(select 1 from onzio.clubs where id=p_club_id and lifecycle in ('active','onboarding')) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  result:=onzio_private.homepage_snapshot(p_club_id);
  if p_operation_id is not null then
    if not onzio_private.can_mutate_content(p_club_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
    select response into receipt from onzio_private.homepage_save_receipts where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
    result:=result||jsonb_build_object('operation',case when receipt is null then jsonb_build_object('status','not-committed') else jsonb_build_object('status','committed','receipt',receipt) end);
  end if;
  return result;
end $$;
revoke all on function onzio.load_homepage(uuid,uuid) from public,anon;
grant execute on function onzio.load_homepage(uuid,uuid) to authenticated;

-- Strict shape checks are repeated in SQL so direct RPCs cannot bypass the
-- Next route's Zod validation. Template/asset authority remains database-owned.
create function onzio_private.check_homepage_object(v jsonb, keys text[], required text[] default '{}') returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v) k where not k=any(keys))
    or not v ?& required then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
end $$;
revoke all on function onzio_private.check_homepage_object(jsonb,text[],text[]) from public,anon;
grant execute on function onzio_private.check_homepage_object(jsonb,text[],text[]) to authenticated;

create function onzio.save_homepage(p_club_id uuid,p_request jsonb) returns jsonb
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
  perform onzio_private.check_homepage_object(sections,array['hero','photos','story','video']);
  if sections='{}'::jsonb then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  for section,fields in select * from jsonb_each(sections) loop
    if (section='hero' and d->>'heroVariant'='legacy-fixed') or (section='story' and coalesce(template,'')<>'academy@1')
      or (section='photos' and template='academy@1') or (section='video' and template in ('academy@1','editorial@1','clubhouse@1')) then
      raise exception 'SECTION_UNAVAILABLE' using errcode='22023';
    end if;
    if section='hero' then
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
    if jsonb_typeof(sections#>'{photos,items}') is distinct from 'array' or jsonb_array_length(sections#>'{photos,items}')>6 then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
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
  result:=onzio_private.homepage_snapshot(p_club_id)||jsonb_build_object('operationId',op,'retiredMediaAssetIds',to_jsonb(retired_asset_ids));
  insert into onzio_private.homepage_save_receipts(club_id,actor_id,operation_id,request_hash,response) values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $$;
revoke all on function onzio.save_homepage(uuid,jsonb) from public,anon;
grant execute on function onzio.save_homepage(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
