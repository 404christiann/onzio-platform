-- PPE-06: Contact page copy and shared contact details commit together.
-- Legacy writes advance the revision, and actor-scoped receipts reconcile a
-- committed response that never reached the browser.
create table onzio_private.contact_editor_revisions (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  revision bigint not null default 0
);
create table onzio_private.contact_editor_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id, actor_id, operation_id)
);
alter table onzio_private.contact_editor_revisions enable row level security;
alter table onzio_private.contact_editor_receipts enable row level security;
grant select on onzio_private.contact_editor_revisions to authenticated;
grant select, insert on onzio_private.contact_editor_receipts to authenticated;
create policy contact_editor_revision_read on onzio_private.contact_editor_revisions
  for select to authenticated using (
    onzio_private.is_club_session_fresh() and onzio_private.is_club_member(club_id)
  );
create policy contact_editor_receipt_read on onzio_private.contact_editor_receipts
  for select to authenticated using (
    actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'contact')
  );
create policy contact_editor_receipt_insert on onzio_private.contact_editor_receipts
  for insert to authenticated with check (
    actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'contact')
  );

create function onzio_private.serialize_contact_editor_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(734901289);
  return null;
end $$;
revoke all on function onzio_private.serialize_contact_editor_write() from public,anon;
grant execute on function onzio_private.serialize_contact_editor_write() to authenticated,service_role;

create function onzio_private.advance_contact_editor_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_club uuid;
begin
  if tg_op = 'DELETE' then target_club := old.club_id;
  else target_club := new.club_id; end if;
  insert into onzio_private.contact_editor_revisions(club_id,revision)
    values(target_club,1)
    on conflict(club_id) do update
      set revision=onzio_private.contact_editor_revisions.revision+1;
  return null;
end $$;
revoke all on function onzio_private.advance_contact_editor_revision()
  from public,anon,authenticated,service_role;

create trigger serialize_contact_profile_write before insert or update or delete
  on onzio.contact_profile for each statement
  execute function onzio_private.serialize_contact_editor_write();
create trigger advance_contact_profile_revision after insert or update or delete
  on onzio.contact_profile for each row
  execute function onzio_private.advance_contact_editor_revision();
create trigger serialize_contact_page_write before insert or update or delete
  on onzio.contact_page_content for each statement
  execute function onzio_private.serialize_contact_editor_write();
create trigger advance_contact_page_revision after insert or update or delete
  on onzio.contact_page_content for each row
  execute function onzio_private.advance_contact_editor_revision();

create function onzio_private.contact_editor_snapshot(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'revision',coalesce((select revision::text from onzio_private.contact_editor_revisions
      where club_id=p_club_id),'0'),
    'profile',(select to_jsonb(p)-'club_id'-'updated_at'
      from onzio.contact_profile p where p.club_id=p_club_id),
    'page',(select to_jsonb(p)-'club_id'-'updated_at'
      from onzio.contact_page_content p where p.club_id=p_club_id)
  );
$$;
revoke all on function onzio_private.contact_editor_snapshot(uuid) from public,anon;
grant execute on function onzio_private.contact_editor_snapshot(uuid) to authenticated;

create function onzio.load_contact_editor(
  p_club_id uuid,p_operation_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901289);
  if not onzio_private.can_mutate_feature(p_club_id,'contact') then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  if coalesce(onzio_private.homepage_design(p_club_id)->>'templateKey','')
      not in ('academy@1','editorial@1') then
    raise exception 'PAGE_UNAVAILABLE' using errcode='22023';
  end if;
  result:=onzio_private.contact_editor_snapshot(p_club_id);
  if p_operation_id is not null then
    select response into receipt from onzio_private.contact_editor_receipts
      where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
    result:=result||jsonb_build_object('operation',case when receipt is null
      then jsonb_build_object('status','not-committed')
      else jsonb_build_object('status','committed','receipt',receipt) end);
  end if;
  return result;
end $$;
revoke all on function onzio.load_contact_editor(uuid,uuid) from public,anon;
grant execute on function onzio.load_contact_editor(uuid,uuid) to authenticated;

