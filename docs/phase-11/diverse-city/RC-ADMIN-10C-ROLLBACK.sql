-- RC-ADMIN-10c reviewed rollback path.
-- Apply only when intentionally rolling back 20261119090000_staging_insert_requires_reservation.sql,
-- for example if real uploads fail at sign time after it is applied. It recreates the
-- onzio_staging_member_insert policy from 20260808160000 exactly (no reservation check) and drops
-- the helper. It changes no data; reservations, quotas and finalize keep working as in RC-ADMIN-10b.
-- Run it in one transaction, then add a matching migration so the ledger and the repo agree.

begin;

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

drop function if exists onzio_private.staging_upload_reserved(text);

commit;
