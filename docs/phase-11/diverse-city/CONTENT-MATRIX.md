# Diverse City FC Content Matrix

Status: `field_level_inventory_complete`

Last updated: 2026-07-31

This matrix is the production-content planning surface. It does not authorize
imports, hosted storage, or publication. DCFC-101 expanded this file to
field-level coverage for every route in the pinned snapshot commit
`5bbdfa33d59163b218bbd33745f9cfd4a66d379f`. Read-only work only — no snapshot
or platform application code changed, and no hosted resource was touched.

## Route Inventory

| Route | Snapshot baseline | Intended Onzio domain | Primary gap | Production readiness |
| --- | --- | --- | --- | --- |
| `/` | Approved existing route | Homepage content plus presentation sections | Every section is hardcoded in components, not database-backed; standings must become an admin-editable domain (confirmed 2026-07-31) | Requires Phase 2 schema |
| `/club/about` | Approved existing route | Existing About domains plus media | Hardcoded in the page component, not database-backed | Requires Phase 2 schema |
| `/roster` | Approved presentation with placeholders | Players, staff, seasons, media | 11 placeholder players + 4 placeholder staff, explicitly self-labeled in source as preview-only | Blocked on official roster data |
| `/schedule` | Approved TBA presentation | Matches, venues, seasons | 3 fixture rows, all fields honestly TBA | Blocked on official fixture data |
| `/programs` | Approved existing route | New Programs domain | No normalized Onzio program domain/route yet | Requires Phase 2 |
| `/programs/youth-academy` | Approved existing route | Program plus structured sections/media | New program detail capability | Requires Phase 2 |
| `/programs/special-kickers-program` | Approved existing route | Program plus statement band/media | New program detail capability | Requires Phase 2 |
| `/programs/special-olympics-soccer` | Approved existing route | Program plus carousel/external CTA | Temporary Google URL still needs the club's real registration URL; no registration storage | Requires Phase 2 and client URL |
| `/programs/upsl-mens-teams` | Approved existing route | Program plus editorial sections/media | New program detail capability | Requires Phase 2 |
| `/shop` | Approved presentation, correctly avoids inventing price/sizing | Existing shop content/media | Confirm product facts and outbound purchase/contact behavior | Blocked on official facts |
| `/sponsors` | Preserved existing route | Existing sponsor domain | Confirm verified sponsors and navigation placement | Requires client confirmation |
| `/contact` | Approved in snapshot (DCFC-001, 2026-07-31) | Tenant contact profile plus Contact page singleton | Field-level detail below | Visual approved; ready for Phase 2 schema |
| `/tryouts` | Approved in snapshot (DCFC-002, 2026-07-31) | Tryouts page singleton, external CTA | Age groups/eligibility/dates/location/cost still TBA (honest placeholders, not invented); no FAQ by design | Visual approved; ready for Phase 2 schema |

## Provenance Concerns Raised in DCFC-101 — Resolved 2026-07-31

1. **League standings table.** Christian confirmed the standings table
   (`components/DiverseLeagueStandings.tsx`) is intended to be an
   admin-editable content domain — club/operator staff will maintain it
   through the Onzio admin portal once that workflow exists. The current
   hardcoded rows are placeholder/seed values pending that admin capability,
   not a claim of current real-world accuracy. Reclassified from "unconfirmed
   real-named data" to `placeholder_preview_only` (seed data), with a clear
   target domain: a normalized, tenant-scoped, admin-editable standings table
   (rows + settings), matching the existing `standings-content.ts` /
   `DBLeagueStandingRow` shape already present in this codebase as inherited
   Rose City scaffolding (see Legacy section) — that schema is a strong
   starting point for Phase 2 rather than a new design.
2. **"Conference championships and national-stage appearances" claim.**
   Christian confirmed this does not need resolution right now. Left as-is;
   revisit if/when it becomes a Phase 2 blocker.

## Legacy / Unused Files (not the live Diverse City content source)

This snapshot was forked from the Rose City codebase, and several
Rose-City-specific data files and components remain in the repository but
are **not imported or rendered by any current Diverse City public route**.
Treat these as historical reference only — do not mistake them for the real
content source when planning Phase 2 schema:

- `lib/about-content.ts` and `components/AboutClubPageClient.tsx` — Rose
  City About-page content/component; `/club/about` is a fully self-contained
  page component instead.
- `lib/homepage-content.ts` — Rose City homepage hero/slideshow/"Behind the
  Rose" defaults; the live `Hero.tsx` and other homepage sections are fully
  hardcoded and do not reference this file.
