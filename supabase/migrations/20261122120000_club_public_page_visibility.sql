-- RC-PAGE-VISIBILITY: owner-controlled "Visible to visitors" switch that hides a whole public page
-- (Robinson Stadium, Chick-fil-A, Foothill Transit) for cinematic@2 clubs.
--
-- onzio.clubs.public_page_visibility is a jsonb object of page key -> boolean. A missing key or true means
-- the page is shown; only an explicit false hides it, so every existing club is unchanged by this migration.
-- The column is NOT part of the tenant-resolution select (lib/club-context.ts, the 2026-08-14 outage). The site
-- reads it in a separate query (lib/public-page-visibility-query.ts) that fails open: if this migration has not
-- reached a database yet, every page is simply shown. Still apply it before the owner switch is used.
--
-- Additive only: one column with a default, one validator, one write RPC. No row is changed.
-- anon and authenticated already have table-level select on onzio.clubs and no insert/update/delete
-- (20260726000300_phase2_security.sql), so the new column is readable by the public site's separate query and
-- writable only through onzio.set_public_page_visibility.

-- The single list of allowed keys. A later page is added by replacing this function; the check constraint
-- and the RPC both call it, so neither needs to change.
create or replace function onzio_private.is_public_page_visibility(v jsonb) returns boolean
  language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    case when jsonb_typeof(v) = 'object' then not exists (
      select 1 from jsonb_each(v) as entry
      where entry.key <> all (array['stadium', 'chick-fil-a', 'foothill-transit'])
         or jsonb_typeof(entry.value) is distinct from 'boolean'
    ) end,
    false
  );
$$;

revoke all on function onzio_private.is_public_page_visibility(jsonb) from public, anon;
grant execute on function onzio_private.is_public_page_visibility(jsonb) to authenticated, service_role;

alter table onzio.clubs
  add column public_page_visibility jsonb not null default '{}'::jsonb
    constraint clubs_public_page_visibility_shape check (onzio_private.is_public_page_visibility(public_page_visibility));

comment on column onzio.clubs.public_page_visibility is
  'Per-page "Visible to visitors" switches for cinematic@2 pages: {"stadium": false}. Missing or true = shown; only an explicit false hides the page. Keys limited by onzio_private.is_public_page_visibility. Written only by onzio.set_public_page_visibility (club owner or admin).';

-- The write path. Security definer so a club owner or admin can change this one column without any table
-- grant on onzio.clubs. It re-checks the caller from the JWT on every call: a fresh club session, an active
-- owner or admin membership of THIS club, and a club that may still be edited (onboarding, or active and
-- live, in grace, demo or test). The club id is a parameter the route fills from the verified host, never
-- from the request body. Like the Robinson, Chick-fil-A and Foothill editors, it answers PAGE_UNAVAILABLE for a
-- club whose published design is not cinematic@2 (the only design with these pages).
create or replace function onzio_private.set_public_page_visibility(
  p_club_id uuid,
  p_page_key text,
  p_visible boolean
) returns jsonb
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_previous jsonb;
  v_visibility jsonb;
begin
  if auth.uid() is null
     or p_club_id is null
     or not onzio_private.can_mutate_content(p_club_id)
     or not onzio_private.has_club_role(p_club_id, array['owner', 'admin']) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_page_key is null
     or p_visible is null
     or not onzio_private.is_public_page_visibility(jsonb_build_object(p_page_key, p_visible)) then
    raise exception 'INVALID_PUBLIC_PAGE_VISIBILITY' using errcode = '22023';
  end if;
  if onzio_private.homepage_design(p_club_id) ->> 'templateKey' is distinct from 'cinematic@2' then
    raise exception 'PAGE_UNAVAILABLE' using errcode = '22023';
  end if;

  -- No row lock here: every clubs update already takes the homepage advisory lock (serialize_homepage_write),
  -- and locking the row first would invert that order against the homepage save RPCs.
  select public_page_visibility -> p_page_key into v_previous
  from onzio.clubs where id = p_club_id;
  if not found then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update onzio.clubs
  set public_page_visibility = public_page_visibility || jsonb_build_object(p_page_key, p_visible)
  where id = p_club_id
  returning public_page_visibility into v_visibility;

  insert into onzio.audit_events (club_id, actor_user_id, actor_type, operation, resource_type, resource_id, payload)
  values (
    p_club_id, auth.uid(), 'user', 'public_page_visibility_set', 'club', p_club_id::text,
    jsonb_build_object('page', p_page_key, 'previous_value', v_previous, 'new_value', to_jsonb(p_visible))
  );

  return v_visibility;
end $$;

revoke all on function onzio_private.set_public_page_visibility(uuid, text, boolean) from public, anon;
grant execute on function onzio_private.set_public_page_visibility(uuid, text, boolean) to authenticated, service_role;

-- Exposed to PostgREST as a security-invoker wrapper (the repo keeps every definer in onzio_private).
create or replace function onzio.set_public_page_visibility(
  p_club_id uuid,
  p_page_key text,
  p_visible boolean
) returns jsonb
  language sql volatile security invoker set search_path = '' as $$
  select onzio_private.set_public_page_visibility(p_club_id, p_page_key, p_visible);
$$;

revoke all on function onzio.set_public_page_visibility(uuid, text, boolean) from public, anon;
grant execute on function onzio.set_public_page_visibility(uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
