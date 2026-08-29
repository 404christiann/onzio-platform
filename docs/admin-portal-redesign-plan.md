# Protected Admin Portal Redesign

Status: approved for implementation on 2026-08-27  
Implementation branch: `codex/admin-portal-redesign`  
Verified base at kickoff: `origin/staging` at `27b7e4316a36592a8b85396a144f1572862ee2bb`

## Objective

Redesign the entire protected Onzio admin portal to closely follow the visual
language and interaction density of the NextAdmin CRM demo while preserving
Onzio's existing architecture, authorization, routes, data flows, and product
behavior. NextAdmin is a visual reference only; do not copy its code or assets.

## Locked Product Decisions

- Apply the redesign to every protected admin route, not public templates or
  unprotected authentication pages.
- Allow substantial presentation and layout restructuring, but preserve every
  existing field, workflow, URL, save/publish behavior, media flow, Server
  Action, route handler, tenant boundary, role check, lifecycle check, billing
  rule, and RLS boundary.
- Keep the club logo and name as the primary sidebar identity. Place a quiet
  `Powered by Onzio` identity in the sidebar footer.
- Never derive admin chrome colors from club branding. Use restrained
  indigo/blue for primary and focus states, soft gray for active navigation,
  green for success, and red for destructive/error states.
- Support explicit light/dark switching. Default to light, persist only the
  user's explicit choice, do not follow the operating-system theme, and render
  the saved theme on the first server response without a flash.
- Include a functional route search and account menu. Omit notifications and
  every decorative control.

## Navigation Contract

Exact order:

1. Dashboard
2. Website
   - Homepage
   - Programs
   - Tryouts
   - Shop
   - About
   - Sponsors
   - Contact
3. Competition
   - Seasons
   - Roster
   - Schedule
   - Match Stats
   - Season Stats
   - Standings
4. Registrations
5. Analytics
6. Club Settings
   - Branding
   - Team Access
7. Payments

Website, Competition, and Club Settings are collapsible. Exactly one group is
open, and the active route's group opens automatically. Preserve all existing
template, role, lifecycle, and billing visibility rules. Team Access and
Payments remain owner-only. Registrations remains standalone and appears
before Analytics.

Create one server-safe route manifest and one pure visibility function. Use
the same filtered route set for desktop navigation, mobile navigation, search,
and dashboard Quick Actions. Hidden routes and keywords must never enter the
client search payload or DOM. The manifest is discovery logic only; existing
page/API checks and RLS remain authoritative.

## Protected Shell

- Sidebar header: club logo and name.
- Sidebar footer: `Powered by Onzio`.
- Header: strict route search, explicit theme toggle, and account menu with
  current identity/role and Sign out.
- No notification control.
- Preserve the fixed desktop sidebar and the existing mobile off-canvas
  behavior: `100dvh`, body scroll lock, safe areas, touch scrolling, drawer
  closure after navigation, focus restoration, and ARIA relationships.
- Grace-state messaging must remain editable and truthful. Suspended customers
  are read-only. Do not weaken or reinterpret the current access boundary.

## Dashboard Contract

The dashboard contains only:

1. Quick Actions: Registrations, Manage Roster, Manage Schedule, Payments.
2. KPIs: Active Players, Active Staff, Season Matches, Paid Registrations.
3. Registration Forms.
4. Upcoming Fixtures & Events.
5. Registration Mix.

Use real tenant-scoped data only. Never use sample values, fake records, or
false zeroes after query errors. Quick Actions are filtered through the same
visibility and mutation-capability logic as navigation and search; unauthorized
actions disappear and the layout reflows without substitutions.

Upcoming Fixtures & Events combines current/future active-season matches with
current/future tryout events. Do not add registration deadline fields or
automatic closing behavior.

Registration Mix:

- uses current, non-archived forms;
- counts only registrations whose current status is exactly `paid`;
- excludes pending, expired, refunded, and non-paid recovery rows;
- groups by form, shows the five leading positive-count forms, and aggregates
  the remainder into `Other`;
