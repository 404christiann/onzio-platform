-- Every image upload and replace in /admin failed with MEDIA_AUTH_FAILED, for
-- every club and every media surface.
--
-- Root cause. /api/admin/media/authorize asks Storage for a signed upload URL
-- (`createSignedUploadUrl`) before any bytes exist. Storage evaluates the
-- INSERT policy on `storage.objects` at that moment, against a row that has no
-- `metadata` yet. `onzio_staging_member_insert` required
--
--   lower(coalesce(metadata ->> 'mimetype', '')) in ('image/jpeg', ...)
--
-- which resolves to `'' in (...)` — false — so the check could never pass and
-- the route returned "new row violates row-level security policy" as a generic
-- 403. Reproduced locally against Diverse City's admin session; removing this
-- one condition makes the same request succeed and the full
-- authorize -> stage -> finalize -> publish chain complete.
--
-- Why removing it is correct rather than a loosening. The condition trusted
-- browser-declared MIME, which `AGENTS.md`'s media rules explicitly say not to
-- trust ("Verify actual signatures and dimensions; do not trust extensions or
-- browser MIME"). The real check happens in /api/admin/media/finalize, which
-- reads the staged bytes, verifies the actual file signature and dimensions,
-- and refuses to publish anything else. Uploads reach staging through a
-- path-scoped signed token issued only after the route has verified session
-- freshness, club membership, and the surface's mutation entitlement.
--
-- Everything else about the policy is preserved byte for byte: the bucket, the
-- `<club>/<surface>/<uuid>.<ext>` path shape, and the per-surface
-- `can_mutate_feature` entitlement mapping introduced by DCFC-301/302/303. The
-- matching SELECT and DELETE policies are untouched — they run against real
-- rows and were never affected.

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
);
