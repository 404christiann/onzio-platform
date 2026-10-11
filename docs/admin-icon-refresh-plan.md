# Admin portal icon refresh

Status: complete; approved selections implemented and verified locally on the isolated branch.
Package: `ADMIN-ICONS-01`
Branch: `codex/admin-icon-refresh`
Base: refreshed `origin/main`, `41bfb009089bb2b67ff048c71d1a3c6fac11578c`
Prepared: 2026-10-11

## Goal and scope

Use Christian's saved icons.download library consistently across the protected
club admin portal. Cover navigation, dashboard actions, header controls, page
actions, editors, upload controls, status icons, and admin uses of shared inputs.
Keep existing layout, colors, control sizes, labels, behavior, accessibility, and
authorization intact. Public pages, club-content icons/logos, nationality flags,
authentication screens, the uncommitted post-OTP reveal, and operator tooling
are outside this package. Chart geometry and loading animations are not static
interface icons; preserve those implementations.

## Verified starting state

- `components/AdminShell.tsx` maps 19 route icons and three group icons using
  Lucide. Desktop and phone navigation use the same mapping.
- Lucide also appears in Account Menu, Theme Toggle, Route Search, Side Panel,
  File Upload, Payment Status Card, Homepage Editor, and several protected pages.
- Inline SVG controls appear in Roster, Shop, Sponsors, Analytics, Match Stats,
  Season Stats, and save feedback. Homepage notifications use text glyphs.
  Inspect each use before replacement; an SVG match alone does not establish
  that it is an interface icon.
- Shared `components/ui` controls include icons in Calendar, Native Select,
  Checkbox, Number Stepper, and Sidebar. Trace their consumers before changes
  so public and auth uses retain their existing rendering.
- The current checkout remains on `codex/otp-email-design-and-paste` with
  unrelated dirty sign-in, documentation, and other work. The new branch was
  created without switching this checkout. No implementation has started.

## Source and proposed style

Source root:
`/Users/christianalcala/Documents/Codex/2026-10-09/i-w/outputs/icons-download/`.
README, catalog, and saved license were inspected directly.

Initial preview used **regular / outline / round**. Christian requested larger,
heavier icons on 2026-10-11 and clarified that label weights should stay as-is.
The revised preview recommends **medium / outline / round**, with Regular and
Bold comparisons available, and **24px navigation glyphs**. Source route icons
are 22px and group icons 16px; 24px enlarges both. Preview size controls also
offer 20/22/26px. Control rows, spacing and small utility sizes stay unchanged.
The saved examples have a 24×24 viewBox and outline geometry stored as filled
paths. Preserve the drawing and viewBox; replace hardcoded black fills with
`currentColor`, including nested paths. Do not apply blanket stroke attributes
that would thicken these filled outlines. Use original source weight variants.
Copy only selected assets and retain the license; no new package dependency.

Approved navigation mapping:

| Destination or group | Library asset under medium/outline/round |
| --- | --- |
| Dashboard | `design/layout.svg` |
| Homepage | `navigation/house.svg` |
| Programs | `navigation/layers.svg` |
| Tryouts | `date-and-time/calendar-check.svg` |
| Shop | `commerce/cart.svg` |
| About | `system/info.svg` |
| Sponsors | Keep current Lucide Handshake |
| Contact | `communication/contacts.svg` |
| Seasons | `date-and-time/calendar.svg` |
| Roster | `communication/users.svg` |
| Schedule | `date-and-time/calendar.svg` |
| Match Stats | `commerce/chart.svg` |
| Season Stats | `files/clipboard-text.svg` |
| Standings | `education/cup.svg` |
| Registrations | `files/file-text.svg` |
| Analytics | `commerce/chart-pie.svg` |
| Branding | `design/palette.svg` |
| Team Access | `content/shield-check.svg` |
| Payments | `commerce/card.svg` |
| Website group | `navigation/globe-alt.svg` |
| Competition group | `education/cup.svg` |
| Club Settings group | `interface/sliders.svg` |

Utility equivalents include search, menu, close, carets, sign out, sun/moon,
plus/minus, upload/download, edit, delete, more, drag, lock, warning, and check.
Confirm each selected file exists. Where there is no meaningful equivalent,
record the exception and show a candidate before changing its meaning.

## Implementation sequence after approval

1. **Isolate and preview.** Use a clean worktree on the new branch; preserve the
   existing checkout. Record the baseline, trace all admin icon consumers, and
   capture existing desktop/phone states using synthetic local data. Present an
   isolated icon sheet and desktop/phone shell comparison in both themes before
   applying the drawings to the application. Resolve unclear mappings there.
