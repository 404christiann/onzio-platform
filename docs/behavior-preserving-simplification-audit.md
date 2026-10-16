# Onzio simplification audit and baseline

Audit application source at `59a9a7ad8ee92f77ab37d541ad7dd3141c0c93dd`.
This revision contains the initial PR #16 planning document and no application
change. PR #15 merged as `1a07dd70531633a473274e4e3959864774fd6a24`.

## Use the observed baseline

The baseline runs on Ubuntu 24.04.5 LTS with Node 24.22.0, npm 11.19.1,
Supabase CLI 2.121.0, and the existing installed lockfile dependencies.
The test runner reports Vitest 4.1.10. No dependency installation or upgrade
was part of this audit.

The VM checkout was clean before and after all checks. `.env.local` and
`.env.test` were mode 600, their database URLs were loopback-only, and the
checkout had no hosted Supabase project linkage. Environment values and browser
authentication state remain private in the VM.

Run shared-fixture suites serially. The exact run order and outcomes were as
follows. Counts in separate suites overlap the full suite.

| Check | Command | Observed result |
| --- | --- | --- |
| Initial full suite | `onzio test` | 1,812 passed and one 15-second timeout across 192 files. |
| Architecture | `onzio test:architecture` | 21 passed across three files. |
| Contracts | `onzio test:contracts` | 1,059 passed across 109 files. |
| Local database | `onzio test:db` | 311 passed across 31 files. |
| Legacy | `onzio test:legacy` | 422 passed across 49 files. |
| Lint | `npm run lint` | Passed with no lint warnings or errors. The command emits its existing Next lint deprecation notice. |
| Production build | `npm run build` | Passed. |
| Typecheck after build | `onzio typecheck` | Passed. |
| Focused timeout check | `npx vitest run tests/database/owner-admin-membership.test.ts` with the local test environment exported | Three passed. |
| One unchanged full rerun | `onzio test` | 1,813 passed across 192 files. |

Preserve the first failed run. Its failure was
`deletes a just-created identity when the membership write fails` in
`tests/database/owner-admin-membership.test.ts`. The same source passed both
the focused check and the complete rerun. No assertion, timeout, application
file, or database migration was changed to obtain the passing result.

VirtualBox logged whole-guest heartbeat gaps and timer catch-up delays during
the broader session. An environment stall is a plausible cause of the timeout,
but the test logs alone do not prove that causal link. Do not classify a future
timeout as infrastructure without checking it.

## Verify the real local application

A separate production-mode Next server used the successful build on
`127.0.0.1:3112`, with the synthetic `alpha.localhost` tenant. The existing
development server on port 3110 and unrelated project services were preserved.
Browser checks started after all database and full-suite runs completed.
The temporary production server was stopped after verification. The existing
port 3110 listener remained running.

| Scenario | Observed result |
| --- | --- |
| Public homepage | HTTP 200, Alpha FC. |
| Login page | HTTP 200. |
| Unauthenticated admin navigation | Redirected to the normal login page. |
| Unauthenticated valid admin-data POST | HTTP 401. |
| Unknown tenant hostname | HTTP 404. |
| Real local email-code owner login | Passed against the local Auth inbox. |
| Authenticated owner dashboard | HTTP 200 at `/admin`. |
| Player edit, save, and reload at 390 pixels | Passed through the real API and database boundary. |
| Player edit, save, and reload at 1,440 pixels | Passed through the real API and database boundary. |
| Player fixture restoration | Both existing persistence tests asserted exact restoration in their cleanup. |
| Smoke-page JavaScript errors | None observed. |

The persistence command was
`npx playwright test --config=playwright.admin-guided.config.ts tests/browser/admin-guided-persistence.spec.ts --grep 'player edit saves through'`.
It used `ADMIN_GUIDED_BASE_URL=http://alpha.localhost:3112` and a private
`ADMIN_GUIDED_STORAGE_STATE`. Both tests passed with one worker.

The smoke probe blocked external video-CDN requests. It does not establish
video-provider availability or complete media rendering. Existing unit and
database recovery contracts passed, but the full Homepage and Shop recovery
browser matrices were not rerun. Native-device keyboard, safe-area, and
screen-reader acceptance were not tested. These limits remain explicit gates
for any affected implementation package.

Receipts and captures remain at
`/home/coder/.local/state/onzio/pr16-baseline`. The directory contains original
and rerun logs, command exit codes, exact tested SHA, runtime JSON, and local
screenshots. Do not commit its authentication state or environment files.

## Keep the SSH findings separate from application defects

