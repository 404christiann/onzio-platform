# Diverse City FC Reusable Platform Gap Analysis (DCFC-102)

Status: `complete`

Last updated: 2026-07-31

This is a comparison of the approved Diverse City visual specification
(`CONTENT-MATRIX.md`, snapshot commit `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`)
against the **actual current state** of the `onzio-platform` codebase — real
schema, real registries, real admin routes, read directly from
`supabase/migrations/`, `packages/presentation/index.ts`, `lib/`, and
`app/admin/`, not from the architecture plan's prose alone. It identifies
what is reusable as-is, what is a true gap, and what tests/migrations Phase 2
should own — without implementing any of it. No platform or snapshot code
changed in this pass; read-only research only.

## Reusable As-Is (no new schema or registry work needed)

| Diverse City need | Existing Onzio capability | Evidence |
| --- | --- | --- |
| League standings (homepage) | `league_standings` + `league_standings_settings` tables, `app/admin/(protected)/standings` editor | `supabase/migrations/*.sql`; matches exactly what Christian confirmed on 2026-07-31 — an admin-editable domain, not a one-time import |
| Homepage hero | `homepage_hero_content` table, `admin/homepage` editor | `20260729223334_phase9_homepage_hero_content.sql` |
| Homepage slideshow | `homepage_slideshow_photos`/`homepage_slideshow_settings`, `admin/homepage` | same migration set |
| About page | `about_page_content` table, `admin/about` editor | `20260726000200_phase2_content.sql` |
| Shop | `shop_kit_section`, `shop_kit_photos`, `shop_carousel_photos`, `shop_purchase_details`, `admin/shop` editor | phase 2 + `20260730020818_phase9_shop_third_kit_variant.sql` |
| Sponsors | `site_sponsor_logos` table, `admin/sponsors` editor | phase 2 content migration |
| Social links (footer + Contact page) | `site_social_links` table (`club_id`, `id`, `label`, `href`, `icon`, `sort_order`), already in `ADMIN_TABLE_FEATURES` under `branding`, already has an admin editor | phase 2 content migration — added to this table 2026-07-31 during `DCFC-103` re-review, having been mis-filed as a Contact gap in the first draft |
| Roster / staff / seasons / stats | `players`, `staff`, `seasons`, `player_season_stats`, `goalkeeper_season_stats`, `player_match_stats`, `goalkeeper_match_stats`, matching `admin/roster`, `admin/seasons`, `admin/season-stats`, `admin/stats` | phase 2 content migration |
| Branding / crest | `site_branding` table (+ inverse-logo columns), `admin/branding` | phase 2 + `20260730015524_phase9_site_branding_inverse_logo.sql` |
| Dynamic collection-item detail pages | Established thin-route pattern: `app/(public)/roster/[playerId]/page.tsx` and `app/(public)/schedule/[fixtureId]/page.tsx` both resolve a param to a shared presentation component | read directly; this is the same shape `/programs/[programSlug]` would need |
| Dropdown navigation | `components/Nav.tsx`'s `NavLink` type already has an optional `children?: { label; href }[]` field, actively used (e.g. a "Club" parent with "About Club"/"Club Logo" children) | read directly, line 72 |
| External URL protocol validation | `lib/admin-data-contract.ts`'s generic admin-mutation validator automatically flags any field whose name ends in `url`/`href`/`link` unless it starts with `http:`, `https:`, `mailto:`, or `/` | read directly, lines 54–68 — this applies to **any** table's admin mutations with zero new validation code, so Contact/Tryouts/Programs external links are covered by adding the right column name, not by writing new validators |
| Video (partial) | `behind_the_rose_section` table has `video_url`/`video_title`; `lib/homepage-content.ts`'s `normalizeYouTubeEmbedUrl()` already normalizes youtu.be/youtube.com URLs into embeddable form | `20260726000200_phase2_content.sql`; see the Video section below for the gap this does *not* close |

## True Gaps (new schema, registry, and admin work required)

### Programs

Nothing exists: no table, no `routeRegistry`/`moduleRegistry` entry, no
section type, no admin editor. This is the largest true gap.

