# Club admin, reimagined: first slice and Rose City switch-on — 2026-11-09

Package: `ADMIN-RE-10` in `docs/admin-portal-redesign-plan.md`. The first slice (RE-01 to RE-09, RE-07b #109, RE-07c #110) was already merged and deployed. This release changes no app code (one out-of-date browser test is updated). It checks the merged code, confirms production runs it, and switches Rose City to the new admin. Christian gave the go for the switch in the RE-10 session ("Go, flip Rose City"). Diverse City stays `classic` until his separate go (`GATE-FLIP-DC`), after the Diverse City owner is told.

## Suites on `main`

Tested revision: `origin/main` `c1c3c9c` (#111), in a clean worktree outside the main checkout. `node_modules` was symlinked, and `.env.test` and a loopback-only `.env.local` were copied with the email, media, Stripe and Vercel bypass keys removed. Every run held `scripts/with-local-db-lock.sh`, with `.env.test` exported. Logs are outside Git.

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | PASS |
| Lint | `npm run lint` | PASS |
| Whole suite | `npx vitest run --exclude "tests/database/**"` | 211 of 212 files, 2,678 passed, 1 skipped, 1 failed: `pilot-proof-servers.test.ts` "postcheck rejects an owned listener…" timed out at 14.9 s while another session's suites were loading the machine. It passed in the architecture run right after. |
| Architecture | `npm run test:architecture` | PASS: 14 files, 426 passed, 1 skipped |
| Build | `npm run build` | PASS |
| Database | `npm run test:db` | PASS: 50 files, 1,020 passed. Again after the browser runs and at the end: 1,020/1,020, so nothing was left behind. |
| Browser | `admin-reimagined` | PASS: 39/39 |
| Browser | `admin-loading`, `homepage`, `public-page-editors`, `contact-editor` | PASS: 13/13, 63/63, 37/37, 6/6 |
| Browser | `admin-guided` | 59/63 first. Two (Stats match picker, 200% text loading state) passed on the rerun: flaky under load. `admin-guided-members-release.spec.ts` (390 and 1440) was out of date since RE-18 (`undoUntil` in the remove reply) and RE-02 (the owner's automatic time zone save and its audit row). Fixed in this PR's test file: **63/63**. |
| Browser | `dcfc-403`, `dcfc-304`, `plat-101` | 2, 2 and 1 failed (`plat-101` 7 passed). **Same failures on the pre-RE baseline** `9890eee` (built and run the same way), so not caused by this work: the DCFC specs expect Diverse City's real text on Alpha and a password login (gone since PLAT-101), and `plat-101`'s admin nav scroll check finds the nav exactly as tall as its box (288 = 288). |

Two machine problems on the way, both fixed and neither a code problem. Playwright's Chromium cache (`~/Library/Caches/ms-playwright`) was missing, so the first browser run never launched a browser: reinstalled with `npx playwright install chromium` with Christian's OK, then all runs above. And the colima VM `onzio-local` stopped during the baseline run, under two sessions' load: restarted with `colima start onzio-local`, then the baseline was rerun from the start.

## Production confirmed on `main`

- Vercel production deployment `dpl_9R3GwQMjjZQ3wB2T5r6imE1LmHzP`, READY, built from `main` `c1c3c9cdaeee772a3cf296496e733207c7697fd8` (equals `origin/main`). It serves `rosecityfutbolclub.com` and `diversecityfc.com`. This is also the rollback target if code ever needs to go back. The switch itself needs no deploy.
- `npx -y supabase@2.122.0 migration list --linked` (ref `ioalthwsdrlzrubomrow`, read-only): 60 migrations on both sides, the newest `20261109120000`, none Local-only and none Remote-only. The branch has 60 migration files.

## `GATE-FLIP-RC`

The script ran from Christian's Mac with only the production URL and service-role key in a temporary file under mode 700, which was deleted right after. Nothing was printed but the club row.

Dry run (read-only), `npx tsx scripts/set-club-admin-portal.ts rose-city --portal=reimagined`:

```json
{
  "event": "club.admin_portal_dry_run",
  "club": { "id": "32ceba0b-4e25-52c2-bb6b-d82fb87637a7", "slug": "rose-city", "name": "Rose City Futbol Club", "kind": "demo", "lifecycle": "active" },
  "current": { "adminPortal": "classic", "adminFlags": {}, "timeZone": "America/Los_Angeles", "timeZoneSetAt": "2026-11-08T15:19:31.133905+00:00" },
  "target": { "adminPortal": "reimagined", "adminFlags": {}, "timeZone": "America/Los_Angeles" },
  "needsUpdate": true
}
```

After Christian's go, at 2026-11-09T21:23:06Z, `npx tsx scripts/set-club-admin-portal.ts rose-city --portal=reimagined --execute --confirm-project=ioalthwsdrlzrubomrow` wrote `admin_portal = 'reimagined'` and its `manual.club_admin_portal_set` audit event, then reconciled:

```json
{
  "event": "club.admin_portal_reconciled",
  "settings": { "admin_portal": "reimagined", "admin_flags": {}, "time_zone": "America/Los_Angeles", "time_zone_set_at": "2026-11-08T15:19:31.133905+00:00" }
}
```

Separate read-only readback (the dry run again): `current.adminPortal` `reimagined`, flags `{}`, time zone unchanged, `needsUpdate: false`.

Smoke checks right after: `rosecityfutbolclub.com/admin/login` 200, `diversecityfc.com/` 200, `diversecityfc.com/admin/login` 200, no `UNKNOWN_TENANT` anywhere. `rosecityfutbolclub.com/` returns 404, which is the PR #85 public-site hold, as before.

Only `onzio.clubs.admin_portal` for Rose City and one audit row changed. No migration, deploy, seed, Stripe, DNS, email or environment change.

**Switching back:** `npx tsx scripts/set-club-admin-portal.ts rose-city --portal=classic --execute --confirm-project=ioalthwsdrlzrubomrow`. It takes effect on the next request, with no deploy, and loses no data.

## Notes for the walk-through

- "Saved · on your website" labels are hold-aware (decision 2): while Rose City's public site is held, the new admin says the change is saved but not yet on the website.
- The data lists Rose City as `kind = demo`. That doesn't affect the switch.
- **Christian's first look (2026-11-09):** the home and Edit my website work. On Edit my website he couldn't click the "2024" champions text. That's expected: on Rose City's current (legacy) homepage only the slideshow photos and captions and the video section are editable. The hero and `components/ChampionsBadge.tsx` are fixed in code (`lib/homepage-editor/capabilities.ts`, `heroVariant: "legacy-fixed"`). The 2027 revamp isn't on `main` yet, so the editor shows the old design. **Decision (Christian):** no fix PR for the legacy homepage; editing comes with the revamp (ADMIN-RE-21 and the Rose City 2027 work). Enter a score and Add a game are still to check.
- The first slice is the home and four jobs: Enter a score, Add a game, Sign-ups, Edit my website (homepage). Older pages open from More with a "‹ Home" bar.

## Exact next step

Christian walks Rose City's admin at `https://rosecityfutbolclub.com/admin` on phone and laptop, entering real games and scores and deleting test rows the same day. Each finding becomes an `ADMIN-RE-10x` fix PR. `GATE-FLIP-DC` waits for his separate go and for telling the Diverse City owner.

---

# Guided admin portal production release — 2026-10-12

PR: [#13](https://github.com/404christiann/onzio-platform/pull/13). Christian explicitly approved merge and separately approved the private production backup export and exact pre-existing branding-bucket migration. All pre-merge prerequisites are satisfied; merge and production verification are the next steps.

## Release preparation

- Reviewed runtime source: `c8c960ac64afce3c8ccb2422d00c98cfb1fd93d3`, Next build `26UE0JzwxYguDfsx5RF-E`. Latest complete merge-base review: No findings after fixing both P2 defects. Full189/1791, new browser8, existing Competition2, Standings contracts8, build/sequential TypeScript/lint pass. [Review evidence](admin-portal-pr-review.md).
- Refreshed base: `c10bea3f54442f31e4bdf7e3f68456e6c278de65`. PR source/evidence head `17aebb4` was MERGEABLE/CLEAN with no configured PR checks. Non-mutating merge-tree and branch whitespace pass. The preparation commit contains documentation only; runtime source remains exactly reviewed/tested.
- Vercel: `404christianns-projects`, project `onzio-platform` / `prj_I362ysmh9cse5cRxnL7db4dOhsEs`. READY rollback deployment: `dpl_2VfUXDHYWSef5VfKTqVX3zE68iPr`, production URL `https://onzio-platform-orvy1krh9-404christianns-projects.vercel.app`. The connector scope403 was resolved through the same-target authenticated CLI.
- Supabase: `Onzio Platform Production`, ref `ioalthwsdrlzrubomrow`, ACTIVE_HEALTHY. Latest completed physical backup `1943570699`, `2026-10-12T11:16:53.306Z`; physical backups enabled, PITR disabled.
- Fresh restricted `onzio`/`onzio_private` schema/data exports are saved outside Git at `/private/tmp/onzio-pr13-production-backup`, directory700 and files600. CLI exits successfully, schema/data inventories match all63 tables, and63 COPY sections have63 terminators. SHA-256/size/permission receipt: `verification.json` in that directory. Structural/hash verification and completed provider physical backup are recorded; no production restore was attempted. CLI used its IPv4 pooler fallback after the environment's unavailable direct IPv6 connection. No sensitive dump contents or credentials are published here.
- Initial automatic approval review rejected that local data export because merge approval alone did not explicitly cover the sensitive payload/destination. Christian subsequently approved the specified prerequisites. The approved export completed; the earlier authorization blocker is resolved.
- Isolated temporary CLI link: `/private/tmp/onzio-pr13-release-link`, leaving the original/development database targets unchanged. Dry run identified only `20260925012119_public_email_branding_bucket.sql`; file bytes matched the checked-in migration. Approved push applied only that file, with no seeds. Readback confirms49/49 local/remote migrations match and the existing `onzio-branding` bucket retains identical public=true, PNG-only and1MB settings. Logs: `/private/tmp/onzio-pr13-migration-{dry-run-final,apply}.log`; `/private/tmp/onzio-pr13-production-migrations-after.log`; `/private/tmp/onzio-pr13-branding-after.json`.

## Public and authorization baseline

`/private/tmp/onzio-pr13-public-before.json` records normal TLS-verified reads. Diverse City home/roster/schedule return200. Lions equivalents already return404 before this merge; the cause is unverified and is not attributed to this release. Admin, Season Stats and Standings on both domains redirect to normal login200 without tenant errors. Python's local certificate-store failure was superseded by normal curl TLS verification, without disabling certificate checks.

No authenticated production content mutation, payment/provider action, production seed or new physical-device claim is included. The earlier accepted iPhone/paste/VoiceOver and build-8 gallery retain their original provenance. Original dirty OTP checkout is preserved. Keep rollback deployment and private backup receipts for recovery.

## Exact next step

Publish the documentation-only preparation, refresh/check the exact PR head, merge without altering reviewed runtime source, then verify the matching READY production deployment, public baseline and protected-admin login behavior. Record merge SHA/deployment/result here and in HANDOFF/`GUIDED-PRODUCTION-RELEASE`. Any live authenticated editor mutation needs its own explicit test scope; local persistence evidence remains recorded in the review report.