The VM host is DESKTOP-A4MOHDD on Windows 10. VirtualBox NAT forwards only
`127.0.0.1:2222` to the guest SSH service. The existing ED25519 host key matched
the known fingerprint. Both `ssh.service` and `systemd-logind.service` were
active. No daemon restart, VM reboot, firewall broadening, key replacement,
or credential transfer was required for the verified connection.

A scoped Windows SSH alias named `onzio-vm` now selects the existing coder
identity, IPv4 loopback, strict host-key checks, bounded connection attempts,
and keepalives. Agent forwarding is disabled. Five consecutive fresh sessions
passed, followed by an exact 262,144-byte transfer check. An interactive session
also remained usable while the baseline ran.

This restores a verified working access path, not proof that the host can no
longer stall. `VBox.log` records fallback to NEM because direct VT-x was
unavailable and confirms the Windows hypervisor was present. It also records
guest heartbeat gaps of tens of seconds to several minutes. That is evidence
of whole-guest stalls rather than an SSH host-key or authorization failure.
The underlying virtualization cause remains unproven. No host hypervisor,
Windows security setting, global power plan, or other project was changed.
Keep this environment risk open and recheck it if SSH or time-sensitive tests
stall again.

## Rank source-backed simplifications

Caller searches used the exact tracked-source archive, including `lib`, `app`,
`components`, `tests`, and `docs`. Neither live hydration wrapper was found to
be dead code. No repository-wide unused-code claim is made.

| Rank | Candidate | Benefit and risk | Decision |
| --- | --- | --- | --- |
| 1 | Identical photo resolution inside `hydrateHomepageSnapshot` and `hydrateShopSnapshot` | One pure URL/fallback policy can replace two copies. Receipt ownership and copy semantics need protection. Benefit is modest. | Proposed first bounded package after scope acceptance. |
| 2 | Duplicate `canMutateContent` predicate in AdminShell and the admin dashboard | One typed predicate may prevent UI policy drift. It crosses client/server consumers and must preserve readable routes during mutation denial. | Keep as a separate candidate. |
| 3 | About recovery versus shared page-save transport | Both reconcile receipts, but conflict results, request identity, default messages, and receipt presence differ. Adapters may add complexity. | Defer. |
| Rejected | Reuse `mediaAssetUrl` or `resolveMediaReferences` for snapshot hydration | Existing helpers throw or query where snapshots deliberately retain fallback URLs. Their import graph includes the browser Supabase client. | Do not use as drop-in replacements. |

## Bound the proposed first package

Keep the application change limited to the following files and their focused
behavior contracts. The helper name is tentative until implementation design.

- `lib/homepage-editor/server.ts`, `hydrateHomepageSnapshot`.
- `lib/shop-editor/server.ts`, `hydrateShopSnapshot`.
- One small dependency-free helper under `lib`, tentatively named
  `createSnapshotPhotoHydrator`.
- `tests/contracts/homepage-editor-server.test.ts` and focused Shop hydration
  behavior in `tests/contracts/shop-page-editor.test.ts` or a dedicated server
  contract file.

The production callers remain `app/api/admin/homepage/route.ts` and
`app/api/admin/shop/route.ts`. Leave both routes, authorization checks, RPCs,
SQL, schemas, media retirement, and provider integrations unchanged.

1. Protect the current Shop behavior before extracting anything.
2. Compare and extract only the identical photo-resolution policy if the
   resulting code has fewer decisions to maintain and remains easier to trace.
3. Keep Homepage's `content.photos.items` and Shop's `photos` and `photoRows`
   traversal explicit in their existing wrappers.
4. Keep committed-receipt recursion editor-specific. Build a new lookup for
   each receipt's own media. Never reuse the outer snapshot's media for a
   receipt.
5. If the proposed helper requires editor switches, callbacks for policy,
   extra configuration, or a broader framework, reconsider the extraction.

Preserve missing-base fallback, null-ID legacy URLs, unmatched asset fallback,
the `onzio-media` allowlist, exact segment encoding, ordering, extra photo and
snapshot properties, noncommitted operations, and input immutability. Preserve
one lookup per snapshot and its reuse across both Shop collections. Introduce
no query, network request, runtime image optimization, or new dependency.

## Verify the proposed package before requesting merge

- [ ] Add behavior cases for Shop `photoRows`, private buckets, missing base
  URL, encoded segments, legacy null IDs, ordering and extra properties,
  immutability, and a receipt with media different from its outer snapshot.
- [ ] Run the existing Homepage hydration contracts unchanged. Verify the
  new Shop cases against the existing behavior before extracting.
- [ ] Run Homepage route contracts plus `page-editor-api-rpc-binding`,
  `page-editor-media-retirement-route`, and
  `page-editor-receipt-availability-route` contracts unchanged.
