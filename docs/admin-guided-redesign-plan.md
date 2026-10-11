# Guided admin portal redesign

- Status: approved for local implementation on 2026-10-11; all page implementations finished; integrated acceptance in progress.
- Prepared: 2026-10-11
- Branch: `codex/admin-guided-redesign`
- Worktree: `/Users/christianalcala/.codex/worktrees/admin-guided-redesign/onzio-platform`
- Verified base: `41bfb009089bb2b67ff048c71d1a3c6fac11578c` (`origin/main` when the branch was created).

## Outcome

Apply the selected **B — Guided** direction across all 19 protected club-admin
routes. Club staff should recognize the next action, understand what it does,
and complete it comfortably on desktop or phone. Use large task choices, plain
descriptions, grouped information, system typography, restrained blue accents,
and focused editing. Preserve every existing capability and authoritative data
flow while improving its presentation.

Christian selected Guided from the interactive comparison and requested a
plan before delegation. Direction and plan approval are complete (Christian: “Ok, use subagents to
implement this.”). Application implementation is complete; recorded release acceptance remains in progress. Use
an implementation subagent for bounded packages and an independent review
subagent before delivery. Routine work within the approved plan can proceed
without repeated approvals; material scope/design departures must be raised.

## Reference and governing instructions

- Selected comparison: `design-previews/admin-guided-redesign/directions.html`
  in this worktree; choose **B — Guided**. It is an exact archive of
  `/Users/christianalcala/.codex/visualizations/2026/10/11/01a12be8-a5ff-7ab2-aab1-77d80b65a011/admin-portal-directions.html`.
- The original comparison runs at
  `http://127.0.0.1:8767/admin-portal-directions.html`; restart instructions are
  in the adjacent README. The HTML uses fictional data and simplified forms.
  Its illustrations must never become runtime data, truncated field sets, or
  replacements for existing save/recovery logic.
- Read `AGENTS.md`, current `HANDOFF.md`, `docs/onzio-platform-plan.md`,
  `tests/README.md`, and the relevant contracts before each application package.
- The session-supplied repository instructions explicitly retire hosted
  Supabase staging. The branch's historical AGENTS/architecture files still
  mention a separate hosted staging project. That historical wording does not
  authorize recreating it or testing with production: use isolated local
  Supabase and synthetic data, and verify any hosted Preview's target first.
- `docs/admin-portal-redesign-plan.md` governs existing product/navigation/theme
  behavior. On approval, this plan replaces its NextAdmin visual direction
  with Guided; it retains its functional/security contracts and dashboard
  modules. It does not silently authorize test or architecture changes.
- Preserve the newer Homepage, Contact, and public-page editor contracts in
  `docs/homepage-editor-redesign-plan.md`,
  `docs/homepage-editor-feedback-luna-plan.md`, `docs/contact-editor-plan.md`,
  and `docs/public-page-editors-plan.md`.
- Use the installed Apple Design and Mobile Native guidance with Christian's
  Full-Stack Standard. Reuse the existing Tailwind, UI primitives, and Motion
  integration. No new dependency is currently required.

## Guided design rules

1. **Clear choices.** Use sentence-case labels, one obvious primary action per
   task, and a short explanation when it prevents uncertainty. Keep required
   fields visible. Optional details may be disclosed, but no field disappears.
2. **Comfortable reading.** Use the platform system font for admin chrome,
   normal-case headings, readable body text, consistent spacing, and a clear
   distinction between labels, values, hints, and errors. Aim for 16px mobile
   inputs and at least 44px primary touch controls. Existing 44px controls must
   not shrink.
3. **Quiet structure.** Soft neutral backgrounds, white/light grouped surfaces,
   restrained borders, blue actions, green success, and red error/destructive
   feedback. Both light and dark themes remain usable. Admin colors remain
   independent of club colors.
4. **Appropriate density.** Keep useful desktop columns/tables; use readable
   rows and existing disclosures on phone. Dense stats and analytics retain
   all values and filters. Avoid hiding the portal's capabilities to imitate
   the simplified prototype.
