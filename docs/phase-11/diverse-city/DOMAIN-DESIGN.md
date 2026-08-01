# Diverse City FC Normalized Domain Design (DCFC-103)

Status: `approved` — Christian approved this design on 2026-07-31, together
with the column-constraint additions requested in the same review.

Last updated: 2026-07-31

This is a concrete table-level design for the three true-gap domains
identified in `PLATFORM-GAP-ANALYSIS.md` — Programs, Contact, and Tryouts.
It is the approved implementation target for `DCFC-202`, but it is still a
design, not a migration: no SQL in this file has been applied anywhere, and
no `supabase/migrations/` file has been added. Writing and applying the
actual migration remains separately gated `DCFC-202` work.

Every table below follows the exact conventions already established in this
repository, read directly from existing migrations rather than assumed:

- `id uuid primary key default gen_random_uuid()` + `club_id uuid not null
  references onzio.clubs(id) on delete restrict` + `unique (club_id, id)`
  for multi-row tables (the `players`/`matches` pattern).
- `club_id uuid primary key references onzio.clubs(id) on delete restrict`
  for one-row-per-club singletons (the `homepage_hero_content` pattern).
- Composite tenant-safe foreign keys to media:
  `foreign key (club_id, x_asset_id) references onzio.media_assets(club_id, id)`.
- RLS via `onzio_private.can_read_feature(club_id, 'feature')` /
  `can_mutate_feature(club_id, 'feature')`, four policies (read/insert/
  update/delete), granted to `anon, authenticated` (read) and `authenticated`
  (mutate), `service_role` gets all.
- `audit_content_mutation()` and `set_updated_at()` triggers on every table,
  in the same migration that creates it.
- `jsonb` ordered arrays use `not null default '[]'::jsonb` (the explicit
  cast, matching all six existing usages: `story_paragraphs`, `values`,
  `features`, `color_cards`, `bullet_points`, `cards`).
- URL/href columns get automatic protocol validation for free from
  `lib/admin-data-contract.ts`'s generic validator — no new validation code
  needed as long as the column name ends in `url`/`href`/`link`.
- Every new table must also be added to `ADMIN_TABLE_FEATURES` in
  `lib/admin-data-contract.ts`. That map is the allowlist of tables the
  generic admin mutation boundary will accept at all — a table absent from
  it cannot be written through the admin path regardless of its RLS.
- `media_assets.surface` is free-form text constrained only by
  `^[a-z][a-z0-9-]{0,63}$`, not an enum, so new surfaces (`programs`,
  `tryouts`, `contact`) need **no** migration to `media_assets`.

## Column Constraint Policy — added 2026-07-31 at Christian's request

The first draft specified no text-length or URL-shape constraints, which
would have left `DCFC-202` deciding them ad-hoc while writing SQL. The
policy below is derived from existing migrations, and the concrete limits
are included in each table definition rather than left implicit.

**Length checks.** Existing tables use two forms, and the distinction is
meaningful:

- `check (char_length(x) between 1 and N)` for columns that are `not null`
  with no default — the column is required and must not be empty
  (`site_social_links.label` is 1–40; `players.name` and `staff.name` are
  1–120).
- `check (char_length(x) <= N)` for columns that are `not null default ''`
  — empty is a legitimate "not set" value that must stay permitted
  (`homepage_hero_content.headline_line_one` is `<= 80`, `intro` is
  `<= 320`).

Since almost every column in this design is `not null default ''`, the
`<= N` form applies nearly everywhere. Using `between 1 and N` on a
default-`''` column would make the default itself violate the constraint.

**URL/href checks — do not copy the existing regex.** `homepage_hero_content`
constrains its CTA hrefs with:

```sql
check (primary_cta_href = '' or primary_cta_href ~ '^/[-A-Za-z0-9_/?#=&%.]*$')
```

That pattern permits **internal paths only**. Applying it to
`programs.external_cta_href` or `tryouts.registration_href` would reject
every external registration URL — the exact thing those columns exist to
hold, and a failure that would surface only when a club first saved a real
partner link. External-capable href columns instead mirror the allowlist
the application layer already enforces in `lib/admin-data-contract.ts`
(`''`, a local path, `http:`, `https:`, or `mailto:`):

```sql
check (
  external_cta_href = ''
  or external_cta_href ~ '^(/|https?://|mailto:)'
)
```

