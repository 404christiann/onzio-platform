-- PLAT-101 reviewed rollback path.
-- Apply only when intentionally rolling back the matching migration. This
-- restores the preceding AAL2 club-facing policies. It does not delete users,
-- sessions, MFA factors, or audit data.

create or replace function onzio_private.can_read_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.is_publicly_accessible(p_club_id)
    or (
      onzio_private.is_aal2()
      and onzio_private.is_club_member(p_club_id)
      and exists (
        select 1
        from onzio.clubs club
        where club.id = p_club_id
          and club.lifecycle <> 'archived'
      )
    );
$$;

create or replace function onzio_private.can_mutate_content(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.is_aal2()
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
              not exists (
                select 1
                from onzio.club_subscriptions subscription
                where subscription.club_id = club.id
              )
              or onzio_private.subscription_public_access(club.id, now()) = 'live'
            )
          )
        )
    );
$$;

drop policy club_members_self_read on onzio.club_members;
create policy club_members_self_read on onzio.club_members
for select to authenticated
using (user_id = auth.uid() and onzio_private.is_aal2());

drop policy club_subscriptions_owner_read on onzio.club_subscriptions;
create policy club_subscriptions_owner_read on onzio.club_subscriptions
for select to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.has_club_role(club_id, array['owner']::text[])
);

drop policy media_assets_member_read on onzio.media_assets;
create policy media_assets_member_read on onzio.media_assets
for select to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1 from onzio.clubs club
    where club.id = media_assets.club_id and club.lifecycle <> 'archived'
  )
);

drop policy presentation_documents_member_read on onzio.presentation_documents;
create policy presentation_documents_member_read on onzio.presentation_documents
for select to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1 from onzio.clubs club
    where club.id = presentation_documents.club_id and club.lifecycle <> 'archived'
  )
);

drop policy presentation_state_member_read on onzio.presentation_state;
create policy presentation_state_member_read on onzio.presentation_state
for select to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1 from onzio.clubs club
    where club.id = presentation_state.club_id and club.lifecycle <> 'archived'
  )
);

drop policy presentation_publications_member_read on onzio.presentation_publications;
create policy presentation_publications_member_read on onzio.presentation_publications
for select to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1 from onzio.clubs club
    where club.id = presentation_publications.club_id and club.lifecycle <> 'archived'
  )
);

drop function onzio_private.is_club_session_fresh();
drop function onzio_private.club_session_started_at();
