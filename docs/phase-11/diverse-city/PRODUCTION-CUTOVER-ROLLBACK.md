# Diverse City FC Production Cutover and Rollback

Epic: `DCFC-EPIC-002`

Status: `phase_4_local_rehearsal_complete; production_not_started`

Last updated: 2026-08-01

This checklist covers `DCFC-701`–`DCFC-1003`. It plans hosted mutations but
authorizes none. Production private preview, billing, domain attachment,
public launch, rollback, and indexing each retain separate explicit approvals.

## Phase 4 Local Import/Reset/Replay Evidence (`DCFC-403`)

This is local input-readiness evidence only. It does not satisfy or start the
later production-target rehearsal in `DCFC-702`.

- Approved snapshot commit:
  `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`
- Deterministic plan digest:
  `63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36`
- Byte-identical plan file SHA-256 across two runs:
  `87efae9701f6e1fa4653a55f2687206f3370306bd900d83ee30352849b78702b`
- Initial/idempotent/reset-replay tenant state digest:
  `b595fc81773ed47bd4d4976d45f533e1e1494ad4089514ac6c5567e27fc4376d`
- Reconciled counts: 10 media assets, 4 Programs, 0 Tryouts/players/staff/
  matches/standings, 2 sponsor references, 4 Shop kit references, 2 Shop
  carousel references, 1 published `academy@1` document, 15 composite
  relationships, and 0 forbidden references.
- The clean-stack rehearsal uploaded 10 objects, reused all 10 on identical
  import, removed 10 objects plus only the Diverse City local tenant during
  reset, uploaded the same 10 on replay, and reproduced the state digest.
- Alpha/Bravo baseline isolation passed. Public/admin desktop/mobile Playwright
  acceptance passed 2/2. Hosted mutations: zero.

The locked artifact and all deferred hosted inputs are recorded in
`ROLLOUT-INPUT-APPROVAL-MANIFEST.md`.

## Production Read-Only Baseline (`DCFC-701`)

- [ ] Record the exact production Supabase organization/project ref, region,
  health, plan/capacity, backup status, and current migration ledger.
- [ ] Confirm modern publishable/secret key posture, `onzio` exposure,
  `onzio_private` isolation, RLS/grants, Auth security posture, and operator
  allowlist without revealing values.
- [ ] Record table/tenant/domain/subscription/audit/media counts and current
  Rose City tenant identity/state.
- [ ] Record Storage buckets, object counts/bytes, and current cleanup/usage
  posture; database backups do not substitute for Storage evidence.
- [ ] Record the exact ready production Vercel deployment/commit, environment-
  variable names/scopes, domains, protection posture, and prior deploy target.
- [ ] Record existing live Stripe Product/Price/Portal/webhook identifiers and
  event allowlist read-only; do not infer current price/amount from staging.
- [ ] Record Auth email sender/domain, callback allowlist, rate limit, and
  delivery posture without inspecting secrets or message bodies.
- [ ] Record DNS authority, existing Diverse City records, TTLs, mail records,
  and nameservers before proposing a change.
- [ ] Record public route/TLS/DNS/runtime-log/media baseline for Rose City and
  unknown hosts.
- [ ] Store backups/exports/evidence in a restricted location outside Git and
  verify checksums/permissions.
- [ ] Confirm no production mutation occurred during baseline collection.

## Local Cutover/Rollback Rehearsal (`DCFC-702`)

- [ ] Production-target content/media/presentation manifest matches the exact
  staging-accepted digest.
- [ ] Release migration ledger replays from scratch on loopback Supabase.
- [ ] Import plan is deterministic across two independent runs.
- [ ] Import is idempotent and reconciles every table, relationship, object,
  asset reference, checksum, route, module, and presentation pointer.
- [ ] Rose City and synthetic Alpha/Bravo remain unchanged and isolated.
- [ ] Diverse City renders on simulated production and private hostnames at
  desktop/mobile with `noindex, nofollow`.