This is defense in depth, not a replacement: the generic admin validator
still runs first for any column whose name ends in `url`/`href`/`link`. The
database check exists because RLS and database constraints are the final
authorization boundary per `AGENTS.md`, and the admin path is not the only
possible writer (`service_role` bypasses it).

**Long-form body copy** (`programs.body`, the three `tryouts` `*_copy`
columns) gets a generous cap rather than none. The cap is a guard against
unbounded payloads, not an editorial limit; if a real program description
ever exceeds it, raise the cap deliberately in a migration rather than
treating the limit as a content rule.

## Feature Names and Tier Gating — resolved 2026-07-31 (`DCFC-D108`)

This is the highest-risk detail in this design and it is not a free choice.
`onzio_private.club_has_feature` hardcodes the Starter allowlist:

```sql
club.tier = 'pro'
or p_feature in ('branding', 'roster', 'schedule', 'homepage', 'about')
```

Any feature string outside that list is **Pro-only**, and `can_read_feature`
gates **anonymous public reads**, not just admin writes — so a wrong feature
name silently makes the corresponding public page render empty for Starter
clubs. Christian resolved the tiering on 2026-07-31:

| Table | Feature | Tier | Status |
| --- | --- | --- | --- |
| `tryouts` | `tryouts` | Pro-only | No change needed. A new feature string is Pro-only by default, which matches the already-registered `moduleRegistry.tryouts` → `entitlement: "pro"`. |
| `programs` | `programs` | Pro-only | Confirmed by Christian. Same as above — new feature string, no `club_has_feature` change required. |
| `contact_profile`, `contact_page_content` | `contact` | **Starter-accessible** | Confirmed by Christian. Requires adding `'contact'` to the `club_has_feature` allowlist (see below). |

### Required change to `club_has_feature`

Making Contact Starter-accessible needs the allowlist extended to:

```sql
p_feature in ('branding', 'roster', 'schedule', 'homepage', 'about', 'contact')
```

Two options were considered. **Chosen: add `'contact'` to the allowlist**,
rather than reusing the existing Starter-allowed `about` feature. Reusing
`about` would have avoided touching a security-definer function, but it
would leave `ADMIN_TABLE_FEATURES` mapping the contact tables to `"about"`
— semantically misleading to every future reader for no lasting benefit.
(Features here are purely tier gates, not permission scopes —
`can_mutate_feature` is `can_mutate_content(club_id) AND
club_has_feature(club_id, feature)` — so reusing `about` would have carried
no *security* downside, only a clarity cost. The clarity is worth the
narrow change.)

Notes for whoever writes this in `DCFC-202`:

- The change is purely additive. Adding a string no existing table
  references cannot alter behavior for any existing table; it only takes
  effect once the contact tables exist.
- `club_has_feature` is `create or replace`; Postgres preserves existing
  ACLs across a replace, but the replacement must still preserve
  `security definer`, `set search_path = ''`, `stable`, and fully-qualified
  relations exactly as the current definition has them, per `AGENTS.md`.
- This is a modification to a shared security function that governs every
  existing table, so it warrants its own focused contract coverage in
  `DCFC-201` — specifically that a Starter club can read `contact_*` but
  still cannot read `programs`/`tryouts`.

The chosen feature strings must match between the migration's RLS policies
and `ADMIN_TABLE_FEATURES`, or admin writes and public reads will disagree.

## Programs

