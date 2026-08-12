-- Lions E1: club identity content for the editorial@1 presentation package,
-- plus a club accent color and match attendance/scorer summaries.
--
-- Homepage hero copy and contact info deliberately stay out of this table:
-- they already live in onzio.homepage_hero_content and onzio.contact_profile
-- respectively, so club_identity does not duplicate hero_headline_top,
-- hero_headline_em, hero_intro, contact_email, or contact_phone. Template
-- selection remains driven by onzio.presentation_documents /
-- presentation_state, not a raw column on onzio.clubs.

-- Singleton club identity content used by public presentation packages.
create table onzio.club_identity (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  short_name text not null,
  initials text not null,
  founded_year integer not null check (founded_year > 1800),
  league text not null default '',
  division text not null default '',
  city text not null default '',
  state text not null default '',
  venue text not null default '',
  time_zone text not null default 'America/Los_Angeles',
  contact_address text not null default '',
  slideshow_heading_top text not null default '',
  slideshow_heading_em text not null default '',
  identity_heading_top text not null default '',
  identity_heading_em text not null default '',
  story_heading_top text not null default '',
  story_heading_em text not null default '',
  mission text not null default '',
  highlights jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table onzio.club_identity enable row level security;

grant select on onzio.club_identity to anon, authenticated;
grant insert, update, delete on onzio.club_identity to authenticated;
grant select, insert, update, delete on onzio.club_identity to service_role;

create policy club_identity_tenant_read
on onzio.club_identity
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'branding'));

create policy club_identity_tenant_insert
on onzio.club_identity
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'branding'));

create policy club_identity_tenant_update
on onzio.club_identity
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'branding'))
with check (onzio_private.can_mutate_feature(club_id, 'branding'));

create policy club_identity_tenant_delete
on onzio.club_identity
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'branding'));

create trigger audit_club_identity
  after insert or update or delete on onzio.club_identity
  for each row execute function onzio_private.audit_content_mutation();

create trigger set_club_identity_updated_at
  before update on onzio.club_identity
  for each row execute function onzio_private.set_updated_at();

-- Club accent color for editorial-style presentation packages.
alter table onzio.clubs
  add column accent_color text
    check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');

-- Match attendance and scorer summaries. Nullable/defaulted so every existing
-- row is unaffected.
alter table onzio.matches
  add column attendance integer
    check (attendance is null or attendance >= 0),
  add column scorers jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
