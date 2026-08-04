# Diverse City FC Status

Completed epic: `DCFC-EPIC-001`

Completed epic status: `phase_3_complete`

Proposed rollout epic: `DCFC-EPIC-002`

Rollout epic status: `phase_5_complete`

Last updated: 2026-08-03

Current assignment: `PLAT-101`, approved by Christian on 2026-08-03 for exact
Supabase staging project `fxefqnoqxbezeccjvrsw`. Local implementation and
verification are complete and committed locally as `a797c60` (`Implement
PLAT-101 passwordless admin access`). The two checked-in PLAT-101 migrations and the
six-digit, 24-hour, code-only staging Auth configuration are applied and
verified. Christian separately approved the final PLAT-101 push through exact
commit `457280b`. `origin/staging` now points to that exact commit, and its
Git-triggered protected Preview deployment `dpl_GNkG2FYHNciomriQ3YtGkPyqzT8N`
is `READY`; hosted application acceptance is complete.
The approved operator account is in governed TOTP break-glass recovery: its one
session and unrevoked refresh token were revoked, then its sole inaccessible
verified factor was removed. The configured user remains active with zero
sessions or factors. Two private replacement attempts exposed and safely rolled
back local handling incompatibilities with Supabase Auth's current SVG data
URL. The helper now opens that data URL directly in a private temporary viewer;
Christian then privately enrolled and verified exactly one replacement factor
at AAL2. A read-only aggregate confirms one verified factor and zero unresolved
factors or sessions. The guarded operator verifier subsequently proved AAL1
refusal, fresh-AAL2 acceptance, and acceptance-session revocation. Exactly one
sanitized system recovery audit was appended and read back. Operator recovery
and hosted operator acceptance are complete.
Christian approved the bounded hosted acceptance pass, but its ISP scope still
contained the literal placeholder `[ISP DOMAIN]`. Christian then explicitly
waived that ISP-hosted check as an accepted, disclosed residual risk because no
mailbox is available; it is not a pass. The guarded operator verifier, hosted
owner, Yahoo delivery, and unknown-address negative evidence are complete.
Christian explicitly waived AOL as well as ISP-hosted delivery; both are
waived, not passed. The single approved unknown-address request displayed the
explicit no-account state, was rejected by Auth with `otp_disabled`, and
created no matching user, session, refresh token, or email delivery.
The protected Alpha alias was separately approved and repointed from the older
password/MFA Preview to the approved exact-`16b2a21` PLAT-101 Preview. Fresh
CLI and browser verification passed. Yahoo email delivery, code verification,
protected Alpha admin access, and owner-only Team-access denial now pass;
hosted owner OTP/UI acceptance also passes. AOL is waived, not passed. The sole
active Alpha owner had mapped to the non-deliverable synthetic Phase 7
`example.com` identity, so owner
acceptance required a separately approved ownership transfer. Christian has now
approved the exact transfer to the existing configured operator identity; the
read-only baseline matched, fresh private AAL2 proof passed, and the guarded
atomic transfer plus independent reconciliation are complete.
`DCFC-601` and `DCFC-602` remain unstarted and are
`PLAT-103` scope; the media-cleanup heartbeat remains prohibited.
Christian's local manual acceptance also exposed and closed three UI edges: an
immediate removed-admin re-add now reports the provider's one-minute email
cooldown clearly, and the admin sidebar now has an independently scrollable,
viewport-bounded navigation region on both desktop and mobile. A newly added
administrator who requests another code during that cooldown now goes directly
to code entry and can use the valid onboarding code already sent.

Prior assignment: `DCFC-504` and Phase 5 are complete. Christian recovered
the browser-saved password privately, enrolled exactly one TOTP factor, reached
AAL2, and loaded the protected Diverse City admin. Contact loaded at the
Starter boundary, Programs and Tryouts remained Pro-gated, and the owner-only
Payments route loaded in private-preview state without changing billing. The
temporary synthetic owner membership was then marked removed with the required
operator audit while its pre-existing Auth user was retained. Final
reconciliation is eight Auth users, exactly one active Diverse City owner, one
removed synthetic owner membership, one verified TOTP factor, one AAL2 session,
zero AAL1 sessions, and 29 tenant audits. `DCFC-601` requires a fresh approval;
Vercel, Stripe, DNS, production, Bunny.net, Phase 6, commit, and push remain
excluded.

Bunny.net is outside Phase 5 and is not authorized by this goal. Diverse City
continues to use the crest-led hero with the vertical video story hidden. Do
not access Bunny credentials, create a library, upload video, add provider
references, or add a Diverse City-specific branch. Video must be implemented
later as a reusable tenant-safe platform capability. If initial-launch video
becomes required, scope and accept that capability after Phase 5 and before
Phase 6 acceptance; otherwise finish and stabilize the production rollout
before integrating Bunny.

The proposed packet contains seven phases (`4`–`10`) and 23 dependency-scoped
packages covering input readiness, protected staging, staging acceptance,
production preflight/rehearsal, production private preview, billing/domain/
public launch, observation/rollback, and separately approved indexing. It is
defined in `ROLLOUT-EPIC.md`, `ROLLOUT-WORK-PACKAGES.md`,
`CONTENT-MEDIA-READINESS.md`, `STAGING-ACCEPTANCE.md`, and
`PRODUCTION-CUTOVER-ROLLBACK.md`. Planning hosted-mutation count: zero.

**The suite is GREEN — 681/681 passing across 71 files.** `DCFC-304` adds
reusable Programs overview/detail, Contact, and Tryouts public routes; real
AAL2 admin-to-anonymous-public database acceptance; Alpha/Bravo isolation;
published `academy@1` persistence; and repeatable desktop/mobile public and
protected-admin browser evidence.

The 2026-08-01 audit remains below as the historical record of the two gaps it
found. Both are now closed: `academy@1` has the same pinned-document precedent
as `cinematic@1`/`clubhouse@1`, and `bebas-inter` accepts `academy@1` as the
universal fallback per `DCFC-D110`.

## Mandatory Update Rule

Every agent must update this file before ending work, regardless of whether the
assigned package is complete, still in progress, or blocked.

The update must include completed work, files changed, verification, blockers,
the exact next step, and hosted-mutation evidence. A chat summary alone does
not satisfy the handoff requirement.

## Package Ledger

| Package | Status | Assigned agent | Dependency state | Evidence or next step |
| --- | --- | --- | --- | --- |
| PLAT-101 | complete | Codex | Local, staging, operator, owner, admin, Yahoo, and unknown-address acceptance complete; AOL and ISP-hosted delivery explicitly waived, not passed | No PLAT-101 work remains. Fresh exact approval is required before PLAT-102, DCFC-601, or DCFC-602. |
| DCFC-001 | complete | Claude Code (Sonnet 5) | DCFC-D101 accepted 2026-07-31 | `/contact` implemented, verified, and approved by Christian on 2026-07-31 |
| DCFC-002 | complete | Claude Code (Sonnet 5) | DCFC-D102 partially resolved (URL, nav placement, and layout approved 2026-07-31; age/eligibility/dates/location/cost still TBA) | `/tryouts` implemented, verified, and approved by Christian on 2026-07-31 |
| DCFC-003 | complete | Claude Code (Sonnet 5) | DCFC-001 (done) and DCFC-002 (done) | Pinned local commit `5bbdfa3` (includes dedicated Date card); full evidence in `VISUAL-ACCEPTANCE.md` |
| DCFC-101 | complete | Claude Code (Sonnet 5) | DCFC-003 done | Field-level inventory complete in `CONTENT-MATRIX.md`; 2 provenance flags need Christian's confirmation |
| DCFC-102 | complete | Claude Code (Sonnet 5) | DCFC-101 done | Full gap analysis in `PLATFORM-GAP-ANALYSIS.md` |
| DCFC-103 | complete | Claude Code (Sonnet 5), Claude Code (Opus 5) | DCFC-003 (done), DCFC-101 (done), DCFC-102 (done) | Approved by Christian 2026-07-31 (`DCFC-D109`); `DOMAIN-DESIGN.md` is `approved`, `onzio-platform-plan.md` Video Pipeline section accepted. **Phase 1 gate closed.** |
| DCFC-201 | complete | Claude Code (Opus 5) | DCFC-103 complete | 32 contracts added across 2 new files; 27 intentionally red, 5 green. Existing 549 all still pass. **Suite is now deliberately red — that is this package's deliverable.** |
| DCFC-202 | complete | Claude Code (Opus 5) | DCFC-201 complete | Migration `20260801120000_phase11_diverse_city_domains.sql` creates all four tables with RLS, grants, audit/updated-at triggers, and composite tenant keys. 24 of the 27 red contracts now pass. Also resolved PF-003. |
| DCFC-203 | complete | Codex | DCFC-201 and DCFC-202 complete | Registry work audited and completed: pinned production `academy@1` document, `DCFC-D110` universal fallback fix, and bidirectional font-pack agreement contract; 583/583 full suite green. |
| DCFC-204 | complete | Codex | DCFC-202 and DCFC-203 complete | Typed tenant-scoped public reads, strict protected mutation schemas, safe external-link handling, and real local-DB boundaries verified; **Phase 2 gate closed.** |
| DCFC-301 | complete | Codex | DCFC-204 complete | Programs list/create/edit/reorder/media workflow complete; direct Storage entitlement bypass fixed and verified at RLS |
| DCFC-302 | complete | Codex | DCFC-204 complete | Shared profile/page ownership editor, validation, secure Contact hero media, and Starter AAL2 RLS evidence complete |
| DCFC-303 | complete | Codex | DCFC-204 complete | Multi-event Tryouts editor, public-safe state/URL validation, Pro entitlement, secure media, and real local RLS evidence complete |
| DCFC-304 | complete | Codex | DCFC-301, DCFC-302, and DCFC-303 complete | Admin edits reach tenant-scoped public routes; Alpha/Bravo isolation, desktop/mobile public/admin, local DB, build, and full gates are green; **Phase 3 complete** |

## Proposed Rollout Package Ledger

No row below is authorized by this planning packet. `pending` means defined but
unassigned and unapproved.

| Package | Class | Status | Dependencies | Evidence or next step |
| --- | --- | --- | --- | --- |
| DCFC-401 | 1 | complete | Approved baseline and rights/current-fact attestation received 2026-08-01 | Every route/content row has an approved keep/hide/empty disposition and evidence owner |
| DCFC-402 | 1 | complete | `DCFC-D114` accepted; rights confirmed 2026-08-01 | All 42 sources inventoried; ten retained assets have tenant-safe destinations; unsupported/video inputs are excluded |
| DCFC-403 | 2 | complete | 401, 402 complete | Byte-identical plan, idempotent loopback import, exact tenant reset/replay, reconciliation, isolation, and browser evidence are green |
| DCFC-404 | 1 | complete | 401–403 complete | Local artifact locked; unsupplied hosted inputs explicitly deferred; no staging authorization granted |
| DCFC-501 | 1 | complete | 404 complete; preflight and remediation separately approved | Restricted backup, history-only canonical repair, atomic bypass/test-webhook rotation, and full staging acceptance re-run completed 2026-08-02; stopped before `DCFC-502` |
| DCFC-502 | 3 | complete | 501 complete; exact approval received and exhausted | Exact release/migrations deployed; one private Starter/onboarding/preview tenant/domain provisioned and reconciled |
| DCFC-503 | 3 | complete | 502 complete; exact tenant/digest approval received and exhausted | Ten normalized assets, approved content, and immutable published `academy@1` reconcile; replay is idempotent |
| DCFC-504 | 3 | complete | Exact new-identity remediation approved and exhausted | Password/TOTP/AAL2, Starter/Pro and owner-billing boundaries, audited synthetic-owner removal, and final one-owner reconciliation passed; **Phase 5 complete** |
| DCFC-601 | 3 | pending | 504 + fresh approval | Stripe test/lifecycle rehearsal and canonical Pro projection |
| DCFC-602 | 3 | pending | 601 + fresh approval | Staging public/admin/isolation acceptance with restored probes |
| DCFC-603 | 1 | pending | 601, 602 | Staging gate review and Christian acceptance |
| DCFC-701 | 1 | pending | 603 | Production read-only preflight and backup baseline |
| DCFC-702 | 2 | pending | 701 | Local production cutover/rollback rehearsal |
| DCFC-703 | 1 | pending | 701, 702 | Production go/no-go and mutation approval packet |
| DCFC-801 | 3 | pending | 703 + fresh approval | Production release and private tenant provisioning |
| DCFC-802 | 3 | pending | 801 + fresh approval | Production content/media/presentation import |
| DCFC-803 | 3 | pending | 802 + fresh approval | Production private Auth/admin acceptance |
| DCFC-901 | 3 | pending | 803, `DCFC-D115`, fresh approval | Owner Checkout and canonical live billing activation |
| DCFC-902 | 3 | pending | 901, `DCFC-D112`, fresh approval | Final domain/DNS/Auth callback attachment |
| DCFC-903 | 3 | pending | 902, `DCFC-D116`, launch-only approval | Public launch with indexing retained off |
| DCFC-1001 | 1 | pending | 903 | Observation and reconciliation window |
| DCFC-1002 | 3 | pending | Documented stop condition + rollback approval | Conditional production rollback; otherwise `not_required` |
| DCFC-1003 | 3 | pending | 1001 accepted, `DCFC-D117`, fresh approval | Indexing approval and rollout closeout |

## Completion Records

### 2026-08-03 — Five rollout decisions answered; price raised to $75 — Claude Code (Opus 5)

Agent: Claude Code (Opus 5). Class 1, documentation only. Hosted-mutation
count: zero. No package was started.

Christian answered the five rollout decisions carried since `DCFC-D118`, in one
pass. Recorded in `docs/phase-11/diverse-city/DECISIONS.md`:

- `DCFC-D112` — launch on an Onzio-controlled `*.vercel.app` hostname, **no
  custom domain at launch**. Onzio will buy and manage the club's domain,
  attached afterwards. This lifts `DCFC-902` out of the launch sequence and
  removes DNS propagation and domain-verification risk from the critical path.
- `DCFC-D113` — production provisions exactly one owner, no admins; the owner
  adds admins through the `PLAT-101` flow. Keeps `DCFC-803` to one account.
  Identity values remain outside Git; only the shape is recorded.
- `DCFC-D116` — 7-day observation window; Christian sole rollback authority;
  stop conditions are site down, incorrect billing state, or cross-tenant
  exposure.
- `DCFC-D117` — `noindex, nofollow` retained through launch; indexing stays a
  separate later approval at `DCFC-1003`.
- `DCFC-D119` — **price raised to $75/month** from $65, the difference covering
  the domain Onzio will purchase and manage.

`DCFC-D119` has consequences that were recorded rather than assumed, and two of
them need attention before `DCFC-901`:

- **`PLAT-D008` is superseded on price.** It is marked accordingly in
  `docs/phase-12/DECISIONS.md`. Its no-trial and no-`trialing` provisions are
  unchanged.
- **No live $75/month Stripe Price exists**, and the recorded $65/month Starter
  Price can no longer be reused. One must be created manually, because
  `PLAT-102`'s prohibited actions and the original `DCFC-D115` both forbid
  creating live Prices inside a package. This is currently an **unowned step
  with no home package** — opened as `DCFC-D120`.
- **Billing starts before the domain is delivered.** `DCFC-D112` defers the
  domain until after launch while the $75 price is justified by it, so when
  billing begins relative to domain delivery is an open commercial question —
  opened as `DCFC-D121`. Domain ownership on termination is likewise unpinned —
  opened as `DCFC-D122`.

`DCFC-D115` is therefore partly resolved: the price is settled, and its
remainder is split into `DCFC-D120`/`D121`/`D122` rather than closed.

Files changed: `docs/phase-11/diverse-city/DECISIONS.md`,
`docs/phase-12/DECISIONS.md`, this file, and `HANDOFF.md`. No application code,
schema, or test was touched.

Verification: `git status --short` clean after commit; `git diff --check` clean.
No identity value, address, or secret was recorded.

Exact next step: approve `PLAT-102` (the last substantial build), and settle
`DCFC-D120` — the live Price has no owning package and blocks `DCFC-901`.
Do not start `DCFC-601`/`DCFC-602`; they remain `PLAT-103` scope.

Hosted-mutation count: zero.

### 2026-08-03 — PLAT-101 final staging push and protected Preview — Codex

- **Package/status:** `PLAT-101`, `complete`; its final implementation,
  acceptance evidence, onboarding guidance, and accepted-risk correction are
  published through exact commit `457280b`.
- **Completed:** pushed only `457280b` to `origin/staging` using an exact SHA
  refspec. Git integration created Preview deployment
  `dpl_GNkG2FYHNciomriQ3YtGkPyqzT8N` for Vercel project
  `prj_I362ysmh9cse5cRxnL7db4dOhsEs`.
- **Files changed:** `HANDOFF.md` and this ledger only for the mandatory local
  hosted-mutation record. These evidence changes are not pushed.
- **Verification:** the remote `refs/heads/staging` resolves exactly to
  `457280b4439b9c6cad903359d4a19dccf26e644a`; the local branch matches the
  remote. Vercel reports the exact SHA on branch `staging`, target Preview,
  status `READY`, and deployment protection returns HTTP 302 to Vercel SSO with
  `x-robots-tag: noindex`.
- **Blockers:** none for `PLAT-101`.
- **Exact next step:** obtain fresh exact approval naming `PLAT-102` and its
  environment before beginning billing or entitlement work. Do not start
  `DCFC-601` or `DCFC-602` separately; they are `PLAT-103` scope.
- **Hosted mutations:** exactly one Git push advancing `origin/staging` from
  `16b2a21` to `457280b` and one Git-triggered protected Preview deployment.
  Zero Supabase, Auth, email, user, factor, session, database, configuration,
  production, Stripe, DNS, Storage, tenant-content, alias, or unrelated-identity
  mutations. No manual deployment command ran.

### 2026-08-03 — PLAT-101 hosted acceptance complete — Codex

- **Package/status:** `PLAT-101`, `complete`. Yahoo delivery passed. Christian
  explicitly waived AOL and ISP-hosted delivery; those two providers were not
  tested and must not be reported as passed.
- **Completed:** submitted exactly one approved synthetic unknown-address
  request through the protected Alpha login UI. The page displayed the pinned
  no-account state with retry and contact paths and never rendered code entry.
  This closes the last executable hosted acceptance gate after the already
  completed operator, owner, admin, and Yahoo journeys.
- **Files changed:** `HANDOFF.md`, this ledger,
  `docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md`,
  `scripts/enroll-operator-totp.ts`, `lib/operator/totp-qr.ts`, and
  `tests/contracts/platform-auth.test.ts`.
- **Verification:** digest-only preflight and postflight both found zero matching
  Auth users; postflight also found zero sessions and refresh tokens. Auth logs
  show one `/otp` response at HTTP 422 with `otp_disabled`, with no recovery or
  mail-success event. Final aggregate reconciliation shows one active Alpha
  owner, two active admins, one verified operator TOTP factor, one sanitized
  ownership-transfer audit, and zero remaining acceptance-user sessions or
  unrevoked refresh tokens. The final QR compatibility change is covered by
  21/21 focused auth contracts, 326/326 contracts, clean TypeScript, and the
  complete 681/681 loopback suite.
- **Blockers:** none for `PLAT-101`. The reduced delivery matrix is an explicitly
  accepted evidence limitation: Yahoo passed; AOL and ISP-hosted did not.
- **Exact next step:** no `PLAT-101` work remains. Do not start `PLAT-102`,
  `DCFC-601`, or `DCFC-602` without fresh exact approval. Do not extend the
  media-cleanup heartbeat. Keep all current closeout work local; do not push.
- **Hosted mutations:** this final negative check made one rejected Auth request
  and created no user, email, session, token, membership, or audit. Earlier
  approved PLAT-101 hosted actions and their exact counts remain recorded in the
  preceding entries. No deployment, configuration, production, Stripe, DNS,
  Storage, Bunny.net, tenant-content, or unrelated-identity mutation occurred.

### 2026-08-03 — PLAT-101 AOL delivery check waived — Codex

- **Package/status:** `PLAT-101`, `in_progress`; AOL delivery/admin acceptance is
  explicitly `waived`, not passed. ISP-hosted delivery is also waived; Yahoo is
  the only provider result passed.
- **Completed:** Christian explicitly chose to skip AOL acceptance and accept
  the disclosed deliverability-evidence gap.
- **Files changed:** `HANDOFF.md` and this ledger only.
- **Verification:** no AOL address was read or recorded and no AOL request was
  submitted. The protected owner Team-access page was loaded, but its
  add-administrator action was not used for AOL.
- **Blockers:** provider testing is closed by explicit waivers, not evidence.
  The approved hosted unknown-address negative request still needs to prove the
  explicit no-account message, zero Auth-user creation, and zero email delivery.
- **Exact next step:** Christian signs out the owner acceptance session. Run
  exactly one synthetic unknown-address request through the protected Alpha
  login UI, then reconcile no matching Auth user and no email.
- **Hosted mutations:** zero for this waiver. No AOL email, Auth identity,
  membership, session, audit, configuration, alias, deployment, push,
  production, Stripe, DNS, Storage, Bunny.net, or tenant-content mutation.

### 2026-08-03 — PLAT-101 hosted Alpha owner acceptance passed — Codex

- **Package/status:** `PLAT-101`, `in_progress`; hosted owner acceptance passes.
  AOL remains open; ISP-hosted delivery is waived, not passed.
- **Completed:** Christian signed out Yahoo, requested and verified the single
  approved owner OTP, entered the protected Alpha portal as the transferred
  owner, and confirmed `Team access` is visible.
- **Files changed:** `HANDOFF.md` and this ledger only.
- **Verification:** browser DOM independently shows Alpha FC, the protected
  owner navigation including `Team access` and `Payments`, the owner-only
  membership-management page, add-administrator form, and two expected active
  admins. Read-only Supabase reconciliation returns one active Alpha owner at
  the approved target, one recent target sign-in, one active target session,
  two active admins, and zero Yahoo sessions or unrevoked refresh tokens.
- **Blockers:** owner acceptance has none. AOL delivery and admin least-privilege
  acceptance remain open.
- **Exact next step:** Christian privately types the AOL mailbox in the preserved
  Team-access form without submitting. Run a hash-only read-only identity and
  membership preflight, then perform the single approved AOL code/admin/cleanup
  flow.
- **Hosted mutations:** one approved owner OTP email and one active owner Auth
  session were created. The Yahoo acceptance session was revoked by ordinary
  sign-out. Zero Auth identities, memberships, audits, factors,
  allowlist/configuration, aliases, deployments, pushes, production, Stripe,
  DNS, Storage, Bunny.net, or tenant-content mutations occurred in this step.

### 2026-08-03 — PLAT-101 Alpha ownership transfer complete — Codex

- **Package/status:** `PLAT-101`, `in_progress`; ownership transfer is complete.
  Hosted owner UI and AOL acceptance remain open; ISP-hosted delivery is waived,
  not passed.
- **Completed:** Christian privately produced the guarded verifier's sanitized
  success event proving AAL1 refusal, fresh TOTP-backed AAL2 acceptance, one
  verified factor, zero operator data mutations, and session revocation. Ran the
  approved ownership change as one exact-guard atomic transaction: added the
  approved target as owner, removed only the synthetic source membership,
  rechecked exactly one owner, and appended one sanitized
  `ownership_transferred` operator audit.
- **Files changed:** `HANDOFF.md` and this ledger only.
- **Verification:** independent hosted reconciliation returns one active Alpha
  owner at the approved target, one removed synthetic source owner, both Auth
  identities retained, two unchanged active admins, one transfer audit with the
  exact expected shape, and zero active operator sessions or unrevoked refresh
  tokens. The first transaction attempt failed before any mutation on unsupported
  `min(uuid)`; the corrected exact selector succeeded. The first read-only
  reconciliation had a text/UUID comparison mismatch; its corrected rerun
  passed.
- **Blockers:** ownership transfer has none. The new owner still needs the
  approved hosted OTP/UI check, Yahoo needs ordinary sign-out, and AOL delivery
  plus admin-boundary acceptance remains open.
- **Exact next step:** Christian signs out the accepted Yahoo admin session,
  signs in with the newly active Alpha owner mailbox, confirms `Team access`,
  then performs the bounded AOL delivery/admin check and cleanup.
- **Hosted mutations:** the fresh verifier sent one operator OTP, created one
  acceptance session, stepped it to AAL2, and revoked it. The atomic transfer
  inserted one target owner membership, marked one synthetic source owner
  membership removed, and wrote one ownership-transfer audit. Zero Auth identity,
  admin membership, factor, allowlist/configuration, alias, deployment, push,
  production, Stripe, DNS, Storage, Bunny.net, or tenant-content changes.

### 2026-08-03 — PLAT-101 Alpha ownership transfer approved/preflighted — Codex

- **Package/status:** `PLAT-101`, `in_progress`; transfer approved but not yet
  executed. Fresh private operator AAL2 proof is the remaining mutation gate.
- **Completed:** captured Christian's exact approval to transfer Alpha staging
  ownership from the synthetic Phase 7 owner to the existing configured
  operator identity while retaining both Auth identities, exactly one active
  owner, the allowlist, unrelated memberships, and one sanitized audit. Ran the
  read-only exact-target baseline.
- **Files changed:** `HANDOFF.md` and this ledger only.
- **Verification:** baseline returns one Alpha club, two matching active Auth
  identities, exactly one active owner matching the approved source, zero target
  Alpha memberships, and zero prior `ownership_transferred` audits. Local env is
  loopback-only and no hosted service-role secret will be requested or pasted.
- **Blockers:** the operator action requires fresh AAL2. The existing guarded
  verifier collects all email/TOTP inputs privately and revokes its own session.
- **Exact next step:** Christian privately runs
  `npm run operator:verify-staging-auth` and reports only its sanitized final
  event. Then execute one atomic exact-guard transaction through the connected
  staging control plane and reconcile exactly one approved target owner.
- **Hosted mutations:** zero. Read-only preflight only; no email, session, Auth
  user, membership, audit, factor, allowlist, configuration, alias, deployment,
  push, production, Stripe, DNS, Storage, Bunny.net, or tenant-content mutation.

### 2026-08-03 — PLAT-101 synthetic Alpha owner mapping found — Codex

- **Package/status:** `PLAT-101`, `in_progress`; hosted owner acceptance is
  blocked on a real owner mailbox. Yahoo passes; AOL remains open; ISP-hosted
  delivery is waived, not passed.
- **Completed:** performed a read-only Supabase lookup of the sole active Alpha
  owner's Auth email mapping.
- **Files changed:** `HANDOFF.md` and this ledger only.
- **Verification:** exactly one active, non-deleted Alpha owner maps to
  `onzio.phase7.alpha.owner@example.com`, the synthetic Phase 7 identity. The
  reserved `example.com` address cannot receive the owner OTP.
- **Blockers:** PLAT-101 ownership transfer is an operator-only action and was
  not authorized by the existing acceptance or alias approvals. A real target
  owner mailbox and separate exact hosted-mutation approval are required.
- **Exact next step:** Christian chooses the real Alpha owner mailbox. Prepare
  and approve a narrow operator ownership transfer that preserves exactly one
  active owner, then complete owner and AOL acceptance.
- **Hosted mutations:** zero. Read-only query only; no email, session, Auth user,
  membership, audit, factor, alias/configuration, deployment, push, production,
  Stripe, DNS, Storage, Bunny.net, or tenant-content mutation occurred.

### 2026-08-03 — PLAT-101 Yahoo hosted acceptance passed — Codex

- **Package/status:** `PLAT-101`, `in_progress`; Yahoo passes. Hosted Alpha owner
  and AOL acceptance remain open; ISP-hosted delivery is waived, not passed.
- **Completed:** Christian privately requested and received the single approved
  Yahoo email code, verified it, and entered the protected Alpha admin portal.
  Browser inspection confirms Alpha FC and the `Admin` role render while the
  owner-only `Team access` navigation is absent. That denial is the intended
  least-privilege boundary.
