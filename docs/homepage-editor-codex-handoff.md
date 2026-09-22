# Homepage editor — Codex continuation

Prepared 2026-09-17 at Christian's request, after Claude completed HP-04 and
HP-05 in the same local session. Continue implementation; do not restart
planning or repeat the product interview. No commit, hosted write, push or
deploy has occurred for this redesign at any point.

## Checkout and reading order

Work directly in `/Users/christianalcala/Downloads/onzio-platform` on existing
branch `codex/homepage-editor-redesign`. The implementation is **uncommitted**,
including important untracked source/migration/test files. Do not switch/reset
branches, clean the tree, overwrite this work, or stage everything indiscriminately.

Read `AGENTS.md`, the latest section of `HANDOFF.md` (there are now two
recent sections at the top: "HP-05 IndexedDB draft recovery" and "HP-04
reference-safe media cleanup", both from this Claude session — read both),
`docs/onzio-platform-plan.md`, `tests/README.md`, then the complete scoped
plan `docs/homepage-editor-redesign-plan.md` (read to the end — it has two new
checkpoint sections, "HP-04 checkpoint" and "HP-05 checkpoint", both dated
2026-09-16) and the relevant tests. The scoped plan contains approved
decisions, component/state architecture, acceptance criteria, the package
ledger, and bounded delegation guidance in section 10.1 (that section was
written for delegating to GPT-5.6-Luna specifically; if you are Codex acting
as lead, treat "the lead" as yourself and use your own judgment on
delegation, but keep its review discipline — don't let any assistant be both
sole author and sole judge of its own work).

Preserve unrelated dirty `.gitignore`, `.claude/`,
`docs/cv-united-launch-plan.md` and `lions-font-comparison.html`.
Do not push/deploy or apply hosted migrations without fresh explicit approval.

## What is implemented and verified (HP-00 through HP-05, all complete)

- **HP-00–03**: approved design/plan, state/capability/save contracts, atomic
  GET/POST `/api/admin/homepage`, local-only migration, real public-component
  preview integration in an iframe, live draft overrides, selection, panel/sheet,
  atomic Save.
- **HP-04 (this session)**: found and fixed the one real gap — `save_homepage`
  deleted orphaned `homepage_slideshow_photos` rows but never retired the
  underlying `media_assets` row or storage object, leaking every removed/
  replaced photo's file forever. Fixed in the migration (now returns
  `retiredMediaAssetIds`) and `app/api/admin/homepage/route.ts` (retires them
  post-commit via the existing `retirePublishedMedia`, never failing a
  committed save if cleanup fails). New tests: 4 DB cases, 2 route contract
  cases, and a new browser spec `tests/browser/homepage-editor-photos.spec.ts`
  covering mixed photo upload success/failure with retry, the six-photo
  limit, reorder/removal, a real save, the shared About shortcut's three
  leave choices, and a hidden section shown again.
- **HP-05 (this session)**: implemented durable IndexedDB draft recovery.
  `lib/homepage-editor/recovery.ts` (`resolveHomepageRecovery`, a pure
  decision function — validates identity/timestamp/revision, reconciles an
  in-flight submitted operation against a changed revision before treating it
  as a conflict, otherwise restores/conflicts/ignores) turned all 15
  previously-red contract tests green. `lib/homepage-editor/recovery-storage.ts`
  is the actual IndexedDB adapter (best-effort, swallows all storage
  failures). Wired into `useHomepageEditor.ts` (debounced write on edit,
  restore on load, clear on save success or explicit "Leave without saving")
  and a dismissible notice in `HomepageEditor.tsx`. New browser spec:
  `tests/browser/homepage-editor-recovery.spec.ts` (2 cases).

Primary files: `components/admin/homepage/*`, `lib/homepage-editor/*`,
`app/admin/(protected)/homepage/page.tsx`, `app/api/admin/homepage/route.ts`,
`supabase/migrations/20260915180623_homepage_atomic_save.sql`.
Public components use a nullable preview context; outside the editor they retain
public behavior and emit no selection attributes. Keep this boundary intact.
AdminShell, protected layout/theme, middleware and the admin route manifest
have no diff from before this redesign started — preserve that.

