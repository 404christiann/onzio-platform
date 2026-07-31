-- Onzio Platform Phase 9: immutable presentation documents, draft/published
-- pointers, and publication history.

create table onzio.presentation_documents (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  version integer not null check (version > 0),
  schema_version integer not null check (schema_version = 1),
  template_id text not null check (template_id in ('cinematic', 'heritage')),
  template_version integer not null check (template_version = 1),
  configuration jsonb not null,
  configuration_digest text not null
    check (configuration_digest ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, version)
);

create index presentation_documents_club_created_idx
  on onzio.presentation_documents (club_id, created_at desc);

create table onzio.presentation_state (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  draft_document_id uuid,
  published_document_id uuid,
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint presentation_state_draft_fkey
    foreign key (club_id, draft_document_id)
    references onzio.presentation_documents (club_id, id)
    on delete restrict,
  constraint presentation_state_published_fkey
    foreign key (club_id, published_document_id)
    references onzio.presentation_documents (club_id, id)
    on delete restrict,
  constraint presentation_state_has_pointer
    check (draft_document_id is not null or published_document_id is not null)
);

create table onzio.presentation_publications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  action text not null check (action in ('publish', 'rollback')),
  previous_document_id uuid,
  next_document_id uuid not null,
  next_configuration_digest text not null
    check (next_configuration_digest ~ '^[0-9a-f]{64}$'),
  validation_result jsonb not null,
  override_reason text check (
    override_reason is null
    or char_length(override_reason) between 8 and 1000
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint presentation_publications_previous_fkey
    foreign key (club_id, previous_document_id)
    references onzio.presentation_documents (club_id, id)
    on delete restrict,
  constraint presentation_publications_next_fkey
    foreign key (club_id, next_document_id)
    references onzio.presentation_documents (club_id, id)
    on delete restrict
);

create index presentation_publications_club_created_idx
  on onzio.presentation_publications (club_id, created_at desc);

alter table onzio.presentation_documents enable row level security;
alter table onzio.presentation_state enable row level security;
alter table onzio.presentation_publications enable row level security;

grant select on onzio.presentation_documents to anon, authenticated;
grant select on onzio.presentation_state to authenticated;
grant select on onzio.presentation_publications to authenticated;
grant select, insert, update on onzio.presentation_state to service_role;
grant select, insert, update, delete on onzio.presentation_documents to service_role;
grant select, insert on onzio.presentation_publications to service_role;

create or replace function onzio_private.is_published_presentation_document(
  target_club_id uuid,
  target_document_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from onzio.presentation_state state
    where state.club_id = target_club_id
      and state.published_document_id = target_document_id
  );
$$;

revoke execute on function onzio_private.is_published_presentation_document(uuid, uuid) from public;
grant execute on function onzio_private.is_published_presentation_document(uuid, uuid) to anon, authenticated;

create policy presentation_documents_public_published_read
on onzio.presentation_documents
for select
to anon, authenticated
using (
  onzio_private.is_publicly_accessible(club_id)
  and onzio_private.is_published_presentation_document(club_id, id)
);

create policy presentation_documents_member_read
on onzio.presentation_documents
for select
to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1
    from onzio.clubs club
    where club.id = presentation_documents.club_id
      and club.lifecycle <> 'archived'
  )
);

create policy presentation_state_member_read
on onzio.presentation_state
for select
to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1
    from onzio.clubs club
    where club.id = presentation_state.club_id
      and club.lifecycle <> 'archived'
  )
);

create policy presentation_publications_member_read
on onzio.presentation_publications
for select
to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1
    from onzio.clubs club
    where club.id = presentation_publications.club_id
      and club.lifecycle <> 'archived'
  )
);

create or replace function onzio_private.prevent_presentation_document_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'presentation documents are immutable';
end;
$$;

revoke execute on function onzio_private.prevent_presentation_document_mutation() from public;
grant execute on function onzio_private.prevent_presentation_document_mutation() to service_role;

create trigger presentation_documents_immutable
before update or delete on onzio.presentation_documents
for each row execute function onzio_private.prevent_presentation_document_mutation();

create or replace function onzio_private.prevent_presentation_publication_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'presentation publication history is immutable';
end;
$$;

revoke execute on function onzio_private.prevent_presentation_publication_mutation() from public;
grant execute on function onzio_private.prevent_presentation_publication_mutation() to service_role;

create trigger presentation_publications_immutable
before update or delete on onzio.presentation_publications
for each row execute function onzio_private.prevent_presentation_publication_mutation();

create trigger presentation_state_set_updated_at
before update on onzio.presentation_state
for each row execute function onzio_private.set_updated_at();

notify pgrst, 'reload schema';
