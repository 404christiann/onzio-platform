create schema PROOF_SCHEMA;
revoke all on schema PROOF_SCHEMA from public,anon,authenticated;

create table PROOF_SCHEMA.releases (
  club_id uuid not null references onzio.clubs(id),
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  document_id uuid not null,
  binding jsonb not null,
  platform text not null check (platform ~ '^[a-f0-9]{64}$'),
  lock_hash text not null check (lock_hash ~ '^[a-f0-9]{64}$'),
  binding_hash text not null check (binding_hash ~ '^[a-f0-9]{64}$'),
  primary key (club_id,digest),
  unique (club_id,document_id),
  foreign key (club_id,document_id) references onzio.presentation_documents(club_id,id)
);
create table PROOF_SCHEMA.workers (id uuid primary key);
create table PROOF_SCHEMA.capabilities (
  worker_id uuid not null references PROOF_SCHEMA.workers(id),
  club_id uuid not null,
  digest text not null,
  commitment text not null check (commitment ~ '^[a-f0-9]{64}$'),
  primary key (worker_id,club_id,digest),
  foreign key (club_id,digest) references PROOF_SCHEMA.releases(club_id,digest)
);
create table PROOF_SCHEMA.fleet (
  singleton boolean primary key check (singleton),
  generation uuid not null default gen_random_uuid()
);
insert into PROOF_SCHEMA.fleet(singleton) values(true);
create table PROOF_SCHEMA.members (worker_id uuid primary key references PROOF_SCHEMA.workers(id));
create table PROOF_SCHEMA.events (
  club_id uuid not null references onzio.clubs(id),
  id uuid not null default gen_random_uuid(),
  previous_id uuid,
  digest text,
  legacy_id uuid,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('publish','rollback')),
  primary key (club_id,id),
  check ((digest is null) <> (legacy_id is null)),
  foreign key (club_id,previous_id) references PROOF_SCHEMA.events(club_id,id),
  foreign key (club_id,digest) references PROOF_SCHEMA.releases(club_id,digest),
  foreign key (club_id,legacy_id) references onzio.presentation_documents(club_id,id)
);
create table PROOF_SCHEMA.state (
  club_id uuid primary key references onzio.clubs(id),
  current_id uuid not null,
  foreign key (club_id,current_id) references PROOF_SCHEMA.events(club_id,id)
);
create function PROOF_SCHEMA.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE'; end $$;
create trigger immutable before update or delete on PROOF_SCHEMA.releases for each row execute function PROOF_SCHEMA.immutable();
create trigger immutable before update or delete on PROOF_SCHEMA.workers for each row execute function PROOF_SCHEMA.immutable();
create trigger immutable before update or delete on PROOF_SCHEMA.capabilities for each row execute function PROOF_SCHEMA.immutable();
create trigger immutable before update or delete on PROOF_SCHEMA.events for each row execute function PROOF_SCHEMA.immutable();

create function PROOF_SCHEMA.register_release(
  p_club uuid,p_digest text,p_document uuid,p_binding jsonb,p_platform text,p_lock_hash text,p_binding_hash text
) returns void language plpgsql security definer set search_path='' as $$
declare projection onzio.presentation_documents; expected jsonb;
begin
  select * into projection from onzio.presentation_documents where club_id=p_club and id=p_document;
  if not found or projection.template_id<>'academy' or projection.template_version<>1
    or projection.configuration#>>'{template,id}' is distinct from 'academy'
    or projection.configuration#>>'{template,version}' is distinct from '1' then
    raise exception 'INVALID_PROJECTION';
  end if;
  expected:=onzio_private.homepage_binding_identity('{"templateKey":"academy@1","heroVariant":"editable","slideshowVariant":"none"}'::jsonb);
  if p_binding is distinct from expected then raise exception 'INVALID_BINDING'; end if;
  insert into PROOF_SCHEMA.releases values(p_club,p_digest,p_document,p_binding,p_platform,p_lock_hash,p_binding_hash);
end $$;