5. **Focused editing.** Reuse existing inspectors and panels. The small centered
   prototype form is a visual reference, not a mandate to replace long player
   or match forms. Long forms retain their established sections, scrolling,
   fixed actions, width options, and Staff-specific behavior. Public-page
   editors retain their desktop canvas/inspector and keyboard-aware phone sheet.
6. **Immediate feedback.** Keep loading skeletons inside the real containers;
   show save/error feedback beside the initiating action. Do not announce
   success until the existing mutation/receipt confirms it. Retain meaningful
   interaction motion with reduced-motion support; avoid decorative motion,
   artificial delays, or a new gesture framework.
7. **Public-page fidelity.** Admin font/color rules must not restyle the live
   page rendered in a preview iframe or a template font scope. Published public
   layouts, wording, images, and metadata stay at their baseline.

## Scope and preserved behavior

In scope: protected navigation/header, shared admin layouts and controls,
Dashboard, website editors, competition pages, registrations, analytics,
branding, team access, and payments presentation. Fix presentation-related
regressions introduced by this work, with focused coverage when necessary.

Preserve URLs, navigation names/order, fields, searches/filters, role/template
visibility, lifecycle messaging, theme persistence, charts, uploads, ordering,
activation/deactivation, confirmations, page-scoped saves, and draft recovery.
Preserve existing APIs, schemas, query semantics, tenant resolution, user-scoped
RLS, authentication/session boundaries, Stripe/Connect behavior, media
validation/normalization/cleanup, and operator tooling.

No login/OTP/reveal redesign, public-site redesign, AI helper, onboarding
wizard, self-service signup, new data model, autosave, separate club-content
publish step, notification center, or new analytics feature belongs to this
plan. These changes need their own product scope. No deployment, hosted
mutation, or production push is authorized by plan approval.

## Navigation and dashboard decisions

Keep the exact existing responsibility-based navigation:

- Dashboard
- Website: Homepage, Programs, Tryouts, Shop, About, Sponsors, Contact
- Competition: Seasons, Roster, Schedule, Match Stats, Season Stats, Standings
- Registrations
- Analytics
- Club Settings: Branding, Team Access
- Payments

Only Website, Competition, and Club Settings collapse; allow at most one
expanded group and open the active route's group automatically. Keep the
desktop sidebar visible and the phone drawer. Preserve the single route
manifest and filtered discovery rules for navigation, route search, and quick
actions. Keep search, explicit theme toggle, and account/Sign out usable on
both sizes, even though the simplified HTML omits them. Preserve club identity
and quiet Onzio attribution. A grace customer remains editable; suspended
content stays read-only. Hidden destinations/keywords must stay out of search.

The Dashboard leads with the Guided task-choice treatment, using the existing
authorized Quick Actions: Registrations, Manage Roster, Manage Schedule, and
Payments. Preserve the existing Quick Actions heading and all eight module/KPI
labels required by contracts. Keep Active Players, Active Staff, Season Matches,
Paid Registrations, Registration Forms, Upcoming Fixtures & Events, and
Registration Mix available below the task choices. The prototype's website
shortcut and status card are not extra dashboard modules in this scope;
Homepage remains available through Website navigation and route search.

Keep server/user/tenant-scoped dashboard reads and the existing paid-only,
paginated Registration Mix calculations and accessible table. Query failures
remain unavailable/error states, never invented zeros. Use real club identity
and trusted lifecycle state; no fixed sample status, person, count, date, or
club content may enter application code.

## Coordination with the icon-update chat

Owner: **Plan admin portal icon update**, thread
`01a12be7-63ae-74f3-ba33-e8f5f7c44f75` on `local`; branch
`codex/admin-icon-refresh`, managed worktree
`/Users/christianalcala/.codex/worktrees/admin-icon-preview/onzio-platform`.
Its local scope/ledger is currently
`/Users/christianalcala/Downloads/onzio-platform/docs/admin-icon-refresh-plan.md`.

