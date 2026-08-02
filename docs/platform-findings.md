# Onzio Platform — Open Findings Register

Last updated: 2026-08-01

This file tracks known platform-wide issues that have been **identified and
verified but not fixed**. It exists so findings discovered during scoped
epic work are not lost when that epic closes.

As of 2026-08-01, `PF-001`, `PF-003`, `PF-005`, `PF-006`, and `PF-007` are
resolved. Two findings remain open — `PF-002` and `PF-004` — both latent or
documentary. None affects a live site.

Rules for this file:

- Every finding must cite concrete evidence (file and line, or an exact
  quoted claim), not an impression.
- Every finding must state its trigger condition and honest severity — a
  latent bug that nothing currently hits is not the same as a live one.
- Nothing here is authorization to fix it. Fixes need their own scoped
  approval, and security-adjacent changes need the same gates as any other
  change to those subsystems.
- When a finding is fixed, move it to `## Resolved` with the resolving
  commit or work-package ID.

## Open

### PF-001 — Phase 9's gate claims Rose City has no tenant-specific presentation branches; six remain

> **RESOLVED 2026-08-01 — see `## Resolved` below for the resolution record.**
> The entry is retained here in full because its per-branch assessment
> remains the reference for any future extraction work.

- **Severity:** documentation-vs-reality contradiction. Not a runtime bug —
  the branches work — but the plan asserts a state that does not hold, and
  other documents rely on that assertion.
- **Evidence:** `docs/onzio-platform-plan.md`'s Phase 9 gate states "Rose
  City continues rendering and operating without tenant-specific
  presentation special cases." Six live `club.slug === "rose-city"` branches
  exist in presentation code:
  - `components/Hero.tsx:15` (`usesLegacyRoseCityHero`, gates the legacy
    hardcoded hero video)
  - `components/Nav.tsx:255`
  - `components/PhotoSlideshow.tsx:24` (`usesLegacyRoseCitySlideshow`)
  - `components/NationalityFlag.tsx:20` (`usesMigratedFlagMedia`)
  - `app/(public)/shop/page.tsx:34` (gates `ShopHero`)
  - `app/(public)/page.tsx:26` (gates `ChampionsBadge`)
- **Why it matters:** `docs/phase-11/diverse-city/EPIC.md` forbids
  introducing `club.slug === "diverse-city"` branches, and the Diverse City
  gap analysis leans on that rule as settled platform practice. A future
  agent reading the plan would reasonably believe this pattern was already
  eliminated. It was eliminated for Lions (which now resolves via
  `club.presentationTemplateKey === "clubhouse@1"` — see
  `components/Hero.tsx:103`) but not for Rose City.
