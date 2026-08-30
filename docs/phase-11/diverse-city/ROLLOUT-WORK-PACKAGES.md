# Diverse City FC Rollout Work Packages

Epic: `DCFC-EPIC-002`

Status: `phase_4_complete`

Last updated: 2026-08-01

## Status Values

- `pending`
- `ready`
- `in_progress`
- `blocked`
- `in_review`
- `complete`
- `not_required`

Only recorded acceptance evidence may move a package to `complete`.

## Standard Package Rules

Every package inherits these rules:

- Read `AGENTS.md`, `HANDOFF.md`, `docs/onzio-platform-plan.md`,
  `tests/README.md`, `ROLLOUT-EPIC.md`, this file, `DECISIONS.md`, and
  `STATUS.md` before acting.
- Inspect branch and worktree status first; preserve all unrelated and
  intentional changes.
- Confirm the action class, target environment, exact resources, approver, and
  rollback evidence before acting.
- A package assignment permits only that package. It does not authorize a
  dependency, dependent, commit, push, deploy, email, or later package.
- Never place secrets, passwords, MFA seeds/codes, signed links, full webhook
  payloads, session tokens, or private content in Git, logs, screenshots, or
  status records.
- Never use hosted credentials in local tests.
- Stop on an unexpected project ref, environment, hostname, tenant UUID,
  Stripe mode/object, migration ledger, content digest, asset checksum, or
  authorization result.
- Restore temporary test mutations before completion and reconcile the
  restored state.
- Update the package row and append the mandatory completion record in
  `STATUS.md` before ending, even when blocked or incomplete. Update
  `HANDOFF.md` after meaningful work.

## Phase 4 — Lock Production-Ready Inputs

### DCFC-401 — Production content and provenance disposition

- **Objective:** classify every route, section, field, external destination,
  and factual claim as approved for production, intentionally hidden, missing,
  prohibited, or blocking.
- **Action class:** Class 1 — read-only planning and inspection.
- **Dependencies:** `DCFC-304` complete; this packet approved by Christian.
- **Permitted actions:** inspect the approved snapshot and current Onzio
  mappings; request/record club decisions; update documentation; checksum
  already-supplied files without altering them.
- **Prohibited actions:** application/data changes, imports, uploads,
  invitations, deployments, publication, or treating TBA/sample values as
  production facts.
- **Required inputs and approvals:** Christian approves starting `DCFC-401`;
  client/Christian supplies or hides the items tracked by `DCFC-D102` and
  `DCFC-D106`; real external registration destinations are supplied by an
  authorized club source.
- **Acceptance criteria:** every row in `CONTENT-MEDIA-READINESS.md` has one
  production disposition and evidence owner; the preview disclosure is removed
  only if all content it qualifies is removed or replaced; prohibited data
  collection remains absent.
- **Verification commands/evidence:** `rg` route/source audit; source links or
  dated approvals; `git diff --check`; no product-code diff.
- **Rollback expectations:** documentation-only; revert only this package's
  documentation if an approval is withdrawn, preserving the prior evidence.
- **Exact hosted-mutation boundary:** zero hosted writes. Read-only public or
  provider metadata checks must not authenticate with mutation-capable
  credentials.
- **Expected documentation updates:** `CONTENT-MEDIA-READINESS.md`,
  `DECISIONS.md`, `STATUS.md`, `HANDOFF.md`.

### DCFC-402 — Media and video readiness inventory

- **Objective:** produce a source-to-destination inventory for every approved
  image/graphic/video role, including rights, checksums, normalization,
  reference ownership, reconciliation, and removal/rollback treatment.
- **Action class:** Class 1 — read-only planning and inspection.
- **Dependencies:** may overlap `DCFC-401`; final disposition depends on it.
- **Permitted actions:** inspect supplied media read-only; calculate size,
  MIME, dimensions, alpha, and checksum; map existing secure-media surfaces;
  assess whether Bunny capability exists.
- **Prohibited actions:** normalize/write files, upload, delete source media,
  create Bunny libraries/videos/API keys, invent video limits, or assume public
  permission from file possession.
- **Required inputs and approvals:** source files and provenance/rights owner;
  `DCFC-D114` decision for video-backed sections.
- **Acceptance criteria:** every used asset has an immutable source identity,
  publish-rights evidence, target role, and planned destination; duplicates and
  missing assets are explicit; video is either blocked behind a separate
  capability gate or assigned an approved non-video/hide disposition.
- **Verification commands/evidence:** `file`, `shasum -a 256`, dimension
  inspection, source-to-role reconciliation, and a repository scan proving no
  `/storage/v1/render/image/` or runtime video implementation is assumed.
- **Rollback expectations:** no asset changed; remove superseded inventory
  claims while retaining audit history.
- **Exact hosted-mutation boundary:** zero. No Supabase Storage or Bunny.net
  read requiring private credentials and no hosted write/delete.