create function PROOF_SCHEMA.register_worker(p_worker uuid,p_capabilities jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare capability jsonb;
begin
  if jsonb_typeof(p_capabilities) is distinct from 'array' or jsonb_array_length(p_capabilities)=0 then
    raise exception 'INVALID_CAPABILITIES';
  end if;
  insert into PROOF_SCHEMA.workers values(p_worker);
  for capability in select value from jsonb_array_elements(p_capabilities) loop
    if jsonb_typeof(capability) is distinct from 'object'
      or not capability ?& array['clubId','digest','commitment']
      or exists(select 1 from jsonb_object_keys(capability) k where k not in ('clubId','digest','commitment')) then
      raise exception 'INVALID_CAPABILITIES';
    end if;
    insert into PROOF_SCHEMA.capabilities values(p_worker,(capability->>'clubId')::uuid,capability->>'digest',capability->>'commitment');
  end loop;
end $$;

create function PROOF_SCHEMA.replace_fleet(p_expected uuid,p_members uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare current_generation uuid; next_generation uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  select generation into current_generation from PROOF_SCHEMA.fleet where singleton for update;
  if current_generation is distinct from p_expected then
    raise exception 'FLEET_CHANGED' using errcode='PT409';
  end if;
  if p_members is null or cardinality(p_members)=0
    or exists(select 1 from unnest(p_members) id where id is null)
    or (select count(distinct id) from unnest(p_members) id)<>cardinality(p_members)
    or exists(select 1 from unnest(p_members) requested(member_id) where not exists(select 1 from PROOF_SCHEMA.workers w where w.id=requested.member_id)) then
    raise exception 'INVALID_FLEET';
  end if;
  if exists(
    select 1 from PROOF_SCHEMA.state s join PROOF_SCHEMA.events e on e.club_id=s.club_id and e.id=s.current_id
    left join PROOF_SCHEMA.releases r on r.club_id=e.club_id and r.digest=e.digest
    left join onzio.presentation_state p on p.club_id=s.club_id
    where p.published_document_id is distinct from coalesce(r.document_id,e.legacy_id)
  ) then raise exception 'PROJECTION_CHANGED' using errcode='PT409'; end if;
  if exists(
    select 1 from unnest(p_members) member cross join (
      select e.club_id,e.digest from PROOF_SCHEMA.state s join PROOF_SCHEMA.events e on e.club_id=s.club_id and e.id=s.current_id
      union
      select previous.club_id,previous.digest from PROOF_SCHEMA.state s
        join PROOF_SCHEMA.events e on e.club_id=s.club_id and e.id=s.current_id
        join PROOF_SCHEMA.events previous on previous.club_id=e.club_id and previous.id=e.previous_id
    ) required where required.digest is not null and not exists(
      select 1 from PROOF_SCHEMA.capabilities c where c.worker_id=member and c.club_id=required.club_id and c.digest=required.digest
    )
  ) then raise exception 'CAPABILITY_MISSING'; end if;
  if (select array_agg(worker_id order by worker_id) from PROOF_SCHEMA.members)
    is not distinct from (select array_agg(id order by id) from unnest(p_members) id) then return current_generation; end if;
  delete from PROOF_SCHEMA.members;
  insert into PROOF_SCHEMA.members select id from unnest(p_members) id;
  next_generation:=gen_random_uuid();
  update PROOF_SCHEMA.fleet set generation=next_generation where singleton;
  return next_generation;
end $$;

create function PROOF_SCHEMA.transition(
  p_club uuid,p_expected uuid,p_generation uuid,p_digest text,p_legacy uuid,p_actor uuid,p_action text
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_event PROOF_SCHEMA.events; predecessor PROOF_SCHEMA.events; current_pointer uuid;
  target_pointer uuid; prior_pointer uuid; current_generation uuid; next_event uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  select generation into current_generation from PROOF_SCHEMA.fleet where singleton for update;
  if current_generation is distinct from p_generation then raise exception 'FLEET_CHANGED' using errcode='PT409'; end if;
  if p_action is null or p_action not in ('publish','rollback') then raise exception 'INVALID_ACTION'; end if;
  if (p_digest is null)=(p_legacy is null) then raise exception 'INVALID_TARGET'; end if;
  if not exists(select 1 from onzio.club_members where club_id=p_club and user_id=p_actor and status='active') then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  select e.* into current_event from PROOF_SCHEMA.state s
    join PROOF_SCHEMA.events e on e.club_id=s.club_id and e.id=s.current_id where s.club_id=p_club;
  if current_event.id is distinct from p_expected then raise exception 'ASSIGNMENT_CHANGED' using errcode='PT409'; end if;
  select published_document_id into current_pointer from onzio.presentation_state where club_id=p_club for update;
  if current_event.id is not null then
    if current_event.digest is null then prior_pointer:=current_event.legacy_id;
    else select document_id into prior_pointer from PROOF_SCHEMA.releases where club_id=p_club and digest=current_event.digest; end if;
    if current_pointer is distinct from prior_pointer then raise exception 'PROJECTION_CHANGED' using errcode='PT409'; end if;
    if current_event.digest is not distinct from p_digest and current_event.legacy_id is not distinct from p_legacy then
      raise exception 'ALREADY_ASSIGNED';
    end if;
  end if;
  if p_action='rollback' then
    select * into predecessor from PROOF_SCHEMA.events where club_id=p_club and id=current_event.previous_id;
    if not found then raise exception 'NO_PREVIOUS_ASSIGNMENT'; end if;
    if predecessor.digest is distinct from p_digest or predecessor.legacy_id is distinct from p_legacy then
      raise exception 'ROLLBACK_TARGET_CHANGED';
    end if;
  end if;
  if p_digest is null then
    select id into target_pointer from onzio.presentation_documents where club_id=p_club and id=p_legacy;
  else
    select document_id into target_pointer from PROOF_SCHEMA.releases where club_id=p_club and digest=p_digest;
  end if;
  if target_pointer is null then raise exception 'TARGET_UNAVAILABLE'; end if;
  if not exists(select 1 from PROOF_SCHEMA.members) then raise exception 'NO_TRAFFIC'; end if;
  if exists(
    select 1 from PROOF_SCHEMA.members m cross join (values(p_digest),(current_event.digest)) required(digest)
    where required.digest is not null and not exists(
      select 1 from PROOF_SCHEMA.capabilities c where c.worker_id=m.worker_id and c.club_id=p_club and c.digest=required.digest
    )
  ) then raise exception 'CAPABILITY_MISSING'; end if;
  insert into PROOF_SCHEMA.events(club_id,previous_id,digest,legacy_id,actor_id,action)
    values(p_club,current_event.id,p_digest,p_legacy,p_actor,p_action) returning id into next_event;
  insert into PROOF_SCHEMA.state(club_id,current_id) values(p_club,next_event)
    on conflict(club_id) do update set current_id=excluded.current_id;
  insert into onzio.presentation_state(club_id,published_document_id,updated_by)
    values(p_club,target_pointer,p_actor)
    on conflict(club_id) do update set published_document_id=excluded.published_document_id,updated_by=excluded.updated_by;
  return next_event;
end $$;

create function PROOF_SCHEMA.snapshot(p_club uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'generation',f.generation,
    'members',coalesce((select jsonb_agg(worker_id order by worker_id) from PROOF_SCHEMA.members),'[]'::jsonb),
    'pointer',p.published_document_id,
    'event',case when e.id is null then null else jsonb_build_object(
      'clubId',e.club_id,'id',e.id,'previousId',e.previous_id,'digest',e.digest,'legacyId',e.legacy_id,
      'documentId',coalesce(r.document_id,e.legacy_id),'binding',r.binding,'platform',r.platform,
      'lockHash',r.lock_hash,'bindingHash',r.binding_hash,'configuration',d.configuration) end,
    'previousDigest',previous.digest)
  from PROOF_SCHEMA.fleet f
    left join onzio.presentation_state p on p.club_id=p_club
    left join PROOF_SCHEMA.state s on s.club_id=p_club
    left join PROOF_SCHEMA.events e on e.club_id=s.club_id and e.id=s.current_id
    left join PROOF_SCHEMA.events previous on previous.club_id=e.club_id and previous.id=e.previous_id
    left join PROOF_SCHEMA.releases r on r.club_id=e.club_id and r.digest=e.digest
    left join onzio.presentation_documents d on d.club_id=e.club_id and d.id=coalesce(r.document_id,e.legacy_id)
  where f.singleton;
$$;

alter table PROOF_SCHEMA.releases enable row level security;
alter table PROOF_SCHEMA.workers enable row level security;
alter table PROOF_SCHEMA.capabilities enable row level security;
alter table PROOF_SCHEMA.fleet enable row level security;
alter table PROOF_SCHEMA.members enable row level security;
alter table PROOF_SCHEMA.events enable row level security;
alter table PROOF_SCHEMA.state enable row level security;
revoke all on all tables in schema PROOF_SCHEMA from public,anon,authenticated,service_role;
revoke all on all functions in schema PROOF_SCHEMA from public,anon,authenticated,service_role;
grant usage on schema PROOF_SCHEMA to service_role;
grant select on all tables in schema PROOF_SCHEMA to service_role;
grant execute on function PROOF_SCHEMA.register_release(uuid,text,uuid,jsonb,text,text,text) to service_role;
grant execute on function PROOF_SCHEMA.register_worker(uuid,jsonb) to service_role;
grant execute on function PROOF_SCHEMA.replace_fleet(uuid,uuid[]) to service_role;
grant execute on function PROOF_SCHEMA.transition(uuid,uuid,uuid,text,uuid,uuid,text) to service_role;
grant execute on function PROOF_SCHEMA.snapshot(uuid) to service_role;
