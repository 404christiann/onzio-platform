begin;

set local lock_timeout = '2s';
lock table onzio.clubs, onzio.presentation_documents, onzio.presentation_state
  in access exclusive mode nowait;
do $$ begin
  if not pg_catalog.pg_try_advisory_xact_lock(734901281) then
    raise exception 'HOMEPAGE_WRITERS_BUSY' using errcode='55P03';
  end if;
end $$;

create table onzio_private.homepage_assignment_epochs (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  epoch uuid not null default gen_random_uuid()
);
alter table onzio_private.homepage_assignment_epochs enable row level security;
revoke all on onzio_private.homepage_assignment_epochs from public,anon,authenticated,service_role;
insert into onzio_private.homepage_assignment_epochs(club_id) select id from onzio.clubs;

create function onzio_private.advance_homepage_assignment_epoch() returns trigger
language plpgsql security definer set search_path='' as $$
declare targets uuid[]; target uuid;
begin
  if tg_table_name='clubs' then
    if tg_op='INSERT' then
      insert into onzio_private.homepage_assignment_epochs(club_id) values(new.id);
      return null;
    end if;
    if old.slug is not distinct from new.slug then return null; end if;
    targets:=array[new.id];
  elsif tg_table_name='presentation_state' then
    if tg_op='UPDATE' then
      if old.club_id is not distinct from new.club_id
        and old.published_document_id is not distinct from new.published_document_id then return null; end if;
      targets:=case when old.club_id=new.club_id then array[new.club_id] else array[old.club_id,new.club_id] end;
    elsif tg_op='INSERT' then targets:=array[new.club_id];
    else targets:=array[old.club_id]; end if;
  elsif tg_table_name='presentation_documents' then
    if exists(select 1 from onzio.presentation_state where club_id=new.club_id and published_document_id is not null) then
      return null;
    end if;
    targets:=array[new.club_id];
  else raise exception 'INVALID_HOMEPAGE_ASSIGNMENT_TRIGGER';
  end if;
  foreach target in array targets loop
    if exists(select 1 from onzio.clubs where id=target) then
      update onzio_private.homepage_assignment_epochs set epoch=pg_catalog.gen_random_uuid() where club_id=target;
      if not found then raise exception 'HOMEPAGE_ASSIGNMENT_UNAVAILABLE' using errcode='22023'; end if;
    end if;
  end loop;
  return null;
end $$;
revoke all on function onzio_private.advance_homepage_assignment_epoch() from public,anon,authenticated,service_role;
create trigger homepage_assignment_club_insert after insert on onzio.clubs
  for each row execute function onzio_private.advance_homepage_assignment_epoch();
create trigger homepage_assignment_club_slug after update of slug on onzio.clubs
  for each row execute function onzio_private.advance_homepage_assignment_epoch();
create trigger homepage_assignment_state after insert or update or delete on onzio.presentation_state
  for each row execute function onzio_private.advance_homepage_assignment_epoch();
create trigger homepage_assignment_document after insert on onzio.presentation_documents
  for each row execute function onzio_private.advance_homepage_assignment_epoch();

create function onzio_private.homepage_binding_identity(p_design jsonb) returns jsonb
language plpgsql immutable security definer set search_path='' as $$
declare k text:=p_design->>'templateKey'; profile text; hero text; caption text;
begin
  if (k is not null and k not in ('academy@1','editorial@1','clubhouse@1','cinematic@1','heritage@1'))
    or (p_design->>'heroVariant') is null or (p_design->>'heroVariant') not in ('editable','legacy-fixed')
    or (p_design->>'slideshowVariant') is null or (p_design->>'slideshowVariant') not in ('none','editorial','matchday','legacy') then
    raise exception 'INVALID_HOMEPAGE_BINDING' using errcode='22023';
  end if;
  profile:=case when k='academy@1' then 'legacy/homepage-story/home-kit'
    when k in ('editorial@1','clubhouse@1') then 'legacy/about-story/shop-kits' else 'legacy/video/home-kit' end;
  hero:=case when p_design->>'heroVariant'='legacy-fixed' then 'fixed-hero'
    when k in ('editorial@1','clubhouse@1') then 'compact-hero' else 'full-hero' end;
  caption:=case when coalesce(k,'') not in ('academy@1','editorial@1') and p_design->>'slideshowVariant'='legacy'
    then 'caption' else 'no-caption' end;
  return jsonb_build_object('key',profile||'/'||hero||'/'||caption,'revision',1);
end $$;
revoke all on function onzio_private.homepage_binding_identity(jsonb) from public,anon,authenticated,service_role;

create function onzio_private.homepage_save_design(p_club_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare design jsonb; assignment_epoch uuid; binding jsonb;
begin
  design:=onzio_private.homepage_design(p_club_id);
  select epoch into assignment_epoch from onzio_private.homepage_assignment_epochs where club_id=p_club_id;
  if assignment_epoch is null then raise exception 'HOMEPAGE_ASSIGNMENT_UNAVAILABLE' using errcode='22023'; end if;
  binding:=onzio_private.homepage_binding_identity(design);
  if jsonb_typeof(binding) is distinct from 'object'
    or jsonb_typeof(binding->'key') is distinct from 'string' or coalesce(binding->>'key','')=''
    or jsonb_typeof(binding->'revision') is distinct from 'number'
    or coalesce(binding->>'revision','') !~ '^[1-9][0-9]*$' then
    raise exception 'INVALID_HOMEPAGE_BINDING' using errcode='22023';
  end if;
  if (binding->>'revision')::numeric > 9007199254740991 then
    raise exception 'INVALID_HOMEPAGE_BINDING' using errcode='22023';
  end if;
  return design||jsonb_build_object('binding',binding,'designRevision',
    md5(jsonb_build_array('homepage-save-v2',p_club_id,design->>'designRevision',assignment_epoch,binding->>'key',binding->'revision')::text));
end $$;
revoke all on function onzio_private.homepage_save_design(uuid) from public,anon,authenticated,service_role;
grant execute on function onzio_private.homepage_save_design(uuid) to authenticated;

create or replace function onzio_private.homepage_snapshot(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'revision', coalesce((select revision::text from onzio_private.homepage_revisions where club_id=p_club_id),'0'),
    'designRevision', onzio_private.homepage_save_design(p_club_id)->>'designRevision',
    'design', onzio_private.homepage_save_design(p_club_id),
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

commit;