- `lib/standings-content.ts` — Rose City "UPSL SoCal North" standings
  defaults; `DiverseLeagueStandings.tsx` hardcodes its own separate data (see
  the flag above) and does not reference this file.
- `lib/social-links.ts` — Rose City social URLs
  (`rosecityfutbolclub.com`/`rosecityfc`); the real Diverse City social links
  live in `lib/site-data.ts`'s `club` object instead.
- `lib/shop-kit.ts`, `lib/shop-purchase-details.ts`, `lib/shop-photo-strip.ts`,
  and the `Shop*` components (`ShopHero`, `ShopHeroMobile`, `ShopKitSection*`,
  `ShopPhotoStrip*`, `ShopPurchaseDetailsSection*`, `ShopSlideshow`) — Rose
  City's multi-kit shop backend; `/shop` is a simple, fully self-contained
  one-jersey page instead.
- `components/HomeSections.tsx` exports a `PhotoSequence` component that is
  defined but never imported by `app/(public)/page.tsx` — dead code, not a
  content gap.
- `lib/club-branding.ts`'s `clubLogoUrl()` resolves to the local
  `/media/crest.png` file only when `NEXT_PUBLIC_SUPABASE_URL` is unset (true
  in this isolated snapshot). If a Supabase URL were configured, it would
  build a Storage URL against bucket `logos_v2` at path
  `diverse-city-fc/crest.png` — dormant wiring toward a real per-club
  logo-storage pattern, useful context for Phase 2 media-schema reuse, not a
  gap to close now.

## Field-Level Inventory by Route

Provenance values used below match `## Production Classification`. Checksums
are `sha256` computed directly against the files in `public/` at commit
`5bbdfa3`. Every route currently renders from **hardcoded values in the
component/page file** — none of this content is database-backed yet; "Admin
editor" is listed as "none (Phase 3 dependency)" throughout since no Onzio
admin surface exists for Diverse City yet.

### Homepage (`/`)