Multi-row, per `CONTENT-MATRIX.md`'s Program Domain Draft. Four rows exist
today (Youth Academy, Special Kickers, Special Olympics, UPSL Men's Teams);
the table supports any number without code changes.

```
onzio.programs
  id                    uuid primary key default gen_random_uuid()
  club_id               uuid not null references onzio.clubs(id) on delete restrict
  slug                  text not null check (slug ~ '^[a-z][a-z0-9-]*$')
  nav_label             text not null default ''
  display_title         text not null
  kicker                text not null default ''
  summary               text not null default ''
  body                  text not null default ''
  highlights            jsonb not null default '[]'::jsonb  -- ordered array of short strings
  layout_variant        text not null default 'statement_band'
                          check (layout_variant in ('statement_band', 'detail_focus'))
  hero_media_asset_id   uuid
  detail_media_asset_id uuid
  external_cta_label    text not null default ''
  external_cta_href     text not null default ''
  status                text not null default 'active'
                          check (status in ('active', 'hidden'))
  sort_order            integer not null default 0
  created_at            timestamptz not null default now()
  updated_at            timestamptz not null default now()
  unique (club_id, id)
  unique (club_id, slug)
  foreign key (club_id, hero_media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
  foreign key (club_id, detail_media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
  check (char_length(slug) between 1 and 64)
  check (char_length(display_title) between 1 and 120)
  check (char_length(nav_label) <= 40)
  check (char_length(kicker) <= 80)
  check (char_length(summary) <= 320)
  check (char_length(body) <= 6000)
  check (char_length(external_cta_label) <= 40)
  check (char_length(external_cta_href) <= 2048)
  check (external_cta_href = '' or external_cta_href ~ '^(/|https?://|mailto:)')
```

`slug` and `display_title` use the `between 1 and N` form because they are
the only two columns here that are required with no default — a program
with no slug or no title is not a valid row. Everything else is
`default ''` and uses `<= N`.

**Why `layout_variant` instead of per-program code branches:** the field
inventory in `CONTENT-MATRIX.md` found the four approved program pages use
exactly two layout compositions — a "statement band" (Youth Academy, Special
Kickers) and a "detail image plus Program Focus" layout (Men's Teams).
Special Olympics is a third, distinct case (its own registration/carousel
section) — see below. Encoding this as a content-driven `layout_variant`
column, selected by whoever edits the program in the admin, is the reusable
alternative to what the snapshot currently does (branching on `program.id`
inside one route). This is content-driven variation, not a tenant-identity
branch, and is the same kind of choice already expressed elsewhere via enums
(e.g. `players.position`).

**Special Olympics' registration carousel is out of scope for this table.**
Its photo carousel + external registration CTA is a distinct, more complex
section (`SpecialOlympicsRegistrationSection` in the snapshot) that doesn't
generalize cleanly to "any program" — proposing it as a registered section
type usable by *any* program (not just this one) is `DCFC-203` design work,
not decided here. This table's `external_cta_label`/`external_cta_href`
cover the simple case every other program already uses.

## Contact

Two tables, matching `CONTENT-MATRIX.md`'s note that canonical destinations
(shared by the page, footer, and nav) and page-specific copy have different
ownership. Both are singletons — one row per club — following the
`homepage_hero_content` pattern.

**Correction from the first draft of this document:** an earlier version
proposed `instagram_href`/`facebook_href`/`x_href` columns on
`contact_profile`. That was wrong — **`onzio.site_social_links` already
exists** (`club_id`, `id`, `label`, `href`, `icon`, `sort_order`, primary key
`(club_id, id)`, feature `branding`), is already registered in
`ADMIN_TABLE_FEATURES`, and already has an admin editor. Social links are a
reusable existing capability, not part of this gap. `DCFC-102`'s gap
analysis should have caught this and did not; both documents are now
corrected. The Contact page and footer should both read
`site_social_links` — no new social columns anywhere.

```
onzio.contact_profile        -- canonical, shared by footer/nav/contact page
  club_id           uuid primary key references onzio.clubs(id) on delete restrict
  public_email      text not null default ''
  public_phone      text not null default ''
  service_area      text not null default ''
  hours             text not null default ''  -- empty = not displayed
  updated_at        timestamptz not null default now()
  check (public_email = '' or public_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  check (char_length(public_email) <= 254)   -- RFC 5321 maximum
  check (char_length(public_phone) <= 40)
  check (char_length(service_area) <= 120)
  check (char_length(hours) <= 200)
  -- social links intentionally absent: use existing onzio.site_social_links

onzio.contact_page_content   -- page-specific copy only
  club_id           uuid primary key references onzio.clubs(id) on delete restrict
  eyebrow           text not null default ''
  headline          text not null default ''
  intro             text not null default ''
  hero_media_asset_id uuid
  updated_at        timestamptz not null default now()
  foreign key (club_id, hero_media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
  check (char_length(eyebrow) <= 80)
  check (char_length(headline) <= 80)
  check (char_length(intro) <= 320)
```

The eyebrow/headline/intro limits deliberately match
`homepage_hero_content`'s existing 80/80/320, since these are the same kind
of hero copy on a different page.

Verified by grep across all migrations: there are currently **no** email or
phone columns anywhere in the schema, so `public_email`/`public_phone`/
`service_area`/`hours` are genuinely new and not another accidental
duplicate.

Splitting these two tables means `DCFC-302` (Contact admin) can enforce the
correct ownership boundary at the schema level: `contact_profile` is the same
data `Footer`/`Nav` already need regardless of whether the Contact page
exists at all, while `contact_page_content` only matters to the one page. No
contact-reason-label-to-destination mapping table is proposed — none of the
approved snapshot content uses one, and `CONTENT-MATRIX.md` lists it only as
a candidate field, not something the approved page actually needs.

## Tryouts

Multi-row (`DCFC-D103`, accepted 2026-07-31), shaped like `matches` more
than like a singleton.

```
onzio.tryouts
  id                    uuid primary key default gen_random_uuid()
  club_id               uuid not null references onzio.clubs(id) on delete restrict
  program_id            uuid  -- nullable: general club-wide tryout if unset
  status                text not null default 'upcoming'
                          check (status in ('upcoming', 'open', 'closed'))
  eyebrow               text not null default ''
  headline              text not null default ''
  intro                 text not null default ''
  hero_media_asset_id   uuid
  eligibility_copy      text not null default ''
  what_to_expect_copy   text not null default ''
  preparation_copy      text not null default ''
  event_date            date  -- null = TBA, rendered honestly per existing Schedule convention
  location              text not null default ''  -- '' = TBA
  cost_text             text not null default ''  -- '' = TBA; free-text, not numeric (matches Shop's "Contact the club" precedent)
  cta_label             text not null default ''
  registration_href     text not null default ''  -- '' = fails closed to contact fallback, per DCFC-002's already-verified behavior
  closed_message        text not null default ''
  sort_order            integer not null default 0
  created_at            timestamptz not null default now()
  updated_at            timestamptz not null default now()
  unique (club_id, id)
  foreign key (club_id, program_id)
    references onzio.programs(club_id, id) on delete restrict
  foreign key (club_id, hero_media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
  check (char_length(eyebrow) <= 80)
  check (char_length(headline) <= 80)
  check (char_length(intro) <= 320)
  check (char_length(eligibility_copy) <= 2000)
  check (char_length(what_to_expect_copy) <= 2000)
  check (char_length(preparation_copy) <= 2000)
  check (char_length(location) <= 160)
  check (char_length(cost_text) <= 120)
  check (char_length(cta_label) <= 40)
  check (char_length(closed_message) <= 320)
  check (char_length(registration_href) <= 2048)
  check (registration_href = '' or registration_href ~ '^(/|https?://|mailto:)')
```

Note that the `registration_href` pattern permits `''` by design — an empty
value is the documented TBA state that fails closed to the `mailto:`
contact fallback, so the constraint must not force a URL to be present.

**Why `event_date` is nullable rather than required:** the approved
snapshot's honest "TBA" behavior (verified in `DCFC-002`/`DCFC-003`) must
survive the move to a real table — a row can exist and be publicly visible
before a date is confirmed. Same reasoning for `location`/`cost_text` as
empty-string-means-TBA rather than a required field.

**Why the missing-URL fail-closed behavior isn't reinvented:** DCFC-002
already built and verified (temporarily blanking the URL, confirming the
fallback) that an empty `registration_href` or `status = 'closed'` should
render a `mailto:` contact fallback instead of a dead button. `DCFC-204`
should lift that logic into the real query/component rather than re-derive
it.

**No FAQ field.** Per `DCFC-D102`, Christian confirmed FAQ content belongs
on the club's external registration partner, not on Onzio. Not included
here, consistent with `CONTENT-MATRIX.md`.

## What Phase 2 Still Needs to Decide (not resolved by this design)

- Exact `format`/`duration`/`dimension`/`size`/`poster` upload rules for the
  Bunny.net-backed video capability (`DCFC-D105`) — see the
  `docs/onzio-platform-plan.md` amendment for the vendor/architecture
  decision; the specific numeric limits are `DCFC-201`/`DCFC-202` detail.
- Whether a registered section type for Special Olympics-style
  carousel-plus-registration should be a one-off `academy.special-olympics`
  section or a generalized "program registration carousel" section any
  program could opt into. This design deliberately doesn't decide that.
- Real content for every `TBA`/empty field above — this design only fixes
  the shape, not the values. Populating real values is Phase 3
  (`DCFC-301`–`DCFC-303`) admin work plus whatever real facts the club
  supplies.

## Approval

Christian approved this design on 2026-07-31, closing `DCFC-103` and with it
Phase 1. Recorded as `DCFC-D109` in `DECISIONS.md`.

The approval covers the table shapes, the feature/tier assignments
(`DCFC-D108`), and the column-constraint policy added during the same
review. It does **not** authorize writing or applying the migration — that
remains separately gated `DCFC-202` work per `AGENTS.md`, and `DCFC-201`
(red contracts) must land first per the epic's delivery sequence.