- [ ] Auth/admin acceptance is rehearsed only with local identities/MFA.
- [ ] Stripe behavior uses inert/test-shaped fixtures locally; no live call.
- [ ] Rollback restores the previous deployment/config representation and
  removes/restores only Diverse City tenant artifacts.
- [ ] Identical replay after rollback produces the original manifest digest
  and acceptance result.
- [ ] Full local verification passes without hosted credentials.

## Production Go/No-Go Packet (`DCFC-703`)

Record the following before requesting any mutation:

| Item | Required evidence | Result/evidence |
| --- | --- | --- |
| Release | Exact commit/tree, build, migration list, test results | Pending |
| Import | Source/plan/output digests and reconciliation counts | Pending |
| Backup | Database, Storage, config/domain/billing baselines and restore owner | Pending |
| Tenant | Approved UUID/slug/name/private hostname/tier/lifecycle | Pending |
| Identity | Approved owner/admin roles and safe recipient reference | Pending |
| Billing | Existing live Pro Price and owner Checkout approval | Pending |
| Domain | Exact hostname(s), DNS records/TTL, owner, callbacks | Pending |
| Launch | Window, approver, monitoring owner, stop conditions | Pending |
| Observation | Duration/cadence and indexing decision date | Pending |
| Rollback | Exact prior deployment, private state, DNS, presentation/content/media recovery | Pending |

- [ ] Christian records go/no-go.
- [ ] A go makes only `DCFC-801` eligible.
- [ ] `DCFC-801`, `DCFC-802`, `DCFC-803`, `DCFC-901`, `DCFC-902`,
  `DCFC-903`, `DCFC-1002`, and `DCFC-1003` still require their own approval.

## Production Private Preview

### Release and tenant (`DCFC-801`)

- [ ] Fresh approval names exact production resources, release, migrations,
  tenant identity, private hostname, and rollback targets.
- [ ] Pre-change backups/baselines remain current immediately before mutation.
- [ ] Apply only reviewed checked-in migrations; never run local seed.
- [ ] Deploy the exact staging-accepted release and record deployment ID/commit.
- [ ] Reverify Rose City public/admin/media/billing smoke and runtime logs.
- [ ] Provision Diverse City exactly once through audited operator tooling as
  `onboarding`/`preview` with the pre-billing Starter tier.
- [ ] Attach only the approved private validation hostname/domain row.
- [ ] Verify unknown and spoofed hosts fail closed.
- [ ] Verify private host returns `noindex, nofollow` and is not public.
- [ ] Record exact mutation counts and audit rows.

### Content/media/presentation (`DCFC-802`)

- [ ] Fresh approval names the immutable plan digest and exact tenant UUID.
- [ ] Import only accepted production content and normalized media.
- [ ] Publish/assign the exact `academy@1` presentation digest.
- [ ] Reconcile source, normalized, uploaded, reused, Database, Storage,
  reference, and presentation counts/checksums.
- [ ] Confirm hidden/blocked content and temporary URLs are absent.
- [ ] Confirm no video is imported unless a separately completed capability is
  named by evidence; otherwise the approved static/hide treatment renders.
- [ ] Confirm no registration/payment/waiver/medical/signature/participant data
  path exists.
- [ ] Confirm media uses raw immutable URLs and intentional fallbacks.
- [ ] Prove idempotent replay and capture a complete compensation ledger.
- [ ] Reverify Rose City and other production tenants are unchanged.

### Auth/admin acceptance (`DCFC-803`)

- [ ] Approved owner/admin membership rows exist exactly once.
- [ ] Each email send has separate approval; record delivery-safe evidence only.
- [ ] Callback and recovery entry use the private verified tenant host.
- [ ] Password setup/recovery, password sign-in, mandatory MFA, and protected
  admin acceptance pass.
- [ ] AAL1 and cross-tenant access fail closed.
- [ ] Desktop/mobile private public and authentication acceptance passes.
- [ ] Pre-billing Starter entitlement correctly withholds Pro-only Programs/
  Tryouts mutations; full Pro editor acceptance is deferred to `DCFC-901`.