create function onzio.save_contact_editor(p_club_id uuid,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  profile jsonb; page jsonb; result jsonb; current_page jsonb;
  op uuid; media_id uuid; old_media_id uuid;
  request_hash text; saved_hash text; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901289);
  if not onzio_private.can_mutate_feature(p_club_id,'contact') then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  if coalesce(onzio_private.homepage_design(p_club_id)->>'templateKey','')
      not in ('academy@1','editorial@1') then
    raise exception 'PAGE_UNAVAILABLE' using errcode='22023';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object'
    or not p_request ?& array['operationId','expectedRevision','profile','page']
    or exists(select 1 from jsonb_object_keys(p_request) k
      where k<>all(array['operationId','expectedRevision','profile','page']))
    or jsonb_typeof(p_request->'profile') is distinct from 'object'
    or jsonb_typeof(p_request->'page') is distinct from 'object'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
    or (p_request->>'expectedRevision')!~'^[0-9]+$'
    or char_length(p_request->>'expectedRevision')>20 then
    raise exception 'INVALID_CONTACT_PAYLOAD' using errcode='22023';
  end if;
  profile:=p_request->'profile'; page:=p_request->'page';
  if not profile ?& array['public_email','public_phone','service_area','hours']
    or exists(select 1 from jsonb_object_keys(profile) k
      where k<>all(array['public_email','public_phone','service_area','hours']))
    or not page ?& array['eyebrow','headline','intro','hero_media_asset_id']
    or exists(select 1 from jsonb_object_keys(page) k
      where k<>all(array['eyebrow','headline','intro','hero_media_asset_id']))
    or jsonb_typeof(profile->'public_email')<>'string'
    or jsonb_typeof(profile->'public_phone')<>'string'
    or jsonb_typeof(profile->'service_area')<>'string'
    or jsonb_typeof(profile->'hours')<>'string'
    or jsonb_typeof(page->'eyebrow')<>'string'
    or jsonb_typeof(page->'headline')<>'string'
    or jsonb_typeof(page->'intro')<>'string'
    or jsonb_typeof(page->'hero_media_asset_id') not in ('string','null')
    or char_length(profile->>'public_email')>254
    or char_length(profile->>'public_phone')>40
    or char_length(profile->>'service_area')>120
    or char_length(profile->>'hours')>200
    or char_length(page->>'eyebrow')>80
    or char_length(page->>'headline')>80
    or char_length(page->>'intro')>320 then
    raise exception 'INVALID_CONTACT_PAYLOAD' using errcode='22023';
  end if;
  begin
    op:=(p_request->>'operationId')::uuid;
    media_id:=(page->>'hero_media_asset_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'INVALID_CONTACT_PAYLOAD' using errcode='22023';
  end;
  if op is null then raise exception 'INVALID_CONTACT_PAYLOAD' using errcode='22023'; end if;
  request_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select r.request_hash,r.response into saved_hash,receipt
    from onzio_private.contact_editor_receipts r
    where r.club_id=p_club_id and r.actor_id=auth.uid() and r.operation_id=op;
  if found then
    if saved_hash<>request_hash then raise exception 'OPERATION_REUSED' using errcode='22023'; end if;
    return receipt;
  end if;
  current_page:=onzio_private.contact_editor_snapshot(p_club_id);
  if (current_page->>'revision') is distinct from (p_request->>'expectedRevision') then
    raise exception 'CONTACT_CHANGED' using errcode='PT409';
  end if;
  if media_id is not null and not exists(
    select 1 from onzio.media_assets m where m.club_id=p_club_id and m.id=media_id
      and m.surface='contact' and m.status='published' and m.deleted_at is null
  ) then raise exception 'INVALID_CONTACT_MEDIA' using errcode='22023'; end if;
  select hero_media_asset_id into old_media_id from onzio.contact_page_content
    where club_id=p_club_id;
  insert into onzio.contact_profile(club_id,public_email,public_phone,service_area,hours)
    values(p_club_id,btrim(profile->>'public_email'),btrim(profile->>'public_phone'),
      btrim(profile->>'service_area'),btrim(profile->>'hours'))
    on conflict(club_id) do update set public_email=excluded.public_email,
      public_phone=excluded.public_phone,service_area=excluded.service_area,hours=excluded.hours;
  insert into onzio.contact_page_content(
    club_id,eyebrow,headline,intro,hero_media_asset_id
  ) values(p_club_id,btrim(page->>'eyebrow'),btrim(page->>'headline'),
    btrim(page->>'intro'),media_id)
    on conflict(club_id) do update set eyebrow=excluded.eyebrow,
      headline=excluded.headline,intro=excluded.intro,
      hero_media_asset_id=excluded.hero_media_asset_id;
  result:=onzio_private.contact_editor_snapshot(p_club_id)||jsonb_build_object(
    'operationId',op,'retiredMediaAssetIds',case
      when old_media_id is not null and old_media_id is distinct from media_id
      then jsonb_build_array(old_media_id) else '[]'::jsonb end);
  insert into onzio_private.contact_editor_receipts(
    club_id,actor_id,operation_id,request_hash,response
  ) values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $$;
revoke all on function onzio.save_contact_editor(uuid,jsonb) from public,anon;
grant execute on function onzio.save_contact_editor(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
