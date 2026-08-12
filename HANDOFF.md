# Onzio Platform Handoff

Last updated: 2026-08-12

## Current State

Phase 8 local Rose City transformation/preflight implementation and the
read-only Onzio production preflight are complete. The exposed legacy
production credential has been contained. The production migration and cutover
have not begun.

The isolated `Onzio Platform Staging` Supabase project now contains only
synthetic Alpha and Bravo tenants. Ten checked-in migrations are applied
without the local seed, modern publishable/secret keys replace disabled legacy
keys, leaked-password protection and TOTP MFA are enabled, and the exposed
`onzio` schema remains separated from private security helpers. Supabase's
security advisor has no warnings; its four remaining informational notices
describe intentionally policy-free internal/write-only tables.

The protected `onzio-platform-staging` Vercel project serves the `staging`
branch behind Vercel Authentication. Preview-scoped variables contain only
staging Supabase and Stripe test-mode values. Alpha and Bravo have separate
verified staging domains, and unknown or cross-tenant hosts fail closed.

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

No Rose City production data, production Stripe subscription, production DNS
record, or production Supabase schema/data was mutated. The only production
mutations were the explicitly approved credential-safety changes: legacy API
keys were disabled and the legacy HS256 signer was revoked. The eight Phase 8
Rose City transformation/migration contracts are now green, as are the complete
local contract, architecture, database, legacy, and combined suites.

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

### Lions L0+L1 — site template and club identity schema (2026-08-11)

- Named `site_template` (`classic` default, `editorial`) as a first-class part
  of the tenant model in the architecture plan: it selects which shared
  presentation component package renders a club's public site, chosen by data
  rather than slug branching. Existing tenants stay on `classic` unchanged.
- Added migration `20260811000100_site_template_club_identity.sql`:
  `clubs.site_template` (checked `classic|editorial`, default `classic`),
  nullable `clubs.accent_color` mirroring the existing hex color checks,
  `site_branding.club_logo_dark_path`/`club_logo_dark_asset_id` with the
  existing composite media FK pattern, the new `onzio.club_identity` singleton
  (short name, initials, founded year, league/venue/contact fields, hero and
  section headings, mission, highlights) with grants, per-operation RLS on the
  `branding` feature, audit and `updated_at` triggers, and nullable
  `matches.attendance` plus defaulted `matches.scorers`.
- Extended `ClubContext` with `siteTemplate: "classic" | "editorial"`,
  selected in both database lookups and defaulted to `classic`.
- Added red-then-green contracts: `tests/database/club-identity.test.ts`
  (anon read only for publicly accessible clubs, AAL2 member insert/update,
  cross-club and AAL1 rejection), site-template/accent-color/matches contracts
  in `tests/database/schema-rls.test.ts`, and `siteTemplate` context coverage
  in `tests/contracts/tenant-routing.test.ts`. All were verified failing
  against the prior schema/implementation before turning green.
- Regenerated and committed `lib/database.generated.ts`.
- No editorial UI package, Lions seed data, or shop tier gating was added;
  those are later phases.

### Lions L2 — synthetic Lions tenant seed and real media fixture (2026-08-11)

- Checked in the six mockup-source originals under
  `supabase/fixtures/lions-media/` (`crest.png`, `crest-white.png`,
  `gallery-1.jpg`–`gallery-4.jpg`).
- Extended `supabase/seed.sql` with the local-dev-only `lions` tenant in the
  existing Alpha/Bravo statement shapes: active/live Starter club with
  `site_template = 'editorial'` and the Lions palette, verified primary
  `lions-onzio.vercel.app` domain, synthetic Starter `stripe_events` +
  `club_subscriptions` projection, `owner@lions.local` Auth user and owner
  membership, one active `2026 Season`, a full `club_identity` row with the
  mockup's verbatim hero/slideshow/identity/story copy, Instagram/YouTube
  social links, 18 first-team players with the mockup's deterministic
  hometown/height/bio derivations and per-player season stats
  (goalkeeper stats for the two keepers), 5 staff (the U23 coach is out of
  scope for the Starter-only build), 11 first-team 2026 matches with
  attendance/scorers/home-away parity transcribed from the mockup config, the
  two-paragraph about story, and 4 slideshow placeholder rows wired later by
  the media script. Player ages are synthetic (the mockup defines none) and
  the mockup's `yearJoined`/`appearances` values have no `onzio` columns, so
  they are not stored.
- Added guarded, loopback-only `scripts/seed-lions-media.mjs`, which runs the
  six checked-in originals through the real staging → `validateMediaUpload` →
  `normalizePhoto`/`normalizeGraphic` → `publishAuthorizedMedia` pipeline into
  local `onzio-media` (crests as graphics, gallery as photographs), then wires
  `site_branding.club_logo_*`/`club_logo_dark_*` and the four
  `homepage_slideshow_photos` rows in gallery order. Re-running publishes
  nothing new and duplicates no rows, storage objects, or audit events.
- Documented the two-step Lions setup in `docs/local-development.md`.
- No editorial UI components and no shop-gating changes; existing tests were
  not deleted, skipped, loosened, or mocked.

### Lions L3 — editorial component package and template dispatch (2026-08-12)

A prior session was killed mid-run for reliability reasons unrelated to code
quality, having just finished the implementation and begun final
verification. This session verified that work, completed it, corrected one
inaccurate claim in it, and ran the full gate.

Shipped in total (prior session plus this one):

- `components/editorial/*`: `EditorialHeader` (scroll-transition brand
  reveal, homepage-only transparent state, Home/Roster/Schedule nav with no
  Store link, full-viewport anchored mobile menu with background scroll
  lock), `EditorialFooter` (four-column Explore/Matchday/Follow layout, no
  sponsors block), `EditorialMotion` (GSAP/ScrollTrigger orchestration,
  `gsap.matchMedia` desktop/mobile branching, full
  `prefers-reduced-motion` exit, route-change cleanup), `EditorialShell`
  (wrapper injecting `data-site-template="editorial"` and the
  `--club-primary`/`--club-secondary`/`--club-accent` custom properties),
  vendored Geist fonts, and `EditorialHomePlaceholder` — all ported from the
  approved `soccerplatformmockups` concept mockup and verified line-by-line
  against `SiteHeader.tsx`/`SiteFooter.tsx`/`PublicMotion.tsx` in this
  session; no behavioral drift found beyond the deliberate Starter-scope
  trims (no Store link, no Admin Preview control, no sponsors) already
  called out in the mockup's own `CLAUDE.md`.
- `lib/club-identity.ts`: identity, theme color, and crest queries backing
  the shell.
- `styles/editorial.css`: every rule scoped under
  `[data-site-template="editorial"]`.
- `app/%5Fclubs/[slug]/layout.tsx` dispatches on `club.siteTemplate`
  (tenant data, never slug branching); the editorial branch reaches the
  component package, stylesheet, and font scope through dynamic `import()`
  instead of static imports, and `app/(public)/page.tsx` reaches
  `EditorialHomePlaceholder` through a client-side `next/dynamic` import.
- Corrected an inaccurate code comment inherited from the prior session:
  dynamic `import()` inside the shared `/_clubs/[slug]` Server Component
  keeps classic-template requests from evaluating the editorial
  data-fetching modules or constructing the editorial React tree on the
  server (a real, verified benefit), but — verified by diffing shipped
  CSS/JS chunk hashes for a classic-tenant page between a static-import
  build and this dynamic-import build (identical in both) — it does **not**
  keep the editorial CSS, Geist font, or header/footer/motion component
  JavaScript out of the client bundle classic tenants download. Next.js
  computes one static client-reference/CSS manifest per compiled route, and
  both templates share this one route file, so everything reachable from
  either branch lands in that route's shared chunk regardless of import
  style; `next/dynamic` in place of a plain `import()` was tried and made no
  measurable difference (identical shipped chunk hashes in both). The
  editorial CSS stays visually inert for classic tenants because every rule
  is scoped under the wrapper's `data-site-template="editorial"` selector,
  which classic markup never carries — so there is no visual or functional
  regression — but true client-asset isolation would need separate route
  files per template, which is out of this phase's scope. The one editorial
  chunk genuinely absent from the classic client bundle is
  `EditorialHomePlaceholder`, reached through `next/dynamic` from a Client
  Component, where Next.js's ordinary client-side code-splitting applies.
  Documented this precisely in `app/%5Fclubs/[slug]/layout.tsx` so a future
  phase doesn't rediscover it the hard way.
