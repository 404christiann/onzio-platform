# Complete the local Academy acceptance proof

Issue [#53](https://github.com/404christiann/onzio-platform/issues/53) is in progress.

The complete local SQL and browser proof now passes; see `HANDOFF.md`, the SITE-07 #53 status ledger in `docs/site-architecture.md`, and [the ticket-53 proof record](verification/site07-shell/ticket-53/README.md). Final exact-head verification and independent final-head review remain pending. The executable proof diff still requires Christian's specific verifier authorization described below.
All native prerequisites #47/#48/#49/#50/#51/#52 are locally accepted and closed.
This plan is not a completed acceptance record. Its private integration combines
accepted #52 `e4a7104` and #51 `5bb8f7f`. Their production release approvals are
separate: PR #74 is submitted to the approved bot workflow first, and PR #73 stays
draft until its base is refreshed and checked. Codex does not merge or deploy.

## Freeze the inputs

1. Fetch main and record the exact locally accepted revision for every page package.
   Keep unreleased extraction PRs separate. If accepted refs are not merged, make an
   owned private committed integration, record every parent and its integration SHA,
   review/verify the integration, and call it a local candidate rather than deployed main.
2. Inventory all 17 patterns in `components/sites/diverse-city/routes.ts`, plus the
   existing editor previews. Preserve #50's decision to add no Roster/Schedule previews.
3. Record the shared registration signature fix separately from page ownership.
4. Freeze package and build inputs before proof execution. The build receipts include
   documentation and tests, so later edits invalidate those receipt inputs.

## Extend the existing local harness

Keep hosted routing and activation outside this work. The existing harness needs these changes:

| Area | Current limit | Required local proof |
| --- | --- | --- |
| `scripts/pilot-source-package.ts` | Retained roots cover homepage and shell. | Explicit full-page visual roots and reviewed dependency classification. Shared queries, auth, persistence, registration transactions, and billing stay current platform services. |
| `tests/helpers/pilot-coordination-fixture.ts` | Synthetic visual roots match the earlier homepage scope. | Matching complete-site synthetic fixtures and historical-package compatibility tests. |
| `scripts/pilot-site-coordination.ts` | Document union and parser admit only `/` and `/admin/homepage`. | Finite implemented route descriptors with explicit fixture parameters and unchanged assignment/traffic authority. |
| `scripts/prove-pilot-site-coordination.ts` | Homepage, kit and homepage editor captures. | Every extracted page and existing preview at desktop and phone for A, changed B, and retained A. |
| `tests/helpers/site-coordination-proof.ts` | Disposable club has mostly homepage content; protected fingerprints omit other content and billing. | Populated disposable-club content, forms and details; content, billing, schema and unrelated-tenant before/after comparisons. |
| Invalid assignment | Resolution tests reject it, without an explicit captured document failure. | Deliberate local invalid assignment, visible failure, and proof that no other site or release renders. |

Add real behavior regressions at these seams. Keep existing receipt replay, stale-token,
assignment epoch, process ownership, listener and cleanup checks. Do not widen allowed
origins or mutation methods to make browser tests pass.

## Plan the retained source boundary

A read-only dependency trace over accepted main and the reviewed #51/#52 candidates
identifies twelve additional roots. Confirm them against the accepted local integration
before coding.
Eleven are in `components/sites/diverse-city/`: `AcademyAboutPage.tsx`,
`AcademyContactPage.tsx`, `AcademyProgramsPage.tsx`, `AcademyProgramDetailPage.tsx`,
`AcademyRosterPage.tsx`, `AcademySchedulePage.tsx`, `AcademyShopPage.tsx`,
`AcademySponsorsPage.tsx`, `AcademyTryoutsPage.tsx`, `AcademyRegistrationPage.tsx`,
and `AcademyRegistrationConfirmationPage.tsx`. The remaining root is
`components/ClubLogoPageClient.tsx`. Keep the existing eight roots. Literal imports
already reach the registration slideshow, fixture row and standings components.

Retain `lib/tryouts-page-content.ts` as visual copy/default resolution, consistent
with Programs. Keep `lib/registration-public.ts`, `lib/roster-images.ts` and
`lib/flags.ts` current platform services. Explicitly classify all four shared
registration components as current platform: `RegistrationCtaButton.tsx`,
`RegisterModal.tsx`, `SignatureInput.tsx` and `RegistrationConfirmation.tsx`.
The existing broad `components/` visual rule must not admit those service files
into an artifact even when they are not directly reached by a retained root.

Preserve finite historical package scopes both before and after the Shell addition.
Do not infer full-site completeness from Shell or one page's presence. Use an explicit
complete-site manifest scope or format, preserve historical digest verification, and
reject incomplete historical packages for current reconstruction with a regeneration
message. Extend source-package, coordination-fixture, reconstruction-environment and
accepted-build-identity inventories. Test missing-root rejection, A-over-B restoration,
current shared-service preservation and rejection of retained service bytes.

The current binding contract remains homepage-only. Full visual retention with current
services does not prove rollback between distinct full-site binding revisions; a
stronger claim needs a separate binding contract decision.

## Populate the route matrix

Use disposable synthetic data and versioned loopback media. Actual fixture values and
IDs are recorded in the final configuration, after dependencies are accepted.

| Routes | Minimum fixture content |
| --- | --- |
| `/` | Authored hero/story and populated home kit. |
| `/club/about`, `/club/logo` | Populated story, values, finite CTA and branding. |
| `/contact`, `/tryouts` | Authored content and valid existing registration links. |
| `/programs`, `/programs/[programSlug]` | Published list/detail with an actual fixture slug. |
| `/roster` | Real synthetic players, squad/season relationships and staff content. |
| `/roster/[playerId]` | Preserve the existing Academy “Profile unavailable.” state and its no-read boundary. This proof does not add Academy player profiles. |
| `/schedule` | Populated past/future fixtures and standings relationships. |
| `/schedule/[fixtureId]` | Preserve the existing Academy “Match area unavailable.” state and its no-read boundary. |
| `/shop`, `/sponsors` | Populated kit variants and sponsor placements; explicit visibility states. |
| `/staff` | Preserve the redirect to `/roster#staff` and inspect the populated roster staff section. |
| `/stats` | Preserve “Team statistics are not published for this site yet.” and its no-read boundary. This proof does not implement a new statistics page. |
| `/register/[formSlug]`, `/register/[formSlug]/confirmation` | Accepted #52 forms and read-only confirmation cases. Keep registration/payment mutation proof in #52's separately accepted SQL/browser seam. |

For each A/B/A transition, require completed visible content, correct shell and links,
no unexpected diagnostics, matching intended fonts/assets and inspected desktop/phone
screenshots. Header and native-control transitions must settle before image comparison.
Record expected blocked resources separately. Do not infer resource or layout parity from
an empty page or a capture at a different UI state.

## Extend the disposable fixture safely

Reuse `openCoordinationProof()`'s own test club, not #52's Alpha-specific writer.
Reuse that writer's ordering and restoration assertions only. Create fresh globally
unique IDs and same-club relationships; do not copy Alpha IDs into another club.

| Fixture group | Current tables or services to cover |
| --- | --- |
| Chrome and homepage | Branding, socials, contact profile, carousel/footer sponsors, hero/story, standings settings/rows and home-surface kits. |
| About and logo | `about_page_content`, `club_logo_page_content`, finite CTAs and loopback media. |
| Contact, Tryouts and Programs | Page content, active programs with real slugs, program media, tryouts and same-club form links. |
| Roster and Schedule | Active seasons, players, both season-stat tables, photos, staff and past/future matches. `fetchRoster` derives player IDs from season-stat rows; players alone are insufficient. |
| Shop | `shop_kit_section` and `shop_kit_photos` for home/third/away with the correct surface and visibility controls. |
| Registration | Own test-mode Connect row, draft form, required core/signature fields and active price, then open the form. |

Persist the owned recovery inventory before writes. Close forms before removing core
fields/prices. Unlink or delete Programs and Tryouts before their forms because those
foreign keys use RESTRICT. Delete statistics/photos before player and match parents.
Preserve existing protected-document transactions, trigger restoration and proof-schema
cleanup. Retain both primary and cleanup failures; verify all owned rows, servers and
lock holders are gone before declaring cleanup complete.

Use existing authenticated editor load/save RPCs for content written before rollback,
with fresh revision/design tokens and operation IDs. Keep browser traffic read-only.
Expand protected fingerprints from the current eleven tables to every fixture group,
subscriptions, Stripe events, registration/media references and private editor
revisions/receipts. Compare disposable-club content and billing with timestamps directly
before/after rollback. Compare unrelated tenants and schema/functions/policies/triggers/
grants too. Account separately for intended assignment/pointer/epoch changes and the
temporary proof schema rather than weakening content equality.

## Prepare and accept the retained artifacts

The earlier 706-file package with digest
`e52eabfac98ff890f17d063aee3df18c31bfe57040a946094b8f5576e858bd59`
still byte-verifies but cannot establish current reconstruction acceptance. It lacks
`source/components/sites/diverse-city/Shell.tsx` and predates full-page retention.

After extending the roots, produce a clean committed full-site A candidate and a
matching fresh production build. Inspect its manifest, inventory and digest. Present
those concrete bytes to Christian for digest acceptance before reconstruction acceptance,
as required by `docs/pilot-academy-acceptance.md`. Changed B needs its own accepted package.

Prepare distinct `oldA`, `newA`, `newB`, and `oldPlatform` roots with the existing
reconstruction tools. Each serving root needs its own valid marker, whole binding,
current-platform fingerprint, selected local environment and successful guarded build
receipt. Never reuse one root as multiple workers or manufacture a marker. `oldPlatform`
is a comparison control, not an authored target.

A and B currently share the exact homepage binding implementation and revision. State
that limit. Do not claim demonstrated rollback between different binding revisions.
Inventory binding dependencies for the remaining pages before expanding that claim.

## Prove rollback and failure behavior

Save fresh disposable-club content before B-to-A rollback. Compare its full content and
billing state immediately before and after rollback, including subscription and event
rows. Compare unrelated-tenant state and schema fingerprints. Account explicitly for
the temporary unexposed proof schema. Rollback restores the retained visual release and
bindings while preserving the latest content and platform services.

Capture an invalid assignment as an explicit local failure. Assert that resolution is
invalid and that neither another site nor another release appears. Restore only the
owned disposable fixture and verify cleanup.

## Finish verification and review

Run types, lint, contracts, full affected architecture including pilot proofs, database,
non-overlapping whole suite, and production build. Run database/browser/build work
serially through the shared lock. Record exact failures and clean-base comparisons;
SAME AS BASELINE is not a fully green suite or fresh browser acceptance.

Executable proof-script changes trigger the verifier's human diff-review gate. Prepare
the diff before seeking that specific approval. An agent must not set
`CODEX_LOOP_TRUST_DIFF` itself. Keep the external digest decision distinct from code review.

Freeze the final evidence and repository records, verify the exact final commit, then
obtain independent review. Only then reconcile #53's acceptance and native dependencies.

The final record must list the outstanding hosted work verbatim in meaning: traffic
inventory/admission, deployment/cache coordination, production authored dispatch/storage,
and an operator activation endpoint. #54 records Christian's separate go or no-go and
owners; local proof does not authorize any hosted action.

## Agreed implementation sketch

The two design candidates and independent same-model cross-judge selected the smaller
three-owner design. Source format `onzio-pilot-source@3` alone identifies complete
Academy scope; no redundant optional scope flag is needed. Formats @1/@2 retain
unchanged historical digest verification and frozen historical graph policies.
Current reconstruction rejects historical scopes before writing output.

```ts
type PilotSourceManifest = HistoricalV1 | HistoricalV2 | CompleteAcademyV3;
type CompleteAcademyV3 = Omit<HistoricalV2, "format"> & {
  format: "onzio-pilot-source@3";
};
type ProofDocumentId =
  | { kind: "public"; route: AcademyRouteId }
  | { kind: "preview"; preview: MountedPreviewId };
type FixtureLifecycle =
  | { kind: "open"; recoveryFile: string }
  | { kind: "cleaning"; recoveryFile: string }
  | { kind: "cleanup-failed"; recoveryFile: string; error: unknown }
  | { kind: "closed"; verifiedReceipt: string };
```

These are design signatures, not application placeholders. Keep source policy private
to the packager. One independent catalog covers the exact route key set and actual
mounted previews, taking fixture parameters once and admitting no arbitrary paths,
hosts or caller-supplied parameter substitutions. The package cannot declare its own
required acceptance matrix. Include the mounted branding footer preview; do not invent
an Academy Logo editor tab or a browser route for unused `ScaledAboutPreview`.
Confirm any Standings preview from actual code. Keep SQL and browser selectors out
of the package policy.

The fixture owns content/billing/schema checkpoints and verified retryable cleanup.
Capture invalid assignment through the existing trusted local navigation guard's
real denial response, inspect the visible 503, and assert no upstream release loads.
Do not manufacture a failure screenshot with `page.setContent`.

Package worker owns `pilot-source-package.ts`, source-package tests and synthetic
source inventories, including `tests/helpers/pilot-coordination-fixture.ts`. Proof
worker owns the finite document helper, coordinator/proof scripts, database fixture
helper and related tests. Coordinator owns shared records, final integration/review,
reviewable executable diff, digest presentation and the serial runtime lane.

## Implementation preflight status

The complete implementation is present with package and fixture/driver reviews.
Source format @3 and current-service boundaries pass 72 independent pure checks.
Coordinator pure checks pass 95 and types. The actual matrix has 17 public routes and
11 mounted previews. Preflight corrected the real status-token shape, hidden Academy
Sponsors Footer tab, per-hop document admission and Staff redirect behavior. Final
fixes wait for actual Programs load completion before phone selection and preserve
primary plus concurrent cleanup failures. Independent fix review is clean and final
types, lint and 23 focused document/network checks pass.

These results do not establish SQL or browser acceptance. The real database regression,
fresh builds, actual packages, owned servers and full browser matrix remain unrun.
The executable diff and exact new A/B digests retain their separate human gates.