- **Files changed:** `HANDOFF.md` and this ledger only.
- **Verification:** protected browser DOM shows the Alpha admin dashboard and no
  Team-access link. Read-only Supabase reconciliation returns exactly one active
  Alpha owner, two active Alpha admins, and one recently signed-in active admin.
  The accepted Yahoo Auth identity and membership both pre-existed this pass.
- **Blockers:** Yahoo has none. The Yahoo session remains active until ordinary
  sign-out; owner login and AOL email/admin acceptance remain open.
- **Exact next step:** Christian signs out Yahoo, privately signs in as the
  configured Alpha owner and confirms `Team access`, then performs the bounded
  AOL delivery/admin check and cleanup.
- **Hosted mutations:** exactly one approved Yahoo OTP email and one Yahoo Auth
  session were created by the successful login. Zero Auth identities,
  memberships, audits, factors, aliases/configuration, deployments, pushes,
  production changes, Stripe, DNS, Storage, Bunny.net, or tenant-content
  mutations occurred. The session remains active pending sign-out.

### 2026-08-03 — PLAT-101 protected Alpha alias corrected — Codex

- **Package/status:** `PLAT-101`, `in_progress`; the alias blocker is resolved
  and hosted owner/admin plus Yahoo/AOL acceptance can resume.
- **Completed:** under Christian's separate exact approval, repointed only
  `alpha-onzio-staging.vercel.app` from stale Preview
  `dpl_GJbEfRwSagF6gNt2ESqwPSxZuzua` to already-built approved Preview
  `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF`.
- **Files changed:** `HANDOFF.md` and this ledger only.
- **Verification:** `vercel alias set` reported success. Fresh read-only
  inspection resolves the alias to `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF`, project
  `onzio-rcfc`, Preview, Ready. Reloading the protected Alpha Chrome tab shows
  the PLAT-101 passwordless copy and the unique “Send sign-in code” and “I
  already have a code” controls; the old password/MFA fields are absent.
- **Blockers:** no alias blocker remains. Private owner/admin login and Yahoo/AOL
  delivery evidence remain open; ISP-hosted delivery is waived, not passed.
- **Exact next step:** Christian privately submits the configured Alpha owner
  address and code in the preserved tab, then completes the bounded Yahoo and
  AOL membership/delivery checks and cleanup.
- **Hosted mutations:** exactly one Vercel Preview-alias reassignment, limited to
  `alpha-onzio-staging.vercel.app`. Zero deployments, pushes, production
  changes, other alias/configuration changes, Auth emails, identities, sessions,
  memberships, audits, factors, Stripe, DNS, Storage, Bunny.net, or
  tenant-content mutations occurred.

### 2026-08-03 — PLAT-101 protected Alpha alias mismatch found — Codex

- **Package/status:** `PLAT-101`, `in_progress`; hosted owner/admin and Yahoo/AOL
  acceptance are blocked on the protected Alpha alias serving the approved
  PLAT-101 Preview.
- **Completed:** used Christian's authenticated Chrome tab in the isolated
  `PLAT-101 hosted acceptance` group. Read-only Supabase reconciliation proved
  the hostname maps to the active Alpha staging tenant and the privately
  supplied Yahoo identity has exactly one active Alpha admin membership. After
  signing out the observed browser session, the login page exposed the retired
  password and club-MFA flow. No owner or provider OTP request was submitted,
  so Yahoo is not accepted and AOL was not attempted.
- **Files changed:** `HANDOFF.md` and this ledger only.
- **Verification:** read-only Vercel inspection shows
  `alpha-onzio-staging.vercel.app` resolves to older Ready Preview
  `dpl_GJbEfRwSagF6gNt2ESqwPSxZuzua`; approved exact-`16b2a21` Preview
  `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF` is Ready on the `staging` branch alias but
  not the protected Alpha alias. The browser's old login UI independently
  confirms the mismatch. No mailbox address, credential, code, token, session
  identifier, or Auth user identifier is recorded.
- **Blockers:** changing the alias is a Vercel configuration mutation excluded
  by the current hosted-acceptance approval. The stale alias prevents truthful
  PLAT-101 browser or provider acceptance.
- **Exact next step:** obtain fresh exact approval to repoint only
  `alpha-onzio-staging.vercel.app` from
  `dpl_GJbEfRwSagF6gNt2ESqwPSxZuzua` to already-built
  `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF`, without deploying or pushing. Verify the
  passwordless interface, then resume the private owner, Yahoo, and AOL matrix.
- **Hosted mutations:** one pre-existing browser session for the observed Yahoo
  identity was revoked through ordinary sign-out. Zero email sends, new Auth
  identities, membership changes, audits, factors, alias/configuration changes,
  deployments, pushes, production changes, Stripe, DNS, Storage, Bunny.net, or
  tenant-content mutations occurred.

### 2026-08-03 — PLAT-101 ISP-hosted delivery check waived — Codex

- **Package/status:** `PLAT-101`, `in_progress`; ISP-hosted delivery is
  explicitly `waived`, not passed. Hosted owner/admin and Yahoo/AOL acceptance
  remain open.
- **Completed:** Christian confirmed no ISP-hosted mailbox is available and
  explicitly accepted skipping that provider check while disclosing the
  limitation. Yahoo remains available and required; AOL remains required.
- **Files changed:** `HANDOFF.md` and this ledger only.
- **Verification:** no ISP delivery attempt occurred and none is claimed. The
  protected Alpha URL reached Vercel authentication in an isolated browser; an
  authenticated Chrome check was not used because it contained an unrelated
  existing app session.
- **Blockers:** the ISP mailbox is no longer a package blocker under Christian's
  explicit waiver. Hosted owner/admin browser behavior and Yahoo/AOL delivery
  still require private acceptance.
- **Exact next step:** Christian signs into Vercel in the isolated browser, then
  completes the protected Alpha owner/admin flow using Yahoo and AOL addresses
  and codes privately.
- **Hosted mutations:** zero. No email/Auth request, user, membership, audit,
  session, factor, configuration, deploy, push, production, Vercel project,
  Stripe, DNS, Storage, Bunny.net, or tenant-content change occurred.

### 2026-08-03 — PLAT-101 operator recovery and acceptance complete — Codex

- **Package/status:** operator TOTP break-glass recovery and hosted operator
  acceptance are complete; `PLAT-101` remains `in_progress` at hosted
  owner/admin and Yahoo/AOL acceptance. The separate ISP-hosted criterion was
  later explicitly waived, not passed.
- **Completed:** Christian privately ran the guarded staging verifier. Its
  sanitized result proves the real operator boundary refused AAL1, accepted
  fresh AAL2 only after TOTP step-up, observed exactly one verified factor,
  performed zero operator data mutations, and revoked the acceptance session.
  After a zero-match audit preflight, appended exactly one truthful `system`
  recovery event containing only the approved reference digest, aggregate
  before/after counts, pre-recovery session-revocation result, boundary-proof
  booleans, and recovered outcome.
- **Files changed:** `HANDOFF.md` and this ledger for closeout, alongside the
  still-uncommitted QR-viewer implementation and regression test.
- **Verification:** before the audit append, read-only reconciliation returned
  one configured user, zero sessions and unrevoked refresh tokens, exactly one
  verified TOTP factor, zero unresolved/other factors, and zero matching audit
  rows. The guarded append returned one inserted row. Independent readback
  returned the same Auth aggregate, exactly one matching audit, and `true` for
  its exact sanitized shape.
- **Blockers:** operator recovery has none. `PLAT-101` still lacks hosted
  owner/admin browser acceptance and Yahoo/AOL delivery. The separately recorded
  ISP waiver supersedes this checkpoint's former placeholder blocker.
- **Exact next step:** follow the newer protected-Alpha-alias record above, then
  run the private hosted owner/admin and Yahoo/AOL matrix. Do not start
  `PLAT-102`, `DCFC-601`, or `DCFC-602`.
- **Hosted mutations:** the verifier sent exactly one staging operator OTP
  email, created exactly one acceptance session, stepped it from AAL1 to AAL2,
  and revoked it. Appended exactly one sanitized `system` recovery audit. Final
  state is one verified TOTP factor, zero sessions, zero unresolved/other
  factors, and one matching recovery audit. No operator data mutation, user,
  allowlist, membership, configuration, deploy, push, production, Vercel,
  Stripe, DNS, Storage, Bunny.net, tenant-content, or unrelated-identity change.

### 2026-08-03 — PLAT-101 replacement operator TOTP enrolled — Codex

- **Package/status:** `PLAT-101`, `in_progress`; replacement enrollment is
  complete, while fresh operator-boundary verification and the recovery audit
  remain open.
- **Completed:** Christian privately reran `npm run operator:enroll-totp` and
  reported its exact safe AAL2 success status. Independently reconciled exactly
  one verified replacement TOTP factor, zero unresolved or other factors, and
  zero leftover sessions or refresh tokens for the active configured operator.
- **Files changed:** `HANDOFF.md` and this ledger for the checkpoint, in addition
  to the still-uncommitted private QR viewer correction already listed below.
- **Verification:** hosted read-only aggregate returned one configured user,
  one verified TOTP factor, and zero sessions, unrevoked refresh tokens,
  unresolved TOTP factors, or other factors.
- **Blockers:** the real operator gate still needs its approved AAL1 refusal,
  TOTP step-up, fresh-AAL2 success, and acceptance-session revocation proof. The
  single sanitized recovery audit must follow that proof, not precede it.
- **Exact next step:** Christian privately runs
  `npm run operator:verify-staging-auth` and reports only its safe final status.
  Then reconcile the session/factor aggregate and append exactly one approved
  sanitized recovery audit event.
- **Hosted mutations:** the successful retry sent one staging operator OTP
  email, created one temporary enrollment session and one replacement TOTP
  factor, verified exactly that factor, and revoked the enrollment session. The
  current state is exactly one verified factor and zero sessions. No user,
  allowlist, membership, tenant audit, configuration, deploy, push, production,
  Vercel, Stripe, DNS, Storage, Bunny.net, or tenant-content change occurred.

### 2026-08-03 — PLAT-101 operator TOTP QR viewer correction — Codex

- **Package/status:** `PLAT-101`, `in_progress`; recovery remains fail-closed
  with zero operator factors until the private replacement succeeds.
- **Completed:** diagnosed the first private replacement failure after email
  verification and `auth.mfa.enroll()` as a local data-URL parser gap. The first
  decoder correction still rejected the actual SVG body on the second private
  attempt. Both attempts automatically removed their unresolved factor and
  signed out their session. Replaced SVG-body parsing with Supabase's documented
  direct `<img>` usage: the helper HTML-escapes the populated SVG data URL into
  a mode-0600 temporary local page with a restrictive Content Security Policy,
  opens it locally, and removes it during cleanup.
- **Files changed:** `lib/operator/totp-qr.ts`,
  `scripts/enroll-operator-totp.ts`, `tests/contracts/platform-auth.test.ts`,
  this ledger, and `HANDOFF.md`.
- **Verification:** a read-only staging aggregate returned one matching active
  configured operator and zero sessions, unrevoked refresh tokens, verified
  factors, unresolved factors, or other factors after each attempt. The second
  red-first focused test failed 6/21 before the private viewer existed; the
  focused file now passes 21/21, contracts 326/326, TypeScript is clean, and the
  complete real-loopback suite passes 681/681 across 71 files.
- **Blockers:** replacement enrollment, fresh AAL1-refusal/AAL2-success proof,
  and the single sanitized recovery audit remain open. The hosted provider
  matrix also still lacks a named ISP domain.
- **Exact next step:** Christian privately reruns
  `npm run operator:enroll-totp` and reports only the safe final status. After
  successful enrollment, run `npm run operator:verify-staging-auth`, reconcile
  exactly one verified factor, and append the approved sanitized audit.
- **Hosted mutations:** across the two failed attempts, exactly two staging
  operator OTP emails were sent; each created one temporary operator Auth
  session and one unresolved TOTP factor, then revoked its session and deleted
  its factor during automatic cleanup. Current aggregate counts are zero. No
  verified factor, user,
  allowlist, membership, tenant audit, configuration, deploy, push, production,
  Vercel, Stripe, DNS, Storage, Bunny.net, or tenant-content change occurred.

### 2026-08-03 — PLAT-101 operator TOTP break-glass checkpoint — Codex

- **Package/status:** `PLAT-101`, `in_progress`; operator recovery is fail-closed
  between removal of the inaccessible factor and private replacement enrollment.
- **Completed:** under Christian's exact approval, confirmed the active configured
  staging operator by a non-reversible local-ID digest; recorded the approval and
  out-of-band identity-verification reference only as SHA-256
  `2b71d470293d9feed3a89dfbfd96dd6b8e3569e169cd9cd4d41e21037a0b69cb`;
  reconciled one active session, one unrevoked refresh token, exactly one verified
  TOTP factor, and zero unresolved/other factors; revoked the session and refresh
  token first; read both back at zero; removed only the sole verified factor; and
  read back zero sessions, unrevoked tokens, or factors while the user remains
  active.
- **Files changed:** this ledger and `HANDOFF.md` only for the checkpoint.
- **Verification:** exact project read returned active/healthy staging project
  `fxefqnoqxbezeccjvrsw`; pre- and post-mutation aggregate reads matched the
  approved counts. The first read-only hash included a newline and safely matched
  zero users. The first revocation transaction failed on `min(uuid)` before any
  delete; the corrected guarded transaction succeeded and was independently
  read back before factor removal.
- **Blockers:** replacement enrollment, fresh AAL1-refusal/AAL2-success proof,
  and the single sanitized recovery audit remain open. Operator functions remain
  unavailable until those steps pass.
- **Exact next step:** Christian privately runs
  `npm run operator:enroll-totp`, enters all values locally, and reports only the
  safe final status. Then run `npm run operator:verify-staging-auth`, append the
  approved recovery audit, and reconcile exactly one verified factor.
- **Hosted mutations:** deleted exactly one staging Auth refresh-token row, one
  staging Auth session row, and one verified TOTP factor. Zero email, new factor,
  user, allowlist, membership, tenant audit, configuration, deploy, push,
  production, Vercel, Stripe, DNS, Storage, Bunny.net, or tenant-content changes.

### 2026-08-03 — PLAT-101 hosted-acceptance verifier prepared — Codex

- **Package/status:** `PLAT-101`, still `in_progress` at hosted owner/admin/
  operator and Yahoo/AOL/ISP delivery acceptance.
- **Completed:** received bounded Alpha staging acceptance approval; stopped the
  ISP portion because the approval retained literal placeholder `[ISP DOMAIN]`;
  and added `npm run operator:verify-staging-auth`. The guarded interactive
  command pins project `fxefqnoqxbezeccjvrsw`, rejects secret/service-role keys,
  sends one email code, proves the real `assertOperator()` gate rejects AAL1,
  verifies the existing sole TOTP factor reaches fresh AAL2, proves the same
  gate accepts it, and signs out only that acceptance session without operator
  data mutation.
- **Files changed:** `scripts/verify-operator-staging-auth.ts`, `package.json`,
  `tests/contracts/platform-auth.test.ts`, this ledger, and `HANDOFF.md`.
- **Verification:** the focused source-level contract failed 1/15 before the
  command existed and passes 15/15 afterward; TypeScript is clean; contracts
  pass 320/320; the complete real-loopback suite passes 675/675 across 71 files;
  and diff checks are clean. A non-TTY smoke reached the interactive guard and
  stopped before any network request.
- **Blockers:** the approval does not yet name an actual ISP-hosted mailbox
  domain. No ISP recipient, full address, code, key, token, or factor identifier
  is recorded.
- **Exact next step:** Christian replaces `[ISP DOMAIN]` with the actual domain,
  then privately runs the guarded operator command and browser/provider matrix;
  reconcile only the authorized temporary memberships/identities/session and
  safe provider evidence. Do not start `PLAT-102`, `DCFC-601`, or `DCFC-602`.
- **Hosted mutations:** zero under the new acceptance approval. No email/Auth
  request, user, membership, audit, factor, session, Supabase configuration,
  deploy, push, production, Stripe, DNS, Storage, Bunny.net, or tenant content
  changed.

### 2026-08-03 — PLAT-101 exact staging push and protected deployment — Codex

- **Package/status:** `PLAT-101`, still `in_progress` at hosted application,
  fresh-AAL2 operator, and Yahoo/AOL/ISP delivery acceptance.
- **Completed:** pushed exact commit
  `16b2a21f9d6c879846d184501361da7dccfc9ce0` to `origin/staging`, advancing the
  remote from `8e3cde2`, and verified the resulting protected Preview deployment
  `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF` is `READY`. Vercel project ID
  `prj_I362ysmh9cse5cRxnL7db4dOhsEs` currently resolves to project name
  `onzio-rcfc`.
- **Files changed:** this ledger, `STAGING-ACCEPTANCE.md`,
  `docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md`, and `HANDOFF.md`, locally after
  the push; these evidence updates are not pushed.
- **Verification:** `origin/staging` resolves to the exact approved SHA; the
  deployment targets Preview and reports `READY`; build logs show branch
  `staging`, exact commit `16b2a21`, a successful Next.js 15.5.22 / Node.js 24
  build, and only the three known Analytics exhaustive-deps warnings. An
  unauthenticated `/admin/login` request returned a 302 to Vercel SSO with
  `x-robots-tag: noindex`. A deployment-scoped error-log scan returned zero
  entries.
- **Blockers:** hosted owner/admin UI, AAL1 operator refusal, fresh-AAL2 operator
  success, and Yahoo/AOL/ISP delivery evidence remain open. A Ready deployment
  is not application acceptance.
- **Exact next step:** obtain private provider inputs and exact hosted-mutation
  approval for those acceptance checks. Do not start `PLAT-102`, `DCFC-601`, or
  `DCFC-602`.
- **Hosted mutations:** one exact Git push and one protected Preview deployment;
  zero Supabase, Auth, email, user, factor, session, schema, production, Stripe,
  DNS, Storage, Bunny.net, or tenant-content mutations. The push approval is
  exhausted; no later commit may be pushed without separate approval.

### 2026-08-03 — PLAT-101 pre-push reconciliation and auth hardening — Codex

- **Package/status:** `PLAT-101`, still `in_progress` at hosted application,
  fresh-AAL2 operator, and Yahoo/AOL/ISP delivery acceptance.
- **Completed:** reconciled this ledger and `STAGING-ACCEPTANCE.md` with the
  verified operator state; documented approval-gated operator TOTP break-glass
  recovery without restoring club-member MFA; corrected the stale
  operator-reachable `is_aal2()` plan text; removed the broad `getClaims()`
  error fallback and local JWT decode; and added fail-closed regression coverage.
  Reworded the seven unpublished PLAT-101 commits with rationale, verification,
  and hosted-mutation bodies. Their trees are unchanged; the new sequence is
  `a797c60`, `62118dd`, `af26a8f`, `8bbc204`, `738a991`, `46a25e6`, and
  `5f051b3`.
- **Files changed:** `lib/auth-session.ts`,
  `tests/contracts/platform-auth.test.ts`,
  `docs/phase-12/OPERATOR-TOTP-RECOVERY.md`,
  `docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md`,
  `docs/phase-12/DECISIONS.md`, `docs/onzio-platform-plan.md`,
  `STAGING-ACCEPTANCE.md`, this ledger, and `HANDOFF.md`.
- **Verification:** the focused token-verification regression failed 1/13 on the
  old fallback and passed after implementation; final focused platform-auth
  tests 14/14, contracts 319/319, architecture 20/20, real loopback database
  tests 81/81, complete suite 674/674 across 71 files, clean TypeScript,
  generated database types match, production build green with only the three
  pre-existing Analytics exhaustive-deps warnings, and diff checks clean. Git
  tree identity before and after message rewriting matched exactly.
- **Blockers:** no local blocker. TOTP enrollment is complete. The protected
  deployment, hosted owner/admin/operator checks, and delivery to Yahoo, AOL,
  and at least one ISP-hosted domain remain open.
- **Exact next step:** obtain separate approval naming the `staging` push and
  protected Vercel deployment; verify the exact deployed SHA and Ready state;
  then run hosted UI/operator and multi-provider delivery acceptance. Do not
  start `PLAT-102`, `DCFC-601`, or `DCFC-602`.
- **Hosted mutations:** zero for this reconciliation. No Supabase, Auth, email,
  Vercel, Git remote, deployment, production, Stripe, DNS, Storage, Bunny.net,
  or tenant-content resource changed. No push.

### 2026-08-03 — PLAT-101 private operator TOTP helper added — Codex

- **Package/status:** `PLAT-101`, still `in_progress` at private operator TOTP
  enrollment and hosted application/deliverability acceptance.
- **Completed:** added the previously documented but missing
  `npm run operator:enroll-totp` command. The interactive helper loads local
  environment configuration, pins the exact staging project, requires a typed
  confirmation before sending, signs in by email OTP, binds the verified user
  to `ONZIO_OPERATOR_USER_IDS`, refuses ambiguous existing-factor state, opens
  a mode-0600 temporary QR locally, verifies exactly one TOTP factor and AAL2,
  signs out, and deletes temporary QR material. It has no service-role path.
- **Files changed:** `package.json`, `scripts/enroll-operator-totp.ts`,
  `tests/contracts/platform-auth.test.ts`, this ledger, and `HANDOFF.md`.
- **Verification:** the red-first focused contract failed 1/12 before
  implementation and passed 12/12 afterward; the complete local suite passed
  672/672 across 71 files; `npx tsc --noEmit` and `git diff --check` passed. A
  non-interactive command smoke reached the helper and failed closed at its TTY
  guard before creating a Supabase client or contacting staging.
- **Blockers:** the configured operator still has no verified TOTP factor. The
  helper has not been run interactively because a hosted Auth email/session/
  factor mutation needs exact staging approval and Christian must handle every
  email code, QR/secret, and authenticator value privately.
- **Exact next step:** Christian explicitly approves exactly one operator TOTP
  enrollment on Supabase staging project `fxefqnoqxbezeccjvrsw`, then runs
  `npm run operator:enroll-totp` in his own terminal and completes the private
  prompts. After success, record only the verified-factor/AAL2 result—never the
  address, codes, QR, secret, session, or token.
- **Hosted mutations:** zero. No email was sent and no staging Auth session,
  factor, user, configuration, database row, Vercel deployment, Git remote,
  DNS, Stripe, Storage, Bunny.net, or production resource changed. No push.

### 2026-08-03 — PLAT-101 local package committed; push withheld — Codex

- **Package/status:** `PLAT-101`, still `in_progress` at hosted application and
  deliverability acceptance.
- **Completed:** committed the complete local PLAT-101 implementation as
  `a797c60` (`Implement PLAT-101 passwordless admin access`). The commit includes
  passwordless club Auth, AMR session enforcement, session-bound operator TOTP,
  owner-managed admins, rollback/migrations, removal of superseded password
  recovery, the manual-acceptance UI fixes, and all associated tests and design
  records. This ledger/handoff update is the separate documentation commit.
- **Files changed:** implementation commit `a797c60` contains 66 files; this
  closeout commit contains `HANDOFF.md` and this ledger only.
- **Verification:** staged scope and intentional deletions were reviewed;
  `git diff --cached --check` passed; no credential/token material was found.
  The accepted implementation evidence remains 315/315 contracts, 20/20
  architecture tests, 81/81 database tests, 671/671 complete tests across 71
  files, 2/2 desktop/mobile browser scenarios, clean TypeScript, generated
  types, database lint, and production build.
- **Blockers:** no local implementation blocker. Protected application deploy,
  private operator TOTP enrollment, and Yahoo/AOL/ISP delivery evidence remain
  open.
- **Exact next step:** Christian privately enrolls TOTP on the configured
  operator identity and separately approves pushing `staging` plus triggering
  the protected Vercel staging deployment. Then run hosted owner/admin/operator
  and multi-provider delivery acceptance. Do not start `PLAT-102`, `DCFC-601`,
  or `DCFC-602`.
- **Hosted mutations:** zero for this commit step. At that handoff commit,
  local `staging` was 13 commits ahead of `origin/staging`; no commit was pushed
  and no Vercel, Supabase, Auth, email, DNS, Stripe, Storage, Bunny.net, or
  production resource changed.

### 2026-08-03 — PLAT-101 local build and staging schema/Auth applied — Codex

- **Package/status:** `PLAT-101`, `in_progress` at hosted application and
  deliverability acceptance.
- **Completed:** replaced club password/recovery/MFA with six-digit email-code
  sign-in; enforced 30-day club session age in application code and RLS;
  rebound operator workflows to verified JWT subject plus AAL2/TOTP no older
  than two hours; added owner-only admin membership management; removed caller
  actor IDs and the simulation auth bypass; added executable rollback and
  browser/database/contract coverage. Applied staging migrations
  `20260803192838` and `20260803192943`. Changed staging OTP expiry from 3600 to
  86400 seconds, length from 8 to 6, and the stock link template to the
  checked-in code-only Onzio template. Self-signup stayed off, email stayed on,
  and timebox/inactivity stayed `never`.
- **Files changed:** PLAT-101 application, operator, Auth, migration, rollback,
  test, and documentation files shown by `git status --short`; key additions are
  `lib/auth-session.ts`, `lib/owner-admin-membership.ts`,
  `app/api/admin/members/route.ts`, `app/admin/(protected)/members/page.tsx`,
  both PLAT-101 migrations, `docs/phase-12/PLAT-101-ROLLBACK.sql`, and the
  PLAT-101 contract/database/browser suites.
- **Verification:** clean local reset; real local OTP delivery/verification and
  unknown-user noncreation; rollback/forward rehearsal; 314/314 contracts,
  20/20 architecture, 81/81 database, 669/669 full tests across 71 files, 2/2
  Playwright desktop/mobile scenarios, TypeScript, generated-type check,
  `onzio,onzio_private` database lint, and production build. Staging readback
  confirms both migrations, four hardened empty-search-path security-definer
  functions, all six intended policies, zero remaining `is_aal2` policy calls,
  and removal of the one newly introduced RLS init-plan advisor warning.
- **Blockers:** no code/schema blocker. The protected staging application still
  runs old code because push/deploy was not approved. The configured operator
  identity needs private TOTP enrollment. Yahoo, AOL, and one ISP-hosted-domain
  delivery evidence is still required. DMARC `p=none` remains a separate DNS
  hardening item and is not a PLAT-101 blocker.
- **Exact next step:** obtain a separate approval for the `staging` push/Vercel
  deployment; Christian privately enrolls operator TOTP; then run hosted owner,
  admin, operator-refusal, rollback-readiness, and provider delivery acceptance.
  Do not start `PLAT-102`, `DCFC-601`, or `DCFC-602` until their own gates are
  satisfied.
- **Hosted mutations:** only the approved project
  `fxefqnoqxbezeccjvrsw` changed: two schema migrations plus the three Auth
  configuration deltas above. Zero Auth users/factors/sessions, tenant rows,
  content, Storage objects, Stripe, Vercel, Git remote, DNS, Bunny.net, or
  production mutations. No push.

### 2026-08-03 — PLAT-101 removed-admin reactivation cooldown handled — Codex

- **Package/status:** `PLAT-101`, still `in_progress` at hosted acceptance.
- **Completed:** reproduced Christian's manual add → remove → immediate re-add
  failure. Supabase returned `over_email_send_rate_limit`, HTTP 429, because the
  local email-code frequency is one minute. Added successful same-identity
  reactivation coverage, mapped the provider cooldown to
  `AUTH_CODE_RATE_LIMITED`/HTTP 429, and replaced the internal UI error with a
  one-minute retry message. Delivery failure still restores the removed row so
  an old session cannot silently regain access.
- **Files changed:** `lib/owner-admin-membership.ts`,
  `app/api/admin/members/route.ts`,
  `app/admin/(protected)/members/page.tsx`,
  `tests/database/owner-admin-membership.test.ts`,
  `tests/contracts/platform-auth.test.ts`, this ledger, and `HANDOFF.md`.
- **Verification:** disposable loopback Auth probe confirmed exact status/code;
  focused tests 12/12; contracts 314/314; full suite 669/669 across 71 files;
  `npx tsc --noEmit` clean; production build green with only the three
  pre-existing analytics exhaustive-deps warnings.
