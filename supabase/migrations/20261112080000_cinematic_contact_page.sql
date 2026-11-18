create table onzio.cinematic_contact_content (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  content jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table onzio.cinematic_contact_content enable row level security;
revoke all on onzio.cinematic_contact_content from anon, authenticated;
grant select on onzio.cinematic_contact_content to anon, authenticated;
grant insert(club_id, content), update(content) on onzio.cinematic_contact_content to authenticated;
grant all on onzio.cinematic_contact_content to service_role;
create policy cinematic_contact_read on onzio.cinematic_contact_content for select to anon, authenticated
  using (onzio_private.can_read_feature(club_id, 'contact'));
create policy cinematic_contact_insert on onzio.cinematic_contact_content for insert to authenticated
  with check (onzio_private.can_mutate_feature(club_id, 'contact') and onzio_private.homepage_design(club_id)->>'templateKey' = 'cinematic@2');
create policy cinematic_contact_update on onzio.cinematic_contact_content for update to authenticated
  using (onzio_private.can_mutate_feature(club_id, 'contact') and onzio_private.homepage_design(club_id)->>'templateKey' = 'cinematic@2')
  with check (onzio_private.can_mutate_feature(club_id, 'contact') and onzio_private.homepage_design(club_id)->>'templateKey' = 'cinematic@2');

create function onzio_private.serialize_cinematic_contact_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901299);
  return null;
end $$;
create function onzio_private.advance_cinematic_contact_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  new.updated_at := now();
  return new;
end $$;
revoke all on function onzio_private.serialize_cinematic_contact_write(), onzio_private.advance_cinematic_contact_revision() from public, anon;
grant execute on function onzio_private.serialize_cinematic_contact_write(), onzio_private.advance_cinematic_contact_revision() to authenticated, service_role;
create trigger serialize_cinematic_contact before insert or update or delete on onzio.cinematic_contact_content
  for each statement execute function onzio_private.serialize_cinematic_contact_write();
create trigger advance_cinematic_contact before insert or update on onzio.cinematic_contact_content
  for each row execute function onzio_private.advance_cinematic_contact_revision();
create trigger audit_cinematic_contact after insert or update or delete on onzio.cinematic_contact_content
  for each row execute function onzio_private.audit_content_mutation();

create function onzio_private.check_cinematic_contact_content(c jsonb) returns void
language plpgsql immutable security invoker set search_path = '' as $$
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
  if href <> '' and href !~ '^/[^/][-A-Za-z0-9_/?#=&%.]*$'
    and href !~ '^mailto:[^@[:space:]?]+@[^@[:space:]?]+[.][^@[:space:]?]+$'
    and (href !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z0-9-]+(:[0-9]+)?([/?#][^[:space:]\\]*)?$'
      or href ~* '^https://(localhost|127[.]|0[.]|[^/]*[.]localhost([:/]|$))')
    then raise exception 'INVALID_CINEMATIC_CONTACT_PAYLOAD' using errcode='22023';
  end if;
exception when others then
  raise exception 'INVALID_CINEMATIC_CONTACT_PAYLOAD' using errcode='22023';
end $$;
create function onzio_private.validate_cinematic_contact_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform onzio_private.check_cinematic_contact_content(new.content);
  return new;
end $$;
revoke all on function onzio_private.check_cinematic_contact_content(jsonb), onzio_private.validate_cinematic_contact_row() from public, anon;
grant execute on function onzio_private.check_cinematic_contact_content(jsonb), onzio_private.validate_cinematic_contact_row() to authenticated, service_role;
create trigger validate_cinematic_contact before insert or update on onzio.cinematic_contact_content
  for each row execute function onzio_private.validate_cinematic_contact_row();

create table onzio_private.cinematic_contact_save_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id, actor_id, operation_id)
);
alter table onzio_private.cinematic_contact_save_receipts enable row level security;
grant select, insert on onzio_private.cinematic_contact_save_receipts to authenticated;
create policy cinematic_contact_receipt_read on onzio_private.cinematic_contact_save_receipts for select to authenticated
  using (actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'contact'));