- [ ] Run local Homepage photo/save/recovery and Shop save/reload/receipt
  recovery checks. Confirm Home-versus-Shop isolation, direct public URLs,
  actual image rendering, and fixture restoration. Serialize all writers.
- [ ] Compare the same local scenarios before and after the extraction.
  No performance improvement is claimed. Retain one map per snapshot and zero
  extra network/database calls. Measure any performance claim separately.
- [ ] Run all baseline gates, obtain independent review at the exact head,
  and record any remaining browser or environment limits.

Rollback is one isolated source/test commit revert. This package must require
no schema rollback, data repair, hosted operation, or fixture reset.

## Preserve intentional boundaries and resolve stale prose

`submitPageSave` serves Shop, Tryouts, and two Programs call sites.
`saveAboutEditor` serves About, while `loadAboutEditor` also supports initial
About/Logo reads, conflict reloads, and cleanup retries. Keep the differing
outcome contracts, retained request identity, rejection copy, explicit GET
credentials, and committed-receipt checks. Do not merge these stateful paths
as part of the photo package.

`lib/admin-route-manifest.ts` already centralizes filtered navigation, search
metadata, and quick actions. Its contracts protect 18 canonical destinations,
role/template/billing filters, order, hidden-search exclusion, and the
readable-versus-mutable distinction. The Season Stats path is a compatibility
redirect. Keep backend authorization and RLS independent of this UI registry.

Record these documentation conflicts before any affected implementation.
This audit does not change architecture policy by editing an old sentence.

- `AGENTS.md` and the beginning of `tests/README.md` describe an intentionally
  red pre-implementation posture. The observed full suite now passes. Keep
  the stable security rules and assertion-preservation requirements.
- The architecture plan's operator-only membership sentence conflicts with
  its later membership section, `AGENTS.md`, and owner/admin membership
  contracts. Preserve owners adding/removing admins and operator-only
  ownership transfer. Do not narrow that behavior as cleanup.
- Older hosted-staging requirements conflict with newer handoff entries
  describing staging as retired. Resolve release posture separately before
  any future hosted verification or release. This does not block local work.

Finally, `lib/club-context.ts` substitutes synthetic contexts under
`NODE_ENV=test`. Passing mocked context tests alone does not prove real tenant
resolution. Keep local production-mode HTTP/browser checks and actual SQL
denial contracts alongside unit tests.

## Continue from the acceptance ledger

The source audit and scoped baseline are complete with the first timeout and
environment limits recorded. The proposed photo package is ready for scope
review, not implemented. No application, test, dependency, or migration file
was changed during this audit. The next step is acceptance of the bounded
package, followed by behavior characterization and one reviewed refactor.
Only the user may approve merging the new revision.

## Photo-resolution implementation evidence

The user accepted this bounded package on 2026-10-16. Implementation starts
from clean PR head `750e98122ddac8028d802ab41b2624d97bec9ba2`.
`lib/snapshot-photo.ts` owns the media index and public URL rules. Homepage
and Shop retain their snapshot shapes and receipt traversal. Each receipt
builds its own media map. There is one map per snapshot, reused for both Shop
collections. The factory accepts the base URL explicitly and imports nothing.

The factory design avoids rebuilding the Shop map for each photo collection.
An array resolver would duplicate that work or require another collection
grouping argument. Model the Domain puts the shared photo policy together;
Laziness Protocol limits the change to three production files. Maintainers
follow one import to one URL policy instead of maintaining two copies. No
query, runtime dependency, optimizer or performance claim is added.

Five Shop behavior cases passed against the original implementation before
extraction. They protect both collections, fallback object identity, missing
base URLs, private/unmatched/null identities, exact segment encoding, metadata,
ordering, immutability and receipt-specific media. The first build caught a
too-narrow string URL constraint because Homepage permits null URLs. A new
Homepage null-URL case passed before widening that constraint to the existing
domain type. No cast or suppression was added. All 15 focused cases then pass.
The initial failed build/typecheck logs remain in `attempt-1` in the private
receipt directory; corrected-tree results below supersede those attempts.

Fresh corrected-tree verification passes in series. Full 1,819 in 193 files,
contracts 1,065, architecture 21, database 311, legacy 422, lint, production
build and post-build typecheck all pass. The initial audit's unrelated timeout
remains recorded above; no timeout or existing assertion was changed.

The same production-mode local Chromium cases pass at baseline and head:
13 Homepage photo/recovery cases and 9 Shop recovery/phone cases per revision.
Homepage exercises real uploads, photo cleanup, saves, reload recovery and a
lost response after a real commit. Shop browser cases intercept mutation and
receipt responses; real Shop persistence, receipt and home/shop isolation are
covered separately by the eight local atomic-save database cases. This is
not a claim of a real Shop photo save through the complete browser/API stack.
Public/login, owner dashboard, 401 unauthenticated API and 404 unknown-tenant smoke checks
also pass at head without browser JavaScript errors. External video requests
were blocked in that smoke and do not establish provider availability.

