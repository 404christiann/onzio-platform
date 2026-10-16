# Simplify Onzio without changing its behavior

Use this working plan to reduce maintenance cost while preserving the public
sites, admin workflows, tenant isolation, authentication, billing, and stored
data. Use the completed source audit and fresh scoped baseline linked below. This
PR covers only the accepted photo-resolution cleanup. Other refactors need
separate scope acceptance.


The [audit and baseline](behavior-preserving-simplification-audit.md) records
the exact source, observed checks, original timeout, passing unchanged rerun,
runtime limits, documentation conflicts, and ranked candidates. The accepted first package extracts only duplicate photo resolution after
protecting Shop behavior. Implementation and local verification are complete;
owner acceptance and merge approval remain pending.

## Establish the scope

1. Read `AGENTS.md`, the newest entries in `HANDOFF.md`,
   `docs/onzio-platform-plan.md`, `tests/README.md`, and the relevant contracts.
2. Read the installed pstack `CODEX.md` before applying `poteto-mode`.
   Use Subtract Before You Add and Sequence Work into Verifiable Units.
3. Preserve the existing architecture decisions and contract assertions.
   Record conflicting instructions before implementing a change that depends on
   them. Historical production approvals do not authorize new hosted actions.
4. Use the Ubuntu VM for implementation and synthetic local verification.
   The `onzio-vm` SSH profile is verified; retain the host-stall risk below. Keep owner credentials on Windows.

Limit the first implementation package to one behavior-preserving change.
Require evidence of real duplication, dead code, or an unnecessary boundary.
Do not introduce a generic framework merely because two functions look alike.
Do not select a target by line count alone.

## Record the starting state

- [x] Record the current `origin/main` SHA, task branch SHA, worktree status,
  tool versions, and test commands in the acceptance ledger below.
- [x] Preserve unrelated local changes. Use an isolated worktree when needed.
- [x] Confirm that Supabase and provider fixtures are local and synthetic
  without printing environment values or committing authentication state.
- [x] Export the test environment through the project launcher. Run
  `/home/coder/.local/bin/onzio test`, `onzio test:architecture`,
  `onzio test:contracts`, `onzio test:db`, and `onzio typecheck` serially.
- [x] Run `npm run lint` and `npm run build` with the project tool paths.
  Keep build and typecheck sequential to avoid generated-file races.
- [x] Record actual totals, failures, logs, and environment limits. The
  1,813-test result in PR #15 is historical evidence, not this package's run.
- [x] Reconcile the older intentionally-red framing in `AGENTS.md` and
  `tests/README.md` with the current handoff and observed test results.
  Never skip or weaken a failing contract to produce a green baseline.
- [x] Capture representative local public pages, login and admin redirects,
  one ordinary editor save/reload, and tenant-denial behavior. Fresh recovery
  browser matrices remain a required implementation-package gate.
  Run browser and database suites serially and restore shared fixtures.

If a starting-state check fails, separate that failure from the proposed
refactor. Stop the implementation package until the cause and scope are clear.

## Audit the code and rank candidates

Trace callers, data shapes, side effects, and relevant behavior tests before
proposing any deletion or extraction. Return a short ranked table with the
following columns.

| Field | Required evidence |
| --- | --- |
| Candidate | Exact files and symbols at the audited SHA. |
| Maintenance problem | A demonstrated duplicate, unused path, or costly indirection. |
| Proposed change | What is removed, merged, or moved and why it is smaller. |
| Behavior to preserve | Observable outputs, errors, ordering, retries, and persistence. |
| Risk | Tenant, session, billing, data, browser, and performance effects. |
| Verification | Named existing tests and local runtime scenarios. |
| Rollback | How to revert the isolated change without data repair. |

The completed read-only audit ranks these areas. Its exact callers and
behavior differences are recorded in the linked audit. Only the photo-resolution package is accepted. The other candidates remain
proposals, not confirmed dead code or accepted abstractions.

