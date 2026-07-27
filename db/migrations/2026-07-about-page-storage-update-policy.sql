-- Repair about-page Storage overwrites for stable admin replacement paths.
--
-- Supabase Storage treats upload(..., { upsert: true }) against an existing
-- object as an UPDATE to storage.objects. The about-page bucket already allowed
-- authenticated inserts, reads, and deletes under content/, but stable-path
-- replacements such as club-logo color cards also need an update policy.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update about page images'
  ) then
    create policy "Authenticated users can update about page images"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'about-page'
      and (storage.foldername(name))[1] = 'content'
    )
    with check (
      bucket_id = 'about-page'
      and (storage.foldername(name))[1] = 'content'
    );
  end if;
end
$$;

notify pgrst, 'reload schema';

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'Authenticated users can update about page images';
