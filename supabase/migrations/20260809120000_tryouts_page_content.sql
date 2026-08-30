-- Onzio Platform: admin-editable /tryouts page intro copy.
--
-- The tryouts admin simplification (2026-08-09) cut the per-event prose fields
-- down to a single "Name" plus logistics, on the finding that the per-event
-- eyebrow/headline pair and the four long-form copy blocks read as clutter
-- rather than as information. That left the two sentences at the top of the
-- /tryouts page as the only prose on the surface -- and both were still
-- hardcoded in components/AcademyTryoutsPage.tsx:
--
--   * shown when the club has published tryout events:
--     "Review current club evaluations below. Registration, waivers, and
--      participant information stay with the club's external provider."
--   * shown when it has not:
--     "Tryout dates and locations are still being finalized. Register your
--      interest below to stay informed once details are announced."
--
-- Both make claims about how *this club* runs its evaluations, so both are club
-- content, not template chrome -- the same boundary
-- 20260808130000_dcfc_homepage_story_programs_page_content.sql drew for the
-- programs bands. This migration puts them on the club owner's side of it.
--
-- No existing table could hold them: onzio.tryouts is per-event, and no
-- tryouts page-level singleton existed. This follows programs_page_content's
-- shape exactly.
--
-- No data seed is required at deploy time. Both columns are
-- `text not null default ''` meaning "use the approved template default"
-- (lib/tryouts-page-content.ts), so a club with no row renders byte-identically
-- to the hardcoded copy this migration replaces.

-- ---------------------------------------------------------------------------
-- Tryouts page content
-- ---------------------------------------------------------------------------
-- A per-club singleton, keyed like every other content singleton
-- (programs_page_content, homepage_story_section, contact_page_content).
--
-- Deliberately NOT gated on template: any club whose site exposes a /tryouts
-- page needs this copy, and the table has no academy@1-specific shape. Today
-- academy@1 is the only template with `tryouts` in its supportedRoutes
-- (packages/presentation/index.ts), so today it is the only template that
-- reaches it -- but that is the route registry's decision, not this table's.
--
-- Gated on the 'tryouts' feature, matching onzio.tryouts, so a club without the
-- tryouts feature exposes none of it.
create table onzio.tryouts_page_content (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,

  -- The /tryouts hero paragraph shown when the club has published one or more
  -- tryout events.
  intro_with_tryouts text not null default '',

  -- The /tryouts hero paragraph shown when it has published none. A distinct
  -- column rather than one reused string: the two say different things (one
  -- points at a list that exists, one explains that it does not yet), and a
  -- club editing one must not silently rewrite the other.
  intro_no_tryouts text not null default '',

  updated_at timestamptz not null default now(),

  -- Page-intro paragraphs, not prose: the same 320 already used by
  -- homepage_hero_content.intro, contact_page_content.intro, programs.summary,
  -- and programs_page_content.pathway_intro/hero_intro/closing_body. The
  -- approved defaults are 131 and 127 characters, so this leaves a club room to
  -- roughly double them while still keeping the paragraph inside the hero band
  -- it is laid out in.
  check (char_length(intro_with_tryouts) <= 320),
  check (char_length(intro_no_tryouts) <= 320)
);

alter table onzio.tryouts_page_content enable row level security;

grant select on onzio.tryouts_page_content to anon, authenticated;
grant insert, update, delete on onzio.tryouts_page_content to authenticated;
grant all on onzio.tryouts_page_content to service_role;

create policy tryouts_page_content_tenant_read
on onzio.tryouts_page_content
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'tryouts'));

create policy tryouts_page_content_tenant_insert
on onzio.tryouts_page_content
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'tryouts'));

create policy tryouts_page_content_tenant_update
on onzio.tryouts_page_content
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'tryouts'))
with check (onzio_private.can_mutate_feature(club_id, 'tryouts'));

create policy tryouts_page_content_tenant_delete
on onzio.tryouts_page_content
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'tryouts'));

create trigger audit_tryouts_page_content
after insert or update or delete on onzio.tryouts_page_content
for each row execute function onzio_private.audit_content_mutation();

create trigger set_tryouts_page_content_updated_at
before update on onzio.tryouts_page_content
for each row execute function onzio_private.set_updated_at();
