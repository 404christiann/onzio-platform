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