- Needs: a `programs` table (identity/slug, nav label, display title, summary
  and long-form copy, ordered highlights, hero + detail media references,
  related-program relationships, optional external CTA, status/visibility/
  sort order — see `CONTENT-MATRIX.md`'s Program Domain Draft) plus a
  `program_media`-style join if a program needs multiple media roles (hero,
  detail, gallery).
- Needs: `routeRegistry`/`moduleRegistry` entries for a programs overview
  route and a dynamic detail route, reusing the roster/schedule
  detail-page pattern noted above — **not** four separate hardcoded routes
  per program, and **not** a tenant-slug branch. Diverse City's snapshot
  currently branches internally on `program.id` (`isYouthAcademy`,
  `isSpecialOlympics`, etc.) inside one shared `[programId]` route. That is
  an acceptable content-driven variant, not the club-specific conditional
  this package's acceptance criteria prohibits — the prohibition is against
  branching on **tenant identity** (`if (club.slug === "diverse-city")`),
  not against one reusable route rendering different registered sections
  per content item. The real gap is that none of this is registered or
  schema-backed yet; it is presently four bespoke, hardcoded page-variants
  in an isolated snapshot.
- Needs: an `admin/programs` editor (list/create/edit/reorder/media),
  matching the existing admin patterns.
- The "statement band" vs. "detail image + Program Focus" layout difference
  between programs (see `CONTENT-MATRIX.md`'s program detail table) should
  become a presentation-section/layout choice per program, not new
  page-level code per program.

### Contact

No Contact table, registry entry, or admin editor exists — but see the
social-links correction below.

- **Correction (2026-07-31, during `DCFC-103` re-review):** an earlier
  version of this section listed *social links* as part of the Contact gap.
  That was wrong. `onzio.site_social_links` already exists (`club_id`, `id`,
  `label`, `href`, `icon`, `sort_order`), is already registered in
  `ADMIN_TABLE_FEATURES` under the `branding` feature, and already has an
  admin editor. Social links belong in the **Reusable As-Is** category; the
  Contact page and footer should both read that existing table. No new
  social columns should be created.
- Needs: canonical tenant contact fields — email, phone, service area, and
  optional hours. Verified by grep across all migrations that **no** email
  or phone column currently exists anywhere in the schema, so these are a
  genuine gap. Plus a separate Contact-page-specific content
  table/singleton for page copy (eyebrow, headline, intro, hero media), per
  `CONTENT-MATRIX.md`'s Contact Content Contract Draft.
- **Tier gating (resolved, `DCFC-D108`):** `onzio_private.club_has_feature`
  treats any feature name outside
  `('branding', 'roster', 'schedule', 'homepage', 'about')` as Pro-only, and
  `can_read_feature` gates anonymous public reads — so a new `'contact'`
  feature would have silently made Starter clubs' contact page render empty.
  Christian confirmed Contact should be **Starter-accessible**, so
  `DCFC-202`'s migration must additively add `'contact'` to that allowlist.
  Programs and Tryouts are both **Pro-only** and need no allowlist change.
- Needs: `routeRegistry`/`moduleRegistry` entries for `/contact` (unlike
  Tryouts, this does not exist at all yet).
- Needs: an `admin/contact` editor, respecting the ownership split noted in
  `DCFC-302`'s objective — page copy vs. canonical destinations may have
  different edit boundaries.
- External link validation: fully covered by the existing generic
  `admin-data-contract.ts` validator (see Reusable section) — no new
  validation code needed once column names end in `url`/`href`.

### Tryouts (partial — this is the nuanced one)

The **routing and entitlement scaffolding already exists**:
`routeRegistry.tryouts = { path: "/tryouts" }` and
`moduleRegistry.tryouts = { entitlement: "pro" }` are both already registered
in `packages/presentation/index.ts`, and a generic `tryouts` boolean already
appears in the module-entitlement contract test fixture. This was likely
added as general Pro-tier module scaffolding, not a completed Tryouts
build — there is no `tryouts` schema table, no registered section type, and
no admin editor. `grep`ing the whole repository for "tryout" (case
insensitive) turns up exactly two files: the registry and its contract test.

- Needs: a `tryouts` table shaped as **structured event rows** (`DCFC-D103`,
  accepted 2026-07-31) — one row per tryout opportunity (status,
  eyebrow/headline/intro, hero media, eligibility/age-group copy,
  date/location/cost, optional program association, sort order), closer in
  shape to `matches`/`players` than to a singleton like
  `homepage_hero_content`, since the club may run simultaneous opportunities
  across its four programs. Needs a registered section type (e.g.
  `academy.tryouts` or a shared cross-template type, matching the
  `sectionRegistry` shape already used for other sections) capable of
  rendering a list, not just a single block. DCFC-002's snapshot UI
  (single-opportunity hero) will need to become a list/grid of event cards to
  match.
- Needs: an `admin/tryouts` editor.
- The external registration URL is, again, fully covered by the existing
  generic URL validator — no new validation code needed.
- The closed/missing-URL fail-closed behavior DCFC-002 already built and
  verified in the snapshot (falls back to a `mailto:` contact link) is a
  good candidate to lift directly into the real component rather than
  re-derive.

### Video — resolved 2026-07-31: `DCFC-D105` accepted

The existing `behind_the_rose_section`/`normalizeYouTubeEmbedUrl()`
capability handles **YouTube-embedded** video only. Diverse City's approved
homepage uses two **self-hosted MP4 files** played directly
(`media/video/homepage-hero-edited.mp4` for the hero,
`media/video/club-reel-portrait.mp4` for "Developing the next generation") —
a different delivery mechanism than an embedded YouTube iframe, and one the
existing platform capability does not cover.

Christian approved building real self-hosted video via a third-party video
CDN — **Bunny.net Stream** — rather than in-house Vercel/Supabase
transcoding or adopting the YouTube-embed pattern. Rationale, researched with
live pricing (not memorized figures) and recorded in full in
`DECISIONS.md`'s `DCFC-D105` row:

- In-house transcoding was rejected: Vercel serverless functions are a poor
  fit for video encoding (execution-time/memory limits — the same class of
  constraint that previously forced `sharp`/`libvips` out of the
  media-cleanup runtime), and raw storage bandwidth costs more per GB on
  both Supabase Storage ($0.09/GB uncached egress) and Vercel Blob ($0.05/GB
  transfer) than a purpose-built video CDN at any realistic scale.
- Of the three video CDNs compared (Cloudflare Stream, Mux, Bunny.net
  Stream), Bunny.net Stream was cheapest at every modeled scale from 6 to
  100 clubs (roughly $1.25–$12.50/month total), with free standard H.264
  encoding and a flat $1/month minimum.
- Known tradeoffs accepted: less infrastructure control and weaker built-in
  analytics than Mux, and a smaller global network than Cloudflare — judged
  acceptable for simple looping background/story videos with admin
  swap-in-out, not live streaming or DRM.

Format/duration/dimension/size/poster/processing rules (the specific upload
constraints, analogous to the existing 15MB/6000px photo rules) are **not**
decided by this accepted decision — that detail belongs to `DCFC-201`
(contracts) and `DCFC-202` (schema), not this analysis.

## Navigation

The real `Nav.tsx` already supports dropdown children generically (see
Reusable section), so a "Schedule" dropdown containing "Fixtures"/"Tryouts",
or a "Programs" dropdown, does not need new nav architecture — it needs the
underlying routes/content to exist so the links resolve to something real.
The specific link/label choices Diverse City approved (Schedule as a
dropdown parent with Fixtures + Tryouts children; Contact in the main nav
after Store; Tryouts and Contact also in the footer) are tenant-configured
navigation content, not new navigation capability.

## Proposed Tests and Migration Ownership (not implemented in this pass)

Per this package's acceptance criteria, this only names what Phase 2 should
own — it does not write the migrations or tests.

- **`DCFC-201` (red contracts)** should add failing contracts for, at
  minimum: `programs` table tenant-isolation and composite-FK rejection
  (Alpha/Bravo cross-tenant), `contact` table public-read policy respecting
  clubs' `public_access` state, `tryouts` external-URL protocol validation
  and closed/missing-URL fail-closed behavior, program-detail route
  resolution for an unknown/removed program slug (should 404, not error),
  and — because `DCFC-D108` modifies a shared security function — explicit
  tier coverage proving a **Starter** club can read `contact_*` but still
  cannot read `programs` or `tryouts`.
- **`DCFC-202` (schema/RLS/types)** should own three migrations: `programs`
  (+ media join), `contact` (canonical fields + page-copy singleton), and
  `tryouts` (structured event rows). Each needs RLS, grants, and audit
  triggers in the same migration that creates the table, per `AGENTS.md`.
  It must also additively add `'contact'` to the
  `onzio_private.club_has_feature` Starter allowlist per `DCFC-D108`,
  preserving `security definer`, `set search_path = ''`, `stable`, and
  fully-qualified relations in the replaced definition. Every new table must
  additionally be registered in `ADMIN_TABLE_FEATURES`
  (`lib/admin-data-contract.ts`) or the generic admin mutation boundary will
  reject writes to it regardless of RLS. Regenerate
  `lib/database.generated.ts` after.
- **`DCFC-203` (routes/modules/sections)** should own registering: a
  programs overview + dynamic detail route (reusing the existing
  roster/schedule detail-page pattern), a `contact` route/module entry (does
  not exist yet, unlike tryouts), and a `tryouts` section type (the route and
  module entries already exist and should not be re-registered — verify
  before assuming they need to be added).
- **`DCFC-204` (queries/mutations)** should own typed query functions for all
  three domains plus admin mutation schemas — external URL/link fields get
  automatic protocol validation for free from the existing generic
  `admin-data-contract.ts` validator as long as column names end in
  `url`/`href`/`link`.
- Migration ownership should NOT touch `league_standings`,
  `homepage_hero_content`, `about_page_content`, `shop_*`,
  `site_sponsor_logos`, or roster/staff/season tables — those are complete
  and reusable as-is; Diverse City just needs its rows.

## What This Analysis Deliberately Does Not Do

- Does not implement any migration, route, section, or admin editor.
- `DCFC-D103` (event-row model), `DCFC-D104` (template mapping), and
  `DCFC-D105` (video capability) are all now resolved as follow-up
  discussion after this analysis: Christian approved structured event rows
  for Tryouts, a new template registered as `academy@1` rather than mapping
  to `cinematic@1`, and building real self-hosted video via Bunny.net Stream
  rather than in-house Vercel/Supabase transcoding or a YouTube-embed
  fallback — see `DECISIONS.md`. All decisions this analysis flagged as
  needed before `DCFC-103` are now resolved.
- Does not propose club-specific conditionals anywhere as a substitute for
  registering real, reusable capabilities.