- **Expected documentation updates:** `CONTENT-MEDIA-READINESS.md`,
  `DECISIONS.md`, `STATUS.md`, `HANDOFF.md`.

### DCFC-403 — Deterministic local import and rollback rehearsal

- **Objective:** build or adapt a fail-closed Diverse City import plan, replay
  it only into loopback Supabase, reconcile it, reset it, and replay the same
  immutable artifact successfully.
- **Action class:** Class 2 — local rehearsal or verification.
- **Dependencies:** `DCFC-401` and `DCFC-402` complete.
- **Permitted actions:** local planner/importer and tests; offline image
  normalization; loopback Database/Auth/Storage; local browser acceptance;
  temporary files in a restricted local workspace.
- **Prohibited actions:** hosted URLs/credentials, real emails, hosted Storage,
  Bunny operations, Stripe calls, deploys, DNS, or source deletion.
- **Required inputs and approvals:** approved content/media manifest; local
  execution approval implicit only after this package is assigned; no hosted
  approval is bundled.
- **Acceptance criteria:** two generated plans have identical digests; import
  is idempotent; row/relationship/object/checksum/presentation counts reconcile;
  reset removes only the Diverse City local tenant; Alpha/Bravo remain intact;
  replay reproduces the same state; hidden content remains absent.
- **Verification commands/evidence:** `npm run db:reset`; focused planner/
  importer contracts; loopback `npm run test:db`; loopback `npm test`;
  `npm run db:types:check`; local schema lint; `npx tsc --noEmit`; local
  Playwright public/admin evidence; `git diff --check`.
- **Rollback expectations:** the rehearsal must include and prove an exact
  tenant-scoped reset/compensation path before completion.
- **Exact hosted-mutation boundary:** zero; fail closed unless all Supabase and
  Postgres endpoints are loopback.
- **Expected documentation updates:** `CONTENT-MEDIA-READINESS.md`,
  `PRODUCTION-CUTOVER-ROLLBACK.md`, `STATUS.md`, `HANDOFF.md`; checked-in local
  planner/test files only if separately within the assigned package scope.

### DCFC-404 — Rollout inputs and approval lock

- **Objective:** assemble the final staging/production input manifest and
  obtain decisions needed to make `DCFC-501` eligible.
- **Action class:** Class 1 — read-only planning and inspection.
- **Dependencies:** `DCFC-401` through `DCFC-403` complete.
- **Permitted actions:** consolidate safe identifiers, digests, decisions,
  approvers, evidence locations, rollback owners, and package sequence.
- **Prohibited actions:** creating credentials/resources or starting staging.
- **Required inputs and approvals:** resolve or explicitly defer
  `DCFC-D111`–`DCFC-D117`; record exact staging and production hostnames,
  invited roles/recipients outside Git, Pro billing path, DNS owner, launch
  window, observation duration, and indexing rule.
- **Acceptance criteria:** no implementation-shaping input is unknown; secrets
  are referenced by storage location/name only; Christian approves the input
  manifest and may then separately assign `DCFC-501`.
- **Verification commands/evidence:** cross-document ID/link audit;
  `git diff --check`; final manifest review against all three rollout
  checklists.
- **Rollback expectations:** withdraw approval and return affected packages to
  `blocked`; no external state exists to restore.
- **Exact hosted-mutation boundary:** zero.
- **Expected documentation updates:** `DECISIONS.md`, all rollout checklists,
  `STATUS.md`, `HANDOFF.md`.

## Phase 5 — Establish the Protected Staging Tenant

### DCFC-501 — Hosted staging read-only preflight

- **Objective:** verify the current staging project, migration ledger,
  deployment protection, environment separation, existing Alpha/Bravo state,
  Stripe test configuration, Auth/SMTP posture, capacity, and rollback target.
- **Action class:** Class 1 — read-only planning and inspection.
- **Dependencies:** `DCFC-404` complete; explicit approval for read-only hosted
  inspection if credentials or provider dashboards are required.
- **Permitted actions:** metadata/list/status/log reads with least privilege;
  compare repository migrations and deployment commit; safe HTTP probes.
- **Prohibited actions:** linking/applying migrations, deploying, provisioning,
  inviting, emailing, uploading, changing configuration, or running verifier
  scripts that write temporary hosted state.
- **Required inputs and approvals:** exact staging Supabase ref, Vercel project,
  Stripe test account/mode, and approved read-only access method.
- **Acceptance criteria:** every target matches `STAGING-ACCEPTANCE.md`; drift,
  quota, stale deployment, or environment mixing is resolved or blocks the
  phase; a pre-change snapshot is recorded.
- **Verification commands/evidence:** `git status --short`; local/remote
  migration-list comparison; read-only provider resource inventories; HTTP
  protection/unknown-host probes; safe identifiers only.
- **Rollback expectations:** none needed; no state changes. Revoke temporary
  read-only access if created outside this package.
