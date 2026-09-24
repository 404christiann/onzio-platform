# Homepage editor — closeout handoff for Codex

Prepared 2026-09-23 by Claude. Christian wants this taken to `main`.

## Latest release state — 2026-09-23 (Codex)

[PR #5](https://github.com/404christiann/onzio-platform/pull/5) is open. The
production migration gate passed: the already-applied August pathway migration
was recovered into this branch as the exact original file (`e32db49`), and the
September Homepage migration was applied after a one-file dry run, a completed
physical backup check, and fresh restricted logical backups. A second dry run
reports no pending migrations; the linked ledger matches the branch. See
`HANDOFF.md` for backup and schema readback evidence. Christian has put step 3
on hold: **do not merge PR #5 or deploy production**. The historical handoff
below records the pre-release state and is superseded by this section.

## Where it stands

The editor is feature-complete and reviewed. Branch
`codex/homepage-editor-redesign` contains editor commit `b692654` (83 files)
and closeout commits `d05b844` and `ce5c2b1`. At this handoff, nothing had
been pushed.

All HP packages are now `complete` in both ledgers. Christian approved the
visual review on 2026-09-21; real iOS Safari keyboard acceptance passed on
2026-09-22; screen-reader acceptance is **waived** (see below).

Unrelated dirty files are deliberately excluded — leave them alone:
`.gitignore`, `.claude/`, `docs/cv-united-launch-plan.md`,
`lions-font-comparison.html`.

## 1. Resolved: local database test token timing

The 2026-09-23 handoff recorded 3 rotating database failures per run,
`NOT_AUTHORIZED` or RLS errors on tests using fresh local JWTs. Same-commit
passes on 2026-09-22 and the unchanged lockfile argued against a deterministic
product regression or dependency drift. A Colima status check initially
reported `Broken` only because the sandbox could not inspect its socket.
Outside the sandbox, the containers were running and Auth health returned 200.
No restart or reset was used.

Codex reproduced a test-harness timing fault in a rolled-back local
transaction. `homepage-atomic-save.test.ts` begins a transaction, then minted
an AMR timestamp using the Mac clock. PostgreSQL `now()` stays at transaction
start; crossing a one-second boundary made the AMR timestamp one second later
than `now()`, so `is_club_session_fresh()` returned false. The SQL homepage
tests now anchor AMR timestamps to their own transaction start. Other database
tests mint JWTs on the Mac and check them inside the local VM; their shared
helper now signs them one minute in the past, still comfortably within the
30-day freshness contract. Two new tests force both clock cases. Production
SQL, application auth and RLS remain unchanged.

Verification after the fix: focused auth/homepage database tests **43/43**;
`npm run test:db` **241/241** on three consecutive runs; `npm test`
**1537/1537**; `npx tsc --noEmit` and `npm run lint` clean. The original failing
run logs were not retained, so the fix is tied to a reproduced fault and the
reported failure pattern, not a claim that each earlier failure was traced
individually.

This closes the database test blocker. Release verification and the production
migration gate remain separate steps.

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
which production lacked at this handoff (now applied; see latest state above).
`CLAUDE.md` makes this check mandatory, and it
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

- **The old Supabase CLI does not run.** `/usr/local/bin/supabase` is x86_64
  and Rosetta is gone (`bad CPU type in executable`). Homebrew refused
  `brew install supabase/tap/supabase` because Xcode 26.6 is below its required
  27.0. Codex downloaded the Apple Silicon 2.117.0 archive, verified its
  SHA-256 against the tapped formula, and ran the CLI from
  `/private/tmp/onzio-supabase-cli-2.117.0/supabase`. This is temporary and
  may not survive a reboot. `migration list --local` confirms migration
  `20260915180623`; the linked production ledger was unchecked at this handoff
  and has since been verified (see latest state above).
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

Release gate re-run on `ce5c2b1` (2026-09-23): `npx tsc --noEmit`,
`npm run lint`, and `npm run build` passed; contracts **910/910**,
architecture **21/21**, local DB **241/241**, and full suite **1537/1537**.
The freshly built local app passed Homepage browser **34/34**, admin-loading
**12/12**, and site-media **4/4**. `.env.local` was exported for the build and
server; among 143 client chunk files, nine contained the local Supabase URL
and none contained a hosted Supabase URL. The Alpha fixture was confirmed at
its seeded Academy presentation before and after browser checks. These are
local verification results, separate from the earlier real iOS acceptance.

Run `npm run fixture:homepage:restore:local` if a browser run is interrupted;
the specs refuse to run on a leaked fixture and name that command.

## 6. Remaining work, in order

1. Hold the merge while Christian has step 3 paused. PR #5 is open and the
   production migration ledger is current.
2. When Christian resumes step 3, review/merge the PR; the `main` push deploys.
   Verify the resulting deployment and live tenant sites.

The temporary Apple Silicon Supabase CLI is suitable for this gate but may not
survive a reboot. Installing a durable CLI remains environment maintenance.

Christian's outstanding manual item, unrelated to merge: the Alpha fixture's
`hero.intro` still reads "Testing this short paragraph." from his own testing.
