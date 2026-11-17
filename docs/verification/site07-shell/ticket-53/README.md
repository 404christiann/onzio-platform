# SITE-07 #53 local full-site proof

This record describes the local A/B/rollback acceptance run on 2026-11-02. Issue #53 remains `in_progress` until exact-head verification and independent final-head review are recorded. It does not establish hosted routing or production release.

## Frozen inputs and receipts

- Integrated source base: `589f80192b3cfb1b979c239a14976ec769581901`. The accepted source packages and three reconstruction builds were frozen before the browser run.
- Accepted package A: `a490dd00164e0fa64ef6ef956d76d94ff09a19db44fb94dbe04fbdfeeaba96e2`.
- Accepted package B: `d0666231ff01e269777d354929c168ae2261f043880d8e6b0e6ab8ccfc5516a8`.
- Three real recovery SQL cases pass under the shared local database lock with loopback-only credentials and `work_mem=64MB`: `/private/tmp/onzio53-sql-png-logo.log` and its `.exit` receipt (`0`). Earlier default-memory timeouts and their verified recovery are retained in `HANDOFF.md`.
- Complete browser proof: `/private/tmp/onzio53-browser-stable-kit.log` and its `.exit` receipt (`0`). The full report is `test-results/pilot-site-coordination-bsqp6R/report.json`, SHA-256 `87a2640e39fe14c4f08582d66140d041080f666c6f340b0482d6411e59538bf8`. Its source directory contains 188 PNGs. The local run used `work_mem=64MB` and `statement_timeout=120s` for the disposable proof connection.
- The owned fixture journal `/private/tmp/onzio-academy-proof-G2nzrB/recovery.json` ended `verified-clean`. No database reset, hosted query, deploy, or provider write was performed.

## Browser result

The report verdict is `PASS`. It contains A, B, and rollback-A at desktop 1440 and phone 390. Each of the six captures includes all 28 required public routes and mounted previews, plus the homepage, kit, and editor captures. Twelve coordination controls pass. The two invalid-assignment screenshots show the guard's actual 503 response with no alternate site or release. The report has zero route errors and zero page, response-body, network, or console errors in every capture. Five blocked resources are the three local Vercel Insights scripts and two external Bunny media requests.

Every unchanged document's rollback PNG is byte-identical to A, as recorded in [manifest.json](manifest.json). The homepage and its mounted preview deliberately retain the newer B-era content after rollback; their A fonts, styles, and assets restore while their content changes. Six selected PNGs are included here for direct inspection: desktop and phone Home Kit A/rollback, plus both invalid-assignment responses. The full report and remaining PNGs are in the local test-results directory above.

The proof uses a synthetic owned club and finite loopback document admission. The first `/staff` navigation checks its final 200 and exact `/roster#staff` URL; a fresh direct load of that destination receives the full response-body, page, console and resource checks. Transient errors on the first redirect navigation are not separately observed. Independent review classified this as a minor coverage gap.

Other diagnostic reruns exposed occasional Chromium image raster differences of a few color levels and blank image paints despite decoded source elements. The passing receipt above is one complete exact run; it is not a claim that repeated screenshot captures are deterministic. Failed attempts and their verified cleanup remain in the local logs. The proof does not exercise hosted traffic, external video playback, provider transport, a full-site binding-version transition, or a native device. Hosted traffic inventory/admission, deployment/cache coordination, production authored dispatch/storage, and an operator activation endpoint remain separate work. Issue #54 retains Christian's go/no-go decision.