- **Exact hosted-mutation boundary:** zero. Do not run `staging:provision` or
  hosted auth/media/stripe/lifecycle verifiers in this package.
- **Expected documentation updates:** `STAGING-ACCEPTANCE.md`, `STATUS.md`,
  `HANDOFF.md`.

### DCFC-502 — Staging release and private tenant provisioning

- **Objective:** bring the reviewed DCFC release/schema to staging and
  provision exactly one Diverse City staging tenant in private preview.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-501` complete; reviewed release commit/deployment;
  fresh explicit `DCFC-502` approval.
- **Permitted actions:** apply only checked-in unapplied migrations to the exact
  staging ref; deploy the approved `staging` release; provision the approved
  slug/name/hostname as `onboarding`/`preview` with the operator workflow's
  pre-billing Starter tier; add the verified staging domain row/alias; record
  audit evidence.
- **Prohibited actions:** local seed against hosted staging, production access,
  content/media import, real invitations/email, Stripe Checkout/subscription,
  final club domain/DNS, public access, or indexing.
- **Required inputs and approvals:** exact release commit, migration list,
  staging tenant identity, protected hostname, operator actor, backup/export,
  and package-specific approval.
- **Acceptance criteria:** migrations match; deployment is protected/healthy;
  exactly one tenant/domain exists as Starter/onboarding/preview; unknown hosts
  fail closed; no content or membership beyond provisioning minimum is present.
- **Verification commands/evidence:** linked migration list/schema lint;
  read-back of club/domain/audit rows; deployment ID/commit; HTTP protection,
  tenant-resolution, unknown-host, and `X-Robots-Tag` evidence.
- **Rollback expectations:** redeploy the prior release if needed; keep additive
  schema intact unless a reviewed down migration exists; archive/detach the new
  tenant through audited operator tooling rather than ad-hoc deletion.
- **Exact hosted-mutation boundary:** staging Supabase schema/tenant/domain and
  Vercel Preview deployment/alias only. Zero production, Stripe, Bunny, DNS,
  email, or Auth invitation mutation.
- **Expected documentation updates:** `STAGING-ACCEPTANCE.md`, `STATUS.md`,
  `HANDOFF.md`.

### DCFC-503 — Staging content, media, and presentation import

- **Objective:** apply the approved deterministic manifest to the private
  staging tenant and publish the approved `academy@1` presentation document.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-502` complete; immutable `DCFC-403` plan; fresh
  explicit `DCFC-503` approval.
- **Permitted actions:** upload approved normalized images through the secure
  pipeline; insert approved tenant content and references; assign/publish the
  versioned presentation; reconcile; perform scoped compensating cleanup.
- **Prohibited actions:** placeholder/missing imports, raw public uploads,
  runtime transformations, video upload without a completed video capability,
  participant data, invitations, Stripe, production, DNS, or indexing.
- **Required inputs and approvals:** approved plan/digests; destination tenant
  UUID; source rights; hide decisions; storage budget; package approval.
- **Acceptance criteria:** source/normalized/uploaded counts and checksums
  match; all composite relationships and presentation pointers reconcile;
  raw/staging cleanup is complete; no prohibited URL or content appears; replay
  is idempotent.
- **Verification commands/evidence:** importer reconciliation output; scoped
  Database/Storage reads; presentation digest; public raw-object HTTP checks;
  no transform/optimizer URLs; runtime logs; hosted mutation count by system.
- **Rollback expectations:** restore the pre-import presentation pointer and
  content snapshot; remove only newly created unreferenced objects/rows using
  the plan ledger; archive/detach if compensation is incomplete.
- **Exact hosted-mutation boundary:** only the named Diverse City staging
  Database/Storage/presentation rows and objects. Zero Auth/email, Stripe,
  Bunny, Vercel configuration, production, DNS, or public launch mutation.
- **Expected documentation updates:** `CONTENT-MEDIA-READINESS.md`,
  `STAGING-ACCEPTANCE.md`, `STATUS.md`, `HANDOFF.md`.

### DCFC-504 — Staging owner/admin invitation and MFA acceptance