The separate icon chat completed its approved mapping and implementation at
`48f9f69`. PR #12 merged to main as `c10bea3`; the reviewed dependency is
integrated locally at `640e57e` and `dab7b95`. Final application source is
`9a001c1`. Approved assets, license, receipt and icon module remain exact. There
is no outstanding icon-selection approval. This task did not publish the
Guided redesign or perform the other chat's remote release.

The icon agent owns icon assets, license, mappings, sizes/weights, and the
planned reusable `components/admin/icons/` module. Guided owns presentation
and consumer composition. Do not choose another icon family, modify their
worktree, or fabricate that module before it exists. Existing icons may remain
during foundation work; final integrated evidence must use the approved icons.

Overlap includes `components/AdminShell.tsx`, Dashboard JSX, shared controls,
and editor actions. Before touching each overlapping area, read the icon
chat's current status and inspect its exact approved commit/diff. Read-only
coordination is authorized; messaging the other chat requires Christian's
explicit authorization. Prefer integrating the scoped completed icon commit
first, then adapting the consumer layout; if an icon commit arrives later,
reconcile intentionally and rerun the affected checks. Record integration
commit IDs. Do not wholesale replace files, merge preview artifacts as
application code, or overwrite new icon imports while restyling.

## Implementation packages

### GUIDED-00 — Baseline, local environment, and icon coordination

Use the managed Guided worktree/branch; retain the source checkout's dirty OTP
and other work. Refresh/compare `main` before implementation and record any
base changes without rewriting another agent's checkout. Capture the 19-route
inventory, field/action inventory, role/template/lifecycle cases, and desktop/
phone baseline in both themes. Use local synthetic Alpha/Bravo, with test-mode
billing fixtures; never borrow production credentials. Confirm fixture and
database target before running any helper. Coordinate local fixture writes
with other agents; do not reset shared Supabase or run conflicting fixture
suites concurrently. Preserve uncommitted planning files and copy the current
session instructions into the executor handoff, including retired staging.

Acceptance: branch/base and environment evidence, exact touched-file list,
baseline test results/failures, screenshots, icon dependency/ownership record,
and no source-checkout or hosted mutation.

### GUIDED-01 — Shared visual foundation and protected shell

Owners: protected sections of `styles/globals.css`,
`components/admin/AdminPage.tsx`, `form-styles.ts`, `AdminTabs.tsx`,
`AdminSidePanel.tsx`, `AdminThemeProvider.tsx` where necessary, and
`components/AdminShell.tsx` plus existing search/theme/account controls.
Prefer an admin-local stylesheet/variants when global primitive defaults are
also used by public/auth pages. Shared `components/ui` defaults must remain
compatible with other consumers. Preserve existing behavior owners.

Acceptance: Guided desktop/phone shell in light/dark; exact navigation and
access filters; working search/account/theme; correct first theme paint; focus
and drawer scroll/closure behavior; font/style isolation; readable controls;
no horizontal overflow. First user-facing checkpoint is this shell together
with GUIDED-02. Show screenshots during implementation for steering; this is
not another automatic approval gate within the accepted direction.

### GUIDED-02 — Guided Dashboard

Owners: `app/admin/(protected)/page.tsx` and
`components/admin/AdminRegistrationMixChart.tsx` only as presentation requires.
Keep `lib/admin-dashboard-data.ts`, `lib/admin-dashboard-mix.ts`, and
`lib/admin-route-manifest.ts` behavior intact. Recompose the authorized actions
as larger explanatory rows; restyle the existing metrics, lists, chart, and
skeletons around them.

Acceptance: all existing dashboard modules/data retained; owner/admin and
suspended cases match baseline; no fake information; errors/empty/loading
states are truthful; semantic chart alternative and theme updates work.

### GUIDED-03 — Roster and Schedule pilot workflows

