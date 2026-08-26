-- Registration-form archival is an admin visibility state. It is separate
-- from the public intake lifecycle: draft forms have never been published,
-- open forms accept registrations, and closed forms retain a stable public
-- "registration closed" page. Archiving always closes intake and preserves
-- the complete form, registration, waiver, and payment history.

alter table onzio.registration_forms
  add column archived_at timestamptz,
  add constraint registration_forms_archived_not_open_check
    check (archived_at is null or status <> 'open');

create index registration_forms_admin_visibility_idx
  on onzio.registration_forms (club_id, archived_at, created_at desc);

-- Preserve the original publishability checks while making archival a
-- one-way admin action. Archived forms remain readable to their tenant's
-- admins through the existing RLS policy, but cannot be reopened or edited.
create or replace function onzio_private.prepare_registration_form_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.archived_at is not null then
    raise exception using
      errcode = '23514',
      message = 'REGISTRATION_FORM_ARCHIVED';
  end if;

  if tg_op = 'UPDATE' and old.archived_at is not null then
    raise exception using
      errcode = '23514',
      message = 'REGISTRATION_FORM_ARCHIVED';
  end if;

  if new.archived_at is not null and new.status = 'open' then
    new.status := 'closed';
  end if;

  if new.status = 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;

  if new.status = 'open' then
    perform onzio_private.assert_registration_form_publishable(
      new.club_id,
      new.id
    );
  end if;

  return new;
end;
$$;

revoke execute on function
  onzio_private.prepare_registration_form_status()
from public;

-- Keep form-definition descendants immutable after archival even when a
-- caller reaches them through the generic admin-data route. The helper runs
-- behind RLS so callers cannot make an archived parent writable by hiding it
-- from their own SELECT policy.
create or replace function onzio_private.can_mutate_registration_form_definition(
  p_club_id uuid,
  p_form_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.can_mutate_feature(p_club_id, 'registrations')
    and exists (
      select 1
      from onzio.registration_forms form
      where form.club_id = p_club_id
        and form.id = p_form_id
        and form.archived_at is null
    );
$$;

revoke execute on function
  onzio_private.can_mutate_registration_form_definition(uuid, uuid)
from public;
grant execute on function
  onzio_private.can_mutate_registration_form_definition(uuid, uuid)
to authenticated, service_role;

-- The row-level delete guard mirrors the product rule: authenticated admins
-- may hard-delete only an unarchived form that has never received a
-- registration. Linked Programs/Tryouts remain protected by their restrictive
-- composite foreign keys.
create or replace function onzio_private.can_delete_registration_form(
  p_club_id uuid,
  p_form_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.can_mutate_feature(p_club_id, 'registrations')
    and exists (
      select 1
      from onzio.registration_forms form
      where form.club_id = p_club_id
        and form.id = p_form_id
        and form.archived_at is null
    )
    and not exists (
      select 1
      from onzio.registrations registration
      where registration.club_id = p_club_id
        and registration.form_id = p_form_id
    );
$$;

revoke execute on function
  onzio_private.can_delete_registration_form(uuid, uuid)
from public;
grant execute on function
  onzio_private.can_delete_registration_form(uuid, uuid)
to authenticated, service_role;

drop policy registration_forms_tenant_delete
  on onzio.registration_forms;
create policy registration_forms_tenant_delete
on onzio.registration_forms
for delete
to authenticated
using (
  onzio_private.can_delete_registration_form(club_id, id)
);

drop policy registration_form_fields_tenant_insert
  on onzio.registration_form_fields;
create policy registration_form_fields_tenant_insert
on onzio.registration_form_fields
for insert
to authenticated
with check (
  onzio_private.can_mutate_registration_form_definition(club_id, form_id)
);

drop policy registration_form_fields_tenant_update
  on onzio.registration_form_fields;
create policy registration_form_fields_tenant_update
on onzio.registration_form_fields
for update
to authenticated
using (
  onzio_private.can_mutate_registration_form_definition(club_id, form_id)
)
with check (
  onzio_private.can_mutate_registration_form_definition(club_id, form_id)
);

drop policy registration_form_fields_tenant_delete
  on onzio.registration_form_fields;
create policy registration_form_fields_tenant_delete
on onzio.registration_form_fields
for delete
to authenticated
using (
  onzio_private.can_mutate_registration_form_definition(club_id, form_id)
);

drop policy registration_price_options_tenant_insert
  on onzio.registration_price_options;
create policy registration_price_options_tenant_insert
on onzio.registration_price_options
for insert
to authenticated
with check (
  onzio_private.can_mutate_registration_form_definition(club_id, form_id)
);

drop policy registration_price_options_tenant_update
  on onzio.registration_price_options;
create policy registration_price_options_tenant_update
on onzio.registration_price_options
for update
to authenticated
using (
  onzio_private.can_mutate_registration_form_definition(club_id, form_id)
)
with check (
  onzio_private.can_mutate_registration_form_definition(club_id, form_id)
);

drop policy registration_price_options_tenant_delete
  on onzio.registration_price_options;
create policy registration_price_options_tenant_delete
on onzio.registration_price_options
for delete
to authenticated
using (
  onzio_private.can_mutate_registration_form_definition(club_id, form_id)
);