- **Objective:** provision only approved club roles, deliver staging
  invitation/recovery through existing Auth email, and prove password plus
  mandatory MFA protected-admin access.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-503` complete; approved recipients/roles; fresh
  explicit `DCFC-504` approval and recipient availability.
- **Permitted actions:** operator membership workflow; exact approved staging
  invitation or recovery email; callback/password/MFA/admin acceptance;
  read-only delivery and Auth-state confirmation.
- **Prohibited actions:** unapproved recipients, production email/Auth,
  recording action URLs/codes/passwords/TOTP secrets, membership self-service,
  or altering shared SMTP/DNS unless separately scoped.
- **Required inputs and approvals:** recipient list and roles stored safely;
  operator actor; agreed test window; one-send approval per message if required.
- **Acceptance criteria:** each intended identity has exactly one active role;
  invite/recovery reaches the verified staging hostname; replay/forgery fails;
  AAL1 is rejected; AAL2 reaches Starter-accessible protected areas while
  Programs/Tryouts correctly remain unavailable before billing; no extra
  identity, membership, session, or factor remains.
- **Verification commands/evidence:** safe provider message IDs/statuses;
  membership/audit counts; factor status without secret; callback host;
  protected-route results; no secret-bearing screenshots.
- **Rollback expectations:** remove unintended membership, revoke unexpected
  sessions/factors, expire links, and document whether an Auth user is retained
  for retry or removed through the audited operator boundary.
- **Exact hosted-mutation boundary:** named staging Auth users, memberships,
  audit rows, sessions/factors, and approved email sends only.
- **Expected documentation updates:** `STAGING-ACCEPTANCE.md`, `STATUS.md`,
  `HANDOFF.md`.

## Phase 6 — Staging Acceptance and Billing Rehearsal

### DCFC-601 — Staging Stripe and lifecycle rehearsal

- **Objective:** prove the real owner Checkout/webhook/Portal and lifecycle
  behavior for Diverse City in Stripe test mode, using the existing
  $75/month test Price (`price_1U0Y0sK6WajTkwHYnnttR9nN`) without creating
  new Prices.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-504` complete; `PLAT-102` complete; existing test
  Price/Portal/webhook reverified; fresh explicit `DCFC-601` approval.
- **Permitted actions:** one approved test-mode Checkout; webhook projection;
  Portal access; grace/suspension/reactivation scenarios; duplicate/stale/
  foreign rejection; restore the agreed final staging state.
- **Prohibited actions:** Price creation/change, live-mode Stripe, direct
  subscription creation, production webhook, real charge, or using a
  client-supplied Price (Checkout accepts none — see `PLAT-102` evidence).
- **Required inputs and approvals:** approved test payer; the existing test
  Price (no tier selection — Diverse City has exactly one negotiated Price);
  test webhook; expected final tenant state; per-package approval.
- **Acceptance criteria:** exactly one canonical test subscription projection
  named to Diverse City; the club's `stripe_price_id` alone drives Checkout;
  duplicate/stale/foreign events fail closed; `paid_through + 20` grace,
  automatic suspension, and reactivation behavior matches `PLAT-D006`/`D007`;
  content editing remains available through grace per `PLAT-D024`; tenant
  returns to the approved staging state; reconciliation is exact.
- **Verification commands/evidence:** owner application flow, following the
  `PLAT-102` Bravo acceptance pattern (real Checkout/webhook/Portal, the
  six-call lifecycle matrix, Healthchecks proof) as the template. The Phase 7
  tier-era Stripe/lifecycle scripts remain retired and must not be used.
- **Rollback expectations:** use test-mode Portal/cancellation and canonical
  webhook projection; restore lifecycle through audited tooling; never delete
  ledger evidence or edit projection tables ad hoc.
- **Exact hosted-mutation boundary:** Stripe test-mode Customer/Checkout/
  Subscription/Portal events plus named staging projection/lifecycle rows for
  Diverse City only.
- **Expected documentation updates:** `STAGING-ACCEPTANCE.md`, `STATUS.md`,
  `HANDOFF.md`.

### DCFC-602 — Staging public/admin and tenant-isolation acceptance

- **Objective:** prove complete Diverse City staging behavior — full content
  availability once billing is active — and Alpha/Bravo/Diverse City
  isolation at desktop and mobile.
- **Action class:** Class 3 — hosted mutation because protected write probes
  and their restoration are required.
- **Dependencies:** `DCFC-601` complete; fresh explicit `DCFC-602` approval.
- **Permitted actions:** approved tenant-scoped edit/read/restore probes;
  browser/HTTP/RSC/cache/media/accessibility checks; runtime-log reads.
- **Prohibited actions:** destructive lifecycle/billing probes, production,
  publication, indexing, cross-tenant data reads outside expected denials, or
  leaving test content behind.
- **Required inputs and approvals:** test identities; exact before-state
  snapshot; approved temporary values; screenshot/log evidence location.
- **Acceptance criteria:** every non-billing row in `STAGING-ACCEPTANCE.md`
  passes; Contact, Programs, and Tryouts are all available to club editors at
  aal1 once `public_access` is `live` or `grace` — no tier-gated availability
  remains, per `PLAT-D018`; Alpha/Bravo/DCFC reads and writes remain isolated;
  all temporary values are restored and reconciled; public/admin surfaces
  show no prohibited data path.
- **Verification commands/evidence:** staging-targeted Playwright suite (after
  adapting local-only credentials safely); HTTP/header/cache probes; exact RLS
  denial signatures; before/after row and presentation digests; runtime logs.
- **Rollback expectations:** restore all content/presentation pointers from the
  before-state snapshot; revoke test sessions if unexpected; archive/detach the
  tenant if isolation cannot be re-established.
