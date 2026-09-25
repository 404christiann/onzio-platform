-- The OTP email wordmark is a platform asset, separate from tenant media.
-- Public delivery uses Storage's object endpoint; uploads remain service-role only.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'onzio-branding',
  'onzio-branding',
  true,
  1048576,
  array['image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