- No existing test was deleted, skipped, marked todo, loosened, or broadly
  mocked. `tests/contracts/editorial-template.test.ts` (24 tests) is green
  and its layout-source assertions match the corrected comment.

### Lions L4 — real Starter editorial homepage (2026-08-12)

Replaced `components/editorial/EditorialHomePlaceholder.tsx` with the real
Starter-tier Lions homepage: Hero → Next Match → Matchday gallery → "Our
story" teaser, exactly the required section order.

- `components/editorial/EditorialIdentityContext.tsx`: shares the
  `club_identity` content and full-color crest URL the tenant layout already
  fetches server-side (once, for the header/footer) with the home page
  sections via a new provider mounted in `EditorialShell`, so sections render
  immediately instead of re-fetching client-side. Its default value is a safe
  empty state rather than a thrown error, so a section renders correctly (and
  is unit-testable) even outside `EditorialShell`.
- `components/editorial/EditorialHero.tsx`: locked two-line headline
  (`hero_headline_top` / `hero_headline_em`), `hero_intro` copy, direct
  `/schedule` and `/roster` CTAs, and an oversized full-color crest on the
  continuous `--club-primary` → `--club-secondary` gradient. Entirely
  data-driven — verified the component source contains no Lions-specific
  copy.
- `components/editorial/EditorialNextMatch.tsx`: resolves the next upcoming
  fixture and the most recently played result from the real seeded
  `onzio.matches` data via the existing `fetchSchedule` plus two new small
  pure helpers added to `lib/queries.ts` (`findNextFixture`,
  `findLatestResult`, `fixtureKickoff`) rather than duplicating
  `NextMatchCard`'s inline derivation a second time. Shows enlarged
  date/kickoff/venue, club crest vs. opponent (falling back to a text
  monogram — mirroring the mockup's own approach — for opponents without a
  crest asset), a compact latest-result footer, and a link to `/schedule`.
  Presentational: the fixture list arrives as a prop from `EditorialHome`'s
  single fetch, so it stays independently testable.
- `components/editorial/EditorialMatchdaySlideshow.tsx`: ported from the
  mockup's `MatchdaySlideshow.tsx` — 4-second autoplay, pause on
  pointer/keyboard interaction, arrow and direct slide controls, disabled
  autoplay under `prefers-reduced-motion`, hides the whole section with no
  photos, and a localized club-navy gradient behind the copy on mobile
  instead of a full-image overlay. Presentational: the caller supplies the
  already-fetched, sort-ordered `homepage_slideshow_photos` rows (the same 4
  real gallery photos seeded in L2), so the empty-list and reduced-motion
  contracts are independently unit-testable without mocking Supabase.
- `components/editorial/EditorialStoryTeaser.tsx`: minimal section using
  `identity_heading_top`/`identity_heading_em` and the first paragraph of
  `about_page_content.story_paragraphs`, linking to `/club` (the L7 full
  story page doesn't exist yet — that's expected for this phase).
- `components/editorial/EditorialHome.tsx`: composes the four sections in
  order, fetching fixtures (`fetchSchedule`), slideshow photos
  (`fetchHomepageContent`), and the about excerpt (`fetchAboutClubContent`)
  once and passing them down as props instead of each section re-fetching
  independently. Replaces `EditorialHomePlaceholder` as
  `app/(public)/page.tsx`'s editorial-template branch.
- `styles/editorial.css`: added the hero/next-match/matchday-gallery/story
  rules and their 1050px/800px/540px responsive variants, all scoped under
  the existing `[data-site-template="editorial"]` wrapper and deriving every
  color from the existing `--club-*` custom properties (no new hex values).
  Removed the now-unused `.editorial-placeholder` rules.
- `components/editorial/EditorialMotion.tsx` was **not modified** — its
  existing `.hero`, `.hero-media > img`, `.hero h1`, `.hero-intro`,
  `.hero-cta`, `section:not(.hero)`, and `.match-side`/`.fixture-row` card
  selectors already matched the new markup exactly (the phase-3 agent had
  deliberately pre-built these as safe no-ops), so scroll-reveal, hero
  parallax, and card stagger now animate real content with zero motion-layer
  changes.
- No kit/store or sponsor content anywhere (Starter tier only has `about`,
  `branding`, `homepage`, `roster`, `schedule` per `lib/club-features.ts`,
  which was not touched); no season selector. `/shop` gating is untouched
  and out of scope. No classic component was touched.

### Lions L5 — real Starter editorial roster page and `/staff` redirect (2026-08-12)

Added the editorial template's `/roster` page: a compact right-aligned
filter control, non-interactive Starter player/staff cards, and the
`/staff -> /roster#staff` redirect, matching the approved mockup's
documented Starter-tier behavior exactly.

- `components/editorial/EditorialPlayerCard.tsx`: non-interactive
  (`data-interactive="false"`, `<article>` not `<button>`, no click handler,
  no modal) Starter player card ported from the mockup's `PlayerCard.tsx`.
  Big jersey number, position label, small-first/big-last name typography
  via an exported `splitPlayerName` helper (splits on the last space — the
  real seed stores one combined `name` string rather than the mockup's
  separate `firstName`/`lastName` fields), and a full-color crest fallback
  (arriving as a `crestUrl` prop, never a hardcoded club asset) when
  `player.image` is empty, which is every seeded Lions player today (L2
  seeded no player photos).
- `components/editorial/EditorialStaffCard.tsx`: the same non-interactive
  treatment for staff, ported from `StaffCard.tsx`. Initials are derived
  from the name via an exported `staffInitials` helper rather than trusting
  the stored `staff.initials` column, which defaults to `''` and is never
  populated by the Lions seed — verified this against the actual seed
  before assuming it, per the phase brief.
- `components/editorial/EditorialRosterView.tsx` (presentational) +
  `components/editorial/EditorialRoster.tsx` (fetch container): split
  following the `EditorialHome`/`EditorialNextMatch` convention from L4 so
  the view stays independently testable without mocking Supabase. The
  container fetches once via the existing generic tenant-scoped
  `fetchRoster`/`fetchStaff` (no duplicate query added — reused the same
  functions the classic `/roster` page already calls) and passes the
  result down. The view opens directly with the filter control — no roster
  hero or introductory marketing copy — and renders Goalkeepers ->
  Defenders -> Midfielders -> Forwards (each with a player count) followed
  by a separate "Technical staff" section anchored `#staff`. Filter changes
  use Framer Motion (`AnimatePresence`/`motion.*`) for the exit/reveal
  transition with synchronized card rows, confirmed against the mockup's
  actual `RosterScreen.tsx` (not assumed) before building it. Pure filter
  logic (`visibleGroupsForFilter`, `showsStaffSection`,
  `resultLabelForFilter`, `playersByPosition`) is extracted and exported
  for direct unit testing, independent of animation timing.
- `framer-motion` was not already a dependency (checked `package.json`
  first, per the phase brief) — added `^13.1.0`, compatible with the
  existing React 19 peer range.
