# Onzio Platform Handoff

Last updated: 2026-07-31

## Open Platform Findings

`docs/platform-findings.md` is the durable register of platform-wide issues
that have been verified but not fixed. Read it before working in the areas it
names. As of 2026-08-01 it holds three open findings and three resolved. No
open finding affects a live site.

- **PF-005 and PF-006** — **resolved 2026-08-01, together.** Rose City's
  homepage hero video pointed at the legacy Supabase project
  `nsgtkwqkbyxkiwrhzsje`, permanently deleted during the Phase 8 closeout,
  so the hero had silently been showing only its static poster. Christian
  chose to remove the dead video and keep the poster as the intended hero;
  the source file remains recoverable from the frozen export if video is
  ever wanted back. PF-006 — that nothing checked whether code still
  referenced deleted infrastructure — is closed by a new architecture
  contract, `references no permanently deleted Supabase project`, which on
  its first run immediately caught eleven further dead `remotePatterns`
  entries in `next.config.mjs`. Full detail, including a behavior bug caught
  mid-change, is in the register.
- **PF-001** — **resolved 2026-08-01.** Phase 9's gate claimed Rose City
  rendered without tenant-specific presentation special cases; it did not.
  Investigation found the original entry undercounted (seven occurrences,
  not six — it missed `lib/flags.ts:51`) and wrongly described the branches
  as working, since `Hero.tsx`'s gated content is dead (PF-005). Per
  Christian's decision the gate was amended to state its true achieved
  scope, and the one dead branch — `ShopHero` in
  `app/(public)/shop/page.tsx`, unreachable because `SHOW_SHOP_HERO` is the
  constant `false` — was deleted. Six documented legacy branches remain, now
  recorded as debt in the plan rather than contradicted by it. Extraction
  was deliberately not undertaken: it is not one refactor but a deletion, a
  blocked branch, one clean template extraction, and three new content
  domains.
- **PF-002** — three parallel entitlement sources of truth
  (`club_has_feature`, `ADMIN_TABLE_FEATURES`, `moduleRegistry`), with
  confirmed `shop` and `seasons` contradictions. Latent: needs a club that is
  both Starter tier and publicly live, which no seeded club currently is.
- **PF-003** — the tier/feature entitlement mechanism is undocumented in the
  platform plan, which is why PF-002-class bugs keep nearly shipping.
- **PF-004** — the Bunny.net video reference deliberately deviates from the
  "content records reference media assets" principle; recorded for
  visibility, revisit in `DCFC-202`.

None of these are authorized to be fixed without their own scoped approval.

## Current State

The Diverse City FC Phase 0-3 planning packet is complete and ready for
Christian's review under `docs/phase-11/diverse-city/`. It defines the
agent-neutral epic, accepted and open decisions, initial route/content matrix,
visual acceptance contract, 14 dependency-scoped work packages, and a shared
status ledger. `AGENTS.md` and the new root `CLAUDE.md` now require every agent
to record package status, completed work, files changed, verification,
blockers, and the exact next step before ending. This checkpoint changed no
product code and mutated no hosted Supabase, Storage, Vercel, Stripe, DNS,
Auth, Resend, email, or club resource.

The packet does not start a production Phase 11 rollout or authorize work
beyond local Phase 0-3 preparation.

`DCFC-001` (Contact visual specification) is `complete`. Claude Code added
`/contact` to the isolated Diverse City snapshot
(`/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site`) using
the club's real, already-verified email/phone/social destinations from
`lib/site-data.ts` plus original headline/intro copy. `npm run typecheck` and
`npm run build` passed in the snapshot, and local desktop/mobile browser
checks found no console errors, broken images, or horizontal overflow.
Christian reviewed the page, asked for the location line to drop its
"— Chicago Area" suffix (now just "Schaumburg, Illinois"), and then approved
it in full. Decision `DCFC-D101` is now accepted and recorded in
`DECISIONS.md`.

`DCFC-002` (Tryouts) is `complete`, approved by Christian on 2026-07-31.
Claude Code added `/tryouts` with a status-aware hero
(`upcoming`/`open`/`closed`; shipped as `upcoming`, the honest current
state), an external registration CTA that reuses the same already-approved
temporary destination as the existing Special Olympics program page, and
honest "TBA" placeholders for location and cost — no registration fact was
invented. The CTA fails closed to a `mailto:` contact link when closed or
when no URL is set (both verified by temporarily toggling). Per Christian's
explicit direction, the primary nav was restructured: "Schedule" is now a
dropdown (Fixtures + Tryouts, mirroring the existing Programs dropdown
pattern via a shared generic open/close state), and "Contact" was added to
the primary nav after Store (previously footer-only), in addition to new
footer links. Christian's first review pass asked for the eyebrow/status
badge/"Take the field." headline line to be removed (headline is now the
single line "Join Diverse City FC," no trailing period), the Age Groups card
removed (row is now Location and Cost only), the Schedule/Programs dropdown
panels tightened (a fixed `min-w-64` was leaving large empty space for short
labels), the hero-to-cards vertical gap tightened (two paddings were
stacking), and the Location/Cost block realigned so it shrinks to its own
content on desktop instead of stretching across the full section width.
`npm run typecheck` passed throughout; `npm run build` passed after clearing
a stale `.next` cache caused by running build concurrently with the dev
server (a tooling artifact, not an application defect). Local desktop/mobile
browser checks confirmed every revision, no overflow, no console errors, no
broken images. Decision `DCFC-D102` is partially resolved: the CTA label,
temporary registration URL, navigation placement, and visual layout are
approved; the underlying age group/eligibility/date/location/cost facts
remain open, and `DCFC-D103` (single vs. multiple tryout events) remains
explicitly deferred to Phase 1. Full history is in
`docs/phase-11/diverse-city/STATUS.md`.

