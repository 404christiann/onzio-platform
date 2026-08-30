-- Onzio Platform: admin-editable homepage story copy, programs-page band copy,
-- and the footer tagline.
--
-- Round two of the academy@1 content audit (2026-08-08). Round one
-- (20260808020000) closed the program registration band and the per-program
-- image gallery; its audit also recorded a list of surfaces that were still
-- carrying real club copy as component literals but needed a schema decision
-- before they could be fixed. This migration makes that decision and closes
-- the three that the round-two audit confirmed are club *content* rather than
-- template *chrome*:
--
--   1. components/DevelopingNextGeneration.tsx -- the homepage story band's
--      heading, both body paragraphs, and the CTA label. Its two paragraphs
--      state facts about the club itself ("...combines professional-level
--      coaching, mentorship, and community support...", "The club's vision is
--      to become one of the nation's leading inclusive soccer organizations
--      ...") and interpolate the club name, so they cannot be shared template
--      copy. DCFC-D007 puts them on the club owner's side of the boundary.
--   2. The programs-page bands -- the homepage "A pathway for every player."
--      block, the /programs hero, and the /programs closing band. Each is an
--      eyebrow/heading/intro prose band whose intro makes a claim about this
--      club's own programs.
--   3. The academy@1 footer tagline ("One Club. One Community. / Endless
--      Opportunities.") -- Diverse City FC's own slogan, hardcoded into a
--      shared template exactly like the sponsor-page intro round one fixed.
--
-- Deliberately NOT covered, and left as component source on purpose: the
-- program-detail template headings ("The Program", "Grow through the game.",
-- "Program Focus", "Development with purpose.", "Explore other programs.",
-- "Ask About This Program"). Those label sections whose substance is already
-- per-program admin content (programs.body, programs.highlights); they are
-- structural chrome, they read identically for any academy@1 club, and making
-- a club-wide heading editable over per-program data would be incoherent.
-- Full reasoning in docs/phase-11/diverse-city/STATUS.md.
--
-- No data seed is required at deploy time. Every text column is
-- `not null default ''` meaning "use the approved academy@1 template default"
-- (lib/homepage-story-content.ts, lib/programs-page-content.ts,
-- lib/club-branding.ts), so a club with no row renders byte-identically to the
-- hardcoded copy this migration replaces. That is the difference from round
-- one's program_media, which had no defaultable representation and therefore
-- did need a seed.
--
-- Column-length constraints are specified here rather than deferred, per
-- DCFC-D109.

-- ---------------------------------------------------------------------------
-- Homepage story section
-- ---------------------------------------------------------------------------
-- A per-club singleton, keyed like every other content singleton
-- (homepage_hero_content, behind_the_rose_section, contact_page_content).
--
-- This is deliberately a NEW table rather than a reuse of
-- onzio.behind_the_rose_section, even though that table's shape (visible,
-- eyebrow, title, description, video_url, video_title, caption) looks close
-- enough to fit. components/BehindTheRose.tsx is mounted unconditionally on
-- the same homepage as DevelopingNextGeneration (app/(public)/page.tsx) and
-- renders nothing for this club only because no row exists for it. Pointing
-- both components at one singleton would mean the first real content a club
-- entered made BOTH sections appear, with the same words twice -- a
-- double-render bug, not a hypothetical. Two distinct sections need two
-- distinct rows.
--
-- There is no video column here on purpose: the story band's video is a Bunny
-- Stream GUID constant (lib/bunny-video.ts, DCFC-D131) and video is outside
-- this work's text-and-images scope. There is no eyebrow column either --
-- the section does not render one, and DCFC-D109 rigor means columns exist for
-- what is rendered, not for what a similar table happens to have.
create table onzio.homepage_story_section (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  -- Defaults to true, unlike behind_the_rose_section's tenant-scoped
  -- `visible: false` fallback: this section has approved template defaults, so
  -- "no row" must mean "render the template", not "render nothing". A club
  -- turns the band off explicitly.
  visible boolean not null default true,
  heading text not null default '',
  body_primary text not null default '',
  body_secondary text not null default '',
  cta_label text not null default '',
  updated_at timestamptz not null default now(),
  -- Matches programs.display_title / programs.registration_headline. This is a
  -- display heading set as large as 5.8rem beside a video panel; a longer
  -- string would push the band's own layout apart.
  check (char_length(heading) <= 120),
  -- One band paragraph each. Same ceiling and same reasoning as round one's
  -- registration_body: far below programs.body's 6000 so a fixed-height band
  -- beside a video cannot be overflowed with page-length prose, and far above
  -- the 320 intro ceiling so a club can actually tell its story.
  check (char_length(body_primary) <= 1200),
  check (char_length(body_secondary) <= 1200),
  -- Matches programs.external_cta_label and tryouts.cta_label: a button verb.
  check (char_length(cta_label) <= 40)
);

alter table onzio.homepage_story_section enable row level security;

grant select on onzio.homepage_story_section to anon, authenticated;
grant insert, update, delete on onzio.homepage_story_section to authenticated;
grant all on onzio.homepage_story_section to service_role;

create policy homepage_story_section_tenant_read
on onzio.homepage_story_section
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'homepage'));