Owners: `app/admin/(protected)/roster/page.tsx`, `schedule/page.tsx`, and the
shared admin panel/upload presentation where justified. Carry Guided grouped
rows/forms into the real player, staff, and match workflows. Keep every field,
media action, position/season selector, tab, status, result, and template gate.
Retain player/match fixed actions and Staff's current independent treatment;
do not move destructive/status actions into an unapproved location.

Acceptance: add/edit/save/reload player, staff, and match; cancel and existing
confirmation flows; upload success/failure; keyboard/touch usability; all
fields reachable; existing panel contract assertions remain green. Pilot
evidence establishes the treatment for remaining management screens.

### GUIDED-04 — Website canvases and Branding

Owners: Homepage, Programs, Tryouts, Shop, About, Sponsors, Contact, Branding
protected pages and their existing `components/admin` editor compositions,
scoped styles, frames, inspector, section rail, and phone scrollport.
Preserve the public page as the editing canvas. Programs retains direct
navigation by actual program name and hidden status; do not invent categories.
About/Club Logo keep separate save/recovery scopes. Keep all template-owned
sections truthful and unavailable controls appropriately gated.

Acceptance: field/media completeness; faithful public/preview typography and
geometry; no viewport jump when tools open; visible, clickable Save/Done with
the keyboard open; exact atomic saves/retries/receipts/conflict handling and
cross-tab recovery; clear Tryouts removal and Undo; page/program switching
does not silently lose unsaved work; selected template/public output unchanged.

### GUIDED-05 — Remaining Competition and Analytics

Owners: Seasons, Match Stats, Season Stats, Standings, Analytics. Apply the
shared hierarchy and grouped controls without forcing dense data into one
giant phone row. Preserve season/position/date filters, editing operations,
imports/exports where present, every chart, and accessible data alternatives.
Use the existing Chart.js/SVG implementations and instance cleanup; add no
second chart library.

Acceptance: complete data and filters retained at desktop/phone sizes; edits
persist; responsive tables preserve all values; charts update correctly with
theme and data changes; empty/error/loading views work.

### GUIDED-06 — Registrations, Team Access, and Payments

Owners: `registrations/page.tsx`, `members/page.tsx`, `payments/page.tsx`, and
admin-scoped form-builder/payment-status compositions. Restyle these after the
foundation and pilots are stable. Preserve native form/waiver editing,
participant data/status/signatures, archive/stop/copy-link/CSV behavior,
membership operations, and Stripe/Connect onboarding/portal/status workflows.
Use test-mode fixtures only; no live payment or membership action for visual QA.

Acceptance: existing plain lifecycle labels and responsive disclosures remain;
owner/admin visibility and access match baseline; sensitive data stays scoped;
copy/export and error recovery work; suspension/grace/billing messaging stays
truthful. No server authorization or payment behavior change.

### GUIDED-07 — Integrated review and delivery evidence

Reconcile approved icon commits and current base. Audit all 19 routes and
shared public/auth consumers, including legitimate template-hidden pages.
Run narrow regressions during each package, then the required whole-portal
checks below. Use an independent review subagent; fix findings and verify the
affected behavior. Record evidence and remaining limitations in this ledger
and `HANDOFF.md`. Provide a coherent local diff and final screenshots. Do not
publish a partial portal migration or infer release approval from this plan.

Acceptance: exact final source/commit and icon integration record, checks and
screenshots, complete route/action inventory, reviewer findings resolved, and
separate browser/native-device evidence. If native touch or screen-reader
acceptance is unavailable, report it as open and do not claim this package is
fully accepted. No production push, merge, deployment, or hosted mutation.

## Verification

Existing authoritative suites to retain and run as relevant:

- Shell: `admin-sidebar-groups`, `admin-mobile-navigation`,
  `admin-shell-controls`, `admin-route-manifest`, `admin-theme` contract tests.
- Dashboard/analytics: `admin-dashboard`, `admin-analytics-theme` contracts.
- Pilot forms: `admin-roster-player-editor`, `admin-schedule-match-editor`,
  `diverse-city-admin-punch-list`, `editorial-admin-surface` contracts.
