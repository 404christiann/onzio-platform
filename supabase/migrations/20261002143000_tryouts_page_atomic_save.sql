-- PPE-03: the intro and all Tryouts event changes commit as one RLS-enforced
-- transaction. Legacy row writes share the revision lock, so an editor draft
-- cannot overwrite a change made by the older admin API or another tab.
create table onzio_private.tryouts_page_revisions (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  revision bigint not null default 0
);
create table onzio_private.tryouts_page_save_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id, actor_id, operation_id)
);
alter table onzio_private.tryouts_page_revisions enable row level security;
alter table onzio_private.tryouts_page_save_receipts enable row level security;
grant select on onzio_private.tryouts_page_revisions to authenticated;
grant select, insert on onzio_private.tryouts_page_save_receipts to authenticated;
create policy tryouts_page_revision_read on onzio_private.tryouts_page_revisions
  for select to authenticated using (onzio_private.is_club_session_fresh() and onzio_private.is_club_member(club_id));
create policy tryouts_page_receipt_read on onzio_private.tryouts_page_save_receipts
  for select to authenticated using (actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'tryouts'));
create policy tryouts_page_receipt_insert on onzio_private.tryouts_page_save_receipts
  for insert to authenticated with check (actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'tryouts'));

create function onzio_private.serialize_tryouts_page_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(734901282);
  return null;
end $$;
revoke all on function onzio_private.serialize_tryouts_page_write() from public,anon;
grant execute on function onzio_private.serialize_tryouts_page_write() to authenticated,service_role;

create function onzio_private.advance_tryouts_page_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into onzio_private.tryouts_page_revisions(club_id,revision)
    values(coalesce(new.club_id,old.club_id),1)
    on conflict(club_id) do update set revision=onzio_private.tryouts_page_revisions.revision+1;
  return null;
end $$;
revoke all on function onzio_private.advance_tryouts_page_revision() from public,anon,authenticated,service_role;

create trigger serialize_tryouts_page_write before insert or update or delete on onzio.tryouts
  for each statement execute function onzio_private.serialize_tryouts_page_write();
create trigger advance_tryouts_page_revision after insert or update or delete on onzio.tryouts
  for each row execute function onzio_private.advance_tryouts_page_revision();
create trigger serialize_tryouts_intro_write before insert or update or delete on onzio.tryouts_page_content
  for each statement execute function onzio_private.serialize_tryouts_page_write();
create trigger advance_tryouts_intro_revision after insert or update or delete on onzio.tryouts_page_content
  for each row execute function onzio_private.advance_tryouts_page_revision();

create function onzio_private.tryouts_page_snapshot(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'revision',coalesce((select revision::text from onzio_private.tryouts_page_revisions where club_id=p_club_id),'0'),
    'page',coalesce((select to_jsonb(p)-'club_id'-'updated_at' from onzio.tryouts_page_content p where club_id=p_club_id),'{}'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order,e.id)
      from onzio.tryouts e where e.club_id=p_club_id),'[]'::jsonb)
  );
$$;
revoke all on function onzio_private.tryouts_page_snapshot(uuid) from public,anon;
grant execute on function onzio_private.tryouts_page_snapshot(uuid) to authenticated;

create function onzio.load_tryouts_page(p_club_id uuid,p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901282);
  if not onzio_private.is_club_session_fresh() or not onzio_private.is_club_member(p_club_id)
    or not exists(select 1 from onzio.clubs where id=p_club_id and lifecycle in ('active','onboarding')) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  if coalesce(onzio_private.homepage_design(p_club_id)->>'templateKey','') not in ('academy@1','editorial@1')
    then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  result:=onzio_private.tryouts_page_snapshot(p_club_id);
  if p_operation_id is not null then
    if not onzio_private.can_mutate_feature(p_club_id,'tryouts') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
    select response into receipt from onzio_private.tryouts_page_save_receipts
      where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
    result:=result||jsonb_build_object('operation',case when receipt is null
      then jsonb_build_object('status','not-committed')
      else jsonb_build_object('status','committed','receipt',receipt) end);
  end if;
  return result;
end $$;
revoke all on function onzio.load_tryouts_page(uuid,uuid) from public,anon;
grant execute on function onzio.load_tryouts_page(uuid,uuid) to authenticated;

create function onzio.save_tryouts_page(p_club_id uuid,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  current_page jsonb; result jsonb; intro jsonb; item jsonb; deleted jsonb;
  op uuid; request_hash text; saved_hash text; receipt jsonb;
  row_data onzio.tryouts; event_id uuid; ids uuid[]:='{}'; deleted_ids uuid[]:='{}'; index_number integer:=0;
  old_media_ids uuid[]:='{}'; retired_media_ids uuid[]:='{}';
  expected_count integer; actual_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901282);
  if not onzio_private.can_mutate_feature(p_club_id,'tryouts') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if coalesce(onzio_private.homepage_design(p_club_id)->>'templateKey','') not in ('academy@1','editorial@1')
    then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
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
    if row_data.registration_href<>'' and (
      row_data.registration_href<>btrim(row_data.registration_href)
      or row_data.registration_href ~ '[[:space:][:cntrl:]]'
      or not (
        (left(row_data.registration_href,1)='/' and left(row_data.registration_href,2)<>'//'
          and left(row_data.registration_href,2)<>('/'||chr(92)))
        or row_data.registration_href ~ '^https?://[A-Za-z0-9.-]+'
        or row_data.registration_href ~ '^mailto:[^@]+@[^@]+'
      )) then raise exception 'INVALID_TRYOUTS_PAYLOAD' using errcode='22023'; end if;
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
end $$;
revoke all on function onzio.save_tryouts_page(uuid,jsonb) from public,anon;
grant execute on function onzio.save_tryouts_page(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
