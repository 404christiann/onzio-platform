-- PLAT-D024: customer clubs retain full content editing while their public
-- site remains available during the approved grace window. Suspension remains
-- the single enforcement boundary after grace expires.

create or replace function onzio_private.can_mutate_content(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.is_club_session_fresh()
    and onzio_private.is_club_member(p_club_id)
    and exists (
      select 1
      from onzio.clubs club
      where club.id = p_club_id
        and (
          club.lifecycle = 'onboarding'
          or (
            club.lifecycle = 'active'
            and (
              club.kind in ('demo', 'test')
              or club.public_access in ('live', 'grace')
            )
          )
        )
    );
$$;
