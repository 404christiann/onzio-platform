-- Phase 3: make verified tenant resolution usable by anonymous public
-- requests without granting direct execution on membership/MFA helpers.

create or replace function onzio_private.can_read_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from onzio.clubs club
    where club.id = p_club_id
      and (
        (
          club.lifecycle = 'active'
          and club.public_access in ('live', 'grace')
        )
        or (
          coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
          and club.lifecycle <> 'archived'
          and exists (
            select 1
            from onzio.club_members member
            where member.club_id = club.id
              and member.user_id = auth.uid()
              and member.status = 'active'
          )
        )
      )
  );
$$;

revoke execute on function onzio_private.can_read_club(uuid) from public;
grant execute on function onzio_private.can_read_club(uuid)
  to anon, authenticated, service_role;

drop policy clubs_public_read on onzio.clubs;
create policy clubs_public_read
on onzio.clubs
for select
to anon, authenticated
using (onzio_private.can_read_club(id));
