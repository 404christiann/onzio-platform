-- Onzio Platform Phase 11 (DCFC-202): normalized tenant content for the
-- Programs, Contact, and Tryouts domains.
--
-- Implements the design approved as DCFC-D109 in
-- docs/phase-11/diverse-city/DOMAIN-DESIGN.md, with tier gating from
-- DCFC-D108. These are reusable platform capabilities available to every
-- tenant, not Diverse City tables.

-- ---------------------------------------------------------------------------
-- Tier gating (DCFC-D108)
-- ---------------------------------------------------------------------------
-- Contact is Starter-accessible; Programs and Tryouts stay Pro-only because a
-- feature string absent from this allowlist resolves Pro-only by default.
--
-- This is purely additive: 'contact' is referenced by no existing table, so
-- adding it cannot change behavior for anything already shipped. Every
-- security attribute of the original definition -- definer rights, the empty
-- search path, stable volatility, and fully qualified relations -- is
-- reproduced below exactly as AGENTS.md requires, because `create or replace`
-- preserves existing ACLs but not these attributes.
create or replace function onzio_private.club_has_feature(
  p_club_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from onzio.clubs club
    where club.id = p_club_id
      and (
        club.tier = 'pro'
        or p_feature in (
          'branding', 'roster', 'schedule', 'homepage', 'about', 'contact'
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Programs
-- ---------------------------------------------------------------------------
create table onzio.programs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z][a-z0-9-]*$'),
  nav_label text not null default '',
  display_title text not null,
  kicker text not null default '',
  summary text not null default '',
  body text not null default '',
  highlights jsonb not null default '[]'::jsonb,
  layout_variant text not null default 'statement_band'
    check (layout_variant in ('statement_band', 'detail_focus')),
  hero_media_asset_id uuid,
  detail_media_asset_id uuid,
  external_cta_label text not null default '',
  external_cta_href text not null default '',
  status text not null default 'active'
    check (status in ('active', 'hidden')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, slug),
  foreign key (club_id, hero_media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict,
  foreign key (club_id, detail_media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict,
  check (char_length(slug) between 1 and 64),
  check (char_length(display_title) between 1 and 120),
  check (char_length(nav_label) <= 40),
  check (char_length(kicker) <= 80),
  check (char_length(summary) <= 320),
  check (char_length(body) <= 6000),
  check (char_length(external_cta_label) <= 40),
  check (char_length(external_cta_href) <= 2048),
  -- Deliberately NOT the internal-path-only pattern used by
  -- homepage_hero_content: this column exists to hold a club's external
  -- registration destination, which that pattern would reject outright.
  check (external_cta_href = '' or external_cta_href ~ '^(/|https?://|mailto:)')
);

create index programs_club_sort_idx on onzio.programs (club_id, sort_order, slug);

alter table onzio.programs enable row level security;

grant select on onzio.programs to anon, authenticated;
grant insert, update, delete on onzio.programs to authenticated;
grant all on onzio.programs to service_role;

create policy programs_tenant_read
on onzio.programs
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'programs'));

create policy programs_tenant_insert
on onzio.programs
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'programs'));

create policy programs_tenant_update
on onzio.programs
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'programs'))
with check (onzio_private.can_mutate_feature(club_id, 'programs'));

create policy programs_tenant_delete
on onzio.programs
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'programs'));

create trigger audit_programs
after insert or update or delete on onzio.programs
for each row execute function onzio_private.audit_content_mutation();

create trigger set_programs_updated_at
before update on onzio.programs
for each row execute function onzio_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contact
-- ---------------------------------------------------------------------------
-- Two singletons. contact_profile holds canonical destinations the footer and
-- nav need regardless of whether a Contact page exists; contact_page_content
-- holds copy that matters only to that page. Social links are intentionally
-- absent -- onzio.site_social_links already owns them.
create table onzio.contact_profile (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  public_email text not null default '',
  public_phone text not null default '',
  service_area text not null default '',
  hours text not null default '',
  updated_at timestamptz not null default now(),
  check (public_email = '' or public_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  check (char_length(public_email) <= 254),
  check (char_length(public_phone) <= 40),
  check (char_length(service_area) <= 120),
  check (char_length(hours) <= 200)
);

alter table onzio.contact_profile enable row level security;

grant select on onzio.contact_profile to anon, authenticated;
grant insert, update, delete on onzio.contact_profile to authenticated;
grant all on onzio.contact_profile to service_role;

create policy contact_profile_tenant_read
on onzio.contact_profile
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'contact'));

create policy contact_profile_tenant_insert
on onzio.contact_profile
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'contact'));