- **Exact hosted-mutation boundary:** temporary writes and reads only within
  Alpha/Bravo/DCFC staging rows explicitly named by the test plan; zero
  production, Stripe, DNS, Bunny, or email mutation.
- **Expected documentation updates:** `STAGING-ACCEPTANCE.md`, `STATUS.md`,
  `HANDOFF.md`.

### DCFC-603 — Staging gate review and production eligibility

- **Objective:** review all staging evidence, unresolved issues, mutation
  reconciliation, and rollback readiness before any production inspection.
- **Action class:** Class 1 — read-only planning and inspection.
- **Dependencies:** `DCFC-601` and `DCFC-602` complete.
- **Permitted actions:** evidence review, safe log/metadata reads, documentation,
  and Christian acceptance/rejection.
- **Prohibited actions:** production access or starting `DCFC-701` implicitly.
- **Required inputs and approvals:** completed staging checklist, zero
  unresolved security/data-integrity issue, and Christian's staging acceptance.
- **Acceptance criteria:** staging gate is explicitly accepted; final staging
  state and mutation counts reconcile; production blockers and exact next step
  are recorded.
- **Verification commands/evidence:** link/ID audit; final hosted state reads;
  local broad test/build result from the release; `git diff --check`.
- **Rollback expectations:** if rejected, mark the relevant package blocked and
  execute only its approved rollback; production remains untouched.
- **Exact hosted-mutation boundary:** zero.
- **Expected documentation updates:** `STAGING-ACCEPTANCE.md`, `STATUS.md`,
  `HANDOFF.md`.

## Phase 7 — Production Go/No-Go Package

### DCFC-701 — Production read-only preflight and backup baseline

- **Objective:** record current production schema, deployment, tenant, Auth,
  Storage, billing, domain, capacity, monitoring, and recoverable backup state.
- **Action class:** Class 1 — read-only planning and inspection.
- **Dependencies:** `DCFC-603` complete; explicit read-only production access
  approval where needed.
- **Permitted actions:** least-privilege metadata/list/log reads, backup-status
  checks, safe HTTP/DNS probes, and restricted evidence export.
- **Prohibited actions:** linking/applying migrations, deployment, provisioning,
  invitations, uploads, Stripe actions, DNS, or configuration changes.
- **Required inputs and approvals:** exact production project/ref/account,
  read-only method, restricted evidence location, and rollback owner.
- **Acceptance criteria:** current baselines and restorable backups are proven;
  Rose City remains healthy; no identifier/environment ambiguity exists;
  resource capacity supports the new tenant.
- **Verification commands/evidence:** migration-list comparison; Supabase
  backup/schema/Auth/Storage counts; Vercel deployment/domain/env-name record;
  Stripe Product/Price/webhook metadata read; DNS/HTTP/log baselines.
- **Rollback expectations:** none; no state changes.
- **Exact hosted-mutation boundary:** zero.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `STATUS.md`, `HANDOFF.md`.

### DCFC-702 — Local production cutover and rollback rehearsal

- **Objective:** replay the exact production-target manifest locally against
  the release migration set and prove import, acceptance, rollback, and replay.
- **Action class:** Class 2 — local rehearsal or verification.
- **Dependencies:** `DCFC-701` complete; immutable staging-accepted manifest.
- **Permitted actions:** loopback-only schema reset/import; offline
  normalization; local DNS/host simulation; browser and test execution.
- **Prohibited actions:** hosted credentials/resources, email, live Stripe,
  deploy, or DNS.
- **Required inputs and approvals:** production-target identifiers represented
  safely in the plan; current release commit; backup/rollback manifests.
- **Acceptance criteria:** deterministic digests match staging-approved input;
  all counts/checksums/relationships/presentation state reconcile; rollback
  leaves Alpha/Bravo/local Rose City intact; replay is identical.
- **Verification commands/evidence:** same full local gate as `DCFC-403`, plus
  representative Rose City and Diverse City browser checks and route/cache
  isolation.
- **Rollback expectations:** exact tenant-scoped reset/restore is executed and
  evidenced during the rehearsal.
- **Exact hosted-mutation boundary:** zero; loopback only.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `STATUS.md`, `HANDOFF.md`.

### DCFC-703 — Production go/no-go and mutation approval packet

- **Objective:** make the production sequence reviewable as three separate
  approvals, with exact targets, diffs, evidence, stop conditions, and owners.
- **Action class:** Class 1 — read-only planning and inspection.
- **Dependencies:** `DCFC-701` and `DCFC-702` complete.
- **Permitted actions:** assemble/check evidence and request decisions.
- **Prohibited actions:** any production mutation or treating go/no-go review as
  approval for `DCFC-801`–`DCFC-903`.
- **Required inputs and approvals:** complete cutover checklist; proposed
  maintenance window; rollback authority; package-by-package approval wording.
- **Acceptance criteria:** Christian records go/no-go; `DCFC-801`, `DCFC-802`,
  and `DCFC-803` remain separately approval-gated; all stop conditions have a
  named response.