- `EditorialMotion.tsx` was **not modified** — its `.player-card`/
  `.staff-card` GSAP ScrollTrigger stagger selectors were already pre-built
  as a safe no-op since L3, so the roster page's scroll-into-view reveal
  and the Framer Motion filter transition now run as two genuinely
  different, coexisting animation systems, exactly matching what the
  mockup's own `PublicMotion.tsx` + `RosterScreen.tsx` combination does.
- `styles/editorial.css`: ported the mockup's `.roster-*`/`.player-card*`/
  `.staff-card*` rules (base + 1050px/800px/540px responsive variants,
  matching the file's existing breakpoints exactly), scoped under the
  existing `[data-site-template="editorial"]` wrapper. Intentionally
  omitted the mockup's `[data-interactive="true"]` hover-state rules and
  all stats/hint markup — Starter never sets that attribute or renders
  those elements, so porting inert CSS for a Pro-only future state was
  judged not worth the dead weight.
- `app/(public)/roster/page.tsx`: added the same `club.siteTemplate ===
  "editorial"` client dispatch that `app/(public)/page.tsx` established in
  L3, reusing `next/dynamic` for the editorial import. The existing classic
  `RosterPage` function was renamed `ClassicRosterPage`, since leaving it
  un-renamed and adding an early conditional return in front of it would
  violate React's rules of hooks (the classic branch has extra
  `useState`/`useEffect`/`useRef` calls the dispatcher itself does not) —
  checked `app/(public)/page.tsx`'s equivalent dispatcher first and
  confirmed it has no such extra hooks, so this repository had not
  previously exercised that constraint.
- `/staff`: added `app/(public)/staff/page.tsx` (client dispatcher:
  `redirect("/roster#staff")` for editorial, `notFound()` for classic —
  classic never had a `/staff` route, so this preserves the exact same 404
  outcome instead of introducing new classic-facing behavior) and its
  `app/%5Fclubs/[slug]/staff/page.tsx` mirror, matching the roster mirror's
  `export { default } from ...` pattern exactly. Discovered and fixed a
  necessary `middleware.ts` gap: `PUBLIC_TENANT_PATHS` is an explicit
  allowlist gating which paths get rewritten to `/_clubs/{slug}/...` (where
  `ClubContextProvider` actually exists); a path missing from it bypasses
  tenant resolution entirely and would crash `useClubContext()`. Added
  `/staff` to that Set — a strictly additive change that does not alter any
  existing path's behavior.
- No `/roster/[playerId]` route, no stats, no hover state, no profile
  modal — explicitly Pro/future scope per the phase brief. No
  `lib/club-features.ts`, classic component, or classic route was touched.
- **Real bug found and fixed during manual browser verification, not by
  the automated suite**: a genuine React hydration mismatch. The
  `.roster-filter-flash` span was originally rendered conditionally
  (`{!prefersReducedMotion && <motion.span .../>}`), copied from the
  mockup's pattern. `useReducedMotion()` always returns `null` (falsy)
  during SSR — confirmed by reading `motion-dom`'s source — so the server
  always rendered the flash span, while a real reduced-motion *client*
  renders `true` and omits it, producing a structural tree mismatch caught
  only by loading the page in an actual `reducedMotion: "reduce"` browser
  context (the automated contract suite, which renders via
  `renderToStaticMarkup` and never executes effects, could not have caught
  this). Fixed by always mounting the span and expressing reduced motion
  only through prop *values* (permanently transparent, zero duration),
  which does not change element presence/position and is therefore safe
  for hydration. Reverified with a real reduced-motion browser context:
  zero page errors.
- Added `tests/contracts/editorial-roster.test.ts` (23 tests): card
  non-interactivity (article not button, no `onClick`/`useState`/`Modal` in
  source) for both player and staff cards, number/position/name-split
  rendering, crest-fallback vs. real-photo image source selection,
  single-word name splitting, staff-initials derivation from name, the
  pure filter-logic helpers exercised directly (not just through
  animation), real seeded 2/6/6/4 group order and counts plus 18/5 total
  card counts rendered in a real `EditorialRosterView` render, no
  stats/season-selector/sponsor content, the reduced-motion source
  contract plus a real reduced-motion render assertion that doesn't throw,
  the `/roster` and `/staff` dispatch wiring (including the middleware
  allowlist entry), and a classic-component regression check. No existing
  test was deleted, skipped, marked todo, loosened, or broadly mocked.
- **Test-infrastructure fix required and made, documented here because it
  affects how every future contract test that imports `lib/queries.ts` (or
  anything else built on `lib/supabase.ts`) must behave**: plain `vitest`
  never shared Next.js's own `.env.test` auto-loading, so importing
  `lib/queries.ts` for the first time from a contract test threw
  `supabaseUrl is required` at import time before any test ran (no prior
  contract test had imported anything built on `lib/supabase.ts`, so this
  gap was latent). `vitest.config.ts` now loads `.env.test` via Vite's
  `loadEnv("test", ...)` and assigns only variables not already present in
  `process.env`, so a real shell/CI-exported value always wins.
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the same local
  loopback values already used by `SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY`)
  were added to `.env.test`/`.env.test.example`. `resolveMediaReferences`/
  `resolveMediaStoragePath` already short-circuit under `NODE_ENV=test`, so
  no test makes a real network call from this — it only stops
  `createClient()` from throwing at module load. This same gap was silently
  failing `npm run test:db` in this sandboxed session before the fix (61
  failures with `Expected 3 parts in JWT; got 1`, because
  `SUPABASE_TEST_ANON_KEY` was resolving to `createLocalClients()`'s
  placeholder fallback string instead of the real local key); the fix
  resolved that too. This was a pre-existing environment gap unrelated to
  the Lions feature work, not a regression introduced by it.
- Added `tests/contracts/editorial-home.test.ts` (17 tests): section order
  and composition, the locked two-line hero headline, next-match resolution
  against the real seeded 2026 fixture data (resolves to Capital City
  Athletic on 2026-08-15, latest result LFC 2–1 SVF, exactly as the real
  seed produces against today's real system clock), the opponent monogram
  fallback, the slideshow rendering exactly the seeded photos in seeded
  order, autoplay/reduced-motion/pause/control source assertions, the
  slideshow hiding gracefully with an empty photo list, the story excerpt
  and `/club` link, an explicit no-sponsor/store/kit assertion across every
  new component, and a classic-tenant regression check. Updated
  `tests/contracts/editorial-template.test.ts`'s "classic home renders /
  editorial home renders" test to render the real `EditorialHome` instead of
  the retired placeholder; no other existing test was deleted, skipped,
  marked todo, loosened, or broadly mocked.

### Lions L6 — real Starter editorial schedule + match-area pages (2026-08-12)

Added the editorial template's `/schedule` page (month rail, All/Upcoming/
Results status tabs, solid-color matchup cards) and the per-fixture
`/schedule/[fixtureId]` match area, matching the approved mockup's
`ScheduleScreen`/`ScheduleMatchCard`/`MatchAreaScreen` design.

