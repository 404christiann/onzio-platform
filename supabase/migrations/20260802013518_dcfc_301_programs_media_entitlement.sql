-- DCFC-301: Programs media is Pro-only, matching onzio.programs and the
-- application mutation boundary. The original Phase 2 Storage policies map
-- unknown surfaces to the Starter-accessible branding feature. Once Programs
-- became a valid secure upload surface, that fallback allowed a Starter AAL2
-- member to write directly to a /programs/ staging path. Keep the legacy
-- fallback for existing surfaces, but map Programs explicitly at the final
-- Storage RLS boundary.

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
      when 'programs' then 'programs'
      when 'shop' then 'shop'
      when 'standings' then 'standings'
      else 'branding'
    end
  )
);