- Website: Homepage state/model/capability/save/recovery/route/server contracts;
  Programs/Tryouts/Contact/public-page editor contracts and SQL save/recovery
  tests. Use existing `playwright.homepage.config.ts`,
  `playwright.public-page-editors.config.ts`, and
  `playwright.contact-editor.config.ts` according to their fixture helpers.
- Sensitive pages: registration UI/routes/export and billing/member
  authorization contracts; corresponding isolated database coverage.
- Keep existing loading browser cases and public media/template parity checks.

Add focused behavior regressions for newly discovered failure modes. Existing
static JSX/class assertions are binding: do not delete, loosen, skip, mock away,
or rename around them. If a redesign requirement cannot be satisfied without
changing a contract, show the exact conflict and obtain Christian's decision
before changing that assertion. A baseline failure is evidence to investigate,
not permission to weaken tests.

At the integrated gate run, with fresh local-only test configuration exported:

```bash
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm run test:db
npm test
npm run test:legacy
npm run lint
npm run build
npm run db:types:check
git diff --check
```

Build in this isolated worktree, not the active source checkout's `.next`.
Do not print environment secrets or commit browser authentication state.
Do not use historic test totals as new acceptance evidence. Avoid simultaneous
browser/database suites that write the same local fixture; restore fixture
state using documented helpers if an interrupted run leaks changes.

Visual/browser matrix: representative 1440px desktop, 1024px tablet, 390px
phone, and 320px narrow phone; light/dark; keyboard/focus and reduced motion;
long labels, enlarged text, loading/empty/error/success states; navigation
while editors are open. Desktop and phone before/after captures for every
route are required, with identity/state held constant for comparisons.

Native acceptance is separate from CSS-width emulation: iOS Safari software
keyboard, safe areas, touch scrolling, tap targets, paste, and Save/reload on
representative player/match and canvas editing; at least one phone
screen-reader walkthrough of navigation, fields, errors, and Save feedback.
Use the existing local device proxy rather than altering tenant/CSRF rules.
Simulator evidence may cover WebKit/software keyboard; it does not establish
physical touch or VoiceOver acceptance by itself.

## Delegation after plan approval

Root owns scope, icon/base coordination, fixture scheduling, user updates,
review, and acceptance. Freeze shared foundation first, then delegate disjoint page packages in the
Guided worktree; give each implementer the exact paths,
preserved contracts, prototype, checks, and ledger requirements. Avoid parallel
edits to shared shell/theme/control files. A read-only independent review
subagent may run once there is a coherent diff. Do not create a new user-owned
chat or send another chat a message without explicit authorization.

The first assignment is GUIDED-00 through GUIDED-02: establish the baseline,
build shared Guided chrome and task-row Dashboard, and return real desktop/
phone light/dark evidence. Then continue through the page packages using the
same visual owners. Update package status after meaningful work; never mark
completion without its listed evidence.

## Status ledger

