# Club site architecture

Status: accepted on 2026-10-20. Implementation proceeds in reviewed PRs.

## Decision

Each club gets code-authored pages, a shell, styles, and content bindings.
The shared platform continues to own tenant resolution, authentication,
authorization, content persistence, media, registrations, and billing.
Reuse components where their behavior fits. Visual differences do not require
reusable theme families or a compatibility matrix.

Site creation remains repeatable through shared services and the same sequence
of design approval, implementation, preview, verification, and activation.
A general block editor is outside this decision. It would introduce another
composition language and authoring product without a demonstrated requirement.

This decision replaces the template-family and semantic-theme choices in the
[Phase 9 plan](phase-9/presentation-system-plan.md). Existing runtime behavior
remains authoritative until each migration package passes its checks. Historical
contracts and evidence do not become false because their architecture is replaced.

## Ownership

A site module owns its implemented pages, navigation metadata, shell, and scoped
styles. Navigation and internal destination choices derive from implemented
routes. Existing Next.js adapters keep dynamic routes explicit.

Each page has a local data model derived from existing loaders and schemas.
Public rendering and editor previews call the same page component and shell.
The preview supplies a validated draft overlay and retains its interaction
isolation. There is no separate preview implementation of the design.

The intended request flow is:

```text
Verified tenant and platform access checks
Published site assignment and installed rendering code
Implemented route and tenant-scoped content
Site shell and page component
```

Content previews use the active assignment with an authorized club session.
Design previews require an explicit prepared release and a fresh operator
session with AAL2. They never select the newest stored document implicitly.

The first extraction may use the existing template selector as an outer legacy
adapter. It must not add selectors to the new page implementation or create new
legacy assignments. Extraction is preparation, not complete site migration.

## Content editing

Authorized club members may maintain valid club content independently of whether
the current design displays every field. Editing bindings guide the normal UI
and identify content that is not shown. They do not grant permissions.

This changes existing template-dependent field and section restrictions.
Implement it one content domain at a time with explicit direct-RPC coverage.
Nonmigrated domains retain their current behavior. SQL continues to validate
content, tenant relationships, session freshness, membership, lifecycle, media
ownership, and trusted internal destinations. Client capabilities are not authority.

Keep content revisions and stale-edit checks. A new binding revision changes
when the meaning or ownership of an edit changes. Preserve exact operation
hashes and actor-scoped receipt replay before applying new design conflicts.
Retain incompatible unsaved drafts for review instead of silently applying them.

## Assignment and rollback

Distinguish published assignment, explicit legacy assignment, missing assignment,
invalid data, unavailable rendering code, and lookup failure. An invalid new
assignment must not silently render another site or a generic fallback.

Retain the active and previous accepted visual release, including rendering
dependencies, styles, assets, and content bindings. Do not prune automatically.
Per-club rollback restores that visual release and its bindings. It does not
undo content, billing state, schema changes, or shared security fixes.

A trusted release boundary checks its installed code. A database transaction
separately enforces tenant ownership, immutable release identity, expected-pointer
comparison, and audit history. SQL cannot inspect a process-local build manifest.
Prove deployment/activation coordination and retained-code compatibility before
adding an active new assignment. A version label or source SHA alone is insufficient.

Do not rewrite historical presentation documents, publication rows, migrations,
or save receipts. Remove compatibility readers only after an actual consumer
inventory proves they are unnecessary. Browser draft expiry does not establish
server receipt expiry. A general operator console is separate product work.

## Performance acceptance

Performance and maintainability are separate outcomes. Theme removal alone does
not establish a speed improvement. The initial local Academy investigation found
root font loading, repeated homepage reads, and a home-kit caller fetching unused
variants. These identify work to measure rather than promised latency savings.

For the pilot, preserve content, layout, typography, loading behavior, tenant
isolation, editor parity, and save recovery. Use local production builds with
identical fixtures, viewports, browser, and network policy. Verify successful
responses and visible content on every sample. Record excluded external media,
failed requests, resource bytes, and browser data reads separately.

Resource gates require unchanged needed content, no new errors, no increase in
font payload, and removal of demonstrated unused kit-variant reads. Timings are
observations until an interleaved comparison and separate profile identify a
repeatable end-to-end difference. Blocked video prevents a production LCP claim.
Critical-content server rendering and site-scoped fonts remain later measured units.

## Delivery and current status

Every package gets independent review at its exact revision. The user handles
review and merging. Hosted activation, deployments, and database operations need
their separate assignments.

| Package | Scope | Status and acceptance |
| --- | --- | --- |
| SITE-01 | This decision and superseded guidance | complete; merged; no application behavior changes. |
| SITE-02 | Reusable local performance checks | complete; merged; 24 production navigations, redirect-chain regression, and expected unused-variant rejection pass. |
| SITE-03 | First homepage extraction | complete; merged; 1,813 regressions, 8 browser tests, public/editor reuse, screenshot parity, and resource gates pass. |
| SITE-04 | Narrow homepage data loading | complete; merged; browser reads 31 to 27, populated screenshot parity, 1,813 regressions and 10 browser tests pass. |
| SITE-05 | Retained release and assignment proof | in_progress; isolated mechanism in SITE-05A. Actual pilot packaging, binding-aware saves and deployment coordination remain. |
| SITE-05A | Local SQL and retained React release rehearsal | complete; merged; 1,814 tests, real SQL races and inspected desktop/mobile retained-rendering proof pass. |
| SITE-05B | Actual pilot source package and reconstruction tool | ready_for_review; PR23 correction explicitly pins framework/build roots; four lock-version mismatch regressions pass; 1,824 tests pass; actual 706-file package verifies and reconstructs; source graph, emitted CSS/media and explicit current-platform boundaries. Real reconstructed browser acceptance follows in SITE-05C. |
| SITE-05C | Actual pilot reconstruction acceptance | pending; fresh Next build, visual mutation and current-platform checks, desktop/mobile public/editor verification. |
| SITE-06 | Content-policy migration | pending; one domain per PR with authorized and denied direct-RPC cases. |
| SITE-07 | Complete pilot and remaining sites | pending; full local acceptance before each separately authorized activation. |
| SITE-08 | Retire active theme machinery | pending; all active/rollback assignments migrated and historical consumers inventoried. |

The initial pilot is the Academy homepage implementation, exercised with synthetic
Alpha fixtures. Its existing sections already have shared public/editor callers,
and its home-kit loader has a measurable bounded optimization. This choice does
not assert anything about current hosted club assignments.

Final removal requires no active template-based rendering or fresh-save policy,
no duplicated preview design, and no unresolved legacy receipt consumer. Original
migrations and immutable history remain. Keep the ledger current with the tested
revision, actual results, remaining limits, and exact next action in each PR.

The [local assignment proof](site-assignment-proof.md) uses independent synthetic
React releases. It does not package the Academy dependency tree, migrate current
routing, or establish new binding-aware save authorization.

The [pilot source package guide](pilot-source-package.md) describes retained
source reconstruction and its remaining runtime ownership limits.
