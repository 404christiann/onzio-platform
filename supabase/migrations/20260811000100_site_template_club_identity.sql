-- Lions L1: per-tenant site template selection, dark branding, club identity,
-- and match attendance/scorers. The shared classic presentation remains the
-- default; a club opts into another presentation package only through data.

-- Clubs select which shared presentation component package renders their
-- public site. Existing rows keep the classic package.
alter table onzio.clubs
  add column site_template text not null default 'classic'
    check (site_template in ('classic', 'editorial')),
  add column accent_color text
    check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');

-- Dark-background club logo variant, mirroring the existing logo columns.
alter table onzio.site_branding
  add column club_logo_dark_path text not null default '',
  add column club_logo_dark_asset_id uuid,
  add constraint site_branding_club_id_club_logo_dark_asset_id_fkey
    foreign key (club_id, club_logo_dark_asset_id)
      references onzio.media_assets(club_id, id) on delete restrict;

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
  contact_email text not null default '',
  contact_phone text not null default '',
  contact_address text not null default '',
  hero_headline_top text not null default '',
  hero_headline_em text not null default '',
  hero_intro text not null default '',
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

-- Match attendance and scorer summaries. Nullable/defaulted so every existing
-- row is unaffected.
alter table onzio.matches
  add column attendance integer
    check (attendance is null or attendance >= 0),
  add column scorers jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