- [ ] No secret, code, action URL, password, TOTP seed, token, or session value
  is recorded.
- [ ] Production remains private and non-indexed.

## Live Billing Activation (`DCFC-901`)

- [ ] Reverify the approved existing live standard Pro Price, amount, currency,
  cadence, active state, and environment immediately before Checkout.
- [ ] Confirm the owner and billing contact approve that exact commercial
  state. If not, stop; Price creation/change is outside this package.
- [ ] Confirm the live webhook and exact event allowlist are healthy.
- [ ] Owner initiates first Checkout through the verified tenant application.
- [ ] Agent does not create a Customer/subscription directly.
- [ ] Customer, Checkout Session, and subscription metadata contain exact
  `onzio_club_id` and `onzio_environment=production` values.
- [ ] Canonical webhook applies exactly one subscription projection.
- [ ] Tier is Pro; status and paid-through/trial state match canonical Stripe.
- [ ] Programs and Tryouts editors now authorize approved AAL2 users; an
  approved edit reaches the public query layer and is restored with matching
  before/after digests.
- [ ] Duplicate resend is idempotent; unknown/foreign/stale cases fail closed.
- [ ] Owner reaches Portal; admin remains denied.
- [ ] No Price, Product, Portal, webhook endpoint, unrelated customer, refund,
  cancellation, or tier change occurred.
- [ ] Public access remains disabled until `DCFC-903`.

## Domain and Callback Attachment (`DCFC-902`)

- [ ] Fresh approval names each exact hostname and DNS record.
- [ ] Export current authoritative DNS and Vercel/Auth/domain configuration.
- [ ] Confirm domain ownership and whether apex, `www`, or a subdomain is the
  canonical public host; do not assume.
- [ ] Confirm TTL and propagation/maintenance window.
- [ ] Attach only approved hostname(s) to the exact Vercel project.
- [ ] Add/verify matching `club_domains` production rows.
- [ ] Add only exact required Auth Site URL/redirect entries; preserve other
  tenants' valid callbacks.
- [ ] Do not change nameservers, root mail MX, unrelated TXT, or shared Auth
  sending-domain records.
- [ ] Verify authoritative DNS, TLS, Vercel verification, tenant resolution,
  canonical redirect, callback host, and unknown/Host-spoof denial.
- [ ] Verify the site still uses preview/private access and `noindex, nofollow`.
- [ ] Keep the private validation hostname/rollback path until closeout.

## Public Launch (`DCFC-903`)

Final pre-launch gate:

- [ ] Canonical Stripe state is active or trialing and Pro.
- [ ] Production tenant, content/media/presentation, Auth/MFA/admin, domain/DNS/
  callback, and private desktop/mobile gates are all accepted.
- [ ] Backups, prior deployment, prior DNS, private lifecycle state, and
  rollback owner are current.
- [ ] Runtime logs and monitors are clear/active.
- [ ] Christian gives explicit public-launch approval; indexing is explicitly
  excluded from that approval.

Immediate launch evidence:

- [ ] Set public state only through audited/canonical tooling.
- [ ] Public homepage and every visible route return expected status/content.
- [ ] Desktop/mobile public and admin browser acceptance passes.
- [ ] Domain/TLS/canonical redirects and tenant/cache/RSC/metadata isolation
  pass.
- [ ] All visible images load raw with positive dimensions; no unexpected
  fallback, transform, optimizer dependency, or broken media appears.
- [ ] External registration links are exact, safe, disclosed, and collect no
  data in Onzio.
- [ ] Auth recovery/login/MFA/admin and Stripe Portal remain healthy.
- [ ] Unknown, cross-tenant, preview, and suspended cases fail closed.
- [ ] Runtime logs contain no unresolved error.
- [ ] Header and page metadata still say `noindex, nofollow`.
- [ ] Observation window starts and the first checkpoint is scheduled.

## Observation and Reconciliation (`DCFC-1001`)

