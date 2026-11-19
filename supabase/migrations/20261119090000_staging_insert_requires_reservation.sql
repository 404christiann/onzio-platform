-- RC-ADMIN-10c: a staging upload needs a live upload reservation.
-- Approved by Christian on 2026-11-19 (UTC). Needs the production migration gate before merge.
--
-- Since RC-ADMIN-10b, /api/admin/media/authorize records a one-time reservation through
-- onzio.reserve_media_upload (quota, rate, per-club lock) before it asks Storage to sign the
-- staging upload, and finalize consumes it. But a club editor could still skip /authorize and
-- call Storage with their own session, because onzio_staging_member_insert only checked the
-- bucket, the path shape and the club entitlement. The quota and rate limit meant nothing for
-- that path.
--
-- Now the policy also requires onzio_private.staging_upload_reserved(name): a reservation for
-- exactly this staging path, for the club in the path, not yet consumed and not expired. Only
-- the service-role reserve RPC writes reservations, so the only way to stage a file is through
-- /authorize. The rest of the policy is the 20260808160000 definition byte for byte, and, as
-- there, nothing reads `metadata` (it is empty when Storage evaluates the policy at sign time).
-- File size is checked at finalize against the reservation's claimed size (RC-ADMIN-10b).
--
-- The SELECT and DELETE policies on staging are unchanged. The service role (finalize, cleanup,
-- scripts) bypasses RLS and is unaffected.
--
-- Rollback: docs/phase-11/diverse-city/RC-ADMIN-10C-ROLLBACK.sql recreates the 20260808160000
-- policy exactly and drops the helper. Roll the policy back first; the app code does not change.

create function onzio_private.staging_upload_reserved(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from onzio_private.media_upload_reservations r
    where r.staging_path = p_name
      and r.club_id::text = pg_catalog.split_part(p_name, '/', 1)
      and r.consumed_at is null
      and r.expires_at > pg_catalog.now()
  );
$$;

revoke all on function onzio_private.staging_upload_reserved(text) from public, anon;
grant execute on function onzio_private.staging_upload_reserved(text) to authenticated, service_role;

drop policy if exists onzio_staging_member_insert on storage.objects;
create policy onzio_staging_member_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'onzio-upload-staging'
  and name ~ '^[0-9a-f-]{36}/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and onzio_private.can_mutate_feature(
    split_part(name, '/', 1)::uuid,
    case split_part(name, '/', 2)
      when 'contact' then 'contact'
      when 'programs' then 'programs'
      when 'tryouts' then 'tryouts'
      when 'shop' then 'shop'
      when 'standings' then 'standings'
      else 'branding'
    end
  )
  and onzio_private.staging_upload_reserved(name)
);
