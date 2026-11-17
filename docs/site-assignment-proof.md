# Local site assignment and rollback proof

This is the first SITE-05 unit. It rehearses assignment rules without changing
current club routing or installing a production schema.

## Run the proof

Start the local database with `onzio db-start`. Use the Onzio launcher so Node,
local test values and the installed Chromium are available.

```bash
/home/coder/.local/bin/onzio shell
set -a
. ./.env.test
set +a
npx vitest run tests/database/site-assignment-proof.test.ts tests/database/homepage-atomic-save.test.ts tests/database/homepage-concurrent-save.test.ts
npx tsx scripts/prove-site-assignment-local.ts
```

The runner prints a new ignored `test-results/site-assignment-*/report.json` path.
The directory contains retained fixture files and desktop/mobile screenshots.
A successful report has `verdict: PASS` only after the browser, local server,
connections and proof schema close and fixture preservation checks pass.
A failed check exits with an error. Do not reset the database to hide a failure.

## What it checks

Three tables in a unique unexposed schema store immutable releases, immutable
assignment events and a current event pointer. Composite foreign keys reject
cross-club targets. Publication and rollback append new event IDs, so returning
to the same release cannot revive an old concurrency token. The transition uses
the existing homepage advisory lock before taking row locks. Execution is limited
to the local service publisher role; ordinary anonymous and authenticated roles
cannot change assignments. This does not prove a production operator endpoint.

The resolver separates published, explicit exact legacy, missing, invalid,
unavailable and lookup-failed results. An installed fixture is not automatically
published. Invalid/missing code never selects another available release.

Two small React fixture releases each retain a page, private binding module,
stylesheet and raster badge. Their manifest hashes include relative filenames
and bytes. Fixtures reject symlinks, undeclared static imports, dynamic imports
and external CSS dependencies. React and ReactDOM remain the shared platform
runtime. Each render runs in a fresh Node process. Browser checks exercise both
releases and rollback at desktop and phone widths, a draft overlay through the
same renderer, late old-release asset requests, loaded images, computed styles,
keyboard navigation, width bounds and browser errors. Removing a required asset after publication
produces an unavailable response. Rollback preparation rejects missing assets.

Real Alpha homepage saves remain inside rollback-only transactions. The proof
observes actual PostgreSQL contention in both save/assignment lock orders and
checks exact actor receipt replay and operation reuse rejection. It compares
Alpha/Bravo hero content, presentation pointers and receipt rows before and after.
It does not delete or rewrite existing receipts.

## What remains

This earlier fixture proof does not package the Academy dependency tree or
exercise its real editor. Its assignment events remain invisible to the existing
design-revision SQL. Transaction-visible receipt replay here does not establish
committed response-loss behavior across assignments.

The later [coordinated local Academy proof](pilot-site-coordination.md) joins
actual accepted rendering, full-document isolation, authored events, a finite
local fleet and exact immutable legacy projections. The unmodified epoch and
save RPC then enforce real stale-token denial and committed receipt replay across
A/B/A. Prior SITE-05E, SITE-05F and SITE-05K acceptance covers binding-aware saves
and recovery of incompatible drafts.

Hosted traffic inventory/admission, production authored dispatch/storage,
deployment/cache coordination and an operator activation endpoint remain
unimplemented. Those adapters need implementation and acceptance before any
separately authorized hosted activation.