- Extended `lib/data.ts`'s `Fixture` type and `lib/db-types.ts`'s `DBMatch`
  type with `id`/`attendance`/`scorers` (all optional on `Fixture`, so no
  other caller — including the legacy static `schedule` array and every
  existing test's hand-built fixtures — needed a change) and taught
  `lib/queries.ts`'s `mapFixture` to surface them: `id` passes through
  directly, `attendance` passes through raw (`number | null`, matching the
  nullable DB column), and a new `normalizeScorers` helper filters the
  jsonb `scorers` column to a string array or `undefined` when absent, so
  the one pre-existing exact-shape unit test in
  `lib/__tests__/queries.test.ts` needed only a single, genuinely-justified
  addition (`id`) to its expected object rather than any loosening.
- Extended `lib/queries.ts`'s `fixtureKickoff` with an optional second
  `timeZone` parameter (backward compatible — every existing 1-arg caller,
  including `findNextFixture`/`findLatestResult`/`EditorialNextMatch`, is
  unchanged). With a zone, it converts the club-local stored wall-clock
  date/time into a genuinely correct UTC instant using the same
  round-trip-offset technique the classic schedule page's own
  `fixtureDateTime` already uses for its hardcoded `America/Los_Angeles`,
  generalized to an arbitrary IANA zone (`club_identity.time_zone`,
  `America/New_York` for Lions) instead of duplicating that math a second
  time.
- `lib/opponent-monogram.ts`: extracted the multi-letter opponent-monogram
  derivation (`"Capital City Athletic"` → `"CCA"`) that `EditorialNextMatch`
  already had inline in L4 into a shared function, now reused by both
  `EditorialNextMatch` and the new `EditorialScheduleMatchCard` instead of
  being duplicated a second time. This is unrelated to the classic
  template's `components/OpponentCrest.tsx`, which derives a different
  single-letter initial for its own visual treatment.
- `components/editorial/EditorialIdentityContext.tsx` +
  `EditorialShell.tsx`: added `crestOnDarkUrl` (already resolved with the
  L3/L4 fallback-to-primary-crest behavior baked in by
  `fetchEditorialCrests`) to the shared identity context alongside the
  existing `identity`/`crestUrl`, so schedule surfaces can reuse the same
  crest the footer already receives without a second fetch.
- `components/editorial/EditorialScheduleMatchCard.tsx`: solid-color
  matchup card — Lions' crest-on-dark (or an initials fallback) on
  whichever side (`fixture.home`) Lions actually play, an opponent text
  monogram (no opponent crest assets are seeded for Lions), the recorded
  score in home-left/away-right order for played fixtures or the kickoff
  time for upcoming ones, a `data-outcome="W"|"L"|"D"` chip derived from
  `roseCityScore`/`opponentScore` directly (independent of home/away side —
  verified this against the mockup's own `result.clubScore >
  result.opponentScore` logic before assuming it), a `<dl>` of date/venue
  formatted through `fixtureKickoff(fixture, timeZone)` plus an explicit
  `timeZone` option on `Intl.DateTimeFormat`, and an action link (`"Go to
  next match"` when `isNext`, else `"Match area →"`) omitted entirely via
  `showAction={false}` for its reuse inside the match area.
- `components/editorial/EditorialScheduleView.tsx` (presentational) +
  `EditorialSchedule.tsx` (fetch container): titled "Team schedule". The
  container fetches once via `fetchActiveSeason`/`fetchSchedule` — the same
  tenant-scoped helpers the classic `/schedule` page already calls, no
  duplicate query added — and passes the active season's fixtures down.
  The view renders a month rail built from the fixtures' actual distinct
  months (`distinctMonths`), defaulting to the month of the first upcoming
  fixture (`initialMonthKey`, falling back to the last fixture's month when
  every fixture has been played, then to the current month when the list is
  empty — mirroring the mockup's own `initialMonth`), an unboxed
  All/Upcoming/Results status-tab row using the `--club-secondary`-derived
  `--accent` token for its active marker (never a hardcoded color), and a
  Framer Motion `AnimatePresence` exit/reveal transition on month/filter
  change with a `prefers-reduced-motion` fallback, following the exact
  pattern L5's roster filter established. `isPlayedFixture`,
  `visibleFixturesForFilter`, and `firstUpcomingFixtureId` are pure,
  exported helpers, following the roster view's convention of keeping
  filter logic independently unit-testable. No season selector renders
  anywhere — Starter is locked to the single active season
  (`lib/club-features.ts` was not touched and was re-confirmed to never
  grant `seasons` to Starter) — not even a disabled placeholder.
- `components/editorial/EditorialMatchArea.tsx` (+ exported
  `MatchAreaContent` presentational piece, so the found/not-found states and
  the played/upcoming eyebrow can be rendered and tested directly without
  mocking the fetch effect, following the same testability motivation as
  L5's container/view split): back link to `/schedule`, an eyebrow reading
  "Next match" (upcoming) or "Match report" (played), the match card
  without its action link (`showAction={false}`), and an aside with
  kickoff/venue setting, `attendance` (played fixtures only, from the real
  seeded column), and `scorers` (jsonb array, played fixtures only) or a
  placeholder sentence when there's nothing to report yet. A clean
  not-found state (never a crash) renders when the requested fixture id
  isn't found in the tenant-scoped fixture list. **Reuses the same
  `fetchActiveSeason`/`fetchSchedule` tenant-scoped query
  `EditorialSchedule` uses — no duplicate query added — so a fixture id
  belonging to a different club can never resolve here**: the query is
  filtered to `club.id` from the verified tenant context (never a
  client-supplied value), backed by `onzio.matches` RLS as a second layer,
  so a foreign id simply never appears in the result set. Verified this
  explicitly at the database level (see below) rather than assuming it.
- `app/(public)/schedule/page.tsx`: added the same `club.siteTemplate ===
  "editorial"` client dispatch L3-L5 established, renaming the existing
  classic function to `ClassicSchedulePage` (its many extra
  `useState`/`useEffect`/`useRef`/`useMemo` hooks would violate React's
  rules of hooks behind an early-return dispatcher, per the exact
  constraint L5 first hit with the roster page).
- `app/(public)/schedule/[fixtureId]/page.tsx` (+
  `app/%5Fclubs/[slug]/schedule/[fixtureId]/page.tsx` mirror, matching the
  established `export { default } from ...` mirror pattern exactly):
  dispatches to `EditorialMatchArea` for editorial tenants; classic tenants
  get `notFound()`, since no classic per-fixture route existed before this
  phase (the classic fixture rows have no detail link at all) — this
  preserves the same "never existed" outcome instead of introducing new
  classic-facing behavior, mirroring the `/staff` dispatcher's precedent
  from L5.
- `middleware.ts`: `PUBLIC_TENANT_PATHS` is an exact-match `Set`, which
  cannot express the new dynamic `/schedule/[fixtureId]` segment (checked
  this against how `/roster` and `/staff` were handled in L5 first, per the
  phase brief). Added a small `isPublicTenantPath()` predicate that keeps
  the existing exact-match check and additionally allows any `/schedule/*`
  path — strictly additive, so no existing path's rewrite behavior changes.
- `styles/editorial.css`: ported the mockup's `.schedule-*`/`.match-area-*`
  rules (base + 1050px/800px/540px responsive, matching the file's existing
  breakpoint structure) scoped under the existing
  `[data-site-template="editorial"]` wrapper, deriving every color from the
  existing `--club-*`/derived tokens (no new hex values).
  `EditorialMotion.tsx` was **not modified** — its generic `section:not(.hero)`
  scroll-reveal selector already matches `.schedule-month-section` as a safe
  no-op, and `.schedule-match-card` was deliberately left out of its
  `CARD_SELECTOR` card-stagger list since Framer Motion already owns
  per-card entrance timing here, exactly mirroring how the mockup's own
  `PublicMotion.tsx` + `ScheduleScreen.tsx` combination behaves (checked
  this against the mockup before assuming it).
- `EditorialHeader`'s nav and `EditorialFooter`'s Explore column already
  linked to `/schedule` since L3/L4; confirmed (not changed) that this now
  resolves to the real page instead of the classic-only list it pointed at
  before this phase.
- No `lib/club-features.ts`, classic component, or classic route was
  touched. No stats, sponsors, or season selector anywhere.
- Added `tests/contracts/editorial-schedule.test.ts` (44 tests): month-rail
  derivation and initial-month selection against the real seeded May-Sept
  2026 fixtures, All/Upcoming/Results filtering, W/L/D chip correctness
  against real seeded Win (2026-05-09, 2-0)/Draw (2026-05-16, 1-1)/Loss
  (2026-06-06, 0-1) fixtures, home/away score orientation, "Go to next
  match" vs "Match area" labeling exercised against the real first-upcoming
  fixture id, the opponent-monogram fallback, an explicit no-season-selector
  assertion (render + source, across every new component), the schedule
  empty state, match-area attendance/scorers presence for played fixtures
  and their absence (with placeholder copy) for upcoming ones, a clean
  not-found render for an unresolved fixture, the dispatch/mirror/
  middleware wiring, and a classic-component regression check. Added
  `tests/database/editorial-schedule-isolation.test.ts` (4 tests, real
  local Supabase): proves a real Lions fixture id is not resolvable when
  queried under Alpha's tenant scope and a synthetic Alpha fixture id is not
  resolvable under Lions' tenant scope, both at the raw RLS-backed query
  level and through the real `fetchSchedule()` helper the editorial pages
  use — Alpha (not Bravo) was used because it's `active`/`live`/`pro` and
  therefore anon-readable, letting the test prove real isolation rather than
  an access-denied false negative. No existing test was deleted, skipped,
  marked todo, loosened, or broadly mocked.
- Manual browser verification (real headless Chromium, following L5's
  precedent of not trusting the automated suite alone for hydration/render
  issues): confirmed the month rail/status tabs/matchup cards render
  correctly against real seed data at desktop and mobile widths, confirmed
  a played fixture's match area shows the correct score/W-chip/attendance/
  scorers, confirmed the first upcoming fixture's match area shows "Next
  match"/"Match area" heading and no attendance/scorers section, confirmed
  an invalid fixture id renders the clean not-found state (HTTP 200, no
  crash), and confirmed Alpha's classic `/schedule` is completely
  unaffected (no `[data-site-template="editorial"]` marker, no
  `.schedule-calendar-page` markup). No hydration errors or React warnings
  were found this time — every console/network artifact observed
  (`/_vercel/insights/script.js` 404, Google Fonts `ERR_CONNECTION_RESET`,
  local-storage-object `ERR_BLOCKED_BY_ORB`) was independently reproduced on
  the untouched Alpha homepage too, confirming they are this sandbox's
  pre-existing network/environment limitations, not regressions from this
  phase.

### Lions L7+L8 — real Starter editorial club-story page and platform-wide shop tier gating (2026-08-12)

This is the final phase of the Lions FC Starter-tier public site project.
It completes the last editorial page (`/club`) L4's homepage story teaser
already anticipated, and closes a real cross-template gap: `/shop` was
previously gated by nothing at all for classic tenants, so a Starter tenant
on the classic template (Bravo) could reach it unguarded.

#### Part A — `/club` story page

- `components/editorial/EditorialClubStoryView.tsx` (presentational) +
  `components/editorial/EditorialClubStory.tsx` (fetch container): the same
  container/view split L5/L6 established. The container fetches
  `about_page_content.story_paragraphs` once via the existing tenant-scoped
  `fetchAboutClubContent` (the same helper the classic `/club/about` page and
  the homepage story teaser already call — no duplicate query added) and
  passes it to the view. Every other field — `story_heading_top/em`,
  `founded_year`, `mission`, `highlights`, `venue`, `contact_email`,
  `contact_phone`, `contact_address` — comes from the `club_identity` row the
  tenant layout already fetches once and shares through
  `useEditorialIdentity()`, so no second identity fetch was added either.
  Content, matching the mockup's `ClubScreen.tsx` structure exactly except
  for the deliberate omission below: an interior hero (`story_heading_top`/
  `_em`), a manifesto section (a founded-year "story mark" showing the
  last-two-digit derivation the mockup itself uses, e.g. "14" for 2014, with
  a `title` attribute carrying the full year for clarity; both real seeded
  story paragraphs; the `mission` as a `<blockquote>`), a `club-highlights`
  list rendering the `highlights` jsonb array (omitted entirely when empty),
  and a "Find us" info block with venue/address/email/phone — no season
  selector, no stats, no sponsor content anywhere.
- **Per Christian's already-approved decision from the planning phase, the
  mockup's decorative, non-functional contact form was deliberately NOT
  ported** — this page is story + "Find us" info only. A real contact
  page/form is explicitly deferred to a later session, not built here even
  as a disabled placeholder. Verified via both a real render assertion (no
  `<form>`/`<input>`/`<textarea>`/`<button>` in the rendered HTML) and a
  component-source assertion (no `<form`/`<input`/`<textarea`/`useState` in
  `EditorialClubStoryView.tsx`).
- `app/(public)/club/page.tsx` (+ `app/%5Fclubs/[slug]/club/page.tsx`
  mirror, the same `export { default } from ...` pattern the roster/
  schedule/staff mirrors already use): the same `club.siteTemplate ===
  "editorial"` client dispatch L3–L6 established. Classic tenants never had
  a `/club` route at all (only `/club/about` and `/club/logo`, both nested
  one level deeper under `app/(public)/club/`) — this dispatcher preserves
  that exact prior 404 outcome instead of introducing new classic-facing
  behavior, mirroring the `/staff` and `/schedule/[fixtureId]` precedent.
  Confirmed no route collision: `/club` (`app/(public)/club/page.tsx`),
  `/club/about`, and `/club/logo` are three distinct Next.js routes.
- `middleware.ts`: added the exact-match `"/club"` entry to
  `PUBLIC_TENANT_PATHS` (a strictly additive change — `/club/about` and
  `/club/logo` were already present) so the new dynamic-imported route
  resolves real club context through `ClubContextProvider` instead of
  crashing on `useClubContext()`.
- `styles/editorial.css`: added a new "CLUB STORY PAGE" section (`.interior`,
  `.interior-hero`, `.manifesto`/`.story-mark`, `.club-highlights`,
  `.find-us`/`.find-us-grid`/`.find-us-item`) ported from the mockup's
  `.interior-hero`/`.manifesto` rules (the "Find us" card layout is this
  phase's own addition, replacing the mockup's form+info grid with a
  two-item info-card grid since there's no form), plus 800px/540px
  responsive rules following the file's existing breakpoint structure. Every
  rule is scoped under the existing `[data-site-template="editorial"]`
  wrapper and derives every color from the existing `--club-*`/derived
  tokens — no new hex values.
- Confirmed (not changed) that the homepage's "Our story" teaser link built
  in L4 — which pointed to `/club` before the page existed — now resolves to
  the real page, both via direct navigation and via a real click-through from
  the rendered homepage link.
- Added `tests/contracts/editorial-club-story.test.ts` (16 tests): real
  server renders of the interior hero/story paragraphs/story mark/mission
  blockquote/highlights list (present and empty-list cases)/Find us block
  against a real seeded-shaped `club_identity` fixture; the no-contact-form
  assertion (render + source); a safe-empty-state render outside any
  identity data; a data-driven-only source assertion (no hardcoded Lions
  copy); the container's single-fetch source assertion; the dispatch/mirror/
  no-collision/middleware wiring; and a classic-component regression check.
  No existing test was deleted, skipped, marked todo, loosened, or broadly
  mocked.

#### Part B — platform-wide Starter shop gating

Per Christian's already-approved decision, `/shop` and its nav link are now
gated by tier **platform-wide** — not just for the editorial template. This
is a real behavior change to the existing classic-template Bravo tenant
(Starter), which previously showed Shop completely unguarded (no nav
condition and no gate on direct URL visits).

- `lib/club-features.ts`: no functional change was needed — `clubHasFeature`
  already grants every feature unconditionally to `"pro"` and only checks
  the `STARTER_FEATURES` allowlist for `"starter"`, and `"shop"` was never
  in that allowlist (`about`, `branding`, `homepage`, `roster`, `schedule`
  only). Added a code comment making this Pro-only-by-omission mechanism
  explicit and pointing at the two call sites below, since nothing in the
  file previously documented it. Extended the existing
  `tests/contracts/authorization.test.ts` `clubHasFeature` table with
  `["starter", "shop", false]` alongside the pre-existing `["pro", "shop",
  true]` case (an addition, not a loosening).
- `components/Nav.tsx` (classic nav): split the module-level `navLinks`
  constant into `BASE_NAV_LINKS` (Home/Roster/Club/Schedule) and a separate
  `SHOP_NAV_LINK`, appended only when `clubHasFeature(club.tier, "shop")` is
  true, computed per-render from the real tenant `club.tier` — not a
  hardcoded slug/tier check.
- `app/(public)/shop/page.tsx` (its `app/%5Fclubs/[slug]/shop/page.tsx`
  mirror already re-exports it, so it inherited the gate automatically):
  added the same `clubHasFeature(club.tier, "shop")` check, calling
  `notFound()` when false — so a direct URL visit from a Starter tenant also
  404s, not just the nav link disappearing. This repository had no prior
  precedent for a Pro-gated *public* route to copy exactly (the existing
  `clubHasFeature` call sites are both server-side authorization checks —
  `lib/authorization.ts` for admin mutations and `lib/media-processing.ts`
  for upload surfaces — not public page rendering); the `notFound()` pattern
  used here mirrors the established "route never existed for this tenant"
  precedent the `/staff` and `/schedule/[fixtureId]` dispatchers already set
  for template-based gating, applied here to tier-based gating instead.
- The editorial template's `EditorialHeader`/`EditorialFooter` (built in L3)
  already had no Store link at all — confirmed this is still correct and
  requires no change: it was a deliberate hardcoded omission documented in
  L3 (Starter-only scope for this entire project), not something the
  platform-wide gating needed to take over, since no editorial Pro tenant
  exists locally and a Pro editorial store is explicitly out of scope for
  this whole project. Also confirmed the underlying gate is real and
  tier-driven, not template-driven: `app/(public)/shop/page.tsx` has no
  template branch at all, so before this phase an editorial+Starter tenant
  that reached `/shop` by direct URL (it was already in `middleware.ts`'s
  `PUBLIC_TENANT_PATHS`) would have rendered the unstyled classic shop
  markup outside the editorial shell — this phase's tier gate closes that
  latent gap too, as a side effect of being tier- rather than
  template-based.
- Added `tests/contracts/shop-tier-gating.test.ts` (9 tests): real Nav
  renders proving the Shop link appears for an Alpha-shaped Pro club context
  and is absent for a Bravo-shaped Starter club context; a direct
  `clubHasFeature` truth-table check; source assertions that the gate goes
  through `clubHasFeature` (not a hardcoded slug/tier literal) in both
  `Nav.tsx` and `shop/page.tsx`; the shop mirror-export assertion; a
  regression check that `EditorialHeader`/`EditorialFooter` still contain no
  Store/Shop markup; a Lions-shaped (Starter, editorial) `clubHasFeature`
  check confirming the same tier gate applies regardless of template; and a
  Pro-behavior-preservation assertion that `shop/page.tsx` still renders the
  full `ShopKitSectionContainer`/`ShopPhotoStripContainer`/
  `ShopPurchaseDetailsContainer` composition. No existing test was deleted,
  skipped, marked todo, loosened, or broadly mocked.

#### Verification sweep

Ran every gate (`tsc`, `lint`, `test:db`, `test:contracts`, `test:architecture`,
`test`, `db:types:check`, `supabase db lint`, `build`) — see the L7+L8 gate
below. Repo-wide static scan for `/storage/v1/render/image/`,
`supabase-image-loader`, and `ydvggllbrswfchgjhjhr.supabase.co` found zero
matches in any real application source (`app/`, `lib/`, `components/`,
`scripts/`, `styles/`, `middleware.ts`); the only repo-wide matches are in
tests that assert the patterns' *absence*, and in documentation describing
the ban — exactly the same posture every prior phase's scan confirmed.

Full manual regression pass (real headless Chromium via `playwright-core`,
against `npm run dev` and the already-running local Supabase stack, desktop
1440px and mobile 390px widths, plus a real `reducedMotion: "reduce"`
browser context) covered all four editorial pages for Lions and the classic
tenants:

- `/club` (desktop and mobile): interior hero renders `story_heading_top`/
  `_em`; both real seeded story paragraphs render; the story mark shows
  "14" (derived from `founded_year: 2014`); the mission blockquote renders;
  all 3 seeded highlights render as a plain list; the Find us block shows
  the real seeded venue ("Scioto Field"), address, `mailto:` email, and
  phone; zero `<form>` elements; no horizontal overflow at either width;
  zero console/page errors.
- Homepage → `/club`: the "Our story" teaser's `href="/club"` was confirmed,
  then a real click-through navigation was exercised end to end, landing on
  a fully rendered `/club` page.
- `/` (home), `/roster` (23 real cards: 18 players + 5 staff), `/schedule`
  (month rail + 5 months), a played fixture's `/schedule/[fixtureId]`
  (correct "Match report" eyebrow, attendance, and scorers), an upcoming
  fixture's `/schedule/[fixtureId]` (correct "Next match" eyebrow, no
  attendance/scorers section), and an invalid fixture id (clean HTTP 200
  not-found render, no crash) — all confirmed correct.
- `/staff` still redirects to `/roster#staff`.
- Header scroll transition: `data-scrolled="false"` at `scrollY === 0` on
  home, `data-scrolled="true"` after scrolling — unchanged from L3.
- Mobile menu: opens, locks `document.body.style.overflow`, panel visible —
  unchanged from L3.
- `prefers-reduced-motion`: the matchday slideshow does not autoplay (stays
  on slide 0); the roster filter (a native `<select id="roster-filter">`,
  confirmed via DOM inspection — not buttons, unlike the schedule page's
  status tabs) still functions correctly, narrowing to exactly 6
  midfielders.
- Cross-tenant regression: Alpha (classic, Pro) — zero
  `[data-site-template="editorial"]` markers on `/`; `/roster` and
  `/schedule` unchanged; **`/shop` still returns HTTP 200 with the full real
  shop composition and the Nav still shows the Shop link** — Pro behavior is
  provably unchanged; `/club` correctly 404s (classic never had this
  route). Bravo (classic, Starter, private preview) — `/` still 404s under
  its pre-existing onboarding/preview lifecycle gating (unrelated to this
  phase, unchanged); `/shop` also 404s, though for an anonymous visitor this
  is indistinguishable from the pre-existing private-preview 404 since
  tenant-lifecycle gating runs first in `middleware.ts` — Bravo's classic/
  Starter tier-gating *logic itself* (not the live network response, which
  private-preview gating already made unreachable for anon visitors before
  this phase) is directly proven by `shop-tier-gating.test.ts`'s
  Bravo-shaped `ClubContext` fixture, which exercises the exact same
  `clubHasFeature`/`Nav.tsx`/`shop/page.tsx` code path Bravo's real requests
  run through.
- Three benign, pre-existing findings were investigated and confirmed
  unrelated to this phase rather than assumed away: (1) a generic
  `pageerror: Event` on any classic-template `notFound()` dispatch page,
  confirmed via a side-by-side diagnostic to also fire identically on the
  pre-existing L5 `/staff` classic-404 path (tied to this sandbox's blocked
  font/analytics requests, not a real exception); (2) a Next.js Link
  prefetch-then-navigate `ERR_ABORTED` network cancellation on the `/club`
  soft-navigation request, standard Next.js router behavior, not a
  functional failure (the same test's next assertion confirms the
  destination page actually rendered real content); (3) a Framer-Motion
  SSR/client style-attribute hydration console warning on the roster
  filter's decorative flash span under `reducedMotion: "reduce"`
  (`style={{opacity:0}}` vs. `style={{opacity:"0",transform:"none"}}`) —
  confirmed pre-existing (this phase touched no roster/motion/framer-motion
  files at all) and non-blocking (no thrown exception, the roster filter
  itself still narrows correctly), so out of this phase's scope; not
  filed as a new bug fix here since it predates L7+L8 entirely and fixing
  it would mean touching L5's motion/roster code, outside this phase's
  Part A/B scope.
- Dev server was stopped after verification; `ps aux` confirmed no
  `next-server`/`next dev` process remained, and no Chromium process
  remained either.

No existing test was deleted, skipped, marked todo, loosened, or broadly
mocked. No ad hoc verification script was checked into the repository.

## Verification

### Lions L7+L8 gate — 2026-08-12

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with the pre-existing legacy warnings (3 useMemo dependency
  warnings in app/admin/(protected)/analytics/page.tsx, unrelated to this
  phase)

npm run test:db
  65/65 passed across 8 files (unchanged from L6 — no schema change this
  phase)

npm run test:contracts
  317/317 passed across 23 files (added tests/contracts/editorial-club-
  story.test.ts and tests/contracts/shop-tier-gating.test.ts; extended
  tests/contracts/authorization.test.ts)

npm run test:architecture
  18/18 passed

npm test (with loopback-only local Supabase values)
  643/643 passed across 53 files

npm run db:types:check
  generated definitions match the local schema (unchanged — no migration
  this phase)

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  two new routes generated versus L6: /club and its
  /_clubs/[slug]/club mirror
```

Static scan (repo-wide, excluding `node_modules`/`.git`):

```text
grep -r "/storage/v1/render/image/" .
  zero matches in application source (app/, lib/, components/, scripts/,
  styles/, middleware.ts); only in tests asserting its absence and docs
  describing the ban

grep -r "supabase-image-loader" .
  zero matches in application source; only in tests/docs

grep -r "ydvggllbrswfchgjhjhr.supabase.co" .
  zero matches anywhere in the repository
```

### Lions L6 gate — 2026-08-12

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with the pre-existing legacy warnings (3 useMemo dependency
  warnings in app/admin/(protected)/analytics/page.tsx, unrelated to this
  phase)

npm run test:db
  65/65 passed across 8 files (added
  tests/database/editorial-schedule-isolation.test.ts)

npm run test:contracts
  291/291 passed across 21 files (added
  tests/contracts/editorial-schedule.test.ts)

npm run test:architecture
  18/18 passed

npm test (with loopback-only local Supabase values)
  617/617 passed across 51 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  28 routes generated (2 more than L5: /schedule/[fixtureId] and its
  /_clubs/[slug]/schedule/[fixtureId] mirror)
```

### Lions L5 gate — 2026-08-12

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with the pre-existing legacy warnings

npm run test:db
  61/61 passed across 7 files

npm run test:contracts
  254/254 passed across 20 files

npm run test:architecture
  18/18 passed

npm test (with loopback-only local Supabase values)
  576/576 passed across 49 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  27 routes generated (2 more than L4: /staff and its /_clubs/[slug]/staff
  mirror)
```

Manual proof against the local Supabase stack (`npm run dev`, real headless
Chromium via `playwright-core`; the dev server was restarted once, with
`.next` cleared, after an unrelated stale-cache webpack error surfaced from
running `npm run build` against the same `.next` directory a running `npm
run dev` was using — not a defect in this phase's code, confirmed by a
clean restart producing zero errors):

- `http://lions.localhost:3000/roster` renders all 18 seeded players (2
  goalkeepers, 6 defenders, 6 midfielders, 4 forwards — matching the real
  seed exactly) and all 5 seeded staff, in Goalkeepers -> Defenders ->
  Midfielders -> Forwards -> Technical staff order, with a compact
  right-aligned filter control and no roster hero. Every one of the 23
  cards carries `data-interactive="false"` (zero carry `"true"`); all 23
  card images loaded successfully (`naturalWidth > 0`) and are the real
  seeded Lions crest — expected, since L2 seeded no per-player photos.
  Clicking a player card mounted no modal/dialog; hovering it produced no
  class change. Selecting "Midfielders" in the filter correctly narrowed
  the DOM to exactly the `midfielders` group with 6 cards; selecting
  "Technical staff" correctly showed 0 position groups and 5 staff cards.
  Zero console/page errors.
- A real reduced-motion browser context (`reducedMotion: "reduce"`)
  produced zero page errors and the filter still correctly narrowed the
  DOM on selection — this is the run that caught and confirmed the fix for
  the hydration mismatch described above.
- `http://lions.localhost:3000/staff` navigated to
  `http://lions.localhost:3000/roster#staff` (confirmed via both `curl`
  303/307 inspection and a real browser's final resolved URL).
  `http://alpha.localhost:3000/staff` returned HTTP 404, matching its
  exact pre-existing behavior (Alpha never had a `/staff` route).
- `http://alpha.localhost:3000/roster` (classic) has zero
  `[data-site-template="editorial"]` elements and its existing `<nav>`
  intact — completely unaffected. Its player/staff counts render as `0`
  because Alpha's synthetic Phase 2 fixture seeds no `onzio.players` rows
  at all (confirmed via `grep` on `supabase/seed.sql` — the only
  `insert into onzio.players` statement in the file is the Lions block),
  a pre-existing condition unrelated to this phase, not a regression.
- Mobile viewport (390×844): `document.body.scrollWidth === window.innerWidth
  === 390` on `/roster` — no horizontal overflow. A screenshot at both
  desktop (1440px) and mobile (390px) widths was visually reviewed: crest
  placeholder cards render as intentional match-poster tiles (large ghost
  number, crest badge, number/position line, small-first/big-last name),
  not as broken images.
- Dev server process was stopped after verification; `ps aux` confirmed no
  `next-server`/`next dev` process remained. All ad hoc verification
  scripts used during this phase were deleted before the final commit —
  none are checked in.

### Lions L4 gate — 2026-08-12

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with the pre-existing legacy warnings

npm run test:db
  61/61 passed across 7 files

npm run test:contracts
  231/231 passed across 19 files

npm run test:architecture
  18/18 passed

npm test (with loopback-only local Supabase values)
  553/553 passed across 48 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  25 routes generated
```

Manual proof against the local Supabase stack (`npm run dev`, real headless
Chromium via `playwright-core`):

- `http://lions.localhost:3000/` renders all four sections with real seeded
  data: hero headline `"Capital City." / "Roar as One."` as two locked
  `<span>`/`<em>` lines; Next Match resolves to Capital City Athletic,
  "August 15, 2026", Scioto Field, "Away", competition "Midwest Premier
  League", and latest-result footer "LFC 2–1 SVF"; the matchday gallery
  renders exactly 4 slides; the story teaser shows heading "A club shaped by
  / Columbus.", the seeded about-page excerpt, and links to `/club`. No
  "sponsor", "partner", or "store" text appears anywhere on the page.
- Slideshow interaction, desktop viewport: autoplay advances slide 0 → 1
  after ~4.5s; hovering the section pauses it (stays on 1 through another
  4.5s wait); moving the pointer away resumes autoplay (1 → 2); clicking the
  "Next matchday photo" arrow advances directly (2 → 3).
  `reducedMotion: "reduce"` in a fresh browser context: slide stays at 0
  after a 5s wait — no autoplay.
- Mobile viewport (390×844): hero renders full-width with no horizontal
  overflow (`document.body.scrollWidth === window.innerWidth === 390`), the
  148deg mobile hero gradient is active, and `.hero-content`/`.match-meta`
  collapse to a single column.
- `http://alpha.localhost:3000/` (classic) has zero
  `[data-site-template="editorial"]`, `.site-header`, or `.hero` elements in
  the live DOM — completely unaffected.
- Two console-level warnings observed during manual verification are
  pre-existing and unrelated to this phase, not introduced by it: a 404 for
  `/_vercel/insights/script.js` (Vercel Analytics unavailable in this
  sandbox) and a blocked `fonts.googleapis.com` request from
  `styles/globals.css`'s unconditional Google Fonts `@import` (a
  classic-template stylesheet loaded regardless of template, blocked only
  because this sandbox has no outbound access to Google Fonts — the
  editorial template deliberately vendors Geist locally for exactly this
  reason, per L3).
- Dev server process was stopped after verification; `ps aux` confirmed no
  `next-server`/`next dev` process remained.

### Lions L3 gate — 2026-08-12

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with the pre-existing legacy warnings

npm run test:db
  61/61 passed across 7 files

npm run test:contracts
  214/214 passed across 18 files

npm run test:architecture
  18/18 passed

npm test (with loopback-only local Supabase values)
  536/536 passed across 47 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  25 routes generated
```

Manual regression proof, production build (`npm run build` + `npm run start`)
against the already-running local Supabase stack:

- Classic tenants unaffected: `alpha.localhost:3000/` returns HTTP 200 with
  the untouched classic `Nav`/`Footer`, zero occurrences of
  `data-site-template="editorial"` anywhere in the served markup, and (real
  Chromium check) zero `[data-site-template="editorial"]` or `.site-header`
  elements in the live DOM. `bravo.localhost:3000/` returns HTTP 404 for an
  anonymous request — pre-existing private-preview gating for its
  `onboarding`/`preview` lifecycle from the Phase 2 Alpha/Bravo fixtures,
  unrelated to this phase (Rose City has no local tenant fixture — it is
  production-only and not yet migrated — so `npm test`'s full legacy
  regression suite, green above, stands in for its local manual proof).
- Lions editorial shell verified correct in a real headless-Chromium
  session at `lions.localhost:3000/`: at scroll position 0 the header is
  transparent (`background-color: rgba(0,0,0,0)`) with white
  (`--on-dark`) nav text and the crest lockup at `opacity:0`/
  `visibility:hidden`; after scrolling, the header becomes solid/white and
  the crest reaches `opacity:1`/`visibility:visible`. Theme custom
  properties resolve to the seeded Lions palette
  (`--club-primary:#1B2958`, `--club-secondary:#AD3234`). The footer shows
  Explore (Roster/Schedule), Matchday (Scioto Field, the seeded street
  address, `mailto:hello@lionsfc.example`), and Follow (the real seeded
  Instagram/YouTube URLs), with no sponsors block anywhere in the markup.
  No "Store" text appears anywhere in the page. At a 390×844 mobile
  viewport, opening the menu renders a ~780px-tall (near-full-viewport)
  panel and sets `document.body.style.overflow: hidden`; closing it
  restores the prior value.
- Dev/production server processes were stopped after verification; `ps aux`
  confirmed no `next-server` process remained.

### Lions L2 gate — 2026-08-11

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with the pre-existing legacy warnings

npm run test:db
  61/61 passed across 7 files

npm run test:contracts
  190/190 passed across 17 files

npm run test:architecture
  18/18 passed

npm test (with loopback-only local Supabase values)
  512/512 passed across 46 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values
```

Manual end-to-end proof on a clean `supabase db reset`:

- `node scripts/seed-lions-media.mjs` published 6 assets on the first run and
  reported `published: 0, alreadyPublished: 6` on the second, with exactly six
  `onzio-media` objects, six `media.publish` audit events, and no staging
  leftovers.
- The `lions` club row is `editorial`/`live`/`starter`; `club_identity`,
  18 players, 5 staff, 11 matches (7 with scores/attendance), 4 wired
  slideshow photos, and both branding assets exist with real processed byte
  sizes, dimensions, and SHA-256 checksums.
- `http://lions.localhost:3000/` resolves the Lions tenant (HTTP 200,
  Lions-titled classic rendering, as expected before the editorial package
  exists) and the published storage objects serve directly as `image/webp`.

### Lions L0+L1 gate — 2026-08-11

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with the pre-existing legacy warnings

npm run test:db
  61/61 passed across 7 files

npm run test:contracts
  190/190 passed across 17 files

npm run test:architecture
  18/18 passed

npm test (with loopback-only local Supabase values)
  512/512 passed across 46 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values
```

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

No test was deleted, skipped, marked todo, loosened, or broadly mocked.

Known non-blocking warnings:

- four raw `<img>` warnings
- three unnecessary analytics `useMemo` dependency warnings
- the existing Supabase SSR Edge-runtime compile warning

## Known Constraints and Blockers

- `Onzio Platform Production` is healthy and its empty application state was
  verified through the Dashboard. No production migration has been applied,
  the checkout is not linked to production, and no production SQL was run.
- The exposed legacy production service-role key must never be reused. Its API
  keys are disabled and its legacy HS256 signing key is revoked; production
  configuration must use only the modern key posture.
- Rose City production freeze/import/cutover has not begun and still requires
  Christian's explicit approval.
- The staging organization is temporarily Pro for the Phase 7/Phase 8
  migration month; the architectural steady state remains Free staging after
  the migration rollback window.
- The Vercel staging project's Production scope is intentionally unused.
  Staging secrets exist only on the protected `staging` Preview branch, so
  `main` must not be treated as the hosted staging target.
- Hosted operator execution must configure the exact actor UUID allowlist in
  `ONZIO_OPERATOR_USER_IDS`; no operator application UI or route exists.
- `npm run test:db` and full database-inclusive tests need JWT-shaped local
  `ANON_KEY` and `SERVICE_ROLE_KEY` values mapped into the
  `SUPABASE_TEST_*` variables.
- A hosted environment must schedule `npm run media:cleanup` and configure the
  planned 50%, 80%, and 100% Vercel image-spend notifications.
- The development-only ESLint 8 dependency-chain findings remain until the
  planned framework/lint-tooling migration.

## Next Milestone

Phase 8 full local import rehearsal and production-provisioning gate.

**The parallel Lions FC Starter-tier public site project (L0 through L7+L8)
is now complete.** The local-dev-only synthetic `lions` tenant renders a
full Starter-tier `editorial` template public site — home, roster, schedule
+ per-fixture match area, and club story — provably isolated from every
classic tenant, with `/shop` now correctly tier-gated platform-wide (closing
a real gap where a classic Starter tenant, Bravo, previously showed Shop
unguarded). What remains explicitly deferred and out of scope, per the
originally approved plan:

- admin portal work for the Lions tenant (content is currently seed-only)
- a tryout/recruitment page
- a real contact page/form (the `/club` page intentionally omits the
  mockup's decorative form)
- Pro-tier editorial features: sponsors, stats, a Pro store, season
  switching, and player profile pages — none of these exist for the
  editorial template at all yet, since no editorial Pro tenant exists
- the real Phase 9 "new club rollout" Lions would need before ever going
  publicly live: an actual domain, real Stripe billing (Lions currently
  carries only a synthetic seeded Starter subscription), and an
  operator-provisioned real owner account (the seeded `owner@lions.local`
  is a local-dev-only fixture)

No further Lions-track work is scheduled; the next platform milestone below
is unrelated to it.

First, create the immutable Rose City database/Auth/Storage export and complete
the full local transformation/import/rollback rehearsal. Before any production
schema/data mutation, verify the Rose City source backups and object checksums,
record the freeze/rollback evidence in
`docs/phase-8/rose-city-migration-runbook.md`, and obtain separate explicit
approval to apply the reviewed migrations to the exact production ref.

Do not begin Rose City freeze/import, production migration, Auth configuration,
Storage work, production Stripe mutation, Vercel production deployment, DNS
work, webhook cutover, organization downgrade, or project deletion without the
applicable explicit approval.

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
