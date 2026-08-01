# Diverse City FC Phase 0-3 Status

Epic: `DCFC-EPIC-001`

Epic status: `phase_1_complete`

Last updated: 2026-07-31

Current assignment: `DCFC-203` — unassigned, but **partially implemented work
already exists in the working tree**. See the 2026-08-01 audit record at the
bottom of this file before touching it.

**The suite is now GREEN — 581/581 passing (57 files).** This corrects an
earlier note here that claimed 3 red contracts owned by `DCFC-203`; those
three now pass because `academy@1`, the `programs`/`contact` routes, and the
module entitlements were all registered by an unrecorded work session.

**Do not read "581/581 green" as "`DCFC-203` is complete."** A 2026-08-01
audit found two gaps that its own contracts do not cover:

1. No pinned `academy@1` document contract in
   `tests/contracts/presentation-system.test.ts`, though both `cinematic@1`
   (line 229) and `clubhouse@1` (line 242) have one.
2. A reachable font-pack inconsistency: `academy@1.compatibleFontPacks`
   includes `bebas-inter`, but `bebas-inter.compatibleTemplates` omits
   `academy@1`. Every other template is bidirectionally consistent.

Both are detailed in the audit record. `DCFC-203` should be treated as
`in_progress`, not `ready`.

## Mandatory Update Rule

Every agent must update this file before ending work, regardless of whether the
assigned package is complete, still in progress, or blocked.

The update must include completed work, files changed, verification, blockers,
the exact next step, and hosted-mutation evidence. A chat summary alone does
not satisfy the handoff requirement.

## Package Ledger

| Package | Status | Assigned agent | Dependency state | Evidence or next step |
| --- | --- | --- | --- | --- |
| DCFC-001 | complete | Claude Code (Sonnet 5) | DCFC-D101 accepted 2026-07-31 | `/contact` implemented, verified, and approved by Christian on 2026-07-31 |
| DCFC-002 | complete | Claude Code (Sonnet 5) | DCFC-D102 partially resolved (URL, nav placement, and layout approved 2026-07-31; age/eligibility/dates/location/cost still TBA) | `/tryouts` implemented, verified, and approved by Christian on 2026-07-31 |
| DCFC-003 | complete | Claude Code (Sonnet 5) | DCFC-001 (done) and DCFC-002 (done) | Pinned local commit `5bbdfa3` (includes dedicated Date card); full evidence in `VISUAL-ACCEPTANCE.md` |
| DCFC-101 | complete | Claude Code (Sonnet 5) | DCFC-003 done | Field-level inventory complete in `CONTENT-MATRIX.md`; 2 provenance flags need Christian's confirmation |
| DCFC-102 | complete | Claude Code (Sonnet 5) | DCFC-101 done | Full gap analysis in `PLATFORM-GAP-ANALYSIS.md` |
| DCFC-103 | complete | Claude Code (Sonnet 5), Claude Code (Opus 5) | DCFC-003 (done), DCFC-101 (done), DCFC-102 (done) | Approved by Christian 2026-07-31 (`DCFC-D109`); `DOMAIN-DESIGN.md` is `approved`, `onzio-platform-plan.md` Video Pipeline section accepted. **Phase 1 gate closed.** |
| DCFC-201 | complete | Claude Code (Opus 5) | DCFC-103 complete | 32 contracts added across 2 new files; 27 intentionally red, 5 green. Existing 549 all still pass. **Suite is now deliberately red — that is this package's deliverable.** |
| DCFC-202 | complete | Claude Code (Opus 5) | DCFC-201 complete | Migration `20260801120000_phase11_diverse_city_domains.sql` creates all four tables with RLS, grants, audit/updated-at triggers, and composite tenant keys. 24 of the 27 red contracts now pass. Also resolved PF-003. |
| DCFC-203 | in_progress (unrecorded work exists) | unassigned | DCFC-201 and DCFC-202 complete | Registry work is done and green, but **2 gaps remain** — missing pinned `academy@1` document contract, and an `academy@1`/`bebas-inter` bidirectional compatibility bug. See the 2026-08-01 audit record. |
| DCFC-204 | pending | unassigned | DCFC-202 and DCFC-203 | Await persistence and registry work |
| DCFC-301 | pending | unassigned | DCFC-204 | Await Phase 2 gate |
| DCFC-302 | pending | unassigned | DCFC-204 | Await Phase 2 gate |
| DCFC-303 | pending | unassigned | DCFC-204 | Await Phase 2 gate |
| DCFC-304 | pending | unassigned | DCFC-301, DCFC-302, DCFC-303 | Await admin workflows |

## Completion Records

### 2026-07-31 — Epic planning packet — Codex

- Package: planning/governance setup outside implementation packages
- Status: complete
- Completed: created the Phase 0-3 epic, decision log, initial content matrix,
  visual acceptance contract, agent-neutral work packages, and shared status
  ledger; added durable repository instructions requiring every agent to
  update progress before ending