2. **Add a small admin icon module.** Adapt only required SVGs to typed React
   components in `components/admin/icons/`. Support existing SVG class names,
   sizes and refs where required, preserve geometry, and inherit color.
   Decorative icons are hidden from assistive technology; accessible names stay
   on controls and existing status messages. Keep the route manifest server-safe
   with its existing string keys.
3. **Replace shell and common controls.** Wire the route/group mappings,
   dashboard Quick Actions, search, theme, account, drawer, panel, and upload
   controls to the new module. Keep the existing route visibility, active state,
   keyboard, focus, drawer scrolling and resize behavior.
4. **Complete the page audit.** Replace static interface icons and relevant
   glyphs throughout protected pages/editors/status messages. For shared UI
   primitives, use explicit icon injection or a narrow admin wrapper with the
   existing default retained elsewhere. Avoid global SVG/CSS replacement.
   Re-audit all protected routes and record deliberate exceptions.
5. **Verify and deliver.** Run focused navigation/shell/theme/editor contracts,
   then the repository's required TypeScript, contracts, architecture, isolated
   local database and full test suites, lint and build. Compare every protected
   route at desktop/phone sizes in light/dark themes. Check icon-only names,
   focus, active/disabled/destructive states, drawer and panel behavior, and no
   overflow. Report baseline failures with evidence; never weaken assertions.
   Review shared consumers for public/auth visual changes. Update this ledger
   and `HANDOFF.md`, then return the scoped diff and before/after screenshots.

Build in the isolated worktree so it cannot disrupt the existing development
server's `.next` directory. Use loopback Supabase and test-mode billing fixtures
for verification; do not rely on the retired hosted staging project.

## Acceptance

- All identified static admin interface icons use the selected family, or have
  an explicitly documented, justified exception.
- Both themes inherit existing foreground/active/status colors correctly.
- No control geometry, route visibility, product workflow, or accessibility
  behavior regresses; shared public/auth consumers keep their baseline.
- Required checks pass, or unrelated baseline failures are recorded exactly.
- Desktop/phone screenshots and a complete audited surface list are recorded.
- No production push, deployment, provider change, schema migration, or public
  page redesign is part of this package.

## Status ledger

Implementation complete in the attached worktree on `codex/admin-icon-refresh`.
The authorized subagent applied the approved role exports to 27 existing
application/shared files, added 44 selected SVG assets and their license,
retained the exact approval in `components/admin/icons/approved-selection.json`,
and added five consumer isolation regressions. Optional NativeSelect injection
and per-instance calendar chevrons preserve shared public/auth defaults.
Four registration actions without an approved role retain their existing
drawings; full scope and exceptions are in `docs/admin-icon-refresh-audit.md`.

Verified: TypeScript, lint, production build, 1,049 contracts, 21 architecture,
310 isolated local database tests and all 1,783 tests pass. A final 13-test
schedule/consumer check and final build/lint refresh pass after the last glyph
cleanup. Parent independently confirmed all 47 rendered SVG choices, exact
geometry of all 44 copied assets, original Sponsors rendering, and byte-identical
default/public NativeSelect markup. Parent CUA verified actual-source shell,
dashboard and controls with synthetic data at 1440x900 and 390x844 in both themes,
24px navigation, all three groups, search, panel, drawer focus/scroll and no
phone overflow. Full page-editor save workflows and native iOS were not exercised
by this icon harness. Source/API/security behavior is retained and full contracts
pass. Screenshots: `/private/tmp/admin-icons-applied-desktop.jpg`,
`/private/tmp/admin-icons-applied-phone-light.jpg`,
`/private/tmp/admin-icons-applied-phone-dark.jpg`.
Applied-source preview: `http://127.0.0.1:3187/implemented.html`.
User authorized committing and opening a PR on 2026-10-11. Branch preview deployment is disabled in `vercel.json`; local preview artifacts are excluded from the commit. No merge, deployment or provider mutation is authorized. Original dirty OTP
work is preserved. Next: review the requested PR and
coordinate its icon exports with `codex/admin-guided-redesign` before merging.

Christian approved portal implementation on 2026-10-11 after choosing all icons.
Parent captured the actual active tab (tab 4), with 47 explicit choices, Medium
weight and 24px navigation. Changes from the chooser defaults: Shop cart,
Sponsors Keep current icon, Contact contacts, Website group globe-alt and Club
Settings group sliders. Dashboard Layout and Programs Layers stay selected.
Exact receipt: `components/admin/icons/approved-selection.json` (captured from
`/private/tmp/onzio-approved-admin-icons.json`). Existing authorized subagent resumed in the same
managed worktree. No additional visual approval is required for this selected
set; deployment remains outside the authorized scope.

