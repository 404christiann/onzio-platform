# Diverse City FC Staging-to-Production Rollout Epic

Epic ID: `DCFC-EPIC-002`

Status: `phase_4_complete`

Last updated: 2026-08-01

## Outcome

Move Diverse City FC from the completed local `DCFC-EPIC-001` capability
baseline to an accepted production tenant through separately approved,
reversible staging and production gates.

Christian approved the packet and started the Phase 4-only goal on 2026-08-01.
That approval authorizes `DCFC-401` through `DCFC-404` under their Class 1 and
loopback-only Class 2 boundaries. It does not authorize any hosted mutation or
start `DCFC-501`.

Phase 4 completed on 2026-08-01. Hosted-environment inputs that Christian did
not supply are explicitly deferred in `ROLLOUT-INPUT-APPROVAL-MANIFEST.md`, so
`DCFC-501` remains blocked and unassigned. No staging inspection occurred.

## Sources of Truth

- Stable repository rules: `AGENTS.md`
- Current implementation and verification state: `HANDOFF.md`
- Platform architecture: `docs/onzio-platform-plan.md`
- Test semantics: `tests/README.md`
- Completed local epic: `EPIC.md`
- Rollout packages: `ROLLOUT-WORK-PACKAGES.md`
- Existing decisions: `DECISIONS.md`
- Content and media gate: `CONTENT-MEDIA-READINESS.md`
- Staging gate: `STAGING-ACCEPTANCE.md`
- Production gate and rollback: `PRODUCTION-CUTOVER-ROLLBACK.md`
- Phase 4 rollout input lock: `ROLLOUT-INPUT-APPROVAL-MANIFEST.md`
- Shared execution ledger: `STATUS.md`
- Approved visual specification: `VISUAL-ACCEPTANCE.md`

The snapshot remains a visual specification. It is not a deployable tenant,
content database, media authority, or billing system.

## Action Classes

Every work package has exactly one action class.

1. **Class 1 — read-only planning and inspection.** Repository/document reads,
   safe hosted metadata reads, inventories, comparisons, evidence review, and
   local documentation updates. No hosted state changes.
2. **Class 2 — local rehearsal or verification.** Local code or documentation,
   loopback-only Supabase, deterministic import plans, offline normalization,
   local browser checks, tests, reconciliation, and rollback rehearsal. No
   hosted credentials or hosted writes.
3. **Class 3 — hosted mutation.** Any Supabase Database/Storage/Auth change,
   invitation or email, Bunny.net action, Vercel deploy/configuration/domain
   action, Stripe object/session/subscription action, DNS update, or public
   lifecycle/indexing change.

Approval of this epic authorizes no Class 3 package. Each Class 3 package needs
fresh explicit approval naming the package and exact target environment. An
approval applies to one package only and does not roll forward to dependents.

## Locked Boundaries

- Preserve the shared multi-tenant application and neutral `academy@1`
  presentation boundary. Never add a `club.slug === "diverse-city"` branch.
- Keep staging and production `noindex, nofollow` until the separate indexing
  package is approved and completed.
- Keep hosted staging behind Deployment Protection until the staging gate is
  accepted. A client-facing preview still remains non-public and non-indexed.
- Onzio may store public program and Tryouts content plus validated external
  registration URLs. It stores no registration submission, payment, waiver,
  medical, signature, eligibility document, or participant record.
- External registration destinations are ordinary public content links. They
  are not authentication, billing, webhook, or data-ingestion endpoints.
- Do not invent club facts, prices, schedules, availability, roster/staff
  identities, standings, sponsors, registration details, or media rights.
- Preview-only and missing values must be replaced, intentionally hidden, or
  rejected before production import. Removing a provenance disclosure without
  resolving the underlying placeholders is prohibited.
- Continue using the secure image pipeline: private staging, byte-level
  validation, normalization, UUID-versioned immutable paths, checksums, and raw
  public delivery without Supabase Image Transformations or `/_next/image`.
- Bunny.net Stream is an approved architectural direction, not an implemented
  capability. This epic may use video only after a separately approved
  capability supplies validated rules and acceptance evidence. Otherwise the
  affected sections must be explicitly hidden or replaced with approved static
  presentation; no video rule may be invented during rollout.
- Use the existing standard live Stripe Product/Price mapping if it is
  reverified and approved. Do not create a Price. The first subscription must
  follow the existing owner Checkout/webhook projection flow; agents may not
  create a subscription directly.
- No production work begins until staging acceptance and the production
  preflight/rehearsal gate are complete.
- Public launch and search indexing are distinct approvals. Public launch
  retains `noindex, nofollow`; indexing can change only after the observation
  gate and a later explicit approval.
- Preserve unrelated and intentional uncommitted work. No package implies
  permission to commit, push, merge, or deploy.

## Phase Scope

### Phase 4 — Lock production-ready inputs

Class 1 packages disposition every content field, public route, media source,
video-backed section, identity, hostname, billing input, and approval. A Class
2 package then proves a deterministic local import and rollback rehearsal.

Gate: `DCFC-401` through `DCFC-404` complete. Every production value is
approved, replaced, hidden, or blocked; the local import can reconcile and
roll back; hosted targets and approvers are either safely named without
secrets or explicitly deferred so dependent packages fail closed.

### Phase 5 — Establish the protected staging tenant

Reverify the hosted staging baseline, deploy/apply only reviewed release
artifacts, provision Diverse City in private preview, assign the approved
presentation/content/media set, and complete the invited owner/admin MFA path.