- Files changed: `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, and
  `docs/phase-11/diverse-city/*`
- Verification: documentation links, package IDs, dependencies, status values,
  approval boundaries, and no-hosted-mutation rules reviewed locally
- Blockers or decisions needed: Christian review; DCFC-D101 Contact inputs and
  DCFC-D102 Tryouts inputs remain open
- Exact next step: approve or revise this packet, then assign DCFC-001 and/or
  DCFC-002 in isolated snapshot worktrees
- Hosted mutations: none

### 2026-07-31 — DCFC-001 — Claude Code (Sonnet 5)

- Package: DCFC-001
- Status: in_review (superseded below — see 2026-07-31 approval record)
- Completed: implemented `/contact` in the isolated Diverse City FC snapshot
  (`/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site`).
  The page uses the club's real, already-verified email, phone, and
  Instagram/Facebook/X destinations from `lib/site-data.ts` (no invented
  contact facts), plus a service-area line built from the existing
  `location`/`region` fields. Added original review-only hero eyebrow,
  headline, and intro copy (not client-approved final copy). Added a
  footer-only "Contact" quick link (matching the existing Sponsors precedent),
  per Christian's explicit choice for this pass; the primary nav was not
  changed. No message-submission backend, hours, or response-time claim was
  added.
- Files changed:
  - `app/(public)/contact/page.tsx` (new)
  - `components/Footer.tsx` (added Contact quick link)
  - `HANDOFF.md`, `README.md`, `SUMMARY.md` (snapshot docs)
  - `/Users/christianalcala/.claude/launch.json` (added a
    `diverse-city-fc-preview` dev-server entry for browser verification; no
    application file)
- Verification: `npm run typecheck` passed; `npm run build` passed with
  `/contact` prerendered statically and only the same pre-existing admin
  analytics warnings; local dev server browser checks at 1440x900 desktop and
  390px-wide mobile confirmed correct rendering, the new footer link, correct
  `mailto:`/`tel:`/social hrefs, no horizontal overflow, no console errors, and
  no broken images.
- Blockers or decisions needed: `DCFC-D101` remains open — Christian's review
  of the placeholder headline/intro copy, confirmation of footer-only nav
  placement, and any service-hours text is needed before `DCFC-003` (visual
  freeze) can consider Contact locked.
- Exact next step: Christian reviews `/contact` locally
  (`npm run dev -- --port 3012` in the snapshot, then
  `http://localhost:3012/contact`); on approval, move DCFC-001 to `complete`
  and proceed to DCFC-002 (Tryouts) once real inputs are available, then
  DCFC-003.
- Hosted mutations: none. No Supabase, Storage, Vercel, Stripe, DNS, email, or
  production resource was touched; work stayed local to the isolated snapshot
  and `onzio-platform` documentation.

### 2026-07-31 — DCFC-001 approval — Claude Code (Sonnet 5)

- Package: DCFC-001
- Status: complete
- Completed: Christian reviewed the local `/contact` page in-session (removing
  "— Chicago Area" from the location line, leaving just the real
  `location` fact "Schaumburg, Illinois") and then approved the page in full —
  headline/intro copy, destinations, and footer-only nav placement. This
  resolves decision `DCFC-D101` as accepted; `DECISIONS.md` is updated to
  match.
- Files changed since the prior record:
  - `app/(public)/contact/page.tsx` (location value simplified to
    `club.location` only, dropping the appended region text)
  - `HANDOFF.md` (snapshot) — corrected the Contact section's description of
    the location field
- Verification: `npm run typecheck` passed after the edit; local browser
  check confirmed the rendered page text shows "Schaumburg, Illinois" with no
  trailing region text, and no other regressions.
- Blockers or decisions needed: none for DCFC-001. `DCFC-D101` is closed.
- Exact next step: `DCFC-003` (visual freeze) still needs `DCFC-002`
  (Tryouts) before it can proceed — `DCFC-002` remains unassigned pending real
  age-group, eligibility, date, location, cost, and registration-URL inputs
  (or Christian's explicit approval to use clearly-labeled temporary
  placeholders per `DCFC-D102`).
- Hosted mutations: none.

### 2026-07-31 — DCFC-002 — Claude Code (Sonnet 5)

- Package: DCFC-002
- Status: in_review
- Completed: implemented `/tryouts` in the isolated Diverse City FC snapshot.
  The page is status-aware (`upcoming`/`open`/`closed`; shipped as `upcoming`,
  the honest current state since no real tryout window is confirmed) with a
  hero, an external registration CTA, and an Age Groups/Location/Cost detail
  row. Per Christian's explicit direction (matching his DCFC-001 approach):
  - Age Groups, Location, and Cost render as "TBA" in the same muted style
    already used by the Schedule page's fixture placeholders. No specific
    age range, venue, or price was invented.
  - The registration CTA reuses the same already-approved temporary
    destination as the existing Special Olympics program page
    (`https://www.google.com/`), per Christian's explicit choice, for
    consistent treatment across the snapshot. It carries the same
    third-party-disclosure copy pattern.
  - When the status is `closed` or the URL is absent, the CTA fails closed to
    a `mailto:` contact link instead of a dead/misleading button (verified by
    temporarily toggling both).
  - Per Christian's explicit nav instructions: restructured `Schedule` from a
    plain link into a dropdown parent (`components/Nav.tsx`) with two
    children — "Fixtures" (`/schedule`) and "Tryouts" (`/tryouts`) — refactoring
    the prior Programs-only dropdown state into a generic keyed
    open/close mechanism shared by both dropdowns. Added "Contact" as a new
    plain link in the primary nav positioned after Store (previously
    footer-only per the DCFC-001 approval). Added "Tryouts" to the footer
    quick-links list.
  - Whether Tryouts should support one current opportunity or multiple
    structured event rows is decision `DCFC-D103`, deferred to Phase 1; this
    pass implements the single-current-opportunity model only, not a
    silent resolution of that decision.
- Files changed:
  - `app/(public)/tryouts/page.tsx` (new)
  - `components/Nav.tsx` (Schedule dropdown restructuring, generic dropdown
    state, Contact added to main nav, generalized active-state detection)
  - `components/Footer.tsx` (added Tryouts quick link)
  - `HANDOFF.md`, `README.md`, `SUMMARY.md` (snapshot docs)
- Verification: `npm run typecheck` passed. `npm run build` initially failed
  with a stale-`.next`-cache error (`Cannot find module for page:
  /admin/branding`) caused by running `build` while the dev server was
  concurrently writing to the same `.next` directory — a tooling artifact,
  confirmed by clearing `.next` and rebuilding cleanly, which passed with
  `/tryouts` prerendered alongside all other routes and only the same
  pre-existing admin analytics warnings. Local browser checks at 1440x900
  desktop and 390px-wide mobile confirmed: all three status states render
  correctly (toggled and reverted to `upcoming`); the missing-URL fallback
  works (toggled and reverted to the approved URL); the Schedule dropdown
  opens via hover (desktop) and tap (mobile, confirmed via `aria-expanded`)
  and its "Tryouts" child navigates correctly; the new main-nav Contact link
  and footer Tryouts link both resolve; active-state highlighting correctly
  generalizes across dropdown children instead of being hardcoded to
  Programs; no horizontal overflow, console errors, or broken images at
  either breakpoint.
- Blockers or decisions needed: `DCFC-D102` remains open overall — the
  registration-URL and navigation-placement portions were explicitly approved
  by Christian in this session, but age groups, eligibility, dates,
  locations, and cost language are still unresolved and rendered as honest
  "TBA" placeholders. `DCFC-D103` (single vs. multiple tryout events) remains
  explicitly deferred to Phase 1, not resolved by this implementation.
- Exact next step: Christian reviews `/tryouts` locally
  (`npm run dev -- --port 3012` in the snapshot, then
  `http://localhost:3012/tryouts`, and the restructured nav); on approval,
  move DCFC-002 to `complete`, record `DCFC-D102`'s approved sub-decisions in
  `DECISIONS.md`, and proceed to DCFC-003 (visual freeze).
- Hosted mutations: none. No Supabase, Storage, Vercel, Stripe, DNS, email, or
  production resource was touched; work stayed local to the isolated snapshot
  and `onzio-platform` documentation.

### 2026-07-31 — DCFC-002 review revisions — Claude Code (Sonnet 5)

- Package: DCFC-002
- Status: in_review
- Completed: applied Christian's first-review feedback on `/tryouts`, still
  pending final approval:
  - Removed the "Tryouts" eyebrow, the status badge, and the "Take the
    field." headline line; headline is now the single line "Join Diverse
    City FC" (no trailing period). Status is now conveyed only through the
    intro paragraph.
  - Removed the Age Groups detail card; the row is now Location and Cost
    only.
  - Removed a fixed `min-w-64` on the Schedule/Programs nav dropdown panels
    (`components/Nav.tsx`) that left excess empty space for short labels like
    "Fixtures"/"Tryouts"; both panels now size to their own content.
  - Tightened the hero-to-cards vertical gap, which had doubled up from the
    hero's bottom padding stacking with the next section's top padding.
  - Fixed the Location/Cost card row stretching across the full section width
    for short "TBA" content: `md:inline-grid md:grid-cols-2` now shrinks the
    two-card block to its own content at desktop widths, while mobile keeps
    its original full-width single-column stack.
- Files changed: `app/(public)/tryouts/page.tsx`, `components/Nav.tsx`,
  `HANDOFF.md` (snapshot).
- Verification: `npm run typecheck` passed; clean `npm run build` (after
  clearing `.next`) passed with only the same pre-existing warnings; local
  desktop (1440x900) and mobile (390px) checks confirmed the simplified
  hero, tightened hero-to-cards spacing, the compact desktop Location/Cost
  block, unchanged full-width mobile stacking, tightened Schedule and
  Programs dropdowns, and no horizontal overflow, console errors, or broken
  images.
- Blockers or decisions needed: same as the prior record — `DCFC-D102` core
  facts (age groups, eligibility, dates, locations, cost) remain open;
  `DCFC-D103` remains deferred to Phase 1.
- Exact next step: Christian reviews the revised `/tryouts` and nav; on
  approval, move DCFC-002 to `complete` and proceed to DCFC-003.
- Hosted mutations: none.

### 2026-07-31 — DCFC-002 approval — Claude Code (Sonnet 5)

- Package: DCFC-002
- Status: complete
- Completed: Christian reviewed the revised `/tryouts` page and nav
  restructuring in-session (after the eyebrow/badge/headline-line removal,
  Age Groups card removal, dropdown tightening, hero-to-cards spacing fix,
  and Location/Cost block realignment) and approved it in full.
- Files changed since the prior record: none — this record finalizes the
  already-applied and already-verified revisions from the prior two
  records.
- Verification: carried over from the prior records — `npm run typecheck`
  and a clean `npm run build` both passed; desktop (1440x900) and mobile
  (390px) browser checks confirmed correct rendering, no horizontal
  overflow, no console errors, no broken images.
- Blockers or decisions needed: none for DCFC-002 itself. `DCFC-D102`
  remains partially open at the epic level — the registration-URL,
  navigation-placement, and visual-layout portions are approved, but age
  groups, eligibility, dates, locations, and cost language remain
  unresolved and are honestly rendered as "TBA" per the work package's
  explicit allowance for clearly-labeled placeholders. `DCFC-D103` (single
  vs. multiple tryout events) remains explicitly deferred to Phase 1.
- Exact next step: `DCFC-003` (visual freeze and approval) is now eligible —
  both its dependencies (DCFC-001, DCFC-002) are complete. Assign DCFC-003 to
  record the pinned snapshot commit, desktop/mobile evidence, and Christian's
  approval for both new pages per `VISUAL-ACCEPTANCE.md`, then update
  `CONTENT-MATRIX.md` to reflect the approved pages before Phase 1 begins.
- Hosted mutations: none.

### 2026-07-31 — DCFC-003 — Claude Code (Sonnet 5)

- Package: DCFC-003
- Status: complete
- Completed: verified and pinned Contact and Tryouts as approved Phase 0
  additions to the Diverse City visual specification.
  - Gathered every item on `VISUAL-ACCEPTANCE.md`'s evidence list for both
    `/contact` and `/tryouts`: HTTP 200, no console errors (a stale
    RSC-prefetch error in one long-lived browser tab was confirmed to be a
    tooling artifact by reproducing a clean load in a fresh tab), no
    horizontal overflow at 1440x900 and 390px-wide mobile, positive
    `naturalWidth`/`naturalHeight` on every rendered image, real-keyboard
    `Tab` reaching and producing a native focus outline on both a Contact
    detail link and the Tryouts external CTA, every primary-nav and footer
    link enumerated and resolving correctly, external links confirmed as
    plain no-data-submission anchor navigations, and `noindex, nofollow`
    confirmed via both the `X-Robots-Tag` response header and the page
    meta tag.
  - With Christian's explicit approval, created one local git commit in the
    snapshot repository (`a0f9f0c201e7d0e54b821c22f8c60159798f7477`) so the
    approved state has a citable, pinned commit hash. The snapshot repo has
    no configured remote, so nothing was or could be pushed.
  - Documented two honest gaps against the Tryouts required-checks list
    rather than papering over them: no FAQ content exists (none was
    supplied, so none was invented) and there is no dedicated "Dates" detail
    card (Location/Cost only, per Christian's explicit request); dates are
    acknowledged only in prose.
- Files changed: `docs/phase-11/diverse-city/VISUAL-ACCEPTANCE.md` (full
  evidence record, approved-commit section), `docs/phase-11/diverse-city/STATUS.md`.
  One local commit in the snapshot repository (see above); no further
  snapshot application code changed.
- Verification: see the itemized evidence list now recorded in
  `VISUAL-ACCEPTANCE.md`.
- Blockers or decisions needed: none for DCFC-003 itself. The FAQ and Dates
  gaps noted above are open content questions for Phase 1
  (`DCFC-101`/`DCFC-D102`), not blockers to freezing the current visual
  state.
- Exact next step: `DCFC-101` (field-level content and asset inventory) is
  now eligible — both DCFC-003's prerequisites are satisfied. `DCFC-102`
  (reusable platform gap analysis) may also begin read-only in parallel per
  the epic's dependency notes.
- Hosted mutations: none. The only mutation was one local git commit with no
  configured remote; no Supabase, Storage, Vercel, Stripe, DNS, email, or
  production resource was touched.

### 2026-07-31 — DCFC-003 addendum: dedicated Date card — Claude Code (Sonnet 5)

- Package: DCFC-003
- Status: complete
- Completed: after the initial DCFC-003 evidence pass documented the absence
  of a dedicated "Dates" field as a gap, Christian asked for it to be added
  rather than left as a prose-only mention. Added a Date detail card (`TBA`)
  to `/tryouts` alongside Location and Cost — honest placeholder, no real
  date invented. With Christian's explicit approval, created a second local
  commit in the snapshot repository,
  `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`, on top of the DCFC-003
  commit; no remote is configured, so nothing was or could be pushed.
  Updated `VISUAL-ACCEPTANCE.md`'s approved-commit section and closed out
  the "Dates" gap note accordingly.
- Files changed: `app/(public)/tryouts/page.tsx` (one local commit in the
  snapshot repo), `docs/phase-11/diverse-city/VISUAL-ACCEPTANCE.md`.
- Verification: `npm run typecheck` passed; a clean `npm run build` (after
  clearing `.next`) passed with the same warnings as before; desktop
  (1440x900) and mobile (375x812) browser checks confirmed the three-card
  Date/Location/Cost row renders correctly with no horizontal overflow on
  either breakpoint. (One raw-pixel `resize_window` call mid-session
  produced a `devicePixelRatio: 2` screenshot capture artifact that made the
  page appear squeezed into half the frame; `window.innerWidth` and
  `scrollWidth` confirmed the actual layout was always correct at 1440, and
  switching to the Browser pane's `desktop`/`mobile` presets produced a
  clean capture — a tooling quirk, not an application defect.)
- Blockers or decisions needed: none. This closes the only remaining
  documented gap against the Tryouts required-checks list besides FAQ
  (still none supplied, so still none invented).
- Exact next step: unchanged from the prior DCFC-003 record — `DCFC-101`
  (field-level content and asset inventory) is eligible.
- Hosted mutations: none.

### 2026-07-31 — DCFC-003 addendum: FAQ scoping decision — Claude Code (Sonnet 5)

- Package: DCFC-003
- Status: complete (documentation-only addendum, no code change)
- Completed: Christian confirmed the Tryouts page will not have an FAQ
  section — tryout logistics (eligibility, what to bring, cost, scheduling,
  next steps) are intentionally left to the club's external registration
  partner rather than duplicated on Onzio's page. Updated
  `VISUAL-ACCEPTANCE.md` and `CONTENT-MATRIX.md` to record this as a
  deliberate scoping decision rather than an open content gap, and updated
  `DECISIONS.md`'s `DCFC-D102` row accordingly.
- Files changed: `docs/phase-11/diverse-city/VISUAL-ACCEPTANCE.md`,
  `docs/phase-11/diverse-city/CONTENT-MATRIX.md`,
  `docs/phase-11/diverse-city/DECISIONS.md`. No application code changed; no
  new verification needed.
- Blockers or decisions needed: none. This closes the last open item against
  the Tryouts required-checks list.
- Exact next step: unchanged — `DCFC-101` (field-level content and asset
  inventory) is eligible.
- Hosted mutations: none.

### 2026-07-31 — DCFC-101 — Claude Code (Sonnet 5)

- Package: DCFC-101
- Status: complete
- Completed: expanded `CONTENT-MATRIX.md` to field-level coverage for every
  route in the pinned snapshot commit `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`
  (`/`, `/club/about`, `/roster`, `/schedule`, `/programs` + 4 detail routes,
  `/shop`, `/sponsors`, `/contact`, `/tryouts`, plus cross-cutting site
  chrome). Read the full source of every route and its backing data files.
  Computed real `sha256` checksums (via `shasum -a 256`, not fabricated)
  against every referenced media asset in `public/`. Identified and
  documented Rose-City-inherited legacy files/components that are present in
  the repository but not wired to any current Diverse City route (e.g.
  `about-content.ts`, `homepage-content.ts`, `standings-content.ts`,
  `social-links.ts`, the multi-kit `Shop*` components, an orphaned
  `PhotoSequence` component), so future agents don't mistake them for the
  live content source. Flagged two findings that are neither invented nor
  altered by this pass but have no documented provenance: (1) a hardcoded
  10-row league-standings table with specific win/loss/points records for
  real-named opponent clubs, and (2) a "conference championships and
  national-stage appearances" claim repeated verbatim across the About page
  and the Men's Teams program page. Both need Christian's explicit
  confirmation before Phase 2 treats them as verified fact rather than
  placeholder.
- Files changed: `docs/phase-11/diverse-city/CONTENT-MATRIX.md` only.
  Read-only across the entire snapshot repository; no application code
  changed.
- Verification: this is a documentation/inventory package with no code to
  typecheck or build; verification consisted of reading every route's actual
  rendered source (not assumptions) and computing real checksums for every
  referenced asset rather than leaving them as placeholders.
- Blockers or decisions needed: the two provenance flags above need
  Christian's confirmation. Neither blocks DCFC-101 itself (the acceptance
  criteria required every gap to be made explicit, which is satisfied), but
  both should be resolved before `DCFC-103` locks the content/presentation
  architecture, since that package requires `DCFC-D101`–`DCFC-D105`
  accepted or explicitly deferred with no impact on Phase 2.
- Exact next step: `DCFC-102` (reusable platform gap analysis) is eligible
  and may run in parallel with resolving the two flags. Christian should
  confirm or correct the standings-table and championships-claim provenance
  before `DCFC-103`.
- Hosted mutations: none.

### 2026-07-31 — DCFC-102 — Claude Code (Sonnet 5)

- Package: DCFC-102
- Status: complete
- Completed: compared the approved Diverse City specification against the
  **actual current state** of `onzio-platform` — read
  `packages/presentation/index.ts`'s registries, every `supabase/migrations/`
  file's `create table` statements, `app/admin/` route list,
  `lib/admin-data-contract.ts`'s mutation validator, `components/Nav.tsx`,
  and the existing `roster`/`schedule` dynamic-detail-page pattern — rather
  than relying on the architecture plan's prose alone. Wrote up the full
  comparison in a new file, `PLATFORM-GAP-ANALYSIS.md`. Key findings:
  - **Fully reusable, no new work**: standings (`league_standings` +
    `league_standings_settings` + `admin/standings` already exist — directly
    matches Christian's confirmation that standings will be admin-editable),
    homepage hero/slideshow, About, Shop, Sponsors, Roster/staff/seasons/
    stats, Branding — all have existing tables and admin editors already.
  - **Fully reusable capability, not previously obvious**: dropdown
    navigation already exists generically in the real `Nav.tsx`; external
    URL/href/link protocol validation is already generic and automatic in
    `lib/admin-data-contract.ts` for any correctly-named column, on any
    table, with zero new validation code required.
  - **Partial reuse**: `tryouts` already has a registered
    `routeRegistry`/`moduleRegistry` entry with Pro entitlement — but no
    schema table, section type, or admin editor exist. Confirmed via
    repository-wide grep that "tryout" appears in exactly two files (the
    registry and its contract test fixture).
  - **True gaps**: Programs (nothing exists at all) and Contact (nothing
    exists at all) both need full schema/registry/admin work from scratch.
  - **Genuinely unresolved, not silently assumed**: video capability. The
    existing `behind_the_rose_section`/`normalizeYouTubeEmbedUrl()` pattern
    only covers YouTube-embedded video; Diverse City's approved homepage uses
    two self-hosted MP4 files, a different delivery mechanism the existing
    capability does not cover. Documented both directions (adopt
    YouTube-embed vs. add real self-hosted video to the media pipeline)
    without picking one — that's `DCFC-D105`'s decision.
  - Explicitly distinguished acceptable content-driven branching (Diverse
    City's one shared `[programId]` route rendering different registered
    sections per program) from the prohibited pattern (branching on tenant
    identity) per this package's acceptance criteria.
- Files changed:
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md` (new). Read-only
  across `onzio-platform`; no application code changed.
- Verification: documentation-only package; verification consisted of
  reading the actual current schema/registry/admin state directly rather
  than assuming it from the architecture plan.
- Blockers or decisions needed: `DCFC-103` needs Christian's input on
  `DCFC-D104` (does the approved visual map to `cinematic@1`, or does it need
  a new/neutral template?) and `DCFC-D105` (video capability direction, per
  the two options above).
- Exact next step: `DCFC-103` (lock content and presentation architecture)
  is eligible now that all three of its dependencies are complete, but needs
  Christian's input on the two decisions above before it can close.
- Hosted mutations: none.

### 2026-07-31 — DCFC-D104 resolved: new `academy@1` template — Claude Code (Sonnet 5)

- Package: DCFC-103 (pre-work — decision only, not a full DCFC-103 pass)
- Status: complete (documentation-only, no code change)
- Completed: discussed template mapping with Christian. `PLATFORM-GAP-ANALYSIS.md`
  found `cinematic@1` registers only `cinematic.hero`/`cinematic.gallery`
  (plus shared `shared.next-match`/`shared.history`) — missing shop-feature,
  sponsor-carousel, standings, and programs-pathway sections Diverse City
  needs regardless of template choice — and no existing font pack matches
  Diverse City's Montserrat/Inter/DM Sans stack. Programs' two layout
  variants are also a genuinely new section-composition shape. Christian
  agreed reusing `cinematic@1` would mostly mean bolting Diverse-City-only
  sections onto Rose City's template, and approved a new template instead,
  following the same extraction precedent as `clubhouse@1` (Lions). Named it
  `academy@1` after discussing several options (`pathway`, `academy`,
  `horizon`, `crossroads`, `collective`) — `academy` ties to the founder's
  MLS academy background and the youth-development-to-pro pipeline.
  `DCFC-D104` moved to Accepted in `DECISIONS.md`.
- Files changed: `docs/phase-11/diverse-city/DECISIONS.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No application code changed —
  `academy@1` is not yet registered in `packages/presentation/index.ts`;
  that registration is `DCFC-103`/`DCFC-203` implementation work, not this
  decision record.
- Blockers or decisions needed: `DCFC-D105` (video capability direction)
  still needs Christian's input before `DCFC-103` can close.
- Exact next step: resolve `DCFC-D105`, then assign `DCFC-103` to formally
  lock the architecture (including registering `academy@1` with its
  sections/fonts) and update affected work packages.
- Hosted mutations: none.

### 2026-07-31 — DCFC-D105 resolved: video via Bunny.net Stream — Claude Code (Sonnet 5)

- Package: DCFC-103 (pre-work — decision only, not a full DCFC-103 pass)
- Status: complete (documentation-only, no code change)
- Completed: discussed the video-capability decision with Christian. Confirmed
  from `PLATFORM-GAP-ANALYSIS.md` that Rose City's only existing video is a
  hardcoded, non-reusable `club.slug === "rose-city"` legacy branch in
  `components/Hero.tsx` — not a real capability to build from. Compared
  in-house transcoding (rejected: Vercel serverless functions are a poor fit
  for video encoding, and both Supabase Storage egress and Vercel Blob
  transfer cost more per GB than a video CDN) against three third-party
  video CDNs (Cloudflare Stream, Mux, Bunny.net Stream), researched via live
  web search rather than memorized pricing, modeled at 6/10/20/50/100-club
  scale. Bunny.net Stream was cheapest at every modeled scale (~$1.25/mo at
  10 clubs to ~$12.50/mo at 100 clubs, free standard H.264 encoding, $1/mo
  minimum). Reviewed Bunny's known tradeoffs (less infrastructure control
  and analytics than Mux, smaller network than Cloudflare) and judged them
  acceptable for simple looping background/story videos with admin
  swap-in-out. Christian approved Bunny.net Stream and separately signed up
  for an account with $20 starting credit. `DCFC-D105` moved to Accepted in
  `DECISIONS.md`; format/duration/dimension/size/poster/processing rules are
  intentionally left as `DCFC-201`/`DCFC-202` implementation detail, not
  decided here.
- Files changed: `docs/phase-11/diverse-city/DECISIONS.md`,
  `docs/phase-11/diverse-city/STATUS.md`,
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md`. No application code
  changed — Bunny.net integration is `DCFC-201`–`DCFC-204` implementation
  work, not this decision record. No Bunny.net, Vercel, or Supabase account
  action was taken by the agent; Christian's account signup was his own
  action outside this session.
- Blockers or decisions needed: `DCFC-D103` (single vs. multiple tryout
  events) is now the only remaining open decision blocking `DCFC-103`.
- Exact next step: resolve `DCFC-D103`, then assign `DCFC-103` to formally
  lock the architecture (registering `academy@1` and the Bunny.net-backed
  video capability) and update affected work packages.
- Hosted mutations: none.

### 2026-07-31 — DCFC-D103 resolved: structured Tryouts event rows — Claude Code (Sonnet 5)

- Package: DCFC-103 (pre-work — decision only, not a full DCFC-103 pass)
- Status: complete (documentation-only, no code change)
- Completed: explained the singleton-vs-structured-rows tradeoff to
  Christian in concrete terms tied to Diverse City's actual four programs
  (Youth Academy, Special Kickers, Special Olympics, UPSL Men's Teams).
  Christian confirmed running simultaneous tryout opportunities across
  programs is a real, near-term scenario, not hypothetical, and chose
  structured event rows over the singleton model DCFC-002's snapshot UI
  currently ships. `DCFC-D103` moved to Accepted in `DECISIONS.md`. Updated
  `CONTENT-MATRIX.md`'s Tryouts Content Contract Draft and
  `PLATFORM-GAP-ANALYSIS.md`'s Tryouts gap section to describe a
  `matches`/`players`-shaped table (one row per opportunity, admin
  list/create/edit/reorder) instead of a `homepage_hero_content`-shaped
  singleton, including an optional per-row program association left as
  `DCFC-202` schema detail.
- Files changed: `docs/phase-11/diverse-city/DECISIONS.md`,
  `docs/phase-11/diverse-city/CONTENT-MATRIX.md`,
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No application code changed — the
  approved snapshot's single-opportunity Tryouts UI is unchanged; migrating
  it to a list/grid of event cards is `DCFC-201`–`DCFC-204` implementation
  work, not this decision record.
- Blockers or decisions needed: none remaining from the `DCFC-D101`–
  `DCFC-D105` set that gates `DCFC-103`. `DCFC-D102`'s core Tryouts facts
  (age groups, eligibility, dates, locations, cost) remain open but are
  explicitly deferred with no impact on Phase 2 schema work, per that
  package's acceptance criteria.
- Exact next step: `DCFC-103` (lock content and presentation architecture)
  can now be assigned and closed out — its full acceptance also requires
  approving the normalized table/domain design (building on
  `CONTENT-MATRIX.md`'s drafts) and confirming whether introducing Bunny.net
  Stream as a new third-party vendor needs a `docs/onzio-platform-plan.md`
  amendment (unlike the `academy@1` template, this is a genuinely new
  external-service dependency, not reuse of an existing extensible
  mechanism, so it likely does need one).
- Hosted mutations: none.

### 2026-07-31 — DCFC-103 — Claude Code (Sonnet 5)

- Package: DCFC-103
- Status: in_review
- Completed: with all five gating decisions (`DCFC-D101`–`DCFC-D105`)
  resolved, drafted the two remaining `DCFC-103` acceptance items:
  - **Normalized table/domain design**: new
    `docs/phase-11/diverse-city/DOMAIN-DESIGN.md` proposes concrete
    `onzio.programs`, `onzio.contact_profile`, `onzio.contact_page_content`,
    and `onzio.tryouts` table shapes, following the exact conventions read
    directly from existing migrations (composite `(club_id, id)` uniqueness
    and tenant-safe composite FKs for multi-row tables, `club_id primary
    key` for singletons, `can_read_feature`/`can_mutate_feature` RLS,
    audit/updated-at triggers) rather than inventing new patterns. Encodes
    the field inventory's "two program layout variants" finding as a
    content-driven `layout_variant` enum instead of per-program code
    branches. Encodes `DCFC-D103`'s structured-rows decision and DCFC-002's
    already-verified missing-URL fail-closed behavior. Explicitly scopes out
    what it does not decide (Special Olympics' carousel-section
    generalization, exact video upload limits, real content values).
  - **Canonical platform plan amendment**: added a new "Video Pipeline"
    section to `docs/onzio-platform-plan.md` (after "Secure Media
    Pipeline") plus a "Video" line in "Locked Decisions", documenting the
    `DCFC-D105` decision (Bunny.net Stream, not in-house transcoding, not a
    replacement for the existing YouTube-embed pattern), the high-level
    upload/delivery flow, and what's explicitly deferred to `DCFC-201`/
    `DCFC-202` (exact format/size/duration/poster rules). Confirmed and
    documented that Rose City's existing hero video is a non-reusable
    `club.slug` legacy special case, and that this amendment does not
    authorize migrating Rose City onto the new capability. Did not add an
    entry for the `academy@1` template, consistent with the precedent that
    `clubhouse@1` was added without a plan-doc edit (using the existing
    extensible template mechanism is not a new architecture pattern the way
    a new third-party vendor is).
- Files changed: `docs/phase-11/diverse-city/DOMAIN-DESIGN.md` (new),
  `docs/onzio-platform-plan.md` (Video Pipeline section + Locked Decisions
  line), `docs/phase-11/diverse-city/STATUS.md`. No migration was written or
  applied — `DOMAIN-DESIGN.md` is a proposal, not SQL; no
  `supabase/migrations/` file was added.
- Verification: documentation-only; verification consisted of reading three
  real existing migrations directly to confirm the proposed schema matches
  established convention rather than inventing a new one.
- Blockers or decisions needed: this package is `in_review`, not `complete`
  — `DCFC-103`'s acceptance criteria requires the domain design to be
  *approved*, not just drafted. Awaiting Christian's review of
  `DOMAIN-DESIGN.md` and the `onzio-platform-plan.md` amendment.
- Exact next step: Christian reviews and approves (or requests changes to)
  both documents; on approval, move DCFC-103 to `complete` and `DCFC-201`
  (red contracts) becomes eligible.
- Hosted mutations: none.

### 2026-07-31 — DCFC-103 re-review corrections — Claude Code (Opus 5)

- Package: DCFC-103
- Status: in_review (unchanged — corrections applied to the draft under
  review, not a new package)
- Completed: re-reviewed the `DOMAIN-DESIGN.md` draft and the DCFC-102 gap
  analysis against the real schema instead of trusting the first pass. Found
  and fixed three substantive errors and two omissions:
  - **`contact_profile` duplicated an existing table.** The draft proposed
    `instagram_href`/`facebook_href`/`x_href` columns, but
    `onzio.site_social_links` already exists, is already registered in
    `ADMIN_TABLE_FEATURES` under `branding`, and already has an admin
    editor. DCFC-102 mis-filed social links as part of the Contact gap.
    Corrected in both documents; social links moved to "Reusable As-Is" and
    the columns removed from the design. Separately verified by grep that
    email/phone columns genuinely do not exist anywhere, so the rest of
    `contact_profile` is a real gap.
  - **Feature-name tier gating was unexamined and is a live public-facing
    risk.** `onzio_private.club_has_feature` hardcodes the Starter allowlist
    `('branding', 'roster', 'schedule', 'homepage', 'about')`; any other
    feature string is Pro-only, and `can_read_feature` gates *anonymous
    public reads*, not just admin writes. So naming a new `'contact'`
    feature would silently make Starter clubs' contact page render empty in
    public. Added an explicit feature-name section to `DOMAIN-DESIGN.md`
    with a per-table recommendation: `tryouts` → new `tryouts` feature
    (Pro-only, correctly matching the existing `moduleRegistry` entry);
    `programs` → Pro-only is defensible but is a pricing decision Christian
    must make; `contact` → probably should either reuse the Starter-allowed
    `about` feature or add `'contact'` to the allowlist, because Pro-only is
    likely unintended.
  - **`ADMIN_TABLE_FEATURES` registration was omitted.** Every new table must
    be added to that map in `lib/admin-data-contract.ts` or the generic
    admin mutation boundary will reject it regardless of RLS. Added to the
    conventions list.
  - Fixed `jsonb` default to use the explicit `::jsonb` cast, matching all
    six existing usages.
  - Confirmed and documented that `media_assets.surface` is free-form text
    (`^[a-z][a-z0-9-]{0,63}$`), not an enum, so new media surfaces need no
    migration — a small piece of good news the first pass missed.
- Files changed: `docs/phase-11/diverse-city/DOMAIN-DESIGN.md`,
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md`,
  `docs/phase-11/diverse-city/STATUS.md`. Still no migration written or
  applied.
- Verification: read `club_has_feature`/`can_read_feature`/
  `can_mutate_feature` definitions, `ADMIN_TABLE_FEATURES`, the `clubs`,
  `site_branding`, `site_social_links`, `about_page_content`, and
  `media_assets` table definitions directly from migration source.
- Blockers or decisions needed: the feature-name/tier question above is now
  an explicit open decision Christian must resolve before `DCFC-202` writes
  the migration — particularly whether Contact should be Starter-accessible
  (recommended) and whether Programs is Pro-only.
- Exact next step: Christian reviews the corrected `DOMAIN-DESIGN.md`
  (especially the feature-name/tier table) and the `onzio-platform-plan.md`
  video amendment; on approval plus a tier decision, DCFC-103 closes and
  `DCFC-201` becomes eligible.
- Hosted mutations: none.

### 2026-07-31 — DCFC-D108 resolved: tier gating for the three new domains — Claude Code (Opus 5)

- Package: DCFC-103
- Status: in_review (blocker resolved; design still needs final approval)
- Completed: Christian resolved the tier question raised by the re-review —
  **Contact is Starter-accessible, Programs is Pro-only, Tryouts is
  Pro-only.** Recorded as new accepted decision `DCFC-D108` in
  `DECISIONS.md` and resolved the feature-name section of
  `DOMAIN-DESIGN.md`. Chose adding `'contact'` to the
  `onzio_private.club_has_feature` Starter allowlist over the alternative of
  reusing the existing Starter-allowed `about` feature: reusing `about`
  carries no security downside (features are tier gates, not permission
  scopes — `can_mutate_feature` is `can_mutate_content AND
  club_has_feature`) but would leave `ADMIN_TABLE_FEATURES` mapping contact
  tables to `"about"`, which misleads future readers for no lasting
  benefit. `programs` and `tryouts` need no allowlist change — a new feature
  string is Pro-only by default, which already matches the registered
  `moduleRegistry.tryouts` → `entitlement: "pro"`.
- Also propagated two Phase 2 obligations this surfaces into
  `PLATFORM-GAP-ANALYSIS.md`'s ownership section: `DCFC-202` must additively
  extend `club_has_feature` while preserving `security definer`,
  `set search_path = ''`, `stable`, and fully-qualified relations; and
  `DCFC-201` must add explicit tier coverage proving a Starter club can read
  `contact_*` but still cannot read `programs`/`tryouts`, since this
  modifies a shared security function governing every existing table.
- Files changed: `docs/phase-11/diverse-city/DECISIONS.md`,
  `docs/phase-11/diverse-city/DOMAIN-DESIGN.md`,
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No migration written or applied;
  no application code changed.
- Blockers or decisions needed: none outstanding. `DCFC-103`'s remaining
  requirement is Christian's explicit approval of `DOMAIN-DESIGN.md` and the
  `onzio-platform-plan.md` video amendment as a whole — the package's
  acceptance criteria requires the design to be *approved*, not merely
  drafted and unblocked.
- Exact next step: Christian approves both documents; on approval move
  DCFC-103 to `complete` and `DCFC-201` (red contracts) becomes eligible.
- Hosted mutations: none.

### 2026-07-31 — Platform findings register opened — Claude Code (Opus 5)

- Package: DCFC-103 (side output — platform-wide findings, not epic scope)
- Status: complete
- Completed: reviewed `docs/onzio-platform-plan.md` at Christian's request
  before approving the `DCFC-103` deliverables, and opened
  `docs/platform-findings.md` as a durable register for verified-but-unfixed
  platform issues, so findings surfaced during scoped epic work survive the
  epic closing. Four findings recorded with file/line evidence, honest
  severity, and explicit trigger conditions:
  - **PF-001**: Phase 9's gate asserts Rose City renders without
    tenant-specific presentation special cases; six `club.slug ===
    "rose-city"` branches actually remain (`Hero.tsx:15`, `Nav.tsx:255`,
    `PhotoSlideshow.tsx:24`, `NationalityFlag.tsx:20`,
    `shop/page.tsx:34`, `page.tsx:26`). Matters because `EPIC.md`'s
    prohibition on Diverse City slug branches rests on this being settled
    practice.
  - **PF-002**: three parallel entitlement sources of truth with confirmed
    `shop` and `seasons` contradictions. Characterized honestly as latent —
    it needs a Starter-tier club that is also active/live, which no seeded
    club is, which is precisely why existing tests miss it.
  - **PF-003**: the entitlement mechanism is undocumented in the platform
    plan, which is the root cause of PF-002-class bugs recurring.
  - **PF-004**: self-flagged — the Bunny.net video reference this session
    added deviates from the plan's "content records reference media assets"
    principle. Recorded as an acknowledged tradeoff rather than hidden.
- Also added an "Open Platform Findings" section to the top of `HANDOFF.md`
  pointing at the register, and spawned a background task for PF-002 (the
  one concrete, independently fixable bug).
- Files changed: `docs/platform-findings.md` (new), `HANDOFF.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No fix was applied to any finding
  — the register explicitly states that tracking is not authorization to
  fix, and PF-001/PF-002 concern already-shipped phases that need their own
  scoped approval.
- Verification: every finding cites verified evidence — allowlist and
  registry contents read from source, slug branches enumerated by grep,
  trigger condition confirmed against `supabase/seed.sql` (Bravo is Starter
  but `onboarding`/`preview`).
- Blockers or decisions needed: none for this register. PF-001 in particular
  needs a Christian decision eventually — either extract Rose City's
  remaining branches, or amend the Phase 9 gate to state its true achieved
  scope. Deliberately not reworded unilaterally.
- Exact next step: unchanged — Christian approves `DOMAIN-DESIGN.md` and the
  `onzio-platform-plan.md` video amendment to close `DCFC-103`.
- Hosted mutations: none.

### 2026-07-31 — DCFC-103 approved and closed — Claude Code (Opus 5)

- Package: DCFC-103
- Status: complete — **Phase 1 gate closed**
- Completed: verified the two deliverables against real source before asking
  for approval, rather than relying on the drafts' own assertions. Confirmed
  from migration source: the `club_has_feature` Starter allowlist is exactly
  as quoted (`phase2_foundation.sql:301`), so the `DCFC-D108` reasoning
  holds; `onzio.site_social_links` genuinely pre-exists, so the re-review's
  de-duplication was correct; `media_assets.surface` is regex-constrained
  free-form (`^[a-z][a-z0-9-]{0,63}$`), not an enum; no `email`/`phone`
  column exists anywhere, so `contact_profile`'s fields are a real gap; and
  the `homepage_hero_content` singleton shape (`club_id` PK, `updated_at`,
  no `created_at`) matches what the design proposes for the contact
  singletons. Confirmed the Video Pipeline section exists at
  `docs/onzio-platform-plan.md:557` with its Locked Decisions line at :45.
  Christian approved both deliverables, plus two requested fixes:
  - **Stale pinned commit corrected.** `EPIC.md` still listed
    `08f7b53c…` as the pinned snapshot commit; `DCFC-003` superseded that
    with `5bbdfa33…`. Every other document was already correct. Updated with
    an explicit note recording the supersession rather than a silent swap.
  - **Column-constraint policy added to `DOMAIN-DESIGN.md`.** The design
    specified no text-length or URL-shape constraints, which would have left
    `DCFC-202` deciding them ad-hoc mid-migration. Added a policy section
    plus concrete `check` clauses on all four tables. Two findings came out
    of writing it:
    - The `between 1 and N` vs `<= N` distinction is load-bearing, not
      stylistic: nearly every column here is `not null default ''`, and the
      `between 1 and N` form would make the default itself violate the
      constraint. Only `programs.slug` and `programs.display_title` are
      genuinely required-and-non-empty.
    - **Copying the existing href regex would have been a real bug.**
      `homepage_hero_content` constrains CTA hrefs to
      `^/[-A-Za-z0-9_/?#=&%.]*$` — internal paths only. Applied to
      `programs.external_cta_href` or `tryouts.registration_href` it would
      reject every external registration URL those columns exist to hold,
      failing only when a club first saved a real partner link. External
      href columns instead mirror the `''`/local-path/`http:`/`https:`/
      `mailto:` allowlist already enforced at
      `lib/admin-data-contract.ts:56-68`. `registration_href` also
      deliberately permits `''`, since empty is the documented TBA state
      that fails closed to the `mailto:` fallback.
- Files changed: `docs/phase-11/diverse-city/DOMAIN-DESIGN.md` (status →
  `approved`, constraint policy, per-table checks, approval block),
  `docs/phase-11/diverse-city/EPIC.md` (pinned commit),
  `docs/phase-11/diverse-city/DECISIONS.md` (`DCFC-D109`),
  `docs/phase-11/diverse-city/STATUS.md`, `HANDOFF.md`. No migration written
  or applied; no application code, test, or `supabase/migrations/` file
  touched. The isolated snapshot repository was read but not modified — it
  remains clean at `5bbdfa3`.
- Verification: documentation-only package, so verification was source
  confirmation rather than test execution — each claim above was checked
  against the actual migration, contract, or plan file cited, not inferred.
  No test suite was run because no code changed; running one would not have
  evidenced anything about this package.
- Blockers or decisions needed: none for this package. Two carried forward,
  neither blocking: `DCFC-D102` (real Tryouts facts — age groups,
  eligibility, dates, location, cost) and `DCFC-D106` (which placeholder
  areas get official content) remain open and will block Phase 3 content
  population, not Phase 2. `PF-001` in `docs/platform-findings.md` still
  needs Christian's decision — extract Rose City's six remaining `club.slug`
  branches, or amend the Phase 9 gate to state its true achieved scope.
- Exact next step: `DCFC-201` (red contracts) is `ready` and unassigned.
  It must add focused failing contracts for the approved Programs, Contact,
  and Tryouts domains, and per `DCFC-D108` must include explicit tier
  coverage proving a Starter club can read `contact_*` but still cannot read
  `programs`/`tryouts`. It is deliberately **not** started here — a package
  becoming eligible is not authorization to begin it, and this session's
  approval covered `DCFC-103` only.
- Hosted mutations: none. No Supabase, Storage, Vercel, Stripe, DNS, email,
  or auth resource was contacted or changed.

### 2026-07-31 — PF-001 investigation (platform, not epic scope) — Claude Code (Opus 5)

- Package: none. Platform-wide finding work at Christian's direction; no
  DCFC package was advanced, started, or changed by this turn.
- Status: investigation complete; the PF-001 resolution decision is still
  open and belongs to Christian.
- Completed: read all seven `club.slug === "rose-city"` branches directly
  instead of relying on PF-001's grep-derived summary, and recorded a
  per-branch extractability assessment in `docs/platform-findings.md`. Two
  corrections to PF-001: the count is seven, not six (it missed
  `lib/flags.ts:51`, the implementation behind `NationalityFlag.tsx:20`),
  and its claim that the branches "work" is false for the Hero branch.
  Opened `PF-005`: `components/Hero.tsx:254` hardcodes a hero video URL on
  the legacy Supabase project `nsgtkwqkbyxkiwrhzsje`, permanently deleted
  during the Phase 8 closeout (`HANDOFF.md:968`); DNS returns `NXDOMAIN`,
  so Rose City's live homepage hero has no video and silently shows its
  static poster instead. Also established that
  `app/(public)/shop/page.tsx:34` is dead code — `SHOW_SHOP_HERO` is the
  constant `false`, so it renders for no club — and that `Nav.tsx:255`'s
  affiliation marks are a capability the Diverse City epic needs anyway.
- Files changed: `docs/platform-findings.md`, `HANDOFF.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No source file, test, or
  migration was modified; nothing was fixed, since the register is a record
  and not authorization to fix.
- Verification: each branch read at its cited line; `SHOW_SHOP_HERO`'s value
  read from `lib/site-flags.ts:3`; both Supabase hostnames resolved via DNS
  lookup (`NXDOMAIN` for the deleted legacy ref, normal resolution for the
  current production ref `ioalthwsdrlzrubomrow`). DNS lookups are read-only
  and mutate nothing.
- Blockers or decisions needed: PF-001's resolution (extract per-branch vs.
  amend the Phase 9 gate) and PF-005's intent decision (drop the dead video,
  re-host it, or fold it into the future Bunny.net capability) both need
  Christian.
- Exact next step: Christian chooses the PF-001 resolution. `DCFC-201`
  remains `ready`, unassigned, and unstarted — this turn did not touch it.
- Hosted mutations: none.

### 2026-08-01 — PF-001 resolved (platform, not epic scope) — Claude Code (Opus 5)

- Package: none. Platform work at Christian's direction; no DCFC package was
  advanced or started.
- Status: PF-001 complete and moved to the register's `Resolved` section.
  PF-005 remains open by Christian's explicit choice to track rather than
  fix.
- Completed: Christian chose "amend the gate + delete the dead code" over
  extraction. Amended `docs/onzio-platform-plan.md`'s Phase 9 gate to state
  its true achieved scope — new tenants resolve entirely through published
  presentation templates (`clubhouse@1` as the worked precedent), while Rose
  City retains six documented legacy `club.slug` branches pending
  extraction. The amended gate also states explicitly that it does not
  license new slug branches, which is what `EPIC.md`'s prohibition on
  `club.slug === "diverse-city"` depends on. Deleted the dead branch in
  `app/(public)/shop/page.tsx`: `SHOW_SHOP_HERO` is the constant `false`, so
  `{SHOW_SHOP_HERO && club.slug === "rose-city" && <ShopHero />}` rendered
  for no club at all. Removed it along with the now-unused `ShopHero`
  dynamic import and the `nextDynamic`/`SHOW_SHOP_HERO` imports, and
  collapsed the `SHOW_SHOP_HERO ? … : …` padding ternary to the
  `"pt-24 sm:pt-28"` value it already evaluated to — so rendered output is
  unchanged. Deliberately left `SHOW_SHOP_HERO` itself, its remaining use in
  `Nav.tsx:138`, and the now-unreferenced `ShopHero.tsx`/`ShopHeroMobile.tsx`
  in place: the flag is an intentional toggle and deleting the components
  would make re-enabling it impossible, which is wider than this change's
  scope. Confirmed six slug occurrences remain, exactly matching the amended
  gate's wording.
- Files changed: `docs/onzio-platform-plan.md`, `app/(public)/shop/page.tsx`,
  `docs/platform-findings.md`, `HANDOFF.md`,
  `docs/phase-11/diverse-city/STATUS.md`. Also added an `onzio-platform`
  entry to `/Users/christianalcala/.claude/launch.json` (outside the
  repository) so the dev server could be driven for browser verification;
  the two pre-existing entries were preserved.
- Verification: `npx tsc --noEmit` clean; `npm run test:contracts` 223/223;
  `npm run test:architecture` 18/18; `npm run test:db` 53/53; `npm test`
  548/548 — all matching the documented baselines exactly; `npm run lint`
  with only the three pre-existing analytics `react-hooks/exhaustive-deps`
  warnings; production build with loopback Supabase env passed. Browser
  check of `/shop` against the local `alpha` tenant — which takes the same
  non-`clubhouse@1` code path Rose City does — confirmed the page renders,
  the wrapper class is exactly `pt-24 sm:pt-28` as before the change, no
  `ShopHero` is present, no broken images, and no console errors. No test
  was skipped, weakened, or modified; no test referenced `ShopHero` or
  `SHOW_SHOP_HERO` at all, verified by grep before editing.
- Blockers or decisions needed: PF-005's intent decision remains open by
  Christian's choice. Rose City's live homepage hero currently shows a
  static poster where a video was intended.
- Exact next step: `DCFC-201` (red contracts) remains `ready`, unassigned,
  and unstarted, awaiting Christian's go-ahead. Nothing in this turn touched
  the epic.
- Hosted mutations: none. The only external network access was read-only DNS
  resolution of two Supabase hostnames, which mutates nothing.

### 2026-08-01 — PF-005 scoping (platform, not epic scope) — Claude Code (Opus 5)

- Package: none. Investigation at Christian's request; nothing was fixed.
- Status: PF-005 still open and unfixed by design. Two durable facts added
  to the register, and a new finding opened.
- Completed: established that the lost hero video **is recoverable**. It
  survives in the immutable Phase 8 frozen export as
  `…/storage/objects/videos/4f/4f8059d2…-Pan_Bench_Land_ready.mp4`,
  verified intact at 31,080,971 bytes, `ISO Media, MP4 Base Media v1`, with
  its actual `sha256` matching the checksum embedded in its own filename.
  No PF-005 option is foreclosed by asset loss. Also noted that its ~29.6 MB
  size is itself an argument for the `DCFC-D105` CDN decision rather than
  re-hosting on Supabase Storage. Opened `PF-006`: no contract, architecture
  test, or lint rule anywhere asserts that source stops referencing a
  decommissioned Supabase host — which is why PF-005 shipped silently and
  why it could recur. Phase 8 verified the deletion from the outside (does
  the host still resolve) but never from the inside (does anything still ask
  for it). Also recorded that the same dead host appears ~30 more times in
  `db/migrations/*.sql`, which are legacy seed files wired to no script —
  dead artifacts, not a live defect, but noisy enough to camouflage a real
  hit like `Hero.tsx:254`.
- Files changed: `docs/platform-findings.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No source file, test, or migration
  was modified.
- Verification: freeze-export file checksummed with `shasum -a 256` and
  type-checked with `file`; absence of any guarding contract confirmed by
  grep across `tests/`; `db/migrations` confirmed unreferenced by
  `package.json` and `vercel.json`.
- Blockers or decisions needed: PF-005's intent decision (drop the dead
  video, re-host it, or wait for the Bunny.net capability) and whether to
  add the PF-006 regression contract. Note the PF-006 contract would fail on
  `Hero.tsx:254` today, so it wants to land with or after a PF-005 fix.
- Exact next step: Christian decides PF-005's intent. `DCFC-201` remains
  `ready`, unassigned, and unstarted.
- Hosted mutations: none. No network access of any kind this turn.

### 2026-08-01 — PF-005 + PF-006 resolved (platform, not epic scope) — Claude Code (Opus 5)

- Package: none. Platform work at Christian's direction; no DCFC package was
  advanced or started.
- Status: both complete and moved to the register's `Resolved` section. All
  remaining open findings (PF-002, PF-003, PF-004) are latent or
  documentary and scheduled into `DCFC-201`/`DCFC-202`.
- Completed: removed the dead hero video from `components/Hero.tsx` — the
  `<video>` element carrying the deleted-project URL, the 43-line iOS Safari
  autoplay effect, `videoRef`, and the `videoMounted` state and effect, 89
  lines net. Added the PF-006 guard as a new architecture contract,
  `references no permanently deleted Supabase project`, mirroring the
  existing forbidden-string pattern in the same file and driven by a
  `DECOMMISSIONED_SUPABASE_HOSTS` list so future decommissions get an entry.
  `lib/migration/rose-city-plan.ts` is explicitly allowlisted as historical
  provenance rather than a runtime fetch.
- Two things worth flagging:
  - **The new contract paid for itself on its first run**, catching eleven
    `remotePatterns` entries in `next.config.mjs` still allowlisting the
    deleted project's buckets. Inert (the optimizer is bypassed and the host
    is `NXDOMAIN`) but exactly the class of reference the contract exists to
    find. Removed; the live project is supplied dynamically from
    `NEXT_PUBLIC_SUPABASE_URL`.
  - **A behavior bug was caught in my own change before verification.** The
    original markup was `{!videoMounted && <poster/>}` — the poster showed
    only until mount. Making it unconditional, the obvious simplification,
    would have given every non-`clubhouse@1` tenant Rose City's stadium
    photograph as its hero background. The poster is now scoped to
    `usesLegacyRoseCityHero`, preserving both paths exactly.
  - `usesLegacyRoseCityHero` deliberately remains — it still gates the
    overlay colour and the club-name `<h1>` — so PF-001's branch count stays
    at six, matching the amended Phase 9 gate.
- Files changed: `components/Hero.tsx`, `next.config.mjs`,
  `tests/architecture/platform-architecture.test.ts`,
  `docs/platform-findings.md`, `HANDOFF.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No migration; no epic file.
- Verification: `npx tsc --noEmit` clean; 223/223 contracts; 19/19
  architecture, up from 18; 53/53 database; 549/549 complete suite, up from
  548; lint with only the three pre-existing analytics warnings; production
  build passed with 25 pages; `git diff --check` clean. The guard was proved
  capable of failing — a temporary probe file containing the dead host made
  it fail and name the file, then was removed. Browser verification against
  a temporary local `rose-city` tenant confirmed zero `<video>` elements, no
  `nsgtkwqkbyxkiwrhzsje` anywhere in the DOM, `hero-poster.jpg` loading at
  its true 1920x1080, no club-name `<h1>`, and no console errors; the
  non-Rose-City path was then re-checked to confirm the poster does not
  leak. The temporary club rename and its `rose-city.localhost` domain row
  were both reverted — the local database is back to `alpha`/`bravo`/`lions`.
  No test was skipped, weakened, or deleted; the suite grew by one.
- Blockers or decisions needed: none. Two follow-ups recorded but not acted
  on: roughly thirty dead-host references remain in `db/migrations/*.sql`
  (legacy seed files wired to no script; the contract does not scan `db/`),
  and Rose City's hero is now deliberately a still image — restoring video
  later means the Bunny.net capability, with the source file still
  recoverable from the frozen export.
- Exact next step: `DCFC-201` (red contracts) — `ready`, unassigned, and now
  the agreed next package. Per the parked-work plan it should also absorb
  the Starter + active + live seed fixture and PF-002's three-way
  entitlement agreement test, while PF-002's underlying `shop`/`seasons`
  fix stays out of scope.
- Hosted mutations: none. All database changes were against the loopback
  local instance and were reverted.

### 2026-08-01 — DCFC-201 — Claude Code (Opus 5)

- Package: DCFC-201 (red contracts)
- Status: complete
- Completed: added 32 focused contracts across two new files describing the
  Programs, Contact, and Tryouts behavior approved in `DOMAIN-DESIGN.md`
  (`DCFC-D109`) and the tier gating from `DCFC-D108`. 27 are intentionally
  red; 5 pass because they lock existing correct behavior.
  - `tests/contracts/diverse-city-domains.test.ts` (15 tests) — admin
    registration in `ADMIN_TABLE_FEATURES` and the request schema, singleton
    vs multi-row classification, the `'contact'` Starter-allowlist addition,
    `programs`/`tryouts` staying Pro-only, preservation of
    `club_has_feature`'s `security definer` / `set search_path = ''` /
    `stable` properties, `academy@1` template registration, `programs` and
    `contact` route/module registration at the approved entitlements, the
    PF-002 entitlement-agreement contract, and a lock on `EPIC.md`'s
    prohibition of `club.slug === "diverse-city"` branches.
  - `tests/database/diverse-city-domains.test.ts` (17 tests) — table
    existence, composite `(club_id, program_id)` cross-tenant rejection,
    href protocol check constraints, empty `registration_href` permitted as
    the honest TBA state, anonymous Starter reads of `contact_*` allowed,
    anonymous Starter reads of `programs`/`tryouts` returning nothing,
    anonymous Pro reads succeeding, anonymous writes denied, and preview-club
    invisibility.
  - **Seed fixture**: added club `charlie` (`33333333-…`, Starter, active,
    live) to `supabase/seed.sql` and `tests/fixtures/entities.ts`. This
    combination did not exist — Alpha and Lions are Pro, Bravo is Starter but
    onboarding/preview, so `can_read_club` rejects it before tier is
    consulted. Without Charlie the `DCFC-D108` tier coverage could not be
    written at all, and it is the same blind spot that hid PF-002.
- Two things worth flagging:
  - **Eight of the database contracts were initially false greens.** They
    asserted only that an operation was rejected — and a missing table is
    also a rejection, so they passed today for entirely the wrong reason and
    would have kept passing even if `DCFC-202` shipped the tables with no RLS
    at all. Verified against PostgREST directly that a missing table returns
    `PGRST205` while a real denial returns `42501` and a check violation
    `23514`, then rewrote every negative assertion to name the specific code
    it expects. All 17 now fail for the intended reason.
  - **The PF-002 agreement contract is scoped, not silently widened.** It
    locks `moduleRegistry` against the `club_has_feature` allowlist for every
    feature except `store` and `seasons`, the two contradictions already
    recorded in `docs/platform-findings.md`, which are named in an explicit
    exclusion set with a pointer to the finding. New drift cannot be
    introduced while PF-002 stays open; fixing the two existing
    contradictions remains out of this package's scope per the register, and
    resolving PF-002 means deleting the exclusion set.
- Files changed: `tests/contracts/diverse-city-domains.test.ts` (new),
  `tests/database/diverse-city-domains.test.ts` (new), `supabase/seed.sql`,
  `tests/fixtures/entities.ts`,
  `docs/phase-11/diverse-city/STATUS.md`, `HANDOFF.md`. No migration was
  written, no application code changed, and no placeholder implementation was
  created to turn any contract green.
- Verification: `npx tsc --noEmit` clean. `npm run db:reset` applied the new
  seed; confirmed `charlie` is `starter`/`active`/`live`. Full `npm test`
  reports **27 failed / 554 passed (581 total)** across **2 failed / 55
  passed** files — the two failing files are the two added here, and the 554
  passing includes all 549 that passed before, so no pre-existing contract
  regressed. `npm run test:architecture` 19/19. `npm run lint` with only the
  three pre-existing analytics warnings. `npm run db:types:check` reports
  generated types still match the local schema (expected — no migration).
  Production build passed with 25 pages. `git diff --check` clean.
- Blockers or decisions needed: none.
- Exact next step: `DCFC-202` (schema, RLS, types, audit) — write the
  migration creating `onzio.programs`, `onzio.contact_profile`,
  `onzio.contact_page_content`, and `onzio.tryouts` exactly as
  `DOMAIN-DESIGN.md` specifies, additively extend the `club_has_feature`
  Starter allowlist with `'contact'` while preserving its security
  properties, register the four tables in `ADMIN_TABLE_FEATURES`, and
  regenerate database types. That closes the 17 database contracts and most
  of the 10 TypeScript ones; `academy@1` and the route/module registrations
  belong to `DCFC-203`.
- Hosted mutations: none. All database work was against the loopback local
  instance.

### 2026-08-01 — DCFC-202 — Claude Code (Opus 5)

- Package: DCFC-202 (schema, RLS, types, audit)
- Status: complete
- Completed: added
  `supabase/migrations/20260801120000_phase11_diverse_city_domains.sql`,
  implementing `DOMAIN-DESIGN.md` exactly as approved in `DCFC-D109`:
  - `onzio.programs` and `onzio.tryouts` as multi-row tables with
    `unique (club_id, id)`, and `onzio.contact_profile` /
    `onzio.contact_page_content` as `club_id`-primary-key singletons.
  - Composite tenant-safe foreign keys throughout — media references via
    `(club_id, *_media_asset_id)` to `media_assets`, and
    `tryouts (club_id, program_id)` to `programs(club_id, id)` so a tryout
    cannot reference another club's program.
  - The full column-constraint policy added during the `DCFC-103` review:
    `between 1 and N` for the two genuinely required columns
    (`programs.slug`, `programs.display_title`), `<= N` everywhere else
    because those columns are `not null default ''`, and href checks that
    mirror the application allowlist (`''`, local path, `http`, `https`,
    `mailto`) rather than `homepage_hero_content`'s internal-path-only
    pattern, which would have rejected every external registration URL.
  - RLS enabled with four policies per table, `anon, authenticated` select
    grants, `authenticated` mutation grants, `service_role` all, plus
    `audit_content_mutation()` and `set_updated_at()` triggers, and
    `(club_id, sort_order, …)` indexes on the two multi-row tables.
  - `club_has_feature` additively extended with `'contact'` per `DCFC-D108`,
    reproducing every security attribute of the original definition.
  - Registered all four tables in `ADMIN_TABLE_FEATURES` and both contact
    tables in `SINGLETON_TABLES`; regenerated `lib/database.generated.ts`.
- Also resolved **PF-003**: documented the tier-entitlement mechanism in
  `docs/onzio-platform-plan.md` under Row-Level Security — the hardcoded
  Starter allowlist, Pro-by-default for unlisted names, the fact that
  `can_read_feature` gates anonymous public reads so the failure mode is a
  blank page, the `ADMIN_TABLE_FEATURES` requirement, and the attributes any
  edit must preserve. Done here because this package was already modifying
  that function.
- One regression caught and fixed: the migration's own explanatory comment
  contained the literal phrase used by the `hardens every security-definer
  function` architecture contract, which counts raw occurrences across all
  migration SQL and requires a matching empty-search-path for each. The
  comment was reworded rather than the security contract loosened.
- **PF-004 was not actionable here** and remains open. It concerns the
  Bunny.net video reference column, which this migration does not add — no
  video capability was in `DOMAIN-DESIGN.md`'s scope. It should be revisited
  when that column is actually designed.
- Files changed:
  `supabase/migrations/20260801120000_phase11_diverse_city_domains.sql`
  (new), `lib/admin-data-contract.ts`, `lib/database.generated.ts`,
  `docs/onzio-platform-plan.md`, `docs/platform-findings.md`,
  `docs/phase-11/diverse-city/STATUS.md`, `HANDOFF.md`, and a corrected
  helper in `tests/contracts/diverse-city-domains.test.ts` (see below). No
  test was skipped, weakened, or deleted.
- One test correction, which strengthened rather than weakened a contract:
  the allowlist assertions read only the original foundation migration, so
  once `club_has_feature` was replaced in a later migration they were
  checking a stale definition. They now resolve the effective definition —
  the last migration in filename order that declares the function — so the
  security-attribute assertion actually covers the live version. Without
  this, a future migration could drop `security definer` and the contract
  would still pass.
- Verification: `npx tsc --noEmit` clean. `npm run db:reset` applied the
  migration from scratch. `npm run db:types` regenerated types and
  `npm run db:types:check` confirms they match the local schema.
  `npx supabase db lint --local` reports no schema errors across `onzio`,
  `onzio_private`, and `public`. Full `npm test` reports **3 failed / 578
  passed (581)** across 1 failed / 56 passed files — down from 27 failures,
  and the 3 remaining are the `DCFC-203` presentation contracts. All 17
  database contracts pass, including anonymous Starter reads of `contact_*`
  succeeding while `programs`/`tryouts` return nothing for the same club,
  and the composite cross-tenant rejection. `npm run test:architecture`
  19/19. `npm run lint` with only the three pre-existing analytics warnings.
  Production build passed with 25 pages. `git diff --check` clean.
- Blockers or decisions needed: none.
- Exact next step: `DCFC-203` (presentation routes, modules, sections) —
  register the `academy@1` template per `DCFC-D104`, add `programs` and
  `contact` to `routeRegistry`, and add module entitlements
  (`programs: pro`, `contact: starter`, `tryouts` already `pro`). That closes
  the last 3 red contracts. `DCFC-204` then wires queries and admin
  mutations.
- Hosted mutations: none. All database work was against the loopback local
  instance.

### 2026-08-01 — DCFC-203 audit (no implementation performed) — Claude Code (Opus 5)

- Package: DCFC-203
- Status: in_progress — **audit only. This session wrote no code and changed
  no application file.** Only this file was updated.
- Why this record exists: a session picked up the epic expecting `DCFC-103` to
  need approval (it did not — `DCFC-D109` closed it 2026-07-31) and found
  `DCFC-203` implementation already present in the working tree with **no
  completion record**, while this file still said "ready / not started / 3
  contracts red." Christian was unsure whether `DCFC-203` had been completed,
  so an audit was run rather than assuming either way.

**Verified current state (all re-run 2026-08-01, not inherited claims):**

| Check | Result |
| --- | --- |
| `npm test` | 581/581 passed, 57 files |
| `npm run test:contracts` | 238/238 |
| `npm run test:architecture` | 19/19 |
| `npm run test:db` | 70/70 |
| `npx tsc --noEmit` | clean |

`test:db` requires the loopback env mapped, otherwise all 70 fail with a
misleading "[RED CONTRACT] Local Supabase is unavailable":
`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`
from `npx supabase status -o env`.

**What the unrecorded work correctly did** (`packages/presentation/index.ts`):

- Registered `academy@1` with a complete entry — `originNote` cites the
  approved pinned snapshot `5bbdfa3`; `defaultFontPack` is the new
  `montserrat-inter-dmsans` pack; `defaultSections`/`supportedSections` list
  five `academy.*` sections plus `shared.next-match` and `shared.history`,
  which maps 1:1 onto the seven homepage sections inventoried in
  `CONTENT-MATRIX.md`.
- Registered the `montserrat-inter-dmsans` font pack, matching Diverse City's
  approved Montserrat / Inter / DM Sans stack per `DCFC-D104`.
- Added `programs` (`/programs`) and `contact` (`/contact`) to
  `routeRegistry`, and `programs: pro` / `contact: starter` to
  `moduleRegistry`, matching `DCFC-D108` exactly.

**Gap 1 — no pinned `academy@1` document contract.**
`tests/contracts/presentation-system.test.ts` pins a validating document for
`cinematic@1` (line 229) and `clubhouse@1` (line 242). There is no
`academy@1` equivalent, so nothing proves an `academy@1` document survives
`parsePresentationDocument(..., { surface: "production" })` — schema,
provenance, and production-surface rules included. This is the established
precedent: the pinned `clubhouse@1` document was added specifically so that
template "cannot regress into an unregistered tenant branch." The registry
entry currently exists but is never exercised.

**Gap 2 — reachable `academy@1` / `bebas-inter` compatibility bug.**
Font-pack compatibility is stored in two independent lists that disagree for
`academy@1` only:

- `academy@1.compatibleFontPacks` includes `bebas-inter`
- `fontPacks["bebas-inter"].compatibleTemplates` is
  `["cinematic@1", "heritage@1", "clubhouse@1"]` — omits `academy@1`

All four templates were checked; every pre-existing one is bidirectionally
consistent, so this was introduced with `academy@1`. It is reachable, not
theoretical: switching a `clubhouse@1` or `heritage@1` club (both on
`bebas-inter`) to `academy@1` hits `packages/presentation/index.ts:839`,
which tests the **template's** list and therefore keeps `bebas-inter`; the
resulting document then fails validation at
`packages/presentation/index.ts:701`, which tests the **font pack's** list.
`switchTemplate` emits a document that fails its own validation. No test
catches it because nothing asserts the two lists agree — structurally the
same two-sources-of-truth problem as `PF-002`.

- Files changed: `docs/phase-11/diverse-city/STATUS.md` only.
- Blockers or decisions needed: none. The Gap 2 fix direction was confirmed by
  Christian on 2026-08-01 and recorded as **`DCFC-D110`**: add `"academy@1"` to
  `fontPacks["bebas-inter"].compatibleTemplates`, treating `bebas-inter` as the
  universal fallback pack. The rejected alternative (removing `bebas-inter`
  from `academy@1.compatibleFontPacks`) would have left `academy@1` as the only
  template without a fallback pack.
- Exact next step: assign `DCFC-203`, close both gaps, add a contract
  asserting bidirectional font-pack agreement so this class of drift cannot
  recur, re-run the full suite, and write the `DCFC-203` completion record
  that is still missing.
- Hosted mutations: none. This session ran only local reads and local tests.

## Record Template

Copy this section and append it under Completion Records:

```markdown
### YYYY-MM-DD — DCFC-XXX — Agent name

- Package: DCFC-XXX
- Status: in_progress | blocked | in_review | complete
- Completed:
- Files changed:
- Verification:
- Blockers or decisions needed:
- Exact next step:
- Hosted mutations: none | approved evidence
```

## Integration Rule

If packages run in parallel worktrees, each agent records progress on its
branch. The designated integrator must preserve every completion record while
merging, reconcile the package ledger, run the required broad verification,
and update `HANDOFF.md`. No completion record may be dropped merely to resolve
a documentation conflict.