- **Blockers/next step:** no local blocker. Retry the same email after one minute
  and confirm the code arrives; the previously recorded deployment, operator
  TOTP, and provider-delivery gates remain unchanged.
- **Hosted mutations:** zero. Local Auth probe created and deleted one disposable
  local-only identity. No staging, production, Vercel, Git remote, DNS, Stripe,
  Storage, or tenant-content mutation; no push.

### 2026-08-03 — PLAT-101 admin sidebar scroll regression fixed — Codex

- **Package/status:** `PLAT-101`, still `in_progress` at hosted acceptance.
- **Completed:** fixed the admin sidebar so its link region can always scroll
  independently on mobile and desktop. The shell is viewport-height, clips its
  outer overflow, and stays pinned to the desktop viewport; the navigation
  region is shrinkable, keyboard-focusable, touch-pan-enabled, momentum
  scrolling, and reserves stable scrollbar space. After Christian supplied a
  screenshot showing the browser's bright native gutter, replaced it with a
  sidebar-specific 6px translucent thumb on a transparent track, retaining a
  stronger hover/focus state without hiding the scroll affordance.
- **Files changed:** `components/AdminShell.tsx`,
  `styles/globals.css`,
  `tests/contracts/admin-mobile-navigation.test.ts`,
  `tests/browser/platform-auth-local.spec.ts`, this ledger, and `HANDOFF.md`.
- **Verification:** the red-first focused contract failed 2/3 checks before
  implementation and passed 3/3 afterward. The follow-up styling contract then
  failed 1/4 before implementation and passed 4/4 afterward. The real local
  owner/admin email-code Playwright journey passed 2/2 at 1440×900 and 390×844,
  proving `scrollHeight > clientHeight` and that setting the nav scroll position
  moves `scrollTop`; no framework overlay or browser-console errors appeared.
  Desktop/mobile screenshots were inspected and show no bright track or gutter.
  The complete suite passed 670/670 across 71 files, `npx tsc --noEmit` passed,
  and `git diff --check` passed. The unavailable `agent-browser` CLI was
  replaced by the repository's existing Playwright harness for equivalent
  browser verification.
- **Blockers:** no local blocker. Existing protected-deployment, operator TOTP,
  and multi-provider email-delivery acceptance gates remain unchanged.
- **Exact next step:** reload `http://alpha.localhost:3000/admin` and manually
  scroll the sidebar on desktop and mobile. Separately approve a `staging`
  push/Vercel deployment before hosted UI acceptance; do not start `PLAT-102`,
  `DCFC-601`, or `DCFC-602` without their own authorization.
- **Hosted mutations:** zero. Verification used loopback Supabase and the local
  Next.js server only. No staging, production, Vercel, Git remote, DNS, Stripe,
  Storage, Auth-provider, or tenant-content mutation; no commit or push.

### 2026-08-03 — PLAT-101 new-admin cooldown friction removed — Codex

- **Package/status:** `PLAT-101`, still `in_progress` at hosted acceptance.
- **Completed:** retained the documented one-minute per-address Supabase OTP
  cooldown, but removed it as a new-admin onboarding blocker. Adding an admin
  already sends a valid code; when that admin immediately presses the primary
  “Send sign-in code” action, the login page recognizes
  `over_email_send_rate_limit`, advances to code entry, and directs them to use
  the email already sent instead of exposing Supabase's raw wait message. The
  remove → immediate re-add membership rollback remains unchanged because that
  operation must prove a successful delivery before restoring access.
- **Files changed:** `app/admin/login/page.tsx`,
  `tests/contracts/platform-auth.test.ts`,
  `tests/browser/platform-auth-local.spec.ts`, this ledger, and `HANDOFF.md`.
- **Verification:** the red-first contract failed 1/11 before implementation
  and passed 11/11 afterward. The real loopback owner/add-admin/login journey
  passed 2/2 with fresh isolated identities, explicitly required one
  `/auth/v1/otp` 429, showed the friendly code-entry state, and signed the new
  admin in with the original onboarding code. The complete suite passed
  671/671 across 71 files and `npx tsc --noEmit` passed.
- **Blockers:** no local blocker. The per-address cooldown and project-wide
  30-OTP/hour posture remain intentional; existing protected-deployment,
  operator-TOTP, and multi-provider delivery gates are unchanged.
- **Exact next step:** add a fresh local administrator, then have that person
  use the normal “Send sign-in code” button immediately and enter the code from
  the first email. Separately approve the `staging` push/Vercel deployment
  before hosted UI acceptance.
- **Hosted mutations:** zero. Only loopback Auth users, memberships, messages,
  and sessions were created and cleaned up by the isolated browser test. No
  staging/production Auth setting, Supabase resource, Vercel deployment, Git
  remote, DNS, Stripe, Storage, or tenant content changed; no commit or push.

### 2026-08-03 — PLAT-101 inputs all supplied; only its approval remains — Claude Code (Opus 5)

Agent: Claude Code (Opus 5). Class 1, documentation only, plus read-only public
DNS lookups. Hosted-mutation count: zero. `PLAT-101` was not started.

All three outstanding `PLAT-101` inputs are now settled. Two already existed and
needed only confirmation:

- **Operator user ID** — already configured as `ONZIO_OPERATOR_USER_IDS` in
  `.env.local` and the Vercel staging environment, and exercised during
  `DCFC-502`/`DCFC-504`. Presence was confirmed without reading or recording the
  value; it stays outside Git per `DCFC-D113`. Note for `PLAT-101`: that account
  must have TOTP enrolled, which `PLAT-D017` makes load-bearing rather than
  optional. The operator identity is already distinct from the Diverse City
  owner, since `DCFC-504` removed the synthetic owner membership.
- **Transactional sending domain** — `auth.onziofutbol.com`, established in
  Phase 8 and reused unchanged. Verified live by public DNS lookup on
  2026-08-03: DKIM resolves at `resend._domainkey.auth`, SPF at `send.auth`
  (`v=spf1 include:amazonses.com ~all`), and the bounce MX at
  `feedback-smtp.us-east-1.amazonses.com`. All correct for Resend.

The third was a real decision and is now `PLAT-D023`: the unknown-address
response text is pinned verbatim, routing to `onziofutbol@gmail.com`. Christian
chose that address after being told it would be published on a public error page
and would attract scraping, and that a domain mailbox would read as more
legitimate. Recorded as his decision with the trade-off noted, not re-argued. It
does not affect authentication deliverability, which flows through Resend.

One new item opened, not a blocker: **DMARC on `onziofutbol.com` is `p=none`** —
present but monitor-only. Acceptable while email is a convenience; weaker once
email is the sole authentication path. Tightening to `p=quarantine` is a DNS
change needing its own approval and is tracked separately from `PLAT-101`.

`PLAT-101` now has every gate satisfied — P1, P2, the signed classification
table, all decision dependencies accepted, and all required inputs supplied.
**The only thing still missing is the package approval itself**, which per the
plan's Authorization Notice must name the package ID and the exact target
environment. It has not been given and `PLAT-101` has not been started.

Files changed: `docs/phase-12/DECISIONS.md` (`PLAT-D023` and its pinned text,
open items updated, Acceptance Record); `PLATFORM-AUTH-BILLING-PLAN.md`
(`PLAT-101` required inputs marked supplied); this file and `HANDOFF.md`.

Verification: `git status --short` clean after commit; `git diff --check` clean.
No application code, schema, or test changed. No secret or identity value was
read into the transcript or written to Git.

Exact next step: Christian issues the `PLAT-101` package approval naming the
target environment. Until then, do not start `PLAT-101`, do not start
`DCFC-601`, and do not push.

Hosted-mutation count: zero.

### 2026-08-03 — PLAT-D022 accepted; cron alerting closes the last open item — Claude Code (Opus 5)

Agent: Claude Code (Opus 5). Continuation of the same design review. Class 1,
documentation only. Hosted-mutation count: zero.

Christian confirmed that Vercel records cron invocations without sending native
notifications for an individual cron failure or non-200 — native alerting covers
deployment failures and broad error-rate anomalies only. `PLAT-D019`'s
escalation was therefore a pull, and the delivery half of the reconciliation
question was not genuinely closed.

The review then found that neither of the obvious fixes covers the failure that
matters most. An in-handler webhook push and a log-drain 5xx rule both alert only
on runs that happen. **Silence — a dropped `vercel.json` entry, a rotated
`CRON_SECRET`, a platform fault — produces no signal at all**, and because this
same cron carries `PLAT-D006`'s suspension work, silent non-execution means
grace warnings never send and overdue customers never suspend while
reconciliation quietly stops.

`PLAT-D022` accepts a heartbeat / dead-man's-switch: ping on a clean run, signal
failure explicitly, and let the monitor alert on both a reported failure and a
missing ping. One outbound fetch and one secret; no SDK, no log drain. The
third-party dependency is accepted and recorded, on the grounds that its failure
mode is a spurious or missed alert and never a broken customer path — unlike
making email load-bearing for authentication, which is the objection that sank
an emailed digest in `PLAT-D019`.

Recorded as proposed but **not authorized**: `/api/cron/media-cleanup` has had
this same blind spot since Phase 8 and would benefit from the same heartbeat,
but it is Phase 8 infrastructure and `PLAT-102`'s permitted actions name only
the new lifecycle cron. Extending it needs an explicit scope widening or its own
package, and was deliberately not assumed.

Both verification tasks opened earlier in this review are now closed —
`timebox` availability by `PLAT-D021`, Vercel cron notification by `PLAT-D022`.
No open decision or verification remains against `PLAT-EPIC-001`.

Files changed: `docs/phase-12/DECISIONS.md` (`PLAT-D022`, scope note, risk row,
open item resolved, Acceptance Record);
`docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md` (Open Items closed out); this file
and `HANDOFF.md`.

Verification: `git status --short` clean after commit; `git diff --check` clean.
No application code, schema, or test changed.

Blockers: unchanged. Push still withheld; `PLAT-101` still unauthorized and
unstarted. What remains before `PLAT-101` can be assigned is its package
approval and three inputs: the operator user-ID list, the exact unknown-address
message, and the transactional sending domain.

Exact next step: unchanged. Do not start `DCFC-601`; do not push.

Hosted-mutation count: zero.

### 2026-08-03 — PLAT-D016 superseded by PLAT-D021; session age moves to the platform — Claude Code (Opus 5)

Agent: Claude Code (Opus 5). Continuation of the design review below, same
session. Class 1 and loopback-only Class 2: one further throwaway probe user on
local Supabase, deleted. Hosted-mutation count: zero.

Christian confirmed that Supabase's session `timebox` and `inactivity_timeout`
are Pro-and-above. That invalidated `PLAT-D016` hours after it was accepted,
for two reasons rather than one:

1. `AGENTS.md` locks staging as a **Free** project, so the 30-day timebox could
   be neither configured nor rehearsed there. `PLAT-101`'s acceptance criterion
   that "club sessions persist across the configured window" was unprovable.
2. It was **orphaned**. `PLAT-101`'s hosted boundary is staging Auth
   configuration only; `PLAT-102` is billing; `PLAT-103` is documentation and
   covers only `DCFC-601`/`602`. No package could have applied a
   production-only Auth setting, so it would have shipped unrehearsed and
   unowned.

`PLAT-D021` supersedes it: session age is enforced by the platform from the
`amr` claim — 30 days for club sessions in RLS, 2 hours for operator `aal2` in
`assertOperator()` per `PLAT-D015`. The 30-day duration is unchanged; only the
mechanism moved. It is plan-independent, rehearses fully on Free staging, and
reuses the helper `PLAT-D015` already requires. It must land in RLS rather than
application code alone, because an app-layer-only check leaves a still-valid old
JWT able to reach PostgREST directly, where policies see membership and
lifecycle but nothing about session age.

Verified before recording, rather than assumed: an email-OTP sign-in — the club
path under `PLAT-D012`/`PLAT-D014` — produces `amr: [{method: "otp",
timestamp}]` at `aal1`, and that timestamp is stable across refresh while `iat`
moves. So the club bound is buildable on the same mechanism as the operator
bound.

Two incidental findings from the same probe, both recorded:

- `shouldCreateUser: false` on an unknown address returns the **generic**
  `Signups not allowed for otp` and creates no user. `PLAT-D014`'s explicit
  "no account for that address" message is therefore application-side error
  mapping, not something Supabase supplies. That is an implementation
  obligation `PLAT-101` must carry, and it is now recorded as one.
- The stock Magic Link template emits a link with no six-digit code,
  independently confirming `PLAT-101`'s stated requirement to alter it to emit
  `{{ .Token }}`.

Files changed: `docs/phase-12/DECISIONS.md` (`PLAT-D016` marked superseded,
`PLAT-D021` added, three findings appended, open items re-statused, Acceptance
Record); `docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md` (Sessions bullet and
Open Items corrected); this file and `HANDOFF.md`.

Verification: `git status --short` clean after commit; `git diff --check` clean;
probe directory removed. No application code, schema, or test changed.

Blockers: unchanged. Push still withheld; `PLAT-101` still unauthorized. One
open verification remains — whether Vercel notifies on a failed cron for this
account, which decides whether `PLAT-D019`'s alert is a push or a pull.

Exact next step: unchanged. `PLAT-101` may be assigned once Christian issues its
package approval and supplies the three remaining inputs. Do not start
`DCFC-601`; do not push.

Hosted-mutation count: zero.

### 2026-08-03 — Five open PLAT items closed; PLAT-D015–D020 accepted — Claude Code (Opus 5)

Agent: Claude Code (Opus 5). A structured design review of the four remaining
open items (plus the grace schedule already settled). Class 1 and loopback-only
Class 2: three throwaway probe users on local Supabase, all deleted; read-only
queries against the live local schema. Hosted-mutation count: zero. `PLAT-101`
was not started and no application code, schema, or test was changed.

Three of the four items turned out to be mis-framed in the plan, and the review
found this by probing rather than by reasoning from the document:

- **AAL2 survives session refresh — proven, not decided.** `auth.sessions.aal`
  is session-level; across two refreshes past the 10s reuse interval, with token
  strings and `iat`/`exp` advancing, `aal` stayed `aal2` and `amr` kept
  `password` + `totp` on one session id. Operator re-auth is therefore
  per-session, making session lifetime the only bound on privileged access.
- **Asymmetric session durations are not configurable.** `timebox` and
  `inactivity_timeout` map to project-wide GoTrue env settings; there is no
  per-user or per-role duration and both account types share one `auth.users`.
  `PLAT-101`'s "weeks for club, hours for operator" cannot be built as written.
- **`club_has_feature` has no direct policy callers.** 115 policies across 29
  tables call `can_read_feature` / `can_mutate_feature`; zero call
  `club_has_feature`. The fork `PLAT-102` posed was a false choice.
- **The application has no outbound email capability.** Resend is wired only as
  Auth's SMTP provider, so an emailed reconciliation report is a new dependency
  rather than a scheduling choice.

Two further findings made `PLAT-D015` cheap: `amr[totp].timestamp` is stable
across refresh while `iat` moves, giving a session-age input as a plain JWT
claim; and in-place TOTP re-verification advances that timestamp on the same
session, so step-up costs one code with no sign-out.

Christian decided each item against stated alternatives. Accepted as
`PLAT-D015`–`PLAT-D020` in `docs/phase-12/DECISIONS.md`: a 2-hour
application-layer maximum age on operator `aal2`; a project-wide 30-day timebox
with no inactivity timeout; `assertOperator()` taking a verified session rather
than a caller-supplied `actorId`, with operator scripts signing in via TOTP;
deletion of `club_has_feature` by collapsing the two wrappers while retaining
the unused feature parameter as the re-tiering seam; reconciliation folded into
the daily lifecycle cron as exception-only with a non-200 escalation; and two
independent flags so the `PLAT-D006` kill switch stops the suspension write
without stopping reconciliation.

`PLAT-D017` is the notable one for this ledger: it converts the previously
flagged operator-authorization gap from a recommendation into a requirement.
The 2-hour rule reads the caller's `amr` claim, which is unobtainable from the
current `assertOperator(actorId: string)` signature, so `PLAT-101` cannot ship
the session rule without also binding the caller to a verified session.

Files changed: `docs/phase-12/DECISIONS.md` (six decisions, an Empirical
Findings section, open items re-statused, Acceptance Record);
`docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md` (Open Items closed, the
`PLAT-101` Sessions bullet corrected as superseded); this file and `HANDOFF.md`.

Verification: `git status --short` clean after commit; `git diff --check` clean;
probe scratch directory removed. Tests were not run — no code changed.

Blockers: unchanged. The push is still withheld. `PLAT-101` still requires its
own package approval and three remaining inputs (the operator user-ID list, the
exact unknown-address message, and the transactional sending domain); session
durations are no longer among them.

Two new verification tasks, neither a decision: whether session `timebox` /
`inactivity_timeout` are available on Supabase Free, since staging is Free and
`PLAT-101`'s acceptance criterion assumes they are configurable there; and
whether Vercel notifies on a failed cron for this account, since `PLAT-D019`
escalates by returning non-200.

Exact next step: unchanged — `PLAT-101` may be assigned once Christian issues
its package approval and supplies the three remaining inputs. Do not start
`DCFC-601`; do not push.

Hosted-mutation count: zero.

### 2026-08-03 — PLAT decisions accepted; classification table signed — Claude Code (Opus 5)

Agent: Claude Code (Opus 5). Recorded immediately after the `P1`/`P2` entry
below, in the same session.

Christian accepted `PLAT-D001`–`PLAT-D014` as a set, unamended, and signed off
the `PLAT-101` privilege classification table unamended. Acceptance of
`PLAT-D006` and `PLAT-D012` accepted their stated risks: an automated path from
a webhook or cron fault to a paying customer's public site going dark, and
inbox access equalling club content access. The classification table's "Add or
remove `admin` members — Club owner — aal1" row had been explicitly flagged
before sign-off — under `PLAT-D012` an owner's inbox is then sufficient to mint
another `admin`, and that row is what gives an application route a path into the
operator module — and Christian reaffirmed the table as written. That row stands
at `aal1` deliberately, and the accepted risk is now recorded in the Accepted
Risk Register.

Of the five open items, only the grace-warning schedule was settled: day 7 and
day 17 of the 20-day window, accepted as proposed. The other four were not,
because no concrete value was on offer to approve. `club_has_feature`'s final
form is a genuine fork; the reconciliation report has no proposed cadence or
channel; the exact session durations are unset with only the asymmetric shape
agreed; and whether AAL2 survives session refresh is an empirical determination
about Supabase Auth, not a choice anyone can approve. All four remain open
against their owning package.

Files changed: `docs/phase-12/DECISIONS.md` (all fourteen statuses to
`accepted`, dated Acceptance Record covering the decisions, the table sign-off
and the grace schedule, Accepted Risk Register dated with the new
owner-inbox-adds-admin row, open items re-statused);
`docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md` (decisions marked accepted,
classification table marked signed with the flagged row's disposition,
`PLAT-101` and `PLAT-102` dependency lines updated, grace schedule settled in
both the required-inputs and open-items lists); this file and `HANDOFF.md`.

Verification: `git status --short` clean after commit; `git diff --check` clean.
No application code, schema, test, DCFC package definition, `DCFC-601`, or
`DCFC-602` was modified.

Blockers: unchanged. The push remains withheld. `PLAT-101` is **not** authorized
by this acceptance — per the plan's Authorization Notice each package needs its
own approval naming the package ID and exact target environment, and `PLAT-101`
additionally still needs four inputs: the operator user-ID list, the exact
unknown-address message, the club and operator session durations, and the
transactional sending domain.

Exact next step: `PLAT-101` may be assigned once Christian issues its package
approval and supplies those four inputs. Do not start `DCFC-601`; do not push.

Hosted-mutation count: zero.

### 2026-08-03 — PLAT-EPIC-001 prerequisites P1 and P2 — Claude Code (Opus 5)

Agent: Claude Code (Opus 5). Assignment: `PLAT-EPIC-001` prerequisites `P1`
(commit the outstanding worktree) and `P2` (promote the decisions) only.
Status: both complete. `PLAT-101` was not started.

Completed work — `P1`. The eleven outstanding files from `DCFC-502`,
`DCFC-503`, and `DCFC-504` are committed locally on `staging` in four
package-grouped commits, followed by the `P2` commit:

- `65e54fe` — Close DCFC-502 staging release and tenant provisioning.
- `6d08634` — Add the DCFC-503 staging content and media importer.
- `c92a038` — Add the operator-issued club invitation workflow for DCFC-504.
- `02beb1b` — Record Phase 5 acceptance for DCFC-502 through DCFC-504.
- `427e19d` — Promote PLAT-D001 through PLAT-D014 into a governed decision log.

`HANDOFF.md`, `STAGING-ACCEPTANCE.md`, and `STATUS.md` are shared Phase 5
ledgers whose content spans all three packages and could not be split per
package without inventing intermediate document states, so they land together
in `02beb1b` after the per-package commits. The commit recording this entry is
reported outside itself; a commit cannot contain its own SHA.

Completed work — `P2`. `docs/phase-12/DECISIONS.md` is a new platform-wide
decision log, kept separate from this Diverse City log because these decisions
change every tenant. It records all fourteen decisions with rationale
preserved, `PLAT-D006` and `PLAT-D012` as explicit accepted risks in an
Accepted Risk Register alongside the other four, the deferred and rejected
options (passkeys, SMS, magic links, OAuth, admin-locked-but-site-up) each with
a reopen condition, the five package-level open items, and the relationships to
`PF-002`, `DCFC-601`/`DCFC-602`, and the two `AGENTS.md` invariants acceptance
would change. Every entry is `promoted_awaiting_acceptance` with an empty
Acceptance Record: the plan's Authorization Notice and this log's decision rules
both hold that promotion is not acceptance, and no dated approval exists.

Files changed: `docs/phase-12/DECISIONS.md` (new);
`docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md` (P1/P2 marked complete, decision
table pointed at the new log); `docs/phase-11/diverse-city/STATUS.md` and
`HANDOFF.md` (this record). No application code, schema, test, DCFC package
definition, `DCFC-601`, or `DCFC-602` was modified.

Verification: `git status --short` clean after the final commit;
`git diff --check` clean; `npx tsc --noEmit` exit 0 against the committed tree;
`git log --oneline` shows the five commits above on `staging` ahead of
`8e3cde2`. Tests were not run — this assignment changed no code or test.

Blockers. The push is deliberately withheld: `staging` triggers a protected
Vercel deployment, a Class 3 action this assignment prohibits. Local `staging`
is now six commits ahead of the deployed release commit `8e3cde2` — the five
listed above plus the commit carrying this record — so the repository and the
running staging deployment have diverged until a separately approved push. `PLAT-101` is gated on Christian's sign-off of the privilege
classification table and on moving `PLAT-D012`, `PLAT-D013`, and `PLAT-D014` to
`accepted`; `PLAT-102` additionally needs `PLAT-D003`, `PLAT-D004`, and
`PLAT-D006`–`PLAT-D011` accepted.

Also recorded during `DCFC-504` closeout and left as-is: one
`STAGING-ACCEPTANCE.md` acceptance item under Identity, Email, and MFA remains
unchecked — expired, reused, forged, unsupported, and caller-supplied redirects
were not proven to fail closed. It is a real gap in the `DCFC-504` evidence, not
an oversight in this assignment, and it overlaps `PLAT-101`'s sign-in rewrite.