| Package | Status | Completed work | Files changed | Verification | Blockers/dependencies | Exact next step |
| --- | --- | --- | --- | --- | --- | --- |
| GUIDED-PLAN | complete | Guided direction and plan approved; subagent implementation authorized | This plan; archived directions | Approval and repository/contract inspection recorded | None | Review the implemented local gallery |
| GUIDED-00 | complete | Isolated branch at baseline 41bfb00; local synthetic environment; full 19-route field/action inventory; approved icon dependency integrated; matching before/after matrix | Inventory; preview capture script/HTML/README; this plan; HANDOFF | Baseline 186 files/1778 tests passed; 152 matched captures at 1440/390px in light/dark; see verification document | No hosted or original-checkout mutation | Retain held fixture and documented reproduction commands for review |
| GUIDED-01 | in_progress | Shared Guided shell, forms, tabs, panels, theme/search controls, public font boundaries, safe-area and visualViewport focus fixes implemented and reviewed | AdminGuided.module.css; scoped globals; AdminShell/AdminPage/AdminTabs/AdminSidePanel; search/theme/account; preview boundaries; new browser regressions | Final complete suite1783 passes; 14 distinct Guided UI cases pass; owner/admin access; 19-route matrix; native Safari keyboard/safe-area checks | Physical touch/paste/phone screen-reader acceptance remains open | Complete physical phone navigation, fields, error and Save-feedback walkthrough before release |
| GUIDED-02 | in_progress | Guided task rows; all eight existing Dashboard modules and truthful data/chart alternative retained | Protected Dashboard; shared Guided styles | Dashboard contracts pass in final suite; owner/admin and both-theme runtime captures; chart/theme checks | No separate runtime suspended/enlarged-text matrix recorded | Record suspended and enlarged-text Dashboard runtime acceptance before release |
| GUIDED-03 | in_progress | Complete Guided Player/Staff/Match forms, responsive rows, label associations, independent Staff width/actions; Safari native Time sizing and focus fixes | Roster/Schedule; FileUpload; SeasonSelect; panel; browser persistence/keyboard/UI cases | 10 distinct real add/edit/save/reload browser cases; native Safari Player/Match Save with keyboard visible and reload verification; original rows restored; unchanged panel contracts pass | Physical touch/paste and every pilot upload/confirmation path not separately recorded | Finish physical phone pilot walkthrough and remaining upload/confirmation acceptance |
| GUIDED-04 | in_progress | Website canvases and Branding implemented; actual-program navigation; retained fields/media/recovery/receipts; public typography; About scroll-boundary regression fixed | Website protected owners/compositions; editor CSS/rail/inspector; About scroll wrapper | Existing Programs/Tryouts/Shop28, Contact6, Homepage44 distinct, Cinematic About8 distinct; unchanged About final3 pass; native Homepage Save/reload; original fixtures/content restored | Baseline Homepage CTA one-pixel assertion; two Editorial About cases not invoked; physical touch/VoiceOver open | Record remaining template/native acceptance; resolve baseline parity separately without weakening assertions |
| GUIDED-05 | in_progress | Competition/Analytics controls and all data/filters/charts retained with phone-readable tables | Seasons/stats/season-stats/standings/analytics; StatInput | 2 management cases; 32 loaded desktop/phone/theme screenshots across8 routes; real goals persistence, filters/collapsed focus/chart redraw; full contracts; exact12-table restoration | Separate runtime error/empty and native screen-reader matrix not fully recorded | Record remaining empty/error/native acceptance before release |
| GUIDED-06 | in_progress | Registrations, Team Access, Payments presentation implemented; preserved signatures/currency/CSV/clipboard and authorization | Registrations/members/payments; PaymentStatusCard | 2 management cases; owner/admin4 cases44 assertions20screens; paid/refund filters, signatures, real copy/CSV; full authorization/database contracts | No membership mutation or provider action attempted; lifecycle/native acceptance remains | Verify remaining synthetic lifecycle/error/native states without live billing or membership actions |
| GUIDED-07 | in_progress | All19 routes implemented; exact approved icons integrated; independent findings resolved; final local source/build/test evidence and comparison gallery delivered | Final source9a001c1; verification document; preview artifacts; this ledger; HANDOFF | Final187 files1783 tests; TypeScript/lint/build/diff; Guided14 distinct; native3 save/reload flows;152 matched captures; independent review | Physical touch/paste/VoiceOver; documented baseline loading/type/parity failures; unrecorded acceptance above | Review local gallery, complete remaining acceptance and obtain explicit release authorization before remote publication |

| GUIDED-STATS-DIRECTIONS | complete (preview only) | Three isolated Apple-style Season Stats entry/display directions with distinct desktop/phone behavior; all existing stat fields represented; fictional in-memory demo | season-stats-directions.html; preview README; HANDOFF |18 browser cases at1440/390/320px in light/dark: fields/keepers, edit/review/save, unique IDs, initial Save bar, no overflow/errors, 44px phone button targets | Christian approved A, Player workspace; prototype-only evidence does not establish application acceptance | Review the implemented Season/Match workspace and complete physical-phone acceptance |

