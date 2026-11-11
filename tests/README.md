# Tests

The suites cover application behavior, tenant routing, authorization, database
constraints, media handling, billing, and admin editing. `lib/__tests__` retains
regression coverage from the Rose City application. `tests/contracts` covers
platform behavior, `tests/database` exercises local PostgreSQL and RLS, and
`tests/architecture` checks repository boundaries.

The project began with failing contracts for unimplemented features. That is
historical context, not an expectation that the current suites should fail.
Use the current requirements and recorded baseline in [HANDOFF.md](../HANDOFF.md)
when investigating a failure. Do not skip, weaken, or broadly mock a contract
to obtain a passing run.

## Worktree env script tests

`scripts/provision-worktree-env.sh` copies the local env files into a ticket worktree after
checking they are loopback-only. Its stub-based tests need neither Supabase nor the real
repository:

```bash
node --test scripts/provision-worktree-env.test.mjs
```

## Leftover local test data

A local `test:db` run and the local browser suites remove what they add to the shared database when
they end (`tests/helpers/local-test-data-cleanup.ts`, wired in as a vitest `globalSetup` and as a
Playwright `globalSetup` in the configs that run against `*.localhost`): audit rows for the shared
test clubs, Stripe and email delivery events, Supabase auth log entries, and presentation documents
and publications. Only rows created after the run started are removed. The `roster` and `site-media`
configs can point at a hosted app, so they are not wired in. Stored uploads are not cleaned
automatically: a test that uploads a file must remove it itself (`program-media.test.ts` does).

