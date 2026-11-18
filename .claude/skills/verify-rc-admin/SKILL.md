---
name: verify-rc-admin
description: Verify a Rose City (cinematic@2) classic-admin redesign package (RC-ADMIN-01..06) in onzio-platform before showing Christian anything. Drives the real admin in Chromium against two local production builds (the package worktree and pristine origin/main) on the shared local Supabase, and checks six gates - scope (app code only), save payloads byte-identical for untouched editors, save states (clean/dirty/saving/saved/retry/conflict/discard), visuals at 390 and 1440 light/dark with layout shift, reduced motion and axe, repo gates (typecheck, unit, architecture, selector debt), and an unchanged Diverse City admin. Use it for every RC-ADMIN package, or whenever a change touches a Rose City admin editor.
---

# verify-rc-admin

One command verifies one package and leaves an HTML report plus screenshots. Run it from any
checkout of this skill; point `--worktree` at the package's worktree.

```bash
S=/Users/christianalcala/Downloads/onzio-platform/.claude/worktrees/rc-admin-verify/.claude/skills/verify-rc-admin
$S/scripts/verify.sh doctor --worktree <pkg-worktree>
$S/scripts/verify.sh run --worktree <pkg-worktree> --route /admin/stadium --package RC-ADMIN-02 --touched stadium
$S/scripts/verify.sh cleanup
```

- `--route` is the editor the package rebuilt; gates 3 and 4 run on it. A route with no editable
  field (a hub or index page such as `/admin/website-pages`) reports gates 3 and 4 as "not
  applicable" instead of FAIL (see Gate 3).
- `--touched` lists the editor keys the package is allowed to change (comma-separated, keys in
  the table below). Every other editor must send a byte-identical save payload. For RC-ADMIN-01
  (shared pieces, no page changes) pass no `--touched`: every payload must be identical.
- `--shared-fix` only when the package brief says the change is a shared fix that may change
  Diverse City's admin. Without it, any difference in Diverse City's admin fails gate 6.
- Exit 0 = every applicable gate passed (a "not applicable" gate 3/4 is not a failure; every other
  gate must pass). Show Christian the report only then; otherwise fix and re-run.

Hard rules (from Christian): never touch the main checkout (`doctor` refuses it) or the
`supabase_*_onzio-rose-city-2027` stack (nothing here uses ports 55321/55322); Supabase CLI
2.109.1 only (the global `supabase`, never unpinned `npx supabase`); no production access; reset,
seed, sign-in and browser run happen in ONE `scripts/with-local-db-lock.sh` hold.

## What `run` does

Outside the lock (no shared state touched):