- **Verification commands/evidence:** cross-check commit/deployment/migration/
  manifest digests and all safe identifiers; `git diff --check`.
- **Rollback expectations:** a no-go leaves production unchanged and returns
  the relevant prerequisite to `blocked`.
- **Exact hosted-mutation boundary:** zero.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `DECISIONS.md`, `STATUS.md`, `HANDOFF.md`.

## Phase 8 — Establish Production Private Preview

### DCFC-801 — Production release and private tenant provisioning

- **Objective:** deploy/apply the reviewed release and provision Diverse City
  as a non-public, non-indexed production tenant on an approved private host.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-703` go; fresh explicit `DCFC-801` approval.
- **Permitted actions:** apply reviewed migrations to the exact production ref;
  deploy the exact release; provision approved tenant/domain as
  `onboarding`/`preview` with the operator workflow's pre-billing Starter tier;
  verify audit and tenant resolution.
- **Prohibited actions:** content/media import, invitations/email, Stripe,
  final public DNS, `live` access, or indexing.
- **Required inputs and approvals:** exact release/migrations, tenant identity,
  private hostname, production operator, verified backups, package approval.
- **Acceptance criteria:** Rose City regression remains green; migrations and
  deployment match; Diverse City is Starter/onboarding/preview,
  private/non-indexed, and isolated; unknown hosts fail closed.
- **Verification commands/evidence:** migration/schema lint; deployment ID and
  logs; tenant/domain/audit reads; Rose City smoke; private-host HTTP/header
  checks.
- **Rollback expectations:** redeploy prior release; keep additive migrations
  unless reviewed rollback exists; archive/detach the empty tenant if needed.
- **Exact hosted-mutation boundary:** production Supabase migrations/tenant/
  private domain and Vercel production deployment/alias only.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `STATUS.md`, `HANDOFF.md`.

### DCFC-802 — Production content, media, and presentation import

- **Objective:** import the staging-accepted immutable manifest into the
  private production tenant and reconcile it exactly.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-801` complete; fresh explicit `DCFC-802` approval.
- **Permitted actions:** scoped production Database/Storage/presentation writes
  and compensating cleanup defined by the immutable ledger.
- **Prohibited actions:** unapproved content/video, Auth/email, Stripe, public
  DNS/access, indexing, Rose City mutation, or broad cleanup.
- **Required inputs and approvals:** plan/source/output digests, tenant UUID,
  pre-import backup, object budget, package approval.
- **Acceptance criteria:** exact table/relationship/object/checksum/reference/
  presentation reconciliation; private desktop/mobile render; no prohibited
  data/URL; idempotent replay result.
- **Verification commands/evidence:** importer ledger; scoped readbacks;
  Storage checksum/HTTP checks; published document digest; runtime logs;
  Rose City unchanged evidence.
- **Rollback expectations:** restore pre-import pointers/state, compensate only
  ledger-created objects/rows, and archive/detach if full compensation fails.
- **Exact hosted-mutation boundary:** named Diverse City production content,
  media, and presentation resources only.
- **Expected documentation updates:** `CONTENT-MEDIA-READINESS.md`,
  `PRODUCTION-CUTOVER-ROLLBACK.md`, `STATUS.md`, `HANDOFF.md`.

### DCFC-803 — Production private Auth and admin acceptance

- **Objective:** establish approved memberships and prove production invitation
  or recovery, password, MFA, and private-preview access before billing or
  public domain cutover.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-802` complete; recipient availability; fresh explicit
  `DCFC-803` and per-message approval.
- **Permitted actions:** approved memberships/Auth email/session/factor flow;
  private-host admin edits with exact restoration; browser/log verification.
- **Prohibited actions:** unapproved identity, secret/link capture, Stripe,
  final DNS/public access, indexing, or changing shared SMTP.
- **Required inputs and approvals:** approved recipients/roles, private
  callback hostname, before-state content digest, package/message approvals.
- **Acceptance criteria:** exact memberships; delivery/callback/password/MFA
  pass; AAL1 rejected; pre-billing Starter state correctly withholds Pro-only
  Programs/Tryouts mutations while authorized private preview works; Rose City
  and all tenants remain isolated; private host remains non-indexed. Full Pro
  editor acceptance is deferred until canonical billing activates Pro.
- **Verification commands/evidence:** safe message IDs/status; Auth/membership/
  audit/factor reads; desktop/mobile private acceptance; before/after digests;
  runtime logs.
- **Rollback expectations:** remove unintended membership, revoke unexpected
  sessions/factors, restore content, and detach/archive on security failure.
- **Exact hosted-mutation boundary:** named Diverse City production Auth/
  membership/audit/session/factor/email and temporary content probes only.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `STATUS.md`, `HANDOFF.md`.

## Phase 9 — Billing, Domain, and Public Launch

### DCFC-901 — Owner Checkout and canonical live billing activation

- **Objective:** activate the tenant through the existing owner Checkout and
  webhook projection using an approved existing standard live Pro Price.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-803` complete; `DCFC-D115` resolved; fresh explicit
  `DCFC-901` approval and owner participation.