## Approved implementation and delivery boundary

Christian approved Guided and explicitly requested subagent implementation on
2026-10-11. All 19 protected page owners are implemented on the isolated branch.
Original Guided source was `9a001c1`, including approved icons and reviewed
Safari Time/About scrolling fixes. The selected Season and Match Player workspace
iteration is implemented at `baa66c1`; its current evidence is recorded in
`docs/admin-stats-workspace-verification.md`. The comparison HTML and verification document
record the completed automated/local-native evidence and remaining acceptance.
No Guided push, PR creation, remote merge, deployment or hosted mutation occurred.


## Approved Player workspace iteration — 2026-10-11

Christian selected direction A and requested Season Stats followed by Match Stats,
with mobile usability as an acceptance condition. Scope is the two protected
pages and shared, locally scoped stats workspace components. The desktop roster
sits beside the selected player; phones use roster → player → All players. Keep
all existing stat keys, numeric Season starts, boolean Match starts, cohort rules,
loading/error barriers, manual Season totals and grouped save payloads. Context
changes must offer Save & switch, Discard changes or Cancel when drafts exist.
Search, player selection and collapsed groups must retain drafts.

| Package | Status | Completed work | Files changed | Verification | Blockers/dependencies | Exact next step |
| --- | --- | --- | --- | --- | --- | --- |
| GUIDED-STATS-SEASON | in_progress (implementation complete) | Approved A implemented with grouped roster, phone detail/back, all 17 fields, draft tracking and guarded season switch | Season page; scoped stats components; browser regressions | Source baa66c1; full 1,783 passes; workspace 4/management 2/loading 5 cases; 20 layout cases; native Season keyboard Save/reload; exact fixture cleanup | Physical phone touch/paste and screen-reader release acceptance remains | Review actual-app gallery; finish physical phone walkthrough before publication |
| GUIDED-STATS-MATCH | in_progress (implementation complete) | Shared workspace adapted; boolean starter switch, all 17 fields, guarded Match/Season switches and existing 300-minute bound | Match page; scoped stats components; browser regressions | Source baa66c1; full 1,783 passes; workspace 4/management 2/loading 5 cases; 20 layout cases; native Match keyboard Save/reload and false starter persistence | Physical phone touch/paste and screen-reader release acceptance remains | Review actual-app gallery; finish physical phone walkthrough before publication |

Root owns serialized synthetic fixtures, regression tests, fresh build, native
Safari evidence, documentation and local delivery. No backend/schema/auth or
public-facing edits are in scope. Physical phone touch and screen-reader
acceptance remains distinct from browser and Simulator evidence. No remote
publication is authorized.


## Combined Stats navigation exploration — 2026-10-11

Christian requested one Stats navigation item with an in-page Match/Season
switch, and three HTML sketches before any application implementation. The
existing Player workspace is the visual baseline. A uses compact segmented
tabs, B uses explanatory two-line tabs, C places the switch with the selected
player. All retain explicit editing context, independent manual Season totals,
all fields, per-scope draft protection and clear Save labels.

| Package | Status | Completed work | Files changed | Verification | Blockers/dependencies | Exact next step |
| --- | --- | --- | --- | --- | --- | --- |
| GUIDED-STATS-COMBINED-DIRECTIONS | complete (preview only) | Three interactive responsive HTML sketches with one Stats navigation item and clear Match/Season labels | stats-combined-directions.html; preview README; this ledger; HANDOFF | Nine browser behavior/layout cases at 1440/390/320px across light/dark; three final 320px geometry checks; C discard/arrow-key check; diff check; screenshot proof | Application consolidation awaits direction selection; native/physical acceptance not established by prototypes | Christian selects a direction; scope actual shared page/navigation with old-route compatibility, template/role gates, drafts and save contracts intact |

No application source, data, routes, navigation contracts or architecture changed.
This package authorizes local sketch delivery only.