The vitest cleanup belongs to the `db` project only (see [Vitest projects](#vitest-projects)), so it
runs only when a run selects database files. `npm run test:unit`, `test:legacy` and `test:contracts`
never start it.

`tests/architecture/database-test-audit-snapshots.test.ts` rejects database test snapshots that
aggregate every audit row. Use `count(*)||':'||max(id)`.

To clear older leftovers by hand, run against the local database only (never a hosted one):
`delete from onzio.audit_events where club_id in (<Alpha, Bravo, Charlie ids from tests/fixtures/entities.ts>)`.

## Configure local database tests

The database suite needs a running local Supabase **and** the test environment
exported into the shell. Vitest does **not** auto-load `.env.test`; nothing in
`vitest.config.ts` reads it, so the file alone is not enough.

```bash
supabase start
```

Create `.env.test` from `.env.test.example` if it does not exist. Fill in the
local values described in the [development guide](../docs/local-development.md).
Export the file before running tests:

```bash
set -a
. ./.env.test
set +a
npm run test:db
```

If database tests report invalid JWTs or an invalid Supabase URL, check the
exported local environment first. Use `supabase status` to check the stack.
The `[RED CONTRACT]` prefix remains in test-helper diagnostics; the prefix
alone does not establish whether a failure is configuration or application behavior.

`.env.test` is gitignored. Use credentials from the isolated local Supabase
stack and inert Stripe test values. The suite rejects hosted database URLs
and live Stripe values.

Commands:

- `npm test` — all three Vitest projects in order: `unit`, then `db`, then `pilot`. The `db`
  project needs the local Supabase stack and the exported `.env.test`.
- `npm run test:unit` — every test file except `tests/database` and the `pilot-*` architecture
  files; files run in parallel
- `npm run test:legacy` — copied Rose City regression suite; must stay green; files run in parallel
- `npm run test:contracts` — TypeScript behavior contracts; files run in parallel
- `npm run test:db` — local Supabase/RLS contracts; one file at a time
- `npm run test:architecture` — static architecture contracts; the `pilot-*` files run one at a
  time, the others in parallel
- `npm run test:pilot` — the `tests/architecture/pilot-*.test.ts` proofs; one file at a time
- `npx vitest run tests/contracts/admin-roster-player-editor.test.ts
  tests/contracts/diverse-city-admin-punch-list.test.ts
  tests/contracts/editorial-admin-surface.test.ts` — mobile-first player editor
  layout, fixed panel actions, compact media controls, touch targets, Staff
  isolation, and template-specific season-stat visibility
- `npx vitest run tests/contracts/admin-schedule-match-editor.test.ts
  tests/contracts/diverse-city-admin-punch-list.test.ts
  tests/contracts/editorial-admin-surface.test.ts` — mobile-first Add/Edit Match
  organization, fixed panel actions, semantic field groups, accessible labels,
  touch targets, and template-specific sponsor visibility
- `npx vitest run lib/__tests__/registration-fields.test.ts
  lib/__tests__/registration-export.test.ts
  lib/__tests__/special-kickers-registration.test.ts
  tests/contracts/registration-submit.test.ts
  tests/database/registration-rls.test.ts` — participant-mode branching,
  branch-scoped validation, combined CSV behavior, the local-only Special
  Kickers draft definition, submission routing, and database enforcement
- `npx vitest run tests/contracts/diverse-city-programs-admin.test.ts
  tests/contracts/diverse-city-program-registration-admin.test.ts
  tests/contracts/diverse-city-tryouts-admin.test.ts
  tests/contracts/diverse-city-query-mutations.test.ts
  tests/database/registration-form-links.test.ts` — optional tenant-safe
  Program/Tryout form links, admin round-tripping, open native-modal precedence,
  unchanged draft/closed/no-link fallbacks, and composite-FK enforcement
- `ROSTER_MEDIA_BASE_URL=https://onzio-platform.vercel.app npm run test:browser:roster`
  — retained focused roster compatibility check
- `SITE_MEDIA_BASE_URL=http://127.0.0.1:3000 npx playwright test
  --config=playwright.site-media.config.ts` — desktop and iPhone checks for
  every public image surface. Normal mode requires direct raw URLs, positive
  `naturalWidth`, and no unexpected fallback. Simulated source failure requires
  deliberate fallbacks and no broken-image chrome.

The database suite accepts only loopback Supabase URLs. Stripe fixtures accept
only test-mode keys and events.

Run database and browser suites serially. They share deterministic local
fixtures, so concurrent writers can invalidate each other's assertions and
cleanup. The prepared VM's `onzio test` command exports `.env.test` automatically;
see the [VM guide](../docs/vm-development.md).

## Vitest projects

`vitest.config.ts` splits the test files into three projects. They run in this order, so parallel
files never overlap the serial ones.

- `unit` holds every test file except the two groups below and runs files in parallel worker
  threads. It is the catch-all, so a test file in a new directory runs without a config change.
- `db` holds `tests/database/**`. It runs one file at a time in forked processes, and its
  `globalSetup` runs the local test data cleanup.
- `pilot` holds `tests/architecture/pilot-*.test.ts`. It runs one file at a time in forked
  processes.

The `db` and `pilot` files share state outside their own process. Database files share the tenant
singleton fixtures. Pilot proofs start servers and own process groups, and parallel files collide
on ports and processes (see `HANDOFF.md`, 2026-11-01). `tests/global-setup/serial-project-guard.ts`
makes both projects fail before any test runs when the command line sets `--fileParallelism` or
`--isolate=false`, instead of racing. Do not set `isolate: false` on `unit` either. Two runs with
`--project unit --isolate=false` failed 55 tests in 7 files, then 28 tests in 4 other files, and
were no faster.

A file runs its tests one after another, so one file of slow synchronous tests sets the floor
for `test:unit`. Split such a file by describe block, keep every title unchanged, and put the
shared setup in `tests/helpers`. `tests/architecture/template-selector-*.test.ts` came out of
`template-selectors.test.ts` this way.

Two limits of Vitest 4.1.10 apply to the command line.

- `--exclude` has no effect on the projects. `vitest run --exclude 'tests/contracts/**'` runs more
  files, never fewer. Name the files to run, or pick a project.
- Repeated negations do not combine. `--project '!db' --project '!pilot'` selects all three
  projects. Use `--project unit`.

`vitest.config.ts` resolves `tsconfig.json` paths with Vite's `resolve.tsconfigPaths` option, so the
`vite-tsconfig-paths` package is not a dependency.

## Local site assignment and rollback proof

See [the proof scope and commands](../docs/site-assignment-proof.md).
The proof creates a unique unexposed schema in loopback PostgreSQL, exercises
real concurrent transactions and existing homepage RPCs, then removes the schema.
Run it serially with other database and browser suites. Its React pages are test
fixtures; they do not change the current club site or editor.

## Local homepage performance checks

Use production builds with the same synthetic Alpha content. The check only
allows loopback runtime requests and read-only methods. It fetches intercepted
responses without automatic redirects and validates every redirect target before
fetching it. It blocks WebSockets before connecting, as well as
external media and analytics, so it does not establish production LCP or CDN
performance. Request mediation also makes timing unsuitable for a speedup claim.

```bash
node --test scripts/check-site-performance-redirect.test.mjs
node scripts/check-site-performance.mjs --base-url http://alpha.localhost:3122 --expected-title "Alpha FC" --source-sha FULL_BASE_SHA --output test-results/site-performance/base.json
node scripts/check-site-performance.mjs --base-url http://alpha.localhost:3123 --expected-title "Alpha FC" --source-sha FULL_HEAD_SHA --output test-results/site-performance/head.json --compare test-results/site-performance/base.json
```

Start each server separately from its known production build. The supplied SHA
is metadata, not verification of the server's source. Each capture has one warmup
and five samples at desktop and phone widths. Reports require successful output,
matching visible content, completed home-kit reads, and no unexpected local errors.
Comparison rejects scenario mismatches and increased font or browser REST costs.

For the home-kit loading package, add `--home-kit-only` to require that third/away
kit requests disappear while home section/photo reads remain. This gate applies
to the client-loader pilot, not a future server-loaded kit. Empty kit fixtures
do not establish populated product rendering; check that separately.
The existing homepage browser suite includes `homepage-editor-home-kit.spec.ts`.
It supplies populated kit GET responses and makes unused variants fail, then
checks loaded photo order, copy, CTA and layout at desktop and phone widths.
It leaves database fixtures unchanged; use the authenticated browser setup below.

Outputs must be new JSON files in a gitignored directory or the system temporary
directory. The VM launcher supplies the installed Playwright browser path.
Reports separate decoded resource bodies and transfer bytes, and browser REST
reads are not total SQL queries. Timings are descriptive. Interleave baseline/head
runs and profile separately before claiming a speedup. See the
[architecture decision](../docs/site-architecture.md) for the migration gates.

## Local authenticated browser suites

The `admin-guided`, `admin-loading`, `homepage`, `public-page-editors` and
`contact-editor` Playwright configs run against a production build served at
`http://alpha.localhost:3110` with a loopback-only `.env.local`, under
`scripts/with-local-db-lock.sh`. With `.env.test` exported:

```bash
npx next start -p 3110 &
node scripts/homepage-local-auth.mjs        # owner: /private/tmp/onzio-homepage-tests/local-auth.json
node scripts/homepage-local-auth.mjs admin  # administrator: .../local-admin-auth.json
export ADMIN_GUIDED_STORAGE_STATE=/private/tmp/onzio-homepage-tests/local-auth.json
export ADMIN_GUIDED_ADMIN_STORAGE_STATE=/private/tmp/onzio-homepage-tests/local-admin-auth.json
export SUPABASE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Set `ADMIN_LOADING_STORAGE_STATE`, `HOMEPAGE_STORAGE_STATE` and
`PAGE_EDITOR_STORAGE_STATE` to the owner file too. The members and lifecycle
specs refuse to run without the administrator state and the loopback database
URL. Alpha stands in for Diverse City, so the `admin-loading`, `homepage` and
`public-page-editors` configs turn Alpha's Shop switch on for their run and
restore it afterwards (`tests/browser/alpha-store-enabled.global-setup.ts`);
the seeded Alpha has it off. `public-page-editor-shop-off.spec.ts` turns it
off again for its own case and restores it. The owner's first admin visit confirms
Alpha's time zone from the browser (ADMIN-RE-02), which the RE-01 database test
expects unset, so every config that signs the Alpha owner in (these five plus
`admin-reimagined`, `dcfc-403` and `plat-101`) puts `time_zone` and
`time_zone_set_at` back when the run ends
(`tests/browser/alpha-time-zone.global-setup.ts`). Strip any real email or media provider keys from
the local `.env.local` before a run.

## Contact section-guide editor

The approved Contact editor saves `contact_profile` and `contact_page_content`
in one tenant-scoped transaction. Focused checks cover editor ownership and
template dispatch, revision conflicts, rollback, and operation receipts:

```bash
npx vitest run tests/contracts/diverse-city-contact-admin.test.ts tests/contracts/editorial-contact.test.ts tests/contracts/editorial-admin-surface.test.ts
set -a && . ./.env.test && set +a && npx vitest run tests/database/contact-page-atomic-save.test.ts
```

The database test requires the checked-in `20261005003024_contact_page_editor.sql`
migration on isolated local Supabase. Browser acceptance uses the built local
app at `http://alpha.localhost:3110/admin/contact` and the synthetic owner
identity from `scripts/homepage-local-auth.mjs`.

Review regressions cover malformed direct RPC revisions, committed response loss,
unknown receipts and exact retries, native dialog keyboard containment/dismissal,
focus restoration, and phone Branding link hit testing above Save:

```bash
set -a && . ./.env.test && set +a
node scripts/homepage-local-auth.mjs
PAGE_EDITOR_STORAGE_STATE=/private/tmp/onzio-homepage-tests/local-auth.json npx playwright test --config=playwright.contact-editor.config.ts
```

Run against a production build with local Supabase credentials and
`ONZIO_ENVIRONMENT=production` (the synthetic Alpha fixture uses production
domain records). Do not run concurrently with database/browser suites using
Alpha. Browser writes are restored in `finally`. Chromium's short-height check
proves layout; native iOS keyboard/safe-area behavior remains unverified.

## Homepage editor redesign

The [binding-aware draft recovery guide](../docs/homepage-draft-recovery.md)
describes version 1/2 records, the IndexedDB upgrade, explicit reviewed apply and
receipt-first recovery. Focused pure cases are in
`tests/contracts/homepage-editor-binding-recovery.test.ts`. Real browser cases
are in `tests/browser/homepage-editor-binding-recovery.spec.ts`, under the existing
homepage config. They cover compatible and incompatible review, old records and
files, old-client access rejection, persistence after undo, and
committed/uncommitted response loss. They also hold real IndexedDB transactions
to check recovery after older clears and writes complete.
Run browser and database fixture writers serially.

The [assignment-aware homepage save guide](../docs/homepage-assignment-saves.md)
explains the homepage-only token and migration boundary. Its focused local tests
are `tests/database/homepage-assignment-save.test.ts`,
`tests/database/homepage-assignment-concurrent.test.ts` and
`tests/database/homepage-assignment-migration.test.ts`. The browser regression is
`tests/browser/homepage-editor-assignment.spec.ts` in the existing homepage config.
Run these serially with other fixture writers.

The [versioned editing bindings](../docs/homepage-editing-bindings.md) have focused
projection, identity, reducer and save-adapter regressions in
`tests/contracts/homepage-editor-bindings.test.ts`. They preserve the legacy save
and recovery contracts. Assignment-aware save integration uses the guide above;
binding-aware recovery uses the separate draft guide.

Status and acceptance ledger: `docs/homepage-editor-redesign-plan.md`.
The state, capability, save schema, route and media hydration contracts have
production implementations. Local SQL/HTTP transaction coverage lives in
`tests/database/homepage-atomic-save.test.ts` and
`tests/database/homepage-concurrent-save.test.ts`.

```bash
npx vitest run tests/contracts/homepage-editor-state.test.ts tests/contracts/homepage-editor-model-edge-cases.test.ts tests/contracts/homepage-editor-save-contract.test.ts tests/contracts/homepage-editor-capabilities.test.ts tests/contracts/homepage-editor-fallback-capabilities.test.ts tests/contracts/homepage-editor-route.test.ts tests/contracts/homepage-editor-server.test.ts
set -a && . ./.env.test && set +a && npx vitest run tests/database/homepage-atomic-save.test.ts tests/database/homepage-concurrent-save.test.ts
```

The transaction tests require migration `20260915180623` on local Supabase.
Most fixtures roll back; the independent-connection/HTTP test creates and cleans
up a temporary local club. Business conflicts must use `PT409`, not PostgreSQL
serialization failure `40001`, which can trigger PostgREST retries.
The 15 pure recovery contracts now pass. Real browser coverage also checks
receipt reconciliation after a committed response is lost, cross-tab protection,
explicit conflict review, and unavailable IndexedDB. See the scoped plan for
current acceptance evidence and limitations. Never commit browser authentication
state.


Homepage preview browser checks (isolated local app on port 3110, Alpha fixture):

```bash
set -a && . ./.env.test && set +a
node scripts/homepage-local-auth.mjs
HOMEPAGE_STORAGE_STATE=/private/tmp/onzio-homepage-tests/local-auth.json npx playwright test --config=playwright.homepage.config.ts
```

The suite covers real atomic saves, failures and exact retries, mixed photo
uploads, six-photo ordering/removal, recovery and concurrent tabs, native modal
focus, mobile Save/Done access, playback, themes, reduced motion and touch targets.
The template matrix compares public/preview geometry, header state, text, typography and media across
two active templates plus the legacy Rose City renderer using **synthetic local Alpha**.
It temporarily changes only local fixture design/slug state and restores it in
`finally`. Do not run it concurrently with any database suite or other browser
suite using Alpha. Recovery test writes and photo assets are restored/retired.

If a Homepage browser run is interrupted, it cannot reach the `finally` that
restores Alpha's presentation fixture. Because each run captures whatever is
published as its own baseline, that leak otherwise becomes permanent: Alpha stays
on the wrong template, `story.text` disappears, hero saves fail `FIELD_UNAVAILABLE`,
and unrelated specs fail in ways that look like product defects. The specs now
refuse to run in that state and name the fix:

```bash
npm run fixture:homepage:restore:local
```

It is loopback-only, never resets the database, repoints Alpha at its seeded
Academy document and clears leftover marker text from the hero fields.

### iOS Simulator / real-device checks

Chromium at a reduced height proves layout only. For real WebKit, a real
software keyboard and real safe-area behaviour, drive Mobile Safari in the iOS
Simulator. Safari cannot resolve `alpha.localhost`, and the tenant is resolved
from the `Host` header, so run the development proxy first:

```bash
npm run dev:device-proxy
```

Then open `http://127.0.0.1:3111/admin/homepage` in the Simulator's Safari, or
`http://<mac-lan-ip>:3111` on a real iPhone after starting it with
`LISTEN_HOST=0.0.0.0`. The proxy also rewrites `Origin`/`Referer`: the save route
rejects a mismatched origin as cross-site, which is correct CSRF protection and
not a bug. It is a development tool only — never point it at a hosted
environment.

The Simulator suppresses the on-screen keyboard while the Mac's keyboard is
attached. Turn that off (Simulator ⌘K, or
`defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false`
then restart Simulator) or the keyboard-open checks prove nothing.

The auth helper uses the local email inbox and writes private state outside
Playwright's cleaned output directory. Screenshots are under
`test-results/homepage-editor-browser/`. Reduced-height browser tests prove layout
and focus only; real iOS Safari/Android Chrome keyboard and screen-reader
walkthroughs remain separate acceptance requirements.

## Public-page About canvas viewport check

With a local-only authenticated browser state (for example from the homepage
local auth helper) and the local app on port 3110:

```bash
PAGE_EDITOR_BASE_URL=http://alpha.localhost:3110 \
PAGE_EDITOR_STORAGE_STATE=/private/tmp/onzio-homepage-tests/local-auth.json \
npx playwright test --config=playwright.public-page-editors.config.ts
```

The check taps a canvas section and verifies that Phone and Desktop retain real
390px and 1440px CSS viewports even when the editor itself is narrower. The
same command can target a synthetic Clubhouse or legacy local tenant and its
matching local authenticated browser state. Never commit browser auth state.

### About and Club Logo editor review regressions (PPE-01)

- Pure recovery/schema/authoring/public hydration: `npx vitest run lib/__tests__/about-editor-save.test.ts lib/__tests__/about-editor-recovery.test.ts lib/__tests__/about-editor-public-query.test.ts`.
- Local SQL: `tests/database/about-page-atomic-save.test.ts` covers independent page revisions, actor receipts, lost-response replay, malformed revisions/nested JSON, legacy/concurrent writer protection, design changes, retired media IDs, tenant isolation and forged nested-origin canonicalization. Parent-owned `about-page-concurrent-save.test.ts` adds separate-connection design races and purge cascades.
- Real-save browser: `tests/browser/public-page-about-save.spec.ts` in `playwright.public-page-editors.config.ts` covers commit-before-network/500 response loss, unavailable/noncommitted receipts with exact retry, concurrent conflict reload and first values/crest/colors with selected-page draft preservation. Run the Logo cases against an isolated legacy Alpha fixture with Schedule published, `/schedule` closing destination and empty values/features/color cards; each test restores content using a fresh revision. Local authenticated `PAGE_EDITOR_STORAGE_STATE` is required.
- The shared phone inspector visual viewport/browser checks complement separate native iOS software-keyboard acceptance; browser metrics alone do not establish native keyboard behavior.


- Removed unsaved Logo uploads: the `removing newly uploaded Logo items queues their images only for the Logo Save` case uses isolated upload/finalize/Save HTTP responses with the real authoring UI, removes patch/icon/color uploads before first Save, saves About first and verifies the Logo cleanup queue is sent only on the following Logo Save. Run with the synthetic legacy fixture. This verifies client cleanup ownership/payload, not actual storage deletion.

- Shared phone focus: `lib/__tests__/page-editor-focus.test.ts` checks stable target recovery after iframe blur/node replacement, duplicate Tryouts labels, detached frames and normal outer triggers. These narrow DOM facades complement the unchanged real browser focus-trap/Escape/Done tests in `public-page-editor-phone.spec.ts`; they do not establish native focus/keyboard acceptance.

- Phone canvas obstruction: the independent Tryouts first-selection case in `public-page-editor-phone.spec.ts` verifies the iframe target's outer-page center stays above the persistent Save strip before the actual click opens tools. This catches outer overlays that iframe-local hit testing misses; existing modal/focus/keyboard assertions remain unchanged.

## Local About and Logo content policy

`20261022200815_about_content_policy.sql` separates valid content maintenance from current template, navigation, and Store visibility. Trusted closing destinations remain the thirteen exact historical paths. The normal destination picker and Academy save adapter keep their current display behavior.

Run the focused behavior checks with the loopback test environment exported:

```bash
npx vitest run tests/database/about-content-policy.test.ts tests/database/about-page-atomic-save.test.ts tests/database/about-page-concurrent-save.test.ts tests/contracts/about-content-policy-route.test.ts tests/contracts/about-content-destinations.test.ts lib/__tests__/about-editor-destinations.test.ts lib/__tests__/about-editor-save.test.ts lib/__tests__/about-editor-recovery.test.ts lib/__tests__/about-editor-public-query.test.ts
```

The policy suite covers hidden About and Logo maintenance, strict trusted paths, nested payload and media validation, current authorization, atomic rollback, independent revisions, original hashes, and actor receipts. Historical compatibility creates a real old-function receipt before applying the complete new migration in rollback scope. Loopback PostgREST commits nonempty content on a disposable synthetic club and verifies denial without effects. Route contracts invoke the actual exported mutation handlers with isolated boundary collaborators.

Run shared database and browser fixture writers serially. See [the About policy](../docs/about-content-policy.md) for the unchanged security, media, receipt, and concurrency contracts. This SQL and API package does not claim new browser acceptance or hosted application.

## Academy site shell and routes

`components/sites/diverse-city` owns the Academy header, footer, hero, font
scope, loading states and one table of the pages the tenant adapters implement
(`routes.ts`). Header links, footer links, hero default buttons, the active-link
rule, hero-header behavior and loading labels all derive from that table. A
destination is the branded `AcademyHref` type that only `academyHref` can build,
so a hand-written path does not compile.

```bash
npx vitest run tests/architecture/academy-site-routes.test.ts tests/contracts/academy-site-navigation.test.ts
npx vitest run tests/contracts/academy-clear-frame-loading.test.ts tests/contracts/academy-footer-focus.test.ts tests/contracts/academy-nav-branding-timeout.test.ts tests/contracts/academy-programs-loading-stall.test.ts tests/contracts/academy-hero-content-stall.test.ts
```

The architecture check fails when the table and the `page.tsx` files under
`app/%5Fclubs/[slug]` differ, and when any module file other than `routes.ts`
spells an internal path. Add a page adapter and its table entry together. The
contracts read the module's real sources, so they need no browser or database.

Public routes and the homepage editor preview both render `AcademyShell`. Before
and after screenshots, header and footer DOM hashes, link lists and resource gates
come from guarded production builds of the base and the head revision. Run the
browser pass under the shared database lock, as with the homepage suites above.

## Template selector ratchet

`tests/architecture/template-selectors.test.ts` runs in `npm run test:architecture`.
It stops new code from branching on the presentation template while SITE-08
retires the existing branches. A club-specific behavior belongs in that club's
site module, not in a template branch.

The tests that build a temporary git repository live in
`template-selector-retirement.test.ts`, `template-selector-baseline.test.ts` and
`template-selector-baseline-history.test.ts`, so Vitest runs them on separate workers.
They share `tests/helpers/selector-repository.ts`, which builds one starting repository per
test file and copies it for each test. The retirement test copies
`template-selectors.test.ts` into its temporary repository by path and runs the tests whose
names start with `template selector ratchet`, so keep that file and that describe name.

The check parses every TypeScript and JavaScript file that git does not ignore, including
untracked source and new top-level directories.
It skips `tests/`, `lib/__tests__/` and any `*.test.*`
or `*.spec.*` file. Comments are ignored. It counts four kinds of selector per file and checks retired API references.

- `literal:` a template key string such as `"academy@1"`.
- `read:` a mention of `presentationTemplateKey`, `templateKey`,
  `visibleForTemplates` or `hiddenForTemplates`, or of the `data-site-template`
  and `data-font-pack` attributes that scope styles to a template.
- `flag:` each use of a value computed only from the template, such as
  `isAcademy`, `hidesSlugField`, an alias of the key, or a method call, membership
  test or lookup on one of those. Destructured aliases, parameter and binding defaults, and aliases wrapped in
  TypeScript assertions or `satisfies` expressions are tracked. Plain identifier
  assignments also seed local aliases. TypeScript's lexical symbols resolve each
  reference, including shorthand property values, catch bindings and function-scoped
  `var`. A narrow correction separates parameter initializers from body-only
  declarations, as described below. Initializers use lexical assignment
  targets because a `var` declared inside a catch can write the catch binding
  rather than the function symbol declared by that `var`. Property names and
  shadowing parameters or bindings are not counted as uses of an outer alias.
- `id:` a bare template id such as `"academy"` compared with any expression or
  used as a `case` label.

The presentation package is now scanned because #45 deleted its dead switching APIs.
References to those deleted APIs, report types, and registry fields produce `retired:`
entries and always fail, even if the JSON is edited to include them. Identifiers,
named imports, namespace accesses, static string property accesses, and type references
are checked. Comments and historical Markdown and SQL remain outside the scan.
Live font, section, and theme validation stays allowed.

`tests/architecture/template-selector-allowlist.json` maps each file to its exact
counts. The check fails in both directions. A selector the list does not allow
fails the first test. A listed selector that code no longer contains fails the
second, so the list always matches the code. A swap of one selector for another
fails both.

To retire selectors in a SITE-08 change:

1. Delete the branch and the code that only it used.
2. Run `npx vitest run tests/architecture/template-selectors.test.ts`. Each
   failure line names the file, the kind, and the allowlist and code counts.
3. In the JSON file, lower each count to the code count. Delete a kind at zero,
   and delete a file when nothing is left. Keep the file sorted. The canonical
   form test rejects any other layout.
4. Run the test again and commit the code and the smaller list together.

After the first introduction, never raise a count or add a file. SITE-07 #56 has one
explicit exception: the new pure `lib/code-site.ts` adapter may record at most one
`academy@1` literal and two `presentationTemplateKey` reads when the baseline
does not yet contain that file. All other increases still fail, and once the
adapter appears on main its counts can only shrink. #56 reduced the inventory
from 455 mentions in 63 files to 300 in 53 files. The initial inventory
included 51 presentation-package mentions.
The 461-mention, 61-file recovery snapshot at `eb82ba3` remains in
[the inventory comparison](../docs/verification/site08-selector-check/initial-inventory.json).
Accepted Competition changes remove 17 mentions, Sponsors and Shop add five outer
adapter mentions, and locally accepted registration pages add six outer adapter
mentions across two more files. The guard itself adds no application selector.

To read the current inventory totals without changing the allowlist:

```bash
npx tsx -e 'import {scanRepositoryTemplateSelectors} from "./tests/helpers/template-selectors"; const table=scanRepositoryTemplateSelectors(process.cwd()); console.log({files:Object.keys(table).length,mentions:Object.values(table).reduce((sum,row)=>sum+Object.values(row).reduce((sum,count)=>sum+count,0),0)});'
```

Rewrite the code so the branch is not needed.
The test also compares the JSON with current `origin/main` and rejects increased
counts or new entries. An older branch base cannot bypass a later reduction on main,
even when the branch predates the guard and cherry-picks its introduction. Missing
or unreadable Git references fail the check. First introduction is allowed only
when current `origin/main` genuinely has no inventory file. Keep that reference
current before verification.

The check permits the last selector to be retired and the allowlist to become `{}`.
It has no required selector file or minimum count. Throwaway repository tests prove
tracked, untracked, and new-directory scan coverage, excluded tests, real Git baseline
history, and the actual architecture guard with no remaining selectors.

The reconciled source is actual main
`589f80192b3cfb1b979c239a14976ec769581901`, after Christian-authorized bot merges
of registration PR #74 and About PR #73. Every scanned source path in this guard
integration matches that main revision. The prior local registration acceptance
at `e4a7104` remains recorded separately. Neither merge changes the 455-mention,
63-file inventory. Local acceptance does not require a production merge.
The report preserves the original `ada583e` to `eb82ba3` recovery comparison and
every reconciliation stage and drift. Full pilot-inclusive verification and
exact final-head independent review still precede the guard's publication.

Binding analysis uses an isolated one-source TypeScript Program with `noLib`,
`noResolve`, `types: []`, JavaScript support and JSX preservation. Its virtual
compiler host returns only the supplied source. It reads no filesystem, import,
standard library or dependency type graph. Compiler symbol identity replaces the
custom scope-owner and shadowing rules, which disagreed about parameter defaults
and catch initializers. The selector API and AST expression classification remain
unchanged.

A parameter initializer, including a closure created there, cannot see declarations
that exist only inside that function body. The compiler APIs can nevertheless
resolve a default's identifier to a body function declaration. The scanner corrects
that discrepancy only when every declaration of the resolved symbol is inside the
owning function body. A matching named function expression retains its own name
binding. Other identifiers call public `resolveName` at the function's parent with
`SymbolFlags.Value`, repeating the check for enclosing parameter initializers.
Ordinary reads, shorthand values and assignment targets use this correction.
Parameter bindings and a closure's own shadows remain visible. An unresolved name
gets no fallback. Native JavaScript controls establish that the outer
`"academy@1"` key makes the default true despite a body `function key() {}`;
its inverse and missing-outer-binding controls retain false and `ReferenceError`.
The focused suite has 115 cases, including parameter defaults, destructuring,
closures, named expression self-bindings and own-parameter precedence. This evidence
covers those fixtures, not all JavaScript or TypeScript binding behavior.

Limits.

- Alias propagation is local and flow-insensitive. A pure initializer or plain
  identifier assignment marks that lexical symbol, including references before
  that write. Later unrelated writes do not clear it. The scanner does not follow
  property writes, object identity, imported values or calls between functions.
- Counts are per file. Deleting one branch and adding another of the same kind in
  the same file keeps the counts equal, so read the diff.
- A mixed expression such as `isAcademy && menuOpen` is counted where it names the
  template, and its own name is not tracked afterward.
- A helper that hides the template behind a function, such as the homepage
  capabilities resolver, is counted inside the helper and not at its callers.
- CSS rules keyed on `[data-site-template]` or `[data-font-pack]`, SQL template
  gates, JSON data, and tenant-slug checks are outside the scan. Those attributes are
  counted in TypeScript and JSX only.

## Actual pilot source package

Run `npx vitest run tests/architecture/pilot-source-package.test.ts` for package
integrity and reconstruction boundary checks. The suite exercises exported
functions and real pack/verify/reconstruct CLIs with temporary synthetic Git
repositories. It checks complete-lock rejection before output, historical v1
verification without reconstruction, and retained visual/current platform
ownership. These fixtures do not render a Next application. See the
[pilot package guide](../docs/pilot-source-package.md) for actual build inputs,
commands and the separate reconstructed public/editor acceptance requirement.

The [actual pilot reconstruction guide](../docs/pilot-reconstruction.md) adds
changed visual/current-platform controls, fresh production builds and real
desktop/mobile public/editor checks. The new browser rehearsal performs reads
only; run the existing real-save suites serially afterward.

Run `npx vitest run tests/architecture/pilot-reconstruction-environment.test.ts`
for preparation compatibility preflight and documented build/start environment
guards. The tests run the real CLIs with synthetic file fixtures and a harmless Next child stub. They
check dotenv precedence and expansion, shell overrides, both live Stripe key
prefixes and error redaction without starting the app or contacting providers.


## Guarded local build provenance

Run `npx vitest run tests/architecture/pilot-reconstruction-build.test.ts
tests/architecture/pilot-reconstruction-environment.test.ts` for real launcher
CLI cases with isolated synthetic Next children. These check receipt lifecycle,
complete file membership, public environment drift, stale output, symlinks and
exclusive operation locks while preserving all environment rejection cases.
The suite also checks actual-loader phase selection and redaction, configuration
side effects, and failed-build invalidation before temporary-path validation.
The [local build guide](../docs/pilot-build-provenance.md) states the guarantee
and exclusions. Synthetic child tests do not establish a genuine Next build.
Separate acceptance builds a minimal actual Next application, starts it on
loopback, reads its marker, rebuilds changed source and rejects corrupted
executable output and failed-build reuse. That is command lifecycle evidence,
not full Onzio public/editor or installed-pilot acceptance.

Run `npx vitest run tests/architecture/pilot-proof-servers.test.ts` for owned
reconstruction-proof server lifecycle checks. Synthetic child fixtures cover
receipt checks, actual resolved router/renderer paths, the native listening
socket, isolated role environments, locks, interruption and cleanup. Listener
controls include config changing port environment strings to an unrelated server,
invalid addresses and capture-time listener replacement or closure.
The proof CLI accepts `--baseline-root`, `--changed-root` and `--restored-root`;
its private-IPC children select their own loopback ports. Supplied server URLs
are rejected. A minimal genuine Next runtime check is separate from Academy
public/editor browser acceptance and accepted-package/build identity. See the
[reconstruction guide](../docs/pilot-reconstruction.md).

Run `npx playwright test --config=playwright.pilot-proof.config.ts` for the
proof's actual guarded Chromium and direct request transport, plus capture shutdown
with delayed successful and truncated resource bodies. The isolated
IPv4 listeners check logical tenant Host/cookies, proxy traversal, approved and
blocked redirects, anonymous access, and late retained-asset retrieval.

Run `npx vitest run tests/architecture/pilot-accepted-build-identity.test.ts` for
accepted reconstruction identity through real package/build/proof CLIs and owned
native HTTP fixtures. Cases distinguish metadata-only acceptances, reject missing,
malformed or changed markers and explicit invalid expectations, and preserve
whole binding, complete lock, current-platform B and generic-build behavior.
These synthetic Next fixtures complement separate genuine Next runtime controls;
they do not establish full Academy public/editor acceptance.

## Coordinated local Academy acceptance

Run `npx vitest run tests/architecture/pilot-owned-scope.test.ts
 tests/architecture/pilot-site-coordination.test.ts` for scoped owned-lifetime and
coordination boundary checks. These use actual package/build/owner APIs with tiny
synthetic native children. They do not prove real Academy rendering or SQL.

Run `npx vitest run tests/database/site-coordination.test.ts` with the exported
local environment for real committed fleet/event races, exact immutable legacy
projection changes, unmodified homepage stale-token and receipt authority, tenant
and role denials, and fixture restoration. Run shared-fixture writers serially.

The [coordinated local Academy guide](../docs/pilot-site-coordination.md) describes
`npx tsx scripts/prove-pilot-site-coordination.ts --config /private/path/proof-input.json`.
It requires real guarded A/B/current-platform roots and both externally accepted
packages. It produces public, kit and editor captures at both widths after real
assignment-selected navigation, verifies returned retained resources and original
receipts, then withholds PASS until owned shutdown and disposable-club cleanup.
Inspect all screenshots. Hosted admission and production dispatch are separate
unimplemented adapters.

## Homepage content maintenance policy

The [homepage policy guide](../docs/homepage-content-policy.md) describes the
local SITE-06A migration. Direct-RPC tests cover valid content hidden by the
current renderer, retained authorization and validation, whole-save rollback
and real pre-policy receipt replay across the new function replacement.

```bash
npx vitest run tests/database/homepage-content-policy.test.ts
```

Export the local environment and run these serially with the existing atomic,
assignment, concurrent-save and coordination suites. UI bindings and rendering
are unchanged. Nonmigrated content domains retain their existing availability rules.

## Shop content maintenance policy

The [Shop policy guide](../docs/shop-content-policy.md) describes SITE-06B.
The local cases exercise hidden Shop and homepage home-kit maintenance, retained
surface ownership, strict validation and media checks, current authorization,
revision conflicts, rollback and real pre-policy receipt migration.
The HTTP cases use loopback PostgREST and a disposable club. Route contracts
execute the actual GET and POST adapters with boundary collaborators isolated.

```bash
npx vitest run tests/contracts/shop-content-policy-route.test.ts tests/contracts/shop-page-editor.test.ts
npx vitest run tests/database/shop-content-policy.test.ts tests/database/shop-page-atomic-save.test.ts
```

Export the local test environment before database checks. Run shared-fixture
writers serially. This package changes SQL and API maintenance policy. It does
not add editor controls or change public Store availability and rendering.

## Contact content maintenance policy

The [Contact policy guide](../docs/contact-content-policy.md) describes SITE-06D.
Direct SQL and loopback PostgREST exercise paired Contact maintenance under hidden
and missing presentation, strict input and media boundaries, current authority,
content conflicts, atomic failures and genuine pre-policy receipt replay.
Separate database connections observe lock waits with both legacy Contact
singletons in both write orders. Route contracts invoke the exported handlers.

```bash
npx vitest run tests/contracts/contact-content-policy-route.test.ts tests/contracts/diverse-city-contact-admin.test.ts tests/contracts/editorial-contact.test.ts
npx vitest run tests/database/contact-content-policy.test.ts tests/database/contact-page-concurrent-save.test.ts tests/database/contact-page-atomic-save.test.ts
```

Export the local test environment before database checks. Run shared-fixture
writers serially. SQL retains its bounded phone string and table email CHECK;
the HTTP schema also validates phone and email syntax. Normal Contact controls,
public rendering and social-link ownership retain their existing policy.


## Tryouts content maintenance policy

The [Tryouts policy guide](../docs/tryouts-content-policy.md) describes SITE-06E.
Direct SQL and loopback PostgREST cover hidden nonempty intro/event maintenance,
strict boundaries, current authority, original hashes, historical receipt replay,
media relationships, full-roster CAS, and atomic failures. Independent database
connections exercise both legacy writer tables in both write orders. Exported
GET and POST handlers retain parsing, tenant, origin, cleanup, and enrichment
behavior.

```bash
npx vitest run tests/contracts/tryouts-content-policy-route.test.ts tests/contracts/tryouts-page-media-retirement-route.test.ts tests/contracts/page-editor-receipt-availability-route.test.ts
npx vitest run tests/database/tryouts-content-policy.test.ts tests/database/tryouts-page-concurrent-save.test.ts tests/database/tryouts-page-atomic-save.test.ts tests/database/page-editor-design-serialization.test.ts
```

Export the local test environment before database checks. Run shared-fixture
writers serially. The HTTP schema and SQL retain their existing type, calendar,
and public-link differences. Normal editor controls, bindings, public rendering,
and form status behavior retain their existing policy. This SQL/API package
claims no new browser acceptance or hosted application.

## Programs content maintenance policy

The [Programs policy guide](../docs/programs-content-policy.md) describes SITE-06F.
Direct SQL and loopback PostgREST cover program page and directory maintenance
under every template and under absent presentation history, strict boundaries,
the three destination layers, media rules, content CAS on `updated_at` baselines,
original hashes, historical receipt replay for both surfaces, and fault-injected
atomicity. Independent database connections race both legacy writer tables
against the page save and the `programs` table against the directory save, in
both orders. Exported GET and POST handlers retain parsing, tenant, origin,
cleanup, and error mapping behavior.

```bash
npx vitest run tests/contracts/programs-content-policy-route.test.ts tests/contracts/page-editor-receipt-availability-route.test.ts tests/contracts/program-page-editor.test.ts tests/contracts/page-editor-media-retirement-route.test.ts tests/contracts/program-editor-media-hydration-route.test.ts tests/contracts/editorial-admin-surface.test.ts
npx vitest run tests/database/programs-content-policy.test.ts tests/database/programs-page-concurrent-save.test.ts tests/database/program-page-atomic-save.test.ts tests/database/page-editor-design-serialization.test.ts
```

Export the local test environment before database checks. Run shared-fixture
writers serially. The Programs editor page, admin navigation entry, preview-forms
route, public routes, and Academy preview keep their Academy-only policy. This
SQL and API package claims no new browser acceptance or hosted application.