- **Permitted actions:** reverify live Product/Price mapping; owner initiates
  first Checkout; canonical webhook applies Customer/subscription metadata and
  tenant projection; Portal and entitlement reads.
- **Prohibited actions:** creating/changing a Product or Price, agent-created
  subscription, manual projection-table edits, unknown/grandfathered Price,
  refund/cancel/tier change, or test/live mixing.
- **Required inputs and approvals:** approved existing Pro Price, billing
  contact/owner, payment authorization, expected amount/cadence, webhook, and
  package approval.
- **Acceptance criteria:** exactly one Customer/subscription with correct
  environment/club metadata; canonical event applied once; Pro tier and paid/
  trialing state project correctly; Portal opens; Programs/Tryouts editors now
  authorize the owner/admin at AAL2 and an approved edit/read/restore probe
  passes; amount/cadence/cancellation match the owner's approval.
- **Verification commands/evidence:** safe Stripe IDs and canonical reads;
  webhook ledger; `club_subscriptions` and runtime state; duplicate replay
  idempotency; no secret/full payload capture.
- **Rollback expectations:** use the approved Stripe/customer workflow and
  canonical webhook state, not direct database edits; public access remains
  disabled while billing discrepancies are resolved.
- **Exact hosted-mutation boundary:** existing live Stripe Checkout-created
  Customer/subscription and named Diverse City billing projection only; no
  Product/Price/webhook configuration changes.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `STATUS.md`, `HANDOFF.md`.

### DCFC-902 — Final domain, DNS, and Auth callback attachment

