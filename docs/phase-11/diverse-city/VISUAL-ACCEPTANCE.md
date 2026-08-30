# Diverse City FC Visual Acceptance

Status: `contact_and_tryouts_approved`

Last updated: 2026-07-31

## Pinned Existing Baseline

- Snapshot repository:
  `/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site`
- Branch: `main`
- Commit: `08f7b53c902f7eb97c1bcdbdd70fc74b7ad1a13a`
- Commit subject: `Publish Diverse City FC client preview`
- Client preview: `https://diverse-city-fc-preview.vercel.app`
- Indexing state: `noindex, nofollow`

The pinned commit is the pre-Phase-0 route baseline (does not include Contact
or Tryouts).

## Approved Phase 0 Commit (DCFC-003)

- Branch: `main` (local only; this snapshot repository has no configured
  remote, so neither commit below was ever pushed anywhere)
- Commit: `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`
- Commit subject: `Add dedicated Date card to Tryouts page`
- Parent commit: `a0f9f0c201e7d0e54b821c22f8c60159798f7477` — `Add Contact
  and Tryouts pages for Onzio Phase 0 (DCFC-001, DCFC-002)`, containing
  `app/(public)/contact/page.tsx`, `app/(public)/tryouts/page.tsx`,
  `components/Nav.tsx` (Schedule dropdown restructuring, Contact added to
  main nav), `components/Footer.tsx` (Tryouts link added), `README.md`
- The current commit (`5bbdfa3`) adds a dedicated Date detail card (`TBA`)
  to `/tryouts`, alongside Location and Cost, per Christian's follow-up
  review request after the initial DCFC-003 evidence pass documented its
  absence as a gap (see below).
- The current commit is the approved Phase 0 visual specification for
  Contact and Tryouts. Later Onzio implementation must be compared against
  this commit, not an intermediate or in-memory state.

## Required Phase 0 Routes

### Contact

- Route: `/contact`
- Desktop target: 1440x900
- Mobile target: 390x844
- Initial interaction boundary: contact destinations only; no persisted form
- Required checks: navigation state, footer, focus states, email/phone/social
  actions, long-text wrapping, missing optional fields, and no overflow

### Tryouts

- Route: `/tryouts`
- Desktop target: 1440x900
- Mobile target: 390x844
- Initial interaction boundary: external registration CTA only
- Required checks: open/closed/upcoming presentation, missing URL behavior,
  dates/locations, focus states, third-party disclosure, and no overflow
- FAQ: intentionally out of scope — Christian confirmed tryout logistics
  belong on the club's external registration partner, not duplicated here
  (see evidence section below)

## Evidence Recorded for DCFC-003 (2026-07-31)

- **Exact commit**: `a0f9f0c201e7d0e54b821c22f8c60159798f7477`, see above.
- **Screenshots**: reviewed live in the Browser pane during this session at
  1440x900 desktop and 390px-wide mobile for both routes (hero, detail
  cards/rows, footer). No screenshot files were exported to disk — this
  session's tooling did not include a screenshot-to-file mechanism. Christian
  additionally reviewed both pages live in his own local dev server
  (`npm run dev -- --port 3012`) before approving, which is a stronger
  acceptance signal than a reviewed screenshot file.
- **Route HTTP success**: `curl -I` against the local dev server returned
  `HTTP/1.1 200 OK` for both `/contact` and `/tryouts`.
- **Console errors / framework overlays**: none, checked via a fresh browser
  tab (an earlier check in a long-lived tab showed a stale RSC-prefetch
  error from unrelated prior navigation in that tab's history; a clean tab
  reload confirmed zero errors on both routes).
- **Horizontal overflow**: none — `document.documentElement.scrollWidth ===
  window.innerWidth` confirmed at both breakpoints on both routes.
- **Image load evidence**: all rendered images (crest, U.S. Soccer/FIFA/UPSL
  affiliation marks, social icons) reported positive `naturalWidth`/
  `naturalHeight` via `document.images` on both routes. Neither page uses
  video.