create policy contact_profile_tenant_update
on onzio.contact_profile
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'contact'))
with check (onzio_private.can_mutate_feature(club_id, 'contact'));

create policy contact_profile_tenant_delete
on onzio.contact_profile
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'contact'));

create trigger audit_contact_profile
after insert or update or delete on onzio.contact_profile
for each row execute function onzio_private.audit_content_mutation();

create trigger set_contact_profile_updated_at
before update on onzio.contact_profile
for each row execute function onzio_private.set_updated_at();

create table onzio.contact_page_content (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  eyebrow text not null default '',
  headline text not null default '',
  intro text not null default '',
  hero_media_asset_id uuid,
  updated_at timestamptz not null default now(),
  foreign key (club_id, hero_media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict,
  check (char_length(eyebrow) <= 80),
  check (char_length(headline) <= 80),
  check (char_length(intro) <= 320)
);

alter table onzio.contact_page_content enable row level security;

grant select on onzio.contact_page_content to anon, authenticated;
grant insert, update, delete on onzio.contact_page_content to authenticated;
grant all on onzio.contact_page_content to service_role;

create policy contact_page_content_tenant_read
on onzio.contact_page_content
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'contact'));

create policy contact_page_content_tenant_insert
on onzio.contact_page_content
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'contact'));

create policy contact_page_content_tenant_update
on onzio.contact_page_content
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'contact'))
with check (onzio_private.can_mutate_feature(club_id, 'contact'));

create policy contact_page_content_tenant_delete
on onzio.contact_page_content
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'contact'));

create trigger audit_contact_page_content
after insert or update or delete on onzio.contact_page_content
for each row execute function onzio_private.audit_content_mutation();

create trigger set_contact_page_content_updated_at
before update on onzio.contact_page_content
for each row execute function onzio_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tryouts
-- ---------------------------------------------------------------------------
-- Multi-row per DCFC-D103: a club may run simultaneous tryouts across its
-- programs, each with its own status, date, location, cost, and link.
create table onzio.tryouts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  program_id uuid,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'open', 'closed')),
  eyebrow text not null default '',
  headline text not null default '',
  intro text not null default '',
  hero_media_asset_id uuid,
  eligibility_copy text not null default '',
  what_to_expect_copy text not null default '',
  preparation_copy text not null default '',
  event_date date,
  location text not null default '',
  cost_text text not null default '',
  cta_label text not null default '',
  registration_href text not null default '',
  closed_message text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  -- Composite reference: a tryout may only point at a program owned by the
  -- same club. This makes a cross-tenant link structurally impossible rather
  -- than merely discouraged.
  foreign key (club_id, program_id)
    references onzio.programs(club_id, id) on delete restrict,
  foreign key (club_id, hero_media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict,
  check (char_length(eyebrow) <= 80),
  check (char_length(headline) <= 80),
  check (char_length(intro) <= 320),
  check (char_length(eligibility_copy) <= 2000),
  check (char_length(what_to_expect_copy) <= 2000),
  check (char_length(preparation_copy) <= 2000),
  check (char_length(location) <= 160),
  check (char_length(cost_text) <= 120),
  check (char_length(cta_label) <= 40),
  check (char_length(closed_message) <= 320),
  check (char_length(registration_href) <= 2048),
  -- Empty is permitted by design: it is the honest TBA state that fails
  -- closed to a mailto: contact fallback, verified in DCFC-002.
  check (registration_href = '' or registration_href ~ '^(/|https?://|mailto:)')
);

create index tryouts_club_sort_idx on onzio.tryouts (club_id, sort_order, id);

alter table onzio.tryouts enable row level security;

grant select on onzio.tryouts to anon, authenticated;
grant insert, update, delete on onzio.tryouts to authenticated;
grant all on onzio.tryouts to service_role;

create policy tryouts_tenant_read
on onzio.tryouts
for select
to anon, authenticated
using (onzio_private.can_read_feature(club_id, 'tryouts'));

create policy tryouts_tenant_insert
on onzio.tryouts
for insert
to authenticated
with check (onzio_private.can_mutate_feature(club_id, 'tryouts'));

create policy tryouts_tenant_update
on onzio.tryouts
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'tryouts'))
with check (onzio_private.can_mutate_feature(club_id, 'tryouts'));

create policy tryouts_tenant_delete
on onzio.tryouts
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'tryouts'));

create trigger audit_tryouts
after insert or update or delete on onzio.tryouts
for each row execute function onzio_private.audit_content_mutation();

create trigger set_tryouts_updated_at
before update on onzio.tryouts
for each row execute function onzio_private.set_updated_at();
