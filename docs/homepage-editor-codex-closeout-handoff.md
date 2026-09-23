# Homepage editor — closeout handoff for Codex

Prepared 2026-09-23 by Claude. Christian wants this taken to `main`.

## Where it stands

The editor is feature-complete and reviewed. Branch
`codex/homepage-editor-redesign` carries one commit, `b692654`, with 83 files
(app, lib, tests, migration, scripts, docs). Nothing is pushed. The branch is
one commit ahead of `74b8145`.

All HP packages are now `complete` in both ledgers. Christian approved the
visual review on 2026-09-21; real iOS Safari keyboard acceptance passed on
2026-09-22; screen-reader acceptance is **waived** (see below).

Uncommitted and deliberately excluded from that commit — leave them alone:
`.gitignore`, `.claude/`, `docs/cv-united-launch-plan.md`,
`lions-font-comparison.html`.

## 1. Blocker: local database suite is flaky after an environment restart

`npm test` is **not** green: 3 of 239 database tests fail per run. This must be
resolved or proven environmental before merging.

What is known:

- The same commit ran **1535/1535** and **239/239** twice on 2026-09-22.
- The failures started after the Mac rebooted, Colima restarted, and
  `npm install` ran. `package-lock.json` is unchanged, so dependencies did not
  move.
- **A different set of 3 tests fails on every run.** Failures roam across
  `tests/database/authenticated-rls.test.ts`,
  `tests/database/homepage-atomic-save.test.ts` and others, including files
  unrelated to the Homepage editor.
- Every failure is `NOT_AUTHORIZED` or `new row violates row-level security
  policy`, and they cluster on tests that mint fresh auth sessions
  ("fresh aal1 owner session", "fresh member session insert").
- Ruled out: dependency drift (lockfile unchanged) and test parallelism
  (`--no-file-parallelism` fails *more*, 6+).

Most likely a local Supabase stack that came back up mid-flight rather than a
product defect, but that is **not proven** — do not assume it. Suggested next
step: bring the stack down and up cleanly (`supabase stop && supabase start`),
re-run `npm run test:db` several times, and only then consider `supabase db
reset`. Per `AGENTS.md`, a reset must not be used to make failures disappear —
diagnose first and record the evidence.

Note the CLI is currently broken on this Mac (see section 4).

## 2. Screen-reader acceptance is waived, not done

Christian's decision, 2026-09-23: do not hold the editor for VoiceOver/TalkBack.
Recorded as an accepted gap in both ledgers. Do not re-open it as a blocker, and
do not record it as passed.

Structure is covered by automated tests (accessible names, focus containment,
focus restoration, polite/assertive live regions, 44pt targets). Spoken wording
and announcement timing are unverified.

iPhone Mirroring cannot be used for this: iOS disables VoiceOver while a
mirroring session is active (confirmed 2026-09-23).

## 3. Mandatory gate before any production deploy

This branch adds migration `supabase/migrations/20260915180623_homepage_atomic_save.sql`,
which production has **not** got. `CLAUDE.md` makes this check mandatory, and it
is exactly the class of mismatch that broke Diverse City FC on 2026-08-14:

```bash
supabase link --project-ref ioalthwsdrlzrubomrow
supabase migration list --linked
supabase db push --linked --dry-run   # read it
supabase db push --linked
supabase migration list --linked      # confirm remote matches the branch
```

Apply the migration **before** deploying the code, then re-confirm. The
tenant-resolution query runs on every request for every club, so a mismatch is
site-wide, not feature-local.

## 4. Environment repairs needed on this Mac

- **Supabase CLI does not run.** `/usr/local/bin/supabase` is an x86_64 binary
  and Rosetta is gone after the macOS upgrade (`bad CPU type in executable`).
  Fix: `brew install supabase/tap/supabase`. This currently blocks the
  mandatory migration gate in section 3 and a clean stack restart in section 1.
- **`npx next` resolves to Next 16**, not the project's 15.5.22, and cannot read
  the build. Use `npm run start` or `./node_modules/.bin/next`.
- **Do not use `pkill -f "next start"`** — Next renames its process to
  `next-server`, so that pattern matches nothing, the old server survives, the
  new one fails to bind silently, and you end up serving a stale build whose JS
  chunks 404/400 and never hydrate. Kill by port:
  `lsof -nP -iTCP:3110 -sTCP:LISTEN -t | xargs -r kill`.
- **`.env.production.local` overrides `.env.local`** for `next build`/`next
  start`, so a plain `npm run build` bakes the *hosted production* Supabase URL
  into the local bundle. Build local with
  `set -a && . ./.env.local && set +a` and verify with
  `grep -rhoE "https://[a-z0-9]+\.supabase\.co" .next/static/chunks/*.js`.
- Playwright browsers needed re-downloading after `npm install`
  (`npx playwright install chromium`).

## 5. Verification to repeat before merge

```bash
npx tsc --noEmit && npm run lint && npm run build
npm run test:contracts && npm run test:architecture
set -a && . ./.env.test && set +a && npm run test:db && npm test
npm run fixture:homepage:restore:local
node scripts/homepage-local-auth.mjs
HOMEPAGE_STORAGE_STATE=/private/tmp/onzio-homepage-tests/local-auth.json \
  npx playwright test --config=playwright.homepage.config.ts
ADMIN_LOADING_STORAGE_STATE=/private/tmp/onzio-homepage-tests/local-auth.json \
  npx playwright test --config=playwright.admin-loading.config.ts
SITE_MEDIA_BASE_URL=http://alpha.localhost:3110 \
  npx playwright test --config=playwright.site-media.config.ts
```

Last known good on this commit (2026-09-23): Homepage browser **34/34**,
admin-loading 12/12, media 4/4, contracts 910/910, architecture 21/21,
tsc/lint/build clean. `npm test` **1532/1535** — the 3 in section 1.

Run `npm run fixture:homepage:restore:local` if a browser run is interrupted;
the specs refuse to run on a leaked fixture and name that command.

## 6. Remaining work, in order

1. Resolve or prove environmental the 3 database failures (section 1).
2. Repair the Supabase CLI (section 4) — needed for step 4.
3. Re-run the full gate list (section 5) and record the evidence.
4. Apply the migration to production, confirm the remote ledger, then deploy
   (section 3).
5. Open the PR and merge to `main`.

Christian's outstanding manual item, unrelated to merge: the Alpha fixture's
`hero.intro` still reads "Testing this short paragraph." from his own testing.