- **Objective:** attach and verify the approved public hostname(s), tenant
  domain rows, and Auth callback allowlist while retaining private access and
  `noindex, nofollow`.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-901` complete; DNS ownership/records/TTL approved;
  fresh explicit `DCFC-902` approval.
- **Permitted actions:** Vercel domain attachment; exact DNS record changes;
  verified production domain rows; exact Auth Site URL/redirect additions if
  architecture requires them; read-back and HTTP/DNS validation.
- **Prohibited actions:** unrelated/root mail DNS, nameserver change, Stripe,
  `public_access=live`, removing `noindex`, or deleting the private rollback
  alias.
- **Required inputs and approvals:** exact apex/www/subdomain choice, DNS
  provider/owner, records, pre-change export, TTL, callback list, maintenance
  window, and package approval.
- **Acceptance criteria:** authoritative DNS and Vercel verification pass;
  each hostname maps only to Diverse City; callbacks are exact; unknown/spoofed
  hosts fail; site remains preview/private and non-indexed.
- **Verification commands/evidence:** before/after DNS, Vercel domain, database
  domain, callback, TLS, HTTP/header, and unknown-host evidence.
- **Rollback expectations:** restore exact prior DNS; deactivate new domain
  rows/aliases/callbacks; retain private validation alias; reverify propagation.
- **Exact hosted-mutation boundary:** named Diverse City DNS records, Vercel
  domains, `club_domains`, and exact Auth URL configuration only.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `STATUS.md`, `HANDOFF.md`.

### DCFC-903 — Public launch with indexing retained off

- **Objective:** enable public access for the paid/trialing tenant after final
  smoke checks, while explicitly retaining `noindex, nofollow`.
- **Action class:** Class 3 — hosted mutation.
- **Dependencies:** `DCFC-902` complete; final launch checklist; fresh explicit
  public-launch approval distinct from indexing approval.
- **Permitted actions:** set approved lifecycle/runtime public state through
  audited/canonical tooling; final cache/domain/public/admin/media/billing
  checks; begin observation.
- **Prohibited actions:** removing robots gates, new content/media, billing
  changes, DNS expansion, source deletion, or rollback-target retirement.
- **Required inputs and approvals:** launch time, approver, on-call/rollback
  owner, accepted private evidence, canonical paid/trialing state.
- **Acceptance criteria:** public routes are healthy at desktop/mobile; tenant,
  cache, media, Auth, and billing isolation pass; `X-Robots-Tag` and meta both
  remain `noindex, nofollow`; monitoring is active.
- **Verification commands/evidence:** HTTP/TLS/DNS, public/admin browser suite,
  media checks, canonical billing/runtime reads, logs, and robots evidence.
- **Rollback expectations:** on a stop condition, immediately execute
  `DCFC-1002`; retain evidence and do not improvise partial fixes during
  cutover.
- **Exact hosted-mutation boundary:** Diverse City lifecycle/runtime access and
  necessary cache/deployment observation only. Indexing remains unchanged.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `STATUS.md`, `HANDOFF.md`.

## Phase 10 — Observation, Rollback, and Closeout

### DCFC-1001 — Observation and reconciliation window

- **Objective:** monitor the approved window and reconcile public/admin/media/
  Auth/billing/domain/runtime behavior without changing product state.
- **Action class:** Class 1 — read-only planning and inspection.
- **Dependencies:** `DCFC-903` complete; `DCFC-D116` observation duration set.
- **Permitted actions:** scheduled/manual read-only probes, log/metric/provider
  reads, checksum/count reconciliation, issue triage, and documentation.
- **Prohibited actions:** silent fixes, content changes, cleanup/deletion,
  billing/DNS/Auth changes, or indexing.
- **Required inputs and approvals:** monitoring cadence, owners, thresholds,
  evidence location, rollback triggers.
- **Acceptance criteria:** each observation checkpoint is recorded; no
  unresolved severity-one/two, security, data-integrity, billing, media, or
  tenant-isolation issue remains; counts and canonical state stay stable.
- **Verification commands/evidence:** public route/media monitor; runtime logs;
  Stripe delivery/projection reads; Auth/delivery counts; DNS/TLS; database/
  Storage/presentation checksums; `noindex` evidence.
- **Rollback expectations:** any named stop condition makes `DCFC-1002` ready
  and blocks indexing.
- **Exact hosted-mutation boundary:** zero.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `STATUS.md`, `HANDOFF.md` at every checkpoint.

### DCFC-1002 — Conditional production rollback

- **Objective:** return Diverse City to the last verified private or detached
  state after a launch stop condition.
- **Action class:** Class 3 — hosted mutation; conditional package.
- **Dependencies:** a documented stop condition from `DCFC-903`/`DCFC-1001`;
  fresh explicit rollback approval unless the pre-approved emergency matrix
  explicitly authorizes the exact trigger/action.
- **Permitted actions:** set tenant preview/suspended state; restore prior
  deployment/domain/DNS/presentation/content pointers; compensate ledger-named
  new objects; canonical billing response approved for the incident.
- **Prohibited actions:** hard purge, deleting audit/Stripe ledgers, broad
  Storage cleanup, inventing a rollback, or changing unrelated tenants.
- **Required inputs and approvals:** trigger evidence, exact rollback target,
  owner, package/emergency approval, and communication plan.
- **Acceptance criteria:** public access stops safely; prior state is restored
  and reconciled; Rose City/other tenants remain healthy; incident and retry
  prerequisites are documented.
- **Verification commands/evidence:** lifecycle/domain/deployment/DNS/content/
  media/billing readbacks; HTTP/robots/cache probes; counts/checksums/logs.
- **Rollback expectations:** this package is the rollback. Forward retry is a
  new approval after root cause and rehearsal, never an automatic continuation.
- **Exact hosted-mutation boundary:** only exact Diverse City resources and
  pre-recorded rollback targets; no hard deletion.
- **Expected documentation updates:** `PRODUCTION-CUTOVER-ROLLBACK.md`,
  `STATUS.md`, `HANDOFF.md`, and a scoped incident record if needed.

### DCFC-1003 — Indexing approval and rollout closeout

- **Objective:** after a clean observation window, separately enable search
  indexing and close the epic with ongoing monitoring ownership.
- **Action class:** Class 3 for the robots/indexing change; documentation
  closeout is part of the same explicitly approved package.
- **Dependencies:** `DCFC-1001` accepted; `DCFC-1002` not required or fully
  resolved; `DCFC-D117` explicit indexing approval.
- **Permitted actions:** remove the Diverse City robots gates through the
  reusable tenant/presentation mechanism; deploy if required; verify crawler
  headers/meta/canonical/sitemap behavior; finalize evidence.
- **Prohibited actions:** indexing other previews/tenants, unrelated SEO/content
  changes, deleting rollback artifacts, or disabling monitoring.
- **Required inputs and approvals:** exact host, indexing date, final canonical
  URL, monitoring owner, package-specific approval.
- **Acceptance criteria:** only approved Diverse City public URLs become
  indexable; staging/private/unknown hosts remain noindex; canonical URLs and
  sitemap are tenant-correct; all ledger/handoff evidence is complete.
- **Verification commands/evidence:** HTTP header/meta/canonical/sitemap/robots
  probes on production, staging, private, and unknown hosts; deployment/log
  evidence; final link/ID and `git diff --check` review.
- **Rollback expectations:** restore `noindex, nofollow` and redeploy the prior
  verified configuration if scope or canonical behavior is wrong.
- **Exact hosted-mutation boundary:** Diverse City production robots/indexing
  configuration and required Vercel deployment only.
- **Expected documentation updates:** `DECISIONS.md`, all rollout checklists,
  `STATUS.md`, `HANDOFF.md`; mark `DCFC-EPIC-002` complete only with final
  evidence.

## Next Package Boundary

Phase 4 is complete. Do not assign `DCFC-501` until Christian supplies the
exact safe staging inputs required by `DCFC-D112` and `DCFC-D113` and then
separately authorizes the read-only hosted preflight. No Phase 4 approval rolls
forward to staging.
