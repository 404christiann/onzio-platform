create schema PROOF_SCHEMA;
revoke all on schema PROOF_SCHEMA from public, anon, authenticated;

create table PROOF_SCHEMA.releases (
  club_id uuid not null references onzio.clubs(id),
  id uuid not null,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  binding text not null,
  primary key (club_id,id)
);
create table PROOF_SCHEMA.events (
  club_id uuid not null references onzio.clubs(id),
  id uuid not null default gen_random_uuid(),
  previous_id uuid,
  release_id uuid,
  legacy_id uuid,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('publish','rollback')),
  primary key (club_id,id),
  check ((release_id is null) <> (legacy_id is null)),
  foreign key (club_id,previous_id) references PROOF_SCHEMA.events(club_id,id),
  foreign key (club_id,release_id) references PROOF_SCHEMA.releases(club_id,id),
  foreign key (club_id,legacy_id) references onzio.presentation_documents(club_id,id)
);
create table PROOF_SCHEMA.state (
  club_id uuid primary key references onzio.clubs(id),
  current_id uuid,
  foreign key (club_id,current_id) references PROOF_SCHEMA.events(club_id,id)
);
create function PROOF_SCHEMA.immutable() returns trigger language plpgsql as $$
begin raise exception 'IMMUTABLE'; end;
$$;
create trigger immutable before update or delete on PROOF_SCHEMA.releases
for each row execute function PROOF_SCHEMA.immutable();
create trigger immutable before update or delete on PROOF_SCHEMA.events
for each row execute function PROOF_SCHEMA.immutable();

create function PROOF_SCHEMA.transition(
  p_club uuid,p_expected uuid,p_release uuid,p_legacy uuid,p_actor uuid,p_action text
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_event uuid; next_event uuid; target PROOF_SCHEMA.events;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  if p_action not in ('publish','rollback') or p_action is null then
    raise exception 'INVALID_ACTION';
  end if;
  insert into PROOF_SCHEMA.state(club_id) values(p_club) on conflict do nothing;
  select current_id into current_event from PROOF_SCHEMA.state where club_id=p_club for update;
  if current_event is distinct from p_expected then
    raise exception using message='ASSIGNMENT_CHANGED',errcode='PT409';
  end if;
  if p_action='rollback' then
    select predecessor.* into target from PROOF_SCHEMA.events current
      join PROOF_SCHEMA.events predecessor on predecessor.club_id=current.club_id and predecessor.id=current.previous_id
      where current.club_id=p_club and current.id=current_event;
    if not found then raise exception 'NO_PREVIOUS_ASSIGNMENT'; end if;
    if target.release_id is distinct from p_release or target.legacy_id is distinct from p_legacy then
      raise exception 'ROLLBACK_TARGET_CHANGED';
    end if;
  end if;
  insert into PROOF_SCHEMA.events(club_id,previous_id,release_id,legacy_id,actor_id,action)
    values(p_club,current_event,p_release,p_legacy,p_actor,p_action) returning id into next_event;
  update PROOF_SCHEMA.state set current_id=next_event where club_id=p_club;
  return next_event;
end;
$$;
revoke all on all tables in schema PROOF_SCHEMA from public,anon,authenticated,service_role;
revoke all on all functions in schema PROOF_SCHEMA from public,anon,authenticated,service_role;
grant usage on schema PROOF_SCHEMA to service_role;
grant select on all tables in schema PROOF_SCHEMA to service_role;
grant execute on function PROOF_SCHEMA.transition(uuid,uuid,uuid,uuid,uuid,text) to service_role;
