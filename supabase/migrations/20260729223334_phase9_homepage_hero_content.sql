-- Onzio Platform Phase 9: editable homepage hero content.
-- This gives each tenant a first-section content surface without changing the
-- legacy Rose City video treatment.

create table onzio.homepage_hero_content (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  eyebrow text not null default '',
  headline_line_one text not null default '',
  headline_line_two text not null default '',
  intro text not null default '',
  primary_cta_label text not null default '',
  primary_cta_href text not null default '',
  secondary_cta_label text not null default '',
  secondary_cta_href text not null default '',
  updated_at timestamptz not null default now(),
  check (char_length(headline_line_one) <= 80),
  check (char_length(headline_line_two) <= 80),
  check (char_length(intro) <= 320),
  check (primary_cta_href = '' or primary_cta_href ~ '^/[-A-Za-z0-9_/?#=&%.]*$'),
  check (secondary_cta_href = '' or secondary_cta_href ~ '^/[-A-Za-z0-9_/?#=&%.]*$')
);

alter table onzio.homepage_hero_content enable row level security;

grant select on onzio.homepage_hero_content to anon, authenticated;
grant insert, update, delete on onzio.homepage_hero_content to authenticated;
grant all on onzio.homepage_hero_content to service_role;

create policy homepage_hero_content_tenant_read
on onzio.homepage_hero_content
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'homepage'));

create policy homepage_hero_content_tenant_insert
on onzio.homepage_hero_content
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'homepage'));

create policy homepage_hero_content_tenant_update
on onzio.homepage_hero_content
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'homepage'))
with check (onzio_private.can_mutate_feature(club_id, 'homepage'));

create policy homepage_hero_content_tenant_delete
on onzio.homepage_hero_content
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'homepage'));

create trigger audit_homepage_hero_content
after insert or update or delete on onzio.homepage_hero_content
for each row execute function onzio_private.audit_content_mutation();

create trigger set_homepage_hero_content_updated_at
before update on onzio.homepage_hero_content
for each row execute function onzio_private.set_updated_at();
