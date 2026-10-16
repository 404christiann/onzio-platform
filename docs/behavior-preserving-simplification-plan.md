# Simplify Onzio without changing its behavior

Use this working plan to reduce maintenance cost while preserving the public
sites, admin workflows, tenant isolation, authentication, billing, and stored
data. Start with an audit and a fresh local baseline. Do not treat this planning
PR as an approved rewrite or a completed simplification audit.

## Establish the scope

1. Read `AGENTS.md`, the newest entries in `HANDOFF.md`,
   `docs/onzio-platform-plan.md`, `tests/README.md`, and the relevant contracts.
2. Read the installed pstack `CODEX.md` before applying `poteto-mode`.
   Use Subtract Before You Add and Sequence Work into Verifiable Units.
3. Preserve the existing architecture decisions and contract assertions.
   Record conflicting instructions before implementing a change that depends on
   them. Historical production approvals do not authorize new hosted actions.
4. Use the Ubuntu VM for implementation and synthetic local verification after
   verified access is restored. Keep owner credentials on Windows.

Limit the first implementation package to one behavior-preserving change.
Require evidence of real duplication, dead code, or an unnecessary boundary.
Do not introduce a generic framework merely because two functions look alike.
Do not select a target by line count alone.

## Record the starting state

- [ ] Record the current `origin/main` SHA, task branch SHA, worktree status,
  tool versions, and test commands in the acceptance ledger below.
- [ ] Preserve unrelated local changes. Use an isolated worktree when needed.
- [ ] Confirm that Supabase and provider fixtures are local and synthetic
  without printing environment values or committing authentication state.
- [ ] Export the test environment through the project launcher. Run
  `/home/coder/.local/bin/onzio test`, `onzio test:architecture`,
  `onzio test:contracts`, `onzio test:db`, and `onzio typecheck` serially.
- [ ] Run `npm run lint` and `npm run build` with the project tool paths.
  Keep build and typecheck sequential to avoid generated-file races.
- [ ] Record actual totals, failures, logs, and environment limits. The
  1,813-test result in PR #15 is historical evidence, not this package's run.
- [ ] Reconcile the older intentionally-red framing in `AGENTS.md` and
  `tests/README.md` with the current handoff and observed test results.
  Never skip or weaken a failing contract to produce a green baseline.
- [ ] Capture representative local public pages, login and admin redirects,
  one ordinary editor save/reload, error recovery, and tenant-denial behavior.
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

Initial read-only inspection suggests these areas to investigate. They are
audit leads, not accepted abstractions or confirmed dead code.

- Compare snapshot media hydration in `lib/homepage-editor/server.ts` and
  `lib/shop-editor/server.ts`. Keep each editor's tenant, capability, and
  asset-visibility rules explicit.
- Compare save and receipt transport in `lib/page-editor-save.ts` and
  `lib/about-editor/recovery.ts`. Preserve operation identity, conflict
  handling, response-loss reconciliation, and unsaved state.

- [ ] Inspect each candidate's complete call graph and load-bearing tests.
- [ ] Identify the smallest useful deletion before proposing shared code.
- [ ] Reject candidates whose apparent duplication represents different
  security or recovery policies.
- [ ] Select one bounded candidate and name its exact file boundaries,
  acceptance criteria, expected benefit, and remaining uncertainty.
- [ ] Present the evidence-backed package before starting application edits.

## Implement one verified change

Start this section only after the audit has defined the bounded package and
the user has accepted its scope. Use the pstack Refactoring playbook through
its Codex adaptation. Keep the current model and reasoning settings.

- [ ] Record a clean baseline at the exact implementation base.
- [ ] Preserve all contract assertions. Add a regression test only when an
  uncovered observable behavior needs protection.
- [ ] Make one coherent structural change. Migrate its callers together and
  remove the superseded implementation when equivalence is proven.
- [ ] Run the narrow behavior tests before continuing to another change.
- [ ] Complete the local verification and independent review below.
- [ ] Update this ledger and `HANDOFF.md` with actual evidence and next steps.

Do not change database schemas, migrations, provider integrations, feature
behavior, or product design as incidental cleanup. Any such change requires a
separate scoped decision. Keep RLS, tenant resolution, fresh authorization,
session age, billing entitlement, operation receipts, and audit boundaries.

## Verify behavior and review the result

- [ ] Run the candidate's focused tests, all architecture and contract tests,
  local database tests, the full suite, typecheck, lint, and build.
- [ ] Compare the same local public and admin scenarios at baseline and head.
  Include ordinary saves, reloads, errors, retries, conflicts, and cross-tenant
  denials where the selected package affects them.
- [ ] Check desktop and phone layouts for any affected editor. Preserve
  keyboard focus, modal behavior, and unsaved-change recovery.
- [ ] If the selected change can affect latency, bundle size, or query count,
  name the metric and failure threshold before implementation. Measure the
  same workload on baseline and head. Otherwise record why a performance
  measurement does not apply. Do not invent a speedup.
- [ ] Obtain independent review at the exact head. Resolve findings and rerun
  affected checks after fixes. Record remaining limitations honestly.
- [ ] Confirm that fixtures are restored and that the final diff contains no
  unrelated source changes, credentials, or authentication state.
- [ ] Submit the exact revision for user acceptance. Only the user authorizes
  merging that revision. No auto-merge, protection bypass, deployment, hosted
  mutation, or live provider action is included in this plan.

## Track acceptance and the next action

| Package | Status | Evidence and exact next step |
| --- | --- | --- |
| SIMPLIFY-01 | in_progress | Planning PR opened from the merged VM setup revision. Restore verified VM access, capture a fresh isolated baseline, and complete the ranked audit. |
| SIMPLIFY-02 | not_started | Select one candidate only after SIMPLIFY-01 provides its callers, risk, tests, runtime checks, and rollback. |
| SIMPLIFY-03 | not_started | Implement and independently review the accepted bounded package. Record its head SHA and all required receipts before requesting merge. |

The planning PR changes this document, adds the handoff entry, and disables
automatic Vercel preview deployment only for `agent/simplification-plan`.
It changes no application source, dependency, migration, or test behavior.
Documentation and configuration checks do not establish runtime acceptance.

## Keep the evidence with the package

Record the audited and tested SHAs, commands, results, log paths, local runtime
captures, independent review, fixture restoration, and remaining gaps before
marking any package complete. Keep private local artifacts outside Git.

The next deliverable is the ranked audit and selected implementation package.
This document does not pre-approve a repository-wide rewrite.
