-- DCFC-302: Contact hero media is Starter-accessible, matching the Contact
-- content tables and application mutation boundary. Name the Contact surface
-- explicitly at the final Storage RLS boundary instead of relying on the
-- legacy branding fallback, so future entitlement changes cannot silently
-- detach Contact media from Contact content.

drop policy if exists onzio_staging_member_insert on storage.objects;
create policy onzio_staging_member_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'onzio-upload-staging'
  and name ~ '^[0-9a-f-]{36}/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and lower(coalesce(metadata ->> 'mimetype', '')) in (
    'image/jpeg',
    'image/png',
    'image/webp'
  )
  and onzio_private.can_mutate_feature(
    split_part(name, '/', 1)::uuid,
    case split_part(name, '/', 2)
      when 'contact' then 'contact'
      when 'programs' then 'programs'
      when 'shop' then 'shop'
      when 'standings' then 'standings'
      else 'branding'
    end
  )
);

drop policy if exists onzio_staging_member_select on storage.objects;
create policy onzio_staging_member_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'onzio-upload-staging'
  and name ~ '^[0-9a-f-]{36}/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and onzio_private.can_mutate_feature(
    split_part(name, '/', 1)::uuid,
    case split_part(name, '/', 2)
      when 'contact' then 'contact'
      when 'programs' then 'programs'
      when 'shop' then 'shop'
      when 'standings' then 'standings'
      else 'branding'
    end
  )
);

drop policy if exists onzio_staging_member_delete on storage.objects;
create policy onzio_staging_member_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'onzio-upload-staging'
  and name ~ '^[0-9a-f-]{36}/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and onzio_private.can_mutate_feature(
    split_part(name, '/', 1)::uuid,
    case split_part(name, '/', 2)
      when 'contact' then 'contact'
      when 'programs' then 'programs'
      when 'shop' then 'shop'
      when 'standings' then 'standings'
      else 'branding'
    end
  )
);