- **Suggested resolution:** either extract the remaining Rose City branches
  into `cinematic@1` template capabilities the way Lions was extracted, or
  amend the Phase 9 gate wording to state the actual achieved scope (e.g.
  "new tenants render without special cases; Rose City retains N documented
  legacy branches pending extraction"). Do **not** silently reword the gate
  without deciding which is true.
- **Owner:** unassigned.

#### Correction and per-branch assessment — added 2026-07-31

The original entry above was written from a `grep` count. A direct read of
each branch found two errors in it, and established that the six are not a
homogeneous set that one "extraction" would resolve.

**Correction 1 — the count is seven, not six.** `lib/flags.ts:51`
(`clubSlug !== "rose-city"`) is a seventh occurrence. It is the actual
implementation behind `NationalityFlag.tsx:20`'s `usesMigratedFlagMedia`
flag, so any extraction of that branch must change both.

**Correction 2 — "not a runtime bug, the branches work" is false for the
Hero branch.** See `PF-005` below; the content it gates is dead in
production.

| Branch | What it gates | Nature | Extraction cost |
| --- | --- | --- | --- |
| `Hero.tsx:15` | Hardcoded hero video element and its autoplay/overlay treatment | Content is dead (`PF-005`) | **Blocked.** Cannot be extracted into a working capability until the video source question is resolved; per `DCFC-D105` a real reusable video capability is Bunny.net Stream, which is not built. |
| `Nav.tsx:255` | US Soccer, FIFA, and Lamar Hunt U.S. Open Cup affiliation marks (hardcoded `affiliationLogos` array at `Nav.tsx:15` with Rose City media UUIDs) | **Genuine reusable gap** | New content domain. Note Diverse City's approved snapshot renders the same kind of affiliation marks, so this capability is needed by the epic regardless — see `CONTENT-MATRIX.md`. |
| `PhotoSlideshow.tsx:24` | A GSAP scroll-reveal effect and a distinct legacy slideshow layout | Pure presentation | **Low.** The cleanest candidate — genuinely a `cinematic@1` template capability and nothing else. |
| `NationalityFlag.tsx:20` + `lib/flags.ts:51` | Tenant-migrated flag media vs. the bundled `flag-icon` set | Media-source selection, not presentation | Medium, and arguably mis-framed: the real question is "does this club have migrated flag assets?", which data can answer directly without a template branch. |
| `app/(public)/shop/page.tsx:34` | `ShopHero` | **Dead code** | **None — delete it.** `SHOW_SHOP_HERO` is the constant `false` (`lib/site-flags.ts:3`), so `SHOW_SHOP_HERO && club.slug === "rose-city"` renders for no club at all. This is not a tenant special case in practice. |
| `app/(public)/page.tsx:26` | `ChampionsBadge` — hardcoded "2024 / Champions", "UPSL SoCal North Conference", Rose City prose, and `/images/home/trophy.png` | Hardcoded club achievement content | New content domain (club honors/achievements). |

**What this means for the decision:** "extract the remaining branches" is
not a single refactor. One is a deletion, one is blocked on unbuilt
infrastructure, one is a clean template extraction, and three require new
normalized content domains with their own migrations, RLS, admin editors,
and contracts — scope comparable to the entire Programs/Contact/Tryouts
effort, executed against the live production tenant. Any decision to extract
should be scoped per-branch rather than taken as one commitment.

### PF-005 — Rose City's production hero video references a permanently deleted Supabase project

> **RESOLVED 2026-08-01 — see `## Resolved`.** Retained here for the
> evidence and the recoverable-source location.

- **Severity:** live production defect, silently degraded. Not cosmetic —
  the club's homepage hero has no video.
- **Evidence:** `components/Hero.tsx:254` hardcodes
  `https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/videos/Pan_Bench_Land_ready.mp4`.
  `nsgtkwqkbyxkiwrhzsje` is the legacy Supabase project recorded in
  `HANDOFF.md:968` as **permanently deleted** during the Phase 8
  operational closeout. DNS resolution on 2026-07-31 returns `NXDOMAIN` for
  `nsgtkwqkbyxkiwrhzsje.supabase.co`, while the current production ref
  `ioalthwsdrlzrubomrow.supabase.co` resolves normally.
- **Trigger condition:** always, for Rose City. Rose City's
  `presentationTemplateKey` is not `clubhouse@1`, so
  `app/(public)/page.tsx` renders `<Hero />`, which falls through to the
  legacy branch. The branch is live on `https://onzio-rcfc.vercel.app`.
- **Why it went unnoticed:** the `<video>` element carries
  `poster="/images/hero-poster.jpg"`, a local asset that still loads. When
  the video source fails, the poster remains visible, so the hero looks
  intentional rather than broken. No console-error or broken-image check
  would flag it, and the Phase 8 verification gates checked public routes
  for HTTP 200 and broken *images*, not for a dead video source.
- **Relationship to PF-001:** this is why `Hero.tsx:15` cannot simply be
  "extracted" — there is no working video behind it to extract. Resolving
  it requires deciding whether Rose City still wants a hero video and, if
  so, re-hosting the asset. Per `DCFC-D105` the approved reusable video
  capability is Bunny.net Stream, which is not built yet; the plan's Video
  Pipeline section explicitly states migrating Rose City onto it is a
  separate future decision.
- **The source video is recoverable — confirmed 2026-08-01.** It survives in
  the immutable Phase 8 frozen export at
  `/Users/christianalcala/Downloads/onzio-migration-private/rose-city-final-freeze-2026-07-27T2234Z-v2/storage/objects/videos/4f/4f8059d2f1fce01ebebc18c4a8588b28b9f6c024ff4f03a7109552389b826098-Pan_Bench_Land_ready.mp4`.
  Verified intact: 31,080,971 bytes, `ISO Media, MP4 Base Media v1`, and its
  actual `sha256` matches the checksum embedded in its filename exactly. No
  option is foreclosed by asset loss — this is purely a decision about
  intent and hosting.
- **Its size is itself an argument.** At ~29.6 MB, an autoplaying hero
  background served from Supabase Storage at $0.09/GB uncached is precisely
  the cost profile `DCFC-D105` rejected when it chose a video CDN over
  self-hosting.
- **Suggested resolution:** decide the intent first. Options are (a) remove
  the dead video element and let the poster become the intended static
  hero, (b) re-host the video and point at a live URL as an interim fix, or
  (c) fold Rose City's hero into the future Bunny.net capability. Only (a)
  is small; none should be done without deciding which outcome Christian
  actually wants for the club's homepage.
- **Owner:** unassigned. Needs Christian's decision.

### PF-006 — No contract guards against references to deleted infrastructure

> **RESOLVED 2026-08-01 — see `## Resolved`.** The contract now exists.

- **Severity:** process gap. It is the reason `PF-005` shipped silently and
  the reason an equivalent defect could ship again.
- **Evidence:** grep across `tests/` on 2026-08-01 found **no** contract,
  architecture test, or lint rule that asserts source code contains no
  reference to a decommissioned Supabase project host. The Phase 8 closeout
  permanently deleted project `nsgtkwqkbyxkiwrhzsje` and verified the
  deletion took effect (HTTP 410 / 404 / DNS removal), but nothing checked
  whether the *codebase* still pointed at it. `components/Hero.tsx:254` did,
  and still does.
- **Wider blast radius than PF-005 alone:** the same deleted host appears
  roughly thirty more times in `db/migrations/2026-07-site-sponsor-logos.sql`
  and `db/migrations/2026-07-about-club-content.sql` (sponsor logo URLs,
  About-page icon/patch/colour artwork). Those files are legacy Rose City
  seed SQL and are **not** referenced by any `package.json` or `vercel.json`
  script, so they are dead historical artifacts rather than a live defect —
  but they would seed dead URLs if anyone ever ran them, and their presence
  makes a grep for the old host noisy enough to hide a real hit like
  `Hero.tsx:254`.
- **Why it matters:** decommissioning infrastructure is a recurring
  operation for this platform (Phase 8 did it; future tenant migrations
  will). Each time, the deletion is verified from the outside — does the
  hostname still resolve — and never from the inside — does anything still
  ask for it.
- **Suggested resolution:** add a static architecture contract asserting no
  file under `app/`, `components/`, `lib/`, or `packages/` references a
  known-decommissioned host, seeded with `nsgtkwqkbyxkiwrhzsje`. Cheap,
  fast, and it fails loudly the moment someone reintroduces one. Whether to
  also delete or quarantine the dead `db/migrations/` seed files is a
  separate call. Note this contract would currently **fail** on
  `Hero.tsx:254` — which is correct, and is exactly the argument for
  resolving `PF-005` first or in the same change.
- **Owner:** unassigned.

### PF-002 — Five parallel entitlement sources of truth, two of which contradict

- **Severity:** latent bug with a specific trigger. Nothing currently breaks
  (see trigger condition), but it will misbehave for the first affected
  club, and the failure mode is silent.
- **Evidence:** entitlement is independently encoded in five places with
  no test or type tying them together:
  1. `onzio_private.club_has_feature`
     (`supabase/migrations/20260726000100_phase2_foundation.sql:301`) —
     hardcoded Starter allowlist
     `('branding', 'roster', 'schedule', 'homepage', 'about')`; anything
     else resolves Pro-only.
  2. `ADMIN_TABLE_FEATURES` (`lib/admin-data-contract.ts:3`) — maps table →
     feature string. Uses `shop` and `standings`, neither of which appears
     in the allowlist above.
  3. `moduleRegistry` (`packages/presentation/index.ts:250`) — maps module →
     `entitlement`.
  4. `STARTER_FEATURES` (`lib/club-features.ts`) — application authorization
     allowlist used by `authorizeMutation` before protected admin data writes.
  5. The `storage.objects` staging policies
     (`supabase/migrations/20260726000300_phase2_security.sql`) — independently
     map upload-path surfaces to feature strings, with unknown surfaces falling
     back to Starter-accessible `branding`.

  `DCFC-204` exposed a third reachable disagreement while adding a positive
  Starter Contact mutation contract: the database and presentation registries
  allowed Contact at Starter, but `STARTER_FEATURES` omitted `contact`, so the
  application boundary returned `FEATURE_NOT_INCLUDED`. That omission was
  corrected within `DCFC-204`; the unresolved Shop and Seasons contradictions
  below remain outside that package.

  `DCFC-301` then exposed the fifth source when `programs` became a valid media
  surface: the application route correctly denied Starter Programs uploads,
  but direct Storage upload succeeded because the policy's fallback evaluated
  the path as `branding`. Migration
  `20260802013518_dcfc_301_programs_media_entitlement.sql` now maps `programs`
  explicitly, and a real AAL2 Storage contract pins Pro success plus Starter
  403 denial. The broader duplicated-source problem remains open.

  `DCFC-302` made the Starter-accessible `contact` hero a valid media surface.
  Migration `20260802020000_dcfc_302_contact_media_entitlement.sql` names the
  `contact` → `contact` mapping explicitly instead of depending on the legacy
  Starter Branding fallback. A direct AAL2 Storage contract pins successful
  Contact upload for a Starter club. This does not add a sixth source; it makes
  Contact's entry in the existing fifth source explicit and reviewable.

  Two confirmed contradictions:

  | Subject | `moduleRegistry` | Effective RLS tier | Result |
  | --- | --- | --- | --- |
  | Shop / store | `store: starter` | `"shop"` not allowlisted → **Pro-only** | A Starter club has the store module enabled but its `shop_*` rows are invisible to `can_read_feature`; the public shop page renders empty. |
  | Seasons | `seasons: pro` | `seasons` table maps to `"roster"`, which **is** allowlisted → Starter-accessible | Opposite direction: DB permits what the presentation registry treats as Pro-only. |

  (`standings` and `sponsors` were checked and are consistent.)
- **Trigger condition:** requires a club that is simultaneously
  `tier = 'starter'` **and** `lifecycle = 'active'` / `public_access =
  'live'`. The local seed now includes Charlie as an active/live Starter
  fixture, added during `DCFC-204`, so new agreement contracts can exercise
  this trigger directly. No hosted tenant is currently known to hit it.
- **Why it matters:** `can_read_feature` gates **anonymous public reads**,
  not just admin writes, so the failure mode is a silently blank public page
  rather than an error. This is the same root cause that nearly produced a
  broken Starter-tier Contact page during `DCFC-103` (see `DCFC-D108`).
- **Suggested resolution:** establish a single source of truth for
  entitlement and derive the other four from it, or — at minimum — add a
  contract test asserting all five stay in agreement. Any change to
  `club_has_feature` must preserve `security definer`,
  `set search_path = ''`, `stable`, and fully-qualified relations per
  `AGENTS.md`.
- **Owner:** unassigned. `DCFC-202` added `'contact'` to
  `club_has_feature`, `DCFC-204` aligned `STARTER_FEATURES`, and `DCFC-301`
  aligned the Programs Storage surface. `DCFC-302` explicitly aligned the
  Contact Storage surface. Fixing the underlying `shop`/`seasons`
  contradictions remains outside those packages and must not be silently
  folded into unrelated work.

### PF-003 — The tier/feature entitlement mechanism is undocumented in the platform plan

> **RESOLVED 2026-08-01 in `DCFC-202`.** `docs/onzio-platform-plan.md` now
> carries a "How tier entitlement actually works" subsection under
> Row-Level Security, documenting the hardcoded Starter allowlist, the
> Pro-by-default behavior for unlisted feature names, the fact that
> `can_read_feature` gates anonymous public reads (so the failure mode is a
> blank page rather than an error), the `ADMIN_TABLE_FEATURES` registration
> requirement, and the security attributes any edit must preserve. Written
> while `DCFC-202` was modifying `club_has_feature`, per the plan to fix it
> where the code was already being touched.

- **Severity:** documentation gap that actively causes bugs.
- **Evidence:** `docs/onzio-platform-plan.md` describes entitlement only as
  "content enabled by that club's tier" (Row-Level Security → Public reads)
  and "an entitled feature" (Authenticated reads and writes). It never
  documents that the mechanism is a hardcoded five-string allowlist, that
  any unlisted feature name is silently Pro-only, or that
  `can_read_feature` gates anonymous public reads.
- **Why it matters:** this is a trap with no warning signs. During
  `DCFC-103` a proposed `'contact'` feature name would have made every
  Starter club's contact page render blank in public; it was caught only by
  reading the SQL directly, not from any documentation. Every future agent
  adding a tenant content table faces the same trap.
- **Suggested resolution:** document the mechanism in the plan's
  Row-Level Security section, including the allowlist's location, the
  Pro-by-default behavior for unlisted features, and the fact that it gates
  anonymous reads. Closely related to PF-002.
- **Owner:** unassigned.

### PF-004 — The Bunny.net video reference deviates from the "content references media assets" principle

- **Severity:** acknowledged design tradeoff, recorded for visibility rather
  than as a defect.
- **Evidence:** `docs/onzio-platform-plan.md` (Core Architecture →
  `media_assets`) states "Content records reference media assets rather than
  treating arbitrary URLs as authoritative." The Video Pipeline section
  added on 2026-07-31 (`DCFC-D105`) instead stores the Bunny.net video
  reference directly on the owning content row, explicitly not in
  `onzio.media_assets`.
- **Rationale for the deviation:** Bunny-hosted video cannot participate in
  the `(club_id, id)` composite-foreign-key tenant-safety pattern that
  `media_assets` relies on, and conflating an external CDN reference with
  Supabase-hosted asset rows would weaken that guarantee rather than extend
  it.
- **Why it is tracked anyway:** it introduces a second media-reference type
  alongside the documented one. If a third external media source is ever
  added, this should be generalized deliberately rather than accumulating
  ad-hoc reference styles per vendor.
- **Owner:** revisit during `DCFC-202` when the video reference column is
  actually designed.

## Resolved

### PF-007 — resolved 2026-08-01

The original audit understated the surface. A complete scan found 19 denial
scenarios that accepted any non-null error (14 direct assertions plus five
call sites behind the shared `expectDenied` helper), one private-ledger read
that converted any query error into an empty successful result, and one
rejected write whose result was ignored before checking the audit ledger — 21
false-green-prone scenarios in total.

- Added `tests/helpers/database-security.ts` with strict database and Storage
  assertions. Database checks require the exact Postgres/PostgREST code and
  fail explicitly on `PGRST204` (missing/misspelled column) or `PGRST205`
  (missing table) as test-authoring errors. Storage checks require both the
  observed HTTP-shaped status code and the expected rejection message.
- Replaced every generic denial assertion with its observed local signature:
  `42501` for grant, RLS, and RPC denials; `23503` for composite tenant foreign
  keys; `23505` for uniqueness conflicts; Storage `403` for RLS, `415` for
  unsupported SVG MIME, and `404` for the malformed public-media request.
  Private reads now assert query success plus an empty result, or the exact
  `42501` denial where the table intentionally has no browser grant. The
  rejected audit probe now asserts its own denial before checking that no
  success event exists.
- Added focused contracts proving `PGRST204`/`PGRST205` are rejected and a
  database-test architecture guard that scans every `tests/database/*.test.ts`
  file for generic non-null error assertions or query errors converted into
  empty results. This prevents the weak pattern from returning silently.
- Mutation evidence: temporarily misspelled `club_logo_path` in a real
  anonymous denial test. The focused test turned red with
  `[TEST AUTHORING ERROR] ... received PGRST204` before the original column was
  restored. This is the exact mutation that the pre-fix assertion would have
  accepted as green.
- Verification: focused affected database files 64/64; contracts 244/244;
  architecture 20/20; complete loopback database suite 70/70; TypeScript
  clean; complete loopback-mapped suite 588/588 across 59 files. Lint passed
  with only the three pre-existing analytics hook warnings, and
  `git diff --check` passed. No test was skipped, weakened, deleted, or mocked.
- Hosted mutations: none. All Supabase and Storage evidence came from the
  loopback local development stack.

### PF-005 and PF-006 — resolved together 2026-08-01

Fixed as one change, because the PF-006 contract fails while the PF-005
reference exists.

- **Resolution chosen by Christian:** option (a) — remove the dead video and
  let the poster become the intended static hero. Re-hosting and the
  Bunny.net path were both declined for now. The source video remains
  recoverable at the frozen-export path recorded in the PF-005 entry above,
  so a future decision to restore video is not foreclosed.
- **What changed in `components/Hero.tsx`:** removed the `<video>` element
  carrying the dead URL, the 43-line iOS Safari autoplay `useEffect`, the
  `videoRef`, and the `videoMounted` state and its effect — 89 lines net.
  The poster now renders directly.
- **A behavior bug was caught and fixed mid-change.** The original markup was
  `{!videoMounted && <poster/>}`, so the poster appeared only until
  `videoMounted` flipped true on mount. For non-Rose-City tenants that meant
  a brief flash and then no background image at all. Making the poster
  unconditional — the obvious simplification — would have given **every**
  non-`clubhouse@1` tenant Rose City's stadium photograph as its hero
  background. The poster is therefore scoped to `usesLegacyRoseCityHero`,
  preserving both paths exactly as they render today.
- **`usesLegacyRoseCityHero` deliberately remains.** It still gates the
  `rgba(0,0,0,0.52)` overlay and the suppression of the club-name `<h1>`.
  Removing it would visibly change Rose City's hero, so the PF-001 branch
  count stays at six.
- **What changed in `next.config.mjs`:** the new contract immediately caught
  eleven `remotePatterns` entries still allowlisting the deleted project's
  buckets. They were inert — `unoptimized: true` bypasses the optimizer, and
  the hostname is `NXDOMAIN` — but they are exactly what the contract exists
  to find. Removed; the live project is supplied dynamically from
  `NEXT_PUBLIC_SUPABASE_URL`. The pre-existing "constrains the exact Supabase
  media origin" contract still passes, since that literal path string also
  appears in the dynamic pattern.
- **The PF-006 contract** is `references no permanently deleted Supabase
  project` in `tests/architecture/platform-architecture.test.ts`, mirroring
  the existing forbidden-string pattern in the same file. It walks `app`,
  `lib`, `components`, plus `next.config.mjs`, against a
  `DECOMMISSIONED_SUPABASE_HOSTS` list — add an entry whenever a project is
  decommissioned. `lib/migration/rose-city-plan.ts` is explicitly allowlisted:
  it records the host as historical provenance for an already-completed
  import rather than fetching from it.
- **Verification:** `npx tsc --noEmit` clean; 223/223 contracts; **19/19
  architecture (up from 18)**; 53/53 database; **549/549 complete suite (up
  from 548)**; lint with only the three pre-existing analytics warnings;
  production build passed with 25 pages; `git diff --check` clean. The guard
  was proved to actually fail: a temporary probe file containing the dead
  host made the contract fail and name the file, and was then removed.
  Browser verification against a temporary local `rose-city` tenant confirmed
  zero `<video>` elements, no `nsgtkwqkbyxkiwrhzsje` reference anywhere in
  the DOM, `hero-poster.jpg` loading at its true 1920x1080, no club-name
  `<h1>`, and no console errors. The non-Rose-City path was then re-checked
  to confirm the poster does not leak. The temporary club rename and its
  `rose-city.localhost` domain row were both reverted; the local database is
  back to `alpha`/`bravo`/`lions`.
- **Not resolved by this:** the roughly thirty dead-host references in
  `db/migrations/*.sql`. Those files are legacy Rose City seed SQL wired to no
  script. The new contract does not scan `db/`, so they neither fail it nor
  get cleaned up. Deleting or quarantining them is a separate call.

### PF-001 — resolved 2026-08-01 by amending the Phase 9 gate and deleting the dead branch

- **Resolution chosen by Christian:** amend the gate to state its true
  achieved scope, and delete the one branch that was dead code. Extraction
  of the remaining branches was explicitly *not* chosen — see the per-branch
  assessment in the open-section entry above for why it is not a single
  refactor.
- **What changed:**
  - `docs/onzio-platform-plan.md`'s Phase 9 gate no longer claims Rose City
    renders without tenant-specific presentation special cases. It now
    states the achieved scope in two parts: new tenants resolve entirely
    through published presentation templates (with `clubhouse@1` as the
    worked precedent), while Rose City retains six documented legacy
    branches pending extraction. The amended gate also states explicitly
    that it does not license adding new slug branches, so
    `EPIC.md`'s prohibition on `club.slug === "diverse-city"` still rests on
    solid ground.
  - `app/(public)/shop/page.tsx` no longer contains
    `{SHOW_SHOP_HERO && club.slug === "rose-city" && <ShopHero />}`. Because
    `SHOW_SHOP_HERO` is the constant `false`, that expression rendered for
    no club, so removing it is behavior-preserving. The now-unused
    `ShopHero` dynamic import and `nextDynamic`/`SHOW_SHOP_HERO` imports
    were removed with it, and the `SHOW_SHOP_HERO ? … : …` padding ternary
    was collapsed to the `"pt-24 sm:pt-28"` value it already evaluated to.
- **Count after the change:** six occurrences remain, exactly matching the
  amended gate's wording — `Nav.tsx:255`, `Hero.tsx:15`,
  `NationalityFlag.tsx:20`, `PhotoSlideshow.tsx:24`, `page.tsx:26`, and
  `lib/flags.ts:51`.
- **Deliberately left in place:** `SHOW_SHOP_HERO` in `lib/site-flags.ts`
  and its remaining use in `Nav.tsx:138`, plus the now-unreferenced
  `components/ShopHero.tsx` and `components/ShopHeroMobile.tsx`. The flag is
  a deliberate feature toggle; deleting the components would make
  re-enabling it impossible, which is a wider call than this change was
  scoped to make. Worth a follow-up decision, but not a defect.
- **Verification:** `npx tsc --noEmit` clean; 223/223 contracts; 18/18
  architecture; 53/53 local database tests; 548/548 complete suite;
  `npm run lint` with only the three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings; production build with loopback
  Supabase env passed. Browser check of `/shop` on the local `alpha` tenant
  (which takes the same non-`clubhouse@1` path Rose City does) confirmed the
  page renders, the wrapper class is exactly `pt-24 sm:pt-28` as before, no
  `ShopHero` is present, no broken images, and no console errors.
- **Not resolved by this:** the underlying debt of six unextracted branches
  is now documented in the plan rather than contradicted by it. `PF-005`
  (the dead hero video) remains open and blocks any extraction of
  `Hero.tsx:15`.