- **Keyboard navigation and visible focus**: real `Tab` key presses (not
  scripted `.focus()`) reached the Contact detail-card email link and the
  Tryouts external CTA; both show a native browser focus outline
  (`outline-style: auto`, confirmed via computed style — thin at 1px so
  easy to miss in a downscaled screenshot, but genuinely present and
  identical to the site's existing focus behavior elsewhere).
- **Navigation and footer links verified**: enumerated every `nav a` and
  `footer a` on both routes — Home/About/Roster/Schedule (dropdown:
  Fixtures, Tryouts)/Programs (dropdown: 4 programs)/Store/Contact in the
  primary nav, and Club/Programs/Roster/Schedule/Sponsors/Contact/Tryouts in
  the footer, all resolving to the correct `href`.
- **External links verified without submitting data**: Contact's
  `mailto:`/`tel:`/social links and Tryouts' registration CTA
  (`https://www.google.com/`, `target="_blank" rel="noopener noreferrer"`)
  are plain anchor navigations — no form, no POST, nothing collected.
- **`noindex, nofollow` verified**: confirmed both as the `X-Robots-Tag:
  noindex, nofollow` response header (via `curl -I`) and as the page-level
  `<meta name="robots">` tag, on both routes.
- **Client copy/visual approval recorded with date**: Christian approved
  `/contact` in chat on 2026-07-31 (after requesting the location line drop
  its "— Chicago Area" suffix) and approved `/tryouts` in chat on 2026-07-31
  (after requesting removal of the eyebrow/status badge/"Take the field."
  headline line and the Age Groups card, tightening the Schedule/Programs nav
  dropdowns, tightening the hero-to-cards spacing, and realigning the
  Location/Cost block to not stretch full-width).

### Documented gaps against the Tryouts required-checks list

- **FAQ**: intentionally out of scope, not a gap. Christian confirmed on
  2026-07-31 that tryout logistics (eligibility, what to bring, cost,
  scheduling, next steps) will be covered by the club's external
  registration partner once a real destination replaces the temporary
  placeholder URL, so Onzio does not need to duplicate that content on
  `/tryouts`. This is consistent with `DCFC-D003` (registration/eligibility
  details remain third-party responsibilities). No FAQ section is planned
  for this page.
- **Dates**: resolved as of commit `5bbdfa3` — a dedicated Date detail card
  now sits alongside Location and Cost. It renders `TBA`, honestly, since no
  real tryout date exists yet; this does not resolve the underlying
  `DCFC-D102` content gap, only the visual/structural gap of not having a
  dedicated field for it. Re-verified after adding it: `npm run typecheck`
  passed; a clean `npm run build` (after clearing `.next`) passed with the
  same warnings as before; desktop (1440x900, using the Browser pane's
  `desktop` preset after an unrelated raw-pixel `resize_window` call
  produced a `devicePixelRatio: 2` capture artifact — confirmed via computed
  `window.innerWidth`/`scrollWidth` that the underlying layout was always
  correct, only the screenshot capture was affected) and mobile (375x812
  preset) checks confirmed the three-card row displays correctly with no
  horizontal overflow on desktop and correct single-column stacking on
  mobile.
- **Open/closed/upcoming presentation**: verified in the DCFC-002 work by
  temporarily toggling the `tryoutStatus` constant through all three values
  and confirming each renders distinct, correct copy and CTA behavior (see
  `STATUS.md`'s DCFC-002 records for the detailed verification). Not
  re-toggled during this DCFC-003 pass since the underlying code did not
  change after that verification.

## Platform Parity Standard

Later Onzio implementation must be compared against the approved Phase 0
snapshot, not against memory or an intermediate local state. Record:

- typography and line wrapping
- section order and spacing
- color and semantic contrast
- navigation and scroll transitions
- media crop and aspect behavior
- carousel/motion behavior and reduced-motion handling
- responsive stacking
- empty and unavailable states

Material visual changes require a recorded decision rather than silent drift.
