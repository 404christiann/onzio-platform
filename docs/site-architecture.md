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
| SITE-05 | Retained release and assignment proof | complete for the local proof scope; SITE-05A through SITE-05L are merged. PR34 merged at `b2acbe4c0f344b614f594ca445dbebbd803b961e`. Prior complete acceptance and two independent approvals cover `116f455`; the added cleanup repair at final head `5c9edf6` passes four cleanup contracts, ten real local SQL cases and nonincremental TypeScript. See [the revision-specific evidence](pilot-site-coordination.md#acceptance-record-and-remaining-hosted-boundary). Hosted dispatch and activation remain unimplemented and require separate authorization. |
| SITE-05A | Local SQL and retained React release rehearsal | complete; merged; 1,814 tests, real SQL races and inspected desktop/mobile retained-rendering proof pass. |
| SITE-05B | Actual pilot source package and reconstruction tool | complete; merged in PR23 at `7247b3b0090dc27adaf11c8f58074815cf0266e8`; correction explicitly pins framework/build roots; four lock-version mismatch regressions pass; 1,824 tests pass; actual 706-file package verifies and reconstructs; source graph, emitted CSS/media and explicit current-platform boundaries. Real reconstructed browser acceptance follows in SITE-05C. |
| SITE-05C | Actual pilot reconstruction acceptance | complete; merged in PR24 at `455c7e6ae4f9592153acf5242d090f5b7d2941d9`; correction guards setup and effective build/start environments; 28 CLI environment checks and 1,856 regressions pass; previously recorded A/B/reconstructed A browsers, 13 editor cases and inspected screenshots pass; fresh Next build, visual mutation and current-platform checks, desktop/mobile public/editor verification. |
| SITE-05D | Versioned homepage editing bindings | complete; merged in PR25 at `b91fbe8e8b83d9596dd455636772b80134cdcf30`; element ownership map drives existing preview selection; semantic identities, 1,948 regressions, 13 production browser cases and inspected desktop/mobile controls pass. Save and incompatible-draft integration remain separate. |
| SITE-05E | Assignment-aware homepage saves | complete; merged in PR26 at `0b6296ad8928f4351108e6917167ba1f0fa8dd6f`; homepage-only opaque token includes private assignment epoch and installed binding identity; real A→B→A, both lock orders, historical receipt replay, tenant and stale-content regressions pass. Uses current legacy published-pointer/latest-document authority. Authored release activation and incompatible drafts remain separate. |
| SITE-05F | Binding-aware homepage draft recovery | complete; merged in PR27 at `45a1b34a79567f3f108bed09ab182444da66eabb`; version 1/2 records, IndexedDB upgrade, receipt-first decisions and explicit compatible apply preserve incompatible work. 2,031 regressions, 36 browser cases, inspected desktop/phone reviews and current-content, exact-retry and recovery-after-undo checks pass. Authored assignment activation remains separate. |
| SITE-05G | Complete dependency-lock compatibility for retained pilot reconstruction | complete; merged in PR28 at `5122ab712cc3998e625b5c494e98dd211d01462f`; v2 complete-lock SHA-256, historical v1 byte verification with reconstruction rejection, and shared pre-output compatibility checks. 61 focused function/CLI cases, 2,049 regressions, 1,211 contracts, 82 architecture and 334 local database checks, TypeScript and lint pass. Files and limits are recorded in HANDOFF.md. Installed runtime, authored assignment and activation remain separate. |
| SITE-05H | Guarded local build provenance and stale-start rejection | complete; merged in PR29 at `26f93a8bd00d073caa52ac32d993babd636adfaf`; strict successful-build receipt, observed source/output inventories, selected public environment, fresh BUILD_ID, effective Next phase-output checks and exclusive child-lifetime lock. 86 focused CLI cases, 2,104 regressions, 1,211 contracts, 137 architecture and 334 local database cases, TypeScript/lint and genuine minimal Next build/start/HTTP controls pass. Files and limits in HANDOFF.md. Full installed-pilot identity, proof-server identity, authored assignment and activation remain separate. |
| SITE-05I | Owned guarded servers for the local reconstruction proof | complete; merged in PR30 at `00b745aee3d6a76fb9fed6876b6c206f9d396157`, including owned IPv4 proxy and asynchronous probe-descendant cleanup. Refreshed POSIX baseline passes 168 focused package/build/environment/proof cases, one existing Windows-only skip, TypeScript and the genuine Chromium transport regression. Files and historical review corrections are recorded in HANDOFF.md. Full Academy reacceptance remains separate. |
| SITE-05J | Accepted reconstruction identity consumed by owned proof | complete; merged in PR32 at `1d93dc35b249bd197db37b7e98910b0a7493faab`. Full accepted-manifest identity is included in the generic build receipt and checked against the external expectation before and after capture. Whole binding, complete lock, baseline bytes and current-platform B safeguards remain. Historical validation is recorded in HANDOFF.md. Actual Academy integration follows in SITE-05K. |
| SITE-05K | Full local Academy acceptance after PR32 | complete; merged in PR33 at `b7fbc9d9d157a443e417278bc8714011b1d5ce1b`; actual A, changed B and retained A over current B use fresh guarded production builds. A demonstrated late response-body observation race is corrected without changing application behavior or weakening proof gates. Six final zero-error captures, 18 inspected screenshots, all 64 serial homepage cases, 2,191 regressions and restored Alpha state pass. Evidence and remaining limits are recorded in [the acceptance record](pilot-academy-acceptance.md). Authored routing, assignment and activation remain separate. |
| SITE-05L | Coordinated local Academy assignment and rollback | complete for the local proof scope; merged in PR34 at `b2acbe4c0f344b614f594ca445dbebbd803b961e`, final head `5c9edf6`. Actual Academy A/B/A acceptance, 18 inspected images, 16 real capability controls and complete suites belong to reviewed `116f455`. The merged preflight cleanup delta separately passes four cleanup contracts, ten local SQL cases and nonincremental TypeScript. See [the coordination guide](pilot-site-coordination.md#acceptance-record-and-remaining-hosted-boundary) and HANDOFF.md for revision-specific evidence, files and limits. No authorized local SITE-05 work remains. SITE-06 and hosted rollout require Christian's direction. |
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

The [coordinated local Academy proof](pilot-site-coordination.md) joins actual
accepted rendering, assignment events, real save authority and finite local
fleet activation. Hosted traffic inventory, production authored dispatch/storage,
deployment/cache coordination and an operator activation endpoint remain
unimplemented and require separately authorized rollout work.

The [pilot source package guide](pilot-source-package.md) describes retained
source reconstruction and its remaining runtime ownership limits.

The [actual pilot reconstruction guide](pilot-reconstruction.md) covers the
three-build mutation proof and current-platform denial check.

The [homepage binding contract](homepage-editing-bindings.md) describes the first
editor integration and its separate save, draft and authorization boundaries.