Composed in `app/(public)/page.tsx`: `Hero`, `HomeShopFeature`,
`MatchPresentation`, `VerticalStory`, `PartnerStrip`,
`DiverseLeagueStandings`, `ProgramsFeature`, in that order (matches
`HANDOFF.md`'s documented homepage order).

| Section | Source | Content | Media (checksum) | Provenance | Blocker |
| --- | --- | --- | --- | --- | --- |
| Video hero | `components/Hero.tsx` | "One Club" / "One Community"; intro paragraph; CTAs "Explore Our Programs" → `/programs`, "Discover the Club" → `/club/about` | `media/video/homepage-hero-edited.mp4` (`78fb8018…4daf64`); poster `media/video/keeper-save-poster.jpg` (`801df56d…073b4c5`) | `operator_approved` (manager-trimmed video per `HANDOFF.md`) | Not database-backed; needs Phase 2 homepage-hero schema (Onzio's existing `homepage_hero_content` table pattern is a plausible base) |
| Shop feature | `components/HomeShopFeature.tsx` | "Sky Blue / Match Jersey"; intro; 4 bullet details; "Contact the club for current sizing…" disclaimer; "Buy Now" → `/shop` | `media/shop/front_jersey.png` (`365fffde…5f07a4909`); `media/shop/back_jersey.png` (`a094c5cf…5c1092917`) | `club_supplied` | Not database-backed |
| Next Match | `components/HomeSections.tsx` (`MatchPresentation`) | "Next Match" heading; crest vs. "TBA" opponent; "UPSL Midwest Central"; "Date and time TBA"; "Schaumburg, Illinois"; "Full Schedule" → `/schedule` | crest, see Site Chrome below | Structure `operator_approved`; match data `missing` (honest TBA, matches Schedule page) | Blocked on official fixture data |
| "Developing the next generation" | `components/HomeSections.tsx` (`VerticalStory`) | Headline; 2 paragraphs (coaching pathway; vision statement — overlaps About page's closing paragraph almost verbatim); "Our Story" → `/club/about` | `media/video/club-reel-portrait.mp4` (`aac0847a…4cafe062f64f`); poster `media/video/club-reel-poster.jpg` (`5e284592…159d1d045a0`) | `club_supplied` | Not database-backed |
| Sponsor carousel | `components/HomeSections.tsx` (`PartnerStrip` → `SponsorCarousel`) | 3 entries: "Elsa's Bakery" (real); 2× "Sponsor opportunity" (explicitly self-labeled placeholder slots, not real sponsors) | `media/sponsors/elsas-bakery.webp` (`6ffc5fa3…60cbdfff08fc46bd4f076bb`); `media/sponsors/sponsor-placeholder.png` (`890e07d6…694cd8f20d3af48737`) | Elsa's Bakery: `verified_public_source`. Opportunity slots: `placeholder_preview_only` (intentional, self-documenting) | None — opportunity slots are meant to stay until sold |
| League standings | `components/DiverseLeagueStandings.tsx` | "Premier League Standings"; "UPSL Midwest Central"; 10-row table with specific W/D/L/GD/PTS, Diverse City at rank 6 | crest (Site Chrome) | `placeholder_preview_only` (seed data) — confirmed 2026-07-31 to become an admin-editable domain | Needs Phase 2 schema (reuse the existing `DBLeagueStandingRow`/`standings-content.ts` shape) plus an admin editor |
| Programs pathway | `components/HomeSections.tsx` (`ProgramsFeature`) | "Our Programs"; "A pathway for every player."; intro; 4 program links from `lib/site-data.ts` | `media/hero.webp` (`cfd8146e…33dfca36c2`) | `operator_approved` | None |

### About (`/club/about`)

Fully self-contained in `app/(public)/club/about/page.tsx` (does not use the
legacy `AboutClubPageClient.tsx`/`about-content.ts` — see Legacy section).

| Section | Content | Media (checksum) | Provenance | Blocker |
| --- | --- | --- | --- | --- |
| H1 | "About Club" | — | `operator_approved` | None |
| Story (3 paragraphs) | Founded 2022 by Giovanni Sanchez (ex-MLS Chicago Fire Academy); based in Schaumburg, focus on neurodiverse athletes and players with intellectual disabilities; UPSL Midwest Central pathway + "conference championships and national-stage appearances" + vision statement | `media/about-team-lineup.webp` (`c442901a…0879d1cca0`, optimized from supplied `IMG_0300.heic`) | `club_supplied` (Christian confirmed 2026-07-31 the championships/national-stage claim does not need further resolution now) | None |
| Values (3 cards) | Inclusion, Development, Community — each with a description | — | `operator_approved` editorial copy | None |
| Closing CTA | "See Diverse City FC in action this season." → "See the Schedule" → `/schedule` | — | `operator_approved` | None |

### Roster (`/roster`)

`app/(public)/roster/page.tsx` + `lib/preview-roster.ts` (source code
comment: "Preview-only placeholder identities. Blank images resolve to the
club crest.").

| Section | Content | Provenance | Blocker |
| --- | --- | --- | --- |
| Hero | "{seasonLabel} Season" (`"2026"`); "The Squad" | `operator_approved` structure | None |
| Player groups | 2 Goalkeepers, 3 Defenders, 3 Midfielders, 3 Forwards = 11 players total. Each has: number, name (`"Player 01"` pattern), nationality, position, height, weight, hometown, age, foot, and full field/goalkeeper season stats | `placeholder_preview_only`, explicitly self-labeled in source | Fully blocked on official roster data before production |
| Technical Staff | 4 placeholder staff cards | `placeholder_preview_only` | Same as above |

### Schedule (`/schedule`)

`app/(public)/schedule/page.tsx` — self-contained, 3 fixture rows.

| Section | Content | Provenance | Blocker |
| --- | --- | --- | --- |
| Header | "2025-26 Season"; "Fixtures" | `operator_approved` structure | None |
| Fixture rows (×3) | Date TBA / Time TBA / Opponent TBA / Venue TBA / match-details TBA; row 1 tagged "Next" | `missing` — honestly rendered, not invented | Blocked on official fixture data |

Note: `lib/site-data.ts` exports a separate `sampleFixtures` array with
slightly different placeholder shape (`date`/`opponent`/`competition`/`venue`
fields); this pass did not confirm any current route imports it. Worth a
quick grep-and-remove pass in Phase 2 if it is genuinely orphaned, same as
the `PhotoSequence` component noted above.

### Programs overview (`/programs`)

`app/(public)/programs/page.tsx`.

| Section | Content | Provenance | Blocker |
| --- | --- | --- | --- |
| Hero | "Our Programs"; "One pathway. / Every athlete belongs."; intro paragraph | `operator_approved` | None |
| Program grid (×4) | Card per program: kicker, name, image, links to `/programs/{id}` — sourced from `lib/site-data.ts` `programs` array | `club_supplied` (names/kickers/highlights/body) | None — see program detail rows below for the one flagged claim |
| Closing CTA | "Find your / pathway."; paragraph; "Find Your Program" → `mailto:` | `operator_approved` | None |

### Program detail pages (`/programs/[programId]`) — 4 routes

All four share `app/(public)/programs/[programId]/page.tsx`, branching on
`program.id`. Base copy (name/kicker/body/highlights) comes from
`lib/site-data.ts`'s `programs` array; several per-program overrides are
hardcoded directly in the page component.

| Program | Hero image (checksum) | Heading | Body source | Distinctive sections | Provenance | Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| Youth Academy | `media/hero.webp` (`cfd8146e…33dfca36c2`, shared with homepage) | "Building Future Champions" | `program.body` | Statement band (3 highlights); no detail-image or Program Focus section | `club_supplied` | None |
| Special Kickers | `media/programs/special-kickers-hero.webp` (`576616dd…64e28b57b4`) | "Play, Learn, Thrive" | Hardcoded, duplicates `program.body` verbatim | Statement band (3 highlights); no detail-image or Program Focus section | `club_supplied` | None |
| Special Olympics | `media/programs/special-olympics-hero.webp` (`a72af0d8…96d698036`) | "Empowering Athletes" | Hardcoded, near-duplicate of `program.body` | `SpecialOlympicsRegistrationSection` — 4-photo carousel (`special-olympics-slide-01..04.webp`) + external CTA to a temporary `https://www.google.com/` placeholder (see `DCFC-D004`); no statement band or Program Focus section. Note: the overview-grid card image (`media/programs/special-olympics-02.webp`, `3e572e54…225d1e88…`) differs from this page's own cinematic hero image | `club_supplied`; registration URL explicitly temporary | Needs the club's real registration URL before publication |
| Men's Teams | `media/programs/mens-teams-hero.webp` (`4304faa3…5714868c4c86`) | "Development / without limits." (locked 2-line) | Hardcoded — contains the "conference championships and national-stage appearances" claim (Christian confirmed 2026-07-31 no further resolution needed now) | Only program with **both** a detail-image section (`media/programs/mens-teams-detail.webp`, `d4c097b3…3899985f124`; "Grow through the game.", body=`program.body`, "Ask About This Program" → `mailto:`) **and** a Program Focus section (3 highlights) | `club_supplied` | None |

All four pages share a footer "Explore other programs." section linking to
the other three (`operator_approved`).

### Shop (`/shop`)

`app/(public)/shop/page.tsx` — self-contained, one product.

| Section | Content | Media (checksum) | Provenance | Blocker |
| --- | --- | --- | --- | --- |
| Hero | "Official Club Store"; "Diverse City FC Match Jersey"; intro paragraph; Front/Back toggle | `media/shop/front_jersey.png` / `back_jersey.png` (checksums above, shared with homepage feature) | `club_supplied` | None |
| Facts | "Available Item: Match Jersey"; "Sizing and Price: Contact the club" (deliberately no invented price); disclaimer paragraph; "Contact the Club to Order" → `mailto:` with subject | — | `club_supplied` — correctly avoids inventing price/sizing | Real pricing/sizing still needs to come from the club before any checkout capability |

### Sponsors (`/sponsors`)

`app/(public)/sponsors/page.tsx` — preserved route, footer-only navigation.

| Section | Content | Media (checksum) | Provenance | Blocker |
| --- | --- | --- | --- | --- |
| Hero | "Community Partners"; "Backing players. / Building opportunity."; intro; "Start a Conversation" → `mailto:` | — | `operator_approved` | None |
| Sponsor | Elsa's Bakery logo | `media/sponsors/elsas-bakery.webp` (same asset as homepage carousel) | `verified_public_source` | None — more sponsors need client confirmation before adding |

### Contact (`/contact`) and Tryouts (`/tryouts`)

Both approved via `DCFC-001`/`DCFC-002`/`DCFC-003`; full field-level detail
already lives in `HANDOFF.md` (snapshot) and this file's Content Contract
Draft sections below rather than being repeated here. Quick summary:

| Route | Real facts used (source, provenance) | Placeholder/TBA fields | Media |
| --- | --- | --- | --- |
| `/contact` | Email, phone, Instagram/Facebook/X, location — all from `lib/site-data.ts`'s `club` object (`verified_public_source`) | None — hours and contact-reason routing intentionally omitted, not invented | Social icons, see Site Chrome |
| `/tryouts` | Contact fallback (same `club` object) | Date, Location, Cost all `TBA` (`missing`, honestly rendered); registration URL is an explicitly-approved temporary reuse of the Special Olympics placeholder | None beyond icons |

## Site Chrome (cross-cutting, every route)

| Element | Source | Media (checksum) | Provenance |
| --- | --- | --- | --- |
| Crest | `components/Nav.tsx`, `Footer.tsx`, `MatchPresentation`, `DiverseLeagueStandings` via `useClubBranding()` → `lib/club-branding.ts` | `media/crest.png` (`d626e62b…39caa1c326`) locally; resolves to a Supabase Storage URL (`logos_v2/diverse-city-fc/crest.png`) if `NEXT_PUBLIC_SUPABASE_URL` were set (dormant, not active in this snapshot) | `verified_public_source` |
| Affiliation marks | `components/Nav.tsx` | US Soccer (`f01e38ed…10950fec1ee4d` / white `abdfa90d…5d94df2df9eae186a`), FIFA (`707a94d1…aefea643667dad6d25da` / white `29f0f5c2…6cb2e02b2ea`), UPSL (`00add943…c314ee3adf68f` / white `7b024366…afe9f4b2b360bb3ae5`) | `verified_public_source` (real affiliation marks) |
| Social icons | `Footer.tsx`, `/contact` | Instagram (`990957a2…64c4476d3116696155`), Facebook (`09417fbc…970318c83349b140`), X (`a624af5e…568e3745f7b2ee8`) | `verified_public_source` |
| Footer disclosure | `components/Footer.tsx` | "Local concept preview. Sample roster and fixture content only." | This text is itself a provenance marker — it is the only sitewide notice that roster/fixture content is placeholder. It must be removed **together with** replacing the roster/fixture placeholders, not independently, or the site would silently start presenting placeholder content as real |

## Contact Content Contract Draft

Canonical tenant contact data should be shared by the page, navigation/footer,
and other public surfaces. Page-specific presentation copy remains separate.

Candidate editable fields pending DCFC-D101:

- eyebrow
- headline
- introduction
- hero media reference
- public email
- public phone
- service area or location text
- optional hours
- social links
- contact-reason labels and destination mapping
- response-expectation text, only if the club supplies it

Initial behavior:

- Use validated `mailto:`, `tel:`, and approved HTTPS destinations.
- Do not persist messages.
- Do not reuse the Supabase Auth email sender for public contact messages.

## Tryouts Content Contract Draft

`DCFC-D103` accepted 2026-07-31: Tryouts is a **structured event rows**
domain (a real table, admin list/create/edit/reorder flow), not a singleton
— the club plausibly runs simultaneous tryout opportunities across its four
programs. Candidate editable fields per row, pending `DCFC-D102`'s remaining
open facts:

- status: upcoming, open, closed (per row)
- eyebrow
- headline
- introduction
- hero media reference
- eligibility or age-group copy
- what-to-expect content
- preparation content
- date and location (per row)
- optional program association (e.g. an optional reference to the relevant
  program), left as `DCFC-202` schema detail
- optional cost language supplied by the club
- CTA label
- validated external registration URL
- closed-state message
- club contact fallback
- sort order / display order across rows

Initial behavior:

- The CTA redirects to the club's third-party provider.
- Onzio stores no participant form submissions.
- Closed or missing registration URLs fail closed with a deliberate contact or
  unavailable state rather than a broken button.
- FAQ entries are intentionally not an Onzio Tryouts field. Christian
  confirmed on 2026-07-31 that tryout logistics (eligibility, what to bring,
  cost, scheduling, next steps) belong on the club's external registration
  partner, not duplicated on this page — consistent with `DCFC-D003`.

## Program Domain Draft

The field-level model must be finalized in DCFC-103. The initial semantic
areas are:

- program identity and stable slug
- navigation label and display title
- summary and long-form copy
- hero content and hero media
- ordered highlights/statements
- registered structured sections
- ordered media assignments for hero, detail, gallery, and carousel roles
- related-program relationships
- optional external CTA label and validated URL
- status, visibility, and sort order

Presentation configuration controls layout and section order. Program tables
hold real club content and media references.

## Production Classification

Every field and asset must eventually carry one of:

- `verified_public_source`
- `club_supplied`
- `operator_approved`
- `placeholder_preview_only`
- `missing`
- `prohibited`

Only the first three may support production publication. Preview-only,
missing, and prohibited values must be replaced, hidden, or rejected.

## DCFC-101 Expansion — Complete

The expansion required by DCFC-101 (exact snapshot source file/component,
approved copy, source asset and checksum, proposed Onzio table/field, media
surface and role, admin editor location, empty behavior, entitlement/module,
provenance status, unresolved decision or blocker) is recorded above for
every route in the pinned commit. "Proposed Onzio table/field" and
"entitlement/module" mappings are intentionally left for `DCFC-102` (reusable
platform gap analysis) and `DCFC-103` (architecture lock), which compare this
inventory against Onzio's existing schema/registries rather than inventing
new tables here.