Gate: `DCFC-501` through `DCFC-504` complete. The staging tenant is
`onboarding`/`preview`, protected, non-indexed, in its verified pre-billing
Starter state, and contains only approved content/media. Pro entitlement is
projected later from the approved Stripe test flow, not assigned manually.

### Phase 6 — Accept staging behavior and billing rehearsal

Run test-mode Checkout/lifecycle projection first, then verify desktop/mobile
public and Pro admin behavior, Alpha/Bravo/Diverse City isolation, security and
data-minimization boundaries, rollback, reconciliation, and runtime evidence.

Gate: `DCFC-601` through `DCFC-603` complete and Christian accepts the staging
evidence. No production package becomes eligible from test results alone.

### Phase 7 — Build the production go/no-go package

Read production metadata, produce backups/baselines, replay the exact import
locally, prove rollback, and assemble a package-by-package approval request.

Gate: `DCFC-701` through `DCFC-703` complete. Production identifiers and
rollback artifacts are current, but production remains unchanged.

### Phase 8 — Establish production private preview

Apply the reviewed release, provision the tenant in private preview, import and
reconcile approved content/media/presentation state, and complete owner/admin
password plus MFA acceptance on a non-public production hostname.

Gate: `DCFC-801` through `DCFC-803` complete. The production tenant remains
non-public and non-indexed with a verified rollback path.

### Phase 9 — Activate billing, domain, and public launch

Use the existing owner Checkout path and canonical webhook projection, attach
the approved domain/DNS and callbacks, then enable public access only after a
separate go-live approval. Indexing remains disabled.

Gate: `DCFC-901` through `DCFC-903` complete. The site is public, paid or
trialing under canonical Stripe state, and still `noindex, nofollow`.

### Phase 10 — Observe, reconcile, and close

Monitor the agreed observation window, reconcile content/media/Auth/billing/
domain/runtime evidence, exercise rollback if a stop condition is met, and
enable indexing only after a distinct approval.

Gate: `DCFC-1001` through `DCFC-1003` complete. Final evidence is recorded,
the launch is accepted, and the status ledger names ongoing operations.

## Dependency and Approval Sequence

```text
DCFC-401 content disposition ----\
DCFC-402 media/video readiness ----+--> DCFC-403 local rehearsal
                                    |           |
                                    +--> DCFC-404 rollout input lock
                                                |
                                                v
DCFC-501 staging preflight --> DCFC-502 release + tenant provisioning
                                                |
                                                v
                               DCFC-503 staged content/media/presentation
                                                |
                                                v
                               DCFC-504 owner/admin invitation + MFA
                                                |
                                                v
                               DCFC-601 test billing/lifecycle rehearsal
                                                |
                               DCFC-602 staging acceptance + isolation
                                                |
                                                v
                               DCFC-603 staging gate approval
                                                |
                                                v
DCFC-701 production preflight --> DCFC-702 local cutover/rollback rehearsal
                                                |
                                                v
                               DCFC-703 production go/no-go packet
                                                |
                                                v
DCFC-801 production release + tenant --> DCFC-802 production import
                                                |
                                                v
                               DCFC-803 private Auth/admin acceptance
                                                |
                                                v
DCFC-901 owner Checkout --> DCFC-902 domain/DNS/callback attachment
                                                |
                                                v
                               DCFC-903 public launch (noindex retained)
                                                |
                                                v
                               DCFC-1001 observation/reconciliation
                                  |                       |
                          failure v                       v success
                            DCFC-1002 rollback     DCFC-1003 indexing/closeout
```

Each arrow means dependency eligibility, not authorization.

## Epic Definition of Done

- All production content and media have recorded provenance, approval, and
  import or hide dispositions; no preview placeholder ships as fact.
- Staging and production imports reconcile row counts, relationships, asset
  IDs, object counts, checksums, and published presentation digest.
- Staging and production use `academy@1` without tenant-identity branches.
- Owner/admin invitation, password, recovery, mandatory MFA, membership, and
  protected-admin acceptance pass without recording secrets or action links.
- Alpha, Bravo, Diverse City, and Rose City remain isolated at their applicable
  environment boundaries.
- The public site and admin surfaces pass approved desktop/mobile acceptance,
  direct-media delivery, empty/error states, accessibility, and runtime-log
  checks.
- Stripe is the source of truth; the approved existing live Pro Price and
  owner Checkout path produce exactly one canonical subscription projection.
- The approved production domain resolves only to Diverse City, Auth callbacks
  use that verified domain, and unknown/cross-tenant hosts fail closed.
- Public launch and indexing have separate recorded approvals.
- The agreed observation window finishes without an unresolved stop condition,
  or rollback is completed and reconciled.
- `STATUS.md` and `HANDOFF.md` contain package evidence, blockers, the exact
  next step, and per-package hosted-mutation counts.

## Phase 4 Completion Boundary

Completing Phase 4 does not:

- start `DCFC-501`
- resolve deferred identity, domain, billing, launch, or indexing decisions
- authorize use of hosted credentials
- authorize an invitation, email, upload, deployment, migration, provisioning,
  Stripe action, DNS change, publication, or search-indexing change

The next possible package is the Class 1 `DCFC-501` hosted staging preflight,
but it remains blocked until Christian supplies the exact safe staging inputs
and separately assigns/approves that read-only inspection.
