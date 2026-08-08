-- Onzio Platform: admin-editable program registration copy and an ordered
-- per-program image set.
--
-- Closes the two content gaps the 2026-08-07 academy@1 content audit confirmed
-- on components/AcademyProgramDetailPage.tsx:
--
--   1. The "Program Registration" band's eyebrow, headline, body copy, and the
--      DCFC-D102 pending-state copy were hardcoded in component source, and the
--      band itself rendered off a hardcoded `slug === 'special-olympics-soccer'`
--      branch. Club owners could not change any of it.
--   2. onzio.programs carries exactly one hero_media_asset_id and one
--      detail_media_asset_id, so the four-photo registration slideshow had no
--      column that could hold it and shipped as four hardcoded public paths.
--
-- Both are content, not presentation, so DCFC-D007 puts them on the club
-- owner's side of the boundary. Column-length and shape constraints are
-- specified here rather than deferred, per DCFC-D109.

-- ---------------------------------------------------------------------------
-- Programs: registration section copy
-- ---------------------------------------------------------------------------
-- Every text column is `not null default ''` rather than nullable, because
-- empty is a legitimate unset value that means "fall back to the template
-- default" (lib/program-content.ts), matching the DCFC-D109 policy that
-- distinguishes `between 1 and N` (required) from `<= N` (optional).
--
-- registration_enabled replaces the hardcoded slug branch: any program a club
-- runs registration for can now show the band, and the CTA itself stays driven
-- by the existing external_cta_label/external_cta_href pair.
alter table onzio.programs
  add column registration_enabled boolean not null default false,
  add column registration_eyebrow text not null default '',
  add column registration_headline text not null default '',
  add column registration_body text not null default '',
  add column registration_pending_body text not null default '',
  add column registration_pending_label text not null default '';

alter table onzio.programs
  -- Matches the existing eyebrow/kicker ceiling on this table and on
  -- contact_page_content.
  add constraint programs_registration_eyebrow_length
    check (char_length(registration_eyebrow) <= 80),
  -- Matches display_title: this is the band's own display heading.
  add constraint programs_registration_headline_length
    check (char_length(registration_headline) <= 120),
  -- A single band paragraph. Deliberately far below body's 6000 so the
  -- fixed-height band cannot be overflowed with page-length prose, and above
  -- intro's 320 so a club can explain a real registration process.
  add constraint programs_registration_body_length
    check (char_length(registration_body) <= 1200),
  add constraint programs_registration_pending_body_length
    check (char_length(registration_pending_body) <= 1200),
  -- Slightly above external_cta_label's 40: the pending state is a sentence
  -- fragment ("Registration Link Coming Soon"), not a button verb.
  add constraint programs_registration_pending_label_length
    check (char_length(registration_pending_label) <= 60);

-- ---------------------------------------------------------------------------
-- Program media
-- ---------------------------------------------------------------------------
-- Ordered image set belonging to one program, shaped after the existing
-- onzio.homepage_slideshow_photos / onzio.shop_kit_photos pattern: `url` is the
-- delivered source and `media_asset_id` is the optional normalized-media
-- reference that resolveMediaReferences() overwrites `url` from. That pairing
-- is what lets an existing static club asset be represented as a row today and
-- be replaced by a real admin upload later without a second schema change.
--
-- club_id is carried on the row (rather than reached through program_id) so the
-- composite (club_id, program_id) and (club_id, media_asset_id) foreign keys
-- make a cross-tenant program or media reference structurally impossible, per
-- the AGENTS.md composite tenant-key invariant.
create table onzio.program_media (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  program_id uuid not null,
  url text not null default '',
  media_asset_id uuid,
  alt text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  -- Cascade, not restrict: a gallery image has no meaning without its program,
  -- and restrict would permanently block deleting any program that ever had
  -- one. The media_assets reference below stays restrict so the underlying
  -- published asset is never silently orphaned.
  foreign key (club_id, program_id)
    references onzio.programs(club_id, id) on delete cascade,
  foreign key (club_id, media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict,
  check (char_length(url) <= 2048),
  -- Alt text is an accessibility string, not prose; 200 matches the longest
  -- descriptive alt the approved academy@1 slideshow needs.
  check (char_length(alt) <= 200),
  -- A row must deliver an image somehow. Empty url with no asset reference is
  -- a blank slide, never a legitimate state.
  check (url <> '' or media_asset_id is not null),
  -- A single-slash local path or an http(s) origin. Narrower than the shared
  -- external-href allowlist in lib/public-link.ts in one direction -- mailto:
  -- is meaningless for an image source -- and it explicitly rejects
  -- protocol-relative `//host/...`, which a bare `^/` would wave through and
  -- which resolves to an attacker-controlled origin. http:// is permitted
  -- because local Supabase serves published media over http, exactly as the
  -- other media-bearing tables already store it; production URLs come from
  -- NEXT_PUBLIC_SUPABASE_URL and are https.
  check (url = '' or url ~ '^(/[^/\\]|https?://)')
);

create index program_media_club_program_sort_idx
  on onzio.program_media (club_id, program_id, sort_order, id);

alter table onzio.program_media enable row level security;

grant select on onzio.program_media to anon, authenticated;
grant insert, update, delete on onzio.program_media to authenticated;
grant all on onzio.program_media to service_role;

create policy program_media_tenant_read
on onzio.program_media
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'programs'));

create policy program_media_tenant_insert
on onzio.program_media
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'programs'));

create policy program_media_tenant_update
on onzio.program_media
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'programs'))
with check (onzio_private.can_mutate_feature(club_id, 'programs'));

create policy program_media_tenant_delete
on onzio.program_media
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'programs'));

create trigger audit_program_media
after insert or update or delete on onzio.program_media
for each row execute function onzio_private.audit_content_mutation();

create trigger set_program_media_updated_at
before update on onzio.program_media
for each row execute function onzio_private.set_updated_at();
