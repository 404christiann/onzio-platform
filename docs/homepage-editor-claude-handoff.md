# Homepage editor — Claude continuation

Prepared 2026-09-16 at Christian's request. Continue implementation; do not restart
planning or repeat the product interview. No new runtime changes were made during
this handoff. Last test run was 2026-09-15; results below are recorded evidence,
not a claim that tests were rerun today.

## Checkout and reading order

Work directly in `/Users/christianalcala/Downloads/onzio-platform` on existing
branch `codex/homepage-editor-redesign`. The implementation is **uncommitted**,
including important untracked source/migration/test files. Do not switch/reset
branches, clean the tree, overwrite this work or stage everything indiscriminately.

Read `AGENTS.md`, the latest section of `HANDOFF.md`,
`docs/onzio-platform-plan.md`, `tests/README.md`, then the complete scoped plan
`docs/homepage-editor-redesign-plan.md` and relevant tests. The scoped plan
contains approved decisions, component/state architecture, acceptance criteria,
the package ledger, and bounded delegation guidance in section 10.1.

Preserve unrelated dirty `.gitignore`, `.claude/`,
`docs/cv-united-launch-plan.md` and `lions-font-comparison.html`.
No commit, hosted writes, push or deployment has occurred for this redesign.
Do not push/deploy or apply hosted migrations without fresh explicit approval.

## What is implemented

- HP-00–02: approved design/plan, state/capability/save contracts, atomic GET/POST
  `/api/admin/homepage`, and local-only migration
  `20260915180623_homepage_atomic_save.sql`.
- HP-03: actual public components rendered through a same-origin iframe portal;
  live draft overrides, individual piece selection, contextual fields, desktop
  panel, initial mobile sheet/thumb bar, and one atomic Save homepage action.
- Initial HP-04 forms/photo queue/reorder/retry/shared shortcuts are wired but
  their full acceptance coverage and media cleanup are unfinished.

Primary files: `components/admin/homepage/*`, `lib/homepage-editor/*`,
`app/admin/(protected)/homepage/page.tsx`, `app/api/admin/homepage/route.ts`.
Public components use a nullable preview context; outside the editor they retain
public behavior and emit no selection attributes. Keep this boundary intact.

## Work remaining, in order

1. **Finish HP-04:** write failing tests for mixed photo upload success/failure,
   retrying only the failed file, replacement/removal, six-photo limit,
   descriptions and contiguous order. Exercise real local media endpoints.
   Finish reference-safe post-commit cleanup; cleanup failure cannot turn a
   committed homepage save into a failed save. Verify hidden/empty targets and
   shared About/Shop/Programs shortcuts with all three leave choices.
2. **HP-05:** implement IndexedDB draft/file recovery, scoped by origin/user/club,
   expiration/quota handling, refresh/reopen, lost-response reconciliation against
   newer revisions, conflicting edits/design changes and auth transitions.
   Keep the 15 existing recovery contracts intact. Current in-memory retry
   preserves the submitted operation, but is not durable recovery or complete
   conflict handling. Never apply an old receipt over newer content blindly.
3. **HP-06:** mobile/desktop polish, real on-screen keyboard, focus/modal/touch
   targets, no horizontal overflow, light/dark/reduced motion, suitable loading
   skeleton, complete public/preview visual parity including legacy Rose City.
   A reduced-height desktop viewport does not prove a real mobile keyboard.
   Labeled playback preview remains unfinished; editing currently pauses motion.
4. **HP-07:** complete regression/build/type/browser gates and record acceptance
   evidence. Obtain Christian's visual review before treating the redesign as
   release-ready. Update HANDOFF and the package ledger after each milestone.

## Non-negotiable decisions

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

Prototype source paths:
`/Users/christianalcala/Downloads/Homepage Editor - Desktop D5.html` and
`/Users/christianalcala/Downloads/Homepage Editor - Mobile M5.html`.
They were inspected as source. Browser security rejected execution and prohibited
workarounds; Christian explicitly approved proceeding from source. Do not bypass
that restriction or claim prototype interaction was completed. Visual acceptance
is still pending; prototype admin stand-ins are out of scope.

## Local runtime and verification

The owned dev server on 3110 was stopped before the last build. Check port
ownership before restarting. `.env.local` can point to hosted services: explicitly
override **all** Supabase variables with exported `.env.test` values.

```bash
set -a && . ./.env.test && set +a
NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_TEST_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_TEST_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_TEST_SERVICE_ROLE_KEY" ONZIO_ENVIRONMENT=production npm run dev -- --hostname 127.0.0.1 --port 3110
```

`ONZIO_ENVIRONMENT=production` selects the local fixture's domain tag; it does not
authorize hosted operations. Local Supabase is 127.0.0.1:54321, Postgres 54322,
email inbox 54324. If Docker tooling needs it, use
`DOCKER_HOST=unix:///Users/christianalcala/.colima/onzio-local/docker.sock`.

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

Stop the owned dev server before building because it shares `.next`. Build with
the same local Supabase overrides. Do not run the template browser matrix and DB
suite concurrently: both use Alpha. Matrix tests restore its design pointer and
save tests restore hero content; immutable local design documents remain.
Keep auth outside Playwright's cleaned output folders and never commit it.

Last recorded results: **1,515 passing tests, 15 expected recovery failures,
zero skipped; five browser cases pass; TypeScript, lint and build pass**.
The template case checks five templates' hero text/classes/fonts and target
availability; it does not establish whole-page pixel parity or real keyboard use.

Evidence: `test-results/homepage-editor-browser/` screenshots;
`/private/tmp/homepage-hp03-full-results.json`,
`/private/tmp/homepage-hp03-build.log`, `/private/tmp/hp-browser-all.log`.
Temporary evidence may disappear; regenerate when needed. Some local image
fixtures are unavailable, which is not visual acceptance.

**Start by reading the HP-04 upload/controller/media boundary, add a failing
mixed-upload browser test, then implement the missing behavior.** Continue through
the remaining approved packages without asking for another implementation approval.