- Compare snapshot media hydration in `lib/homepage-editor/server.ts` and
  `lib/shop-editor/server.ts`. Keep each editor's tenant, capability, and
  asset-visibility rules explicit.
- Compare save and receipt transport in `lib/page-editor-save.ts` and
  `lib/about-editor/recovery.ts`. Preserve operation identity, conflict
  handling, response-loss reconciliation, and unsaved state.

- [x] Inspect each candidate's complete call graph and load-bearing tests.
- [x] Identify the smallest useful deletion before proposing shared code.
- [x] Reject candidates whose apparent duplication represents different
  security or recovery policies.
- [x] Select one bounded candidate and name its exact file boundaries,
  acceptance criteria, expected benefit, and remaining uncertainty.
- [x] Present the evidence-backed package before starting application edits.

## Implement one verified change

Start this section only after the audit has defined the bounded package and
the user has accepted its scope. Use the pstack Refactoring playbook through
its Codex adaptation. Keep the current model and reasoning settings.

- [x] Record a clean baseline at the exact implementation base.
- [x] Preserve all contract assertions. Add a regression test only when an
  uncovered observable behavior needs protection.
- [x] Make one coherent structural change. Migrate its callers together and
  remove the superseded implementation when equivalence is proven.
- [x] Run the narrow behavior tests before continuing to another change.
- [x] Complete the local verification and independent review below.
- [x] Update this ledger and `HANDOFF.md` with actual evidence and next steps.

Do not change database schemas, migrations, provider integrations, feature
behavior, or product design as incidental cleanup. Any such change requires a
separate scoped decision. Keep RLS, tenant resolution, fresh authorization,
session age, billing entitlement, operation receipts, and audit boundaries.

## Verify behavior and review the result

- [x] Run the candidate's focused tests, all architecture and contract tests,
  local database tests, the full suite, typecheck, lint, and build.
- [x] Compare the same local public and admin scenarios at baseline and head.
  Include ordinary saves, reloads, errors, retries, conflicts, and cross-tenant
  denials where the selected package affects them.
- [x] Check desktop and phone layouts for any affected editor. Preserve
  keyboard focus, modal behavior, and unsaved-change recovery.
- [x] If the selected change can affect latency, bundle size, or query count,
  name the metric and failure threshold before implementation. Measure the
  same workload on baseline and head. Otherwise record why a performance
  measurement does not apply. Do not invent a speedup.
- [x] Obtain independent review at the exact head. Resolve findings and rerun
  affected checks after fixes. Record remaining limitations honestly.
- [x] Confirm that fixtures are restored and that the final diff contains no
  unrelated source changes, credentials, or authentication state.
- [x] Submit the exact revision for user acceptance. Only the user authorizes
  merging that revision. No auto-merge, protection bypass, deployment, hosted
  mutation, or live provider action is included in this plan.

## Track acceptance and the next action

| Package | Status | Evidence and exact next step |
| --- | --- | --- |
| SIMPLIFY-01 | complete | Source audit and scoped local baseline recorded in the linked audit. Preserve the initial timeout and VM-host-stall risk. |
| SIMPLIFY-02 | complete | The user accepted only the photo-resolution cleanup. Receipt traversal and save transport remain editor-specific. |
| SIMPLIFY-03 | ready_for_review | Shared pure photo resolution, six new behavior cases, full local gates and baseline/head browser comparisons pass. Final revision and independent review are recorded in PR #16. Await the user's acceptance and explicit merge approval. |

PR #16 contains the planning documents, implementation evidence, one shared
photo resolver, the two editor callers, and six added behavior cases. The
branch preview guard remains in place. No dependency or migration changes
are included. See the implementation evidence in the audit for actual checks
and remaining environment limits.

## Keep the evidence with the package

Record the audited and tested SHAs, commands, results, log paths, local runtime
captures, independent review, fixture restoration, and remaining gaps before
marking any package complete. Keep private local artifacts outside Git.

The next step is owner review of the exact published PR revision. Do not merge
until the user explicitly approves that revision in the desktop chat.
This document does not pre-approve a repository-wide rewrite.
