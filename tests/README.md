# Onzio red contract suite

This directory remains intentionally ahead of the multi-tenant platform.
Rose City's legacy application has been copied into the repository, but
contract tests still import planned Onzio modules under `lib/`; database tests
still expect future local Supabase migrations; and architecture tests still
expect future tenant/security modules. Until each corresponding delivery phase
is implemented, those contracts must remain red.

## Local database setup — required before `test:db` or `npm test`

The database suite needs a running local Supabase **and** the test environment
exported into the shell. Vitest does **not** auto-load `.env.test`; nothing in
`vitest.config.ts` reads it, so the file alone is not enough.

```bash
supabase start
cp .env.test.example .env.test   # then fill in from `supabase status`
set -a && . ./.env.test && set +a && npm run test:db
```

Skipping the `set -a && . ./.env.test` step produces
`[RED CONTRACT] Local Supabase is unavailable or the planned onzio.clubs
contract is missing: Error: Expected 3 parts in JWT; got 1`, plus
`Invalid supabaseUrl`. Both mean **the environment was not exported**, not that
Supabase is down — check `supabase status` before concluding the database is
unavailable. Roughly 75 database tests fail this way, and the message has
already been misread once as an unrunnable environment (`DCFC-702`, 2026-08-06).

`.env.test` is gitignored. Its values are local fixtures: the Supabase demo JWTs
are identical on every local install, and the Stripe entries are inert
placeholders the suite rejects live values for.

Commands:

- `npm test` — legacy regressions plus all platform contracts
- `npm run test:legacy` — copied Rose City regression suite; must stay green
- `npm run test:contracts` — TypeScript behavior contracts
- `npm run test:db` — local Supabase/RLS contracts
- `npm run test:architecture` — static architecture contracts
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

Phase 1 verified 229 passing legacy tests. The 2026-09-17 local full suite passes
1,535 tests. Treat future contract failures as requirements, not harness defects;
do not skip, weaken, or broadly mock them.

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
five templates plus the legacy Rose City renderer using **synthetic local Alpha**.
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
same command can target a synthetic Clubhouse or Editorial local tenant and its
matching local authenticated browser state. Never commit browser auth state.

### About and Club Logo editor review regressions (PPE-01)

- Pure recovery/schema/authoring/public hydration: `npx vitest run lib/__tests__/about-editor-save.test.ts lib/__tests__/about-editor-recovery.test.ts lib/__tests__/about-editor-public-query.test.ts`.
- Local SQL: `tests/database/about-page-atomic-save.test.ts` covers independent page revisions, actor receipts, lost-response replay, malformed revisions/nested JSON, legacy/concurrent writer protection, design changes, retired media IDs, tenant isolation and forged nested-origin canonicalization. Parent-owned `about-page-concurrent-save.test.ts` adds separate-connection design races and purge cascades.
- Real-save browser: `tests/browser/public-page-about-save.spec.ts` in `playwright.public-page-editors.config.ts` covers commit-before-network/500 response loss, unavailable/noncommitted receipts with exact retry, concurrent conflict reload and first values/crest/colors with selected-page draft preservation. Run against isolated synthetic Cinematic Alpha with Schedule published, `/schedule` closing destination and empty values/features/color cards; each test restores content using a fresh revision. Local authenticated `PAGE_EDITOR_STORAGE_STATE` is required.
- The shared phone inspector visual viewport/browser checks complement separate native iOS software-keyboard acceptance; browser metrics alone do not establish native keyboard behavior.

- Editorial empty-page authoring: run the `Editorial empty About` cases from `public-page-about-save.spec.ts` against the isolated Editorial fixture (separately from Cinematic Logo cases). At 1440px and 390px they mock empty About editor snapshots and Save responses, then exercise real canvas selection, first value, closing destination, draft payload and focus restoration. Public renderer markup remains unchanged; these are UI regression checks, not persisted-save or native keyboard evidence.

- Removed unsaved Logo uploads: the `removing newly uploaded Logo items queues their images only for the Logo Save` case uses isolated upload/finalize/Save HTTP responses with the real authoring UI, removes patch/icon/color uploads before first Save, saves About first and verifies the Logo cleanup queue is sent only on the following Logo Save. Run with the synthetic Cinematic fixture. This verifies client cleanup ownership/payload, not actual storage deletion.

- Shared phone focus: `lib/__tests__/page-editor-focus.test.ts` checks stable target recovery after iframe blur/node replacement, duplicate Tryouts labels, detached frames and normal outer triggers. These narrow DOM facades complement the unchanged real browser focus-trap/Escape/Done tests in `public-page-editor-phone.spec.ts`; they do not establish native focus/keyboard acceptance.

- Phone canvas obstruction: the independent Tryouts first-selection case in `public-page-editor-phone.spec.ts` verifies the iframe target's outer-page center stays above the persistent Save strip before the actual click opens tools. This catches outer overlays that iframe-local hit testing misses; existing modal/focus/keyboard assertions remain unchanged.