create policy cinematic_contact_receipt_insert on onzio_private.cinematic_contact_save_receipts for insert to authenticated
  with check (actor_id=auth.uid() and onzio_private.can_mutate_feature(club_id,'contact'));

create function onzio_private.cinematic_contact_snapshot(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'revision', coalesce((select revision::text from onzio.cinematic_contact_content where club_id=p_club_id), '0'),
    'designRevision', onzio_private.homepage_design(p_club_id)->>'designRevision',
    'content', (select content from onzio.cinematic_contact_content where club_id=p_club_id)
  );
$$;
revoke all on function onzio_private.cinematic_contact_snapshot(uuid) from public, anon;
grant execute on function onzio_private.cinematic_contact_snapshot(uuid) to authenticated, service_role;

create function onzio.load_cinematic_contact_editor(p_club_id uuid, p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901299);
  if not onzio_private.can_mutate_feature(p_club_id,'contact') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if p_operation_id is not null then
    select response into receipt from onzio_private.cinematic_contact_save_receipts
      where club_id=p_club_id and actor_id=auth.uid() and operation_id=p_operation_id;
  end if;
  if receipt is null and onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2'
    then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  result := onzio_private.cinematic_contact_snapshot(p_club_id);
  if p_operation_id is not null then
    result := result || jsonb_build_object('operation', case when receipt is null
      then jsonb_build_object('status','not-committed')
      else jsonb_build_object('status','committed','receipt',receipt) end);
  end if;
  return result;
end $$;

create function onzio.save_cinematic_contact_editor(p_club_id uuid, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare c jsonb; current_snapshot jsonb; result jsonb; op uuid; request_hash text; previous_hash text; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901299);
  if not onzio_private.can_mutate_feature(p_club_id,'contact') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  perform onzio_private.check_homepage_object(p_request, array['operationId','expectedRevision','designRevision','content'], array['operationId','expectedRevision','designRevision','content']);
  if jsonb_typeof(p_request->'operationId') is distinct from 'string'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
    or p_request->>'expectedRevision' !~ '^[0-9]+$'
    or length(p_request->>'expectedRevision') > 20 then
    raise exception 'INVALID_CINEMATIC_CONTACT_PAYLOAD' using errcode='22023';
  end if;
  perform onzio_private.check_cinematic_text(p_request->'designRevision',100);
  begin op := (p_request->>'operationId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_CINEMATIC_CONTACT_PAYLOAD' using errcode='22023'; end;
  if op is null then raise exception 'INVALID_CINEMATIC_CONTACT_PAYLOAD' using errcode='22023'; end if;
  c := p_request->'content';
  perform onzio_private.check_cinematic_contact_content(c);
  request_hash := encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select r.request_hash, r.response into previous_hash, receipt from onzio_private.cinematic_contact_save_receipts r
    where r.club_id=p_club_id and r.actor_id=auth.uid() and r.operation_id=op;
  if found then
    if request_hash <> previous_hash then raise exception 'OPERATION_REUSED' using errcode='22023'; end if;
    return receipt;
  end if;
  if onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2'
    then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  current_snapshot := onzio_private.cinematic_contact_snapshot(p_club_id);
  if current_snapshot->>'designRevision' is distinct from p_request->>'designRevision'
    then raise exception 'DESIGN_CHANGED' using errcode='22023'; end if;
  if current_snapshot->>'revision' is distinct from p_request->>'expectedRevision'
    then raise exception 'CINEMATIC_CONTACT_CHANGED' using errcode='PT409'; end if;
  insert into onzio.cinematic_contact_content(club_id,content) values(p_club_id,c)
    on conflict(club_id) do update set content=excluded.content;
  result := onzio_private.cinematic_contact_snapshot(p_club_id) || jsonb_build_object('operationId',op);
  insert into onzio_private.cinematic_contact_save_receipts(club_id,actor_id,operation_id,request_hash,response)
    values(p_club_id,auth.uid(),op,request_hash,result);
  return result;
end $$;
revoke all on function onzio.load_cinematic_contact_editor(uuid,uuid), onzio.save_cinematic_contact_editor(uuid,jsonb) from public, anon;
grant execute on function onzio.load_cinematic_contact_editor(uuid,uuid), onzio.save_cinematic_contact_editor(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