Previous preview iteration: all 47 navigation/group/utility roles have a searchable,
grouped chooser with curated alternatives and a Keep current icon option.
Dashboard Layout, Programs Layers, Medium, 24px and Light were preserved from
Christian's active preview. Choices persist in browser storage and the URL;
reset exposes Undo. Repeated drawings have independent semantic roles.
Search, sign out and theme symbols honestly offer one saved-library drawing
plus the current icon. Page-only utilities use explicitly labeled samples.
Parent CUA verified all 47 roles, changing Standings independently from the
Competition group, reload persistence, and actual current Lucide rendering
for Search. Test choices were restored. Desktop/phone frame widths are
1440/390 CSS pixels and both receive all 47 selections. Screenshot:
`/private/tmp/admin-all-icon-chooser.jpg`. The subagent's 12 standalone preview
checks pass, including 324 source-weight assets, URL migration/roundtrip,
invalid-state handling and unchanged production hashes. Download selections
is implemented; the in-app browser did not expose a download event during
parent verification, so file delivery is not claimed as verified. Current
temporary server session: `60327`. That preview stage was later approved above.

Previous review: Christian liked the first preview, requested Dashboard/Programs
alternatives and larger/bolder icons, and clarified **heavier icons only**.
The revised preview has three independent candidates per destination, source
weight selection and 20/22/24/26px navigation sizes. Recommended pair:
Dashboard panels (`design/layout`) and Club program (`navigation/flag`), Medium,
24px. Labels, 40px rows, gaps and utility sizes are unchanged. Parent CUA
verified candidate selections update both iframe URLs, Medium/Bold selection,
actual 24px glyph geometry and dark phone no-overflow (390/390). Screenshots:
`/private/tmp/admin-icon-iteration-choices.jpg` and
`/private/tmp/admin-icon-iteration-phone-dark.jpg`. Agent validated 49 unique
source assets across three weights, compilation and unchanged production-source
hashes. No additional production contract runs were needed for artifact-only
iteration. Updated temporary server session: `65595`.

| Package | Status | Completed | Files changed | Verification | Blockers | Exact next step |
| --- | --- | --- | --- | --- | --- | --- |
| ADMIN-ICONS-01 | complete | Approved 47-role module applied to navigation, dashboard and protected controls; 44 source assets/license; preserved current Sponsors and four unselected registration actions; shared defaults isolated | 27 existing application/shared files, `components/admin/icons/`, five consumer regressions, scoped audit/HANDOFF and isolated source harness | TypeScript/lint/build/diff pass; 1,049 contracts, 21 architecture, 310 local DB, 1,783 total tests; exact source/SSR checks and actual-source CUA desktop/phone/both themes | None for selected icon scope; source harness uses synthetic data and does not exercise full editor saves or native iOS | Open/review the requested PR; coordinate Guided redesign before merge; deployment requires separate authorization |

## Preview review evidence — 2026-10-11

- Managed worktree: `/Users/christianalcala/.codex/worktrees/admin-icon-preview/onzio-platform`,
  checked out on `codex/admin-icon-refresh`.
- Preview: `http://127.0.0.1:3187`; source/build/run instructions and verification
  receipt in `design-previews/admin-icon-refresh/README.md` and `receipt.json`.
  Server session `98514` is temporary; README records restart instructions.
- 19 route, three group and 25 utility candidates (45 unique source assets);
  library license retained. Review Sponsors heart, Team Access shield, and the
  shared Seasons/Schedule calendar meanings in the proof sheet.
- Desktop frame uses 1440×900 CSS pixels; phone uses 390×844. Synthetic Alpha FC
  fixture remains the same dashboard while navigation selection demonstrates
  active icons; this is not live club data or a working editor preview.
- Parent CUA screenshots: `/private/tmp/admin-icon-preview-light.jpg` and
  `/private/tmp/admin-icon-preview-dark.jpg`.
- Existing contracts: shell controls, mobile navigation and sidebar groups,
  21 tests passed across three files. Full application tests/build were not
  run for isolated preview-only artifacts. No app/components/lib/styles/public/tests
  files were modified in the worktree; original dirty work was preserved.
- Read-only production browser comparison was rejected by automatic approval
  review due unnecessary private data exposure. Used checked-in components
  and synthetic local fixtures instead; no production access was needed.