- uses stable tie-breaking;
- paginates lightweight source rows so default API row limits cannot truncate
  the result;
- uses exact display rounding that totals 100%;
- provides a semantic text/table representation alongside the Chart.js
  doughnut;
- handles no forms, no paid rows, one form, many forms, long titles, ties,
  loading, and independent query failures.

The dashboard does not include an activity chart or Recent Activity feed.

## Existing Visualizations

Preserve every existing visualization where it currently lives, especially on
Analytics. Restyle charts to match the protected theme using the existing
Chart.js dependency. Do not add a second chart library. Theme changes must
update chart colors without leaking chart instances or retaining stale colors.

## Route Migration Cohorts

1. Shared manifest, visibility tests, theme tokens, and protected primitives.
2. Atomic shell/header/search/account/mobile cutover.
3. CMS and branding: Homepage, Programs, Tryouts, Shop, About, Sponsors,
   Contact, Branding.
4. Competition: Seasons, Roster, Schedule, Match Stats, Season Stats,
   Standings.
5. Sensitive operations: Registrations, Team Access, Payments.
6. Dashboard and Analytics.
7. Whole-portal stabilization, browser verification, and documentation.

Sensitive registration, membership, and billing pages migrate after the shared
foundation to minimize conflicts with recent work. Do not deploy or integrate
a half-migrated protected portal.

## Verification Contract

Add focused coverage for:

- exact route order and group membership;
- every role, template, lifecycle, tenant-kind, and billing visibility matrix;
- navigation/search/Quick Action parity and search non-leakage;
- light default, explicit persistence, reload behavior, no OS following,
  correct first paint, and public/auth style isolation;
- dashboard tenant scoping, query errors, and every Registration Mix edge case;
- absence of client-supplied `club_id`, service-role dashboard access, and PII
  selection;
- mobile account/search/theme access, keyboard behavior, focus restoration,
  body scroll lock, and horizontal overflow;
- semantic headings and landmarks, described errors, `aria-live`, accessible
  chart alternatives, focus visibility, reduced motion, and WCAG AA contrast;
- every protected route at representative desktop/mobile sizes in light and
  dark mode.

Run narrow suites after each cohort, then run:

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
supabase db lint --local --schema onzio,onzio_private
git diff --check
```

Database-inclusive tests must use loopback local Supabase credentials only.
Do not delete, skip, weaken, or broadly mock a failing contract.

## Expected Boundaries

Expected changes include the protected layout and all protected page files,
`components/AdminShell.tsx`, selected protected shared components and sidebar
primitives, scoped admin tokens in `styles/globals.css`, a shared route
manifest, server-only dashboard queries/reducers, Chart.js theme helpers,
focused unit/contract/browser tests, this plan, and `HANDOFF.md`.

Explicitly out of scope:

- public page/template redesigns;
- login/auth screen redesigns;
- framework, React, Tailwind, or dependency upgrades;
- database migrations or generated-type changes;
- changes to middleware, session semantics, RLS, Stripe, Connect, webhooks,
  media authorization/finalization, or existing mutation boundaries;
- hosted Supabase, Stripe, Vercel, DNS, migration, seed, deploy, or production
  actions.

Expected schema migrations: none.  
Expected new dependencies: `@dnd-kit/core` and `@dnd-kit/sortable` were approved
as an explicit, repo-owner-confirmed exception on 2026-08-27 for Programs' drag
reorder (see the implementation plan's resolved decision D3). No other new
dependency was added.

## Acceptance

The work is complete only when every protected route is visually coherent in
both themes, the exact navigation/search/action visibility contract holds,
all existing product behavior and security boundaries are preserved, all
dashboard data is truthful and tenant-scoped, responsive and accessibility
checks pass, and the required test/build gates are green or an unrelated
baseline failure is recorded with exact evidence.