An extra cleanup assertion caught an existing browser-worker environment gap.
The worker loaded `.env.test`, which lacks the service URL/key used by its
retirement helper; `restorePhotos` swallowed that helper's errors. Each run
left five unreferenced published uploads despite restoring the photo rows and
template. The ten exact test uploads were verified unreferenced and retired
through the existing guarded API using loopback `.env.local`. Historical
receipts were preserved. Repeating the real upload case with `.env.local`
exported before `.env.test` passes and its cleanup succeeds. Final readback
confirms the seeded presentation, zero photo rows/settings, and zero new
Homepage uploads still published. No environment file or cleanup source was
changed; the harness's swallowed-error behavior remains a documented limit.

Source-only comment and independent correctness reviews found no outstanding
issues after the nullable-URL correction. Final publication SHA and final
revision review are recorded on PR #16. Logs and private auth state remain
under `/home/coder/.local/state/onzio/pr16-photo` and the existing baseline
auth directory. No native-device or hosted acceptance is claimed. The known
VM host-stall risk remains. The temporary server is stopped after verification;
the existing development server and unrelated project services are preserved.

Rollback is a source revert of the extraction and its characterization tests.
No data migration or repair is required. Save transport consolidation and all
other candidates remain deferred. Exact next step is owner acceptance of the
published revision. No merge or deployment is authorized.

## Real Shop browser/API follow-up

This follow-up closes the earlier missing full Shop photo-save coverage.
The application source remains exactly the implementation at
`e20fef5cac08aebe1e51b5b237c015c2a5e83c6d`. No application defect was found
and no additional application, dependency, schema or environment change was
needed. A dedicated local Playwright configuration and three durable browser
cases now cover the real flow.

All three cases pass against the production-mode local app. Academy at 1440px
uploads two kit photos. Cinematic at 1440px uploads two kit photos and two
photo-row images. Cinematic at 390px repeats both collections and loses a
real committed POST response. Every upload traverses authorization, signed
staging upload and finalization. Reordering is verified in the save response
and database rows. Saved API URLs, published asset metadata, direct WebP
responses, reloaded editor thumbnails and decoded public Shop images agree.

The phone case lets the real receipt GET recover the dropped response,
asserts only one initial mutation and one receipt, and replays the exact
request without advancing the page revision. A later real save removes one
photo. Loading the earlier operation still hydrates both receipt collections
using their own media while the current outer media excludes the removed
asset. There are no fabricated mutation or receipt responses.

The homepage Shop feature stays unchanged and Bravo remains byte-for-byte
unchanged across the backed-up tables. The initial test run reached the end
of the Academy flow but expected a 403 denial for Bravo's private preview.
Read-only probes and tenant/RLS inspection confirm the existing fail-closed
response is 404 `Not found`. The new assertion was corrected; no existing
contract or application authorization changed. That initial run and its
cleanup evidence remain in the private `attempt-1` receipts.

Exact Shop rows, page revisions and presentation state are restored after
each case and checked again after regression tests. All twelve test uploads,
including two from the initial harness run, have guarded retirement confirmed,
soft-deletion metadata and removed Storage objects. Existing receipts and
presentation documents are preserved. Five new operation receipts and two
immutable Cinematic presentation documents remain as intentional local audit
history, with IDs recorded in the private verification summary. Cleanup uses
the actual loopback service environment and fails on errors.

The broader regression suites subsequently changed only Alpha's presentation
timestamp and Bravo's Shop revision in these backed-up mutable records.
After confirming all content and other fields matched, those two fixture
metadata records were restored from the pre-run backups under the Shop locks.
The final readback then matches both tenants' original mutable fixtures.

Fresh post-browser gates pass: full 1,819 tests in 193 files, architecture 21,
contracts 1,065, local database 311, lint, production build and post-build
typecheck. No existing assertion or timeout was loosened. The temporary
port 3112 server is stopped; port 3110 and unrelated services are preserved.
Final revision review and exact publication SHA are recorded in PR #16.

Reproduction is in `tests/README.md`. Private logs, backups, verification
reports and the failed harness attempt are under
`/home/coder/.local/state/onzio/pr16-shop-flow` and the ignored browser result
directory. Native hardware and hosted-provider acceptance remain unclaimed.
The known VirtualBox stall risk remains. Exact next step is owner approval
of the final PR revision; this verification authorizes no merge or deployment.