**Verified this session, for real, against the actual local stack** (not
just written): `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean;
full `npm test` **1,535 passed, 0 failed, 0 skipped** — every previously-red
contract, including all 15 HP-05 recovery cases, is now green, for the first
time in this project's history; the homepage Playwright suite is **10/10**
across all six spec files. Do not take this as a static claim — rerun it
yourself before building further (see "Local runtime and verification" below);
the exact commands are given there.

## Work remaining, in order

1. **Small optional HP-04/05 hardening** (not blockers, skip if HP-06 is the
   priority):
   - Shared Shop/Programs shortcuts use the same generic three-choice dialog
     mechanism already proven for About, but aren't individually exercised by
     a test.
   - No dedicated browser test for the HP-05 lost-response **reconcile** path
     end-to-end (inject a response loss right after a real commit, reload,
     confirm no duplicate write and no stale notice) — the pure decision
     function is contract-tested and correct, just not exercised through the
     real hook yet.
   - No dedicated two-tab/two-user browser test for recovery (identity/
     revision isolation is proven at the decision layer via contract tests
     only).
   - No user-visible warning when IndexedDB is unavailable or full — it
     silently degrades to a non-durable in-memory editor, which matches the
     plan's "best-effort" wording but isn't explicitly surfaced to the admin.

2. **HP-06 — responsive/keyboard/accessibility polish** (not started):
   - Real on-screen keyboard behavior on iOS Safari / Android Chrome. A
     reduced-height desktop viewport emulation is explicitly **not**
     acceptable evidence for this per the plan — it must be a real device or
     simulator walkthrough (focus each field type, scroll to the last photo
     description, reach Done/Save, dismiss keyboard, rotate).
   - Focus/modal/touch-target correctness, 44px minimum hit areas.
   - Light/dark theme and reduced-motion support for the editor itself (the
     public preview keeps its own theme).
   - Full public/preview visual parity across all templates, **including
     legacy Rose City** (not yet covered by any evidence in this project).
   - Loading skeleton polish.
   - A labeled "playback preview" mode — currently editing just pauses
     motion/video entirely; there is no distinct preview-with-motion state.

3. **HP-07 — final acceptance gates** (in_progress, mostly bookkeeping until
   HP-06 lands):
   - Full regression/build/type/browser gate rerun after HP-06.
   - Christian's own visual review before treating the redesign as
     release-ready — no prior agent, including this session, has obtained that.
   - No production release implied until then; no hosted migration has been
     applied anywhere.

## Non-negotiable decisions (unchanged, restated because they're easy to erode)

- Do not change AdminShell, sidebar, rail, top bar, admin routing or navigation.
- The page is the main editing surface; select individual pieces and show only
  relevant tools. Keep exact approved labels and persistent field labels.
- Match the actual club design and website. Unavailable sections are absent,
  never locked/upgradeable. Shared About content stays faithful with Edit in About.
- One all-or-nothing Save homepage, no autosave/per-section save/publish step.
  Per-section dirty status; preserve entered work on save/upload failure.
- Maximum six photos, descriptions, explicit ordering, Move up/Move down.
  Video source stays Onzio-managed. Preserve all existing fields/length limits.
- Dirty shortcuts offer Save and continue / Keep editing / Leave without saving.
- No undo/redo or Club admin/Onzio setup modes, no sample Northgate copy.
- Raw Story baseline remains separate from displayed defaults; merely opening a
  field must not dirty it. Intentional blank inputs retain public fallback behavior.
- Business conflicts use SQLSTATE PT409, not 40001 (PostgREST retries the latter).
- Recovery is local-only, best-effort, 7-day retention; it is not version
  history and must not be advertised as guaranteed persistence.

## Local runtime and verification

**Docker now works natively on this machine** (fixed this session — was
previously broken: x86_64 colima/lima running under Rosetta with no reachable
VM). Native arm64 Homebrew is installed at `/opt/homebrew`, with arm64
`colima`/`lima`/`docker` reinstalled from it. The `onzio-local` colima
profile's VM is unaffected (it was already `arch: aarch64`) and is normally
already running — check before assuming you need to start anything:

```bash
export PATH="/opt/homebrew/bin:$PATH"
docker context use colima-onzio-local
supabase status
```

If it's not running: `colima start --profile onzio-local`, then
`supabase start --exclude vector` from the project root (the `vector` log
sidecar cannot start under this colima/virtiofs setup — this is pre-existing,
unrelated to the redesign, and not needed for any test here).

**If local sign-in emails come back as a generic "Your sign-in link" with no
visible code** (breaks `scripts/homepage-local-auth.mjs` and any real login
flow), that's stale virtiofs mount state from an old container session, not a
config problem — `config.toml`'s custom OTP template is already correct. Fix:
`colima stop --profile onzio-local && colima start --profile onzio-local`,
then `supabase start --exclude vector` again (a plain `supabase stop`/`start`
is not enough; it only restarts containers without clearing the stale mount).
Verify before trusting it:
`docker exec supabase_kong_onzio-platform-contracts cat /home/kong/templates/email/magic_link.html`
should print real HTML, not an "Operation not permitted" error.

There is also a rare (~few percent per check), pre-existing, unrelated-to-this-
plan timing flake in the test suite's shared `actor()` helper across many DB
test files: it builds JWT freshness timestamps at whole-second precision
compared against Postgres's sub-millisecond `now()`, so it occasionally fails
a random unrelated test. If `npm test` shows exactly one extra failure beyond
the expected count, rerun once before assuming something is actually broken.
Not fixed this session — it's shared infrastructure well outside this plan's
scope.

```bash
set -a && . ./.env.test && set +a
NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_TEST_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_TEST_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_TEST_SERVICE_ROLE_KEY" ONZIO_ENVIRONMENT=production npm run dev -- --hostname 127.0.0.1 --port 3110
```

`ONZIO_ENVIRONMENT=production` selects the local fixture's domain tag; it does
not authorize hosted operations. Local Supabase is 127.0.0.1:54321, Postgres
54322, email inbox (Mailpit) 54324.

In another terminal with `.env.test` exported:

```bash
node scripts/homepage-local-auth.mjs
HOMEPAGE_STORAGE_STATE=/private/tmp/onzio-homepage-tests/local-auth.json npx playwright test --config=playwright.homepage.config.ts
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm run test:db
npm test
```

Stop the owned dev server before building because it shares `.next`. Build
with the same local Supabase overrides. Do not run the template browser
matrix (`homepage-editor-templates.spec.ts`) and the DB suite concurrently:
both use Alpha. The matrix and the new recovery/photos specs all restore
Alpha's design pointer and content in `finally` blocks — **if you do any
manual DB poking of your own for debugging** (e.g. switching Alpha's
published template by hand to reproduce something), restore it the same way
before moving on, or run `supabase db reset` afterward. Failing to do this
broke four unrelated already-passing tests once this session; it's an easy
trap. Keep auth outside Playwright's cleaned output folders and never commit it.

Evidence from this session: full `npm test` 1,535/1,535; homepage Playwright
suite 10/10 (`homepage-editor.spec.ts`, `homepage-editor-templates.spec.ts`,
`homepage-editor-photos.spec.ts`, `homepage-editor-recovery.spec.ts`).
Regenerate before trusting old numbers — this is a snapshot, not a promise.

**Start with HP-06's real on-screen keyboard evidence and visual parity
work**, or pick up the small optional HP-04/05 hardening items first if you'd
rather close those out completely before moving on. Either is a reasonable
next step; use your judgment and record your choice and reasoning in
`HANDOFF.md` and the plan ledger when you start, per `AGENTS.md`'s
documentation rules. Continue through the remaining approved packages without
asking for another implementation approval — only stop for Christian's
required visual review at HP-07, or if you hit something that contradicts an
approved decision above.