1. Gate 1 + 5a: `scripts/scope-check.mjs` reads every change vs `origin/main` (commits since the
   merge base, staged, unstaged, untracked; `.claude/` ignored). FAIL on `supabase/**`, `db/**`,
   any `.sql`, `lib/database.generated.ts`, `lib/db-types.ts`, `scripts/*seed*|import-*|apply-*-local.ts|fixtures/**`,
   any edit to `tests/architecture/cinematic-2-selector-debt.json`, any added/removed `.rpc(` line,
   or a changed count of references to a database function name (from origin/main's migrations)
   in app code. Files outside `app components lib styles public packages types tests middleware.ts`
   are warnings (HANDOFF.md/STATUS.md updates are expected; package.json changes need a reason).
   A gate 1 failure stops the run right there (non-zero exit, report written): no doctor, build,
   lock, db reset or any other database action happens for an out-of-scope package.
2a. Doctor (below), which also refuses any env file that does not point at the shared local stack.
2. Gate 5: `npx tsc --noEmit`, `npm run test:unit` (vitest project `unit` already includes
   `tests/architecture` and `tests/contracts`), and `npx vitest run --project unit tests/architecture`
   reported on its own. Selector debt must be byte-identical to origin/main.
3. Builds: `next build` (ONZIO_ENVIRONMENT=staging) of the package worktree, and of a pristine
   `git archive` of origin/main in `/private/tmp/onzio-rc-admin-verify/main-<sha>/` (cached by SHA,
   node_modules cloned with `cp -c`). ~45 s each.

Inside one lock hold (`scripts/locked-run.sh`):

4. `supabase db reset --local` from the package worktree (project `onzio-platform-contracts`),
   then the ledger's newest version must equal the newest file in `supabase/migrations`.
5. `scripts/seed-local.sh <base-copy>`: Diverse City via `scripts/import-diverse-city-local.ts`,
   then the Rose City seeds copied into `<base-copy>/scripts/_rcv/`, re-pointed 55321→54321 and
   55322→54322 (the recipe from the 2026-11-17 audit), run from the base copy so their receipt
   writes land there, never in a git checkout. Both clubs set to `admin_portal='classic'`.
6. `next start` for HEAD on :3110 and origin/main on :3111, both `ONZIO_ENVIRONMENT=staging`
   (the seeded domain rows are `staging`; `.env.local` says production and would refuse the
   tenant). Ready = `/admin/login` renders "Send sign-in code" on `rose-city.localhost`.
7. `scripts/sign-in.mjs`: real email-code sign-in of `owner-aal2@alpha.local` through Inbucket
   (127.0.0.1:54324), storage state copied to `diverse-city.localhost` (one code covers both).
8. Playwright `rc-admin-verify.spec.ts` (config `playwright.config.ts`, no globalSetup), then the
   servers it started are killed by pid. `scripts/report.mjs` writes the report.

## Doctor

`verify.sh doctor --worktree <pkg>` is read-only: refuses the main checkout; runs
`scripts/check-env-target.mjs` on `.env.local` and `.env.test` (missing files: `scripts/provision-worktree-env.sh <pkg>`),
which parses every Supabase/database URL and refuses unless it is 127.0.0.1/localhost on 54321
(API) or 54322 (DB): the production project `ioalthwsdrlzrubomrow`, any hosted Supabase, the
`onzio-rose-city-2027` rehearsal ports 55321-55324, other ports and connection redirects all fail.
It also checks libpq `PGHOST`/`PGHOSTADDR`/`PGPORT` and any `postgres://` value under any name
(names only, values never printed). `locked-run.sh` re-checks the env files before the reset, and
scans both builds' `.next/static` for an inlined production ref, Supabase project URL or rehearsal
port (the base build is cached by SHA, so its inlined `NEXT_PUBLIC_*` values are checked, not just
today's env file); `node_modules` (else `npm ci`),
`node_modules/axe-core` (transitive via eslint-plugin-jsx-a11y; nothing is installed), CLI
2.109.1, `supabase/config.toml` project `onzio-platform-contracts`, the shared stack's db
container running, Inbucket answering, the two outside-repo seed sources present
(`~/Downloads/onzioProspects/diverse-city-fc/site/public`, the Rose City revamp
`review-notes/shop-2027/legacy-public-shop.json`), `origin/main` resolvable, and prints whether
:3110/:3111 are busy and the current ledger vs newest migration. Run it first whenever anything
looks off. A busy port outside a lock hold is someone else's server: do not kill it.

## Drive (what the spec does, so you can reproduce one step by hand)

Base URLs: `http://rose-city.localhost:<port>/admin/...`, `http://diverse-city.localhost:<port>/admin/...`.

| key | route | save request | how the spec makes it editable |
|---|---|---|---|
| stadium | /admin/stadium ("Robinson Stadium") | POST /api/admin/visitor-pages/robinson | first text field in main |
| foothill-transit | /admin/foothill-transit | POST /api/admin/visitor-pages/stadium | first text field |
| chick-fil-a | /admin/chick-fil-a | POST /api/admin/visitor-pages/chick-fil-a | first text field |
| tickets | /admin/tickets | POST /api/admin/tickets-editor | first text field |
| season-membership | /admin/season-membership | POST /api/admin/visitor-pages/season-membership | first text field |
| know-before-you-go | /admin/know-before-you-go | POST /api/admin/visitor-pages/know-before-you-go | first text field |
| policies | /admin/policies | POST /api/admin/cinematic-policies | first text field |
| partners | /admin/partners | POST /api/admin/cinematic-partners | first text field (starter content) |
| injury-report | /admin/injury-report | POST /api/admin/cinematic-injury-report | first text field (starter content) |
| contact | /admin/contact | POST /api/admin/cinematic-contact | first text field |
| about | /admin/about | POST /api/admin/about-editor | preview iframe `Public About page preview` → "Edit Page heading" → dialog field → Done |
| homepage | /admin/homepage | POST /api/admin/homepage | preview iframe `Homepage preview` piece `revamp.navigation` (scroll under sticky header, click twice at 12,12) → `.hp-panel` "Community" → Done → "Save homepage" |
| shop | /admin/shop | POST /api/admin/shop | "Edit kit text" → first text field → "Save page" |
| news | /admin/news | POST /api/admin/cinematic-news | first "Edit “<title>”" → first text field → "Save article" |

When a package changes how an editor opens (new section cards, dialogs, sheets), update its row in
`EDITORS` in `rc-admin-verify.spec.ts` (`open`, `field`, `beforeSave`, `saveButton`) in the same
package. Never loosen a gate to make a row pass.

- **Gate 2 (payload identity).** Fresh context per build, `crypto.randomUUID` replaced by a counter
  and the clock pinned to the run's start, apply the same edit (append ` ·rcv`, trimmed to
  maxlength), click Save, capture every mutating `/api/*` or `:54321/rest|storage` request and
  abort it (the database never changes, so both builds see the same revision). Pass = same
  method, path and body bytes on both builds for every editor not in `--touched`. Touched editors
  are captured and shown but do not fail.
- **Gate 3 (save behaviour, real API, package build).** The Save button is found by either marker:
  the old `AdminSaveButton` (`[data-admin-save-button]`) or the kit's `PageSaveButton`
  (`[data-page-save-button]`, states clean/dirty/saving/saved/retry/error/conflict; the same
  `data-state` strings for the first four). Under 768px PageFrame moves it into a fixed bottom bar:
  it is still the one button. On `--route`: clean (state clean, aria-disabled; PageSaveButton reads
  "Save"); dirty (state dirty; AdminSaveButton shows the status "Unsaved changes", PageSaveButton has
  no status line and is the enabled "Save" button); saving (request held 1.5 s:
  state saving, aria-busy); saved (state saved, the check mark `[data-admin-save-check]` or
  `[data-page-save-check]` visible, background
  rgb(52,199,89) or rgb(48,209,88), and the page never contains "All changes saved", then clean);
  retry (first POST and the `?operationId=` receipt lookup aborted → "Retry same save", field
  disabled → retry resends the identical body → saved); conflict (a second signed-in context
  saves first → this save gets an alert → "Load latest and keep my edits" → draft kept, dirty →
  saved); discard ("Reload saved page", or PageFrame's "Discard changes", → dialog "Discard and
  reload" → saved value back, clean). With PageSaveButton the retry step also requires state `retry`
  and the conflict step state `conflict` (the editor's own alert and "Load latest and keep my edits"
  still do the resolving). The editor must use one of the two Save buttons and the visitor-editor
  reload/conflict controls; on main only Chick-fil-A has "Load latest and keep my edits", so other
  routes fail conflict until a package adds it.
  **Not applicable:** a route that is not in the `EDITORS` table, has no editable text field after
  15 s and no Save button reports gate 3 (and gate 4) as `N/A`. A route in `EDITORS` is always
  applicable, and a Save button with no field counts as a broken editor (it fails), so a slow or
  broken editor can never turn into an N/A. The report prints `N/A`, `summary.json` has `na: true`.
- **Gate 4 (visual, package build).** 390×844 and 1440×900, light and dark: full-page screenshot,
  layout shift on load (CLS < 0.001; sub-pixel rounding only), no sideways scroll, axe-core 4.12
  (WCAG 2.0/2.1 A+AA) on `main` (preview iframe excluded) and on the open discard dialog. At 390 px an
  editor that uses PageSaveButton must show it in a fixed bottom bar that is fully on screen and does
  not cover the end of the page content (an AdminSaveButton editor has no bar to check). With no
  editable field the four visual samples and the reduced-motion sample are all "not applicable"
  (a screenshot per size and scheme is still saved); a mix of ran and not-run samples fails. Axe is a
  ratchet: a violation also present on origin/main for the same route is reported as existing
  debt; only new ones fail. Reduced motion (`reducedMotion: reduce`): no running animation or
  transition over 50 ms on transform/translate/scale/rotate/position/size/margin at load, dirty,
  dialog open/close, saving, saved. (Probe proven: with motion allowed it reports the dialog's
  140 ms transform.)
- **Gate 6 (Diverse City).** `/admin`, `/homepage`, `/programs`, `/contact`, `/shop`, `/about`,
  `/schedule`, `/sponsors` on both builds: status < 400, an h1, no console error that origin/main
  does not also log, and an identical `main` aria snapshot. Screenshots of the package build.

Self-tests (hermetic: temp git repos and stub binaries, no database):

```bash
node --test .claude/skills/verify-rc-admin/scripts/verify.test.mjs
```

## Evidence

Everything lands in `<pkg-worktree>/test-results/rc-admin-verify/<yyyymmdd-hhmmss>-<package>/`
(gitignored; survives cleanup):

- `report.html`: gate table, scope findings, payload table, save steps, axe new vs existing,
  reduced-motion offenders, Diverse City table, every screenshot. Open it or send it.
- `summary.json`: the same verdicts for an orchestrator. `results/*.json`: one file per check.
- `screenshots/`: `<editor>-<390|1440>-<light|dark>.png` (+ `-dialog`), `save-saved.png`,
  `save-retry.png`, `save-conflict.png`, `diverse-city-admin-*.png`.
- `payloads/<editor>.<head|base>.json`: captured request bodies (and an `.error.png` if a capture failed).
- `logs/`: typecheck, unit, architecture, both builds, db reset, seed, servers, sign-in, Playwright.
- `playwright/`: traces of failed tests (`npx playwright show-trace <zip>`).

Proof standard: the real user path in the real app (no test endpoints, no stubbed GETs). The only
interception is at the network boundary: aborting saves in gate 2 (so nothing is written) and
dropping or delaying one request in gate 3 to produce the retry and saving states.

## Cleanup

`verify.sh cleanup` kills servers this skill started (pid files in `/private/tmp/onzio-rc-admin-verify/`,
plus their children) and removes auth state. It never kills by process name, never resets the
database, and keeps the evidence and the cached origin/main build. A run stops its own servers
on exit, even on failure. The seeded Rose City and Diverse City clubs stay in the shared database;
the next session that needs a clean stack resets it under the lock (that is normal here).

## Gotchas

- Rose City seeds not run, because they cannot work from the repo on main: `shop-update` (its
  precondition no longer holds once `shop` ran), `partners` (reuses a Woodmen logo only the
  rehearsal stack has), `injury-report` (needs roster player #4), `form-links` (tickets already set
  other destinations), `roster` (production-derived JSON), `schedule` (writes into the revamp
  folder). Partners and Injury Report editors therefore open on starter content; Schedule has no
  fixtures. Fine for RC-ADMIN-01..06; a package that needs roster or fixtures must seed them by SQL.
- The whole browser run shares one session. If a context's clock passes the access-token expiry
  (1 h) supabase-js refreshes and rotates the one refresh token, signing every later context out.
  That is why the clock is pinned to the run's start; keep a run under an hour.
- Editors poll, so `networkidle` never settles: wait on elements, not network.
- One email code per address per ~60 s. A failed run that already signed in needs a minute
  before the next run's sign-in.
- Other sessions reset the shared database between their runs. Never trust a failure from data
  outside this lock hold; re-run instead.
- The axe ratchet compares rule + target with CSS-module hashes stripped. If a package renames
  markup around an existing violation it shows as new: fix it rather than explain it.
- On main, Chick-fil-A's image "Remove" buttons fail axe `color-contrast` (serious) at every size and
  scheme: existing debt the baseline reports.
- `npm run test:unit` prints `fatal: Not a valid object name origin/main` once and still passes
  (3555 tests on 0e5ff559); judge it by its exit code and summary line.