`DCFC-D116` must record the exact duration. The recommended planning range is
7–14 days, but this document does not select it.

At the start, each scheduled checkpoint, and the end:

- [ ] Public route/TLS/domain/canonical/robots health passes.
- [ ] Desktop/mobile media monitor reports positive dimensions and no
  unexpected fallback, transform, optimizer, or broken object.
- [ ] Runtime logs show no tenant, authorization, cache, media, Auth, billing,
  webhook, or unhandled application error.
- [ ] Table counts, composite relationships, presentation digest, Storage
  object count/bytes/checksums, and external destinations remain reconciled.
- [ ] Owner/admin memberships, sign-in/MFA state, and Auth-email delivery are
  healthy without inspecting secrets/messages.
- [ ] Stripe Customer/subscription/Price/webhook and local projection remain
  canonical, with no unexpected charge/tier/cancellation state.
- [ ] Alpha/Bravo/Rose City/unknown-host isolation remains healthy.
- [ ] No prohibited data collection or new unapproved content/media appears.
- [ ] `noindex, nofollow` remains active until `DCFC-1003` approval.
- [ ] Issues, owners, severity, action, and whether a rollback trigger fired are
  recorded without making silent fixes.

## Stop Conditions

Any of these blocks indexing and makes rollback assessment mandatory:

- tenant or cache leakage
- unauthorized read/write/upload or AAL/MFA bypass
- incorrect tenant/domain/callback resolution
- lost/corrupt/unreconciled content, relationship, presentation, or media
- broken critical route/media on desktop or mobile
- unexpected Stripe customer/subscription/Price/amount/tier/environment state
- registration/payment/waiver/medical/signature/participant data entering Onzio
- production placeholder or unapproved claim/media/URL
- sustained runtime/auth/email failure that prevents ordinary use
- inability to identify or execute the documented rollback safely

## Conditional Rollback (`DCFC-1002`)

- [ ] Record trigger, timestamp, evidence, decision owner, and exact approved
  rollback target.
- [ ] Set Diverse City to preview/suspended before deeper recovery when public
  integrity or security is uncertain.
- [ ] Restore prior deployment if release behavior is causal.
- [ ] Restore prior presentation/content pointers and verify their digests.
- [ ] Compensate only manifest-ledger-created unreferenced media objects; never
  broad-delete Storage.
- [ ] Deactivate new domain rows/aliases/callbacks and restore exact prior DNS
  when domain routing is causal.
- [ ] Handle billing only through approved Stripe/customer workflow and
  canonical webhooks; never edit projection tables directly.
- [ ] Revoke unexpected sessions/memberships/factors through audited Auth/
  operator tooling.
- [ ] Reconcile public stop, private/admin safety, tenant isolation, Database,
  Storage, Auth, billing, DNS, deployment, and logs.
- [ ] Preserve audit/Stripe ledgers and all incident evidence.
- [ ] Do not hard purge the tenant.
- [ ] A forward retry requires a new root-cause fix, local/staging rehearsal,
  and fresh approval.

## Indexing and Closeout (`DCFC-1003`)

- [ ] Observation completed without an unresolved stop condition.
- [ ] Christian separately approves indexing for exact public hostname(s).
- [ ] Remove robots gates only through a reusable tenant/presentation
  configuration; never add a Diverse City slug branch.
- [ ] Production public routes emit indexable header/meta behavior.
- [ ] Canonical URL and sitemap contain only approved Diverse City URLs.
- [ ] Staging, private aliases, preview deployments, and unknown hosts remain
  `noindex, nofollow`.
- [ ] Rollback of indexing restores `noindex, nofollow` and is verified.
- [ ] Final content/media/tenant/Auth/billing/domain/deployment evidence is
  reconciled.
- [ ] Monitoring owners and ongoing cadence are recorded.
- [ ] `STATUS.md` and `HANDOFF.md` contain the final package record, mutation
  counts, unresolved operational issues, and next maintenance step.
- [ ] `DCFC-EPIC-002` is marked complete only after all required evidence is
  present.
