-- Lions L9: informational tryout/recruitment page content for the editorial
-- presentation package. No public form or mutation; content is admin-managed
-- and read-only for public visitors, gated on the existing 'branding'
-- feature key exactly like onzio.club_identity.

-- Singleton tryout page content used by public presentation packages.
create table onzio.tryout_page_content (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  hero_headline_top text not null default '',
  hero_headline_em text not null default '',
  hero_intro text not null default '',
  sessions jsonb not null default '[]'::jsonb,
  what_to_bring jsonb not null default '[]'::jsonb,
  fee_note text not null default '',
  cta_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table onzio.tryout_page_content enable row level security;

grant select on onzio.tryout_page_content to anon, authenticated;
grant insert, update, delete on onzio.tryout_page_content to authenticated;
grant select, insert, update, delete on onzio.tryout_page_content to service_role;

create policy tryout_page_content_tenant_read
on onzio.tryout_page_content
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'branding'));

create policy tryout_page_content_tenant_insert
on onzio.tryout_page_content
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'branding'));

create policy tryout_page_content_tenant_update
on onzio.tryout_page_content
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'branding'))
with check (onzio_private.can_mutate_feature(club_id, 'branding'));

create policy tryout_page_content_tenant_delete
on onzio.tryout_page_content
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'branding'));

create trigger audit_tryout_page_content
  after insert or update or delete on onzio.tryout_page_content
  for each row execute function onzio_private.audit_content_mutation();

create trigger set_tryout_page_content_updated_at
  before update on onzio.tryout_page_content
  for each row execute function onzio_private.set_updated_at();

notify pgrst, 'reload schema';