create policy homepage_story_section_tenant_insert
on onzio.homepage_story_section
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'homepage'));

create policy homepage_story_section_tenant_update
on onzio.homepage_story_section
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'homepage'))
with check (onzio_private.can_mutate_feature(club_id, 'homepage'));

create policy homepage_story_section_tenant_delete
on onzio.homepage_story_section
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'homepage'));

create trigger audit_homepage_story_section
after insert or update or delete on onzio.homepage_story_section
for each row execute function onzio_private.audit_content_mutation();

create trigger set_homepage_story_section_updated_at
before update on onzio.homepage_story_section
for each row execute function onzio_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Programs page content
-- ---------------------------------------------------------------------------
-- A per-club singleton holding the three prose bands that frame the programs
-- surfaces. The programs themselves already live in onzio.programs; this holds
-- only the copy wrapped around them, which is why it is a separate singleton
-- rather than more columns on a per-program row: none of it belongs to any one
-- program.
--
-- Gated on the 'programs' feature, matching onzio.programs and
-- onzio.program_media, so a club without the programs feature exposes none of
-- it.
create table onzio.programs_page_content (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,

  -- Homepage "A pathway for every player." band
  -- (components/AcademyProgramsPathway.tsx).
  pathway_eyebrow text not null default '',
  pathway_heading text not null default '',
  pathway_intro text not null default '',

  -- /programs hero (components/AcademyProgramsPage.tsx). Two headline lines
  -- rather than one string: the template renders the second line in the sky
  -- accent colour, so the break is a content decision the club makes, not a
  -- wrap the browser makes. Same shape and same 80-character ceiling as
  -- homepage_hero_content.headline_line_one/two.
  hero_eyebrow text not null default '',
  hero_headline_line_one text not null default '',
  hero_headline_line_two text not null default '',
  hero_intro text not null default '',

  -- /programs closing band. Also two headline lines, same reason.
  closing_heading_line_one text not null default '',
  closing_heading_line_two text not null default '',
  closing_body text not null default '',
  closing_cta_label text not null default '',

  updated_at timestamptz not null default now(),

  -- Eyebrows match the existing eyebrow/kicker ceiling on onzio.programs and
  -- onzio.contact_page_content.
  check (char_length(pathway_eyebrow) <= 80),
  check (char_length(hero_eyebrow) <= 80),
  -- The pathway heading sits inside a half-width column, so it gets
  -- display_title's 120 rather than a hero line's 80.
  check (char_length(pathway_heading) <= 120),
  check (char_length(hero_headline_line_one) <= 80),
  check (char_length(hero_headline_line_two) <= 80),
  check (char_length(closing_heading_line_one) <= 80),
  check (char_length(closing_heading_line_two) <= 80),
  -- Band lead-ins, not prose: the same 320 already used by
  -- homepage_hero_content.intro, contact_page_content.intro, and
  -- programs.summary.
  check (char_length(pathway_intro) <= 320),
  check (char_length(hero_intro) <= 320),
  check (char_length(closing_body) <= 320),
  -- A button verb, matching programs.external_cta_label.
  check (char_length(closing_cta_label) <= 40)
);

alter table onzio.programs_page_content enable row level security;

grant select on onzio.programs_page_content to anon, authenticated;
grant insert, update, delete on onzio.programs_page_content to authenticated;
grant all on onzio.programs_page_content to service_role;

create policy programs_page_content_tenant_read
on onzio.programs_page_content
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'programs'));

create policy programs_page_content_tenant_insert
on onzio.programs_page_content
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'programs'));

create policy programs_page_content_tenant_update
on onzio.programs_page_content
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'programs'))
with check (onzio_private.can_mutate_feature(club_id, 'programs'));

create policy programs_page_content_tenant_delete
on onzio.programs_page_content
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'programs'));

create trigger audit_programs_page_content
after insert or update or delete on onzio.programs_page_content
for each row execute function onzio_private.audit_content_mutation();

create trigger set_programs_page_content_updated_at
before update on onzio.programs_page_content
for each row execute function onzio_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Footer tagline
-- ---------------------------------------------------------------------------
-- The academy@1 footer renders crest + club name + tagline as one brand
-- lockup, and onzio.site_branding is already exactly that lockup's table
-- (edited at /admin/branding, which already carries a "Footer" section for the
-- social links). A club slogan is a club fact, so a new column here beats a
-- new table.
--
-- Additive with a default, so every existing importer and reconciler that
-- writes site_branding by explicit column list or upserts on club_id is
-- unaffected.
alter table onzio.site_branding
  add column footer_tagline text not null default '';

alter table onzio.site_branding
  -- Two short lines in a narrow footer column beside the crest -- deliberately
  -- tighter than the 320 used for page intros. Newlines are meaningful here:
  -- the template renders the tagline with preserved line breaks, which is how
  -- the approved two-line default reproduces exactly.
  add constraint site_branding_footer_tagline_length
    check (char_length(footer_tagline) <= 160);