`DCFC-003` (visual freeze and approval) is `complete`. Claude Code gathered
every item on `VISUAL-ACCEPTANCE.md`'s evidence checklist for both routes
(HTTP 200, no console errors, no overflow at 1440x900/390px, positive image
dimensions, real-keyboard focus reaching a visible native outline, every
nav/footer link verified, external links confirmed as no-data-submission
anchors, and `noindex, nofollow` verified via both the response header and
page meta) and, with Christian's explicit approval, created one local git
commit in the snapshot repository —
`a0f9f0c201e7d0e54b821c22f8c60159798f7477`. Two honest gaps were recorded
rather than silently resolved: no FAQ content exists for Tryouts (none was
supplied), and there was no dedicated Dates detail card (dates were
acknowledged only in the intro paragraph's prose). Christian then asked for
the Dates gap to be closed: Claude Code added a dedicated Date detail card
(`TBA`, honest placeholder) alongside Location and Cost, and, with Christian's
explicit approval, created a second local commit —
`5bbdfa33d59163b218bbd33745f9cfd4a66d379f`, now the approved commit of
record. The snapshot repo has no configured remote; neither commit was or
could be pushed. Full evidence is in
`docs/phase-11/diverse-city/VISUAL-ACCEPTANCE.md`.

`DCFC-101` (field-level content and asset inventory) is `complete`. Claude
Code expanded `CONTENT-MATRIX.md` to field-level coverage for every route in
the pinned commit, reading the actual rendered source of each route rather
than assuming, and computing real `sha256` checksums for every referenced
media asset instead of leaving them as placeholders. The pass also documented
which Rose-City-inherited files/components are dead code not wired to any
current Diverse City route, so they aren't mistaken for the live content
source later. Two findings were flagged as needing Christian's explicit
confirmation — neither was invented or changed by this pass, both already
existed in the approved snapshot: (1) `DiverseLeagueStandings.tsx` hardcodes
a specific 10-row UPSL standings table with real-named opponent clubs and no
documented provenance, and (2) a "conference championships and national-stage
appearances" claim is repeated verbatim on both the About page and the Men's
Teams program page with no documented provenance. Both are now resolved:
Christian confirmed on 2026-07-31 that standings will be an admin-editable
domain (not a one-time import — the current table is placeholder/seed data
pending that admin capability), and that the championships claim needs no
further resolution right now. Full detail is in
`docs/phase-11/diverse-city/CONTENT-MATRIX.md`.

`DCFC-102` (reusable platform gap analysis) is `complete`. Claude Code
compared the approved specification against the actual current state of
`onzio-platform` — real schema, registries, and admin routes, not the
architecture plan's prose — and wrote the comparison to a new
`PLATFORM-GAP-ANALYSIS.md`. Notable findings: standings/homepage/About/Shop/
Sponsors/Roster/Branding all have existing tables and admin editors already
(directly matching Christian's standings confirmation above); dropdown
navigation and generic URL-protocol validation already exist platform-wide
with no new code needed; `tryouts` already has a registered route and
Pro-tier module entry but no schema, section type, or admin editor yet;
Programs and Contact are true gaps needing everything built from scratch;
and video capability is a genuine open question — the existing
YouTube-embed pattern doesn't cover Diverse City's self-hosted MP4 videos,
which is exactly what decision `DCFC-D105` needs to resolve. No club-specific
conditionals were proposed as a substitute for real reusable capability.
`DCFC-103` (lock content and presentation architecture) is now eligible, but
needs Christian's input on `DCFC-D104` (template mapping) and `DCFC-D105`
(video direction) before it can close. No hosted Supabase, Storage, Vercel,
Stripe, DNS, email, or production resource was mutated.

`DCFC-103` (lock content and presentation architecture) is `complete`,
approved by Christian on 2026-07-31 as decision `DCFC-D109`. **This closes
Phase 1 of the epic.** Its two deliverables are the normalized domain design
in `docs/phase-11/diverse-city/DOMAIN-DESIGN.md` (`onzio.programs`,
`onzio.contact_profile`, `onzio.contact_page_content`, `onzio.tryouts`) and
the new "Video Pipeline" section in `docs/onzio-platform-plan.md` recording
the Bunny.net Stream decision. Before approval, each of the design's
load-bearing claims was re-verified against real migration source rather
than the draft's own assertions — the `club_has_feature` Starter allowlist,
the pre-existing `onzio.site_social_links` table, `media_assets.surface`
being regex-constrained free-form rather than an enum, the absence of any
existing email/phone column, and the `homepage_hero_content` singleton
shape all confirmed. Two fixes were applied at Christian's direction:
`EPIC.md`'s pinned snapshot commit was corrected from the pre-`DCFC-003`
`08f7b53c…` to the approved `5bbdfa33…`, and an explicit column-constraint
policy was added to the design so `DCFC-202` is not left deciding lengths
and URL shapes ad-hoc while writing SQL. Writing that policy caught a real
latent bug: `homepage_hero_content` constrains CTA hrefs to internal paths
only (`^/[-A-Za-z0-9_/?#=&%.]*$`), and copying that pattern onto
`programs.external_cta_href` or `tryouts.registration_href` would have
rejected every external registration URL those columns exist to hold —
failing only when a club first saved a real partner link. Those columns now
mirror the `''`/local-path/`http:`/`https:`/`mailto:` allowlist already
enforced in `lib/admin-data-contract.ts`. No migration was written or
applied, no application code or test changed, and the isolated snapshot
repository was read but not modified (still clean at `5bbdfa3`).
`DCFC-201` (red contracts) is now `ready` but deliberately unassigned and
unstarted — eligibility is not authorization. No hosted Supabase, Storage,
Vercel, Stripe, DNS, email, or production resource was mutated.

`DCFC-201` (red contracts) is `complete` as of 2026-08-01, opening Phase 2.
It added 32 focused contracts across `tests/contracts/diverse-city-domains.test.ts`
and `tests/database/diverse-city-domains.test.ts` — 27 intentionally red, 5
green where they lock existing correct behavior. **The suite is now
deliberately red: `npm test` reports 27 failures, all in those two files.**
They describe the schema, RLS, tier gating, and presentation registrations
that `DCFC-202` and `DCFC-203` must build; per `AGENTS.md` they must not be
skipped, weakened, mocked, or satisfied with placeholder tables. All 549
previously-passing tests still pass (554 now, including the 5 new green
ones), so nothing regressed.

The package also seeded club `charlie` — Starter, active, and publicly live.
That combination existed nowhere before: Alpha and Lions are Pro, and Bravo
is Starter but onboarding/preview, so `can_read_club` rejects it before tier
is ever consulted. Without it the `DCFC-D108` tier coverage could not be
written, and it is the same gap that kept PF-002 invisible to the suite.
Eight database contracts were also caught passing as false greens — they
asserted only that an operation was rejected, and a missing table is itself a
rejection — so every negative assertion now names the specific PostgREST or
Postgres error code it expects (`42501` for a denial, `23514` for a check
violation, never `PGRST205`).

`DCFC-202` (schema, RLS, types, audit) is `complete` as of 2026-08-01.
`supabase/migrations/20260801120000_phase11_diverse_city_domains.sql` creates
`onzio.programs`, `onzio.contact_profile`, `onzio.contact_page_content`, and
`onzio.tryouts` exactly as `DOMAIN-DESIGN.md` specifies — composite
`(club_id, id)` uniqueness and tenant-safe composite foreign keys (including
`tryouts (club_id, program_id)` → `programs`, so a tryout cannot reference
another club's program), the approved column-length and href constraints, RLS
with four policies per table, audit and updated-at triggers, and
`(club_id, sort_order, …)` indexes. `club_has_feature` was additively extended
with `'contact'` per `DCFC-D108` while reproducing every security attribute of
the original definition. All four tables are registered in
`ADMIN_TABLE_FEATURES`, both contact tables in `SINGLETON_TABLES`, and
`lib/database.generated.ts` is regenerated.

All 17 database contracts pass, including the `DCFC-D108` tier behavior: an
anonymous reader of the Starter club `charlie` can read `contact_*` but gets
nothing from `programs`/`tryouts`, while the same reads succeed for a Pro
club.

**Suite status corrected 2026-08-01: the suite is GREEN, 581/581 across 57
files** — not the 3 intentional failures previously recorded here. Those three
(`academy@1` template, `programs`/`contact` routes, module entitlements) now
pass because `DCFC-203` implementation work was done in the working tree
**without a completion record**.

**`DCFC-203` is `in_progress`, not complete.** A 2026-08-01 audit verified the
registry work is real and good — `academy@1` with a `montserrat-inter-dmsans`
font pack and five `academy.*` sections mapping 1:1 onto `CONTENT-MATRIX.md`'s
homepage inventory, plus the `programs`/`contact` routes and `DCFC-D108`
entitlements — but found two gaps its own contracts do not cover:

1. **No pinned `academy@1` document contract.** `cinematic@1` and
   `clubhouse@1` each have one in
   `tests/contracts/presentation-system.test.ts`; `academy@1` does not, so
   nothing proves an `academy@1` document actually validates.
2. **A reachable font-pack bug.** `academy@1.compatibleFontPacks` includes
   `bebas-inter`, but `fontPacks["bebas-inter"].compatibleTemplates` omits
   `academy@1`. Template switching keeps the font pack by reading one list
   (`index.ts:839`) and validation then rejects the document by reading the
   other (`index.ts:701`), so `switchTemplate` emits a document that fails its
   own validation. Only `academy@1` is affected; the other three templates are
   bidirectionally consistent.

Full evidence, reproduction, and the recommended fix direction are in the
2026-08-01 audit record in `docs/phase-11/diverse-city/STATUS.md`.

`DCFC-202` also closed **PF-003** — `docs/onzio-platform-plan.md` now
documents the tier-entitlement mechanism under Row-Level Security: the
hardcoded Starter allowlist, Pro-by-default for unlisted feature names, and
the fact that `can_read_feature` gates anonymous public reads so the failure
mode is a blank page rather than an error. **PF-004** remains open and was
not actionable in this package — it concerns the Bunny.net video reference
column, which this migration does not add.

The Lions mockup conversion `/goal` is complete locally. The current Lions
public site uses the reusable published `clubhouse@1` presentation-template
boundary, editable Onzio content rows, Onzio media paths, the imported
homepage slideshow, inverse crest, and the three-jersey shop collection from
the mockup. No hosted project was mutated.

Final Lions roster QA and commit-packaging checkpoint:

- Updated the reusable Clubhouse roster cards so every Lions player and staff
  card renders its editable `nationality` value as an inline flag. Lions uses
  the already-installed bundled flag-icon set, avoiding the legacy shared
  `flags` bucket; Rose City continues using its migrated tenant-scoped
  `onzio-media` flag paths.
- Lions player cards are now presentational `<article>` elements with no link,
  button, profile hint, click navigation, or modal behavior. Staff cards are
  likewise non-interactive. The existing player-detail route remains available
  as a reusable registered route but is no longer exposed from Lions roster
  cards.
- Added focused contracts for player/staff flag rendering, deterministic Lions
  nationality rows, non-interactive Clubhouse cards, and the prohibition on
  legacy flag-bucket URLs.
- Added a reusable Lions Playwright roster acceptance check. Desktop 1440 x
  900 and mobile 390 x 844 both passed with 32/32 player flags and 6/6 staff
  flags visible, zero player/staff card links or buttons, no click-triggered
  route or dialog change, no broken images, no old source/transform/Next image
  URLs, no horizontal overflow, no framework overlay, and no browser console
  or page errors.
- Final screenshots are outside the repository under
  `/Users/christianalcala/.codex/visualizations/2026/07/31/019fb9b8-8288-79a2-8ac9-f3572133c148/`
  as `lions-roster-final-desktop.png` and
  `lions-roster-final-mobile.png`.
- Final verification passed `npx tsc --noEmit`, 223/223 contracts, 18/18
  architecture tests, 53/53 local database tests, 548/548 complete tests,
  `npm run db:types:check`, local `onzio`/`onzio_private` schema lint,
  `npm run lint`, `git diff --check`, the two-view Playwright roster gate, and
  the production build with 25 generated pages. Lint/build retain only the
  same three pre-existing analytics `react-hooks/exhaustive-deps` warnings.
- No Diverse FC file or asset was changed or copied. No hosted Supabase,
  Storage, Vercel, Stripe, DNS/domain, Auth/SMTP, email, credential, source
  Lions object, or Rose City production resource was mutated.
- No final local Lions implementation blocker is known. Hosted publication and
  infrastructure remain outside scope and continue to require explicit
  approval.

Latest `/goal` progress:

- Verified the mockup red jersey source object read-only at
  `https://ydvggllbrswfchgjhjhr.supabase.co/storage/v1/object/public/assets/onzioMockupsAssets/red-jersey-transparent.png`
  and copied it into the organized local asset folder as
  `/Users/christianalcala/Downloads/lionsFCAssets/Jersey/red-jersey-transparent.png`.
  The local file is PNG RGBA, 1402 x 1122, SHA256
  `4583de144d47b3a328eaebad5f69ad0d5ed4be7d59affed8f64eebdb2d2ad81c`.
- Added migration
  `supabase/migrations/20260730020818_phase9_shop_third_kit_variant.sql`,
  expanding `shop_kit_section`, `shop_kit_photos`, and
  `shop_carousel_photos` `kit_variant` constraints to
  `home|third|away`.
- Updated the Lions media planner/importer and checked-in
  `docs/phase-9/lions-media-import-plan.json` for all 10 organized assets:
  two crests, five slideshow photos, and three jerseys.
- Local Lions import now creates 10 `media_assets`, 5 homepage slideshow
  photos, 3 shop kit photos, 3 shop carousel photos, 13 ready content links,
  0 blocked content links, 10 source checksums, 10 normalized checksums, and
  14 tenant-scoped media relationships.
- Restored the homepage kit copy to the three-color mockup direction and
  renders Blue, Red, and White jerseys on the homepage and shop page.
- Updated the admin shop editor to expose Home, Third, and Away kit tabs while
  preserving the tenant request boundary and avoiding direct `club_id` payload
  acceptance in admin schemas.
- Removed the last direct `next/image` usage from the Clubhouse public routes
  so public images flow through the resilient image component contract.
- Updated the Clubhouse homepage display headings and roster page after
  re-checking the live `soccer-platform-mockups.vercel.app` reference. The
  reference uses Geist with tight negative display tracking
  (`letter-spacing` around `-0.055em`) and the roster surface uses the mockup's
  `roster-page`, `roster-filter-bar`, `player-card`, and `staff-card` layout
  rather than the earlier Onzio hero/overview roster layout.
- Added migration
  `supabase/migrations/20260730015524_phase9_site_branding_inverse_logo.sql`
  with `site_branding.inverse_logo_path` and `inverse_logo_asset_id`, including
  a composite `(club_id, inverse_logo_asset_id)` FK to `media_assets`.
- Regenerated `lib/database.generated.ts` from the local schema and updated
  `DBSiteBranding`, `fetchClubBranding`, and `ClubBrandingProvider` to expose
  both the primary crest and inverse crest.
- Updated the Lions media dry-run planner and checked-in
  `docs/phase-9/lions-media-import-plan.json` so `crest-white.png` is a ready
  `site_branding` content link instead of a blocked secondary-branding gap.
  The plan now reports 11 ready links, 0 blocked links, and hosted mutations 0.
- Updated `npm run migration:import:lions-media:local` to upsert the Lions
  white crest into `site_branding.inverse_logo_*` and reconcile it as a
  tenant-scoped media relationship. Reconciliation now proves 12 linked media
  relationships.
- Updated the Clubhouse footer and admin branding preview to prefer the
  inverse crest on dark backgrounds, falling back to the primary crest when a
  tenant has no inverse crest.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed. The only source-project access was read-only
  public object verification/download of the red jersey.

Verification for the completed Lions mockup conversion:

- `npm run db:reset` passed locally and applied
  `20260730015524_phase9_site_branding_inverse_logo.sql` and
  `20260730020818_phase9_shop_third_kit_variant.sql`.
- `npm run db:types` regenerated `lib/database.generated.ts` from the local
  schema.
- `npm run migration:plan:lions-media -- ... --dry-run` regenerated the local
  plan with 10 assets, 13 ready content links, 0 blocked content links, and
  `hostedMutations: 0`.
- `npm run migration:import:lions-media:local` passed twice after reset. The
  final two idempotency runs both reused all 10 uploaded objects and reconciled
  10 media assets, 5 slideshow photos, 3 shop kit photos, 3 shop carousel
  photos, 13 ready links, 0 blocked links, 14 relationships, zero forbidden URL
  references, and `hostedMutations: 0`.
- Direct local Postgres verification confirmed the Lions `site_branding` row
  has both primary and inverse Onzio media paths and both media asset IDs.
- Playwright verification at `http://lions.localhost:3002/` and
  `http://lions.localhost:3002/shop` confirmed the footer uses the inverse
  crest asset `2eea11ef-0658-5633-9a59-74d570f300d6`, the homepage renders
  three kit products and "Three colors" / "Red Jersey" copy, the shop renders
  three product cards for Blue, Red, and White jerseys, no
  preview/sample/admin-preview copy, no old source URLs, no Supabase transform
  or `/_next/image` URLs, no broken visible images, and no horizontal overflow
  on desktop and mobile.
- Screenshots were saved outside the repo as
  `lions-clubhouse-third-kit-home-desktop.png`,
  `lions-clubhouse-third-kit-home-mobile.png`,
  `lions-clubhouse-third-kit-shop-desktop.png`, and
  `lions-clubhouse-third-kit-shop-mobile.png`.
- Playwright comparison against
  `https://soccer-platform-mockups.vercel.app/roster` and local
  `http://lions.localhost:3004/roster` confirmed the local roster now uses the
  mockup roster classes, Geist typography, 4 roster groups, player/staff card
  layout, no old source URLs, no image transforms, no broken visible images,
  and no horizontal overflow on desktop and mobile. Screenshots were saved as
  `live-mockup-roster-desktop.png`, `local-onzio-roster-desktop.png`, and
  `local-onzio-roster-mobile.png`.
- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/lions-media-import-plan.test.ts tests/contracts/lions-media-local-import.test.ts`
  passed 7/7.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- `npm run test:contracts` passed 220/220.
- `npm run test:architecture` passed 18/18.
- `npm run test:db` passed 53/53.
- `SUPABASE_TEST_*` loopback env `npm test` passed 544/544.
- Production build with loopback Supabase env passed.

Updated remaining `/goal` work:

- No remaining `/goal` implementation work is known for the local Lions mockup
  conversion. Production/hosted import, publication, DNS, Stripe, SMTP, and
  Rose City migration work remain outside this goal and still require explicit
  approval.

Previous `/goal` progress:

- Added the two remaining `soccerPlatformMockups` detail surfaces as reusable
  Onzio-backed Clubhouse routes:
  `/roster/[playerId]` and `/schedule/[fixtureId]`, with tenant re-exports at
  `/_clubs/[slug]/roster/[playerId]` and
  `/_clubs/[slug]/schedule/[fixtureId]`.
- Updated tenant middleware to rewrite public dynamic UUID paths for roster
  profiles and schedule match areas while preserving the tenant request
  boundary.
- Added `components/ClubhousePlayerProfilePage.tsx`, backed by editable
  Onzio `players`, active-season player stats, and player match-trend rows.
  Roster cards now link to stable player UUID detail paths.
- Added `components/ClubhouseMatchAreaPage.tsx`, backed by editable Onzio
  `matches` rows and media-resolved opponent/sponsor references. Schedule
  cards now link to stable match UUID detail paths while keeping directions as
  a secondary action.
- Carried `matches.id` through the public `Fixture` query mapping and added
  focused `fetchPlayerProfile` / `fetchFixtureById` helpers.
- Added a contract assertion that local Lions import rows expose UUID-safe
  player and match route params.
- Route inventory against `soccerPlatformMockups` is now covered by Onzio Pro
  equivalents: home, roster, roster detail, schedule, schedule detail, shop
  for mockup store, club/about for mockup club, sponsors, staff redirect, and
  stats.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the detail-route checkpoint:

- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/lions-media-local-import.test.ts` passed
  4/4.
- `npm run migration:import:lions-media:local` passed locally with
  uploaded 0/reused 9 assets, 32 players, 4 matches, 1 published
  `clubhouse@1` presentation document/state/publication, zero forbidden URL
  references, and `hostedMutations: 0`.
- Playwright verification discovered real detail links from `/roster` and
  `/schedule`, then confirmed `/roster/{player_uuid}` and
  `/schedule/{match_uuid}` on desktop and mobile with no preview/sample/admin
  copy, no old `ydvggllbrswfchgjhjhr` URLs, no Supabase transform or
  `/_next/image` URLs, no broken visible images, no horizontal overflow, and
  visible profile/stats/match-info/back-link content.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-player-detail-desktop.png`,
  `lions-clubhouse-player-detail-mobile.png`,
  `lions-clubhouse-match-detail-desktop.png`, and
  `lions-clubhouse-match-detail-mobile.png`.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- `npm run test:contracts` passed 220/220.
- `npm run test:db` passed 53/53.
- Production build with loopback Supabase env passed and now includes
  `/_clubs/[slug]/roster/[playerId]`, `/_clubs/[slug]/schedule/[fixtureId]`,
  `/roster/[playerId]`, and `/schedule/[fixtureId]`.

Previous `/goal` progress:

- Added standalone Lions Pro public routes from the mockup:
  `/sponsors`, `/stats`, and `/staff`. Middleware now exposes these tenant
  paths and the `/_clubs/[slug]/*` re-export files are in place.
- Added `components/ClubhouseSponsorsPage.tsx`, backed by editable
  `site_sponsor_logos` rows. It renders the mockup-style "Backing the badge /
  Building the city" hero plus Title/Premier/Club partner tiers. The current
  Lions local rows map 1 title partner, 2 premier partners, and 3 club
  partners from the existing carousel/footer placements.
- Added `components/ClubhouseStatsPage.tsx`, backed by existing Onzio
  `fetchRoster` season-stat rows and `fetchSchedule` match rows. It renders the
  mockup-style "Form / Measured" hero, record/goals/clean-sheet overview, and a
  sortable player-leaders table. The mobile table was tightened after screenshot
  review so all columns fit in the viewport without horizontal scrolling.
- Added `/staff` as a redirect to `/roster#staff`, matching the mockup product
  behavior while preserving the roster page as the editable staff presentation
  surface.
- Playwright verification at `http://lions.localhost:3002/sponsors` confirmed
  6 sponsor cards across Title/Premier/Club tiers on desktop and mobile, no
  preview/sample/admin-preview copy, no old `ydvggllbrswfchgjhjhr` source URLs,
  no Supabase transform or `/_next/image` URLs, no broken visible images, and
  no horizontal overflow.
- Playwright verification at `http://lions.localhost:3002/stats` confirmed the
  Form/Measured hero, 4 overview tiles, 18 player-leader rows on desktop and
  mobile, no preview/sample/admin-preview copy, no old source/transform URLs,
  no broken visible images, and no horizontal overflow.
- Playwright verification at `http://lions.localhost:3002/staff` confirmed a
  redirect to `http://lions.localhost:3002/roster#staff`.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-sponsors-desktop.png`,
  `lions-clubhouse-sponsors-mobile.png`,
  `lions-clubhouse-stats-desktop.png`, and
  `lions-clubhouse-stats-mobile.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the standalone Pro route checkpoint:

- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 220/220.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and now includes
  `/_clubs/[slug]/sponsors`, `/_clubs/[slug]/staff`,
  `/_clubs/[slug]/stats`, `/sponsors`, `/staff`, and `/stats`.

Updated remaining `/goal` work:

- Replace remaining `club.slug === "lions"` rendering gates with true
  presentation-template resolution at the tenant request boundary so
  `clubhouse@1` becomes a reusable selected presentation template instead of a
  tenant-name branch.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.

- Added `components/ClubhouseAboutPage.tsx` and routed only the Lions tenant
  through it from `/_clubs/[slug]/club/about` (and therefore
  `http://lions.localhost:3002/club/about` through tenant routing). The route
  uses existing editable Onzio `about_page_content` and `site_sponsor_logos`
  rows, rendering the mockup-style interior hero, manifesto/founding mark,
  mission quote, values/proof section, partner strip, and CTA. Rose City
  continues to use the legacy `AboutClubPageClient`.
- The mockup's disabled concept contact form and "messages are not sent" copy
  were intentionally not carried over.
- Playwright verification at `http://lions.localhost:3002/club/about`
  confirmed the route renders the Columbus hero, Lions story, 3 editable value
  rows, 3 carousel partner rows, no preview/sample/admin-preview/contact-demo
  copy, no old `ydvggllbrswfchgjhjhr` source URLs, no Supabase transform or
  `/_next/image` URLs, no broken visible images, and no horizontal overflow on
  desktop or mobile. The mobile hero type was tightened after screenshot review
  so the headline no longer clips.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-about-desktop.png` and
  `lions-clubhouse-about-mobile.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the about checkpoint:

- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 220/220.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with the same analytics hook warnings.

Updated remaining `/goal` work:

- Add standalone sponsors/staff/stats public routes after confirming the
  platform route/entitlement/data contracts. Roster now includes technical
  staff and about/home/footer include sponsors, but standalone mockup routes are
  not yet added.
- Replace remaining `club.slug === "lions"` rendering gates with true
  presentation-template resolution at the tenant request boundary.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.

- Added deterministic Lions roster/staff rows to the local-only Lions importer.
  `npm run migration:import:lions-media:local` now upserts 32 editable
  `players`, 28 `player_season_stats`, 4 `goalkeeper_season_stats`, and 6
  `staff` rows derived from the Lions mockup config, without adding schema and
  without hosted mutations.
- Added `components/ClubhouseRosterPage.tsx` and routed only the Lions tenant
  through it from `/roster`. The route uses existing Onzio `fetchRoster` and
  `fetchStaff` data, rendering a mockup-style dark hero, roster overview,
  grouped navy/red player cards, and technical staff cards. Rose City continues
  to use the legacy roster page.
- Updated the Lions local import contract so roster/staff counts are part of
  deterministic row generation and reconciliation.
- Local import reconciliation passed with `uploaded: 0`, `reused: 9`,
  9 media assets, 5 slideshow rows, 2 kit rows, 4 matches, 32 players,
  28 field stat rows, 4 goalkeeper stat rows, 6 staff rows, 6 sponsor rows,
  zero forbidden URL references, and `hostedMutations: 0`.
- Playwright verification at `http://lions.localhost:3002/roster` confirmed
  the route renders 32 player cards and 6 staff cards on desktop and mobile,
  with Goalkeepers/Defenders/Midfielders/Forwards/Technical Staff groups, no
  preview/sample/admin-preview copy, no old `ydvggllbrswfchgjhjhr` source URLs,
  no Supabase transform or `/_next/image` URLs, no broken visible images, and
  no horizontal overflow.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-roster-desktop.png` and
  `lions-clubhouse-roster-mobile.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the roster checkpoint:

- `npx vitest run tests/contracts/lions-media-local-import.test.ts` passed 4/4.
- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 220/220.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with the same analytics hook warnings.

Updated remaining `/goal` work:

- Convert club/about to the mockup `ClubScreen` composition using existing
  editable about/story rows.
- Add sponsors/staff/stats public routes only after confirming the platform
  route/entitlement/data contracts for those surfaces; roster now includes
  technical staff, but `/staff` as a standalone mockup route is not yet added.
- Replace remaining `club.slug === "lions"` rendering gates with true
  presentation-template resolution at the tenant request boundary.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.

- Added `components/ClubhouseSchedulePage.tsx` and routed only the Lions tenant
  through it from `/schedule`. It uses existing Onzio `seasons` and `matches`
  rows, with the mockup-style schedule hero, status filters, month rail, and
  match cards. Rose City continues to use the legacy schedule page.
- Added `components/ClubhouseShopPage.tsx` and routed only the Lions tenant
  through it from `/shop`. It uses existing editable Onzio shop kit rows/media,
  with the mockup-style store campaign, featured kit, catalog cards, service
  strip, and product modal. The public mockup's "Concept preview" purchase
  copy was intentionally not carried over.
- Cleared the generated `.next` cache during verification after the dev server
  hit stale missing vendor chunks. No source files were removed by that cleanup.
- Playwright verification at `http://lions.localhost:3002/schedule` confirmed
  the route renders the `clubhouse` schedule surface, 2 match cards, 8 visible
  positive-dimension images on desktop, no broken visible images, no old source
  URLs, no Supabase transform or `/_next/image` URLs, no preview/sample/admin
  preview copy, and no horizontal overflow.
- Playwright verification at `http://lions.localhost:3002/shop` confirmed the
  route renders the `clubhouse` store surface, 2 kit cards, 8 visible
  positive-dimension images on desktop, no broken visible images, no old source
  URLs, no Supabase transform or `/_next/image` URLs, no preview/sample/admin
  preview copy, and no horizontal overflow.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-schedule-desktop-final.png` and
  `lions-clubhouse-shop-desktop-final.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the latest route checkpoint:

- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 220/220.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with the existing Supabase Edge-runtime warning and the same analytics hook
  warnings.

Updated remaining `/goal` work:

- Convert Lions roster/profile next. The current local Lions importer does not
  seed a full roster/staff dataset yet, so route parity will need either a
  Lions roster/staff content import from the mockup config into editable Onzio
  rows or a polished empty-state route until real club data is supplied.
- Convert club/about to the mockup `ClubScreen` composition using existing
  editable about/story rows.
- Add sponsors/staff/stats public routes only after confirming the platform
  route/entitlement/data contracts for those surfaces; avoid publishing
  sample-only analytics or staff content as production club content.
- Replace remaining `club.slug === "lions"` rendering gates with true
  presentation-template resolution at the tenant request boundary.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.

- Added `clubhouse@1` to `packages/presentation/index.ts`, including the
  Geist font pack, Lions mockup-derived homepage sections
  (`clubhouse.hero`, `clubhouse.slideshow`, `clubhouse.kits`,
  `clubhouse.partners`), Pro route/module support for staff/stats/profiles,
  and readiness logic that recommends `clubhouse@1` for clubs with a modest
  approved photo set.
- Added a pinned `clubhouse@1` contract document in
  `tests/contracts/presentation-system.test.ts` so the Lions mockup-derived
  template cannot regress into an unregistered tenant branch.
- Renamed the public Lions homepage extraction to
  `components/ClubhouseHomePage.tsx` and renamed the scoped CSS/classes from
  `lfc-*` to reusable `clubhouse-*` names while keeping Lions routed through
  this renderer locally.
- Converted the non-Rose-City homepage slideshow to the mockup's class-based
  matchday slideshow structure and styling, using the 5 imported Onzio
  slideshow assets and removing the extra season label that made it drift from
  the reference mockup.
- Kept the public site free of `Interactive concept preview`, `sample content
  only`, and public `Admin preview` copy. The local dev-only Next indicator is
  disabled through `devIndicators: false` in `next.config.mjs`; the Vercel
  analytics script is now production-only to avoid a local false 404.
- Final Playwright desktop/mobile verification at
  `http://lions.localhost:3002/` confirmed the hero starts at `top: 0`, fills
  the full viewport on desktop and mobile, the matchday slideshow renders
  full-width, there is no horizontal overflow, all visible images have positive
  natural dimensions, no old `ydvggllbrswfchgjhjhr`, Supabase transform, or
  `/_next/image` URLs render, and no preview/sample/admin-preview text appears.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-desktop-final-2.png` and
  `lions-clubhouse-mobile-final-2.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for this `/goal` checkpoint:

- `npm run migration:import:lions-media:local` passed idempotently with
  `uploaded: 0`, `reused: 9`, 9 media assets, 5 slideshow rows, 2 kit rows,
  11 relationships, zero forbidden URL references, and `hostedMutations: 0`.
- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/presentation-system.test.ts tests/contracts/homepage-slideshow.test.ts tests/contracts/lions-media-local-import.test.ts`
  passed 13/13.
- `npm run test:contracts` passed 220/220.
- `npm run test:architecture` passed 18/18.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with the existing Supabase Edge-runtime warning and the same analytics hook
  warnings.

Remaining `/goal` work:

- Convert the rest of the Lions public experience route-by-route from the
  mockup into editable Onzio-backed surfaces: roster/profile, schedule,
  store, club/about, sponsors, staff, and stats where data support exists.
- Replace the remaining `club.slug === "lions"` routing gates with an actual
  published presentation/template selection once the renderer integration
  resolves presentation documents at the tenant boundary.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.
- Run local DB/full-suite/build verification after the remaining routes are
  ported.

The local Lions homepage now uses `soccerPlatformMockups`
(`/Users/christianalcala/Downloads/onzioMockups`) as the visual source of
truth, with the extraction kept tenant-gated and editable through existing
Onzio data surfaces.

- Added `components/LionsProspectHomePage.tsx` and routed only `club.slug ===
  "lions"` through the mockup homepage order: hero, next match, matchday
  slideshow, kit collection, club story, and partners. Rose City keeps the
  existing homepage composition.
- Added Lions-only header/footer branches in `components/Nav.tsx` and
  `components/Footer.tsx` matching the mockup's crest-first, compact
  Home/Roster/Schedule/Shop navigation and typography-based partner/footer
  treatment.
- Added scoped `lfc-*` visual styles in `styles/globals.css` for the
  mockup-style next-match stage, kit runway, story section, partners, header,
  footer, and responsive mobile behavior.
- Updated the local-only Lions importer so the same idempotent command now
  seeds editable presentation rows for the mockup extraction: 2 seasons,
  4 matches, homepage hero copy, 5 slideshow photos, 2 jersey media rows,
  about/story content, 6 partner names, and social links.
- Updated `components/PhotoSlideshow.tsx` so the Lions/prospect slideshow is
  visible by default instead of relying on the legacy Rose City scroll reveal;
  Rose City still keeps the legacy reveal behavior.
- The local importer reconciliation now proves 9 media assets, 1 homepage hero
  row, 5 slideshow rows, 2 shop kit photos, 2 shop carousel photos, 4 matches,
  6 sponsor rows, 11 media relationships, zero old source/transform/Next image
  URLs, and `hostedMutations: 0`.
- Final desktop/mobile Playwright verification at
  `http://lions.localhost:3002/` confirmed hero, next match, slideshow, kit,
  story, and partners all render; no League Standings/Behind the Rose leakage;
  and zero `ydvggllbrswfchgjhjhr`, Supabase transform, or `/_next/image` URLs.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-mockup-extraction-desktop-final.png` and
  `lions-mockup-extraction-mobile-final.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for this soccerPlatformMockups extraction:

- `npm run migration:import:lions-media:local` passed idempotently with
  `uploaded: 0`, `reused: 9`, and `hostedMutations: 0`.
- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/homepage-slideshow.test.ts tests/contracts/lions-media-local-import.test.ts`
  passed 6/6.
- `npm run test:contracts` passed 219/219.
- `npm test` passed 542/542 when run with loopback Supabase test env.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with only the same analytics hook warnings.

Remaining visible/content gap:

- The liked mockup has a third red jersey card, but Christian's organized
  `lionsFCAssets` folder currently contains only blue and white jerseys. Add
  `red-jersey-transparent.png` to the organized source folder and extend the
  import plan/kit rendering when true three-kit parity is required.

The LionsFC homepage first section now matches the prospect-template direction
locally while keeping content editable and preserving the legacy Rose City
video hero.

- Added the tenant-scoped `onzio.homepage_hero_content` table in
  `supabase/migrations/20260729223334_phase9_homepage_hero_content.sql`,
  with explicit grants, RLS policies, audit trigger, and updated-at trigger.
  The table stores first-section headline, intro, and CTA copy. It is a
  homepage feature surface: anonymous users can read it only for publicly
  accessible clubs, and authenticated mutations remain behind the existing
  tenant/MFA/admin authorization path.
- Registered `homepage_hero_content` in the admin data contract and singleton
  handling, added a Hero tab to `/admin/homepage`, and updated
  `fetchHomepageContent` so public/admin homepage queries return hero,
  slideshow, and Behind the Rose content together.
- Updated `components/Hero.tsx` so Rose City keeps the existing video hero,
  while non-Rose-City tenants render a crest-led prospect-style first section
  using tenant colors, imported crest media, editable hero copy, and editable
  CTA labels/links.
- Seeded Lions locally with the prospect-template copy:
  `Capital City.` / `Roar as One.`, intro copy for Columbus, and CTAs to
  `/schedule` and `/roster`.
- Re-ran the local-only Lions importer after a loopback Supabase reset. The
  second idempotency run reported `uploaded: 0`, `reused: 9`, 9 media assets,
  1 homepage hero row, 5 slideshow rows, 2 shop kit photo rows, 2 shop carousel
  rows, zero forbidden old source/transform URLs, and `hostedMutations: 0`.
- Local visual verification used a dev server on port 3002 with
  `ONZIO_LOCAL_TENANT_SLUG=lions`. Desktop verification of
  `http://lions.localhost:3002/` found the Lions first-section copy, 9 visible
  local `onzio-media` images, and zero `ydvggllbrswfchgjhjhr`, Supabase
  transform, or `/_next/image` URLs.
- Mobile verification at 390×844 confirmed the headline and CTAs fit inside
  the viewport with no horizontal overflow, the Lions crest hero renders, and
  old/transform/Next image URL counts remain zero.
- Updated screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-homepage-hero-updated.png` and
  `lions-homepage-hero-updated-mobile.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for this Lions editable hero pass:

- `npm run db:reset` passed against local loopback Supabase.
- `npm run db:types` passed and regenerated `lib/database.generated.ts`.
- `npm run migration:import:lions-media:local` passed twice; the second run
  proved idempotency with all 9 objects reused.
- `npx vitest run tests/contracts/lions-media-local-import.test.ts lib/__tests__/admin-data-contract.test.ts`
  passed 9/9.
- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 219/219.
- `npm run test:architecture` passed 18/18.
- Focused `tests/database/schema-rls.test.ts` passed 27/27.
- `npm run test:db` passed 52/52.
- `npm test` passed 542/542.
- `npm run db:types:check` passed.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with only the same analytics hook warnings.

Safest next step:

- Review the local Lions homepage at `http://lions.localhost:3002/`; if the
  first-section direction is approved, continue by adding the remaining
  Lions editable content rows for schedule, roster, about/story, sponsors, and
  standings using the same local-only import/reconciliation pattern.

The local-only LionsFC tenant/media import is implemented and verified against
loopback Supabase with no hosted mutation.

- Added local import/reconciliation logic in
  `lib/migration/lions-media-local-import.ts` and CLI
  `scripts/import-lions-media-local.ts`, exposed as
  `npm run migration:import:lions-media:local`.
- The importer consumes the checked-in Lions dry-run manifest and Christian's
  organized local source folder at `/Users/christianalcala/Downloads/lionsFCAssets`.
  It requires `--execute-local --confirm-local` internally through the npm
  script, maps Supabase CLI loopback env values, refuses non-loopback Supabase
  URLs, and performs no hosted actions.
- Local Lions tenant identity:
  `9d292f0a-6f93-54b1-b21c-ce2d0af3afa7`, slug `lions`, hostname
  `lions.localhost`, `active`/`live`, Pro tier, with a local-only active
  subscription projection so anonymous public rendering is allowed by existing
  runtime-access/RLS contracts.
- Local import behavior:
  re-reads all 9 organized source assets, verifies source checksums, re-runs
  validation/normalization, verifies normalized checksums, uploads or reuses
  immutable objects in local `onzio-media`, upserts `media_assets`, and links
  `site_branding`, 5 `homepage_slideshow_photos`, 2 `shop_kit_photos`, and
  2 `shop_carousel_photos`.
- `crest-white.png` remains imported as a published branding media asset but
  intentionally unlinked because no supported secondary/dark crest schema field
  exists yet.
- `npm run migration:import:lions-media:local` was run twice successfully. The
  second run reported `uploaded: 0`, `reused: 9`, 9 media assets, 5 slideshow
  rows, 2 shop kit photo rows, 2 shop carousel rows, 10 linked relationships,
  zero forbidden old source/transform URLs, and `hostedMutations: 0`.
- Local visual verification used a dev server on port 3001 with
  `ONZIO_LOCAL_TENANT_SLUG=lions`. Curl with `Host: lions.localhost:3001`
  returned HTTP 200 and `x-onzio-cache-tenant:
  9d292f0a-6f93-54b1-b21c-ce2d0af3afa7`.
- Playwright verified `http://lions.localhost:3001/` rendered 8 visible
  local `onzio-media` images, including the crest and 5 slideshow photos, with
  zero old `ydvggllbrswfchgjhjhr`, Supabase transform, or `/_next/image` URLs.
- Playwright verified `http://lions.localhost:3001/shop` rendered 6 visible
  local `onzio-media` images for the default home kit. Clicking the Away tab
  rendered 4 visible instances of the white jersey object
  `7ea389f3-97d6-57da-8a53-5256c043168e.webp`, with zero forbidden URLs.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-homepage.png`, `lions-shop.png`, and `lions-shop-away.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for this local Lions import pass:

- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/lions-media-import-plan.test.ts tests/contracts/lions-media-local-import.test.ts`
  passed 7/7.
- `npm run test:contracts` passed 219/219.
- `npm run test:architecture` passed 18/18.
- First local DB/full-suite runs hit transient local Supabase Auth MFA
  challenge failures in `tests/database/authenticated-rls.test.ts`; rerunning
  the focused file passed 5/5, `npm run test:db` passed 51/51, and `npm test`
  passed 540/540.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with only the same analytics hook warnings.

Safest next step:

- Add explicit schema/support for a secondary or dark crest field if
  `crest-white.png` should be used by templates/navigation/footer, then build
  a staging importer using the same manifest/reconciliation pattern behind
  fresh explicit approval for any hosted tenant provisioning, Storage uploads,
  database writes, deployment, Stripe, DNS, Auth/SMTP, credential, or email
  action.

The first LionsFC Phase 9 media-import planning pass is complete locally with
no hosted mutation.

- Added a dry-run-only Lions media planner at
  `lib/migration/lions-media-plan.ts` plus CLI wrapper
  `scripts/plan-lions-media-import.ts`, exposed as
  `npm run migration:plan:lions-media`.
- Generated the checked-in planning artifact
  `docs/phase-9/lions-media-import-plan.json` from Christian's organized local
  asset folder under `/Users/christianalcala/Downloads/lionsFCAssets`
  (`Logos`, `Jersey`, and `Slideshow`).
- The artifact inventories the supplied `ydvggllbrswfchgjhjhr` source project,
  `assets` bucket, and `onzioMockupsAssets` prefix in read-only form; records
  byte size, detected MIME, dimensions, alpha, source checksum, normalized
  output metadata, destination UUID paths, and content-link intent.
- The dry run planned 9 media assets, 10 ready content links, 1 blocked content
  link, 4,195,648 source bytes, 853,838 normalized bytes, zero checksum
  mismatches, zero hosted mutations, and plan digest
  `09a050d11f6df4383c7a9358da53b95099292426be5388c31467db9c5d69524b`.
- The planning-only Lions tenant UUID used in the artifact is
  `9d292f0a-6f93-54b1-b21c-ce2d0af3afa7`. This is not a provisioned hosted
  tenant and must be replaced or explicitly accepted during a future approved
  non-production provisioning step.
- Reusable existing media capabilities: `buildStoragePath`, `parseStoragePath`,
  `validateMediaUpload`, `normalizePhoto`, `normalizeGraphic`,
  signed upload authorization, private staging/public media buckets,
  immutable `media_assets`, cleanup queue, and raw public object URL delivery.
- Current schema/API gaps for Lions import: `site_branding` supports only
  `club_logo_asset_id`, so `crest-white.png` has no supported secondary/dark
  logo field; and `publishAuthorizedMedia` publishes `media_assets` but does
  not transactionally link assets into branding, slideshow, or shop content
  tables. The organized `Jersey` folder contains two jerseys, so the dry-run
  plan maps blue as `home` and white as `away`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, or email was
  changed. The source Lions objects were not deleted.

Verification for this Lions planning pass:

- `npx vitest run tests/contracts/lions-media-import-plan.test.ts` passed 3/3.
- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 215/215.
- `npm run test:architecture` passed 18/18.
- `npm run lint` passed with the three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Initial plain `npm test` / `npm run test:db` failed because local Supabase
  test credentials were not mapped and the sandbox blocked Supabase CLI
  telemetry/env writes. After `npm run db:reset` and rerunning with loopback
  `supabase status -o env` values mapped into `SUPABASE_TEST_*`, the local DB
  suite passed 51/51 and the full suite passed 536/536.
- Production build with loopback Supabase env passed and generated 25 pages,
  with only the same three analytics hook warnings.

Safest next step:

- Decide whether to add explicit schema support for a secondary/dark crest
  before implementing the actual importer. After that, provision or identify a
  Lions tenant in an approved non-production environment, then build the
  importer against the existing private
  staging/validation/normalization/publication boundary. Any hosted source
  read with credentials, destination tenant provisioning, Storage upload,
  database write, deployment, Stripe, DNS, Auth/SMTP, credential, or email
  action still requires fresh explicit approval.

Phase 9.1 through 9.3 have started locally with no hosted or production
mutation.

- Added checked-in baseline inventories for Rose City `cinematic@1` and the
  read-only local Deportivo Olimpico snapshot `heritage@1` under
  `docs/phase-9/baselines/`.
- Added the internal `packages/presentation` boundary with schema parsing,
  neutral template registrations, section/route/module/font registries,
  semantic theme validation, production provenance rejection, template
  compatibility switching, readiness recommendations, and operator override
  records.
- Added the local Phase 9 migration
  `supabase/migrations/20260729040045_phase9_presentation_system.sql` for
  immutable `presentation_documents`, `presentation_state`, and append-only
  `presentation_publications`, including composite tenant pointers, public
  published-only document reads, member protected reads, service-role write
  boundary, immutable triggers, and generated database types.
- Local Supabase was reset only against the loopback development instance.
  No hosted Supabase, Vercel, Stripe, DNS/domain, Auth, email, credential, or
  production setting was changed.

Phase 8 operational closeout was executed under Christian's explicit approval
on 2026-07-28 and verified at `2026-07-29T01:37:37Z`.

- The immutable final frozen export at
  `/Users/christianalcala/Downloads/onzio-migration-private/rose-city-final-freeze-2026-07-27T2234Z-v2`
  remains the off-repository recovery record. All 586 ledger checksums pass.
  Its complete manifest records 24 tables, 209 rows, 14 Storage buckets, 557
  objects, 1,728,725,700 Storage bytes, three minimized Auth users, zero
  production mutations, and a passed secret scan.
- Legacy Vercel project `rose-city-website`
  (`prj_lMYzzUcUxR1iFwYTQZW71OYsgbv5`) was permanently deleted. Its immutable
  deployment now returns HTTP 410 and its final
  `rcfc-soccer-website.vercel.app` alias returns HTTP 404.
- Legacy Supabase project `Rose City Website`
  (`nsgtkwqkbyxkiwrhzsje`, East US) was permanently deleted. Its Supabase
  hostname no longer resolves.
- Current Onzio production was excluded from both deletions.
  `https://onzio-rcfc.vercel.app` still returns HTTP 200 and current production
  Supabase ref `ioalthwsdrlzrubomrow` remains reachable.
- The Rose City no-edit content freeze that began at
  `2026-07-27T22:34:39Z` is formally released as of
  `2026-07-29T01:37:37Z`. Christian Javier Alcala is the recorded
  administrator and this closeout record is the release notice; no email was
  sent.
- A daily abandoned-staging-media cleanup is defined for `10:00 UTC` in
  `vercel.json` at `/api/cron/media-cleanup`. The route requires Vercel's
  `CRON_SECRET`, reports incomplete cleanup as HTTP 500, and exposes no provider
  error details. A fresh sensitive `CRON_SECRET` is configured for Production
  only. Vercel Cron Jobs is enabled and shows the installed path with schedule
  `0 10 * * *` (`10:00 UTC`; Hobby execution has a one-hour window).
- The approved production activation first deployed commit `5bd6baa`. Live
  verification caught a pre-handler HTTP 500 because its cron bundle loaded
  `sharp` and the deployment lacked a loadable Linux libvips binary. Commit
  `a5ad8a0` moved cleanup into a sharp-free privileged module and added a
  regression contract. Ready production deployment
  `dpl_CVAdyYykHK47z6LdsYxmf9znWUqf` now serves
  `https://onzio-rcfc.vercel.app`: the site returns HTTP 200 and an
  unauthenticated cron request returns JSON HTTP 401.
- Activation verification on the corrected tree passed: 7/7 focused cron
  contracts, standalone TypeScript, 189/189 contracts, 18/18 architecture,
  48/48 isolated local database tests, 498/498 complete tests, lint, and the
  production build with 25 generated pages. Lint/build reported only the three
  pre-existing analytics hook warnings. After reconciling the production
  evidence back onto `staging`, the final branch-wide gate passed standalone
  TypeScript, 206/206 contracts, 18/18 architecture, 48/48 isolated local
  database tests, 524/524 complete tests, lint, and the same 25-page production
  build.

Under Christian's explicit approval,
`info@rosecityfutbolclub.com` was permanently removed from Onzio production
authentication. Before deletion it had one active Rose City owner membership,
one live session, one password identity, and one verified TOTP factor; it owned
no Storage objects, exports, or media records. Its membership was removed
before the Auth Admin deletion. Post-change verification found zero matching
Auth users, memberships, sessions, identities, and MFA factors.
`christianjavieralcala@gmail.com` remains the active Rose City owner. No email
was sent.

Under Christian's explicit domain-change approval,
`rosecityfutbolclub.com` and `www.rosecityfutbolclub.com` were removed from
Vercel and now return HTTP 404. The existing Vercel project retained project ID
`prj_I362ysmh9cse5cRxnL7db4dOhsEs`, was renamed to `onzio-rcfc`, and now has
one verified project-domain record: `onzio-rcfc.vercel.app`. Production
deployment `dpl_6QBiJ2CAN6opoNQJqVuxU3Q1YbrG` is `READY` and owns that
hostname. The Rose City production tenant's former apex row is inactive and
its primary row is now the verified `onzio-rcfc.vercel.app` hostname.
Production Supabase Auth uses the new Site URL and only the new recovery
callback entries. Existing live Stripe endpoint
`we_1TwEpdK6WajTkwHYD5SEYzXX` remains active with the same signing secret and
seven enabled events; only its URL changed to
`https://onzio-rcfc.vercel.app/api/stripe/webhook`. Focused monitor commits
`7c85567` (`staging`) and `10559e5` (`main`) use the new hostname. All eight
public/auth routes returned HTTP 200 and the final production media gate passed
4/4 on desktop and iPhone, including forced image-origin failure. GitHub
Actions run
[`30409932333`](https://github.com/404christiann/onzio-platform/actions/runs/30409932333)
then passed the same 4/4 checks from a clean runner against the new hostname.

The Phase 8 repository closeout is reconciled on `staging`. Frozen cutover
domains and the former owner remain only in an immutable historical manifest;
the current-state manifest records `onzio-rcfc.vercel.app`,
`christianjavieralcala@gmail.com` as the sole active owner, and the retired
domains/removed identity separately. The historical production import command
is a fail-closed tombstone with no credential, Supabase client, SQL, Storage,
or subprocess mutation path. Its invocation exits at the retirement guard
before reading inputs. Local replay remains loopback-only.

Closeout verification passed: 155/155 focused Phase 8 tests; 15/15 focused
local Auth/Stripe/Storage database tests; standalone TypeScript; 199/199
contracts; 18/18 architecture tests; 48/48 database tests; 517/517 complete
tests; lint; and the production build with 25 generated pages. Lint/build
reported only three pre-existing analytics hook warnings. No hosted database,
Storage, Vercel, Stripe, DNS/domain, Auth/SMTP, credential, or email mutation
was performed during repository closeout.

The approved site-wide image reliability change is implemented on `staging`.
Commits `6ca7a4a` and `6669b98` globally bypass runtime Next/Vercel image
optimization, route public and admin image consumers through raw resilient
delivery, add context-specific photo/person/shop/trophy/logo fallbacks, preserve
the existing normalized immutable upload boundary, and add architecture,
contract, and browser coverage. The production-shaped Rose City rehearsal was
replayed only into loopback Supabase: all 209 source rows and 515 normalized
media objects reconciled. Its six public routes plus the roster player modal
passed direct-image checks with positive visible `naturalWidth`, no
`/_next/image`, and no Supabase Image Transformation URLs on desktop and
iPhone viewports. Forced image-origin failure passed on both viewports with
deliberate fallbacks and no completed broken-image nodes. That gate caught one
additional real mobile defect: an animated sponsor logo could move into view
before native lazy loading began. Focused commit `bde1c5d` makes the small
normalized marquee logos eager and narrows modal checks to the modal boundary;
it is pushed to `staging`, and GitHub reports its Vercel build successful.
Final local verification: TypeScript passed; 196/196 contracts, 18/18 architecture tests,
48/48 database tests, and 514/514 complete tests passed; lint and the production
build passed with only three pre-existing analytics hook warnings. No hosted
database, Storage object, email, credential, or setting changed. Under
Christian's separate production approval, verified staging commit `bde1c5d`
was merged into default branch `main` as release commit `13f7d9f`; the release
tree is byte-for-byte identical to `staging`. Vercel rebuilt it with the
Production environment and made deployment
`dpl_GnHynFbtFXqbGhmKvgXJa8SLXoDJ` `READY` for the Rose City apex and `www`
domains. The site-media monitor is active on `main`, runs daily at `15:17 UTC`,
and supports manual execution. Its immediate production run passed 4/4 locally,
then GitHub Actions run
[`30408562137`](https://github.com/404christiann/onzio-platform/actions/runs/30408562137)
passed the same four checks from a clean runner in 1m57s: normal direct-image
health and simulated image-origin failure on desktop and iPhone. All six public
routes plus `/admin/login` and
`/admin/update-password` returned HTTP 200, and the new deployment had zero
error-level runtime logs in the post-deploy scan.

The roster-photo outage was traced to Vercel image optimization returning HTTP
402 while the underlying raw Supabase objects remained available. Roster player
and staff cards now try the Vercel-optimized image first, retry the same object
URL unoptimized, and show an accessible initials fallback only if the origin
also fails. Player cards now advertise the correct two-column mobile width
instead of `100vw`. Regression coverage includes the delivery state machine,
all roster card/modal consumers, responsive sizing, stable browser hooks, and a
scheduled/manual Playwright check that forces optimizer HTTP 402 and requires
positive image `naturalWidth` on desktop and iPhone viewports. Focused commit
`8dcd6ef` is pushed to `staging`, and GitHub reports its Vercel deployment
successful. Under Christian's explicit production approval, Vercel rebuilt the
same source commit against the Production environment and assigned the Rose
City domains to deployment `dpl_DgAjgXv6kdxoPQdoNNPiE5przVfi`, which is
`READY`. Verification: TypeScript passed; 192/192 contracts, 16/16 architecture
tests, 48/48 local database tests, and 508/508 complete tests passed; lint and
production build passed with only the seven pre-existing warnings; production
dependency audit reported zero vulnerabilities. The production forced-402
Playwright gate passed 2/2: desktop Chromium and the iPhone viewport scrolled
through every roster card, required a positive image `naturalWidth`, confirmed
raw `onzio-media` fallback, and opened a working player modal. A separate normal
Chrome check found 33 roster image nodes, zero completed broken images, no
framework error overlay, and no console errors. No production setting, database
record, email, or media object changed. GitHub's repository default branch
remains `main`; the original roster-only workflow has since been superseded by
the site-wide scheduled monitor in `7d68659`.

### Historical Phase 8 cutover and incident chronology

The remaining entries in this Current State section preserve the chronological
cutover, Auth-email, media, and recovery evidence. References to the former
custom domains, the deleted `info@rosecityfutbolclub.com` identity, the
built-in mailer, or an active rollback observation window describe the state at
that recorded checkpoint; they are not current configuration or instructions
to restore retired state.

Phase 8 production cutover is complete and accepted. The freeze began at
`2026-07-27T22:34:39Z`; all ten reviewed migrations, the authoritative
209-row/24-table source plan, 515 normalized immutable media assets, two
approved Auth/member identities, and both Rose City domains are present in
Onzio production. The apex and `www` domains now serve Onzio deployment
`dpl_75xrhi27MCgA5UDsQ6RhT6Ak4xrN`, which is `READY`. Public acceptance returns
HTTP 200 for `/`, `/roster`, `/schedule`, `/shop`, `/club/about`, `/club/logo`,
`/admin/login`, and `/admin/update-password`. The six-photo homepage slideshow
renders and advances, using raw production Supabase object URLs with Vercel
optimization and no Supabase runtime Image Transformations.

The approved live Stripe reconciliation is complete. The frozen
customer/subscription IDs match the canonical live objects. The subscription is
active, billed automatically at $75 USD/month through the Rose City-specific
Pro Price, is not scheduled to cancel, and its current paid period ends
2026-08-23 23:41:35 PDT. The customer and subscription now contain only the
approved `onzio_club_id` and `onzio_environment=production` metadata; the Price
was not changed. Canonical event `evt_1Txzz4K6WajTkwHYBzaweVRI` is recorded as
applied in the production ledger. The existing live webhook destination was
preserved in place, upgraded from six to the exact seven required events, and
uses the production signing secret. A canonical event resend returned HTTP 200;
the database retained exactly one applied ledger row and the same active Pro
projection.

Production password recovery now returns to the verified Rose City host instead
of the former `localhost:3000` default. The admin reset their password, signed
in, completed mandatory MFA, and reached the protected admin portal on
2026-07-27. Supabase independently records the new sign-in. The no-edit freeze
remains active while the unchanged legacy deployment/database are retained
read-only for the 7–14 day rollback window.

The subsequent Rose City owner recovery attempt exposed the remaining
production Auth-email gap: the built-in Supabase mailer reached its
project-wide two-email-per-hour limit. Resend SMTP through the shared
`auth.onziofutbol.com` sending subdomain is now the locked architecture and a
Phase 8 closeout prerequisite. The rollout is planned in
`docs/phase-8/resend-smtp-rollout.md`. The existing Resend Free account was
inspected read-only: the sole visible team is administered by
`christianjavieralcala@gmail.com`. Christian completed Resend MFA enrollment,
and its enabled state was verified read-only without inspecting authenticator
or recovery material. An erroneous `auth.onzio.com` entry was added under
separate approval based on stale architecture documentation. Christian then
confirmed that he does not own `onzio.com`; he owns `onziofutbol.com`, whose
authoritative nameservers are Vercel's. Under explicit correction approval,
erroneous Resend domain `9b89e2f5-c372-4785-9091-cb852e3a3d44` was deleted
and `auth.onziofutbol.com` was added as domain
`7514696d-f0be-453c-bf79-ff68d8dbdeb1` in North Virginia with sending enabled
and receiving disabled. Under separate DNS approval, Vercel published the
generated DKIM, return-path MX, SPF, and monitoring-only DMARC records.
Authoritative lookup returned all four exact values, and Resend now reports the
domain `verified` and ready to send. Under separate approval, one sending-only
credential restricted to `auth.onziofutbol.com` was created and installed only
in `Onzio Platform Staging`. Staging custom SMTP is enabled with sender
`Onzio Staging <staging@auth.onziofutbol.com>`, a 60-second per-user interval,
and the planned 30-email/hour rate limit. Under separate test approval,
staging sent invitations to `christianalcala3@yahoo.com` and
`calcala1@berkeley.edu`, then sent Berkeley recovery after the 60-second
cooldown. Resend reports all three messages `delivered`; no body, link, token,
or mailbox content was opened during provider inspection. Christian confirmed
both providers received their messages. The dashboard-generated Berkeley
recovery then failed with Vercel staging protection plus Supabase
`access_denied` / `otp_expired`; no password changed. This is a staging
callback/link-consumption failure, not an SMTP-delivery failure. Christian then
opened the Berkeley invitation, which confirmed the temporary identity but
landed on Vercel's protected login/SSO path and ultimately a Not Found page
instead of an Onzio acceptance route. The invitation URL used Supabase's
implicit-flow fragment and was accidentally exposed during troubleshooting.
The exact staging session was immediately deleted from `auth.sessions`; an
independent follow-up query returned zero matching sessions and zero matching
refresh tokens. The already-issued signed access JWT retains only its original
one-hour validity window; it cannot refresh, and the temporary user has no club
membership or tenant role. The user must authenticate again before any future
test. No production SMTP, Auth identity, session, template, credential, email,
or production-secret mutation occurred.

The staging callback defect is now corrected in commit `92038d4`. Invite and
recovery templates use one-time token hashes instead of implicit-flow bearer
fragments, the server callback allowlists supported OTP types and exchanges the
token hash before routing invite/recovery users to the password-update page,
and invalid, expired, forged, or unsupported links fail closed. Deployment
`dpl_GJbEfRwSagF6gNt2ESqwPSxZuzua` is `READY`; both
`alpha-onzio-staging.vercel.app` and `bravo-onzio-staging.vercel.app` point to
it. Both tenant login pages expose the recovery control, and a live forged
Alpha recovery callback returned to
`/admin/login?error=invalid_auth_link` with the safe invalid/expired message.
The hosted invite and recovery templates were saved and reload-verified. Under
fresh explicit approval, Alpha then sent exactly one replacement recovery to
`christianalcala3@yahoo.com`; the application confirmed the request and Resend
reported the message `delivered`. Its provider detail, body, and reset URL were
not opened. Christian opened the newest message, completed recovery and
password sign-in, and reached the expected membership gate. A read-only check
confirmed the Yahoo Auth identity was verified and had signed in but had no
club membership. Under explicit approval, the direct operator workflow added
it as an active Alpha staging admin and wrote the matching `membership_added`
audit event. The membership and audit rows were read back successfully; no
production data changed. Christian must now refresh or sign in again, complete
mandatory MFA, and confirm protected-admin access. Christian then confirmed the
protected admin loaded. A final read-only query verified the Yahoo identity is
still an active Alpha admin, has one verified TOTP factor, and has
TOTP-authenticated session claims. The complete staging
delivery/callback/password/MFA/admin acceptance gate is green.

Under fresh explicit approval, a distinct production Resend credential was
created and installed only in `Onzio Platform Production`. Credential
`2966af9b-4c39-426d-9ef9-bae68f6b7af6` is labeled
`onzio-production-supabase-auth-2026-07-27`, has sending-only permission, is
restricted to `auth.onziofutbol.com`, and showed zero uses after configuration.
Production custom SMTP is enabled with sender
`Onzio Accounts <no-reply@auth.onziofutbol.com>`, host `smtp.resend.com`, port
465, username `resend`, a 60-second per-user interval, and the planned
30-email/hour Auth limit. Reloaded non-secret settings matched. The one-time
credential value was transferred directly into encrypted Supabase settings,
was not recorded, and was released from the browser session. No production
email was sent during configuration, and the existing Resend Free plan was
unchanged. Under a later fresh approval, the Rose City production login sent
exactly one recovery to `christianjavieralcala@gmail.com`. The application
confirmed the request and Resend reported message
`c1eefc25-9813-45c4-8618-b695a06279a7` as `delivered`. Its provider detail,
body, and reset URL were not opened. Christian must open only the newest
message and complete password update, password sign-in, existing MFA, and
protected-admin acceptance. Christian opened the message, but Supabase sent
the one-time PKCE code to the Rose City Site URL root instead of the application
callback. The resulting URL was exposed during troubleshooting and will not be
reused; no password changed. Read-only inspection found the exact mismatch:
production allows only
`https://www.rosecityfutbolclub.com/admin/auth/callback?next=/admin/update-password`,
while the expected secure build `92038d4` requests a clean callback. Under
fresh approvals, the clean `www` and apex callbacks were added without removing
the legacy `www` entry; reload verification showed all three exact URLs. Two
separately approved replacement recoveries were delivered as messages
`b5a963f7-1a9d-4798-8cdb-7259ba86eea0` and
`0150522c-c688-4ae7-a132-314768c2878f`, but each again landed at the Site URL
root. Their exposed codes will not be reused and no password changed.

Deeper read-only inspection found the actual production deployment is still
commit `21de7e7` (`Record Phase 8 production preflight`), not secure callback
commit `92038d4`. Its public login bundle requests the query-bearing callback
from `window.location.origin`; because production login remains on the apex,
the actual request is
`https://rosecityfutbolclub.com/admin/auth/callback?next=/admin/update-password`,
which is not one of the three allowlisted URLs. Vercel independently shows
`21de7e7` as the current Production deployment and `92038d4` as a Ready Preview
deployment. No further email was sent during diagnosis. Under fresh explicit
approval, Vercel rebuilt `92038d4` against the current Production environment
and made deployment `dpl_HY46CQoAJ7yJsXP8xkUmSp8pY9kC` the Ready Production
deployment for the Rose City domains. The live public bundle
`page-b4ac05e6e0af23ec.js` now requests the clean callback derived from
`window.location.origin` and contains the production Supabase project
`ioalthwsdrlzrubomrow`. A live forged recovery callback failed closed at
`/admin/login?error=invalid_auth_link` with the safe invalid/expired message.
No recovery email was sent during deployment or verification. Any additional
recovery requires separate approval. Under a later fresh approval, the corrected
Production login sent exactly one new recovery to
`christianjavieralcala@gmail.com`. The application confirmed the request and
Resend reported message `039ab441-55ca-4627-b5d4-2519eaeb966e` as `delivered`;
its provider detail, body, and action URL were not opened. Christian used only
that newest message and confirmed he reached the protected admin portal. A
final read-only Supabase check matched production operator UUID
`199d8437-1237-4098-99dd-8b089411255e`, showed the user updated at 00:26 PDT
and last signed in at 00:25 PDT on 2026-07-28, and retained the MFA-factor
management boundary. The corrected Production
delivery/callback/password/sign-in/MFA/admin acceptance gate is green.

Under fresh explicit approval, the corrected Production login then sent
exactly one Rose City owner recovery to `info@rosecityfutbolclub.com`. The
application confirmed the request and Resend reported message
`d2784583-1e6e-46a5-8fe7-502b168a88b8` as `delivered`; its provider detail,
body, and action URL were not opened. Christian must use only that newest Rose
City message and complete callback/password/sign-in/MFA/admin acceptance
without sharing its URL.

Post-cutover public-media inspection found two live rendering regressions.
Production still serves pre-migration `logos_v2` affiliation URLs even though
all eight correct color/white assets exist under Rose City's versioned
`onzio-media/.../branding` paths. The homepage slideshow also remained at
opacity zero because its reveal effect initialized before asynchronous slides
mounted, and its Vercel image-optimizer request returned HTTP 402
`OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`. The focused local correction uses
the already-migrated logo URLs, initializes the reveal after slides mount, and
serves slideshow images raw with `unoptimized` to restore them without a plan
purchase. All eight logo assets return HTTP 200, the focused regression passes,
`npx tsc --noEmit` passes, and contract tests pass 171/171. At that checkpoint,
Production was unchanged and the focused deployment required explicit
approval. Christian subsequently approved that exact scope. Focused commit `a1f1675`
(`Fix Rose City migrated media rendering`) contains only `components/Nav.tsx`,
`components/PhotoSlideshow.tsx`, and
`tests/contracts/homepage-slideshow.test.ts`; it was pushed to `staging`.
Preview deployment `dpl_4Aq1XgYWiM9bpsUNrKWBqQChv3np` became Ready, then
Vercel rebuilt the same commit with Production settings as current Ready
deployment `dpl_ArBmGncAdEm6VFhWgzNxfhPnHgub`. Live verification confirmed
all four affiliation logos render, slideshow URLs bypass `/_next/image`, and a
scrolled viewport displays the migrated match photography. No paid plan,
billing configuration, or optimizer purchase changed.

Live follow-up inspection of D'Morea Alewine's player modal found the same
optimizer outage on its carousel image: the migrated raw Supabase WebP returns
HTTP 200, while the corresponding `/_next/image` request returns HTTP 402
`OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`. The approved resilience pass marks
the modal carousel image `unoptimized`, preserving the roster-card delivery
contract while bypassing the unavailable optimizer for modal profile and
action photos. It also falls through failed modal assets before showing a clean
initials placeholder, removes a failed slideshow asset instead of leaving the
section blank, and swaps an affiliation logo to its alternate color variant if
the requested variant fails. Regression coverage locks the eight migrated
versioned logo paths, raw slideshow/modal delivery, asynchronous slideshow
reveal, and all three failure paths. The focused suite passes 6/6, contract
tests pass 176/176, architecture tests pass 16/16, standalone TypeScript passes,
and the production build passes with seven pre-existing warnings.

Focused commit `183fc22` (`Harden public media fallbacks`) contains only the
three media components and three regression files. It was pushed to `staging`;
Preview deployment `dpl_2gBGX5ycZkuBMsj93gaYxHDXeoYR` became Ready, then
Vercel rebuilt that commit with Production settings as Ready deployment
`dpl_HEsKkJjUAiARWc8JWKMJMPEHt5q1`. Live acceptance confirmed all four
affiliation logos load from raw migrated assets, all six slideshow images load
raw at 1200–1500px and the carousel advances, D'Morea's profile and action
photos load raw at 2046×2400, and the roster contains zero broken images.
The homepage and roster browser consoles contained no errors.
Deployment-scoped runtime logs contained no 5xx, fatal, uncaught, or exception
events; the immutable deployment URL's expected unknown-tenant 404s remained
fail-closed. No paid plan, billing configuration, DNS, database, or email
setting changed.

During configuration, the browser auto-filled an unrelated stored credential
into the newly enabled SMTP form before Onzio values were entered. It was
immediately overwritten and was never saved to Supabase, but it appeared in
automation evidence and must be treated as exposed. It was subsequently
identified without revealing the value as Christian's Supabase dashboard
email/password identity `christianjavieralcala@gmail.com`. Under explicit
rotation approval, the secure Supabase password-change form was opened.
Christian completed the password change privately and exposed neither the
current nor new value in chat or repository files. The credential-rotation
incident is closed.

The isolated `Onzio Platform Staging` Supabase project now contains only
synthetic Alpha and Bravo tenants. Ten checked-in migrations are applied
without the local seed, modern publishable/secret keys replace disabled legacy
keys, leaked-password protection and TOTP MFA are enabled, and the exposed
`onzio` schema remains separated from private security helpers. Supabase's
security advisor has no warnings; its four remaining informational notices
describe intentionally policy-free internal/write-only tables. Christian
reported that the temporary staging organization upgrade was downgraded after
the Phase 7/Phase 8 rehearsal.

The protected `onzio-platform-staging` Vercel project serves the `staging`
branch behind Vercel Authentication. Preview-scoped variables contain only
staging Supabase and Stripe test-mode values. Alpha and Bravo have separate
verified staging domains, and unknown or cross-tenant hosts fail closed.
The same project now also has an isolated Production scope containing the ten
reviewed production variables and serves the Rose City apex and `www` domains.

The real Stripe test path is exercised end to end: owner Checkout created an
active Starter subscription, the staging webhook projected it, Customer Portal
opened for the owner, and Starter→Pro→Starter changes projected correctly.
Duplicate, stale, foreign-environment, customer-metadata, and unknown-price
events failed closed.

Hosted verification covers AAL1/AAL2, roles, membership revocation, tenant RLS,
HTML/RSC cache isolation, Starter/Pro entitlements, media normalization and
rejection, retry and cleanup, paid/grace/suspended lifecycle states, archive,
reactivation, and atomic rollback. Alpha is restored active/live/Starter with
its test subscription; Bravo is restored onboarding/private-preview with no
subscription.

The production Auth posture now has leaked-password protection, TOTP MFA, and a
15-minute AAL1 session limit enabled. The Data API explicitly exposes `onzio`
while keeping `onzio_private` unexposed, exposes all 32 `onzio` tables behind
their checked-in grants/RLS, and does not automatically expose future tables.
The one-time `phase8_migration` secret key was revoked after a successful live
Data API reconciliation; a follow-up request returned HTTP 401 and the local
key material was deleted. The eight Phase 8 Rose City
transformation/migration contracts are green, as are the complete local
contract, architecture, database, legacy, and combined suites.

## Completed Work

### Phase 1 — Bootstrap and threat model

- Copied and verified the Rose City compatibility baseline without secrets,
  dependencies, build output, nested Git state, or the legacy Supabase image
  loader.
- Completed the source/schema/route/read/write/media inventory, access matrix,
  threat model, gap register, and guarded read-only production introspection.
- Preserved the contract-first harness and legacy regression suite.

### Phase 2 — Database security foundation

- Added the `onzio` exposed schema and private `onzio_private` security
  boundary.
- Added tenant-owned content, billing, audit, and media tables with composite
  tenant foreign keys, grants, RLS, storage policies, and deterministic
  Alpha/Bravo fixtures.
- Added generated database types and authenticated local RLS/storage tests.

### Phase 3 — Atomic tenant conversion

- Added strict hostname normalization, verified domain resolution,
  tenant-specific rewrites, tenant-aware cache keys, and `ClubContext`.
- Converted public reads and protected admin mutations to explicit tenant
  scope.
- Added password authentication, TOTP/AAL2 enforcement, role/lifecycle/tier
  authorization, and server-side protected-page gates.
- Removed Rose City content fallbacks from tenant requests.
- Added published `media_assets` resolution and selective image-delivery
  behavior.
- Verified Alpha/Bravo isolation and retained the local database/RLS gate.

### Phase 4 — Secure media pipeline

#### Paths and validation

- Added strict tenant/surface/UUID path construction and parsing in
  `lib/storage-path.ts`.
- Added magic-byte detection, MIME/extension agreement, byte limits,
  decoded-dimension limits, corruption handling, decompression-bomb rejection,
  and photo/graphic allowlists in `lib/media-validation.ts`.
- Rejects SVG, GIF, executable/spoofed, malformed, and unsupported input before
  any public write.

#### Normalization and delivery

- Added Sharp photo processing with orientation correction, metadata
  stripping, no upscaling, a 2400px long edge, and WebP quality 82.
- Added graphic processing with transparency preservation and optimized PNG
  retention when WebP would be larger.
- Kept large photographic surfaces on Vercel optimization and small graphics
  unoptimized.
- Retained the static prohibition on Supabase runtime Image Transformation
  URLs and the exact `onzio-media` remote pattern.

#### Authorization and finalization

- Added `/api/admin/media/authorize` for AAL2, membership, lifecycle, tier,
  surface, MIME, and claimed-size checks.
- Browser uploads go directly to the private `onzio-upload-staging` bucket
  through a short-lived signed upload authorization.
- Added a server-only, HMAC-bound upload authorization tying the upload ID,
  actor, club, surface, kind, staging path, and expiry together.
- Added `/api/admin/media/finalize`, which re-checks tenant/user authorization,
  downloads staging through the narrow service-role boundary, validates and
  normalizes the real bytes, publishes an immutable UUID path, records
  `media_assets` and a narrow audit event, and removes staging.
- Finalization is idempotent. Database/audit failures trigger compensating
  public-object rollback.

#### Replacement, cleanup, and monitoring

- Replaced the Phase 3 fail-closed storage adapter with the secure media
  adapter used by existing admin pages.
- Automatically adds media asset IDs to supported admin content payloads.
- Added versioned Onzio URL parsing for homepage, sponsor, about, and shared
  storage cleanup flows.
- Added `/api/admin/media/cleanup` and retirement behavior that preserves the
  new reference before old-object deletion.
- Added `onzio.media_cleanup_queue` for failed staging/public cleanup retries.
- Added `npm run media:cleanup` for abandoned staging objects older than 24
  hours and `getMediaUsageByClub` for asset/byte monitoring.
- Added `npm run media:smoke` for local end-to-end verification.
- Added an explicit Node 20 WebSocket transport to the shared service-role
  Supabase client.

### Phase 5 — Authentication and operator workflows

#### Operator boundary and provisioning

- Added a server-only operator allowlist through `ONZIO_OPERATOR_USER_IDS`.
- Added validated direct-invocation guards so operator functions cannot be
  exposed through ordinary application routes.
- Added compensated club provisioning for club, verified primary domain,
  owner Auth user/invite, owner membership, and audit creation.
- Reuses an explicitly verified existing Auth user without duplicating the
  account.
- Maps slug/domain conflicts and rolls back database/Auth artifacts when a
  later provisioning step fails.

#### Membership and MFA recovery

- Added operator-only membership activation/reactivation and removal.
- Re-checks the Auth identity, current club lifecycle, and membership state at
  mutation time.
- Prevents removal of the last active owner and restores the previous
  membership if audit recording fails.
- Added manual-identity-verification-gated MFA recovery using Supabase Auth
  admin factor removal and a generated password recovery link.
- Stores only a SHA-256 digest of the operator verification reference in the
  start/completion audit records.

#### Archive, reactivate, export, and purge

- Added archive behavior that suspends the club, detaches domains, blocks
  existing sessions/writes through the existing lifecycle gates, preserves all
  content/media, and records an operator audit.
- Added reactivation into onboarding/private-preview state with the verified
  primary domain restored; billing is still required before public launch.
- Added the privileged `club_exports` verification ledger with no browser
  grants and regenerated database types.
- Added exact-confirmation hard purge with local storage removal and
  dependency-ordered tenant-row deletion.
- Changed immutable audit/Stripe club foreign keys to `on delete set null` so
  their ledgers survive a hard purge without granting service-role
  update/delete access.
- Added a final hard-purge audit outside the deleted tenant.
- Added `npm run operator:smoke` and local-development operator documentation.

### Phase 6 — Stripe billing

#### Checkout, Portal, and authorization

- Added strict, distinct `STRIPE_PRICE_ID_STARTER` and
  `STRIPE_PRICE_ID_PRO` mapping with staging/test and production/live mode
  enforcement.
- Added the optional `STRIPE_PRICE_IDS_PRO_GRANDFATHERED` allowlist for
  existing Pro subscriptions. Grandfathered Prices are accepted only during
  canonical projection; Checkout remains pinned to the standard Pro Price.
  Malformed, duplicate, overlapping, and unknown Price IDs fail closed.
- Replaced the legacy email allowlist with verified-tenant, AAL2,
  active-owner billing authorization.
- Added first-subscription Checkout with idempotent Customer and Session
  creation plus club/environment metadata on the Customer, Checkout Session,
  and Subscription.
- Routes every existing subscription row to Customer Portal and derives all
  success, cancel, and return URLs from the verified primary domain.
- Updated the Payments page for tenant-specific Starter/Pro selection and
  existing-subscriber management.

#### Webhook and transactional projection

- Added raw-body Stripe signature verification and a narrow required-event
  allowlist.
- Retrieves canonical Stripe state for subscription, Checkout, and invoice
  events and verifies canonical Customer metadata.
- Added pure event routing for duplicate, stale, environment, customer,
  subscription, price, obsolete-deletion, and reconciliation decisions.
- Added private security-definer functions plus service-role-only exposed
  wrappers that atomically write `stripe_events`, `club_subscriptions`,
  `clubs.tier`, lifecycle, and runtime access.
- Rejected events receive digest-only ledger records; failed projection writes
  roll back the event insert and every runtime change.
- Revoked direct service-role update/delete access to the immutable Stripe
  ledger while preserving private transactional state transitions and
  hard-purge `club_id` detachment.

#### Runtime access and regression coverage

- Added dynamic database projection for preview, live, grace, and suspended
  access so grace expires without requiring a precisely timed webhook.
- Preserved private-preview content preparation before the first subscription.
- Restricted content mutations and non-billing admin routes after paid access
  ends while keeping Customer Portal available to owners.
- Added deterministic active-subscription seed state for Alpha.
- Added database regressions for atomic application, duplicate/stale
  rejection, rollback, grace expiry, RPC privilege boundaries, and ledger
  immutability.
- Corrected two approved contradictory Stripe fixtures: the duplicate now
  identifies the already-applied event, and Rose City reconciliation carries
  Rose City tenant metadata while preserving the existing subscription ID.

### Phase 7 — protected staging gate

- Added `docs/phase-7/staging-gate.md` and completed every hosted-resource and
  acceptance row with staging-only evidence.
- Created the separate `Onzio Staging` organization
  (`udlsrxgfpkqjaridfxnz`) and `Onzio Platform Staging` project
  (`fxefqnoqxbezeccjvrsw`) in `us-west-2`.
- Linked the checkout using a Keychain-held database password and applied ten
  checked-in Phase 2–7 migrations without `supabase/seed.sql`.
- Added a minimal private-preview resolver, exact webhook routing bypass, and
  empty-search-path/revoked-execution hardening for hosted runtime functions.
- Disabled legacy `anon`/`service_role` API keys, retained modern
  publishable/secret keys outside the repository, enabled leaked-password
  protection, and kept TOTP enrollment/verification enabled.
- Added a guarded `npm run staging:provision` workflow and provisioned the
  operator plus synthetic Alpha/Bravo owner/admin identities with verified
  domains, memberships, audit records, and TOTP AAL2 factors.
- Linked the Vercel project `onzio-platform-staging`
  (`prj_I362ysmh9cse5cRxnL7db4dOhsEs`) to GitHub, scoped all staging values to
  the `staging` Preview branch, and enabled Vercel Authentication.
- Deployed the protected staging application and mapped the Alpha/Bravo aliases
  to the verified `staging` branch deployment.
- Rotated the Stripe test secret, retained it outside the repository, and
  configured test Starter/Pro Prices, Customer Portal, and webhook
  `we_1TxrnaK6WajTkwHYtFEvCEo8` with the exact seven-event allowlist.
- Created and paid a real test Checkout, projected subscription
  `sub_1TxsLTK6WajTkwHYEUjdWeNR`, verified Portal and Starter/Pro switching,
  then restored Alpha to active/live/Starter.
- Added reusable hosted auth, Stripe, media, and lifecycle verifier scripts.
  The media cleanup verifier now scopes destructive cleanup to its unique
  synthetic club prefix.

### Phase 8 — local Rose City migration gate

- Added `lib/migration/rose-city-transform.ts` as a pure, deterministic
  preflight and transformation boundary with no hosted or filesystem writes.
- Added tenant-key injection, snake-case relationship mapping, real duplicate
  detection, tenant relationship validation, declared row-count reconciliation,
  media availability/corruption/checksum checks, and traversal-safe media paths.
- Added deterministic UUID-versioned `onzio-media` plans that never use
  Supabase runtime Image Transformations and preserve transparent-graphic
  extension behavior when declared.
- Preserved the existing Rose City Stripe subscription ID in the transformed
  result and added a stable source digest for idempotent replay verification.
- Added five regressions that prove real malformed manifests fail without
  relying only on the original contract simulation flags.
- Added `docs/phase-8/rose-city-migration-runbook.md` with the target evidence,
  credentials, approval boundaries, backup/export gate, rehearsal sequence,
  production/cutover sequence, rollback window, and acceptance evidence.
- Verified `Onzio Platform Production` as project ref
  `ioalthwsdrlzrubomrow`, region `ca-central-1`, Micro compute, status
  `ACTIVE_HEALTHY`, in the Pro `404DB` organization.
- Completed the read-only production preflight through the authenticated
  Supabase Dashboard: the `public` schema has no tables, migration history is
  empty, Auth has no users, Storage has no buckets, scheduled daily backups are
  available, and the project usage view shows no disk overage.
- Recorded a credential-safety incident: the Supabase CLI returned complete
  legacy JWT keys without `--reveal`, exposing the legacy production
  service-role credential in the tool transcript.
- Contained the incident under Christian's explicit approval: disabled the
  legacy `anon` and `service_role` API keys, retained the modern
  publishable/secret posture, and revoked the previous legacy HS256 signing key
  so the exposed service-role JWT is no longer trusted. The current signer is
  ECC P-256.
- Added guarded `migration:export:rose-city` and
  `migration:reconcile:rose-city` workflows. They pin the exact Rose City host,
  reject mutation methods and unexpected endpoints, minimize Auth output, copy
  every Storage object, hash every artifact, and verify database relationships
  plus database-to-Storage references.
- Completed the authorized non-frozen rehearsal snapshot at
  `/Users/christianalcala/Downloads/onzio-migration-private/rose-city-rehearsal-2026-07-27T2057Z`:
  24 tables/209 rows, 3 minimized Auth identities, 14 buckets/557 objects,
  1,728,725,700 Storage bytes, 132/132 resolved media references, 10/10
  relationship checks, 0 duplicate key groups, and a passed credential scan.
- Independently verified all 586 package checksums. Private package permissions
  are `0700` for directories and `0600` for files.
- Added the complete 24-table deterministic mapping planner with explicit
  field dispositions, stable tenant/row/media identifiers, relationship
  remapping, Stripe subscription preservation, credential-shaped-content
  rejection, and private-path/network guards.
- Classified all 557 source Storage objects and processed 499 compliant
  photographs/graphics offline into deterministic versioned paths.
- Wrote the restricted inventory and blocker evidence outside Git at
  `/Users/christianalcala/Downloads/onzio-migration-private/rose-city-plan-2026-07-27-blocked-evidence-v2`.
  Its 501/501 derived files pass SHA-256 verification; directories are `0700`
  and files are `0600`.
- Confirmed the unreferenced MP4 and empty placeholder require no schema change
  and are explicitly excluded without transcoding.
- Added complete-plan regressions for all-table coverage, deterministic output,
  Stripe preservation, legacy-only field disposition, missing tables, broken
  relationships, referenced unsupported media, and import-time URL
  materialization.
- Christian approved the narrow migration-only pre-normalization exception for
  the 16 already-public referenced PNG inputs on 2026-07-27. The Phase 4
  browser-upload limits remain unchanged.
- Added bounded offline pre-normalization for only those approved inputs:
  photographs decode below 36 MP, rotate, resize to a 2400 px long edge, and
  emit WebP quality 82; transparent graphics decode below 36 MP, resize within
  3000 px, and retain the smaller safe PNG/WebP output.
- Generated two byte-identical complete plans outside Git. The final source
  digest is
  `e7763db3b37022a74b479ef5d421058bc31f2eaeaafe36bdcc8e1dafb6938226`
  and the final plan digest is
  `e826f49771773ad2415ec6b52fe47c6d311750f10e5be31e6fdace4a8d349c13`.
- Added `migration:import:rose-city` and `migration:reset:rose-city`. The
  importer permits only loopback Supabase/Postgres endpoints, verifies the
  complete private checksum ledger, creates new local-only owner/admin
  identities with mandatory MFA enrollment, uploads versioned media,
  transactionally imports tenant content, compensates Auth/Storage on failure,
  and reconciles counts plus composite relationships.
- Imported 209 source rows into all 24 destination content/billing tables and
  515 published media assets. Forty-two unsupported, corrupt, video, or
  placeholder objects remain explicitly excluded; no referenced object is
  excluded.
- Corrected two render-discovered legacy dependencies: the path-only club crest
  is now planned as referenced media, and Rose City affiliation/flag assets use
  deterministic `onzio-media` paths instead of legacy buckets.
- Verified `/`, `/roster`, `/schedule`, `/shop`, `/club/about`, and
  `/club/logo` in a local browser with no broken images, legacy flag/logo
  bucket URLs, or `/storage/v1/render/image/` URLs.
- Created a fresh local owner, completed mandatory TOTP MFA, loaded the
  protected dashboard, performed a real About-page mutation, and restored the
  original content. Fixed the admin client to remove tenant identity copied
  from select responses before server-mediated mutations.
- Proved rollback by removing exactly 515 Rose City media objects, two local
  Auth users, and the Rose City tenant rows. Rose City returned 404 while Alpha
  remained 200. The same immutable plan then replayed twice with identical
  digest and row/media counts.
- Fixed the homepage slideshow's asynchronous reveal lifecycle. The GSAP
  effect now waits for migrated slide rows to mount the section before
  initializing, preventing the six valid images from remaining behind a
  permanent `opacity: 0`. Added a contract regression and verified the visible
  `01 / 06` slideshow advances with loaded migrated images.
- Recorded Christian's final-freeze authorization and relayed administrator
  no-edit acknowledgement at `2026-07-27T22:34:39Z`.
- Extended the guarded exporter with paired final-freeze authorization and
  ISO timestamp requirements. Final manifests now fail closed unless they
  attest `frozenSource`, `finalCutoverArtifact`, and freeze evidence; the
  reconciler and planner accept only complete attested final packages.
- Captured the authoritative final frozen package outside Git at
  `/Users/christianalcala/Downloads/onzio-migration-private/rose-city-final-freeze-2026-07-27T2234Z-v2`:
  24/24 tables and 209 rows, 3 minimized Auth identities, 14 buckets and
  557 objects, 1,728,725,700 Storage bytes, stable before/after counts and Auth
  digest, no credential findings, and zero production mutations.
- Reconciled 585/585 package checksums, 10/10 relationships, and 132/132
  database-to-Storage references. The Rose City source project reports a
  completed physical backup from `2026-07-27T11:06:22.739Z`; the frozen
  package separately preserves the current logical application rows and
  Storage objects because Supabase database backups exclude Storage bytes.
- Generated byte-identical cutover plans outside Git at
  `rose-city-cutover-plan-2026-07-27-a` and
  `rose-city-cutover-plan-2026-07-27-b`. Both checksum ledgers pass and retain
  source digest
  `e7763db3b37022a74b479ef5d421058bc31f2eaeaafe36bdcc8e1dafb6938226`
  plus plan digest
  `e826f49771773ad2415ec6b52fe47c6d311750f10e5be31e6fdace4a8d349c13`,
  exactly matching the approved rehearsal.
- The earlier private directory
  `rose-city-final-freeze-2026-07-27T2234Z` and plans derived from it are
  superseded because the original exporter labeled all output as non-frozen.
  They remain outside Git but must not be used for cutover.
- Added the guarded production importer
  `scripts/import-rose-city-production.ts` and its production-specific
  transformation boundary. It pins the exact production ref plus source/plan
  digests, permits only the approved identities, rejects
  `calcala1@berkeley.edu`, verifies media checksums before upload, applies SQL
  transactionally, compensates newly uploaded objects on failure, and performs
  exact destination reconciliation.
- Applied all ten checked-in migrations to production through
  `/private/tmp/onzio-prod-link.5jD9AU`; `supabase migration list --linked`
  matches locally and remotely, and production schema lint reports no errors.
- Provisioned only the approved production identities:
  `christianjavieralcala@gmail.com` as owner/operator and
  `info@rosecityfutbolclub.com` as Rose City owner. The Berkeley address was
  canceled before submission and is absent from production.
- Imported the authoritative frozen cutover plan into production:
  209 source rows, 515 immutable `onzio-media` objects, two memberships, and
  two domains. Every mapped destination count matches the plan, including six
  homepage slideshow photos. `club_subscriptions` remains empty by design
  until the existing live Stripe subscription is separately reconciled.
- Kept the imported tenant fail-closed as `onboarding` plus `preview`. A live
  production Data API check returned that exact state.
- Enabled leaked-password protection, TOTP MFA, and the 15-minute AAL1 limit.
  Explicitly exposed the `onzio` Data API schema/tables, kept
  `onzio_private` unexposed, and disabled automatic exposure of new tables.
- Created a one-time modern secret key only for the import, then deleted it
  after reconciliation. The revoked key returns HTTP 401, and its local secret
  and API-key inventory files were removed.
- Completed the approved read-only live Stripe inventory:
  - customer `cus_UwVpy1YlirV3li`, billing email
    `info@rosecityfutbolclub.com`
  - active subscription `sub_1TwcndK6WajTkwHYH1VuFgrG`, one item, automatic
    collection, no cancellation scheduled, current period
    2026-07-23 23:41:35 PDT through 2026-08-23 23:41:35 PDT
  - grandfathered Rose City Pro Price
    `price_1TwbmvK6WajTkwHYueLvjhv5` at $75 USD/month
  - standard Starter Price `price_1Tw8RjK6WajTkwHYcTsgHNGc` at $65 USD/month
    and standard Pro Price `price_1Tw8S7K6WajTkwHYcyQ3zjgK` at $99 USD/month
  - active legacy webhook destination `we_1TwEpdK6WajTkwHYD5SEYzXX` at
    `https://www.rosecityfutbolclub.com/api/stripe/webhook`, API version
    `2026-06-24.dahlia`, listening to the six required Checkout,
    subscription, and invoice events
- Confirmed the customer, subscription, and grandfathered Price have no Onzio
  metadata. The legacy webhook's weekly view records six deliveries: three
  HTTP 308 failures and three later manual HTTP 200 recoveries for the same
  Checkout event. This redirect behavior must not be carried into the Onzio
  webhook cutover.
- Implemented the approved grandfathered Pro compatibility locally. The
  standard Starter and Pro Checkout Prices remain unchanged, while the exact
  configured Rose City Price can map to Pro during in-place reconciliation.
  Added contracts proving the alias projects the same subscription, is never
  offered to new Checkout, and cannot overlap either standard tier Price.
- Completed the approved production billing projection on 2026-07-27:
  - added only `onzio_club_id=32ceba0b-4e25-52c2-bb6b-d82fb87637a7` and
    `onzio_environment=production` to the preserved customer and subscription
  - preserved customer `cus_UwVpy1YlirV3li`, subscription
    `sub_1TwcndK6WajTkwHYH1VuFgrG`, and grandfathered Price
    `price_1TwbmvK6WajTkwHYueLvjhv5`
  - applied canonical `customer.subscription.updated` event
    `evt_1Txzz4K6WajTkwHYBzaweVRI` through the service-only projection RPC
  - reconciled one active Pro subscription, paid through
    `2026-08-24T06:41:35Z`, with no scheduled cancellation
  - verified the immutable event outcome is `applied`, runtime access is
    `live`, and both Rose City production domains still resolve to this club
  - changed no Price, amount, payment method, billing cadence, webhook
    destination, deployment, or DNS record
- Completed the approved controlled cutover on 2026-07-27:
  - moved `rosecityfutbolclub.com` and `www.rosecityfutbolclub.com` to the
    Onzio production target
  - corrected the Production Supabase publishable key and
    `ONZIO_ENVIRONMENT=production` in place
  - found production drift in the checked-in runtime-access execution grant,
    reapplied the exact migration grant to `anon`, `authenticated`, and
    `service_role`, reloaded PostgREST, and verified anonymous tenant/runtime
    resolution
  - preserved live Stripe webhook `we_1TwEpdK6WajTkwHYD5SEYzXX`, installed its
    signing secret, and expanded its allowlist from six to seven events by
    adding `invoice.paid`
  - resent `evt_1Txzz4K6WajTkwHYBzaweVRI`; Stripe received HTTP 200 and the
    production ledger remained idempotent with one applied row
  - verified all public routes, six slideshow images plus controls, invalid
    webhook rejection, and the owner/operator password plus MFA admin flow
- Added production-safe self-service password recovery. Supabase Auth now uses
  the verified Rose City Site URL and an exact callback allowlist; recovery
  exchanges the code server-side, permits only the update-password destination,
  updates the password through the authenticated recovery session, signs the
  session out, and returns the user to password plus MFA login.
- Added the documentation-only Resend SMTP closeout plan. It uses one
  Onzio-owned `auth.onziofutbol.com` sending identity for every club while
  keeping
  tenant-specific website and callback domains, separate staging/production
  credentials, security-only templates, conservative rate limits, staged
  verification, and a fail-closed rollback procedure. No hosted email or DNS
  change was made.
- Completed the approval-safe read-only Resend/Supabase email baseline. The
  existing Resend Free team belongs to the Onzio operator and had no API keys
  at baseline.
  Christian completed operator MFA enrollment, and the enabled state was
  verified read-only without opening authenticator or recovery material. Under
  separate approval, `auth.onzio.com` was added in North Virginia with sending
  enabled and receiving disabled. Christian then clarified that `onzio.com` is
  not owned; the owned domain is `onziofutbol.com` and its DNS is on Vercel.
  Under explicit correction approval, the erroneous entry was deleted and
  `auth.onziofutbol.com` was added as the sole Resend domain. Under separate
  DNS approval, Vercel published the exact generated records and Resend
  verified the domain. Under a later separate approval, a sending-only,
  domain-restricted staging credential was created and installed only in
  staging Supabase. Staging custom SMTP is enabled at 30 emails/hour;
  production remained disabled at that checkpoint. Under
  separate approval, two staging invitations and one staging recovery message
  were delivered across Yahoo and Berkeley. No secret value was recorded, and
  no message body or action link was opened.
- Recorded the staging acceptance incident after Christian opened the Berkeley
  invitation: Vercel Authentication intercepted the root redirect, the flow
  ended on Not Found, and the implicit-flow action URL was exposed during
  troubleshooting. Revoked the exact staging session and independently
  verified zero matching session and refresh-token rows. The temporary user
  remains without membership or a tenant role. The signed access JWT retains
  only its original one-hour lifetime and cannot refresh; production was
  untouched.
- Replaced staging invite/recovery implicit-flow links with one-time token-hash
  callbacks and added a server callback that allowlists supported OTP types,
  rejects open redirects, routes invite/recovery sessions to password update,
  and fails closed for invalid links. Added 14 callback contracts; TypeScript,
  lint, build, architecture, and the complete 485-test local suite pass.
  Deployed commit `92038d4` to protected staging, repointed both existing tenant
  aliases, verified both login pages, and proved a forged live callback fails
  safely. Updated both hosted staging templates, then sent one separately
  approved Yahoo recovery through Alpha. The application accepted it and
  Resend reported `delivered`; the message body and link were not inspected.
- Diagnosed the subsequent `not_authorized` response read-only: Yahoo recovery
  and password sign-in had succeeded, but the intentionally unaffiliated test
  identity had no Alpha membership. Under explicit approval, ran the direct,
  staging-pinned operator workflow to add Yahoo as an active Alpha admin. The
  workflow and follow-up reads verified the membership and its
  `membership_added` audit event. Temporary credential files were deleted
  immediately, and production was untouched. Christian completed MFA and
  confirmed protected-admin access; the final read-only acceptance query
  verified one TOTP factor and TOTP-authenticated session claims.
- Under fresh approval, created production Resend credential
  `2966af9b-4c39-426d-9ef9-bae68f6b7af6` with sending-only access restricted
  to `auth.onziofutbol.com` and installed it directly into encrypted production
  Supabase Auth SMTP settings. Reload verification matched the production
  sender, Resend host/port/username, 60-second interval, and 30-email/hour
  limit. The credential showed zero uses, no production email was sent, and no
  Resend plan upgrade occurred. An unrelated browser-autofilled credential was
  overwritten before save but appeared in automation evidence; its owning
  account requires separate rotation.
- Under fresh separate approval, initiated exactly one production recovery
  through the Rose City login for `christianjavieralcala@gmail.com`. The
  application confirmed the request and Resend recorded provider message
  `c1eefc25-9813-45c4-8618-b695a06279a7` as `delivered`. No message body,
  action URL, or provider detail was opened. Christian opened the message, but
  the code landed at the Site URL root because the production redirect
  allowlist still contains only the legacy callback with
  `?next=/admin/update-password`, while the deployed client requests the clean
  callback. The one-time code was exposed during troubleshooting and will not
  be reused; no password changed.

### Phase 9 — versioned presentation system

- Added Phase 9.1 baseline evidence for the current Rose City cinematic public
  renderer and the approved local Deportivo heritage snapshot.
- Added Phase 9.2 presentation package contracts and implementation for
  document schema parsing, registered templates, registered sections, routes,
  modules, curated font packs, semantic theme contrast checks, production
  provenance gating, deterministic validation, compatibility switching, photo
  readiness recommendations, and operator override records.
- Added Phase 9.3 local database contracts and migration for immutable
  presentation documents, draft/published state pointers, append-only
  publication history, composite tenant foreign keys, public published-only
  reads, protected member reads, service-role writes, and immutable triggers.
- Regenerated `lib/database.generated.ts` from the local schema after the
  migration was applied through `npm run db:reset`.

## Verification

### Phase 9 local checkpoint — 2026-07-29

```text
npx vitest run tests/contracts/presentation-system.test.ts
  6/6 passed

/bin/zsh -lc 'eval "$(supabase status -o env 2>/dev/null)"; \
  SUPABASE_TEST_URL="$API_URL" \
  SUPABASE_TEST_ANON_KEY="$ANON_KEY" \
  SUPABASE_TEST_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx vitest run tests/database/presentation-system.test.ts'
  3/3 passed

npm run test:contracts
  212/212 passed

npm run test:architecture
  18/18 passed

/bin/zsh -lc 'eval "$(supabase status -o env 2>/dev/null)"; \
  SUPABASE_TEST_URL="$API_URL" \
  SUPABASE_TEST_ANON_KEY="$ANON_KEY" \
  SUPABASE_TEST_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npm run test:db'
  51/51 passed

npm run db:types:check
  generated definitions match the local schema

npx tsc --noEmit --pretty false --incremental false
  passed

supabase db lint --local --schema onzio,onzio_private
  no schema errors
```

Notes:

- `npm run db:reset` applied all checked-in migrations including
  `20260729040045_phase9_presentation_system.sql` against local Supabase only.
- Supabase CLI reported installed version `2.109.1`; its changelog currently
  advertises `2.110.0` as available, but no upgrade was performed.
- The CLI continues to print the existing Bun AVX warning during local
  Supabase commands.

### Phase 6 green gates

```text
npx vitest run tests/contracts/stripe-subscription.test.ts
  24/24 Phase 6 Stripe contracts passed

npm run test:db
  45/45 passed across 5 files

npm run test:legacy
  243/243 passed across 20 files

npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only local Supabase values; 23 static pages generated

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors
```

### Intentional-red later-phase gates

```text
npm run test:contracts
  129 passed, 8 intentional failures, 137 total

npm run test:architecture
  16/16 passed

npm test (with local Supabase test values)
  434 passed, 8 intentional failures, 442 total
```

The remaining failures are assigned to later phases:

- eight Rose City transformation/migration contracts (Phase 8)

### Phase 7 final gate — 2026-07-27

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:architecture
  16/16 passed

npm run test:db
  46/46 passed across 5 files

npm run test:legacy
  243/243 passed across 20 files

npm run test:contracts
  129 passed, 8 intentional Phase 8 failures, 137 total

npm test (with loopback-only local Supabase values)
  434 passed, 8 intentional Phase 8 failures, 442 total

npm run db:types:check
  generated definitions match the local schema

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  23 static pages generated

supabase db lint --linked --schema onzio,onzio_private
  no schema errors
```

Hosted staging verification:

- `phase7.hosted_auth_verified`: AAL1/AAL2, four tenant sessions, RLS/cache
  isolation, roles, Starter entitlement, Portal, and immediate revocation pass
- `phase7.hosted_media_verified`: normalization, rejection, idempotency,
  retirement, and scoped abandoned-staging cleanup pass
- `phase7.hosted_stripe_verified`: duplicate, stale, environment, customer, and
  Price boundaries pass
- `phase7.hosted_lifecycle_verified`: retry, grace, suspension, archive,
  reactivation, and rollback pass
- real Stripe test Checkout, webhook projection, Customer Portal, and
  Starter→Pro→Starter projection pass
- Supabase security advisor reports no warnings; four intentional
  `rls_enabled_no_policy` informational notices remain

### Phase 8 local gate — 2026-07-27

```text
npx vitest run tests/contracts/provisioning-migration.test.ts \
  tests/contracts/rose-city-transform-regressions.test.ts
  23/23 passed

npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:contracts
  142/142 passed

npm run test:architecture
  16/16 passed

npm run test:db
  46/46 passed across 5 files

npm test (with loopback-only local Supabase values)
  447/447 passed across 35 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase values; 23 static pages generated
```

### Phase 8 read-only Rose City rehearsal export — 2026-07-27

```text
npm run migration:export:rose-city
  complete
  24/24 database tables; 209 rows
  3 minimized Auth identities
  14 buckets; 557 objects; 1,728,725,700 bytes
  credential scan passed

npm run migration:reconcile:rose-city
  passed
  10/10 relationship checks
  132/132 database-to-Storage references resolved
  0 duplicate key groups

shasum -a 256 -c checksums.sha256
  586/586 files passed

npx tsc --noEmit --pretty false --incremental false
  passed

npx vitest run tests/contracts/provisioning-migration.test.ts \
  tests/contracts/rose-city-transform-regressions.test.ts
  23/23 passed

npm run test:contracts
  142/142 passed

npm run lint
  passed with seven pre-existing legacy warnings
```

### Phase 8 complete-plan/media checkpoint — 2026-07-27

```text
npm run migration:plan:rose-city -- <private-export> <private-output>
  stopped safely before import-plan creation
  24/24 source tables mapped
  557/557 objects classified
  499 compliant photographs/graphics processed
  58 objects explicitly excluded
  16 referenced PNGs rejected by locked Phase 4 input limits

shasum -a 256 -c checksums.sha256
  501/501 derived evidence/output files passed

npx vitest run tests/contracts/rose-city-import-plan.test.ts \
  tests/contracts/provisioning-migration.test.ts \
  tests/contracts/rose-city-transform-regressions.test.ts
  27/27 passed

npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:contracts
  146/146 passed

npm run test:architecture
  16/16 passed

npm test (with loopback-only local Supabase test values)
  451/451 passed across 36 files

npm run db:types:check
  generated definitions match the local schema

npm run lint
  passed with seven pre-existing legacy warnings
```

### Phase 8 full local import/replay gate — 2026-07-27

```text
npm run migration:plan:rose-city -- <private-export> <private-output> \
  --allow-approved-rehearsal-input-limit-pre-normalization
  two independent plans matched
  source digest e7763db3b37022a74b479ef5d421058bc31f2eaeaafe36bdcc8e1dafb6938226
  plan digest e826f49771773ad2415ec6b52fe47c6d311750f10e5be31e6fdace4a8d349c13
  557 objects classified; 515 imported; 42 explicitly excluded
  122 unique referenced objects; 0 referenced exclusions
  16 approved migration-only pre-normalizations

npm run migration:import:rose-city -- <private-plan> --mode=apply
  209 source rows imported
  all 24 destination table counts reconciled
  515 media assets reconciled
  composite player/match relationships reconciled
  mandatory fresh local MFA enrollment verified
  immediate identical replay preserved every count and digest

npm run migration:reset:rose-city -- <private-plan> --mode=reset
  515 Rose City objects removed
  2 local-only Auth users removed
  Rose City host returned 404; Alpha host remained 200
  identical plan replay restored the complete site

browser acceptance
  six representative public routes rendered
  no broken images, legacy flag/logo bucket URLs, or Image Transformation URLs
  owner password + TOTP MFA + protected dashboard passed
  About-page update and exact restoration passed
  homepage slideshow reveal and auto-advance passed

npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:contracts
  157/157 passed

npm run test:architecture
  16/16 passed

npm run test:db
  46/46 passed across 5 files

npm test (with loopback-only local Supabase test values)
  467/467 passed across 41 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase values; 23 static pages generated

npm audit --omit=dev
  0 production vulnerabilities
```

### Phase 8 production billing projection — 2026-07-27

```text
Stripe canonical reconciliation
  preserved customer cus_UwVpy1YlirV3li
  preserved subscription sub_1TwcndK6WajTkwHYH1VuFgrG
  preserved grandfathered Pro Price price_1TwbmvK6WajTkwHYueLvjhv5
  customer and subscription metadata match Rose City plus production
  amount, payment method, cadence, and cancellation state unchanged

Onzio production projection
  event evt_1Txzz4K6WajTkwHYBzaweVRI applied
  exactly one active Pro subscription row
  paid through 2026-08-24T06:41:35Z
  runtime access live; lifecycle active; no grace period
  apex and www domain mappings unchanged

Cutover isolation
  no Vercel deployment at the billing-projection checkpoint
  no DNS/domain movement
  no webhook destination change
  legacy production traffic and rollback target unchanged
```

### Phase 8 private production validation target — 2026-07-27

```text
Vercel project
  onzio-platform-staging
  project prj_I362ysmh9cse5cRxnL7db4dOhsEs
  production deployment dpl_21X9WZEh2WdERBoQTCKtEGYrngQF
  immutable URL onzio-platform-staging-6hi76yew8-404christianns-projects.vercel.app
  READY; production build and type validation passed

Production environment
  ten reviewed variables present only in Production
  modern Supabase publishable and backend secret keys
  exact production operator UUID
  Starter, standard Pro, and Rose City grandfathered Pro Price IDs
  dedicated least-privilege restricted live Stripe runtime credential
  validation-only webhook secret; replace during webhook destination cutover

Remote safety checks
  unknown Vercel host -> HTTP 404, Cache-Control no-store, X-Robots-Tag noindex
  invalid webhook signature -> HTTP 400 INVALID_SIGNATURE
  no runtime error logs found
  Rose City Host-header spoof -> HTTP 403 at Vercel edge
  no Rose City domain, DNS record, or Stripe webhook destination changed
```

The Stripe runtime contract now accepts restricted `rk_test_`/`rk_live_` keys
in addition to standard keys while still rejecting test/live mismatches. The
focused configuration suite passes 10/10. Page-by-page Rose City production
validation remains gated on an actual or temporary Vercel domain mapping:
Vercel rejects a spoofed Rose City `Host` header before middleware runs.

### Phase 8 production cutover acceptance — 2026-07-27

```text
Live deployment
  dpl_75xrhi27MCgA5UDsQ6RhT6Ak4xrN
  target production; status READY
  apex and www assigned to onzio-platform-staging

Public/auth routes
  /, /roster, /schedule, /shop -> HTTP 200
  /club/about, /club/logo -> HTTP 200
  /admin/login, /admin/update-password -> HTTP 200
  homepage slideshow -> six images visible; controls advance
  no /storage/v1/render/image/ requests

Auth
  production Site URL and recovery callback corrected
  christianjavieralcala@gmail.com password recovery completed
  password sign-in plus mandatory MFA completed
  protected admin portal reached; Supabase last sign-in updated

Stripe
  existing destination we_1TwEpdK6WajTkwHYD5SEYzXX preserved
  exact seven-event allowlist, including invoice.paid
  invalid signature -> HTTP 400
  canonical resend -> HTTP 200
  one idempotent applied ledger row; active Pro/runtime live unchanged

Observability
  final deployment error-log query returned no errors
  legacy deployment/database preserved read-only for 7–14 days
```

No test was deleted, skipped, marked todo, loosened, or broadly mocked.

Known non-blocking warnings:

- four raw `<img>` warnings
- three unnecessary analytics `useMemo` dependency warnings
- the existing Supabase SSR Edge-runtime compile warning

## Known Constraints and Blockers

- `Onzio Platform Production` is healthy and serves the reconciled Rose City
  import, billing projection, and verified production domains.
- The exposed legacy production service-role key must never be reused. Its API
  keys are disabled and its legacy HS256 signing key is revoked; production
  configuration must use only the modern key posture.
- The rollback observation period is complete and is not a Phase 8 blocker.
  The content freeze was formally released at `2026-07-29T01:37:37Z`.
  Christian Javier Alcala is the recorded administrator, and
  `christianjavieralcala@gmail.com` is the sole active production
  owner/operator. `info@rosecityfutbolclub.com` was permanently removed; do
  not restore it or add `calcala1@berkeley.edu`.
- The authoritative final frozen export and two cutover plans are immutable
  historical evidence. The production import command is permanently retired
  and must not replay those inputs.
- The billing projection is complete. Before a production application
  deployment, configure only `price_1TwbmvK6WajTkwHYueLvjhv5` in
  `STRIPE_PRICE_IDS_PRO_GRANDFATHERED`; the hosted application must fail closed
  if that exact alias is absent or overlaps a standard Price.
- The preserved live webhook now returns a direct HTTP 200 from Onzio and
  listens to the exact seven-event allowlist.
- The approved migration-only pre-normalization exception is encoded behind an
  explicit planner flag and exact 16-file guard. It does not relax Phase 4
  browser-upload limits or allow corrupt, executable, video, GIF, or
  unreferenced exceptions.
- Christian reported that the staging organization was downgraded after the
  rehearsal, restoring the intended Free staging steady state. The installed
  CLI organization listing does not expose plan tier, so this is a
  user-confirmed billing-state record.
- The Vercel project's Production scope serves only
  `onzio-rcfc.vercel.app` for Rose City. The former apex and `www` domains are
  retired. Preview remains the protected `staging` branch and contains only
  staging values.
- The dedicated production Stripe runtime key is restricted to Customers
  Write, Customer Portal Write, Checkout Sessions Write, Prices Read, and
  Subscriptions Read. An earlier copy that surfaced during dashboard
  verification was expired immediately and was never installed.
- `STRIPE_WEBHOOK_SECRET` contains the preserved live destination's signing
  secret in Vercel Production; it remains outside Git and transcripts.
- Production Auth uses Resend custom SMTP through verified
  `auth.onziofutbol.com`; the delivery, recovery, password, MFA, and protected
  admin gate is complete. The built-in Supabase mailer is not the active
  production sender.
- Hosted operator execution must configure the exact actor UUID allowlist in
  `ONZIO_OPERATOR_USER_IDS`; no operator application UI or route exists.
- `npm run test:db` and full database-inclusive tests need JWT-shaped local
  `ANON_KEY` and `SERVICE_ROLE_KEY` values mapped into the
  `SUPABASE_TEST_*` variables.
- The abandoned-media cron is active in Vercel with the checked-in daily
  cadence, authenticated failure behavior, Production-only `CRON_SECRET`, and
  a sharp-free runtime boundary. Its first automatic execution remains normal
  ongoing operations evidence, not a Phase 8 blocker.
- The final legacy inventory is recorded and both legacy Rose City Vercel and
  Supabase projects are permanently deleted. Recovery now depends on the
  restricted off-repository frozen export; there is no hosted rollback target.
- The development-only ESLint 8 dependency-chain findings remain until the
  planned framework/lint-tooling migration.

## Next Milestone

Review `docs/phase-11/diverse-city/EPIC.md`, resolve or provide the inputs for
`DCFC-D101` and `DCFC-D102`, then assign the local snapshot work packages
`DCFC-001` and `DCFC-002`. Each assigned agent must update
`docs/phase-11/diverse-city/STATUS.md` before ending its work.

This is preparatory work for a future first-new-club rollout. It does not
bypass the platform's presentation, prospect-automation, staging, billing,
domain, or production acceptance gates. Continue to require fresh approval for
every hosted mutation, publication, and production action.

## Historical Phase 8 closeout chronology

The site cutover, primary acceptance gates, Resend operator MFA prerequisite,
correction to the owned `auth.onziofutbol.com` Resend domain, approved Vercel
DNS publication, Resend verification, staging-only credential creation, and
staging SMTP configuration are complete. The staging invitation and recovery
messages reached Resend's `delivered` state across Yahoo and Berkeley. The
tenant callback implementation, token-hash templates, protected deployment,
Alpha/Bravo aliases, tenant login pages, and invalid-link failure path are now
verified. Under fresh approval, one new Yahoo recovery was initiated from the
Alpha staging `/admin/login` form and Resend reports it `delivered`. Christian
opened the newest link and completed password update plus password sign-in. The
Yahoo identity is now an audited active Alpha staging admin. Christian
completed mandatory MFA and confirmed protected-admin access; Supabase
independently records one verified TOTP factor and TOTP-authenticated session
claims. The staging gate is complete. The production-only Resend credential and
production custom SMTP configuration are also complete and reload-verified.
The first separately approved operator recovery exposed a missing clean `www`
callback; its code will not be reused and no password changed. Under fresh
approval, the clean `www` callback was added alongside the legacy entry,
reload-verified, and exactly one replacement recovery was delivered. That
replacement also fell back to the Site URL and its exposed code will not be
reused. Read-only diagnosis found the live login remains on the apex origin,
so the client requests
`https://rosecityfutbolclub.com/admin/auth/callback`, not the allowlisted
`www` callback. No further email was sent during diagnosis. Under fresh
approval, the exact clean apex callback was added alongside both existing
`www` entries; a full reload confirmed all three and `Total URLs: 3`. No email
was sent during configuration. Under a later fresh approval, exactly one new
operator recovery was initiated and Resend reports it `delivered`, but it also
fell back to the Site URL; its exposed code will not be reused. Deeper
inspection proved production still ran commit `21de7e7`, whose public bundle
requested the legacy query-bearing callback from the apex origin. Under fresh
approval, secure commit `92038d4` was rebuilt with Production settings and
became Ready Production deployment
`dpl_HY46CQoAJ7yJsXP8xkUmSp8pY9kC`. The live bundle now requests the clean
callback and uses production Supabase, and a forged recovery callback failed
closed with the expected safe error. No email was sent during deployment or
verification. Under a later fresh approval, exactly one corrected-production
operator recovery was initiated and Resend reports it `delivered`. Christian
used only the newest message and confirmed protected-admin access. Supabase
independently records the matching operator's fresh 00:25 PDT sign-in and 00:26
PDT update. The production operator SMTP and recovery acceptance gate is green.
Under fresh approval, exactly one Rose City owner recovery was also initiated
and Resend reports it `delivered`. Christian must use only that newest Rose
City message and complete callback/password/sign-in/MFA/admin acceptance
without sharing its URL. Christian does not control that mailbox; the actual
Rose City administrator will not be available until 2026-07-29, after the
current one-time recovery link's expected validity window. Treat tonight's
message as delivery-only evidence and do not use it tomorrow. When the
administrator is present, obtain fresh approval and initiate exactly one new
recovery for code/password/sign-in/MFA/admin acceptance.
The urgent mobile-admin navigation fix is now live. Commit `5342974` constrains
the drawer to the dynamic viewport, makes the navigation region independently
touch-scrollable, locks background scrolling while the drawer is open, accounts
for the device safe area, and adds the relevant ARIA relationship. Preview
deployment `dpl_GsHP4pf3GvkLEeAXd2fnT8iWm2GB` passed before the same commit was
rebuilt with Production settings as Ready deployment
`dpl_8jS4kN51y3fbKxGRM8xZuGyDzvqx`. Live verification at 390x667 confirmed an
actual touch-style scroll from the upper menu through Standings, Branding,
Analytics, and Payments, with the footer still reachable. The deployment-scoped
Vercel log view reported zero warning, error, or fatal entries. Local
verification passed `npx tsc --noEmit`, 179 contract tests, 16 architecture
tests, the production build, and the focused three-test mobile-navigation
regression suite.
The Rose City administrator's mobile retries exposed email-link prefetching in
the production recovery path. Read-only evidence showed the owner identity
received a fresh 08:51:59 PDT recovery sign-in while the administrator never
reached password creation, and the production template still used the direct
one-time `{{ .ConfirmationURL }}`. Under explicit approval, commit `2a45db0`
adds a public `/admin/recover` form that accepts the administrator email and
six-digit recovery code, calls Supabase recovery OTP verification only after
form submission, and then routes the verified session to the existing
password-creation page. It also keeps recovery available during billing
restrictions and updates the post-request login copy. Preview deployment
`dpl_BFvL9Lca32TGDijoRYW9URqNxEou` passed before the same commit was rebuilt
with Production settings as current Ready deployment
`dpl_9o1AxqVAYYLJ6LGc8FYFf3e1JkWR`.
The production Reset password template was then changed to display
`{{ .Token }}` and link only to
`{{ .SiteURL }}/admin/recover`; its body no longer contains
`{{ .ConfirmationURL }}` or a token-bearing GET link. Reload verification
confirmed the saved template. Live mobile verification confirmed the recovery
page renders with labeled email and six-digit code fields, and its browser
console and deployment-scoped warning/error/fatal counts are clean. Local
verification passed 19 focused authentication tests, 184 contract tests, 16
architecture tests, 498 complete tests against local Supabase, standalone
TypeScript, the production build, and the mobile interaction/error-state
check. No recovery or test email was sent; the real Rose City acceptance
attempt still requires separate email-send approval. Christian subsequently
approved exactly one recovery request for `info@rosecityfutbolclub.com`. The
live application accepted it, and Resend reports message
`247e7e72-64dd-4e54-8514-0bf95c868ec7` as `delivered`. At the initial delivery
check, its detail, body, and code had not been opened.
The administrator's screenshot then proved that production Supabase emitted an
eight-digit recovery OTP while the form truncated input to six digits. Treat
that screenshot code as exposed and unusable. Commit `c2ff06d` removes
digit-count-specific copy and accepts Supabase's supported 6–10 digit email OTP
range without truncation. Preview deployment
`dpl_29CwkZs4VRDAgcScfTAgJWNf8iWU` passed before the same commit was rebuilt
with Production settings as current Ready deployment
`dpl_25ryLCW9t66MUscKxki5DcBLs5p1`. Live verification on
`www.rosecityfutbolclub.com/admin/recover` retained all eight digits in a dummy
entry with `minLength=6`, `maxLength=10`, and `[0-9]{6,10}` validation; browser
logs were clean. The production Reset password template now says “recovery
code” rather than “six-digit code,” retains `{{ .Token }}`, and was
reload-verified. Local verification passed the 19 focused authentication tests,
184 contract tests, 16 architecture tests, 498 complete tests against local
Supabase, standalone TypeScript, and the production build. No replacement
recovery email was sent. Obtain fresh explicit approval before sending exactly
one new Rose City owner recovery for final password/sign-in/MFA acceptance.
Christian's operator recovery then exposed a second hosted Auth constraint:
Supabase correctly rejected `updateUser({ password })` from the recovery
session because the operator already has a verified MFA factor and the session
was still AAL1. Commit `c4673e8` adds the missing recovery MFA challenge:
verified-factor accounts must enter their current authenticator code and reach
AAL2 before the password form appears, while invitees without an enrolled
factor may still create their first password. Password submission independently
re-checks AAL and fails closed. A new loopback Supabase integration test
reproduces the hosted rejection, verifies AAL1-to-AAL2 elevation, and proves the
password mutation succeeds only afterward. Local verification passed 21
focused authentication tests, 186 contract tests, 16 architecture tests, 501
complete tests, standalone TypeScript, and the production build. Preview
deployment `dpl_8QJ9MAgWcB76M5aAmTf9D3qJVsAN` became Ready. Under explicit
approval, the same commit was rebuilt with Production settings as Ready
deployment `dpl_CDQ9wS6duGp4DScwyCLUxgijQkiP`. Live mobile verification reused
Christian's still-valid recovery session and showed the required authenticator
step before password creation. That check also exposed repeated browser Auth
client construction across navigation. Commit `f44d528` now reuses one
module-scoped browser Supabase client across login, recovery, MFA, admin, and
sign-out calls. Preview deployment `dpl_BZw8Zifia569oafz5aPGHnSaYFSs` passed
before the hardened commit was rebuilt with Production settings as current
Ready deployment `dpl_BYy5tXM99mCgFE7rZvfU5szkszi1`. The live Rose City page
still shows `Verify your identity`, the authenticator field retains numeric
one-time-code semantics and exact six-digit validation, and the browser
reported no errors. Final local verification passed 22 focused authentication
tests, 187 contract tests, 16 architecture tests, 502 complete tests,
standalone TypeScript, and the production build. No recovery or test email was
sent.
The remaining no-existing-factor recovery path is now covered by a second
isolated local Supabase integration case. A confirmed first-time administrator
without MFA verifies a recovery OTP at AAL1/AAL1, updates the password before
factor enrollment, signs in with the new password, enrolls TOTP, verifies the
authenticator code, and reaches AAL2. Both focused recovery/MFA integration
cases pass. The complete verification remains green at 187 contract tests, 16
architecture tests, 48 database tests, 503 combined tests, and standalone
TypeScript. No runtime change was required because the deployed recovery page
already allows AAL1/AAL1 password creation and the login page already starts
TOTP enrollment when no verified factor exists. No recovery or test email was
sent, and no hosted Auth, Supabase, Resend, or production setting changed.
Keep the no-edit
freeze and the legacy deployment/database read-only for 7–14 days while
monitoring public traffic, admin writes, media, Stripe deliveries, Auth email,
and runtime errors.
Releasing the freeze or decommissioning/downgrading the legacy production
resources requires a separate explicit decision after both the SMTP gate and
observation window pass.
The legacy rollback target is Vercel project
`prj_lMYzzUcUxR1iFwYTQZW71OYsgbv5`, deployment
`dpl_EQ9y1gBxQeZB3U8RrcpYpTsFW3g1`, with the apex, `www`, and legacy Vercel
aliases attached.

Do not change Stripe objects, Rose City domains/DNS, webhook destinations,
downgrade/delete legacy production resources, or release the Rose City no-edit
freeze without the applicable explicit approval.

## Working Commands

```bash
npm run db:start
npm run db:reset
npm run db:types
npm run db:types:check
npm run test:db
npm run test:legacy
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm test
npm run media:smoke
npm run media:cleanup
npm run migration:export:rose-city
npm run migration:plan:rose-city
npm run migration:reconcile:rose-city
npm run operator:smoke
npm run lint
npm run build
```

For Apple Silicon systems where analytics/vector services conflict with the
local container runtime:

```bash
supabase start -x vector,logflare
```

After each meaningful milestone, update this file with shipped work,
verification, blockers, and the next step.
