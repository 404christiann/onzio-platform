-- ADMIN-RE-01: foundation for the reimagined club admin
-- (docs/admin-portal-redesign-plan.md, "Reimagined admin build plan").
--
-- Adds the columns every later ADMIN-RE package reads, in one migration:
--   * onzio.clubs.admin_portal      which admin a club sees ('classic' until switched)
--   * onzio.clubs.admin_flags       per-club flags for later slices
--   * onzio.clubs.time_zone         the club's own time zone (decision 0014)
--   * onzio.clubs.time_zone_set_at  null until the time zone has been confirmed
--   * onzio.club_members.display_name  what the admin calls a person ("Hi Andrea")
--
-- Additive: every column has a default or is nullable, so code deployed before
-- this migration keeps working. None of these clubs columns may be added to the
-- tenant-resolution select in lib/club-context.ts (the 2026-08-14 outage);
-- tests/contracts/admin-reimagined-foundation.test.ts pins that.
--
-- No grant or policy change: anon and authenticated already have select only on
-- onzio.clubs and onzio.club_members (20260726000300_phase2_security.sql). The new
-- clubs columns are operator-only, set by script or a server route, like
-- store_enabled. A member reads their own display_name through
-- club_members_self_read.

alter table onzio.clubs
  add column admin_portal text not null default 'classic'
    constraint clubs_admin_portal_check check (admin_portal in ('classic', 'reimagined')),
  add column admin_flags jsonb not null default '{}'::jsonb
    constraint clubs_admin_flags_object check (jsonb_typeof(admin_flags) = 'object'),
  add column time_zone text not null default 'America/Los_Angeles'
    constraint clubs_time_zone_shape check (
      char_length(time_zone) <= 64
      and time_zone ~ '^(UTC|[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2})$'
    ),
  add column time_zone_set_at timestamptz;

comment on column onzio.clubs.admin_portal is
  'Operator-only. Which club admin the club sees: classic (default) or reimagined. Set by scripts/set-club-admin-portal.ts, never by club users.';
comment on column onzio.clubs.admin_flags is
  'Operator-only. Per-club flags that turn later reimagined-admin slices on, for example {"season": true}.';
comment on column onzio.clubs.time_zone is
  'The club''s own IANA time zone. Admin "today", kickoff times and the public schedule read it. Set automatically from an owner''s browser or by Onzio.';
comment on column onzio.clubs.time_zone_set_at is
  'Null while time_zone is still the default. Set when the time zone is confirmed, so the automatic owner-browser set happens only once.';

alter table onzio.club_members
  add column display_name text
    constraint club_members_display_name_length check (
      display_name is null or char_length(btrim(display_name)) between 1 and 120
    );

comment on column onzio.club_members.display_name is
  'What the admin calls this person, for example "Andrea". Optional for existing members.';

-- GATE-DATA-DC-TZ: confirm the two live clubs' time zones so the automatic
-- browser set never overrides them. Diverse City plays in Chicago; Rose City's
-- default (Los Angeles) is already correct. Slug-scoped, two rows at most.
update onzio.clubs
set time_zone = 'America/Chicago', time_zone_set_at = now()
where slug = 'diverse-city';

update onzio.clubs
set time_zone_set_at = now()
where slug = 'rose-city';

notify pgrst, 'reload schema';
