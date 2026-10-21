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

The current Academy page still imports shared visual components, fonts and global
styles. These fixtures do not package that actual dependency tree or exercise the
real editor. Both use the current legacy hero binding meaning. A new assignment
is invisible to the existing design-revision SQL. Transaction-visible receipt
replay does not establish committed response-loss behavior across assignments.
Existing homepage regressions cover committed and stale-save behavior separately.

Before activating an authored site, retain its real rendering dependencies and
preview styles. Integrate assignment-aware binding revisions with the current
save/receipt authority and preserve incompatible browser drafts. Prove current
platform authorization, rolling deployment compatibility and activation checks.
SITE-05 stays in progress until those checks pass. Hosted activation is separate.
