-- PLAT-101: evaluate auth.uid() once per club_members query instead of once
-- per candidate row. This preserves the authorization contract while
-- satisfying Supabase's RLS init-plan guidance.

drop policy club_members_self_read on onzio.club_members;

create policy club_members_self_read
on onzio.club_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  and onzio_private.is_club_session_fresh()
);
