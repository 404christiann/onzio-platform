-- Fresh active club members must be able to INSERT ... RETURNING form
-- definitions without looking up the row currently being inserted.
-- Anonymous callers still require an open form on a readable club.
create or replace function onzio_private.can_read_registration_form(
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
    or exists (
      select 1
      from onzio.registration_forms form
      where form.club_id = p_club_id
        and form.id = p_form_id
        and form.status = 'open'
        and onzio_private.can_read_feature(form.club_id, 'registrations')
    );
$$;

revoke execute on function
  onzio_private.can_read_registration_form(uuid, uuid)
from public;
grant execute on function
  onzio_private.can_read_registration_form(uuid, uuid)
to anon, authenticated, service_role;
