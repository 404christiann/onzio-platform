# Academy acceptance after PR32

Status: SITE-05K ready_for_review. SITE-05 remains in_progress. Christian alone reviews,
merges and deploys.

## Scope

This run starts from verified PR32 merge `1d93dc35b249bd197db37b7e98910b0a7493faab`. It
runs the actual Academy application with synthetic Alpha on loopback Supabase. It does
not substitute a minimal application for acceptance.

The accepted 706-file v2 package has digest
`e52eabfac98ff890f17d063aee3df18c31bfe57040a946094b8f5576e858bd59` and source commit
`8495f7fb0ef82f58dd053d27f218c719e475c659`. Its retained inputs, whole binding and
complete lock remain unchanged by the proof-runner correction at
`7bff31f185945e1d64d62b6f1881796671d7b155`. Preparation uses that corrected current
platform to create changed B and restored A.

Runtime A remains frozen at that revision in
`/home/coder/projects/onzio-academy-local-acceptance`. Documentation and PR work use
`/home/coder/projects/onzio-academy-local-acceptance-pr` so the guarded baseline receipt
stays reproducible.

## Demonstrated correction

The first proof report said PASS while its baseline capture contained a resource-body
error added during context shutdown. `Promise.all(pending)` observed only the current
queue, and the report retained arrays that could still change. That report is
superseded.

`scripts/pilot-proof-page.ts` now owns page observation through its final boundary. It
waits for network idle, stops new response callbacks, drains async body reads through
Playwright's awaited listener removal, closes the context with diagnostics active,
checks final errors and returns copied collections. The proof also waits for editor
fonts before measuring preview typography. Existing retained-byte, screenshot, identity,
denial, network and process checks remain.

Two real Chromium regressions exercise delayed successful and truncated CSS bodies. Both
fail with the original collector moved unchanged under the test boundary and pass with
the correction. The existing owned IPv4 transport regression also passes.

## Local environment

The application keeps its original Google font declarations. A private build hook
replays all 25 genuine prepared font files and original CSS declarations through Next
15.5.22's existing font-response hook. An independent review verifies file hashes, every
family and unicode range, five latin preloads, and real loader output. This controlled
local environment does not establish offline production font support.

A Node TCP hook permits local build traffic and validates loopback resolution. Chromium
regression runs allow local tenant hosts and synthetic Supabase while external DNS is
denied. The owned proof keeps its existing stricter IPv4 proxy and read-only request
guard. These are local runtime controls, not a sandbox for hostile code. Private
authentication and environment files remain outside committed evidence.

`.env.test` exports the staging label. Actual application acceptance explicitly selects
`ONZIO_ENVIRONMENT=production`, which matches the synthetic Alpha domain records. All
database URLs remain loopback. Earlier staging-label builds and the first browser DNS
configuration, which accidentally denied `127.0.0.1`, are discarded with their failures
recorded. Alpha content and seeded pointers were unchanged after that browser attempt.

## Evidence

Final acceptance passes. Three fresh guarded Next 15.5.22 production builds and their
nonincremental TypeScript checks pass at runtime revision
`7bff31f185945e1d64d62b6f1881796671d7b155`. The final actual CLI report is
`owned-proof/report.json` in the evidence directory below. All six captures have zero
final page, console, network and body errors. All 18 desktop/mobile public, kit and
editor screenshots were opened and inspected. Both restored kit PNGs match baseline
exactly. Public/editor typography, CSS, fonts, ordered images, late retained font,
keyboard/draft/Escape interaction and current-platform denial pass. The metadata-only
accepted-package negative control rejects before capture.

All 64 existing homepage cases pass serially against restored A. They comprise 4 save
cases, 3 assignment cases, 14 binding-recovery cases, 2 draft-recovery cases, 5
recovery-hardening cases, 2 template-parity cases, 2 populated-kit cases, 6 photo cases
and 26 accessibility cases. The interrupted accessibility file was rerun in full, and
only its completed run counts. After the browser and database checks, the existing local
restore helper clears the notification test's known `Hover pause` marker. Final Alpha
content, slug and seeded draft/published pointers exactly match the starting snapshot.
All three guarded receipts still verify after the browser run.

Required validation passes:

| Check | Result |
| --- | --- |
| Complete Vitest suite | 2,191 passed across 203 files, one pre-existing Windows-only skip |
| Contracts | 1,211 passed across 111 files |
| Architecture | 224 passed across 8 files, the same Windows-only skip |
| Local database | 334 passed across 35 files |
| Guarded Chromium transport and new capture regressions | 3 passed |
| Nonincremental TypeScript, lint, whitespace and changed-guide relative links | passed |

The raw database-types generation check was not run. Its historical PR26 mismatch is
unchanged.

Durable local evidence is under
`/home/coder/.codex/visualizations/2026/10/22/onzio-academy-local-acceptance`.
`README.md` identifies rerunnable commands and frozen roots.
`production-input-parity.json` verifies 598 identical application inputs between the
frozen runtime and PR worktrees. The directory also contains the accepted package, font
material, decision trail, preliminary failures, fresh build logs, final proof, browser
logs/screenshots and the final exact-revision reviews. The PR handoff records the
submitted SHA and advisory review verdicts. Private auth and environment files are
excluded, and raw browser traces remain private.

## Remaining limits and next boundary

This establishes only the local behavior actually covered by the final evidence.
Installed dependency bytes, native ABI, arbitrary current-platform compatibility, signed
history and continuous immutability are not attested. External media is blocked, so
there is no latency or LCP claim. Chromium mobile dimensions do not prove native
software-keyboard or screen-reader behavior.

Assignment-aware saves, receipt-first replay and binding-aware recovery already exist.
Authored routing, assignment reads, storage/write authority, activation and deployed
coordination remain separate future units requiring their own scope. No new assignment
is activated here.