Flagged, not fixed — operator authorization (`PLAT-101`'s deliverable). Reading
`lib/operator/shared.ts` confirmed the plan's concern and found it understated:

- `assertOperator(actorId)` checks only that `actorId` appears in
  `ONZIO_OPERATOR_USER_IDS`. There is no AAL check, no session lookup, and no
  binding between `actorId` and the authenticated caller — `actorId` is an
  ordinary function argument. The env allowlist proves which IDs are
  privileged, never that the caller holds one.
- Every operator function reaches the database through
  `createServiceRoleClient()`, so RLS — the platform's stated final
  authorization boundary — is not in the path at all.
- What actually keeps this safe today is that no `app/` route imports
  `lib/operator/*`. The only callers are `scripts/*` and `tests/*`. The
  secondary gate, `assertDirectOperatorInvocation()`, tests a caller-supplied
  `invokedFromApplicationRoute` boolean, which an application route would have
  to set truthfully against its own interest.
- `PLAT-101` proposes generalizing this workflow so a club owner can add an
  `admin`, which necessarily gives an application route a path into this
  module. That change converts the current gap from theoretical to reachable
  and should be treated as the package's first-order design problem, not a
  follow-on.
- `isContractSimulation()` returns a fully successful fabricated result
  whenever `NODE_ENV === "test"` and no client is injected. Contract tests
  therefore assert the shape of operator success without exercising any
  authorization; only the loopback database tests do. Worth pinning
  deliberately when `PLAT-101` proves the gate.

Exact next step: present the `PLAT-101` privilege classification table and the
five open items to Christian for sign-off or amendment. Do not assign
`PLAT-101`, do not start `DCFC-601`, and do not push.

Hosted-mutation count: zero. No Supabase, Vercel, Stripe, Auth, email, Storage,
DNS, or Bunny.net action of any kind occurred; both prerequisites were local.

### 2026-08-02 — DCFC-504 accepted; Phase 5 complete — Codex

- Package: `DCFC-504`
- Status: `complete`; Phase 5 gate closed
- Completed: Christian recovered the browser-saved password privately, signed
  in, enrolled and verified exactly one TOTP factor, and reached AAL2. Codex
  verified the protected shell resolves Diverse City FC, Contact loads at the
  Starter boundary, Programs and Tryouts remain Pro-gated, and the owner-only
  Payments route reaches the private-preview billing state without changing
  billing. Codex then marked only the synthetic owner membership removed in a
  guarded transaction with the same two-owner/last-owner and append-only
  operator-audit invariants as the reviewed removal workflow; its pre-existing
  Auth user was retained.
- Files changed: this ledger, `STAGING-ACCEPTANCE.md`,
  `DCFC-504-APPROVAL-PACKET.md`, and repository `HANDOFF.md` only in this
  acceptance step. Existing reviewed Phase 5 source/test changes remain
  uncommitted because commit and push are excluded.
- Verification: the intended identity has one active session at AAL2, zero
  AAL1 sessions, and exactly one verified TOTP factor. Protected admin and
  Payments remain accessible after synthetic-owner removal. Final hosted
  reconciliation is eight Auth users, one active Diverse City owner, one
  removed synthetic owner membership, 29 tenant audit rows, and exactly one
  operator `membership_removed` audit. No private address, password, token,
  QR/secret, or authenticator code was recorded.
- Blockers or decisions needed: none for Phase 5. `DCFC-601` is pending and
  requires a fresh exact approval; it was not started.
- Exact next step: stop. If Christian chooses to continue, prepare the separate
  `DCFC-601` Stripe-test/lifecycle approval boundary before any mutation.
- Hosted mutations: one tenant-scoped synthetic membership changed from
  `active` to `removed` and one append-only operator audit was inserted. No
  Auth user was deleted; no email/resend, Auth configuration, Vercel, Stripe,
  DNS, production, Bunny.net/video, Phase 6, commit, or push mutation occurred.

### 2026-08-02 — DCFC-504 password changed but not known; safe stop — Codex

- Package: `DCFC-504`
- Status: `blocked` before first password sign-in
- Completed: reconciled the user's password-knowledge report against current
  Auth logs without inspecting credentials or sending another message.
- Files changed: this ledger, `STAGING-ACCEPTANCE.md`,
  `DCFC-504-APPROVAL-PACKET.md`, and repository `HANDOFF.md` only.
- Verification: Auth recorded `PUT /user` HTTP 200 with `user_modified` at
  `2026-08-02T22:21:08Z`, immediately followed by `POST /logout` HTTP 204. The
  identity remains confirmed and password-backed with zero active sessions and
  zero verified factors. This proves a password value was accepted, but does
  not reveal what it was.
- Blocker: Christian does not know the accepted password. Codex must not inspect
  browser-saved credentials or guess the value.
- Exact next step: Christian privately checks the browser password manager for
  the Diverse City staging hostname. If the password is present, use it for one
  sign-in attempt and continue TOTP/AAL2 acceptance. If it is absent, Christian
  must provide fresh exact approval for one recovery message to the now-existing
  identity; the current one-invitation approval does not authorize it.
- Hosted mutations: zero in this diagnostic step. No recovery request, second
  email, membership removal, Auth configuration, Vercel, Stripe, DNS,
  production, Bunny.net, Phase 6, commit, or push mutation occurred.

### 2026-08-02 — DCFC-504 invite password accepted; first sign-in pending — Codex

- Package: `DCFC-504`
- Status: `in_progress` at password sign-in and TOTP/AAL2 acceptance
- Completed: inspected the reported invalid/expired-session message without
  resending or changing Auth; verified the current application tab is at
  `/admin/login?password_updated=true`; and independently reconciled the new
  Auth identity after Christian's private password submission.
- Files changed: this ledger, `STAGING-ACCEPTANCE.md`,
  `DCFC-504-APPROVAL-PACKET.md`, and repository `HANDOFF.md` only.
- Verification: exactly one intended provider-domain user is invited,
  confirmed, password-backed, and has a prior sign-in timestamp. The invite
  session was signed out as designed, leaving zero active sessions, zero AAL1
  sessions, zero AAL2 sessions, and zero verified TOTP factors. The observed
  post-update login route is reachable only after the password update succeeds
  and the client signs out. No password, token, action URL, or factor secret was
  inspected or recorded.
- Blocker: Christian must sign in using the private address and new password,
  then complete the mandatory TOTP enrollment and AAL2 verification.
- Exact next step: Christian signs in on the current admin login page and tells
  Codex which MFA page appears. Codex then verifies AAL1 denial, hands off the
  private TOTP enrollment, verifies AAL2 and the approved entitlement/billing
  boundaries, removes only the synthetic membership, and reconciles one active
  owner.
- Hosted mutations: Christian's approved private password update and normal
  invite-session sign-out only. Codex performed read-only browser/database
  checks. No second message, membership removal, Auth configuration, Vercel,
  Stripe, DNS, production, Bunny.net, Phase 6, commit, or push mutation
  occurred.

### 2026-08-02 — DCFC-504 one invitation delivered; private acceptance pending — Codex

- Package: `DCFC-504`
- Status: `in_progress` at private invitation/password/TOTP acceptance
- Completed: implemented and tested the reusable direct-operator
  invitation-and-membership workflow with duplicate refusal, verified-domain
  callback derivation, one-send behavior, audited membership creation, and
  bounded cleanup; reload-verified the exact four-entry Auth redirect posture,
  notification switches, invite template, SMTP, and TOTP/AAL1 settings; then
  executed the workflow once under Christian's exact approval.
- Files changed: `lib/operator/invite-club-member.ts`,
  `scripts/invite-diverse-city-owner-staging.ts`,
  `tests/contracts/operator-workflows.test.ts`,
  `tests/database/operator-invitation.test.ts`,
  `DCFC-504-APPROVAL-PACKET.md`, `STAGING-ACCEPTANCE.md`, this ledger, and
  repository `HANDOFF.md`. Existing uncommitted Phase 5 changes remain
  preserved; no commit or push is authorized.
- Verification: TypeScript, 312/312 contracts, 20/20 architecture tests,
  665/665 full tests, the focused real local invitation database test, lint,
  build, and database-type checks passed. Hosted reconciliation shows eight
  Auth users, exactly two active Diverse City owners, zero removed owners, 28
  tenant audits, one `membership_added` audit, one `identity_invited` audit,
  zero verified factors for the new owner, and one expected invite-created
  AAL1 session. Resend message
  `8ec265e4-e868-440c-8005-7b0893977ea2` is `delivered` with subject
  `You've been invited`; only the provider domain is recorded.
- Execution note: earlier guarded attempts stopped before hosted mutation while
  diagnosing a masked project key and FIFO end-of-stream wait. Independent
  aggregate reads proved the seven-user/one-owner/26-audit baseline before the
  successful run. No retry email was sent; the successful invocation is the
  sole invitation.
- Blocker: Christian must open the newest invitation privately, set the
  password without sharing it, enroll exactly one TOTP factor, and reach AAL2.
  The synthetic owner remains active intentionally until that acceptance is
  green.
- Exact next step: Christian opens the newest `You've been invited` email and
  follows its link, then tells Codex when the password page is visible. Codex
  will verify the callback and AAL1 denial, hand off private password/TOTP,
  verify AAL2 plus Starter/owner boundaries, remove only the synthetic
  membership through the audited operator boundary, reconcile one active
  owner, and stop before `DCFC-601`.
- Hosted mutations: one Auth identity, one invitation, one active owner
  membership, and two tenant audit rows. No second message, owner removal,
  Auth/SMTP/template/rate-limit/notification setting, Vercel, Stripe, DNS,
  production, Bunny.net, Phase 6, commit, or push mutation occurred. The
  temporary FIFO directory was deleted after use; no credential or private
  address was retained.

### 2026-08-02 — DCFC-504 intended new owner confirmed; remediation prepared — Codex

- Package: `DCFC-504` remediation preparation only
- Status: `blocked` at fresh exact approval
- Completed: recorded Christian's private selection without writing the
  address to Git; confirmed the correct architecture path is an operator-issued
  invitation rather than another recovery request; reviewed the current
  callback, membership, provisioning, and acceptance contracts; and added the
  exact reusable workflow, one-invitation, temporary-two-owner, AAL2 cutover,
  rollback, reconciliation, exclusions, and approval language to the packet.
- Files changed: `DCFC-504-APPROVAL-PACKET.md`, `STAGING-ACCEPTANCE.md`, this
  ledger, and repository `HANDOFF.md`. Existing uncommitted Phase 5 work is
  preserved; no commit or push is authorized.
- Verification: the intended address remains absent from the seven-user Auth
  baseline. Current source accepts `invite` callbacks and routes them to
  password setup, requires direct operator invocation for membership changes,
  audits membership add/remove, and prevents removal of the last owner. It does
  not yet contain an invitation-plus-membership workflow for an existing club.
  Current Supabase documentation confirms `inviteUserByEmail` sends one invite
  and that its `redirectTo` participates in the configured allowlist.
- Blocker: new Auth-user creation, invitation email, temporary second owner,
  membership removal, and any local implementation were outside the exhausted
  approval and require the packet's fresh exact approval.
- Exact next step: Christian provides the packet's exact remediation approval.
  Then implement and test the reusable direct-operator workflow, re-run safe
  preflight, execute it once, complete the private invitation/password/TOTP and
  AAL1/AAL2 acceptance, remove only the synthetic Diverse City membership after
  success, reconcile, and stop before `DCFC-601`.
- Hosted mutations: zero. No Auth user, invitation, recovery retry, membership,
  session, factor, SMTP/template/rate-limit/notification, Vercel, Stripe, DNS,
  production, Bunny.net, Phase 6, Git commit, or push action occurred.

### 2026-08-02 — DCFC-504 recovery generated no email; owner mismatch — Codex

- Package: `DCFC-504`
- Status: `blocked` on incorrect/non-deliverable owner identity linkage
- Completed: diagnosed the user's missing-email report without resending;
  checked Supabase Auth logs, safe aggregate Auth/owner state, the deployed
  recovery result, and the authenticated Resend sending ledger.
- Files changed: `DCFC-504-APPROVAL-PACKET.md`, `STAGING-ACCEPTANCE.md`, this
  ledger, and repository `HANDOFF.md`. Existing dirty Phase 5 files remain
  preserved; no commit or push is authorized.
- Verification: exactly one `POST /recover` completed at
  `2026-08-02T20:57:58Z` with HTTP 200 and no Auth API error. The active owner
  and every staging Auth user still have null `recovery_sent_at`; Resend has no
  new message record. The active owner is a confirmed `example.com` identity,
  while the privately entered address is absent from the seven-user staging
  Auth project. Identity domains are `example.com` (five), `berkeley.edu`
  (one), and `yahoo.com` (one); no full address was written to the ledger.
- Root cause: the `DCFC-502` closeout's "existing staging operator identity"
  is not the intended deliverable operator identity. Supabase's non-enumerating
  recovery response returned 200 for the unmatched private address, so the UI
  advanced even though no email was generated.
- Blocker: the one-request approval is exhausted. Membership/Auth remediation
  and any second recovery request were explicitly outside it.
- Exact next step: prepare and obtain a fresh exact approval that privately
  resolves one existing confirmed real staging identity, atomically makes it
  the sole Diverse City owner through the audited operator boundary, reconciles
  the replaced synthetic membership/audits, and authorizes exactly one new
  recovery request. If a new Auth identity is required, stop for a different
  invitation/user-creation approval.
- Hosted evidence: one recovery HTTP request, zero email/provider records and
  zero recovery-token/session/factor/user/membership mutations. Cumulative
  `DCFC-504` hosted mutation remains the one approved callback URL addition.
  SMTP/templates/rate limits, Vercel, Stripe, DNS, production, Bunny.net,
  Phase 6, Git commit, and push state remain unchanged.

### 2026-08-02 — DCFC-504 Auth callback remediated; private recovery handoff — Codex

- Package: `DCFC-504`
- Status: `in_progress` at the private owner-email/recovery-send step
- Approval: Christian approved exactly one fourth redirect entry, preservation
  of the Site URL and existing three redirects, reload verification, and
  continuation of the already-approved single-recovery sequence.
- Completed: added only the exact Diverse City callback; reload-verified the
  unchanged Site URL and original branch/Alpha/Bravo entries; verified four
  total redirects; opened the protected Diverse City login, selected the
  password-recovery path, and handed the empty email form to Christian.
- Files changed: `DCFC-504-APPROVAL-PACKET.md`, `STAGING-ACCEPTANCE.md`, this
  ledger, and repository `HANDOFF.md`. Pre-existing uncommitted Phase 5 changes
  remain preserved; commit and push remain excluded.
- Verification: the post-save page reported success, and a separate dashboard
  reload showed the exact callback as the sole fourth entry. The protected
  tenant login rendered the deployed reset form. No email value was read,
  typed, copied, logged, or recorded by Codex. Post-remediation aggregate SQL
  remained seven Auth users, five verified project factors, one active Diverse
  City owner, and zero owner prior sign-ins, factors, or sessions.
- Blocker or interaction needed: Christian must privately enter the existing
  owner email and click `Send reset link` exactly once. Codex must not receive
  the address or interact with the mailbox/action URL/password/TOTP secret.
- Exact next step: Christian submits the handed-off form once and reports that
  the recovery message arrived or that the private callback is open. Continue
  the approved private password/TOTP sequence, AAL1/AAL2 and Starter-boundary
  acceptance, reconciliation, and stop before `DCFC-601`.
- Hosted mutations: exactly one Supabase staging Auth redirect URL added. Email
  sends: zero so far. All other Auth settings and all users, memberships,
  sessions, factors, SMTP/templates/rate limits, Vercel, Stripe, DNS,
  production, Bunny.net, Phase 6, Git commit, and push state remain unchanged.

### 2026-08-02 — DCFC-504 approved execution stopped at Auth redirect gate — Codex

- Package: `DCFC-504`
- Status: `blocked` before the approved single recovery request
- Approval: Christian approved the exact packet by replying "I approve this."
  The approval authorizes one recovery and private password/TOTP acceptance but
  expressly excludes Auth configuration changes.
- Completed: revalidated the safe identity baseline; read-only verified the
  current custom-SMTP enabled state, TOTP, 15-minute AAL1 enforcement, reset
  template routing, automatic security-notification switches, Site URL, and
  redirect allowlist; and stopped on the packet's callback mismatch condition.
- Files changed: `DCFC-504-APPROVAL-PACKET.md`, `STAGING-ACCEPTANCE.md`, this
  ledger, and repository `HANDOFF.md`. Pre-existing uncommitted Phase 5 changes
  remain preserved; no commit or push is authorized.
- Verification: the reset template uses the caller's clean `RedirectTo` plus
  token hash/recovery type. The deployed Diverse City request derives
  `https://diverse-city-onzio-staging.vercel.app/admin/auth/callback`, but the
  live allowlist has exactly three entries: staging branch, Alpha, and Bravo.
  The Diverse City callback is absent. All seven automatic security
  notifications are off. Reconciliation remains seven Auth users/five MFA
  factors and one confirmed active Diverse City owner with zero prior sign-in,
  owner factors, or owner sessions.
- Blocker: adding the exact Diverse City callback is an Auth configuration
  mutation expressly excluded from the current approval.
- Exact next step: Christian approves the packet's minimal fourth-redirect
  remediation. Add only that exact callback, retain Site URL/three existing
  entries, reload-verify four total, then continue the already-approved one-
  recovery/password/TOTP acceptance and stop before `DCFC-601`.
- Hosted mutations: zero. No recovery/email was sent; no Auth user, session,
  factor, membership, configuration, database, Storage, Vercel, Stripe, DNS,
  production, Bunny.net, video, Phase 6, Git, commit, or push mutation occurred.

### 2026-08-02 — DCFC-504 identity/recovery/MFA approval preparation — Codex

- Package: `DCFC-504` preparation only; not package execution
- Status: `blocked` at the explicit approval and recipient-availability gate
- Completed: reviewed the package, architecture, current Auth/recovery/MFA
  contracts, and existing staging SMTP history; checked current official
  Supabase Auth guidance; performed safe aggregate staging identity preflight;
  selected the no-duplicate existing-owner recovery path; and prepared the
  exact one-send, private-secret, acceptance, rollback, exclusion, and approval
  boundary in `DCFC-504-APPROVAL-PACKET.md`.
- Files changed: `DCFC-504-APPROVAL-PACKET.md`, `STAGING-ACCEPTANCE.md`, this
  ledger, and repository `HANDOFF.md`. The pre-existing uncommitted
  `DCFC-502`/`DCFC-503` worktree changes were preserved. No commit or push is
  authorized.
- Verification: the tenant has exactly one active owner, zero admins/removed
  memberships, and one linked confirmed email identity. That identity has a
  password hash but no prior sign-in, TOTP factor, active session, banned
  state, or deleted state. Project baseline remains seven Auth users and five
  verified MFA factors. Source review confirms recovery derives the clean
  callback from the verified browser origin, verifies a manually entered
  recovery code, separates first-time AAL1 password setup from later TOTP
  enrollment, and requires AAL2 for protected admin. Focused local gate results
  are green: 44/44 callback/recovery/authorization contracts and 2/2 real
  loopback recovery/MFA database scenarios. The first sandboxed database
  attempt received an empty local URL and failed before reaching Auth; the same
  unchanged scenarios passed in the permitted loopback context. Diff checks
  are clean.
- Blockers or decisions needed: Christian must approve the exact packet and be
  available to enter the private recipient/password/TOTP values. Automatic
  password/factor security-notification settings must be read-only reverified
  before the one approved recovery request; if they would send another message,
  stop for an expanded approval.
- Exact next step: Christian provides the approval language from
  `DCFC-504-APPROVAL-PACKET.md`; then reconfirm the non-secret staging posture,
  initiate exactly one recovery through the deployed Onzio login, complete the
  private first-time-owner password/TOTP flow, reconcile, and stop before
  `DCFC-601`.
- Hosted mutations: zero. Supabase Database/Auth/Storage, email/Resend, Vercel,
  Stripe, Git, DNS, production, Bunny.net, video, Phase 6, commit, and push
  mutations: zero.

### 2026-08-02 — DCFC-503 staging content, media, and presentation — Codex

- Package: `DCFC-503`
- Status: `complete`
- Approval: Christian approved Supabase staging project
  `fxefqnoqxbezeccjvrsw`, tenant
  `d88bf71b-9820-49ae-9dc0-7556b0813885`, and immutable semantic plan digest
  `63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36`.
  The approval is exhausted and did not authorize `DCFC-504` or any excluded
  provider/action.
- Completed: independently reproduced the semantic plan digest and byte-level
  SHA-256 `87efae9701f6e1fa4653a55f2687206f3370306bd900d83ee30352849b78702b`;
  added staging-only guarded import tooling; uploaded each approved normalized
  image to private staging, downloaded and checksum-verified it, published it
  once to a UUID-versioned tenant path with one-year immutable cache metadata,
  and removed the staging input; atomically inserted the approved content and
  presentation rows without changing the provisioned club, domain, membership,
  lifecycle, tier, public-access, or subscription state; and performed an
  identical Storage/database replay.
- Files changed: `scripts/import-diverse-city-staging.ts`,
  `CONTENT-MEDIA-READINESS.md`, `STAGING-ACCEPTANCE.md`, this ledger, and
  repository `HANDOFF.md`. These changes remain uncommitted because this
  package expressly excluded commit/push work; the earlier `DCFC-502` ledger
  edits remain preserved in the same dirty worktree.
- Verification: preflight found the exact Starter/onboarding/preview tenant,
  approved domain, one active owner, zero subscription/content/media/
  presentation rows, and empty Storage. Final state has ten `media_assets`,
  ten public objects / 2,864,062 bytes, zero private staging objects, four
  Programs, one Contact profile/page, four shop-kit and two carousel references,
  two Elsa's Bakery placements, zero Tryouts/players/staff/matches/standings,
  15 valid composite media relationships, zero checksum/path/forbidden-reference
  mismatches, zero cleanup rows, and ten raw public `image/webp` URLs returning
  HTTP 200. Published `academy@1` digest
  `1d2c6ce9eb91be5cc18a6017ffc783bdaedd231b40ea2bf5f3830b9b3549a008`
  matches its publication pointer and validation result. Identical replay kept
  state fingerprint `babdad9053e708e696f88a6af59e8231`, one import audit,
  all row/object counts, and the published pointer unchanged; it staged and
  removed ten fresh private copies while checksum-reusing all ten public
  objects. Recent Storage/API/Postgres logs contained no error signal.
- Local gates: Node 24 staging-tool execution; TypeScript; 310/310 contracts;
  20/20 architecture tests; 662/662 complete loopback suite across 68 files;
  generated database-type check; clean local `onzio,onzio_private` schema
  lint; production build; lint with only the three pre-existing Analytics hook
  warnings; and clean diff checks.
- Hosted mutations: Supabase Database inserted 37 approved tenant content/
  media/presentation rows plus one explicit import audit; existing triggers
  appended 24 insert audits. The identical database replay was a no-op.
  Storage performed ten final public uploads; across initial execution and
  replay it performed 20 private staging uploads and 20 matching staging
  deletions, ending with exactly ten public objects and zero staging objects.
  Auth/email/MFA, Stripe, Vercel, Git, DNS, production, Bunny.net, video,
  Phase 6, commit, and push mutations: zero.
- Rollback: not required. The pre-import backup remains the rollback baseline;
  the exact tenant-scoped object/row ledger is now recorded for compensating
  cleanup if a later package fails.
- Blockers or decisions needed: no `DCFC-503` blocker remains. `DCFC-504`
  requires a fresh exact approval for identity, invitation/email, and MFA
  acceptance; this package supplies no such authorization.
- Exact next step: prepare and obtain the separate `DCFC-504` approval using
  the privately held recipient/role inputs, then execute only the staging
  Auth/invitation/MFA acceptance package and stop before `DCFC-601`.

### 2026-08-02 — DCFC-502 staging release and private tenant — Codex

- Package: `DCFC-502`
- Status: `complete`
- Completed: pushed exact release commit
  `8e3cde2da52ec35a9e5fd7935197953c899a6cc5`; recorded protected READY Vercel
  deployment `dpl_8W3YtWSw6Bu2qAaUndeofiiWd2KM`; attached only the approved
  Diverse City staging alias; applied exactly the ten allowlisted migrations
  without seed; and used audited operator provisioning to create exactly one
  Diverse City staging tenant/domain with the existing operator identity as
  the minimum owner membership. No Auth user or email was created.
- Files changed: `DCFC-502-APPROVAL-PACKET.md`, `STAGING-ACCEPTANCE.md`, this
  ledger, and repository `HANDOFF.md`. These closeout edits remain local because
  the package excluded an additional commit/push.
- Verification: remote Git SHA equals the approved release; Vercel deployment
  and alias are exact/READY/protected; all 20 migration versions align; linked
  schema lint is clean; all 40 `onzio` tables have RLS; club/domain/member/audit
  readback is exact; all checked Diverse City content/billing/media counts are
  zero; Auth remains 7 users/5 MFA factors; Storage remains 2 buckets/0 objects;
  unauthenticated tenant access redirects to protected Vercel SSO with
  `no-store`; private admin entry resolves; public preview remains deliberately
  404 like Bravo; unknown host returns 404/`no-store`/`noindex`; deployment
  error-log and 5xx counts are zero. Disabled legacy JWT probes returned 401.
- Blockers or decisions needed: no `DCFC-502` blocker remains. Informational
  Supabase advisors remain outside this package: accepted Free-plan leaked-
  password posture, intentional policyless privileged tables, and performance
  index suggestions. `DCFC-503` requires a fresh exact approval.
- Exact next step: request `DCFC-503` approval naming tenant
  `d88bf71b-9820-49ae-9dc0-7556b0813885` and immutable plan digest
  `63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36`.
  Then import only approved content/media/presentation state and stop before
  `DCFC-504`.
- Hosted mutations: Git one push. Vercel one protected Preview deployment and
  one alias assignment. Supabase ten migrations plus one club, one domain, one
  membership, and one audit row. Auth/email, Storage, content/media,
  presentation, Stripe, DNS, production, Bunny.net, and Phase 6: zero.

### 2026-08-02 — Phase 5 release preparation and DCFC-502 packet — Codex

- Package: `DCFC-502` release prerequisite only; not package execution
- Status: `blocked` at the push/deployment authorization boundary
- Completed: reviewed the accumulated Phase 3-5 tenant-safe implementation and
  documentation as one release scope; confirmed the two local commits already
  ahead of `origin/staging` are required Phase 9/11 prerequisites; ran the full
  local release gates; prepared the exact tenant, migration, operator,
  verification, rollback, exclusion, and approval boundary in
  `DCFC-502-APPROVAL-PACKET.md`; and prepared one local release commit.
- Files changed: the reviewed Phase 3-5 application, shared platform, migration,
  test, deterministic-import, and rollout-documentation changes listed by the
  release commit, including this ledger, repository `HANDOFF.md`,
  `STAGING-ACCEPTANCE.md`, and `DCFC-502-APPROVAL-PACKET.md`.
- Verification: clean local reset through all 20 migrations; TypeScript;
  310/310 contracts; 20/20 architecture tests; 78/78 local database tests;
  662/662 full suite; generated database types; clean local
  `onzio,onzio_private` schema lint; deterministic plan/rehearsal and exact
  reset/replay/isolation; production build; ESLint with only three pre-existing
  Analytics hook warnings; and four desktop/mobile public/protected-admin
  Playwright checks. The optional `agent-browser` executable was unavailable,
  so the repository's dedicated Playwright configs supplied equivalent browser
  evidence. Diff/secret review found no credential material; only documented
  placeholder/test-secret patterns exist.
- Blockers or decisions needed: this repository's Vercel integration deploys
  the `staging` branch on push. Christian authorized a push but expressly did
  not authorize deployment, so pushing would exceed the narrower negative
  boundary. No Vercel configuration workaround is authorized.
- Exact next step: Christian either approves the exact prepared commit under
  the `DCFC-502-APPROVAL-PACKET.md` language, including the protected deployment
  caused by pushing `staging`, or provides an approved non-deploying Git-ref
  update path. Then push, prove the exact remote/deployment SHA, and execute only
  the separately approved `DCFC-502`. Stop before `DCFC-503`.
- Hosted mutations: zero. Git: one local release commit, zero push. Supabase,
  Vercel, Stripe, tenant/domain, Storage, Auth/email, DNS, production, Bunny.net,
  and Phase 6 mutations: zero.

### 2026-08-02 — DCFC-501 remediation and acceptance closeout — Codex

- Package: `DCFC-501`
- Status: `complete`
- Completed: executed Christian's exact-scope remediation approval against
  Supabase staging `fxefqnoqxbezeccjvrsw`, Vercel project
  `prj_I362ysmh9cse5cRxnL7db4dOhsEs`, and the existing Stripe test webhook.
  Captured a mode-restricted role/schema/data backup outside Git; replaced the
  three hosted Phase 7 execution timestamps with the three canonical history
  versions without executing schema SQL; atomically replaced the exposed
  Vercel automation bypass and updated the same Stripe test webhook; and
  completed the read-only acceptance re-run. The first replacement required
  the documented rollback because Vercel required `isEnvVar=true`; Stripe was
  restored and that replacement revoked before the corrected rotation.
- Files changed: `docs/phase-11/diverse-city/DCFC-501-REMEDIATION-PLAN.md`,
  `docs/phase-11/diverse-city/STAGING-ACCEPTANCE.md`, this ledger, and
  repository `HANDOFF.md`. The private backup remains outside the repository.
- Verification: backup permissions/sizes/SHA-256; canonical ten-row linked
  history; linked dry run of exactly the ten reviewed `DCFC-502` migrations;
  clean linked `onzio,onzio_private` lint; all 32 current `onzio` tables with
  RLS; empty private browser grants and `PUBLIC` private-function grants; Data
  API exposure of `onzio` but not `onzio_private`; modern publishable/disabled
  legacy-key posture; TOTP, 15-minute AAL1 enforcement, staging SMTP/Auth URL
  and rate-limit settings; unchanged Alpha/Bravo counts/isolation; empty
  Storage; Supabase advisor/log review; protected Vercel project with exactly
  one environment-variable bypass; and enabled test-only Stripe webhook with
  the unchanged seven-event allowlist. No secret was recorded. Dashboard
  navigation incidentally rendered Auth/project identity fields; none was
  used, copied, or recorded.
- Blockers or decisions needed: no `DCFC-501` blocker remains. `DCFC-502`
  requires a fresh Class 3 approval naming the exact release commit, the ten
  migrations, Supabase/Vercel targets, Diverse City staging slug/name/hostname,
  and an operator actor reference held outside Git. The current dirty worktree
  is not a deployable release commit, local `HEAD`
  `a305b69a36a2675be3d6216f53388a28ab063a66` differs from `origin/staging`,
  and this approval expressly excluded commit/push work.
- Exact next step: prepare and obtain the separate `DCFC-502` release/
  provisioning approval, including separately authorized commit/push work if
  the intended Phase 5 source is to become the release commit. Then apply only
  the enumerated migrations, deploy that exact protected staging release, and
  provision Diverse City exactly once. Stop again before `DCFC-503`.
- Hosted mutations: Supabase migration-history only, six status changes. Vercel
  successful mutations: five across the rolled-back and final rotations; one
  rejected revoke request made no state change. Stripe test webhook URL
  mutations: three including rollback and final update. Hosted schema/data,
  tenant, Storage, Auth/email, deployment, environment variables, DNS,
  production, live Stripe, and Bunny.net: zero. Git commit/push: zero.

### 2026-08-01 — DCFC-501 approval-gate checkpoint — Codex

- Package: `DCFC-501` prerequisite remediation approval gate
- Status: `blocked`; third consecutive goal checkpoint at the same required
  explicit-approval boundary
- Completed: re-read the current worktree, `DCFC-501-REMEDIATION-PLAN.md`, this
  ledger, and `HANDOFF.md`; confirmed the remediation plan remains
  `awaiting_explicit_approval` and that no user approval authorizing its Class 3
  hosted actions has been received. Preserved the full Phase 5 objective and
  all existing dirty-worktree changes.
- Files changed: `docs/phase-11/diverse-city/STATUS.md` and repository
  `HANDOFF.md` only for this checkpoint.
- Verification: `git status --short`; direct read of the exact approval plan,
  package ledger, and handoff. No provider read or product test was needed
  because authorization—not implementation evidence—is the unchanged blocker.
- Blockers or decisions needed: Christian must provide the exact-scope approval
  recorded under `DCFC-501-REMEDIATION-PLAN.md` before any backup, migration-
  history repair, bypass rotation, or Stripe test webhook update. This approval
  would still not authorize `DCFC-502`.
- Exact next step: pause the persistent goal as blocked. When Christian provides
  that approval and resumes it, execute only the remediation plan, re-run
  `DCFC-501`, and stop again before `DCFC-502`.
- Hosted mutations: zero. No Supabase, Vercel, Stripe, Auth/email, Storage, DNS,
  production, Bunny, git commit, or push action occurred in this checkpoint.

### 2026-08-01 — DCFC-501 remediation planning — Codex

- Package: `DCFC-501` prerequisite remediation planning
- Status: `blocked`, awaiting explicit approval
- Completed: proved that the three hosted-only Phase 7 migration versions are
  semantically equivalent execution-timestamp records for the three canonical
  tracked migrations; verified the current routine security/search-path/grant
  effects; enumerated the exact ten-migration `DCFC-502` release delta; and
  created `DCFC-501-REMEDIATION-PLAN.md` with exact targets, local file hashes,
  history-only repair, manual Free-plan backup, atomic Vercel bypass/Stripe
  test-webhook rotation, rollback, stop conditions, and approval language.
  Read-only Vercel settings also proved that the shared project protects all
  non-custom-domain deployments, enables Git-fork protection, and has exactly
  one environment-variable automation bypass. No bypass value was returned.
- Files changed: `docs/phase-11/diverse-city/DCFC-501-REMEDIATION-PLAN.md`,
  `docs/phase-11/diverse-city/STAGING-ACCEPTANCE.md`,
  `docs/phase-11/diverse-city/STATUS.md`, and repository `HANDOFF.md`.
- Verification: compared remote stored migration statements and current
  routine attributes/grants with the three canonical files; confirmed their
  original Phase 7 Git commits; computed the canonical SHA-256 values;
  confirmed `supabase migration repair` is history-only and the installed CLI
  supports linked role/schema/data dumps and dry-run pushes; reviewed current
  Supabase plan limits for leaked-password protection and backups; filtered
  Vercel protection reads to non-secret project settings, bypass count, scope,
  and environment-variable flag only. Product tests were not rerun because
  this work changed documentation only.
- Blockers or decisions needed: Christian must explicitly accept the Free-plan
  staging password-screening exception with TOTP/protected-preview controls,
  the restricted manual backup, the six-version history repair, the atomic
  Vercel bypass/Stripe test-webhook update, and the migration-ledger acceptance
  clarification. Current Auth/SMTP/PostgREST settings must then be re-attested
  read-only. The stale release remains for `DCFC-502`, not this remediation.
- Exact next step: obtain the exact-scope approval in
  `DCFC-501-REMEDIATION-PLAN.md`; execute only that remediation; re-run and
  close `DCFC-501` if every acceptance item passes; then stop and request a
  fresh `DCFC-502` approval. No approval rolls forward.
- Hosted mutations: zero. This planning pass made only read-only Supabase and
  Vercel checks and local documentation changes. No database/history row,
  deployment, bypass, environment value, Stripe object, Auth/email, Storage,
  DNS, production, Bunny resource, commit, or push changed.

### 2026-08-01 — DCFC-501 — Codex

- Package: `DCFC-501`
- Status: `blocked`
- Completed: performed the approved Class 1 staging-only preflight and recorded
  safe Supabase, Vercel, Stripe test, tenant, Auth-count, Storage, monitoring,
  and rollback identifiers in `STAGING-ACCEPTANCE.md`. The exact Supabase
  staging project is healthy on the Free plan; the existing Alpha/Bravo rows,
  memberships, MFA-factor counts, buckets, Stripe test Prices/Portal/webhook,
  protected Vercel aliases, Preview deployment, commit, and variable-name
  scopes were read without changing them. Identities, messages, and Bunny
  resources were not inspected. No secret value was intentionally requested;
  the provider-returned bypass credential exception is recorded below.
- Files changed: `docs/phase-11/diverse-city/STAGING-ACCEPTANCE.md`,
  `docs/phase-11/diverse-city/STATUS.md`, and repository `HANDOFF.md` only.
- Verification: `git status --short`; Supabase project/organization reads;
  MCP and CLI migration-ledger comparison; read-only schema/RLS/grant/count
  queries; `supabase db lint --linked --schema onzio,onzio_private` (clean);
  Supabase security advisors and last-24-hour log summaries; Vercel project,
  deployment, branch/commit, alias, protection-header, and Preview/staging
  environment-name reads; in-memory non-secret environment checks; Stripe CLI
  default-test-mode retrieval of the two Prices, Portal, and webhook. No
  product tests were rerun because this package changed documentation only.
- Blockers or decisions needed: only seven migration versions align; three
  hosted Phase 7 versions and three differently timestamped local Phase 7
  files conflict, with ten additional local-only migrations. Presentation and
  Diverse City tables are absent remotely. Leaked-password protection is
  disabled and current Auth/SMTP/PostgREST exposure could not be completely
  attested. The linked Vercel project ID now resolves as `onzio-rcfc`; the
  latest historical staging deployment is behind repository HEAD. The four
  `media_assets` rows are explicitly `orphaned` and reconcile to zero Storage
  objects. Backup/export ownership is unproven. The test webhook's stored URL
  contains a Vercel protection-bypass credential surfaced during the read;
  treat it as exposed and rotate only
  under separate approval. A connected Stripe app initially revealed that it
  was live-scoped and returned one live Portal configuration before the mode
  mismatch was visible; inspection stopped immediately and no further live
  Stripe read occurred.
- Exact next step: keep the goal active but stop at `DCFC-501`. Prepare a
  separately reviewed remediation/`DCFC-502` approval that names the shared
  Vercel Preview target, exact release commit, migration-history repair and
  application sequence, safe credential rotation/update boundary, backup/
  rollback owner, and the staging tenant hostname. Do not start `DCFC-502`
  until `DCFC-501` acceptance is re-run and complete.
- Hosted mutations: zero. Read-only access was limited to the named Supabase
  staging project, recorded Vercel staging aliases/shared-project metadata,
  Stripe test objects, and the single stopped live-mode scope check described
  above. No database/Auth/Storage row, deployment, environment value, Stripe
  object, DNS record, email, Bunny resource, commit, or push changed.

### 2026-08-01 — DCFC-404 — Codex

- Package: `DCFC-404`
- Status: `complete`
- Completed: created `ROLLOUT-INPUT-APPROVAL-MANIFEST.md` as the final Phase 4
  lock. It records the approved snapshot, local tenant ID, semantic and
  byte-level plan digests, replayed tenant-state digest, content/media/video
  decisions, reconciliation counts, approvals, and exact stop boundary.
  `DCFC-D118` explicitly defers every unsupplied hosted input rather than
  inventing hostnames, recipients, billing identifiers, DNS ownership, launch
  dates, or observation duration. The deferral keeps `DCFC-501` blocked.
- Files changed: `ROLLOUT-INPUT-APPROVAL-MANIFEST.md`, `DECISIONS.md`, all
  Phase 4 rollout checklists, `ROLLOUT-EPIC.md`,
  `ROLLOUT-WORK-PACKAGES.md`, `STATUS.md`, and repository `HANDOFF.md`.
- Verification: cross-document package/decision/link review; locked plan
  digest `63d18676…fa36`, file SHA-256 `87efae97…02b`, tenant-state digest
  `b595fc81…376d`; final executable gates are recorded under `DCFC-403`; all
  repository-local rollout references resolve and `git diff --check` passed.
- Blockers or decisions needed: no Phase 4 implementation blocker. Exact
  `DCFC-D112`/`DCFC-D113` staging inputs remain deliberately deferred, and
  `DCFC-D115`–`DCFC-D117` remain deferred to their later gates. As a result,
  the rollout cannot begin and `DCFC-501` is not eligible.
- Exact next step: stop the goal. Christian may later supply the exact safe
  staging inputs and separately assign/approve only read-only `DCFC-501`.
- Hosted mutations: zero. No staging/production system, hosted credential,
  Supabase/Vercel/Stripe/DNS/Bunny/Auth/email resource, commit, or push was
  accessed or changed.

### 2026-08-01 — DCFC-403 — Codex

- Package: `DCFC-403`
- Status: `complete`
- Completed: built a fail-closed deterministic planner and loopback-only
  importer with checked-in immutable artifact, byte-level media validation and
  local normalization, tenant-scoped UUID Storage paths, approved normalized
  content/presentation rows, idempotent upsert, complete reconciliation,
  exact tenant reset, and reset/replay. Added reusable tenant-safe empty/About/
  Shop/Sponsor behavior, Academy Sponsors rendering, deliberate Roster and
  Schedule empty states, and verified same-tenant rewrite routing without
  permitting cross-tenant internal paths. A volatile planner timestamp found
  during final evidence capture was pinned and regression-tested so the entire
  JSON artifact, not only its semantic digest, is deterministic. The browser
  matrix timeout was made explicit for its 20 public route/viewport checks;
  no behavioral assertion was weakened.
- Files changed: planner/importer modules and scripts; package scripts; locked
  JSON plan; tenant-safe content/query/UI/routing files; focused contract and
  browser tests; Playwright config; Phase 4 documentation and handoff.
- Verification: from-scratch local `npm run db:reset`; two independent plans
  both produced semantic digest `63d18676…fa36` and file SHA-256
  `87efae97…02b`; clean-stack rehearsal produced state digest
  `b595fc81…376d`, idempotent replay, exact 10-object/tenant reset, identical
  reset replay, Alpha/Bravo isolation, 15 relationships, zero forbidden
  references, and zero hosted mutations. `npx tsc --noEmit` passed; complete
  loopback-mapped tests passed 662/662 across 68 files; generated DB types
  match; local `onzio`/`onzio_private` lint found no errors; lint/build passed
  with only the three pre-existing Analytics hook warnings; desktop/mobile
  public and protected AAL2 admin Playwright passed 2/2.
- Blockers or decisions needed: none inside `DCFC-403`. Hosted inputs and
  approvals remain outside this local package.
- Exact next step: complete the Class 1 `DCFC-404` input lock without opening
  credentials or inspecting staging.
- Hosted mutations: zero. Database, Auth, and Storage execution targeted only
  loopback containers and the deterministic local tenant. No hosted resource,
  email, deploy, DNS, billing, video provider, commit, or push was used.

### 2026-08-01 — Phase 4 approval gate — Codex

- Package: `DCFC-401` and overlapping read-only `DCFC-402`
- Status: `blocked`
- Completed: exhausted the safe Class 1 work available without deciding club
  facts or rights: route/field/provenance audit, all 42 media source facts and
  checksums, duplicate/exclusion analysis, exact existing destination mapping,
  video-capability assessment, executable Academy runtime audit, and corrected
  content/media recommendations. The audit also identified hardcoded Academy
  navigation/footer routes, unsupported poster/carousel/affiliation roles,
  missing Roster/Schedule empty states, and legacy Shop/About/Sponsor fallback
  risks. No unapproved assumption was converted into an import manifest.
- Files changed: `CONTENT-MEDIA-READINESS.md`,
  `MEDIA-SOURCE-INVENTORY.md`, `DECISIONS.md`, `ROLLOUT-EPIC.md`,
  `ROLLOUT-WORK-PACKAGES.md`, `STATUS.md`, and repository `HANDOFF.md`.
- Verification: all 42 media files are represented by one full SHA-256 row;
  no source checksum is duplicated; snapshot remains clean at approved commit
  `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`; source/schema/registry/runtime
  audits completed; `git diff --check` passed. Product tests were not run
  because no Phase 4 executable file has been changed.
- Blockers or decisions needed: Christian must approve or revise the corrected
  baseline, confirm retained facts and publication rights, accept the
  crest-led hero plus hidden vertical story under `DCFC-D114`, and authorize
  either the recommended smallest reusable route/empty-state/fallback work in
  `DCFC-403` or a different explicit route disposition.
- Exact next step: Christian replies `Approved and rights confirmed` or lists
  exceptions. On resume, record the accepted decisions, close `DCFC-401` and
  `DCFC-402`, then begin red-first loopback-only `DCFC-403`. Do not start it
  while this approval is unresolved.
- Hosted mutations: none. No hosted credential, Supabase/Vercel/Stripe/DNS/
  Bunny/Auth/email resource, staging environment, commit, or push was accessed
  or changed.

### 2026-08-01 — DCFC-402 — Codex

- Package: `DCFC-402`
- Status: `in_progress`
- Completed: inventoried all 42 files under the approved snapshot's
  `public/media` tree with full byte counts, detected MIME types/signatures,
  dimensions, alpha state where applicable, and SHA-256 checksums; separated
  live/referenced roles from supplied-but-unused files; recommended exact
  import, reuse, conditional, replacement, and exclusion dispositions; rejected
  the three SVG social icons from the media-import path; excluded the two live
  MP4s unless a separate video capability completes; audited the real Academy
  media/reference surface; and corrected the initial poster recommendation
  after proving `homepage_hero_content` has no media reference and there is no
  reusable Academy vertical-story reference. The manifest now uses the
  existing crest-led Academy hero, hides the vertical story, omits unsupported
  affiliation and Special Olympics carousel media, and maps every remaining
  recommended asset to an existing tenant-safe table/column. No source file
  was changed.
- Files changed: new `MEDIA-SOURCE-INVENTORY.md`, plus
  `CONTENT-MEDIA-READINESS.md` and `STATUS.md`.
- Verification: all 42 source files have exactly one full checksum row in the
  inventory; no source file is missing and no two source files share a SHA-256;
  `file`, `stat`, `sips`, `ffprobe`, and `shasum -a 256` completed read-only;
  source/schema/registry/runtime `rg` audits confirmed the mapping and absence
  of poster/carousel/Academy-affiliation references; `git diff --check` passed.
- Blockers or decisions needed: publication-rights/current-fact attestation,
  the `DCFC-D114` crest-led-hero/hide-story decision, and `DCFC-D106`'s
  route-visibility/empty-state choice remain required. Exact normalized facts,
  destination UUIDs, and rollback/replay evidence belong to `DCFC-403` after
  `DCFC-401`/`DCFC-402` close.
- Exact next step: Christian approves or revises the recommended production
  dispositions and identifies the rights evidence owner; then close
  `DCFC-401`/`DCFC-402` and begin the loopback-only `DCFC-403` rehearsal.
- Hosted mutations: none. No hosted credentials, provider reads, uploads,
  deletes, or other external actions occurred; no commit or push was created.

### 2026-08-01 — DCFC-401 — Codex

- Package: `DCFC-401`
- Status: `in_progress`
- Completed: recorded Christian's approval of `DCFC-EPIC-002` and the
  Phase 4-only goal as `DCFC-D111`; reconfirmed the isolated snapshot is clean
  at approved commit `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`; audited the
  live route/source references for preview roster/staff identities, TBA
  fixtures and Tryouts, temporary Google registration destinations, sponsor
  opportunity cards, seed standings, video sources, public contact links, and
  the preview disclosure; added a conservative route-by-route production
  disposition recommendation without silently accepting any open decision;
  and audited it against the executable Academy runtime. That audit found the
  published presentation navigation list is not consumed by `Nav`/`Footer`,
  affiliation media is not content-driven for Academy, Roster/Schedule lack
  deliberate Academy empty states, and static homepage poster treatment is
  unsupported. It also found that missing Shop and About rows fall back to
  legacy Rose City defaults, and the sponsor carousel initializes with legacy
  defaults before its tenant read. The recommendation was corrected rather
  than assuming those capabilities are safe.
- Files changed: `DECISIONS.md`, `ROLLOUT-EPIC.md`,
  `ROLLOUT-WORK-PACKAGES.md`, `CONTENT-MEDIA-READINESS.md`, `STATUS.md`, and
  repository `HANDOFF.md` when this checkpoint is synchronized.
- Verification: `git status --short`; snapshot `git status --short` and
  `git rev-parse HEAD`; read-only `rg` route/source audits. Product tests are
  not yet applicable because this checkpoint changes documentation only.
- Blockers or decisions needed: Christian must approve or revise the corrected
  content/hide table; choose reusable route visibility/empty states; attest
  current publication rights and current Contact/sponsor/shop facts; and
  approve the crest-led hero plus hidden vertical story under `DCFC-D114`
  before `DCFC-401`/`DCFC-402` can close. If Shop/About are not imported,
  tenant-safe fallback fixes are mandatory before rehearsal can pass.
- Exact next step: collect the batched approvals, finish the immutable media
  inventory under `DCFC-402`, then close `DCFC-401` and `DCFC-402` only when
  every row has an accepted disposition and evidence owner.
- Hosted mutations: none. No hosted system, credential, resource, or staging
  environment was accessed; no commit or push was created.

### 2026-07-31 — Epic planning packet — Codex

- Package: planning/governance setup outside implementation packages
- Status: complete
- Completed: created the Phase 0-3 epic, decision log, initial content matrix,
  visual acceptance contract, agent-neutral work packages, and shared status
  ledger; added durable repository instructions requiring every agent to
  update progress before ending
- Files changed: `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, and
  `docs/phase-11/diverse-city/*`
- Verification: documentation links, package IDs, dependencies, status values,
  approval boundaries, and no-hosted-mutation rules reviewed locally
- Blockers or decisions needed: Christian review; DCFC-D101 Contact inputs and
  DCFC-D102 Tryouts inputs remain open
- Exact next step: approve or revise this packet, then assign DCFC-001 and/or
  DCFC-002 in isolated snapshot worktrees
- Hosted mutations: none

### 2026-07-31 — DCFC-001 — Claude Code (Sonnet 5)

- Package: DCFC-001
- Status: in_review (superseded below — see 2026-07-31 approval record)
- Completed: implemented `/contact` in the isolated Diverse City FC snapshot
  (`/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site`).
  The page uses the club's real, already-verified email, phone, and
  Instagram/Facebook/X destinations from `lib/site-data.ts` (no invented
  contact facts), plus a service-area line built from the existing
  `location`/`region` fields. Added original review-only hero eyebrow,
  headline, and intro copy (not client-approved final copy). Added a
  footer-only "Contact" quick link (matching the existing Sponsors precedent),
  per Christian's explicit choice for this pass; the primary nav was not
  changed. No message-submission backend, hours, or response-time claim was
  added.
- Files changed:
  - `app/(public)/contact/page.tsx` (new)
  - `components/Footer.tsx` (added Contact quick link)
  - `HANDOFF.md`, `README.md`, `SUMMARY.md` (snapshot docs)
  - `/Users/christianalcala/.claude/launch.json` (added a
    `diverse-city-fc-preview` dev-server entry for browser verification; no
    application file)
- Verification: `npm run typecheck` passed; `npm run build` passed with
  `/contact` prerendered statically and only the same pre-existing admin
  analytics warnings; local dev server browser checks at 1440x900 desktop and
  390px-wide mobile confirmed correct rendering, the new footer link, correct
  `mailto:`/`tel:`/social hrefs, no horizontal overflow, no console errors, and
  no broken images.
- Blockers or decisions needed: `DCFC-D101` remains open — Christian's review
  of the placeholder headline/intro copy, confirmation of footer-only nav
  placement, and any service-hours text is needed before `DCFC-003` (visual
  freeze) can consider Contact locked.
- Exact next step: Christian reviews `/contact` locally
  (`npm run dev -- --port 3012` in the snapshot, then
  `http://localhost:3012/contact`); on approval, move DCFC-001 to `complete`
  and proceed to DCFC-002 (Tryouts) once real inputs are available, then
  DCFC-003.
- Hosted mutations: none. No Supabase, Storage, Vercel, Stripe, DNS, email, or
  production resource was touched; work stayed local to the isolated snapshot
  and `onzio-platform` documentation.

### 2026-07-31 — DCFC-001 approval — Claude Code (Sonnet 5)

- Package: DCFC-001
- Status: complete
- Completed: Christian reviewed the local `/contact` page in-session (removing
  "— Chicago Area" from the location line, leaving just the real
  `location` fact "Schaumburg, Illinois") and then approved the page in full —
  headline/intro copy, destinations, and footer-only nav placement. This
  resolves decision `DCFC-D101` as accepted; `DECISIONS.md` is updated to
  match.
- Files changed since the prior record:
  - `app/(public)/contact/page.tsx` (location value simplified to
    `club.location` only, dropping the appended region text)
  - `HANDOFF.md` (snapshot) — corrected the Contact section's description of
    the location field
- Verification: `npm run typecheck` passed after the edit; local browser
  check confirmed the rendered page text shows "Schaumburg, Illinois" with no
  trailing region text, and no other regressions.
- Blockers or decisions needed: none for DCFC-001. `DCFC-D101` is closed.
- Exact next step: `DCFC-003` (visual freeze) still needs `DCFC-002`
  (Tryouts) before it can proceed — `DCFC-002` remains unassigned pending real
  age-group, eligibility, date, location, cost, and registration-URL inputs
  (or Christian's explicit approval to use clearly-labeled temporary
  placeholders per `DCFC-D102`).
- Hosted mutations: none.

### 2026-07-31 — DCFC-002 — Claude Code (Sonnet 5)

- Package: DCFC-002
- Status: in_review
- Completed: implemented `/tryouts` in the isolated Diverse City FC snapshot.
  The page is status-aware (`upcoming`/`open`/`closed`; shipped as `upcoming`,
  the honest current state since no real tryout window is confirmed) with a
  hero, an external registration CTA, and an Age Groups/Location/Cost detail
  row. Per Christian's explicit direction (matching his DCFC-001 approach):
  - Age Groups, Location, and Cost render as "TBA" in the same muted style
    already used by the Schedule page's fixture placeholders. No specific
    age range, venue, or price was invented.
  - The registration CTA reuses the same already-approved temporary
    destination as the existing Special Olympics program page
    (`https://www.google.com/`), per Christian's explicit choice, for
    consistent treatment across the snapshot. It carries the same
    third-party-disclosure copy pattern.
  - When the status is `closed` or the URL is absent, the CTA fails closed to
    a `mailto:` contact link instead of a dead/misleading button (verified by
    temporarily toggling both).
  - Per Christian's explicit nav instructions: restructured `Schedule` from a
    plain link into a dropdown parent (`components/Nav.tsx`) with two
    children — "Fixtures" (`/schedule`) and "Tryouts" (`/tryouts`) — refactoring
    the prior Programs-only dropdown state into a generic keyed
    open/close mechanism shared by both dropdowns. Added "Contact" as a new
    plain link in the primary nav positioned after Store (previously
    footer-only per the DCFC-001 approval). Added "Tryouts" to the footer
    quick-links list.
  - Whether Tryouts should support one current opportunity or multiple
    structured event rows is decision `DCFC-D103`, deferred to Phase 1; this
    pass implements the single-current-opportunity model only, not a
    silent resolution of that decision.
- Files changed:
  - `app/(public)/tryouts/page.tsx` (new)
  - `components/Nav.tsx` (Schedule dropdown restructuring, generic dropdown
    state, Contact added to main nav, generalized active-state detection)
  - `components/Footer.tsx` (added Tryouts quick link)
  - `HANDOFF.md`, `README.md`, `SUMMARY.md` (snapshot docs)
- Verification: `npm run typecheck` passed. `npm run build` initially failed
  with a stale-`.next`-cache error (`Cannot find module for page:
  /admin/branding`) caused by running `build` while the dev server was
  concurrently writing to the same `.next` directory — a tooling artifact,
  confirmed by clearing `.next` and rebuilding cleanly, which passed with
  `/tryouts` prerendered alongside all other routes and only the same
  pre-existing admin analytics warnings. Local browser checks at 1440x900
  desktop and 390px-wide mobile confirmed: all three status states render
  correctly (toggled and reverted to `upcoming`); the missing-URL fallback
  works (toggled and reverted to the approved URL); the Schedule dropdown
  opens via hover (desktop) and tap (mobile, confirmed via `aria-expanded`)
  and its "Tryouts" child navigates correctly; the new main-nav Contact link
  and footer Tryouts link both resolve; active-state highlighting correctly
  generalizes across dropdown children instead of being hardcoded to
  Programs; no horizontal overflow, console errors, or broken images at
  either breakpoint.
- Blockers or decisions needed: `DCFC-D102` remains open overall — the
  registration-URL and navigation-placement portions were explicitly approved
  by Christian in this session, but age groups, eligibility, dates,
  locations, and cost language are still unresolved and rendered as honest
  "TBA" placeholders. `DCFC-D103` (single vs. multiple tryout events) remains
  explicitly deferred to Phase 1, not resolved by this implementation.
- Exact next step: Christian reviews `/tryouts` locally
  (`npm run dev -- --port 3012` in the snapshot, then
  `http://localhost:3012/tryouts`, and the restructured nav); on approval,
  move DCFC-002 to `complete`, record `DCFC-D102`'s approved sub-decisions in
  `DECISIONS.md`, and proceed to DCFC-003 (visual freeze).
- Hosted mutations: none. No Supabase, Storage, Vercel, Stripe, DNS, email, or
  production resource was touched; work stayed local to the isolated snapshot
  and `onzio-platform` documentation.

### 2026-07-31 — DCFC-002 review revisions — Claude Code (Sonnet 5)

- Package: DCFC-002
- Status: in_review
- Completed: applied Christian's first-review feedback on `/tryouts`, still
  pending final approval:
  - Removed the "Tryouts" eyebrow, the status badge, and the "Take the
    field." headline line; headline is now the single line "Join Diverse
    City FC" (no trailing period). Status is now conveyed only through the
    intro paragraph.
  - Removed the Age Groups detail card; the row is now Location and Cost
    only.
  - Removed a fixed `min-w-64` on the Schedule/Programs nav dropdown panels
    (`components/Nav.tsx`) that left excess empty space for short labels like
    "Fixtures"/"Tryouts"; both panels now size to their own content.
  - Tightened the hero-to-cards vertical gap, which had doubled up from the
    hero's bottom padding stacking with the next section's top padding.
  - Fixed the Location/Cost card row stretching across the full section width
    for short "TBA" content: `md:inline-grid md:grid-cols-2` now shrinks the
    two-card block to its own content at desktop widths, while mobile keeps
    its original full-width single-column stack.
- Files changed: `app/(public)/tryouts/page.tsx`, `components/Nav.tsx`,
  `HANDOFF.md` (snapshot).
- Verification: `npm run typecheck` passed; clean `npm run build` (after
  clearing `.next`) passed with only the same pre-existing warnings; local
  desktop (1440x900) and mobile (390px) checks confirmed the simplified
  hero, tightened hero-to-cards spacing, the compact desktop Location/Cost
  block, unchanged full-width mobile stacking, tightened Schedule and
  Programs dropdowns, and no horizontal overflow, console errors, or broken
  images.
- Blockers or decisions needed: same as the prior record — `DCFC-D102` core
  facts (age groups, eligibility, dates, locations, cost) remain open;
  `DCFC-D103` remains deferred to Phase 1.
- Exact next step: Christian reviews the revised `/tryouts` and nav; on
  approval, move DCFC-002 to `complete` and proceed to DCFC-003.
- Hosted mutations: none.

### 2026-07-31 — DCFC-002 approval — Claude Code (Sonnet 5)

- Package: DCFC-002
- Status: complete
- Completed: Christian reviewed the revised `/tryouts` page and nav
  restructuring in-session (after the eyebrow/badge/headline-line removal,
  Age Groups card removal, dropdown tightening, hero-to-cards spacing fix,
  and Location/Cost block realignment) and approved it in full.
- Files changed since the prior record: none — this record finalizes the
  already-applied and already-verified revisions from the prior two
  records.
- Verification: carried over from the prior records — `npm run typecheck`
  and a clean `npm run build` both passed; desktop (1440x900) and mobile
  (390px) browser checks confirmed correct rendering, no horizontal
  overflow, no console errors, no broken images.
- Blockers or decisions needed: none for DCFC-002 itself. `DCFC-D102`
  remains partially open at the epic level — the registration-URL,
  navigation-placement, and visual-layout portions are approved, but age
  groups, eligibility, dates, locations, and cost language remain
  unresolved and are honestly rendered as "TBA" per the work package's
  explicit allowance for clearly-labeled placeholders. `DCFC-D103` (single
  vs. multiple tryout events) remains explicitly deferred to Phase 1.
- Exact next step: `DCFC-003` (visual freeze and approval) is now eligible —
  both its dependencies (DCFC-001, DCFC-002) are complete. Assign DCFC-003 to
  record the pinned snapshot commit, desktop/mobile evidence, and Christian's
  approval for both new pages per `VISUAL-ACCEPTANCE.md`, then update
  `CONTENT-MATRIX.md` to reflect the approved pages before Phase 1 begins.
- Hosted mutations: none.

### 2026-07-31 — DCFC-003 — Claude Code (Sonnet 5)

- Package: DCFC-003
- Status: complete
- Completed: verified and pinned Contact and Tryouts as approved Phase 0
  additions to the Diverse City visual specification.
  - Gathered every item on `VISUAL-ACCEPTANCE.md`'s evidence list for both
    `/contact` and `/tryouts`: HTTP 200, no console errors (a stale
    RSC-prefetch error in one long-lived browser tab was confirmed to be a
    tooling artifact by reproducing a clean load in a fresh tab), no
    horizontal overflow at 1440x900 and 390px-wide mobile, positive
    `naturalWidth`/`naturalHeight` on every rendered image, real-keyboard
    `Tab` reaching and producing a native focus outline on both a Contact
    detail link and the Tryouts external CTA, every primary-nav and footer
    link enumerated and resolving correctly, external links confirmed as
    plain no-data-submission anchor navigations, and `noindex, nofollow`
    confirmed via both the `X-Robots-Tag` response header and the page
    meta tag.
  - With Christian's explicit approval, created one local git commit in the
    snapshot repository (`a0f9f0c201e7d0e54b821c22f8c60159798f7477`) so the
    approved state has a citable, pinned commit hash. The snapshot repo has
    no configured remote, so nothing was or could be pushed.
  - Documented two honest gaps against the Tryouts required-checks list
    rather than papering over them: no FAQ content exists (none was
    supplied, so none was invented) and there is no dedicated "Dates" detail
    card (Location/Cost only, per Christian's explicit request); dates are
    acknowledged only in prose.
- Files changed: `docs/phase-11/diverse-city/VISUAL-ACCEPTANCE.md` (full
  evidence record, approved-commit section), `docs/phase-11/diverse-city/STATUS.md`.
  One local commit in the snapshot repository (see above); no further
  snapshot application code changed.
- Verification: see the itemized evidence list now recorded in
  `VISUAL-ACCEPTANCE.md`.
- Blockers or decisions needed: none for DCFC-003 itself. The FAQ and Dates
  gaps noted above are open content questions for Phase 1
  (`DCFC-101`/`DCFC-D102`), not blockers to freezing the current visual
  state.
- Exact next step: `DCFC-101` (field-level content and asset inventory) is
  now eligible — both DCFC-003's prerequisites are satisfied. `DCFC-102`
  (reusable platform gap analysis) may also begin read-only in parallel per
  the epic's dependency notes.
- Hosted mutations: none. The only mutation was one local git commit with no
  configured remote; no Supabase, Storage, Vercel, Stripe, DNS, email, or
  production resource was touched.

### 2026-07-31 — DCFC-003 addendum: dedicated Date card — Claude Code (Sonnet 5)

- Package: DCFC-003
- Status: complete
- Completed: after the initial DCFC-003 evidence pass documented the absence
  of a dedicated "Dates" field as a gap, Christian asked for it to be added
  rather than left as a prose-only mention. Added a Date detail card (`TBA`)
  to `/tryouts` alongside Location and Cost — honest placeholder, no real
  date invented. With Christian's explicit approval, created a second local
  commit in the snapshot repository,
  `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`, on top of the DCFC-003
  commit; no remote is configured, so nothing was or could be pushed.
  Updated `VISUAL-ACCEPTANCE.md`'s approved-commit section and closed out
  the "Dates" gap note accordingly.
- Files changed: `app/(public)/tryouts/page.tsx` (one local commit in the
  snapshot repo), `docs/phase-11/diverse-city/VISUAL-ACCEPTANCE.md`.
- Verification: `npm run typecheck` passed; a clean `npm run build` (after
  clearing `.next`) passed with the same warnings as before; desktop
  (1440x900) and mobile (375x812) browser checks confirmed the three-card
  Date/Location/Cost row renders correctly with no horizontal overflow on
  either breakpoint. (One raw-pixel `resize_window` call mid-session
  produced a `devicePixelRatio: 2` screenshot capture artifact that made the
  page appear squeezed into half the frame; `window.innerWidth` and
  `scrollWidth` confirmed the actual layout was always correct at 1440, and
  switching to the Browser pane's `desktop`/`mobile` presets produced a
  clean capture — a tooling quirk, not an application defect.)
- Blockers or decisions needed: none. This closes the only remaining
  documented gap against the Tryouts required-checks list besides FAQ
  (still none supplied, so still none invented).
- Exact next step: unchanged from the prior DCFC-003 record — `DCFC-101`
  (field-level content and asset inventory) is eligible.
- Hosted mutations: none.

### 2026-07-31 — DCFC-003 addendum: FAQ scoping decision — Claude Code (Sonnet 5)

- Package: DCFC-003
- Status: complete (documentation-only addendum, no code change)
- Completed: Christian confirmed the Tryouts page will not have an FAQ
  section — tryout logistics (eligibility, what to bring, cost, scheduling,
  next steps) are intentionally left to the club's external registration
  partner rather than duplicated on Onzio's page. Updated
  `VISUAL-ACCEPTANCE.md` and `CONTENT-MATRIX.md` to record this as a
  deliberate scoping decision rather than an open content gap, and updated
  `DECISIONS.md`'s `DCFC-D102` row accordingly.
- Files changed: `docs/phase-11/diverse-city/VISUAL-ACCEPTANCE.md`,
  `docs/phase-11/diverse-city/CONTENT-MATRIX.md`,
  `docs/phase-11/diverse-city/DECISIONS.md`. No application code changed; no
  new verification needed.
- Blockers or decisions needed: none. This closes the last open item against
  the Tryouts required-checks list.
- Exact next step: unchanged — `DCFC-101` (field-level content and asset
  inventory) is eligible.
- Hosted mutations: none.

### 2026-07-31 — DCFC-101 — Claude Code (Sonnet 5)

- Package: DCFC-101
- Status: complete
- Completed: expanded `CONTENT-MATRIX.md` to field-level coverage for every
  route in the pinned snapshot commit `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`
  (`/`, `/club/about`, `/roster`, `/schedule`, `/programs` + 4 detail routes,
  `/shop`, `/sponsors`, `/contact`, `/tryouts`, plus cross-cutting site
  chrome). Read the full source of every route and its backing data files.
  Computed real `sha256` checksums (via `shasum -a 256`, not fabricated)
  against every referenced media asset in `public/`. Identified and
  documented Rose-City-inherited legacy files/components that are present in
  the repository but not wired to any current Diverse City route (e.g.
  `about-content.ts`, `homepage-content.ts`, `standings-content.ts`,
  `social-links.ts`, the multi-kit `Shop*` components, an orphaned
  `PhotoSequence` component), so future agents don't mistake them for the
  live content source. Flagged two findings that are neither invented nor
  altered by this pass but have no documented provenance: (1) a hardcoded
  10-row league-standings table with specific win/loss/points records for
  real-named opponent clubs, and (2) a "conference championships and
  national-stage appearances" claim repeated verbatim across the About page
  and the Men's Teams program page. Both need Christian's explicit
  confirmation before Phase 2 treats them as verified fact rather than
  placeholder.
- Files changed: `docs/phase-11/diverse-city/CONTENT-MATRIX.md` only.
  Read-only across the entire snapshot repository; no application code
  changed.
- Verification: this is a documentation/inventory package with no code to
  typecheck or build; verification consisted of reading every route's actual
  rendered source (not assumptions) and computing real checksums for every
  referenced asset rather than leaving them as placeholders.
- Blockers or decisions needed: the two provenance flags above need
  Christian's confirmation. Neither blocks DCFC-101 itself (the acceptance
  criteria required every gap to be made explicit, which is satisfied), but
  both should be resolved before `DCFC-103` locks the content/presentation
  architecture, since that package requires `DCFC-D101`–`DCFC-D105`
  accepted or explicitly deferred with no impact on Phase 2.
- Exact next step: `DCFC-102` (reusable platform gap analysis) is eligible
  and may run in parallel with resolving the two flags. Christian should
  confirm or correct the standings-table and championships-claim provenance
  before `DCFC-103`.
- Hosted mutations: none.

### 2026-07-31 — DCFC-102 — Claude Code (Sonnet 5)

- Package: DCFC-102
- Status: complete
- Completed: compared the approved Diverse City specification against the
  **actual current state** of `onzio-platform` — read
  `packages/presentation/index.ts`'s registries, every `supabase/migrations/`
  file's `create table` statements, `app/admin/` route list,
  `lib/admin-data-contract.ts`'s mutation validator, `components/Nav.tsx`,
  and the existing `roster`/`schedule` dynamic-detail-page pattern — rather
  than relying on the architecture plan's prose alone. Wrote up the full
  comparison in a new file, `PLATFORM-GAP-ANALYSIS.md`. Key findings:
  - **Fully reusable, no new work**: standings (`league_standings` +
    `league_standings_settings` + `admin/standings` already exist — directly
    matches Christian's confirmation that standings will be admin-editable),
    homepage hero/slideshow, About, Shop, Sponsors, Roster/staff/seasons/
    stats, Branding — all have existing tables and admin editors already.
  - **Fully reusable capability, not previously obvious**: dropdown
    navigation already exists generically in the real `Nav.tsx`; external
    URL/href/link protocol validation is already generic and automatic in
    `lib/admin-data-contract.ts` for any correctly-named column, on any
    table, with zero new validation code required.
  - **Partial reuse**: `tryouts` already has a registered
    `routeRegistry`/`moduleRegistry` entry with Pro entitlement — but no
    schema table, section type, or admin editor exist. Confirmed via
    repository-wide grep that "tryout" appears in exactly two files (the
    registry and its contract test fixture).
  - **True gaps**: Programs (nothing exists at all) and Contact (nothing
    exists at all) both need full schema/registry/admin work from scratch.
  - **Genuinely unresolved, not silently assumed**: video capability. The
    existing `behind_the_rose_section`/`normalizeYouTubeEmbedUrl()` pattern
    only covers YouTube-embedded video; Diverse City's approved homepage uses
    two self-hosted MP4 files, a different delivery mechanism the existing
    capability does not cover. Documented both directions (adopt
    YouTube-embed vs. add real self-hosted video to the media pipeline)
    without picking one — that's `DCFC-D105`'s decision.
  - Explicitly distinguished acceptable content-driven branching (Diverse
    City's one shared `[programId]` route rendering different registered
    sections per program) from the prohibited pattern (branching on tenant
    identity) per this package's acceptance criteria.
- Files changed:
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md` (new). Read-only
  across `onzio-platform`; no application code changed.
- Verification: documentation-only package; verification consisted of
  reading the actual current schema/registry/admin state directly rather
  than assuming it from the architecture plan.
- Blockers or decisions needed: `DCFC-103` needs Christian's input on
  `DCFC-D104` (does the approved visual map to `cinematic@1`, or does it need
  a new/neutral template?) and `DCFC-D105` (video capability direction, per
  the two options above).
- Exact next step: `DCFC-103` (lock content and presentation architecture)
  is eligible now that all three of its dependencies are complete, but needs
  Christian's input on the two decisions above before it can close.
- Hosted mutations: none.

### 2026-07-31 — DCFC-D104 resolved: new `academy@1` template — Claude Code (Sonnet 5)

- Package: DCFC-103 (pre-work — decision only, not a full DCFC-103 pass)
- Status: complete (documentation-only, no code change)
- Completed: discussed template mapping with Christian. `PLATFORM-GAP-ANALYSIS.md`
  found `cinematic@1` registers only `cinematic.hero`/`cinematic.gallery`
  (plus shared `shared.next-match`/`shared.history`) — missing shop-feature,
  sponsor-carousel, standings, and programs-pathway sections Diverse City
  needs regardless of template choice — and no existing font pack matches
  Diverse City's Montserrat/Inter/DM Sans stack. Programs' two layout
  variants are also a genuinely new section-composition shape. Christian
  agreed reusing `cinematic@1` would mostly mean bolting Diverse-City-only
  sections onto Rose City's template, and approved a new template instead,
  following the same extraction precedent as `clubhouse@1` (Lions). Named it
  `academy@1` after discussing several options (`pathway`, `academy`,
  `horizon`, `crossroads`, `collective`) — `academy` ties to the founder's
  MLS academy background and the youth-development-to-pro pipeline.
  `DCFC-D104` moved to Accepted in `DECISIONS.md`.
- Files changed: `docs/phase-11/diverse-city/DECISIONS.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No application code changed —
  `academy@1` is not yet registered in `packages/presentation/index.ts`;
  that registration is `DCFC-103`/`DCFC-203` implementation work, not this
  decision record.
- Blockers or decisions needed: `DCFC-D105` (video capability direction)
  still needs Christian's input before `DCFC-103` can close.
- Exact next step: resolve `DCFC-D105`, then assign `DCFC-103` to formally
  lock the architecture (including registering `academy@1` with its
  sections/fonts) and update affected work packages.
- Hosted mutations: none.

### 2026-07-31 — DCFC-D105 resolved: video via Bunny.net Stream — Claude Code (Sonnet 5)

- Package: DCFC-103 (pre-work — decision only, not a full DCFC-103 pass)
- Status: complete (documentation-only, no code change)
- Completed: discussed the video-capability decision with Christian. Confirmed
  from `PLATFORM-GAP-ANALYSIS.md` that Rose City's only existing video is a
  hardcoded, non-reusable `club.slug === "rose-city"` legacy branch in
  `components/Hero.tsx` — not a real capability to build from. Compared
  in-house transcoding (rejected: Vercel serverless functions are a poor fit
  for video encoding, and both Supabase Storage egress and Vercel Blob
  transfer cost more per GB than a video CDN) against three third-party
  video CDNs (Cloudflare Stream, Mux, Bunny.net Stream), researched via live
  web search rather than memorized pricing, modeled at 6/10/20/50/100-club
  scale. Bunny.net Stream was cheapest at every modeled scale (~$1.25/mo at
  10 clubs to ~$12.50/mo at 100 clubs, free standard H.264 encoding, $1/mo
  minimum). Reviewed Bunny's known tradeoffs (less infrastructure control
  and analytics than Mux, smaller network than Cloudflare) and judged them
  acceptable for simple looping background/story videos with admin
  swap-in-out. Christian approved Bunny.net Stream and separately signed up
  for an account with $20 starting credit. `DCFC-D105` moved to Accepted in
  `DECISIONS.md`; format/duration/dimension/size/poster/processing rules are
  intentionally left as `DCFC-201`/`DCFC-202` implementation detail, not
  decided here.
- Files changed: `docs/phase-11/diverse-city/DECISIONS.md`,
  `docs/phase-11/diverse-city/STATUS.md`,
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md`. No application code
  changed — Bunny.net integration is `DCFC-201`–`DCFC-204` implementation
  work, not this decision record. No Bunny.net, Vercel, or Supabase account
  action was taken by the agent; Christian's account signup was his own
  action outside this session.
- Blockers or decisions needed: `DCFC-D103` (single vs. multiple tryout
  events) is now the only remaining open decision blocking `DCFC-103`.
- Exact next step: resolve `DCFC-D103`, then assign `DCFC-103` to formally
  lock the architecture (registering `academy@1` and the Bunny.net-backed
  video capability) and update affected work packages.
- Hosted mutations: none.

### 2026-07-31 — DCFC-D103 resolved: structured Tryouts event rows — Claude Code (Sonnet 5)

- Package: DCFC-103 (pre-work — decision only, not a full DCFC-103 pass)
- Status: complete (documentation-only, no code change)
- Completed: explained the singleton-vs-structured-rows tradeoff to
  Christian in concrete terms tied to Diverse City's actual four programs
  (Youth Academy, Special Kickers, Special Olympics, UPSL Men's Teams).
  Christian confirmed running simultaneous tryout opportunities across
  programs is a real, near-term scenario, not hypothetical, and chose
  structured event rows over the singleton model DCFC-002's snapshot UI
  currently ships. `DCFC-D103` moved to Accepted in `DECISIONS.md`. Updated
  `CONTENT-MATRIX.md`'s Tryouts Content Contract Draft and
  `PLATFORM-GAP-ANALYSIS.md`'s Tryouts gap section to describe a
  `matches`/`players`-shaped table (one row per opportunity, admin
  list/create/edit/reorder) instead of a `homepage_hero_content`-shaped
  singleton, including an optional per-row program association left as
  `DCFC-202` schema detail.
- Files changed: `docs/phase-11/diverse-city/DECISIONS.md`,
  `docs/phase-11/diverse-city/CONTENT-MATRIX.md`,
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No application code changed — the
  approved snapshot's single-opportunity Tryouts UI is unchanged; migrating
  it to a list/grid of event cards is `DCFC-201`–`DCFC-204` implementation
  work, not this decision record.
- Blockers or decisions needed: none remaining from the `DCFC-D101`–
  `DCFC-D105` set that gates `DCFC-103`. `DCFC-D102`'s core Tryouts facts
  (age groups, eligibility, dates, locations, cost) remain open but are
  explicitly deferred with no impact on Phase 2 schema work, per that
  package's acceptance criteria.
- Exact next step: `DCFC-103` (lock content and presentation architecture)
  can now be assigned and closed out — its full acceptance also requires
  approving the normalized table/domain design (building on
  `CONTENT-MATRIX.md`'s drafts) and confirming whether introducing Bunny.net
  Stream as a new third-party vendor needs a `docs/onzio-platform-plan.md`
  amendment (unlike the `academy@1` template, this is a genuinely new
  external-service dependency, not reuse of an existing extensible
  mechanism, so it likely does need one).
- Hosted mutations: none.

### 2026-07-31 — DCFC-103 — Claude Code (Sonnet 5)

- Package: DCFC-103
- Status: in_review
- Completed: with all five gating decisions (`DCFC-D101`–`DCFC-D105`)
  resolved, drafted the two remaining `DCFC-103` acceptance items:
  - **Normalized table/domain design**: new
    `docs/phase-11/diverse-city/DOMAIN-DESIGN.md` proposes concrete
    `onzio.programs`, `onzio.contact_profile`, `onzio.contact_page_content`,
    and `onzio.tryouts` table shapes, following the exact conventions read
    directly from existing migrations (composite `(club_id, id)` uniqueness
    and tenant-safe composite FKs for multi-row tables, `club_id primary
    key` for singletons, `can_read_feature`/`can_mutate_feature` RLS,
    audit/updated-at triggers) rather than inventing new patterns. Encodes
    the field inventory's "two program layout variants" finding as a
    content-driven `layout_variant` enum instead of per-program code
    branches. Encodes `DCFC-D103`'s structured-rows decision and DCFC-002's
    already-verified missing-URL fail-closed behavior. Explicitly scopes out
    what it does not decide (Special Olympics' carousel-section
    generalization, exact video upload limits, real content values).
  - **Canonical platform plan amendment**: added a new "Video Pipeline"
    section to `docs/onzio-platform-plan.md` (after "Secure Media
    Pipeline") plus a "Video" line in "Locked Decisions", documenting the
    `DCFC-D105` decision (Bunny.net Stream, not in-house transcoding, not a
    replacement for the existing YouTube-embed pattern), the high-level
    upload/delivery flow, and what's explicitly deferred to `DCFC-201`/
    `DCFC-202` (exact format/size/duration/poster rules). Confirmed and
    documented that Rose City's existing hero video is a non-reusable
    `club.slug` legacy special case, and that this amendment does not
    authorize migrating Rose City onto the new capability. Did not add an
    entry for the `academy@1` template, consistent with the precedent that
    `clubhouse@1` was added without a plan-doc edit (using the existing
    extensible template mechanism is not a new architecture pattern the way
    a new third-party vendor is).
- Files changed: `docs/phase-11/diverse-city/DOMAIN-DESIGN.md` (new),
  `docs/onzio-platform-plan.md` (Video Pipeline section + Locked Decisions
  line), `docs/phase-11/diverse-city/STATUS.md`. No migration was written or
  applied — `DOMAIN-DESIGN.md` is a proposal, not SQL; no
  `supabase/migrations/` file was added.
- Verification: documentation-only; verification consisted of reading three
  real existing migrations directly to confirm the proposed schema matches
  established convention rather than inventing a new one.
- Blockers or decisions needed: this package is `in_review`, not `complete`
  — `DCFC-103`'s acceptance criteria requires the domain design to be
  *approved*, not just drafted. Awaiting Christian's review of
  `DOMAIN-DESIGN.md` and the `onzio-platform-plan.md` amendment.
- Exact next step: Christian reviews and approves (or requests changes to)
  both documents; on approval, move DCFC-103 to `complete` and `DCFC-201`
  (red contracts) becomes eligible.
- Hosted mutations: none.

### 2026-07-31 — DCFC-103 re-review corrections — Claude Code (Opus 5)

- Package: DCFC-103
- Status: in_review (unchanged — corrections applied to the draft under
  review, not a new package)
- Completed: re-reviewed the `DOMAIN-DESIGN.md` draft and the DCFC-102 gap
  analysis against the real schema instead of trusting the first pass. Found
  and fixed three substantive errors and two omissions:
  - **`contact_profile` duplicated an existing table.** The draft proposed
    `instagram_href`/`facebook_href`/`x_href` columns, but
    `onzio.site_social_links` already exists, is already registered in
    `ADMIN_TABLE_FEATURES` under `branding`, and already has an admin
    editor. DCFC-102 mis-filed social links as part of the Contact gap.
    Corrected in both documents; social links moved to "Reusable As-Is" and
    the columns removed from the design. Separately verified by grep that
    email/phone columns genuinely do not exist anywhere, so the rest of
    `contact_profile` is a real gap.
  - **Feature-name tier gating was unexamined and is a live public-facing
    risk.** `onzio_private.club_has_feature` hardcodes the Starter allowlist
    `('branding', 'roster', 'schedule', 'homepage', 'about')`; any other
    feature string is Pro-only, and `can_read_feature` gates *anonymous
    public reads*, not just admin writes. So naming a new `'contact'`
    feature would silently make Starter clubs' contact page render empty in
    public. Added an explicit feature-name section to `DOMAIN-DESIGN.md`
    with a per-table recommendation: `tryouts` → new `tryouts` feature
    (Pro-only, correctly matching the existing `moduleRegistry` entry);
    `programs` → Pro-only is defensible but is a pricing decision Christian
    must make; `contact` → probably should either reuse the Starter-allowed
    `about` feature or add `'contact'` to the allowlist, because Pro-only is
    likely unintended.
  - **`ADMIN_TABLE_FEATURES` registration was omitted.** Every new table must
    be added to that map in `lib/admin-data-contract.ts` or the generic
    admin mutation boundary will reject it regardless of RLS. Added to the
    conventions list.
  - Fixed `jsonb` default to use the explicit `::jsonb` cast, matching all
    six existing usages.
  - Confirmed and documented that `media_assets.surface` is free-form text
    (`^[a-z][a-z0-9-]{0,63}$`), not an enum, so new media surfaces need no
    migration — a small piece of good news the first pass missed.
- Files changed: `docs/phase-11/diverse-city/DOMAIN-DESIGN.md`,
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md`,
  `docs/phase-11/diverse-city/STATUS.md`. Still no migration written or
  applied.
- Verification: read `club_has_feature`/`can_read_feature`/
  `can_mutate_feature` definitions, `ADMIN_TABLE_FEATURES`, the `clubs`,
  `site_branding`, `site_social_links`, `about_page_content`, and
  `media_assets` table definitions directly from migration source.
- Blockers or decisions needed: the feature-name/tier question above is now
  an explicit open decision Christian must resolve before `DCFC-202` writes
  the migration — particularly whether Contact should be Starter-accessible
  (recommended) and whether Programs is Pro-only.
- Exact next step: Christian reviews the corrected `DOMAIN-DESIGN.md`
  (especially the feature-name/tier table) and the `onzio-platform-plan.md`
  video amendment; on approval plus a tier decision, DCFC-103 closes and
  `DCFC-201` becomes eligible.
- Hosted mutations: none.

### 2026-07-31 — DCFC-D108 resolved: tier gating for the three new domains — Claude Code (Opus 5)

- Package: DCFC-103
- Status: in_review (blocker resolved; design still needs final approval)
- Completed: Christian resolved the tier question raised by the re-review —
  **Contact is Starter-accessible, Programs is Pro-only, Tryouts is
  Pro-only.** Recorded as new accepted decision `DCFC-D108` in
  `DECISIONS.md` and resolved the feature-name section of
  `DOMAIN-DESIGN.md`. Chose adding `'contact'` to the
  `onzio_private.club_has_feature` Starter allowlist over the alternative of
  reusing the existing Starter-allowed `about` feature: reusing `about`
  carries no security downside (features are tier gates, not permission
  scopes — `can_mutate_feature` is `can_mutate_content AND
  club_has_feature`) but would leave `ADMIN_TABLE_FEATURES` mapping contact
  tables to `"about"`, which misleads future readers for no lasting
  benefit. `programs` and `tryouts` need no allowlist change — a new feature
  string is Pro-only by default, which already matches the registered
  `moduleRegistry.tryouts` → `entitlement: "pro"`.
- Also propagated two Phase 2 obligations this surfaces into
  `PLATFORM-GAP-ANALYSIS.md`'s ownership section: `DCFC-202` must additively
  extend `club_has_feature` while preserving `security definer`,
  `set search_path = ''`, `stable`, and fully-qualified relations; and
  `DCFC-201` must add explicit tier coverage proving a Starter club can read
  `contact_*` but still cannot read `programs`/`tryouts`, since this
  modifies a shared security function governing every existing table.
- Files changed: `docs/phase-11/diverse-city/DECISIONS.md`,
  `docs/phase-11/diverse-city/DOMAIN-DESIGN.md`,
  `docs/phase-11/diverse-city/PLATFORM-GAP-ANALYSIS.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No migration written or applied;
  no application code changed.
- Blockers or decisions needed: none outstanding. `DCFC-103`'s remaining
  requirement is Christian's explicit approval of `DOMAIN-DESIGN.md` and the
  `onzio-platform-plan.md` video amendment as a whole — the package's
  acceptance criteria requires the design to be *approved*, not merely
  drafted and unblocked.
- Exact next step: Christian approves both documents; on approval move
  DCFC-103 to `complete` and `DCFC-201` (red contracts) becomes eligible.
- Hosted mutations: none.

### 2026-07-31 — Platform findings register opened — Claude Code (Opus 5)

- Package: DCFC-103 (side output — platform-wide findings, not epic scope)
- Status: complete
- Completed: reviewed `docs/onzio-platform-plan.md` at Christian's request
  before approving the `DCFC-103` deliverables, and opened
  `docs/platform-findings.md` as a durable register for verified-but-unfixed
  platform issues, so findings surfaced during scoped epic work survive the
  epic closing. Four findings recorded with file/line evidence, honest
  severity, and explicit trigger conditions:
  - **PF-001**: Phase 9's gate asserts Rose City renders without
    tenant-specific presentation special cases; six `club.slug ===
    "rose-city"` branches actually remain (`Hero.tsx:15`, `Nav.tsx:255`,
    `PhotoSlideshow.tsx:24`, `NationalityFlag.tsx:20`,
    `shop/page.tsx:34`, `page.tsx:26`). Matters because `EPIC.md`'s
    prohibition on Diverse City slug branches rests on this being settled
    practice.
  - **PF-002**: three parallel entitlement sources of truth with confirmed
    `shop` and `seasons` contradictions. Characterized honestly as latent —
    it needs a Starter-tier club that is also active/live, which no seeded
    club is, which is precisely why existing tests miss it.
  - **PF-003**: the entitlement mechanism is undocumented in the platform
    plan, which is the root cause of PF-002-class bugs recurring.
  - **PF-004**: self-flagged — the Bunny.net video reference this session
    added deviates from the plan's "content records reference media assets"
    principle. Recorded as an acknowledged tradeoff rather than hidden.
- Also added an "Open Platform Findings" section to the top of `HANDOFF.md`
  pointing at the register, and spawned a background task for PF-002 (the
  one concrete, independently fixable bug).
- Files changed: `docs/platform-findings.md` (new), `HANDOFF.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No fix was applied to any finding
  — the register explicitly states that tracking is not authorization to
  fix, and PF-001/PF-002 concern already-shipped phases that need their own
  scoped approval.
- Verification: every finding cites verified evidence — allowlist and
  registry contents read from source, slug branches enumerated by grep,
  trigger condition confirmed against `supabase/seed.sql` (Bravo is Starter
  but `onboarding`/`preview`).
- Blockers or decisions needed: none for this register. PF-001 in particular
  needs a Christian decision eventually — either extract Rose City's
  remaining branches, or amend the Phase 9 gate to state its true achieved
  scope. Deliberately not reworded unilaterally.
- Exact next step: unchanged — Christian approves `DOMAIN-DESIGN.md` and the
  `onzio-platform-plan.md` video amendment to close `DCFC-103`.
- Hosted mutations: none.

### 2026-07-31 — DCFC-103 approved and closed — Claude Code (Opus 5)

- Package: DCFC-103
- Status: complete — **Phase 1 gate closed**
- Completed: verified the two deliverables against real source before asking
  for approval, rather than relying on the drafts' own assertions. Confirmed
  from migration source: the `club_has_feature` Starter allowlist is exactly
  as quoted (`phase2_foundation.sql:301`), so the `DCFC-D108` reasoning
  holds; `onzio.site_social_links` genuinely pre-exists, so the re-review's
  de-duplication was correct; `media_assets.surface` is regex-constrained
  free-form (`^[a-z][a-z0-9-]{0,63}$`), not an enum; no `email`/`phone`
  column exists anywhere, so `contact_profile`'s fields are a real gap; and
  the `homepage_hero_content` singleton shape (`club_id` PK, `updated_at`,
  no `created_at`) matches what the design proposes for the contact
  singletons. Confirmed the Video Pipeline section exists at
  `docs/onzio-platform-plan.md:557` with its Locked Decisions line at :45.
  Christian approved both deliverables, plus two requested fixes:
  - **Stale pinned commit corrected.** `EPIC.md` still listed
    `08f7b53c…` as the pinned snapshot commit; `DCFC-003` superseded that
    with `5bbdfa33…`. Every other document was already correct. Updated with
    an explicit note recording the supersession rather than a silent swap.
  - **Column-constraint policy added to `DOMAIN-DESIGN.md`.** The design
    specified no text-length or URL-shape constraints, which would have left
    `DCFC-202` deciding them ad-hoc mid-migration. Added a policy section
    plus concrete `check` clauses on all four tables. Two findings came out
    of writing it:
    - The `between 1 and N` vs `<= N` distinction is load-bearing, not
      stylistic: nearly every column here is `not null default ''`, and the
      `between 1 and N` form would make the default itself violate the
      constraint. Only `programs.slug` and `programs.display_title` are
      genuinely required-and-non-empty.
    - **Copying the existing href regex would have been a real bug.**
      `homepage_hero_content` constrains CTA hrefs to
      `^/[-A-Za-z0-9_/?#=&%.]*$` — internal paths only. Applied to
      `programs.external_cta_href` or `tryouts.registration_href` it would
      reject every external registration URL those columns exist to hold,
      failing only when a club first saved a real partner link. External
      href columns instead mirror the `''`/local-path/`http:`/`https:`/
      `mailto:` allowlist already enforced at
      `lib/admin-data-contract.ts:56-68`. `registration_href` also
      deliberately permits `''`, since empty is the documented TBA state
      that fails closed to the `mailto:` fallback.
- Files changed: `docs/phase-11/diverse-city/DOMAIN-DESIGN.md` (status →
  `approved`, constraint policy, per-table checks, approval block),
  `docs/phase-11/diverse-city/EPIC.md` (pinned commit),
  `docs/phase-11/diverse-city/DECISIONS.md` (`DCFC-D109`),
  `docs/phase-11/diverse-city/STATUS.md`, `HANDOFF.md`. No migration written
  or applied; no application code, test, or `supabase/migrations/` file
  touched. The isolated snapshot repository was read but not modified — it
  remains clean at `5bbdfa3`.
- Verification: documentation-only package, so verification was source
  confirmation rather than test execution — each claim above was checked
  against the actual migration, contract, or plan file cited, not inferred.
  No test suite was run because no code changed; running one would not have
  evidenced anything about this package.
- Blockers or decisions needed: none for this package. Two carried forward,
  neither blocking: `DCFC-D102` (real Tryouts facts — age groups,
  eligibility, dates, location, cost) and `DCFC-D106` (which placeholder
  areas get official content) remain open and will block Phase 3 content
  population, not Phase 2. `PF-001` in `docs/platform-findings.md` still
  needs Christian's decision — extract Rose City's six remaining `club.slug`
  branches, or amend the Phase 9 gate to state its true achieved scope.
- Exact next step: `DCFC-201` (red contracts) is `ready` and unassigned.
  It must add focused failing contracts for the approved Programs, Contact,
  and Tryouts domains, and per `DCFC-D108` must include explicit tier
  coverage proving a Starter club can read `contact_*` but still cannot read
  `programs`/`tryouts`. It is deliberately **not** started here — a package
  becoming eligible is not authorization to begin it, and this session's
  approval covered `DCFC-103` only.
- Hosted mutations: none. No Supabase, Storage, Vercel, Stripe, DNS, email,
  or auth resource was contacted or changed.

### 2026-07-31 — PF-001 investigation (platform, not epic scope) — Claude Code (Opus 5)

- Package: none. Platform-wide finding work at Christian's direction; no
  DCFC package was advanced, started, or changed by this turn.
- Status: investigation complete; the PF-001 resolution decision is still
  open and belongs to Christian.
- Completed: read all seven `club.slug === "rose-city"` branches directly
  instead of relying on PF-001's grep-derived summary, and recorded a
  per-branch extractability assessment in `docs/platform-findings.md`. Two
  corrections to PF-001: the count is seven, not six (it missed
  `lib/flags.ts:51`, the implementation behind `NationalityFlag.tsx:20`),
  and its claim that the branches "work" is false for the Hero branch.
  Opened `PF-005`: `components/Hero.tsx:254` hardcodes a hero video URL on
  the legacy Supabase project `nsgtkwqkbyxkiwrhzsje`, permanently deleted
  during the Phase 8 closeout (`HANDOFF.md:968`); DNS returns `NXDOMAIN`,
  so Rose City's live homepage hero has no video and silently shows its
  static poster instead. Also established that
  `app/(public)/shop/page.tsx:34` is dead code — `SHOW_SHOP_HERO` is the
  constant `false`, so it renders for no club — and that `Nav.tsx:255`'s
  affiliation marks are a capability the Diverse City epic needs anyway.
- Files changed: `docs/platform-findings.md`, `HANDOFF.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No source file, test, or
  migration was modified; nothing was fixed, since the register is a record
  and not authorization to fix.
- Verification: each branch read at its cited line; `SHOW_SHOP_HERO`'s value
  read from `lib/site-flags.ts:3`; both Supabase hostnames resolved via DNS
  lookup (`NXDOMAIN` for the deleted legacy ref, normal resolution for the
  current production ref `ioalthwsdrlzrubomrow`). DNS lookups are read-only
  and mutate nothing.
- Blockers or decisions needed: PF-001's resolution (extract per-branch vs.
  amend the Phase 9 gate) and PF-005's intent decision (drop the dead video,
  re-host it, or fold it into the future Bunny.net capability) both need
  Christian.
- Exact next step: Christian chooses the PF-001 resolution. `DCFC-201`
  remains `ready`, unassigned, and unstarted — this turn did not touch it.
- Hosted mutations: none.

### 2026-08-01 — PF-001 resolved (platform, not epic scope) — Claude Code (Opus 5)

- Package: none. Platform work at Christian's direction; no DCFC package was
  advanced or started.
- Status: PF-001 complete and moved to the register's `Resolved` section.
  PF-005 remains open by Christian's explicit choice to track rather than
  fix.
- Completed: Christian chose "amend the gate + delete the dead code" over
  extraction. Amended `docs/onzio-platform-plan.md`'s Phase 9 gate to state
  its true achieved scope — new tenants resolve entirely through published
  presentation templates (`clubhouse@1` as the worked precedent), while Rose
  City retains six documented legacy `club.slug` branches pending
  extraction. The amended gate also states explicitly that it does not
  license new slug branches, which is what `EPIC.md`'s prohibition on
  `club.slug === "diverse-city"` depends on. Deleted the dead branch in
  `app/(public)/shop/page.tsx`: `SHOW_SHOP_HERO` is the constant `false`, so
  `{SHOW_SHOP_HERO && club.slug === "rose-city" && <ShopHero />}` rendered
  for no club at all. Removed it along with the now-unused `ShopHero`
  dynamic import and the `nextDynamic`/`SHOW_SHOP_HERO` imports, and
  collapsed the `SHOW_SHOP_HERO ? … : …` padding ternary to the
  `"pt-24 sm:pt-28"` value it already evaluated to — so rendered output is
  unchanged. Deliberately left `SHOW_SHOP_HERO` itself, its remaining use in
  `Nav.tsx:138`, and the now-unreferenced `ShopHero.tsx`/`ShopHeroMobile.tsx`
  in place: the flag is an intentional toggle and deleting the components
  would make re-enabling it impossible, which is wider than this change's
  scope. Confirmed six slug occurrences remain, exactly matching the amended
  gate's wording.
- Files changed: `docs/onzio-platform-plan.md`, `app/(public)/shop/page.tsx`,
  `docs/platform-findings.md`, `HANDOFF.md`,
  `docs/phase-11/diverse-city/STATUS.md`. Also added an `onzio-platform`
  entry to `/Users/christianalcala/.claude/launch.json` (outside the
  repository) so the dev server could be driven for browser verification;
  the two pre-existing entries were preserved.
- Verification: `npx tsc --noEmit` clean; `npm run test:contracts` 223/223;
  `npm run test:architecture` 18/18; `npm run test:db` 53/53; `npm test`
  548/548 — all matching the documented baselines exactly; `npm run lint`
  with only the three pre-existing analytics `react-hooks/exhaustive-deps`
  warnings; production build with loopback Supabase env passed. Browser
  check of `/shop` against the local `alpha` tenant — which takes the same
  non-`clubhouse@1` code path Rose City does — confirmed the page renders,
  the wrapper class is exactly `pt-24 sm:pt-28` as before the change, no
  `ShopHero` is present, no broken images, and no console errors. No test
  was skipped, weakened, or modified; no test referenced `ShopHero` or
  `SHOW_SHOP_HERO` at all, verified by grep before editing.
- Blockers or decisions needed: PF-005's intent decision remains open by
  Christian's choice. Rose City's live homepage hero currently shows a
  static poster where a video was intended.
- Exact next step: `DCFC-201` (red contracts) remains `ready`, unassigned,
  and unstarted, awaiting Christian's go-ahead. Nothing in this turn touched
  the epic.
- Hosted mutations: none. The only external network access was read-only DNS
  resolution of two Supabase hostnames, which mutates nothing.

### 2026-08-01 — PF-005 scoping (platform, not epic scope) — Claude Code (Opus 5)

- Package: none. Investigation at Christian's request; nothing was fixed.
- Status: PF-005 still open and unfixed by design. Two durable facts added
  to the register, and a new finding opened.
- Completed: established that the lost hero video **is recoverable**. It
  survives in the immutable Phase 8 frozen export as
  `…/storage/objects/videos/4f/4f8059d2…-Pan_Bench_Land_ready.mp4`,
  verified intact at 31,080,971 bytes, `ISO Media, MP4 Base Media v1`, with
  its actual `sha256` matching the checksum embedded in its own filename.
  No PF-005 option is foreclosed by asset loss. Also noted that its ~29.6 MB
  size is itself an argument for the `DCFC-D105` CDN decision rather than
  re-hosting on Supabase Storage. Opened `PF-006`: no contract, architecture
  test, or lint rule anywhere asserts that source stops referencing a
  decommissioned Supabase host — which is why PF-005 shipped silently and
  why it could recur. Phase 8 verified the deletion from the outside (does
  the host still resolve) but never from the inside (does anything still ask
  for it). Also recorded that the same dead host appears ~30 more times in
  `db/migrations/*.sql`, which are legacy seed files wired to no script —
  dead artifacts, not a live defect, but noisy enough to camouflage a real
  hit like `Hero.tsx:254`.
- Files changed: `docs/platform-findings.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No source file, test, or migration
  was modified.
- Verification: freeze-export file checksummed with `shasum -a 256` and
  type-checked with `file`; absence of any guarding contract confirmed by
  grep across `tests/`; `db/migrations` confirmed unreferenced by
  `package.json` and `vercel.json`.
- Blockers or decisions needed: PF-005's intent decision (drop the dead
  video, re-host it, or wait for the Bunny.net capability) and whether to
  add the PF-006 regression contract. Note the PF-006 contract would fail on
  `Hero.tsx:254` today, so it wants to land with or after a PF-005 fix.
- Exact next step: Christian decides PF-005's intent. `DCFC-201` remains
  `ready`, unassigned, and unstarted.
- Hosted mutations: none. No network access of any kind this turn.

### 2026-08-01 — PF-005 + PF-006 resolved (platform, not epic scope) — Claude Code (Opus 5)

- Package: none. Platform work at Christian's direction; no DCFC package was
  advanced or started.
- Status: both complete and moved to the register's `Resolved` section. All
  remaining open findings (PF-002, PF-003, PF-004) are latent or
  documentary and scheduled into `DCFC-201`/`DCFC-202`.
- Completed: removed the dead hero video from `components/Hero.tsx` — the
  `<video>` element carrying the deleted-project URL, the 43-line iOS Safari
  autoplay effect, `videoRef`, and the `videoMounted` state and effect, 89
  lines net. Added the PF-006 guard as a new architecture contract,
  `references no permanently deleted Supabase project`, mirroring the
  existing forbidden-string pattern in the same file and driven by a
  `DECOMMISSIONED_SUPABASE_HOSTS` list so future decommissions get an entry.
  `lib/migration/rose-city-plan.ts` is explicitly allowlisted as historical
  provenance rather than a runtime fetch.
- Two things worth flagging:
  - **The new contract paid for itself on its first run**, catching eleven
    `remotePatterns` entries in `next.config.mjs` still allowlisting the
    deleted project's buckets. Inert (the optimizer is bypassed and the host
    is `NXDOMAIN`) but exactly the class of reference the contract exists to
    find. Removed; the live project is supplied dynamically from
    `NEXT_PUBLIC_SUPABASE_URL`.
  - **A behavior bug was caught in my own change before verification.** The
    original markup was `{!videoMounted && <poster/>}` — the poster showed
    only until mount. Making it unconditional, the obvious simplification,
    would have given every non-`clubhouse@1` tenant Rose City's stadium
    photograph as its hero background. The poster is now scoped to
    `usesLegacyRoseCityHero`, preserving both paths exactly.
  - `usesLegacyRoseCityHero` deliberately remains — it still gates the
    overlay colour and the club-name `<h1>` — so PF-001's branch count stays
    at six, matching the amended Phase 9 gate.
- Files changed: `components/Hero.tsx`, `next.config.mjs`,
  `tests/architecture/platform-architecture.test.ts`,
  `docs/platform-findings.md`, `HANDOFF.md`,
  `docs/phase-11/diverse-city/STATUS.md`. No migration; no epic file.
- Verification: `npx tsc --noEmit` clean; 223/223 contracts; 19/19
  architecture, up from 18; 53/53 database; 549/549 complete suite, up from
  548; lint with only the three pre-existing analytics warnings; production
  build passed with 25 pages; `git diff --check` clean. The guard was proved
  capable of failing — a temporary probe file containing the dead host made
  it fail and name the file, then was removed. Browser verification against
  a temporary local `rose-city` tenant confirmed zero `<video>` elements, no
  `nsgtkwqkbyxkiwrhzsje` anywhere in the DOM, `hero-poster.jpg` loading at
  its true 1920x1080, no club-name `<h1>`, and no console errors; the
  non-Rose-City path was then re-checked to confirm the poster does not
  leak. The temporary club rename and its `rose-city.localhost` domain row
  were both reverted — the local database is back to `alpha`/`bravo`/`lions`.
  No test was skipped, weakened, or deleted; the suite grew by one.
- Blockers or decisions needed: none. Two follow-ups recorded but not acted
  on: roughly thirty dead-host references remain in `db/migrations/*.sql`
  (legacy seed files wired to no script; the contract does not scan `db/`),
  and Rose City's hero is now deliberately a still image — restoring video
  later means the Bunny.net capability, with the source file still
  recoverable from the frozen export.
- Exact next step: `DCFC-201` (red contracts) — `ready`, unassigned, and now
  the agreed next package. Per the parked-work plan it should also absorb
  the Starter + active + live seed fixture and PF-002's three-way
  entitlement agreement test, while PF-002's underlying `shop`/`seasons`
  fix stays out of scope.
- Hosted mutations: none. All database changes were against the loopback
  local instance and were reverted.

### 2026-08-01 — DCFC-201 — Claude Code (Opus 5)

- Package: DCFC-201 (red contracts)
- Status: complete
- Completed: added 32 focused contracts across two new files describing the
  Programs, Contact, and Tryouts behavior approved in `DOMAIN-DESIGN.md`
  (`DCFC-D109`) and the tier gating from `DCFC-D108`. 27 are intentionally
  red; 5 pass because they lock existing correct behavior.
  - `tests/contracts/diverse-city-domains.test.ts` (15 tests) — admin
    registration in `ADMIN_TABLE_FEATURES` and the request schema, singleton
    vs multi-row classification, the `'contact'` Starter-allowlist addition,
    `programs`/`tryouts` staying Pro-only, preservation of
    `club_has_feature`'s `security definer` / `set search_path = ''` /
    `stable` properties, `academy@1` template registration, `programs` and
    `contact` route/module registration at the approved entitlements, the
    PF-002 entitlement-agreement contract, and a lock on `EPIC.md`'s
    prohibition of `club.slug === "diverse-city"` branches.
  - `tests/database/diverse-city-domains.test.ts` (17 tests) — table
    existence, composite `(club_id, program_id)` cross-tenant rejection,
    href protocol check constraints, empty `registration_href` permitted as
    the honest TBA state, anonymous Starter reads of `contact_*` allowed,
    anonymous Starter reads of `programs`/`tryouts` returning nothing,
    anonymous Pro reads succeeding, anonymous writes denied, and preview-club
    invisibility.
  - **Seed fixture**: added club `charlie` (`33333333-…`, Starter, active,
    live) to `supabase/seed.sql` and `tests/fixtures/entities.ts`. This
    combination did not exist — Alpha and Lions are Pro, Bravo is Starter but
    onboarding/preview, so `can_read_club` rejects it before tier is
    consulted. Without Charlie the `DCFC-D108` tier coverage could not be
    written at all, and it is the same blind spot that hid PF-002.
- Two things worth flagging:
  - **Eight of the database contracts were initially false greens.** They
    asserted only that an operation was rejected — and a missing table is
    also a rejection, so they passed today for entirely the wrong reason and
    would have kept passing even if `DCFC-202` shipped the tables with no RLS
    at all. Verified against PostgREST directly that a missing table returns
    `PGRST205` while a real denial returns `42501` and a check violation
    `23514`, then rewrote every negative assertion to name the specific code
    it expects. All 17 now fail for the intended reason.
  - **The PF-002 agreement contract is scoped, not silently widened.** It
    locks `moduleRegistry` against the `club_has_feature` allowlist for every
    feature except `store` and `seasons`, the two contradictions already
    recorded in `docs/platform-findings.md`, which are named in an explicit
    exclusion set with a pointer to the finding. New drift cannot be
    introduced while PF-002 stays open; fixing the two existing
    contradictions remains out of this package's scope per the register, and
    resolving PF-002 means deleting the exclusion set.
- Files changed: `tests/contracts/diverse-city-domains.test.ts` (new),
  `tests/database/diverse-city-domains.test.ts` (new), `supabase/seed.sql`,
  `tests/fixtures/entities.ts`,
  `docs/phase-11/diverse-city/STATUS.md`, `HANDOFF.md`. No migration was
  written, no application code changed, and no placeholder implementation was
  created to turn any contract green.
- Verification: `npx tsc --noEmit` clean. `npm run db:reset` applied the new
  seed; confirmed `charlie` is `starter`/`active`/`live`. Full `npm test`
  reports **27 failed / 554 passed (581 total)** across **2 failed / 55
  passed** files — the two failing files are the two added here, and the 554
  passing includes all 549 that passed before, so no pre-existing contract
  regressed. `npm run test:architecture` 19/19. `npm run lint` with only the
  three pre-existing analytics warnings. `npm run db:types:check` reports
  generated types still match the local schema (expected — no migration).
  Production build passed with 25 pages. `git diff --check` clean.
- Blockers or decisions needed: none.
- Exact next step: `DCFC-202` (schema, RLS, types, audit) — write the
  migration creating `onzio.programs`, `onzio.contact_profile`,
  `onzio.contact_page_content`, and `onzio.tryouts` exactly as
  `DOMAIN-DESIGN.md` specifies, additively extend the `club_has_feature`
  Starter allowlist with `'contact'` while preserving its security
  properties, register the four tables in `ADMIN_TABLE_FEATURES`, and
  regenerate database types. That closes the 17 database contracts and most
  of the 10 TypeScript ones; `academy@1` and the route/module registrations
  belong to `DCFC-203`.
- Hosted mutations: none. All database work was against the loopback local
  instance.

### 2026-08-01 — DCFC-202 — Claude Code (Opus 5)

- Package: DCFC-202 (schema, RLS, types, audit)
- Status: complete
- Completed: added
  `supabase/migrations/20260801120000_phase11_diverse_city_domains.sql`,
  implementing `DOMAIN-DESIGN.md` exactly as approved in `DCFC-D109`:
  - `onzio.programs` and `onzio.tryouts` as multi-row tables with
    `unique (club_id, id)`, and `onzio.contact_profile` /
    `onzio.contact_page_content` as `club_id`-primary-key singletons.
  - Composite tenant-safe foreign keys throughout — media references via
    `(club_id, *_media_asset_id)` to `media_assets`, and
    `tryouts (club_id, program_id)` to `programs(club_id, id)` so a tryout
    cannot reference another club's program.
  - The full column-constraint policy added during the `DCFC-103` review:
    `between 1 and N` for the two genuinely required columns
    (`programs.slug`, `programs.display_title`), `<= N` everywhere else
    because those columns are `not null default ''`, and href checks that
    mirror the application allowlist (`''`, local path, `http`, `https`,
    `mailto`) rather than `homepage_hero_content`'s internal-path-only
    pattern, which would have rejected every external registration URL.
  - RLS enabled with four policies per table, `anon, authenticated` select
    grants, `authenticated` mutation grants, `service_role` all, plus
    `audit_content_mutation()` and `set_updated_at()` triggers, and
    `(club_id, sort_order, …)` indexes on the two multi-row tables.
  - `club_has_feature` additively extended with `'contact'` per `DCFC-D108`,
    reproducing every security attribute of the original definition.
  - Registered all four tables in `ADMIN_TABLE_FEATURES` and both contact
    tables in `SINGLETON_TABLES`; regenerated `lib/database.generated.ts`.
- Also resolved **PF-003**: documented the tier-entitlement mechanism in
  `docs/onzio-platform-plan.md` under Row-Level Security — the hardcoded
  Starter allowlist, Pro-by-default for unlisted names, the fact that
  `can_read_feature` gates anonymous public reads so the failure mode is a
  blank page, the `ADMIN_TABLE_FEATURES` requirement, and the attributes any
  edit must preserve. Done here because this package was already modifying
  that function.
- One regression caught and fixed: the migration's own explanatory comment
  contained the literal phrase used by the `hardens every security-definer
  function` architecture contract, which counts raw occurrences across all
  migration SQL and requires a matching empty-search-path for each. The
  comment was reworded rather than the security contract loosened.
- **PF-004 was not actionable here** and remains open. It concerns the
  Bunny.net video reference column, which this migration does not add — no
  video capability was in `DOMAIN-DESIGN.md`'s scope. It should be revisited
  when that column is actually designed.
- Files changed:
  `supabase/migrations/20260801120000_phase11_diverse_city_domains.sql`
  (new), `lib/admin-data-contract.ts`, `lib/database.generated.ts`,
  `docs/onzio-platform-plan.md`, `docs/platform-findings.md`,
  `docs/phase-11/diverse-city/STATUS.md`, `HANDOFF.md`, and a corrected
  helper in `tests/contracts/diverse-city-domains.test.ts` (see below). No
  test was skipped, weakened, or deleted.
- One test correction, which strengthened rather than weakened a contract:
  the allowlist assertions read only the original foundation migration, so
  once `club_has_feature` was replaced in a later migration they were
  checking a stale definition. They now resolve the effective definition —
  the last migration in filename order that declares the function — so the
  security-attribute assertion actually covers the live version. Without
  this, a future migration could drop `security definer` and the contract
  would still pass.
- Verification: `npx tsc --noEmit` clean. `npm run db:reset` applied the
  migration from scratch. `npm run db:types` regenerated types and
  `npm run db:types:check` confirms they match the local schema.
  `npx supabase db lint --local` reports no schema errors across `onzio`,
  `onzio_private`, and `public`. Full `npm test` reports **3 failed / 578
  passed (581)** across 1 failed / 56 passed files — down from 27 failures,
  and the 3 remaining are the `DCFC-203` presentation contracts. All 17
  database contracts pass, including anonymous Starter reads of `contact_*`
  succeeding while `programs`/`tryouts` return nothing for the same club,
  and the composite cross-tenant rejection. `npm run test:architecture`
  19/19. `npm run lint` with only the three pre-existing analytics warnings.
  Production build passed with 25 pages. `git diff --check` clean.
- Blockers or decisions needed: none.
- Exact next step: `DCFC-203` (presentation routes, modules, sections) —
  register the `academy@1` template per `DCFC-D104`, add `programs` and
  `contact` to `routeRegistry`, and add module entitlements
  (`programs: pro`, `contact: starter`, `tryouts` already `pro`). That closes
  the last 3 red contracts. `DCFC-204` then wires queries and admin
  mutations.
- Hosted mutations: none. All database work was against the loopback local
  instance.

### 2026-08-01 — DCFC-203 audit (no implementation performed) — Claude Code (Opus 5)

- Package: DCFC-203
- Status: in_progress — **audit only. This session wrote no code and changed
  no application file.** Only this file was updated.
- Why this record exists: a session picked up the epic expecting `DCFC-103` to
  need approval (it did not — `DCFC-D109` closed it 2026-07-31) and found
  `DCFC-203` implementation already present in the working tree with **no
  completion record**, while this file still said "ready / not started / 3
  contracts red." Christian was unsure whether `DCFC-203` had been completed,
  so an audit was run rather than assuming either way.

**Verified current state (all re-run 2026-08-01, not inherited claims):**

| Check | Result |
| --- | --- |
| `npm test` | 581/581 passed, 57 files |
| `npm run test:contracts` | 238/238 |
| `npm run test:architecture` | 19/19 |
| `npm run test:db` | 70/70 |
| `npx tsc --noEmit` | clean |

`test:db` requires the loopback env mapped, otherwise all 70 fail with a
misleading "[RED CONTRACT] Local Supabase is unavailable":
`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`
from `npx supabase status -o env`.

**What the unrecorded work correctly did** (`packages/presentation/index.ts`):

- Registered `academy@1` with a complete entry — `originNote` cites the
  approved pinned snapshot `5bbdfa3`; `defaultFontPack` is the new
  `montserrat-inter-dmsans` pack; `defaultSections`/`supportedSections` list
  five `academy.*` sections plus `shared.next-match` and `shared.history`,
  which maps 1:1 onto the seven homepage sections inventoried in
  `CONTENT-MATRIX.md`.
- Registered the `montserrat-inter-dmsans` font pack, matching Diverse City's
  approved Montserrat / Inter / DM Sans stack per `DCFC-D104`.
- Added `programs` (`/programs`) and `contact` (`/contact`) to
  `routeRegistry`, and `programs: pro` / `contact: starter` to
  `moduleRegistry`, matching `DCFC-D108` exactly.

**Gap 1 — no pinned `academy@1` document contract.**
`tests/contracts/presentation-system.test.ts` pins a validating document for
`cinematic@1` (line 229) and `clubhouse@1` (line 242). There is no
`academy@1` equivalent, so nothing proves an `academy@1` document survives
`parsePresentationDocument(..., { surface: "production" })` — schema,
provenance, and production-surface rules included. This is the established
precedent: the pinned `clubhouse@1` document was added specifically so that
template "cannot regress into an unregistered tenant branch." The registry
entry currently exists but is never exercised.

**Gap 2 — reachable `academy@1` / `bebas-inter` compatibility bug.**
Font-pack compatibility is stored in two independent lists that disagree for
`academy@1` only:

- `academy@1.compatibleFontPacks` includes `bebas-inter`
- `fontPacks["bebas-inter"].compatibleTemplates` is
  `["cinematic@1", "heritage@1", "clubhouse@1"]` — omits `academy@1`

All four templates were checked; every pre-existing one is bidirectionally
consistent, so this was introduced with `academy@1`. It is reachable, not
theoretical: switching a `clubhouse@1` or `heritage@1` club (both on
`bebas-inter`) to `academy@1` hits `packages/presentation/index.ts:839`,
which tests the **template's** list and therefore keeps `bebas-inter`; the
resulting document then fails validation at
`packages/presentation/index.ts:701`, which tests the **font pack's** list.
`switchTemplate` emits a document that fails its own validation. No test
catches it because nothing asserts the two lists agree — structurally the
same two-sources-of-truth problem as `PF-002`.

- Files changed: `docs/phase-11/diverse-city/STATUS.md` only.
- Blockers or decisions needed: none. The Gap 2 fix direction was confirmed by
  Christian on 2026-08-01 and recorded as **`DCFC-D110`**: add `"academy@1"` to
  `fontPacks["bebas-inter"].compatibleTemplates`, treating `bebas-inter` as the
  universal fallback pack. The rejected alternative (removing `bebas-inter`
  from `academy@1.compatibleFontPacks`) would have left `academy@1` as the only
  template without a fallback pack.
- Exact next step: assign `DCFC-203`, close both gaps, add a contract
  asserting bidirectional font-pack agreement so this class of drift cannot
  recur, re-run the full suite, and write the `DCFC-203` completion record
  that is still missing.
- Hosted mutations: none. This session ran only local reads and local tests.

### 2026-08-01 — DCFC-203 — Codex

- Package: DCFC-203 (presentation routes, modules, and sections)
- Status: complete
- Completed: preserved the previously audited `academy@1`, Academy section,
  route, and module registrations; added a pinned `academy@1` document that
  survives `parsePresentationDocument(..., { surface: "production" })` with
  the approved `montserrat-inter-dmsans` font pack, all five `academy.*`
  homepage sections, both shared homepage sections, and the default Academy
  route inventory. Added a generic contract that proves compatibility agrees
  in both directions for every template/font-pack pair. Applied the approved
  `DCFC-D110` fix by adding `academy@1` to
  `fontPacks["bebas-inter"].compatibleTemplates`, preserving `bebas-inter` as
  the universal fallback pack rather than removing it from Academy.
- Files changed: `packages/presentation/index.ts`,
  `tests/contracts/presentation-system.test.ts`,
  `docs/phase-11/diverse-city/STATUS.md`, `HANDOFF.md`.
- Verification: before the implementation fix, the new focused contract
  failed on the exact audited mismatch (`academy@1` accepted `bebas-inter`
  while the pack rejected `academy@1`); after the fix, the focused
  presentation suite passed 9/9. `npx tsc --noEmit` passed;
  `npm run test:contracts` passed 240/240; `npm run test:architecture` passed
  19/19; the loopback-mapped `npm run test:db` passed 70/70; and the
  loopback-mapped full `npm test` passed 583/583 across 57 files. `npm run
  lint` passed with only the three pre-existing analytics hook warnings, and
  `git diff --check` passed. No test was skipped, weakened, deleted, or mocked.
- Blockers or decisions needed: none for `DCFC-203`.
- Exact next step: assign `DCFC-204` separately to implement typed domain
  queries and protected server mutations. Do not infer that work as started
  from this completion record.
- Hosted mutations: none. Supabase verification used only the local loopback
  development instance; no hosted Supabase, Storage, Vercel, Stripe, DNS,
  email, Auth, registration, payment, waiver, or participant-data system was
  contacted or changed.

### 2026-08-01 — PF-007 security-test hardening — Codex

- Package: `PF-007` platform finding; scoped security-test hardening outside
  the numbered Diverse City work packages. `DCFC-204` was not started.
- Status: complete
- Completed: audited the entire database suite rather than relying on the
  register's approximate count. Hardened 19 denial scenarios that previously
  accepted any non-null error, one private-ledger read that swallowed query
  errors as an empty result, and one rejected write whose own result was
  ignored. Added shared exact-signature assertions for Postgres/PostgREST and
  Storage, including explicit test-authoring failures for `PGRST204` and
  `PGRST205`; added focused helper contracts and an architecture guard that
  scans all database tests for the weak patterns. No production schema,
  policy, Storage configuration, or application behavior changed.
- Files changed for `PF-007`: `tests/helpers/database-security.ts`,
  `tests/contracts/database-security-assertions.test.ts`,
  `tests/architecture/database-security-tests.test.ts`,
  `tests/database/schema-rls.test.ts`,
  `tests/database/authenticated-rls.test.ts`,
  `tests/database/storage-audit.test.ts`,
  `tests/database/stripe-billing.test.ts`,
  `tests/database/operator-workflows.test.ts`,
  `tests/database/diverse-city-domains.test.ts`, `docs/platform-findings.md`,
  `docs/phase-11/diverse-city/STATUS.md`, and `HANDOFF.md`.
- Verification: local probes captured the expected codes before assertions
  were written. Focused affected database tests passed 64/64. A temporary
  `club_logo_path_typo` mutation in a real anonymous denial test failed with
  `[TEST AUTHORING ERROR] ... PGRST204`, proving the original false-green path
  is closed; the valid column was then restored. `npx tsc --noEmit` passed;
  `npm run test:contracts` passed 244/244; `npm run test:architecture` passed
  20/20; loopback-mapped `npm run test:db` passed 70/70; full loopback-mapped
  `npm test` passed 588/588 across 59 files. `npm run lint` passed with only
  the three pre-existing analytics hook warnings; `git diff --check` passed.
- Blockers or decisions needed: none for `PF-007`.
- Exact next step: assign `DCFC-204` separately if desired. It remains `ready`
  and unstarted; do not infer that its typed queries or protected mutations
  were begun by this hardening package.
- Hosted mutations: none. All Supabase and Storage calls targeted only the
  loopback local development stack; no hosted Supabase, Storage, Vercel,
  Stripe, DNS, email, Auth, registration, payment, waiver, or participant-data
  system was contacted or changed.

### 2026-08-01 — DCFC-204 — Codex

- Package: DCFC-204 (typed domain queries and protected mutations)
- Status: complete
- Completed: added generated-row-backed Programs, Contact, and Tryouts public
  domain mappings with explicit verified tenant UUID filters, active/visible
  row handling, media resolution, and fail-closed error behavior. Added one
  shared public-link normalizer so local paths, HTTP(S), and mail links are
  accepted only when structurally valid; unsafe or ambiguous external actions
  are removed, and closed/unsafe Tryouts registration falls back to the
  tenant's validated public email when available. Added strict table-specific
  mutation schemas for all four Phase 2 tables and pinned the existing admin
  route's user, MFA, tenant, membership, lifecycle, entitlement, payload, and
  server-side `club_id` boundaries. No Phase 3 UI was started.
- False-green findings closed: the intentionally red contract run failed 12
  of 18 tests and exposed that Starter Contact writes were denied by a fourth
  entitlement source, `STARTER_FEATURES`, even though database and
  presentation contracts allowed them; `contact` is now aligned there and
  PF-002 records all four sources. A pre-existing Starter Contact database
  test also passed on an empty result because seeded Charlie had no active
  subscription and the test never inserted a readable row. The test now
  inserts and requires exact tenant rows, and the local seed supplies Charlie
  with the active Starter subscription required by the platform's real public
  access contract.
- Files changed for `DCFC-204`: `lib/public-link.ts`, `lib/db-types.ts`,
  `lib/club-features.ts`, `lib/queries.ts`, `lib/admin-data-contract.ts`,
  `tests/contracts/diverse-city-query-mutations.test.ts`,
  `tests/database/diverse-city-query-boundaries.test.ts`,
  `tests/database/diverse-city-domains.test.ts`, `supabase/seed.sql`,
  `docs/platform-findings.md`, `docs/phase-11/diverse-city/STATUS.md`, and
  `HANDOFF.md`.
- Verification: the focused contract was intentionally red before production
  behavior existed (12 failed, 6 passed), then passed after implementation.
  Focused query/mutation and existing unit coverage passed 81/81; focused
  Diverse City database coverage passed 20/20. `npm run db:reset` rebuilt the
  local stack from migrations and seed; `npm run db:types:check` passed;
  `supabase db lint --local --schema onzio,onzio_private` found no errors;
  `npx tsc --noEmit` passed; `npm run test:contracts` passed 267/267;
  `npm run test:architecture` passed 20/20; loopback-mapped `npm run test:db`
  passed 73/73; and the loopback-mapped full `npm test` passed 614/614 across
  61 files. `npm run build` passed, lint passed with only the three
  pre-existing analytics hook warnings, and `git diff --check` passed. No test
  was skipped, weakened, deleted, or mocked.
- Blockers or decisions needed: none for `DCFC-204`. The Phase 2 gate is
  closed. PF-002 remains open only for its previously documented Shop and
  Seasons contradictions; they were not folded into this package.
- Exact next step: assign exactly one eligible Phase 3 package (`DCFC-301`,
  `DCFC-302`, or `DCFC-303`) and keep the others unstarted. `DCFC-301`
  (Programs admin workflow) is the natural first vertical slice; this record
  does not start it.
- Hosted mutations: none. Supabase verification used only the loopback local
  development stack. No hosted Supabase, Storage, Vercel, Stripe, DNS, email,
  Auth, registration, payment, waiver, or participant-data system was
  contacted or changed.

### 2026-08-01 — DCFC-301 — Codex

- Package: DCFC-301 (Programs admin)
- Status: complete
- Completed: added a responsive protected `/admin/programs` workflow with a
  Pro-only navigation and page gate; ordered list selection/reordering;
  create/edit forms for slug, navigation label, title, kicker, summary, body,
  highlights, layout variant, visibility, both approved media roles, and CTA;
  strict client validation aligned with the server schema; unsaved-change,
  loading, empty, upload, success, and error states; and secure media upload
  through the existing authorize/stage/finalize pipeline. The page sends no
  tenant identity and persists only through `/api/admin/data`, which continues
  to derive `club_id` from the verified host/session boundary.
- Security finding closed inside the package: making `programs` a valid media
  surface exposed that direct `storage.objects` staging writes treated unknown
  surfaces as Starter-accessible `branding`. The application route denied a
  Starter Programs upload, but the real direct Storage contract initially
  succeeded. Migration
  `20260802013518_dcfc_301_programs_media_entitlement.sql` now maps the
  `programs` path segment to the Pro-only `programs` feature for staging
  insert/select/delete policies. PF-002 now records Storage policy mapping as
  the fifth entitlement source of truth.
- Files changed for `DCFC-301`: `app/admin/(protected)/programs/page.tsx`,
  `components/AdminShell.tsx`, `lib/program-admin.ts`, `lib/admin-client.ts`,
  `lib/storage-path.ts`,
  `supabase/migrations/20260802013518_dcfc_301_programs_media_entitlement.sql`,
  `tests/contracts/diverse-city-programs-admin.test.ts`,
  `tests/database/authenticated-rls.test.ts`, `docs/platform-findings.md`,
  `docs/phase-11/diverse-city/STATUS.md`, and `HANDOFF.md`.
- Verification: the initial focused contract was intentionally red because
  `lib/program-admin.ts` did not exist. After implementation, the focused
  Programs/query/media/admin slice passed 78/78. The direct Storage test then
  failed because the Starter upload succeeded; after the RLS migration, the
  consolidated authenticated suite passed 6/6 with exact Pro success and
  Starter 42501/403 denial. `npm run db:reset` applied every migration and the
  synthetic seed from scratch; `npm run db:types:check` passed; local schema
  lint found no errors; `npx tsc --noEmit` passed; contracts passed 276/276;
  architecture passed 20/20; loopback database tests passed 74/74; and the
  full loopback suite passed 624/624 across 62 files. `npm run build` includes
  `/admin/programs`; lint passed with only the three pre-existing analytics
  hook warnings; and `git diff --check` passed. No test was skipped, weakened,
  deleted, or mocked.
- Blockers or decisions needed: none for `DCFC-301`. Existing attached media
  is represented honestly as attached when no preview URL is present; new
  uploads preview immediately. No unapproved content facts were introduced.
- Exact next step: assign exactly one remaining Phase 3 editor package.
  `DCFC-302` (Contact admin) is the natural next vertical slice; `DCFC-303`
  must remain unstarted if 302 is assigned. `DCFC-304` remains blocked on both.
- Hosted mutations: none. Migration, Auth, database, and Storage verification
  targeted only the local loopback Supabase stack with synthetic fixtures. No
  hosted Supabase, Storage, Vercel, Stripe, DNS, email, Auth, registration,
  payment, waiver, or participant-data system was contacted or changed.

### 2026-08-01 — DCFC-302 — Codex

- Package: DCFC-302 (Contact admin)
- Status: complete
- Completed: added the responsive protected `/admin/contact` editor and
  Starter-accessible navigation. The editor separates canonical shared club
  destinations (`public_email`, `public_phone`, `service_area`, `hours`) from
  Contact-page-only copy and hero media at both state and mutation boundaries.
  It directs social-link changes to the existing Branding editor instead of
  duplicating ownership, supports honest empty/attached/new-media states, and
  includes loading, retry, validation, upload, success, and error feedback.
  Public email and international telephone formats are validated in shared
  helpers and again by the protected server mutation schema. No public contact
  form, message table, submission route, or participant-data collection was
  introduced.
- Security work completed inside the package: registered `contact` as a secure
  photo surface and added migration
  `20260802020000_dcfc_302_contact_media_entitlement.sql`, which explicitly
  maps Contact staging paths to the Starter-accessible `contact` feature for
  Storage insert/select/delete instead of relying on the legacy Branding
  fallback. PF-002 now records this explicit fifth-source mapping.
- Files changed for `DCFC-302`: `app/admin/(protected)/contact/page.tsx`,
  `components/AdminShell.tsx`, `lib/contact-admin.ts`, `lib/admin-client.ts`,
  `lib/admin-data-contract.ts`, `lib/storage-path.ts`,
  `supabase/migrations/20260802020000_dcfc_302_contact_media_entitlement.sql`,
  `tests/contracts/diverse-city-contact-admin.test.ts`,
  `tests/contracts/diverse-city-query-mutations.test.ts`,
  `tests/database/authenticated-rls.test.ts`, `docs/platform-findings.md`,
  `docs/phase-11/diverse-city/STATUS.md`, and `HANDOFF.md`.
- Verification: the focused Contact contract was intentionally red before the
  helper and route existed, then the Contact/query contract slice passed
  32/32. `npm run db:reset` applied every migration and seed locally. Direct
  local database coverage proved an AAL2 Starter admin can upsert and update
  both singleton tables and upload Contact staging media; database tests passed
  75/75. `npx tsc --noEmit` passed; contracts passed 286/286; architecture
  passed 20/20; the full loopback-mapped suite passed 635/635 across 63 files;
  generated database types match; local schema lint found no errors; the
  production build includes `/admin/contact`; lint passed with only the three
  pre-existing analytics hook warnings; and `git diff --check` passed. No test
  was skipped, weakened, deleted, or mocked.
- Blockers or decisions needed: none for `DCFC-302`. Existing attached hero
  media is represented honestly as attached when an admin preview URL is not
  available; new uploads preview immediately. Social URLs remain canonically
  owned by Branding as approved.
- Exact next step: assign `DCFC-303` (Tryouts admin) as the sole remaining
  Phase 3 editor package. Do not start `DCFC-304` until DCFC-303 completes.
- Hosted mutations: none. Migration, Auth, database, and Storage verification
  targeted only the local loopback Supabase stack with synthetic fixtures. No
  hosted Supabase, Storage, Vercel, Stripe, DNS, email, Auth, registration,
  payment, waiver, participant-data, or message-submission system was contacted
  or changed.

### 2026-08-01 — DCFC-303 — Codex

- Package: DCFC-303 (Tryouts admin)
- Status: complete
- Completed: added the responsive protected `/admin/tryouts` multi-event
  editor with list/create/edit/reorder workflows, optional reusable Program
  association, `upcoming`/`open`/`closed` status control, all approved hero and
  logistics copy, nullable Date/TBA behavior, hero media, closed-state copy,
  and external registration CTA content. The page includes unsaved-change
  protection and complete loading, empty, validation, upload, success, error,
  retry/reload, attached-media, and Pro-entitlement states. Browser mutations
  use only the server-mediated admin client and never send authoritative
  `club_id`. Missing registration destinations remain valid honest content and
  fail closed in the existing public query mapping; unsafe destinations and
  malformed dates fail validation. Per approved `DCFC-D102`, no FAQ field was
  introduced—the external registration partner owns those logistics.
- Security and data-boundary work: registered `tryouts` as a secure photo
  surface and added migration
  `20260802021531_dcfc_303_tryouts_media_entitlement.sql`, which explicitly
  maps Tryouts staging paths to the Pro-only `tryouts` feature for Storage
  insert/select/delete instead of inheriting the Starter-accessible Branding
  fallback. Strict existing server schemas plus new focused contracts reject
  participant, payment, waiver, medical, registration-record, and FAQ fields.
  Real local tests prove Pro AAL2 create/edit/reorder success, Starter content
  denial, cross-tenant denial, exact unsafe-URL check violation, Pro Tryouts
  upload success, and exact Starter Storage 403 denial.
- Files changed for `DCFC-303`: `app/admin/(protected)/tryouts/page.tsx`,
  `components/AdminShell.tsx`, `lib/tryout-admin.ts`, `lib/admin-client.ts`,
  `lib/storage-path.ts`,
  `supabase/migrations/20260802021531_dcfc_303_tryouts_media_entitlement.sql`,
  `tests/contracts/diverse-city-tryouts-admin.test.ts`,
  `tests/database/authenticated-rls.test.ts`,
  `docs/phase-11/diverse-city/STATUS.md`, and `HANDOFF.md`.
- Verification: the red-first focused contract run failed on the intentionally
  absent `lib/tryout-admin` boundary while the existing query/mutation suite
  stayed green. After implementation, focused contract coverage passed 35/35.
  A from-scratch `npm run db:reset` applied all migrations and the seed on the
  local `staging` branch; focused real database coverage passed 29/29 after an
  explicit empty/TBA bulk-insert fixture correction; `npx tsc --noEmit`
  passed; contracts passed 297/297; architecture passed 20/20; local database
  tests passed 77/77; the complete loopback-mapped suite passed 648/648 across
  64 files; generated database types match; local `onzio`/`onzio_private`
  schema lint found no errors; local migration history contains the DCFC-303
  migration; the production build includes `/admin/tryouts`; lint passed with
  only the three pre-existing Analytics hook warnings; and `git diff --check`
  passed. No test was skipped, weakened, deleted, or mocked.
- Blockers or decisions needed: none for `DCFC-303`. Real Diverse City dates,
  locations, costs, and eligibility facts remain honest TBA/empty content until
  the club supplies them; the editor does not invent those facts.
- Exact next step: stop here. `DCFC-304` is now eligible for a separately
  assigned local admin-to-public acceptance pass, but it was not started in
  this package.
- Hosted mutations: none. Database, Auth, and Storage verification targeted
  only the local loopback Supabase stack with synthetic fixtures. No hosted
  Supabase, Storage, Vercel, Stripe, DNS, email, Auth, registration, payment,
  waiver, participant-data, medical-data, or publication system was contacted
  or changed.

### 2026-08-01 — DCFC-304 — Codex

- Package: DCFC-304 (local admin-to-public acceptance)
- Status: complete
- Completed: added the reusable Academy public surface for Programs overview,
  tenant-scoped Program detail, Contact, and structured Tryouts, including
  honest empty/TBA states, safe external destinations, third-party
  registration disclosure, no form/data-collection path, dynamic editable
  Program navigation, and the approved Academy footer routes. Middleware now
  rewrites those exact paths plus validated Program slugs through verified
  tenant resolution. All runtime pages resolve the club server-side, require
  `academy@1`, pass only the resolved `club.id` into existing public queries,
  and fail closed for missing/hidden content or the wrong template—there are no
  Diverse City or Alpha slug branches.
- Persistence and acceptance work: migration
  `20260802023000_dcfc_304_academy_presentation_template.sql` closes the
  database constraint gap that prevented the already-registered `academy@1`
  template from being stored. The local seed now publishes a valid Academy
  document and conspicuously synthetic, distinct Alpha/Bravo Programs,
  Contact, and Tryouts rows. A real local database test creates an AAL2 Alpha
  admin session, edits all three domains, reads the changes back through the
  anonymous public query layer, proves Bravo content still exists, and proves
  it cannot leak through Alpha or Bravo's non-public lifecycle. Presentation
  persistence tests now restore the seed's published pointer after mutating it,
  preventing order-dependent local acceptance failures.
- Browser and chrome work: repeatable Playwright coverage checks all four
  public paths at 1440×900 and 390×844, verifies Alpha content/no Bravo bleed,
  TBA rendering, secure external-link attributes, no runtime image transforms,
  no broken images, no framework overlay, and no horizontal overflow. A local
  password-plus-TOTP flow reaches AAL2 and verifies `/admin/programs`,
  `/admin/contact`, and `/admin/tryouts` at both sizes. That pass exposed and
  fixed the shared admin shell's hardcoded “Rose City” label and empty initial
  image source; it now renders the resolved tenant name with a safe initials
  fallback.
- Files changed for `DCFC-304`: canonical and tenant-runtime route files under
  `app/(public)/{programs,contact,tryouts}` and
  `app/%5Fclubs/[slug]/{programs,contact,tryouts}`;
  `components/AcademyProgramsPage.tsx`,
  `components/AcademyProgramDetailPage.tsx`,
  `components/AcademyContactPage.tsx`, `components/AcademyTryoutsPage.tsx`,
  `components/Nav.tsx`, `components/Footer.tsx`, `components/AdminShell.tsx`,
  `middleware.ts`, `supabase/seed.sql`, the DCFC-304 migration,
  `tests/contracts/diverse-city-admin-public-acceptance.test.ts`,
  `tests/database/diverse-city-admin-public-acceptance.test.ts`,
  `tests/database/presentation-system.test.ts`,
  `tests/browser/diverse-city-admin-public.spec.ts`,
  `playwright.dcfc-304.config.ts`, `package.json`, this status ledger, and
  `HANDOFF.md`.
- Verification: the initial DCFC-304 contract run was intentionally red at
  6/6 failures before routes, components, middleware, navigation, presentation
  persistence, and fixtures existed. The completed focused contracts passed
  31/31 with the existing query boundary; focused real database acceptance
  passed 1/1. A from-scratch `npm run db:reset` applied every checked-in
  migration and the synthetic seed locally. `npx tsc --noEmit` passed;
  contracts passed 304/304; architecture passed 20/20; local database tests
  passed 78/78; the complete loopback-mapped suite passed 656/656 across 66
  files; generated database types match; local `onzio`/`onzio_private` schema
  lint found no errors; the production build includes every
  canonical and tenant-runtime route; lint passed with only the three
  pre-existing Analytics hook warnings; the final desktop/mobile browser suite
  passed 2/2 after the complete suite; and `git diff --check` passed. No test
  was skipped, weakened, deleted, or mocked.
- Blockers or decisions needed: none for DCFC-304. Real Diverse City content,
  media, and unresolved tryout facts are still publication blockers and were
  not invented or imported. This package proves reusable local capability; it
  does not provision or publish Diverse City.
- Exact next step: Christian reviews this local Phase 3 evidence and decides
  whether to authorize a separately scoped staging-readiness package. Do not
  begin staging, provisioning, import, publication, or any hosted mutation
  without that explicit approval.
- Hosted mutations: zero. All Supabase Database/Auth/Storage behavior used only
  loopback local containers and synthetic fixtures. No hosted Supabase,
  Storage, Vercel, Stripe, DNS, email, Auth, registration, payment, waiver,
  participant-data, media-publication, or production resource was contacted or
  changed.

### 2026-08-01 — DCFC-EPIC-002 rollout planning packet — Codex

- Package: planning/governance work after `DCFC-304`; no rollout implementation
  package was assigned or started.
- Status: complete; proposed epic is `planning_complete_awaiting_review`.
- Completed: created the agent-neutral staging-to-production packet for
  proposed `DCFC-EPIC-002`. It defines seven phases (`4`–`10`), 23
  dependency-scoped packages, and three action classes; separates every hosted
  mutation behind fresh package-specific approval; and covers production
  content/provenance and hide decisions, secure media planning and checksum
  reconciliation, unfinished Bunny.net readiness, protected staging, owner/
  admin invitation and mandatory MFA, Alpha/Bravo/Diverse City isolation,
  Stripe test and live owner-Checkout sequencing, production private preview,
  domain/DNS/callback attachment, public launch with indexing retained off,
  observation, rollback, and separately approved indexing. Corrected the
  original proposed sequence after verifying `provisionClub` creates new clubs
  as Starter: Stripe canonical projection now precedes full Pro editor
  acceptance rather than manually assigning Pro before billing.
- Files changed: new `ROLLOUT-EPIC.md`, `ROLLOUT-WORK-PACKAGES.md`,
  `CONTENT-MEDIA-READINESS.md`, `STAGING-ACCEPTANCE.md`, and
  `PRODUCTION-CUTOVER-ROLLBACK.md`; updated `DECISIONS.md`, `EPIC.md`,
  `WORK-PACKAGES.md`, `STATUS.md`, and repository `HANDOFF.md`. No product code,
  migration, test, package configuration, or generated file was changed by
  this planning pass.
- Verification: read the required repository/Phase 11 documents and existing
  staging/cutover evidence; confirmed branch `staging` and preserved the
  intentional dirty worktree; a structural check found exactly 23 unique
  package headings and all 11 required package fields on every package; the
  proposed status ledger contains the same 23 IDs with no missing/extra ID;
  all backticked Markdown references in the five new files resolve; `git diff
  --check` passed; final `git status --short` was inspected. Tests/build were
  not run because the planning pass changed documentation only and did not
  alter executable behavior.
- Blockers or decisions needed: `DCFC-D111`–`DCFC-D117` remain open, together
  with carried content decisions `DCFC-D102` and `DCFC-D106`. Most notably,
  Bunny.net Stream is an approved direction but not an implemented capability;
  `DCFC-D114` must approve a static/hide launch treatment or block rollout on a
  separately scoped capability epic. No blocker prevents review of the packet.
- Exact next step: Christian reviews and approves, revises, or rejects
  `DCFC-EPIC-002` (`DCFC-D111`). If approved, assign only `DCFC-401`, the Class
  1 production-content and provenance disposition review. Do not start staging
  inspection or any Class 3 package from packet approval.
- Hosted mutations: zero. No hosted Supabase, Storage, Auth, Vercel, Stripe,
  DNS, Bunny.net, email, club account, public launch, or indexing resource was
  contacted or changed. No commit or push was created.

## Record Template

Copy this section and append it under Completion Records:

```markdown
### YYYY-MM-DD — DCFC-XXX — Agent name

- Package: DCFC-XXX
- Status: in_progress | blocked | in_review | complete
- Completed:
- Files changed:
- Verification:
- Blockers or decisions needed:
- Exact next step:
- Hosted mutations: none | approved evidence
```

## Integration Rule

If packages run in parallel worktrees, each agent records progress on its
branch. The designated integrator must preserve every completion record while
merging, reconcile the package ledger, run the required broad verification,
and update `HANDOFF.md`. No completion record may be dropped merely to resolve
a documentation conflict.
